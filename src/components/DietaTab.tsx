"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Utensils,
  Plus,
  Trash2,
  Clock,
  Flame,
  Scale,
  Sparkles,
  Save,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Apple,
  Coffee,
  Sun,
  Moon,
  Cookie,
  Copy,
  Layers,
  Edit3,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { AlimentoCombobox, AlimentoOption } from "@/components/AlimentoCombobox";
import { FoodThumbnail } from "@/components/FoodThumbnail";
import { DietVariations } from "@/components/DietVariations";

export interface DietSubstitutionState {
  id: string;
  prescribedDietItemId: string;
  substituteFoodId?: string | null;
  substituteFoodName: string;
  quantityGrams: number;
  calories: number;
  proteins?: number | null;
  carbohydrates?: number | null;
  fats?: number | null;
  createdAt?: string | Date;
}

export interface ItemRefeicaoState {
  id: string;
  alimentoId: string;
  quantidadeGramas: number;
  observacao?: string | null;
  alimento: AlimentoOption;
  substituicoes?: DietSubstitutionState[];
  substituicao?: DietSubstitutionState | null;
}

export interface RefeicaoState {
  id: string;
  nome: string;
  horario?: string | null;
  ordem: number;
  observacoes?: string | null;
  itens: ItemRefeicaoState[];
}

export interface VariacaoDietaState {
  id: string;
  nome: string;
  descricao?: string | null;
  ordem: number;
  ativo: boolean;
  refeicoes: RefeicaoState[];
}

export interface PlanoAlimentarState {
  id: string;
  titulo: string;
  objetivo?: string | null;
  ativo: boolean;
  variacoes: VariacaoDietaState[];
}

interface DietaTabProps {
  pacienteId: string;
  pacienteNome: string;
}

function getRefeicaoIcon(nome: string) {
  const n = nome.toLowerCase();
  if (n.includes("desjejum") || n.includes("manhã") || n.includes("café")) {
    return <Coffee className="w-4 h-4 text-amber-600" />;
  }
  if (n.includes("almoço")) {
    return <Sun className="w-4 h-4 text-amber-500" />;
  }
  if (n.includes("jantar") || n.includes("noite")) {
    return <Moon className="w-4 h-4 text-indigo-500" />;
  }
  if (n.includes("ceia")) {
    return <Cookie className="w-4 h-4 text-purple-500" />;
  }
  return <Apple className="w-4 h-4 text-emerald-600" />;
}

/**
 * Extrai valores base de nutrientes por porção de 100g com suporte universal
 * aos nomes em português (proteinas, carboidratos, gorduras, calorias)
 * e em inglês da Tabela TACO / Prisma (protein/proteins, carbohydrate/carbohydrates, lipid/lipids/fats, calories).
 */
export function getAlimentoBaseNutrientes(alimento?: any) {
  if (!alimento) {
    return { porcaoBase: 100, kcal: 0, protein: 0, carbo: 0, fat: 0, fibers: 0 };
  }
  const porcaoBase = Number(alimento.porcaoBase ?? alimento.basePortion) || 100;

  // Calorias base
  const kcal = Number(
    alimento.caloriasBase ?? alimento.calorias ?? alimento.calories ?? alimento.energyKcal
  ) || 0;

  // Proteínas (proteinas, protein, proteins)
  const protein = Number(
    alimento.proteinas ?? alimento.protein ?? alimento.proteins
  ) || 0;

  // Carboidratos (carboidratos, carbohydrate, carbohydrates, carbs)
  const carbo = Number(
    alimento.carboidratos ?? alimento.carbohydrate ?? alimento.carbohydrates ?? alimento.carbs
  ) || 0;

  // Gorduras / Lipídeos (gorduras, lipid, lipids, fats, fat)
  const fat = Number(
    alimento.gorduras ?? alimento.lipid ?? alimento.lipids ?? alimento.fats ?? alimento.fat
  ) || 0;

  // Fibras
  const fibers = Number(
    alimento.fibras ?? alimento.fiber ?? alimento.fibers
  ) || 0;

  return { porcaoBase, kcal, protein, carbo, fat, fibers };
}

/**
 * Realiza o cálculo nutricional proporcional estrito com base no peso (gramas):
 * - calcProtein = (item.protein / 100) * gramas
 * - calcCarbo   = (item.carbohydrate / 100) * gramas
 * - calcFat     = (item.lipid / 100) * gramas
 * Com fallbacks robustos para 0.
 */
export function calcularNutrientesItem(alimento?: any, quantidadeGramas: number = 100) {
  const { porcaoBase, kcal, protein, carbo, fat, fibers } = getAlimentoBaseNutrientes(alimento);
  const gramas = Math.max(0, Number(quantidadeGramas) || 0);
  const base = porcaoBase > 0 ? porcaoBase : 100;

  const calcKcal = Math.round((kcal / base) * gramas);
  const calcProtein = parseFloat(((protein / base) * gramas).toFixed(1));
  const calcCarbo = parseFloat(((carbo / base) * gramas).toFixed(1));
  const calcFat = parseFloat(((fat / base) * gramas).toFixed(1));
  const calcFiber = parseFloat(((fibers / base) * gramas).toFixed(1));

  return {
    calorias: isNaN(calcKcal) ? 0 : calcKcal,
    proteinas: isNaN(calcProtein) ? 0 : calcProtein,
    carboidratos: isNaN(calcCarbo) ? 0 : calcCarbo,
    gorduras: isNaN(calcFat) ? 0 : calcFat,
    fibras: isNaN(calcFiber) ? 0 : calcFiber,
  };
}

export function DietaTab({ pacienteId, pacienteNome }: DietaTabProps) {
  const [plano, setPlano] = useState<PlanoAlimentarState | null>(null);
  const [variacoes, setVariacoes] = useState<VariacaoDietaState[]>([]);
  const [activeVariacaoId, setActiveVariacaoId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const pendingRenamesRef = useRef<Record<string, string>>({});

  // Modal para Criar Nova Variação
  const [isNovaVariacaoModalOpen, setIsNovaVariacaoModalOpen] = useState(false);
  const [nomeNovaVariacao, setNomeNovaVariacao] = useState("");
  const [descNovaVariacao, setDescNovaVariacao] = useState("");
  const [clonarDeId, setClonarDeId] = useState<string>("");
  const [criandoVariacao, setCriandoVariacao] = useState(false);

  // 1. Carrega o plano alimentar com as variações
  const carregarDados = useCallback(async () => {
    try {
      setCarregando(true);
      setErro(null);

      const resPlano = await fetch(`/api/pacientes/${pacienteId}/dieta`, {
        cache: "no-store",
      });

      if (!resPlano.ok) {
        throw new Error("Não foi possível carregar o plano alimentar.");
      }

      const dataPlano = await resPlano.json();
      const loadedVariacoes: VariacaoDietaState[] = Array.isArray(
        dataPlano.plano?.variacoes
      )
        ? dataPlano.plano.variacoes
        : [];
      setPlano(dataPlano.plano);
      setVariacoes(loadedVariacoes);

      // Define a primeira variação como ativa por padrão
      if (loadedVariacoes.length > 0) {
        setActiveVariacaoId((prev) => {
          if (prev && loadedVariacoes.some((v) => v.id === prev)) {
            return prev;
          }
          return loadedVariacoes[0].id;
        });
      }
    } catch (err: any) {
      console.error("Erro ao carregar dados da dieta:", err);
      setErro(err.message || "Erro de conexão ao carregar dieta.");
    } finally {
      setCarregando(false);
    }
  }, [pacienteId]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Variação atualmente selecionada na interface
  const variacaoAtiva = useMemo(() => {
    if (!variacoes.length) return null;
    return (
      variacoes.find((v) => v.id === activeVariacaoId) || variacoes[0]
    );
  }, [variacoes, activeVariacaoId]);

  // 2. Manipulações reativas de alimentos na variação ativa
  const handleAlterarQuantidade = (
    refeicaoId: string,
    itemId: string,
    novaQtd: number
  ) => {
    if (!variacaoAtiva) return;
    setVariacoes((prev) =>
      prev.map((v) => {
        if (v.id !== variacaoAtiva.id) return v;
        return {
          ...v,
          refeicoes: v.refeicoes.map((ref) => {
            if (ref.id !== refeicaoId) return ref;
            return {
              ...ref,
              itens: ref.itens.map((it) => {
                if (it.id !== itemId) return it;
                return {
                  ...it,
                  quantidadeGramas: Math.max(0, novaQtd),
                };
              }),
            };
          }),
        };
      })
    );
  };

  const handleAdicionarAlimento = async (
    refeicaoId: string,
    alimento: AlimentoOption,
    quantidadeGramas: number
  ) => {
    if (!variacaoAtiva) return;
    const targetVariacaoId = variacaoAtiva.id;
    const tempId = `temp-${Date.now()}`;
    const novoItem: ItemRefeicaoState = {
      id: tempId,
      alimentoId: alimento.id,
      quantidadeGramas: quantidadeGramas || 100,
      alimento,
    };

    // Atualização otimista
    setVariacoes((prev) =>
      prev.map((v) => {
        if (v.id !== targetVariacaoId) return v;
        return {
          ...v,
          refeicoes: v.refeicoes.map((ref) => {
            if (ref.id !== refeicaoId) return ref;
            return {
              ...ref,
              itens: [...ref.itens, novoItem],
            };
          }),
        };
      })
    );

    try {
      const res = await fetch(`/api/pacientes/${pacienteId}/dieta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "adicionar_item",
          refeicaoId,
          alimentoId: alimento.id,
          quantidadeGramas: quantidadeGramas || 100,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.item) {
          setVariacoes((prev) =>
            prev.map((v) => {
              if (v.id !== targetVariacaoId) return v;
              return {
                ...v,
                refeicoes: v.refeicoes.map((ref) => {
                  if (ref.id !== refeicaoId) return ref;
                  return {
                    ...ref,
                    itens: ref.itens.map((it) =>
                      it.id === tempId
                        ? {
                            ...it,
                            id: json.item.id,
                            alimento: json.item.alimento || it.alimento,
                          }
                        : it
                    ),
                  };
                }),
              };
            })
          );
        }
      }
    } catch (err) {
      console.error("Erro ao persistir novo alimento:", err);
    }
  };

  const handleRemoverItem = async (refeicaoId: string, itemId: string) => {
    if (!variacaoAtiva) return;
    const targetVariacaoId = variacaoAtiva.id;

    // Remoção otimista
    setVariacoes((prev) =>
      prev.map((v) => {
        if (v.id !== targetVariacaoId) return v;
        return {
          ...v,
          refeicoes: v.refeicoes.map((ref) => {
            if (ref.id !== refeicaoId) return ref;
            return {
              ...ref,
              itens: ref.itens.filter((it) => it.id !== itemId),
            };
          }),
        };
      })
    );

    if (!itemId.startsWith("temp-")) {
      try {
        await fetch(
          `/api/pacientes/${pacienteId}/dieta?itemId=${encodeURIComponent(itemId)}`,
          { method: "DELETE" }
        );
      } catch (err) {
        console.error("Erro ao deletar alimento:", err);
      }
    }
  };

  const handleRemoverSubstituicao = async (
    refeicaoId: string,
    itemId: string,
    subId: string
  ) => {
    try {
      const res = await fetch(
        `/api/pacientes/${encodeURIComponent(pacienteId)}/dieta/substituicao?substitutionId=${encodeURIComponent(subId)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setVariacoes((prev) =>
          prev.map((v) => ({
            ...v,
            refeicoes: v.refeicoes.map((r) => {
              if (r.id !== refeicaoId) return r;
              return {
                ...r,
                itens: r.itens.map((it) => {
                  if (it.id !== itemId) return it;
                  return {
                    ...it,
                    substituicao: null,
                    substituicoes: [],
                  };
                }),
              };
            }),
          }))
        );
      }
    } catch (err) {
      console.error("Erro ao remover substituição:", err);
    }
  };

  // 2.5 Atualizar título da variação no estado principal (imutável) + persistir no banco
  const handleUpdateVariationTitle = useCallback(
    async (variacaoId: string, novoTitulo: string) => {
      const trimmed = novoTitulo.trim();
      if (!trimmed) return;

      pendingRenamesRef.current[variacaoId] = trimmed;
      setVariacoes((prev) =>
        prev.map((v) => (v.id === variacaoId ? { ...v, nome: trimmed } : v))
      );

      try {
        const res = await fetch(`/api/pacientes/${pacienteId}/dieta`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            acao: "atualizar_variacao",
            variacaoId,
            nome: trimmed,
          }),
        });
        if (res.ok && pendingRenamesRef.current[variacaoId] === trimmed) {
          delete pendingRenamesRef.current[variacaoId];
        }
      } catch (err) {
        console.error("Erro ao persistir título da variação:", err);
      }
    },
    [pacienteId]
  );

  // 2.6 Excluir variação de dieta com validação de mínimo de 1 variação
  const handleExcluirVariacao = useCallback(
    async (variacaoId: string) => {
      if (variacoes.length <= 1) {
        throw new Error(
          "O paciente sempre deve possuir pelo menos uma variação de dieta."
        );
      }

      const res = await fetch(
        `/api/pacientes/${pacienteId}/dieta?variacaoId=${encodeURIComponent(variacaoId)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          data?.error || "Não foi possível excluir a variação de dieta."
        );
      }

      delete pendingRenamesRef.current[variacaoId];

      const deletedIdx = variacoes.findIndex((v) => v.id === variacaoId);
      const remainingVariacoes = variacoes.filter((v) => v.id !== variacaoId);
      const variacaoExcluida = deletedIdx >= 0 ? variacoes[deletedIdx] : null;
      const nextActive =
        deletedIdx > 0
          ? remainingVariacoes[deletedIdx - 1] || remainingVariacoes[0]
          : remainingVariacoes[0];

      setVariacoes((prev) => prev.filter((v) => v.id !== variacaoId));
      setActiveVariacaoId((prevActive) =>
        prevActive === variacaoId ? (nextActive?.id ?? null) : prevActive
      );
      setMensagemSucesso(
        variacaoExcluida
          ? `Variação "${variacaoExcluida.nome}" excluída!`
          : "Variação excluída!"
      );
      setTimeout(() => setMensagemSucesso(null), 3000);
    },
    [pacienteId, variacoes]
  );

  // 3. Salvar alterações pendentes
  const handleSalvarPlano = async () => {
    if (!plano || !variacaoAtiva) return;
    try {
      setSalvando(true);
      setErro(null);

      const activeIds = new Set(variacoes.map((v) => v.id));
      const pendingRenames = Object.entries(pendingRenamesRef.current).filter(([id]) =>
        activeIds.has(id)
      );

      const updates: Array<Promise<Response>> = [];

      for (const [variacaoId, nome] of pendingRenames) {
        updates.push(
          fetch(`/api/pacientes/${pacienteId}/dieta`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              acao: "atualizar_variacao",
              variacaoId,
              nome,
            }),
          })
        );
      }

      for (const ref of variacaoAtiva.refeicoes) {
        for (const item of ref.itens) {
          if (!item.id.startsWith("temp-")) {
            updates.push(
              fetch(`/api/pacientes/${pacienteId}/dieta`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  acao: "atualizar_item",
                  itemId: item.id,
                  quantidadeGramas: item.quantidadeGramas,
                }),
              })
            );
          }
        }
      }

      const responses = await Promise.all(updates);
      const failed = responses.find((r) => !r.ok);
      if (failed) {
        const errData = await failed.json().catch(() => ({}));
        throw new Error(errData?.error || "Falha ao salvar alterações.");
      }

      for (const [variacaoId] of pendingRenames) {
        delete pendingRenamesRef.current[variacaoId];
      }

      setMensagemSucesso("Plano, variações e quantidades salvos com sucesso!");
      setTimeout(() => setMensagemSucesso(null), 3000);
    } catch (err) {
      console.error("Erro ao salvar dieta:", err);
      setErro(err instanceof Error ? err.message : "Erro ao salvar alterações.");
    } finally {
      setSalvando(false);
    }
  };

  // 4. Criação de nova variação de cardápio
  const handleCriarNovaVariacao = async () => {
    if (!plano || !nomeNovaVariacao.trim()) return;

    try {
      setCriandoVariacao(true);
      const res = await fetch(`/api/pacientes/${pacienteId}/dieta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "criar_variacao",
          planoAlimentarId: plano.id,
          nome: nomeNovaVariacao.trim().toUpperCase(),
          descricao: descNovaVariacao.trim().toUpperCase() || undefined,
          clonarDeVariacaoId: clonarDeId || undefined,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.variacao) {
          setVariacoes((prev) => [...prev, json.variacao]);
          setActiveVariacaoId(json.variacao.id);
          setIsNovaVariacaoModalOpen(false);
          setNomeNovaVariacao("");
          setDescNovaVariacao("");
          setClonarDeId("");
          setMensagemSucesso(`Variação "${json.variacao.nome}" criada!`);
          setTimeout(() => setMensagemSucesso(null), 3000);
        }
      }
    } catch (err) {
      console.error("Erro ao criar nova variação:", err);
    } finally {
      setCriandoVariacao(false);
    }
  };

  // ==========================================================================
  // MOTOR DE CÁLCULO REATIVO (Zero Atrito com useMemo por Variação)
  // ==========================================================================

  const totaisPorRefeicao = useMemo(() => {
    if (!variacaoAtiva) return {};

    const mapa: Record<
      string,
      {
        calorias: number;
        proteinas: number;
        carboidratos: number;
        gorduras: number;
      }
    > = {};

    for (const ref of variacaoAtiva.refeicoes) {
      // Itera com .reduce() sobre os valores calculados proporcionalmente com as gramas
      const totaisRef = ref.itens.reduce(
        (acc, item) => {
          const nut = calcularNutrientesItem(item.alimento, item.quantidadeGramas);
          acc.calorias += nut.calorias;
          acc.proteinas += nut.proteinas;
          acc.carboidratos += nut.carboidratos;
          acc.gorduras += nut.gorduras;
          return acc;
        },
        { calorias: 0, proteinas: 0, carboidratos: 0, gorduras: 0 }
      );

      mapa[ref.id] = {
        calorias: Math.round(totaisRef.calorias),
        proteinas: Number(totaisRef.proteinas.toFixed(1)),
        carboidratos: Number(totaisRef.carboidratos.toFixed(1)),
        gorduras: Number(totaisRef.gorduras.toFixed(1)),
      };
    }

    return mapa;
  }, [variacaoAtiva]);

  const totalDia = useMemo(() => {
    if (!variacaoAtiva) {
      return { calorias: 0, proteinas: 0, carboidratos: 0, gorduras: 0 };
    }

    return variacaoAtiva.refeicoes.reduce(
      (accRef, ref) => {
        const totaisRef = ref.itens.reduce(
          (accItem, item) => {
            const nut = calcularNutrientesItem(item.alimento, item.quantidadeGramas);
            accItem.calorias += nut.calorias;
            accItem.proteinas += nut.proteinas;
            accItem.carboidratos += nut.carboidratos;
            accItem.gorduras += nut.gorduras;
            return accItem;
          },
          { calorias: 0, proteinas: 0, carboidratos: 0, gorduras: 0 }
        );

        accRef.calorias += Math.round(totaisRef.calorias);
        accRef.proteinas = Number((accRef.proteinas + totaisRef.proteinas).toFixed(1));
        accRef.carboidratos = Number((accRef.carboidratos + totaisRef.carboidratos).toFixed(1));
        accRef.gorduras = Number((accRef.gorduras + totaisRef.gorduras).toFixed(1));
        return accRef;
      },
      { calorias: 0, proteinas: 0, carboidratos: 0, gorduras: 0 }
    );
  }, [variacaoAtiva]);

  if (carregando) {
    return (
      <div className="flex-1 min-h-[360px] flex flex-col items-center justify-center p-8 text-slate-500">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin mb-3" />
        <p className="text-xs font-semibold">Carregando variações e banco TACO...</p>
      </div>
    );
  }

  if (erro && !plano) {
    return (
      <div className="flex-1 min-h-[360px] flex flex-col items-center justify-center p-8 text-rose-600">
        <AlertCircle className="w-8 h-8 mb-2" />
        <p className="text-xs font-semibold">{erro}</p>
        <button
          type="button"
          onClick={carregarDados}
          className="mt-3 px-3 py-1.5 text-xs font-bold text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100 cursor-pointer"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-50/50 overflow-hidden">
      {/* ======================================================== */}
      {/* CABEÇALHO DO PLANO E AÇÕES */}
      {/* ======================================================== */}
      <div className="px-6 py-3.5 bg-white border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-teal-50 border border-teal-200/70 text-teal-700">
            <Utensils className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-800">
                {plano?.titulo || "Plano Alimentar Individualizado"}
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Tabela TACO (UNICAMP)
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Prescrição nutricional de <span className="font-semibold text-slate-600">{pacienteNome}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {erro && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 bg-rose-50 px-3 py-1 rounded-lg border border-rose-200 animate-in fade-in duration-150">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
              {erro}
            </span>
          )}
          {mensagemSucesso && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200 animate-in fade-in duration-150">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              {mensagemSucesso}
            </span>
          )}

          <button
            type="button"
            onClick={handleSalvarPlano}
            disabled={salvando}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {salvando ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Salvar Alterações</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* NAVEGAÇÃO HORIZONTAL DE VARIAÇÕES (TABS CRUD)             */}
      {/* ======================================================== */}
      <DietVariations
        variacoes={variacoes}
        variacaoAtiva={variacaoAtiva}
        onSelectVariacao={setActiveVariacaoId}
        onRename={handleUpdateVariationTitle}
        onDeleteVariacao={handleExcluirVariacao}
        onOpenNovaVariacao={() => {
          setNomeNovaVariacao(
            `Opção ${variacoes.length ? variacoes.length + 1 : 1}`
          );
          setDescNovaVariacao("");
          setClonarDeId(variacaoAtiva?.id || "");
          setIsNovaVariacaoModalOpen(true);
        }}
      />

      {/* ======================================================== */}
      {/* ÁREA DE REFEIÇÕES DA VARIAÇÃO SELECIONADA */}
      {/* ======================================================== */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
        {variacaoAtiva?.refeicoes.map((refeicao) => {
          const totais = totaisPorRefeicao[refeicao.id] || {
            calorias: 0,
            proteinas: 0,
            carboidratos: 0,
            gorduras: 0,
          };

          return (
            <div
              key={refeicao.id}
              className="relative bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-visible transition-all hover:border-slate-300 focus-within:z-30 hover:z-20"
            >
              {/* CABEÇALHO DA REFEIÇÃO COM SUBTOTAL */}
              <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 rounded-t-2xl">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
                    {getRefeicaoIcon(refeicao.nome)}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                      <span>{refeicao.nome}</span>
                      {refeicao.horario && (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-slate-400">
                          <Clock className="w-3 h-3" />
                          {refeicao.horario}
                        </span>
                      )}
                    </h3>
                  </div>
                </div>

                {/* Subtotais da Refeição */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                    <span className="text-slate-700">
                      P: <strong className="text-emerald-700">{totais.proteinas}g</strong>
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-700">
                      C: <strong className="text-amber-700">{totais.carboidratos}g</strong>
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-700">
                      G: <strong className="text-rose-700">{totais.gorduras}g</strong>
                    </span>
                  </div>

                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200">
                    <Flame className="w-3.5 h-3.5 text-amber-500" />
                    {totais.calorias} kcal
                  </span>
                </div>
              </div>

              {/* LISTA DE ALIMENTOS DA REFEIÇÃO */}
              <div className="p-4 space-y-2">
                {refeicao.itens.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2 text-center">
                    Nenhum alimento cadastrado nesta refeição ainda.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {refeicao.itens.map((item) => {
                      const sub = item.substituicao || item.substituicoes?.[0] || null;
                      const hasSub = !!sub;

                      const nutItem = calcularNutrientesItem(item.alimento, item.quantidadeGramas);
                      const calItem = nutItem.calorias;
                      const protItem = nutItem.proteinas.toFixed(1);
                      const carbItem = nutItem.carboidratos.toFixed(1);
                      const gordItem = nutItem.gorduras.toFixed(1);
                      const baseNut = getAlimentoBaseNutrientes(item.alimento);

                      return (
                        <div key={item.id} className="py-2.5 space-y-1.5 transition-all">
                          {/* LINHA DO ALIMENTO ORIGINAL / PRESCRITO */}
                          <div
                            className={`flex flex-wrap items-center justify-between gap-3 group transition-opacity ${
                              hasSub ? "line-through text-slate-400 opacity-60" : ""
                            }`}
                          >
                            {/* Miniatura, Nome e Categoria */}
                            <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                              <FoodThumbnail
                                nome={item.alimento.nome}
                                categoria={item.alimento.categoria}
                                imageUrl={item.alimento.imageUrl || item.alimento.fotoUrl}
                                className={`w-10 h-10 shrink-0 ${hasSub ? "grayscale opacity-75" : ""}`}
                              />
                              <div className="min-w-0">
                                <span
                                  className={`text-xs font-bold block truncate ${
                                    hasSub ? "line-through text-slate-400 opacity-60" : "text-slate-800"
                                  }`}
                                >
                                  {item.alimento.nome}
                                </span>
                                <span
                                  className={`text-[10px] block truncate ${
                                    hasSub ? "line-through text-slate-400 opacity-60" : "text-slate-400"
                                  }`}
                                >
                                  {baseNut.kcal} kcal / 100g
                                  {item.alimento.categoria && ` • ${item.alimento.categoria}`}
                                </span>
                              </div>
                            </div>

                            {/* Input de Quantidade em Gramas */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <div className="relative flex items-center">
                                <input
                                  type="number"
                                  min={0}
                                  step={5}
                                  disabled={hasSub}
                                  value={item.quantidadeGramas}
                                  onChange={(e) =>
                                    handleAlterarQuantidade(
                                      refeicao.id,
                                      item.id,
                                      Number(e.target.value) || 0
                                    )
                                  }
                                  className={`w-20 pl-2 pr-6 py-1 border rounded-lg text-xs font-mono font-bold outline-none text-right transition-colors ${
                                    hasSub
                                      ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                      : "bg-slate-50 focus:bg-white border-slate-200 focus:border-teal-500 text-slate-800"
                                  }`}
                                />
                                <span className="absolute right-2 text-[10px] font-bold text-slate-400 pointer-events-none">
                                  g
                                </span>
                              </div>
                            </div>

                            {/* Macros Calculados Instantaneamente */}
                            <div className="flex items-center gap-3 shrink-0">
                              <div
                                className={`text-[11px] font-mono font-semibold hidden sm:flex items-center gap-1.5 ${
                                  hasSub ? "line-through text-slate-400 opacity-60" : "text-slate-500"
                                }`}
                              >
                                <span>P: {protItem}g</span>
                                <span className="text-slate-300">•</span>
                                <span>C: {carbItem}g</span>
                                <span className="text-slate-300">•</span>
                                <span>G: {gordItem}g</span>
                              </div>

                              <span
                                className={`inline-flex items-center gap-1 font-mono text-xs font-bold px-2 py-0.5 rounded border min-w-[70px] justify-end ${
                                  hasSub
                                    ? "bg-slate-100 text-slate-400 border-slate-200 line-through opacity-60"
                                    : "text-amber-800 bg-amber-50/70 border-amber-200/50"
                                }`}
                              >
                                <Flame className="w-3 h-3 text-amber-500" />
                                {calItem} kcal
                              </span>

                              {/* Botão Remover */}
                              <button
                                type="button"
                                onClick={() => handleRemoverItem(refeicao.id, item.id)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Remover alimento"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* IMEDIATAMENTE ABAIXO NO MESMO BLOCO: ALIMENTO SUBSTITUTO ESCOLHIDO PELO PACIENTE */}
                          {hasSub && sub && (
                            <div className="ml-3 sm:ml-6 pl-3 border-l-2 border-emerald-400">
                              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex flex-wrap items-center justify-between gap-3 shadow-xs animate-in fade-in slide-in-from-top-1 duration-200">
                                {/* Informações do Alimento Substituto */}
                                <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
                                  <FoodThumbnail
                                    nome={sub.substituteFoodName}
                                    className="w-9 h-9 shrink-0 ring-1 ring-emerald-300 shadow-2xs"
                                  />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-bold text-emerald-950 block truncate">
                                        {sub.substituteFoodName}
                                      </span>
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                        <RefreshCw className="w-2.5 h-2.5 text-emerald-600" />
                                        Substituído pelo Paciente
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-emerald-700/80 block mt-0.5">
                                      Consumo registrado: <strong>{sub.quantityGrams}g</strong>
                                    </span>
                                  </div>
                                </div>

                                {/* Macros e Calorias do Substituto */}
                                <div className="flex items-center gap-3 shrink-0">
                                  {(sub.proteins != null || sub.carbohydrates != null) && (
                                    <div className="text-[11px] font-mono font-medium text-emerald-700 hidden sm:flex items-center gap-1.5">
                                      <span>P: {sub.proteins ?? 0}g</span>
                                      <span className="text-emerald-300">•</span>
                                      <span>C: {sub.carbohydrates ?? 0}g</span>
                                      <span className="text-emerald-300">•</span>
                                      <span>G: {sub.fats ?? 0}g</span>
                                    </div>
                                  )}

                                  <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-emerald-900 bg-white/90 px-2.5 py-0.5 rounded-lg border border-emerald-300 shadow-2xs min-w-[70px] justify-end">
                                    <Flame className="w-3 h-3 text-emerald-600" />
                                    {sub.calories} kcal
                                  </span>

                                  {/* Botão para Reverter Substituição */}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoverSubstituicao(refeicao.id, item.id, sub.id)
                                    }
                                    className="p-1 rounded-md text-emerald-600 hover:text-emerald-900 hover:bg-emerald-100/80 transition-colors cursor-pointer"
                                    title="Desfazer substituição e restaurar visualização do prescrito"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* LINHA COMPACTA DE BUSCA E ADIÇÃO: [ Busca ] -> [ Input Gramas ] -> [ Botão + ] */}
                <AlimentoCombobox
                  onAddAlimento={(alimento, gramas) =>
                    handleAdicionarAlimento(refeicao.id, alimento, gramas)
                  }
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* ======================================================== */}
      {/* RODAPÉ FIXO: TOTAL DO DIA COM MACRONUTRIENTES */}
      {/* ======================================================== */}
      <div className="p-3.5 bg-white border-t border-slate-200 shadow-md shrink-0 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Total Diário ({variacaoAtiva?.nome || "Opção Ativa"})
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-black text-slate-900 font-mono">
                {totalDia.calorias}
              </span>
              <span className="text-xs font-bold text-slate-500">kcal / dia</span>
            </div>
          </div>
        </div>

        {/* Distribuição de Macronutrientes do Dia */}
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl px-3 py-1 text-center min-w-[85px]">
            <span className="text-[10px] font-bold text-emerald-800 uppercase block">
              Proteínas
            </span>
            <span className="font-mono text-xs font-black text-emerald-900">
              {totalDia.proteinas}g
            </span>
            {totalDia.calorias > 0 && (
              <span className="text-[9px] text-emerald-600 font-bold block">
                {Math.round(((totalDia.proteinas * 4) / totalDia.calorias) * 100)}%
              </span>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200/80 rounded-xl px-3 py-1 text-center min-w-[85px]">
            <span className="text-[10px] font-bold text-amber-800 uppercase block">
              Carboidratos
            </span>
            <span className="font-mono text-xs font-black text-amber-900">
              {totalDia.carboidratos}g
            </span>
            {totalDia.calorias > 0 && (
              <span className="text-[9px] text-amber-600 font-bold block">
                {Math.round(((totalDia.carboidratos * 4) / totalDia.calorias) * 100)}%
              </span>
            )}
          </div>

          <div className="bg-rose-50 border border-rose-200/80 rounded-xl px-3 py-1 text-center min-w-[85px]">
            <span className="text-[10px] font-bold text-rose-800 uppercase block">
              Gorduras
            </span>
            <span className="font-mono text-xs font-black text-rose-900">
              {totalDia.gorduras}g
            </span>
            {totalDia.calorias > 0 && (
              <span className="text-[9px] text-rose-600 font-bold block">
                {Math.round(((totalDia.gorduras * 9) / totalDia.calorias) * 100)}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL PARA ADICIONAR NOVA VARIAÇÃO DE DIETA */}
      {/* ======================================================== */}
      {isNovaVariacaoModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-teal-400" />
                <h3 className="text-sm font-bold">Nova Variação de Cardápio</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNovaVariacaoModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nome da Variação (ex: Opção 3, Dia de Treino, Fim de Semana (Flexível)) *
                </label>
                <input
                  type="text"
                  autoFocus
                  value={nomeNovaVariacao}
                  onChange={(e) => setNomeNovaVariacao(e.target.value.toUpperCase())}
                  placeholder="EX: OPÇÃO 3 (VEGETARIANA)"
                  className="w-full px-3 py-2 text-xs border border-slate-200 focus:border-teal-500 rounded-xl outline-none uppercase"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Descrição ou Objetivo (opcional)
                </label>
                <input
                  type="text"
                  value={descNovaVariacao}
                  onChange={(e) => setDescNovaVariacao(e.target.value.toUpperCase())}
                  placeholder="EX: CARDÁPIO COM FOCO EM LEGUMINOSAS E PEIXES"
                  className="w-full px-3 py-2 text-xs border border-slate-200 focus:border-teal-500 rounded-xl outline-none uppercase"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Estrutura Inicial de Refeições
                </label>
                <select
                  value={clonarDeId}
                  onChange={(e) => setClonarDeId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 focus:border-teal-500 rounded-xl outline-none bg-white text-slate-800"
                >
                  <option value="">Refeições em branco (Desjejum, Almoço, Lanche, Jantar)</option>
                  {variacoes.map((v) => (
                    <option key={v.id} value={v.id}>
                      Clonar alimentos da "{v.nome}"
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsNovaVariacaoModalOpen(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-200/60"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!nomeNovaVariacao.trim() || criandoVariacao}
                onClick={handleCriarNovaVariacao}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white shadow-2xs disabled:opacity-50"
              >
                {criandoVariacao ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>Criar Variação</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
