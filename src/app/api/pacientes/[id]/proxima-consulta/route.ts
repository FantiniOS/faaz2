import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const DIAS_SEMANA_PT = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

function formatDataHumanaLocal(d: Date): string {
  const dia = d.getDate();
  const mes = MESES_PT[d.getMonth()] || "";
  const diaSemana = DIAS_SEMANA_PT[d.getDay()] || "";
  return `${dia} de ${mes}, ${diaSemana}`;
}

function formatHorarioLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatStatusLegivel(status: string): string {
  switch (status) {
    case "CONFIRMADO":
      return "Confirmado";
    case "AGENDADO":
      return "Agendado";
    case "FINALIZADO":
      return "Finalizado";
    case "CANCELADO":
      return "Cancelado";
    default:
      return status;
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

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const rawId = decodeURIComponent(id || "").trim();

    if (!rawId) {
      return NextResponse.json(
        { success: false, error: "ID do paciente é obrigatório." },
        { status: 400 }
      );
    }

    // Resolve o paciente (suporta UUID direto, CPF ou recordCode por segurança)
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        rawId
      );

    let resolvedPacienteId = rawId;
    if (!isUuid) {
      const cleanDigits = rawId.replace(/\D/g, "");
      const foundPatient = await prisma.patient.findFirst({
        where: {
          OR: [
            { recordCode: rawId },
            ...(cleanDigits.length > 0
              ? [{ cpf: cleanDigits }, { cpf: rawId }]
              : []),
          ],
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!foundPatient) {
        return NextResponse.json(
          {
            success: true,
            temProximaConsulta: false,
            proximaConsulta: null,
          },
          {
            headers: {
              "Cache-Control": "no-store, no-cache, must-revalidate",
            },
          }
        );
      }
      resolvedPacienteId = foundPatient.id;
    }

    const agora = new Date();

    const agendamento = await prisma.agendamento.findFirst({
      where: {
        pacienteId: resolvedPacienteId,
        dataHora: {
          gt: agora,
        },
        status: {
          not: "CANCELADO",
        },
      },
      include: {
        medico: true,
      },
      orderBy: {
        dataHora: "asc",
      },
      take: 1,
    });

    if (!agendamento) {
      return NextResponse.json(
        {
          success: true,
          temProximaConsulta: false,
          proximaConsulta: null,
        },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        }
      );
    }

    const d = new Date(agendamento.dataHora);
    const pad = (n: number) => String(n).padStart(2, "0");

    return NextResponse.json(
      {
        success: true,
        temProximaConsulta: true,
        proximaConsulta: {
          id: agendamento.id,
          pacienteId: agendamento.pacienteId,
          medicoId: agendamento.medicoId,
          medicoNome: agendamento.medico?.nome || "Dr. Carlos Fantini",
          medicoEspecialidade:
            agendamento.medico?.especialidade || "Endocrinologia & Nutrologia",
          medicoCorHex: agendamento.medico?.corHex || "#059669",
          dataHora: agendamento.dataHora.toISOString(),
          dataLocalIso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
          dataFormatada: formatDataHumanaLocal(d),
          horario: formatHorarioLocal(d),
          duracaoMinutos: agendamento.duracaoMinutos || 30,
          encaixe: Boolean(agendamento.encaixe),
          tipo: agendamento.tipo,
          tipoLegivel: formatTipoLegivel(agendamento.tipo),
          status: agendamento.status,
          statusLegivel: formatStatusLegivel(agendamento.status),
          observacao: agendamento.observacao || "",
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("[GET /api/pacientes/[id]/proxima-consulta] Erro:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao buscar a próxima consulta do paciente.",
      },
      { status: 500 }
    );
  }
}
