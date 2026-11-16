import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TIPOS_VALIDOS = ["PRIMEIRA_CONSULTA", "RETORNO", "EXAME"] as const;
const STATUS_VALIDOS = ["AGENDADO", "CONFIRMADO", "CANCELADO", "FINALIZADO"] as const;
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
  try {
    const { searchParams } = new URL(request.url);
    const dataParam = searchParams.get("data"); // formato YYYY-MM-DD
    const inicioParam = searchParams.get("inicio"); // formato YYYY-MM-DD
    const fimParam = searchParams.get("fim"); // formato YYYY-MM-DD
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
      const [anoI, mesI, diaI] = inicioParam.split("-").map(Number);
      const [anoF, mesF, diaF] = fimParam.split("-").map(Number);
      inicioPeriodo = new Date(anoI, mesI - 1, diaI, 0, 0, 0, 0);
      fimPeriodo = new Date(anoF, mesF - 1, diaF, 23, 59, 59, 999);
    } else if (dataParam && /^\d{4}-\d{2}-\d{2}$/.test(dataParam)) {
      const [ano, mes, dia] = dataParam.split("-").map(Number);
      inicioPeriodo = new Date(ano, mes - 1, dia, 0, 0, 0, 0);
      fimPeriodo = new Date(ano, mes - 1, dia, 23, 59, 59, 999);
    } else {
      const agora = new Date();
      inicioPeriodo = new Date(
        agora.getFullYear(),
        agora.getMonth(),
        agora.getDate(),
        0,
        0,
        0,
        0
      );
      fimPeriodo = new Date(
        agora.getFullYear(),
        agora.getMonth(),
        agora.getDate(),
        23,
        59,
        59,
        999
      );
    }

    const registros = await prisma.agendamento.findMany({
      where: {
        dataHora: {
          gte: inicioPeriodo,
          lte: fimPeriodo,
        },
        ...(medicoIdParam && medicoIdParam !== "TODOS"
          ? { medicoId: medicoIdParam }
          : {}),
        ...(especialidadeParam &&
        especialidadeParam !== "TODAS" &&
        (ESPECIALIDADES_VALIDAS as readonly string[]).includes(
          especialidadeParam.toUpperCase()
        )
          ? { especialidade: especialidadeParam.toUpperCase() }
          : {}),
      },
      include: {
        paciente: true,
        medico: true,
      },
      orderBy: {
        dataHora: "asc",
      },
    });

    const agendamentos = registros.map((item) => {
      const d = new Date(item.dataHora);
      const pad = (n: number) => String(n).padStart(2, "0");
      const horario = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      const dataIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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
        medicoNome: item.medico?.nome || "Dr. Carlos Fantini",
        medicoEspecialidade:
          item.medico?.especialidade || "Endocrinologia & Nutrologia",
        medicoCorHex: item.medico?.corHex || "#059669",
        medico: item.medico,
        especialidade:
          item.especialidade === "CIRURGIA_PLASTICA"
            ? "CIRURGIA_PLASTICA"
            : "ENDOCRINOLOGIA",
        especialidadeLegivel: formatEspecialidadeLegivel(item.especialidade),
        dataHora: item.dataHora.toISOString(),
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
        },
      }
    );
  } catch (error) {
    console.error("[GET /api/agendamentos] Erro:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao carregar agendamentos do dia." },
      { status: 500 }
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
        { status: 400 }
      );
    }

    let dataHoraDate: Date;
    if (dataHora) {
      dataHoraDate = new Date(dataHora);
    } else if (data && horario) {
      const [ano, mes, dia] = String(data).split("-").map(Number);
      const [hora, minuto] = String(horario).split(":").map(Number);
      dataHoraDate = new Date(ano, mes - 1, dia, hora || 0, minuto || 0, 0, 0);
    } else {
      return NextResponse.json(
        { success: false, error: "Informe a data e o horário do agendamento." },
        { status: 400 }
      );
    }

    if (isNaN(dataHoraDate.getTime())) {
      return NextResponse.json(
        { success: false, error: "Data ou horário inválido." },
        { status: 400 }
      );
    }

    const defaultTipo = !pacienteId && nomeNovo ? "PRIMEIRA_CONSULTA" : "RETORNO";
    const tipoNormalizado = String(tipo || defaultTipo).toUpperCase();
    const tipoFinal = (TIPOS_VALIDOS as readonly string[]).includes(tipoNormalizado)
      ? tipoNormalizado
      : defaultTipo;

    const statusNormalizado = String(status || "AGENDADO").toUpperCase();
    const statusFinal = (STATUS_VALIDOS as readonly string[]).includes(statusNormalizado)
      ? statusNormalizado
      : "AGENDADO";

    const especialidadeNormalizada = String(
      especialidade || "ENDOCRINOLOGIA"
    ).toUpperCase();
    const especialidadeFinal = (
      ESPECIALIDADES_VALIDAS as readonly string[]
    ).includes(especialidadeNormalizada)
      ? especialidadeNormalizada
      : "ENDOCRINOLOGIA";

    const duracaoValida = Math.min(
      Math.max(Number(duracaoMinutos) || 30, 10),
      240
    );

    const resultado = await prisma.$transaction(async (tx) => {
      let targetPacienteId = pacienteId ? String(pacienteId) : "";
      let pacienteRecemCriado: {
        id: string;
        nome: string;
        cpf: string;
        recordCode: string;
        convenio: string;
        telefoneWhatsapp: string;
      } | null = null;

      // Cenário B: Cadastro Expresso de Novo Paciente na transação
      if (!targetPacienteId && nomeNovo) {
        let org = await tx.organization.findFirst();
        if (!org) {
          org = await tx.organization.create({
            data: {
              slug: "clinica-faaz",
              legalName: "Clínica FAAZ Medicina Integrativa Ltda",
              tradeName: "Clínica FAAZ",
              taxId: "00.000.000/0001-00",
            },
          });
        }

        const totalPacientes = await tx.patient.count({
          where: { organizationId: org.id },
        });
        let candidateCode = `FAAZ-${String(totalPacientes + 1).padStart(5, "0")}`;
        const existingCode = await tx.patient.findUnique({
          where: { recordCode: candidateCode },
          select: { id: true },
        });
        if (existingCode) {
          candidateCode = `FAAZ-${String(totalPacientes + 1).padStart(4, "0")}-${Date.now().toString().slice(-3)}`;
        }

        const criadoPaciente = await tx.patient.create({
          data: {
            organizationId: org.id,
            recordCode: candidateCode,
            fullName: nomeNovo,
            phoneWhatsapp: telefoneNovo,
            convenio: "Particular",
            patientStatus: "ACTIVE",
          },
        });

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

      // Resolve médico responsável (com fallback automático para Dr. Carlos Fantini)
      let targetMedicoId = medicoId ? String(medicoId).trim() : "";
      if (!targetMedicoId) {
        const firstMedico = await tx.medico.findFirst({
          orderBy: { createdAt: "asc" },
        });
        if (firstMedico) {
          targetMedicoId = firstMedico.id;
        } else {
          const defaultMedico = await tx.medico.create({
            data: {
              id: "00000000-0000-4000-8000-000000000001",
              nome: "Dr. Carlos Fantini",
              especialidade: "Endocrinologia & Nutrologia",
              corHex: "#059669",
            },
          });
          targetMedicoId = defaultMedico.id;
        }
      }

      const agendamentoCriado = await tx.agendamento.create({
        data: {
          pacienteId: targetPacienteId,
          medicoId: targetMedicoId,
          especialidade: especialidadeFinal,
          dataHora: dataHoraDate,
          duracaoMinutos: duracaoValida,
          encaixe: Boolean(encaixe),
          tipo: tipoFinal,
          status: statusFinal,
          observacao: observacao ? String(observacao).trim() : null,
        },
        include: {
          paciente: true,
          medico: true,
        },
      });

      return { agendamentoCriado, pacienteRecemCriado };
    });

    const criado = resultado.agendamentoCriado;
    const d = new Date(criado.dataHora);
    const pad = (n: number) => String(n).padStart(2, "0");

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
          medicoNome: criado.medico?.nome || "Dr. Carlos Fantini",
          medicoEspecialidade:
            criado.medico?.especialidade || "Endocrinologia & Nutrologia",
          medicoCorHex: criado.medico?.corHex || "#059669",
          medico: criado.medico,
          especialidade:
            criado.especialidade === "CIRURGIA_PLASTICA"
              ? "CIRURGIA_PLASTICA"
              : "ENDOCRINOLOGIA",
          especialidadeLegivel: formatEspecialidadeLegivel(
            criado.especialidade
          ),
          dataHora: criado.dataHora.toISOString(),
          data: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
          horario: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
          duracaoMinutos: criado.duracaoMinutos || 30,
          encaixe: Boolean(criado.encaixe),
          tipo: criado.tipo,
          tipoLegivel: formatTipoLegivel(criado.tipo),
          status: criado.status,
          statusLegivel: formatStatusLegivel(criado.status),
          observacao: criado.observacao || "",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/agendamentos] Erro:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao criar novo agendamento." },
      { status: 500 }
    );
  }
}
