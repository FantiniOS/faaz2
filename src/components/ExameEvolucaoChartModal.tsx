"use client";

import React, { useEffect } from "react";
import {
  X,
  TrendingDown,
  TrendingUp,
  Minus,
  Activity,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  LabelList,
} from "recharts";
import {
  formatExamNumber,
  type ExamDef,
  type ExamEvolutionResult,
} from "@/lib/exames-catalog";
import { formatarDataBR, formatarDataCurtaBR } from "@/lib/date-br";

export interface ExamChartPoint {
  loteId: string;
  dataColeta: string;
  dataCurta: string;
  dataCompleta: string;
  valor: number;
  laboratorio?: string | null;
}

interface ExameEvolucaoChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  pacienteNome: string;
  examDef: ExamDef;
  points: ExamChartPoint[]; // ordenados cronologicamente: mais antigo -> mais recente
  evolution: ExamEvolutionResult | null;
}

function CustomTooltip({
  active,
  payload,
  unit,
  decimals,
}: {
  active?: boolean;
  payload?: Array<{ payload: ExamChartPoint }>;
  unit: string;
  decimals?: number;
}) {
  if (!active || !payload || !payload.length) return null;
  const pt = payload[0].payload;
  return (
    <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl shadow-lg px-3.5 py-2.5 text-xs">
      <div className="text-[11px] font-semibold text-slate-500">
        {pt.dataCompleta}
      </div>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span className="text-lg font-black text-slate-900 font-mono tabular-nums">
          {formatExamNumber(pt.valor, decimals)}
        </span>
        {unit ? (
          <span className="text-xs font-bold text-slate-500">{unit}</span>
        ) : null}
      </div>
      {pt.laboratorio ? (
        <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[180px]">
          {pt.laboratorio}
        </div>
      ) : null}
    </div>
  );
}

export function ExameEvolucaoChartModal({
  isOpen,
  onClose,
  pacienteNome,
  examDef,
  points,
  evolution,
}: ExameEvolucaoChartModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || points.length === 0) return null;

  const first = points[0];
  const latest = points[points.length - 1];
  const hasMultiple = points.length >= 2;
  const totalDelta = hasMultiple ? latest.valor - first.valor : null;

  const allValues = points.map((p) => p.valor);
  const candidatesMin = [...allValues];
  const candidatesMax = [...allValues];
  if (examDef.refMin !== undefined) candidatesMin.push(examDef.refMin);
  if (examDef.refMax !== undefined) candidatesMax.push(examDef.refMax);

  const rawMin = Math.min(...candidatesMin);
  const rawMax = Math.max(...candidatesMax);
  const span = rawMax - rawMin || Math.max(Math.abs(rawMax) * 0.25, 1);
  const yMin = Math.max(0, Number((rawMin - span * 0.18).toFixed(2)));
  const yMax = Number((rawMax + span * 0.22).toFixed(2));

  const bandMin = examDef.refMin !== undefined ? Math.max(yMin, examDef.refMin) : yMin;
  const bandMax = examDef.refMax !== undefined ? Math.min(yMax, examDef.refMax) : yMax;
  const showRefBand =
    examDef.refMin !== undefined || examDef.refMax !== undefined;

  const trendColor =
    evolution?.trend === "improved"
      ? "#059669"
      : evolution?.trend === "worsened"
        ? "#e11d48"
        : "#0f766e";

  const statusPill =
    evolution?.status === "ok" ? (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Na meta ({examDef.refLabel})
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
        <AlertTriangle className="w-3.5 h-3.5" />
        {evolution?.status === "high" ? "Acima da referência" : "Abaixo da referência"} ({examDef.refLabel})
      </span>
    );

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-3 sm:p-5 bg-slate-900/45 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho voltado para mostrar ao paciente */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-50/80 via-white to-teal-50/70 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Activity className="w-4 h-4" />
              </span>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">
                {examDef.label}
              </h3>
              {examDef.unit ? (
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                  {examDef.unit}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Evolução laboratorial de <strong className="text-slate-700">{pacienteNome}</strong> •{" "}
              {points.length} {points.length === 1 ? "coleta" : "coletas"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Fechar gráfico (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cartão de Resumo: Antes -> Agora (Δ) */}
        <div className="px-6 pt-5 pb-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            {hasMultiple ? (
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/90 rounded-2xl px-4 py-2.5">
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Antes ({formatarDataBR(first.dataColeta)})
                  </span>
                  <span className="text-lg font-bold text-slate-600 font-mono tabular-nums">
                    {formatExamNumber(first.valor, examDef.decimals)}{" "}
                    <span className="text-xs font-semibold text-slate-400">{examDef.unit}</span>
                  </span>
                </div>
                <span className="text-slate-300 text-lg font-bold">→</span>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-teal-600">
                    Agora ({formatarDataBR(latest.dataColeta)})
                  </span>
                  <span className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                    {formatExamNumber(latest.valor, examDef.decimals)}{" "}
                    <span className="text-xs font-bold text-slate-500">{examDef.unit}</span>
                  </span>
                </div>

                {totalDelta !== null && (
                  <div
                    className={`ml-1 px-2.5 py-1.5 rounded-xl border text-xs font-extrabold font-mono tabular-nums flex items-center gap-1 ${
                      evolution?.trend === "improved"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : evolution?.trend === "worsened"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    {totalDelta < 0 ? (
                      <TrendingDown className="w-3.5 h-3.5" />
                    ) : totalDelta > 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <Minus className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {totalDelta > 0 ? "+" : totalDelta < 0 ? "-" : ""}
                      {formatExamNumber(Math.abs(totalDelta), examDef.decimals)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200/90 rounded-2xl px-4 py-2.5">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-teal-600">
                  Última Coleta ({formatarDataBR(latest.dataColeta)})
                </span>
                <span className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                  {formatExamNumber(latest.valor, examDef.decimals)}{" "}
                  <span className="text-xs font-bold text-slate-500">{examDef.unit}</span>
                </span>
              </div>
            )}
          </div>

          {statusPill}
        </div>

        {/* Gráfico Responsivo com Faixa Ideal Sombreada em Verde */}
        <div className="px-4 sm:px-6 pt-3 pb-4">
          <div className="w-full h-[300px] sm:h-[330px] bg-white rounded-2xl border border-slate-100 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={points}
                margin={{ top: 28, right: 32, left: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />

                {showRefBand && bandMax > bandMin ? (
                  <ReferenceArea
                    y1={bandMin}
                    y2={bandMax}
                    fill="#10b981"
                    fillOpacity={0.13}
                    strokeOpacity={0}
                  />
                ) : null}

                {examDef.refMax !== undefined ? (
                  <ReferenceLine
                    y={examDef.refMax}
                    stroke="#059669"
                    strokeDasharray="4 4"
                    strokeOpacity={0.65}
                  />
                ) : null}

                {examDef.refMin !== undefined && examDef.refMin > 0 ? (
                  <ReferenceLine
                    y={examDef.refMin}
                    stroke="#059669"
                    strokeDasharray="4 4"
                    strokeOpacity={0.65}
                  />
                ) : null}

                <XAxis
                  dataKey="dataCurta"
                  tick={{ fill: "#475569", fontSize: 12, fontWeight: 700 }}
                  axisLine={{ stroke: "#cbd5e1" }}
                  tickLine={false}
                  dy={6}
                />

                <YAxis
                  domain={[yMin, yMax]}
                  tick={{ fill: "#64748b", fontSize: 11, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={(v: number) =>
                    formatExamNumber(v, examDef.decimals === 0 ? 0 : 1)
                  }
                />

                <Tooltip
                  content={
                    <CustomTooltip
                      unit={examDef.unit}
                      decimals={examDef.decimals}
                    />
                  }
                />

                <Line
                  type="monotone"
                  dataKey="valor"
                  stroke={trendColor}
                  strokeWidth={3.5}
                  dot={{
                    r: 6,
                    fill: "#ffffff",
                    stroke: trendColor,
                    strokeWidth: 3,
                  }}
                  activeDot={{
                    r: 8,
                    fill: trendColor,
                    stroke: "#ffffff",
                    strokeWidth: 2.5,
                  }}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="valor"
                    position="top"
                    offset={12}
                    formatter={(v: unknown) =>
                      typeof v === "number"
                        ? formatExamNumber(v, examDef.decimals)
                        : ""
                    }
                    style={{
                      fill: "#0f172a",
                      fontSize: 13,
                      fontWeight: 800,
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    }}
                  />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Legenda visual clara para o paciente */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 px-1">
            <div className="flex items-center gap-4 flex-wrap">
              {showRefBand ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                  <span className="w-3.5 h-3.5 rounded-sm bg-emerald-500/20 border border-emerald-500/50 inline-block" />
                  Faixa ideal de referência: {examDef.refLabel}
                </span>
              ) : null}
              <span className="text-[11px] text-slate-400">
                Última comparação (anterior → atual):{" "}
                {evolution?.deltaFormatted
                  ? `${evolution.arrow} ${evolution.deltaFormatted} (${evolution.badgeLabel})`
                  : "1ª coleta registrada"}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function buildChartPointsForExam(
  lotesAsc: Array<{
    id: string;
    dataColeta: string;
    laboratorio: string | null;
    mergedValores: Record<string, number | string>;
  }>,
  examKey: string,
): ExamChartPoint[] {
  const pts: ExamChartPoint[] = [];
  for (const lote of lotesAsc) {
    const raw = lote.mergedValores[examKey];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      pts.push({
        loteId: lote.id,
        dataColeta: lote.dataColeta,
        dataCurta: formatarDataCurtaBR(lote.dataColeta),
        dataCompleta: formatarDataBR(lote.dataColeta),
        valor: raw,
        laboratorio: lote.laboratorio,
      });
    }
  }
  return pts;
}
