import { NextRequest, NextResponse } from "next/server";
import { IsNull, MoreThan, Not } from "typeorm";
import { getRepository } from "@/lib/db/data-source";
import { AgendamentoEntity, PatientEntity } from "@/lib/db/entities";
import {
  formatarDataHumanaBR,
  formatarHoraBR,
  getDataDiaBR,
} from "@/lib/date-br";

function formatDataHumanaLocal(d: Date): string {
  return formatarDataHumanaBR(d);
}

function formatHorarioLocal(d: Date): string {
  return formatarHoraBR(d);
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
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const rawId = decodeURIComponent(id || "").trim();

    if (!rawId) {
      return NextResponse.json(
        { success: false, error: "ID do paciente é obrigatório." },
        { status: 400 },
      );
    }

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        rawId,
      );

    let resolvedPacienteId = rawId;
    if (!isUuid) {
      const cleanDigits = rawId.replace(/\D/g, "");
      const patientRepo = await getRepository(PatientEntity);
      const foundPatient = await patientRepo.findOne({
        where: [
          { recordCode: rawId, deletedAt: IsNull() },
          ...(cleanDigits.length > 0
            ? [
                { cpf: cleanDigits, deletedAt: IsNull() },
                { cpf: rawId, deletedAt: IsNull() },
              ]
            : []),
        ],
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
          },
        );
      }
      resolvedPacienteId = foundPatient.id;
    }

    const agora = new Date();
    const agendamentoRepo = await getRepository(AgendamentoEntity);

    const agendamento = await agendamentoRepo.findOne({
      where: {
        pacienteId: resolvedPacienteId,
        dataHora: MoreThan(agora),
        status: Not("CANCELADO"),
      },
      relations: {
        medico: true,
      },
      order: {
        dataHora: "ASC",
      },
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
        },
      );
    }

    const d = new Date(agendamento.dataHora);

    return NextResponse.json(
      {
        success: true,
        temProximaConsulta: true,
        proximaConsulta: {
          id: agendamento.id,
          pacienteId: agendamento.pacienteId,
          medicoId: agendamento.medicoId,
          medicoNome: agendamento.medico?.nome || "Equipe Clínica FAAZ",
          medicoEspecialidade:
            agendamento.medico?.especialidade || "Endocrinologia & Metabologia",
          medicoCorHex: agendamento.medico?.corHex || "#059669",
          dataHora: d.toISOString(),
          dataLocalIso: getDataDiaBR(d),
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
      },
    );
  } catch (error) {
    console.error("[GET /api/pacientes/[id]/proxima-consulta] Erro:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao buscar a próxima consulta do paciente.",
      },
      { status: 500 },
    );
  }
}
