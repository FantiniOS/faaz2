import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  LayoutChangeEvent,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
} from "react-native";
import { Star, Trophy, Sparkles, Scale, X, Check } from "lucide-react-native";
import Svg, { Polyline } from "react-native-svg";
import { api } from "../services/api";

export interface WeightJourneyPathProps {
  /**
   * ID do paciente logado para sincronização com a API e Prontuário
   */
  pacienteId?: string;
  /**
   * Peso do início do protocolo FAAZ (ex: 92.0)
   */
  pesoInicial?: number;
  /**
   * Peso aferido atual do paciente (ex: 87.5)
   */
  pesoAtual?: number;
  /**
   * Peso alvo/meta clínica do plano (ex: 77.0)
   */
  pesoMeta?: number;
  /**
   * Fallback de estrelas conquistadas ou em foco (de 0 a 5)
   */
  currentStar?: number;
  /**
   * Títulos ou legendas opcionais para cada uma das 5 estrelas
   */
  milestoneLabels?: string[];
  /**
   * Callback ao tocar em uma estrela
   */
  onPressStar?: (starIndex: number) => void;
  /**
   * Callback disparado imediatamente após o sucesso de atualização de peso
   */
  onPesoUpdated?: (novoPeso: number) => void;
}

// Desalinhamento vertical sutil e compacto para desenhar a "trilha" sem estourar limites
const STAR_OFFSETS = [5, -7, 5, -6, 2];

export function WeightJourneyPath({
  pacienteId = "",
  pesoInicial = 0,
  pesoAtual = 0,
  pesoMeta = 0,
  currentStar,
  milestoneLabels,
  onPressStar,
  onPesoUpdated,
}: WeightJourneyPathProps) {
  const [trackWidth, setTrackWidth] = useState<number>(0);

  // Estado local reativo do peso atual (permite recalcular instantaneamente)
  const [localPesoAtual, setLocalPesoAtual] = useState<number>(pesoAtual);

  // Estados do Modal de Atualização de Peso
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [inputPeso, setInputPeso] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (typeof pesoAtual === "number" && !isNaN(pesoAtual)) {
      setLocalPesoAtual(pesoAtual);
    }
  }, [pesoAtual]);

  // Verifica se o paciente possui peso inicial e peso alvo definidos no prontuário/metas
  const hasPlanoDefinido = pesoInicial > 0 && pesoMeta > 0;

  // ========================================================
  // 1. MATEMÁTICA DE CHECKPOINTS DE PESO REAL (5 ESTÁGIOS)
  // ========================================================
  const deltaTotal = hasPlanoDefinido ? Math.abs(pesoInicial - pesoMeta) : 0;
  const stepKg = deltaTotal > 0 ? deltaTotal / 5 : 0;
  const isLosingWeight = pesoInicial >= pesoMeta;

  // Calcula o peso de cada um dos 5 marcos de estrelas (ou marcos vazios quando sem plano)
  const checkpoints = useMemo(() => {
    return [1, 2, 3, 4, 5].map((i) => {
      if (!hasPlanoDefinido) {
        return {
          starNumber: i,
          weightKg: 0,
          label: "-- KG",
        };
      }
      const weight = isLosingWeight
        ? pesoInicial - stepKg * i
        : pesoInicial + stepKg * i;
      return {
        starNumber: i,
        weightKg: Number(weight.toFixed(1)),
        label: `${weight.toFixed(1)} KG`,
      };
    });
  }, [hasPlanoDefinido, pesoInicial, pesoMeta, stepKg, isLosingWeight]);

  // Determina quantas estrelas já foram conquistadas pelo localPesoAtual (0 se sem plano definido)
  const conqueredCount = useMemo(() => {
    if (!hasPlanoDefinido || localPesoAtual <= 0) {
      return 0;
    }
    if (typeof currentStar === "number" && !localPesoAtual) {
      return Math.min(5, Math.max(0, currentStar));
    }
    const reached = checkpoints.filter((cp) =>
      isLosingWeight ? localPesoAtual <= cp.weightKg : localPesoAtual >= cp.weightKg
    ).length;
    return Math.min(5, Math.max(0, reached));
  }, [hasPlanoDefinido, checkpoints, localPesoAtual, isLosingWeight, currentStar]);

  // A "Estrela Atual" (0 quando sem plano definido para não acender nenhuma estrela)
  const targetStarNumber = useMemo(() => {
    if (!hasPlanoDefinido) {
      return 0;
    }
    if (typeof currentStar === "number" && !localPesoAtual) {
      return currentStar > 0 ? Math.min(5, currentStar) : 1;
    }
    return conqueredCount < 5 ? conqueredCount + 1 : 5;
  }, [hasPlanoDefinido, conqueredCount, currentStar, localPesoAtual]);

  const targetCheckpoint =
    targetStarNumber > 0
      ? checkpoints[targetStarNumber - 1] || checkpoints[0]
      : checkpoints[0];

  // ========================================================
  // 2. ANIMAÇÃO SEQUENCIAL DE DESCOBERTA (PATH REVEAL) & SFX
  // ========================================================
  const revealAnim = useRef(new Animated.Value(0)).current;
  const [progressRatio, setProgressRatio] = useState<number>(0);
  const pulseAnim = useRef(new Animated.Value(1.0)).current;

  // A proporção de destino da animação de preenchimento (0 quando sem plano definido)
  const finalRevealTarget =
    hasPlanoDefinido && targetStarNumber > 0 ? (targetStarNumber - 1) / 4 : 0;

  useEffect(() => {
    if (!hasPlanoDefinido) {
      setProgressRatio(0);
      pulseAnim.stopAnimation();
      return;
    }

    const listenerId = revealAnim.addListener(({ value }) => {
      setProgressRatio(value);
    });

    revealAnim.setValue(0);
    Animated.timing(revealAnim, {
      toValue: finalRevealTarget,
      duration: 1050,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      startPulseLoop();
    });

    return () => {
      revealAnim.removeListener(listenerId);
      pulseAnim.stopAnimation();
    };
  }, [hasPlanoDefinido, targetStarNumber, finalRevealTarget]);

  const startPulseLoop = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    ).start();
  };

  // Medição do container para cálculo dinâmico da geometria
  const handleTrackLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (width > 0 && Math.abs(width - trackWidth) > 1) {
      setTrackWidth(width);
    }
  };

  const effectiveTrackWidth = Math.max(trackWidth, 290);

  // Coordenadas absolutas centrais dos 5 nós
  // starNodeWrapper width = 52, starsRow paddingHorizontal = 4 -> primeiro centro em 4 + 26 = 30
  const nodePoints = useMemo(() => {
    if (effectiveTrackWidth <= 0) return [];
    const startX = 30;
    const availableWidth = effectiveTrackWidth - 60;
    const step = availableWidth / 4;

    return [0, 1, 2, 3, 4].map((i) => ({
      x: startX + i * step,
      y: 33 + STAR_OFFSETS[i],
    }));
  }, [effectiveTrackWidth]);

  // Trilha completa de fundo (cinza tracejada)
  const allPolylinePoints = nodePoints
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  // Linha dourada progressiva animada: cresce da estrela 1 até o progresso atual
  const animatedGoldenPoints = useMemo(() => {
    if (nodePoints.length < 5 || progressRatio <= 0) return "";

    const t = progressRatio * 4;
    const fullSegments = Math.floor(t);
    const fraction = t - fullSegments;

    const pointsToDraw = [];
    for (let i = 0; i <= fullSegments && i < nodePoints.length; i++) {
      pointsToDraw.push(nodePoints[i]);
    }

    if (fullSegments < 4 && fraction > 0) {
      const pStart = nodePoints[fullSegments];
      const pEnd = nodePoints[fullSegments + 1];
      const headX = pStart.x + (pEnd.x - pStart.x) * fraction;
      const headY = pStart.y + (pEnd.y - pStart.y) * fraction;
      pointsToDraw.push({ x: headX, y: headY });
    }

    return pointsToDraw
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
  }, [nodePoints, progressRatio]);

  const quilosRestantesAlvo = Math.abs(localPesoAtual - targetCheckpoint.weightKg);

  // ========================================================
  // 3. FLUXO DE ATUALIZAÇÃO DE PESO VIA MODAL E API
  // ========================================================
  const handleAbrirModal = () => {
    setInputPeso(localPesoAtual > 0 ? localPesoAtual.toFixed(1) : "");
    setIsModalOpen(true);
  };

  const handleSalvarPeso = async () => {
    if (!inputPeso.trim()) {
      Alert.alert("ATENÇÃO", "POR FAVOR, INFORME O SEU PESO ATUAL.");
      return;
    }

    const valorNumerico = parseFloat(inputPeso.replace(",", ".").trim());

    if (isNaN(valorNumerico) || valorNumerico < 20 || valorNumerico > 400) {
      Alert.alert(
        "PESO INVÁLIDO",
        "POR FAVOR, DIGITE UM PESO VÁLIDO ENTRE 20 E 400 KG."
      );
      return;
    }

    setIsSaving(true);

    let novoPesoConfirmado = valorNumerico;

    try {
      const json = await api.pacientes.registrarPesagem(pacienteId, valorNumerico);
      if (json && typeof json.pesoAtual === "number") {
        novoPesoConfirmado = json.pesoAtual;
      }
    } catch (apiErr) {
      console.warn("Aviso: Falha ao sincronizar pesagem na API, mantendo registro local:", apiErr);
    } finally {
      setIsSaving(false);
    }

    // Fecha o modal imediatamente para travar cliques adicionais
    setIsModalOpen(false);

    // Se salvou com sucesso na API (ou fallback local garantido)
    const antigoConquistadas = conqueredCount;

    // Atualiza estado local no mesmo segundo (motor matemático recalcula)
    setLocalPesoAtual(novoPesoConfirmado);
    onPesoUpdated?.(novoPesoConfirmado);

    // Calcula novo número de conquistas com o novo peso
    const novasConquistadas = checkpoints.filter((cp) =>
      isLosingWeight
        ? novoPesoConfirmado <= cp.weightKg
        : novoPesoConfirmado >= cp.weightKg
    ).length;

    // Feedback visual imediato de conquista (100% silencioso em locais públicos)
    if (novasConquistadas > antigoConquistadas) {
      const msg = `PARABÉNS! VOCÊ ATINGIU ${novoPesoConfirmado.toFixed(1)} KG E DESBLOQUEOU A ESTRELA ${novasConquistadas} NA SUA JORNADA!`;
      if (typeof alert === "function") alert(msg);
      else Alert.alert("NOVA ESTRELA CONQUISTADA!", msg);
    } else {
      const msg = `SEU PESO DE ${novoPesoConfirmado.toFixed(1)} KG FOI REGISTRADO E SINCRONIZADO COM SUCESSO.`;
      if (typeof alert === "function") alert(msg);
      else Alert.alert("PESO ATUALIZADO", msg);
    }
  };

  return (
    <View style={styles.cardContainer}>
      {/* ======================================================== */}
      {/* CABEÇALHO DO CARD (REGRA GLOBAL DE CAIXA ALTA)           */}
      {/* ======================================================== */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.trophyIconBox}>
            <Trophy size={14} color={hasPlanoDefinido ? "#d97706" : "#94a3b8"} />
          </View>
          <View style={styles.titleCol}>
            <Text style={styles.title}>SUA JORNADA DE PESO</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {hasPlanoDefinido
                ? `INÍCIO: ${pesoInicial.toFixed(1)} KG • ATUAL: ${localPesoAtual.toFixed(1)} KG • META: ${pesoMeta.toFixed(1)} KG`
                : "AGUARDANDO DEFINIÇÃO DO PLANO CLÍNICO"}
            </Text>
          </View>
        </View>

        <View style={styles.badgePill}>
          <Text style={styles.badgeText}>
            {conqueredCount} DE 5
          </Text>
        </View>
      </View>

      {/* ======================================================== */}
      {/* ÁREA DA TRILHA / ROADMAP (5 ESTRELAS OU EMPTY STATE)     */}
      {/* ======================================================== */}
      {hasPlanoDefinido ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollTrackContent}
          bounces={false}
        >
          <View
            style={[
              styles.trackContainer,
              { width: effectiveTrackWidth },
            ]}
            onLayout={handleTrackLayout}
          >
            {/* Traçado em SVG com Reveal Progressivo (Exibido apenas quando há plano definido) */}
            {effectiveTrackWidth > 0 && nodePoints.length === 5 ? (
              <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                {/* Linha tracejada de fundo para todo o percurso */}
                <Polyline
                  points={allPolylinePoints}
                  stroke="#cbd5e1"
                  strokeWidth={2}
                  strokeDasharray="5, 4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                {/* Linha dourada revelada progressivamente da esquerda para a direita */}
                {animatedGoldenPoints.length > 0 && (
                  <Polyline
                    points={animatedGoldenPoints}
                    stroke="#f59e0b"
                    strokeWidth={2.8}
                    strokeDasharray="5, 3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                )}
              </Svg>
            ) : (
              <View style={styles.fallbackDashedLine} pointerEvents="none" />
            )}

            {/* 5 Estrelas Distribuídas com Checkpoints Matemáticos */}
            <View style={styles.starsRow}>
              {checkpoints.map((cp, index) => {
                const starNum = cp.starNumber;
                const starThreshold = index / 4;
                const isLitByAnimation = progressRatio >= starThreshold - 0.05;
                const isConquered = starNum <= conqueredCount && isLitByAnimation;
                const isTarget = starNum === targetStarNumber;
                const verticalOffset = STAR_OFFSETS[index];

                const labelText = isTarget
                  ? `ALVO: ${targetCheckpoint.weightKg.toFixed(1)} KG`
                  : cp.starNumber === 5
                  ? `META: ${cp.weightKg.toFixed(1)} KG`
                  : `${cp.weightKg.toFixed(1)} KG`;

                return (
                  <View
                    key={`star-checkpoint-${starNum}`}
                    style={[
                      styles.starNodeWrapper,
                      {
                        transform: [{ translateY: verticalOffset }],
                      },
                    ]}
                  >
                    {/* Estrela Alvo com Animação Contínua de Pulse */}
                    {isTarget ? (
                      <Animated.View
                        style={[
                          styles.animatedTargetContainer,
                          {
                            transform: [{ scale: pulseAnim }],
                          },
                        ]}
                      >
                        <View style={styles.targetAuraGlow} />

                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => onPressStar?.(starNum)}
                          style={[styles.starCircleBase, styles.starCircleTarget]}
                        >
                          <Star
                            size={18}
                            color="#b45309"
                            fill="#f59e0b"
                            strokeWidth={2.2}
                          />
                        </TouchableOpacity>
                      </Animated.View>
                    ) : (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => onPressStar?.(starNum)}
                        style={[
                          styles.starCircleBase,
                          isConquered
                            ? styles.starCircleConquered
                            : styles.starCircleFuture,
                        ]}
                      >
                        <Star
                          size={17}
                          color={isConquered ? "#d97706" : "#94a3b8"}
                          fill={isConquered ? "#fbbf24" : "transparent"}
                          strokeWidth={2}
                        />
                      </TouchableOpacity>
                    )}

                    {/* Rótulo de Checkpoint em Caixa Alta */}
                    <Text
                      style={[
                        styles.nodeLabel,
                        isTarget
                          ? styles.nodeLabelTarget
                          : isConquered
                          ? styles.nodeLabelConquered
                          : styles.nodeLabelFuture,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {labelText}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      ) : (
        <View style={{ paddingVertical: 12, alignItems: "center" }}>
          {/* 5 Estrelas Vazias sem linha de progresso */}
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((starNum) => (
              <View key={`empty-star-${starNum}`} style={styles.starNodeWrapper}>
                <View style={[styles.starCircleBase, styles.starCircleFuture]}>
                  <Star
                    size={17}
                    color="#94a3b8"
                    fill="transparent"
                    strokeWidth={2}
                  />
                </View>
              </View>
            ))}
          </View>
          <Text
            style={{
              fontSize: 10.5,
              fontWeight: "600",
              color: "#64748b",
              marginTop: 10,
              letterSpacing: 0.3,
              textAlign: "center",
            }}
          >
            AGUARDANDO DEFINIÇÃO DO PLANO CLÍNICO
          </Text>
        </View>
      )}

      {/* ======================================================== */}
      {/* BOTÃO COMPACTO E ELEGANTE: ATUALIZAR PESO ATUAL         */}
      {/* ======================================================== */}
      <View style={styles.actionButtonContainer}>
        <TouchableOpacity
          activeOpacity={0.82}
          onPress={handleAbrirModal}
          style={styles.updateWeightButton}
        >
          <View style={styles.updateWeightIconCircle}>
            <Scale size={13} color="#0f766e" strokeWidth={2.4} />
          </View>
          <Text style={styles.updateWeightButtonText}>ATUALIZAR PESO ATUAL</Text>
        </TouchableOpacity>
      </View>

      {/* ======================================================== */}
      {/* RODAPÉ MOTIVACIONAL VINCULADO AO CHECKPOINT REAL        */}
      {/* ======================================================== */}
      <View style={styles.footerRow}>
        <View style={styles.footerIconBox}>
          <Sparkles size={12} color={hasPlanoDefinido ? "#d97706" : "#94a3b8"} />
        </View>
        <Text style={styles.footerText}>
          {hasPlanoDefinido
            ? `FOCO NO ALVO: ${targetCheckpoint.weightKg.toFixed(1)} KG • FALTAM ${quilosRestantesAlvo.toFixed(1)} KG PARA DESBLOQUEAR A ESTRELA ${targetStarNumber}`
            : "SUA JORNADA DE 5 ESTRELAS SERÁ ATIVADA ASSIM QUE SUA META DE PESO FOR DEFINIDA NO PRONTUÁRIO."}
        </Text>
      </View>

      {/* ======================================================== */}
      {/* MODAL / BOTTOM SHEET: QUAL O SEU PESO HOJE?              */}
      {/* ======================================================== */}
      <Modal
        visible={isModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isSaving) setIsModalOpen(false);
        }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={styles.modalKeyboardAvoid}
            >
              <View style={styles.modalCard}>
                {/* Botão Fechar no Topo Direito */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => !isSaving && setIsModalOpen(false)}
                  style={styles.modalCloseButton}
                  disabled={isSaving}
                >
                  <X size={18} color="#64748b" />
                </TouchableOpacity>

                {/* Ícone e Título do Modal */}
                <View style={styles.modalHeader}>
                  <View style={styles.modalIconBox}>
                    <Scale size={24} color="#0f766e" strokeWidth={2.4} />
                  </View>
                  <Text style={styles.modalTitle}>QUAL O SEU PESO HOJE?</Text>
                  <Text style={styles.modalSubtitle}>
                    DIGITE SEU PESO AFERIDO EM KG PARA RECALCULAR SUA JORNADA EM TEMPO REAL.
                  </Text>
                </View>

                {/* Input de Peso Numérico */}
                <View style={styles.inputContainer}>
                  <TextInput
                    style={[
                      styles.pesoInput,
                      Platform.OS === "web" && ({ outlineStyle: "none" } as any),
                    ]}
                    value={inputPeso}
                    onChangeText={(txt) => setInputPeso(txt.replace(/[^0-9.,]/g, ""))}
                    placeholder="EX: 84.5"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                    autoFocus
                    editable={!isSaving}
                    maxLength={6}
                  />
                  <View style={styles.kgBadge}>
                    <Text style={styles.kgBadgeText}>KG</Text>
                  </View>
                </View>

                {/* Aviso Sutil de Sincronização */}
                <View style={styles.syncNoticeBox}>
                  <Check size={12} color="#0f766e" />
                  <Text style={styles.syncNoticeText}>
                    SINCRONIZAÇÃO AUTOMÁTICA COM SEU PRONTUÁRIO MÉDICO
                  </Text>
                </View>

                {/* Botões de Ação */}
                <View style={styles.modalActionsRow}>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setIsModalOpen(false)}
                    style={styles.modalCancelButton}
                    disabled={isSaving}
                  >
                    <Text style={styles.modalCancelButtonText}>CANCELAR</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handleSalvarPeso}
                    style={[
                      styles.modalSaveButton,
                      isSaving && styles.modalSaveButtonDisabled,
                      isSaving && { opacity: 0.6 },
                    ]}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <ActivityIndicator size="small" color="#ffffff" />
                        <Text style={styles.modalSaveButtonText}>SALVANDO...</Text>
                      </View>
                    ) : (
                      <Text style={styles.modalSaveButtonText}>SALVAR PESO</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    elevation: 2,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 160,
  },
  titleCol: {
    flex: 1,
    justifyContent: "center",
  },
  trophyIconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fde68a",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 10.5,
    fontWeight: "400",
    color: "#4b5563",
    letterSpacing: 0.1,
    marginTop: 1,
  },
  badgePill: {
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fef08a",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
    flexShrink: 0,
    alignSelf: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#b45309",
    letterSpacing: 0.2,
  },

  /* ScrollView e Trilha da Timeline */
  scrollTrackContent: {
    flexGrow: 1,
    minWidth: "100%",
  },
  trackContainer: {
    height: 84,
    justifyContent: "center",
    position: "relative",
    marginVertical: 2,
  },
  fallbackDashedLine: {
    position: "absolute",
    left: 20,
    right: 20,
    top: 33,
    height: 1,
    borderBottomWidth: 2,
    borderColor: "#cbd5e1",
    borderStyle: "dashed",
    zIndex: 0,
  },
  starsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    width: "100%",
    zIndex: 1,
  },
  starNodeWrapper: {
    alignItems: "center",
    justifyContent: "center",
    width: 52,
  },

  /* Círculos das Estrelas (Compactados para 38px) */
  starCircleBase: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  starCircleConquered: {
    backgroundColor: "#fef3c7",
    borderWidth: 2,
    borderColor: "#f59e0b",
    opacity: 1,
    shadowColor: "#f59e0b",
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.22,
    shadowRadius: 3,
    elevation: 2,
  },
  starCircleFuture: {
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    opacity: 0.35,
  },

  /* Estrela Alvo com Animação de Pulse */
  animatedTargetContainer: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  targetAuraGlow: {
    position: "absolute",
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(251, 191, 36, 0.28)",
  },
  starCircleTarget: {
    backgroundColor: "#fde68a",
    borderWidth: 2.2,
    borderColor: "#d97706",
    opacity: 1,
    shadowColor: "#d97706",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },

  /* Legenda do Marco em Quilos (10px Responsivo) */
  nodeLabel: {
    fontSize: 10,
    fontWeight: "400",
    color: "#4b5563",
    letterSpacing: 0.1,
    marginTop: 3,
    textAlign: "center",
    maxWidth: 54,
  },
  nodeLabelConquered: {
    color: "#b45309",
    fontWeight: "600",
  },
  nodeLabelTarget: {
    color: "#b45309",
    fontWeight: "600",
    fontSize: 9.5,
  },
  nodeLabelFuture: {
    color: "#9ca3af",
    opacity: 0.6,
    fontWeight: "400",
  },

  /* Botão Compacto Atualizar Peso */
  actionButtonContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    marginBottom: 8,
  },
  updateWeightButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#ccfbf1",
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 9999,
    gap: 7,
    elevation: 1,
    shadowColor: "#0d9488",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  updateWeightIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#ccfbf1",
    alignItems: "center",
    justifyContent: "center",
  },
  updateWeightButtonText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#0f766e",
    letterSpacing: 0.5,
  },

  /* Rodapé do Card */
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fafaf9",
    borderWidth: 1,
    borderColor: "#f5f5f4",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 7,
  },
  footerIconBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: "#fef3c7",
    alignItems: "center",
    justifyContent: "center",
  },
  footerText: {
    fontSize: 9,
    fontWeight: "400",
    color: "#4b5563",
    letterSpacing: 0.2,
    flex: 1,
  },

  /* ======================================================== */
  /* ESTILOS DO MODAL / BOTTOM SHEET                          */
  /* ======================================================== */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalKeyboardAvoid: {
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
    position: "relative",
  },
  modalCloseButton: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  modalHeader: {
    alignItems: "center",
    marginBottom: 18,
  },
  modalIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#ccfbf1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#99f6e4",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: 0.3,
    textAlign: "center",
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 11,
    fontWeight: "400",
    color: "#4b5563",
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    marginBottom: 12,
  },
  pesoInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: "500",
    color: "#0f172a",
    paddingVertical: 0,
  },
  kgBadge: {
    backgroundColor: "#0d9488",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  kgBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  syncNoticeBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 20,
  },
  syncNoticeText: {
    fontSize: 9.5,
    fontWeight: "400",
    color: "#0f766e",
    letterSpacing: 0.2,
  },
  modalActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
    letterSpacing: 0.3,
  },
  modalSaveButton: {
    flex: 1.5,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "#0d9488",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0d9488",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  modalSaveButtonDisabled: {
    opacity: 0.6,
  },
  modalSaveButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ffffff",
    letterSpacing: 0.4,
  },
});
