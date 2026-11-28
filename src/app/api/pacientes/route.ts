import { NextResponse } from "next/server";
import { In, IsNull } from "typeorm";
import {
  getRepository,
  runWithConcurrency,
  withRepositoryRetry,
  withTransaction,
} from "@/lib/db/data-source";
import {
  CheckinHidratacaoEntity,
  CheckinIntestinalEntity,
  ConsultaPacoteEntity,
  OrganizationEntity,
  PacoteAcompanhamentoEntity,
  PatientEntity,
  type BiologicalSex,
  type ConsultaPacote,
  type PacoteAcompanhamento,
  type Patient,
  type PatientStatus,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeCadastrarPacientes, podeExcluirPacientes } from "@/lib/auth-rbac";
import {
  listarMedicosClinica,
  resolverUsuarioMedicoId,
  type MedicoResponsavelDTO,
} from "@/lib/medico-responsavel";
import { getDataDiaBR } from "@/lib/date-br";
import {
  consultaDescontaSaldo,
  diffDiasIso,
  type PacoteAtivoResumoListaDTO,
} from "@/lib/pacotes-faaz";

export const dynamic = "force-dynamic";

function isUniqueConstraintError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("ORA-00001") || msg.includes("UQ_PATIENTS");
}

/**
 * GET /api/pacientes — Lista pacientes cadastrados na clínica
 */
export async function GET() {
  const reqStart = performance.now();
  try {
    const sessao = await getSessao();
    if (sessao && !podeCadastrarPacientes(sessao.cargo)) {
      return NextResponse.json(
        { error: "Acesso negado. Perfil sem permissão para listar pacientes." },
        { status: 403 },
      );
    }

    const dbStart = performance.now();

    let orgId = sessao?.organizationId;
    if (!orgId) {
      const orgs = await withRepositoryRetry(
        OrganizationEntity,
        (repo) =>
          repo.find({
            select: { id: true },
            take: 1,
          }),
        { label: "pacientes:org" },
      );
      orgId = orgs[0]?.id;
    }

    // Projeção explícita: omite CLOBs pesados não usados na listagem (workoutRestrictions, activeModules)
    // Executa em onda leve (máx. 2 em paralelo): pacientes, médicos responsáveis e pacotes ativos (apenas dados administrativos)
    const listData = {
      pacientes: [] as Patient[],
      medicos: [] as MedicoResponsavelDTO[],
      pacotesAtivos: [] as PacoteAcompanhamento[],
    };

    await runWithConcurrency(
      [
        async () => {
          listData.pacientes = await withRepositoryRetry(
            PatientEntity,
            (repo) =>
              repo.find({
                where: {
                  ...(orgId ? { organizationId: orgId } : {}),
                  deletedAt: IsNull(),
                },
                select: {
                  id: true,
                  recordCode: true,
                  fullName: true,
                  cpf: true,
                  rg: true,
                  birthDate: true,
                  biologicalSex: true,
                  estadoCivil: true,
                  profissao: true,
                  convenio: true,
                  planoFaaz: true,
                  patientStatus: true,
                  phoneWhatsapp: true,
                  telefoneSecundario: true,
                  email: true,
                  contatoEmergenciaNome: true,
                  contatoEmergenciaTelefone: true,
                  zipCode: true,
                  street: true,
                  number: true,
                  complement: true,
                  neighborhood: true,
                  city: true,
                  state: true,
                  primaryDoctorId: true,
                  metaDiariaMl: true,
                  avatarUrl: true,
                  photoUrl: true,
                  createdAt: true,
                },
                order: { fullName: "ASC" },
              }),
            { label: "pacientes:list" },
          );
        },
        async () => {
          listData.medicos = await listarMedicosClinica(orgId);
        },
        async () => {
          listData.pacotesAtivos = await withRepositoryRetry(
            PacoteAcompanhamentoEntity,
            (repo) =>
              repo.find({
                select: {
                  id: true,
                  pacienteId: true,
                  nomePlano: true,
                  qtdTotalConsultas: true,
                  dataInicio: true,
                  dataValidade: true,
                  status: true,
                  createdAt: true,
                },
                order: { createdAt: "DESC" },
              }),
            { label: "pacientes:pacotesResumo" },
          );
        },
      ],
      2,
    );

    const { pacientes, medicos, pacotesAtivos } = listData;

    // Prioriza por paciente: 1) pacote ATIVO mais recente; 2) último pacote CONCLUIDO/esgotado;
    // 3) último pacote não-RENOVADO (ex.: CANCELADO/INATIVO), preservando histórico para alerta de renovação.
    const pacoteMaisRecentePorPaciente = new Map<string, PacoteAcompanhamento>();
    for (const pac of pacotesAtivos) {
      if (pac.status === "ATIVO" && !pacoteMaisRecentePorPaciente.has(pac.pacienteId)) {
        pacoteMaisRecentePorPaciente.set(pac.pacienteId, pac);
      }
    }
    for (const pac of pacotesAtivos) {
      if (
        pac.status === "CONCLUIDO" &&
        !pacoteMaisRecentePorPaciente.has(pac.pacienteId)
      ) {
        pacoteMaisRecentePorPaciente.set(pac.pacienteId, pac);
      }
    }
    for (const pac of pacotesAtivos) {
      if (
        pac.status !== "RENOVADO" &&
        !pacoteMaisRecentePorPaciente.has(pac.pacienteId)
      ) {
        pacoteMaisRecentePorPaciente.set(pac.pacienteId, pac);
      }
    }

    const activePacoteIds = Array.from(pacoteMaisRecentePorPaciente.values()).map(
      (p) => p.id,
    );

    const realizadasPorPacote = new Map<string, number>();
    if (activePacoteIds.length > 0) {
      const CHUNK_SIZE = 500;
      const chunks: string[][] = [];
      for (let i = 0; i < activePacoteIds.length; i += CHUNK_SIZE) {
        chunks.push(activePacoteIds.slice(i, i + CHUNK_SIZE));
      }

      const consultasChunks: ConsultaPacote[][] = [];
      await runWithConcurrency(
        chunks.map((chunkIds, idx) => async () => {
          const rows = await withRepositoryRetry(
            ConsultaPacoteEntity,
            (repo) =>
              repo.find({
                where: { pacoteId: In(chunkIds) },
                select: { id: true, pacoteId: true, status: true },
              }),
            { label: `pacientes:consultasPacotes:${idx}` },
          );
          consultasChunks.push(rows);
        }),
        2,
      );

      for (const rows of consultasChunks) {
        for (const c of rows) {
          if (consultaDescontaSaldo(c.status)) {
            realizadasPorPacote.set(
              c.pacoteId,
              (realizadasPorPacote.get(c.pacoteId) ?? 0) + 1,
            );
          }
        }
      }
    }

    const hojeIso = getDataDiaBR();
    const medicoById = new Map<string, MedicoResponsavelDTO>(
      medicos.map((m) => [m.id, m]),
    );
    const dbDurMs = Math.round(performance.now() - dbStart);

    const formatados = pacientes.map((p) => {
      const medicoResponsavel = p.primaryDoctorId
        ? medicoById.get(p.primaryDoctorId) ?? null
        : null;

      const pacAtivo = pacoteMaisRecentePorPaciente.get(p.id) ?? null;
      let pacoteAtivoResumo: PacoteAtivoResumoListaDTO | null = null;
      if (pacAtivo) {
        const qtdTotal = Math.max(1, Number(pacAtivo.qtdTotalConsultas) || 1);
        const consultasRealizadas = realizadasPorPacote.get(pacAtivo.id) ?? 0;
        const consultasRestantes = Math.max(0, qtdTotal - consultasRealizadas);
        const diasParaVencer = pacAtivo.dataValidade
          ? diffDiasIso(hojeIso, pacAtivo.dataValidade)
          : null;
        const vencido = diasParaVencer !== null && diasParaVencer < 0;
        const alertaRenovacao =
          vencido ||
          consultasRestantes <= 1 ||
          (qtdTotal >= 8 && consultasRestantes <= 2) ||
          (diasParaVencer !== null && diasParaVencer <= 30);

        pacoteAtivoResumo = {
          id: pacAtivo.id,
          nomePlano: pacAtivo.nomePlano,
          qtdTotalConsultas: qtdTotal,
          consultasRealizadas,
          consultasRestantes,
          dataInicio: pacAtivo.dataInicio,
          dataValidade: pacAtivo.dataValidade ?? null,
          status: pacAtivo.status,
          diasParaVencer,
          vencido,
          alertaRenovacao,
        };
      }

      return {
        id: p.id,
        recordCode: p.recordCode,
        nome: p.fullName,
        cpf: p.cpf || "",
        rg: p.rg || "",
        dataNascimento: p.birthDate ? String(p.birthDate).split("T")[0] : "",
        sexo: p.biologicalSex || "OTHER",
        estadoCivil: p.estadoCivil || "Solteiro(a)",
        profissao: p.profissao || "",
        convenio: p.convenio || "Particular",
        planoFaaz: Boolean(p.planoFaaz),
        pacoteAtivo: pacoteAtivoResumo,
        status: p.patientStatus === "ACTIVE" ? "Ativo" : "Inativo",
        telefoneWhatsapp: p.phoneWhatsapp || "",
        telefoneSecundario: p.telefoneSecundario || "",
        email: p.email || "",
        contatoEmergenciaNome: p.contatoEmergenciaNome || "",
        contatoEmergenciaTelefone: p.contatoEmergenciaTelefone || "",
        cep: p.zipCode || "",
        logradouro: p.street || "",
        numero: p.number || "",
        complemento: p.complement || "",
        bairro: p.neighborhood || "",
        cidade: p.city || "",
        estado: p.state || "",
        medicoResponsavelId: p.primaryDoctorId || null,
        medicoResponsavel,
        metaHidricaMl: p.metaDiariaMl || 2500,
        avatarUrl: p.avatarUrl || p.photoUrl || null,
        criadoEm: p.createdAt,
      };
    });

    const totalDurMs = Math.round(performance.now() - reqStart);
    return NextResponse.json(
      { pacientes: formatados, medicos },
      {
        headers: {
          "Server-Timing": `db;dur=${dbDurMs};desc="Oracle ADB", total;dur=${totalDurMs}`,
        },
      },
    );
  } catch (error: unknown) {
    console.error("[PACIENTES/GET] Erro:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao listar pacientes.", details },
      { status: 500 },
    );
  }
}

/**
 * POST /api/pacientes — Cadastrar novo paciente ou atualizar se vier com ID
 */
export async function POST(request: Request) {
  try {
    const sessao = await getSessao();
    if (sessao && !podeCadastrarPacientes(sessao.cargo)) {
      return NextResponse.json(
        { error: "Acesso negado para cadastro de pacientes." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const {
      id,
      nome,
      cpf,
      rg,
      dataNascimento,
      sexo,
      estadoCivil,
      profissao,
      convenio,
      planoFaaz,
      status,
      telefoneWhatsapp,
      telefoneSecundario,
      email,
      contatoEmergenciaNome,
      contatoEmergenciaTelefone,
      cep,
      logradouro,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      metaHidricaMl,
      medicoResponsavelId,
      primaryDoctorId,
    } = body;

    if (!nome?.trim() || !telefoneWhatsapp?.trim()) {
      return NextResponse.json(
        { error: "Nome completo e WhatsApp são obrigatórios." },
        { status: 400 },
      );
    }

    const orgRepo = await getRepository(OrganizationEntity);
    const patientRepo = await getRepository(PatientEntity);

    let orgId = sessao?.organizationId;
    if (!orgId) {
      const orgs = await orgRepo.find({ take: 1 });
      if (orgs[0]) {
        orgId = orgs[0].id;
      } else {
        const createdOrg = await orgRepo.save(
          orgRepo.create({
            slug: "clinica-faaz",
            legalName: "Clínica FAAZ Medicina & Saúde Integrativa Ltda",
            tradeName: "Clínica FAAZ",
            taxId: "12345678000190",
            primaryColorHex: "#0f766e",
            enabledModules: {},
            rolePermissions: {},
            status: "ACTIVE",
          }),
        );
        orgId = createdOrg.id;
      }
    }

    const cleanCpf = cpf ? String(cpf).replace(/\D/g, "") : null;
    const biologicalSex: BiologicalSex =
      sexo === "Masculino" || sexo === "MALE"
        ? "MALE"
        : sexo === "Feminino" || sexo === "FEMALE"
          ? "FEMALE"
          : "OTHER";
    const patientStatus: PatientStatus =
      status === "Inativo" ? "INACTIVE" : "ACTIVE";
    const birthDateStr = dataNascimento
      ? String(dataNascimento).split("T")[0]
      : null;

    const rawMedicoParam =
      medicoResponsavelId !== undefined
        ? medicoResponsavelId
        : primaryDoctorId;
    let resolvedPrimaryDoctorId: string | null | undefined = undefined;
    if (rawMedicoParam !== undefined) {
      if (rawMedicoParam === null || String(rawMedicoParam).trim() === "") {
        resolvedPrimaryDoctorId = null;
      } else {
        const validUserId = await resolverUsuarioMedicoId(
          String(rawMedicoParam),
          orgId,
        );
        if (!validUserId) {
          return NextResponse.json(
            { error: "Médico responsável informado não foi encontrado." },
            { status: 400 },
          );
        }
        resolvedPrimaryDoctorId = validUserId;
      }
    } else if (
      !id &&
      sessao?.userId &&
      (sessao.cargo === "MEDICO" || sessao.cargo === "DONO_CLINICA")
    ) {
      // No cadastro novo feito por um médico sem alterar o seletor, pré-vincula o próprio médico logado
      resolvedPrimaryDoctorId = sessao.userId;
    }

    const payloadComum = {
      fullName: String(nome).trim().toUpperCase(),
      cpf: cleanCpf || null,
      rg: rg ? String(rg).trim().toUpperCase() : null,
      birthDate: birthDateStr,
      biologicalSex,
      estadoCivil: estadoCivil || null,
      profissao: profissao ? String(profissao).trim().toUpperCase() : null,
      convenio: convenio || "Particular",
      planoFaaz:
        planoFaaz !== undefined
          ? Boolean(planoFaaz)
          : convenio === "Plano FAAZ",
      patientStatus,
      phoneWhatsapp: String(telefoneWhatsapp).trim(),
      telefoneSecundario: telefoneSecundario || null,
      email: email ? String(email).trim().toLowerCase() : null,
      contatoEmergenciaNome: contatoEmergenciaNome
        ? String(contatoEmergenciaNome).trim().toUpperCase()
        : null,
      contatoEmergenciaTelefone: contatoEmergenciaTelefone || null,
      zipCode: cep || null,
      street: logradouro ? String(logradouro).trim().toUpperCase() : null,
      number: numero ? String(numero).trim().toUpperCase() : null,
      complement: complemento
        ? String(complemento).trim().toUpperCase()
        : null,
      neighborhood: bairro ? String(bairro).trim().toUpperCase() : null,
      city: cidade ? String(cidade).trim().toUpperCase() : null,
      state: estado ? String(estado).trim().toUpperCase() : null,
      metaDiariaMl: metaHidricaMl ? parseInt(String(metaHidricaMl), 10) : 2500,
      ...(resolvedPrimaryDoctorId !== undefined
        ? { primaryDoctorId: resolvedPrimaryDoctorId }
        : {}),
    };

    if (id) {
      await patientRepo.update({ id }, payloadComum);
      const pacienteAtualizado = await patientRepo.findOne({ where: { id } });

      return NextResponse.json(
        {
          sucesso: true,
          mensagem: "Paciente atualizado com sucesso!",
          paciente: pacienteAtualizado,
        },
        { status: 200 },
      );
    }

    const totalPacientes = await patientRepo.count({
      where: { organizationId: orgId },
    });
    let recordCode = `FAAZ-${String(totalPacientes + 1).padStart(5, "0")}`;
    const existingCode = await patientRepo.findOne({
      where: { recordCode },
      select: { id: true },
    });
    if (existingCode) {
      recordCode = `FAAZ-${String(totalPacientes + 1).padStart(4, "0")}-${Date.now().toString().slice(-3)}`;
    }

    const novoPaciente = await patientRepo.save(
      patientRepo.create({
        organizationId: orgId!,
        recordCode,
        ...payloadComum,
        activeModules: [],
        createdBy: sessao?.userId || null,
      }),
    );

    return NextResponse.json(
      {
        sucesso: true,
        mensagem: "Paciente cadastrado com sucesso!",
        paciente: novoPaciente,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("[PACIENTES/POST] Erro:", error);
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { error: "CPF já cadastrado na Clínica FAAZ." },
        { status: 409 },
      );
    }
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao cadastrar paciente.", details },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/pacientes — Atualização cadastral
 */
export async function PUT(request: Request) {
  return POST(request);
}

/**
 * DELETE /api/pacientes?id=... — Excluir paciente
 * Somente DONO_CLINICA ou ADMINISTRADOR
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "ID do paciente é obrigatório." },
        { status: 400 },
      );
    }

    const sessao = await getSessao();
    if (!sessao || !podeExcluirPacientes(sessao.cargo)) {
      return NextResponse.json(
        {
          error:
            "Apenas o Dono da Clínica ou Administrador podem excluir pacientes.",
          cargoAtual: sessao?.cargo || "NÃO_AUTENTICADO",
        },
        { status: 403 },
      );
    }

    const patientRepo = await getRepository(PatientEntity);
    const paciente = await patientRepo.findOne({
      where: { id },
      select: { id: true, cpf: true, recordCode: true, fullName: true },
    });

    if (!paciente) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    const idsVinculados = [paciente.id];
    if (paciente.cpf)
      idsVinculados.push(paciente.cpf, paciente.cpf.replace(/\D/g, ""));
    if (paciente.recordCode) idsVinculados.push(paciente.recordCode);

    await withTransaction(async (manager) => {
      await manager.getRepository(CheckinIntestinalEntity).delete({
        pacienteId: In(idsVinculados),
      });
      await manager.getRepository(CheckinHidratacaoEntity).delete({
        pacienteId: In(idsVinculados),
      });
      await manager.getRepository(PatientEntity).delete({ id });
    });

    return NextResponse.json({
      sucesso: true,
      mensagem: `Paciente '${paciente.fullName}' excluído com sucesso!`,
    });
  } catch (error: unknown) {
    console.error("[PACIENTES/DELETE] Erro:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao excluir paciente.", details },
      { status: 500 },
    );
  }
}
