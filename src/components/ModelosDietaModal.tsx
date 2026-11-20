"use client";

import React, { useMemo, useState } from "react";
import {
  BookOpen,
  Sparkles,
  Search,
  X,
  Flame,
  ArrowLeftRight,
  Check,
  Pencil,
  Trash2,
  Loader2,
  BookmarkPlus,
  Layers,
  Utensils,
  Replace,
  ListPlus,
  AlertCircle,
} from "lucide-react";
import {
  CATEGORIAS_REFEICAO_OPCOES,
  OBJETIVOS_TAG_OPCOES,
  calcularResumoModelo,
  getCategoriaRefeicaoLabel,
  getObjetivoTagMeta,
  isConteudoPlanoCompleto,
  type CategoriaRefeicaoModelo,
  type EscopoModeloDieta,
  type ModeloDietaDTO,
  type ObjetivoTagModelo,
} from "@/lib/modelos-dieta-types";

type FiltroObjetivo =
  | "TODOS"
  | "EMAGRECIMENTO"
  | "HIPERTROFIA"
  | "CONTROLE_GLICEMICO"
  | "MEUS_MODELOS";

export interface ModelosDietaLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  modelos: ModeloDietaDTO[];
  carregando: boolean;
  erro: string | null;
  onRecarregar: () => void;
  /** Quando definido, abre focado em aplicar um modelo naquela refeição específica. */
  targetRefeicao?: {
    id: string;
    nome: string;
    categoriaInicial: CategoriaRefeicaoModelo;
    possuiItens: boolean;
  } | null;
  variacaoAtivaNome: string;
  variacaoAtivaPossuiItens: boolean;
  onAplicarRefeicao: (
    modelo: ModeloDietaDTO,
    modo: "substituir" | "adicionar",
  ) => void;
  onAplicarPlanoCompleto: (modelo: ModeloDietaDTO) => void;
  onEditarModelo: (
    id: string,
    patch: {
      titulo: string;
      descricao: string | null;
      objetivoTag: ObjetivoTagModelo;
    },
  ) => Promise<void>;
  onExcluirModelo: (id: string) => Promise<void>;
}

export function ModelosDietaLibraryModal({
  isOpen,
  onClose,
  modelos,
  carregando,
  erro,
  onRecarregar,
  targetRefeicao,
  variacaoAtivaNome,
  variacaoAtivaPossuiItens,
  onAplicarRefeicao,
  onAplicarPlanoCompleto,
  onEditarModelo,
  onExcluirModelo,
}: ModelosDietaLibraryModalProps) {
  const isMealPickerMode = Boolean(targetRefeicao);

  const [abaBiblioteca, setAbaBiblioteca] = useState<
    "PLANO_COMPLETO" | "REFEICAO"
  >(isMealPickerMode ? "REFEICAO" : "PLANO_COMPLETO");
  const [categoriaFiltro, setCategoriaFiltro] = useState<
    CategoriaRefeicaoModelo | "TODAS"
  >(targetRefeicao?.categoriaInicial ?? "TODAS");
  const [objetivoFiltro, setObjetivoFiltro] =
    useState<FiltroObjetivo>("TODOS");
  const [busca, setBusca] = useState("");

  // Escolha rápida Substituir vs. Adicionar quando a refeição já tem itens
  const [pendingApplyId, setPendingApplyId] = useState<string | null>(null);
  const [pendingPlanConfirmId, setPendingPlanConfirmId] = useState<
    string | null
  >(null);

  // Edição inline (renomear/editar) + exclusão
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitulo, setEditTitulo] = useState("");
  const [editDescricao, setEditDescricao] = useState("");
  const [editObjetivo, setEditObjetivo] = useState<ObjetivoTagModelo>("GERAL");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const escopoAtivo: EscopoModeloDieta = isMealPickerMode
    ? "REFEICAO"
    : abaBiblioteca;

  const modelosFiltrados = useMemo(() => {
    const q = busca
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

    return modelos.filter((m) => {
      if (m.escopo !== escopoAtivo) return false;

      if (
        escopoAtivo === "REFEICAO" &&
        categoriaFiltro !== "TODAS" &&
        m.categoriaRefeicao !== categoriaFiltro
      ) {
        return false;
      }

      if (objetivoFiltro === "MEUS_MODELOS") {
        if (m.padraoSistema) return false;
      } else if (objetivoFiltro !== "TODOS") {
        if (m.objetivoTag !== objetivoFiltro) return false;
      }

      if (q) {
        const resumo = calcularResumoModelo(m);
        const hay = [
          m.titulo,
          m.descricao || "",
          ...resumo.nomesAlimentos,
        ]
          .join(" ")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [modelos, escopoAtivo, categoriaFiltro, objetivoFiltro, busca]);

  if (!isOpen) return null;

  const startEditing = (m: ModeloDietaDTO) => {
    setActionError(null);
    setEditingId(m.id);
    setEditTitulo(m.titulo);
    setEditDescricao(m.descricao || "");
    setEditObjetivo(m.objetivoTag || "GERAL");
  };

  const handleConfirmEdit = async () => {
    if (!editingId || editTitulo.trim().length < 2) {
      setActionError("Informe um título com pelo menos 2 caracteres.");
      return;
    }
    try {
      setSalvandoEdicao(true);
      setActionError(null);
      await onEditarModelo(editingId, {
        titulo: editTitulo.trim(),
        descricao: editDescricao.trim() || null,
        objetivoTag: editObjetivo,
      });
      setEditingId(null);
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Erro ao salvar alterações.",
      );
    } finally {
      setSalvandoEdicao(false);
    }
  };

  const handleDelete = async (m: ModeloDietaDTO) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Excluir permanentemente o modelo "${m.titulo}"?`)
    ) {
      return;
    }
    try {
      setExcluindoId(m.id);
      setActionError(null);
      await onExcluirModelo(m.id);
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Erro ao excluir modelo.",
      );
    } finally {
      setExcluindoId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-5 bg-slate-900/35 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="cl-card bg-white w-full max-w-3xl max-h-[86vh] rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* CABEÇALHO CLINICAL LIGHT */}
        <div className="cl-modal-header px-5 py-3.5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
              {isMealPickerMode ? (
                <Sparkles className="w-4 h-4" />
              ) : (
                <BookOpen className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-slate-900 truncate">
                {isMealPickerMode && targetRefeicao
                  ? `Modelos para ${targetRefeicao.nome}`
                  : "Biblioteca de Modelos de Dieta"}
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                {isMealPickerMode
                  ? "Aplique como base editável no cardápio — personalize quantidades antes de salvar"
                  : `Aplique um protocolo completo em "${variacaoAtivaNome}" ou gerencie seus modelos`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            aria-label="Fechar biblioteca de modelos"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ABAS INTERNAS (quando aberta pela barra superior) + BUSCA + FILTROS */}
        <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-200/80 space-y-2.5 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {!isMealPickerMode ? (
              <div className="cl-segmented inline-flex p-0.5 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setAbaBiblioteca("PLANO_COMPLETO");
                    setPendingPlanConfirmId(null);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    abaBiblioteca === "PLANO_COMPLETO"
                      ? "bg-white text-teal-800 shadow-2xs"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Planos Completos</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAbaBiblioteca("REFEICAO");
                    setPendingApplyId(null);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    abaBiblioteca === "REFEICAO"
                      ? "bg-white text-teal-800 shadow-2xs"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Utensils className="w-3.5 h-3.5" />
                  <span>Por Refeição</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg">
                  {categoriaFiltro === "TODAS"
                    ? "Todas as categorias"
                    : getCategoriaRefeicaoLabel(categoriaFiltro)}
                </span>
                {categoriaFiltro !== "TODAS" ? (
                  <button
                    type="button"
                    onClick={() => setCategoriaFiltro("TODAS")}
                    className="text-[11px] font-bold text-slate-600 hover:text-teal-700 underline underline-offset-2 cursor-pointer"
                  >
                    Ver todas as categorias
                  </button>
                ) : targetRefeicao ? (
                  <button
                    type="button"
                    onClick={() =>
                      setCategoriaFiltro(targetRefeicao.categoriaInicial)
                    }
                    className="text-[11px] font-bold text-teal-700 hover:text-teal-800 underline underline-offset-2 cursor-pointer"
                  >
                    Filtrar por {getCategoriaRefeicaoLabel(targetRefeicao.categoriaInicial)}
                  </button>
                ) : null}
              </div>
            )}

            {/* Busca */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar modelo ou alimento..."
                className="cl-input w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white"
              />
            </div>
          </div>

          {/* Filtro por Categoria quando na aba Por Refeição da biblioteca geral */}
          {!isMealPickerMode && abaBiblioteca === "REFEICAO" && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setCategoriaFiltro("TODAS")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                  categoriaFiltro === "TODAS"
                    ? "bg-teal-700 text-white border-teal-700"
                    : "bg-white text-slate-600 border-slate-200 hover:border-teal-300"
                }`}
              >
                Todas
              </button>
              {CATEGORIAS_REFEICAO_OPCOES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategoriaFiltro(cat.value)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                    categoriaFiltro === cat.value
                      ? "bg-teal-700 text-white border-teal-700"
                      : "bg-white text-slate-600 border-slate-200 hover:border-teal-300"
                  }`}
                >
                  {cat.label.split(" / ")[0]}
                </button>
              ))}
            </div>
          )}

          {/* Pílulas de filtro por Objetivo */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(
              [
                { id: "TODOS", label: "Todos" },
                { id: "EMAGRECIMENTO", label: "Emagrecimento" },
                { id: "HIPERTROFIA", label: "Hipertrofia" },
                { id: "CONTROLE_GLICEMICO", label: "Controle Glicêmico" },
                { id: "MEUS_MODELOS", label: "Meus Modelos" },
              ] as Array<{ id: FiltroObjetivo; label: string }>
            ).map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setObjetivoFiltro(pill.id)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                  objetivoFiltro === pill.id
                    ? "bg-emerald-50 text-emerald-800 border-emerald-400 shadow-2xs"
                    : "bg-white text-slate-500 border-slate-200 hover:text-slate-700 hover:border-slate-300"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {actionError && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}
        </div>

        {/* LISTAGEM DE MODELOS */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3 bg-slate-50/40">
          {carregando ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
              <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
              <span className="text-xs font-semibold">
                Carregando biblioteca de modelos...
              </span>
            </div>
          ) : erro ? (
            <div className="py-10 flex flex-col items-center justify-center text-rose-600 gap-2">
              <AlertCircle className="w-6 h-6" />
              <span className="text-xs font-semibold">{erro}</span>
              <button
                type="button"
                onClick={onRecarregar}
                className="cl-btn-secondary px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
              >
                Tentar novamente
              </button>
            </div>
          ) : modelosFiltrados.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <p className="text-xs font-bold text-slate-600">
                Nenhum modelo encontrado para os filtros selecionados.
              </p>
              {categoriaFiltro !== "TODAS" && (
                <button
                  type="button"
                  onClick={() => {
                    setCategoriaFiltro("TODAS");
                    setObjetivoFiltro("TODOS");
                    setBusca("");
                  }}
                  className="text-xs font-bold text-teal-700 hover:underline cursor-pointer"
                >
                  Mostrar todos os modelos disponíveis
                </button>
              )}
            </div>
          ) : (
            modelosFiltrados.map((modelo) => {
              const resumo = calcularResumoModelo(modelo);
              const objMeta = getObjetivoTagMeta(modelo.objetivoTag);
              const isEditing = editingId === modelo.id;
              const isShowingMealChoice = pendingApplyId === modelo.id;
              const isShowingPlanConfirm = pendingPlanConfirmId === modelo.id;

              return (
                <div
                  key={modelo.id}
                  className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs hover:border-teal-300/80 transition-all space-y-2.5"
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div className="sm:col-span-2">
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">
                            Título do Modelo
                          </label>
                          <input
                            type="text"
                            value={editTitulo}
                            onChange={(e) => setEditTitulo(e.target.value)}
                            className="cl-input w-full px-3 py-1.5 text-xs rounded-xl"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">
                            Objetivo
                          </label>
                          <select
                            value={editObjetivo}
                            onChange={(e) =>
                              setEditObjetivo(
                                e.target.value as ObjetivoTagModelo,
                              )
                            }
                            className="cl-input w-full px-2.5 py-1.5 text-xs rounded-xl bg-white"
                          >
                            {OBJETIVOS_TAG_OPCOES.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">
                          Descrição (opcional)
                        </label>
                        <input
                          type="text"
                          value={editDescricao}
                          onChange={(e) => setEditDescricao(e.target.value)}
                          placeholder="Resumo clínico do modelo..."
                          className="cl-input w-full px-3 py-1.5 text-xs rounded-xl"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={salvandoEdicao}
                          onClick={handleConfirmEdit}
                          className="cl-btn-primary inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50"
                        >
                          {salvandoEdicao ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          <span>Salvar</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="text-xs sm:text-sm font-extrabold text-slate-900">
                              {modelo.titulo}
                            </h4>
                            <span
                              className={`${objMeta.badgeClass} text-[10px] font-bold px-2 py-0.5 rounded-full`}
                            >
                              {objMeta.label}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                              {modelo.padraoSistema ? "Sugestão FAAZ" : "Meu Modelo"}
                            </span>
                            {modelo.escopo === "REFEICAO" &&
                              modelo.categoriaRefeicao && (
                                <span className="text-[10px] font-semibold text-slate-500">
                                  • {getCategoriaRefeicaoLabel(modelo.categoriaRefeicao).split(" / ")[0]}
                                </span>
                              )}
                          </div>

                          {modelo.descricao && (
                            <p className="text-[11px] text-slate-500 leading-snug">
                              {modelo.descricao}
                            </p>
                          )}
                        </div>

                        {/* Ações: Gerenciar + Aplicar */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEditing(modelo)}
                            title="Renomear ou editar metadados"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={excluindoId === modelo.id}
                            onClick={() => handleDelete(modelo)}
                            title="Excluir modelo da biblioteca"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {excluindoId === modelo.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {modelo.escopo === "REFEICAO" && isMealPickerMode && (
                            <button
                              type="button"
                              onClick={() => {
                                if (targetRefeicao?.possuiItens) {
                                  setPendingApplyId((prev) =>
                                    prev === modelo.id ? null : modelo.id,
                                  );
                                } else {
                                  onAplicarRefeicao(modelo, "substituir");
                                }
                              }}
                              className="cl-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Aplicar</span>
                            </button>
                          )}

                          {modelo.escopo === "PLANO_COMPLETO" && (
                            <button
                              type="button"
                              onClick={() => {
                                if (variacaoAtivaPossuiItens) {
                                  setPendingPlanConfirmId((prev) =>
                                    prev === modelo.id ? null : modelo.id,
                                  );
                                } else {
                                  onAplicarPlanoCompleto(modelo);
                                }
                              }}
                              className="cl-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Aplicar no dia</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Prévia de alimentos / refeições + resumo nutricional */}
                      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-600 min-w-0 flex-1">
                          {isConteudoPlanoCompleto(modelo.conteudo) ? (
                            <span className="truncate">
                              <strong>
                                {resumo.totalRefeicoes} refeições ({resumo.totalItens}{" "}
                                itens):
                              </strong>{" "}
                              {modelo.conteudo.refeicoes
                                .map((r) => r.nome.split(" / ")[0])
                                .join(" · ")}
                            </span>
                          ) : (
                            <span className="truncate">
                              {resumo.nomesAlimentos.slice(0, 4).join(" · ")}
                              {resumo.nomesAlimentos.length > 4
                                ? ` +${resumo.nomesAlimentos.length - 4}`
                                : ""}
                            </span>
                          )}

                          {resumo.totalTrocas > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200/80 text-[10px] font-bold shrink-0">
                              <ArrowLeftRight className="w-2.5 h-2.5" />
                              {resumo.totalTrocas}{" "}
                              {resumo.totalTrocas === 1 ? "troca" : "trocas"}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-[11px] font-mono shrink-0">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                            <Flame className="w-3 h-3 text-amber-500" />
                            {resumo.calorias} kcal
                          </span>
                          <span className="text-slate-500 hidden sm:inline">
                            P <strong className="text-emerald-700">{resumo.proteinas}g</strong> · C{" "}
                            <strong className="text-amber-700">{resumo.carboidratos}g</strong> · G{" "}
                            <strong className="text-rose-700">{resumo.gorduras}g</strong>
                          </span>
                        </div>
                      </div>

                      {/* Escolha rápida quando a refeição já tem itens */}
                      {isShowingMealChoice && (
                        <div className="mt-2 p-2.5 rounded-xl bg-teal-50/80 border border-teal-200 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-teal-900">
                            Esta refeição já possui alimentos. Como deseja aplicar?
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                onAplicarRefeicao(modelo, "substituir")
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-teal-700 hover:bg-teal-800 text-white cursor-pointer"
                            >
                              <Replace className="w-3 h-3" />
                              <span>Substituir refeição</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onAplicarRefeicao(modelo, "adicionar")
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white hover:bg-teal-100 text-teal-800 border border-teal-300 cursor-pointer"
                            >
                              <ListPlus className="w-3 h-3" />
                              <span>Adicionar aos itens</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Confirmação rápida para Plano Completo */}
                      {isShowingPlanConfirm && (
                        <div className="mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-amber-900">
                            Substituir as refeições de &quot;{variacaoAtivaNome}&quot; por este protocolo?
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPendingPlanConfirmId(null)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-600 hover:bg-amber-100 cursor-pointer"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => onAplicarPlanoCompleto(modelo)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-teal-700 hover:bg-teal-800 text-white cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                              <span>Confirmar e aplicar</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export interface SalvarModeloDietaModalProps {
  isOpen: boolean;
  onClose: () => void;
  escopo: EscopoModeloDieta;
  tituloInicial: string;
  categoriaInicial: CategoriaRefeicaoModelo;
  objetivoInicial?: ObjetivoTagModelo;
  resumoInfo: string;
  onConfirmar: (dados: {
    titulo: string;
    categoriaRefeicao: CategoriaRefeicaoModelo;
    objetivoTag: ObjetivoTagModelo;
    descricao: string | null;
  }) => Promise<void>;
}

export function SalvarModeloDietaModal({
  isOpen,
  onClose,
  escopo,
  tituloInicial,
  categoriaInicial,
  objetivoInicial = "GERAL",
  resumoInfo,
  onConfirmar,
}: SalvarModeloDietaModalProps) {
  const [titulo, setTitulo] = useState(tituloInicial);
  const [categoria, setCategoria] =
    useState<CategoriaRefeicaoModelo>(categoriaInicial);
  const [objetivo, setObjetivo] = useState<ObjetivoTagModelo>(objetivoInicial);
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (titulo.trim().length < 2) {
      setErro("Informe um título com pelo menos 2 caracteres.");
      return;
    }
    try {
      setSalvando(true);
      setErro(null);
      await onConfirmar({
        titulo: titulo.trim(),
        categoriaRefeicao: escopo === "PLANO_COMPLETO" ? "GERAL" : categoria,
        objetivoTag: objetivo,
        descricao: descricao.trim() || null,
      });
      onClose();
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar modelo.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-xs animate-in fade-in duration-150">
      <form
        onSubmit={handleSubmit}
        className="cl-card bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden animate-in zoom-in-95 duration-150"
      >
        <div className="cl-modal-header px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
              <BookmarkPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                {escopo === "PLANO_COMPLETO"
                  ? "Salvar Dia como Modelo"
                  : "Salvar Refeição como Modelo"}
              </h3>
              <p className="text-[11px] text-slate-500">{resumoInfo}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3.5">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Título do Modelo *
            </label>
            <input
              type="text"
              autoFocus
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={
                escopo === "PLANO_COMPLETO"
                  ? "Ex.: Protocolo Emagrecimento 1600 kcal"
                  : "Ex.: Café da Manhã — Emagrecimento Proteico"
              }
              className="cl-input w-full px-3 py-2 text-xs rounded-xl"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {escopo === "REFEICAO" && (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Categoria da Refeição
                </label>
                <select
                  value={categoria}
                  onChange={(e) =>
                    setCategoria(e.target.value as CategoriaRefeicaoModelo)
                  }
                  className="cl-input w-full px-2.5 py-2 text-xs rounded-xl bg-white"
                >
                  {CATEGORIAS_REFEICAO_OPCOES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={escopo === "PLANO_COMPLETO" ? "sm:col-span-2" : ""}>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Tag de Objetivo
              </label>
              <select
                value={objetivo}
                onChange={(e) =>
                  setObjetivo(e.target.value as ObjetivoTagModelo)
                }
                className="cl-input w-full px-2.5 py-2 text-xs rounded-xl bg-white"
              >
                {OBJETIVOS_TAG_OPCOES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Descrição curta (opcional)
            </label>
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Indicação clínica ou observação rápida..."
              className="cl-input w-full px-3 py-2 text-xs rounded-xl"
            />
          </div>

          {erro && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{erro}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-200/60 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando || titulo.trim().length < 2}
            className="cl-btn-primary inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            {salvando ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <BookmarkPlus className="w-3.5 h-3.5" />
            )}
            <span>Salvar na Biblioteca</span>
          </button>
        </div>
      </form>
    </div>
  );
}
