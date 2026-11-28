"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  FileDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Edit2,
  Trash2,
  Loader2,
  FlaskConical,
  ChevronLeft,
  ChevronRight,
  LineChart as LineChartIcon,
  FileImage,
  Check,
  Calculator,
  Filter,
} from "lucide-react";
import {
  CALCULATED_EXAMS,
  EXAM_CATEGORIES,
  EXAM_CATALOG,
  LAUDO_BY_KEY,
  buildExameResumoParaEvolucao,
  computeCalculatedExams,
  evaluateExamEvolution,
  evaluateExamStatus,
  formatExamNumber,
  normalizeSearchText,
  parseNumericExamValue,
  type ExamCategoryId,
  type ExamDef,
  type ExameLaboratorialDTO,
  type ExamEvolutionResult,
} from "@/lib/exames-catalog";
import { formatarDataBR } from "@/lib/date-br";
import { useAuth } from "@/contexts/AuthContext";
import {
  formatarNomeArquivoExames,
  getClinicaLogoUrl,
  resolveDoctorProfile,
} from "@/lib/pdf-clinica-template";
import { ExameLancamentoModal } from "@/components/ExameLancamentoModal";
import {
  ExameEvolucaoChartModal,
  buildChartPointsForExam,
  type ExamChartPoint,
} from "@/components/ExameEvolucaoChartModal";
import type { PdfExameGroup } from "@/components/ExamesComparativoPDF";

interface ExamesTabProps {
  pacienteId: string;
  pacienteNome: string;
  pacienteRecordCode?: string | null;
  pacienteCpf?: string | null;
  onCopiarParaEvolucao?: (texto: string) => void;
}

type ScoreFilter = "all" | "improved" | "attention" | "on_target";

interface EnrichedLote extends ExameLaboratorialDTO {
  mergedValores: Record<string, number | string>;
}

interface TableRowItem {
  key: string;
  label: string;
  unit: string;
  refLabel: string;
  category: ExamCategoryId | "personalizados";
  isCalculated: boolean;
  isNumeric: boolean;
  examDef?: ExamDef;
  valuesByLoteId: Record<
    string,
    {
      raw: number | string;
      display: string;
      status?: "ok" | "high" | "low";
    }
  >;
  evolution: ExamEvolutionResult | null;
  latestStatus: "ok" | "high" | "low" | null;
  latestNumeric: number | null;
}

export function ExamesTab({
  pacienteId,
  pacienteNome,
  pacienteRecordCode = null,
  pacienteCpf = null,
  onCopiarParaEvolucao,
}: ExamesTabProps) {
  const { usuario } = useAuth();

  const [lotes, setLotes] = useState<ExameLaboratorialDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filtros da tela comparativa
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [onlyAttentionToggle, setOnlyAttentionToggle] = useState<boolean>(false);

  // Paginação de colunas de data (até 4 visíveis)
  const [windowOffset, setWindowOffset] = useState<number>(0);

  // Modais
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState<boolean>(false);
  const [editingLote, setEditingLote] = useState<ExameLaboratorialDTO | null>(null);
  const [deletingLote, setDeletingLote] = useState<ExameLaboratorialDTO | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Gráfico evolutivo de 1 clique
  const [chartState, setChartState] = useState<{
    examDef: ExamDef;
    points: ExamChartPoint[];
    evolution: ExamEvolutionResult | null;
  } | null>(null);

  // Feedbacks
  const [copiedLoteId, setCopiedLoteId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  const fetchExames = useCallback(async () => {
    if (!pacienteId) return;
    try {
      setIsLoading(true);
      setLoadError(null);
      const res = await fetch(
        `/api/pacientes/${encodeURIComponent(pacienteId)}/exames`,
        {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setLoadError(
          json?.error || "Não foi possível carregar os exames laboratoriais.",
        );
        return;
      }
      setLotes(Array.isArray(json.exames) ? json.exames : []);
      setWindowOffset(0);
    } catch {
      setLoadError("Erro de conexão ao carregar exames.");
    } finally {
      setIsLoading(false);
    }
  }, [pacienteId]);

  useEffect(() => {
    void fetchExames();
  }, [fetchExames]);

  // Ordenação cronológica: mais antiga -> mais recente
  const lotesAsc = useMemo<EnrichedLote[]>(() => {
    return [...lotes]
      .sort((a, b) => {
        const cmp = (a.dataColeta || "").localeCompare(b.dataColeta || "");
        if (cmp !== 0) return cmp;
        return (a.createdAt || "").localeCompare(b.createdAt || "");
      })
      .map((lote) => {
        const calc = computeCalculatedExams(lote.valores || {});
        return {
          ...lote,
          mergedValores: {
            ...(lote.valores || {}),
            ...calc,
          },
        };
      });
  }, [lotes]);

  // Janela de até 4 datas visíveis (padrão: as 4 mais recentes à direita)
  const MAX_VISIBLE_COLS = 4;
  const maxOffset = Math.max(0, lotesAsc.length - MAX_VISIBLE_COLS);
  const safeOffset = Math.min(windowOffset, maxOffset);
  const visibleLotes = useMemo(() => {
    if (lotesAsc.length <= MAX_VISIBLE_COLS) return lotesAsc;
    const end = lotesAsc.length - safeOffset;
    const start = Math.max(0, end - MAX_VISIBLE_COLS);
    return lotesAsc.slice(start, end);
  }, [lotesAsc, safeOffset]);

  // Constrói linhas SOMENTE para exames com valor registrado (catálogo + cálculos + personalizados)
  const allRows = useMemo<TableRowItem[]>(() => {
    if (lotesAsc.length === 0) return [];

    const orderedDefs: ExamDef[] = [];
    for (const cat of EXAM_CATEGORIES) {
      if (cat.id === "imagem_laudos") continue;
      const catExams = EXAM_CATALOG.filter((e) => e.category === cat.id);
      const catCalcs = CALCULATED_EXAMS.filter((c) => c.category === cat.id);
      orderedDefs.push(...catExams, ...catCalcs);
    }

    const rows: TableRowItem[] = [];

    for (const def of orderedDefs) {
      const valuesByLoteId: TableRowItem["valuesByLoteId"] = {};
      const chronologicalNumeric: number[] = [];

      for (const lote of lotesAsc) {
        const raw = lote.mergedValores[def.key];
        if (raw === undefined || raw === null || raw === "") continue;

        if (def.type === "number") {
          const num = parseNumericExamValue(raw);
          if (num === null) continue;
          const st = evaluateExamStatus(num, def);
          valuesByLoteId[lote.id] = {
            raw: num,
            display: formatExamNumber(num, def.decimals),
            status: st,
          };
          chronologicalNumeric.push(num);
        } else {
          valuesByLoteId[lote.id] = {
            raw: String(raw),
            display: String(raw),
          };
        }
      }

      if (Object.keys(valuesByLoteId).length === 0) continue;

      let evolution: ExamEvolutionResult | null = null;
      let latestStatus: "ok" | "high" | "low" | null = null;
      let latestNumeric: number | null = null;

      if (def.type === "number" && chronologicalNumeric.length > 0) {
        const current = chronologicalNumeric[chronologicalNumeric.length - 1];
        const previous =
          chronologicalNumeric.length >= 2
            ? chronologicalNumeric[chronologicalNumeric.length - 2]
            : null;
        evolution = evaluateExamEvolution(current, previous, def);
        latestStatus = evolution.status;
        latestNumeric = current;
      }

      rows.push({
        key: def.key,
        label: def.label,
        unit: def.unit,
        refLabel: def.refLabel,
        category: def.category,
        isCalculated: Boolean(def.isCalculated),
        isNumeric: def.type === "number",
        examDef: def,
        valuesByLoteId,
        evolution,
        latestStatus,
        latestNumeric,
      });
    }

    // Exames personalizados registrados em qualquer lote
    const customNames = new Map<
      string,
      { unidade: string; referencia: string }
    >();
    for (const lote of lotesAsc) {
      for (const c of lote.examesPersonalizados || []) {
        if (!c?.nome) continue;
        const keyName = c.nome.trim().toUpperCase();
        if (!customNames.has(keyName)) {
          customNames.set(keyName, {
            unidade: c.unidade || "",
            referencia: c.referencia || "",
          });
        }
      }
    }

    for (const [nome, meta] of customNames.entries()) {
      const valuesByLoteId: TableRowItem["valuesByLoteId"] = {};
      const nums: number[] = [];

      for (const lote of lotesAsc) {
        const match = (lote.examesPersonalizados || []).find(
          (c) => c.nome?.trim().toUpperCase() === nome,
        );
        if (!match) continue;
        const parsed = parseNumericExamValue(match.valor);
        if (parsed !== null && typeof match.valor === "number") {
          valuesByLoteId[lote.id] = {
            raw: parsed,
            display: formatExamNumber(parsed),
          };
          nums.push(parsed);
        } else {
          valuesByLoteId[lote.id] = {
            raw: String(match.valor),
            display: String(match.valor),
          };
        }
      }

      if (Object.keys(valuesByLoteId).length === 0) continue;

      let evolution: ExamEvolutionResult | null = null;
      if (nums.length >= 2) {
        const curr = nums[nums.length - 1];
        const prev = nums[nums.length - 2];
        const diff = curr - prev;
        evolution = {
          status: "ok",
          trend: "stable",
          delta: Number(diff.toFixed(2)),
          percentChange: prev !== 0 ? Number(((diff / Math.abs(prev)) * 100).toFixed(1)) : 0,
          deltaFormatted:
            Math.abs(diff) < 1e-6
              ? "0"
              : `${diff > 0 ? "+" : "-"}${formatExamNumber(Math.abs(diff))}`,
          arrow: diff > 1e-6 ? "↑" : diff < -1e-6 ? "↓" : "→",
          badgeLabel: "Estável",
          needsAttention: false,
        };
      }

      rows.push({
        key: `_custom_${nome}`,
        label: nome,
        unit: meta.unidade,
        refLabel: meta.referencia || "Personalizado",
        category: "personalizados",
        isCalculated: false,
        isNumeric: nums.length > 0,
        valuesByLoteId,
        evolution,
        latestStatus: null,
        latestNumeric: nums.length > 0 ? nums[nums.length - 1] : null,
      });
    }

    return rows;
  }, [lotesAsc]);

  // Placar clínico automático no topo (baseado nos exames presentes na última coleta)
  const scoreboard = useMemo(() => {
    let improved = 0;
    let attention = 0;
    let onTarget = 0;

    for (const row of allRows) {
      if (!row.isNumeric || !row.evolution) continue;
      if (row.evolution.trend === "improved") improved += 1;
      if (row.evolution.needsAttention) attention += 1;
      if (row.evolution.status === "ok") onTarget += 1;
    }

    return { improved, attention, onTarget };
  }, [allRows]);

  // Categorias disponíveis com dados na ficha
  const availableCategories = useMemo(() => {
    const present = new Set(allRows.map((r) => r.category));
    const list: Array<{ id: string; label: string }> = [];
    for (const cat of EXAM_CATEGORIES) {
      if (present.has(cat.id)) {
        list.push({ id: cat.id, label: cat.label });
      }
    }
    if (present.has("personalizados")) {
      list.push({ id: "personalizados", label: "Exames Personalizados" });
    }
    return list;
  }, [allRows]);

  // Aplica filtros ativos
  const filteredGroups = useMemo(() => {
    const q = normalizeSearchText(searchQuery);

    const matchesFilter = (row: TableRowItem): boolean => {
      if (selectedCategory !== "all" && row.category !== selectedCategory) {
        return false;
      }
      if (onlyAttentionToggle) {
        const isAltered =
          Boolean(row.evolution?.needsAttention) ||
          (row.latestStatus !== null && row.latestStatus !== "ok");
        if (!isAltered) return false;
      }
      if (scoreFilter === "improved" && row.evolution?.trend !== "improved") {
        return false;
      }
      if (scoreFilter === "attention" && !row.evolution?.needsAttention) {
        return false;
      }
      if (scoreFilter === "on_target" && row.latestStatus !== "ok") {
        return false;
      }
      if (q) {
        const labelNorm = normalizeSearchText(row.label);
        const aliasesNorm = (row.examDef?.aliases || []).map(normalizeSearchText);
        if (
          !labelNorm.includes(q) &&
          !aliasesNorm.some((a) => a.includes(q))
        ) {
          return false;
        }
      }
      return true;
    };

    const grouped: Array<{
      id: string;
      label: string;
      rows: TableRowItem[];
    }> = [];

    for (const cat of EXAM_CATEGORIES) {
      if (cat.id === "imagem_laudos") continue;
      const rows = allRows.filter(
        (r) => r.category === cat.id && matchesFilter(r),
      );
      if (rows.length > 0) {
        grouped.push({ id: cat.id, label: cat.label, rows });
      }
    }

    const customRows = allRows.filter(
      (r) => r.category === "personalizados" && matchesFilter(r),
    );
    if (customRows.length > 0) {
      grouped.push({
        id: "personalizados",
        label: "Exames Personalizados",
        rows: customRows,
      });
    }

    return grouped;
  }, [allRows, searchQuery, selectedCategory, onlyAttentionToggle, scoreFilter]);

  // Laudos de imagem & observações organizados por data (mais recente primeiro)
  const lotesComLaudos = useMemo(() => {
    return [...lotesAsc]
      .reverse()
      .filter(
        (l) =>
          Object.keys(l.laudosImagem || {}).length > 0 ||
          Boolean(l.observacoes?.trim()),
      );
  }, [lotesAsc]);

  const handleOpenChart = (row: TableRowItem) => {
    if (!row.isNumeric) return;
    const def: ExamDef = row.examDef || {
      key: row.key,
      label: row.label,
      category: "glicemico",
      priority: 50,
      aliases: [],
      unit: row.unit,
      type: "number",
      refLabel: row.refLabel,
      clinicalDirection: "range_optimal",
    };

    let points: ExamChartPoint[];
    if (row.examDef) {
      points = buildChartPointsForExam(lotesAsc, row.key);
    } else {
      points = [];
      for (const lote of lotesAsc) {
        const cell = row.valuesByLoteId[lote.id];
        if (!cell || typeof cell.raw !== "number") continue;
        points.push({
          loteId: lote.id,
          dataColeta: lote.dataColeta,
          dataCurta: formatarDataBR(lote.dataColeta).slice(0, 5),
          dataCompleta: formatarDataBR(lote.dataColeta),
          valor: cell.raw,
          laboratorio: lote.laboratorio,
        });
      }
    }

    if (points.length === 0) return;
    setChartState({
      examDef: def,
      points,
      evolution: row.evolution,
    });
  };

  const handleCopySummary = async (lote: ExameLaboratorialDTO) => {
    const resumo = buildExameResumoParaEvolucao(
      lote,
      formatarDataBR(lote.dataColeta),
    );
    try {
      await navigator.clipboard.writeText(resumo);
    } catch {
      // Fallback silencioso se navegador bloquear clipboard
    }
    if (onCopiarParaEvolucao) {
      onCopiarParaEvolucao(resumo);
      showToast("Resumo copiado e inserido na Evolução do dia!");
    } else {
      showToast("Resumo dos exames copiado para a área de transferência!");
    }
    setCopiedLoteId(lote.id);
    setTimeout(() => {
      setCopiedLoteId((prev) => (prev === lote.id ? null : prev));
    }, 2200);
  };

  const handleDeleteLote = async () => {
    if (!deletingLote || isDeleting) return;
    try {
      setIsDeleting(true);
      const res = await fetch(
        `/api/pacientes/${encodeURIComponent(pacienteId)}/exames/${encodeURIComponent(deletingLote.id)}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setLotes((prev) => prev.filter((l) => l.id !== deletingLote.id));
        setDeletingLote(null);
        showToast("Lote de exames excluído com sucesso.");
      } else {
        showToast("Não foi possível excluir o lote de exames.");
      }
    } catch {
      showToast("Erro de comunicação ao excluir lote.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportPdf = async () => {
    if (isExportingPdf || lotesAsc.length === 0) return;
    try {
      setIsExportingPdf(true);
      const profile = resolveDoctorProfile(usuario);
      const pdfGroups: PdfExameGroup[] = filteredGroups.map((g) => ({
        categoryLabel: g.label,
        rows: g.rows.map((r) => ({
          key: r.key,
          label: r.label,
          unit: r.unit,
          refLabel: r.refLabel,
          isCalculated: r.isCalculated,
          valuesByLoteId: Object.fromEntries(
            Object.entries(r.valuesByLoteId).map(([id, cell]) => [
              id,
              { display: cell.display, status: cell.status },
            ]),
          ),
          evolution: r.evolution,
        })),
      }));

      const { downloadExamesComparativoPdf } = await import(
        "@/components/ExamesComparativoPdfExporter"
      );

      await downloadExamesComparativoPdf(
        {
          pacienteNome,
          pacienteRecordCode,
          pacienteCpf,
          dataEmissao: formatarDataBR(new Date()),
          localCidade: profile.localCidade,
          medicoNome: profile.medicoNome,
          crm: profile.crm,
          especialidades: profile.especialidades,
          clinicaNome: profile.clinicaNome,
          clinicaSubtitulo: profile.clinicaSubtitulo,
          clinicaContato: profile.clinicaContato,
          logoSrc: getClinicaLogoUrl(),
          lotes: lotesAsc,
          groups: pdfGroups,
          scoreboard,
        },
        formatarNomeArquivoExames(pacienteNome),
      );
      showToast("PDF comparativo de exames gerado com sucesso!");
    } catch (err) {
      console.error("Erro ao exportar PDF de exames:", err);
      showToast("Erro ao gerar PDF comparativo de exames.");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleLoteSaved = (saved: ExameLaboratorialDTO) => {
    setLotes((prev) => {
      const exists = prev.some((l) => l.id === saved.id);
      if (exists) {
        return prev.map((l) => (l.id === saved.id ? saved : l));
      }
      return [saved, ...prev];
    });
    setWindowOffset(0);
    setScoreFilter("all");
    setOnlyAttentionToggle(false);
    showToast(
      editingLote
        ? "Lote de exames atualizado na tabela comparativa!"
        : "Novo lote salvo e comparado automaticamente!",
    );
    setEditingLote(null);
  };

  const toggleScoreFilter = (target: ScoreFilter) => {
    setScoreFilter((prev) => (prev === target ? "all" : target));
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 lg:px-8 py-4 space-y-4 bg-slate-50/50">
      {/* Toast flutuante discreto */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-80 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 1. PLACAR CLÍNICO AUTOMÁTICO NO TOPO */}
      {!isLoading && lotesAsc.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => toggleScoreFilter("improved")}
            className={`text-left rounded-2xl border p-3.5 transition-all cursor-pointer flex items-center justify-between gap-3 ${
              scoreFilter === "improved"
                ? "bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500/30"
                : "bg-white hover:bg-emerald-50/50 border-emerald-200/80 text-slate-900 shadow-2xs"
            }`}
          >
            <div>
              <span
                className={`text-[10px] font-extrabold uppercase tracking-wider block ${
                  scoreFilter === "improved" ? "text-emerald-100" : "text-emerald-700"
                }`}
              >
                Melhoraram
              </span>
              <span className="text-2xl font-black font-mono tabular-nums mt-0.5 block">
                {scoreboard.improved}
              </span>
              <span
                className={`text-[10px] font-medium ${
                  scoreFilter === "improved" ? "text-emerald-100" : "text-slate-500"
                }`}
              >
                {lotesAsc.length >= 2
                  ? "vs. coleta anterior • clique para filtrar"
                  : "aguardando 2ª coleta para Δ"}
              </span>
            </div>
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                scoreFilter === "improved"
                  ? "bg-white/20 text-white"
                  : "bg-emerald-50 text-emerald-600 border border-emerald-200"
              }`}
            >
              <TrendingUp className="w-5 h-5" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => toggleScoreFilter("attention")}
            className={`text-left rounded-2xl border p-3.5 transition-all cursor-pointer flex items-center justify-between gap-3 ${
              scoreFilter === "attention"
                ? "bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-500/30"
                : "bg-white hover:bg-rose-50/50 border-rose-200/80 text-slate-900 shadow-2xs"
            }`}
          >
            <div>
              <span
                className={`text-[10px] font-extrabold uppercase tracking-wider block ${
                  scoreFilter === "attention" ? "text-rose-100" : "text-rose-700"
                }`}
              >
                Em Atenção / Pioraram
              </span>
              <span className="text-2xl font-black font-mono tabular-nums mt-0.5 block">
                {scoreboard.attention}
              </span>
              <span
                className={`text-[10px] font-medium ${
                  scoreFilter === "attention" ? "text-rose-100" : "text-slate-500"
                }`}
              >
                fora da meta ou piora • clique para filtrar
              </span>
            </div>
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                scoreFilter === "attention"
                  ? "bg-white/20 text-white"
                  : "bg-rose-50 text-rose-600 border border-rose-200"
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => toggleScoreFilter("on_target")}
            className={`text-left rounded-2xl border p-3.5 transition-all cursor-pointer flex items-center justify-between gap-3 ${
              scoreFilter === "on_target"
                ? "bg-teal-600 text-white border-teal-600 shadow-md ring-2 ring-teal-500/30"
                : "bg-white hover:bg-teal-50/50 border-teal-200/80 text-slate-900 shadow-2xs"
            }`}
          >
            <div>
              <span
                className={`text-[10px] font-extrabold uppercase tracking-wider block ${
                  scoreFilter === "on_target" ? "text-teal-100" : "text-teal-700"
                }`}
              >
                Na Meta
              </span>
              <span className="text-2xl font-black font-mono tabular-nums mt-0.5 block">
                {scoreboard.onTarget}
              </span>
              <span
                className={`text-[10px] font-medium ${
                  scoreFilter === "on_target" ? "text-teal-100" : "text-slate-500"
                }`}
              >
                dentro da referência ideal • filtrar
              </span>
            </div>
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                scoreFilter === "on_target"
                  ? "bg-white/20 text-white"
                  : "bg-teal-50 text-teal-600 border border-teal-200"
              }`}
            >
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </button>
        </div>
      )}

      {/* 2. BARRA DE AÇÕES LIMPA */}
      <div className="bg-white rounded-2xl border border-slate-200 px-3.5 py-3 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar exame na ficha..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-teal-500 outline-hidden"
            />
          </div>

          {availableCategories.length > 1 && (
            <div className="relative flex items-center">
              <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="pl-7 pr-6 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-700 focus:bg-white focus:border-teal-500 outline-hidden cursor-pointer"
              >
                <option value="all">Todos os grupos</option>
                {availableCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={() => setOnlyAttentionToggle((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              onlyAttentionToggle
                ? "bg-amber-500 text-white border-amber-500 shadow-xs"
                : "bg-white text-slate-600 border-slate-200 hover:border-amber-300 hover:text-amber-700"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Só atenção/alterados</span>
          </button>

          {scoreFilter !== "all" && (
            <button
              type="button"
              onClick={() => setScoreFilter("all")}
              className="text-[11px] font-bold text-teal-700 hover:underline px-2 py-1 cursor-pointer"
            >
              Limpar filtro do placar ×
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {lotesAsc.length > 0 && (
            <button
              type="button"
              onClick={() => void handleExportPdf()}
              disabled={isExportingPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isExportingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
              ) : (
                <FileDown className="w-3.5 h-3.5 text-teal-600" />
              )}
              <span>Exportar PDF</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setEditingLote(null);
              setIsLaunchModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar Exames</span>
          </button>
        </div>
      </div>

      {/* 3. CONTEÚDO PRINCIPAL: LOADING / ERRO / VAZIO / TABELA COMPARATIVA */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 flex flex-col items-center justify-center gap-2 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
          <span className="text-xs font-semibold">
            Carregando histórico laboratorial...
          </span>
        </div>
      ) : loadError ? (
        <div className="bg-white rounded-2xl border border-rose-200 py-10 px-6 text-center space-y-2">
          <AlertTriangle className="w-6 h-6 text-rose-500 mx-auto" />
          <p className="text-sm font-bold text-slate-800">{loadError}</p>
          <button
            type="button"
            onClick={() => void fetchExames()}
            className="px-4 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
          >
            Tentar novamente
          </button>
        </div>
      ) : lotesAsc.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 py-14 px-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200 text-teal-600 flex items-center justify-center mx-auto">
            <FlaskConical className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              Nenhum exame laboratorial registrado ainda
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
              Lance exames 100% pelo teclado em segundos (Exame → Enter → Valor → Enter)
              com cálculos automáticos de HOMA-IR, HOMA-Beta, Não-HDL, TG/HDL e gráficos
              evolutivos com faixa ideal.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingLote(null);
              setIsLaunchModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold transition-colors cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>+ Registrar Primeiros Exames</span>
          </button>
        </div>
      ) : (
        <>
          {/* Paginação de datas caso existam mais de 4 coletas */}
          {lotesAsc.length > MAX_VISIBLE_COLS && (
            <div className="flex items-center justify-between px-1 text-xs text-slate-500">
              <span className="font-semibold">
                Exibindo {visibleLotes.length} de {lotesAsc.length} coletas (mais antiga → mais recente)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safeOffset >= maxOffset}
                  onClick={() => setWindowOffset((o) => Math.min(maxOffset, o + 1))}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-bold text-slate-700 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Anteriores</span>
                </button>
                <button
                  type="button"
                  disabled={safeOffset <= 0}
                  onClick={() => setWindowOffset((o) => Math.max(0, o - 1))}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-bold text-slate-700 cursor-pointer"
                >
                  <span>Mais recentes</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* TABELA COMPARATIVA LADO A LADO */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 min-w-[230px]">
                      Exame &amp; Referência
                      <span className="block text-[10px] font-medium normal-case text-slate-400 mt-0.5">
                        Clique em qualquer linha numérica para abrir o gráfico
                      </span>
                    </th>

                    {visibleLotes.map((lote, idx) => {
                      const isLatest =
                        lote.id === lotesAsc[lotesAsc.length - 1]?.id;
                      return (
                        <th
                          key={lote.id}
                          className={`py-2.5 px-3 text-center min-w-[138px] border-l border-slate-200/80 ${
                            isLatest ? "bg-teal-50/50" : ""
                          }`}
                        >
                          <div className="flex flex-col items-center">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-xs font-black font-mono tabular-nums ${
                                  isLatest ? "text-teal-900" : "text-slate-800"
                                }`}
                              >
                                {formatarDataBR(lote.dataColeta)}
                              </span>
                              {isLatest && (
                                <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded-full bg-teal-600 text-white">
                                  Atual
                                </span>
                              )}
                            </div>
                            {lote.laboratorio ? (
                              <span
                                className="text-[10px] font-medium text-slate-400 truncate max-w-[130px] mt-0.5"
                                title={lote.laboratorio}
                              >
                                {lote.laboratorio}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-300 mt-0.5">
                                Coleta #{lotesAsc.findIndex((x) => x.id === lote.id) + 1}
                              </span>
                            )}

                            {/* Ações compactas por data */}
                            <div className="flex items-center gap-1 mt-1.5">
                              <button
                                type="button"
                                onClick={() => void handleCopySummary(lote)}
                                className={`p-1 rounded-md border text-[10px] transition-colors cursor-pointer ${
                                  copiedLoteId === lote.id
                                    ? "bg-emerald-100 border-emerald-300 text-emerald-700"
                                    : "bg-white border-slate-200 text-slate-500 hover:text-teal-700 hover:border-teal-300"
                                }`}
                                title="Copiar resumo desta coleta para Evolução"
                              >
                                {copiedLoteId === lote.id ? (
                                  <Check className="w-3 h-3" />
                                ) : (
                                  <ClipboardCopy className="w-3 h-3" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingLote(lote);
                                  setIsLaunchModalOpen(true);
                                }}
                                className="p-1 rounded-md border border-slate-200 bg-white text-slate-500 hover:text-blue-700 hover:border-blue-300 transition-colors cursor-pointer"
                                title="Editar esta coleta"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingLote(lote)}
                                className="p-1 rounded-md border border-slate-200 bg-white text-slate-500 hover:text-rose-600 hover:border-rose-300 transition-colors cursor-pointer"
                                title="Excluir esta coleta"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          {idx === 0 && safeOffset < maxOffset ? null : null}
                        </th>
                      );
                    })}

                    <th className="py-3 px-3 text-center text-[11px] font-extrabold uppercase tracking-wider text-slate-500 border-l border-slate-200/80 min-w-[145px]">
                      Evolução (Δ)
                      <span className="block text-[9px] font-medium normal-case text-slate-400 mt-0.5">
                        Anterior → Atual
                      </span>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredGroups.length === 0 ? (
                    <tr>
                      <td
                        colSpan={visibleLotes.length + 2}
                        className="py-10 px-4 text-center text-xs text-slate-500"
                      >
                        Nenhum exame corresponde aos filtros ativos.
                      </td>
                    </tr>
                  ) : (
                    filteredGroups.map((group) => (
                      <React.Fragment key={group.id}>
                        {/* Cabeçalho do Grupo */}
                        <tr className="bg-teal-50/70 border-y border-teal-200/70">
                          <td
                            colSpan={visibleLotes.length + 2}
                            className="py-1.5 px-4 text-[11px] font-black uppercase tracking-wider text-teal-900"
                          >
                            {group.label}
                          </td>
                        </tr>

                        {/* Linhas de Exame */}
                        {group.rows.map((row) => {
                          const evo = row.evolution;
                          return (
                            <tr
                              key={row.key}
                              onClick={() => row.isNumeric && handleOpenChart(row)}
                              className={`border-b border-slate-100 transition-colors group ${
                                row.isNumeric
                                  ? "hover:bg-teal-50/35 cursor-pointer"
                                  : "hover:bg-slate-50/70"
                              }`}
                            >
                              {/* Nome & Referência */}
                              <td className="py-2.5 px-4">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-xs font-extrabold text-slate-900 group-hover:text-teal-900">
                                        {row.label}
                                      </span>
                                      {row.unit ? (
                                        <span className="text-[10px] font-mono text-slate-400">
                                          ({row.unit})
                                        </span>
                                      ) : null}
                                      {row.isCalculated && (
                                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 border border-teal-200">
                                          <Calculator className="w-2.5 h-2.5" />
                                          Auto
                                        </span>
                                      )}
                                    </div>
                                    <span className="block text-[10px] text-slate-400 mt-0.5">
                                      Ref: {row.refLabel}
                                    </span>
                                  </div>

                                  {row.isNumeric && (
                                    <span
                                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg bg-teal-100/70 text-teal-700 shrink-0"
                                      title="Ver gráfico evolutivo"
                                    >
                                      <LineChartIcon className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Valores por data */}
                              {visibleLotes.map((lote) => {
                                const cell = row.valuesByLoteId[lote.id];
                                const isLatest =
                                  lote.id === lotesAsc[lotesAsc.length - 1]?.id;
                                if (!cell) {
                                  return (
                                    <td
                                      key={lote.id}
                                      className={`py-2.5 px-3 text-center border-l border-slate-100 text-xs text-slate-300 ${
                                        isLatest ? "bg-teal-50/20" : ""
                                      }`}
                                    >
                                      —
                                    </td>
                                  );
                                }

                                const isAltered =
                                  cell.status === "high" || cell.status === "low";
                                return (
                                  <td
                                    key={lote.id}
                                    className={`py-2.5 px-3 text-center border-l border-slate-100 ${
                                      isLatest ? "bg-teal-50/20" : ""
                                    }`}
                                  >
                                    <span
                                      className={`inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-xs font-mono tabular-nums ${
                                        isAltered
                                          ? "font-black bg-rose-50 text-rose-700 border border-rose-200"
                                          : isLatest
                                            ? "font-black text-slate-900"
                                            : "font-bold text-slate-700"
                                      }`}
                                    >
                                      {cell.display}
                                    </span>
                                  </td>
                                );
                              })}

                              {/* Coluna Evolução (Δ) com cor clínica real */}
                              <td className="py-2.5 px-3 text-center border-l border-slate-100">
                                {evo && evo.deltaFormatted ? (
                                  <div className="inline-flex flex-col items-center gap-0.5">
                                    <span
                                      className={`text-xs font-black font-mono tabular-nums ${
                                        evo.trend === "improved"
                                          ? "text-emerald-700"
                                          : evo.trend === "worsened"
                                            ? "text-rose-700"
                                            : "text-slate-500"
                                      }`}
                                    >
                                      {evo.arrow} {evo.deltaFormatted}
                                    </span>
                                    {evo.badgeLabel && (
                                      <span
                                        className={`text-[9px] font-extrabold px-2 py-0.2 rounded-full border ${
                                          evo.trend === "improved"
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                            : evo.trend === "worsened"
                                              ? "bg-rose-50 text-rose-700 border-rose-200"
                                              : "bg-slate-100 text-slate-500 border-slate-200"
                                        }`}
                                      >
                                        {evo.badgeLabel}
                                      </span>
                                    )}
                                  </div>
                                ) : evo && evo.status !== "ok" ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                    {evo.status === "high" ? "Elevado" : "Baixo"}
                                  </span>
                                ) : (
                                  <span className="text-xs text-slate-300">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. BLOCO INFERIOR: LAUDOS DE IMAGEM E COMPLEMENTARES */}
          {lotesComLaudos.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileImage className="w-4 h-4 text-teal-600" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Laudos de Imagem &amp; Exames Complementares
                  </h3>
                </div>
                <span className="text-[11px] font-semibold text-slate-400">
                  {lotesComLaudos.length}{" "}
                  {lotesComLaudos.length === 1 ? "data" : "datas"}
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {lotesComLaudos.map((lote) => (
                  <div key={lote.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black font-mono text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-lg">
                          {formatarDataBR(lote.dataColeta)}
                        </span>
                        {lote.laboratorio && (
                          <span className="text-xs font-semibold text-slate-500">
                            {lote.laboratorio}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingLote(lote);
                          setIsLaunchModalOpen(true);
                        }}
                        className="text-[11px] font-bold text-slate-500 hover:text-teal-700 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Editar</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {Object.entries(lote.laudosImagem || {}).map(
                        ([key, text]) => {
                          if (!text?.trim()) return null;
                          const def = LAUDO_BY_KEY[key];
                          return (
                            <div
                              key={key}
                              className="rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-2"
                            >
                              <span className="block text-[10px] font-extrabold uppercase tracking-wider text-teal-700">
                                {def?.label || key}
                              </span>
                              <p className="text-xs text-slate-800 mt-0.5 leading-relaxed">
                                {text}
                              </p>
                            </div>
                          );
                        },
                      )}
                    </div>

                    {lote.observacoes?.trim() && (
                      <div className="rounded-xl bg-amber-50/50 border border-amber-200/70 px-3 py-2">
                        <span className="block text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
                          Observações da Coleta
                        </span>
                        <p className="text-xs text-slate-800 mt-0.5 leading-relaxed">
                          {lote.observacoes}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL DE LANÇAMENTO ULTRA-RÁPIDO (2 CAMPOS COLADOS + ROTINAS) */}
      <ExameLancamentoModal
        isOpen={isLaunchModalOpen}
        onClose={() => {
          setIsLaunchModalOpen(false);
          setEditingLote(null);
        }}
        pacienteId={pacienteId}
        pacienteNome={pacienteNome}
        editingLote={editingLote}
        onSaved={handleLoteSaved}
      />

      {/* MODAL DE GRÁFICO EVOLUTIVO DE 1 CLIQUE */}
      {chartState && (
        <ExameEvolucaoChartModal
          isOpen={true}
          onClose={() => setChartState(null)}
          pacienteNome={pacienteNome}
          examDef={chartState.examDef}
          points={chartState.points}
          evolution={chartState.evolution}
        />
      )}

      {/* CONFIRMAÇÃO DE EXCLUSÃO DE LOTE */}
      {deletingLote && (
        <div
          className="fixed inset-0 z-80 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-xs"
          onClick={() => !isDeleting && setDeletingLote(null)}
        >
          <div
            className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Excluir lote de exames?
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Deseja remover permanentemente os exames e laudos coletados em{" "}
                  <strong className="text-slate-800">
                    {formatarDataBR(deletingLote.dataColeta)}
                  </strong>
                  ? Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingLote(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void handleDeleteLote()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold cursor-pointer inline-flex items-center gap-1.5"
              >
                {isDeleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Excluir Lote</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
