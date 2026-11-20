"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useContext,
} from "react";
import {
  Utensils,
  Plus,
  Trash2,
  Clock,
  Flame,
  Save,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Apple,
  Coffee,
  Sun,
  Moon,
  Cookie,
  Layers,
  Edit3,
  RefreshCw,
  RotateCcw,
  ArrowLeftRight,
  MessageSquareText,
  X,
  FileDown,
  MessageCircle,
} from "lucide-react";
import AuthContext, { type UsuarioLogado } from "@/contexts/AuthContext";
import { formatarDataBR } from "@/lib/date-br";
import {
  buildWhatsAppPlanoUrl,
  formatarNomeArquivoPlanoAlimentar,
  getClinicaLogoUrl,
  resolveDoctorProfile,
} from "@/lib/pdf-clinica-template";
import type {
  DietPlanPDFProps,
  DietPlanPdfVariacao,
} from "@/components/DietPlanPDF";
import {
  AlimentoCombobox,
  AlimentoOption,
  AlimentoAddExtra,
  UnidadeMedidaOption,
} from "@/components/AlimentoCombobox";
import { FoodThumbnail } from "@/components/FoodThumbnail";
import { DietVariations } from "@/components/DietVariations";

export interface SubstituicaoPrescritaState {
  id: string;
  itemRefeicaoId: string;
  alimentoId?: string | null;
  nomeExibicao: string;
  quantidade: number;
  unidade: UnidadeMedidaOption;
  medidaCaseira?: string | null;
  ordem: number;
  thumbnailUrl?: string | null;
  categoria?: string | null;
  caloriasPorcao?: number | null;
  proteinasPorcao?: number | null;
  carboidratosPorcao?: number | null;
  gordurasPorcao?: number | null;
}

export interface DietSubstitutionState {
  id: string;
  prescribedDietItemId: string;
  substituteFoodId?: string | null;
  substituteFoodName: string;
  substituteThumbnailUrl?: string | null;
  substituteFood?: { thumbnailUrl?: string | null } | null;
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
  unidade?: UnidadeMedidaOption;
  medidaCaseira?: string | null;
  observacao?: string | null;
  alimento: AlimentoOption;
  /** Substituições 1:N prescritas pela médica (SUBSTITUICOES_ITENS_REFEICAO) */
  substituicoes?: SubstituicaoPrescritaState[];
  /** Substituição legada registrada pelo paciente (DIET_SUBSTITUTIONS) */
  substituicao?: DietSubstitutionState | null;
}

export interface RefeicaoState {
  id: string;
  nome: string;
  horario?: string | null;
  ordem: number;
  opcional?: boolean;
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
  nome?: string;
  titulo: string;
  objetivo?: string | null;
  ativo: boolean;
  variacoes: VariacaoDietaState[];
}

interface DietaTabProps {
  pacienteId: string;
  pacienteNome: string;
  pacienteRecordCode?: string | null;
  pacienteObjetivo?: string | null;
  pacienteTelefone?: string | null;
}

const PRESETS_NOVA_REFEICAO = [
  { nome: "Água + Suplemento", horario: "07:45", opcional: false },
  { nome: "Colação / Lanche Manhã", horario: "10:00", opcional: false },
  { nome: "Sobremesa", horario: "12:30", opcional: false },
  { nome: "Pré-Treino", horario: "17:00", opcional: false },
  { nome: "Ceia", horario: "21:30", opcional: true },
];

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
  if (n.includes("ceia") || n.includes("sobremesa")) {
    return <Cookie className="w-4 h-4 text-purple-500" />;
  }
  return <Apple className="w-4 h-4 text-emerald-600" />;
}

/**
 * Extrai valores base de nutrientes por porção base (100g/ml) com suporte universal
 * aos nomes em português e inglês da Tabela TACO.
 */
export function getAlimentoBaseNutrientes(alimento?: Partial<AlimentoOption> | null) {
  if (!alimento) {
    return { porcaoBase: 100, kcal: 0, protein: 0, carbo: 0, fat: 0, fibers: 0 };
  }
  const alimAny = alimento as Record<string, unknown>;
  const porcaoBase = Number(alimento.porcaoBase ?? alimAny.basePortion) || 100;

  const kcal =
    Number(
      alimento.caloriasBase ??
        alimento.calorias ??
        alimento.calories ??
        alimAny.energyKcal
    ) || 0;

  const protein =
    Number(alimento.proteinas ?? alimento.protein ?? alimento.proteins) || 0;

  const carbo =
    Number(
      alimento.carboidratos ??
        alimento.carbohydrate ??
        alimento.carbohydrates ??
        alimAny.carbs
    ) || 0;

  const fat =
    Number(
      alimento.gorduras ??
        alimento.lipid ??
        alimento.lipids ??
        alimento.fats ??
        alimAny.fat
    ) || 0;

  const fibers = Number(alimento.fibras ?? alimAny.fiber ?? alimAny.fibers) || 0;

  return { porcaoBase, kcal, protein, carbo, fat, fibers };
}

/**
 * Realiza o cálculo nutricional proporcional estrito com base na quantidade.
 */
export function calcularNutrientesItem(
  alimento?: Partial<AlimentoOption> | null,
  quantidadeGramas: number = 100
) {
  const { porcaoBase, kcal, protein, carbo, fat, fibers } =
    getAlimentoBaseNutrientes(alimento);
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

function buildDietSnapshotSignature(
  nome: string,
  vars: VariacaoDietaState[]
): string {
  return JSON.stringify({
    n: nome.trim(),
    v: vars.map((v) => ({
      id: v.id,
      nome: v.nome,
      r: v.refeicoes.map((r) => ({
        id: r.id,
        nome: r.nome,
        h: r.horario ?? null,
        op: Boolean(r.opcional),
        obs: r.observacoes ?? null,
        i: r.itens.map((it) => ({
          id: it.id,
          q: it.quantidadeGramas,
          u: it.unidade || "g",
          m: it.medidaCaseira ?? null,
          s: (it.substituicoes || []).map((sub) => ({
            id: sub.id,
            q: sub.quantidade,
            u: sub.unidade || "g",
            m: sub.medidaCaseira ?? null,
          })),
        })),
      })),
    })),
  });
}

export function DietaTab({
  pacienteId,
  pacienteNome,
  pacienteRecordCode,
  pacienteObjetivo,
  pacienteTelefone,
}: DietaTabProps) {
  const authContext = useContext(AuthContext);
  const [fetchedSessionUser, setFetchedSessionUser] =
    useState<UsuarioLogado | null>(null);

  useEffect(() => {
    if (authContext?.usuario) return;
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.autenticado && data?.usuario) {
          setFetchedSessionUser(data.usuario as UsuarioLogado);
        }
      })
      .catch(() => {
        // Segue com perfil institucional neutro caso a sessão não esteja disponível
      });
    return () => {
      active = false;
    };
  }, [authContext?.usuario]);

  const activeUser = authContext?.usuario ?? fetchedSessionUser;
  const doctorProfile = useMemo(
    () => resolveDoctorProfile(activeUser),
    [activeUser]
  );

  const [plano, setPlano] = useState<PlanoAlimentarState | null>(null);
  const [nomePlano, setNomePlano] = useState("Plano Alimentar Individualizado");
  const [variacoes, setVariacoes] = useState<VariacaoDietaState[]>([]);
  const [activeVariacaoId, setActiveVariacaoId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const pendingRenamesRef = useRef<Record<string, string>>({});
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");

  // Modal de Exportação em PDF do Plano Alimentar
  const [isExportPdfModalOpen, setIsExportPdfModalOpen] = useState(false);
  const [pdfEscopoVariacoes, setPdfEscopoVariacoes] = useState<
    "atual" | "todas"
  >("atual");
  const [pdfIncluirMacros, setPdfIncluirMacros] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [pdfErro, setPdfErro] = useState<string | null>(null);

  // Modal para Criar Nova Variação
  const [isNovaVariacaoModalOpen, setIsNovaVariacaoModalOpen] = useState(false);
  const [nomeNovaVariacao, setNomeNovaVariacao] = useState("");
  const [descNovaVariacao, setDescNovaVariacao] = useState("");
  const [clonarDeId, setClonarDeId] = useState<string>("");
  const [criandoVariacao, setCriandoVariacao] = useState(false);

  // Adicionar nova refeição inline
  const [isAddRefeicaoOpen, setIsAddRefeicaoOpen] = useState(false);
  const [novaRefNome, setNovaRefNome] = useState("");
  const [novaRefHorario, setNovaRefHorario] = useState("15:00");
  const [novaRefOpcional, setNovaRefOpcional] = useState(false);
  const [criandoRefeicao, setCriandoRefeicao] = useState(false);

  // Controle de qual item está com o inline "+ Troca" aberto
  const [openSwapItemId, setOpenSwapItemId] = useState<string | null>(null);

  // 1. Carrega o plano alimentar com as variações
  const aplicarDadosPlano = useCallback(
    (dataPlano: { plano?: PlanoAlimentarState | null }) => {
      const loadedVariacoes: VariacaoDietaState[] = Array.isArray(
        dataPlano.plano?.variacoes
      )
        ? dataPlano.plano.variacoes
        : [];
      setPlano(dataPlano.plano ?? null);
      const loadedNome = dataPlano.plano
        ? dataPlano.plano.nome ||
          dataPlano.plano.titulo ||
          "Plano Alimentar Individualizado"
        : "Plano Alimentar Individualizado";
      if (dataPlano.plano) {
        setNomePlano(loadedNome);
      }
      setVariacoes(loadedVariacoes);
      setSavedSnapshot(buildDietSnapshotSignature(loadedNome, loadedVariacoes));

      if (loadedVariacoes.length > 0) {
        setActiveVariacaoId((prev) => {
          if (prev && loadedVariacoes.some((v) => v.id === prev)) {
            return prev;
          }
          return loadedVariacoes[0].id;
        });
      }
    },
    []
  );

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
      aplicarDadosPlano(dataPlano);
    } catch (err: unknown) {
      console.error("Erro ao carregar dados da dieta:", err);
      setErro(
        err instanceof Error
          ? err.message
          : "Erro de conexão ao carregar dieta."
      );
    } finally {
      setCarregando(false);
    }
  }, [pacienteId, aplicarDadosPlano]);

  useEffect(() => {
    let ativo = true;

    async function inicializarDieta() {
      try {
        const resPlano = await fetch(`/api/pacientes/${pacienteId}/dieta`, {
          cache: "no-store",
        });

        if (!ativo) return;

        if (!resPlano.ok) {
          throw new Error("Não foi possível carregar o plano alimentar.");
        }

        const dataPlano = await resPlano.json();
        if (!ativo) return;

        setErro(null);
        aplicarDadosPlano(dataPlano);
      } catch (err: unknown) {
        if (!ativo) return;
        console.error("Erro ao carregar dados da dieta:", err);
        setErro(
          err instanceof Error
            ? err.message
            : "Erro de conexão ao carregar dieta."
        );
      } finally {
        if (ativo) {
          setCarregando(false);
        }
      }
    }

    void inicializarDieta();

    return () => {
      ativo = false;
    };
  }, [pacienteId, aplicarDadosPlano]);

  const variacaoAtiva = useMemo(() => {
    if (!variacoes.length) return null;
    return (
      variacoes.find((v) => v.id === activeVariacaoId) || variacoes[0]
    );
  }, [variacoes, activeVariacaoId]);

  // ==========================================================================
  // MANIPULAÇÃO DE REFEIÇÕES (nome, horário, opcional, observações, criar, excluir)
  // ==========================================================================

  const atualizarRefeicaoLocal = (
    refeicaoId: string,
    patch: Partial<RefeicaoState>
  ) => {
    if (!variacaoAtiva) return;
    const targetVarId = variacaoAtiva.id;
    setVariacoes((prev) =>
      prev.map((v) =>
        v.id !== targetVarId
          ? v
          : {
              ...v,
              refeicoes: v.refeicoes.map((r) =>
                r.id !== refeicaoId ? r : { ...r, ...patch }
              ),
            }
      )
    );
  };

  const persistirRefeicao = async (
    refeicaoId: string,
    patch: Partial<Pick<RefeicaoState, "nome" | "horario" | "opcional" | "observacoes">>
  ) => {
    try {
      await fetch(`/api/pacientes/${pacienteId}/dieta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "atualizar_refeicao",
          refeicaoId,
          ...patch,
        }),
      });
    } catch (err) {
      console.error("Erro ao atualizar refeição:", err);
    }
  };

  const handleCriarRefeicao = async (preset?: {
    nome: string;
    horario: string;
    opcional: boolean;
  }) => {
    if (!variacaoAtiva || criandoRefeicao) return;
    const nomeFinal = (preset?.nome ?? novaRefNome).trim();
    if (!nomeFinal) return;
    const horarioFinal = (preset?.horario ?? novaRefHorario).trim() || "15:00";
    const opcionalFinal = preset ? preset.opcional : novaRefOpcional;
    const targetVarId = variacaoAtiva.id;

    try {
      setCriandoRefeicao(true);
      const res = await fetch(`/api/pacientes/${pacienteId}/dieta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "criar_refeicao",
          variacaoDietaId: targetVarId,
          nome: nomeFinal,
          horario: horarioFinal,
          opcional: opcionalFinal,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.refeicao) {
          setVariacoes((prev) =>
            prev.map((v) =>
              v.id !== targetVarId
                ? v
                : { ...v, refeicoes: [...v.refeicoes, json.refeicao] }
            )
          );
          setNovaRefNome("");
          setNovaRefHorario("15:00");
          setNovaRefOpcional(false);
          setIsAddRefeicaoOpen(false);
          setMensagemSucesso(`Refeição "${json.refeicao.nome}" adicionada!`);
          setTimeout(() => setMensagemSucesso(null), 2500);
        }
      }
    } catch (err) {
      console.error("Erro ao criar refeição:", err);
    } finally {
      setCriandoRefeicao(false);
    }
  };

  const handleRemoverRefeicao = async (refeicao: RefeicaoState) => {
    if (!variacaoAtiva) return;
    if (
      refeicao.itens.length > 0 &&
      typeof window !== "undefined" &&
      !window.confirm(
        `Remover a refeição "${refeicao.nome}" e seus ${refeicao.itens.length} alimento(s)?`
      )
    ) {
      return;
    }

    const targetVarId = variacaoAtiva.id;
    setVariacoes((prev) =>
      prev.map((v) =>
        v.id !== targetVarId
          ? v
          : { ...v, refeicoes: v.refeicoes.filter((r) => r.id !== refeicao.id) }
      )
    );

    try {
      await fetch(
        `/api/pacientes/${pacienteId}/dieta?refeicaoId=${encodeURIComponent(refeicao.id)}`,
        { method: "DELETE" }
      );
    } catch (err) {
      console.error("Erro ao remover refeição:", err);
    }
  };

  // ==========================================================================
  // MANIPULAÇÃO DE ITENS (quantidade, unidade, medidaCaseira, adicionar, remover)
  // ==========================================================================

  const atualizarItemLocal = (
    refeicaoId: string,
    itemId: string,
    patch: Partial<ItemRefeicaoState>
  ) => {
    if (!variacaoAtiva) return;
    const targetVarId = variacaoAtiva.id;
    setVariacoes((prev) =>
      prev.map((v) =>
        v.id !== targetVarId
          ? v
          : {
              ...v,
              refeicoes: v.refeicoes.map((ref) =>
                ref.id !== refeicaoId
                  ? ref
                  : {
                      ...ref,
                      itens: ref.itens.map((it) =>
                        it.id !== itemId ? it : { ...it, ...patch }
                      ),
                    }
              ),
            }
      )
    );
  };

  const persistirItem = async (
    itemId: string,
    patch: {
      quantidadeGramas?: number;
      unidade?: UnidadeMedidaOption;
      medidaCaseira?: string | null;
    }
  ) => {
    if (itemId.startsWith("temp-")) return;
    try {
      await fetch(`/api/pacientes/${pacienteId}/dieta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "atualizar_item",
          itemId,
          ...patch,
        }),
      });
    } catch (err) {
      console.error("Erro ao atualizar item:", err);
    }
  };

  const handleAdicionarAlimento = async (
    refeicaoId: string,
    alimento: AlimentoOption,
    quantidadeGramas: number,
    extra?: AlimentoAddExtra
  ) => {
    if (!variacaoAtiva) return;
    const targetVariacaoId = variacaoAtiva.id;
    const tempId = `temp-${Date.now()}`;
    const unidadeFinal: UnidadeMedidaOption = extra?.unidade || "g";
    const medidaFinal = extra?.medidaCaseira ?? null;

    const novoItem: ItemRefeicaoState = {
      id: tempId,
      alimentoId: alimento.id,
      quantidadeGramas: quantidadeGramas || 100,
      unidade: unidadeFinal,
      medidaCaseira: medidaFinal,
      alimento,
      substituicoes: [],
      substituicao: null,
    };

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
          unidade: unidadeFinal,
          medidaCaseira: medidaFinal,
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
                            unidade: json.item.unidade || unidadeFinal,
                            medidaCaseira: json.item.medidaCaseira ?? medidaFinal,
                            alimento: json.item.alimento || it.alimento,
                            substituicoes: json.item.substituicoes || [],
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

  // ==========================================================================
  // SUBSTITUIÇÕES PRESCRITAS 1:N POR ITEM (SUBSTITUICOES_ITENS_REFEICAO)
  // ==========================================================================

  const handleAdicionarSubstituicaoPrescrita = async (
    refeicaoId: string,
    itemId: string,
    alimento: AlimentoOption,
    quantidade: number,
    extra?: AlimentoAddExtra
  ) => {
    if (!variacaoAtiva || itemId.startsWith("temp-")) return;
    const targetVarId = variacaoAtiva.id;
    const unidadeFinal: UnidadeMedidaOption = extra?.unidade || "g";
    const medidaFinal = extra?.medidaCaseira ?? null;

    try {
      const res = await fetch(`/api/pacientes/${pacienteId}/dieta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "adicionar_substituicao_prescrita",
          itemRefeicaoId: itemId,
          alimentoId: alimento.id,
          nomeExibicao: alimento.nome,
          quantidade: quantidade || 100,
          unidade: unidadeFinal,
          medidaCaseira: medidaFinal,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.substituicaoPrescrita) {
          setVariacoes((prev) =>
            prev.map((v) =>
              v.id !== targetVarId
                ? v
                : {
                    ...v,
                    refeicoes: v.refeicoes.map((r) =>
                      r.id !== refeicaoId
                        ? r
                        : {
                            ...r,
                            itens: r.itens.map((it) =>
                              it.id !== itemId
                                ? it
                                : {
                                    ...it,
                                    substituicoes: [
                                      ...(it.substituicoes || []),
                                      json.substituicaoPrescrita,
                                    ],
                                  }
                            ),
                          }
                    ),
                  }
            )
          );
          setOpenSwapItemId(null);
        }
      }
    } catch (err) {
      console.error("Erro ao adicionar substituição prescrita:", err);
    }
  };

  const atualizarSubPrescritaLocal = (
    refeicaoId: string,
    itemId: string,
    subId: string,
    patch: Partial<SubstituicaoPrescritaState>
  ) => {
    if (!variacaoAtiva) return;
    const targetVarId = variacaoAtiva.id;
    setVariacoes((prev) =>
      prev.map((v) =>
        v.id !== targetVarId
          ? v
          : {
              ...v,
              refeicoes: v.refeicoes.map((r) =>
                r.id !== refeicaoId
                  ? r
                  : {
                      ...r,
                      itens: r.itens.map((it) =>
                        it.id !== itemId
                          ? it
                          : {
                              ...it,
                              substituicoes: (it.substituicoes || []).map((s) =>
                                s.id !== subId ? s : { ...s, ...patch }
                              ),
                            }
                      ),
                    }
              ),
            }
      )
    );
  };

  const persistirSubPrescrita = async (
    subId: string,
    patch: {
      quantidade?: number;
      unidade?: UnidadeMedidaOption;
      medidaCaseira?: string | null;
    }
  ) => {
    try {
      await fetch(`/api/pacientes/${pacienteId}/dieta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "atualizar_substituicao_prescrita",
          substituicaoPrescritaId: subId,
          ...patch,
        }),
      });
    } catch (err) {
      console.error("Erro ao atualizar substituição prescrita:", err);
    }
  };

  const handleRemoverSubPrescrita = async (
    refeicaoId: string,
    itemId: string,
    subId: string
  ) => {
    if (!variacaoAtiva) return;
    const targetVarId = variacaoAtiva.id;

    setVariacoes((prev) =>
      prev.map((v) =>
        v.id !== targetVarId
          ? v
          : {
              ...v,
              refeicoes: v.refeicoes.map((r) =>
                r.id !== refeicaoId
                  ? r
                  : {
                      ...r,
                      itens: r.itens.map((it) =>
                        it.id !== itemId
                          ? it
                          : {
                              ...it,
                              substituicoes: (it.substituicoes || []).filter(
                                (s) => s.id !== subId
                              ),
                            }
                      ),
                    }
              ),
            }
      )
    );

    try {
      await fetch(
        `/api/pacientes/${pacienteId}/dieta?substituicaoPrescritaId=${encodeURIComponent(subId)}`,
        { method: "DELETE" }
      );
    } catch (err) {
      console.error("Erro ao remover substituição prescrita:", err);
    }
  };

  // Reverter substituição legada do paciente (DIET_SUBSTITUTIONS)
  const handleRemoverSubstituicaoPaciente = async (
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

  // 2.5 Atualizar título da variação
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

  // 2.6 Excluir variação de dieta
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

  // 3. Salvar todas as alterações pendentes
  const handleSalvarPlano = async () => {
    if (!plano || !variacaoAtiva) return;
    try {
      setSalvando(true);
      setErro(null);

      const nomePlanoLimpo =
        nomePlano.trim() || "Plano Alimentar Individualizado";

      const activeIds = new Set(variacoes.map((v) => v.id));
      const pendingRenames = Object.entries(pendingRenamesRef.current).filter(([id]) =>
        activeIds.has(id)
      );

      const updates: Array<Promise<Response>> = [];

      updates.push(
        fetch(`/api/pacientes/${pacienteId}/dieta`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            acao: "atualizar_plano",
            planoId: plano.id,
            nome: nomePlanoLimpo,
            titulo: nomePlanoLimpo,
          }),
        })
      );

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
        updates.push(
          fetch(`/api/pacientes/${pacienteId}/dieta`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              acao: "atualizar_refeicao",
              refeicaoId: ref.id,
              nome: ref.nome,
              horario: ref.horario ?? null,
              opcional: Boolean(ref.opcional),
              observacoes: ref.observacoes ?? null,
            }),
          })
        );

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
                  unidade: item.unidade || "g",
                  medidaCaseira: item.medidaCaseira ?? null,
                }),
              })
            );

            for (const sub of item.substituicoes || []) {
              updates.push(
                fetch(`/api/pacientes/${pacienteId}/dieta`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    acao: "atualizar_substituicao_prescrita",
                    substituicaoPrescritaId: sub.id,
                    quantidade: sub.quantidade,
                    unidade: sub.unidade || "g",
                    medidaCaseira: sub.medidaCaseira ?? null,
                  }),
                })
              );
            }
          }
        }
      }

      const responses = await Promise.all(updates);
      const failed = responses.find((r) => !r.ok);
      if (failed) {
        const errData = await failed.json().catch(() => ({}));
        throw new Error(errData?.error || "Falha ao salvar alterações.");
      }

      setNomePlano(nomePlanoLimpo);
      setPlano((prev) =>
        prev ? { ...prev, nome: nomePlanoLimpo, titulo: nomePlanoLimpo } : prev
      );

      for (const [variacaoId] of pendingRenames) {
        delete pendingRenamesRef.current[variacaoId];
      }

      setSavedSnapshot(buildDietSnapshotSignature(nomePlanoLimpo, variacoes));
      setMensagemSucesso("Plano, refeições, medidas e trocas salvos com sucesso!");
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
  // MOTOR DE CÁLCULO REATIVO (preservado 100% intacto)
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
        accRef.carboidratos = Number(
          (accRef.carboidratos + totaisRef.carboidratos).toFixed(1)
        );
        accRef.gorduras = Number((accRef.gorduras + totaisRef.gorduras).toFixed(1));
        return accRef;
      },
      { calorias: 0, proteinas: 0, carboidratos: 0, gorduras: 0 }
    );
  }, [variacaoAtiva]);

  const currentSnapshot = useMemo(
    () => buildDietSnapshotSignature(nomePlano, variacoes),
    [nomePlano, variacoes]
  );
  const hasUnsavedChanges =
    Boolean(savedSnapshot) && currentSnapshot !== savedSnapshot;

  const variacoesComAlimentos = useMemo(
    () =>
      variacoes.filter((v) =>
        v.refeicoes.some((r) => r.itens.length > 0)
      ),
    [variacoes]
  );

  const whatsappUrl = useMemo(
    () =>
      buildWhatsAppPlanoUrl(
        pacienteTelefone,
        pacienteNome,
        doctorProfile.clinicaNome
      ),
    [pacienteTelefone, pacienteNome, doctorProfile.clinicaNome]
  );

  const handleAbrirExportPdfModal = () => {
    setPdfErro(null);
    setPdfEscopoVariacoes(variacoesComAlimentos.length > 1 ? "todas" : "atual");
    setPdfIncluirMacros(false);
    setIsExportPdfModalOpen(true);
  };

  const handleBaixarPlanoPdf = async () => {
    const selecionadas =
      pdfEscopoVariacoes === "todas"
        ? variacoesComAlimentos.length > 0
          ? variacoesComAlimentos
          : variacaoAtiva
            ? [variacaoAtiva]
            : []
        : variacaoAtiva
          ? [variacaoAtiva]
          : [];

    if (selecionadas.length === 0) {
      setPdfErro("Nenhuma variação de cardápio disponível para exportar.");
      return;
    }

    try {
      setExportandoPdf(true);
      setPdfErro(null);

      const variacoesPdf: DietPlanPdfVariacao[] = selecionadas.map((v) => {
        const refeicoesPdf = v.refeicoes.map((ref) => {
          let refKcal = 0;
          let refProt = 0;
          let refCarb = 0;
          let refGord = 0;

          const itensPdf = ref.itens.map((item) => {
            const nut = calcularNutrientesItem(
              item.alimento,
              item.quantidadeGramas
            );
            refKcal += nut.calorias;
            refProt += nut.proteinas;
            refCarb += nut.carboidratos;
            refGord += nut.gorduras;

            return {
              nome: item.alimento?.nome || "Alimento",
              quantidade: item.quantidadeGramas,
              unidade: item.unidade || "g",
              medidaCaseira: item.medidaCaseira ?? null,
              calorias: nut.calorias,
              proteinas: nut.proteinas,
              carboidratos: nut.carboidratos,
              gorduras: nut.gorduras,
              substituicoes: (item.substituicoes || []).map((sub) => ({
                nome: sub.nomeExibicao,
                quantidade: sub.quantidade,
                unidade: sub.unidade || "g",
                medidaCaseira: sub.medidaCaseira ?? null,
              })),
            };
          });

          return {
            nome: ref.nome,
            horario: ref.horario ?? null,
            opcional: Boolean(ref.opcional),
            observacoes: ref.observacoes ?? null,
            itens: itensPdf,
            totais: {
              calorias: Math.round(refKcal),
              proteinas: Number(refProt.toFixed(1)),
              carboidratos: Number(refCarb.toFixed(1)),
              gorduras: Number(refGord.toFixed(1)),
            },
          };
        });

        const totaisVar = refeicoesPdf.reduce(
          (acc, ref) => ({
            calorias: acc.calorias + ref.totais.calorias,
            proteinas: Number((acc.proteinas + ref.totais.proteinas).toFixed(1)),
            carboidratos: Number(
              (acc.carboidratos + ref.totais.carboidratos).toFixed(1)
            ),
            gorduras: Number((acc.gorduras + ref.totais.gorduras).toFixed(1)),
          }),
          { calorias: 0, proteinas: 0, carboidratos: 0, gorduras: 0 }
        );

        return {
          nome: v.nome,
          descricao: v.descricao ?? null,
          refeicoes: refeicoesPdf,
          totais: totaisVar,
        };
      });

      const agora = new Date();
      const fileName = formatarNomeArquivoPlanoAlimentar(pacienteNome, agora);
      const pdfProps: DietPlanPDFProps = {
        nomePlano: nomePlano.trim() || "Plano Alimentar Individualizado",
        pacienteNome: pacienteNome.trim() || "Paciente",
        pacienteRecordCode: pacienteRecordCode ?? null,
        objetivoTratamento:
          pacienteObjetivo?.trim() || plano?.objetivo?.trim() || null,
        dataEmissao: formatarDataBR(agora),
        localCidade: doctorProfile.localCidade,
        medicoNome: doctorProfile.medicoNome,
        crm: doctorProfile.crm,
        especialidades: doctorProfile.especialidades,
        clinicaNome: doctorProfile.clinicaNome,
        clinicaSubtitulo: doctorProfile.clinicaSubtitulo,
        clinicaContato: doctorProfile.clinicaContato,
        logoSrc: getClinicaLogoUrl(),
        incluirMacros: pdfIncluirMacros,
        variacoes: variacoesPdf,
      };

      const { downloadDietPlanPdf } = await import(
        "@/components/DietPlanPdfExporter"
      );
      await downloadDietPlanPdf(pdfProps, fileName);

      setIsExportPdfModalOpen(false);
      setMensagemSucesso(`PDF "${fileName}" baixado com sucesso!`);
      setTimeout(() => setMensagemSucesso(null), 3500);
    } catch (err: unknown) {
      console.error("[DietaTab] Erro ao exportar plano alimentar em PDF:", err);
      setPdfErro(
        err instanceof Error
          ? err.message
          : "Não foi possível gerar o PDF do plano alimentar."
      );
    } finally {
      setExportandoPdf(false);
    }
  };

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
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex items-center group">
                <input
                  type="text"
                  value={nomePlano}
                  onChange={(e) => {
                    const novoNome = e.target.value;
                    setNomePlano(novoNome);
                    setPlano((prev) =>
                      prev ? { ...prev, nome: novoNome, titulo: novoNome } : prev
                    );
                  }}
                  placeholder="Nome do Plano Alimentar..."
                  title="Clique para editar o nome do plano alimentar"
                  aria-label="Nome do Plano Alimentar"
                  className="text-sm font-bold text-slate-800 bg-transparent border border-transparent hover:border-slate-200 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/15 rounded-lg px-2 py-0.5 -ml-2 pr-6 outline-none transition-all min-w-[260px] sm:min-w-[340px]"
                />
                <Edit3 className="w-3.5 h-3.5 text-slate-400 opacity-60 group-hover:opacity-100 group-focus-within:text-teal-600 transition-opacity pointer-events-none -ml-5 mr-1.5" />
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Tabela TACO (UNICAMP)
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Prescrição nutricional de{" "}
              <span className="font-semibold text-slate-600">{pacienteNome}</span>
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
            onClick={handleAbrirExportPdfModal}
            disabled={!variacaoAtiva}
            className="cl-btn-secondary inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            <FileDown className="w-3.5 h-3.5 text-teal-700" />
            <span>Exportar PDF</span>
          </button>

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
      {/* NAVEGAÇÃO HORIZONTAL DE VARIAÇÕES (TABS CRUD) */}
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
              {/* CABEÇALHO FLEXÍVEL DA REFEIÇÃO COM SUBTOTAL */}
              <div className="px-4 sm:px-5 py-2.5 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 rounded-t-2xl">
                <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[220px]">
                  <div className="p-1.5 rounded-lg bg-white border border-slate-200 shadow-2xs shrink-0">
                    {getRefeicaoIcon(refeicao.nome)}
                  </div>

                  {/* Nome editável da refeição */}
                  <input
                    type="text"
                    value={refeicao.nome}
                    onChange={(e) =>
                      atualizarRefeicaoLocal(refeicao.id, {
                        nome: e.target.value,
                      })
                    }
                    onBlur={(e) => {
                      const trimmed = e.target.value.trim();
                      if (trimmed) {
                        persistirRefeicao(refeicao.id, { nome: trimmed });
                      }
                    }}
                    aria-label="Nome da refeição"
                    className="text-xs font-bold text-slate-800 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-teal-500 rounded-md px-1.5 py-0.5 outline-none transition-all min-w-[140px] max-w-[230px]"
                  />

                  {/* Horário livre editável */}
                  <div className="inline-flex items-center gap-1 bg-white/80 hover:bg-white border border-slate-200/80 focus-within:border-teal-500 rounded-md px-1.5 py-0.5">
                    <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      value={refeicao.horario || ""}
                      onChange={(e) =>
                        atualizarRefeicaoLocal(refeicao.id, {
                          horario: e.target.value.slice(0, 10),
                        })
                      }
                      onBlur={(e) =>
                        persistirRefeicao(refeicao.id, {
                          horario: e.target.value.trim() || null,
                        })
                      }
                      placeholder="07:30"
                      aria-label="Horário da refeição"
                      className="w-12 font-mono text-[11px] font-semibold text-slate-600 bg-transparent outline-none"
                    />
                  </div>

                  {/* Toggle discreto Opcional */}
                  <button
                    type="button"
                    onClick={() => {
                      const nextOpcional = !refeicao.opcional;
                      atualizarRefeicaoLocal(refeicao.id, {
                        opcional: nextOpcional,
                      });
                      persistirRefeicao(refeicao.id, { opcional: nextOpcional });
                    }}
                    title="Marcar ou desmarcar esta refeição como opcional"
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors cursor-pointer ${
                      refeicao.opcional
                        ? "bg-purple-50 text-purple-700 border-purple-200"
                        : "bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {refeicao.opcional ? "Opcional" : "Obrigatória"}
                  </button>
                </div>

                {/* Subtotais da Refeição + Remover Refeição */}
                <div className="flex items-center gap-2.5">
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

                  <button
                    type="button"
                    onClick={() => handleRemoverRefeicao(refeicao)}
                    title="Remover refeição desta variação"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* LISTA DE ALIMENTOS DA REFEIÇÃO */}
              <div className="p-4 space-y-2.5">
                {refeicao.itens.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2 text-center">
                    Nenhum alimento cadastrado nesta refeição ainda.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {refeicao.itens.map((item) => {
                      const patientSub = item.substituicao || null;
                      const hasPatientSub = Boolean(patientSub);
                      const prescribedSubs = item.substituicoes || [];
                      const isAddingSwap = openSwapItemId === item.id;
                      const itemUnidade: UnidadeMedidaOption = item.unidade || "g";

                      const nutItem = calcularNutrientesItem(
                        item.alimento,
                        item.quantidadeGramas
                      );
                      const calItem = nutItem.calorias;
                      const protItem = nutItem.proteinas.toFixed(1);
                      const carbItem = nutItem.carboidratos.toFixed(1);
                      const gordItem = nutItem.gorduras.toFixed(1);
                      const baseNut = getAlimentoBaseNutrientes(item.alimento);

                      return (
                        <div key={item.id} className="py-2.5 space-y-2 transition-all">
                          {/* LINHA DO ALIMENTO ORIGINAL / PRESCRITO */}
                          <div
                            className={`flex flex-wrap items-center justify-between gap-2.5 group transition-opacity ${
                              hasPatientSub ? "line-through text-slate-400 opacity-60" : ""
                            }`}
                          >
                            {/* Miniatura, Nome e Categoria */}
                            <div className="flex items-center gap-3 flex-1 min-w-[190px]">
                              <FoodThumbnail
                                nome={item.alimento.nome}
                                categoria={item.alimento.categoria}
                                imageUrl={
                                  item.alimento.thumbnailUrl ||
                                  item.alimento.imageUrl ||
                                  item.alimento.fotoUrl
                                }
                                className={`w-10 h-10 shrink-0 ${
                                  hasPatientSub ? "grayscale opacity-75" : ""
                                }`}
                              />
                              <div className="min-w-0">
                                <span
                                  className={`text-xs font-bold block truncate ${
                                    hasPatientSub
                                      ? "line-through text-slate-400 opacity-60"
                                      : "text-slate-800"
                                  }`}
                                >
                                  {item.alimento.nome}
                                </span>
                                <span
                                  className={`text-[10px] block truncate ${
                                    hasPatientSub
                                      ? "line-through text-slate-400 opacity-60"
                                      : "text-slate-400"
                                  }`}
                                >
                                  {baseNut.kcal} kcal / {baseNut.porcaoBase}g
                                  {item.alimento.categoria && ` • ${item.alimento.categoria}`}
                                </span>
                              </div>
                            </div>

                            {/* Quantidade + Unidade (g/ml/un) + Medida Caseira */}
                            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                              <input
                                type="number"
                                min={0}
                                step={itemUnidade === "un" ? 1 : 5}
                                disabled={hasPatientSub}
                                value={item.quantidadeGramas}
                                onChange={(e) =>
                                  atualizarItemLocal(refeicao.id, item.id, {
                                    quantidadeGramas: Math.max(
                                      0,
                                      Number(e.target.value) || 0
                                    ),
                                  })
                                }
                                onBlur={(e) =>
                                  persistirItem(item.id, {
                                    quantidadeGramas: Math.max(
                                      0,
                                      Number(e.target.value) || 0
                                    ),
                                  })
                                }
                                aria-label="Quantidade"
                                className={`w-16 px-2 py-1 border rounded-lg text-xs font-mono font-bold outline-none text-right transition-colors ${
                                  hasPatientSub
                                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                    : "bg-slate-50 focus:bg-white border-slate-200 focus:border-teal-500 text-slate-800"
                                }`}
                              />

                              <select
                                value={itemUnidade}
                                disabled={hasPatientSub}
                                onChange={(e) => {
                                  const nextUn = e.target.value as UnidadeMedidaOption;
                                  atualizarItemLocal(refeicao.id, item.id, {
                                    unidade: nextUn,
                                  });
                                  persistirItem(item.id, { unidade: nextUn });
                                }}
                                aria-label="Unidade"
                                className="px-1.5 py-1 bg-slate-50 focus:bg-white border border-slate-200 focus:border-teal-500 rounded-lg text-[11px] font-mono font-bold text-slate-700 outline-none cursor-pointer disabled:opacity-50"
                              >
                                <option value="g">g</option>
                                <option value="ml">ml</option>
                                <option value="un">un</option>
                              </select>

                              <input
                                type="text"
                                value={item.medidaCaseira || ""}
                                disabled={hasPatientSub}
                                onChange={(e) =>
                                  atualizarItemLocal(refeicao.id, item.id, {
                                    medidaCaseira: e.target.value.slice(0, 120),
                                  })
                                }
                                onBlur={(e) =>
                                  persistirItem(item.id, {
                                    medidaCaseira: e.target.value.trim() || null,
                                  })
                                }
                                placeholder="Medida caseira..."
                                aria-label="Medida caseira"
                                className="w-36 px-2 py-1 bg-slate-50 focus:bg-white border border-slate-200 focus:border-teal-500 rounded-lg text-[11px] text-slate-700 placeholder:text-slate-400 outline-none transition-colors disabled:opacity-50"
                              />
                            </div>

                            {/* Macros Calculados Instantaneamente + Botões (+ Troca / Remover) */}
                            <div className="flex items-center gap-2 shrink-0">
                              <div
                                className={`text-[11px] font-mono font-semibold hidden xl:flex items-center gap-1.5 ${
                                  hasPatientSub
                                    ? "line-through text-slate-400 opacity-60"
                                    : "text-slate-500"
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
                                  hasPatientSub
                                    ? "bg-slate-100 text-slate-400 border-slate-200 line-through opacity-60"
                                    : "text-amber-800 bg-amber-50/70 border-amber-200/50"
                                }`}
                              >
                                <Flame className="w-3 h-3 text-amber-500" />
                                {calItem} kcal
                              </span>

                              {/* Botão discreto + Troca (1:N prescrita pela médica) */}
                              <button
                                type="button"
                                disabled={item.id.startsWith("temp-")}
                                onClick={() =>
                                  setOpenSwapItemId((prev) =>
                                    prev === item.id ? null : item.id
                                  )
                                }
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer disabled:opacity-40 ${
                                  isAddingSwap
                                    ? "bg-teal-700 text-white border-teal-700"
                                    : "bg-teal-50/80 text-teal-800 border-teal-200 hover:bg-teal-100"
                                }`}
                                title="Adicionar opção de troca prescrita para este alimento"
                              >
                                <ArrowLeftRight className="w-3 h-3" />
                                <span>+ Troca</span>
                              </button>

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

                          {/* OPÇÕES DE TROCA PRESCRITAS (1:N) PELA MÉDICA */}
                          {(prescribedSubs.length > 0 || isAddingSwap) && (
                            <div className="ml-4 sm:ml-8 pl-3 border-l-2 border-teal-300/80 space-y-1.5">
                              {prescribedSubs.map((sub, subIdx) => (
                                <div
                                  key={sub.id}
                                  className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-teal-50/50 border border-teal-200/70"
                                >
                                  <div className="flex items-center gap-2 min-w-[160px] flex-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-white px-1.5 py-0.5 rounded border border-teal-200 shrink-0">
                                      ou {subIdx + 1}
                                    </span>
                                    <FoodThumbnail
                                      nome={sub.nomeExibicao}
                                      categoria={sub.categoria}
                                      imageUrl={sub.thumbnailUrl}
                                      className="w-7 h-7 rounded-md shrink-0"
                                    />
                                    <span className="text-xs font-semibold text-slate-800 truncate">
                                      {sub.nomeExibicao}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                                    <input
                                      type="number"
                                      min={0}
                                      step={sub.unidade === "un" ? 1 : 5}
                                      value={sub.quantidade}
                                      onChange={(e) =>
                                        atualizarSubPrescritaLocal(
                                          refeicao.id,
                                          item.id,
                                          sub.id,
                                          {
                                            quantidade: Math.max(
                                              0,
                                              Number(e.target.value) || 0
                                            ),
                                          }
                                        )
                                      }
                                      onBlur={(e) =>
                                        persistirSubPrescrita(sub.id, {
                                          quantidade: Math.max(
                                            0,
                                            Number(e.target.value) || 0
                                          ),
                                        })
                                      }
                                      className="w-14 px-1.5 py-0.5 bg-white border border-teal-200 focus:border-teal-500 rounded-md text-[11px] font-mono font-bold text-slate-800 text-right outline-none"
                                    />

                                    <select
                                      value={sub.unidade || "g"}
                                      onChange={(e) => {
                                        const nextUn = e.target
                                          .value as UnidadeMedidaOption;
                                        atualizarSubPrescritaLocal(
                                          refeicao.id,
                                          item.id,
                                          sub.id,
                                          { unidade: nextUn }
                                        );
                                        persistirSubPrescrita(sub.id, {
                                          unidade: nextUn,
                                        });
                                      }}
                                      className="px-1 py-0.5 bg-white border border-teal-200 focus:border-teal-500 rounded-md text-[11px] font-mono font-bold text-slate-700 outline-none cursor-pointer"
                                    >
                                      <option value="g">g</option>
                                      <option value="ml">ml</option>
                                      <option value="un">un</option>
                                    </select>

                                    <input
                                      type="text"
                                      value={sub.medidaCaseira || ""}
                                      onChange={(e) =>
                                        atualizarSubPrescritaLocal(
                                          refeicao.id,
                                          item.id,
                                          sub.id,
                                          {
                                            medidaCaseira: e.target.value.slice(
                                              0,
                                              120
                                            ),
                                          }
                                        )
                                      }
                                      onBlur={(e) =>
                                        persistirSubPrescrita(sub.id, {
                                          medidaCaseira:
                                            e.target.value.trim() || null,
                                        })
                                      }
                                      placeholder="Medida caseira..."
                                      className="w-32 px-2 py-0.5 bg-white border border-teal-200 focus:border-teal-500 rounded-md text-[11px] text-slate-700 placeholder:text-slate-400 outline-none"
                                    />

                                    {sub.caloriasPorcao != null && (
                                      <span className="text-[10px] font-mono font-bold text-teal-800 bg-white px-1.5 py-0.5 rounded border border-teal-200/80">
                                        {sub.caloriasPorcao} kcal
                                      </span>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleRemoverSubPrescrita(
                                          refeicao.id,
                                          item.id,
                                          sub.id
                                        )
                                      }
                                      title="Remover opção de troca"
                                      className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}

                              {isAddingSwap && (
                                <div className="p-2.5 rounded-xl bg-slate-50 border border-dashed border-teal-300">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800">
                                      Nova opção de troca para {item.alimento.nome}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setOpenSwapItemId(null)}
                                      className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 cursor-pointer"
                                    >
                                      Fechar
                                    </button>
                                  </div>
                                  <AlimentoCombobox
                                    compact
                                    showUnitAndMeasure
                                    placeholder="Buscar alimento substituto (ex: tapioca, pão, whey)..."
                                    buttonLabel="Salvar troca"
                                    onAddAlimento={(alimento, qtd, extra) =>
                                      handleAdicionarSubstituicaoPrescrita(
                                        refeicao.id,
                                        item.id,
                                        alimento,
                                        qtd,
                                        extra
                                      )
                                    }
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          {/* SUBSTITUIÇÃO LEGADA ESCOLHIDA PELO PACIENTE (DIET_SUBSTITUTIONS) */}
                          {hasPatientSub && patientSub && (
                            <div className="ml-3 sm:ml-6 pl-3 border-l-2 border-emerald-400">
                              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex flex-wrap items-center justify-between gap-3 shadow-xs animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
                                  <FoodThumbnail
                                    nome={patientSub.substituteFoodName}
                                    imageUrl={
                                      patientSub.substituteThumbnailUrl ||
                                      patientSub.substituteFood?.thumbnailUrl
                                    }
                                    className="w-9 h-9 shrink-0 ring-1 ring-emerald-300 shadow-2xs"
                                  />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-bold text-emerald-950 block truncate">
                                        {patientSub.substituteFoodName}
                                      </span>
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                        <RefreshCw className="w-2.5 h-2.5 text-emerald-600" />
                                        Substituído pelo Paciente
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-emerald-700/80 block mt-0.5">
                                      Consumo registrado:{" "}
                                      <strong>{patientSub.quantityGrams}g</strong>
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                  {(patientSub.proteins != null ||
                                    patientSub.carbohydrates != null) && (
                                    <div className="text-[11px] font-mono font-medium text-emerald-700 hidden sm:flex items-center gap-1.5">
                                      <span>P: {patientSub.proteins ?? 0}g</span>
                                      <span className="text-emerald-300">•</span>
                                      <span>C: {patientSub.carbohydrates ?? 0}g</span>
                                      <span className="text-emerald-300">•</span>
                                      <span>G: {patientSub.fats ?? 0}g</span>
                                    </div>
                                  )}

                                  <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-emerald-900 bg-white/90 px-2.5 py-0.5 rounded-lg border border-emerald-300 shadow-2xs min-w-[70px] justify-end">
                                    <Flame className="w-3 h-3 text-emerald-600" />
                                    {patientSub.calories} kcal
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoverSubstituicaoPaciente(
                                        refeicao.id,
                                        item.id,
                                        patientSub.id
                                      )
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

                {/* LINHA COMPACTA DE BUSCA E ADIÇÃO COM UNIDADE + MEDIDA CASEIRA */}
                <AlimentoCombobox
                  showUnitAndMeasure
                  onAddAlimento={(alimento, gramas, extra) =>
                    handleAdicionarAlimento(refeicao.id, alimento, gramas, extra)
                  }
                />

                {/* OBSERVAÇÕES DE PREPARO DA REFEIÇÃO */}
                <div className="pt-2 border-t border-slate-100/80 flex items-center gap-2">
                  <MessageSquareText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={refeicao.observacoes || ""}
                    onChange={(e) =>
                      atualizarRefeicaoLocal(refeicao.id, {
                        observacoes: e.target.value,
                      })
                    }
                    onBlur={(e) =>
                      persistirRefeicao(refeicao.id, {
                        observacoes: e.target.value.trim() || null,
                      })
                    }
                    placeholder="Observações de preparo (ex: se optar pela tapioca, faça crepioca acrescentando 1 ovo)..."
                    aria-label="Observações de preparo da refeição"
                    className="w-full text-[11px] text-slate-600 placeholder:text-slate-400 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-200 focus:border-teal-500 rounded-lg px-2 py-1 outline-none transition-all"
                  />
                </div>
              </div>
            </div>
          );
        })}

        {/* BOTÃO / PAINEL COMPACTO PARA ADICIONAR NOVA REFEIÇÃO NA VARIAÇÃO */}
        {variacaoAtiva && (
          <div className="bg-white/80 rounded-2xl border border-dashed border-slate-300 p-3.5">
            {!isAddRefeicaoOpen ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddRefeicaoOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Refeição</span>
                </button>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-semibold text-slate-400">
                    Atalhos:
                  </span>
                  {PRESETS_NOVA_REFEICAO.map((preset) => (
                    <button
                      key={preset.nome}
                      type="button"
                      disabled={criandoRefeicao}
                      onClick={() => handleCriarRefeicao(preset)}
                      className="px-2 py-1 rounded-lg text-[10px] font-semibold text-slate-600 bg-slate-100 hover:bg-teal-50 hover:text-teal-800 border border-slate-200 hover:border-teal-200 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      + {preset.horario} {preset.nome}
                      {preset.opcional ? " (Opcional)" : ""}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  value={novaRefNome}
                  onChange={(e) => setNovaRefNome(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && novaRefNome.trim()) {
                      e.preventDefault();
                      handleCriarRefeicao();
                    }
                  }}
                  placeholder="Nome da refeição (ex: Água + Suplemento, Sobremesa, Ceia)"
                  className="flex-1 min-w-[220px] px-3 py-1.5 text-xs bg-white border border-slate-200 focus:border-teal-500 rounded-lg outline-none text-slate-800"
                />
                <input
                  type="text"
                  value={novaRefHorario}
                  onChange={(e) => setNovaRefHorario(e.target.value.slice(0, 10))}
                  placeholder="15:00"
                  className="w-20 px-2.5 py-1.5 text-xs font-mono font-bold bg-white border border-slate-200 focus:border-teal-500 rounded-lg outline-none text-slate-700"
                />
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 px-2 py-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={novaRefOpcional}
                    onChange={(e) => setNovaRefOpcional(e.target.checked)}
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>Opcional</span>
                </label>
                <button
                  type="button"
                  disabled={!novaRefNome.trim() || criandoRefeicao}
                  onClick={() => handleCriarRefeicao()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white cursor-pointer disabled:opacity-50"
                >
                  {criandoRefeicao ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>Criar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddRefeicaoOpen(false)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )}
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
      {/* MODAL DE EXPORTAÇÃO DO PLANO ALIMENTAR EM PDF (CLINICAL LIGHT) */}
      {/* ======================================================== */}
      {isExportPdfModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="cl-card bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="cl-modal-header px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
                  <FileDown className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Exportar Plano Alimentar (PDF)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Padrão oficial {doctorProfile.clinicaNome} • Vetorial A4
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExportPdfModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Fechar modal de exportação"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Variações a incluir */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                  Variações a incluir no documento
                </span>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => setPdfEscopoVariacoes("atual")}
                    className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      pdfEscopoVariacoes === "atual"
                        ? "bg-teal-50/70 border-teal-600 ring-1 ring-teal-600/20"
                        : "bg-slate-50/60 border-slate-200 hover:bg-slate-100/70"
                    }`}
                  >
                    <div className="min-w-0">
                      <span
                        className={`text-xs font-bold block truncate ${
                          pdfEscopoVariacoes === "atual"
                            ? "text-teal-950"
                            : "text-slate-800"
                        }`}
                      >
                        Apenas variação atual ({variacaoAtiva?.nome || "Opção 1"})
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Exporta somente o cardápio selecionado agora na tela
                      </span>
                    </div>
                    <span
                      className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                        pdfEscopoVariacoes === "atual"
                          ? "border-teal-600"
                          : "border-slate-300"
                      }`}
                    >
                      {pdfEscopoVariacoes === "atual" && (
                        <span className="w-2 h-2 rounded-full bg-teal-600" />
                      )}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={variacoesComAlimentos.length === 0}
                    onClick={() => setPdfEscopoVariacoes("todas")}
                    className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      pdfEscopoVariacoes === "todas"
                        ? "bg-teal-50/70 border-teal-600 ring-1 ring-teal-600/20"
                        : "bg-slate-50/60 border-slate-200 hover:bg-slate-100/70"
                    }`}
                  >
                    <div className="min-w-0">
                      <span
                        className={`text-xs font-bold block truncate ${
                          pdfEscopoVariacoes === "todas"
                            ? "text-teal-950"
                            : "text-slate-800"
                        }`}
                      >
                        Todas as variações com alimentos (
                        {variacoesComAlimentos.length})
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Inclui cada opção de cardápio preenchida com separador
                      </span>
                    </div>
                    <span
                      className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                        pdfEscopoVariacoes === "todas"
                          ? "border-teal-600"
                          : "border-slate-300"
                      }`}
                    >
                      {pdfEscopoVariacoes === "todas" && (
                        <span className="w-2 h-2 rounded-full bg-teal-600" />
                      )}
                    </span>
                  </button>
                </div>
              </div>

              {/* Checkbox calorias/macros */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={pdfIncluirMacros}
                  onChange={(e) => setPdfIncluirMacros(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Exibir calorias e macronutrientes no PDF
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    Opcional. Desmarcado gera um documento mais leve e focado em
                    medidas caseiras para o paciente.
                  </span>
                </div>
              </label>

              {/* Aviso discreto sobre o estado atual da tela */}
              <div
                className={`flex items-start gap-2 px-3 py-2 rounded-xl text-[11px] border ${
                  hasUnsavedChanges
                    ? "bg-amber-50 border-amber-200 text-amber-800"
                    : "bg-slate-50 border-slate-200/70 text-slate-500"
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  {hasUnsavedChanges
                    ? "Há alterações não salvas na tela — o PDF usará exatamente o cardápio exibido agora."
                    : "O PDF usará o cardápio exibido agora na tela, incluindo medidas caseiras, substituições e orientações de preparo."}
                </span>
              </div>

              {pdfErro && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{pdfErro}</span>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              {whatsappUrl ? (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cl-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Abrir WhatsApp do Paciente</span>
                </a>
              ) : (
                <span className="text-[11px] text-slate-400">
                  Arquivo: {formatarNomeArquivoPlanoAlimentar(pacienteNome)}
                </span>
              )}

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setIsExportPdfModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-200/60 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={exportandoPdf}
                  onClick={handleBaixarPlanoPdf}
                  className="cl-btn-primary inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {exportandoPdf ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileDown className="w-3.5 h-3.5" />
                  )}
                  <span>{exportandoPdf ? "Gerando PDF..." : "Baixar PDF"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL PARA ADICIONAR NOVA VARIAÇÃO DE DIETA */}
      {/* ======================================================== */}
      {isNovaVariacaoModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="cl-modal-header px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Nova Variação de Cardápio
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNovaVariacaoModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nome da Variação (ex: Opção 3, Dia de Treino, Fim de Semana) *
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
                  <option value="">
                    Refeições em branco (Desjejum, Almoço, Lanche, Jantar)
                  </option>
                  {variacoes.map((v) => (
                    <option key={v.id} value={v.id}>
                      Clonar alimentos da &quot;{v.nome}&quot;
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsNovaVariacaoModalOpen(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-200/60 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!nomeNovaVariacao.trim() || criandoVariacao}
                onClick={handleCriarNovaVariacao}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white shadow-2xs disabled:opacity-50 cursor-pointer"
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
