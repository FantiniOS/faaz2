"use client";

import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeftRight,
  Check,
  Clock,
  FileText,
  Flame,
  Layers,
  Loader2,
  Plus,
  Save,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import {
  AlimentoCombobox,
  type AlimentoAddExtra,
  type AlimentoOption,
} from "@/components/AlimentoCombobox";
import { FoodThumbnail } from "@/components/FoodThumbnail";
import type { UnidadeMedidaDieta } from "@/lib/db/entities/nutrition";
import {
  CATEGORIAS_REFEICAO_OPCOES,
  isConteudoPlanoCompleto,
  OBJETIVOS_TAG_OPCOES,
  type CategoriaRefeicaoModelo,
  type EscopoModeloDieta,
  type ModeloDietaConteudo,
  type ModeloDietaDTO,
  type ModeloDietaItemDTO,
  type ModeloDietaRefeicaoDTO,
  type ModeloDietaTrocaDTO,
  type ObjetivoTagModelo,
} from "@/lib/modelos-dieta-types";

interface EditorRefeicaoState extends ModeloDietaRefeicaoDTO {
  localId: string;
}

export interface ModeloDietaEditorSavePayload {
  id?: string;
  escopo: EscopoModeloDieta;
  titulo: string;
  categoriaRefeicao: CategoriaRefeicaoModelo;
  objetivoTag: ObjetivoTagModelo;
  descricao: string | null;
  conteudo: ModeloDietaConteudo;
}

export interface ModeloDietaEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Quando presente com `id`, edita o modelo existente (`PATCH`); sem `id`, cria novo (`POST`). */
  modeloInicial?: ModeloDietaDTO | null;
  escopoInicial?: EscopoModeloDieta;
  categoriaInicial?: CategoriaRefeicaoModelo;
  objetivoInicial?: ObjetivoTagModelo;
  onSave: (payload: ModeloDietaEditorSavePayload) => Promise<ModeloDietaDTO>;
}

const ATALHOS_REFEICOES: ReadonlyArray<{
  label: string;
  nome: string;
  horario: string;
  categoria: CategoriaRefeicaoModelo;
}> = [
  {
    label: "Desjejum",
    nome: "Desjejum / Café da Manhã",
    horario: "07:30",
    categoria: "DESJEJUM",
  },
  {
    label: "Colação",
    nome: "Colação / Lanche da Manhã",
    horario: "10:00",
    categoria: "COLACAO",
  },
  {
    label: "Almoço",
    nome: "Almoço",
    horario: "12:30",
    categoria: "ALMOCO",
  },
  {
    label: "Lanche",
    nome: "Lanche da Tarde",
    horario: "16:00",
    categoria: "LANCHE",
  },
  {
    label: "Jantar",
    nome: "Jantar",
    horario: "19:30",
    categoria: "JANTAR",
  },
  {
    label: "Ceia",
    nome: "Ceia",
    horario: "21:30",
    categoria: "CEIA",
  },
];

let localUidCounter = 1;
function gerarLocalId(prefix: string): string {
  localUidCounter += 1;
  return `${prefix}-${Date.now()}-${localUidCounter}`;
}

function clonarItens(itens: ModeloDietaItemDTO[] | undefined): ModeloDietaItemDTO[] {
  if (!Array.isArray(itens)) return [];
  return itens.map((it) => ({
    alimentoId: it.alimentoId || gerarLocalId("food"),
    nome: it.nome || "Alimento",
    quantidade: Number(it.quantidade) > 0 ? Number(it.quantidade) : 100,
    unidade: it.unidade || "g",
    medidaCaseira: it.medidaCaseira ?? null,
    categoria: it.categoria ?? null,
    thumbnailUrl: it.thumbnailUrl ?? null,
    porcaoBase: Number(it.porcaoBase) > 0 ? Number(it.porcaoBase) : 100,
    caloriasBase: Number(it.caloriasBase) || 0,
    proteinas: Number(it.proteinas) || 0,
    carboidratos: Number(it.carboidratos) || 0,
    gorduras: Number(it.gorduras) || 0,
    fibras: Number(it.fibras) || 0,
    trocas: Array.isArray(it.trocas)
      ? it.trocas.map((t) => ({
          alimentoId: t.alimentoId ?? null,
          nome: t.nome || "Substituto",
          quantidade: Number(t.quantidade) > 0 ? Number(t.quantidade) : 100,
          unidade: t.unidade || "g",
          medidaCaseira: t.medidaCaseira ?? null,
          categoria: t.categoria ?? null,
          thumbnailUrl: t.thumbnailUrl ?? null,
          porcaoBase: Number(t.porcaoBase) > 0 ? Number(t.porcaoBase) : 100,
          caloriasBase: Number(t.caloriasBase) || 0,
          proteinas: Number(t.proteinas) || 0,
          carboidratos: Number(t.carboidratos) || 0,
          gorduras: Number(t.gorduras) || 0,
          fibras: Number(t.fibras) || 0,
        }))
      : [],
  }));
}

function construirRefeicoesIniciais(
  modeloInicial: ModeloDietaDTO | null | undefined,
  escopoInicial: EscopoModeloDieta,
  categoriaInicial: CategoriaRefeicaoModelo,
): EditorRefeicaoState[] {
  if (modeloInicial) {
    if (isConteudoPlanoCompleto(modeloInicial.conteudo)) {
      const refs = modeloInicial.conteudo.refeicoes;
      if (refs.length > 0) {
        return refs.map((r) => ({
          localId: gerarLocalId("ref"),
          nome: r.nome || "Refeição",
          horario: r.horario ?? "08:00",
          opcional: Boolean(r.opcional),
          observacoes: r.observacoes ?? "",
          itens: clonarItens(r.itens),
        }));
      }
    } else {
      const c = modeloInicial.conteudo;
      return [
        {
          localId: gerarLocalId("ref"),
          nome: c.nome || modeloInicial.titulo || "Refeição",
          horario: c.horario ?? "08:00",
          opcional: Boolean(c.opcional),
          observacoes: c.observacoes ?? "",
          itens: clonarItens(c.itens),
        },
      ];
    }
  }

  if (escopoInicial === "PLANO_COMPLETO") {
    return [
      {
        localId: gerarLocalId("ref"),
        nome: "Desjejum / Café da Manhã",
        horario: "07:30",
        opcional: false,
        observacoes: "",
        itens: [],
      },
      {
        localId: gerarLocalId("ref"),
        nome: "Almoço",
        horario: "12:30",
        opcional: false,
        observacoes: "",
        itens: [],
      },
      {
        localId: gerarLocalId("ref"),
        nome: "Lanche da Tarde",
        horario: "16:00",
        opcional: false,
        observacoes: "",
        itens: [],
      },
      {
        localId: gerarLocalId("ref"),
        nome: "Jantar",
        horario: "19:30",
        opcional: false,
        observacoes: "",
        itens: [],
      },
    ];
  }

  const presetCat =
    ATALHOS_REFEICOES.find((a) => a.categoria === categoriaInicial) ||
    ATALHOS_REFEICOES[0];

  return [
    {
      localId: gerarLocalId("ref"),
      nome: presetCat.nome,
      horario: presetCat.horario,
      opcional: false,
      observacoes: "",
      itens: [],
    },
  ];
}

function calcularMacrosItem(item: {
  quantidade: number;
  porcaoBase?: number;
  caloriasBase?: number;
  proteinas?: number;
  carboidratos?: number;
  gorduras?: number;
}) {
  const base = Number(item.porcaoBase) > 0 ? Number(item.porcaoBase) : 100;
  const fator = Math.max(0, Number(item.quantidade) || 0) / base;
  return {
    kcal: Math.round((Number(item.caloriasBase) || 0) * fator),
    p: Number(((Number(item.proteinas) || 0) * fator).toFixed(1)),
    c: Number(((Number(item.carboidratos) || 0) * fator).toFixed(1)),
    g: Number(((Number(item.gorduras) || 0) * fator).toFixed(1)),
  };
}

export function ModeloDietaEditorModal({
  isOpen,
  onClose,
  modeloInicial,
  escopoInicial = "PLANO_COMPLETO",
  categoriaInicial = "DESJEJUM",
  objetivoInicial = "GERAL",
  onSave,
}: ModeloDietaEditorModalProps) {
  const isEditandoExistente = Boolean(modeloInicial?.id);

  const [escopo, setEscopo] = useState<EscopoModeloDieta>(
    modeloInicial?.escopo ?? escopoInicial,
  );
  const [titulo, setTitulo] = useState<string>(modeloInicial?.titulo ?? "");
  const [categoriaRefeicao, setCategoriaRefeicao] =
    useState<CategoriaRefeicaoModelo>(
      modeloInicial?.categoriaRefeicao &&
        modeloInicial.categoriaRefeicao !== "GERAL"
        ? modeloInicial.categoriaRefeicao
        : categoriaInicial === "GERAL"
          ? "DESJEJUM"
          : categoriaInicial,
    );
  const [objetivoTag, setObjetivoTag] = useState<ObjetivoTagModelo>(
    modeloInicial?.objetivoTag ?? objetivoInicial,
  );
  const [descricao, setDescricao] = useState<string>(
    modeloInicial?.descricao ?? "",
  );
  const [refeicoes, setRefeicoes] = useState<EditorRefeicaoState[]>(() =>
    construirRefeicoesIniciais(modeloInicial, escopoInicial, categoriaInicial),
  );

  // Chave do item cuja gaveta inline de "+ Troca" está aberta: `${refLocalId}:${itemIdx}`
  const [itemTrocaAbertaKey, setItemTrocaAbertaKey] = useState<string | null>(
    null,
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const refeicoesAtivas = useMemo(() => {
    if (escopo === "REFEICAO") {
      return refeicoes.slice(0, 1);
    }
    return refeicoes;
  }, [escopo, refeicoes]);

  const totaisModelo = useMemo(() => {
    let kcal = 0;
    let p = 0;
    let c = 0;
    let g = 0;
    let totalItens = 0;
    let totalTrocas = 0;

    for (const ref of refeicoesAtivas) {
      for (const item of ref.itens) {
        totalItens += 1;
        totalTrocas += item.trocas.length;
        const m = calcularMacrosItem(item);
        kcal += m.kcal;
        p += m.p;
        c += m.c;
        g += m.g;
      }
    }

    return {
      kcal: Math.round(kcal),
      p: Number(p.toFixed(1)),
      c: Number(c.toFixed(1)),
      g: Number(g.toFixed(1)),
      totalRefeicoes: refeicoesAtivas.length,
      totalItens,
      totalTrocas,
    };
  }, [refeicoesAtivas]);

  if (!isOpen) return null;

  const handleTrocarEscopo = (novoEscopo: EscopoModeloDieta) => {
    if (isEditandoExistente) return;
    setEscopo(novoEscopo);
    if (novoEscopo === "PLANO_COMPLETO" && refeicoes.length <= 1) {
      const primeira = refeicoes[0];
      if (!primeira || primeira.itens.length === 0) {
        setRefeicoes(
          construirRefeicoesIniciais(null, "PLANO_COMPLETO", categoriaRefeicao),
        );
      }
    }
  };

  const handleAdicionarRefeicao = (preset?: {
    nome: string;
    horario: string;
  }) => {
    setRefeicoes((prev) => [
      ...prev,
      {
        localId: gerarLocalId("ref"),
        nome: preset?.nome || `Refeição ${prev.length + 1}`,
        horario: preset?.horario || "15:00",
        opcional: false,
        observacoes: "",
        itens: [],
      },
    ]);
  };

  const handleRemoverRefeicao = (localId: string) => {
    setRefeicoes((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((r) => r.localId !== localId);
    });
  };

  const handleAtualizarRefeicao = (
    localId: string,
    patch: Partial<EditorRefeicaoState>,
  ) => {
    setRefeicoes((prev) =>
      prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)),
    );
  };

  const handleAddAlimentoNaRefeicao = (
    localId: string,
    alimento: AlimentoOption,
    quantidade: number,
    extra?: AlimentoAddExtra,
  ) => {
    const novoItem: ModeloDietaItemDTO = {
      alimentoId: alimento.id,
      nome: alimento.nome,
      quantidade: Number(quantidade) > 0 ? Number(quantidade) : 100,
      unidade: (extra?.unidade || "g") as UnidadeMedidaDieta,
      medidaCaseira: extra?.medidaCaseira ?? null,
      categoria: alimento.categoria ?? null,
      thumbnailUrl:
        alimento.thumbnailUrl || alimento.imageUrl || alimento.fotoUrl || null,
      porcaoBase: Number(alimento.porcaoBase) > 0 ? Number(alimento.porcaoBase) : 100,
      caloriasBase:
        Number(alimento.calorias ?? alimento.caloriasBase ?? alimento.calories) || 0,
      proteinas:
        Number(alimento.proteinas ?? alimento.proteins ?? alimento.protein) || 0,
      carboidratos:
        Number(
          alimento.carboidratos ??
            alimento.carbohydrates ??
            alimento.carbohydrate,
        ) || 0,
      gorduras:
        Number(
          alimento.gorduras ?? alimento.fats ?? alimento.lipids ?? alimento.lipid,
        ) || 0,
      fibras: Number(alimento.fibras) || 0,
      trocas: [],
    };

    setRefeicoes((prev) =>
      prev.map((r) =>
        r.localId === localId ? { ...r, itens: [...r.itens, novoItem] } : r,
      ),
    );
  };

  const handleAtualizarItem = (
    localId: string,
    itemIdx: number,
    patch: Partial<ModeloDietaItemDTO>,
  ) => {
    setRefeicoes((prev) =>
      prev.map((r) => {
        if (r.localId !== localId) return r;
        const novosItens = r.itens.map((it, idx) =>
          idx === itemIdx ? { ...it, ...patch } : it,
        );
        return { ...r, itens: novosItens };
      }),
    );
  };

  const handleRemoverItem = (localId: string, itemIdx: number) => {
    setRefeicoes((prev) =>
      prev.map((r) => {
        if (r.localId !== localId) return r;
        return {
          ...r,
          itens: r.itens.filter((_, idx) => idx !== itemIdx),
        };
      }),
    );
  };

  const handleAdicionarTrocaNoItem = (
    localId: string,
    itemIdx: number,
    alimento: AlimentoOption,
    quantidade: number,
    extra?: AlimentoAddExtra,
  ) => {
    const novaTroca: ModeloDietaTrocaDTO = {
      alimentoId: alimento.id,
      nome: alimento.nome,
      quantidade: Number(quantidade) > 0 ? Number(quantidade) : 100,
      unidade: (extra?.unidade || "g") as UnidadeMedidaDieta,
      medidaCaseira: extra?.medidaCaseira ?? null,
      categoria: alimento.categoria ?? null,
      thumbnailUrl:
        alimento.thumbnailUrl || alimento.imageUrl || alimento.fotoUrl || null,
      porcaoBase: Number(alimento.porcaoBase) > 0 ? Number(alimento.porcaoBase) : 100,
      caloriasBase:
        Number(alimento.calorias ?? alimento.caloriasBase ?? alimento.calories) || 0,
      proteinas:
        Number(alimento.proteinas ?? alimento.proteins ?? alimento.protein) || 0,
      carboidratos:
        Number(
          alimento.carboidratos ??
            alimento.carbohydrates ??
            alimento.carbohydrate,
        ) || 0,
      gorduras:
        Number(
          alimento.gorduras ?? alimento.fats ?? alimento.lipids ?? alimento.lipid,
        ) || 0,
      fibras: Number(alimento.fibras) || 0,
    };

    setRefeicoes((prev) =>
      prev.map((r) => {
        if (r.localId !== localId) return r;
        const novosItens = r.itens.map((it, idx) =>
          idx === itemIdx
            ? { ...it, trocas: [...it.trocas, novaTroca] }
            : it,
        );
        return { ...r, itens: novosItens };
      }),
    );
  };

  const handleAtualizarTroca = (
    localId: string,
    itemIdx: number,
    trocaIdx: number,
    patch: Partial<ModeloDietaTrocaDTO>,
  ) => {
    setRefeicoes((prev) =>
      prev.map((r) => {
        if (r.localId !== localId) return r;
        const novosItens = r.itens.map((it, idx) => {
          if (idx !== itemIdx) return it;
          const novasTrocas = it.trocas.map((tr, tIdx) =>
            tIdx === trocaIdx ? { ...tr, ...patch } : tr,
          );
          return { ...it, trocas: novasTrocas };
        });
        return { ...r, itens: novosItens };
      }),
    );
  };

  const handleRemoverTroca = (
    localId: string,
    itemIdx: number,
    trocaIdx: number,
  ) => {
    setRefeicoes((prev) =>
      prev.map((r) => {
        if (r.localId !== localId) return r;
        const novosItens = r.itens.map((it, idx) => {
          if (idx !== itemIdx) return it;
          return {
            ...it,
            trocas: it.trocas.filter((_, tIdx) => tIdx !== trocaIdx),
          };
        });
        return { ...r, itens: novosItens };
      }),
    );
  };

  const handleSalvar = async () => {
    setErro(null);
    const tituloLimpo = titulo.trim();
    if (tituloLimpo.length < 2) {
      setErro("Informe um título com pelo menos 2 caracteres para o modelo.");
      return;
    }

    if (totaisModelo.totalItens === 0) {
      setErro(
        escopo === "PLANO_COMPLETO"
          ? "Adicione ao menos 1 alimento nas refeições do plano antes de salvar."
          : "Adicione ao menos 1 alimento na refeição antes de salvar.",
      );
      return;
    }

    let conteudo: ModeloDietaConteudo;
    if (escopo === "PLANO_COMPLETO") {
      const refeicoesValidas = refeicoesAtivas
        .filter((r) => r.itens.length > 0 || Boolean(r.observacoes?.trim()))
        .map((r) => ({
          nome: r.nome.trim() || "Refeição",
          horario: r.horario?.trim() || null,
          opcional: Boolean(r.opcional),
          observacoes: r.observacoes?.trim() || null,
          itens: r.itens,
        }));
      conteudo = { refeicoes: refeicoesValidas };
    } else {
      const unica = refeicoesAtivas[0];
      conteudo = {
        nome: unica?.nome?.trim() || tituloLimpo,
        horario: unica?.horario?.trim() || null,
        opcional: Boolean(unica?.opcional),
        observacoes: unica?.observacoes?.trim() || null,
        itens: unica?.itens || [],
      };
    }

    try {
      setSalvando(true);
      await onSave({
        id: modeloInicial?.id,
        escopo,
        titulo: tituloLimpo,
        categoriaRefeicao:
          escopo === "PLANO_COMPLETO" ? "GERAL" : categoriaRefeicao,
        objetivoTag,
        descricao: descricao.trim() || null,
        conteudo,
      });
      onClose();
    } catch (err: unknown) {
      setErro(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar o modelo.",
      );
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-3 sm:p-5 bg-slate-900/45 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="cl-card bg-white w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* CABEÇALHO CLINICAL LIGHT (.cl-modal-header) */}
        <div className="cl-modal-header px-5 py-3.5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
              {escopo === "PLANO_COMPLETO" ? (
                <Layers className="w-4 h-4" />
              ) : (
                <Utensils className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-slate-900 truncate">
                {isEditandoExistente
                  ? `Editar Modelo: ${modeloInicial?.titulo}`
                  : "Novo Modelo na Biblioteca de Dietas"}
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                Configure refeições, alimentos da Tabela TACO, medidas caseiras,
                opções de substituição (+ Troca) e orientações de preparo
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            aria-label="Fechar editor de modelo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CORPO ROLÁVEL */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4 bg-slate-50/50">
          {/* 1. BLOCO DE IDENTIFICAÇÃO (COMPACTO NO TOPO) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                Identificação do Modelo
              </span>

              {/* Seletor de Escopo (habilitado na criação) */}
              {!isEditandoExistente ? (
                <div className="cl-segmented inline-flex p-0.5 rounded-xl">
                  <button
                    type="button"
                    onClick={() => handleTrocarEscopo("PLANO_COMPLETO")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      escopo === "PLANO_COMPLETO"
                        ? "bg-white text-teal-800 shadow-2xs"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Plano Completo (Dia inteiro)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTrocarEscopo("REFEICAO")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      escopo === "REFEICAO"
                        ? "bg-white text-teal-800 shadow-2xs"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Utensils className="w-3.5 h-3.5" />
                    <span>Refeição Única</span>
                  </button>
                </div>
              ) : (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                  {escopo === "PLANO_COMPLETO"
                    ? "Plano Completo (Dia inteiro)"
                    : "Refeição Única"}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div
                className={
                  escopo === "REFEICAO" ? "sm:col-span-5" : "sm:col-span-8"
                }
              >
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Título do Modelo *
                </label>
                <input
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder={
                    escopo === "PLANO_COMPLETO"
                      ? "Ex.: Protocolo Emagrecimento 1500 kcal"
                      : "Ex.: Desjejum Proteico Low-Carb"
                  }
                  className="cl-input w-full px-3 py-2 text-xs font-semibold rounded-xl"
                />
              </div>

              {escopo === "REFEICAO" && (
                <div className="sm:col-span-4">
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Categoria da Refeição
                  </label>
                  <select
                    value={categoriaRefeicao}
                    onChange={(e) => {
                      const novaCat = e.target.value as CategoriaRefeicaoModelo;
                      setCategoriaRefeicao(novaCat);
                      const atalho = ATALHOS_REFEICOES.find(
                        (a) => a.categoria === novaCat,
                      );
                      if (atalho && refeicoes[0]) {
                        handleAtualizarRefeicao(refeicoes[0].localId, {
                          nome: atalho.nome,
                          horario: refeicoes[0].horario || atalho.horario,
                        });
                      }
                    }}
                    className="cl-input w-full px-2.5 py-2 text-xs font-semibold rounded-xl bg-white"
                  >
                    {CATEGORIAS_REFEICAO_OPCOES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div
                className={
                  escopo === "REFEICAO" ? "sm:col-span-3" : "sm:col-span-4"
                }
              >
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Objetivo Clínico
                </label>
                <select
                  value={objetivoTag}
                  onChange={(e) =>
                    setObjetivoTag(e.target.value as ObjetivoTagModelo)
                  }
                  className="cl-input w-full px-2.5 py-2 text-xs font-semibold rounded-xl bg-white"
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
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Descrição curta (opcional)
              </label>
              <input
                type="text"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: Alto teor proteico e baixo índice glicêmico para saciedade matinal..."
                className="cl-input w-full px-3 py-1.5 text-xs rounded-xl"
              />
            </div>
          </div>

          {/* 2. BARRA DE ATALHOS PARA ADICIONAR REFEIÇÃO (QUANDO PLANO COMPLETO) */}
          {escopo === "PLANO_COMPLETO" && (
            <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3 shadow-2xs flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider mr-1">
                  + Adicionar Refeição:
                </span>
                {ATALHOS_REFEICOES.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleAdicionarRefeicao(preset)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => handleAdicionarRefeicao()}
                className="cl-btn-secondary px-3 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-teal-700" />
                <span>Refeição Livre</span>
              </button>
            </div>
          )}

          {/* 3. LISTA DE REFEIÇÕES E ALIMENTOS */}
          <div className="space-y-4">
            {refeicoesAtivas.map((refeicao, refIdx) => {
              const subtotalRef = refeicao.itens.reduce(
                (acc, it) => {
                  const m = calcularMacrosItem(it);
                  return {
                    kcal: acc.kcal + m.kcal,
                    p: acc.p + m.p,
                    c: acc.c + m.c,
                    g: acc.g + m.g,
                  };
                },
                { kcal: 0, p: 0, c: 0, g: 0 },
              );

              return (
                <div
                  key={refeicao.localId}
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-visible"
                >
                  {/* Cabeçalho Editável da Refeição */}
                  <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200/80 rounded-t-2xl flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
                      <span className="w-6 h-6 rounded-lg bg-teal-700 text-white text-xs font-extrabold flex items-center justify-center shrink-0">
                        {refIdx + 1}
                      </span>

                      <input
                        type="text"
                        value={refeicao.nome}
                        onChange={(e) =>
                          handleAtualizarRefeicao(refeicao.localId, {
                            nome: e.target.value,
                          })
                        }
                        placeholder="Nome da refeição (ex.: Almoço)"
                        className="cl-input px-2.5 py-1 text-xs font-extrabold text-slate-900 rounded-lg bg-white min-w-[180px] flex-1 max-w-xs"
                      />

                      <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
                        <Clock className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                        <input
                          type="text"
                          value={refeicao.horario || ""}
                          onChange={(e) =>
                            handleAtualizarRefeicao(refeicao.localId, {
                              horario: e.target.value,
                            })
                          }
                          placeholder="08:00"
                          className="w-14 text-xs font-bold text-slate-700 focus:outline-hidden text-center"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          handleAtualizarRefeicao(refeicao.localId, {
                            opcional: !refeicao.opcional,
                          })
                        }
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                          refeicao.opcional
                            ? "bg-amber-50 text-amber-800 border-amber-300"
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {refeicao.opcional ? "Opcional" : "Obrigatória"}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200">
                        {Math.round(subtotalRef.kcal)} kcal · P{" "}
                        {subtotalRef.p.toFixed(1)}g · C{" "}
                        {subtotalRef.c.toFixed(1)}g · G{" "}
                        {subtotalRef.g.toFixed(1)}g
                      </span>

                      {escopo === "PLANO_COMPLETO" &&
                        refeicoesAtivas.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              handleRemoverRefeicao(refeicao.localId)
                            }
                            title="Remover refeição do modelo"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                    </div>
                  </div>

                  {/* Corpo da Refeição: Itens + Substituições + TACO Combobox + Observações */}
                  <div className="p-4 space-y-3">
                    {refeicao.itens.length === 0 ? (
                      <div className="py-5 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center">
                        <p className="text-xs font-semibold text-slate-500">
                          Nenhum alimento adicionado nesta refeição. Use a busca
                          TACO abaixo para incluir itens.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {refeicao.itens.map((item, itemIdx) => {
                          const macrosItem = calcularMacrosItem(item);
                          const trocaKey = `${refeicao.localId}:${itemIdx}`;
                          const isTrocaAberta = itemTrocaAbertaKey === trocaKey;

                          return (
                            <div
                              key={`${item.alimentoId}-${itemIdx}`}
                              className="rounded-xl border border-slate-200/90 bg-white p-3 space-y-2.5 shadow-2xs"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2.5">
                                {/* Nome + Thumbnail */}
                                <div className="flex items-center gap-2.5 min-w-[180px] flex-1">
                                  <FoodThumbnail
                                    nome={item.nome}
                                    categoria={item.categoria}
                                    imageUrl={item.thumbnailUrl}
                                    className="w-8 h-8 shrink-0"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-extrabold text-slate-900 truncate">
                                      {item.nome}
                                    </p>
                                    <p className="text-[11px] font-mono text-slate-500">
                                      <strong className="text-amber-700">
                                        {macrosItem.kcal} kcal
                                      </strong>{" "}
                                      · P {macrosItem.p}g · C {macrosItem.c}g ·
                                      G {macrosItem.g}g
                                    </p>
                                  </div>
                                </div>

                                {/* Controles Inline: Quantidade + Unidade + Medida Caseira + Botão Troca + Excluir */}
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <input
                                    type="number"
                                    min={1}
                                    max={5000}
                                    value={item.quantidade}
                                    onChange={(e) =>
                                      handleAtualizarItem(
                                        refeicao.localId,
                                        itemIdx,
                                        {
                                          quantidade: Math.max(
                                            1,
                                            Number(e.target.value) || 0,
                                          ),
                                        },
                                      )
                                    }
                                    className="cl-input w-18 px-2 py-1 text-xs font-bold text-center rounded-lg"
                                    title="Quantidade"
                                  />

                                  <select
                                    value={item.unidade || "g"}
                                    onChange={(e) =>
                                      handleAtualizarItem(
                                        refeicao.localId,
                                        itemIdx,
                                        {
                                          unidade: e.target
                                            .value as UnidadeMedidaDieta,
                                        },
                                      )
                                    }
                                    className="cl-input px-2 py-1 text-xs font-bold rounded-lg bg-white"
                                    title="Unidade"
                                  >
                                    <option value="g">g</option>
                                    <option value="ml">ml</option>
                                    <option value="un">un</option>
                                  </select>

                                  <input
                                    type="text"
                                    value={item.medidaCaseira || ""}
                                    onChange={(e) =>
                                      handleAtualizarItem(
                                        refeicao.localId,
                                        itemIdx,
                                        {
                                          medidaCaseira:
                                            e.target.value || null,
                                        },
                                      )
                                    }
                                    placeholder="Medida caseira (ex: 2 fatias)"
                                    className="cl-input w-44 px-2.5 py-1 text-xs rounded-lg"
                                  />

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setItemTrocaAbertaKey((prev) =>
                                        prev === trocaKey ? null : trocaKey,
                                      )
                                    }
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                                      isTrocaAberta || item.trocas.length > 0
                                        ? "bg-teal-50 text-teal-800 border-teal-300"
                                        : "bg-slate-50 text-slate-600 border-slate-200 hover:border-teal-300"
                                    }`}
                                  >
                                    <ArrowLeftRight className="w-3 h-3" />
                                    <span>
                                      {item.trocas.length > 0
                                        ? `Trocas (${item.trocas.length})`
                                        : "+ Troca"}
                                    </span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoverItem(
                                        refeicao.localId,
                                        itemIdx,
                                      )
                                    }
                                    title="Remover alimento"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Sub-área Inline de Gestão de Substituições (+ Troca) */}
                              {isTrocaAberta && (
                                <div className="mt-2 pt-2.5 border-t border-teal-100 bg-teal-50/40 rounded-xl p-3 space-y-2.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-extrabold text-teal-900 flex items-center gap-1.5">
                                      <ArrowLeftRight className="w-3.5 h-3.5 text-teal-700" />
                                      <span>
                                        Opções de Substituição para {item.nome}
                                      </span>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setItemTrocaAbertaKey(null)
                                      }
                                      className="text-[11px] font-bold text-teal-700 hover:underline cursor-pointer"
                                    >
                                      Concluir trocas
                                    </button>
                                  </div>

                                  {item.trocas.length > 0 && (
                                    <div className="space-y-1.5">
                                      {item.trocas.map((troca, tIdx) => {
                                        const mTroca =
                                          calcularMacrosItem(troca);
                                        return (
                                          <div
                                            key={`${troca.nome}-${tIdx}`}
                                            className="flex flex-wrap items-center justify-between gap-2 bg-white border border-teal-200/80 rounded-lg px-2.5 py-1.5"
                                          >
                                            <div className="flex items-center gap-2 min-w-[150px] flex-1">
                                              <span className="text-[11px] font-bold text-teal-700">
                                                ⇄
                                              </span>
                                              <span className="text-xs font-bold text-slate-800 truncate">
                                                {troca.nome}
                                              </span>
                                              <span className="text-[10px] font-mono text-slate-500">
                                                ({mTroca.kcal} kcal)
                                              </span>
                                            </div>

                                            <div className="flex items-center gap-1.5">
                                              <input
                                                type="number"
                                                min={1}
                                                max={5000}
                                                value={troca.quantidade}
                                                onChange={(e) =>
                                                  handleAtualizarTroca(
                                                    refeicao.localId,
                                                    itemIdx,
                                                    tIdx,
                                                    {
                                                      quantidade: Math.max(
                                                        1,
                                                        Number(
                                                          e.target.value,
                                                        ) || 0,
                                                      ),
                                                    },
                                                  )
                                                }
                                                className="cl-input w-16 px-2 py-0.5 text-xs font-bold text-center rounded-md bg-white"
                                              />
                                              <select
                                                value={troca.unidade || "g"}
                                                onChange={(e) =>
                                                  handleAtualizarTroca(
                                                    refeicao.localId,
                                                    itemIdx,
                                                    tIdx,
                                                    {
                                                      unidade: e.target
                                                        .value as UnidadeMedidaDieta,
                                                    },
                                                  )
                                                }
                                                className="cl-input px-1.5 py-0.5 text-xs font-bold rounded-md bg-white"
                                              >
                                                <option value="g">g</option>
                                                <option value="ml">ml</option>
                                                <option value="un">un</option>
                                              </select>
                                              <input
                                                type="text"
                                                value={
                                                  troca.medidaCaseira || ""
                                                }
                                                onChange={(e) =>
                                                  handleAtualizarTroca(
                                                    refeicao.localId,
                                                    itemIdx,
                                                    tIdx,
                                                    {
                                                      medidaCaseira:
                                                        e.target.value || null,
                                                    },
                                                  )
                                                }
                                                placeholder="Medida caseira..."
                                                className="cl-input w-36 px-2 py-0.5 text-xs rounded-md bg-white"
                                              />
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleRemoverTroca(
                                                    refeicao.localId,
                                                    itemIdx,
                                                    tIdx,
                                                  )
                                                }
                                                className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                                title="Remover substituição"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                  <AlimentoCombobox
                                    compact
                                    showUnitAndMeasure
                                    placeholder={`Adicionar opção de troca para ${item.nome} (Tabela TACO)...`}
                                    buttonLabel="+ Troca"
                                    onAddAlimento={(alim, qtd, extra) =>
                                      handleAdicionarTrocaNoItem(
                                        refeicao.localId,
                                        itemIdx,
                                        alim,
                                        qtd,
                                        extra,
                                      )
                                    }
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Busca AlimentoCombobox (Tabela TACO) para adicionar alimento à refeição */}
                    <div className="pt-1">
                      <AlimentoCombobox
                        showUnitAndMeasure
                        placeholder={`Adicionar alimento em "${refeicao.nome}" (Tabela TACO)...`}
                        buttonLabel="Adicionar"
                        onAddAlimento={(alim, qtd, extra) =>
                          handleAddAlimentoNaRefeicao(
                            refeicao.localId,
                            alim,
                            qtd,
                            extra,
                          )
                        }
                      />
                    </div>

                    {/* Observações de preparo da refeição */}
                    <div className="pt-1">
                      <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5 mb-1">
                        <FileText className="w-3 h-3 text-teal-600" />
                        <span>Observações de preparo da refeição (opcional)</span>
                      </label>
                      <input
                        type="text"
                        value={refeicao.observacoes || ""}
                        onChange={(e) =>
                          handleAtualizarRefeicao(refeicao.localId, {
                            observacoes: e.target.value,
                          })
                        }
                        placeholder="Ex.: Preparar os ovos mexidos com fio de azeite extra virgem..."
                        className="cl-input w-full px-3 py-1.5 text-xs rounded-xl"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {erro && (
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{erro}</span>
            </div>
          )}
        </div>

        {/* RODAPÉ FIXO DO EDITOR */}
        <div className="px-5 py-3.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 font-mono font-extrabold">
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              Total: {totaisModelo.kcal} kcal
            </span>
            <span className="font-mono text-xs text-slate-600">
              P <strong className="text-emerald-700">{totaisModelo.p}g</strong>{" "}
              · C <strong className="text-amber-700">{totaisModelo.c}g</strong>{" "}
              · G <strong className="text-rose-700">{totaisModelo.g}g</strong>
            </span>
            <span className="text-[11px] font-semibold text-slate-400">
              • {totaisModelo.totalRefeicoes} refeição(ões) ·{" "}
              {totaisModelo.totalItens} item(ns) · {totaisModelo.totalTrocas}{" "}
              troca(s)
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="cl-btn-secondary px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={salvando}
              onClick={() => void handleSalvar()}
              className="cl-btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {salvando ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  {isEditandoExistente ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Salvar Modelo</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
