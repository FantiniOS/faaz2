import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import api, {
  CheckinRefeicaoItem,
  CheckinRefeicaoStatus,
  PacienteDietaResponse,
  PlanoAlimentarApi,
  RefeicaoApi,
  VariacaoDietaApi,
} from "../services/api";
import { usePatientAuth } from "./PatientAuthContext";
import {
  ProgressoRefeicoesDia,
  calcularProgressoRefeicoesDia,
  extrairTrocasDosCheckins,
  isStatusAderente,
  montarTrocasPayloadRefeicao,
  ordenarRefeicoesPorHorario,
} from "../utils/dietaHelpers";
import { getHojeBR } from "../utils/dateBr";

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
  opcional?: boolean;
  consumido: boolean;
  statusCheckin?: CheckinRefeicaoStatus | null;
  itensPrescritos: ItemAlimentoDiario[];
  itensExtras: ItemAlimentoDiario[];
  caloriasPrescritas: number;
  caloriasExtras: number;
  caloriasTotal: number;
}

export interface DiarioAlimentarContextData {
  // === NOVO GUIA INTERATIVO DA DIETA (ETAPA 3B) ===
  plano: PlanoAlimentarApi | null;
  pacienteDieta: PacienteDietaResponse["paciente"] | null;
  variacoes: VariacaoDietaApi[];
  variacaoAtiva: VariacaoDietaApi | null;
  variacaoAtivaId: string | null;
  selecionarVariacao: (variacaoId: string) => void;
  refeicoesEstruturadas: RefeicaoApi[];
  checkinsPorRefeicao: Record<string, CheckinRefeicaoItem>;
  trocasSelecionadas: Record<string, string>;
  progressoRefeicoes: ProgressoRefeicoesDia;
  dataReferencia: string | null;
  carregando: boolean;
  salvandoRefeicaoId: string | null;
  erroDieta: string | null;
  registrarCheckinRefeicao: (
    refeicaoId: string,
    status: CheckinRefeicaoStatus,
    trocasOverride?: Record<string, string>
  ) => Promise<boolean>;
  aplicarTrocaItem: (
    refeicaoId: string,
    itemRefeicaoId: string,
    substituicaoId: string | null
  ) => Promise<void>;
  recarregarDiario: (silencioso?: boolean) => Promise<void>;

  // === CAMPOS LEGADOS (RETROCOMPATIBILIDADE) ===
  caloriasMeta: number;
  caloriasConsumidas: number;
  caloriasRestantes: number;
  percentualConsumido: number;
  refeicoes: RefeicaoDiario[];
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
}

const DiarioAlimentarContext = createContext<
  DiarioAlimentarContextData | undefined
>(undefined);

export function DiarioAlimentarProvider({ children }: { children: ReactNode }) {
  const { paciente } = usePatientAuth();
  const pacienteId = paciente?.id || "";

  const [plano, setPlano] = useState<PlanoAlimentarApi | null>(null);
  const [pacienteDieta, setPacienteDieta] =
    useState<PacienteDietaResponse["paciente"] | null>(null);
  const [variacoes, setVariacoes] = useState<VariacaoDietaApi[]>([]);
  const [variacaoAtivaId, setVariacaoAtivaId] = useState<string | null>(null);
  const [checkinsPorRefeicao, setCheckinsPorRefeicao] = useState<
    Record<string, CheckinRefeicaoItem>
  >({});
  const [trocasSelecionadas, setTrocasSelecionadas] = useState<
    Record<string, string>
  >({});
  const [dataReferencia, setDataReferencia] = useState<string | null>(null);
  const [carregando, setCarregando] = useState<boolean>(false);
  const [salvandoRefeicaoId, setSalvandoRefeicaoId] = useState<string | null>(
    null
  );
  const [erroDieta, setErroDieta] = useState<string | null>(null);

  // Estados legados mínimos para retrocompatibilidade
  const [caloriasMeta, setCaloriasMeta] = useState<number>(0);
  const [extrasMap, setExtrasMap] = useState<
    Record<string, ItemAlimentoDiario[]>
  >({});

  const selecionarVariacao = useCallback((variacaoId: string) => {
    setVariacaoAtivaId(variacaoId);
  }, []);

  const carregarDiario = useCallback(
    async (silencioso: boolean = false) => {
      if (!pacienteId) {
        setPlano(null);
        setPacienteDieta(null);
        setVariacoes([]);
        setVariacaoAtivaId(null);
        setCheckinsPorRefeicao({});
        setTrocasSelecionadas({});
        setDataReferencia(null);
        setErroDieta(null);
        setCarregando(false);
        return;
      }

      try {
        if (!silencioso) {
          setCarregando(true);
        }
        setErroDieta(null);

        const hojeBR = getHojeBR();
        const [dietaRes, checkinsRes] = await Promise.allSettled([
          api.pacientes.getDietaEstruturada(pacienteId),
          api.checkins.getRefeicoes(pacienteId, hojeBR),
        ]);

        if (dietaRes.status === "fulfilled" && dietaRes.value) {
          const dataDieta = dietaRes.value;
          const planoApi = dataDieta.plano ?? null;
          const variacoesApi = Array.isArray(planoApi?.variacoes)
            ? planoApi.variacoes
            : [];

          setPlano(planoApi);
          setPacienteDieta(dataDieta.paciente ?? null);
          setVariacoes(variacoesApi);
          if (planoApi?.caloriasAlvo) {
            setCaloriasMeta(Number(planoApi.caloriasAlvo) || 0);
          }

          setVariacaoAtivaId((prev) => {
            if (prev && variacoesApi.some((v) => v.id === prev)) {
              return prev;
            }
            return variacoesApi[0]?.id ?? null;
          });
        } else if (dietaRes.status === "rejected") {
          setErroDieta("Não foi possível carregar seu plano alimentar agora.");
        }

        if (checkinsRes.status === "fulfilled" && checkinsRes.value) {
          const lista = Array.isArray(checkinsRes.value.checkins)
            ? checkinsRes.value.checkins
            : [];
          const mapaCheckins: Record<string, CheckinRefeicaoItem> = {};
          for (const item of lista) {
            if (item?.refeicaoId) {
              mapaCheckins[item.refeicaoId] = item;
            }
          }
          setCheckinsPorRefeicao(mapaCheckins);
          setDataReferencia(
            checkinsRes.value.dataReferencia || hojeBR
          );

          const trocasSalvas = extrairTrocasDosCheckins(lista);
          setTrocasSelecionadas(trocasSalvas);
        }
      } catch (err) {
        console.log("[DiarioAlimentar] Erro ao sincronizar dieta:", err);
        setErroDieta("Erro de conexão ao carregar o plano alimentar.");
      } finally {
        setCarregando(false);
      }
    },
    [pacienteId]
  );

  useEffect(() => {
    carregarDiario(false);
  }, [carregarDiario]);

  const variacaoAtiva = useMemo(() => {
    if (!variacoes.length) return null;
    return (
      variacoes.find((v) => v.id === variacaoAtivaId) || variacoes[0] || null
    );
  }, [variacoes, variacaoAtivaId]);

  const refeicoesEstruturadas = useMemo(() => {
    const raw = Array.isArray(variacaoAtiva?.refeicoes)
      ? variacaoAtiva.refeicoes
      : [];
    return ordenarRefeicoesPorHorario(raw);
  }, [variacaoAtiva]);

  const progressoRefeicoes = useMemo(
    () =>
      calcularProgressoRefeicoesDia(refeicoesEstruturadas, checkinsPorRefeicao),
    [refeicoesEstruturadas, checkinsPorRefeicao]
  );

  // =========================================================================
  // CHECK-IN LEVE DE REFEIÇÃO (3 SEGUNDOS) — OTIMISTA + PERSISTÊNCIA ORACLE
  // =========================================================================
  const registrarCheckinRefeicao = useCallback(
    async (
      refeicaoId: string,
      status: CheckinRefeicaoStatus,
      trocasOverride?: Record<string, string>
    ): Promise<boolean> => {
      if (!pacienteId || !refeicaoId) return false;

      const refAlvo =
        refeicoesEstruturadas.find((r) => r.id === refeicaoId) ||
        variacoes
          .flatMap((v) => v.refeicoes || [])
          .find((r) => r.id === refeicaoId) ||
        null;

      const trocasAnteriores = trocasSelecionadas;
      const trocasMapaAtivo: Record<string, string> = {
        ...(trocasOverride ?? trocasSelecionadas),
      };

      // Ao marcar "SEGUI" ou "NAO_FIZ", limpa eventuais trocas aplicadas nesta refeição para
      // impedir contradição visual entre "Troca aplicada" no item e status sem troca.
      const deveLimparTrocas = status === "SEGUI" || status === "NAO_FIZ";
      let limpouTrocasDaRefeicao = false;
      if (deveLimparTrocas && Array.isArray(refAlvo?.itens)) {
        for (const item of refAlvo.itens) {
          if (item?.id && trocasMapaAtivo[item.id]) {
            delete trocasMapaAtivo[item.id];
            limpouTrocasDaRefeicao = true;
          }
        }
        if (limpouTrocasDaRefeicao) {
          setTrocasSelecionadas(trocasMapaAtivo);
        }
      }

      const trocasLista = deveLimparTrocas
        ? []
        : montarTrocasPayloadRefeicao(refAlvo, trocasMapaAtivo);
      const opcaoEscolhida = variacaoAtiva?.nome || null;
      const diaHoje = getHojeBR();
      if (dataReferencia !== diaHoje) {
        setDataReferencia(diaHoje);
      }
      const agoraIso = new Date().toISOString();

      const anterior = checkinsPorRefeicao[refeicaoId];
      const otimista: CheckinRefeicaoItem = {
        id: anterior?.id || `opt-${refeicaoId}`,
        pacienteId,
        refeicaoId,
        refeicaoNome: refAlvo?.nome || anterior?.refeicaoNome || null,
        dataDia: diaHoje,
        status,
        opcaoEscolhida,
        trocas: trocasLista.length > 0 ? trocasLista : null,
        criadoEm: anterior?.criadoEm || agoraIso,
        atualizadoEm: agoraIso,
      };

      // Atualiza imediatamente para refletir no card e no anel SVG da Home
      setCheckinsPorRefeicao((prev) => ({
        ...prev,
        [refeicaoId]: otimista,
      }));
      setSalvandoRefeicaoId(refeicaoId);

      try {
        const res = await api.checkins.registrarRefeicao({
          pacienteId,
          refeicaoId,
          dataDia: diaHoje,
          status,
          opcaoEscolhida,
          trocas: trocasLista.length > 0 ? trocasLista : null,
        });

        if (res?.checkin) {
          setCheckinsPorRefeicao((prev) => ({
            ...prev,
            [refeicaoId]: res.checkin,
          }));
        }
        return true;
      } catch (err) {
        console.log("[DiarioAlimentar] Erro ao registrar check-in:", err);
        // Reverte estado otimista em caso de erro real
        if (limpouTrocasDaRefeicao) {
          setTrocasSelecionadas(trocasAnteriores);
        }
        setCheckinsPorRefeicao((prev) => {
          const next = { ...prev };
          if (anterior) {
            next[refeicaoId] = anterior;
          } else {
            delete next[refeicaoId];
          }
          return next;
        });
        return false;
      } finally {
        setSalvandoRefeicaoId((curr) => (curr === refeicaoId ? null : curr));
      }
    },
    [
      pacienteId,
      refeicoesEstruturadas,
      variacoes,
      variacaoAtiva?.nome,
      trocasSelecionadas,
      dataReferencia,
      checkinsPorRefeicao,
    ]
  );

  // =========================================================================
  // APLICAR OU RESTAURAR SUBSTITUIÇÃO 1:N EM UM ALIMENTO DA REFEIÇÃO
  // =========================================================================
  const aplicarTrocaItem = useCallback(
    async (
      refeicaoId: string,
      itemRefeicaoId: string,
      substituicaoId: string | null
    ): Promise<void> => {
      const prevTrocas = trocasSelecionadas;
      const nextTrocas: Record<string, string> = { ...trocasSelecionadas };
      if (substituicaoId) {
        nextTrocas[itemRefeicaoId] = substituicaoId;
      } else {
        delete nextTrocas[itemRefeicaoId];
      }

      setTrocasSelecionadas(nextTrocas);

      const refAlvo =
        refeicoesEstruturadas.find((r) => r.id === refeicaoId) ||
        variacoes
          .flatMap((v) => v.refeicoes || [])
          .find((r) => r.id === refeicaoId) ||
        null;

      // Ao aplicar uma substituição, registra/atualiza automaticamente para FIZ_TROCA
      if (substituicaoId) {
        const ok = await registrarCheckinRefeicao(
          refeicaoId,
          "FIZ_TROCA",
          nextTrocas
        );
        if (!ok) {
          setTrocasSelecionadas(prevTrocas);
        }
        return;
      }

      // Ao restaurar para o alimento original:
      // - se ainda houver outras trocas na refeição, mantém FIZ_TROCA com as trocas restantes
      // - se todas as trocas foram removidas e o status era FIZ_TROCA, atualiza para SEGUI
      const checkinAtual = checkinsPorRefeicao[refeicaoId];
      if (checkinAtual) {
        const trocasRestantes = montarTrocasPayloadRefeicao(
          refAlvo,
          nextTrocas
        );
        const novoStatus: CheckinRefeicaoStatus =
          trocasRestantes.length > 0
            ? "FIZ_TROCA"
            : checkinAtual.status === "FIZ_TROCA"
              ? "SEGUI"
              : checkinAtual.status;

        const ok = await registrarCheckinRefeicao(
          refeicaoId,
          novoStatus,
          nextTrocas
        );
        if (!ok) {
          setTrocasSelecionadas(prevTrocas);
        }
      }
    },
    [
      trocasSelecionadas,
      checkinsPorRefeicao,
      refeicoesEstruturadas,
      variacoes,
      registrarCheckinRefeicao,
    ]
  );

  // =========================================================================
  // DERIVAÇÃO RETROCOMPATÍVEL PARA COMPONENTES LEGADOS
  // =========================================================================
  const refeicoes: RefeicaoDiario[] = useMemo(() => {
    return refeicoesEstruturadas.map((ref, idx) => {
      const refId = ref.id || `ref-${idx + 1}`;
      const extras = extrasMap[refId] || [];
      const statusCheckin = checkinsPorRefeicao[refId]?.status ?? null;
      const consumido = isStatusAderente(statusCheckin);

      const itensPrescritos: ItemAlimentoDiario[] = (ref.itens || []).map(
        (it, itIdx) => {
          const alim = it.alimento || {};
          const qtd = Number(it.quantidadeGramas) || 0;
          const calTot = Math.round(
            Number(
              alim.caloriasPorcao ??
                ((Number(alim.calorias) || 0) * qtd) / 100
            ) || 0
          );

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
            substituicao: it.substituicao
              ? {
                  id: it.substituicao.id,
                  substituteFoodName: it.substituicao.substituteFoodName,
                  substituteThumbnailUrl:
                    it.substituicao.substituteThumbnailUrl ?? null,
                  quantityGrams: it.substituicao.quantityGrams,
                  calories: it.substituicao.calories,
                  proteins: it.substituicao.proteins,
                  carbohydrates: it.substituicao.carbohydrates,
                  fats: it.substituicao.fats,
                }
              : null,
          };
        }
      );

      const calPrescritas = itensPrescritos.reduce(
        (acc, i) => acc + i.calorias,
        0
      );
      const calExtras = extras.reduce((acc, i) => acc + i.calorias, 0);

      return {
        id: refId,
        nome: ref.nome || `Refeição ${idx + 1}`,
        horario: ref.horario || "",
        ordem: ref.ordem || idx + 1,
        opcional: Boolean(ref.opcional),
        consumido,
        statusCheckin,
        itensPrescritos,
        itensExtras: extras,
        caloriasPrescritas: calPrescritas,
        caloriasExtras: calExtras,
        caloriasTotal: calPrescritas + calExtras,
      };
    });
  }, [refeicoesEstruturadas, checkinsPorRefeicao, extrasMap]);

  const toggleCheckinRefeicao = useCallback(
    (refeicaoId: string) => {
      const atual = checkinsPorRefeicao[refeicaoId]?.status;
      const proximo: CheckinRefeicaoStatus = isStatusAderente(atual)
        ? "NAO_FIZ"
        : "SEGUI";
      void registrarCheckinRefeicao(refeicaoId, proximo);
    },
    [checkinsPorRefeicao, registrarCheckinRefeicao]
  );

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
      const novoItem: ItemAlimentoDiario = {
        id: `extra-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        nome: alimento.nome,
        categoria: alimento.categoria || "Geral",
        thumbnailUrl: alimento.thumbnailUrl ?? null,
        quantidadeGramas: qtd,
        calorias: Math.round((qtd / 100) * alimento.calorias),
        proteinas: Number((((alimento.proteinas || 0) * qtd) / 100).toFixed(1)),
        carboidratos: Number(
          (((alimento.carboidratos || 0) * qtd) / 100).toFixed(1)
        ),
        gorduras: Number((((alimento.gorduras || 0) * qtd) / 100).toFixed(1)),
        isExtra: true,
      };

      setExtrasMap((prev) => ({
        ...prev,
        [refeicaoId]: [...(prev[refeicaoId] || []), novoItem],
      }));
    },
    []
  );

  const removerAlimentoExtra = useCallback(
    (refeicaoId: string, itemId: string) => {
      setExtrasMap((prev) => ({
        ...prev,
        [refeicaoId]: (prev[refeicaoId] || []).filter((i) => i.id !== itemId),
      }));
    },
    []
  );

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
        const protTot = parseFloat(
          (((alimento.proteinas || 0) * gramas) / 100).toFixed(1)
        );
        const carbTot = parseFloat(
          (((alimento.carboidratos || 0) * gramas) / 100).toFixed(1)
        );
        const fatTot = parseFloat(
          (((alimento.gorduras || 0) * gramas) / 100).toFixed(1)
        );

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

        await carregarDiario(true);
      } catch (err) {
        console.log("[DiarioAlimentar] Erro ao registrar substituição:", err);
      }
    },
    [pacienteId, carregarDiario]
  );

  const { caloriasConsumidas, caloriasRestantes, percentualConsumido } =
    useMemo(() => {
      let consumidas = 0;
      for (const ref of refeicoes) {
        if (ref.consumido) consumidas += ref.caloriasPrescritas;
        consumidas += ref.caloriasExtras;
      }
      const restantes = Math.max(0, caloriasMeta - consumidas);
      const percentual =
        caloriasMeta > 0
          ? Math.min(100, Math.round((consumidas / caloriasMeta) * 100))
          : 0;
      return {
        caloriasConsumidas: consumidas,
        caloriasRestantes: restantes,
        percentualConsumido: percentual,
      };
    }, [refeicoes, caloriasMeta]);

  return (
    <DiarioAlimentarContext.Provider
      value={{
        plano,
        pacienteDieta,
        variacoes,
        variacaoAtiva,
        variacaoAtivaId,
        selecionarVariacao,
        refeicoesEstruturadas,
        checkinsPorRefeicao,
        trocasSelecionadas,
        progressoRefeicoes,
        dataReferencia,
        carregando,
        salvandoRefeicaoId,
        erroDieta,
        registrarCheckinRefeicao,
        aplicarTrocaItem,
        recarregarDiario: carregarDiario,
        caloriasMeta,
        caloriasConsumidas,
        caloriasRestantes,
        percentualConsumido,
        refeicoes,
        toggleCheckinRefeicao,
        adicionarAlimentoExtra,
        removerAlimentoExtra,
        substituirAlimentoPrescrito,
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
