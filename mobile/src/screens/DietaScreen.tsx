import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import {
  Utensils,
  Home as HomeIcon,
  Target,
  User,
  Clock,
  Flame,
  Sparkles,
  Info,
  Calendar,
  Coffee,
  Sun,
  Moon,
  Apple,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  RotateCcw,
  Circle,
  Plus,
  Trash2,
} from "lucide-react-native";
import { StandardHeader } from "../components/StandardHeader";
import { BottomTabBar } from "../components/BottomTabBar";
import { api } from "../services/api";
import { usePatientAuth } from "../contexts/PatientAuthContext";
import { useDiarioAlimentar } from "../contexts/DiarioAlimentarContext";
import { AdicionarAlimentoModal, AlimentoBuscaOption } from "../components/AdicionarAlimentoModal";
import { FoodThumbnail } from "../components/FoodThumbnail";

export interface AlimentoItem {
  id?: string;
  nome?: string;
  categoria?: string;
  thumbnailUrl?: string | null;
  caloriasPorcao?: number;
  calorias?: number;
  proteinasPorcao?: number;
  proteinas?: number;
  carboidratosPorcao?: number;
  carboidratos?: number;
  gordurasPorcao?: number;
  gorduras?: number;
  fibrasPorcao?: number;
  fibras?: number;
}

export interface DietSubstitutionItem {
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

export interface ItemRefeicao {
  id?: string;
  quantidadeGramas?: number;
  observacao?: string | null;
  alimento?: AlimentoItem;
  substituicoes?: DietSubstitutionItem[];
  substituicao?: DietSubstitutionItem | null;
}

export interface TotaisNutricionais {
  calorias?: number;
  proteinas?: number;
  carboidratos?: number;
  gorduras?: number;
  fibras?: number;
}

export interface Refeicao {
  id?: string;
  nome?: string;
  horario?: string;
  ordem?: number;
  observacoes?: string | null;
  calorias?: number;
  totais?: TotaisNutricionais;
  itens?: ItemRefeicao[];
}

export interface VariacaoDieta {
  id?: string;
  nome?: string;
  descricao?: string | null;
  ordem?: number;
  calorias?: number;
  totais?: TotaisNutricionais;
  refeicoes?: Refeicao[];
}

export interface PlanoAlimentarData {
  id?: string;
  nome?: string;
  titulo?: string;
  objetivo?: string | null;
  caloriasAlvo?: number | null;
  variacoes?: VariacaoDieta[];
}

export interface PacienteData {
  id?: string;
  nome?: string;
  medico?: string;
  especialidade?: string;
  focoClinico?: string | null;
}

export interface DietaScreenProps {
  pacienteId?: string;
  pacienteNome?: string;
  onBack?: () => void;
  onTabPress?: (tab: string) => void;
}


/**
 * Funções utilitárias de Defesa de Código (Defensive Programming)
 * Garantem que a tela nunca estoure erro de `undefined` mesmo com payload incompleto.
 */
function getTotaisRefeicao(refeicao?: Refeicao | null) {
  if (!refeicao) {
    return { calorias: 0, proteinas: 0, carboidratos: 0, gorduras: 0, fibras: 0 };
  }

  const calorias =
    refeicao?.totais?.calorias ??
    refeicao?.calorias ??
    0;

  let prot = Number(refeicao?.totais?.proteinas) || 0;
  let carb = Number(refeicao?.totais?.carboidratos) || 0;
  let fat = Number(refeicao?.totais?.gorduras) || 0;
  let fib = Number(refeicao?.totais?.fibras) || 0;

  // Se não veio totais nem calorias calculadas, tenta calcular somando os itens
  if (calorias === 0 && Array.isArray(refeicao?.itens) && refeicao.itens.length > 0) {
    let sumCal = 0;
    for (const item of refeicao.itens) {
      const alim = item?.alimento;
      const qtd = Number(item?.quantidadeGramas) || 0;
      const fator = qtd > 0 ? qtd / 100 : 1;
      const itemCal =
        alim?.caloriasPorcao ??
        (alim?.calorias != null ? Math.round(Number(alim.calorias) * fator) : 0);
      sumCal += Number(itemCal) || 0;
      prot += Number(alim?.proteinasPorcao ?? (alim?.proteinas != null ? alim.proteinas * fator : 0)) || 0;
      carb += Number(alim?.carboidratosPorcao ?? (alim?.carboidratos != null ? alim.carboidratos * fator : 0)) || 0;
      fat += Number(alim?.gordurasPorcao ?? (alim?.gorduras != null ? alim.gorduras * fator : 0)) || 0;
      fib += Number(alim?.fibrasPorcao ?? (alim?.fibras != null ? alim.fibras * fator : 0)) || 0;
    }
    return {
      calorias: Math.round(sumCal),
      proteinas: parseFloat(prot.toFixed(1)),
      carboidratos: parseFloat(carb.toFixed(1)),
      gorduras: parseFloat(fat.toFixed(1)),
      fibras: parseFloat(fib.toFixed(1)),
    };
  }

  return {
    calorias: Math.round(Number(calorias) || 0),
    proteinas: parseFloat((Number(prot) || 0).toFixed(1)),
    carboidratos: parseFloat((Number(carb) || 0).toFixed(1)),
    gorduras: parseFloat((Number(fat) || 0).toFixed(1)),
    fibras: parseFloat((Number(fib) || 0).toFixed(1)),
  };
}

function getTotaisVariacao(variacao?: VariacaoDieta | null) {
  if (!variacao) {
    return { calorias: 0, proteinas: 0, carboidratos: 0, gorduras: 0, fibras: 0 };
  }

  const calorias =
    variacao?.totais?.calorias ??
    variacao?.calorias ??
    0;

  let prot = Number(variacao?.totais?.proteinas) || 0;
  let carb = Number(variacao?.totais?.carboidratos) || 0;
  let fat = Number(variacao?.totais?.gorduras) || 0;
  let fib = Number(variacao?.totais?.fibras) || 0;

  if (calorias === 0 && Array.isArray(variacao?.refeicoes) && variacao.refeicoes.length > 0) {
    let sumCal = 0;
    for (const ref of variacao.refeicoes) {
      const t = getTotaisRefeicao(ref);
      sumCal += t.calorias;
      prot += t.proteinas;
      carb += t.carboidratos;
      fat += t.gorduras;
      fib += t.fibras;
    }
    return {
      calorias: Math.round(sumCal),
      proteinas: parseFloat(prot.toFixed(1)),
      carboidratos: parseFloat(carb.toFixed(1)),
      gorduras: parseFloat(fat.toFixed(1)),
      fibras: parseFloat(fib.toFixed(1)),
    };
  }

  return {
    calorias: Math.round(Number(calorias) || 0),
    proteinas: parseFloat((Number(prot) || 0).toFixed(1)),
    carboidratos: parseFloat((Number(carb) || 0).toFixed(1)),
    gorduras: parseFloat((Number(fat) || 0).toFixed(1)),
    fibras: parseFloat((Number(fib) || 0).toFixed(1)),
  };
}

function getVariacaoId(variacao?: VariacaoDieta | null, index: number = 0): string {
  return String(variacao?.id ?? `var-${index}`);
}

export function DietaScreen({
  pacienteId,
  pacienteNome = "Paciente",
  onBack,
  onTabPress,
}: DietaScreenProps) {
  const { paciente: authPaciente } = usePatientAuth();
  const [plano, setPlano] = useState<PlanoAlimentarData | null>(null);
  const [paciente, setPaciente] = useState<PacienteData | null>(null);
  const [activeVariationId, setActiveVariationId] = useState<string | null>(
    plano?.variacoes?.[0]?.id ?? null
  );
  const activeVariationIdRef = useRef<string | null>(activeVariationId);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);

  // Integração com o Diário Alimentar (Consumo Diário & Check-in)
  const {
    refeicoes: refeicoesDiario,
    toggleCheckinRefeicao,
    adicionarAlimentoExtra,
    removerAlimentoExtra,
    selecionarVariacao,
    recarregarDiario,
    caloriasConsumidas,
    caloriasMeta,
    caloriasRestantes,
    percentualConsumido,
  } = useDiarioAlimentar();

  const [modalExtraRefeicaoId, setModalExtraRefeicaoId] = useState<string | null>(null);

  function handleConfirmarAdicionarExtra(
    alimento: AlimentoBuscaOption,
    gramas: number
  ) {
    if (modalExtraRefeicaoId) {
      adicionarAlimentoExtra(modalExtraRefeicaoId, alimento, gramas);
      setModalExtraRefeicaoId(null);
    }
  }

  // Estado para o Modal de Substituição de Alimento (🔄)
  const [itemParaSubstituir, setItemParaSubstituir] = useState<{
    itemId: string;
    itemNome: string;
    refeicaoNome: string;
  } | null>(null);

  function handleAbrirSubstituicao(
    itemId: string,
    itemNome: string,
    refeicaoNome: string
  ) {
    setItemParaSubstituir({
      itemId,
      itemNome,
      refeicaoNome,
    });
  }

  async function handleConfirmarSubstituicao(
    alimento: AlimentoBuscaOption,
    gramas: number
  ) {
    if (!itemParaSubstituir) return;

    try {
      const calTot = Math.round((gramas / 100) * (alimento.calorias || 0));
      const protTot = parseFloat(
        ((gramas / 100) * (alimento.proteinas || 0)).toFixed(1)
      );
      const carbTot = parseFloat(
        ((gramas / 100) * (alimento.carboidratos || 0)).toFixed(1)
      );
      const fatTot = parseFloat(
        ((gramas / 100) * (alimento.gorduras || 0)).toFixed(1)
      );

      // Envia prescribedDietItemId para ancorar a troca diretamente ao item da dieta
      await api.pacientes.substituirAlimento(pacienteId || "default", {
        prescribedDietItemId: itemParaSubstituir.itemId,
        substituteFoodId: alimento.id,
        substituteFoodName: alimento.nome,
        quantityGrams: gramas,
        calories: calTot,
        proteins: protTot,
        carbohydrates: carbTot,
        fats: fatTot,
      });

      // Recarrega o plano para refletir a substituição inline
      await carregarPlano();
      await recarregarDiario();
    } catch (err) {
      console.log("[DietaScreen] Erro ao registrar substituição:", err);
    } finally {
      setItemParaSubstituir(null);
    }
  }

  async function handleRemoverSubstituicaoItem(subId: string) {
    try {
      await api.pacientes.removerSubstituicao(pacienteId || "default", subId);
      await carregarPlano();
      await recarregarDiario();
    } catch (err) {
      console.log("[DietaScreen] Erro ao reverter substituição:", err);
    }
  }

  const carregarPlano = useCallback(async () => {
    setCarregando(true);
    setErro(null);

    try {
      const data = await api.pacientes.getDieta(pacienteId);

      if (data?.sucesso && data?.plano) {
        setPlano(data.plano);
        setPaciente(data.paciente || null);
        if (Array.isArray(data.plano.variacoes) && data.plano.variacoes.length > 0) {
          const defaultId = getVariacaoId(data.plano.variacoes[0], 0);
          const currentId = activeVariationIdRef.current;
          const nextId =
            currentId &&
            data.plano.variacoes.some(
              (v: VariacaoDieta, idx: number) => getVariacaoId(v, idx) === currentId
            )
              ? currentId
              : defaultId;
          activeVariationIdRef.current = nextId;
          setActiveVariationId(nextId);
          selecionarVariacao(nextId);
        }
      } else if (data?.sucesso && !data?.temPlano) {
        setPaciente(data.paciente || null);
        setPlano(null);
        activeVariationIdRef.current = null;
        setActiveVariationId(null);
      } else {
        setErro(data?.error || "Não foi possível carregar a prescrição.");
      }
    } catch (err: any) {
      console.log("[DietaScreen] Falha de conexão na API:", err?.message);
      setErro(
        "Não foi possível sincronizar com o servidor da Clínica FAAZ. Verifique sua conexão."
      );
    } finally {
      setCarregando(false);
    }
  }, [pacienteId, selecionarVariacao]);

  useEffect(() => {
    carregarPlano();
  }, [carregarPlano]);

  function handleSelectVariation(variationId: string) {
    activeVariationIdRef.current = variationId;
    setActiveVariationId(variationId);
    selecionarVariacao(variationId);
  }

  const variacoesList = useMemo(
    () => (Array.isArray(plano?.variacoes) ? plano.variacoes : []),
    [plano]
  );

  const currentVariationIndex = useMemo(() => {
    if (variacoesList.length === 0) return -1;
    const foundIdx = variacoesList.findIndex(
      (v, idx) => getVariacaoId(v, idx) === activeVariationId
    );
    return foundIdx >= 0 ? foundIdx : 0;
  }, [variacoesList, activeVariationId]);

  const currentVariation =
    currentVariationIndex >= 0 ? variacoesList[currentVariationIndex] : null;
  const activeVariationKey =
    currentVariation && currentVariationIndex >= 0
      ? getVariacaoId(currentVariation, currentVariationIndex)
      : null;
  const currentMeals = Array.isArray(currentVariation?.refeicoes)
    ? currentVariation.refeicoes
    : [];

  const totaisDia = getTotaisVariacao(currentVariation);

  function renderMealIcon(nome?: string) {
    const n = (nome || "").toLowerCase();
    if (n.includes("desjejum") || n.includes("manhã") || n.includes("café")) {
      return <Coffee size={16} color="#d97706" />;
    }
    if (n.includes("almoço")) {
      return <Sun size={16} color="#f97316" />;
    }
    if (n.includes("lanche")) {
      return <Apple size={16} color="#059669" />;
    }
    if (n.includes("jantar") || n.includes("noite") || n.includes("ceia")) {
      return <Moon size={16} color="#6366f1" />;
    }
    return <Utensils size={16} color="#0f766e" />;
  }

  // 1. PROTEÇÃO DE ESTADO DE CARREGAMENTO (LOADING STATE)
  if (carregando) {
    return (
      <View style={styles.root}>
        <StandardHeader
          title="Dieta"
          subtitle="Plano alimentar prescrito"
          rightElement={
            <View style={styles.headerBadge}>
              <ShieldCheck size={12} color="#2dd4bf" />
              <Text style={styles.headerBadgeText}>Médico</Text>
            </View>
          }
        />
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#0f766e" />
          <Text style={styles.loadingText}>
            Sincronizando prescrição nutricional...
          </Text>
        </View>

        <BottomTabBar
          activeTab="Dieta"
          onTabPress={(tab) => {
            if (onTabPress) {
              onTabPress(tab);
            } else if (tab === "Hoje" && onBack) {
              onBack();
            }
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* 1. HEADER ESCURO EXECUTIVO UNIFICADO (SEM VOLTAR) */}
      <StandardHeader
        title="Dieta"
        subtitle="Plano alimentar prescrito"
        rightElement={
          <View style={styles.headerBadge}>
            <ShieldCheck size={12} color="#2dd4bf" />
            <Text style={styles.headerBadgeText}>Médico</Text>
          </View>
        }
      />

      {/* 2. ÁREA DE CONTEÚDO ROLÁVEL */}
      <ScrollView
        className="flex-1 w-full"
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* CARD DO PLANO & MÉDICO RESPONSÁVEL */}
        <View style={styles.bannerCard}>
          <View style={styles.bannerBadgeRow}>
            <View style={styles.badgeAtivo}>
              <Sparkles size={11} color="#5eead4" />
              <Text style={styles.badgeAtivoText}>Prescrição Médica Ativa</Text>
            </View>
            <Text style={styles.pacienteNomeHeader}>
              {paciente?.nome || pacienteNome}
            </Text>
          </View>

          <Text style={styles.planoTitulo}>
            {plano?.nome || plano?.titulo || "Plano Alimentar Individualizado"}
          </Text>

          {plano?.objetivo ? (
            <Text style={styles.planoObjetivo}>{plano.objetivo}</Text>
          ) : null}

          <View style={styles.bannerDivider} />

          <View style={styles.medicoRow}>
            <Text style={styles.medicoText}>
              Médico:{" "}
              <Text style={styles.medicoNome}>
                {paciente?.medico?.trim() ||
                  authPaciente?.medicoResponsavel?.trim() ||
                  "Equipe Clínica FAAZ"}
              </Text>
            </Text>
            <Text style={styles.especialidadeText}>
              {paciente?.especialidade?.trim() ||
                authPaciente?.especialidadeMedico?.trim() ||
                "Endocrinologia & Metabologia"}
            </Text>
          </View>
        </View>

        {/* ERRO */}
        {!carregando && erro && (
          <View style={styles.errorCard}>
            <AlertCircle size={24} color="#e11d48" />
            <Text style={styles.errorTitle}>Aviso de Sincronização</Text>
            <Text style={styles.errorText}>{erro}</Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={carregarPlano}
              style={styles.retryButton}
            >
              <RefreshCw size={14} color="#0f766e" />
              <Text style={styles.retryButtonText}>Tentar Novamente</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* SEM PLANO */}
        {!carregando && !erro && (!plano || variacoesList.length === 0) && (
          <View style={styles.emptyCard}>
            <Utensils size={32} color="#0f766e" />
            <Text style={styles.emptyTitle}>Plano Alimentar em Preparação</Text>
            <Text style={styles.emptyText}>
              Sua equipe médica está calibrando seus macronutrientes na Clínica
              FAAZ. Assim que a prescrição for concluída, ela aparecerá
              automaticamente aqui.
            </Text>
          </View>
        )}

        {/* PLANO ATIVO DISPONÍVEL */}
        {!carregando && !erro && plano && variacoesList.length > 0 && (
          <>
            {/* PROGRESSO DO DIÁRIO ALIMENTAR DE HOJE (METAS E KCAL RESTANTES) */}
            <View style={styles.diarioSummaryBanner}>
              <View style={styles.diarioSummaryLeft}>
                <View style={styles.diarioIconCircle}>
                  <Flame size={16} color="#d97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.diarioSummaryTitle}>Diário de Consumo Hoje</Text>
                  <Text style={styles.diarioSummarySubtitle}>
                    {caloriasConsumidas} kcal consumidas de {caloriasMeta} kcal ({percentualConsumido}%)
                  </Text>
                </View>
              </View>
              <View style={styles.diarioRestantePill}>
                <Text style={styles.diarioRestantePillText}>
                  Restam {caloriasRestantes} kcal
                </Text>
              </View>
            </View>

            {/* 3. SELETOR DE VARIAÇÕES EM CHIPS (GRID COM QUEBRA DE LINHA) */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>
                Opções de Cardápio ({variacoesList.length})
              </Text>
              <Text style={styles.sectionHint}>Selecione para ver o dia</Text>
            </View>

            <View style={styles.pillsContainer}>
              {variacoesList.map((variacao, idx) => {
                const varId = getVariacaoId(variacao, idx);
                const isAtiva = varId === activeVariationKey;
                return (
                  <TouchableOpacity
                    key={varId}
                    activeOpacity={0.8}
                    onPress={() => handleSelectVariation(varId)}
                    style={[
                      styles.pillButton,
                      isAtiva ? styles.pillButtonActive : styles.pillButtonInactive,
                    ]}
                  >
                    <Calendar
                      size={14}
                      color={isAtiva ? "#99f6e4" : "#64748b"}
                    />
                    <Text
                      style={[
                        styles.pillText,
                        isAtiva
                          ? styles.pillTextActive
                          : styles.pillTextInactive,
                      ]}
                    >
                      {variacao?.nome || `Opção ${idx + 1}`}
                    </Text>
                    {isAtiva && <View style={styles.pillDot} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            {currentVariation?.descricao ? (
              <Text style={styles.variacaoDescricao}>
                💡 {currentVariation.descricao}
              </Text>
            ) : null}

            {/* RESUMO DE MACRONUTRIENTES E CALORIAS DO DIA SELECIONADO */}
            {currentVariation && (
              <View style={styles.summaryCard}>
                <View style={styles.summaryTop}>
                  <View style={styles.summaryTopLeft}>
                    <Flame size={16} color="#d97706" />
                    <Text style={styles.summaryTopLabel}>Total do Dia:</Text>
                  </View>
                  <Text style={styles.summaryCalories}>
                    {totaisDia?.calorias > 0
                      ? `${totaisDia.calorias} kcal`
                      : "0 kcal"}
                  </Text>
                </View>

                <View style={styles.macrosGrid}>
                  <View style={styles.macroBox}>
                    <Text style={styles.macroLabel}>Proteínas</Text>
                    <Text style={[styles.macroValue, { color: "#047857" }]}>
                      {totaisDia?.proteinas ?? 0}g
                    </Text>
                  </View>
                  <View style={styles.macroBox}>
                    <Text style={styles.macroLabel}>Carbos</Text>
                    <Text style={[styles.macroValue, { color: "#d97706" }]}>
                      {totaisDia?.carboidratos ?? 0}g
                    </Text>
                  </View>
                  <View style={styles.macroBox}>
                    <Text style={styles.macroLabel}>Gorduras</Text>
                    <Text style={[styles.macroValue, { color: "#4f46e5" }]}>
                      {totaisDia?.gorduras ?? 0}g
                    </Text>
                  </View>
                  <View style={styles.macroBox}>
                    <Text style={styles.macroLabel}>Fibras</Text>
                    <Text style={[styles.macroValue, { color: "#0f766e" }]}>
                      {totaisDia?.fibras ?? 0}g
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* 4. CARDS VERTICAIS DAS REFEIÇÕES */}
            <View key={activeVariationKey || "no-variation"} style={styles.mealsList}>
              {currentMeals.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Utensils size={26} color="#0f766e" />
                  <Text style={styles.emptyTitle}>Nenhuma refeição nesta variação</Text>
                  <Text style={styles.emptyText}>
                    A equipe médica ainda não adicionou refeições para esta opção de cardápio.
                  </Text>
                </View>
              ) : (
                currentMeals.map((refeicao, refIdx) => {
                  const refId = refeicao?.id || `${activeVariationKey || "var"}-ref-${refIdx}`;
                  const matchRefDiario = refeicoesDiario.find(
                    (r) => r.id === refId
                  );
                  const isConsumido = matchRefDiario?.consumido ?? false;
                  const extras = matchRefDiario?.itensExtras || [];

                const totaisRef = getTotaisRefeicao(refeicao);
                const calRef =
                  totaisRef?.calorias ??
                  refeicao?.calorias ??
                  refeicao?.totais?.calorias ??
                  0;
                const badgeText = calRef > 0 ? `${calRef} kcal` : "0 kcal";
                const itensRef = Array.isArray(refeicao?.itens) ? refeicao.itens : [];

                return (
                  <View
                    key={refId}
                    style={[
                      styles.mealCard,
                      isConsumido && styles.mealCardConsumido,
                    ]}
                  >
                    {/* CABEÇALHO DA REFEIÇÃO COM MARCAR COMO CONSUMIDO */}
                    <View style={styles.mealCardHeader}>
                      <View style={styles.mealLeft}>
                        <View
                          style={[
                            styles.mealIconCircle,
                            isConsumido && styles.mealIconCircleActive,
                          ]}
                        >
                          {renderMealIcon(refeicao?.nome || "")}
                        </View>
                        <View>
                          <Text style={styles.mealName}>{refeicao?.nome || "Refeição"}</Text>
                          <View style={styles.mealTimeRow}>
                            <Clock size={11} color="#64748b" />
                            <Text style={styles.mealTime}>{refeicao?.horario || "--:--"}</Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.mealHeaderRightActions}>
                        <View style={styles.mealCaloriesBadge}>
                          <Text style={styles.mealCaloriesText}>
                            {badgeText}
                          </Text>
                          <Text style={styles.mealMacrosText}>
                            P: {totaisRef?.proteinas ?? 0}g • C:{" "}
                            {totaisRef?.carboidratos ?? 0}g
                          </Text>
                        </View>

                        {/* BOTÃO DE CHECK-IN / MARCAR COMO CONSUMIDO */}
                        <TouchableOpacity
                          onPress={() => {
                            const targetId = matchRefDiario?.id || refeicao?.id || refId;
                            toggleCheckinRefeicao(targetId);
                          }}
                          activeOpacity={0.75}
                          style={[
                            styles.checkinButton,
                            isConsumido && styles.checkinButtonActive,
                          ]}
                        >
                          {isConsumido ? (
                            <>
                              <CheckCircle2 size={13} color="#ffffff" strokeWidth={2.5} />
                              <Text style={styles.checkinButtonTextActive}>Consumido</Text>
                            </>
                          ) : (
                            <>
                              <Circle size={13} color="#0f766e" strokeWidth={2} />
                              <Text style={styles.checkinButtonText}>Check-in</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* OBSERVAÇÃO MÉDICA DA REFEIÇÃO */}
                    {refeicao?.observacoes ? (
                      <View style={styles.mealNote}>
                        <Info size={13} color="#0f766e" />
                        <Text style={styles.mealNoteText}>
                          {refeicao.observacoes}
                        </Text>
                      </View>
                    ) : null}

                    {/* LISTA DE ALIMENTOS (READ-ONLY) */}
                    <View style={styles.mealItemsList}>
                      {itensRef.length === 0 ? (
                        <Text style={styles.emptyItemsText}>
                          Nenhum alimento cadastrado nesta refeição.
                        </Text>
                      ) : (
                        itensRef.map((item, itemIdx) => {
                          const itemId = item?.id || `item-${itemIdx}`;
                          const alim = item?.alimento;
                          const sub = item?.substituicao || item?.substituicoes?.[0] || null;
                          const hasSub = !!sub;

                          const calItem =
                            alim?.caloriasPorcao ??
                            alim?.calorias ??
                            0;
                          const itemBadge = calItem > 0 ? `${calItem} kcal` : "0 kcal";
                          const itemProt = alim?.proteinasPorcao ?? alim?.proteinas ?? 0;
                          const itemCarb = alim?.carboidratosPorcao ?? alim?.carboidratos ?? 0;

                          return (
                            <View key={itemId} style={styles.foodItemContainer}>
                              <View
                                style={[
                                  styles.foodRow,
                                  hasSub && styles.foodRowSubstituted,
                                ]}
                              >
                                <FoodThumbnail
                                  nome={alim?.nome || "Alimento Prescrito"}
                                  categoria={alim?.categoria}
                                  imageUrl={alim?.thumbnailUrl}
                                  size={34}
                                  style={{ marginRight: 10 }}
                                />
                                <View style={styles.foodInfoCol}>
                                  <Text
                                    style={[
                                      styles.foodName,
                                      hasSub && styles.foodNameSubstituted,
                                    ]}
                                  >
                                    {alim?.nome || "Alimento Prescrito"}
                                  </Text>
                                  <View style={styles.foodPortionRow}>
                                    <View
                                      style={[
                                        styles.portionBadge,
                                        hasSub && styles.portionBadgeSubstituted,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.portionBadgeText,
                                          hasSub && styles.portionBadgeTextSubstituted,
                                        ]}
                                      >
                                        {item?.quantidadeGramas ? `${item.quantidadeGramas}g` : "Porção livre"}
                                      </Text>
                                    </View>
                                    {item?.observacao ? (
                                      <Text
                                        style={styles.foodObservation}
                                        numberOfLines={1}
                                      >
                                        ({item.observacao})
                                      </Text>
                                    ) : null}
                                  </View>
                                </View>

                                {/* SELO DE CALORIAS */}
                                <View style={styles.foodCaloriesCol}>
                                  <Text
                                    style={[
                                      styles.foodCalories,
                                      hasSub && styles.foodCaloriesSubstituted,
                                    ]}
                                  >
                                    {itemBadge}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.foodMacros,
                                      hasSub && styles.foodMacrosSubstituted,
                                    ]}
                                  >
                                    P: {itemProt}g • C: {itemCarb}g
                                  </Text>
                                </View>

                                {/* BOTÃO DE SUBSTITUIÇÃO (🔄) */}
                                <TouchableOpacity
                                  style={styles.swapButton}
                                  onPress={() =>
                                    handleAbrirSubstituicao(
                                      itemId,
                                      alim?.nome || "Alimento Prescrito",
                                      refeicao?.nome || "Refeição"
                                    )
                                  }
                                  activeOpacity={0.7}
                                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                >
                                  <RefreshCw size={12} color="#0f766e" />
                                  <Text style={styles.swapButtonText}>Trocar</Text>
                                </TouchableOpacity>
                              </View>

                              {/* BLOCO DO ALIMENTO SUBSTITUTO ESCOLHIDO PELO PACIENTE */}
                              {hasSub && sub ? (
                                <View style={styles.substituteBox}>
                                  <View style={styles.substituteHeaderRow}>
                                    <View style={styles.substituteBadge}>
                                      <RefreshCw size={11} color="#047857" />
                                      <Text style={styles.substituteBadgeText}>
                                        Substituído pelo Paciente
                                      </Text>
                                    </View>
                                    <TouchableOpacity
                                      onPress={() => handleRemoverSubstituicaoItem(sub.id)}
                                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    >
                                      <RotateCcw size={13} color="#047857" />
                                    </TouchableOpacity>
                                  </View>

                                  <View style={styles.substituteContentRow}>
                                    <FoodThumbnail
                                      nome={sub.substituteFoodName}
                                      imageUrl={
                                        sub.substituteThumbnailUrl ??
                                        sub.substituteFood?.thumbnailUrl
                                      }
                                      size={30}
                                    />
                                    <View style={styles.substituteTextCol}>
                                      <Text style={styles.substituteFoodName} numberOfLines={1}>
                                        {sub.substituteFoodName}
                                      </Text>
                                      <Text style={styles.substitutePortionText}>
                                        {sub.quantityGrams}g consumido
                                      </Text>
                                    </View>
                                    <View style={styles.substituteCaloriesCol}>
                                      <Text style={styles.substituteCaloriesText}>
                                        {sub.calories} kcal
                                      </Text>
                                      <Text style={styles.substituteMacrosText}>
                                        P: {sub.proteins ?? 0}g • C: {sub.carbohydrates ?? 0}g
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                              ) : null}
                            </View>
                          );
                        })
                      )}
                    </View>

                    {/* ITENS ADICIONAIS CONSUMIDOS PELO PACIENTE (DIÁRIO) */}
                    {extras.length > 0 && (
                      <View style={styles.extraItemsBox}>
                        <Text style={styles.extraItemsHeaderLabel}>
                          ITENS EXTRAS CONSUMIDOS:
                        </Text>
                        {extras.map((extra) => (
                          <View key={extra.id} style={styles.extraItemRow}>
                            <FoodThumbnail
                              nome={extra.nome}
                              categoria={extra.categoria}
                              imageUrl={extra.thumbnailUrl}
                              size={26}
                            />
                            <View style={styles.foodInfoCol}>
                              <Text style={styles.foodName} numberOfLines={1}>
                                {extra.nome}
                              </Text>
                              <Text style={styles.foodMacros}>
                                {extra.quantidadeGramas}g • Extra fora da dieta
                              </Text>
                            </View>
                            <Text style={styles.foodCalories}>
                              +{extra.calorias} kcal
                            </Text>
                            <TouchableOpacity
                              onPress={() => {
                                const targetId = matchRefDiario?.id || refeicao?.id || refId;
                                removerAlimentoExtra(targetId, extra.id);
                              }}
                              style={styles.deleteExtraBtn}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Trash2 size={12} color="#f43f5e" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* BOTÃO PARA ADICIONAR ITEM EXTRA À REFEIÇÃO */}
                    <TouchableOpacity
                      style={styles.addExtraButton}
                      onPress={() =>
                        setModalExtraRefeicaoId(matchRefDiario?.id || refeicao?.id || refId)
                      }
                      activeOpacity={0.7}
                    >
                      <Plus size={13} color="#0f766e" />
                      <Text style={styles.addExtraButtonText}>Adicionar item consumido</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
              )}
            </View>

            {/* AVISO DE CONSUMO / ORIENTAÇÃO */}
            <View style={styles.tipCard}>
              <CheckCircle2 size={16} color="#b45309" />
              <Text style={styles.tipText}>
                <Text style={{ fontWeight: "600" }}>Dica do seu Médico: </Text>
                Se tiver dúvidas sobre substituições de alimentos ou sentir
                desconfortos, envie uma mensagem para a equipe médica no chat da
                clínica.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* 3. BOTTOM NAVIGATION UNIFICADA (CLÍNICA FAAZ) */}
      <BottomTabBar
        activeTab="Dieta"
        onTabPress={(tab) => {
          if (onTabPress) {
            onTabPress(tab);
          } else if (tab === "Hoje" && onBack) {
            onBack();
          }
        }}
      />

      {/* MODAL DE BUSCA LIVRE (TABELA TACO) PARA SUBSTITUIÇÃO ANCORADA */}
      <AdicionarAlimentoModal
        visible={itemParaSubstituir !== null}
        refeicaoNome={
          itemParaSubstituir
            ? `Substituir: ${itemParaSubstituir.itemNome}`
            : "Substituição"
        }
        onClose={() => setItemParaSubstituir(null)}
        onConfirm={handleConfirmarSubstituicao}
      />

      {/* MODAL DE BUSCA LIVRE (TABELA TACO) PARA ADICIONAR ITEM EXTRA */}
      <AdicionarAlimentoModal
        visible={modalExtraRefeicaoId !== null}
        refeicaoNome="Refeição"
        onClose={() => setModalExtraRefeicaoId(null)}
        onConfirm={handleConfirmarAdicionarExtra}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    backgroundColor: "#0f172a",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingRight: 8,
  },
  backButtonText: {
    color: "#2dd4bf",
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 2,
  },
  headerCenter: {
    alignItems: "center",
  },
  headerBrand: {
    color: "#2dd4bf",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(45, 212, 191, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(45, 212, 191, 0.3)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    gap: 4,
  },
  headerBadgeText: {
    color: "#2dd4bf",
    fontSize: 10,
    fontWeight: "500",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 110,
    gap: 14,
  },
  bannerCard: {
    backgroundColor: "#091e1d",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(45, 212, 191, 0.25)",
  },
  bannerBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  badgeAtivo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(45, 212, 191, 0.15)",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(45, 212, 191, 0.3)",
  },
  badgeAtivoText: {
    color: "#5eead4",
    fontSize: 10,
    fontWeight: "500",
  },
  pacienteNomeHeader: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "400",
  },
  planoTitulo: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  planoObjetivo: {
    color: "#ccfbf1",
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17,
  },
  bannerDivider: {
    height: 1,
    backgroundColor: "rgba(45, 212, 191, 0.15)",
    marginVertical: 10,
  },
  medicoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  medicoText: {
    color: "#94a3b8",
    fontSize: 11,
  },
  medicoNome: {
    color: "#e2e8f0",
    fontWeight: "600",
  },
  especialidadeText: {
    color: "#2dd4bf",
    fontSize: 11,
    fontWeight: "400",
  },
  centerBox: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "400",
  },
  errorCard: {
    backgroundColor: "#fff1f2",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#fecdd3",
    gap: 8,
  },
  errorTitle: {
    color: "#881337",
    fontSize: 13,
    fontWeight: "600",
  },
  errorText: {
    color: "#9f1239",
    fontSize: 12,
    textAlign: "center",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#5eead4",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginTop: 6,
  },
  retryButtonText: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "600",
  },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  emptyTitle: {
    color: "#1e293b",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyText: {
    color: "#4b5563",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionHint: {
    color: "#0f766e",
    fontSize: 11,
    fontWeight: "500",
  },
  pillsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    paddingVertical: 4,
  },
  pillButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    maxWidth: "100%",
  },
  pillButtonActive: {
    backgroundColor: "#0f766e",
    shadowColor: "#0f766e",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  pillButtonInactive: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  pillText: {
    fontSize: 12,
    fontWeight: "500",
    flexShrink: 1,
  },
  pillTextActive: {
    color: "#ffffff",
  },
  pillTextInactive: {
    color: "#334155",
  },
  pillDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#5eead4",
    marginLeft: 2,
  },
  variacaoDescricao: {
    color: "#64748b",
    fontSize: 11,
    fontStyle: "italic",
    paddingHorizontal: 2,
  },
  summaryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  summaryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  summaryTopLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  summaryTopLabel: {
    color: "#1e293b",
    fontSize: 12,
    fontWeight: "600",
  },
  summaryCalories: {
    color: "#0f766e",
    fontSize: 15,
    fontWeight: "700",
  },
  macrosGrid: {
    flexDirection: "row",
    gap: 8,
  },
  macroBox: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    paddingVertical: 7,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  macroLabel: {
    color: "#4b5563",
    fontSize: 10,
    fontWeight: "500",
    textTransform: "uppercase",
  },
  macroValue: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  mealsList: {
    gap: 12,
  },
  mealCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  mealCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  mealLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  mealIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#ccfbf1",
    alignItems: "center",
    justifyContent: "center",
  },
  mealName: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "600",
  },
  mealTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  mealTime: {
    color: "#4b5563",
    fontSize: 11,
    fontWeight: "400",
  },
  mealCaloriesBadge: {
    alignItems: "flex-end",
  },
  mealCaloriesText: {
    backgroundColor: "#ccfbf1",
    color: "#0f766e",
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  mealMacrosText: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "400",
    marginTop: 2,
  },
  mealNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(204, 251, 241, 0.4)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#ccfbf1",
  },
  mealNoteText: {
    flex: 1,
    color: "#134e4a",
    fontSize: 11,
    lineHeight: 15,
  },
  mealItemsList: {
    padding: 12,
    gap: 8,
  },
  emptyItemsText: {
    color: "#94a3b8",
    fontSize: 11,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 6,
  },
  foodRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  foodInfoCol: {
    flex: 1,
    paddingRight: 10,
  },
  foodName: {
    color: "#1e293b",
    fontSize: 12,
    fontWeight: "500",
  },
  foodPortionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  portionBadge: {
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  portionBadgeText: {
    color: "#166534",
    fontSize: 10,
    fontWeight: "500",
  },
  foodObservation: {
    color: "#64748b",
    fontSize: 11,
    flex: 1,
  },
  foodCaloriesCol: {
    alignItems: "flex-end",
  },
  foodCalories: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "600",
  },
  foodMacros: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "400",
    marginTop: 1,
  },
  foodItemContainer: {
    gap: 6,
  },
  foodRowSubstituted: {
    backgroundColor: "#f8fafc",
    opacity: 0.65,
    borderStyle: "dashed",
  },
  foodNameSubstituted: {
    textDecorationLine: "line-through",
    color: "#94a3b8",
  },
  portionBadgeSubstituted: {
    backgroundColor: "#f1f5f9",
    borderColor: "#e2e8f0",
  },
  portionBadgeTextSubstituted: {
    color: "#94a3b8",
    textDecorationLine: "line-through",
  },
  foodCaloriesSubstituted: {
    color: "#94a3b8",
    textDecorationLine: "line-through",
  },
  foodMacrosSubstituted: {
    color: "#cbd5e1",
  },
  swapButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    marginLeft: 6,
  },
  swapButtonText: {
    color: "#0f766e",
    fontSize: 11,
    fontWeight: "600",
  },
  substituteBox: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    borderRadius: 12,
    padding: 10,
    marginLeft: 12,
    gap: 8,
  },
  substituteHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  substituteBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#d1fae5",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  substituteBadgeText: {
    color: "#047857",
    fontSize: 10,
    fontWeight: "700",
  },
  substituteContentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  substituteTextCol: {
    flex: 1,
  },
  substituteFoodName: {
    color: "#064e3b",
    fontSize: 12,
    fontWeight: "700",
  },
  substitutePortionText: {
    color: "#059669",
    fontSize: 10,
    fontWeight: "500",
    marginTop: 1,
  },
  substituteCaloriesCol: {
    alignItems: "flex-end",
  },
  substituteCaloriesText: {
    color: "#065f46",
    fontSize: 12,
    fontWeight: "700",
  },
  substituteMacrosText: {
    color: "#047857",
    fontSize: 9,
    fontWeight: "500",
    marginTop: 1,
  },
  mealCardConsumido: {
    borderColor: "#0f766e",
    backgroundColor: "#ffffff",
  },
  diarioSummaryBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 10,
    gap: 8,
  },
  diarioSummaryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  diarioIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#fef3c7",
    alignItems: "center",
    justifyContent: "center",
  },
  diarioSummaryTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
  },
  diarioSummarySubtitle: {
    fontSize: 10,
    fontWeight: "500",
    color: "#64748b",
    marginTop: 1,
  },
  diarioRestantePill: {
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  diarioRestantePillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#166534",
  },
  mealHeaderRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkinButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#99f6e4",
  },
  checkinButtonActive: {
    backgroundColor: "#0f766e",
    borderColor: "#0f766e",
  },
  checkinButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0f766e",
  },
  checkinButtonTextActive: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
  },
  mealIconCircleActive: {
    backgroundColor: "#0f766e",
  },
  extraItemsBox: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: "#f8fafc",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    gap: 6,
  },
  extraItemsHeaderLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#0f766e",
    letterSpacing: 0.5,
  },
  extraItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  deleteExtraBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: "#ffe4e6",
    marginLeft: 4,
  },
  addExtraButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 7,
    marginHorizontal: 12,
    marginBottom: 10,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
  },
  addExtraButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0f766e",
  },
  tipCard: {
    backgroundColor: "#fffbeb",
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderColor: "#fef3c7",
  },
  tipText: {
    flex: 1,
    color: "#78350f",
    fontSize: 11,
    lineHeight: 16,
  },
  bottomNavContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 64,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 16,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  bottomNavTab: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  bottomNavLabel: {
    fontSize: 10,
    marginTop: 3,
    fontWeight: "500",
  },
  bottomNavLabelActive: {
    color: "#0f766e",
  },
  bottomNavLabelInactive: {
    color: "#94a3b8",
  },
});

export default DietaScreen;

