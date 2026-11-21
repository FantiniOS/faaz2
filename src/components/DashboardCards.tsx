'use client';

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Droplets,
  Activity,
  TrendingUp,
  Moon,
  Scale,
  AlertTriangle,
  Tag,
  UserX,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";
import { DashboardWidgetConfig, ChartDataItem, AlertItem } from "@/mocks/dashboard";
import { getHoraBR } from "@/lib/date-br";
import { GlicemiaLiveSummary } from "@/components/AlertasGlicemicosModal";
import type { MetricaPesoEliminadoData } from "@/lib/metrica-peso-eliminado";

export interface SortableWidgetProps {
  widget: DashboardWidgetConfig;
  intestinoData?: BristolLiveSummary | null;
  hidratacaoData?: HidratacaoConsolidada | null;
  glicemiaData?: GlicemiaLiveSummary | null;
  metricaPesoData?: MetricaPesoEliminadoData | null;
  onOpenDetails?: (widgetId: string) => void;
}

export function SortableWidgetCard({
  widget,
  intestinoData,
  hidratacaoData,
  glicemiaData,
  metricaPesoData,
  onOpenDetails,
}: SortableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group ${
        isDragging
          ? "opacity-60 scale-102 z-30 shadow-2xl ring-2 ring-emerald-500 rounded-2xl"
          : ""
      }`}
    >
      <WidgetCard
        widget={widget}
        dragHandleProps={{ ...attributes, ...listeners }}
        intestinoData={intestinoData}
        hidratacaoData={hidratacaoData}
        glicemiaData={glicemiaData}
        metricaPesoData={metricaPesoData}
        onOpenDetails={onOpenDetails}
      />
    </div>
  );
}

export interface WidgetCardProps {
  widget: DashboardWidgetConfig;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  intestinoData?: BristolLiveSummary | null;
  hidratacaoData?: HidratacaoConsolidada | null;
  glicemiaData?: GlicemiaLiveSummary | null;
  metricaPesoData?: MetricaPesoEliminadoData | null;
  onOpenDetails?: (widgetId: string) => void;
}

export function WidgetCard({
  widget,
  dragHandleProps,
  intestinoData,
  hidratacaoData,
  glicemiaData,
  metricaPesoData,
  onOpenDetails,
}: WidgetCardProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let ativo = true;
    void Promise.resolve().then(() => {
      if (ativo) setMounted(true);
    });
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-xs hover:shadow-md transition-all duration-200 p-5 flex flex-col justify-between h-full min-h-[220px]">
      {/* CABEÇALHO DO CARD */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100/80">
        <div className="flex items-center gap-2.5">
          {getWidgetIcon(widget.tipo)}
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-bold text-slate-800 tracking-tight">
              {widget.titulo}
            </h3>
            {(widget.id === "alertas-glicemicos" ||
              widget.id === "escala-bristol" ||
              widget.id === "aderencia-hidrica" ||
              widget.id === "risco-evasao" ||
              widget.id === "engajamento-app") && (
              <span
                className="relative flex h-2 w-2"
                title="Sincronização em tempo real com Oracle"
              >
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
            )}
          </div>
        </div>

        {/* Alça de Arrastar (Drag Handle) */}
        <div
          {...dragHandleProps}
          className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 cursor-grab active:cursor-grabbing transition-colors touch-none"
          title="Segure e arraste para reordenar"
        >
          <GripVertical className="w-4 h-4" />
        </div>
      </div>

      {/* CORPO DO CARD DINÂMICO CONFORME O TIPO */}
      <div className="py-3 flex-1 flex flex-col justify-center">
        {renderWidgetContent(
          widget,
          mounted,
          intestinoData,
          hidratacaoData,
          glicemiaData,
          metricaPesoData
        )}
      </div>

      {/* RODAPÉ DO CARD COM AÇÃO DE DETALHES OU MODAL DE AUDITORIA */}
      <div className="pt-2.5 border-t border-slate-50 flex items-center justify-between text-[11px] text-slate-400">
        <span className="font-medium">Módulo EnDoc</span>
        {onOpenDetails &&
        (widget.id === "alertas-glicemicos" ||
          widget.id === "escala-bristol" ||
          widget.id === "aderencia-hidrica") ? (
          <button
            type="button"
            onClick={() => onOpenDetails(widget.id)}
            className="text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-0.5 group/btn transition-colors cursor-pointer"
            title={`Abrir detalhes de ${widget.titulo}`}
          >
            <span>Detalhes</span>
            <ChevronRight className="w-3 h-3 transition-transform group-hover/btn:translate-x-0.5" />
          </button>
        ) : (
          <Link
            href={getWidgetDetailRoute(widget.id)}
            className="text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-0.5 group/btn transition-colors"
            title={`Ver detalhes de ${widget.titulo}`}
          >
            <span>Detalhes</span>
            <ChevronRight className="w-3 h-3 transition-transform group-hover/btn:translate-x-0.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

// Mapeia o ID de cada métrica para sua rota de detalhamento clínico
function getWidgetDetailRoute(widgetId: string): string {
  switch (widgetId) {
    case "escala-bristol":
      return "/dashboard/pacientes?modulo=bristol";
    case "aderencia-hidrica":
      return "/dashboard/pacientes?modulo=hidrico";
    case "qualidade-sono":
      return "/dashboard/pacientes?modulo=sono";
    case "alertas-glicemicos":
      return "/dashboard/pacientes?filtro=Diabetes&status=alerta";
    case "evolucao-peso":
      return "/dashboard/pacientes?filtro=Emagrecimento";
    case "risco-evasao":
      return "/dashboard/pacientes?filtro=Em+Risco+no+App";
    case "engajamento-app":
      return "/dashboard/pacientes?status=ativo";
    case "sintomas-frequentes":
      return "/dashboard/pacientes?modulo=sintomas";
    default:
      return `/dashboard/pacientes?modulo=${encodeURIComponent(widgetId)}`;
  }
}

export interface CheckinDbItem {
  id: string;
  pacienteId: string;
  pacienteNome?: string;
  tipoBristol: number;
  categoria: string;
  sintomas: string[];
  data: string;
}

export interface BristolLiveSummary {
  countHoje: number;
  countIdealHoje: number;
  countConstipacaoHoje: number;
  countDiarreiaHoje: number;
  ultimoRegistroHoje: CheckinDbItem | null;
  registrosHoje: CheckinDbItem[];
}

export const bristolLabels: Record<number, string> = {
  1: "Constipação Severa",
  2: "Constipação Leve",
  3: "Fisiológico Regular",
  4: "Normofisiológico Ideal ⭐",
  5: "Digestão Rápida",
  6: "Diarreia Leve",
  7: "Diarreia Líquida",
};

// Componente DINÂMICO em tempo real para o card de Saúde Intestinal no grid
function LiveBristolCardContent({
  mounted,
  liveData,
}: {
  mounted: boolean;
  liveData?: BristolLiveSummary | null;
}) {
  const [internalData, setInternalData] = useState<BristolLiveSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [justUpdated, setJustUpdated] = useState<boolean>(false);
  const prevIdRef = useRef<string | null>(null);

  const fetchLiveCheckins = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setIsLoading(true);
      // Sem filtro restritivo de paciente: consolida os registros de hoje de toda a clínica
      const res = await fetch("/api/checkins/intestino?limit=20", {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      if (!res.ok) return;

      const json = await res.json();
      if (json.success) {
        const registros = (json.registrosHoje || json.data || []) as CheckinDbItem[];
        const summary: BristolLiveSummary = {
          countHoje: json.countHoje ?? registros.length,
          countIdealHoje:
            json.countIdealHoje ??
            registros.filter((r) => r.categoria === "ideal").length,
          countConstipacaoHoje:
            json.countConstipacaoHoje ??
            registros.filter((r) => r.categoria === "constipacao").length,
          countDiarreiaHoje:
            json.countDiarreiaHoje ??
            registros.filter((r) => r.categoria === "diarreia").length,
          ultimoRegistroHoje:
            json.ultimoRegistroHoje ??
            (registros.length > 0 ? registros[0] : null),
          registrosHoje: registros,
        };

        if (
          summary.ultimoRegistroHoje &&
          prevIdRef.current &&
          prevIdRef.current !== summary.ultimoRegistroHoje.id
        ) {
          setJustUpdated(true);
          setTimeout(() => setJustUpdated(false), 3000);
        }
        if (summary.ultimoRegistroHoje) {
          prevIdRef.current = summary.ultimoRegistroHoje.id;
        }

        setInternalData(summary);
      }
    } catch (err) {
      console.error("[LiveBristolCardContent] Erro no polling:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Notifica flash visual quando liveData vier do pai com ID novo
  useEffect(() => {
    if (liveData?.ultimoRegistroHoje) {
      if (
        prevIdRef.current &&
        prevIdRef.current !== liveData.ultimoRegistroHoje.id
      ) {
        setJustUpdated(true);
        setTimeout(() => setJustUpdated(false), 3000);
      }
      prevIdRef.current = liveData.ultimoRegistroHoje.id;
    }
  }, [liveData]);

  // Busca apenas 1 vez caso o componente seja usado isoladamente sem liveData do DashboardPage
  useEffect(() => {
    if (typeof window === "undefined" || liveData !== undefined) return;
    let ativo = true;
    void Promise.resolve().then(() => {
      if (ativo) void fetchLiveCheckins(true);
    });
    return () => {
      ativo = false;
    };
  }, [fetchLiveCheckins, liveData]);

  // Se liveData foi provido pelo DashboardPage (unificado), dá precedência a ele
  const currentSummary = liveData || internalData;

  if (!mounted) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-12 bg-slate-100 rounded-xl" />
        <div className="h-3 bg-slate-100 rounded-full w-3/4" />
      </div>
    );
  }

  const total = currentSummary?.countHoje ?? 0;
  const idealCount = currentSummary?.countIdealHoje ?? 0;
  const constipacaoCount = currentSummary?.countConstipacaoHoje ?? 0;
  const diarreiaCount = currentSummary?.countDiarreiaHoje ?? 0;

  const idealPct = total > 0 ? Math.round((idealCount / total) * 100) : 0;
  const constipacaoPct =
    total > 0 ? Math.round((constipacaoCount / total) * 100) : 0;
  const diarreiaPct =
    total > 0 ? Math.max(0, 100 - idealPct - constipacaoPct) : 0;

  const latest = currentSummary?.ultimoRegistroHoje;

  let hora = "--:--";
  if (latest?.data) {
    hora = getHoraBR(latest.data);
  }

  const isIdeal = latest?.categoria === "ideal";
  const isConstipacao = latest?.categoria === "constipacao";

  return (
    <div
      className={`space-y-3 transition-all duration-300 ${
        justUpdated ? "scale-[1.02] ring-2 ring-emerald-400 rounded-xl p-1" : ""
      }`}
    >
      {/* 1. LINHA DO ÚLTIMO CHECK-IN REAL RECEBIDO HOJE */}
      {latest ? (
        <div className="flex items-center gap-3 bg-slate-50/70 border border-slate-100/90 rounded-xl p-2.5">
          {/* Bloco Tipo Bristol */}
          <div
            className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 shadow-2xs ${
              isIdeal
                ? "bg-emerald-600 text-white"
                : isConstipacao
                ? "bg-amber-500 text-white animate-pulse"
                : "bg-rose-600 text-white animate-pulse"
            }`}
          >
            <span className="text-[8px] uppercase font-bold tracking-tight opacity-80">
              Tipo
            </span>
            <span className="text-lg font-black leading-none">
              {latest.tipoBristol}
            </span>
          </div>

          {/* Detalhes do Registro com Nome e Horário */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span
                className="text-xs font-bold text-slate-800 truncate"
                title={latest.pacienteNome}
              >
                {latest.pacienteNome || "Paciente Mobile"}
              </span>
              {justUpdated && (
                <span className="text-[9px] font-black bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full animate-bounce shrink-0">
                  Novo!
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
              <Clock className="w-3 h-3 text-slate-400 shrink-0" />
              <span>Hoje às {hora}</span>
              <span className="text-slate-300">•</span>
              <span
                className={`font-semibold ${
                  isIdeal
                    ? "text-emerald-700"
                    : isConstipacao
                    ? "text-amber-700"
                    : "text-rose-700"
                }`}
              >
                {bristolLabels[latest.tipoBristol] || `Bristol ${latest.tipoBristol}`}
              </span>
            </div>

            {/* Sintomas imediatos se reportados */}
            {latest.sintomas && latest.sintomas.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {latest.sintomas.map((s, idx) => (
                  <span
                    key={idx}
                    className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                      isConstipacao
                        ? "bg-amber-100/90 text-amber-900 border border-amber-200"
                        : "bg-rose-100/90 text-rose-900 border border-rose-200"
                    }`}
                  >
                    ⚠️ {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 bg-slate-50 border border-dashed border-slate-200 rounded-xl p-2.5 text-xs text-slate-500">
          <Clock className="w-4 h-4 text-slate-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-semibold block text-slate-700">Sem registros hoje</span>
            <span className="text-[11px] text-slate-400">Aguardando check-in via App Mobile</span>
          </div>
        </div>
      )}

      {/* 2. CONTADORES REAIS DO DIA (IDEAL | CONSTIPAÇÃO | DIARREIA) */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="bg-emerald-50/80 border border-emerald-100 rounded-lg py-1 px-1.5 text-center">
          <span className="text-[9px] font-bold text-emerald-700 block uppercase tracking-tight">
            Ideal
          </span>
          <span className="text-base font-black text-emerald-800">
            {idealCount}
          </span>
        </div>
        <div className="bg-amber-50/80 border border-amber-100 rounded-lg py-1 px-1.5 text-center">
          <span className="text-[9px] font-bold text-amber-700 block uppercase tracking-tight">
            Constip.
          </span>
          <span className="text-base font-black text-amber-800">
            {constipacaoCount}
          </span>
        </div>
        <div className="bg-rose-50/80 border border-rose-100 rounded-lg py-1 px-1.5 text-center">
          <span className="text-[9px] font-bold text-rose-700 block uppercase tracking-tight">
            Diarr.
          </span>
          <span className="text-base font-black text-rose-800">
            {diarreiaCount}
          </span>
        </div>
      </div>

      {/* 3. BARRA SEGMENTADA DE PROPORÇÃO DIÁRIA */}
      <div className="space-y-1 pt-0.5">
        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden flex shadow-inner">
          {idealPct > 0 && (
            <div
              style={{ width: `${idealPct}%` }}
              className="bg-emerald-500 h-full transition-all duration-500"
              title={`Ideal: ${idealPct}% (${idealCount})`}
            />
          )}
          {constipacaoPct > 0 && (
            <div
              style={{ width: `${constipacaoPct}%` }}
              className="bg-amber-400 h-full transition-all duration-500"
              title={`Constipação: ${constipacaoPct}% (${constipacaoCount})`}
            />
          )}
          {diarreiaPct > 0 && (
            <div
              style={{ width: `${diarreiaPct}%` }}
              className="bg-rose-500 h-full transition-all duration-500"
              title={`Diarreia: ${diarreiaPct}% (${diarreiaCount})`}
            />
          )}
          {total === 0 && <div className="w-full bg-slate-200/50 h-full" />}
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium pt-0.5">
          <span>🔄 Reset às 00:00</span>
          <span className="font-bold text-slate-700">
            Total hoje: {total} {total === 1 ? "registro" : "registros"}
          </span>
        </div>
      </div>
    </div>
  );
}

export interface HidratacaoConsolidada {
  totalConsumidoHojeL: number;
  metaTotalHojeL: number;
  percentualAderencia: number;
  pacientesAtivosProtocolo: number;
  pacientesQueRegistraramHoje: number;
  totalRegistrosHoje: number;
  engajamentoApp?: {
    percentual: number;
    pacientesEngajados7d: number;
    totalPacientesAtivos: number;
  };
  riscoEvasao?: {
    pacientesEmRisco: number;
    totalPacientesAtivos: number;
  };
}

// Componente DINÂMICO em tempo real para o card de Aderência Hídrica no grid
function LiveHidratacaoCardContent({
  mounted,
  liveData,
}: {
  mounted: boolean;
  liveData?: HidratacaoConsolidada | null;
}) {
  const [data, setData] = useState<HidratacaoConsolidada>({
    totalConsumidoHojeL: 0,
    metaTotalHojeL: 0,
    percentualAderencia: 0,
    pacientesAtivosProtocolo: 0,
    pacientesQueRegistraramHoje: 0,
    totalRegistrosHoje: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [justUpdated, setJustUpdated] = useState<boolean>(false);
  const prevTotalRef = useRef<number | null>(null);

  const fetchLiveHidratacao = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setIsLoading(true);
      const res = await fetch("/api/checkins/hidratacao", {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      if (!res.ok) return;

      const json = await res.json();
      if (json.success && typeof json.totalConsumidoHojeL === "number") {
        if (
          prevTotalRef.current !== null &&
          prevTotalRef.current !== json.totalConsumidoHojeL
        ) {
          setJustUpdated(true);
          setTimeout(() => setJustUpdated(false), 3000);
        }
        prevTotalRef.current = json.totalConsumidoHojeL;
        setData({
          totalConsumidoHojeL: json.totalConsumidoHojeL,
          metaTotalHojeL: json.metaTotalHojeL ?? 0,
          percentualAderencia: json.percentualAderencia ?? 0,
          pacientesAtivosProtocolo: json.pacientesAtivosProtocolo ?? 0,
          pacientesQueRegistraramHoje: json.pacientesQueRegistraramHoje ?? 0,
          totalRegistrosHoje: json.totalRegistrosHoje ?? 0,
          engajamentoApp: json.engajamentoApp,
          riscoEvasao: json.riscoEvasao,
        });
      }
    } catch (err) {
      console.error("[LiveHidratacaoCardContent] Erro no polling:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (liveData?.totalConsumidoHojeL !== undefined) {
      if (
        prevTotalRef.current !== null &&
        prevTotalRef.current !== liveData.totalConsumidoHojeL
      ) {
        setJustUpdated(true);
        setTimeout(() => setJustUpdated(false), 3000);
      }
      prevTotalRef.current = liveData.totalConsumidoHojeL;
    }
  }, [liveData]);

  // Busca apenas 1 vez caso o componente seja usado isoladamente sem liveData do DashboardPage
  useEffect(() => {
    if (typeof window === "undefined" || liveData !== undefined) return;
    let ativo = true;
    void Promise.resolve().then(() => {
      if (ativo) void fetchLiveHidratacao(true);
    });
    return () => {
      ativo = false;
    };
  }, [fetchLiveHidratacao, liveData]);

  const activeData = liveData || data;

  if (!mounted) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-8 bg-slate-100 rounded-lg w-1/2" />
        <div className="h-2.5 bg-slate-100 rounded-full w-full" />
      </div>
    );
  }

  const {
    totalConsumidoHojeL,
    metaTotalHojeL,
    percentualAderencia,
    pacientesAtivosProtocolo,
    pacientesQueRegistraramHoje,
    totalRegistrosHoje,
  } = activeData;

  return (
    <div
      className={`space-y-3 transition-all duration-300 ${
        justUpdated ? "scale-[1.02] ring-2 ring-cyan-400 rounded-xl p-1" : ""
      }`}
    >
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {percentualAderencia}%
          </span>
          <span className="text-xs text-slate-400 font-medium">
            adesão da base hoje
          </span>
          {justUpdated && (
            <span className="text-[9px] font-black bg-cyan-100 text-cyan-800 px-1.5 py-0.2 rounded-full animate-bounce">
              +Água!
            </span>
          )}
        </div>

        <span
          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
            percentualAderencia >= 80
              ? "bg-emerald-50 text-emerald-700"
              : percentualAderencia >= 40
              ? "bg-cyan-50 text-cyan-700"
              : "bg-amber-50 text-amber-700"
          }`}
          title={`${pacientesQueRegistraramHoje} pacientes registraram ingestão de água hoje de uma base de ${pacientesAtivosProtocolo} pacientes no protocolo`}
        >
          <Droplets className="w-3 h-3 text-cyan-600" />
          <span>
            {pacientesQueRegistraramHoje}/{pacientesAtivosProtocolo} pac.
          </span>
        </span>
      </div>

      {/* Barra de progresso circular simulada / linear gauge dinâmico */}
      <div className="space-y-1.5">
        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
          <div
            className="bg-gradient-to-r from-cyan-500 to-emerald-500 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, percentualAderencia)}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-slate-400 font-medium">
          <span>0L</span>
          <span className="text-cyan-800 font-extrabold tracking-tight">
            {totalConsumidoHojeL}L / {metaTotalHojeL}L
          </span>
          <span>{metaTotalHojeL}L Meta</span>
        </div>
      </div>

      {/* Micro-legenda de transparência da regra de negócio */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium pt-0.5">
        <span>🔄 Reset diário à meia-noite</span>
        <span>
          {totalRegistrosHoje}{" "}
          {totalRegistrosHoje === 1 ? "registro hoje" : "registros hoje"}
        </span>
      </div>
    </div>
  );
}

// Retorna o ícone e fundo semântico por tipo de widget
function getWidgetIcon(tipo: DashboardWidgetConfig["tipo"]) {
  switch (tipo) {
    case "gauge":
      return (
        <div className="w-8 h-8 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center">
          <Droplets className="w-4 h-4" />
        </div>
      );
    case "bar":
      return (
        <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <Activity className="w-4 h-4" />
        </div>
      );
    case "trend":
      return (
        <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
          <TrendingUp className="w-4 h-4" />
        </div>
      );
    case "line":
      return (
        <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
          <Moon className="w-4 h-4" />
        </div>
      );
    case "area":
      return (
        <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <Scale className="w-4 h-4" />
        </div>
      );
    case "alert-list":
      return (
        <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
          <AlertTriangle className="w-4 h-4" />
        </div>
      );
    case "tags":
      return (
        <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
          <Tag className="w-4 h-4" />
        </div>
      );
    case "alert-number":
      return (
        <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
          <UserX className="w-4 h-4" />
        </div>
      );
    default:
      return (
        <div className="w-8 h-8 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center">
          <Activity className="w-4 h-4" />
        </div>
      );
  }
}

// Renderizador visual específico para cada tipo de card
function renderWidgetContent(
  widget: DashboardWidgetConfig,
  mounted: boolean,
  intestinoData?: BristolLiveSummary | null,
  hidratacaoData?: HidratacaoConsolidada | null,
  glicemiaData?: GlicemiaLiveSummary | null,
  metricaPesoData?: MetricaPesoEliminadoData | null
) {
  switch (widget.tipo) {
    /* 1. GAUGE / ADERÊNCIA HÍDRICA */
    case "gauge": {
      return (
        <LiveHidratacaoCardContent
          mounted={mounted}
          liveData={hidratacaoData}
        />
      );
    }

    /* 2. BAR / SAÚDE INTESTINAL (BRISTOL) */
    case "bar": {
      return (
        <LiveBristolCardContent
          mounted={mounted}
          liveData={intestinoData}
        />
      );
    }

    /* 3. TREND / ENGAJAMENTO NO APP (Cálculo Real 7d / Total Ativos) */
    case "trend": {
      const engajamento = hidratacaoData?.engajamentoApp;
      const percentual = engajamento ? engajamento.percentual : 0;
      const engajados = engajamento ? engajamento.pacientesEngajados7d : 0;
      const totalAtivos = engajamento ? engajamento.totalPacientesAtivos : 0;

      return (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {percentual}%
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full">
              {engajados}/{totalAtivos} ativos (7d)
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, percentual)}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Proporção real de pacientes ativos com check-in alimentar ou hídrico nos últimos 7 dias.
          </p>
        </div>
      );
    }

    /* 4. AREA / EVOLUÇÃO DE PESO (MÉDIA REAL) */
    case "area": {
      const mediaPerda = metricaPesoData?.mediaPerdaKg ?? 0;
      const pacientesComPerda = metricaPesoData?.pacientesComPerda ?? 0;
      const totalAtivos = metricaPesoData?.totalPacientesAtivos ?? 0;

      return (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-extrabold text-emerald-600 tracking-tight">
                {mediaPerda > 0 ? `-${mediaPerda.toFixed(1)}kg` : "0.0kg"}
              </span>
              <span className="text-xs text-slate-400 font-medium">média por paciente</span>
            </div>
            <span className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
              <ArrowDownRight className="w-3 h-3" /> {pacientesComPerda}/{totalAtivos} pac.
            </span>
          </div>

          <p className="text-xs text-slate-500 font-medium">
            {pacientesComPerda > 0
              ? `Média calculada sobre ${pacientesComPerda} paciente(s) com perda ponderal registrada no mês.`
              : "Aguardando registros de evolução ponderal no mês corrente."}
          </p>
        </div>
      );
    }

    /* 5. ALERT-LIST / ALERTAS GLICÊMICOS */
    case "alert-list": {
      const alertasCriticos = glicemiaData?.alertasHoje || [];
      const totalAlertas = glicemiaData?.totalAlertasHoje ?? alertasCriticos.length;

      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1 pb-0.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-rose-600 tracking-tight leading-none">
                {totalAlertas}
              </span>
              <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                {totalAlertas === 1 ? "Alerta Crítico" : "Alertas Críticos"}
              </span>
            </div>
            <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-full">
              &lt; 70 ou &gt; 180 mg/dL
            </span>
          </div>

          {alertasCriticos.length > 0 ? (
            alertasCriticos.slice(0, 2).map((alerta) => (
              <div
                key={alerta.id}
                className="bg-rose-50/80 border border-rose-100 rounded-xl p-2.5 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
                  <div className="min-w-0">
                    <span className="font-bold text-slate-800 block truncate">
                      {alerta.pacienteNome}
                    </span>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 truncate">
                      <Clock className="w-2.5 h-2.5 shrink-0" />
                      <span>
                        {alerta.momentoLegivel} • {alerta.horario}
                      </span>
                    </div>
                  </div>
                </div>

                <span className="font-extrabold text-rose-700 bg-white border border-rose-200 px-2 py-0.5 rounded-md shadow-2xs shrink-0 ml-2">
                  {alerta.valor} mg/dL
                </span>
              </div>
            ))
          ) : (
            <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-3 text-center">
              <span className="text-xs font-bold text-emerald-800 block">
                Nenhum alerta crítico hoje
              </span>
              <span className="text-[10px] text-emerald-600 font-medium">
                Todos os check-ins entre 70 e 180 mg/dL
              </span>
            </div>
          )}
        </div>
      );
    }

    /* 6. ALERT-NUMBER / RISCO DE EVASÃO (Query Real > 7 dias sem check-in) */
    case "alert-number": {
      const emRisco = hidratacaoData?.riscoEvasao?.pacientesEmRisco ?? 0;
      const totalAtivos = hidratacaoData?.riscoEvasao?.totalPacientesAtivos ?? 0;

      return (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-rose-600 tracking-tight">
                {emRisco}
              </span>
              <span className="text-xs font-semibold text-rose-700 uppercase tracking-wide">
                {emRisco === 1 ? "Paciente em risco" : "Pacientes em risco"}
              </span>
            </div>
            <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              de {totalAtivos} ativos
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Pacientes ativos sem check-in registrado nos últimos 7 dias.
          </p>
        </div>
      );
    }

    default:
      return null;
  }
}
