export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IsNull, MoreThanOrEqual } from "typeorm";
import { z } from "zod";
import { withRepositoryRetry } from "@/lib/db/data-source";
import {
  PatientEntity,
  RegistroInsulinaEntity,
  type RegistroInsulina,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos } from "@/lib/auth-rbac";
import {
  formatarHoraBR,
  getDataDiaBR,
  getIntervaloDiasBR,
  toIsoUtc,
} from "@/lib/date-br";
import { normalizarMomentoClinico } from "@/lib/mapa-glicemico";

const checkinInsulinaSchema = z.object({
  pacienteId: z.string().min(1, "Informe o paciente."),
  tipo: z
    .string()
    .optional()
    .default("BASAL")
    .transform((v) =>
      v.trim().toUpperCase() === "RAPIDA" ? "RAPIDA" : "BASAL",
    ),
  unidades: z.coerce
    .number()
    .positive("Informe uma dose maior que zero.")
    .max(300, "Dose máxima permitida: 300 UI."),
  nome: z.string().max(80).nullable().optional(),
  nomeInsulina: z.string().max(80).nullable().optional(),
  momentoClinico: z.string().max(20).nullable().optional(),
  observacao: z.string().max(200).nullable().optional(),
  registroGlicemiaId: z.string().max(36).nullable().optional(),
  aplicadoEm: z.string().optional(),
});

function formatRegistroInsulina(row: RegistroInsulina) {
  return {
    id: row.id,
    pacienteId: row.pacienteId,
    registroGlicemiaId: row.registroGlicemiaId ?? null,
    dataDia: row.dataDia,
    aplicadoEm: toIsoUtc(row.aplicadoEm) ?? new Date(row.aplicadoEm).toISOString(),
    hora: formatarHoraBR(row.aplicadoEm),
    tipo: row.tipo === "RAPIDA" ? "RAPIDA" : "BASAL",
    nomeInsulina: row.nomeInsulina?.trim() || null,
    unidades: Math.round((Number(row.unidades) || 0) * 100) / 100,
    momentoClinico: row.momentoClinico?.trim() || null,
    observacao: row.observacao?.trim() || null,
  };
}

/**
 * GET /api/checkins/insulina?pacienteId=...&dias=7
 * Lista aplicações de insulina do dia (Brasília) e histórico opcional do paciente.
 */
export async function GET(req: NextRequest) {
  try {
    const sessao = await getSessao(req);
    const sessaoRole = (sessao as { role?: string } | null)?.role;
    if (
      sessao &&
      (!podeAcessarDadosClinicos(sessao.cargo) ||
        sessao.cargo === "SECRETARIA" ||
        sessaoRole === "SECRETARIA" ||
        sessaoRole === "RECEPTIONIST")
    ) {
      return NextResponse.json(
        {
          error: "Acesso Negado (LGPD/RBAC)",
          motivo:
            "Secretárias não possuem autorização para acessar dados clínicos de insulina.",
        },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(req.url);
    const pacienteId =
      searchParams.get("pacienteId")?.trim() ||
      req.headers.get("paciente-id")?.trim() ||
      "";
    if (!pacienteId) {
      return NextResponse.json(
        { error: "Informe o pacienteId." },
        { status: 400 },
      );
    }

    const diasRaw = parseInt(searchParams.get("dias") || "7", 10);
    const dias = Number.isFinite(diasRaw)
      ? Math.min(90, Math.max(1, diasRaw))
      : 7;

    const hojeDataDia = getDataDiaBR();
    const { dataInicioIso } = getIntervaloDiasBR(dias);

    const rows = await withRepositoryRetry(
      RegistroInsulinaEntity,
      (repo) =>
        repo.find({
          where: {
            pacienteId,
            dataDia: MoreThanOrEqual(dataInicioIso),
          },
          order: { aplicadoEm: "DESC" },
          take: 200,
        }),
      { label: "checkins-insulina:get" },
    );

    const historico = rows.map(formatRegistroInsulina);
    const registrosHoje = historico.filter((r) => r.dataDia === hojeDataDia);
    const basalHoje = registrosHoje.filter((r) => r.tipo === "BASAL");

    return NextResponse.json({
      success: true,
      hojeDataDia,
      totalHoje: registrosHoje.length,
      registrosHoje,
      ultimaBasalHoje: basalHoje[0] ?? null,
      historico,
    });
  } catch (error: unknown) {
    console.error("[API_CHECKINS_INSULINA_GET_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao consultar registros de insulina.", details },
      { status: 500 },
    );
  }
}

/**
 * POST /api/checkins/insulina
 * Registra aplicação de Insulina Basal (ou avulsa rápida) sem exigir leitura de glicemia.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = checkinInsulinaSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos para registro de insulina.",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const {
      pacienteId,
      tipo,
      unidades,
      nome,
      nomeInsulina,
      momentoClinico,
      observacao,
      registroGlicemiaId,
      aplicadoEm,
    } = parsed.data;

    // Confirma paciente (projeção mínima sem CLOB)
    const patient = await withRepositoryRetry(
      PatientEntity,
      (repo) =>
        repo.findOne({
          where: { id: pacienteId.trim(), deletedAt: IsNull() },
          select: { id: true },
        }),
      { label: "checkins-insulina:patient-check" },
    );

    if (!patient) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    const aplicadoDate = aplicadoEm ? new Date(aplicadoEm) : new Date();
    const safeDate = Number.isNaN(aplicadoDate.getTime())
      ? new Date()
      : aplicadoDate;
    const dataDia = getDataDiaBR(safeDate);
    const nomeFinal = (nomeInsulina ?? nome ?? "").trim().slice(0, 80) || null;
    const momentoFinal = normalizarMomentoClinico(momentoClinico);
    const obsFinal = observacao?.trim().slice(0, 200) || null;

    const saved = await withRepositoryRetry(
      RegistroInsulinaEntity,
      async (repo) => {
        const entity = repo.create({
          pacienteId: patient.id,
          registroGlicemiaId: registroGlicemiaId?.trim() || null,
          dataDia,
          aplicadoEm: safeDate,
          tipo,
          nomeInsulina: nomeFinal,
          unidades: Math.round(unidades * 100) / 100,
          momentoClinico: momentoFinal,
          observacao: obsFinal,
        });
        return repo.save(entity);
      },
      { label: "checkins-insulina:post" },
    );

    return NextResponse.json(
      {
        success: true,
        message: "Aplicação de insulina registrada com sucesso!",
        data: formatRegistroInsulina(saved),
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("[API_CHECKINS_INSULINA_POST_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro interno ao registrar insulina.", details },
      { status: 500 },
    );
  }
}
