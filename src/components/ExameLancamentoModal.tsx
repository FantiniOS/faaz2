"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  X,
  Search,
  Plus,
  Check,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Zap,
  Loader2,
  Save,
  Keyboard,
  FileImage,
  Calculator,
  Trash2,
} from "lucide-react";
import {
  CALCULATED_EXAMS,
  EXAM_BY_KEY,
  EXAM_CATEGORY_MAP,
  EXAM_ROUTINES,
  LAUDOS_IMAGEM_CATALOG,
  checkExamPlausibility,
  computeCalculatedExams,
  evaluateExamStatus,
  extractTermAndTrailingValue,
  formatExamNumber,
  normalizeSearchText,
  parseNumericExamValue,
  searchExamCatalog,
  type ExamDef,
  type ExameLaboratorialDTO,
  type ExamePersonalizadoDTO,
} from "@/lib/exames-catalog";
import { getHojeBR } from "@/lib/date-br";

interface ExameLancamentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  pacienteId: string;
  pacienteNome: string;
  editingLote?: ExameLaboratorialDTO | null;
  onSaved: (saved: ExameLaboratorialDTO) => void;
}

type DropdownOption =
  | { kind: "catalog"; exam: ExamDef }
  | { kind: "custom"; name: string };

function stripAccentsPreserveLength(input: string): string {
  return Array.from(input)
    .map((ch) =>
      ch
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase(),
    )
    .join("");
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const cleanQuery = query.trim();
  if (!cleanQuery) return <>{text}</>;
  const foldedText = stripAccentsPreserveLength(text);
  const foldedQuery = stripAccentsPreserveLength(cleanQuery);
  if (!foldedQuery) return <>{text}</>;
  const idx = foldedText.indexOf(foldedQuery);
  if (idx < 0) return <>{text}</>;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + foldedQuery.length);
  const after = text.slice(idx + foldedQuery.length);
  return (
    <>
      {before}
      <mark className="bg-emerald-100 text-emerald-900 rounded-[2px]">
        {match}
      </mark>
      {after}
    </>
  );
}

export function ExameLancamentoModal({
  isOpen,
  onClose,
  pacienteId,
  pacienteNome,
  editingLote = null,
  onSaved,
}: ExameLancamentoModalProps) {
  const [dataColeta, setDataColeta] = useState<string>(() => getHojeBR());
  const [laboratorio, setLaboratorio] = useState<string>("");
  const [valores, setValores] = useState<Record<string, number | string>>({});
  const [examesPersonalizados, setExamesPersonalizados] = useState<
    ExamePersonalizadoDTO[]
  >([]);
  const [laudosImagem, setLaudosImagem] = useState<Record<string, string>>({});
  const [observacoes, setObservacoes] = useState<string>("");

  // Barra 2-campos colados (Campo 1: Exame | Campo 2: Valor)
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [highlightedIdx, setHighlightedIdx] = useState<number>(0);

  const [selectedExam, setSelectedExam] = useState<ExamDef | null>(null);
  const [customExamName, setCustomExamName] = useState<string | null>(null);
  const [customUnit, setCustomUnit] = useState<string>("");
  const [customRef, setCustomRef] = useState<string>("");
  const [valorInput, setValorInput] = useState<string>("");
  const [prefilledHint, setPrefilledHint] = useState<string | null>(null);

  // Trava de plausibilidade clínica
  const [plausibilityWarning, setPlausibilityWarning] = useState<string | null>(
    null,
  );
  const [plausibilityConfirmToken, setPlausibilityConfirmToken] = useState<
    string | null
  >(null);

  // Atalho de Rotina Pronta ativa
  const [activeRoutineId, setActiveRoutineId] = useState<string | null>(null);
  const [routineDrafts, setRoutineDrafts] = useState<Record<string, string>>(
    {},
  );

  // Seção recolhível de Laudos de Imagem / Observações
  const [showLaudosSection, setShowLaudosSection] = useState<boolean>(false);

  // Estado de salvamento e erro
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastAddedFeedback, setLastAddedFeedback] = useState<string | null>(
    null,
  );

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const valueInputRef = useRef<HTMLInputElement | null>(null);
  const routineInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  // Inicializa estado ao abrir modal (novo ou edição)
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setPlausibilityWarning(null);
    setPlausibilityConfirmToken(null);
    setSelectedExam(null);
    setCustomExamName(null);
    setCustomUnit("");
    setCustomRef("");
    setSearchTerm("");
    setValorInput("");
    setPrefilledHint(null);
    setActiveRoutineId(null);
    setRoutineDrafts({});
    setIsDropdownOpen(false);
    setHighlightedIdx(0);
    setLastAddedFeedback(null);

    if (editingLote) {
      setDataColeta(editingLote.dataColeta || getHojeBR());
      setLaboratorio(editingLote.laboratorio || "");
      setValores({ ...(editingLote.valores || {}) });
      setExamesPersonalizados([...(editingLote.examesPersonalizados || [])]);
      setLaudosImagem({ ...(editingLote.laudosImagem || {}) });
      setObservacoes(editingLote.observacoes || "");
      const hasLaudos =
        Object.keys(editingLote.laudosImagem || {}).length > 0 ||
        Boolean(editingLote.observacoes?.trim());
      setShowLaudosSection(hasLaudos);
    } else {
      setDataColeta(getHojeBR());
      setLaboratorio("");
      setValores({});
      setExamesPersonalizados([]);
      setLaudosImagem({});
      setObservacoes("");
      setShowLaudosSection(false);
    }

    const t = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [isOpen, editingLote]);

  // Separação segura caso o médico digite "termo + valor" direto no Campo 1
  const parsedSearch = useMemo(
    () => extractTermAndTrailingValue(searchTerm),
    [searchTerm],
  );

  // Opções do dropdown ordenadas por priority
  const dropdownOptions = useMemo<DropdownOption[]>(() => {
    const query = parsedSearch.term.trim();
    if (!query) return [];
    const matches = searchExamCatalog(query, 6);
    const options: DropdownOption[] = matches.map((exam) => ({
      kind: "catalog",
      exam,
    }));

    const normQuery = normalizeSearchText(query);
    const hasExact = matches.some(
      (m) =>
        normalizeSearchText(m.label) === normQuery ||
        m.aliases.some((a) => normalizeSearchText(a) === normQuery),
    );

    if (query.length >= 2 && (!hasExact || matches.length === 0)) {
      options.push({ kind: "custom", name: query.toUpperCase() });
    }
    return options;
  }, [parsedSearch.term]);

  // Sempre que o usuário digitar "termo + número" no Campo 1, pré-preenche Campo 2 sem gravar silenciosamente
  useEffect(() => {
    if (parsedSearch.trailingValue && !selectedExam && !customExamName) {
      setValorInput(parsedSearch.trailingValue);
      setPrefilledHint(parsedSearch.trailingValue);
    } else if (!parsedSearch.trailingValue && prefilledHint && !selectedExam && !customExamName) {
      setValorInput("");
      setPrefilledHint(null);
    }
  }, [parsedSearch.trailingValue, selectedExam, customExamName, prefilledHint]);

  // Ajusta índice destacado ao mudar resultados
  useEffect(() => {
    setHighlightedIdx(0);
  }, [parsedSearch.term]);

  const showDropdown =
    isOpen &&
    isDropdownOpen &&
    dropdownOptions.length > 0 &&
    !selectedExam &&
    !customExamName;

  const updateDropdownPosition = useCallback(() => {
    const el = searchInputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 16;
    const maxHeight = Math.min(300, Math.max(180, spaceBelow));
    setDropdownPos({
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!showDropdown) {
      setDropdownPos(null);
      return;
    }
    updateDropdownPosition();
    const handleReposition = () => updateDropdownPosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [showDropdown, searchTerm, dropdownOptions.length, updateDropdownPosition]);

  // Mantém o item ativo visível ao navegar com ↑ / ↓
  useEffect(() => {
    if (!showDropdown) return;
    const activeBtn = optionRefs.current[highlightedIdx];
    activeBtn?.scrollIntoView({ block: "nearest" });
  }, [highlightedIdx, showDropdown]);

  // Cálculos automáticos ao vivo
  const calculatedValues = useMemo(
    () => computeCalculatedExams(valores),
    [valores],
  );

  const flashFeedback = (msg: string) => {
    setLastAddedFeedback(msg);
    if (lastFeedbackTimer.current) clearTimeout(lastFeedbackTimer.current);
    lastFeedbackTimer.current = setTimeout(() => {
      setLastAddedFeedback(null);
    }, 2400);
  };

  const resetTwoFieldBar = () => {
    setSelectedExam(null);
    setCustomExamName(null);
    setCustomUnit("");
    setCustomRef("");
    setSearchTerm("");
    setValorInput("");
    setPrefilledHint(null);
    setPlausibilityWarning(null);
    setPlausibilityConfirmToken(null);
    setIsDropdownOpen(false);
    setHighlightedIdx(0);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 10);
  };

  const selectDropdownOption = (opt: DropdownOption) => {
    const trailing = parsedSearch.trailingValue;
    setPlausibilityWarning(null);
    setPlausibilityConfirmToken(null);
    setIsDropdownOpen(false);

    if (opt.kind === "catalog") {
      setSelectedExam(opt.exam);
      setCustomExamName(null);
      setSearchTerm(opt.exam.label);
      if (trailing) {
        setValorInput(trailing);
      } else if (valores[opt.exam.key] !== undefined) {
        const existing = valores[opt.exam.key];
        setValorInput(
          typeof existing === "number"
            ? String(existing).replace(".", ",")
            : String(existing),
        );
      } else {
        setValorInput("");
      }
    } else {
      setSelectedExam(null);
      setCustomExamName(opt.name);
      setSearchTerm(opt.name);
      setCustomUnit("");
      setCustomRef("");
      if (trailing) {
        setValorInput(trailing);
      } else {
        setValorInput("");
      }
    }

    setPrefilledHint(null);
    setTimeout(() => {
      valueInputRef.current?.focus();
      valueInputRef.current?.select();
    }, 10);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isDropdownOpen && searchTerm.trim()) {
        setIsDropdownOpen(true);
      }
      setHighlightedIdx((prev) =>
        dropdownOptions.length > 0 ? (prev + 1) % dropdownOptions.length : 0,
      );
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (dropdownOptions.length > 0) {
        setHighlightedIdx((prev) =>
          (prev - 1 + dropdownOptions.length) % dropdownOptions.length,
        );
      }
      return;
    }

    if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey && dropdownOptions.length > 0 && !selectedExam && !customExamName)) {
      if (e.ctrlKey || e.metaKey) return; // deixa Ctrl+Enter salvar o lote
      if (dropdownOptions.length > 0) {
        e.preventDefault();
        const chosen = dropdownOptions[highlightedIdx] || dropdownOptions[0];
        if (chosen) {
          selectDropdownOption(chosen);
        }
      } else if (selectedExam || customExamName) {
        e.preventDefault();
        valueInputRef.current?.focus();
      }
      return;
    }

    if (e.key === "Escape") {
      if (isDropdownOpen || searchTerm || selectedExam || customExamName) {
        e.preventDefault();
        e.stopPropagation();
        resetTwoFieldBar();
      }
    }
  };

  const commitCurrentEntry = () => {
    setErrorMsg(null);
    const trimmedVal = valorInput.trim();
    if (!trimmedVal) {
      valueInputRef.current?.focus();
      return;
    }

    if (selectedExam) {
      if (selectedExam.type === "number") {
        const parsedNum = parseNumericExamValue(trimmedVal);
        if (parsedNum === null) {
          setPlausibilityWarning(
            `Digite um número válido para ${selectedExam.label} (ex.: 92 ou 5,7).`,
          );
          setPlausibilityConfirmToken(null);
          return;
        }

        const token = `${selectedExam.key}::${parsedNum}`;
        const check = checkExamPlausibility(selectedExam, parsedNum);
        if (!check.plausible && plausibilityConfirmToken !== token) {
          setPlausibilityWarning(
            check.message ||
              "Valor fora da faixa fisiológica esperada. Pressione Enter novamente para confirmar.",
          );
          setPlausibilityConfirmToken(token);
          return;
        }

        setValores((prev) => ({ ...prev, [selectedExam.key]: parsedNum }));
        // Sincroniza rotina aberta, se contiver a chave
        if (activeRoutineId) {
          setRoutineDrafts((prev) =>
            prev[selectedExam.key] !== undefined
              ? { ...prev, [selectedExam.key]: trimmedVal }
              : prev,
          );
        }
        flashFeedback(
          `${selectedExam.label}: ${formatExamNumber(parsedNum, selectedExam.decimals)} ${selectedExam.unit}`,
        );
        resetTwoFieldBar();
        return;
      }

      // Exame qualitativo (texto curto)
      const upperVal = trimmedVal.toUpperCase();
      setValores((prev) => ({ ...prev, [selectedExam.key]: upperVal }));
      flashFeedback(`${selectedExam.label}: ${upperVal}`);
      resetTwoFieldBar();
      return;
    }

    if (customExamName) {
      const parsedNum = parseNumericExamValue(trimmedVal);
      const val: string | number =
        parsedNum !== null && /^[\d.,\s+-]+$/.test(trimmedVal)
          ? parsedNum
          : trimmedVal.toUpperCase();

      const item: ExamePersonalizadoDTO = {
        nome: customExamName.trim().toUpperCase(),
        valor: val,
        unidade: customUnit.trim() || undefined,
        referencia: customRef.trim() || undefined,
      };

      setExamesPersonalizados((prev) => {
        const idx = prev.findIndex((p) => p.nome === item.nome);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = item;
          return next;
        }
        return [...prev, item];
      });
      flashFeedback(
        `${item.nome}: ${item.valor}${item.unidade ? ` ${item.unidade}` : ""}`,
      );
      resetTwoFieldBar();
    }
  };

  const handleValueKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      commitCurrentEntry();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      resetTwoFieldBar();
    }
  };

  // Atalho de rotina pronta
  const handleToggleRoutine = (routineId: string) => {
    if (activeRoutineId === routineId) {
      setActiveRoutineId(null);
      setTimeout(() => searchInputRef.current?.focus(), 20);
      return;
    }
    const routine = EXAM_ROUTINES.find((r) => r.id === routineId);
    if (!routine) return;
    const initial: Record<string, string> = {};
    for (const k of routine.keys) {
      const existing = valores[k];
      initial[k] =
        existing !== undefined
          ? typeof existing === "number"
            ? String(existing).replace(".", ",")
            : String(existing)
          : "";
    }
    setRoutineDrafts(initial);
    setActiveRoutineId(routineId);
    routineInputRefs.current = [];
    setTimeout(() => {
      routineInputRefs.current[0]?.focus();
    }, 40);
  };

  const handleRoutineFieldChange = (key: string, raw: string) => {
    setRoutineDrafts((prev) => ({ ...prev, [key]: raw }));
    const def = EXAM_BY_KEY[key];
    if (!def) return;
    const trimmed = raw.trim();
    if (!trimmed) {
      setValores((prev) => {
        if (!(key in prev)) return prev;
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
      return;
    }
    if (def.type === "number") {
      const parsed = parseNumericExamValue(trimmed);
      if (parsed !== null) {
        setValores((prev) => ({ ...prev, [key]: parsed }));
      }
    } else {
      setValores((prev) => ({ ...prev, [key]: trimmed.toUpperCase() }));
    }
  };

  const handleRoutineKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    idx: number,
    total: number,
  ) => {
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (idx + 1 < total) {
        routineInputRefs.current[idx + 1]?.focus();
        routineInputRefs.current[idx + 1]?.select();
      } else {
        // Último campo da rotina: volta para busca livre
        searchInputRef.current?.focus();
      }
    }
  };

  const handleRemoveValor = (key: string) => {
    setValores((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setRoutineDrafts((prev) =>
      key in prev ? { ...prev, [key]: "" } : prev,
    );
  };

  const handleInlineEditValor = (key: string, raw: string) => {
    const def = EXAM_BY_KEY[key];
    if (!def) return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (def.type === "number") {
      const num = parseNumericExamValue(trimmed);
      if (num !== null) {
        setValores((prev) => ({ ...prev, [key]: num }));
      }
    } else {
      setValores((prev) => ({ ...prev, [key]: trimmed.toUpperCase() }));
    }
  };

  const handleSaveBatch = async () => {
    if (isSaving) return;
    setErrorMsg(null);

    if (!dataColeta) {
      setErrorMsg("Informe a data da coleta.");
      return;
    }

    const totalFilled =
      Object.keys(valores).length +
      examesPersonalizados.length +
      Object.values(laudosImagem).filter((v) => v.trim().length > 0).length +
      (observacoes.trim() ? 1 : 0);

    if (totalFilled === 0) {
      setErrorMsg(
        "Adicione ao menos um exame laboratorial, exame personalizado ou laudo antes de salvar.",
      );
      searchInputRef.current?.focus();
      return;
    }

    try {
      setIsSaving(true);
      const url = editingLote
        ? `/api/pacientes/${encodeURIComponent(pacienteId)}/exames/${encodeURIComponent(editingLote.id)}`
        : `/api/pacientes/${encodeURIComponent(pacienteId)}/exames`;

      const res = await fetch(url, {
        method: editingLote ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataColeta,
          laboratorio: laboratorio.trim() ? laboratorio.trim().toUpperCase() : null,
          valores,
          examesPersonalizados,
          laudosImagem,
          observacoes: observacoes.trim() ? observacoes.trim().toUpperCase() : null,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setErrorMsg(
          json?.error || "Não foi possível salvar os exames. Tente novamente.",
        );
        return;
      }

      onSaved(json.exame as ExameLaboratorialDTO);
      onClose();
    } catch {
      setErrorMsg("Erro de comunicação ao salvar os exames.");
    } finally {
      setIsSaving(false);
    }
  };

  // Atalho global Ctrl+Enter para salvar o lote inteiro direto pelo teclado
  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void handleSaveBatch();
      }
    };
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  });

  if (!isOpen) return null;

  const addedEntries = Object.entries(valores)
    .map(([key, val]) => ({ key, val, def: EXAM_BY_KEY[key] }))
    .filter((item): item is { key: string; val: number | string; def: ExamDef } => Boolean(item.def));

  const activeRoutine = activeRoutineId
    ? EXAM_ROUTINES.find((r) => r.id === activeRoutineId) || null
    : null;

  const calculatedEntries = CALCULATED_EXAMS.filter(
    (c) => calculatedValues[c.key] !== undefined,
  );

  const laudosCount =
    Object.values(laudosImagem).filter((v) => v.trim().length > 0).length +
    (observacoes.trim() ? 1 : 0);

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-2 sm:p-4 bg-slate-900/45 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-5xl sm:min-h-[540px] max-h-[88vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. CABEÇALHO COMPACTO: TÍTULO + DATA + LABORATÓRIO */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-teal-50/80 via-white to-emerald-50/70 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Zap className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black text-slate-900 tracking-tight truncate">
                {editingLote ? "Editar Lote de Exames" : "Registrar Exames Laboratoriais"}
              </h2>
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-slate-700">{pacienteNome}</span>
                <span>•</span>
                <span className="inline-flex items-center gap-1 text-teal-700 font-semibold">
                  <Keyboard className="w-3 h-3" />
                  Exame → Enter → Valor → Enter • Ctrl+Enter salva
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-2xs">
              <label
                htmlFor="exame-data-coleta"
                className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0"
              >
                Coleta
              </label>
              <input
                id="exame-data-coleta"
                type="date"
                value={dataColeta}
                onChange={(e) => setDataColeta(e.target.value)}
                className="text-xs font-bold text-slate-800 bg-transparent outline-hidden cursor-pointer"
              />
            </div>

            <input
              type="text"
              value={laboratorio}
              onChange={(e) => setLaboratorio(e.target.value.toUpperCase())}
              placeholder="LABORATÓRIO (OPCIONAL)"
              className="w-44 sm:w-48 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 outline-hidden uppercase"
            />

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. CORPO COM ROLAGEM CONTROLADA */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {/* BARRA DE LANÇAMENTO EM 2 CAMPOS COLADOS (100% TECLADO) */}
          <div className="rounded-2xl bg-slate-50/90 border border-slate-200/90 p-3.5 shadow-2xs space-y-2.5">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-start">
              {/* CAMPO 1: BUSCAR EXAME */}
              <div className="md:col-span-7 relative">
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                  1. Exame (nome ou sigla)
                </label>
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      if (selectedExam || customExamName) {
                        setSelectedExam(null);
                        setCustomExamName(null);
                        setPlausibilityWarning(null);
                        setPlausibilityConfirmToken(null);
                      }
                      setIsDropdownOpen(true);
                    }}
                    onFocus={() => {
                      if (searchTerm.trim()) {
                        setIsDropdownOpen(true);
                        updateDropdownPosition();
                      }
                    }}
                    onBlur={() => {
                      setIsDropdownOpen(false);
                    }}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Digite o nome ou sigla do exame (ex.: gli, tsh, vit d, ferr)..."
                    autoComplete="off"
                    className={`w-full pl-9 pr-9 py-2.5 rounded-xl border text-sm font-semibold transition-all outline-hidden ${
                      selectedExam || customExamName
                        ? "bg-teal-50/70 border-teal-500 text-teal-950 ring-2 ring-teal-500/15"
                        : "bg-white border-slate-300 text-slate-900 focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20"
                    }`}
                  />
                  {(searchTerm || selectedExam || customExamName) && (
                    <button
                      type="button"
                      onClick={resetTwoFieldBar}
                      className="absolute right-2.5 p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
                      title="Limpar seleção (Esc)"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Aviso de desambiguação segura quando digitado "termo + valor" */}
                {parsedSearch.trailingValue && !selectedExam && !customExamName && (
                  <p className="mt-1.5 text-[11px] font-semibold text-teal-700 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Valor <strong className="font-mono">{parsedSearch.trailingValue}</strong> pré-preenchido ao lado — confirme o exame exato abaixo com{" "}
                      <kbd className="px-1 py-0.5 rounded bg-white border border-teal-200 text-[10px] font-mono">↑/↓</kbd> +{" "}
                      <kbd className="px-1 py-0.5 rounded bg-white border border-teal-200 text-[10px] font-mono">Enter</kbd>.
                    </span>
                  </p>
                )}

                {/* Exame travado em destaque */}
                {(selectedExam || customExamName) && (
                  <div className="mt-1.5 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-teal-600/10 border border-teal-500/30 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded-md bg-teal-600 text-white text-[10px] font-black uppercase shrink-0">
                        Selecionado
                      </span>
                      <span className="font-extrabold text-teal-950 truncate">
                        {selectedExam ? selectedExam.label : customExamName}
                      </span>
                      {selectedExam?.unit ? (
                        <span className="text-[11px] font-mono font-bold text-teal-700 shrink-0">
                          ({selectedExam.unit})
                        </span>
                      ) : null}
                    </div>
                    <span className="text-[10px] font-semibold text-teal-800/80 shrink-0">
                      {selectedExam ? `Ref: ${selectedExam.refLabel}` : "Exame personalizado"}
                    </span>
                  </div>
                )}

                {/* Dropdown de resultados renderizado em Portal acima do modal */}
                {showDropdown &&
                  dropdownPos &&
                  typeof document !== "undefined" &&
                  createPortal(
                    <div
                      role="listbox"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.preventDefault()}
                      style={{
                        position: "fixed",
                        top: dropdownPos.top,
                        left: dropdownPos.left,
                        width: dropdownPos.width,
                        maxHeight: dropdownPos.maxHeight,
                        zIndex: 9999,
                      }}
                      className="bg-white rounded-xl border border-slate-200 shadow-2xl max-h-[300px] overflow-y-auto divide-y divide-slate-100"
                    >
                      {dropdownOptions.map((opt, idx) => {
                        const isActive = idx === highlightedIdx;
                        if (opt.kind === "catalog") {
                          const cat = EXAM_CATEGORY_MAP[opt.exam.category];
                          const alreadyFilled = valores[opt.exam.key] !== undefined;
                          return (
                            <button
                              key={opt.exam.key}
                              ref={(el) => {
                                optionRefs.current[idx] = el;
                              }}
                              type="button"
                              role="option"
                              aria-selected={isActive}
                              onMouseEnter={() => setHighlightedIdx(idx)}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                selectDropdownOption(opt);
                              }}
                              className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                                isActive
                                  ? "bg-teal-50 text-teal-950"
                                  : "bg-white hover:bg-slate-50 text-slate-800"
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-extrabold truncate">
                                    <HighlightMatch
                                      text={opt.exam.label}
                                      query={parsedSearch.term}
                                    />
                                  </span>
                                  {alreadyFilled && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                                      Lançado
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                                  <span className="font-semibold text-slate-600">
                                    {cat?.shortLabel}
                                  </span>
                                  <span>•</span>
                                  <span>Ref: {opt.exam.refLabel}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {opt.exam.unit ? (
                                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                                    {opt.exam.unit}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">
                                    texto
                                  </span>
                                )}
                                {isActive && (
                                  <kbd className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-teal-600 text-white">
                                    Enter
                                  </kbd>
                                )}
                              </div>
                            </button>
                          );
                        }

                        return (
                          <button
                            key={`custom-${opt.name}`}
                            ref={(el) => {
                              optionRefs.current[idx] = el;
                            }}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            onMouseEnter={() => setHighlightedIdx(idx)}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              selectDropdownOption(opt);
                            }}
                            className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                              isActive
                                ? "bg-amber-50 text-amber-950"
                                : "bg-slate-50/70 hover:bg-amber-50/50 text-slate-700"
                            }`}
                          >
                            <span className="text-xs font-bold flex items-center gap-1.5">
                              <Plus className="w-3.5 h-3.5 text-amber-600" />
                              Adicionar &ldquo;{opt.name}&rdquo; como exame personalizado
                            </span>
                            {isActive && (
                              <kbd className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-600 text-white">
                                Enter
                              </kbd>
                            )}
                          </button>
                        );
                      })}
                    </div>,
                    document.body,
                  )}
              </div>

              {/* CAMPO 2: VALOR + UNIDADE VISÍVEL */}
              <div className="md:col-span-5">
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                  2. Valor {selectedExam?.unit ? `(${selectedExam.unit})` : ""}
                </label>
                <div className="flex items-stretch gap-2">
                  <div className="relative flex-1 flex items-center">
                    <input
                      ref={valueInputRef}
                      type="text"
                      inputMode={
                        selectedExam?.type === "text" ? "text" : "decimal"
                      }
                      value={valorInput}
                      onChange={(e) => {
                        setValorInput(e.target.value);
                        if (plausibilityWarning) {
                          setPlausibilityWarning(null);
                          setPlausibilityConfirmToken(null);
                        }
                      }}
                      onKeyDown={handleValueKeyDown}
                      disabled={!selectedExam && !customExamName}
                      placeholder={
                        selectedExam
                          ? selectedExam.type === "text"
                            ? "Ex.: NÃO REAGENTE"
                            : "Digite o resultado..."
                          : customExamName
                            ? "Digite o resultado..."
                            : "Selecione o exame primeiro"
                      }
                      className={`w-full pl-3.5 pr-16 py-2.5 rounded-xl border text-sm font-mono font-bold transition-all outline-hidden ${
                        plausibilityWarning
                          ? "bg-amber-50 border-amber-500 text-amber-950 ring-2 ring-amber-500/20"
                          : selectedExam || customExamName
                            ? "bg-white border-teal-500 text-slate-900 focus:ring-2 focus:ring-teal-500/25"
                            : "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                      }`}
                    />
                    {(selectedExam?.unit || customUnit) && (
                      <span className="absolute right-3 text-xs font-mono font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200 pointer-events-none">
                        {selectedExam?.unit || customUnit}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={commitCurrentEntry}
                    disabled={(!selectedExam && !customExamName) || !valorInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-extrabold transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 shadow-xs"
                    title="Confirmar (Enter)"
                  >
                    <Check className="w-4 h-4" />
                    <span>OK</span>
                  </button>
                </div>

                {/* Campos extras rápidos se for exame personalizado */}
                {customExamName && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={customUnit}
                      onChange={(e) => setCustomUnit(e.target.value)}
                      onKeyDown={handleValueKeyDown}
                      placeholder="Unidade (opc., ex.: ng/mL)"
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-medium text-slate-700 outline-hidden focus:border-teal-500"
                    />
                    <input
                      type="text"
                      value={customRef}
                      onChange={(e) => setCustomRef(e.target.value)}
                      onKeyDown={handleValueKeyDown}
                      placeholder="Ref. (opc., ex.: < 10)"
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-medium text-slate-700 outline-hidden focus:border-teal-500"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Aviso Inline de Plausibilidade Clínica */}
            {plausibilityWarning && (
              <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">
                  <span className="font-bold">Trava de Plausibilidade Clínica: </span>
                  {plausibilityWarning}
                </div>
              </div>
            )}

            {/* Feedback sutil de exame adicionado + Atalhos de Rotina Pronta */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/70">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                  Rotinas prontas:
                </span>
                {EXAM_ROUTINES.map((routine) => {
                  const isOpenRoutine = activeRoutineId === routine.id;
                  const filledCount = routine.keys.filter(
                    (k) => valores[k] !== undefined,
                  ).length;
                  return (
                    <button
                      key={routine.id}
                      type="button"
                      onClick={() => handleToggleRoutine(routine.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                        isOpenRoutine
                          ? "bg-teal-600 text-white border-teal-600 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:border-teal-400 hover:text-teal-800"
                      }`}
                      title={routine.description}
                    >
                      <span>{routine.label}</span>
                      <span
                        className={`text-[10px] font-mono px-1 rounded ${
                          isOpenRoutine
                            ? "bg-white/20 text-white"
                            : filledCount > 0
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {filledCount > 0
                          ? `${filledCount}/${routine.keys.length}`
                          : routine.keys.length}
                      </span>
                    </button>
                  );
                })}
              </div>

              {lastAddedFeedback && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full animate-in fade-in duration-150">
                  <Check className="w-3 h-3" />
                  Adicionado: {lastAddedFeedback}
                </span>
              )}
            </div>

            {/* Grade Rápida da Rotina Pronta Selecionada (Enter pula para o próximo campo) */}
            {activeRoutine && (
              <div className="mt-2 pt-3 border-t border-slate-200 bg-white rounded-xl p-3 border shadow-2xs">
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-800">
                      {activeRoutine.label} — Preenchimento Rápido
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Digite o valor e pressione{" "}
                      <kbd className="px-1 py-0.2 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono">
                        Enter
                      </kbd>{" "}
                      para pular automaticamente ao próximo campo (deixe vazio os que não tiver).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveRoutineId(null)}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-100 cursor-pointer"
                  >
                    Fechar rotina
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                  {activeRoutine.keys.map((key, idx) => {
                    const def = EXAM_BY_KEY[key];
                    if (!def) return null;
                    const draftVal = routineDrafts[key] ?? "";
                    const parsed = parseNumericExamValue(draftVal);
                    const plaus =
                      draftVal.trim() && def.type === "number"
                        ? checkExamPlausibility(def, draftVal)
                        : { plausible: true };

                    return (
                      <div
                        key={key}
                        className={`rounded-xl border p-2 transition-colors ${
                          !plaus.plausible
                            ? "border-amber-400 bg-amber-50/70"
                            : parsed !== null
                              ? "border-emerald-300 bg-emerald-50/40"
                              : "border-slate-200 bg-slate-50/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <label className="text-[11px] font-bold text-slate-800 truncate">
                            {def.shortLabel || def.label}
                          </label>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">
                            {def.unit}
                          </span>
                        </div>
                        <input
                          ref={(el) => {
                            routineInputRefs.current[idx] = el;
                          }}
                          type="text"
                          inputMode="decimal"
                          value={draftVal}
                          onChange={(e) =>
                            handleRoutineFieldChange(key, e.target.value)
                          }
                          onKeyDown={(e) =>
                            handleRoutineKeyDown(e, idx, activeRoutine.keys.length)
                          }
                          placeholder={def.refLabel}
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono font-bold text-slate-900 placeholder:text-slate-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-hidden"
                        />
                        {!plaus.plausible && (
                          <span className="block text-[9px] font-bold text-amber-700 mt-0.5 leading-tight">
                            Esperado: {def.plausibleMin}–{def.plausibleMax}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 3. RESUMO AO VIVO DO LOTE DIGITADO + CÁLCULOS AUTOMÁTICOS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                Exames neste Lote ({addedEntries.length + examesPersonalizados.length})
              </h3>
              {calculatedEntries.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700">
                  <Calculator className="w-3.5 h-3.5" />
                  {calculatedEntries.length} cálculo(s) automático(s) ativo(s)
                </span>
              )}
            </div>

            {/* Faixa de Cálculos Automáticos em Tempo Real */}
            {calculatedEntries.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {calculatedEntries.map((calcDef) => {
                  const val = calculatedValues[calcDef.key];
                  const status = evaluateExamStatus(val, calcDef);
                  return (
                    <div
                      key={calcDef.key}
                      className={`rounded-xl border px-3 py-2 flex flex-col justify-between ${
                        status === "ok"
                          ? "bg-emerald-50/70 border-emerald-200"
                          : "bg-amber-50/80 border-amber-200"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-teal-800">
                          {calcDef.shortLabel || calcDef.label}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-white/80 text-teal-700 border border-teal-200/70">
                          Auto
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span
                          className={`text-base font-black font-mono tabular-nums ${
                            status === "ok" ? "text-emerald-800" : "text-amber-800"
                          }`}
                        >
                          {formatExamNumber(val, calcDef.decimals)}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500">
                          {calcDef.unit}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        Ref: {calcDef.refLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Lista de Exames Lançados */}
            {addedEntries.length === 0 && examesPersonalizados.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-8 px-4 text-center">
                <p className="text-xs font-bold text-slate-600">
                  Nenhum exame adicionado ainda neste lote
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Digite no Campo 1 acima (ex.: <code className="font-mono text-slate-600">gli</code>,{" "}
                  <code className="font-mono text-slate-600">hba1c</code>,{" "}
                  <code className="font-mono text-slate-600">tsh</code>,{" "}
                  <code className="font-mono text-slate-600">vit d</code>) ou clique em uma Rotina Pronta.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {addedEntries.map(({ key, val, def }) => {
                  const numVal = typeof val === "number" ? val : null;
                  const status =
                    numVal !== null ? evaluateExamStatus(numVal, def) : "ok";
                  return (
                    <div
                      key={key}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 flex items-center justify-between gap-2 shadow-2xs hover:border-teal-300 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-extrabold text-slate-900 truncate">
                            {def.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-slate-400 truncate">
                            Ref: {def.refLabel}
                          </span>
                          {numVal !== null && (
                            <span
                              className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-full ${
                                status === "ok"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-rose-50 text-rose-700 border border-rose-200"
                              }`}
                            >
                              {status === "ok"
                                ? "Na meta"
                                : status === "high"
                                  ? "Alto"
                                  : "Baixo"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="text"
                          defaultValue={
                            typeof val === "number"
                              ? formatExamNumber(val, def.decimals)
                              : String(val)
                          }
                          onBlur={(e) => handleInlineEditValor(key, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.currentTarget.blur();
                            }
                          }}
                          className="w-20 px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-right text-xs font-mono font-bold text-slate-900 focus:bg-white focus:border-teal-500 outline-hidden"
                          title="Clique para editar valor inline"
                        />
                        {def.unit ? (
                          <span className="text-[10px] font-mono text-slate-400 w-11 truncate">
                            {def.unit}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleRemoveValor(key)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Remover exame"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {examesPersonalizados.map((custom, idx) => (
                  <div
                    key={`${custom.nome}-${idx}`}
                    className="rounded-xl border border-amber-200 bg-amber-50/30 px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-extrabold text-slate-900 truncate">
                          {custom.nome}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                          Custom
                        </span>
                      </div>
                      {custom.referencia && (
                        <span className="text-[10px] text-slate-500 block truncate">
                          Ref: {custom.referencia}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-mono font-bold text-slate-900">
                        {typeof custom.valor === "number"
                          ? formatExamNumber(custom.valor)
                          : custom.valor}
                        {custom.unidade ? ` ${custom.unidade}` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setExamesPersonalizados((prev) =>
                            prev.filter((_, i) => i !== idx),
                          )
                        }
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Remover exame personalizado"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. SEÇÃO RECOLHÍVEL DISCRETA: LAUDOS DE IMAGEM & OBSERVAÇÕES */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setShowLaudosSection((prev) => !prev)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <FileImage className="w-4 h-4 text-teal-600" />
                <span>+ Adicionar Laudo de Imagem / Observações</span>
                {laudosCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-50 text-teal-700 border border-teal-200">
                    {laudosCount} preenchido(s)
                  </span>
                )}
              </span>
              {showLaudosSection ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {showLaudosSection && (
              <div className="px-4 pb-4 pt-2 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3">
                {LAUDOS_IMAGEM_CATALOG.map((laudo) => (
                  <div key={laudo.key}>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      {laudo.label}
                    </label>
                    <textarea
                      rows={2}
                      value={laudosImagem[laudo.key] || ""}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setLaudosImagem((prev) => {
                          const next = { ...prev };
                          if (val.trim()) next[laudo.key] = val;
                          else delete next[laudo.key];
                          return next;
                        });
                      }}
                      placeholder={laudo.placeholder}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 outline-hidden uppercase resize-none"
                    />
                  </div>
                ))}

                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Observações Gerais da Coleta
                  </label>
                  <textarea
                    rows={2}
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value.toUpperCase())}
                    placeholder="EX.: JEJUM DE 12H, EM USO DE LEVOTIROXINA 50MCG, COLETA NO 3º DIA DO CICLO..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 outline-hidden uppercase resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 5. RODAPÉ FIXO COM AÇÃO DE SALVAR */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
          <div className="text-xs">
            {errorMsg ? (
              <span className="text-rose-600 font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {errorMsg}
              </span>
            ) : (
              <span className="text-slate-500">
                Pressione{" "}
                <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-300 text-[10px] font-mono font-bold text-slate-700">
                  Ctrl + Enter
                </kbd>{" "}
                para salvar o lote inteiro direto pelo teclado.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSaveBatch()}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-xs font-extrabold transition-colors cursor-pointer flex items-center gap-2 shadow-sm"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>
                    {editingLote ? "Salvar Alterações" : "Salvar Lote de Exames"}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
