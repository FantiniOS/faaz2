import { NextResponse } from "next/server";
import { In, IsNull } from "typeorm";
import { getRepository, withTransaction } from "@/lib/db/data-source";
import {
  CheckinHidratacaoEntity,
  CheckinIntestinalEntity,
  OrganizationEntity,
  PatientEntity,
  type BiologicalSex,
  type PatientStatus,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeCadastrarPacientes, podeExcluirPacientes } from "@/lib/auth-rbac";

export const dynamic = "force-dynamic";

function isUniqueConstraintError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("ORA-00001") || msg.includes("UQ_PATIENTS");
}

/**
 * GET /api/pacientes — Lista pacientes cadastrados na clínica
 */
export async function GET() {
  try {
    const sessao = await getSessao();
    if (sessao && !podeCadastrarPacientes(sessao.cargo)) {
      return NextResponse.json(
        { error: "Acesso negado. Perfil sem permissão para listar pacientes." },
        { status: 403 },
      );
    }

    const orgRepo = await getRepository(OrganizationEntity);
    const patientRepo = await getRepository(PatientEntity);

    let orgId = sessao?.organizationId;
    if (!orgId) {
      const orgs = await orgRepo.find({ take: 1 });
      orgId = orgs[0]?.id;
    }

    const pacientes = await patientRepo.find({
      where: {
        ...(orgId ? { organizationId: orgId } : {}),
        deletedAt: IsNull(),
      },
      order: { fullName: "ASC" },
    });

    const formatados = pacientes.map((p) => ({
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
      metaHidricaMl: p.metaDiariaMl || 2500,
      avatarUrl: p.avatarUrl || p.photoUrl || null,
      criadoEm: p.createdAt,
    }));

    return NextResponse.json({ pacientes: formatados });
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
      email: email ? String(email).trim() : null,
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
