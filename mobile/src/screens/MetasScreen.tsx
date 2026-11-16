import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import {
  Target,
  Utensils,
  Dumbbell,
  Moon,
  Droplets,
  Zap,
  ArrowLeft,
  ChevronRight,
  Clock,
  Sparkles,
  CheckCircle2,
  Home as HomeIcon,
  User,
} from "lucide-react-native";
import { usePatientAuth } from "../contexts/PatientAuthContext";
import { useDiarioAlimentar } from "../contexts/DiarioAlimentarContext";
import { StandardHeader } from "../components/StandardHeader";
import { api } from "../services/api";

export interface MetasScreenProps {
  pacienteId?: string;
  pacienteNome?: string;
  onBack?: () => void;
  onTabPress?: (tabName: string) => void;
  onNavigateToCheckin?: (id: string) => void;
  onNavigateToDieta?: () => void;
}

export function MetasScreen({
  pacienteId,
  pacienteNome,
  onBack,
  onTabPress,
  onNavigateToCheckin,
  onNavigateToDieta,
}: MetasScreenProps) {
  const { paciente: authPaciente } = usePatientAuth();
  const realPacienteId = pacienteId || authPaciente?.id;
  const nomeExibicao = (pacienteNome || authPaciente?.nome || "PACIENTE").toUpperCase();

  // Estados de Metas sincronizados com o Diário Alimentar do Paciente
  const diario = useDiarioAlimentar();
  const caloriasAlvo = diario.caloriasMeta || 2000;
  const caloriasConsumidas = diario.caloriasConsumidas;
  const [caloriasBonusGanhos, setCaloriasBonusGanhos] = useState(320);
  const [caloriasBonusMeta, setCaloriasBonusMeta] = useState(400);
  const [sonoHoras, setSonoHoras] = useState(7.5);
  const [sonoAlvoHoras, setSonoAlvoHoras] = useState(8.0);
  const [aguaConsumidaMl, setAguaConsumidaMl] = useState(1800);
  const [aguaMetaMl, setAguaMetaMl] = useState(2500);

  // Busca metas sincronizadas da API caso disponível
  useEffect(() => {
    const id = realPacienteId;
    if (!id) return;

    let isMounted = true;
    async function loadMetas(pacienteId: string) {
      try {
        const json = await api.pacientes.getMetas(pacienteId);
        if (isMounted && json?.metas) {
          if (json.metas.caloriasBonusAlvo) {
            setCaloriasBonusMeta(Number(json.metas.caloriasBonusAlvo));
          } else if (json.metas.pontosBonusAlvo) {
            const bVal = Number(json.metas.pontosBonusAlvo);
            setCaloriasBonusMeta(bVal > 50 ? bVal : bVal * 30);
          }
          if (json.metas.sonoHorasAlvo) setSonoAlvoHoras(json.metas.sonoHorasAlvo);
          if (json.metas.aguaMlAlvo) setAguaMetaMl(json.metas.aguaMlAlvo);
        }
      } catch {
        // Fallback para os valores locais estáticos
      }
    }
    loadMetas(id);

    return () => {
      isMounted = false;
    };
  }, [realPacienteId]);

  // Cálculos do Orçamento Calórico (com base nas refeições e check-ins reais)
  const saldoCaloricoDisponivel = Math.max(0, diario.caloriasRestantes + caloriasBonusGanhos);
  const percConsumoCalorias = diario.percentualConsumido;
  const percBonusTreino = Math.min(100, Math.round((caloriasBonusGanhos / caloriasBonusMeta) * 100));
  const percSono = Math.min(100, Math.round((sonoHoras / sonoAlvoHoras) * 100));
  const percAgua = Math.min(100, Math.round((aguaConsumidaMl / aguaMetaMl) * 100));

  function handleAddAgua(ml: number) {
    setAguaConsumidaMl((prev) => {
      const novo = Math.min(aguaMetaMl * 2, prev + ml);
      Alert.alert(
        "HIDRATAÇÃO REGISTRADA",
        `+${ml} ML ADICIONADOS COM SUCESSO! TOTAL DO DIA: ${(novo / 1000).toFixed(1)} L.`
      );
      return novo;
    });
  }

  return (
    <View style={styles.rootContainer}>
      {/* ======================================================== */}
      {/* 1. CABEÇALHO SUPERIOR PADRÃO GLOBAL (SEU DESEMPENHO)     */}
      {/* ======================================================== */}
      <StandardHeader
        title="SEU DESEMPENHO"
        onBack={() => (onBack ? onBack() : onTabPress?.("Home"))}
        rightElement={
          <View style={styles.pointsBadgePill}>
            <Zap size={11} color="#2dd4bf" />
            <Text style={styles.pointsBadgeText}>{saldoCaloricoDisponivel} KCAL</Text>
          </View>
        }
      />

      {/* ======================================================== */}
      {/* 2. CONTEÚDO ROLÁVEL COM OS CARDS DE METAS                */}
      {/* ======================================================== */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
      >
        {/* BANNER DE RESUMO DO SALDO TOTAL */}
        <View style={styles.heroBanner}>
          <View style={styles.heroBannerHeader}>
            <View style={styles.heroIconBox}>
              <Target size={18} color="#0f766e" />
            </View>
            <View style={styles.heroTitleGroup}>
              <Text style={styles.heroPreTitle}>SALDO CALÓRICO DO DIA</Text>
              <Text style={styles.heroMainScore}>{saldoCaloricoDisponivel} KCAL RESTANTES</Text>
            </View>
          </View>
          <Text style={styles.heroDescription}>
            SUA META CALÓRICA DIÁRIA GARANTE DÉFICIT SEGURO COM PRESERVAÇÃO DA TAXA METABÓLICA.
          </Text>
        </View>

        {/* ======================================================== */}
        {/* CARD 1: META CALÓRICA DIÁRIA (ALIMENTAÇÃO)               */}
        {/* ======================================================== */}
        <View style={styles.metaCard}>
          <View style={styles.metaCardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={[styles.cardIconBox, styles.cardIconBoxOrange]}>
                <Utensils size={17} color="#d97706" />
              </View>
              <View>
                <Text style={styles.cardTitle}>META CALÓRICA DIÁRIA</Text>
                <Text style={styles.cardSubtitle}>PLANEJAMENTO NUTRICIONAL & CONSUMO</Text>
              </View>
            </View>

            <View style={styles.tagBadgeOrange}>
              <Text style={styles.tagBadgeOrangeText}>
                {caloriasConsumidas} / {caloriasAlvo} KCAL
              </Text>
            </View>
          </View>

          {/* Destaque Numérico */}
          <View style={styles.metricRow}>
            <View style={styles.metricNumbers}>
              <Text style={styles.metricBigText}>{caloriasConsumidas}</Text>
              <Text style={styles.metricUnitText}>/ {caloriasAlvo} KCAL CONSUMIDAS</Text>
            </View>
            <View style={styles.badgeSuccessPill}>
              <Text style={styles.badgeSuccessText}>
                RESTAM {Math.max(0, caloriasAlvo - caloriasConsumidas)} KCAL
              </Text>
            </View>
          </View>

          {/* Barra de Progresso do Orçamento */}
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${percConsumoCalorias}%`, backgroundColor: "#f97316" },
              ]}
            />
          </View>

          {/* Detalhes do Orçamento em Linhas */}
          <View style={styles.cardDetailsBox}>
            <View style={styles.detailItemRow}>
              <Text style={styles.detailLabel}>META CALÓRICA DIÁRIA BASE</Text>
              <Text style={styles.detailValue}>{caloriasAlvo} KCAL</Text>
            </View>
            <View style={styles.detailItemRow}>
              <Text style={styles.detailLabel}>CALORIAS CONSUMIDAS HOJE</Text>
              <Text style={[styles.detailValue, { color: "#ea580c" }]}>
                {caloriasConsumidas} KCAL
              </Text>
            </View>
            <View style={[styles.detailItemRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.detailLabel}>SALDO RESTANTE DISPONÍVEL</Text>
              <Text style={[styles.detailValue, { color: "#0f766e", fontWeight: "600" }]}>
                {Math.max(0, caloriasAlvo - caloriasConsumidas)} KCAL
              </Text>
            </View>
          </View>

          {/* Botão de Atalho para o Cardápio */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() =>
              onNavigateToDieta ? onNavigateToDieta() : onTabPress?.("Dieta")
            }
            style={styles.cardActionButton}
          >
            <Text style={styles.cardActionButtonText}>
              VER CARDÁPIO & SUBSTITUIÇÕES DE ALIMENTOS
            </Text>
            <ChevronRight size={14} color="#0f766e" />
          </TouchableOpacity>
        </View>

        {/* ======================================================== */}
        {/* CARD 2: GASTO CALÓRICO & TREINO                          */}
        {/* ======================================================== */}
        <View style={styles.metaCard}>
          <View style={styles.metaCardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={[styles.cardIconBox, styles.cardIconBoxTeal]}>
                <Dumbbell size={17} color="#0f766e" />
              </View>
              <View>
                <Text style={styles.cardTitle}>GASTO CALÓRICO & TREINO</Text>
                <Text style={styles.cardSubtitle}>CALORIAS EXTRAS CONQUISTADAS VIA EXERCÍCIO</Text>
              </View>
            </View>

            <View style={styles.tagBadgeTeal}>
              <Zap size={11} color="#0f766e" />
              <Text style={styles.tagBadgeTealText}>+{caloriasBonusGanhos} KCAL</Text>
            </View>
          </View>

          {/* Destaque Numérico */}
          <View style={styles.metricRow}>
            <View style={styles.metricNumbers}>
              <Text style={[styles.metricBigText, { color: "#0f766e" }]}>
                +{caloriasBonusGanhos}
              </Text>
              <Text style={[styles.metricUnitText, { color: "#0f766e" }]}>
                KCAL GASTAS NO TREINO
              </Text>
            </View>
            <View style={styles.badgeCreditActive}>
              <CheckCircle2 size={12} color="#065f46" />
              <Text style={styles.badgeCreditActiveText}>CRÉDITO ATIVO</Text>
            </View>
          </View>

          {/* Barra de Progresso do Bônus */}
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${percBonusTreino}%`, backgroundColor: "#0f766e" },
              ]}
            />
          </View>

          {/* Explicação de Compensação Calórica */}
          <View style={styles.cardDetailsBox}>
            <View style={styles.detailItemRow}>
              <Text style={styles.detailLabel}>TREINO DE FORÇA / MUSCULAÇÃO</Text>
              <Text style={styles.detailValue}>+200 KCAL QUEIMADAS</Text>
            </View>
            <View style={styles.detailItemRow}>
              <Text style={styles.detailLabel}>CARDIO / GASTO ENERGÉTICO ATIVO</Text>
              <Text style={styles.detailValue}>+120 KCAL QUEIMADAS</Text>
            </View>
            <View style={[styles.detailItemRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.detailLabel}>META DE GASTO ATIVO DO DIA</Text>
              <Text style={styles.detailValue}>+{caloriasBonusMeta} KCAL</Text>
            </View>
          </View>

          <View style={styles.rewardNoticeBox}>
            <Sparkles size={13} color="#0f766e" />
            <Text style={styles.rewardNoticeText}>
              O GASTO CALÓRICO DE TREINO EXPANDE O SEU DÉFICIT E OTIMIZA SEU METABOLISMO!
            </Text>
          </View>
        </View>

        {/* ======================================================== */}
        {/* CARD 3: QUALIDADE DO SONO                                */}
        {/* ======================================================== */}
        <View style={styles.metaCard}>
          <View style={styles.metaCardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={[styles.cardIconBox, styles.cardIconBoxPurple]}>
                <Moon size={17} color="#7c3aed" />
              </View>
              <View>
                <Text style={styles.cardTitle}>QUALIDADE DO SONO</Text>
                <Text style={styles.cardSubtitle}>RECUPERAÇÃO & RITMO CIRCADIANO</Text>
              </View>
            </View>

            <View style={styles.tagBadgePurple}>
              <Text style={styles.tagBadgePurpleText}>RITMO ESTÁVEL</Text>
            </View>
          </View>

          {/* Destaque Numérico */}
          <View style={styles.metricRow}>
            <View style={styles.metricNumbers}>
              <Text style={[styles.metricBigText, { color: "#6d28d9" }]}>{sonoHoras}h</Text>
              <Text style={styles.metricUnitText}>/ {sonoAlvoHoras}h ALVO CLÍNICO</Text>
            </View>
            <View style={styles.badgeQualityGood}>
              <Text style={styles.badgeQualityGoodText}>QUALIDADE: BOM</Text>
            </View>
          </View>

          {/* Barra de Progresso de Sono */}
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${percSono}%`, backgroundColor: "#8b5cf6" },
              ]}
            />
          </View>

          {/* Detalhes de Sono */}
          <View style={styles.cardDetailsBox}>
            <View style={styles.detailItemRow}>
              <Text style={styles.detailLabel}>MÉDIA SEMANAL REGISTRADA</Text>
              <Text style={styles.detailValue}>7.2 HORAS / NOITE</Text>
            </View>
            <View style={styles.detailItemRow}>
              <Text style={styles.detailLabel}>EFICIÊNCIA METABÓLICA</Text>
              <Text style={[styles.detailValue, { color: "#7c3aed" }]}>94% DO ALVO</Text>
            </View>
            <View style={[styles.detailItemRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.detailLabel}>STATUS CLÍNICO</Text>
              <Text style={styles.detailValue}>RESTAURAÇÃO PROFUNDA ATIVA</Text>
            </View>
          </View>

          {/* Botão de Check-in de Sono */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => onNavigateToCheckin?.("sono")}
            style={[styles.cardActionButton, styles.cardActionButtonPurple]}
          >
            <Clock size={13} color="#7c3aed" />
            <Text style={[styles.cardActionButtonText, { color: "#6d28d9" }]}>
              ATUALIZAR REGISTRO DE SONO DE HOJE
            </Text>
            <ChevronRight size={14} color="#7c3aed" />
          </TouchableOpacity>
        </View>

        {/* ======================================================== */}
        {/* CARD 4: HIDRATAÇÃO DIÁRIA                                */}
        {/* ======================================================== */}
        <View style={styles.metaCard}>
          <View style={styles.metaCardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={[styles.cardIconBox, styles.cardIconBoxSky]}>
                <Droplets size={17} color="#0284c7" />
              </View>
              <View>
                <Text style={styles.cardTitle}>HIDRATAÇÃO DIÁRIA</Text>
                <Text style={styles.cardSubtitle}>EQUILÍBRIO HIDROELETROLÍTICO</Text>
              </View>
            </View>

            <View style={styles.tagBadgeSky}>
              <Text style={styles.tagBadgeSkyText}>{percAgua}% CONCLUÍDO</Text>
            </View>
          </View>

          {/* Destaque Numérico */}
          <View style={styles.metricRow}>
            <View style={styles.metricNumbers}>
              <Text style={[styles.metricBigText, { color: "#0284c7" }]}>
                {(aguaConsumidaMl / 1000).toFixed(1)} L
              </Text>
              <Text style={styles.metricUnitText}>
                / {(aguaMetaMl / 1000).toFixed(1)} L RECOMENDADOS
              </Text>
            </View>
            <View style={styles.badgeRemainingWater}>
              <Text style={styles.badgeRemainingWaterText}>
                FALTAM {Math.max(0, aguaMetaMl - aguaConsumidaMl)} ML
              </Text>
            </View>
          </View>

          {/* Barra de Progresso de Água */}
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${percAgua}%`, backgroundColor: "#0284c7" },
              ]}
            />
          </View>

          {/* Botões de Ação Rápida de Água */}
          <View style={styles.waterQuickRow}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handleAddAgua(250)}
              style={styles.waterQuickBtn}
            >
              <Droplets size={13} color="#0284c7" />
              <Text style={styles.waterQuickBtnText}>+250 ML (COPO)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handleAddAgua(500)}
              style={[styles.waterQuickBtn, styles.waterQuickBtnGarrafa]}
            >
              <Droplets size={13} color="#0369a1" />
              <Text style={[styles.waterQuickBtnText, { color: "#0369a1" }]}>
                +500 ML (GARRAFA)
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* ======================================================== */}
      {/* 3. BOTTOM NAVIGATION FIXA PREMIUM                        */}
      {/* ======================================================== */}
      <View style={styles.bottomNavContainer}>
        {[
          { label: "Home", icon: HomeIcon },
          { label: "Dieta", icon: Utensils },
          { label: "METAS", icon: Target },
          { label: "Perfil", icon: User },
        ].map((tab) => {
          const Icon = tab.icon;
          const isSelected = tab.label === "METAS";

          return (
            <TouchableOpacity
              key={tab.label}
              activeOpacity={0.7}
              onPress={() => {
                if (tab.label === "Home") {
                  onBack ? onBack() : onTabPress?.("Home");
                } else if (tab.label === "Dieta") {
                  onNavigateToDieta ? onNavigateToDieta() : onTabPress?.("Dieta");
                } else if (onTabPress) {
                  onTabPress(tab.label);
                }
              }}
              style={styles.bottomNavTab}
            >
              <Icon
                size={21}
                color={isSelected ? "#0f766e" : "#94a3b8"}
                strokeWidth={isSelected ? 2.5 : 2}
              />
              <Text
                style={[
                  styles.bottomNavLabel,
                  isSelected
                    ? styles.bottomNavLabelActive
                    : styles.bottomNavLabelInactive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#ccfbf1",
  },
  backButtonText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#0f766e",
    letterSpacing: 0.3,
  },
  headerTitleCenter: {
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f172a",
    letterSpacing: 0.6,
  },
  headerSubtitle: {
    fontSize: 8,
    fontWeight: "400",
    color: "#94a3b8",
    letterSpacing: 0.2,
    marginTop: 1,
  },
  pointsBadgePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(45, 212, 191, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(45, 212, 191, 0.3)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  pointsBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#2dd4bf",
    letterSpacing: 0.3,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 110,
  },

  /* Hero Banner */
  heroBanner: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  heroBannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  heroIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#ccfbf1",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitleGroup: {
    flex: 1,
  },
  heroPreTitle: {
    fontSize: 9,
    fontWeight: "500",
    color: "#64748b",
    letterSpacing: 0.4,
  },
  heroMainScore: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f766e",
    letterSpacing: -0.2,
    marginTop: 1,
  },
  heroDescription: {
    fontSize: 10,
    fontWeight: "400",
    color: "#4b5563",
    lineHeight: 15,
    letterSpacing: 0.1,
  },

  /* Cards de Metas */
  metaCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    padding: 15,
    marginBottom: 12,
    elevation: 1,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
  },
  metaCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  cardIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  cardIconBoxOrange: {
    backgroundColor: "#fff7ed",
    borderColor: "#ffedd5",
  },
  cardIconBoxTeal: {
    backgroundColor: "#f0fdfa",
    borderColor: "#ccfbf1",
  },
  cardIconBoxPurple: {
    backgroundColor: "#faf5ff",
    borderColor: "#f3e8ff",
  },
  cardIconBoxSky: {
    backgroundColor: "#f0f9ff",
    borderColor: "#e0f2fe",
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0f172a",
    letterSpacing: 0.3,
  },
  cardSubtitle: {
    fontSize: 9,
    fontWeight: "400",
    color: "#64748b",
    letterSpacing: 0.2,
    marginTop: 1,
  },
  tagBadgeOrange: {
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagBadgeOrangeText: {
    fontSize: 9,
    fontWeight: "500",
    color: "#c2410c",
  },
  tagBadgeTeal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#99f6e4",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagBadgeTealText: {
    fontSize: 9,
    fontWeight: "500",
    color: "#0f766e",
  },
  tagBadgePurple: {
    backgroundColor: "#faf5ff",
    borderWidth: 1,
    borderColor: "#e9d5ff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagBadgePurpleText: {
    fontSize: 9,
    fontWeight: "500",
    color: "#6d28d9",
  },
  tagBadgeSky: {
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagBadgeSkyText: {
    fontSize: 9,
    fontWeight: "500",
    color: "#0369a1",
  },

  /* Métrica e Progresso */
  metricRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  metricNumbers: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  metricBigText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.5,
  },
  metricUnitText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#64748b",
    letterSpacing: 0.2,
  },
  badgeSuccessPill: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  badgeSuccessText: {
    fontSize: 9,
    fontWeight: "500",
    color: "#065f46",
    letterSpacing: 0.2,
  },
  badgeCreditActive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  badgeCreditActiveText: {
    fontSize: 9,
    fontWeight: "500",
    color: "#065f46",
    letterSpacing: 0.2,
  },
  badgeQualityGood: {
    backgroundColor: "#faf5ff",
    borderWidth: 1,
    borderColor: "#e9d5ff",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  badgeQualityGoodText: {
    fontSize: 9,
    fontWeight: "500",
    color: "#6d28d9",
    letterSpacing: 0.2,
  },
  badgeRemainingWater: {
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  badgeRemainingWaterText: {
    fontSize: 9,
    fontWeight: "500",
    color: "#0369a1",
    letterSpacing: 0.2,
  },
  progressBarTrack: {
    width: "100%",
    height: 6,
    borderRadius: 9999,
    backgroundColor: "#f1f5f9",
    overflow: "hidden",
    marginBottom: 10,
  },
  progressBarFill: {
    height: 6,
    borderRadius: 9999,
  },

  /* Detalhes */
  cardDetailsBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 10,
  },
  detailItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: "400",
    color: "#64748b",
    letterSpacing: 0.2,
  },
  detailValue: {
    fontSize: 10,
    fontWeight: "600",
    color: "#1e293b",
    letterSpacing: 0.2,
  },
  cardActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#ccfbf1",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  cardActionButtonPurple: {
    backgroundColor: "#faf5ff",
    borderColor: "#f3e8ff",
  },
  cardActionButtonText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#0f766e",
    letterSpacing: 0.3,
    flex: 1,
  },
  rewardNoticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#f0fdfa",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#ccfbf1",
  },
  rewardNoticeText: {
    fontSize: 9,
    fontWeight: "400",
    color: "#0f766e",
    letterSpacing: 0.2,
    flex: 1,
  },
  waterQuickRow: {
    flexDirection: "row",
    gap: 8,
  },
  waterQuickBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    paddingVertical: 8,
    borderRadius: 10,
  },
  waterQuickBtnGarrafa: {
    backgroundColor: "#e0f2fe",
    borderColor: "#7dd3fc",
  },
  waterQuickBtnText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#0284c7",
    letterSpacing: 0.2,
  },

  /* Bottom Navigation */
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
    paddingBottom: 8,
    elevation: 8,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
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
