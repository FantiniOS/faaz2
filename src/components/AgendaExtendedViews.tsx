"use client";

import React, { useMemo, useState } from "react";
import { Plus, CalendarDays, Loader2, Smartphone } from "lucide-react";
import { adicionarDiasDataBR, subtrairDiasDataBR } from "@/lib/date-br";
import type { AgendamentoItem } from "@/app/agenda/page";

export type AgendaViewMode = "dia" | "semana" | "mes" | "semestre";

export const MESES_PT_FULL = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

const DIAS_SEMANA_HEADER = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
const DIAS_SEMANA_MINI = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function getDaysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

export function getWeekdayIndexIso(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Dom..6=Sáb
}

/**
 * Avança ou recua meses preservando o dia válido do mês destino (sem overflow de fuso).
 */
export function stepMonthsIso(baseIso: string, deltaMonths: number): string {
  const [y, m, d] = baseIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  const targetYear = dt.getUTCFullYear();
  const targetMonth = dt.getUTCMonth() + 1;
  const clampedDay = Math.min(d || 1, getDaysInMonth(targetYear, targetMonth));
  return `${targetYear}-${pad2(targetMonth)}-${pad2(clampedDay)}`;
}

export interface MonthCalendarCell {
  isoDate: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
}

export function buildMonthGrid(
  year: number,
  month1to12: number,
  hojeIso: string,
): {
  monthStartIso: string;
  monthEndIso: string;
  gridStartIso: string;
  gridEndIso: string;
  cells: MonthCalendarCell[];
} {
  const daysCount = getDaysInMonth(year, month1to12);
  const monthStartIso = `${year}-${pad2(month1to12)}-01`;
  const monthEndIso = `${year}-${pad2(month1to12)}-${pad2(daysCount)}`;

  const firstWd = getWeekdayIndexIso(monthStartIso); // 0=Dom..6=Sáb
  const gridStartIso =
    firstWd > 0 ? subtrairDiasDataBR(monthStartIso, firstWd) : monthStartIso;

  const totalUsed = firstWd + daysCount;
  const totalCells = Math.ceil(totalUsed / 7) * 7; // 35 ou 42 células fechadas
  const gridEndIso = adicionarDiasDataBR(gridStartIso, totalCells - 1);

  const cells: MonthCalendarCell[] = [];
  for (let i = 0; i < totalCells; i++) {
    const isoDate = adicionarDiasDataBR(gridStartIso, i);
    const cellMonth = Number(isoDate.slice(5, 7));
    const cellYear = Number(isoDate.slice(0, 4));
    cells.push({
      isoDate,
      dayNumber: Number(isoDate.slice(8, 10)),
      inCurrentMonth: cellYear === year && cellMonth === month1to12,
      isToday: isoDate === hojeIso,
    });
  }

  return { monthStartIso, monthEndIso, gridStartIso, gridEndIso, cells };
}

export function getSemesterInfo(selectedDateIso: string): {
  year: number;
  semester: 1 | 2;
  months: number[];
  startIso: string;
  endIso: string;
  title: string;
} {
  const [year, month] = selectedDateIso.split("-").map(Number);
  const semester: 1 | 2 = month <= 6 ? 1 : 2;
  const months = semester === 1 ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12];
  const startIso = `${year}-${semester === 1 ? "01-01" : "07-01"}`;
  const endIso = `${year}-${semester === 1 ? "06-30" : "12-31"}`;
  const title =
    semester === 1
      ? `1º Semestre de ${year} · Jan – Jun`
      : `2º Semestre de ${year} · Jul – Dez`;
  return { year, semester, months, startIso, endIso, title };
}

function getPrimeiroSegundoNome(fullName: string): string {
  const parts = (fullName || "Paciente").trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] || "Paciente";
  return `${parts[0]} ${parts[1][0]}.`;
}

// ============================================================================
// 1. VISÃO MÊS — CALENDÁRIO MENSAL COMPLETO (CLINICAL LIGHT)
// ============================================================================
export interface AgendaMonthViewProps {
  selectedDate: string;
  hojeIso: string;
  itensVisiveisNaGrade: AgendamentoItem[];
  isLoading: boolean;
  onSelectDay: (isoDate: string) => void;
  onQuickAddDate: (isoDate: string) => void;
  onSelectAgendamento: (item: AgendamentoItem) => void;
}

export function AgendaMonthView({
  selectedDate,
  hojeIso,
  itensVisiveisNaGrade,
  isLoading,
  onSelectDay,
  onQuickAddDate,
  onSelectAgendamento,
}: AgendaMonthViewProps) {
  const [year, month] = useMemo(() => {
    const parts = selectedDate.split("-").map(Number);
    return [parts[0] || 2026, parts[1] || 1];
  }, [selectedDate]);

  const monthGrid = useMemo(
    () => buildMonthGrid(year, month, hojeIso),
    [year, month, hojeIso],
  );

  const itemsByDate = useMemo(() => {
    const map: Record<string, AgendamentoItem[]> = {};
    for (const item of itensVisiveisNaGrade) {
      if (!map[item.data]) map[item.data] = [];
      map[item.data].push(item);
    }
    for (const key of Object.keys(map)) {
      map[key].sort(
        (a, b) =>
          Number(a.status === "CANCELADO") - Number(b.status === "CANCELADO") ||
          a.horario.localeCompare(b.horario),
      );
    }
    return map;
  }, [itensVisiveisNaGrade]);

  const numWeeks = Math.max(5, Math.round(monthGrid.cells.length / 7));

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white overflow-hidden relative">
      {isLoading && (
        <div className="absolute top-2.5 right-4 z-30 bg-white/95 backdrop-blur-xs border border-slate-200 px-3 py-1 rounded-full shadow-xs flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
          <span>Sincronizando mês...</span>
        </div>
      )}

      {/* Cabeçalho dos dias da semana (Dom a Sáb) */}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 shrink-0">
        {DIAS_SEMANA_HEADER.map((dia, idx) => (
          <div
            key={dia}
            className={`py-2 px-2 text-center text-[11px] font-extrabold uppercase tracking-wider border-r border-slate-100 last:border-r-0 ${
              idx === 0 || idx === 6 ? "text-slate-400" : "text-slate-600"
            }`}
          >
            {dia}
          </div>
        ))}
      </div>

      {/* Grade mensal responsiva */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div
          className="grid grid-cols-7 min-h-full"
          style={{
            gridTemplateRows: `repeat(${numWeeks}, minmax(112px, 1fr))`,
          }}
        >
          {monthGrid.cells.map((cell) => {
            const dayItems = itemsByDate[cell.isoDate] || [];
            const visiblePills = dayItems.slice(0, 3);
            const extraCount = Math.max(0, dayItems.length - 3);
            const isSelectedDay = cell.isoDate === selectedDate;

            return (
              <div
                key={cell.isoDate}
                className={`group relative border-r border-b border-slate-100 last:border-r-0 p-1.5 sm:p-2 flex flex-col gap-1 transition-colors ${
                  cell.isToday
                    ? "bg-emerald-50/45"
                    : !cell.inCurrentMonth
                      ? "bg-slate-50/75"
                      : isSelectedDay
                        ? "bg-teal-50/25"
                        : "bg-white hover:bg-slate-50/60"
                }`}
              >
                {/* Topo da célula: Número clicável + Botão + discreto no hover */}
                <div className="flex items-center justify-between gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onSelectDay(cell.isoDate)}
                    title={`Abrir visão Dia (${cell.isoDate.slice(8, 10)}/${cell.isoDate.slice(5, 7)})`}
                    className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full text-xs font-mono tabular-nums font-extrabold flex items-center justify-center transition-all cursor-pointer ${
                      cell.isToday
                        ? "bg-emerald-600 text-white shadow-2xs"
                        : cell.inCurrentMonth
                          ? "text-slate-800 hover:bg-emerald-100 hover:text-emerald-800"
                          : "text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
                    }`}
                  >
                    {cell.dayNumber}
                  </button>

                  <button
                    type="button"
                    onClick={() => onQuickAddDate(cell.isoDate)}
                    title={`Novo agendamento em ${cell.isoDate.slice(8, 10)}/${cell.isoDate.slice(5, 7)}`}
                    className="w-5 h-5 rounded-md flex items-center justify-center text-slate-400 hover:text-emerald-700 hover:bg-emerald-100/80 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all cursor-pointer"
                    aria-label={`Agendar em ${cell.isoDate}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Pílulas compactas de agendamentos (até 3) */}
                <div className="flex-1 flex flex-col gap-1 min-h-0">
                  {visiblePills.map((item) => {
                    const isCancelado = item.status === "CANCELADO";
                    const isConfirmado = item.status === "CONFIRMADO";
                    const isPlastica =
                      item.especialidade === "CIRURGIA_PLASTICA";
                    const viaApp =
                      isConfirmado &&
                      (item.observacao || "")
                        .toLowerCase()
                        .includes("confirmado pelo paciente via app");

                    const pillStyle = isCancelado
                      ? "bg-rose-50/80 border-rose-200/80 text-rose-700 line-through opacity-70 hover:opacity-100"
                      : isPlastica
                        ? isConfirmado
                          ? "bg-blue-50 border-blue-300 text-blue-900 hover:bg-blue-100"
                          : "bg-blue-50/60 border-blue-200/80 text-blue-800 hover:bg-blue-100/80"
                        : isConfirmado
                          ? "bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100"
                          : "bg-slate-50 border-slate-200 text-slate-800 hover:bg-emerald-50/70 hover:border-emerald-200";

                    const dotColor = isCancelado
                      ? "bg-rose-400"
                      : isPlastica
                        ? "bg-blue-500"
                        : isConfirmado
                          ? "bg-emerald-600"
                          : "bg-emerald-400";

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectAgendamento(item)}
                        title={`${item.horario} · ${item.pacienteNome} (${item.statusLegivel})`}
                        className={`w-full text-left px-1.5 py-0.5 rounded-md border text-[10px] sm:text-[11px] leading-tight flex items-center gap-1 min-w-0 transition-colors cursor-pointer ${pillStyle}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`}
                        />
                        <span className="font-mono font-bold tabular-nums shrink-0">
                          {item.horario}
                        </span>
                        <span className="font-semibold truncate flex-1 min-w-0">
                          {getPrimeiroSegundoNome(item.pacienteNome)}
                        </span>
                        {viaApp && (
                          <Smartphone className="w-2.5 h-2.5 text-emerald-600 shrink-0 hidden sm:inline" />
                        )}
                      </button>
                    );
                  })}

                  {extraCount > 0 && (
                    <button
                      type="button"
                      onClick={() => onSelectDay(cell.isoDate)}
                      className="text-left px-1.5 py-0.5 rounded-md text-[10px] font-extrabold text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 transition-colors cursor-pointer"
                    >
                      +{extraCount} mais
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 2. VISÃO SEMESTRE — MAPA DE OCUPAÇÃO DE 6 MESES (HEATMAP CLINICAL LIGHT)
// ============================================================================
interface DayStats {
  ativos: number;
  confirmados: number;
  agendados: number;
  finalizados: number;
  cancelados: number;
}

export interface AgendaSemesterViewProps {
  selectedDate: string;
  hojeIso: string;
  agendamentosNormalizados: AgendamentoItem[];
  isLoading: boolean;
  onOpenMonth: (firstDayIso: string) => void;
  onOpenDay: (isoDate: string) => void;
}

function getHeatmapCellStyle(ativos: number): string {
  if (ativos >= 6) {
    return "bg-emerald-600 hover:bg-emerald-700 text-white font-semibold border-emerald-700 shadow-2xs";
  }
  if (ativos >= 3) {
    return "bg-emerald-200 hover:bg-emerald-300 text-emerald-900 font-bold border-emerald-300";
  }
  if (ativos >= 1) {
    return "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold border-emerald-200";
  }
  return "bg-white hover:bg-slate-100 text-slate-600 font-medium border-slate-100";
}

function formatTooltipBreakdown(isoDate: string, stats?: DayStats): string {
  const ddMm = `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;
  if (!stats || stats.ativos === 0) {
    if (stats && stats.cancelados > 0) {
      return `${ddMm} · Livre (${stats.cancelados} ${stats.cancelados === 1 ? "cancelada" : "canceladas"})`;
    }
    return `${ddMm} · Livre`;
  }
  const partes: string[] = [];
  if (stats.confirmados > 0) {
    partes.push(
      `${stats.confirmados} ${stats.confirmados === 1 ? "confirmada" : "confirmadas"}`,
    );
  }
  if (stats.agendados > 0) {
    partes.push(
      `${stats.agendados} ${stats.agendados === 1 ? "agendada" : "agendadas"}`,
    );
  }
  if (stats.finalizados > 0) {
    partes.push(
      `${stats.finalizados} ${stats.finalizados === 1 ? "finalizada" : "finalizadas"}`,
    );
  }
  const totalTxt = `${stats.ativos} ${stats.ativos === 1 ? "consulta" : "consultas"}`;
  return partes.length > 0
    ? `${ddMm} · ${totalTxt}: ${partes.join(", ")}`
    : `${ddMm} · ${totalTxt}`;
}

export function AgendaSemesterView({
  selectedDate,
  hojeIso,
  agendamentosNormalizados,
  isLoading,
  onOpenMonth,
  onOpenDay,
}: AgendaSemesterViewProps) {
  const semesterInfo = useMemo(
    () => getSemesterInfo(selectedDate),
    [selectedDate],
  );
  const [hoveredCell, setHoveredCell] = useState<{
    isoDate: string;
    label: string;
  } | null>(null);

  // Agrupa estatísticas por dia e por mês (YYYY-MM)
  const { statsByDate, activeCountByMonth, totalAtivosSemestre, diasComConsulta } =
    useMemo(() => {
      const byDate: Record<string, DayStats> = {};
      const byMonth: Record<string, number> = {};
      let totalAtivos = 0;

      for (const item of agendamentosNormalizados) {
        if (!item.data) continue;
        if (!byDate[item.data]) {
          byDate[item.data] = {
            ativos: 0,
            confirmados: 0,
            agendados: 0,
            finalizados: 0,
            cancelados: 0,
          };
        }
        const entry = byDate[item.data];
        if (item.status === "CANCELADO") {
          entry.cancelados += 1;
        } else {
          entry.ativos += 1;
          totalAtivos += 1;
          if (item.status === "CONFIRMADO") entry.confirmados += 1;
          else if (item.status === "FINALIZADO") entry.finalizados += 1;
          else entry.agendados += 1;

          const monthKey = item.data.slice(0, 7);
          byMonth[monthKey] = (byMonth[monthKey] || 0) + 1;
        }
      }

      const activeDays = Object.values(byDate).filter((s) => s.ativos > 0).length;
      return {
        statsByDate: byDate,
        activeCountByMonth: byMonth,
        totalAtivosSemestre: totalAtivos,
        diasComConsulta: activeDays,
      };
    }, [agendamentosNormalizados]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-slate-50/60 relative">
      {isLoading && (
        <div className="fixed top-28 right-6 z-30 bg-white/95 backdrop-blur-xs border border-slate-200 px-3 py-1 rounded-full shadow-xs flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
          <span>Sincronizando semestre...</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-4">
        {/* Barra superior de Legenda + Resumo do Semestre + Preview do dia no hover */}
        <div className="cl-card px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
              <CalendarDays className="w-4 h-4 text-emerald-600" />
              <span>Mapa de Ocupação</span>
            </span>

            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-white border border-slate-200" />
                <span>Livre</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200" />
                <span>1–2</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-emerald-200 border border-emerald-300" />
                <span>3–5</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-emerald-600 border border-emerald-700" />
                <span>6+ consultas</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {hoveredCell ? (
              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg font-mono tabular-nums">
                {hoveredCell.label}
              </span>
            ) : (
              <span className="text-[11px] text-slate-400 hidden md:inline">
                Passe o mouse para detalhes ou clique em um dia para abrir a agenda
              </span>
            )}

            <span className="cl-badge-emerald text-[11px] font-extrabold px-2.5 py-1 rounded-lg font-mono tabular-nums">
              {totalAtivosSemestre}{" "}
              {totalAtivosSemestre === 1 ? "consulta ativa" : "consultas ativas"}
            </span>
            <span className="cl-badge-slate text-[11px] font-bold px-2.5 py-1 rounded-lg font-mono tabular-nums">
              {diasComConsulta} {diasComConsulta === 1 ? "dia ocupado" : "dias ocupados"}
            </span>
          </div>
        </div>

        {/* Grade 3x2 Desktop / 2x3 Tablet / 1 Coluna Mobile */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {semesterInfo.months.map((m) => {
            const monthKey = `${semesterInfo.year}-${pad2(m)}`;
            const firstDayIso = `${monthKey}-01`;
            const totalMes = activeCountByMonth[monthKey] || 0;
            const daysCount = getDaysInMonth(semesterInfo.year, m);
            const firstWd = getWeekdayIndexIso(firstDayIso);
            const leadingBlanks = Array.from({ length: firstWd });

            return (
              <div
                key={monthKey}
                className="cl-card p-4 flex flex-col gap-3 hover:border-emerald-200/90 transition-colors"
              >
                {/* Cabeçalho do mês clicável para abrir visão Mês */}
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <button
                    type="button"
                    onClick={() => onOpenMonth(firstDayIso)}
                    title={`Abrir visão mensal de ${MESES_PT_FULL[m - 1]} ${semesterInfo.year}`}
                    className="text-sm font-extrabold text-slate-900 hover:text-emerald-700 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <span>
                      {MESES_PT_FULL[m - 1]} {semesterInfo.year}
                    </span>
                  </button>

                  <span
                    className={`text-[11px] font-bold font-mono tabular-nums px-2 py-0.5 rounded-full ${
                      totalMes > 0 ? "cl-badge-emerald" : "cl-badge-slate"
                    }`}
                  >
                    {totalMes === 0
                      ? "Livre"
                      : `${totalMes} ${totalMes === 1 ? "consulta" : "consultas"}`}
                  </span>
                </div>

                {/* Cabeçalho D S T Q Q S S */}
                <div className="grid grid-cols-7 gap-1 text-center">
                  {DIAS_SEMANA_MINI.map((letra, idx) => (
                    <span
                      key={`${monthKey}-wd-${idx}`}
                      className={`text-[10px] font-extrabold uppercase ${
                        idx === 0 || idx === 6
                          ? "text-slate-300"
                          : "text-slate-400"
                      }`}
                    >
                      {letra}
                    </span>
                  ))}
                </div>

                {/* Mini-calendário heatmap */}
                <div className="grid grid-cols-7 gap-1">
                  {leadingBlanks.map((_, bIdx) => (
                    <div key={`${monthKey}-blank-${bIdx}`} className="h-8" />
                  ))}

                  {Array.from({ length: daysCount }, (_, idx) => {
                    const day = idx + 1;
                    const isoDate = `${monthKey}-${pad2(day)}`;
                    const stats = statsByDate[isoDate];
                    const ativos = stats?.ativos || 0;
                    const isToday = isoDate === hojeIso;
                    const tooltip = formatTooltipBreakdown(isoDate, stats);

                    return (
                      <button
                        key={isoDate}
                        type="button"
                        onClick={() => onOpenDay(isoDate)}
                        onMouseEnter={() =>
                          setHoveredCell({ isoDate, label: tooltip })
                        }
                        onMouseLeave={() =>
                          setHoveredCell((prev) =>
                            prev?.isoDate === isoDate ? null : prev,
                          )
                        }
                        title={tooltip}
                        className={`relative h-8 rounded-lg border text-xs font-mono tabular-nums flex items-center justify-center transition-all cursor-pointer ${getHeatmapCellStyle(
                          ativos,
                        )} ${isToday ? "ring-2 ring-emerald-500 ring-offset-1" : ""}`}
                      >
                        <span>{day}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
