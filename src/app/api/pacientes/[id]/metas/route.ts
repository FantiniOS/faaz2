export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { IsNull, MoreThanOrEqual, Not } from "typeorm";
import {
  runWithConcurrency,
  withRepositoryRetry,
  withTransaction,
} from "@/lib/db/data-source";
import {
  CheckinHidratacaoEntity,
  CheckinRefeicaoEntity,
  CheckInSonoEntity,
  EvolucaoClinicaEntity,
  PatientEntity,
  PatientGoalEntity,
  ProntuarioPacienteEntity,
  WorkoutLogEntity,
  type CheckinHidratacao,
  type CheckinRefeicao,
  type CheckInSono,
  type EvolucaoClinica,
  type GoalCategory,
  type Patient,
  type PatientGoal,
  type ProntuarioPaciente,
  type WorkoutLog,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos } from "@/lib/auth-rbac";
import {
  getDataDiaBR,
  getIntervaloDiasBR,
  getPartesDataHoraBR,
} from "@/lib/date-br";
import {
  normalizarObjetivoClinicoValor,
  resolverObjetivoAtivo,
} from "@/lib/objetivo-clinico";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Identificadores canônicos de cada meta na tabela PATIENT_GOALS
function isSleepGoal(g: PatientGoal): boolean {
  const t = (g.title || "").toUpperCase();
  const u = (g.unit || "").toLowerCase().trim();
  return t.includes("SONO") || u === "h" || u === "horas";
}

function isHydrationGoal(g: PatientGoal): boolean {
  const t = (g.title || "").toUpperCase();
  const u = (g.unit || "").toLowerCase().trim();
  return (
    g.category === "HYDRATION" ||
    t.includes("HIDRATA") ||
    t.includes("ÁGUA") ||
    t.includes("AGUA") ||
    u === "ml"
  );
}

function isWeightGoal(g: PatientGoal): boolean {
  const t = (g.title || "").toUpperCase();
  const u = (g.unit || "").toLowerCase().trim();
  return t.includes("PESO") || u === "kg";
}

function isWorkoutCalorieGoal(g: PatientGoal): boolean {
  const t = (g.title || "").toUpperCase();
  return (
    t.includes("GASTO") ||
    t.includes("TREINO") ||
    t.includes("BÔNUS") ||
    t.includes("BONUS")
  );
}

function isDailyCalorieGoal(g: PatientGoal): boolean {
  if (
    isWorkoutCalorieGoal(g) ||
    isSleepGoal(g) ||
    isWeightGoal(g) ||
    isHydrationGoal(g)
  ) {
    return false;
  }
  const t = (g.title || "").toUpperCase();
  const u = (g.unit || "").toLowerCase().trim();
  return (
    t.includes("ALIMENTA") ||
    t.includes("CALOR") ||
    t.includes("CALÓR") ||
    t.includes("PONTO") ||
    u === "kcal" ||
    u === "pts"
  );
}

function parseFiniteNumber(val: unknown): number | undefined {
  if (val === undefined || val === null || val === "") return undefined;
  if (typeof val === "number") return Number.isFinite(val) ? val : undefined;
  const normalized = String(val).trim().replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
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
 * GET /api/pacientes/[id]/metas
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const sessao = await getSessao();

    if (sessao && !podeAcessarDadosClinicos(sessao.cargo)) {
      return NextResponse.json(
        {
          error:
            "Acesso negado. Apenas profissionais de saúde podem visualizar metas clínicas.",
        },
        { status: 403 },
      );
    }

    const { dataInicioIso: inicio30dIso, inicioUtc: inicio30dUtc } =
      getIntervaloDiasBR(30);
    const hojeIso = getDataDiaBR();

    const loaded = {
      paciente: null as Patient | null,
      prontuario: null as ProntuarioPaciente | null,
      patientGoals: [] as PatientGoal[],
      checkinsHidratacao: [] as CheckinHidratacao[],
      checkinsSono: [] as CheckInSono[],
      evolucoesComPeso: [] as EvolucaoClinica[],
      workoutLogs30d: [] as WorkoutLog[],
      checkinsRefeicoes30d: [] as CheckinRefeicao[],
    };

    // Executa em ondas de no máximo 2 queries paralelas (compatível com poolMax: 2 no Oracle ADB)
    await runWithConcurrency(
      [
        async () => {
          loaded.paciente = await withRepositoryRetry(
            PatientEntity,
            (repo) =>
              repo.findOne({
                where: { id },
                select: {
                  id: true,
                  deletedAt: true,
                  heightCm: true,
                  metaDiariaMl: true,
                  treatmentObjective: true,
                  clinicalFocus: true,
                  workoutType: true,
                  workoutFrequency: true,
                  workoutDuration: true,
                },
              }),
            { label: "metas:paciente" },
          );
        },
        async () => {
          loaded.prontuario = await withRepositoryRetry(
            ProntuarioPacienteEntity,
            (repo) => repo.findOne({ where: { pacienteId: id } }),
            { label: "metas:prontuario" },
          );
        },
        async () => {
          loaded.patientGoals = await withRepositoryRetry(
            PatientGoalEntity,
            (repo) =>
              repo.find({
                where: { patientId: id, deletedAt: IsNull() },
                order: { updatedAt: "DESC" },
              }),
            { label: "metas:goals" },
          );
        },
        async () => {
          loaded.checkinsHidratacao = await withRepositoryRetry(
            CheckinHidratacaoEntity,
            (repo) =>
              repo.find({
                where: { pacienteId: id },
                order: { data: "DESC" },
                take: 40,
              }),
            { label: "metas:hidratacao" },
          );
        },
        async () => {
          loaded.checkinsSono = await withRepositoryRetry(
            CheckInSonoEntity,
            (repo) =>
              repo.find({
                where: { pacienteId: id },
                order: { data: "DESC" },
                take: 7,
              }),
            { label: "metas:sono" },
          );
        },
        async () => {
          loaded.evolucoesComPeso = await withRepositoryRetry(
            EvolucaoClinicaEntity,
            (repo) =>
              repo.find({
                where: {
                  pacienteId: id,
                  pesoAtual: Not(IsNull()),
                },
                order: { dataAtendimento: "ASC" },
                take: 20,
              }),
            { label: "metas:evolucoes" },
          );
        },
        async () => {
          loaded.workoutLogs30d = await withRepositoryRetry(
            WorkoutLogEntity,
            (repo) =>
              repo.find({
                where: {
                  patientId: id,
                  date: MoreThanOrEqual(inicio30dUtc),
                },
                select: { id: true, date: true },
                order: { date: "DESC" },
              }),
            { label: "metas:treinos" },
          );
        },
        async () => {
          loaded.checkinsRefeicoes30d = await withRepositoryRetry(
            CheckinRefeicaoEntity,
            (repo) =>
              repo.find({
                where: {
                  pacienteId: id,
                  dataDia: MoreThanOrEqual(inicio30dIso),
                },
                select: {
                  id: true,
                  refeicaoId: true,
                  dataDia: true,
                  status: true,
                  refeicao: {
                    id: true,
                    nome: true,
                    horario: true,
                    opcional: true,
                  },
                },
                relations: { refeicao: true },
                order: { dataDia: "DESC", criadoEm: "DESC" },
              }),
            { label: "metas:refeicoes" },
          );
        },
      ],
      2,
    );

    const {
      paciente,
      prontuario,
      patientGoals,
      checkinsHidratacao,
      checkinsSono,
      evolucoesComPeso,
      workoutLogs30d,
      checkinsRefeicoes30d,
    } = loaded;

    if (!paciente || paciente.deletedAt) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    const activeGoals = patientGoals.filter((g) => g.status === "ACTIVE");

    const hidratacaoGoal = activeGoals.find(isHydrationGoal);
    const metaAguaMl = hidratacaoGoal
      ? Math.round(Number(hidratacaoGoal.targetValue))
      : paciente.metaDiariaMl
        ? Math.round(Number(paciente.metaDiariaMl))
        : 0;

    const sonoGoal = activeGoals.find(isSleepGoal);
    const metaSonoHoras = sonoGoal ? Number(sonoGoal.targetValue) : 0;

    // Retrocompatibilidade de leitura (colunas mantidas no Oracle)
    const caloriasGoal = activeGoals.find(isDailyCalorieGoal);
    const caloriasBonusGoal = activeGoals.find(isWorkoutCalorieGoal);
    const caloriasRaw = caloriasGoal ? Number(caloriasGoal.targetValue) : 0;
    const caloriasAlvoNum =
      caloriasRaw === 0
        ? 0
        : caloriasRaw > 200
          ? caloriasRaw
          : caloriasRaw * 40;
    const bonusRaw = caloriasBonusGoal
      ? Number(caloriasBonusGoal.targetValue)
      : 0;
    const caloriasBonusNum =
      bonusRaw === 0 || bonusRaw > 50 ? bonusRaw : bonusRaw * 30;

    const pesoGoal = activeGoals.find(isWeightGoal);
    const pesoAlvoKg = pesoGoal ? Number(pesoGoal.targetValue) : 0;

    const ultimoPesoEvolucao =
      evolucoesComPeso.length > 0
        ? Number(evolucoesComPeso[evolucoesComPeso.length - 1].pesoAtual)
        : 0;
    const pesoAtualNum =
      prontuario?.pesoAtualKg != null
        ? Number(prontuario.pesoAtualKg)
        : ultimoPesoEvolucao;

    const alturaM =
      prontuario?.alturaCm != null
        ? Number(prontuario.alturaCm) > 3
          ? Number(prontuario.alturaCm) / 100
          : Number(prontuario.alturaCm)
        : paciente.heightCm != null
          ? Number(paciente.heightCm) / 100
          : 0;
    const imcAtual =
      pesoAtualNum > 0 && alturaM > 0
        ? Math.round((pesoAtualNum / (alturaM * alturaM)) * 100) / 100
        : 0;

    // Consumo de água de hoje em Brasília (America/Sao_Paulo)
    const checkinsHidraHoje = checkinsHidratacao.filter(
      (c) => c.data && getDataDiaBR(new Date(c.data)) === hojeIso,
    );
    const consumoHojeMl = checkinsHidraHoje.reduce(
      (acc, c) => acc + (Number(c.volumeMl) || 0),
      0,
    );

    const diasSemanaCurto = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

    // Histórico de sono (CHECKINS_SONO)
    const ultimoRegistroSono = checkinsSono[0] || null;
    const sonoHistorico = [...checkinsSono].reverse().map((reg) => {
      const partes = getPartesDataHoraBR(new Date(reg.data));
      const dia = diasSemanaCurto[partes.weekdayIndex] || "--";
      const dataFmt = `${String(partes.day).padStart(2, "0")}/${String(
        partes.month,
      ).padStart(2, "0")}`;
      return {
        dia,
        data: dataFmt,
        horas: Number(reg.horas) || 0,
        meta: metaSonoHoras,
        qualidade: reg.qualidade || "N/A",
        sonoProfundoHoras: 0,
      };
    });

    const sonoMediaSemana =
      sonoHistorico.length > 0
        ? Math.round(
            (sonoHistorico.reduce((acc, item) => acc + item.horas, 0) /
              sonoHistorico.length) *
              10,
          ) / 10
        : 0;

    // Histórico de hidratação agrupado por dia em Brasília
    const hidraPorDiaMap = new Map<
      string,
      { dia: string; data: string; consumoMl: number; metaMl: number }
    >();
    for (const c of [...checkinsHidratacao].reverse()) {
      const partes = getPartesDataHoraBR(new Date(c.data));
      const key = `${String(partes.day).padStart(2, "0")}/${String(
        partes.month,
      ).padStart(2, "0")}`;
      const existing = hidraPorDiaMap.get(key);
      if (existing) {
        existing.consumoMl += Number(c.volumeMl) || 0;
      } else {
        hidraPorDiaMap.set(key, {
          dia: diasSemanaCurto[partes.weekdayIndex] || "--",
          data: key,
          consumoMl: Number(c.volumeMl) || 0,
          metaMl: metaAguaMl,
        });
      }
    }
    const hidratacaoHistorico = Array.from(hidraPorDiaMap.values()).slice(-7);

    // Histórico de peso (EVOLUCOES_CLINICAS / PRONTUARIOS_PACIENTES)
    const historicoPeso: Array<{ data: string; peso: number }> =
      evolucoesComPeso.map((ev) => {
        const partes = getPartesDataHoraBR(new Date(ev.dataAtendimento));
        const dia = String(partes.day).padStart(2, "0");
        const mes = String(partes.month).padStart(2, "0");
        return {
          data: `${dia}/${mes}`,
          peso: Number(ev.pesoAtual),
        };
      });

    if (pesoAtualNum > 0) {
      const ultimoHistorico = historicoPeso[historicoPeso.length - 1];
      if (!ultimoHistorico || ultimoHistorico.peso !== pesoAtualNum) {
        const refDate = prontuario?.updatedAt
          ? new Date(prontuario.updatedAt)
          : new Date();
        const partes = getPartesDataHoraBR(refDate);
        const dia = String(partes.day).padStart(2, "0");
        const mes = String(partes.month).padStart(2, "0");
        historicoPeso.push({
          data: `${dia}/${mes}`,
          peso: pesoAtualNum,
        });
      }
    }

    const pesoInicial =
      historicoPeso.length > 0 ? historicoPeso[0].peso : pesoAtualNum;
    const variacaoTotalKg =
      pesoAtualNum > 0 && pesoInicial > 0
        ? Math.round((pesoAtualNum - pesoInicial) * 10) / 10
        : 0;

    const pesoEvolucao = {
      pesoInicialKg: pesoInicial,
      pesoAtualKg: pesoAtualNum,
      pesoAlvoKg,
      perdaTotalKg: variacaoTotalKg,
      distanciaAlvoKg:
        pesoAtualNum > 0 && pesoAlvoKg > 0
          ? Math.round(Math.abs(pesoAtualNum - pesoAlvoKg) * 10) / 10
          : 0,
      imcAtual,
      historico: historicoPeso,
    };

    // =========================================================================
    // CONSTÂNCIA ALIMENTAR (DIETA · 30D) — mesma regra do Termômetro/Dashboard
    // SEGUI + FIZ_TROCA = 100%, sem penalizar refeições OPCIONAL = 1
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

    for (const c of checkinsRefeicoes30d) {
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
            100,
        ),
      );
    } else if (opcionaisConcluidos > 0) {
      percentualDieta = 100;
    }

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

    const constanciaAlimentar30d = {
      temDados: checkinsRefeicoes30d.length > 0,
      percentualAdesao: percentualDieta,
      totalCheckins: checkinsRefeicoes30d.length,
      diasRegistrados: diasComCheckinDieta.size,
      seguiu: seguiuCount,
      trocasInteligentes: fizTrocaCount,
      naoFez: naoFezCount,
      opcionaisBonus: opcionaisConcluidos,
      gargalo,
    };

    // =========================================================================
    // ADESÃO AOS TREINOS (30D) — WORKOUT_LOGS + diretriz em PATIENTS
    // =========================================================================
    const diasTreinoUnicos = new Set<string>();
    const treinosHojeLogs: typeof workoutLogs30d = [];

    for (const w of workoutLogs30d) {
      if (!w.date) continue;
      const diaIso = getDataDiaBR(new Date(w.date));
      diasTreinoUnicos.add(diaIso);
      if (diaIso === hojeIso) {
        treinosHojeLogs.push(w);
      }
    }

    const frequenciaSemanal = paciente.workoutFrequency ?? 3;
    const metaEsperada30d = Math.max(
      1,
      Math.round((frequenciaSemanal / 7) * 30),
    );
    const diasAtivos30d = diasTreinoUnicos.size;
    const percentualTreinos =
      workoutLogs30d.length > 0
        ? Math.min(100, Math.round((diasAtivos30d / metaEsperada30d) * 100))
        : 0;

    const adesaoTreinos30d = {
      temDados: workoutLogs30d.length > 0,
      percentualAdesao: percentualTreinos,
      diasAtivos: diasAtivos30d,
      metaEsperada: metaEsperada30d,
      frequenciaSemanal,
      duracaoMin: paciente.workoutDuration ?? null,
      modalidade: paciente.workoutType || null,
      totalLogs: workoutLogs30d.length,
      treinouHoje: treinosHojeLogs.length > 0,
      checkinsHojeCount: treinosHojeLogs.length,
      ultimoTreinoEm: workoutLogs30d[0]?.date
        ? new Date(workoutLogs30d[0].date).toISOString()
        : null,
    };

    // Fonte única de verdade do Objetivo do Tratamento
    const objetivoAtivo = resolverObjetivoAtivo(
      paciente.treatmentObjective,
      paciente.clinicalFocus,
      prontuario?.objetivo,
    );

    return NextResponse.json(
      {
        metas: {
          sonoHorasAlvo: metaSonoHoras,
          aguaMlAlvo: metaAguaMl,
          pesoAlvoKg,
          passosAlvo: 0,
          workoutFrequency: frequenciaSemanal,
          workoutType: paciente.workoutType || null,
          workoutDuration: paciente.workoutDuration ?? null,
          caloriasAlvo: caloriasAlvoNum,
          caloriasBonusAlvo: caloriasBonusNum,
          pontosAlvo: caloriasAlvoNum,
          pontosBonusAlvo: caloriasBonusNum,
          focoMetabolico: objetivoAtivo,
          treatmentObjective: objetivoAtivo,
        },
        sonoHistorico,
        sonoMediaSemana,
        ultimoSono: ultimoRegistroSono
          ? {
              id: ultimoRegistroSono.id,
              horas: Number(ultimoRegistroSono.horas),
              qualidade: ultimoRegistroSono.qualidade,
              observacao: ultimoRegistroSono.observacao,
              data: ultimoRegistroSono.data,
            }
          : null,
        horasDormidasRecentes: ultimoRegistroSono
          ? Number(ultimoRegistroSono.horas)
          : 0,
        hidratacaoHoje: {
          consumidoMl: consumoHojeMl,
          metaMl: metaAguaMl,
          percentual:
            metaAguaMl > 0
              ? Math.min(100, Math.round((consumoHojeMl / metaAguaMl) * 100))
              : 0,
        },
        hidratacaoHistorico,
        pesoEvolucao,
        constanciaAlimentar30d,
        adesaoTreinos30d,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error: unknown) {
    console.error("[METAS/GET] Erro:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao consultar metas do paciente.", details },
      { status: 500 },
    );
  }
}

/**
 * PUT / POST /api/pacientes/[id]/metas
 * Faz o Upsert transacional das metas clínicas ativas no Oracle Autonomous Database:
 *  1. Meta de Sono (horas/noite)              -> PATIENT_GOALS ("QUALIDADE DO SONO", unit="h")
 *  2. Meta de Água (ml/dia)                   -> PATIENTS.META_DIARIA_ML + PATIENT_GOALS ("META DE HIDRATAÇÃO DIÁRIA", category="HYDRATION")
 *  3. Peso Alvo Desejado (kg)                 -> PATIENT_GOALS ("META DE PESO CORPORAL", unit="kg")
 *  4. Frequência Semanal de Treinos (dias/sem)-> PATIENTS.WORKOUT_FREQUENCY
 *  5. Objetivo do Tratamento (string)         -> PATIENTS.TREATMENT_OBJECTIVE, PATIENTS.CLINICAL_FOCUS e PRONTUARIOS_PACIENTES.OBJETIVO (sincronizados)
 *  (Campos calóricos legados permanecem aceitos para retrocompatibilidade sem alterar schema)
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const sessao = await getSessao();

    if (sessao && !podeAcessarDadosClinicos(sessao.cargo)) {
      return NextResponse.json(
        {
          error:
            "Acesso negado. Apenas profissionais de saúde podem alterar metas clínicas.",
        },
        { status: 403 },
      );
    }

    const body = await req.json();
    const {
      sonoHorasAlvo,
      aguaMlAlvo,
      pesoAlvoKg,
      workoutFrequency,
      frequenciaTreinosSemanal,
      caloriasAlvo,
      caloriasBonusAlvo,
      pontosAlvo,
      pontosBonusAlvo,
      focoMetabolico,
      treatmentObjective,
    } = body;

    const parsedAgua = parseFiniteNumber(aguaMlAlvo);
    const parsedSono = parseFiniteNumber(sonoHorasAlvo);
    const parsedPeso = parseFiniteNumber(pesoAlvoKg);
    const parsedWorkoutFreq = parseFiniteNumber(
      workoutFrequency ?? frequenciaTreinosSemanal,
    );
    const parsedCalorias = parseFiniteNumber(caloriasAlvo ?? pontosAlvo);
    const parsedBonus = parseFiniteNumber(caloriasBonusAlvo ?? pontosBonusAlvo);

    const rawObjetivo =
      typeof treatmentObjective === "string" && treatmentObjective.trim()
        ? normalizarObjetivoClinicoValor(treatmentObjective)
        : typeof focoMetabolico === "string" && focoMetabolico.trim()
          ? normalizarObjetivoClinicoValor(focoMetabolico)
          : undefined;

    const resultado = await withTransaction(async (manager) => {
      const patientRepo = manager.getRepository(PatientEntity);
      const prontuarioRepo = manager.getRepository(ProntuarioPacienteEntity);
      const goalRepo = manager.getRepository(PatientGoalEntity);

      const paciente = await patientRepo.findOne({
        where: { id },
      });

      if (!paciente || paciente.deletedAt) {
        return null;
      }

      const [existingGoals, existingProntuario] = await Promise.all([
        goalRepo.find({
          where: { patientId: id, deletedAt: IsNull() },
          order: { updatedAt: "DESC" },
        }),
        prontuarioRepo.findOne({
          where: { pacienteId: id },
        }),
      ]);

      const prevHidra = existingGoals.find(isHydrationGoal);
      const aguaFinal =
        parsedAgua !== undefined
          ? Math.round(parsedAgua)
          : prevHidra
            ? Math.round(Number(prevHidra.targetValue))
            : paciente.metaDiariaMl || 0;

      const workoutFreqFinal =
        parsedWorkoutFreq !== undefined
          ? Math.min(7, Math.max(1, Math.round(parsedWorkoutFreq)))
          : paciente.workoutFrequency ?? 3;

      const objetivoFinal =
        rawObjetivo ||
        resolverObjetivoAtivo(
          paciente.treatmentObjective,
          paciente.clinicalFocus,
          existingProntuario?.objetivo,
        );

      // 1. Atualiza PATIENTS (META_DIARIA_ML, WORKOUT_FREQUENCY, TREATMENT_OBJECTIVE, CLINICAL_FOCUS)
      if (parsedAgua !== undefined) {
        paciente.metaDiariaMl = aguaFinal;
      }
      if (parsedWorkoutFreq !== undefined) {
        paciente.workoutFrequency = workoutFreqFinal;
      }
      if (rawObjetivo) {
        paciente.treatmentObjective = rawObjetivo;
        paciente.clinicalFocus = rawObjetivo;
      }
      if (sessao?.userId) {
        paciente.updatedBy = sessao.userId;
      }
      await patientRepo.save(paciente);

      // 2. Sincroniza PRONTUARIOS_PACIENTES.OBJETIVO na mesma transação (fonte única de verdade)
      if (rawObjetivo) {
        if (existingProntuario) {
          existingProntuario.objetivo = rawObjetivo;
          await prontuarioRepo.save(existingProntuario);
        } else {
          await prontuarioRepo.save(
            prontuarioRepo.create({
              pacienteId: id,
              objetivo: rawObjetivo,
            }),
          );
        }
      }

      const upsertGoal = async (
        matcher: (g: PatientGoal) => boolean,
        config: {
          category: GoalCategory;
          title: string;
          targetValue: number;
          unit: string;
        },
      ) => {
        const matches = existingGoals.filter(matcher);
        const primary = matches[0];

        if (primary) {
          primary.category = config.category;
          primary.title = config.title;
          primary.targetValue = config.targetValue;
          primary.unit = config.unit;
          primary.status = "ACTIVE";
          primary.isEnabledInApp = true;
          if (sessao?.userId) {
            primary.updatedBy = sessao.userId;
          }
          await goalRepo.save(primary);

          for (let i = 1; i < matches.length; i++) {
            if (matches[i].status === "ACTIVE") {
              matches[i].status = "REPLACED";
              await goalRepo.save(matches[i]);
            }
          }
          return config.targetValue;
        }

        await goalRepo.save(
          goalRepo.create({
            organizationId: paciente.organizationId,
            patientId: id,
            category: config.category,
            title: config.title,
            targetValue: config.targetValue,
            unit: config.unit,
            frequency: "DAILY",
            isEnabledInApp: true,
            status: "ACTIVE",
            createdBy: sessao?.userId ?? null,
            updatedBy: sessao?.userId ?? null,
          }),
        );
        return config.targetValue;
      };

      const prevSono = existingGoals.find(isSleepGoal);
      const prevPeso = existingGoals.find(isWeightGoal);
      const prevCalorias = existingGoals.find(isDailyCalorieGoal);
      const prevBonus = existingGoals.find(isWorkoutCalorieGoal);

      const sonoFinal =
        parsedSono !== undefined
          ? Math.round(parsedSono * 10) / 10
          : prevSono
            ? Number(prevSono.targetValue)
            : 0;

      const pesoFinal =
        parsedPeso !== undefined
          ? Math.round(parsedPeso * 10) / 10
          : prevPeso
            ? Number(prevPeso.targetValue)
            : 0;

      const caloriasRaw =
        parsedCalorias !== undefined
          ? parsedCalorias
          : prevCalorias
            ? Number(prevCalorias.targetValue)
            : 0;
      const caloriasFinal =
        caloriasRaw === 0
          ? 0
          : Math.round(caloriasRaw > 200 ? caloriasRaw : caloriasRaw * 40);

      const bonusRaw =
        parsedBonus !== undefined
          ? parsedBonus
          : prevBonus
            ? Number(prevBonus.targetValue)
            : 0;
      const bonusFinal = Math.round(
        bonusRaw === 0 || bonusRaw > 50 ? bonusRaw : bonusRaw * 30,
      );

      if (parsedAgua !== undefined) {
        await upsertGoal(isHydrationGoal, {
          category: "HYDRATION",
          title: "META DE HIDRATAÇÃO DIÁRIA",
          targetValue: aguaFinal,
          unit: "ml",
        });
      }

      if (parsedSono !== undefined) {
        await upsertGoal(isSleepGoal, {
          category: "SYMPTOM_DIARY",
          title: "QUALIDADE DO SONO",
          targetValue: sonoFinal,
          unit: "h",
        });
      }

      if (parsedPeso !== undefined) {
        await upsertGoal(isWeightGoal, {
          category: "CALORIE_BURN",
          title: "META DE PESO CORPORAL",
          targetValue: pesoFinal,
          unit: "kg",
        });
      }

      if (parsedCalorias !== undefined) {
        await upsertGoal(isDailyCalorieGoal, {
          category: "SYMPTOM_DIARY",
          title: "META CALÓRICA DIÁRIA (ALIMENTAÇÃO)",
          targetValue: caloriasFinal,
          unit: "kcal",
        });
      }

      if (parsedBonus !== undefined) {
        await upsertGoal(isWorkoutCalorieGoal, {
          category: "CALORIE_BURN",
          title: "META DE GASTO CALÓRICO (TREINO)",
          targetValue: bonusFinal,
          unit: "kcal",
        });
      }

      return {
        sonoHorasAlvo: sonoFinal,
        aguaMlAlvo: aguaFinal,
        pesoAlvoKg: pesoFinal,
        workoutFrequency: workoutFreqFinal,
        workoutType: paciente.workoutType || null,
        workoutDuration: paciente.workoutDuration ?? null,
        caloriasAlvo: caloriasFinal,
        caloriasBonusAlvo: bonusFinal,
        pontosAlvo: caloriasFinal,
        pontosBonusAlvo: bonusFinal,
        passosAlvo: 0,
        focoMetabolico: objetivoFinal,
        treatmentObjective: objetivoFinal,
      };
    });

    if (!resultado) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    try {
      revalidatePath(`/pacientes/${id}`);
      revalidatePath("/dashboard/pacientes");
      revalidatePath("/dashboard");
    } catch {
      // ignora erro de revalidação fora de contexto RSC
    }

    return NextResponse.json({
      success: true,
      message: "Metas clínicas atualizadas com sucesso!",
      metas: resultado,
    });
  } catch (error: unknown) {
    console.error("[METAS/PUT] Erro:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao atualizar metas do paciente.", details },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest, context: RouteParams) {
  return PUT(req, context);
}
