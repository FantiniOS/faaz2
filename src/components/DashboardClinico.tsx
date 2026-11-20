"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Calendar,
  Check,
  ChevronRight,
  Droplets,
  Dumbbell,
  Gauge,
  HeartPulse,
  Radio,
  RefreshCw,
  RotateCcw,
  Ruler,
  Scale,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Utensils,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TopMenu } from "@/components/TopMenu";
import { ProntuarioModal } from "@/components/ProntuarioModal";
import { AnimatedCounter } from "@/components/dashboard/AnimatedCounter";
import {
  DrawerModuloKey,
  PacienteAtalhoProntuario,
  TelemetryDrawer,
} from "@/components/dashboard/TelemetryDrawer";
import type { PacienteCadastral } from "@/app/dashboard/pacientes/page";
import {
  getClientCache,
  invalidateClientCache,
  setClientCache,
} from "@/lib/client-swr-cache";
import { formatarHoraBR, getPartesDataHoraBR } from "@/lib/date-br";
import type {
  LiveFeedItem,
  PeriodoTelemetria,
  PontoSerieAtividade,
  TelemetriaDashboardResponse,
} from "@/types/dashboard-telemetria";

interface DashboardClinicoProps {
  user?: {
    userId?: string;
    nome?: string;
    cargo?: string;
    role?: string;
    email?: string;
  } | null;
  isLoadingUser?: boolean;
}

interface ModulosVisiveis {
  hero: boolean;
  glicemia_dieta: boolean;
  radar: boolean;
  bristol: boolean;
  hidratacao_treinos: boolean;
  live_feed: boolean;
}

const DEFAULT_MODULOS: ModulosVisiveis = {
  hero: true,
  glicemia_dieta: true,
  radar: true,
  bristol: true,
  hidratacao_treinos: true,
  live_feed: true,
};

const MODULOS_LABELS: Array<{ key: keyof ModulosVisiveis; label: string }> = [
  { key: "hero", label: "Hero • Índice Global & Pulso" },
  { key: "glicemia_dieta", label: "Telemetria Glicêmica & Adesão Dieta" },
  { key: "radar", label: "Radar de Triagem Clínica" },
  { key: "bristol", label: "Saúde Intestinal (Bristol 1–7)" },
  { key: "hidratacao_treinos", label: "Hidratação & Treinos" },
  { key: "live_feed", label: "Live Telemetry Stream" },
];

const PERIODOS_OPCOES: Array<{ key: PeriodoTelemetria; label: string }> = [
  { key: "hoje", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "mes", label: "Mês" },
];

const STORAGE_PREFS_KEY = "faaz_command_center_prefs_v1";

function pluralizar(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function getSaudacaoHora(): string {
  const h = getPartesDataHoraBR().hour;
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

function formatTempoRelativo(
  iso?: string | null,
  agoraMs: number | null = null
): string {
  if (!iso) return "Sem sinal";
  if (agoraMs === null) return "--";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "--";
  const diffMin = Math.max(0, Math.floor((agoraMs - dt.getTime()) / 60000));
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `há ${diffD}d`;
}

function formatHoraSincronizacao(iso?: string | null): string {
  return formatarHoraBR(iso, true);
}

function formatDeltaSinal(val: number | null, sufixo: string): string {
  if (val === null) return "Base inicial";
  const sinal = val > 0 ? "+" : "";
  return `${sinal}${val.toFixed(1).replace(".", ",")} ${sufixo}`;
}

/**
 * Container Bento Clinical Light com efeito hover spotlight radial sutil e entrada escalonada.
 */
function BentoCard({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const [spot, setSpot] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setSpot({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      visible: true,
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, delay, ease: [0.22, 1, 0.36, 1] }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setSpot((s) => ({ ...s, visible: false }))}
      className={`relative overflow-hidden rounded-2xl border bg-white border-slate-200/80 hover:border-emerald-300/80 shadow-xs hover:shadow-md transition-all ${className}`}
    >
      {spot.visible ? (
        <div
          className="pointer-events-none absolute -inset-px transition-opacity duration-300"
          style={{
            background: `radial-gradient(420px circle at ${spot.x}px ${spot.y}px, rgba(16, 185, 129, 0.055), transparent 55%)`,
          }}
        />
      ) : null}
      <div className="relative z-10 h-full flex flex-col">{children}</div>
    </motion.div>
  );
}

/**
 * Tooltip Clinical Light para a Curva de Pulso do Ecossistema.
 */
function PulseTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: PontoSerieAtividade }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0].payload;
  return (
    <div className="rounded-xl bg-white/95 backdrop-blur-md border border-slate-200 px-3.5 py-2.5 shadow-lg text-xs text-slate-800 min-w-[172px]">
      <div className="flex items-center justify-between gap-3 pb-1.5 mb-1.5 border-b border-slate-100">
        <span className="text-[11px] font-bold text-slate-700">
          {pt.dataLabel}
        </span>
        <span className="text-xs font-black font-mono text-emerald-600 tabular-nums">
          {pluralizar(pt.totalInteracoes, "sinal", "sinais")}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600">
        <span className="flex items-center justify-between">
          <span className="text-slate-500">Dieta</span>
          <strong className="font-mono text-emerald-600">{pt.dieta}</strong>
        </span>
        <span className="flex items-center justify-between">
          <span className="text-slate-500">Glicemia</span>
          <strong className="font-mono text-rose-600">{pt.glicemia}</strong>
        </span>
        <span className="flex items-center justify-between">
          <span className="text-slate-500">Bristol</span>
          <strong className="font-mono text-amber-600">{pt.intestino}</strong>
        </span>
        <span className="flex items-center justify-between">
          <span className="text-slate-500">Treinos</span>
          <strong className="font-mono text-teal-600">{pt.treinos}</strong>
        </span>
        <span className="flex items-center justify-between col-span-2">
          <span className="text-slate-500">Pesagens</span>
          <strong className="font-mono text-sky-600">{pt.pesagens}</strong>
        </span>
      </div>
    </div>
  );
}

/**
 * Tooltip Clinical Light para Histograma de Bristol.
 */
function BristolTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload: {
      tipo: string;
      rotulo: string;
      quantidade: number;
      zona: string;
    };
  }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  const zonaColor =
    item.zona === "Zona Ideal"
      ? "text-emerald-600"
      : item.zona === "Constipação"
        ? "text-amber-600"
        : "text-rose-600";
  return (
    <div className="rounded-xl bg-white/95 backdrop-blur-md border border-slate-200 px-3 py-2 shadow-lg text-xs text-slate-800">
      <p className="font-bold text-slate-900">
        {item.rotulo} · <span className={zonaColor}>{item.zona}</span>
      </p>
      <p className="text-[11px] text-slate-600 mt-0.5 font-mono tabular-nums">
        {pluralizar(item.quantidade, "registro", "registros")}
      </p>
    </div>
  );
}

function FeedEventIcon({ tipo }: { tipo: LiveFeedItem["tipo"] }) {
  switch (tipo) {
    case "GLICEMIA":
      return <HeartPulse className="w-3.5 h-3.5 text-rose-500" />;
    case "DIETA":
      return <Utensils className="w-3.5 h-3.5 text-emerald-600" />;
    case "INTESTINO":
      return <Activity className="w-3.5 h-3.5 text-amber-500" />;
    case "PESAGEM":
      return <Scale className="w-3.5 h-3.5 text-sky-600" />;
    case "MEDIDAS":
      return <Ruler className="w-3.5 h-3.5 text-indigo-500" />;
    case "TREINO":
      return <Dumbbell className="w-3.5 h-3.5 text-teal-600" />;
    case "HIDRATACAO":
    default:
      return <Droplets className="w-3.5 h-3.5 text-cyan-600" />;
  }
}

export function DashboardClinico({
  user,
  isLoadingUser = false,
}: DashboardClinicoProps) {
  const [mounted, setMounted] = useState(false);
  const [saudacaoHora, setSaudacaoHora] = useState<string>("Olá");
  const [agoraMs, setAgoraMs] = useState<number | null>(null);

  const [periodo, setPeriodo] = useState<PeriodoTelemetria>("30d");
  const [objetivoHero, setObjetivoHero] = useState<
    "emagrecimento" | "hipertrofia"
  >("emagrecimento");
  const [modulos, setModulos] = useState<ModulosVisiveis>(DEFAULT_MODULOS);
  const [isCustomizingOpen, setIsCustomizingOpen] = useState(false);

  // Inicialização 100% determinística idêntica ao SSR (cache SWR e localStorage hidratam em useEffect)
  const [dados, setDados] = useState<TelemetriaDashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const [drawerModulo, setDrawerModulo] = useState<DrawerModuloKey | null>(
    null
  );
  const [pacienteProntuario, setPacienteProntuario] =
    useState<PacienteCadastral | null>(null);

  const customizerRef = useRef<HTMLDivElement | null>(null);

  // Hidrata saudação horária, relógio relativo e preferências do localStorage somente após montagem no cliente
  useEffect(() => {
    let ativo = true;
    async function hydrateClientState() {
      await Promise.resolve();
      if (!ativo || typeof window === "undefined") return;
      setMounted(true);
      setSaudacaoHora(getSaudacaoHora());
      setAgoraMs(Date.now());
      try {
        const savedPrefs = window.localStorage.getItem(STORAGE_PREFS_KEY);
        if (savedPrefs) {
          const parsed = JSON.parse(savedPrefs) as Partial<ModulosVisiveis>;
          setModulos({ ...DEFAULT_MODULOS, ...parsed });
        }
      } catch {
        // Ignora preferências corrompidas
      }
    }
    void hydrateClientState();

    const clockTimer = setInterval(() => {
      if (!ativo) return;
      setSaudacaoHora(getSaudacaoHora());
      setAgoraMs(Date.now());
    }, 60_000);

    return () => {
      ativo = false;
      clearInterval(clockTimer);
    };
  }, []);

  // Fecha popover "Personalizar Painel" ao clicar fora
  useEffect(() => {
    if (!isCustomizingOpen) return;
    function handleOutside(e: MouseEvent) {
      if (
        customizerRef.current &&
        !customizerRef.current.contains(e.target as Node)
      ) {
        setIsCustomizingOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isCustomizingOpen]);

  const toggleModulo = useCallback((key: keyof ModulosVisiveis) => {
    setModulos((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        window.localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const resetModulos = useCallback(() => {
    setModulos(DEFAULT_MODULOS);
    try {
      window.localStorage.setItem(
        STORAGE_PREFS_KEY,
        JSON.stringify(DEFAULT_MODULOS)
      );
    } catch {
      // ignore
    }
  }, []);

  const carregarTelemetria = useCallback(
    async (modoRefresh: boolean = false, forceBypassCache: boolean = false) => {
      const cacheKey = `telemetria:${periodo}`;

      if (!forceBypassCache) {
        const cached = getClientCache<TelemetriaDashboardResponse>(cacheKey);
        if (cached) {
          setDados(cached.data);
          setIsLoading(false);
          if (cached.isFresh && !modoRefresh) {
            return;
          }
        }
      }

      try {
        if (modoRefresh || getClientCache(cacheKey)) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }
        setErroCarga(null);

        const res = await fetch(
          `/api/dashboard/telemetria?periodo=${encodeURIComponent(periodo)}`,
          {
            cache: "no-store",
            headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
          }
        );

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(
            errBody?.error ||
              "Não foi possível sincronizar a telemetria do Oracle ADB."
          );
        }

        const json = (await res.json()) as TelemetriaDashboardResponse;
        if (json?.success) {
          setClientCache(cacheKey, json);
          setDados(json);
        }
      } catch (err: unknown) {
        setErroCarga(
          err instanceof Error
            ? err.message
            : "Erro de comunicação com o servidor."
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [periodo]
  );

  // Carrega telemetria ao mudar o período (SWR 30s) + polling silencioso a cada 30s
  useEffect(() => {
    let ativo = true;

    async function fetchPeriodo() {
      await Promise.resolve();
      if (!ativo) return;
      await carregarTelemetria(false, false);
    }

    void fetchPeriodo();
    const timer = setInterval(() => {
      if (ativo) {
        void carregarTelemetria(true, true);
      }
    }, 30_000);

    return () => {
      ativo = false;
      clearInterval(timer);
    };
  }, [carregarTelemetria]);

  const handleOpenProntuario = useCallback((p: PacienteAtalhoProntuario) => {
    setDrawerModulo(null);
    setPacienteProntuario({
      id: p.id,
      recordCode: p.recordCode || undefined,
      nome: p.nome,
      cpf: p.cpf || "",
      telefoneWhatsapp: p.telefone || "",
      convenio: "Particular",
      status: "Ativo",
    });
  }, []);

  // Dados formatados para o Histograma Bristol 1–7
  const bristolChartData = useMemo(() => {
    const h = dados?.intestino.histograma;
    return [
      {
        tipo: "T1",
        rotulo: "Tipo 1",
        quantidade: h?.tipo1 ?? 0,
        zona: "Constipação",
        cor: "#f59e0b",
      },
      {
        tipo: "T2",
        rotulo: "Tipo 2",
        quantidade: h?.tipo2 ?? 0,
        zona: "Constipação",
        cor: "#f59e0b",
      },
      {
        tipo: "T3",
        rotulo: "Tipo 3",
        quantidade: h?.tipo3 ?? 0,
        zona: "Zona Ideal",
        cor: "#10b981",
      },
      {
        tipo: "T4",
        rotulo: "Tipo 4",
        quantidade: h?.tipo4 ?? 0,
        zona: "Zona Ideal",
        cor: "#10b981",
      },
      {
        tipo: "T5",
        rotulo: "Tipo 5",
        quantidade: h?.tipo5 ?? 0,
        zona: "Acelerado",
        cor: "#fb7185",
      },
      {
        tipo: "T6",
        rotulo: "Tipo 6",
        quantidade: h?.tipo6 ?? 0,
        zona: "Diarreia",
        cor: "#f43f5e",
      },
      {
        tipo: "T7",
        rotulo: "Tipo 7",
        quantidade: h?.tipo7 ?? 0,
        zona: "Diarreia",
        cor: "#e11d48",
      },
    ];
  }, [dados]);

  // Geometria do Anel Concêntrico SVG do Índice Clínico Global
  const globalScore = dados?.resumo.indiceClinicoGlobal ?? 0;
  const hasGlobalScore = dados?.resumo.indiceClinicoGlobal !== null && dados != null;
  const ringR = 50;
  const ringCirc = 2 * Math.PI * ringR;
  const ringOffset = ringCirc - (ringCirc * (hasGlobalScore ? globalScore : 0)) / 100;

  // Geometria do Donut da Dieta
  const dietaPerc = dados?.dieta.percentualAdesao ?? 0;
  const hasDietaData = (dados?.dieta.totalCheckins ?? 0) > 0;
  const dietaR = 32;
  const dietaCirc = 2 * Math.PI * dietaR;
  const dietaOffset = dietaCirc - (dietaCirc * (hasDietaData ? dietaPerc : 0)) / 100;

  // Geometria do Gauge Hídrico
  const hidraPerc = dados?.hidratacaoETreinos.hidratacao.percentualAderencia ?? 0;
  const hasHidraData =
    (dados?.hidratacaoETreinos.hidratacao.totalRegistros ?? 0) > 0;
  const hidraR = 38;
  const hidraCirc = 2 * Math.PI * hidraR;
  const hidraOffset = hidraCirc - (hidraCirc * (hasHidraData ? hidraPerc : 0)) / 100;

  const alertasAtivosCount = useMemo(() => {
    if (!dados) return 0;
    return dados.radarTriagem.filter(
      (r) => r.severidade === "CRITICO" || r.severidade === "ATENCAO"
    ).length;
  }, [dados]);

  const totalSinaisPeriodo = useMemo(() => {
    return (dados?.serieAtividade || []).reduce(
      (acc, p) => acc + p.totalInteracoes,
      0
    );
  }, [dados]);

  const nomeProfissional = user?.nome?.trim() || null;
  const saudacaoCompleta = !mounted
    ? "Olá"
    : isLoadingUser
      ? saudacaoHora
      : nomeProfissional
        ? `${saudacaoHora}, ${nomeProfissional}`
        : `${saudacaoHora} · Painel Clínico FAAZ`;

  const subText = "text-slate-500";
  const headingText = "text-slate-900";

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* BARRA SUPERIOR OFICIAL PRESERVADA (Início, Pacientes, Agenda, Configurações) */}
      <TopMenu activePath="/dashboard" />

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-5">
        {/* ================================================================ */}
        {/* 1. BARRA DE COMANDO SUPERIOR DO DASHBOARD                        */}
        {/* ================================================================ */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          {/* Esquerda: Saudação real + Badge AO VIVO ORACLE ADB */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest border bg-emerald-50 text-emerald-800 border-emerald-200">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span>AO VIVO • ORACLE ADB</span>
              </div>

              <span className={`text-[11px] font-mono tabular-nums ${subText}`}>
                Sincronizado{" "}
                {mounted && dados
                  ? formatHoraSincronizacao(dados.geradoEm)
                  : "--:--:--"}
              </span>

              <button
                type="button"
                onClick={() => {
                  invalidateClientCache("telemetria:");
                  void carregarTelemetria(true, true);
                }}
                disabled={isRefreshing}
                title="Atualizar telemetria agora"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border bg-white border-slate-200 text-slate-600 hover:text-emerald-700 hover:border-emerald-300 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                <RefreshCw
                  className={`w-3 h-3 ${isRefreshing ? "animate-spin text-emerald-600" : ""}`}
                />
                <span>Atualizar</span>
              </button>
            </div>

            <h1
              className={`text-xl sm:text-2xl font-extrabold tracking-tight ${headingText}`}
            >
              {saudacaoCompleta}
            </h1>
          </div>

          {/* Direita: Seletor de Período + Personalizar Painel */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Seletor Segmentado de Período com layoutId Framer Motion */}
            <div
              role="tablist"
              aria-label="Selecionar período da telemetria"
              className="inline-flex items-center p-1 rounded-xl border bg-white border-slate-200 shadow-2xs"
            >
              {PERIODOS_OPCOES.map((opt) => {
                const ativo = periodo === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="tab"
                    aria-selected={ativo}
                    onClick={() => setPeriodo(opt.key)}
                    className={`relative px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      ativo
                        ? "text-emerald-900"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {ativo ? (
                      <motion.span
                        layoutId="cmd-periodo-pill"
                        transition={{
                          type: "spring",
                          stiffness: 420,
                          damping: 32,
                        }}
                        className="absolute inset-0 rounded-lg bg-emerald-50 border border-emerald-200"
                      />
                    ) : null}
                    <span className="relative z-10">{opt.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Botão Personalizar Painel */}
            <div className="relative" ref={customizerRef}>
              <button
                type="button"
                onClick={() => setIsCustomizingOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  isCustomizingOpen
                    ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                    : "bg-white border-slate-200 text-slate-700 hover:border-emerald-300 shadow-2xs"
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Personalizar Painel</span>
              </button>

              <AnimatePresence>
                {isCustomizingOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.97 }}
                    transition={{ duration: 0.16 }}
                    className="absolute right-0 mt-2 w-72 rounded-2xl border p-3.5 shadow-xl z-40 bg-white border-slate-200 text-slate-900"
                  >
                    <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-slate-100">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                        Módulos Visíveis
                      </span>
                      <button
                        type="button"
                        onClick={resetModulos}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:underline cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Restaurar</span>
                      </button>
                    </div>
                    <div className="space-y-1">
                      {MODULOS_LABELS.map((m) => {
                        const checked = modulos[m.key];
                        return (
                          <button
                            key={m.key}
                            type="button"
                            onClick={() => toggleModulo(m.key)}
                            className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer hover:bg-slate-50 text-slate-700"
                          >
                            <span>{m.label}</span>
                            <span
                              className={`w-4.5 h-4.5 rounded-md flex items-center justify-center border ${
                                checked
                                  ? "bg-emerald-600 border-emerald-600 text-white"
                                  : "border-slate-300 bg-white"
                              }`}
                            >
                              {checked ? <Check className="w-3 h-3" /> : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Alerta de erro se houver falha de comunicação */}
        {erroCarga ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 flex items-center justify-between gap-3 text-xs text-rose-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{erroCarga}</span>
            </div>
            <button
              type="button"
              onClick={() => void carregarTelemetria(false)}
              className="px-3 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 font-bold text-rose-900 cursor-pointer"
            >
              Tentar novamente
            </button>
          </div>
        ) : null}

        {/* ================================================================ */}
        {/* 2. HERO CLINICAL LIGHT GLASS (FULL-WIDTH)                        */}
        {/* ================================================================ */}
        {modulos.hero ? (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white text-slate-900 shadow-[0_14px_40px_-22px_rgba(15,23,42,0.12)]"
          >
            {/* Aurora radial esmeralda/ciano claro ultra-sutil */}
            <div
              className="pointer-events-none absolute -top-28 -left-24 w-96 h-96 rounded-full blur-3xl"
              style={{
                background:
                  "radial-gradient(circle, rgba(16,185,129,0.13) 0%, rgba(20,184,166,0.05) 52%, transparent 74%)",
              }}
            />
            <div
              className="pointer-events-none absolute -bottom-32 right-12 w-96 h-96 rounded-full blur-3xl"
              style={{
                background:
                  "radial-gradient(circle, rgba(6,182,212,0.11) 0%, rgba(16,185,129,0.04) 52%, transparent 74%)",
              }}
            />

            <div className="relative z-10 p-5 sm:p-6 lg:p-7 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* HERO ESQUERDA: ANEL CONCÊNTRICO ÍNDICE CLÍNICO + EMAGRECIMENTO/HIPERTROFIA */}
              <div className="lg:col-span-5 flex flex-col justify-between gap-5 lg:pr-5 lg:border-r lg:border-slate-200/80">
                {/* Bloco 1: Índice Clínico Global */}
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setDrawerModulo("indice")}
                    className="relative w-[122px] h-[122px] shrink-0 group cursor-pointer"
                    title="Ver composição dos pilares do Índice Clínico Global"
                  >
                    <svg
                      viewBox="0 0 124 124"
                      className="w-full h-full -rotate-90"
                    >
                      <defs>
                        <linearGradient
                          id="globalIndexGrad"
                          x1="0%"
                          y1="0%"
                          x2="100%"
                          y2="100%"
                        >
                          <stop offset="0%" stopColor="#10b981" />
                          <stop offset="100%" stopColor="#14b8a6" />
                        </linearGradient>
                      </defs>
                      {/* Anel externo (track claro) */}
                      <circle
                        cx="62"
                        cy="62"
                        r={ringR}
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth="8"
                      />
                      {/* Anel interno concêntrico decorativo */}
                      <circle
                        cx="62"
                        cy="62"
                        r={39}
                        fill="none"
                        stroke="rgba(16,185,129,0.24)"
                        strokeWidth="1.5"
                        strokeDasharray="3 4"
                      />
                      {/* Arco animado de progresso */}
                      <motion.circle
                        cx="62"
                        cy="62"
                        r={ringR}
                        fill="none"
                        stroke="url(#globalIndexGrad)"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={ringCirc}
                        initial={{ strokeDashoffset: ringCirc }}
                        animate={{ strokeDashoffset: ringOffset }}
                        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                        Índice
                      </span>
                      {isLoading && !dados ? (
                        <span className="text-xl font-black font-mono text-slate-400">
                          --
                        </span>
                      ) : hasGlobalScore ? (
                        <AnimatedCounter
                          value={globalScore}
                          className="text-3xl font-black font-mono text-slate-900 leading-none mt-0.5"
                        />
                      ) : (
                        <span className="text-sm font-bold text-slate-400 mt-1">
                          Sem base
                        </span>
                      )}
                      <span className="text-[9px] text-slate-500 font-semibold mt-0.5 group-hover:text-emerald-600 transition-colors">
                        de 100
                      </span>
                    </div>
                  </button>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700">
                        Índice Clínico Global
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Média ponderada em tempo real dos pilares com atividade em{" "}
                      <strong className="text-slate-900">
                        {dados?.periodoLabel ?? "Últimos 30 dias"}
                      </strong>
                      .
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {(dados?.resumo.pilaresIndice || []).map((pl) => (
                        <span
                          key={pl.chave}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md border tabular-nums ${
                            pl.ativo
                              ? "bg-slate-50/90 border-slate-200/80 text-slate-700"
                              : "bg-slate-50/50 border-slate-200/60 text-slate-400"
                          }`}
                        >
                          {pl.rotulo.split(" ")[0]}:{" "}
                          {pl.ativo && pl.score !== null ? `${pl.score}%` : "—"}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bloco 2: Alternador Emagrecimento / Hipertrofia */}
                <div className="rounded-2xl bg-slate-50/90 border border-slate-200/80 p-4 space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex p-0.5 rounded-lg bg-slate-200/60 border border-slate-200/80">
                      {(["emagrecimento", "hipertrofia"] as const).map(
                        (modo) => {
                          const active = objetivoHero === modo;
                          return (
                            <button
                              key={modo}
                              type="button"
                              onClick={() => setObjetivoHero(modo)}
                              className={`relative px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                                active
                                  ? "text-emerald-800"
                                  : "text-slate-500 hover:text-slate-800"
                              }`}
                            >
                              {active ? (
                                <motion.span
                                  layoutId="hero-objetivo-pill"
                                  transition={{
                                    type: "spring",
                                    stiffness: 420,
                                    damping: 32,
                                  }}
                                  className="absolute inset-0 rounded-md bg-white border border-emerald-200/80 shadow-2xs"
                                />
                              ) : null}
                              <span className="relative z-10">
                                {modo === "emagrecimento"
                                  ? "Emagrecimento"
                                  : "Hipertrofia"}
                              </span>
                            </button>
                          );
                        }
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setDrawerModulo("impacto")}
                      className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
                    >
                      <span>Detalhes</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {objetivoHero === "emagrecimento" ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Peso Eliminado ({dados?.periodoLabel ?? "30d"})
                          </span>
                          <div className="flex items-baseline gap-1.5 mt-0.5">
                            <AnimatedCounter
                              value={
                                dados?.impactoCorporal.emagrecimento
                                  .totalEliminadoKg ?? 0
                              }
                              decimals={1}
                              suffix=" kg"
                              className="text-3xl font-black font-mono text-slate-900 tracking-tight"
                            />
                          </div>
                        </div>

                        {/* Comparativo 100% real (nunca mockado) */}
                        {dados?.impactoCorporal.emagrecimento.temBaseAnterior &&
                        dados.impactoCorporal.emagrecimento.deltaAnteriorPct !==
                          null ? (
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border tabular-nums ${
                              dados.impactoCorporal.emagrecimento
                                .deltaAnteriorPct >= 0
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                          >
                            {dados.impactoCorporal.emagrecimento
                              .deltaAnteriorPct >= 0 ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            <span>
                              {dados.impactoCorporal.emagrecimento
                                .deltaAnteriorPct > 0
                                ? "+"
                                : ""}
                              {
                                dados.impactoCorporal.emagrecimento
                                  .deltaAnteriorPct
                              }
                              % vs ciclo anterior
                            </span>
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-600">
                            1º ciclo • Base inicial
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/80">
                        <div>
                          <span className="text-[10px] text-slate-500 block">
                            Média/paciente
                          </span>
                          <span className="text-xs font-extrabold font-mono text-emerald-700 tabular-nums">
                            {(
                              dados?.impactoCorporal.emagrecimento
                                .mediaPorPacienteKg ?? 0
                            )
                              .toFixed(1)
                              .replace(".", ",")}{" "}
                            kg
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">
                            Maior redução
                          </span>
                          <span className="text-xs font-extrabold font-mono text-teal-700 tabular-nums">
                            {(
                              dados?.impactoCorporal.emagrecimento
                                .maiorReducaoKg ?? 0
                            )
                              .toFixed(1)
                              .replace(".", ",")}{" "}
                            kg
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">
                            Com redução
                          </span>
                          <span className="text-xs font-extrabold font-mono text-slate-900 tabular-nums">
                            {dados?.impactoCorporal.emagrecimento
                              .pacientesComReducao ?? 0}{" "}
                            pac.
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Evolução Ponderal Média (Hipertrofia)
                          </span>
                          <div className="flex items-baseline gap-2 mt-0.5">
                            {dados?.impactoCorporal.hipertrofia
                              .evolucaoPonderalMediaKg !== null &&
                            dados?.impactoCorporal.hipertrofia
                              .evolucaoPonderalMediaKg !== undefined ? (
                              <AnimatedCounter
                                value={
                                  dados.impactoCorporal.hipertrofia
                                    .evolucaoPonderalMediaKg
                                }
                                decimals={1}
                                prefix={
                                  dados.impactoCorporal.hipertrofia
                                    .evolucaoPonderalMediaKg > 0
                                    ? "+"
                                    : ""
                                }
                                suffix=" kg"
                                className="text-3xl font-black font-mono text-slate-900 tracking-tight"
                              />
                            ) : (
                              <span className="text-xl font-bold text-slate-600">
                                Base inicial
                              </span>
                            )}
                          </div>
                        </div>

                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-700 tabular-nums">
                          {pluralizar(
                            dados?.impactoCorporal.hipertrofia
                              .totalPacientesAtivos ?? 0,
                            "ativo no protocolo",
                            "ativos no protocolo"
                          )}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/80">
                        <div>
                          <span className="text-[10px] text-slate-500 block">
                            Com ganho
                          </span>
                          <span className="text-xs font-extrabold font-mono text-emerald-700 tabular-nums">
                            {dados?.impactoCorporal.hipertrofia
                              .pacientesComGanho ?? 0}{" "}
                            pac.
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">
                            Δ Braço médio
                          </span>
                          <span className="text-xs font-extrabold font-mono text-teal-700 tabular-nums">
                            {formatDeltaSinal(
                              dados?.impactoCorporal.hipertrofia
                                .variacaoMediaBracoCm ?? null,
                              "cm"
                            )}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">
                            Δ Cintura
                          </span>
                          <span className="text-xs font-extrabold font-mono text-slate-700 tabular-nums">
                            {formatDeltaSinal(
                              dados?.impactoCorporal.hipertrofia
                                .variacaoMediaCinturaCm ?? null,
                              "cm"
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* HERO CENTRO/DIREITA: CURVA DE PULSO DO ECOSSISTEMA + 4 MINI-CHIPS KPI */}
              <div className="lg:col-span-7 flex flex-col justify-between gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700">
                        Curva de Pulso do Ecossistema
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Volume real de interações diárias no App Mobile (Dieta,
                      Glicemia, Bristol, Treinos e Pesagens)
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black font-mono text-emerald-600 tabular-nums">
                      <AnimatedCounter value={totalSinaisPeriodo} />
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500 block">
                      {totalSinaisPeriodo === 1
                        ? "sinal no período"
                        : "sinais no período"}
                    </span>
                  </div>
                </div>

                {/* Area Chart Recharts */}
                <div className="h-[175px] w-full">
                  {dados && dados.serieAtividade.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={dados.serieAtividade}
                        margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="pulseAreaGrad"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#10b981"
                              stopOpacity={0.28}
                            />
                            <stop
                              offset="60%"
                              stopColor="#14b8a6"
                              stopOpacity={0.08}
                            />
                            <stop
                              offset="100%"
                              stopColor="#14b8a6"
                              stopOpacity={0.0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          stroke="#e2e8f0"
                          strokeDasharray="3 4"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="dataLabel"
                          tick={{ fill: "#94a3b8", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          minTickGap={22}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fill: "#94a3b8", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<PulseTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="totalInteracoes"
                          stroke="#059669"
                          strokeWidth={2.4}
                          fill="url(#pulseAreaGrad)"
                          activeDot={{
                            r: 5,
                            fill: "#059669",
                            stroke: "#ffffff",
                            strokeWidth: 2,
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 flex items-center justify-center text-xs text-slate-500">
                      {isLoading
                        ? "Sincronizando série temporal do Oracle ADB..."
                        : "Sem interações registradas no período."}
                    </div>
                  )}
                </div>

                {/* 4 Mini-Chips KPI */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setDrawerModulo("indice")}
                    className="text-left rounded-xl bg-white/80 hover:bg-emerald-50/40 border border-slate-200/80 hover:border-emerald-300/80 px-3 py-2.5 shadow-2xs transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <span>Pacientes Ativos</span>
                      <Users className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <div className="text-lg font-black font-mono text-slate-900 mt-1 tabular-nums">
                      <AnimatedCounter
                        value={dados?.resumo.totalPacientesAtivos ?? 0}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">
                      em acompanhamento
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDrawerModulo("indice")}
                    className="text-left rounded-xl bg-white/80 hover:bg-emerald-50/40 border border-slate-200/80 hover:border-emerald-300/80 px-3 py-2.5 shadow-2xs transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <span>Engajamento</span>
                      <Activity className="w-3.5 h-3.5 text-teal-600" />
                    </div>
                    <div className="text-lg font-black font-mono text-emerald-600 mt-1 tabular-nums">
                      <AnimatedCounter
                        value={dados?.resumo.taxaEngajamento ?? 0}
                        suffix="%"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 tabular-nums">
                      {pluralizar(
                        dados?.resumo.ativosNoPeriodo ?? 0,
                        "ativo no período",
                        "ativos no período"
                      )}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDrawerModulo("consultas")}
                    className="text-left rounded-xl bg-white/80 hover:bg-emerald-50/40 border border-slate-200/80 hover:border-emerald-300/80 px-3 py-2.5 shadow-2xs transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <span>Consultas 7D</span>
                      <Calendar className="w-3.5 h-3.5 text-sky-600" />
                    </div>
                    <div className="text-lg font-black font-mono text-slate-900 mt-1 tabular-nums">
                      <AnimatedCounter
                        value={
                          dados?.resumo.consultasAgendadas.proximos7Dias ?? 0
                        }
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 tabular-nums">
                      {pluralizar(
                        dados?.resumo.consultasAgendadas.hoje ?? 0,
                        "agendada hoje",
                        "agendadas hoje"
                      )}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDrawerModulo("radar")}
                    className={`text-left rounded-xl border px-3 py-2.5 shadow-2xs transition-all cursor-pointer ${
                      alertasAtivosCount > 0
                        ? "bg-rose-50/60 hover:bg-rose-50 border-rose-200/80 hover:border-rose-300"
                        : "bg-emerald-50/40 hover:bg-emerald-50/80 border-emerald-200/80 hover:border-emerald-300"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <span>Alertas Ativos</span>
                      <ShieldAlert
                        className={`w-3.5 h-3.5 ${
                          alertasAtivosCount > 0
                            ? "text-rose-500"
                            : "text-emerald-600"
                        }`}
                      />
                    </div>
                    <div
                      className={`text-lg font-black font-mono mt-1 tabular-nums ${
                        alertasAtivosCount > 0
                          ? "text-rose-600"
                          : "text-emerald-600"
                      }`}
                    >
                      <AnimatedCounter value={alertasAtivosCount} />
                    </div>
                    <span className="text-[10px] text-slate-500 tabular-nums">
                      {dados?.radarTriagem.length ?? 0} total no radar
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </motion.section>
        ) : null}

        {/* ================================================================ */}
        {/* 3. BENTO GRID ASSIMÉTRICO — LINHA 1 (8 COL + 4 COL)              */}
        {/* ================================================================ */}
        {modulos.glicemia_dieta || modulos.radar ? (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* ESQUERDA (8 COL): DUPLO CARD TÉCNICO — TELEMETRIA GLICÊMICA + ADESÃO ALIMENTAR */}
            {modulos.glicemia_dieta ? (
              <BentoCard
                delay={0.06}
                className={modulos.radar ? "lg:col-span-8" : "lg:col-span-12"}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200/80 h-full">
                  {/* SUB-CARD 1A: TELEMETRIA GLICÊMICA */}
                  <div className="p-5 flex flex-col justify-between gap-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <HeartPulse className="w-4 h-4 text-rose-500" />
                          <h2
                            className={`text-xs font-extrabold uppercase tracking-wider ${headingText}`}
                          >
                            Telemetria Glicêmica
                          </h2>
                        </div>
                        <p className={`text-[11px] mt-0.5 ${subText}`}>
                          Time-in-Range (70–180 mg/dL) ·{" "}
                          {pluralizar(
                            dados?.glicemia.totalMedicoes ?? 0,
                            "medição",
                            "medições"
                          )}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setDrawerModulo("glicemia")}
                        className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer shrink-0"
                      >
                        <span>Detalhes</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {dados && dados.glicemia.totalMedicoes > 0 ? (
                      <>
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="flex items-baseline gap-1.5">
                            <AnimatedCounter
                              value={dados.glicemia.mediaMgDl ?? 0}
                              className={`text-3xl font-black font-mono ${headingText}`}
                            />
                            <span className={`text-xs font-bold ${subText}`}>
                              mg/dL média
                            </span>
                          </div>
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border tabular-nums ${
                              dados.glicemia.alertasCriticos > 0
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                          >
                            {dados.glicemia.alertasCriticos > 0
                              ? pluralizar(
                                  dados.glicemia.alertasCriticos,
                                  "alerta",
                                  "alertas"
                                )
                              : "Sem alertas"}
                          </span>
                        </div>

                        {/* Barra espectral Time-in-Range */}
                        <div className="space-y-2">
                          <div className="h-3 w-full rounded-full overflow-hidden flex bg-slate-100">
                            {dados.glicemia.timeInRange.hipoPct > 0 ? (
                              <div
                                style={{
                                  width: `${dados.glicemia.timeInRange.hipoPct}%`,
                                }}
                                className="h-full bg-rose-500 transition-all"
                              />
                            ) : null}
                            {dados.glicemia.timeInRange.metaPct > 0 ? (
                              <div
                                style={{
                                  width: `${dados.glicemia.timeInRange.metaPct}%`,
                                }}
                                className="h-full bg-emerald-500 transition-all"
                              />
                            ) : null}
                            {dados.glicemia.timeInRange.hiperPct > 0 ? (
                              <div
                                style={{
                                  width: `${dados.glicemia.timeInRange.hiperPct}%`,
                                }}
                                className="h-full bg-amber-500 transition-all"
                              />
                            ) : null}
                          </div>

                          <div className="grid grid-cols-3 text-[11px] font-mono tabular-nums">
                            <span className="text-rose-600 font-bold">
                              &lt;70: {dados.glicemia.timeInRange.hipoPct}%
                            </span>
                            <span className="text-emerald-600 font-bold text-center">
                              70–180: {dados.glicemia.timeInRange.metaPct}%
                            </span>
                            <span className="text-amber-600 font-bold text-right">
                              &gt;180: {dados.glicemia.timeInRange.hiperPct}%
                            </span>
                          </div>
                        </div>

                        {/* Sparkline dos últimos registros reais */}
                        <div className="h-[72px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                              data={dados.glicemia.sparkline}
                              margin={{ top: 4, right: 2, left: 2, bottom: 0 }}
                            >
                              <defs>
                                <linearGradient
                                  id="glicSparkGrad"
                                  x1="0"
                                  y1="0"
                                  x2="0"
                                  y2="1"
                                >
                                  <stop
                                    offset="0%"
                                    stopColor="#f43f5e"
                                    stopOpacity={0.28}
                                  />
                                  <stop
                                    offset="100%"
                                    stopColor="#f43f5e"
                                    stopOpacity={0}
                                  />
                                </linearGradient>
                              </defs>
                              <Tooltip
                                content={({ active, payload }) => {
                                  if (!active || !payload?.length) return null;
                                  const d = payload[0].payload as {
                                    valor: number;
                                    momento: string;
                                    horaLabel: string;
                                    pacienteNome: string;
                                  };
                                  return (
                                    <div className="rounded-lg bg-white/95 backdrop-blur-md border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-900 shadow-lg">
                                      <p className="font-bold truncate max-w-[150px]">
                                        {d.pacienteNome}
                                      </p>
                                      <p className="font-mono text-rose-600 font-black">
                                        {d.valor} mg/dL · {d.momento}
                                      </p>
                                      <p className="text-[10px] text-slate-500">
                                        {d.horaLabel}
                                      </p>
                                    </div>
                                  );
                                }}
                              />
                              <Area
                                type="monotone"
                                dataKey="valor"
                                stroke="#f43f5e"
                                strokeWidth={2}
                                fill="url(#glicSparkGrad)"
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                        <HeartPulse className={`w-6 h-6 mb-2 ${subText}`} />
                        <p className={`text-xs font-semibold ${subText}`}>
                          Sem medições glicêmicas no período
                        </p>
                      </div>
                    )}
                  </div>

                  {/* SUB-CARD 1B: ADESÃO ALIMENTAR & TROCAS INTELIGENTES */}
                  <div className="p-5 flex flex-col justify-between gap-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Utensils className="w-4 h-4 text-emerald-600" />
                          <h2
                            className={`text-xs font-extrabold uppercase tracking-wider ${headingText}`}
                          >
                            Adesão Alimentar
                          </h2>
                        </div>
                        <p className={`text-[11px] mt-0.5 ${subText}`}>
                          Segui + Troca Inteligente = 100% ·{" "}
                          {pluralizar(
                            dados?.dieta.totalCheckins ?? 0,
                            "check-in",
                            "check-ins"
                          )}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setDrawerModulo("dieta")}
                        className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer shrink-0"
                      >
                        <span>Detalhes</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {dados && dados.dieta.totalCheckins > 0 ? (
                      <>
                        {/* Donut + Breakdown */}
                        <div className="flex items-center gap-4">
                          <div className="relative w-20 h-20 shrink-0">
                            <svg
                              viewBox="0 0 80 80"
                              className="w-full h-full -rotate-90"
                            >
                              <circle
                                cx="40"
                                cy="40"
                                r={dietaR}
                                fill="none"
                                stroke="#e2e8f0"
                                strokeWidth="7"
                              />
                              <motion.circle
                                cx="40"
                                cy="40"
                                r={dietaR}
                                fill="none"
                                stroke="#10b981"
                                strokeWidth="7"
                                strokeLinecap="round"
                                strokeDasharray={dietaCirc}
                                initial={{ strokeDashoffset: dietaCirc }}
                                animate={{ strokeDashoffset: dietaOffset }}
                                transition={{ duration: 0.75 }}
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span
                                className={`text-base font-black font-mono tabular-nums ${headingText}`}
                              >
                                {dados.dieta.percentualAdesao !== null
                                  ? `${dados.dieta.percentualAdesao}%`
                                  : "--"}
                              </span>
                            </div>
                          </div>

                          <div className="flex-1 space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                <span>Segui</span>
                              </span>
                              <span className="font-mono font-bold text-emerald-600 tabular-nums">
                                {dados.dieta.seguiuPct}% (
                                {dados.dieta.seguiuCount})
                              </span>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                                <span className="w-2 h-2 rounded-full bg-teal-500" />
                                <span>Troca Inteligente</span>
                              </span>
                              <span className="font-mono font-bold text-teal-600 tabular-nums">
                                {dados.dieta.trocaInteligentePct}% (
                                {dados.dieta.trocaInteligenteCount})
                              </span>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                                <span className="w-2 h-2 rounded-full bg-slate-300" />
                                <span>Não fiz</span>
                              </span>
                              <span
                                className={`font-mono font-bold tabular-nums ${subText}`}
                              >
                                {dados.dieta.naoFezPct}% (
                                {dados.dieta.naoFezCount})
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Barra segmentada */}
                        <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-slate-100">
                          <div
                            style={{ width: `${dados.dieta.seguiuPct}%` }}
                            className="h-full bg-emerald-500"
                          />
                          <div
                            style={{
                              width: `${dados.dieta.trocaInteligentePct}%`,
                            }}
                            className="h-full bg-teal-500"
                          />
                          <div
                            style={{ width: `${dados.dieta.naoFezPct}%` }}
                            className="h-full bg-slate-300"
                          />
                        </div>

                        {/* Indicador de Gargalo Real */}
                        <div
                          className={`rounded-xl px-3 py-2 border flex items-center justify-between gap-2 text-xs ${
                            dados.dieta.gargaloPrincipal
                              ? "bg-amber-50 border-amber-200 text-amber-800"
                              : "bg-emerald-50 border-emerald-200 text-emerald-800"
                          }`}
                        >
                          <span className="flex items-center gap-1.5 font-bold truncate">
                            <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">
                              {dados.dieta.gargaloPrincipal
                                ? `Gargalo: ${dados.dieta.gargaloPrincipal.label}`
                                : "Sem gargalos críticos"}
                            </span>
                          </span>
                          {dados.dieta.gargaloPrincipal ? (
                            <span className="font-mono text-[11px] font-extrabold shrink-0 tabular-nums">
                              {dados.dieta.gargaloPrincipal.percentualAdesao}%
                            </span>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                        <Utensils className={`w-6 h-6 mb-2 ${subText}`} />
                        <p className={`text-xs font-semibold ${subText}`}>
                          Sem check-ins de dieta no período
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </BentoCard>
            ) : null}

            {/* DIREITA (4 COL): RADAR DE TRIAGEM CLÍNICA */}
            {modulos.radar ? (
              <BentoCard
                delay={0.12}
                className={
                  modulos.glicemia_dieta ? "lg:col-span-4" : "lg:col-span-12"
                }
              >
                <div className="p-5 flex flex-col h-full gap-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-rose-500" />
                        <h2
                          className={`text-xs font-extrabold uppercase tracking-wider ${headingText}`}
                        >
                          Radar de Triagem
                        </h2>
                      </div>
                      <p className={`text-[11px] mt-0.5 ${subText}`}>
                        Pacientes priorizados que exigem atenção agora
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDrawerModulo("radar")}
                      className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer shrink-0"
                    >
                      <span>Detalhes</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {dados && dados.radarTriagem.length > 0 ? (
                    <div className="space-y-2 flex-1">
                      {dados.radarTriagem.slice(0, 4).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            handleOpenProntuario({
                              id: item.pacienteId,
                              nome: item.nome,
                              recordCode: item.recordCode,
                              cpf: item.cpf,
                              telefone: item.telefone,
                            })
                          }
                          className="w-full text-left rounded-xl p-3 border transition-all cursor-pointer group bg-slate-50/80 border-slate-200/90 hover:bg-emerald-50/40 hover:border-emerald-300"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border shrink-0 ${
                                  item.severidade === "CRITICO"
                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                    : item.severidade === "ATENCAO"
                                      ? "bg-amber-50 text-amber-700 border-amber-200"
                                      : "bg-slate-100 text-slate-600 border-slate-200"
                                }`}
                              >
                                {item.severidade}
                              </span>
                              <span
                                className={`text-xs font-bold truncate ${headingText}`}
                              >
                                {item.nome}
                              </span>
                            </div>
                            <ChevronRight
                              className={`w-3.5 h-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 ${subText}`}
                            />
                          </div>
                          <p
                            className={`text-[11px] font-semibold mt-1 truncate ${
                              item.severidade === "CRITICO"
                                ? "text-rose-600"
                                : item.severidade === "ATENCAO"
                                  ? "text-amber-700"
                                  : subText
                            }`}
                          >
                            {item.motivo}
                          </p>
                          <p className={`text-[10px] mt-0.5 ${subText}`}>
                            {formatTempoRelativo(item.ultimoSinalEm, agoraMs)}
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                      <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-2">
                        <Check className="w-5 h-5 text-emerald-600" />
                      </div>
                      <p className={`text-xs font-bold ${headingText}`}>
                        Nenhum alerta crítico ativo
                      </p>
                      <p className={`text-[11px] mt-0.5 ${subText}`}>
                        Todos os pacientes monitorados estão estáveis.
                      </p>
                    </div>
                  )}
                </div>
              </BentoCard>
            ) : null}
          </section>
        ) : null}

        {/* ================================================================ */}
        {/* 4. BENTO GRID ASSIMÉTRICO — LINHA 2 (4 COL + 4 COL + 4 COL)      */}
        {/* ================================================================ */}
        {modulos.bristol || modulos.hidratacao_treinos || modulos.live_feed ? (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* COL 1 (4 COL): SAÚDE INTESTINAL — HISTOGRAMA BRISTOL 1–7 */}
            {modulos.bristol ? (
              <BentoCard delay={0.16} className="lg:col-span-4">
                <div className="p-5 flex flex-col justify-between h-full gap-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-emerald-600" />
                        <h2
                          className={`text-xs font-extrabold uppercase tracking-wider ${headingText}`}
                        >
                          Saúde Intestinal (Bristol)
                        </h2>
                      </div>
                      <p className={`text-[11px] mt-0.5 ${subText}`}>
                        Distribuição Tipos 1–7 (T3–T4 ideal) ·{" "}
                        {pluralizar(
                          dados?.intestino.totalRegistros ?? 0,
                          "registro",
                          "registros"
                        )}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDrawerModulo("intestino")}
                      className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer shrink-0"
                    >
                      <span>Detalhes</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {dados && dados.intestino.totalRegistros > 0 ? (
                    <>
                      <div className="h-[155px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={bristolChartData}
                            margin={{ top: 8, right: 4, left: -26, bottom: 0 }}
                          >
                            <CartesianGrid
                              stroke="#e2e8f0"
                              strokeDasharray="3 4"
                              vertical={false}
                            />
                            <XAxis
                              dataKey="tipo"
                              tick={{ fill: "#94a3b8", fontSize: 10 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              allowDecimals={false}
                              tick={{ fill: "#94a3b8", fontSize: 10 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              cursor={{ fill: "rgba(15,23,42,0.04)" }}
                              content={<BristolTooltip />}
                            />
                            <Bar dataKey="quantidade" radius={[6, 6, 2, 2]}>
                              {bristolChartData.map((entry) => (
                                <Cell key={entry.tipo} fill={entry.cor} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-xl px-2.5 py-2 border text-center bg-emerald-50 border-emerald-200">
                          <span className="text-[10px] font-bold text-emerald-700 block">
                            Ideal (3–4)
                          </span>
                          <span className="text-sm font-black font-mono text-emerald-700 tabular-nums">
                            {dados.intestino.distribuicao.idealPct}%
                          </span>
                        </div>
                        <div className="rounded-xl px-2.5 py-2 border text-center bg-amber-50 border-amber-200">
                          <span className="text-[10px] font-bold text-amber-700 block">
                            Constip.
                          </span>
                          <span className="text-sm font-black font-mono text-amber-700 tabular-nums">
                            {dados.intestino.distribuicao.constipacaoPct}%
                          </span>
                        </div>
                        <div className="rounded-xl px-2.5 py-2 border text-center bg-rose-50 border-rose-200">
                          <span className="text-[10px] font-bold text-rose-700 block">
                            Diarreia
                          </span>
                          <span className="text-sm font-black font-mono text-rose-700 tabular-nums">
                            {dados.intestino.distribuicao.diarreiaPct}%
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                      <Activity className={`w-6 h-6 mb-2 ${subText}`} />
                      <p className={`text-xs font-semibold ${subText}`}>
                        Sem registros intestinais no período
                      </p>
                    </div>
                  )}
                </div>
              </BentoCard>
            ) : null}

            {/* COL 2 (4 COL): HIDRATAÇÃO & TREINOS */}
            {modulos.hidratacao_treinos ? (
              <BentoCard delay={0.2} className="lg:col-span-4">
                <div className="p-5 flex flex-col justify-between h-full gap-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Droplets className="w-4 h-4 text-cyan-600" />
                        <h2
                          className={`text-xs font-extrabold uppercase tracking-wider ${headingText}`}
                        >
                          Hidratação & Treinos
                        </h2>
                      </div>
                      <p className={`text-[11px] mt-0.5 ${subText}`}>
                        Hábitos metabólicos vs. metas reais da clínica
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDrawerModulo("hidratacao_treinos")}
                      className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer shrink-0"
                    >
                      <span>Detalhes</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Gauge Circular Hídrico */}
                  <div className="rounded-2xl p-3.5 border flex items-center gap-4 bg-slate-50/90 border-slate-200/80">
                    <div className="relative w-24 h-24 shrink-0">
                      <svg
                        viewBox="0 0 92 92"
                        className="w-full h-full -rotate-90"
                      >
                        <circle
                          cx="46"
                          cy="46"
                          r={hidraR}
                          fill="none"
                          stroke="#e2e8f0"
                          strokeWidth="7.5"
                        />
                        <motion.circle
                          cx="46"
                          cy="46"
                          r={hidraR}
                          fill="none"
                          stroke="#06b6d4"
                          strokeWidth="7.5"
                          strokeLinecap="round"
                          strokeDasharray={hidraCirc}
                          initial={{ strokeDashoffset: hidraCirc }}
                          animate={{ strokeDashoffset: hidraOffset }}
                          transition={{ duration: 0.8 }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span
                          className={`text-lg font-black font-mono tabular-nums ${headingText}`}
                        >
                          {hasHidraData ? `${hidraPerc}%` : "--"}
                        </span>
                        <span className="text-[9px] font-bold text-cyan-600 uppercase">
                          Água
                        </span>
                      </div>
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <p className={`text-xs font-extrabold ${headingText}`}>
                        Aderência Hídrica
                      </p>
                      {hasHidraData && dados ? (
                        <>
                          <p className="text-sm font-black font-mono text-cyan-700 tabular-nums">
                            {dados.hidratacaoETreinos.hidratacao.totalConsumidoL
                              .toFixed(1)
                              .replace(".", ",")}{" "}
                            L{" "}
                            <span
                              className={`text-[11px] font-semibold ${subText}`}
                            >
                              /{" "}
                              {dados.hidratacaoETreinos.hidratacao.metaTotalL
                                .toFixed(1)
                                .replace(".", ",")}{" "}
                              L
                            </span>
                          </p>
                          <p className={`text-[11px] ${subText}`}>
                            {pluralizar(
                              dados.hidratacaoETreinos.hidratacao
                                .pacientesRegistraram,
                              "paciente",
                              "pacientes"
                            )}{" "}
                            ·{" "}
                            {pluralizar(
                              dados.hidratacaoETreinos.hidratacao
                                .totalRegistros,
                              "registro",
                              "registros"
                            )}
                          </p>
                        </>
                      ) : (
                        <p className={`text-[11px] ${subText}`}>
                          Sem registros hídricos no período
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Barra de Adesão a Treinos */}
                  <div className="rounded-2xl p-3.5 border space-y-2.5 bg-slate-50/90 border-slate-200/80">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Dumbbell className="w-3.5 h-3.5 text-emerald-600" />
                        <span className={`text-xs font-extrabold ${headingText}`}>
                          Adesão aos Treinos
                        </span>
                      </div>
                      <span className="text-sm font-black font-mono text-emerald-600 tabular-nums">
                        {dados &&
                        dados.hidratacaoETreinos.treinos.percentualAdesao !==
                          null
                          ? `${dados.hidratacaoETreinos.treinos.percentualAdesao}%`
                          : "--"}
                      </span>
                    </div>

                    <div className="h-2.5 w-full rounded-full overflow-hidden bg-slate-200">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${
                            dados?.hidratacaoETreinos.treinos
                              .percentualAdesao ?? 0
                          }%`,
                        }}
                        transition={{ duration: 0.75 }}
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                      />
                    </div>

                    {dados && dados.hidratacaoETreinos.treinos.totalLogs > 0 ? (
                      <div
                        className={`flex items-center justify-between text-[11px] ${subText} tabular-nums`}
                      >
                        <span>
                          {dados.hidratacaoETreinos.treinos.diasAtivosTotal} /{" "}
                          {dados.hidratacaoETreinos.treinos.metaTotalEsperada}{" "}
                          {dados.hidratacaoETreinos.treinos
                            .metaTotalEsperada === 1
                            ? "dia ativo"
                            : "dias ativos"}
                        </span>
                        <span>
                          {
                            dados.hidratacaoETreinos.treinos
                              .pacientesAtivosTreino
                          }{" "}
                          pac. treinando
                        </span>
                      </div>
                    ) : (
                      <p className={`text-[11px] ${subText}`}>
                        Sem check-ins de treino no período
                      </p>
                    )}
                  </div>
                </div>
              </BentoCard>
            ) : null}

            {/* COL 3 (4 COL): LIVE TELEMETRY STREAM */}
            {modulos.live_feed ? (
              <BentoCard delay={0.24} className="lg:col-span-4">
                <div className="p-5 flex flex-col h-full gap-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Radio className="w-4 h-4 text-teal-600" />
                        <h2
                          className={`text-xs font-extrabold uppercase tracking-wider ${headingText}`}
                        >
                          Live Telemetry Stream
                        </h2>
                      </div>
                      <p className={`text-[11px] mt-0.5 ${subText}`}>
                        Últimos 10 sinais reais vindos do App Mobile
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDrawerModulo("live_feed")}
                      className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer shrink-0"
                    >
                      <span>Detalhes</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {dados && dados.liveFeed.length > 0 ? (
                    <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1">
                      {dados.liveFeed.map((ev) => (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() =>
                            handleOpenProntuario({
                              id: ev.pacienteId,
                              nome: ev.pacienteNome,
                              recordCode: ev.pacienteRecordCode,
                            })
                          }
                          className="w-full text-left rounded-xl px-3 py-2 border transition-all flex items-start gap-2.5 cursor-pointer group bg-slate-50/70 border-slate-200/80 hover:bg-emerald-50/40 hover:border-emerald-300"
                        >
                          <div className="mt-0.5 p-1.5 rounded-lg border shrink-0 bg-white border-slate-200">
                            <FeedEventIcon tipo={ev.tipo} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`text-xs font-bold truncate ${headingText}`}
                              >
                                {ev.pacienteNome}
                              </span>
                              <span
                                className={`text-[10px] font-mono shrink-0 ${subText}`}
                              >
                                {formatTempoRelativo(ev.timestamp, agoraMs)}
                              </span>
                            </div>
                            <p
                              className={`text-[11px] mt-0.5 truncate ${
                                ev.severidade === "critico"
                                  ? "text-rose-600 font-semibold"
                                  : subText
                              }`}
                            >
                              {ev.resumo}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                      <Radio className={`w-6 h-6 mb-2 ${subText}`} />
                      <p className={`text-xs font-semibold ${subText}`}>
                        Aguardando sinais do App Mobile neste período
                      </p>
                    </div>
                  )}
                </div>
              </BentoCard>
            ) : null}
          </section>
        ) : null}
      </main>

      {/* DRAWER LATERAL DE DRILL-DOWN POR PACIENTE */}
      <TelemetryDrawer
        modulo={drawerModulo}
        dados={dados}
        onClose={() => setDrawerModulo(null)}
        onOpenProntuario={handleOpenProntuario}
      />

      {/* PRONTUÁRIO COMPLETO ABERTO EM 1 CLIQUE SEM SAIR DO COMMAND CENTER */}
      {pacienteProntuario ? (
        <ProntuarioModal
          isOpen={Boolean(pacienteProntuario)}
          onClose={() => {
            setPacienteProntuario(null);
            invalidateClientCache("telemetria:");
            void carregarTelemetria(true, true);
          }}
          paciente={pacienteProntuario}
          currentUserCargo={user?.cargo || user?.role}
        />
      ) : null}
    </div>
  );
}
