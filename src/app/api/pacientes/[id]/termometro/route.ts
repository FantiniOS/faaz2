export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IsNull, MoreThanOrEqual } from "typeorm";
import { getRepository } from "@/lib/db/data-source";
import {
  CheckinIntestinalEntity,
  CheckinRefeicaoEntity,
  MeasurementEntity,
  PatientEntity,
  RegistroGlicemiaEntity,
  WorkoutLogEntity,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos } from "@/lib/auth-rbac";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function getDataIsoSaoPaulo(date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // Fallback UTC ISO
  }
  return date.toISOString().slice(0, 10);
}

function subtrairDiasIso(baseIso: string, dias: number): string {
  const [y, m, d] = baseIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dias);
  return dt.toISOString().slice(0, 10);
}

function round1(valor: number): number {
  return Math.round(valor * 10) / 10;
}

type PadraoIntestinal = "ideal" | "constipacao" | "diarreia";

function normalizarCategoriaBristol(
  categoria?: string | null,
  tipoBristol?: number | null
): PadraoIntestinal {
  const norm = (categoria || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (norm === "constipacao" || norm.includes("constip")) return "constipacao";
  if (norm === "diarreia" || norm.includes("diarr") || norm.includes("aceler")) {
    return "diarreia";
  }
  if (norm === "ideal" || norm.includes("normal")) return "ideal";

  const tipo = Number(tipoBristol) || 4;
  if (tipo <= 2) return "constipacao";
  if (tipo <= 4) return "ideal";
  return "diarreia";
}

function rotuloPadraoIntestinal(padrao: PadraoIntestinal | null): string | null {
  if (padrao === "ideal") return "Padrão ideal";
  if (padrao === "constipacao") return "Constipação";
  if (padrao === "diarreia") return "Diarreia / acelerado";
  return null;
}

function formatHorarioCurto(horario?: string | null): string | null {
  if (!horario) return null;
  const match = horario.match(/(\d{1,2})\s*[:hH]\s*(\d{2})/);
  if (match) {
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  }
  const limpo = horario.trim();
  return limpo.length > 0 ? limpo : null;
}

/**
 * GET /api/pacientes/[id]/termometro?dias=30
 * Consolida o Termômetro Executivo de 10 segundos no Prontuário Web (RBAC clínico).
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const sessao = await getSessao(req);
    if (!sessao) {
      return NextResponse.json(
        { error: "Não autenticado. Faça login clínico para acessar." },
        { status: 401 }
      );
    }

    const sessaoRole = (sessao as { role?: string }).role;
    if (
      !podeAcessarDadosClinicos(sessao.cargo) ||
      sessao.cargo === "SECRETARIA" ||
      sessaoRole === "SECRETARIA" ||
      sessaoRole === "RECEPTIONIST"
    ) {
      return NextResponse.json(
        {
          error: "Acesso negado (LGPD/RBAC).",
          motivo:
            "O Termômetro Executivo contém dados clínicos sensíveis restritos ao corpo médico.",
        },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const diasParam = searchParams.get("dias");
    const parsedDias = diasParam ? parseInt(diasParam, 10) : 30;
    const dias = Number.isFinite(parsedDias)
      ? Math.min(90, Math.max(7, parsedDias))
      : 30;

    const [
      patientRepo,
      checkinRefeicaoRepo,
      glicemiaRepo,
      intestinoRepo,
      workoutRepo,
      measurementRepo,
    ] = await Promise.all([
      getRepository(PatientEntity),
      getRepository(CheckinRefeicaoEntity),
      getRepository(RegistroGlicemiaEntity),
      getRepository(CheckinIntestinalEntity),
      getRepository(WorkoutLogEntity),
      getRepository(MeasurementEntity),
    ]);

    const paciente = await patientRepo.findOne({
      where: { id, deletedAt: IsNull() },
      select: {
        id: true,
        fullName: true,
        workoutType: true,
        workoutFrequency: true,
        workoutDuration: true,
      },
    });

    if (!paciente) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 }
      );
    }

    const hojeIso = getDataIsoSaoPaulo();
    const inicioIso = subtrairDiasIso(hojeIso, dias - 1);

    const inicioDate = new Date();
    inicioDate.setDate(inicioDate.getDate() - dias);
    inicioDate.setHours(0, 0, 0, 0);

    const [
      checkinsRefeicoes,
      registrosGlicemia,
      checkinsIntestinais,
      workoutLogs,
      measurements,
    ] = await Promise.all([
      checkinRefeicaoRepo.find({
        where: {
          pacienteId: id,
          dataDia: MoreThanOrEqual(inicioIso),
        },
        relations: { refeicao: true },
        order: { dataDia: "DESC", criadoEm: "DESC" },
      }),
      glicemiaRepo.find({
        where: {
          pacienteId: id,
          dataRegistro: MoreThanOrEqual(inicioDate),
        },
        order: { dataRegistro: "DESC" },
      }),
      intestinoRepo.find({
        where: {
          pacienteId: id,
          data: MoreThanOrEqual(inicioDate),
        },
        order: { data: "DESC" },
      }),
      workoutRepo.find({
        where: {
          patientId: id,
          date: MoreThanOrEqual(inicioDate),
        },
        order: { date: "DESC" },
      }),
      measurementRepo.find({
        where: { patientId: id },
        order: { measuredAt: "DESC", createdAt: "DESC" },
        take: 20,
      }),
    ]);

    // =========================================================================
    // 1. CONSISTÊNCIA ALIMENTAR (CHECKINS_REFEICOES + REFEICOES)
    // =========================================================================
    let obrigatoriosTotal = 0;
    let obrigatoriosAderentes = 0;
    let opcionaisConcluidos = 0;
    let seguiuCount = 0;
    let fizTrocaCount = 0;
    let naoFezCount = 0;
    const diasComCheckinDieta = new Set<string>();

    const porRefeicaoObrigatoria = new Map<
      string,
      {
        refeicaoId: string;
        nome: string;
        horario: string | null;
        total: number;
        naoFez: number;
        aderentes: number;
      }
    >();

    for (const c of checkinsRefeicoes) {
      if (c.dataDia) diasComCheckinDieta.add(c.dataDia);
      const isOpcional = Boolean(c.refeicao?.opcional);
      const isAderente = c.status === "SEGUI" || c.status === "FIZ_TROCA";

      if (c.status === "SEGUI") seguiuCount += 1;
      else if (c.status === "FIZ_TROCA") fizTrocaCount += 1;
      else if (c.status === "NAO_FIZ") naoFezCount += 1;

      if (isOpcional) {
        if (isAderente) opcionaisConcluidos += 1;
      } else {
        obrigatoriosTotal += 1;
        if (isAderente) obrigatoriosAderentes += 1;

        const key = c.refeicaoId;
        const atual = porRefeicaoObrigatoria.get(key) || {
          refeicaoId: c.refeicaoId,
          nome: c.refeicao?.nome || "Refeição",
          horario: formatHorarioCurto(c.refeicao?.horario),
          total: 0,
          naoFez: 0,
          aderentes: 0,
        };
        atual.total += 1;
        if (c.status === "NAO_FIZ") atual.naoFez += 1;
        if (isAderente) atual.aderentes += 1;
        porRefeicaoObrigatoria.set(key, atual);
      }
    }

    let percentualDieta: number | null = null;
    if (obrigatoriosTotal > 0) {
      percentualDieta = Math.min(
        100,
        Math.round(
          ((obrigatoriosAderentes + opcionaisConcluidos) / obrigatoriosTotal) *
            100
        )
      );
    } else if (opcionaisConcluidos > 0) {
      percentualDieta = 100;
    }

    // Gargalo: refeição não-opcional com maior proporção de NAO_FIZ (ou menor adesão com falhas)
    let gargalo: {
      refeicaoId: string;
      nome: string;
      horario: string | null;
      label: string;
      totalRegistros: number;
      naoFez: number;
      percentualNaoFez: number;
      percentualAdesao: number;
    } | null = null;

    for (const stats of porRefeicaoObrigatoria.values()) {
      if (stats.naoFez <= 0) continue;
      const propNaoFez: number = stats.naoFez / stats.total;
      const melhorProp: number = gargalo
        ? gargalo.naoFez / gargalo.totalRegistros
        : -1;

      if (
        !gargalo ||
        propNaoFez > melhorProp ||
        (propNaoFez === melhorProp && stats.naoFez > gargalo.naoFez)
      ) {
        gargalo = {
          refeicaoId: stats.refeicaoId,
          nome: stats.nome,
          horario: stats.horario,
          label: stats.horario ? `${stats.nome} ${stats.horario}` : stats.nome,
          totalRegistros: stats.total,
          naoFez: stats.naoFez,
          percentualNaoFez: Math.round(propNaoFez * 100),
          percentualAdesao: Math.round((stats.aderentes / stats.total) * 100),
        };
      }
    }

    const dieta = {
      temDados: checkinsRefeicoes.length > 0,
      percentualAdesao: percentualDieta,
      totalCheckins: checkinsRefeicoes.length,
      diasRegistrados: diasComCheckinDieta.size,
      seguiu: seguiuCount,
      trocasInteligentes: fizTrocaCount,
      naoFez: naoFezCount,
      opcionaisBonus: opcionaisConcluidos,
      gargalo,
    };

    // =========================================================================
    // 2. RESUMO GLICÊMICO (REGISTROS_GLICEMIA)
    // =========================================================================
    const totalGlicemia = registrosGlicemia.length;
    let somaGlicemia = 0;
    let dentroDaMeta = 0;
    let episodiosHipo = 0;
    let episodiosHiper = 0;

    for (const reg of registrosGlicemia) {
      const val = Number(reg.valor) || 0;
      somaGlicemia += val;
      if (val < 70) {
        episodiosHipo += 1;
      } else if (val > 180) {
        episodiosHiper += 1;
      } else {
        dentroDaMeta += 1;
      }
    }

    const glicemia = {
      temDados: totalGlicemia > 0,
      mediaMgDl: totalGlicemia > 0 ? Math.round(somaGlicemia / totalGlicemia) : null,
      totalMedicoes: totalGlicemia,
      dentroDaMeta,
      percentualNaMeta:
        totalGlicemia > 0
          ? Math.round((dentroDaMeta / totalGlicemia) * 100)
          : null,
      episodiosHipo,
      episodiosHiper,
      alertasForaDaFaixa: episodiosHipo + episodiosHiper,
    };

    // =========================================================================
    // 3. PADRÃO INTESTINAL (CHECKINS_INTESTINAIS)
    // =========================================================================
    const contagemIntestino: Record<PadraoIntestinal, number> = {
      ideal: 0,
      constipacao: 0,
      diarreia: 0,
    };
    const contagemSintomas = new Map<string, number>();

    for (const c of checkinsIntestinais) {
      const cat = normalizarCategoriaBristol(c.categoria, c.tipoBristol);
      contagemIntestino[cat] += 1;

      const sintomasArr = Array.isArray(c.sintomas) ? c.sintomas : [];
      for (const s of sintomasArr) {
        const limpo = String(s || "").trim();
        const lower = limpo.toLowerCase();
        if (
          !limpo ||
          lower === "nenhum" ||
          lower === "nenhuma" ||
          lower === "sem sintomas"
        ) {
          continue;
        }
        contagemSintomas.set(limpo, (contagemSintomas.get(limpo) || 0) + 1);
      }
    }

    let padraoPredominante: PadraoIntestinal | null = null;
    if (checkinsIntestinais.length > 0) {
      const ordenado = (
        Object.entries(contagemIntestino) as Array<[PadraoIntestinal, number]>
      ).sort((a, b) => b[1] - a[1]);
      if (ordenado[0] && ordenado[0][1] > 0) {
        padraoPredominante = ordenado[0][0];
      }
    }

    const sintomasFrequentes = Array.from(contagemSintomas.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
      .slice(0, 2)
      .map(([nome, ocorrencias]) => ({ nome, ocorrencias }));

    const intestino = {
      temDados: checkinsIntestinais.length > 0,
      padraoPredominante,
      padraoLabel: rotuloPadraoIntestinal(padraoPredominante),
      totalRegistros: checkinsIntestinais.length,
      distribuicao: contagemIntestino,
      sintomasFrequentes,
    };

    // =========================================================================
    // 4. ADESÃO A TREINOS (WORKOUT_LOGS + PATIENTS)
    // =========================================================================
    const diasTreinoUnicos = new Set<string>();
    for (const log of workoutLogs) {
      if (log.date) {
        diasTreinoUnicos.add(getDataIsoSaoPaulo(new Date(log.date)));
      }
    }

    const frequenciaSemanal = paciente.workoutFrequency ?? 3;
    const metaEsperada = Math.max(
      1,
      Math.round((frequenciaSemanal / 7) * dias)
    );
    const diasAtivos = diasTreinoUnicos.size;
    const percentualTreinos =
      workoutLogs.length > 0
        ? Math.min(100, Math.round((diasAtivos / metaEsperada) * 100))
        : null;

    const treinos = {
      temDados: workoutLogs.length > 0,
      percentualAdesao: percentualTreinos,
      diasAtivos,
      metaEsperada,
      frequenciaSemanal,
      totalLogs: workoutLogs.length,
      modalidade: paciente.workoutType || null,
    };

    // =========================================================================
    // 5. EVOLUÇÃO DE MEDIDAS (MEASUREMENTS)
    // =========================================================================
    const comCintura = measurements.filter(
      (m) => m.waist !== null && m.waist !== undefined
    );
    const comAbdomen = measurements.filter(
      (m) => m.abdomen !== null && m.abdomen !== undefined
    );

    const ultimaCinturaCm =
      comCintura.length >= 1 ? round1(Number(comCintura[0].waist)) : null;
    const penultimaCinturaCm =
      comCintura.length >= 2 ? round1(Number(comCintura[1].waist)) : null;
    const variacaoCinturaCm =
      ultimaCinturaCm !== null && penultimaCinturaCm !== null
        ? round1(ultimaCinturaCm - penultimaCinturaCm)
        : null;

    const ultimoAbdomenCm =
      comAbdomen.length >= 1 ? round1(Number(comAbdomen[0].abdomen)) : null;
    const penultimoAbdomenCm =
      comAbdomen.length >= 2 ? round1(Number(comAbdomen[1].abdomen)) : null;
    const variacaoAbdomenCm =
      ultimoAbdomenCm !== null && penultimoAbdomenCm !== null
        ? round1(ultimoAbdomenCm - penultimoAbdomenCm)
        : null;

    const temDadosMedidas =
      ultimaCinturaCm !== null || ultimoAbdomenCm !== null;

    const medidas = {
      temDados: temDadosMedidas,
      totalRegistros: measurements.length,
      temComparativo:
        variacaoCinturaCm !== null || variacaoAbdomenCm !== null,
      ultimaAfericaoEm: measurements[0]?.measuredAt
        ? new Date(measurements[0].measuredAt).toISOString()
        : null,
      cintura: {
        atualCm: ultimaCinturaCm,
        anteriorCm: penultimaCinturaCm,
        variacaoCm: variacaoCinturaCm,
      },
      abdomen: {
        atualCm: ultimoAbdomenCm,
        anteriorCm: penultimoAbdomenCm,
        variacaoCm: variacaoAbdomenCm,
      },
    };

    return NextResponse.json({
      success: true,
      periodoDias: dias,
      pacienteId: id,
      geradoEm: new Date().toISOString(),
      dieta,
      glicemia,
      intestino,
      treinos,
      medidas,
    });
  } catch (error: unknown) {
    console.error("[API_PACIENTES_TERMOMETRO_GET_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Erro interno ao consolidar Termômetro Executivo do paciente.",
        details,
      },
      { status: 500 }
    );
  }
}
