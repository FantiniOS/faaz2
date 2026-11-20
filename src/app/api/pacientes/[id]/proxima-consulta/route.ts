export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { In, IsNull, MoreThan } from "typeorm";
import { getRepository } from "@/lib/db/data-source";
import { AgendamentoEntity, PatientEntity } from "@/lib/db/entities";
import {
  formatarDataHoraBR,
  formatarDataHumanaBR,
  formatarHoraBR,
  getDataDiaBR,
  toIsoUtc,
} from "@/lib/date-br";

const STATUS_ATIVOS_FUTUROS = ["AGENDADO", "CONFIRMADO"] as const;
const STATUS_CONCLUIDOS = ["FINALIZADO", "CONCLUIDO", "REALIZADO"] as const;

function buildHeaders(request?: NextRequest): Record<string, string> {
  const origin = request?.headers.get("origin") || "*";
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Accept, Authorization, paciente-id",
    "Access-Control-Allow-Credentials": "true",
  };
}

function formatStatusLegivel(status: string): string {
  switch (status.toUpperCase()) {
    case "CONFIRMADO":
      return "Confirmada";
    case "AGENDADO":
      return "Agendada";
    case "FINALIZADO":
    case "CONCLUIDO":
    case "REALIZADO":
      return "Finalizada";
    case "CANCELADO":
      return "Cancelada";
    case "FALTOU":
      return "Faltou";
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

function appendObservacaoNota(
  obsAtual: string | null | undefined,
  nota: string,
): string {
  const atual = (obsAtual || "").trim();
  if (!atual) return nota;
  if (atual.toLowerCase().includes(nota.toLowerCase())) {
    return atual;
  }
  return `${atual} | ${nota}`;
}

async function resolvePacienteId(rawId: string): Promise<string | null> {
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      rawId,
    );
  if (isUuid) return rawId;

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

  return foundPatient?.id ?? null;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: buildHeaders(request),
  });
}

/**
 * GET /api/pacientes/[id]/proxima-consulta
 * Retorna apenas o próximo agendamento futuro com status ativo (AGENDADO ou CONFIRMADO),
 * ignorando CANCELADO, FALTOU, CONCLUIDO/FINALIZADO/REALIZADO.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const headers = buildHeaders(request);
  try {
    const { id } = await context.params;
    const rawId = decodeURIComponent(id || "").trim();

    if (!rawId) {
      return NextResponse.json(
        { success: false, error: "ID do paciente é obrigatório." },
        { status: 400, headers },
      );
    }

    const resolvedPacienteId = await resolvePacienteId(rawId);
    if (!resolvedPacienteId) {
      return NextResponse.json(
        {
          success: true,
          temProximaConsulta: false,
          proximaConsulta: null,
        },
        { headers },
      );
    }

    const agora = new Date();
    const agendamentoRepo = await getRepository(AgendamentoEntity);

    const agendamento = await agendamentoRepo.findOne({
      where: {
        pacienteId: resolvedPacienteId,
        dataHora: MoreThan(agora),
        status: In([...STATUS_ATIVOS_FUTUROS]),
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
        { headers },
      );
    }

    const d = new Date(agendamento.dataHora);
    const dataHoraIsoUtc = toIsoUtc(d) ?? d.toISOString();
    const especialidadeResolvida =
      agendamento.medico?.especialidade ||
      (agendamento.especialidade === "CIRURGIA_PLASTICA"
        ? "Cirurgia Plástica"
        : "Endocrinologia & Metabologia");

    return NextResponse.json(
      {
        success: true,
        temProximaConsulta: true,
        proximaConsulta: {
          id: agendamento.id,
          pacienteId: agendamento.pacienteId,
          medicoId: agendamento.medicoId,
          medicoNome: agendamento.medico?.nome || "Equipe Clínica FAAZ",
          especialidade: especialidadeResolvida,
          medicoEspecialidade: especialidadeResolvida,
          medicoCorHex: agendamento.medico?.corHex || "#059669",
          dataHora: dataHoraIsoUtc,
          dataLocalIso: getDataDiaBR(d),
          dataFormatada: formatarDataHumanaBR(d),
          horario: formatarHoraBR(d),
          duracaoMinutos: agendamento.duracaoMinutos || 30,
          encaixe: Boolean(agendamento.encaixe),
          tipo: agendamento.tipo,
          tipoLegivel: formatTipoLegivel(agendamento.tipo),
          status: agendamento.status,
          statusLegivel: formatStatusLegivel(agendamento.status),
          observacao: agendamento.observacao || "",
        },
      },
      { headers },
    );
  } catch (error) {
    console.error("[GET /api/pacientes/[id]/proxima-consulta] Erro:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao buscar a próxima consulta do paciente.",
      },
      { status: 500, headers },
    );
  }
}

/**
 * PATCH /api/pacientes/[id]/proxima-consulta
 * Permite que o paciente confirme ou cancele sua próxima consulta pelo App Mobile.
 * Body: { agendamentoId: string, acao: "CONFIRMAR" | "CANCELAR", motivo?: string }
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const headers = buildHeaders(request);
  try {
    const { id } = await context.params;
    const rawId = decodeURIComponent(id || "").trim();

    if (!rawId) {
      return NextResponse.json(
        { success: false, error: "ID do paciente é obrigatório." },
        { status: 400, headers },
      );
    }

    const resolvedPacienteId = await resolvePacienteId(rawId);
    if (!resolvedPacienteId) {
      return NextResponse.json(
        { success: false, error: "Paciente não encontrado." },
        { status: 404, headers },
      );
    }

    const body = await request.json().catch(() => null);
    const agendamentoId =
      typeof body?.agendamentoId === "string" ? body.agendamentoId.trim() : "";
    const acaoRaw =
      typeof body?.acao === "string" ? body.acao.trim().toUpperCase() : "";
    const motivoLimpo =
      typeof body?.motivo === "string" ? body.motivo.trim().slice(0, 200) : "";

    if (!agendamentoId) {
      return NextResponse.json(
        { success: false, error: "agendamentoId é obrigatório." },
        { status: 400, headers },
      );
    }

    if (acaoRaw !== "CONFIRMAR" && acaoRaw !== "CANCELAR") {
      return NextResponse.json(
        {
          success: false,
          error: "Ação inválida. Use 'CONFIRMAR' ou 'CANCELAR'.",
        },
        { status: 400, headers },
      );
    }

    const agendamentoRepo = await getRepository(AgendamentoEntity);
    const agendamento = await agendamentoRepo.findOne({
      where: {
        id: agendamentoId,
        pacienteId: resolvedPacienteId,
      },
      relations: { medico: true },
    });

    if (!agendamento) {
      return NextResponse.json(
        {
          success: false,
          error: "Agendamento não encontrado para este paciente.",
        },
        { status: 404, headers },
      );
    }

    const statusAtual = (agendamento.status || "").toUpperCase();
    if ((STATUS_CONCLUIDOS as readonly string[]).includes(statusAtual)) {
      return NextResponse.json(
        {
          success: false,
          error: "Esta consulta já foi concluída e não pode ser alterada.",
        },
        { status: 400, headers },
      );
    }

    const dataAgendamento = new Date(agendamento.dataHora);
    if (
      Number.isNaN(dataAgendamento.getTime()) ||
      dataAgendamento.getTime() <= Date.now()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Não é possível alterar uma consulta em data/horário passado.",
        },
        { status: 400, headers },
      );
    }

    if (acaoRaw === "CONFIRMAR" && statusAtual === "CANCELADO") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Esta consulta já foi cancelada. Entre em contato pelo WhatsApp para reagendar.",
        },
        { status: 400, headers },
      );
    }

    const carimboBr = formatarDataHoraBR(new Date());
    let novoStatus: "CONFIRMADO" | "CANCELADO";
    let nota: string;

    if (acaoRaw === "CONFIRMAR") {
      novoStatus = "CONFIRMADO";
      nota = `Confirmado pelo paciente via App Mobile (${carimboBr})`;
    } else {
      novoStatus = "CANCELADO";
      nota = motivoLimpo
        ? `Cancelado pelo paciente via App Mobile (${carimboBr}): ${motivoLimpo}`
        : `Cancelado pelo paciente via App Mobile (${carimboBr})`;
    }

    agendamento.status = novoStatus;
    agendamento.observacao = appendObservacaoNota(agendamento.observacao, nota);
    await agendamentoRepo.save(agendamento);

    return NextResponse.json(
      {
        success: true,
        agendamentoId: agendamento.id,
        status: novoStatus,
        statusLegivel: formatStatusLegivel(novoStatus),
        dataHora: toIsoUtc(dataAgendamento) ?? dataAgendamento.toISOString(),
        observacao: agendamento.observacao || "",
        message:
          novoStatus === "CONFIRMADO"
            ? "Presença confirmada com sucesso!"
            : "Consulta cancelada e horário liberado na agenda da clínica.",
      },
      { headers },
    );
  } catch (error) {
    console.error("[PATCH /api/pacientes/[id]/proxima-consulta] Erro:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao atualizar o status da consulta.",
      },
      { status: 500, headers },
    );
  }
}
