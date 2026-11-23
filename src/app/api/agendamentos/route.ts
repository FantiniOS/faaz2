import { NextRequest, NextResponse } from "next/server";
import { Between, In, Not } from "typeorm";
import {
  withRepositoryRetry,
  withTransaction,
} from "@/lib/db/data-source";
import {
  AgendamentoEntity,
  MedicoEntity,
  OrganizationEntity,
  PatientEntity,
  type Especialidade,
} from "@/lib/db/entities";
import {
  ensureEspecialidadesSchemaAndSeed,
  listarTodasEspecialidadesEntity,
} from "@/lib/db/especialidades-bootstrap";
import { logOracleRouteError } from "@/lib/db/oracle-utils";
import {
  criarDataBR,
  formatarHoraBR,
  getDataDiaBR,
  getInicioFimDiaBR,
} from "@/lib/date-br";
import { getSessao } from "@/lib/auth-session";
import {
  buscarUsuarioMedicoAtivo,
  garantirEspelhoMedicoAgenda,
  normalizarNomeMedicoComparacao,
} from "@/lib/medico-responsavel";
import {
  encontrarEspecialidadeCompativel,
  formatarCodigoEspecialidadeLegado,
  gerarCodigoEspecialidadeLegado,
  getCorEspecialidadeEstilo,
  inferirCorPorCodigoLegado,
  normalizarCorEspecialidade,
} from "@/lib/especialidades-clinica";

const TIPOS_VALIDOS = ["PRIMEIRA_CONSULTA", "RETORNO", "EXAME"] as const;
const STATUS_VALIDOS = [
  "AGENDADO",
  "CONFIRMADO",
  "CANCELADO",
  "FINALIZADO",
] as const;

function resolverMetaEspecialidadeAgendamento(
  item: { especialidadeId?: string | null; especialidade?: string | null },
  especialidades: readonly Especialidade[],
) {
  const porId = item.especialidadeId
    ? especialidades.find((e) => e.id === item.especialidadeId) ?? null
    : null;
  const porCodigo =
    !porId && item.especialidade
      ? especialidades.find(
          (e) =>
            gerarCodigoEspecialidadeLegado(e.nome) ===
            item.especialidade?.toUpperCase(),
        ) ?? encontrarEspecialidadeCompativel(item.especialidade, especialidades)
      : null;

  const esp = porId ?? porCodigo;
  const corToken = esp
    ? normalizarCorEspecialidade(esp.cor)
    : inferirCorPorCodigoLegado(item.especialidade);
  const estilo = getCorEspecialidadeEstilo(corToken);

  return {
    especialidadeId: esp?.id ?? item.especialidadeId ?? null,
    especialidade:
      item.especialidade?.trim().toUpperCase() ||
      (esp ? gerarCodigoEspecialidadeLegado(esp.nome) : "ENDOCRINOLOGIA"),
    especialidadeLegivel:
      esp?.nome ?? formatarCodigoEspecialidadeLegado(item.especialidade),
    especialidadeCor: corToken,
    especialidadeCorHex: estilo.hex,
  };
}

function formatTipoLegivel(tipo: string): string {
  switch (tipo) {
    case "PRIMEIRA_CONSULTA":
      return "Primeira Consulta";
    case "RETORNO":
      return "Retorno";
    case "EXAME":
      return "Exame";
    default:
      return tipo;
  }
}

function formatStatusLegivel(status: string): string {
  switch (status) {
    case "CONFIRMADO":
      return "Confirmado";
    case "AGENDADO":
      return "Agendado";
    case "CANCELADO":
      return "Cancelado";
    case "FINALIZADO":
      return "Finalizado";
    default:
      return status;
  }
}

export async function GET(request: NextRequest) {
  const reqStart = performance.now();
  try {
    await ensureEspecialidadesSchemaAndSeed();

    const { searchParams } = new URL(request.url);
    const dataParam = searchParams.get("data");
    const inicioParam =
      searchParams.get("dataInicio") || searchParams.get("inicio");
    const fimParam = searchParams.get("dataFim") || searchParams.get("fim");
    const medicoIdParam = searchParams.get("medicoId");
    const especialidadeIdParam = searchParams.get("especialidadeId")?.trim();
    const especialidadeParam = searchParams.get("especialidade")?.trim();

    let inicioPeriodo: Date;
    let fimPeriodo: Date;

    if (
      inicioParam &&
      fimParam &&
      /^\d{4}-\d{2}-\d{2}$/.test(inicioParam) &&
      /^\d{4}-\d{2}-\d{2}$/.test(fimParam)
    ) {
      const startIso = inicioParam <= fimParam ? inicioParam : fimParam;
      const endIso = inicioParam <= fimParam ? fimParam : inicioParam;
      inicioPeriodo = getInicioFimDiaBR(startIso).inicioUtc;
      fimPeriodo = getInicioFimDiaBR(endIso).fimUtc;
    } else if (dataParam && /^\d{4}-\d{2}-\d{2}$/.test(dataParam)) {
      const faixa = getInicioFimDiaBR(dataParam);
      inicioPeriodo = faixa.inicioUtc;
      fimPeriodo = faixa.fimUtc;
    } else {
      const faixaHoje = getInicioFimDiaBR();
      inicioPeriodo = faixaHoje.inicioUtc;
      fimPeriodo = faixaHoje.fimUtc;
    }

    let filtroMedicoIds: string[] | null = null;
    if (medicoIdParam && medicoIdParam !== "TODOS") {
      const ids = new Set<string>([medicoIdParam]);
      const sessao = await getSessao(request);
      const userMedico = await buscarUsuarioMedicoAtivo(
        medicoIdParam,
        sessao?.organizationId,
      );
      if (userMedico?.nome) {
        const nomeAlvo = normalizarNomeMedicoComparacao(userMedico.nome);
        const legados = await withRepositoryRetry(
          MedicoEntity,
          (repo) => repo.find({ select: { id: true, nome: true } }),
          { label: "agendamentos:medicos-legados" },
        );
        for (const m of legados) {
          if (normalizarNomeMedicoComparacao(m.nome) === nomeAlvo) {
            ids.add(m.id);
          }
        }
      }
      filtroMedicoIds = Array.from(ids);
    }

    const dbStart = performance.now();
    const [registros, especialidades] = await Promise.all([
      withRepositoryRetry(
        AgendamentoEntity,
        (repo) =>
          repo.find({
            where: {
              dataHora: Between(inicioPeriodo, fimPeriodo),
              ...(filtroMedicoIds
                ? {
                    medicoId:
                      filtroMedicoIds.length === 1
                        ? filtroMedicoIds[0]
                        : In(filtroMedicoIds),
                  }
                : {}),
            },
            select: {
              id: true,
              pacienteId: true,
              medicoId: true,
              especialidade: true,
              especialidadeId: true,
              dataHora: true,
              duracaoMinutos: true,
              encaixe: true,
              tipo: true,
              status: true,
              observacao: true,
              paciente: {
                id: true,
                fullName: true,
                recordCode: true,
                cpf: true,
                phoneWhatsapp: true,
                convenio: true,
                planoFaaz: true,
              },
              medico: {
                id: true,
                nome: true,
                especialidade: true,
                corHex: true,
              },
            },
            relations: {
              paciente: true,
              medico: true,
            },
            order: {
              dataHora: "ASC",
            },
          }),
        { label: "agendamentos:list" },
      ),
      listarTodasEspecialidadesEntity(false),
    ]);
    const dbDurMs = Math.round(performance.now() - dbStart);

    const agendamentosMapeados = registros.map((item) => {
      const d = new Date(item.dataHora);
      const horario = formatarHoraBR(d);
      const dataIso = getDataDiaBR(d);
      const metaEsp = resolverMetaEspecialidadeAgendamento(item, especialidades);

      return {
        id: item.id,
        pacienteId: item.pacienteId,
        pacienteNome: item.paciente?.fullName || "Paciente",
        pacienteRecordCode: item.paciente?.recordCode || "",
        pacienteCpf: item.paciente?.cpf || "",
        pacienteTelefone: item.paciente?.phoneWhatsapp || "",
        pacienteConvenio: item.paciente?.convenio || "Particular",
        pacientePlanoFaaz: Boolean(item.paciente?.planoFaaz),
        paciente: item.paciente,
        medicoId: item.medicoId,
        medicoNome: item.medico?.nome || "Equipe Clínica",
        medicoEspecialidade:
          item.medico?.especialidade || metaEsp.especialidadeLegivel,
        medicoCorHex: item.medico?.corHex || metaEsp.especialidadeCorHex,
        medico: item.medico,
        especialidadeId: metaEsp.especialidadeId,
        especialidade: metaEsp.especialidade,
        especialidadeLegivel: metaEsp.especialidadeLegivel,
        especialidadeCor: metaEsp.especialidadeCor,
        especialidadeCorHex: metaEsp.especialidadeCorHex,
        dataHora: new Date(item.dataHora).toISOString(),
        data: dataIso,
        horario,
        duracaoMinutos: item.duracaoMinutos || 30,
        encaixe: Boolean(item.encaixe),
        tipo: item.tipo,
        tipoLegivel: formatTipoLegivel(item.tipo),
        status: item.status,
        statusLegivel: formatStatusLegivel(item.status),
        observacao: item.observacao || "",
      };
    });

    // Filtro por especialidadeId (ou código legado ?especialidade=...), preservando agendamentos antigos
    const agendamentos = agendamentosMapeados.filter((ag) => {
      if (especialidadeIdParam && especialidadeIdParam !== "TODAS") {
        return ag.especialidadeId === especialidadeIdParam;
      }
      if (especialidadeParam && especialidadeParam.toUpperCase() !== "TODAS") {
        const alvoUpper = especialidadeParam.toUpperCase();
        return (
          ag.especialidadeId === especialidadeParam ||
          ag.especialidade.toUpperCase() === alvoUpper
        );
      }
      return true;
    });

    const resumo = {
      totalDia: agendamentos.length,
      confirmados: agendamentos.filter((a) => a.status === "CONFIRMADO").length,
      agendados: agendamentos.filter((a) => a.status === "AGENDADO").length,
      cancelados: agendamentos.filter((a) => a.status === "CANCELADO").length,
    };

    return NextResponse.json(
      {
        success: true,
        agendamentos,
        resumo,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Server-Timing": `db;dur=${dbDurMs};desc="Oracle ADB", total;dur=${Math.round(
            performance.now() - reqStart,
          )}`,
        },
      },
    );
  } catch (error) {
    logOracleRouteError("GET /api/agendamentos", error);
    return NextResponse.json(
      { success: false, error: "Erro ao carregar agendamentos do dia." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureEspecialidadesSchemaAndSeed();

    const body = await request.json();
    const {
      pacienteId,
      novoPaciente,
      medicoId,
      especialidadeId,
      especialidade,
      dataHora,
      data,
      horario,
      duracaoMinutos,
      encaixe,
      tipo,
      status,
      observacao,
    } = body;

    const nomeNovo = novoPaciente?.nome ? String(novoPaciente.nome).trim() : "";
    const telefoneNovo = novoPaciente?.telefone
      ? String(novoPaciente.telefone).trim()
      : "";

    if (!pacienteId && !nomeNovo) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Selecione um paciente existente ou informe o nome para cadastro expresso.",
        },
        { status: 400 },
      );
    }

    let dataHoraDate: Date;
    if (dataHora) {
      dataHoraDate = new Date(dataHora);
    } else if (data && horario) {
      dataHoraDate = criarDataBR(String(data), String(horario));
    } else {
      return NextResponse.json(
        { success: false, error: "Informe a data e o horário do agendamento." },
        { status: 400 },
      );
    }

    if (isNaN(dataHoraDate.getTime())) {
      return NextResponse.json(
        { success: false, error: "Data ou horário inválido." },
        { status: 400 },
      );
    }

    const defaultTipo = !pacienteId && nomeNovo ? "PRIMEIRA_CONSULTA" : "RETORNO";
    const tipoNormalizado = String(tipo || defaultTipo).toUpperCase();
    const tipoFinal = (TIPOS_VALIDOS as readonly string[]).includes(
      tipoNormalizado,
    )
      ? tipoNormalizado
      : defaultTipo;

    const statusNormalizado = String(status || "AGENDADO").toUpperCase();
    const statusFinal = (STATUS_VALIDOS as readonly string[]).includes(
      statusNormalizado,
    )
      ? statusNormalizado
      : "AGENDADO";

    const duracaoValida = Math.min(
      Math.max(Number(duracaoMinutos) || 30, 10),
      240,
    );

    const especialidades = await listarTodasEspecialidadesEntity(false);
    const cleanEspId =
      typeof especialidadeId === "string" ? especialidadeId.trim() : "";
    let espAlvo: Especialidade | null = null;

    if (cleanEspId) {
      espAlvo = especialidades.find((e) => e.id === cleanEspId) ?? null;
    } else if (typeof especialidade === "string" && especialidade.trim()) {
      espAlvo = encontrarEspecialidadeCompativel(especialidade, especialidades);
    }

    const targetMedicoIdRaw = medicoId ? String(medicoId).trim() : "";
    if (!targetMedicoIdRaw) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Selecione um profissional ativo cadastrado em Configurações & Gestão da Equipe.",
        },
        { status: 400 },
      );
    }

    const sessao = await getSessao(request);
    const medicoAtivo = await buscarUsuarioMedicoAtivo(
      targetMedicoIdRaw,
      sessao?.organizationId,
    );

    if (!medicoAtivo) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Profissional selecionado não encontrado ou inativo em Configurações & Gestão da Equipe.",
        },
        { status: 400 },
      );
    }

    // Se a especialidade não foi enviada mas o médico tem especialidadeId, assume a do médico
    if (!espAlvo && medicoAtivo.especialidadeId) {
      espAlvo =
        especialidades.find((e) => e.id === medicoAtivo.especialidadeId) ?? null;
    }

    if (!espAlvo || !espAlvo.ativo) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Selecione uma especialidade ativa cadastrada em Configurações → Especialidades.",
        },
        { status: 400 },
      );
    }

    if (!medicoAtivo.especialidadeId || medicoAtivo.especialidadeId !== espAlvo.id) {
      return NextResponse.json(
        {
          success: false,
          error: `O profissional ${medicoAtivo.nome} não está vinculado à especialidade ${espAlvo.nome}. Selecione um médico ativo desta especialidade.`,
        },
        { status: 400 },
      );
    }

    const especialidadeCodigoLegado = gerarCodigoEspecialidadeLegado(espAlvo.nome);

    const resultado = await withTransaction(async (manager) => {
      const orgRepo = manager.getRepository(OrganizationEntity);
      const patientRepo = manager.getRepository(PatientEntity);
      const agendamentoRepo = manager.getRepository(AgendamentoEntity);

      // Garante espelho 1:1 na tabela MEDICOS com o mesmo USERS.ID para satisfazer FK_AGEND_MEDICO
      await garantirEspelhoMedicoAgenda(medicoAtivo, manager);
      const targetMedicoId = medicoAtivo.id;

      let targetPacienteId = pacienteId ? String(pacienteId) : "";
      let pacienteRecemCriado: {
        id: string;
        nome: string;
        cpf: string;
        recordCode: string;
        convenio: string;
        telefoneWhatsapp: string;
      } | null = null;

      if (!targetPacienteId && nomeNovo) {
        const orgs = await orgRepo.find({ take: 1 });
        let org = orgs[0];
        if (!org) {
          org = await orgRepo.save(
            orgRepo.create({
              slug: "clinica-faaz",
              legalName: "Clínica FAAZ Medicina Integrativa Ltda",
              tradeName: "Clínica FAAZ",
              taxId: "00.000.000/0001-00",
              primaryColorHex: "#059669",
              enabledModules: {},
              rolePermissions: {},
              status: "ACTIVE",
            }),
          );
        }

        const totalPacientes = await patientRepo.count({
          where: { organizationId: org.id },
        });
        let candidateCode = `FAAZ-${String(totalPacientes + 1).padStart(5, "0")}`;
        const existingCode = await patientRepo.findOne({
          where: { recordCode: candidateCode },
          select: { id: true },
        });
        if (existingCode) {
          candidateCode = `FAAZ-${String(totalPacientes + 1).padStart(4, "0")}-${Date.now().toString().slice(-3)}`;
        }

        const criadoPaciente = await patientRepo.save(
          patientRepo.create({
            organizationId: org.id,
            recordCode: candidateCode,
            fullName: nomeNovo,
            phoneWhatsapp: telefoneNovo,
            convenio: "Particular",
            planoFaaz: false,
            metaDiariaMl: 2500,
            patientStatus: "ACTIVE",
            activeModules: [],
          }),
        );

        targetPacienteId = criadoPaciente.id;
        pacienteRecemCriado = {
          id: criadoPaciente.id,
          nome: criadoPaciente.fullName,
          cpf: criadoPaciente.cpf || "",
          recordCode: criadoPaciente.recordCode,
          convenio: criadoPaciente.convenio || "Particular",
          telefoneWhatsapp: criadoPaciente.phoneWhatsapp || "",
        };
      }

      // Validação de conflito: CANCELADO e FALTOU nunca bloqueiam novo agendamento no mesmo horário
      const statusEhAtivo =
        statusFinal === "AGENDADO" || statusFinal === "CONFIRMADO";
      if (!Boolean(encaixe) && statusEhAtivo) {
        const faixaDia = getInicioFimDiaBR(dataHoraDate);
        const agendamentosDoDia = await agendamentoRepo.find({
          where: {
            medicoId: targetMedicoId,
            dataHora: Between(faixaDia.inicioUtc, faixaDia.fimUtc),
            status: Not(In(["CANCELADO", "FALTOU"])),
          },
          select: {
            id: true,
            dataHora: true,
            duracaoMinutos: true,
            status: true,
          },
        });

        const novoInicioMs = dataHoraDate.getTime();
        const novoFimMs = novoInicioMs + duracaoValida * 60_000;

        const conflito = agendamentosDoDia.find((ag) => {
          const agInicioMs = new Date(ag.dataHora).getTime();
          const agFimMs = agInicioMs + (Number(ag.duracaoMinutos) || 30) * 60_000;
          return agInicioMs < novoFimMs && agFimMs > novoInicioMs;
        });

        if (conflito) {
          return {
            conflitoHorario: formatarHoraBR(new Date(conflito.dataHora)),
            agendamentoCriado: null,
            pacienteRecemCriado: null,
          };
        }
      }

      const salvo = await agendamentoRepo.save(
        agendamentoRepo.create({
          pacienteId: targetPacienteId,
          medicoId: targetMedicoId,
          especialidade: especialidadeCodigoLegado,
          especialidadeId: espAlvo.id,
          dataHora: dataHoraDate,
          duracaoMinutos: duracaoValida,
          encaixe: Boolean(encaixe),
          tipo: tipoFinal,
          status: statusFinal,
          observacao: observacao ? String(observacao).trim() : null,
        }),
      );

      const agendamentoCriado = await agendamentoRepo.findOneOrFail({
        where: { id: salvo.id },
        relations: {
          paciente: true,
          medico: true,
        },
      });

      return { conflitoHorario: null, agendamentoCriado, pacienteRecemCriado };
    });

    if (resultado.conflitoHorario || !resultado.agendamentoCriado) {
      return NextResponse.json(
        {
          success: false,
          error: `Já existe uma consulta ativa para este médico às ${resultado.conflitoHorario}. Marque "Encaixe" caso deseje sobrepor este horário.`,
        },
        { status: 409 },
      );
    }

    const criado = resultado.agendamentoCriado;
    const d = new Date(criado.dataHora);
    const metaEsp = resolverMetaEspecialidadeAgendamento(criado, especialidades);

    return NextResponse.json(
      {
        success: true,
        novoPacienteCriado: resultado.pacienteRecemCriado,
        agendamento: {
          id: criado.id,
          pacienteId: criado.pacienteId,
          pacienteNome: criado.paciente?.fullName || "Paciente",
          pacienteRecordCode: criado.paciente?.recordCode || "",
          pacienteCpf: criado.paciente?.cpf || "",
          pacienteTelefone: criado.paciente?.phoneWhatsapp || "",
          pacienteConvenio: criado.paciente?.convenio || "Particular",
          pacientePlanoFaaz: Boolean(criado.paciente?.planoFaaz),
          paciente: criado.paciente,
          medicoId: criado.medicoId,
          medicoNome: criado.medico?.nome || "Equipe Clínica",
          medicoEspecialidade:
            criado.medico?.especialidade || metaEsp.especialidadeLegivel,
          medicoCorHex: criado.medico?.corHex || metaEsp.especialidadeCorHex,
          medico: criado.medico,
          especialidadeId: metaEsp.especialidadeId,
          especialidade: metaEsp.especialidade,
          especialidadeLegivel: metaEsp.especialidadeLegivel,
          especialidadeCor: metaEsp.especialidadeCor,
          especialidadeCorHex: metaEsp.especialidadeCorHex,
          dataHora: d.toISOString(),
          data: getDataDiaBR(d),
          horario: formatarHoraBR(d),
          duracaoMinutos: criado.duracaoMinutos || 30,
          encaixe: Boolean(criado.encaixe),
          tipo: criado.tipo,
          tipoLegivel: formatTipoLegivel(criado.tipo),
          status: criado.status,
          statusLegivel: formatStatusLegivel(criado.status),
          observacao: criado.observacao || "",
        },
      },
      { status: 201 },
    );
  } catch (error) {
    logOracleRouteError("POST /api/agendamentos", error);
    return NextResponse.json(
      { success: false, error: "Erro ao criar novo agendamento." },
      { status: 500 },
    );
  }
}
