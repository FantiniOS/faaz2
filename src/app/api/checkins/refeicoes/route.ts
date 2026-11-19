export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IsNull, MoreThanOrEqual } from "typeorm";
import { z } from "zod";
import { getRepository } from "@/lib/db/data-source";
import {
  CheckinRefeicaoEntity,
  PatientEntity,
  RefeicaoEntity,
  type StatusCheckinRefeicao,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function getHojeDataDia(): string {
  // Usa fuso America/Sao_Paulo para alinhar o dia do paciente no Brasil
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // Fallback ISO UTC
  }
  return new Date().toISOString().slice(0, 10);
}

function subtrairDiasIso(baseIso: string, dias: number): string {
  const [y, m, d] = baseIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dias);
  return dt.toISOString().slice(0, 10);
}

const checkinRefeicaoSchema = z.object({
  pacienteId: z.string().uuid("pacienteId inválido."),
  refeicaoId: z.string().uuid("refeicaoId inválido."),
  dataDia: z
    .string()
    .regex(ISO_DATE_RE, "dataDia deve estar no formato YYYY-MM-DD.")
    .optional(),
  status: z.enum(["SEGUI", "FIZ_TROCA", "NAO_FIZ"]),
  opcaoEscolhida: z.string().trim().max(120).nullable().optional(),
  trocas: z
    .union([z.array(z.unknown()), z.record(z.string(), z.unknown())])
    .nullable()
    .optional(),
});

/**
 * POST /api/checkins/refeicoes
 * Upsert do check-in leve de refeição por (PACIENTE_ID, REFEICAO_ID, DATA_DIA).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = checkinRefeicaoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ||
            "Dados inválidos para check-in de refeição.",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { pacienteId, refeicaoId, status, opcaoEscolhida, trocas } =
      parsed.data;
    const dataDia = parsed.data.dataDia || getHojeDataDia();

    const [patientRepo, refeicaoRepo, checkinRepo] = await Promise.all([
      getRepository(PatientEntity),
      getRepository(RefeicaoEntity),
      getRepository(CheckinRefeicaoEntity),
    ]);

    const [paciente, refeicao] = await Promise.all([
      patientRepo.findOne({
        where: { id: pacienteId, deletedAt: IsNull() },
        select: { id: true },
      }),
      refeicaoRepo.findOne({
        where: { id: refeicaoId },
        select: { id: true, nome: true },
      }),
    ]);

    if (!paciente) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    if (!refeicao) {
      return NextResponse.json(
        { error: "Refeição não encontrada." },
        { status: 404 },
      );
    }

    const existente = await checkinRepo.findOne({
      where: { pacienteId, refeicaoId, dataDia },
    });

    const payloadStatus: StatusCheckinRefeicao = status;
    const opcaoLimpa = opcaoEscolhida?.trim() || null;
    const trocasVal = trocas ?? null;

    const salvo = existente
      ? await checkinRepo.save({
          ...existente,
          status: payloadStatus,
          opcaoEscolhida: opcaoLimpa,
          trocasJson: trocasVal,
          atualizadoEm: new Date(),
        })
      : await checkinRepo.save(
          checkinRepo.create({
            pacienteId,
            refeicaoId,
            dataDia,
            status: payloadStatus,
            opcaoEscolhida: opcaoLimpa,
            trocasJson: trocasVal,
          }),
        );

    return NextResponse.json(
      {
        success: true,
        checkin: {
          id: salvo.id,
          pacienteId: salvo.pacienteId,
          refeicaoId: salvo.refeicaoId,
          refeicaoNome: refeicao.nome,
          dataDia: salvo.dataDia,
          status: salvo.status,
          opcaoEscolhida: salvo.opcaoEscolhida ?? null,
          trocas: salvo.trocasJson ?? null,
          criadoEm: new Date(salvo.criadoEm).toISOString(),
          atualizadoEm: new Date(salvo.atualizadoEm).toISOString(),
        },
      },
      { status: existente ? 200 : 201 },
    );
  } catch (error: unknown) {
    console.error("[API_CHECKINS_REFEICOES_POST_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro interno ao registrar check-in da refeição.", details },
      { status: 500 },
    );
  }
}

/**
 * GET /api/checkins/refeicoes?pacienteId=...&data=YYYY-MM-DD[&historico=true&dias=30]
 * Retorna os check-ins leves do dia e, opcionalmente, histórico + resumo de constância do período.
 */
export async function GET(req: NextRequest) {
  try {
    const sessao = await getSessao();
    const sessaoRole = (sessao as { role?: string } | null)?.role;
    if (
      sessao &&
      (sessao.cargo === "SECRETARIA" ||
        sessaoRole === "SECRETARIA" ||
        sessaoRole === "RECEPTIONIST")
    ) {
      return NextResponse.json(
        {
          error: "Acesso Negado (LGPD/RBAC)",
          motivo:
            "Secretárias não possuem autorização para acessar dados clínicos de aderência alimentar.",
        },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(req.url);
    const pacienteId = (
      searchParams.get("pacienteId") ||
      req.headers.get("paciente-id") ||
      ""
    ).trim();

    if (!pacienteId) {
      return NextResponse.json(
        { error: "Parâmetro pacienteId é obrigatório." },
        { status: 400 },
      );
    }

    const dataParam = searchParams.get("data")?.trim() || "";
    const dataReferencia = ISO_DATE_RE.test(dataParam)
      ? dataParam
      : getHojeDataDia();

    const incluirHistorico = searchParams.get("historico") === "true";
    const diasParam = searchParams.get("dias");
    const parsedDias = diasParam ? parseInt(diasParam, 10) : 30;
    const dias = Number.isFinite(parsedDias)
      ? Math.min(90, Math.max(1, parsedDias))
      : 30;

    const checkinRepo = await getRepository(CheckinRefeicaoEntity);

    const checkinsDiaDb = await checkinRepo.find({
      where: {
        pacienteId,
        dataDia: dataReferencia,
      },
      relations: { refeicao: true },
      order: { criadoEm: "ASC" },
    });

    const formatCheckin = (c: (typeof checkinsDiaDb)[number]) => ({
      id: c.id,
      pacienteId: c.pacienteId,
      refeicaoId: c.refeicaoId,
      refeicaoNome: c.refeicao?.nome || null,
      dataDia: c.dataDia,
      status: c.status,
      opcaoEscolhida: c.opcaoEscolhida ?? null,
      trocas: c.trocasJson ?? null,
      criadoEm: new Date(c.criadoEm).toISOString(),
      atualizadoEm: new Date(c.atualizadoEm).toISOString(),
    });

    const checkins = checkinsDiaDb.map(formatCheckin);

    let historicoPayload: {
      dias: number;
      historico: ReturnType<typeof formatCheckin>[];
      resumo: {
        totalCheckins: number;
        seguiu: number;
        fezTroca: number;
        naoFez: number;
        percentualAdesao: number;
        diasRegistrados: number;
      };
    } | null = null;

    if (incluirHistorico) {
      const inicioIso = subtrairDiasIso(getHojeDataDia(), dias);
      const historicoDb = await checkinRepo.find({
        where: {
          pacienteId,
          dataDia: MoreThanOrEqual(inicioIso),
        },
        relations: { refeicao: true },
        order: { dataDia: "DESC", criadoEm: "DESC" },
        take: 500,
      });

      const historico = historicoDb.map(formatCheckin);
      const totalCheckins = historico.length;
      const seguiu = historico.filter((h) => h.status === "SEGUI").length;
      const fezTroca = historico.filter((h) => h.status === "FIZ_TROCA").length;
      const naoFez = historico.filter((h) => h.status === "NAO_FIZ").length;
      const diasRegistrados = new Set(historico.map((h) => h.dataDia)).size;
      const percentualAdesao =
        totalCheckins > 0
          ? Math.round(((seguiu + fezTroca) / totalCheckins) * 100)
          : 0;

      historicoPayload = {
        dias,
        historico,
        resumo: {
          totalCheckins,
          seguiu,
          fezTroca,
          naoFez,
          percentualAdesao,
          diasRegistrados,
        },
      };
    }

    return NextResponse.json(
      {
        success: true,
        dataReferencia,
        totalDia: checkins.length,
        checkins,
        ...(historicoPayload ?? {}),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error: unknown) {
    console.error("[API_CHECKINS_REFEICOES_GET_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao consultar check-ins de refeições.", details },
      { status: 500 },
    );
  }
}
