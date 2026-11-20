export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IsNull, MoreThanOrEqual } from "typeorm";
import { getDataSource, withOracleRetry } from "@/lib/db/data-source";
import {
  AgendamentoEntity,
  BiometricMeasurementEntity,
  CheckinHidratacaoEntity,
  CheckinIntestinalEntity,
  CheckinRefeicaoEntity,
  CheckInSonoEntity,
  EvolucaoClinicaEntity,
  MeasurementEntity,
  PatientEntity,
  PatientGoalEntity,
  RegistroGlicemiaEntity,
  WorkoutLogEntity,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos } from "@/lib/auth-rbac";
import {
  adicionarDiasDataBR,
  getInicioFimDiaBR,
  getInicioMesBR,
  getIntervaloDiasBR,
  getPartesDataHoraBR,
  subtrairDiasDataBR,
} from "@/lib/date-br";
import {
  classificarObjetivoClinico,
  resolverObjetivoAtivo,
} from "@/lib/objetivo-clinico";
import type {
  ConsultaProximaItem,
  DetalheDietaPaciente,
  DetalheEmagrecimentoPaciente,
  DetalheGlicemiaPaciente,
  DetalheHidratacaoPaciente,
  DetalheHipertrofiaPaciente,
  DetalheIntestinoPaciente,
  DetalheTreinoPaciente,
  LiveFeedItem,
  PacienteGlicemiaCritica,
  PeriodoTelemetria,
  PilarIndiceItem,
  PontoSerieAtividade,
  RadarTriagemItem,
  SparklineGlicemiaItem,
  TelemetriaDashboardResponse,
} from "@/types/dashboard-telemetria";

function isIsoDateValid(val?: string | null): val is string {
  return typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val.trim());
}

function parseDateSafe(raw: unknown): Date | null {
  if (raw == null) return null;
  const d = raw instanceof Date ? raw : new Date(raw as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoSafe(raw: unknown, fallback?: Date): string | null {
  const d = parseDateSafe(raw) ?? (fallback ? parseDateSafe(fallback) : null);
  return d ? d.toISOString() : null;
}

/**
 * Executa tarefas assíncronas com concorrência limitada para não saturar o pool
 * do Oracle ADB (30 sessões globais em Always Free).
 */
async function runWithConcurrency(
  tasks: Array<() => Promise<void>>,
  concurrency: number
): Promise<void> {
  const limit = Math.max(1, Math.min(concurrency, tasks.length || 1));
  let cursor = 0;

  const worker = async () => {
    while (cursor < tasks.length) {
      const idx = cursor;
      cursor += 1;
      await tasks[idx]();
    }
  };

  await Promise.all(Array.from({ length: limit }, () => worker()));
}

function formatDiaLabelPt(isoDate: string): string {
  if (!isIsoDateValid(isoDate)) return isoDate || "--/--";
  const [, m, d] = isoDate.split("-");
  return `${d}/${m}`;
}

function round1(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round(val * 10) / 10;
}

function normalizarTexto(val?: string | null): string {
  return (val || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function classificarObjetivoPaciente(
  treatmentObjective?: string | null,
  clinicalFocus?: string | null,
  prontuarioObjetivo?: string | null
): "HIPERTROFIA" | "EMAGRECIMENTO" | "MANUTENCAO" {
  // Prioriza PATIENTS.TREATMENT_OBJECTIVE -> CLINICAL_FOCUS -> PRONTUARIOS_PACIENTES.OBJETIVO
  // sem concatenar strings antigas em conflito
  return classificarObjetivoClinico(
    treatmentObjective,
    clinicalFocus,
    prontuarioObjetivo
  );
}

function normalizarCategoriaBristol(
  categoria?: string | null,
  tipoBristol?: number | null
): "ideal" | "constipacao" | "diarreia" {
  const norm = normalizarTexto(categoria);
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

function formatMomentoGlicemia(momento?: string | null): string {
  const m = (momento || "").toUpperCase().trim();
  const mapa: Record<string, string> = {
    JEJUM: "Jejum",
    PRE_CAFE: "Pré-café",
    POS_CAFE: "Pós-café",
    PRE_ALMOCO: "Pré-almoço",
    POS_ALMOCO: "Pós-almoço",
    PRE_JANTAR: "Pré-jantar",
    POS_JANTAR: "Pós-jantar",
    ANTES_DORMIR: "Antes de dormir",
    AO_ACORDAR: "Ao acordar",
    ALEATORIO: "Aleatório",
  };
  return mapa[m] || (momento ? momento.replace(/_/g, " ") : "Glicemia");
}

function formatHorarioCurto(horario?: string | null): string | null {
  if (!horario) return null;
  const match = horario.match(/(\d{1,2})\s*[:hH]\s*(\d{2})/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
  const limpo = horario.trim();
  return limpo.length > 0 ? limpo : null;
}

function parsePeriodo(raw?: string | null): PeriodoTelemetria {
  const v = (raw || "30d").trim().toLowerCase();
  if (v === "hoje" || v === "7d" || v === "30d" || v === "mes") {
    return v;
  }
  return "30d";
}

function resolverJanelaPeriodo(periodo: PeriodoTelemetria, agora: Date) {
  const hoje = getInicioFimDiaBR(agora);
  const hojeIso = hoje.dataDia;

  if (periodo === "hoje") {
    const ontemIso = subtrairDiasDataBR(hojeIso, 1);
    return {
      periodoLabel: "Hoje",
      diasJanela: 1,
      hojeIso,
      inicioAtualIso: hojeIso,
      inicioAtualDate: hoje.inicioUtc,
      inicioAnteriorIso: ontemIso,
      inicioAnteriorDate: getInicioFimDiaBR(ontemIso).inicioUtc,
    };
  }

  if (periodo === "7d") {
    const intervalo = getIntervaloDiasBR(7, agora);
    const inicioAnteriorIso = subtrairDiasDataBR(intervalo.dataInicioIso, 7);
    return {
      periodoLabel: "Últimos 7 dias",
      diasJanela: 7,
      hojeIso,
      inicioAtualIso: intervalo.dataInicioIso,
      inicioAtualDate: intervalo.inicioUtc,
      inicioAnteriorIso,
      inicioAnteriorDate: getInicioFimDiaBR(inicioAnteriorIso).inicioUtc,
    };
  }

  if (periodo === "mes") {
    const mes = getInicioMesBR(agora);
    return {
      periodoLabel: "Mês atual",
      diasJanela: mes.diasDecorridos,
      hojeIso,
      inicioAtualIso: mes.dataInicioIso,
      inicioAtualDate: mes.inicioUtc,
      inicioAnteriorIso: mes.dataMesAnteriorIso,
      inicioAnteriorDate: mes.inicioMesAnteriorUtc,
    };
  }

  // Padrão: 30d
  const intervalo = getIntervaloDiasBR(30, agora);
  const inicioAnteriorIso = subtrairDiasDataBR(intervalo.dataInicioIso, 30);
  return {
    periodoLabel: "Últimos 30 dias",
    diasJanela: 30,
    hojeIso,
    inicioAtualIso: intervalo.dataInicioIso,
    inicioAtualDate: intervalo.inicioUtc,
    inicioAnteriorIso,
    inicioAnteriorDate: getInicioFimDiaBR(inicioAnteriorIso).inicioUtc,
  };
}

/**
 * GET /api/dashboard/telemetria?periodo=30d
 * Endpoint unificado de telemetria 100% real do Oracle ADB para o Clinical Command Center.
 */
export async function GET(req: NextRequest) {
  const reqStart = performance.now();
  try {
    const sessao = await getSessao(req);
    if (!sessao) {
      return NextResponse.json(
        { error: "Não autenticado. Faça login clínico para acessar a telemetria." },
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
          error: "Acesso Negado (LGPD/RBAC).",
          motivo:
            "A telemetria clínica do Command Center é restrita ao corpo médico.",
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const periodo = parsePeriodo(searchParams.get("periodo"));
    const agora = new Date();
    const janela = resolverJanelaPeriodo(periodo, agora);

    // Garante leitura mínima de 7 dias para o Radar de Evasão (7+ dias sem check-in)
    const seteDias = getIntervaloDiasBR(7, agora);
    const seteDiasAtrasIso = seteDias.dataInicioIso;
    const seteDiasAtrasDate = seteDias.inicioUtc;

    const queryStartIso =
      janela.inicioAtualIso < seteDiasAtrasIso
        ? janela.inicioAtualIso
        : seteDiasAtrasIso;
    const queryStartDate =
      janela.inicioAtualDate < seteDiasAtrasDate
        ? janela.inicioAtualDate
        : seteDiasAtrasDate;

    const inicioHojeDate = getInicioFimDiaBR(janela.hojeIso).inicioUtc;
    const fimHojeDate = getInicioFimDiaBR(
      adicionarDiasDataBR(janela.hojeIso, 1)
    ).inicioUtc;
    const fimProximos7DiasDate = getInicioFimDiaBR(
      adicionarDiasDataBR(janela.hojeIso, 8)
    ).inicioUtc;

    const ds = await withOracleRetry(() => getDataSource(), {
      label: "telemetria:dataSource",
    });

    const patientRepo = ds.getRepository(PatientEntity);
    const agendamentoRepo = ds.getRepository(AgendamentoEntity);
    const checkinRefeicaoRepo = ds.getRepository(CheckinRefeicaoEntity);
    const glicemiaRepo = ds.getRepository(RegistroGlicemiaEntity);
    const intestinoRepo = ds.getRepository(CheckinIntestinalEntity);
    const hidraRepo = ds.getRepository(CheckinHidratacaoEntity);
    const workoutRepo = ds.getRepository(WorkoutLogEntity);
    const sonoRepo = ds.getRepository(CheckInSonoEntity);
    const goalRepo = ds.getRepository(PatientGoalEntity);
    const bioRepo = ds.getRepository(BiometricMeasurementEntity);
    const evolucaoRepo = ds.getRepository(EvolucaoClinicaEntity);
    const measurementRepo = ds.getRepository(MeasurementEntity);

    const dbStart = performance.now();
    const modulosComErro: string[] = [];

    const carregarModulo = async <T>(
      modulo: string,
      queryFn: () => Promise<T>,
      fallback: T
    ): Promise<T> => {
      try {
        return await withOracleRetry(queryFn, {
          label: `telemetria:${modulo}`,
        });
      } catch (err: unknown) {
        modulosComErro.push(modulo);
        console.error(`[telemetria] erro no modulo ${modulo}:`, err);
        return fallback;
      }
    };

    // Consulta base obrigatória (pacientes ativos) com retry único em erro transitório Oracle
    let pacientesAtivos: Awaited<ReturnType<typeof patientRepo.find>>;
    try {
      pacientesAtivos = await withOracleRetry(
        () =>
          patientRepo.find({
            where: { patientStatus: "ACTIVE", deletedAt: IsNull() },
            select: {
              id: true,
              recordCode: true,
              fullName: true,
              cpf: true,
              phoneWhatsapp: true,
              treatmentObjective: true,
              clinicalFocus: true,
              workoutType: true,
              workoutFrequency: true,
              metaDiariaMl: true,
              prontuario: {
                id: true,
                objetivo: true,
                pesoAtualKg: true,
              },
            },
            relations: { prontuario: true },
            order: { fullName: "ASC" },
          }),
        { label: "telemetria:pacientesAtivos" }
      );
    } catch (err: unknown) {
      console.error("[telemetria] erro no modulo pacientesAtivos:", err);
      throw err;
    }

    let agendamentosFuturos: Awaited<ReturnType<typeof agendamentoRepo.find>> = [];
    let checkinsRefeicoesRaw: Awaited<ReturnType<typeof checkinRefeicaoRepo.find>> = [];
    let glicemiasRaw: Awaited<ReturnType<typeof glicemiaRepo.find>> = [];
    let intestinosRaw: Awaited<ReturnType<typeof intestinoRepo.find>> = [];
    let hidratacoesRaw: Awaited<ReturnType<typeof hidraRepo.find>> = [];
    let workoutsRaw: Awaited<ReturnType<typeof workoutRepo.find>> = [];
    let sonos7dRaw: Awaited<ReturnType<typeof sonoRepo.find>> = [];
    let activeGoals: Awaited<ReturnType<typeof goalRepo.find>> = [];
    let biometriasRaw: Awaited<ReturnType<typeof bioRepo.find>> = [];
    let evolucoesRaw: Awaited<ReturnType<typeof evolucaoRepo.find>> = [];
    let measurementsRaw: Awaited<ReturnType<typeof measurementRepo.find>> = [];

    // Executa os 11 módulos secundários com concorrência controlada (=2, alinhada ao
    // poolMax Serverless) e isolamento de falhas por módulo para nunca derrubar o Dashboard.
    await runWithConcurrency(
      [
        async () => {
          agendamentosFuturos = await carregarModulo(
            "agendamentosFuturos",
            () =>
              agendamentoRepo.find({
                where: { dataHora: MoreThanOrEqual(inicioHojeDate) },
                select: {
                  id: true,
                  dataHora: true,
                  tipo: true,
                  status: true,
                  especialidade: true,
                  pacienteId: true,
                  paciente: {
                    id: true,
                    fullName: true,
                    recordCode: true,
                  },
                  medico: {
                    id: true,
                    nome: true,
                  },
                },
                relations: { paciente: true, medico: true },
                order: { dataHora: "ASC" },
                take: 40,
              }),
            []
          );
        },
        async () => {
          checkinsRefeicoesRaw = await carregarModulo(
            "checkinsRefeicoes",
            () =>
              checkinRefeicaoRepo.find({
                where: { dataDia: MoreThanOrEqual(queryStartIso) },
                select: {
                  id: true,
                  pacienteId: true,
                  refeicaoId: true,
                  dataDia: true,
                  status: true,
                  criadoEm: true,
                  atualizadoEm: true,
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
            []
          );
        },
        async () => {
          glicemiasRaw = await carregarModulo(
            "glicemias",
            () =>
              glicemiaRepo.find({
                where: { dataRegistro: MoreThanOrEqual(queryStartDate) },
                select: {
                  id: true,
                  pacienteId: true,
                  dataRegistro: true,
                  valor: true,
                  momento: true,
                },
                order: { dataRegistro: "DESC" },
              }),
            []
          );
        },
        async () => {
          intestinosRaw = await carregarModulo(
            "intestinos",
            () =>
              intestinoRepo.find({
                where: { data: MoreThanOrEqual(queryStartDate) },
                select: {
                  id: true,
                  pacienteId: true,
                  tipoBristol: true,
                  categoria: true,
                  sintomas: true,
                  data: true,
                },
                order: { data: "DESC" },
              }),
            []
          );
        },
        async () => {
          hidratacoesRaw = await carregarModulo(
            "hidratacoes",
            () =>
              hidraRepo.find({
                where: { data: MoreThanOrEqual(queryStartDate) },
                select: {
                  id: true,
                  pacienteId: true,
                  volumeMl: true,
                  data: true,
                },
                order: { data: "DESC" },
              }),
            []
          );
        },
        async () => {
          workoutsRaw = await carregarModulo(
            "workouts",
            () =>
              workoutRepo.find({
                where: { date: MoreThanOrEqual(queryStartDate) },
                select: {
                  id: true,
                  patientId: true,
                  date: true,
                },
                order: { date: "DESC" },
              }),
            []
          );
        },
        async () => {
          sonos7dRaw = await carregarModulo(
            "sonos7d",
            () =>
              sonoRepo.find({
                where: { data: MoreThanOrEqual(seteDiasAtrasDate) },
                select: {
                  pacienteId: true,
                  data: true,
                },
                order: { data: "DESC" },
              }),
            []
          );
        },
        async () => {
          activeGoals = await carregarModulo(
            "activeGoals",
            () =>
              goalRepo.find({
                where: { status: "ACTIVE", deletedAt: IsNull() },
                select: {
                  patientId: true,
                  category: true,
                  title: true,
                  unit: true,
                  targetValue: true,
                },
              }),
            []
          );
        },
        async () => {
          biometriasRaw = await carregarModulo(
            "biometrias",
            () =>
              bioRepo.find({
                select: {
                  id: true,
                  patientId: true,
                  measuredAt: true,
                  createdAt: true,
                  weightKg: true,
                  bmi: true,
                },
                order: { measuredAt: "DESC", createdAt: "DESC" },
                take: 600,
              }),
            []
          );
        },
        async () => {
          evolucoesRaw = await carregarModulo(
            "evolucoes",
            () =>
              evolucaoRepo.find({
                select: {
                  id: true,
                  pacienteId: true,
                  dataAtendimento: true,
                  createdAt: true,
                  pesoAtual: true,
                  medicoResponsavel: true,
                },
                order: { dataAtendimento: "DESC", createdAt: "DESC" },
                take: 600,
              }),
            []
          );
        },
        async () => {
          measurementsRaw = await carregarModulo(
            "measurements",
            () =>
              measurementRepo.find({
                select: {
                  id: true,
                  patientId: true,
                  measuredAt: true,
                  createdAt: true,
                  waist: true,
                  abdomen: true,
                  hips: true,
                  rightArm: true,
                  leftArm: true,
                  rightThigh: true,
                  leftThigh: true,
                },
                order: { measuredAt: "DESC", createdAt: "DESC" },
                take: 400,
              }),
            []
          );
        },
      ],
      2
    );

    if (modulosComErro.length > 0) {
      console.warn(
        `[telemetria] consolidacao concluida com fallback parcial nos modulos: ${modulosComErro.join(", ")}`
      );
    }

    const dbDurMs = Math.round(performance.now() - dbStart);

    // Índice rápido de pacientes ativos
    const pacienteMap = new Map(pacientesAtivos.map((p) => [p.id, p]));
    const activePatientIds = new Set(pacientesAtivos.map((p) => p.id));

    // Metas hídricas individuais (PATIENT_GOALS HYDRATION > PATIENTS.META_DIARIA_ML)
    const hidraGoalByPatient = new Map<string, number>();
    for (const g of activeGoals) {
      const t = (g.title || "").toUpperCase();
      const u = (g.unit || "").toLowerCase().trim();
      if (
        g.category === "HYDRATION" ||
        t.includes("HIDRATA") ||
        t.includes("ÁGUA") ||
        t.includes("AGUA") ||
        u === "ml"
      ) {
        const target = Number(g.targetValue);
        if (
          g.patientId &&
          !hidraGoalByPatient.has(g.patientId) &&
          Number.isFinite(target) &&
          target > 0
        ) {
          hidraGoalByPatient.set(g.patientId, Math.round(target));
        }
      }
    }

    const getMetaAguaPaciente = (pacienteId: string) => {
      const fromGoal = hidraGoalByPatient.get(pacienteId);
      if (fromGoal && fromGoal > 0) return fromGoal;
      const p = pacienteMap.get(pacienteId);
      const rawMeta = Number(p?.metaDiariaMl);
      return Number.isFinite(rawMeta) && rawMeta > 0 ? rawMeta : 2500;
    };

    // Filtragem estrita para o período selecionado (somente pacientes ativos e datas válidas)
    const checkinsRefeicoes = checkinsRefeicoesRaw.filter(
      (c) =>
        Boolean(c.pacienteId) &&
        activePatientIds.has(c.pacienteId) &&
        isIsoDateValid(c.dataDia) &&
        c.dataDia >= janela.inicioAtualIso
    );
    const glicemias = glicemiasRaw.filter((g) => {
      const dt = parseDateSafe(g.dataRegistro);
      return (
        Boolean(g.pacienteId) &&
        activePatientIds.has(g.pacienteId) &&
        dt !== null &&
        dt >= janela.inicioAtualDate
      );
    });
    const intestinos = intestinosRaw.filter((i) => {
      const dt = parseDateSafe(i.data);
      return (
        Boolean(i.pacienteId) &&
        activePatientIds.has(i.pacienteId) &&
        dt !== null &&
        dt >= janela.inicioAtualDate
      );
    });
    const hidratacoes = hidratacoesRaw.filter((h) => {
      const dt = parseDateSafe(h.data);
      return (
        Boolean(h.pacienteId) &&
        activePatientIds.has(h.pacienteId) &&
        dt !== null &&
        dt >= janela.inicioAtualDate
      );
    });
    const workouts = workoutsRaw.filter((w) => {
      const dt = parseDateSafe(w.date);
      return (
        Boolean(w.patientId) &&
        activePatientIds.has(w.patientId) &&
        dt !== null &&
        dt >= janela.inicioAtualDate
      );
    });
    const biometriasNoPeriodo = biometriasRaw.filter((b) => {
      const dt = parseDateSafe(b.measuredAt);
      return (
        Boolean(b.patientId) &&
        activePatientIds.has(b.patientId) &&
        dt !== null &&
        dt >= janela.inicioAtualDate
      );
    });
    const measurementsNoPeriodo = measurementsRaw.filter((m) => {
      const dt = parseDateSafe(m.measuredAt);
      return (
        Boolean(m.patientId) &&
        activePatientIds.has(m.patientId) &&
        dt !== null &&
        dt >= janela.inicioAtualDate
      );
    });

    // =========================================================================
    // 1. SINAIS DE ATIVIDADE (ENGAJAMENTO DO PERÍODO + ÚLTIMO SINAL 7D P/ EVASÃO)
    // =========================================================================
    const pacientesAtivosNoPeriodo = new Set<string>();
    const ultimoSinalPorPaciente = new Map<string, Date>();

    const registrarSinal = (
      pid: string | null | undefined,
      dt: Date | null,
      dentroDoPeriodo: boolean
    ) => {
      if (!pid || !activePatientIds.has(pid) || !dt || Number.isNaN(dt.getTime())) {
        return;
      }
      if (dentroDoPeriodo) pacientesAtivosNoPeriodo.add(pid);
      const prev = ultimoSinalPorPaciente.get(pid);
      if (!prev || dt > prev) {
        ultimoSinalPorPaciente.set(pid, dt);
      }
    };

    for (const c of checkinsRefeicoesRaw) {
      const dt = parseDateSafe(c.atualizadoEm ?? c.criadoEm);
      registrarSinal(
        c.pacienteId,
        dt,
        isIsoDateValid(c.dataDia) && c.dataDia >= janela.inicioAtualIso
      );
    }
    for (const g of glicemiasRaw) {
      const dt = parseDateSafe(g.dataRegistro);
      registrarSinal(g.pacienteId, dt, dt !== null && dt >= janela.inicioAtualDate);
    }
    for (const i of intestinosRaw) {
      const dt = parseDateSafe(i.data);
      registrarSinal(i.pacienteId, dt, dt !== null && dt >= janela.inicioAtualDate);
    }
    for (const h of hidratacoesRaw) {
      const dt = parseDateSafe(h.data);
      registrarSinal(h.pacienteId, dt, dt !== null && dt >= janela.inicioAtualDate);
    }
    for (const w of workoutsRaw) {
      const dt = parseDateSafe(w.date);
      registrarSinal(w.patientId, dt, dt !== null && dt >= janela.inicioAtualDate);
    }
    for (const s of sonos7dRaw) {
      const dt = parseDateSafe(s.data);
      registrarSinal(s.pacienteId, dt, dt !== null && dt >= janela.inicioAtualDate);
    }
    for (const b of biometriasRaw) {
      const dt = parseDateSafe(b.measuredAt);
      registrarSinal(b.patientId, dt, dt !== null && dt >= janela.inicioAtualDate);
    }
    for (const m of measurementsRaw) {
      const dt = parseDateSafe(m.measuredAt);
      registrarSinal(m.patientId, dt, dt !== null && dt >= janela.inicioAtualDate);
    }

    const totalPacientesAtivos = pacientesAtivos.length;
    const ativosNoPeriodo = pacientesAtivosNoPeriodo.size;
    const taxaEngajamento =
      totalPacientesAtivos > 0
        ? Math.min(100, Math.round((ativosNoPeriodo / totalPacientesAtivos) * 100))
        : 0;

    // =========================================================================
    // 2. CONSULTAS AGENDADAS (HOJE + PRÓXIMOS 7 DIAS)
    // =========================================================================
    const agendamentosValidos = agendamentosFuturos.filter((a) => {
      const st = (a.status || "").toUpperCase();
      if (st === "CANCELADO" || st === "FALTOU") return false;
      if (!parseDateSafe(a.dataHora)) return false;
      // Ignora agendamentos órfãos ou de pacientes inativos/excluídos
      if (a.pacienteId && !activePatientIds.has(a.pacienteId)) return false;
      return true;
    });

    const consultasHoje = agendamentosValidos.filter((a) => {
      const dt = parseDateSafe(a.dataHora);
      return dt !== null && dt >= inicioHojeDate && dt < fimHojeDate;
    }).length;

    const consultasProximos7Dias = agendamentosValidos.filter((a) => {
      const dt = parseDateSafe(a.dataHora);
      return dt !== null && dt >= inicioHojeDate && dt < fimProximos7DiasDate;
    }).length;

    const proximasConsultas: ConsultaProximaItem[] = agendamentosValidos
      .filter((a) => {
        const dt = parseDateSafe(a.dataHora);
        return dt !== null && dt >= inicioHojeDate;
      })
      .slice(0, 4)
      .map((a) => {
        const pac = a.paciente || (a.pacienteId ? pacienteMap.get(a.pacienteId) : null);
        return {
          id: a.id,
          dataHora: toIsoSafe(a.dataHora, agora) ?? agora.toISOString(),
          tipo: a.tipo || "CONSULTA",
          status: a.status || "AGENDADO",
          especialidade: a.especialidade || "Endocrinologia",
          pacienteId: a.pacienteId,
          pacienteNome: pac?.fullName || "Paciente",
          pacienteRecordCode: pac?.recordCode || "",
          medicoNome: a.medico?.nome || "Equipe Clínica FAAZ",
        };
      });

    // =========================================================================
    // 3. IMPACTO CORPORAL SEPARADO POR OBJETIVO (EMAGRECIMENTO vs HIPERTROFIA)
    // =========================================================================
    const pesoTimelineByPatient = new Map<
      string,
      Array<{ date: Date; peso: number }>
    >();

    const addWeightPoint = (pid: string, date: Date | null, peso: number) => {
      if (
        !pid ||
        !activePatientIds.has(pid) ||
        !Number.isFinite(peso) ||
        peso <= 0 ||
        !date ||
        Number.isNaN(date.getTime())
      ) {
        return;
      }
      const arr = pesoTimelineByPatient.get(pid) || [];
      arr.push({ date, peso });
      pesoTimelineByPatient.set(pid, arr);
    };

    for (const ev of evolucoesRaw) {
      if (ev.pesoAtual != null) {
        addWeightPoint(
          ev.pacienteId,
          parseDateSafe(ev.createdAt ?? ev.dataAtendimento),
          Number(ev.pesoAtual)
        );
      }
    }
    for (const bio of biometriasRaw) {
      if (bio.weightKg != null) {
        addWeightPoint(
          bio.patientId,
          parseDateSafe(bio.createdAt ?? bio.measuredAt),
          Number(bio.weightKg)
        );
      }
    }

    // Deduplica pontos gêmeos gravados simultaneamente (ex.: pesagem app grava em BIOMETRIC + EVOLUCOES)
    for (const [pid, list] of pesoTimelineByPatient.entries()) {
      list.sort((a, b) => a.date.getTime() - b.date.getTime());
      const deduped: Array<{ date: Date; peso: number }> = [];
      for (const pt of list) {
        const last = deduped[deduped.length - 1];
        if (
          last &&
          Math.abs(pt.date.getTime() - last.date.getTime()) <= 120_000 &&
          Math.abs(pt.peso - last.peso) < 0.05
        ) {
          continue;
        }
        deduped.push(pt);
      }
      pesoTimelineByPatient.set(pid, deduped);
    }

    // Agrupa MEASUREMENTS por paciente (ordenado DESC -> mais recente no índice 0)
    const measurementsByPatient = new Map<string, typeof measurementsRaw>();
    for (const m of measurementsRaw) {
      if (!activePatientIds.has(m.patientId)) continue;
      const arr = measurementsByPatient.get(m.patientId) || [];
      arr.push(m);
      measurementsByPatient.set(m.patientId, arr);
    }

    let totalEliminadoAtual = 0;
    let totalEliminadoAnterior = 0;
    let maiorReducaoKg = 0;
    let maiorReducaoPacienteNome: string | null = null;
    let totalPacientesEmagrecimento = 0;
    const detalhesEmagrecimento: DetalheEmagrecimentoPaciente[] = [];

    let totalPacientesHipertrofia = 0;
    const deltasPesoHipertrofia: number[] = [];
    let pacientesComGanhoHipertrofia = 0;
    const deltasCinturaHip: number[] = [];
    const deltasBracoHip: number[] = [];
    const deltasCoxaHip: number[] = [];
    const detalhesHipertrofia: DetalheHipertrofiaPaciente[] = [];

    for (const p of pacientesAtivos) {
      const perfil = classificarObjetivoPaciente(
        p.treatmentObjective,
        p.clinicalFocus,
        p.prontuario?.objetivo
      );
      const timeline = pesoTimelineByPatient.get(p.id) || [];

      if (perfil === "HIPERTROFIA") {
        totalPacientesHipertrofia += 1;

        const ptsNoPeriodo = timeline.filter(
          (pt) => pt.date >= janela.inicioAtualDate
        );
        const ptsAntesPeriodo = timeline.filter(
          (pt) => pt.date < janela.inicioAtualDate
        );

        let deltaPeso: number | null = null;
        let pesoAtual: number | null =
          timeline.length > 0 ? timeline[timeline.length - 1].peso : null;
        if (pesoAtual === null && p.prontuario?.pesoAtualKg != null) {
          const parsedPeso = Number(p.prontuario.pesoAtualKg);
          if (Number.isFinite(parsedPeso) && parsedPeso > 0) {
            pesoAtual = parsedPeso;
          }
        }

        if (ptsNoPeriodo.length > 0) {
          const ultimoNoPeriodo = ptsNoPeriodo[ptsNoPeriodo.length - 1];
          const referencia =
            ptsAntesPeriodo.length > 0
              ? ptsAntesPeriodo[ptsAntesPeriodo.length - 1]
              : ptsNoPeriodo.length >= 2
                ? ptsNoPeriodo[0]
                : null;
          if (referencia) {
            deltaPeso = round1(ultimoNoPeriodo.peso - referencia.peso);
            deltasPesoHipertrofia.push(deltaPeso);
            if (deltaPeso > 0) pacientesComGanhoHipertrofia += 1;
          }
        }

        const pMeasures = measurementsByPatient.get(p.id) || [];
        const extractDelta = (
          picker: (m: (typeof measurementsRaw)[number]) => number | null
        ): number | null => {
          const vals = pMeasures
            .map((m) => picker(m))
            .filter((v): v is number => v !== null && Number.isFinite(v));
          if (vals.length < 2) return null;
          return round1(vals[0] - vals[1]);
        };

        const deltaCintura = extractDelta((m) =>
          m.waist != null ? Number(m.waist) : null
        );
        const deltaBraco = extractDelta((m) => {
          if (m.rightArm != null && m.leftArm != null) {
            return (Number(m.rightArm) + Number(m.leftArm)) / 2;
          }
          if (m.rightArm != null) return Number(m.rightArm);
          if (m.leftArm != null) return Number(m.leftArm);
          return null;
        });
        const deltaCoxa = extractDelta((m) => {
          if (m.rightThigh != null && m.leftThigh != null) {
            return (Number(m.rightThigh) + Number(m.leftThigh)) / 2;
          }
          if (m.rightThigh != null) return Number(m.rightThigh);
          if (m.leftThigh != null) return Number(m.leftThigh);
          return null;
        });

        if (deltaCintura !== null) deltasCinturaHip.push(deltaCintura);
        if (deltaBraco !== null) deltasBracoHip.push(deltaBraco);
        if (deltaCoxa !== null) deltasCoxaHip.push(deltaCoxa);

        detalhesHipertrofia.push({
          pacienteId: p.id,
          nome: p.fullName,
          recordCode: p.recordCode,
          deltaPesoKg: deltaPeso,
          pesoAtualKg: pesoAtual !== null ? round1(pesoAtual) : null,
          deltaBracoCm: deltaBraco,
          deltaCoxaCm: deltaCoxa,
          deltaCinturaCm: deltaCintura,
        });
      } else {
        if (perfil === "EMAGRECIMENTO") {
          totalPacientesEmagrecimento += 1;
        }

        let reducaoAtualPaciente = 0;
        let pesoRefInicio: number | null = null;
        let pesoFimAtual: number | null = null;

        for (let i = 1; i < timeline.length; i++) {
          const prev = timeline[i - 1];
          const curr = timeline[i];
          const delta = round1(prev.peso - curr.peso);

          if (delta > 0) {
            if (curr.date >= janela.inicioAtualDate) {
              reducaoAtualPaciente = round1(reducaoAtualPaciente + delta);
              if (pesoRefInicio === null) pesoRefInicio = prev.peso;
              pesoFimAtual = curr.peso;
            } else if (
              curr.date >= janela.inicioAnteriorDate &&
              curr.date < janela.inicioAtualDate
            ) {
              totalEliminadoAnterior = round1(totalEliminadoAnterior + delta);
            }
          }
        }

        if (reducaoAtualPaciente > 0) {
          totalEliminadoAtual = round1(
            totalEliminadoAtual + reducaoAtualPaciente
          );
          if (reducaoAtualPaciente > maiorReducaoKg) {
            maiorReducaoKg = reducaoAtualPaciente;
            maiorReducaoPacienteNome = p.fullName;
          }
          detalhesEmagrecimento.push({
            pacienteId: p.id,
            nome: p.fullName,
            recordCode: p.recordCode,
            reducaoKg: reducaoAtualPaciente,
            pesoAtualKg: round1(pesoFimAtual ?? 0),
            pesoAnteriorKg: round1(pesoRefInicio ?? 0),
          });
        }
      }
    }

    detalhesEmagrecimento.sort((a, b) => b.reducaoKg - a.reducaoKg);
    detalhesHipertrofia.sort(
      (a, b) => (b.deltaPesoKg ?? -999) - (a.deltaPesoKg ?? -999)
    );

    const mediaPorPacienteKg =
      detalhesEmagrecimento.length > 0
        ? round1(totalEliminadoAtual / detalhesEmagrecimento.length)
        : 0;
    const temBaseAnterior = totalEliminadoAnterior > 0;
    const deltaAnteriorPct = temBaseAnterior
      ? Math.round(
          ((totalEliminadoAtual - totalEliminadoAnterior) /
            totalEliminadoAnterior) *
            100
        )
      : null;

    const avgOrNull = (arr: number[]): number | null =>
      arr.length > 0
        ? round1(arr.reduce((acc, v) => acc + v, 0) / arr.length)
        : null;

    // =========================================================================
    // 4. SÉRIE TEMPORAL DE ATIVIDADE DO ECOSSISTEMA (AREA CHART)
    // =========================================================================
    const serieBuckets = new Map<string, PontoSerieAtividade>();
    if (periodo === "hoje") {
      // 12 blocos de 2h hoje (00h..22h) para curva real mesmo em "Hoje"
      for (let h = 0; h < 24; h += 2) {
        const key = `${janela.hojeIso}T${String(h).padStart(2, "0")}`;
        serieBuckets.set(key, {
          data: key,
          dataLabel: `${String(h).padStart(2, "0")}h`,
          totalInteracoes: 0,
          dieta: 0,
          glicemia: 0,
          intestino: 0,
          treinos: 0,
          pesagens: 0,
        });
      }
    } else {
      for (let i = 0; i < janela.diasJanela; i++) {
        const iso = adicionarDiasDataBR(janela.inicioAtualIso, i);
        if (iso > janela.hojeIso) break;
        serieBuckets.set(iso, {
          data: iso,
          dataLabel: formatDiaLabelPt(iso),
          totalInteracoes: 0,
          dieta: 0,
          glicemia: 0,
          intestino: 0,
          treinos: 0,
          pesagens: 0,
        });
      }
    }

    const bucketKeyFromDate = (dt: Date | null): string | null => {
      if (!dt || Number.isNaN(dt.getTime())) return null;
      const sp = getPartesDataHoraBR(dt);
      if (periodo === "hoje") {
        const slot = Math.floor(sp.hour / 2) * 2;
        return `${sp.isoDate}T${String(slot).padStart(2, "0")}`;
      }
      return sp.isoDate;
    };

    const incBucket = (
      key: string | null,
      campo: "dieta" | "glicemia" | "intestino" | "treinos" | "pesagens"
    ) => {
      if (!key) return;
      const b = serieBuckets.get(key);
      if (!b) return;
      b[campo] += 1;
      b.totalInteracoes += 1;
    };

    for (const c of checkinsRefeicoes) {
      const key =
        periodo === "hoje"
          ? bucketKeyFromDate(parseDateSafe(c.atualizadoEm ?? c.criadoEm))
          : c.dataDia;
      incBucket(key, "dieta");
    }
    for (const g of glicemias) {
      incBucket(bucketKeyFromDate(parseDateSafe(g.dataRegistro)), "glicemia");
    }
    for (const i of intestinos) {
      incBucket(bucketKeyFromDate(parseDateSafe(i.data)), "intestino");
    }
    for (const w of workouts) {
      incBucket(bucketKeyFromDate(parseDateSafe(w.date)), "treinos");
    }
    for (const b of biometriasNoPeriodo) {
      incBucket(bucketKeyFromDate(parseDateSafe(b.measuredAt)), "pesagens");
    }

    const serieAtividade = Array.from(serieBuckets.values());

    // =========================================================================
    // 5. TELEMETRIA GLICÊMICA (REGISTROS_GLICEMIA)
    // =========================================================================
    let somaGlic = 0;
    let hipoCount = 0;
    let hiperCount = 0;

    const glicemiaPorPaciente = new Map<
      string,
      {
        medicoes: number;
        soma: number;
        ultimoValor: number;
        ultimaData: Date;
        alertasCriticos: number;
        ultimoCritico: {
          valor: number;
          momento: string;
          data: Date;
          tipo: "HIPO" | "HIPER";
        } | null;
      }
    >();

    for (const g of glicemias) {
      const dt = parseDateSafe(g.dataRegistro);
      if (!dt) continue;
      const val = Number(g.valor) || 0;
      somaGlic += val;
      const isHipo = val < 70;
      const isHiper = val > 180;
      if (isHipo) hipoCount += 1;
      else if (isHiper) hiperCount += 1;

      const cur = glicemiaPorPaciente.get(g.pacienteId);
      if (!cur) {
        glicemiaPorPaciente.set(g.pacienteId, {
          medicoes: 1,
          soma: val,
          ultimoValor: val,
          ultimaData: dt,
          alertasCriticos: isHipo || isHiper ? 1 : 0,
          ultimoCritico:
            isHipo || isHiper
              ? {
                  valor: val,
                  momento: formatMomentoGlicemia(g.momento),
                  data: dt,
                  tipo: isHipo ? "HIPO" : "HIPER",
                }
              : null,
        });
      } else {
        cur.medicoes += 1;
        cur.soma += val;
        if (dt > cur.ultimaData) {
          cur.ultimaData = dt;
          cur.ultimoValor = val;
        }
        if (isHipo || isHiper) {
          cur.alertasCriticos += 1;
          if (!cur.ultimoCritico || dt > cur.ultimoCritico.data) {
            cur.ultimoCritico = {
              valor: val,
              momento: formatMomentoGlicemia(g.momento),
              data: dt,
              tipo: isHipo ? "HIPO" : "HIPER",
            };
          }
        }
      }
    }

    const totalMedicoesGlic = glicemias.length;
    const mediaGlicMgDl =
      totalMedicoesGlic > 0 ? Math.round(somaGlic / totalMedicoesGlic) : null;
    const hipoPct =
      totalMedicoesGlic > 0
        ? Math.round((hipoCount / totalMedicoesGlic) * 100)
        : 0;
    const hiperPct =
      totalMedicoesGlic > 0
        ? Math.round((hiperCount / totalMedicoesGlic) * 100)
        : 0;
    const metaGlicPct =
      totalMedicoesGlic > 0 ? Math.max(0, 100 - hipoPct - hiperPct) : 0;

    const sparklineGlicemia: SparklineGlicemiaItem[] = [...glicemias]
      .slice(0, 24)
      .reverse()
      .flatMap((g) => {
        const dt = parseDateSafe(g.dataRegistro);
        if (!dt) return [];
        const sp = getPartesDataHoraBR(dt);
        return [
          {
            id: g.id,
            valor: Number(g.valor) || 0,
            momento: formatMomentoGlicemia(g.momento),
            dataRegistro: dt.toISOString(),
            horaLabel: `${formatDiaLabelPt(sp.isoDate)} ${String(
              sp.hour
            ).padStart(2, "0")}h`,
            pacienteNome: pacienteMap.get(g.pacienteId)?.fullName || "Paciente",
          },
        ];
      });

    const pacientesCriticosGlicemia: PacienteGlicemiaCritica[] = [];
    const detalhesGlicemia: DetalheGlicemiaPaciente[] = [];

    for (const [pid, st] of glicemiaPorPaciente.entries()) {
      const p = pacienteMap.get(pid);
      if (!p || st.medicoes <= 0) continue;
      detalhesGlicemia.push({
        pacienteId: pid,
        nome: p.fullName,
        recordCode: p.recordCode,
        medicoes: st.medicoes,
        mediaMgDl: Math.round(st.soma / st.medicoes),
        ultimoValor: st.ultimoValor,
        alertasCriticos: st.alertasCriticos,
        ultimaData: toIsoSafe(st.ultimaData, agora) ?? agora.toISOString(),
      });
      if (st.ultimoCritico) {
        pacientesCriticosGlicemia.push({
          pacienteId: pid,
          nome: p.fullName,
          recordCode: p.recordCode,
          cpf: p.cpf || "",
          telefone: p.phoneWhatsapp || "",
          ultimoValor: st.ultimoCritico.valor,
          momento: st.ultimoCritico.momento,
          dataRegistro:
            toIsoSafe(st.ultimoCritico.data, agora) ?? agora.toISOString(),
          tipo: st.ultimoCritico.tipo,
          totalAlertas: st.alertasCriticos,
        });
      }
    }
    pacientesCriticosGlicemia.sort(
      (a, b) =>
        (parseDateSafe(b.dataRegistro)?.getTime() ?? 0) -
        (parseDateSafe(a.dataRegistro)?.getTime() ?? 0)
    );
    detalhesGlicemia.sort(
      (a, b) =>
        b.alertasCriticos - a.alertasCriticos || b.medicoes - a.medicoes
    );

    // =========================================================================
    // 6. ADESÃO ALIMENTAR (CHECKINS_REFEICOES + REFEICOES)
    // =========================================================================
    let obrigatoriosTotalDieta = 0;
    let obrigatoriosAderentesDieta = 0;
    let opcionaisBonusDieta = 0;
    let seguiuCount = 0;
    let trocaCount = 0;
    let naoFezCount = 0;

    const gargaloMap = new Map<
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

    const dietaPorPaciente = new Map<
      string,
      {
        total: number;
        obrigTotal: number;
        obrigAderentes: number;
        opBonus: number;
        seguiu: number;
        trocas: number;
        naoFez: number;
        ultimoDia: string;
      }
    >();

    for (const c of checkinsRefeicoes) {
      const isOpcional = Boolean(c.refeicao?.opcional);
      const isAderente = c.status === "SEGUI" || c.status === "FIZ_TROCA";

      if (c.status === "SEGUI") seguiuCount += 1;
      else if (c.status === "FIZ_TROCA") trocaCount += 1;
      else if (c.status === "NAO_FIZ") naoFezCount += 1;

      if (isOpcional) {
        if (isAderente) opcionaisBonusDieta += 1;
      } else {
        obrigatoriosTotalDieta += 1;
        if (isAderente) obrigatoriosAderentesDieta += 1;

        const gKey = c.refeicaoId;
        const gItem = gargaloMap.get(gKey) || {
          refeicaoId: c.refeicaoId,
          nome: c.refeicao?.nome || "Refeição",
          horario: formatHorarioCurto(c.refeicao?.horario),
          total: 0,
          naoFez: 0,
          aderentes: 0,
        };
        gItem.total += 1;
        if (c.status === "NAO_FIZ") gItem.naoFez += 1;
        if (isAderente) gItem.aderentes += 1;
        gargaloMap.set(gKey, gItem);
      }

      const dp = dietaPorPaciente.get(c.pacienteId) || {
        total: 0,
        obrigTotal: 0,
        obrigAderentes: 0,
        opBonus: 0,
        seguiu: 0,
        trocas: 0,
        naoFez: 0,
        ultimoDia: c.dataDia,
      };
      dp.total += 1;
      if (c.dataDia > dp.ultimoDia) dp.ultimoDia = c.dataDia;
      if (c.status === "SEGUI") dp.seguiu += 1;
      else if (c.status === "FIZ_TROCA") dp.trocas += 1;
      else if (c.status === "NAO_FIZ") dp.naoFez += 1;

      if (isOpcional) {
        if (isAderente) dp.opBonus += 1;
      } else {
        dp.obrigTotal += 1;
        if (isAderente) dp.obrigAderentes += 1;
      }
      dietaPorPaciente.set(c.pacienteId, dp);
    }

    const totalCheckinsDieta = checkinsRefeicoes.length;
    let percentualAdesaoDieta: number | null = null;
    if (obrigatoriosTotalDieta > 0) {
      percentualAdesaoDieta = Math.min(
        100,
        Math.round(
          ((obrigatoriosAderentesDieta + opcionaisBonusDieta) /
            obrigatoriosTotalDieta) *
            100
        )
      );
    } else if (opcionaisBonusDieta > 0) {
      percentualAdesaoDieta = 100;
    }

    const seguiuPct =
      totalCheckinsDieta > 0
        ? Math.round((seguiuCount / totalCheckinsDieta) * 100)
        : 0;
    const trocaInteligentePct =
      totalCheckinsDieta > 0
        ? Math.round((trocaCount / totalCheckinsDieta) * 100)
        : 0;
    const naoFezPct =
      totalCheckinsDieta > 0
        ? Math.max(0, 100 - seguiuPct - trocaInteligentePct)
        : 0;

    let gargaloPrincipal: TelemetriaDashboardResponse["dieta"]["gargaloPrincipal"] =
      null;
    for (const stats of gargaloMap.values()) {
      if (stats.naoFez <= 0 || stats.total <= 0) continue;
      const prop: number = stats.naoFez / stats.total;
      const bestProp: number =
        gargaloPrincipal && gargaloPrincipal.totalRegistros > 0
          ? gargaloPrincipal.naoFez / gargaloPrincipal.totalRegistros
          : -1;
      if (
        !gargaloPrincipal ||
        prop > bestProp ||
        (prop === bestProp && stats.naoFez > gargaloPrincipal.naoFez)
      ) {
        gargaloPrincipal = {
          refeicaoId: stats.refeicaoId,
          nome: stats.nome,
          horario: stats.horario,
          label: stats.horario ? `${stats.nome} ${stats.horario}` : stats.nome,
          totalRegistros: stats.total,
          naoFez: stats.naoFez,
          percentualAdesao: Math.round((stats.aderentes / stats.total) * 100),
        };
      }
    }

    const detalhesDieta: DetalheDietaPaciente[] = [];
    for (const [pid, dp] of dietaPorPaciente.entries()) {
      const p = pacienteMap.get(pid);
      if (!p) continue;
      const perc =
        dp.obrigTotal > 0
          ? Math.min(
              100,
              Math.round(((dp.obrigAderentes + dp.opBonus) / dp.obrigTotal) * 100)
            )
          : dp.opBonus > 0
            ? 100
            : null;
      detalhesDieta.push({
        pacienteId: pid,
        nome: p.fullName,
        recordCode: p.recordCode,
        totalCheckins: dp.total,
        percentualAdesao: perc,
        seguiu: dp.seguiu,
        trocas: dp.trocas,
        naoFez: dp.naoFez,
        ultimoDia: dp.ultimoDia,
      });
    }
    detalhesDieta.sort(
      (a, b) => (a.percentualAdesao ?? 101) - (b.percentualAdesao ?? 101)
    );

    // =========================================================================
    // 7. SAÚDE INTESTINAL (CHECKINS_INTESTINAIS — HISTOGRAMA BRISTOL 1..7)
    // =========================================================================
    const histograma = {
      tipo1: 0,
      tipo2: 0,
      tipo3: 0,
      tipo4: 0,
      tipo5: 0,
      tipo6: 0,
      tipo7: 0,
    };
    let idealIntCount = 0;
    let constipIntCount = 0;
    let diarreiaIntCount = 0;

    const intestinoPorPaciente = new Map<
      string,
      {
        total: number;
        ultimoTipo: number;
        ultimaData: Date;
        ideal: number;
        constipacao: number;
        diarreia: number;
        sintomas: Set<string>;
      }
    >();

    for (const item of intestinos) {
      const dt = parseDateSafe(item.data);
      if (!dt) continue;
      const tipo = Math.min(7, Math.max(1, Math.round(Number(item.tipoBristol) || 4)));
      const key = `tipo${tipo}` as keyof typeof histograma;
      histograma[key] += 1;

      const cat = normalizarCategoriaBristol(item.categoria, tipo);
      if (cat === "ideal") idealIntCount += 1;
      else if (cat === "constipacao") constipIntCount += 1;
      else diarreiaIntCount += 1;

      const cur = intestinoPorPaciente.get(item.pacienteId) || {
        total: 0,
        ultimoTipo: tipo,
        ultimaData: dt,
        ideal: 0,
        constipacao: 0,
        diarreia: 0,
        sintomas: new Set<string>(),
      };
      cur.total += 1;
      if (dt >= cur.ultimaData) {
        cur.ultimaData = dt;
        cur.ultimoTipo = tipo;
      }
      cur[cat] += 1;
      if (Array.isArray(item.sintomas)) {
        for (const s of item.sintomas) {
          const clean = String(s || "").trim();
          const low = clean.toLowerCase();
          if (clean && low !== "nenhum" && low !== "sem sintomas") {
            cur.sintomas.add(clean);
          }
        }
      }
      intestinoPorPaciente.set(item.pacienteId, cur);
    }

    const totalIntestino = intestinos.length;
    const idealIntPct =
      totalIntestino > 0 ? Math.round((idealIntCount / totalIntestino) * 100) : 0;
    const constipIntPct =
      totalIntestino > 0
        ? Math.round((constipIntCount / totalIntestino) * 100)
        : 0;
    const diarreiaIntPct =
      totalIntestino > 0
        ? Math.max(0, 100 - idealIntPct - constipIntPct)
        : 0;

    const detalhesIntestino: DetalheIntestinoPaciente[] = [];
    for (const [pid, st] of intestinoPorPaciente.entries()) {
      const p = pacienteMap.get(pid);
      if (!p) continue;
      const padrao: "ideal" | "constipacao" | "diarreia" =
        st.constipacao >= st.ideal && st.constipacao >= st.diarreia
          ? "constipacao"
          : st.diarreia >= st.ideal && st.diarreia >= st.constipacao
            ? "diarreia"
            : "ideal";
      detalhesIntestino.push({
        pacienteId: pid,
        nome: p.fullName,
        recordCode: p.recordCode,
        totalRegistros: st.total,
        ultimoTipo: st.ultimoTipo,
        padraoPredominante: padrao,
        sintomasRecentes: Array.from(st.sintomas).slice(0, 3),
        ultimaData: toIsoSafe(st.ultimaData, agora) ?? agora.toISOString(),
      });
    }
    detalhesIntestino.sort(
      (a, b) =>
        (parseDateSafe(b.ultimaData)?.getTime() ?? 0) -
        (parseDateSafe(a.ultimaData)?.getTime() ?? 0)
    );

    // =========================================================================
    // 8. HIDRATAÇÃO & TREINOS
    // =========================================================================
    const hidraPorPaciente = new Map<
      string,
      { totalMl: number; dias: Set<string> }
    >();
    let totalConsumidoMl = 0;
    for (const h of hidratacoes) {
      const dt = parseDateSafe(h.data);
      if (!dt) continue;
      const vol = Math.max(0, Number(h.volumeMl) || 0);
      totalConsumidoMl += vol;
      const diaIso = getPartesDataHoraBR(dt).isoDate;
      const cur = hidraPorPaciente.get(h.pacienteId) || {
        totalMl: 0,
        dias: new Set<string>(),
      };
      cur.totalMl += vol;
      cur.dias.add(diaIso);
      hidraPorPaciente.set(h.pacienteId, cur);
    }

    const detalhesHidratacao: DetalheHidratacaoPaciente[] = [];
    let metaTotalHidratacaoMl = 0;

    if (periodo === "hoje") {
      // Hoje: soma da meta diária real de todos os pacientes ativos
      for (const p of pacientesAtivos) {
        metaTotalHidratacaoMl += getMetaAguaPaciente(p.id);
      }
    } else {
      // Períodos multi-dia: compara volume registrado contra meta real dos dias registrados pelos pacientes
      for (const [pid, st] of hidraPorPaciente.entries()) {
        metaTotalHidratacaoMl +=
          getMetaAguaPaciente(pid) * Math.max(1, st.dias.size);
      }
    }

    for (const [pid, st] of hidraPorPaciente.entries()) {
      const p = pacienteMap.get(pid);
      if (!p) continue;
      const metaDiaria = getMetaAguaPaciente(pid);
      const diasReg = Math.max(1, st.dias.size);
      const mediaDiaria = Math.round(st.totalMl / diasReg);
      const perc =
        metaDiaria > 0
          ? Math.min(100, Math.round((mediaDiaria / metaDiaria) * 100))
          : 0;
      detalhesHidratacao.push({
        pacienteId: pid,
        nome: p.fullName,
        recordCode: p.recordCode,
        volumeTotalL: round1(st.totalMl / 1000),
        volumeMedioDiarioMl: mediaDiaria,
        metaDiariaMl: metaDiaria,
        percentual: perc,
        diasRegistrados: diasReg,
      });
    }
    detalhesHidratacao.sort((a, b) => b.percentual - a.percentual);

    const percentualHidratacao =
      hidratacoes.length > 0 && metaTotalHidratacaoMl > 0
        ? Math.min(
            100,
            Math.round((totalConsumidoMl / metaTotalHidratacaoMl) * 100)
          )
        : null;

    // Treinos
    const treinosPorPaciente = new Map<string, Set<string>>();
    for (const w of workouts) {
      const dt = parseDateSafe(w.date);
      if (!dt) continue;
      const diaIso = getPartesDataHoraBR(dt).isoDate;
      const set = treinosPorPaciente.get(w.patientId) || new Set<string>();
      set.add(diaIso);
      treinosPorPaciente.set(w.patientId, set);
    }

    let diasAtivosTreinosTotal = 0;
    let metaEsperadaTreinosTotal = 0;
    const detalhesTreinos: DetalheTreinoPaciente[] = [];

    for (const p of pacientesAtivos) {
      const freqSemanal = Math.max(1, Number(p.workoutFrequency) || 3);
      const metaPaciente = Math.max(
        1,
        Math.round((freqSemanal / 7) * janela.diasJanela)
      );
      const diasSet = treinosPorPaciente.get(p.id);
      const diasAtivosP = diasSet ? diasSet.size : 0;

      if (diasAtivosP > 0) {
        diasAtivosTreinosTotal += diasAtivosP;
        metaEsperadaTreinosTotal += metaPaciente;
        detalhesTreinos.push({
          pacienteId: p.id,
          nome: p.fullName,
          recordCode: p.recordCode,
          diasAtivos: diasAtivosP,
          metaEsperada: metaPaciente,
          percentualAdesao: Math.min(
            100,
            Math.round((diasAtivosP / metaPaciente) * 100)
          ),
          modalidade: p.workoutType || "Atividade Física",
        });
      }
    }
    detalhesTreinos.sort((a, b) => b.percentualAdesao - a.percentualAdesao);

    const percentualTreinos =
      workouts.length > 0 && metaEsperadaTreinosTotal > 0
        ? Math.min(
            100,
            Math.round((diasAtivosTreinosTotal / metaEsperadaTreinosTotal) * 100)
          )
        : null;

    // =========================================================================
    // 9. ÍNDICE CLÍNICO GLOBAL (MÉDIA PONDERADA APENAS DOS PILARES COM DADOS)
    // =========================================================================
    const subCheckins: number[] = [];
    if (totalMedicoesGlic > 0) subCheckins.push(metaGlicPct);
    if (totalIntestino > 0) subCheckins.push(idealIntPct);
    if (ativosNoPeriodo > 0) subCheckins.push(taxaEngajamento);
    const scoreCheckinsClinicos =
      subCheckins.length > 0
        ? Math.round(
            subCheckins.reduce((acc, v) => acc + v, 0) / subCheckins.length
          )
        : null;

    const pilaresIndice: PilarIndiceItem[] = [
      {
        chave: "dieta",
        rotulo: "Adesão Alimentar",
        score: percentualAdesaoDieta,
        peso: 35,
        ativo: percentualAdesaoDieta !== null,
      },
      {
        chave: "hidratacao",
        rotulo: "Hidratação",
        score: percentualHidratacao,
        peso: 20,
        ativo: percentualHidratacao !== null,
      },
      {
        chave: "treinos",
        rotulo: "Treinos",
        score: percentualTreinos,
        peso: 20,
        ativo: percentualTreinos !== null,
      },
      {
        chave: "checkins",
        rotulo: "Check-ins Clínicos",
        score: scoreCheckinsClinicos,
        peso: 25,
        ativo: scoreCheckinsClinicos !== null,
      },
    ];

    const pilaresAtivos = pilaresIndice.filter(
      (pl) => pl.ativo && pl.score !== null
    );
    const somaPesos = pilaresAtivos.reduce((acc, pl) => acc + pl.peso, 0);
    const indiceClinicoGlobal =
      somaPesos > 0
        ? Math.round(
            pilaresAtivos.reduce(
              (acc, pl) => acc + (pl.score as number) * pl.peso,
              0
            ) / somaPesos
          )
        : null;

    // =========================================================================
    // 10. RADAR DE TRIAGEM CLÍNICA (CRITICO -> ATENCAO -> EVASAO)
    // =========================================================================
    const radarTriagem: RadarTriagemItem[] = [];
    const pacientesJaNoRadar = new Set<string>();

    // 10a. CRÍTICO — Alertas Glicêmicos (< 70 ou > 180)
    for (const crit of pacientesCriticosGlicemia) {
      pacientesJaNoRadar.add(crit.pacienteId);
      radarTriagem.push({
        id: `glic-${crit.pacienteId}`,
        pacienteId: crit.pacienteId,
        nome: crit.nome,
        recordCode: crit.recordCode,
        cpf: crit.cpf,
        telefone: crit.telefone,
        severidade: "CRITICO",
        categoria: "GLICEMIA",
        motivo: `${crit.tipo === "HIPO" ? "Hipoglicemia" : "Hiperglicemia"}: ${
          crit.ultimoValor
        } mg/dL (${crit.momento})`,
        detalhe: `${crit.totalAlertas} ${
          crit.totalAlertas === 1 ? "episódio fora" : "episódios fora"
        } da meta no período`,
        ultimoSinalEm: crit.dataRegistro,
      });
    }

    // 10b. ATENÇÃO — Padrão Intestinal Alterado (Constipação ou Diarreia predominante)
    for (const det of detalhesIntestino) {
      if (det.padraoPredominante === "ideal") continue;
      if (pacientesJaNoRadar.has(det.pacienteId)) continue;
      const p = pacienteMap.get(det.pacienteId);
      if (!p) continue;
      pacientesJaNoRadar.add(det.pacienteId);
      radarTriagem.push({
        id: `bristol-${det.pacienteId}`,
        pacienteId: det.pacienteId,
        nome: det.nome,
        recordCode: det.recordCode,
        cpf: p.cpf || "",
        telefone: p.phoneWhatsapp || "",
        severidade: "ATENCAO",
        categoria: "INTESTINO",
        motivo:
          det.padraoPredominante === "constipacao"
            ? `Constipação predominante (Bristol Tipo ${det.ultimoTipo})`
            : `Trânsito acelerado / diarreia (Bristol Tipo ${det.ultimoTipo})`,
        detalhe:
          det.sintomasRecentes.length > 0
            ? `Sintomas: ${det.sintomasRecentes.join(", ")}`
            : `${det.totalRegistros} ${
                det.totalRegistros === 1
                  ? "registro intestinal"
                  : "registros intestinais"
              } no período`,
        ultimoSinalEm: det.ultimaData,
      });
    }

    // 10c. ATENÇÃO — Baixa adesão alimentar (< 50% com pelo menos 3 check-ins)
    for (const det of detalhesDieta) {
      if (det.totalCheckins < 3 || (det.percentualAdesao ?? 100) >= 50) continue;
      if (pacientesJaNoRadar.has(det.pacienteId)) continue;
      const p = pacienteMap.get(det.pacienteId);
      if (!p) continue;
      pacientesJaNoRadar.add(det.pacienteId);
      radarTriagem.push({
        id: `dieta-${det.pacienteId}`,
        pacienteId: det.pacienteId,
        nome: det.nome,
        recordCode: det.recordCode,
        cpf: p.cpf || "",
        telefone: p.phoneWhatsapp || "",
        severidade: "ATENCAO",
        categoria: "DIETA",
        motivo: `Adesão alimentar baixa (${det.percentualAdesao ?? 0}%)`,
        detalhe: `${det.naoFez} de ${det.totalCheckins} refeições não concluídas`,
        ultimoSinalEm: isIsoDateValid(det.ultimoDia)
          ? `${det.ultimoDia}T12:00:00-03:00`
          : null,
      });
    }

    // 10d. EVASÃO — 7+ dias sem nenhum check-in / interação no app
    for (const p of pacientesAtivos) {
      if (pacientesJaNoRadar.has(p.id)) continue;
      const ultimo = ultimoSinalPorPaciente.get(p.id);
      if (!ultimo || ultimo < seteDiasAtrasDate) {
        const diasSemSinal = ultimo
          ? Math.max(
              7,
              Math.floor(
                (agora.getTime() - ultimo.getTime()) / (24 * 60 * 60 * 1000)
              )
            )
          : null;
        radarTriagem.push({
          id: `evasao-${p.id}`,
          pacienteId: p.id,
          nome: p.fullName,
          recordCode: p.recordCode,
          cpf: p.cpf || "",
          telefone: p.phoneWhatsapp || "",
          severidade: "EVASAO",
          categoria: "EVASAO",
          motivo:
            diasSemSinal !== null
              ? `${diasSemSinal} dias sem check-in no app`
              : "Sem check-ins registrados nos últimos 7+ dias",
          detalhe:
            resolverObjetivoAtivo(
              p.treatmentObjective,
              p.clinicalFocus,
              p.prontuario?.objetivo
            ) || "Acompanhamento ativo",
          ultimoSinalEm: ultimo ? ultimo.toISOString() : null,
        });
      }
    }

    const ordemSev = { CRITICO: 0, ATENCAO: 1, EVASAO: 2 };
    radarTriagem.sort((a, b) => ordemSev[a.severidade] - ordemSev[b.severidade]);

    // =========================================================================
    // 11. LIVE TELEMETRY FEED (ÚLTIMOS 10 SINAIS REAIS DO APP)
    // =========================================================================
    const feedCandidatos: LiveFeedItem[] = [];

    for (const g of glicemias.slice(0, 15)) {
      const p = pacienteMap.get(g.pacienteId);
      const ts = toIsoSafe(g.dataRegistro);
      if (!p || !ts) continue;
      const val = Number(g.valor) || 0;
      const isCrit = val < 70 || val > 180;
      feedCandidatos.push({
        id: `feed-glic-${g.id}`,
        pacienteId: p.id,
        pacienteNome: p.fullName,
        pacienteRecordCode: p.recordCode,
        tipo: "GLICEMIA",
        titulo: "Glicemia Capilar",
        resumo: `Registrou Glicemia: ${val} mg/dL (${formatMomentoGlicemia(
          g.momento
        )})`,
        severidade: isCrit ? "critico" : "positivo",
        timestamp: ts,
      });
    }

    for (const c of checkinsRefeicoes.slice(0, 15)) {
      const p = pacienteMap.get(c.pacienteId);
      const ts = toIsoSafe(c.atualizadoEm ?? c.criadoEm);
      if (!p || !ts) continue;
      const nomeRef = c.refeicao?.nome || "Refeição";
      const statusTexto =
        c.status === "SEGUI"
          ? "Segui o plano"
          : c.status === "FIZ_TROCA"
            ? "Fiz troca inteligente"
            : "Não consegui fazer";
      feedCandidatos.push({
        id: `feed-dieta-${c.id}`,
        pacienteId: p.id,
        pacienteNome: p.fullName,
        pacienteRecordCode: p.recordCode,
        tipo: "DIETA",
        titulo: "Check-in de Dieta",
        resumo: `${nomeRef}: ${statusTexto}`,
        severidade: c.status === "NAO_FIZ" ? "atencao" : "positivo",
        timestamp: ts,
      });
    }

    for (const i of intestinos.slice(0, 15)) {
      const p = pacienteMap.get(i.pacienteId);
      const ts = toIsoSafe(i.data);
      if (!p || !ts) continue;
      const cat = normalizarCategoriaBristol(i.categoria, i.tipoBristol);
      const labelCat =
        cat === "ideal"
          ? "Padrão ideal"
          : cat === "constipacao"
            ? "Constipação"
            : "Trânsito acelerado";
      feedCandidatos.push({
        id: `feed-int-${i.id}`,
        pacienteId: p.id,
        pacienteNome: p.fullName,
        pacienteRecordCode: p.recordCode,
        tipo: "INTESTINO",
        titulo: "Escala de Bristol",
        resumo: `Intestino: Tipo ${i.tipoBristol} (${labelCat})`,
        severidade: cat === "ideal" ? "positivo" : "atencao",
        timestamp: ts,
      });
    }

    for (const b of biometriasNoPeriodo.slice(0, 15)) {
      const p = pacienteMap.get(b.patientId);
      const ts = toIsoSafe(b.measuredAt);
      const pesoNum = b.weightKg != null ? Number(b.weightKg) : NaN;
      if (!p || !ts || !Number.isFinite(pesoNum) || pesoNum <= 0) continue;
      const imcNum = b.bmi != null ? Number(b.bmi) : NaN;
      const imcSuffix =
        Number.isFinite(imcNum) && imcNum > 0
          ? ` (IMC ${imcNum.toFixed(1).replace(".", ",")})`
          : "";
      feedCandidatos.push({
        id: `feed-peso-${b.id}`,
        pacienteId: p.id,
        pacienteNome: p.fullName,
        pacienteRecordCode: p.recordCode,
        tipo: "PESAGEM",
        titulo: "Pesagem Registrada",
        resumo: `Registrou Peso: ${pesoNum.toFixed(1).replace(".", ",")} kg${imcSuffix}`,
        severidade: "normal",
        timestamp: ts,
      });
    }

    for (const m of measurementsNoPeriodo.slice(0, 15)) {
      const p = pacienteMap.get(m.patientId);
      const ts = toIsoSafe(m.measuredAt);
      if (!p || !ts) continue;
      const partes: string[] = [];
      if (m.waist != null && Number.isFinite(Number(m.waist))) {
        partes.push(
          `Cintura ${Number(m.waist).toFixed(1).replace(".", ",")} cm`
        );
      }
      if (m.abdomen != null && Number.isFinite(Number(m.abdomen))) {
        partes.push(
          `Abdômen ${Number(m.abdomen).toFixed(1).replace(".", ",")} cm`
        );
      }
      if (
        m.hips != null &&
        Number.isFinite(Number(m.hips)) &&
        partes.length < 2
      ) {
        partes.push(`Quadril ${Number(m.hips).toFixed(1).replace(".", ",")} cm`);
      }
      feedCandidatos.push({
        id: `feed-med-${m.id}`,
        pacienteId: p.id,
        pacienteNome: p.fullName,
        pacienteRecordCode: p.recordCode,
        tipo: "MEDIDAS",
        titulo: "Medidas Corporais",
        resumo:
          partes.length > 0
            ? `Atualizou medidas: ${partes.join(" · ")}`
            : "Registrou atualização de circunferências",
        severidade: "normal",
        timestamp: ts,
      });
    }

    for (const w of workouts.slice(0, 15)) {
      const p = pacienteMap.get(w.patientId);
      const ts = toIsoSafe(w.date);
      if (!p || !ts) continue;
      feedCandidatos.push({
        id: `feed-treino-${w.id}`,
        pacienteId: p.id,
        pacienteNome: p.fullName,
        pacienteRecordCode: p.recordCode,
        tipo: "TREINO",
        titulo: "Treino Concluído",
        resumo: `Concluiu treino (${p.workoutType || "Atividade física"})`,
        severidade: "positivo",
        timestamp: ts,
      });
    }

    for (const h of hidratacoes.slice(0, 10)) {
      const p = pacienteMap.get(h.pacienteId);
      const ts = toIsoSafe(h.data);
      if (!p || !ts) continue;
      feedCandidatos.push({
        id: `feed-hidra-${h.id}`,
        pacienteId: p.id,
        pacienteNome: p.fullName,
        pacienteRecordCode: p.recordCode,
        tipo: "HIDRATACAO",
        titulo: "Hidratação",
        resumo: `Registrou +${Number(h.volumeMl) || 0} ml de água`,
        severidade: "normal",
        timestamp: ts,
      });
    }

    feedCandidatos.sort(
      (a, b) =>
        (parseDateSafe(b.timestamp)?.getTime() ?? 0) -
        (parseDateSafe(a.timestamp)?.getTime() ?? 0)
    );
    const liveFeed = feedCandidatos.slice(0, 10);

    const payload: TelemetriaDashboardResponse = {
      success: true,
      periodo,
      periodoLabel: janela.periodoLabel,
      diasJanela: janela.diasJanela,
      geradoEm: agora.toISOString(),
      resumo: {
        totalPacientesAtivos,
        ativosNoPeriodo,
        taxaEngajamento,
        indiceClinicoGlobal,
        pilaresIndice,
        consultasAgendadas: {
          hoje: consultasHoje,
          proximos7Dias: consultasProximos7Dias,
          proximas: proximasConsultas,
        },
      },
      impactoCorporal: {
        emagrecimento: {
          totalEliminadoKg: totalEliminadoAtual,
          mediaPorPacienteKg,
          maiorReducaoKg,
          maiorReducaoPacienteNome,
          pacientesComReducao: detalhesEmagrecimento.length,
          totalPacientesPerfil: totalPacientesEmagrecimento,
          periodoAnteriorKg: temBaseAnterior ? totalEliminadoAnterior : null,
          deltaAnteriorPct,
          temBaseAnterior,
          detalhes: detalhesEmagrecimento,
        },
        hipertrofia: {
          totalPacientesAtivos: totalPacientesHipertrofia,
          evolucaoPonderalMediaKg: avgOrNull(deltasPesoHipertrofia),
          pacientesComGanho: pacientesComGanhoHipertrofia,
          variacaoMediaCinturaCm: avgOrNull(deltasCinturaHip),
          variacaoMediaBracoCm: avgOrNull(deltasBracoHip),
          variacaoMediaCoxaCm: avgOrNull(deltasCoxaHip),
          detalhes: detalhesHipertrofia,
        },
      },
      serieAtividade,
      glicemia: {
        totalMedicoes: totalMedicoesGlic,
        mediaMgDl: mediaGlicMgDl,
        alertasCriticos: hipoCount + hiperCount,
        episodiosHipo: hipoCount,
        episodiosHiper: hiperCount,
        timeInRange: {
          hipoPct,
          metaPct: metaGlicPct,
          hiperPct,
        },
        sparkline: sparklineGlicemia,
        pacientesCriticos: pacientesCriticosGlicemia,
        detalhesPorPaciente: detalhesGlicemia,
      },
      dieta: {
        totalCheckins: totalCheckinsDieta,
        percentualAdesao: percentualAdesaoDieta,
        seguiuPct,
        trocaInteligentePct,
        naoFezPct,
        seguiuCount,
        trocaInteligenteCount: trocaCount,
        naoFezCount,
        opcionaisBonus: opcionaisBonusDieta,
        gargaloPrincipal,
        detalhesPorPaciente: detalhesDieta,
      },
      intestino: {
        totalRegistros: totalIntestino,
        distribuicao: {
          ideal: idealIntCount,
          constipacao: constipIntCount,
          diarreia: diarreiaIntCount,
          idealPct: idealIntPct,
          constipacaoPct: constipIntPct,
          diarreiaPct: diarreiaIntPct,
        },
        histograma,
        detalhesPorPaciente: detalhesIntestino,
      },
      hidratacaoETreinos: {
        hidratacao: {
          totalRegistros: hidratacoes.length,
          totalConsumidoL: round1(totalConsumidoMl / 1000),
          metaTotalL: round1(metaTotalHidratacaoMl / 1000),
          percentualAderencia: percentualHidratacao,
          pacientesRegistraram: hidraPorPaciente.size,
          detalhesPorPaciente: detalhesHidratacao,
        },
        treinos: {
          totalLogs: workouts.length,
          diasAtivosTotal: diasAtivosTreinosTotal,
          metaTotalEsperada: metaEsperadaTreinosTotal,
          percentualAdesao: percentualTreinos,
          pacientesAtivosTreino: detalhesTreinos.length,
          detalhesPorPaciente: detalhesTreinos,
        },
      },
      radarTriagem,
      liveFeed,
    };

    const totalDurMs = Math.round(performance.now() - reqStart);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Server-Timing": `db;dur=${dbDurMs};desc="Oracle ADB", total;dur=${totalDurMs}`,
      },
    });
  } catch (error: unknown) {
    console.error("[API_DASHBOARD_TELEMETRIA_GET_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Erro interno ao consolidar telemetria do Clinical Command Center.",
        details,
      },
      { status: 500 }
    );
  }
}
