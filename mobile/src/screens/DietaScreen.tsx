import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Share,
  Alert,
} from "react-native";
import {
  Utensils,
  ShoppingBag,
  Clock,
  Check,
  CheckCircle2,
  ArrowLeftRight,
  Circle,
  FileText,
  ChevronDown,
  ChevronUp,
  Share2,
  CheckSquare,
  Square,
  Sparkles,
  AlertCircle,
  RotateCcw,
} from "lucide-react-native";
import { StandardHeader } from "../components/StandardHeader";
import { BottomTabBar } from "../components/BottomTabBar";
import { FoodThumbnail } from "../components/FoodThumbnail";
import { TrocasModal } from "../components/TrocasModal";
import { useDiarioAlimentar } from "../contexts/DiarioAlimentarContext";
import {
  CheckinRefeicaoStatus,
  ItemRefeicaoApi,
  RefeicaoApi,
} from "../services/api";
import {
  calcularTotaisEfetivosRefeicao,
  consolidarListaCompras,
  formatHorarioCurto,
  formatNumeroPtBr,
  gerarTextoCompartilhamentoCompras,
  getItemEfetivo,
  selecionarRefeicaoMaisProximaAgora,
} from "../utils/dietaHelpers";

export interface DietaScreenProps {
  pacienteId?: string;
  pacienteNome?: string;
  onBack?: () => void;
  onTabPress?: (tab: string) => void;
}

type SubAbaDieta = "cardapio" | "compras";

function getNomeCurtoRefeicao(nome?: string | null): string {
  const clean = (nome || "Refeição").trim();
  const lower = clean.toLowerCase();
  if (lower.includes("café") || lower.includes("desjejum")) return "Café";
  if (lower.includes("colação") || lower.includes("manhã")) return "Colação";
  if (lower.includes("almoço")) return "Almoço";
  if (lower.includes("pré-treino") || lower.includes("pre-treino")) return "Pré-treino";
  if (lower.includes("pós-treino") || lower.includes("pos-treino")) return "Pós-treino";
  if (lower.includes("lanche")) return "Lanche";
  if (lower.includes("jantar")) return "Jantar";
  if (lower.includes("ceia")) return "Ceia";
  const primeiraPalavra = clean.split(/\s+/)[0] || clean;
  return primeiraPalavra.length > 10
    ? `${primeiraPalavra.slice(0, 9)}…`
    : primeiraPalavra;
}

function getStatusBadgeConfig(status?: CheckinRefeicaoStatus | null) {
  if (status === "SEGUI") {
    return {
      label: "Segui",
      bg: "#ecfdf5",
      border: "#a7f3d0",
      color: "#047857",
    };
  }
  if (status === "FIZ_TROCA") {
    return {
      label: "Fiz troca",
      bg: "#ecfeff",
      border: "#a5f3fc",
      color: "#0e7490",
    };
  }
  if (status === "NAO_FIZ") {
    return {
      label: "Não fiz",
      bg: "#f1f5f9",
      border: "#cbd5e1",
      color: "#475569",
    };
  }
  return null;
}

export function DietaScreen({ onTabPress }: DietaScreenProps) {
  const {
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
    carregando,
    salvandoRefeicaoId,
    erroDieta,
    registrarCheckinRefeicao,
    aplicarTrocaItem,
    recarregarDiario,
  } = useDiarioAlimentar();

  const [subAba, setSubAba] = useState<SubAbaDieta>("cardapio");
  const [refeicaoSelecionadaId, setRefeicaoSelecionadaId] = useState<
    string | null
  >(null);
  const [refreshing, setRefreshing] = useState(false);
  const [resumoAberto, setResumoAberto] = useState(false);
  const [itensCarrinho, setItensCarrinho] = useState<Record<string, boolean>>(
    {}
  );

  // Controle do modal de substituições 1:N
  const [itemModalTroca, setItemModalTroca] = useState<{
    refeicaoId: string;
    item: ItemRefeicaoApi;
  } | null>(null);

  const ultimaVariacaoAutoSelectRef = useRef<string | null>(null);
  const timelineScrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(
    null
  );

  // Sincronização silenciosa ao abrir a aba Dieta (sem spinner nem sobrescrever estado otimista)
  useEffect(() => {
    void recarregarDiario(true);
  }, [recarregarDiario]);

  // Modo "Agora": ao abrir a tela ou trocar de variação, seleciona automaticamente
  // a refeição mais próxima do horário atual do dispositivo.
  useEffect(() => {
    if (!refeicoesEstruturadas.length) {
      setRefeicaoSelecionadaId(null);
      return;
    }

    const variacaoMudou =
      ultimaVariacaoAutoSelectRef.current !== (variacaoAtivaId || null);
    const selecaoAindaExiste = refeicoesEstruturadas.some(
      (r) => r.id === refeicaoSelecionadaId
    );

    if (variacaoMudou || !selecaoAindaExiste) {
      const proxima = selecionarRefeicaoMaisProximaAgora(refeicoesEstruturadas);
      const alvoId = proxima?.id ?? refeicoesEstruturadas[0].id;
      setRefeicaoSelecionadaId(alvoId);
      ultimaVariacaoAutoSelectRef.current = variacaoAtivaId || null;
      setResumoAberto(false);

      const idxAlvo = refeicoesEstruturadas.findIndex((r) => r.id === alvoId);
      if (idxAlvo > 1) {
        setTimeout(() => {
          timelineScrollRef.current?.scrollTo({
            x: Math.max(0, idxAlvo * 82 - 36),
            animated: true,
          });
        }, 120);
      }
    }
  }, [refeicoesEstruturadas, variacaoAtivaId, refeicaoSelecionadaId]);

  const refeicaoAtiva: RefeicaoApi | null = useMemo(() => {
    if (!refeicoesEstruturadas.length) return null;
    return (
      refeicoesEstruturadas.find((r) => r.id === refeicaoSelecionadaId) ||
      refeicoesEstruturadas[0]
    );
  }, [refeicoesEstruturadas, refeicaoSelecionadaId]);

  const checkinRefeicaoAtiva = refeicaoAtiva
    ? checkinsPorRefeicao[refeicaoAtiva.id] || null
    : null;

  const totaisRefeicaoAtiva = useMemo(() => {
    if (!refeicaoAtiva) return null;
    return calcularTotaisEfetivosRefeicao(refeicaoAtiva, trocasSelecionadas);
  }, [refeicaoAtiva, trocasSelecionadas]);

  // Lista de compras consolidada automaticamente da variação ativa
  const listaCompras = useMemo(
    () => consolidarListaCompras(variacaoAtiva, trocasSelecionadas),
    [variacaoAtiva, trocasSelecionadas]
  );

  const totalCarrinhoMarcados = useMemo(
    () => listaCompras.filter((i) => Boolean(itensCarrinho[i.chave])).length,
    [listaCompras, itensCarrinho]
  );

  const temTrocasNaListaCompras = useMemo(
    () => listaCompras.some((i) => i.origemTroca),
    [listaCompras]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await recarregarDiario(true);
    } finally {
      setRefreshing(false);
    }
  }, [recarregarDiario]);

  const handleCheckin = useCallback(
    async (status: CheckinRefeicaoStatus) => {
      if (!refeicaoAtiva) return;
      const ok = await registrarCheckinRefeicao(refeicaoAtiva.id, status);
      if (!ok) {
        Alert.alert(
          "Conexão instável",
          "Não foi possível salvar seu check-in agora. Tente novamente em instantes."
        );
      }
    },
    [refeicaoAtiva, registrarCheckinRefeicao]
  );

  const handleToggleItemCarrinho = useCallback((chave: string) => {
    setItensCarrinho((prev) => ({
      ...prev,
      [chave]: !prev[chave],
    }));
  }, []);

  const handleCompartilharCompras = useCallback(async () => {
    if (listaCompras.length === 0) return;
    const tituloPlano =
      plano?.titulo || plano?.nome || "Plano Alimentar";
    const mensagem = gerarTextoCompartilhamentoCompras(
      tituloPlano,
      variacoes.length > 1 ? variacaoAtiva?.nome : null,
      listaCompras,
      itensCarrinho
    );
    try {
      await Share.share({
        title: "Lista de Compras — Clínica FAAZ",
        message: mensagem,
      });
    } catch {
      // Usuário cancelou ou share indisponível
    }
  }, [listaCompras, plano, variacoes.length, variacaoAtiva?.nome, itensCarrinho]);

  const medicoResponsavel =
    pacienteDieta?.medico?.trim() || "Equipe Clínica FAAZ";

  const tituloPlanoHeader =
    plano?.titulo?.trim() || plano?.nome?.trim() || "Prescrição nutricional";

  const statusBadgeAtivo = getStatusBadgeConfig(checkinRefeicaoAtiva?.status);

  // Texto limpo da barra de progresso no topo do Cardápio
  const textoProgressoDia = useMemo(() => {
    const {
      obrigatoriasTotal,
      obrigatoriasConcluidas,
      opcionaisTotal,
      opcionaisConcluidas,
    } = progressoRefeicoes;

    if (obrigatoriasTotal === 0 && opcionaisTotal > 0) {
      return `${opcionaisConcluidas} de ${opcionaisTotal} refeições opcionais concluídas hoje`;
    }
    return `${obrigatoriasConcluidas} de ${obrigatoriasTotal} refeições concluídas hoje`;
  }, [progressoRefeicoes]);

  const headerBadgeAdesao = useMemo(() => {
    if (!plano || refeicoesEstruturadas.length === 0) return null;
    const denom =
      progressoRefeicoes.obrigatoriasTotal > 0
        ? progressoRefeicoes.obrigatoriasTotal
        : progressoRefeicoes.opcionaisTotal;
    const num =
      progressoRefeicoes.obrigatoriasTotal > 0
        ? Math.min(progressoRefeicoes.totalConcluidas, denom)
        : progressoRefeicoes.opcionaisConcluidas;

    return (
      <View style={styles.headerProgressPill}>
        <CheckCircle2 size={12} color="#2dd4bf" />
        <Text style={styles.headerProgressText}>
          {num}/{denom} hoje
        </Text>
      </View>
    );
  }, [plano, refeicoesEstruturadas.length, progressoRefeicoes]);

  return (
    <View style={styles.root}>
      {/* 1. CABEÇALHO ESCURO EXECUTIVO UNIFICADO (SEM VOLTAR) */}
      <StandardHeader
        title="Guia da Dieta"
        subtitle={tituloPlanoHeader}
        rightElement={headerBadgeAdesao}
      />

      {/* 2. SELETOR SEGMENTADO COMPACTO: CARDÁPIO | COMPRAS */}
      <View style={styles.topControlsWrap}>
        <View style={styles.segmentedTrack}>
          <TouchableOpacity
            activeOpacity={0.82}
            onPress={() => setSubAba("cardapio")}
            style={[
              styles.segmentedBtn,
              subAba === "cardapio" && styles.segmentedBtnActive,
            ]}
          >
            <Utensils
              size={14}
              color={subAba === "cardapio" ? "#0f766e" : "#64748b"}
            />
            <Text
              style={[
                styles.segmentedText,
                subAba === "cardapio" && styles.segmentedTextActive,
              ]}
            >
              Cardápio
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.82}
            onPress={() => setSubAba("compras")}
            style={[
              styles.segmentedBtn,
              subAba === "compras" && styles.segmentedBtnActive,
            ]}
          >
            <ShoppingBag
              size={14}
              color={subAba === "compras" ? "#0f766e" : "#64748b"}
            />
            <Text
              style={[
                styles.segmentedText,
                subAba === "compras" && styles.segmentedTextActive,
              ]}
            >
              Compras
            </Text>
            {listaCompras.length > 0 ? (
              <View
                style={[
                  styles.segmentedCountPill,
                  subAba === "compras" && styles.segmentedCountPillActive,
                ]}
              >
                <Text
                  style={[
                    styles.segmentedCountText,
                    subAba === "compras" && styles.segmentedCountTextActive,
                  ]}
                >
                  {listaCompras.length}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        {/* Pílulas discretas de variação (exibidas apenas quando houver > 1 variação) */}
        {variacoes.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.variationsRow}
          >
            {variacoes.map((variacao, idx) => {
              const isAtiva = variacao.id === variacaoAtiva?.id;
              return (
                <TouchableOpacity
                  key={variacao.id}
                  activeOpacity={0.8}
                  onPress={() => selecionarVariacao(variacao.id)}
                  style={[
                    styles.variationPill,
                    isAtiva && styles.variationPillActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.variationPillText,
                      isAtiva && styles.variationPillTextActive,
                    ]}
                  >
                    {variacao.nome || `Opção ${idx + 1}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      {/* 3. CORPO PRINCIPAL */}
      {carregando && !plano ? (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color="#0f766e" />
          <Text style={styles.stateTitle}>Carregando seu plano alimentar...</Text>
        </View>
      ) : erroDieta && !plano ? (
        <View style={styles.centeredState}>
          <View style={styles.emptyIconCircle}>
            <AlertCircle size={26} color="#0f766e" />
          </View>
          <Text style={styles.stateTitle}>Não foi possível abrir a dieta</Text>
          <Text style={styles.stateSubtitle}>{erroDieta}</Text>
          <TouchableOpacity
            activeOpacity={0.82}
            onPress={() => recarregarDiario(false)}
            style={styles.retryBtn}
          >
            <RotateCcw size={15} color="#ffffff" />
            <Text style={styles.retryBtnText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : !plano || refeicoesEstruturadas.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.centeredState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#0f766e"
              colors={["#0f766e"]}
            />
          }
        >
          <View style={styles.emptyIconCircle}>
            <Utensils size={26} color="#0f766e" />
          </View>
          <Text style={styles.stateTitle}>Plano alimentar em preparo</Text>
          <Text style={styles.stateSubtitle}>
            Assim que {medicoResponsavel} publicar sua prescrição alimentar,
            suas refeições e trocas aparecerão aqui automaticamente.
          </Text>
        </ScrollView>
      ) : subAba === "cardapio" ? (
        /* ============================================================== */
        /* ABA 1: CARDÁPIO — MODO "AGORA" + LINHA DO TEMPO + CHECK-IN 3s  */
        /* ============================================================== */
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#0f766e"
              colors={["#0f766e"]}
            />
          }
        >
          {/* Barra de Progresso Discreta do Dia */}
          <View style={styles.progressBarCard}>
            <View style={styles.progressTopLine}>
              <View style={styles.progressLabelRow}>
                <Text style={styles.progressText}>{textoProgressoDia}</Text>
                {progressoRefeicoes.opcionaisConcluidas > 0 &&
                progressoRefeicoes.obrigatoriasTotal > 0 ? (
                  <View style={styles.bonusPill}>
                    <Sparkles size={10} color="#047857" />
                    <Text style={styles.bonusPillText}>
                      +{progressoRefeicoes.opcionaisConcluidas} bônus
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.progressPercentText}>
                {progressoRefeicoes.percentualAdesao}%
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${progressoRefeicoes.percentualAdesao}%` },
                ]}
              />
            </View>
          </View>

          {/* Seletor Horizontal de Horários (Linha do Tempo) */}
          <ScrollView
            ref={timelineScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.timelineRow}
          >
            {refeicoesEstruturadas.map((ref) => {
              const isSelected = ref.id === refeicaoAtiva?.id;
              const status = checkinsPorRefeicao[ref.id]?.status ?? null;
              const horaCurta = formatHorarioCurto(ref.horario);
              const rotuloCurto = getNomeCurtoRefeicao(ref.nome);

              return (
                <TouchableOpacity
                  key={ref.id}
                  activeOpacity={0.82}
                  onPress={() => {
                    setRefeicaoSelecionadaId(ref.id);
                    setResumoAberto(false);
                  }}
                  style={[
                    styles.timelinePill,
                    isSelected && styles.timelinePillSelected,
                    !isSelected &&
                      status === "SEGUI" &&
                      styles.timelinePillDone,
                    !isSelected &&
                      status === "FIZ_TROCA" &&
                      styles.timelinePillSwap,
                  ]}
                >
                  <View style={styles.timelinePillTop}>
                    <Text
                      style={[
                        styles.timelineTime,
                        isSelected && styles.timelineTimeSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {horaCurta || rotuloCurto}
                    </Text>

                    {status === "SEGUI" ? (
                      <CheckCircle2
                        size={13}
                        color={isSelected ? "#2dd4bf" : "#059669"}
                        strokeWidth={2.4}
                      />
                    ) : status === "FIZ_TROCA" ? (
                      <ArrowLeftRight
                        size={13}
                        color={isSelected ? "#67e8f9" : "#0891b2"}
                        strokeWidth={2.4}
                      />
                    ) : status === "NAO_FIZ" ? (
                      <Circle
                        size={12}
                        color={isSelected ? "#94a3b8" : "#94a3b8"}
                        strokeWidth={2}
                      />
                    ) : (
                      <View
                        style={[
                          styles.timelinePendingDot,
                          isSelected && styles.timelinePendingDotSelected,
                        ]}
                      />
                    )}
                  </View>

                  {horaCurta ? (
                    <Text
                      style={[
                        styles.timelineShortName,
                        isSelected && styles.timelineShortNameSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {rotuloCurto}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Card Principal da Refeição Selecionada */}
          {refeicaoAtiva ? (
            <View style={styles.mealCard}>
              {/* Cabeçalho do Card da Refeição */}
              <View style={styles.mealCardHeader}>
                <View style={styles.mealTitleBlock}>
                  <View style={styles.mealNameRow}>
                    <Text style={styles.mealNameTitle}>
                      {refeicaoAtiva.nome}
                    </Text>
                    {refeicaoAtiva.opcional ? (
                      <View style={styles.opcionalBadge}>
                        <Text style={styles.opcionalBadgeText}>Opcional</Text>
                      </View>
                    ) : null}
                  </View>

                  {formatHorarioCurto(refeicaoAtiva.horario) ? (
                    <View style={styles.mealTimeRow}>
                      <Clock size={12} color="#64748b" />
                      <Text style={styles.mealTimeLabel}>
                        Horário sugerido:{" "}
                        {formatHorarioCurto(refeicaoAtiva.horario)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {statusBadgeAtivo ? (
                  <View
                    style={[
                      styles.mealStatusChip,
                      {
                        backgroundColor: statusBadgeAtivo.bg,
                        borderColor: statusBadgeAtivo.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.mealStatusChipText,
                        { color: statusBadgeAtivo.color },
                      ]}
                    >
                      {statusBadgeAtivo.label}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Lista Limpa de Alimentos */}
              <View style={styles.itemsList}>
                {Array.isArray(refeicaoAtiva.itens) &&
                refeicaoAtiva.itens.length > 0 ? (
                  refeicaoAtiva.itens.map((item, idx) => {
                    const eff = getItemEfetivo(item, trocasSelecionadas);
                    const temTrocas = eff.totalSubstituicoes > 0;
                    const isLast = idx === (refeicaoAtiva.itens?.length || 1) - 1;

                    return (
                      <View
                        key={item.id}
                        style={[
                          styles.foodItemRow,
                          !isLast && styles.foodItemDivider,
                        ]}
                      >
                        <FoodThumbnail
                          nome={eff.nome}
                          categoria={eff.categoria}
                          imageUrl={eff.thumbnailUrl}
                          size={46}
                          style={styles.foodThumb}
                        />

                        <View style={styles.foodItemContent}>
                          <View style={styles.foodNameTopRow}>
                            <Text style={styles.foodNameText} numberOfLines={2}>
                              {eff.nome}
                            </Text>
                            {eff.isTrocado ? (
                              <View style={styles.swapAppliedTag}>
                                <Text style={styles.swapAppliedTagText}>
                                  Troca aplicada
                                </Text>
                              </View>
                            ) : null}
                          </View>

                          <Text style={styles.foodMeasureText}>
                            {eff.medidaEfetivaTexto}
                          </Text>

                          {eff.isTrocado ? (
                            <Text
                              style={styles.foodOriginalHint}
                              numberOfLines={1}
                            >
                              Original: {eff.nomeOriginal} (
                              {eff.medidaOriginalTexto})
                            </Text>
                          ) : null}

                          {temTrocas ? (
                            <TouchableOpacity
                              activeOpacity={0.78}
                              onPress={() =>
                                setItemModalTroca({
                                  refeicaoId: refeicaoAtiva.id,
                                  item,
                                })
                              }
                              style={[
                                styles.swapTriggerPill,
                                eff.isTrocado && styles.swapTriggerPillActive,
                              ]}
                            >
                              <ArrowLeftRight
                                size={12}
                                color={eff.isTrocado ? "#0e7490" : "#0f766e"}
                              />
                              <Text
                                style={[
                                  styles.swapTriggerText,
                                  eff.isTrocado &&
                                    styles.swapTriggerTextActive,
                                ]}
                              >
                                {eff.isTrocado
                                  ? `Trocar ou restaurar (${eff.totalSubstituicoes})`
                                  : eff.totalSubstituicoes === 1
                                    ? "1 troca"
                                    : `${eff.totalSubstituicoes} trocas`}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <View style={styles.noItemsBox}>
                    <Text style={styles.noItemsText}>
                      Nenhum alimento listado nesta refeição.
                    </Text>
                  </View>
                )}
              </View>

              {/* Bloco de Observações de Preparo (somente se preenchido) */}
              {refeicaoAtiva.observacoes &&
              refeicaoAtiva.observacoes.trim().length > 0 ? (
                <View style={styles.prepNotesCard}>
                  <View style={styles.prepNotesHeader}>
                    <FileText size={14} color="#0f766e" />
                    <Text style={styles.prepNotesTitle}>
                      Orientação de preparo
                    </Text>
                  </View>
                  <Text style={styles.prepNotesBody}>
                    {refeicaoAtiva.observacoes.trim()}
                  </Text>
                </View>
              ) : null}

              {/* Rodapé de Check-in em 3 Segundos */}
              <View style={styles.checkinFooter}>
                <View style={styles.checkinHeaderLine}>
                  <Text style={styles.checkinPrompt}>
                    {checkinRefeicaoAtiva
                      ? "Check-in registrado hoje"
                      : "Como foi esta refeição?"}
                  </Text>
                  {salvandoRefeicaoId === refeicaoAtiva.id ? (
                    <ActivityIndicator size="small" color="#0f766e" />
                  ) : null}
                </View>

                <View style={styles.checkinButtonsRow}>
                  {/* Botão 1: ✓ Segui */}
                  <TouchableOpacity
                    activeOpacity={0.82}
                    disabled={salvandoRefeicaoId === refeicaoAtiva.id}
                    onPress={() => handleCheckin("SEGUI")}
                    style={[
                      styles.checkinBtn,
                      checkinRefeicaoAtiva?.status === "SEGUI" &&
                        styles.checkinBtnSeguiActive,
                    ]}
                  >
                    <Check
                      size={15}
                      color={
                        checkinRefeicaoAtiva?.status === "SEGUI"
                          ? "#ffffff"
                          : "#059669"
                      }
                      strokeWidth={2.5}
                    />
                    <Text
                      style={[
                        styles.checkinBtnText,
                        checkinRefeicaoAtiva?.status === "SEGUI" &&
                          styles.checkinBtnTextActive,
                      ]}
                    >
                      Segui
                    </Text>
                  </TouchableOpacity>

                  {/* Botão 2: ⇄ Fiz troca */}
                  <TouchableOpacity
                    activeOpacity={0.82}
                    disabled={salvandoRefeicaoId === refeicaoAtiva.id}
                    onPress={() => handleCheckin("FIZ_TROCA")}
                    style={[
                      styles.checkinBtn,
                      checkinRefeicaoAtiva?.status === "FIZ_TROCA" &&
                        styles.checkinBtnTrocaActive,
                    ]}
                  >
                    <ArrowLeftRight
                      size={14}
                      color={
                        checkinRefeicaoAtiva?.status === "FIZ_TROCA"
                          ? "#ffffff"
                          : "#0891b2"
                      }
                      strokeWidth={2.3}
                    />
                    <Text
                      style={[
                        styles.checkinBtnText,
                        checkinRefeicaoAtiva?.status === "FIZ_TROCA" &&
                          styles.checkinBtnTextActive,
                      ]}
                    >
                      Fiz troca
                    </Text>
                  </TouchableOpacity>

                  {/* Botão 3: ○ Não fiz */}
                  <TouchableOpacity
                    activeOpacity={0.82}
                    disabled={salvandoRefeicaoId === refeicaoAtiva.id}
                    onPress={() => handleCheckin("NAO_FIZ")}
                    style={[
                      styles.checkinBtn,
                      checkinRefeicaoAtiva?.status === "NAO_FIZ" &&
                        styles.checkinBtnNaoFizActive,
                    ]}
                  >
                    <Circle
                      size={13}
                      color={
                        checkinRefeicaoAtiva?.status === "NAO_FIZ"
                          ? "#ffffff"
                          : "#64748b"
                      }
                      strokeWidth={2.2}
                    />
                    <Text
                      style={[
                        styles.checkinBtnText,
                        checkinRefeicaoAtiva?.status === "NAO_FIZ" &&
                          styles.checkinBtnTextActive,
                      ]}
                    >
                      Não fiz
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.checkinHelperText}>
                  Segui e Fiz troca contam 100% na sua consistência de hoje.
                </Text>
              </View>

              {/* Resumo Nutricional Discreto (Expansível, fechado por padrão) */}
              {totaisRefeicaoAtiva && totaisRefeicaoAtiva.calorias > 0 ? (
                <View style={styles.nutritionAccordion}>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setResumoAberto((prev) => !prev)}
                    style={styles.nutritionToggleBtn}
                  >
                    <Text style={styles.nutritionToggleText}>
                      Ver resumo nutricional
                    </Text>
                    {resumoAberto ? (
                      <ChevronUp size={15} color="#64748b" />
                    ) : (
                      <ChevronDown size={15} color="#64748b" />
                    )}
                  </TouchableOpacity>

                  {resumoAberto ? (
                    <Text style={styles.nutritionSummaryLine}>
                      ~{totaisRefeicaoAtiva.calorias} kcal · P{" "}
                      {totaisRefeicaoAtiva.proteinas}g · C{" "}
                      {totaisRefeicaoAtiva.carboidratos}g · G{" "}
                      {totaisRefeicaoAtiva.gorduras}g
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Rodapé discreto de autoria clínica */}
          <Text style={styles.clinicalFooter}>
            Prescrição acompanhada por {medicoResponsavel}
          </Text>
        </ScrollView>
      ) : (
        /* ============================================================== */
        /* ABA 2: COMPRAS — LISTA CONSOLIDADA AUTOMÁTICA + SHARE NATIVO   */
        /* ============================================================== */
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#0f766e"
              colors={["#0f766e"]}
            />
          }
        >
          {/* Cabeçalho da Lista de Compras */}
          <View style={styles.shoppingHeroCard}>
            <View style={styles.shoppingHeroTop}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.shoppingTitle}>Lista de Compras do Dia</Text>
                <Text style={styles.shoppingSubtitle}>
                  {variacaoAtiva?.nome
                    ? `${variacaoAtiva.nome} · ${listaCompras.length} itens consolidados`
                    : `${listaCompras.length} itens consolidados`}
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.82}
                onPress={handleCompartilharCompras}
                disabled={listaCompras.length === 0}
                style={[
                  styles.shareBtn,
                  listaCompras.length === 0 && styles.shareBtnDisabled,
                ]}
              >
                <Share2 size={14} color="#ffffff" />
                <Text style={styles.shareBtnText}>Compartilhar lista</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.shoppingMetaRow}>
              <Text style={styles.shoppingCountLabel}>
                {totalCarrinhoMarcados} de {listaCompras.length} no carrinho
              </Text>

              {temTrocasNaListaCompras ? (
                <View style={styles.shoppingSwapHint}>
                  <ArrowLeftRight size={11} color="#0e7490" />
                  <Text style={styles.shoppingSwapHintText}>
                    Com suas trocas
                  </Text>
                </View>
              ) : null}

              {totalCarrinhoMarcados > 0 ? (
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => setItensCarrinho({})}
                >
                  <Text style={styles.clearCheckedText}>Limpar</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Lista Interativa de Compras */}
          <View style={styles.shoppingListCard}>
            {listaCompras.length === 0 ? (
              <View style={styles.noItemsBox}>
                <Text style={styles.noItemsText}>
                  Nenhum item disponível para gerar lista de compras.
                </Text>
              </View>
            ) : (
              listaCompras.map((item, idx) => {
                const checked = Boolean(itensCarrinho[item.chave]);
                const isLast = idx === listaCompras.length - 1;
                const qtdTexto = `${formatNumeroPtBr(item.quantidadeTotal)} ${item.unidade}`;

                return (
                  <TouchableOpacity
                    key={item.chave}
                    activeOpacity={0.78}
                    onPress={() => handleToggleItemCarrinho(item.chave)}
                    style={[
                      styles.shoppingItemRow,
                      !isLast && styles.foodItemDivider,
                      checked && styles.shoppingItemRowChecked,
                    ]}
                  >
                    {checked ? (
                      <CheckSquare size={20} color="#059669" />
                    ) : (
                      <Square size={20} color="#94a3b8" />
                    )}

                    <FoodThumbnail
                      nome={item.nome}
                      categoria={item.categoria}
                      imageUrl={item.thumbnailUrl}
                      size={38}
                      style={[styles.shoppingThumb, checked && { opacity: 0.55 }]}
                    />

                    <View style={styles.shoppingItemTextCol}>
                      <View style={styles.shoppingNameLine}>
                        <Text
                          style={[
                            styles.shoppingItemName,
                            checked && styles.shoppingItemNameChecked,
                          ]}
                          numberOfLines={2}
                        >
                          {item.nome}
                        </Text>
                        {item.origemTroca ? (
                          <View style={styles.shoppingSwapBadge}>
                            <Text style={styles.shoppingSwapBadgeText}>
                              Troca
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <Text style={styles.shoppingItemDetail}>
                        {qtdTexto}
                        {item.ocorrencias > 1
                          ? ` · ${item.ocorrencias} refeições`
                          : item.medidaCaseiraHint
                            ? ` · ${item.medidaCaseiraHint}`
                            : ""}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>
      )}

      {/* MODAL BOTTOM SHEET DE SUBSTITUIÇÕES 1:N EM 1 TOQUE */}
      <TrocasModal
        visible={Boolean(itemModalTroca)}
        item={itemModalTroca?.item ?? null}
        substituicaoAtivaId={
          itemModalTroca
            ? trocasSelecionadas[itemModalTroca.item.id] ?? null
            : null
        }
        onSelectSubstituicao={(subId) => {
          if (!itemModalTroca) return;
          void aplicarTrocaItem(
            itemModalTroca.refeicaoId,
            itemModalTroca.item.id,
            subId
          );
        }}
        onClose={() => setItemModalTroca(null)}
      />

      {/* BARRA INFERIOR UNIFICADA */}
      <BottomTabBar
        activeTab="Dieta"
        onTabPress={(tab) => onTabPress?.(tab)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  headerProgressPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(45, 212, 191, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(45, 212, 191, 0.3)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  headerProgressText: {
    color: "#ccfbf1",
    fontSize: 11,
    fontWeight: "700",
  },
  topControlsWrap: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    gap: 10,
  },
  segmentedTrack: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  segmentedBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 9,
  },
  segmentedBtnActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentedText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },
  segmentedTextActive: {
    color: "#0f172a",
    fontWeight: "700",
  },
  segmentedCountPill: {
    backgroundColor: "#e2e8f0",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  segmentedCountPillActive: {
    backgroundColor: "#ccfbf1",
  },
  segmentedCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#475569",
  },
  segmentedCountTextActive: {
    color: "#0f766e",
  },
  variationsRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 1,
  },
  variationPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  variationPillActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  variationPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  variationPillTextActive: {
    color: "#2dd4bf",
    fontWeight: "700",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 14,
  },
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 10,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#99f6e4",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  stateTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
  },
  stateSubtitle: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 19,
  },
  retryBtn: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0f766e",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  // Progresso discreto no topo do Cardápio
  progressBarCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  progressTopLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  progressLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    flex: 1,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
  bonusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  bonusPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#047857",
  },
  progressPercentText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f766e",
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#0d9488",
  },
  // Linha do Tempo de Horários
  timelineRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  timelinePill: {
    minWidth: 74,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 2,
  },
  timelinePillSelected: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 4,
  },
  timelinePillDone: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  timelinePillSwap: {
    backgroundColor: "#ecfeff",
    borderColor: "#a5f3fc",
  },
  timelinePillTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  timelineTime: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  timelineTimeSelected: {
    color: "#ffffff",
  },
  timelineShortName: {
    fontSize: 11,
    fontWeight: "500",
    color: "#64748b",
  },
  timelineShortNameSelected: {
    color: "#99f6e4",
  },
  timelinePendingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#cbd5e1",
  },
  timelinePendingDotSelected: {
    backgroundColor: "#2dd4bf",
  },
  // Card Principal da Refeição
  mealCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  mealCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    gap: 10,
  },
  mealTitleBlock: {
    flex: 1,
    gap: 4,
  },
  mealNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  mealNameTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  opcionalBadge: {
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fde68a",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  opcionalBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#b45309",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  mealTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  mealTimeLabel: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "500",
  },
  mealStatusChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  mealStatusChipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  // Itens da Refeição
  itemsList: {
    paddingHorizontal: 16,
  },
  foodItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 13,
  },
  foodItemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  foodThumb: {
    borderRadius: 11,
    marginTop: 1,
  },
  foodItemContent: {
    flex: 1,
    gap: 3,
  },
  foodNameTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  foodNameText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    lineHeight: 19,
  },
  swapAppliedTag: {
    backgroundColor: "#ecfeff",
    borderWidth: 1,
    borderColor: "#a5f3fc",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  swapAppliedTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0e7490",
  },
  foodMeasureText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f766e",
    lineHeight: 18,
  },
  foodOriginalHint: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 1,
  },
  swapTriggerPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#99f6e4",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  swapTriggerPillActive: {
    backgroundColor: "#ecfeff",
    borderColor: "#67e8f9",
  },
  swapTriggerText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f766e",
  },
  swapTriggerTextActive: {
    color: "#0e7490",
  },
  noItemsBox: {
    paddingVertical: 22,
    alignItems: "center",
  },
  noItemsText: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
  },
  // Observações de Preparo
  prepNotesCard: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    backgroundColor: "#f0fdfa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ccfbf1",
    borderLeftWidth: 3.5,
    borderLeftColor: "#0d9488",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  prepNotesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  prepNotesTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0f766e",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  prepNotesBody: {
    fontSize: 13,
    color: "#1e293b",
    lineHeight: 19,
  },
  // Rodapé de Check-in em 3 segundos
  checkinFooter: {
    backgroundColor: "#f8fafc",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 10,
  },
  checkinHeaderLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  checkinPrompt: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  checkinButtonsRow: {
    flexDirection: "row",
    gap: 8,
  },
  checkinBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  checkinBtnSeguiActive: {
    backgroundColor: "#059669",
    borderColor: "#059669",
  },
  checkinBtnTrocaActive: {
    backgroundColor: "#0891b2",
    borderColor: "#0891b2",
  },
  checkinBtnNaoFizActive: {
    backgroundColor: "#475569",
    borderColor: "#475569",
  },
  checkinBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1e293b",
  },
  checkinBtnTextActive: {
    color: "#ffffff",
  },
  checkinHelperText: {
    fontSize: 11,
    color: "#64748b",
    textAlign: "center",
  },
  // Acordeão discreto de resumo nutricional
  nutritionAccordion: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
    gap: 6,
  },
  nutritionToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 2,
  },
  nutritionToggleText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  nutritionSummaryLine: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
    textAlign: "center",
    paddingBottom: 2,
  },
  clinicalFooter: {
    fontSize: 11,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 2,
  },
  // Aba Compras
  shoppingHeroCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 15,
    gap: 12,
  },
  shoppingHeroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shoppingTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  shoppingSubtitle: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0f766e",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 11,
  },
  shareBtnDisabled: {
    opacity: 0.45,
  },
  shareBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  shoppingMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    gap: 8,
  },
  shoppingCountLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  shoppingSwapHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ecfeff",
    borderWidth: 1,
    borderColor: "#a5f3fc",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  shoppingSwapHintText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0e7490",
  },
  clearCheckedText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f766e",
  },
  shoppingListCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
  },
  shoppingItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 12,
  },
  shoppingItemRowChecked: {
    opacity: 0.72,
  },
  shoppingThumb: {
    borderRadius: 9,
  },
  shoppingItemTextCol: {
    flex: 1,
    gap: 2,
  },
  shoppingNameLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  shoppingItemName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
  },
  shoppingItemNameChecked: {
    textDecorationLine: "line-through",
    color: "#64748b",
  },
  shoppingSwapBadge: {
    backgroundColor: "#ecfeff",
    borderWidth: 1,
    borderColor: "#a5f3fc",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
  },
  shoppingSwapBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0e7490",
  },
  shoppingItemDetail: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0f766e",
  },
});
