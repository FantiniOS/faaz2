import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import api from "../services/api";
import { usePatientAuth } from "./PatientAuthContext";

export interface ItemAlimentoDiario {
  id: string;
  nome: string;
  categoria?: string | null;
  thumbnailUrl?: string | null;
  quantidadeGramas: number;
  calorias: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  isExtra?: boolean;
  substituicao?: {
    id: string;
    substituteFoodName: string;
    substituteThumbnailUrl?: string | null;
    quantityGrams: number;
    calories: number;
    proteins?: number | null;
    carbohydrates?: number | null;
    fats?: number | null;
  } | null;
}

export interface RefeicaoDiario {
  id: string;
  nome: string;
  horario: string;
  ordem: number;
  consumido: boolean;
  itensPrescritos: ItemAlimentoDiario[];
  itensExtras: ItemAlimentoDiario[];
  caloriasPrescritas: number;
  caloriasExtras: number;
  caloriasTotal: number;
}

export interface DiarioAlimentarContextData {
  caloriasMeta: number;
  caloriasConsumidas: number;
  caloriasRestantes: number;
  percentualConsumido: number;
  variacaoAtivaId: string | null;
  selecionarVariacao: (variacaoId: string) => void;
  refeicoes: RefeicaoDiario[];
  carregando: boolean;
  toggleCheckinRefeicao: (refeicaoId: string) => void;
  adicionarAlimentoExtra: (
    refeicaoId: string,
    alimento: {
      id?: string;
      nome: string;
      calorias: number;
      proteinas?: number;
      carboidratos?: number;
      gorduras?: number;
      categoria?: string | null;
      thumbnailUrl?: string | null;
    },
    gramas: number
  ) => void;
  removerAlimentoExtra: (refeicaoId: string, itemId: string) => void;
  substituirAlimentoPrescrito: (
    prescribedDietItemId: string,
    alimento: {
      id?: string;
      nome: string;
      calorias: number;
      proteinas?: number;
      carboidratos?: number;
      gorduras?: number;
    },
    gramas: number
  ) => Promise<void>;
  recarregarDiario: () => Promise<void>;
}

const DiarioAlimentarContext = createContext<DiarioAlimentarContextData | undefined>(
  undefined
);

const REFEICOES_PADRAO: { nome: string; horario: string; ordem: number }[] = [
  { nome: "Café da Manhã", horario: "07:30", ordem: 1 },
  { nome: "Almoço", horario: "12:30", ordem: 2 },
  { nome: "Lanche", horario: "16:00", ordem: 3 },
  { nome: "Jantar", horario: "19:30", ordem: 4 },
];

export function DiarioAlimentarProvider({ children }: { children: ReactNode }) {
  const { paciente } = usePatientAuth();
  const pacienteId = paciente?.id;

  const [caloriasMeta, setCaloriasMeta] = useState<number>(0);
  const [variacoes, setVariacoes] = useState<any[]>([]);
  const [variacaoAtivaId, setVariacaoAtivaId] = useState<string | null>(null);
  const [consumidoMap, setConsumidoMap] = useState<Record<string, boolean>>({});
  const [extrasMap, setExtrasMap] = useState<Record<string, ItemAlimentoDiario[]>>({});
  const [carregando, setCarregando] = useState<boolean>(false);

  const selecionarVariacao = useCallback((variacaoId: string) => {
    setVariacaoAtivaId(variacaoId);
  }, []);

  // Carrega a prescrição médica oficial e as metas do paciente
  const carregarDiario = useCallback(async () => {
    try {
      setCarregando(true);

      // 1. Busca meta calórica do paciente
      if (pacienteId) {
        try {
          const resMetas = await api.pacientes.getMetas(pacienteId);
          if (resMetas?.metas?.caloriasAlvo) {
            setCaloriasMeta(Number(resMetas.metas.caloriasAlvo));
          }
        } catch {
          // Mantém 1800 padrão
        }
      }

      // 2. Busca o plano alimentar ativo (com todas as variações, refeições e alimentos prescritos)
      const dataDieta = await api.pacientes.getDieta(pacienteId);
      const variacoesApi = Array.isArray(dataDieta?.plano?.variacoes)
        ? dataDieta.plano.variacoes
        : [];

      if (dataDieta?.sucesso) {
        setVariacoes(variacoesApi);
        setVariacaoAtivaId((prev) =>
          prev && variacoesApi.some((v: any) => v?.id === prev)
            ? prev
            : variacoesApi[0]?.id ?? null
        );
      }
    } catch (err) {
      console.log("[DiarioAlimentar] Erro ao sincronizar diário com backend:", err);
    } finally {
      setCarregando(false);
    }
  }, [pacienteId]);

  useEffect(() => {
    carregarDiario();
  }, [carregarDiario]);

  // Deriva as refeições dinamicamente a partir da variação ativa
  const refeicoes: RefeicaoDiario[] = useMemo(() => {
    if (variacoes.length === 0) {
      return REFEICOES_PADRAO.map((ref, idx) => ({
        id: `default-${idx + 1}`,
        nome: ref.nome,
        horario: ref.horario,
        ordem: ref.ordem,
        consumido: false,
        itensPrescritos: [],
        itensExtras: [],
        caloriasPrescritas: 0,
        caloriasExtras: 0,
        caloriasTotal: 0,
      }));
    }

    const currentVariation =
      variacoes.find((v) => v?.id === variacaoAtivaId) || variacoes[0];
    const refsApi = Array.isArray(currentVariation?.refeicoes)
      ? currentVariation.refeicoes
      : [];

    return refsApi.map((ref: any, idx: number) => {
      const refId = ref.id || `ref-${idx + 1}`;
      const nomeRef = ref.nome || REFEICOES_PADRAO[idx]?.nome || `Refeição ${idx + 1}`;
      const extras = extrasMap[refId] || [];
      const consumido = consumidoMap[refId] ?? false;

      const itensPrescritos: ItemAlimentoDiario[] = (ref.itens || []).map((it: any, itIdx: number) => {
        const alim = it.alimento || {};
        const qtd = Number(it.quantidadeGramas) || 100;
        const cal100 = Number(alim.calorias) || 0;
        const calTot = Math.round((qtd / 100) * cal100);
        const sub = it.substituicao || it.substituicoes?.[0] || null;

        return {
          id: it.id || `${refId}-it-${itIdx}`,
          nome: alim.nome || "Alimento",
          categoria: alim.categoria || "Geral",
          thumbnailUrl: alim.thumbnailUrl ?? null,
          quantidadeGramas: qtd,
          calorias: calTot,
          proteinas: Number(alim.proteinas) || 0,
          carboidratos: Number(alim.carboidratos) || 0,
          gorduras: Number(alim.gorduras) || 0,
          isExtra: false,
          substituicao: sub
            ? {
                id: sub.id,
                substituteFoodName: sub.substituteFoodName,
                substituteThumbnailUrl:
                  sub.substituteThumbnailUrl ?? sub.substituteFood?.thumbnailUrl ?? null,
                quantityGrams: sub.quantityGrams,
                calories: sub.calories,
                proteins: sub.proteins,
                carbohydrates: sub.carbohydrates,
                fats: sub.fats,
              }
            : null,
        };
      });

      const calPrescritas = itensPrescritos.reduce((acc, i) => acc + i.calorias, 0);
      const calExtras = extras.reduce((acc, i) => acc + i.calorias, 0);

      return {
        id: refId,
        nome: nomeRef,
        horario: ref.horario || REFEICOES_PADRAO[idx]?.horario || "12:00",
        ordem: ref.ordem || idx + 1,
        consumido,
        itensPrescritos,
        itensExtras: extras,
        caloriasPrescritas: calPrescritas,
        caloriasExtras: calExtras,
        caloriasTotal: calPrescritas + calExtras,
      };
    });
  }, [variacoes, variacaoAtivaId, consumidoMap, extrasMap]);

  // Ação 1: Check-in da refeição ("Marcar como consumido")
  const toggleCheckinRefeicao = useCallback((refeicaoId: string) => {
    setConsumidoMap((prev) => ({
      ...prev,
      [refeicaoId]: !prev[refeicaoId],
    }));
  }, []);

  // Ação 2: Adicionar Alimento Extra (Busca Livre)
  const adicionarAlimentoExtra = useCallback(
    (
      refeicaoId: string,
      alimento: {
        id?: string;
        nome: string;
        calorias: number;
        proteinas?: number;
        carboidratos?: number;
        gorduras?: number;
        categoria?: string | null;
        thumbnailUrl?: string | null;
      },
      gramas: number
    ) => {
      const qtd = gramas > 0 ? gramas : 100;
      const calCalculada = Math.round((qtd / 100) * alimento.calorias);
      const protCalculada = Number((((alimento.proteinas || 0) * qtd) / 100).toFixed(1));
      const carbCalculado = Number((((alimento.carboidratos || 0) * qtd) / 100).toFixed(1));
      const gordCalculada = Number((((alimento.gorduras || 0) * qtd) / 100).toFixed(1));

      const novoItem: ItemAlimentoDiario = {
        id: `extra-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        nome: alimento.nome,
        categoria: alimento.categoria || "Geral",
        thumbnailUrl: alimento.thumbnailUrl ?? null,
        quantidadeGramas: qtd,
        calorias: calCalculada,
        proteinas: protCalculada,
        carboidratos: carbCalculado,
        gorduras: gordCalculada,
        isExtra: true,
      };

      setExtrasMap((prev) => ({
        ...prev,
        [refeicaoId]: [...(prev[refeicaoId] || []), novoItem],
      }));
      // Ao adicionar alimento, marca automaticamente como consumido para abater a meta
      setConsumidoMap((prev) => ({
        ...prev,
        [refeicaoId]: true,
      }));
    },
    []
  );

  // Ação 3: Remover Alimento Extra
  const removerAlimentoExtra = useCallback((refeicaoId: string, itemId: string) => {
    setExtrasMap((prev) => ({
      ...prev,
      [refeicaoId]: (prev[refeicaoId] || []).filter((i) => i.id !== itemId),
    }));
  }, []);

  // Ação 4: Substituir Alimento Prescrito (Troca Inline ancorada a prescribedDietItemId)
  const substituirAlimentoPrescrito = useCallback(
    async (
      prescribedDietItemId: string,
      alimento: {
        id?: string;
        nome: string;
        calorias: number;
        proteinas?: number;
        carboidratos?: number;
        gorduras?: number;
      },
      gramas: number
    ) => {
      try {
        const calTot = Math.round((gramas / 100) * alimento.calorias);
        const protTot = parseFloat((((alimento.proteinas || 0) * gramas) / 100).toFixed(1));
        const carbTot = parseFloat((((alimento.carboidratos || 0) * gramas) / 100).toFixed(1));
        const fatTot = parseFloat((((alimento.gorduras || 0) * gramas) / 100).toFixed(1));

        await api.pacientes.substituirAlimento(pacienteId || "default", {
          prescribedDietItemId,
          substituteFoodId: alimento.id,
          substituteFoodName: alimento.nome,
          quantityGrams: gramas,
          calories: calTot,
          proteins: protTot,
          carbohydrates: carbTot,
          fats: fatTot,
        });

        await carregarDiario();
      } catch (err) {
        console.log("[DiarioAlimentar] Erro ao registrar substituição:", err);
      }
    },
    [pacienteId, carregarDiario]
  );

  // Cálculo Dinâmico e Reativo de Calorias (Optimistic UI)
  const { caloriasConsumidas, caloriasRestantes, percentualConsumido } = useMemo(() => {
    let consumidas = 0;

    for (const ref of refeicoes) {
      if (ref.consumido) {
        // Se a refeição foi marcada como consumida, soma os alimentos prescritos
        consumidas += ref.caloriasPrescritas;
      }
      // Alimentos extras adicionados pelo paciente contam sempre como consumo efetivo
      consumidas += ref.caloriasExtras;
    }

    const restantes = Math.max(0, caloriasMeta - consumidas);
    const percentual = caloriasMeta > 0 ? Math.min(100, Math.round((consumidas / caloriasMeta) * 100)) : 0;

    return {
      caloriasConsumidas: consumidas,
      caloriasRestantes: restantes,
      percentualConsumido: percentual,
    };
  }, [refeicoes, caloriasMeta]);

  return (
    <DiarioAlimentarContext.Provider
      value={{
        caloriasMeta,
        caloriasConsumidas,
        caloriasRestantes,
        percentualConsumido,
        variacaoAtivaId,
        selecionarVariacao,
        refeicoes,
        carregando,
        toggleCheckinRefeicao,
        adicionarAlimentoExtra,
        removerAlimentoExtra,
        substituirAlimentoPrescrito,
        recarregarDiario: carregarDiario,
      }}
    >
      {children}
    </DiarioAlimentarContext.Provider>
  );
}

export function useDiarioAlimentar() {
  const context = useContext(DiarioAlimentarContext);
  if (!context) {
    throw new Error(
      "useDiarioAlimentar deve ser utilizado dentro de um DiarioAlimentarProvider"
    );
  }
  return context;
}
