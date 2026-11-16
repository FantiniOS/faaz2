import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
} from "react-native";
import {
  Hexagon,
  Calendar,
  Clock,
  Droplets,
  Flame,
  Dumbbell,
  Activity,
  Moon,
  Smile,
  ChevronRight,
  CheckCircle2,
  Home as HomeIcon,
  Utensils,
  MessageCircle,
  User,
  Sparkles,
} from "lucide-react-native";
import {
  mockPatientHome,
  PatientHomeData,
  CheckinPendente,
} from "../mocks/patientHome";

export interface HomeScreenProps {
  data?: PatientHomeData;
  pacienteId?: string;
  onNavigateToCheckin?: (id: string) => void;
  onTabPress?: (tabName: string) => void;
  onNavigateToDieta?: () => void;
}

interface ProximaConsultaInfo {
  id: string;
  dataHora: string;
  dataFormatada: string;
  horario: string;
  duracaoMinutos: number;
  tipo: string;
  tipoLegivel: string;
  status: string;
  statusLegivel: string;
  medicoNome?: string;
}

const WHATSAPP_RECEPCAO_NUMERO = "5531984400076";
const WHATSAPP_URL_OFICIAL =
  "https://wa.me/5531984400076?text=Olá!%20Sou%20paciente%20da%20Clínica%20FAAZ%20e%20gostaria%20de%20atendimento.";

export function HomeScreen({
  data = mockPatientHome,
  pacienteId = "64c92488-a3be-465e-9af8-9553eb12a07c",
  onNavigateToCheckin,
  onTabPress,
  onNavigateToDieta,
}: HomeScreenProps) {
  const { paciente, metasHoje, checkinsPendentes } = data;

  const [treinoFeito, setTreinoFeito] = useState(metasHoje.treinoFeito);
  const [aguaAtual, setAguaAtual] = useState(metasHoje.agua.atual);
  const [checkinsConcluidos, setCheckinsConcluidos] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>("Home");
  const [proximaConsulta, setProximaConsulta] =
    useState<ProximaConsultaInfo | null>(null);
  const [carregandoConsulta, setCarregandoConsulta] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    async function loadProximaConsulta() {
      try {
        const res = await fetch(
          `/api/pacientes/${encodeURIComponent(pacienteId)}/proxima-consulta`,
          { cache: "no-store" }
        );
        if (res.ok && isMounted) {
          const json = await res.json();
          if (json.success && json.temProximaConsulta && json.proximaConsulta) {
            setProximaConsulta(json.proximaConsulta);
          } else {
            setProximaConsulta(null);
          }
        }
      } catch {
        // Fallback silencioso
      } finally {
        if (isMounted) setCarregandoConsulta(false);
      }
    }
    loadProximaConsulta();
    return () => {
      isMounted = false;
    };
  }, [pacienteId]);

  async function handleOpenWhatsApp() {
    const url = WHATSAPP_URL_OFICIAL;
    try {
      const targetUrl = encodeURI(decodeURI(url));
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.open(targetUrl, "_blank");
        return;
      }
      await Linking.openURL(targetUrl);
    } catch (error) {
      console.warn("[WhatsApp] Falha ao abrir link:", error);
      Alert.alert(
        "WhatsApp",
        "Não foi possível abrir o WhatsApp. Por favor, adicione nosso número manualmente: (31) 98440-0076"
      );
    }
  }

  const handleAgendarWhatsApp = handleOpenWhatsApp;

  const percAgua = Math.min(
    Math.round((aguaAtual / metasHoje.agua.meta) * 100),
    100
  );
  const percCal = Math.min(
    Math.round((metasHoje.calorias.atual / metasHoje.calorias.meta) * 100),
    100
  );

  function handleCheckinPress(checkin: CheckinPendente) {
    if (onNavigateToCheckin) {
      onNavigateToCheckin(checkin.id);
    } else {
      if (!checkinsConcluidos.includes(checkin.id)) {
        setCheckinsConcluidos([...checkinsConcluidos, checkin.id]);
        Alert.alert(
          `${checkin.titulo} Registrado!`,
          "Seus dados foram sincronizados com seu prontuário na Clínica FAAZ."
        );
      } else {
        Alert.alert(checkin.titulo, "Você já registrou este check-in hoje!");
      }
    }
  }

  function handleAddAgua() {
    const novoValor = parseFloat((aguaAtual + 0.25).toFixed(2));
    setAguaAtual(novoValor);
  }

  return (
    <View className="flex-1 bg-slate-50" style={styles.root}>
      {/* ÁREA ROLÁVEL COM CONTEÚDO */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
        className="flex-1 px-4 sm:px-6 pt-1"
      >
        {/* ======================================================== */}
        {/* 1. CABEÇALHO PRINCIPAL: LOGO CLÍNICA FAAZ CENTRALIZADA */}
        {/* ======================================================== */}
        <View style={styles.topHeader}>
          <View style={{ width: 42 }} />

          {/* Centro: Logo Oficial da Clínica FAAZ Centralizada */}
          <View style={{ flex: 1, height: 32, maxHeight: 32, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            <Image
              source={{ uri: "/logo.png" }}
              accessibilityLabel="Clínica FAAZ"
              resizeMode="contain"
              className="h-8 w-auto object-contain"
              style={{ height: 32, maxHeight: 32, width: 96 }}
            />
          </View>

          {/* Lado Direito: Foto de Perfil / Avatar do Paciente */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => Alert.alert("Perfil", "Carlos Fantini • Paciente FAAZ")}
            style={styles.avatarButton}
          >
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitial}>C</Text>
            </View>
            <View style={styles.avatarStatusBadge} />
          </TouchableOpacity>
        </View>

        {/* Saudação Amigável e Suave */}
        <View style={styles.greetingSection}>
          <Text style={styles.greetingText}>
            Bom dia, {paciente.nome} ✨
          </Text>
          <Text style={styles.greetingSubtext}>
            Seu plano de longevidade e nutrição para hoje.
          </Text>
        </View>

        {/* ======================================================== */}
        {/* 2. CARD PRINCIPAL DARK PREMIUM: PRÓXIMA CONSULTA & FASE */}
        {/* ======================================================== */}
        <View style={styles.protocolCardDark}>
          {/* Topo do Card Dark */}
          <View style={styles.protocolCardTop}>
            <View style={styles.protocolBadge}>
              <Sparkles size={12} color="#5eead4" />
              <Text style={styles.protocolBadgeText}>
                FASE ATUAL: {paciente.faseProtocolo.toUpperCase()}
              </Text>
            </View>
            <View style={styles.activePill}>
              <Text style={styles.activePillText}>
                {proximaConsulta
                  ? proximaConsulta.status === "CONFIRMADO"
                    ? "Confirmado"
                    : "Agendado"
                  : carregandoConsulta
                  ? "Sincronizando..."
                  : "Agenda Livre"}
              </Text>
            </View>
          </View>

          {/* Conteúdo da Próxima Consulta */}
          {proximaConsulta ? (
            <View style={styles.appointmentContent}>
              <View style={styles.calendarIconBox}>
                <Calendar size={20} color="#0d9488" />
              </View>
              <View style={styles.appointmentTexts}>
                <Text style={styles.appointmentLabel}>
                  PRÓXIMA CONSULTA • {proximaConsulta.tipoLegivel.toUpperCase()}
                </Text>
                <Text style={styles.appointmentDate}>
                  {proximaConsulta.dataFormatada} • {proximaConsulta.horario}
                </Text>
                <Text style={styles.doctorName}>
                  {proximaConsulta.medicoNome ||
                    "Dr. Carlos Fantini • Endocrinologia & Nutrologia"}
                </Text>
              </View>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <View style={styles.appointmentContent}>
                <View style={styles.calendarIconBox}>
                  <Calendar size={20} color="#94a3b8" />
                </View>
                <View style={styles.appointmentTexts}>
                  <Text style={styles.appointmentLabel}>
                    AGENDA DE CONSULTAS
                  </Text>
                  <Text style={styles.appointmentDate}>
                    Você não tem consultas agendadas.
                  </Text>
                  <Text style={styles.doctorName}>
                    Fale com nossa recepção para marcar seu próximo acompanhamento.
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleOpenWhatsApp}
                style={{
                  backgroundColor: "#0d9488",
                  borderRadius: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <MessageCircle size={16} color="#ffffff" />
                <Text
                  style={{ fontSize: 12, fontWeight: "800", color: "#ffffff" }}
                >
                  Agendar via WhatsApp
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ======================================================== */}
        {/* 3. SESSÃO: "Suas Metas Hoje" */}
        {/* ======================================================== */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Suas Metas Hoje</Text>
            <Text style={styles.sectionSubtitle}>Acompanhamento diário</Text>
          </View>

          {/* Grid de 2 Colunas: Água e Calorias */}
          <View style={styles.goalsGrid}>
            {/* Card Água */}
            <View style={styles.goalCard}>
              <View style={styles.goalCardHeader}>
                <View style={styles.cyanIconBox}>
                  <Droplets size={16} color="#0284c7" />
                </View>
                <Text style={styles.cyanPercent}>{percAgua}%</Text>
              </View>

              <View style={styles.goalCardBody}>
                <Text style={styles.goalTitle}>Água Ingerida</Text>
                <Text style={styles.goalAmount}>
                  {aguaAtual}{" "}
                  <Text style={styles.goalUnit}>
                    / {metasHoje.agua.meta} {metasHoje.agua.unidade}
                  </Text>
                </Text>
              </View>

              {/* Barra de Progresso Água */}
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressBar,
                    { width: `${percAgua}%`, backgroundColor: "#0284c7" },
                  ]}
                />
              </View>

              {/* Botão +250ml */}
              <TouchableOpacity
                onPress={handleAddAgua}
                activeOpacity={0.7}
                style={styles.waterQuickButton}
              >
                <Text style={styles.waterQuickButtonText}>+ 250ml (1 copo)</Text>
              </TouchableOpacity>
            </View>

            {/* Card Calorias (Navega para Dieta) */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                if (onNavigateToDieta) onNavigateToDieta();
                else if (onTabPress) onTabPress("Dieta");
                else if (typeof window !== "undefined") window.location.href = "/app/dieta";
              }}
              style={styles.goalCard}
            >
              <View style={styles.goalCardHeader}>
                <View style={styles.amberIconBox}>
                  <Flame size={16} color="#d97706" />
                </View>
                <Text style={styles.tealPercent}>{percCal}%</Text>
              </View>

              <View style={styles.goalCardBody}>
                <Text style={styles.goalTitle}>Alimentação</Text>
                <Text style={styles.goalAmount}>
                  {metasHoje.calorias.atual}{" "}
                  <Text style={styles.goalUnit}>
                    / {metasHoje.calorias.meta} {metasHoje.calorias.unidade}
                  </Text>
                </Text>
              </View>

              {/* Barra de Progresso Calorias */}
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressBar,
                    { width: `${percCal}%`, backgroundColor: "#0f766e" },
                  ]}
                />
              </View>

              <View style={styles.calorieRestanteBox}>
                <Text style={styles.calorieRestanteText}>
                  Restam {metasHoje.calorias.meta - metasHoje.calorias.atual} kcal • Ver Cardápio →
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Botão de Treino Primário Estilo Clínica FAAZ */}
          {!treinoFeito ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setTreinoFeito(true)}
              style={styles.treinoButtonPrimary}
            >
              <Dumbbell size={18} color="#ffffff" />
              <Text style={styles.treinoButtonText}>
                Fiz meu treino de hoje!
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.treinoSuccessCard}>
              <View style={styles.treinoSuccessLeft}>
                <CheckCircle2 size={18} color="#0f766e" />
                <Text style={styles.treinoSuccessText}>
                  Treino de hoje registrado com sucesso! 🎉
                </Text>
              </View>
              <TouchableOpacity onPress={() => setTreinoFeito(false)}>
                <Text style={styles.undoLink}>Desfazer</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ======================================================== */}
        {/* 4. SESSÃO: "Check-ins Rápidos" (Cores Pastéis Acolhedoras) */}
        {/* ======================================================== */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Check-ins Rápidos</Text>
            <Text style={styles.sectionSubtitle}>
              Menos de 1 minuto
            </Text>
          </View>

          <View style={styles.checkinsStack}>
            {checkinsPendentes.map((checkin) => {
              const isDone = checkinsConcluidos.includes(checkin.id);

              return (
                <TouchableOpacity
                  key={checkin.id}
                  activeOpacity={0.8}
                  onPress={() => handleCheckinPress(checkin)}
                  style={[
                    styles.checkinItem,
                    isDone ? styles.checkinItemDone : styles.checkinItemPending,
                  ]}
                >
                  <View style={styles.checkinLeftGroup}>
                    {/* Ícone com tom pastel específico */}
                    <View
                      style={[
                        styles.checkinIconCircle,
                        checkin.id === "bristol"
                          ? { backgroundColor: "#fef3c7" }
                          : checkin.id === "sono"
                          ? { backgroundColor: "#e0e7ff" }
                          : { backgroundColor: "#ffe4e6" },
                      ]}
                    >
                      {checkin.id === "bristol" ? (
                        <Activity size={20} color="#b45309" />
                      ) : checkin.id === "sono" ? (
                        <Moon size={20} color="#4338ca" />
                      ) : (
                        <Smile size={20} color="#be123c" />
                      )}
                    </View>

                    <View style={styles.checkinTextCol}>
                      <Text style={styles.checkinTitle}>{checkin.titulo}</Text>
                      <Text style={styles.checkinSubtitle}>
                        {isDone
                          ? "✓ Registrado hoje na Clínica FAAZ"
                          : checkin.subtitulo}
                      </Text>
                    </View>
                  </View>

                  {isDone ? (
                    <CheckCircle2 size={20} color="#0f766e" />
                  ) : (
                    <ChevronRight size={18} color="#94a3b8" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* ======================================================== */}
      {/* 5. BOTTOM NAVIGATION FIXA PREMIUM (CLÍNICA FAAZ) */}
      {/* ======================================================== */}
      <View style={styles.bottomNavContainer}>
        {[
          { label: "Home", icon: HomeIcon },
          { label: "Dieta", icon: Utensils },
          { label: "Chat", icon: MessageCircle },
          { label: "Perfil", icon: User },
        ].map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.label;

          return (
            <TouchableOpacity
              key={tab.label}
              activeOpacity={0.7}
              onPress={() => {
                setActiveTab(tab.label);
                if (tab.label === "Dieta" && onNavigateToDieta) {
                  onNavigateToDieta();
                } else if (tab.label === "Dieta" && typeof window !== "undefined") {
                  window.location.href = "/app/dieta";
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
  root: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 95,
  },

  /* 1. Header Clínica FAAZ */
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  logoGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#ccfbf1",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  logoDot: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#0d9488",
    top: 18,
    left: 18,
  },
  brandTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  brandPrefix: {
    fontSize: 16,
    fontWeight: "600",
    color: "#334155",
    letterSpacing: -0.3,
  },
  brandName: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 9,
    fontWeight: "800",
    color: "#0d9488",
    letterSpacing: 0.8,
    marginTop: 1,
  },
  avatarButton: {
    position: "relative",
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#e2e8f0",
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: "900",
    color: "#334155",
  },
  avatarStatusBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#10b981",
    borderWidth: 2,
    borderColor: "#ffffff",
  },

  /* Greeting */
  greetingSection: {
    paddingVertical: 14,
  },
  greetingText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.4,
  },
  greetingSubtext: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748b",
    marginTop: 2,
  },

  /* 2. Card Dark Premium */
  protocolCardDark: {
    backgroundColor: "#0f172a",
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
    elevation: 3,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  protocolCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  protocolBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#134e4a",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: "#2dd4bf40",
  },
  protocolBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#5eead4",
    letterSpacing: 0.5,
  },
  activePill: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activePillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
  },
  appointmentContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  calendarIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#134e4a",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  appointmentTexts: {
    flex: 1,
  },
  appointmentLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#2dd4bf",
    letterSpacing: 0.8,
  },
  appointmentDate: {
    fontSize: 15,
    fontWeight: "900",
    color: "#ffffff",
    marginTop: 2,
    letterSpacing: -0.2,
  },
  doctorName: {
    fontSize: 11,
    fontWeight: "500",
    color: "#94a3b8",
    marginTop: 3,
  },

  /* 3. Metas Hoje */
  sectionContainer: {
    marginVertical: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
  },
  goalsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  goalCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    padding: 14,
    justifyContent: "space-between",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  goalCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cyanIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#f0f9ff",
    alignItems: "center",
    justifyContent: "center",
  },
  cyanPercent: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0284c7",
  },
  amberIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#fffbeb",
    alignItems: "center",
    justifyContent: "center",
  },
  tealPercent: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0f766e",
  },
  goalCardBody: {
    marginBottom: 8,
  },
  goalTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  goalAmount: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 2,
  },
  goalUnit: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
  },
  progressTrack: {
    width: "100%",
    backgroundColor: "#f1f5f9",
    borderRadius: 9999,
    height: 6,
    overflow: "hidden",
    marginBottom: 10,
  },
  progressBar: {
    height: 6,
    borderRadius: 9999,
  },
  waterQuickButton: {
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: "center",
  },
  waterQuickButtonText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#0369a1",
  },
  calorieRestanteBox: {
    paddingVertical: 6,
    alignItems: "center",
  },
  calorieRestanteText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#94a3b8",
  },

  /* Botão Treino */
  treinoButtonPrimary: {
    backgroundColor: "#0f766e",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
    elevation: 2,
    shadowColor: "#0f766e",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  treinoButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.2,
  },
  treinoSuccessCard: {
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#99f6e4",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  treinoSuccessLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  treinoSuccessText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#115e59",
    flex: 1,
  },
  undoLink: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
  },

  /* 4. Check-ins Rápidos */
  checkinsStack: {
    gap: 10,
  },
  checkinItem: {
    width: "100%",
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  checkinItemPending: {
    backgroundColor: "#ffffff",
    borderColor: "#f1f5f9",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  checkinItemDone: {
    backgroundColor: "#f0fdfa",
    borderColor: "#99f6e4",
  },
  checkinLeftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  checkinIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  checkinTextCol: {
    flex: 1,
  },
  checkinTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  checkinSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748b",
    marginTop: 2,
  },

  /* 5. Bottom Navigation */
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
    fontWeight: "700",
  },
  bottomNavLabelActive: {
    color: "#0f766e",
  },
  bottomNavLabelInactive: {
    color: "#94a3b8",
  },
});

export default HomeScreen;
