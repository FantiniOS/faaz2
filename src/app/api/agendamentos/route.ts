import { NextRequest, NextResponse } from "next/server";
import { Between } from "typeorm";
import { getRepository, withTransaction } from "@/lib/db/data-source";
import {
  AgendamentoEntity,
  MedicoEntity,
  OrganizationEntity,
  PatientEntity,
} from "@/lib/db/entities";
import {
  criarDataBR,
  formatarHoraBR,
  getDataDiaBR,
  getInicioFimDiaBR,
} from "@/lib/date-br";

const TIPOS_VALIDOS = ["PRIMEIRA_CONSULTA", "RETORNO", "EXAME"] as const;
const STATUS_VALIDOS = [
  "AGENDADO",
  "CONFIRMADO",
  "CANCELADO",
  "FINALIZADO",
] as const;
const ESPECIALIDADES_VALIDAS = [
  "ENDOCRINOLOGIA",
  "CIRURGIA_PLASTICA",
] as const;

function formatEspecialidadeLegivel(especialidade?: string | null): string {
  switch (especialidade) {
    case "CIRURGIA_PLASTICA":
      return "Cirurgia Plástica";
    case "ENDOCRINOLOGIA":
    default:
      return "Endocrinologia";
  }
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
    const { searchParams } = new URL(request.url);
    const dataParam = searchParams.get("data");
    const inicioParam = searchParams.get("inicio");
    const fimParam = searchParams.get("fim");
    const medicoIdParam = searchParams.get("medicoId");
    const especialidadeParam = searchParams.get("especialidade");

    let inicioPeriodo: Date;
    let fimPeriodo: Date;

    if (
      inicioParam &&
      fimParam &&
      /^\d{4}-\d{2}-\d{2}$/.test(inicioParam) &&
      /^\d{4}-\d{2}-\d{2}$/.test(fimParam)
    ) {
      inicioPeriodo = getInicioFimDiaBR(inicioParam).inicioUtc;
      fimPeriodo = getInicioFimDiaBR(fimParam).fimUtc;
    } else if (dataParam && /^\d{4}-\d{2}-\d{2}$/.test(dataParam)) {
      const faixa = getInicioFimDiaBR(dataParam);
      inicioPeriodo = faixa.inicioUtc;
      fimPeriodo = faixa.fimUtc;
    } else {
      const faixaHoje = getInicioFimDiaBR();
      inicioPeriodo = faixaHoje.inicioUtc;
      fimPeriodo = faixaHoje.fimUtc;
    }

    const dbStart = performance.now();
    const agendamentoRepo = await getRepository(AgendamentoEntity);
    const registros = await agendamentoRepo.find({
      where: {
        dataHora: Between(inicioPeriodo, fimPeriodo),
        ...(medicoIdParam && medicoIdParam !== "TODOS"
          ? { medicoId: medicoIdParam }
          : {}),
        ...(especialidadeParam &&
        especialidadeParam !== "TODAS" &&
        (ESPECIALIDADES_VALIDAS as readonly string[]).includes(
          especialidadeParam.toUpperCase(),
        )
          ? { especialidade: especialidadeParam.toUpperCase() }
          : {}),
      },
      select: {
        id: true,
        pacienteId: true,
        medicoId: true,
        especialidade: true,
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
    });
    const dbDurMs = Math.round(performance.now() - dbStart);

    const agendamentos = registros.map((item) => {
      const d = new Date(item.dataHora);
      const horario = formatarHoraBR(d);
      const dataIso = getDataDiaBR(d);

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
        medicoNome: item.medico?.nome || "Equipe Clínica FAAZ",
        medicoEspecialidade:
          item.medico?.especialidade || "Endocrinologia & Metabologia",
        medicoCorHex: item.medico?.corHex || "#059669",
        medico: item.medico,
        especialidade:
          item.especialidade === "CIRURGIA_PLASTICA"
            ? "CIRURGIA_PLASTICA"
            : "ENDOCRINOLOGIA",
        especialidadeLegivel: formatEspecialidadeLegivel(item.especialidade),
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
            performance.now() - reqStart
          )}`,
        },
      },
    );
  } catch (error) {
    console.error("[GET /api/agendamentos] Erro:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao carregar agendamentos do dia." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      pacienteId,
      novoPaciente,
      medicoId,
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

    const especialidadeNormalizada = String(
      especialidade || "ENDOCRINOLOGIA",
    ).toUpperCase();
    const especialidadeFinal = (
      ESPECIALIDADES_VALIDAS as readonly string[]
    ).includes(especialidadeNormalizada)
      ? especialidadeNormalizada
      : "ENDOCRINOLOGIA";

    const duracaoValida = Math.min(
      Math.max(Number(duracaoMinutos) || 30, 10),
      240,
    );

    const resultado = await withTransaction(async (manager) => {
      const orgRepo = manager.getRepository(OrganizationEntity);
      const patientRepo = manager.getRepository(PatientEntity);
      const medicoRepo = manager.getRepository(MedicoEntity);
      const agendamentoRepo = manager.getRepository(AgendamentoEntity);

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

      let targetMedicoId = medicoId ? String(medicoId).trim() : "";
      if (!targetMedicoId) {
        const medicos = await medicoRepo.find({
          order: { createdAt: "ASC" },
          take: 1,
        });
        if (medicos[0]) {
          targetMedicoId = medicos[0].id;
        } else {
          const defaultMedico = await medicoRepo.save(
            medicoRepo.create({
              id: "00000000-0000-4000-8000-000000000001",
              nome: "Dr. Carlos Fantini",
              especialidade: "Endocrinologia & Nutrologia",
              corHex: "#059669",
            }),
          );
          targetMedicoId = defaultMedico.id;
        }
      }

      const salvo = await agendamentoRepo.save(
        agendamentoRepo.create({
          pacienteId: targetPacienteId,
          medicoId: targetMedicoId,
          especialidade: especialidadeFinal,
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

      return { agendamentoCriado, pacienteRecemCriado };
    });

    const criado = resultado.agendamentoCriado;
    const d = new Date(criado.dataHora);

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
          medicoNome: criado.medico?.nome || "Equipe Clínica FAAZ",
          medicoEspecialidade:
            criado.medico?.especialidade || "Endocrinologia & Metabologia",
          medicoCorHex: criado.medico?.corHex || "#059669",
          medico: criado.medico,
          especialidade:
            criado.especialidade === "CIRURGIA_PLASTICA"
              ? "CIRURGIA_PLASTICA"
              : "ENDOCRINOLOGIA",
          especialidadeLegivel: formatEspecialidadeLegivel(criado.especialidade),
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
    console.error("[POST /api/agendamentos] Erro:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao criar novo agendamento." },
      { status: 500 },
    );
  }
}
