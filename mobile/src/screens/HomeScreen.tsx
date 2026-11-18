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
  Platform,
} from "react-native";
import logoFaaz from "../assets/logo.png";
import {
  Hexagon,
  Calendar,
  Clock,
  Droplets,
  Flame,
  Dumbbell,
  Activity,
  HeartPulse,
  Moon,
  ChevronRight,
  CheckCircle2,
  Home as HomeIcon,
  Utensils,
  Target,
  MessageCircle,
  User,
  LogOut,
} from "lucide-react-native";
import { usePatientAuth } from "../contexts/PatientAuthContext";
import { useDiarioAlimentar } from "../contexts/DiarioAlimentarContext";
import { WeightJourneyPath } from "../components/WeightJourneyPath";
import { api, getBaseApiUrl } from "../services/api";
import {
  mockPatientHome,
  PatientHomeData,
  CheckinPendente,
} from "../mocks/patientHome";

export interface HomeScreenProps {
  data?: PatientHomeData;
  onNavigateToCheckin?: (id: string) => void;
  onTabPress?: (tabName: string) => void;
  onNavigateToDieta?: () => void;
  onNavigateToMetas?: () => void;
  completedCheckins?: string[];
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

const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const DIAS_SEMANA_PT = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

function formatDataHumanaFromIso(isoStr: string, fallback?: string): string {
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return fallback || "";
  return `${d.getDate()} de ${MESES_PT[d.getMonth()]}, ${DIAS_SEMANA_PT[d.getDay()]}`;
}

function formatHorarioFromIso(isoStr: string, fallback?: string): string {
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return fallback || "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const WHATSAPP_RECEPCAO_NUMERO = "5531984400076";
const WHATSAPP_URL_OFICIAL =
  "https://wa.me/5531984400076?text=Olá!%20Sou%20paciente%20da%20Clínica%20FAAZ%20e%20gostaria%20de%20atendimento.";

export function HomeScreen({
  data = mockPatientHome,
  onNavigateToCheckin,
  onTabPress,
  onNavigateToDieta,
  onNavigateToMetas,
  completedCheckins = [],
}: HomeScreenProps) {
  const { paciente: authPaciente, logout } = usePatientAuth();
  const {
    caloriasMeta: contextCaloriasMeta,
    caloriasConsumidas: contextCaloriasConsumidas,
    percentualConsumido: contextPercentualConsumido,
  } = useDiarioAlimentar();
  const { paciente, metasHoje, checkinsPendentes } = data;

  const nomeExibicao = authPaciente?.nome || paciente.nome;
  const initialLetter = (nomeExibicao || "P").trim().charAt(0).toUpperCase();
  const realPacienteId = authPaciente?.id || "";

  const avatarUrl = React.useMemo(() => {
    if (!authPaciente?.avatarUrl) return null;
    const url = authPaciente.avatarUrl;
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
      return url;
    }
    const base = getBaseApiUrl().replace(/\/api\/?$/, "");
    return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
  }, [authPaciente?.avatarUrl]);

  const [treinoFeito, setTreinoFeito] = useState(false);
  const [salvandoTreino, setSalvandoTreino] = useState(false);
  const [aguaAtual, setAguaAtual] = useState(0);
  const [metaAguaLitrosState, setMetaAguaLitrosState] = useState<number>(0);
  const [pesoInicialJornada, setPesoInicialJornada] = useState<number>(0);
  const [pesoAtualJornada, setPesoAtualJornada] = useState<number>(0);
  const [pesoMetaJornada, setPesoMetaJornada] = useState<number>(0);
  const [internalCheckins, setInternalCheckins] = useState<string[]>([]);
  const checkinsConcluidos = Array.from(
    new Set([...internalCheckins, ...(completedCheckins || [])])
  );
  const [activeTab, setActiveTab] = useState<string>("Home");
  const [proximaConsulta, setProximaConsulta] =
    useState<ProximaConsultaInfo | null>(null);
  const [carregandoConsulta, setCarregandoConsulta] = useState<boolean>(true);

  const metaAguaLitros = metaAguaLitrosState;
  const percAgua =
    metaAguaLitros > 0
      ? Math.min(Math.round((aguaAtual / metaAguaLitros) * 100), 100)
      : 0;
  const calAtual = metasHoje?.calorias?.atual ?? 0;
  const calMeta = metasHoje?.calorias?.meta ?? 2000;
  const percCal = Math.min(
    Math.round((calAtual / (calMeta || 1)) * 100),
    100
  );

  function handleCheckinPress(checkin: CheckinPendente) {
    if (onNavigateToCheckin) {
      onNavigateToCheckin(checkin.id);
    } else {
      if (!checkinsConcluidos.includes(checkin.id)) {
        setInternalCheckins([...internalCheckins, checkin.id]);
        Alert.alert(
          `${checkin.titulo} Registrado!`,
          "Seus dados foram sincronizados com seu prontuário na Clínica FAAZ."
        );
      } else {
        Alert.alert(checkin.titulo, "Você já registrou este check-in hoje!");
      }
    }
  }

  // Sincroniza a ingestão de água acumulada hoje do paciente logado
  useEffect(() => {
    async function loadTodayHidratacao() {
      try {
        const json = await api.checkins.getHidratacaoHoje(realPacienteId);
        if (
          json?.success &&
          json?.paciente &&
          typeof json.paciente.totalHojeMl === "number"
        ) {
          setAguaAtual(parseFloat((json.paciente.totalHojeMl / 1000).toFixed(2)));
        } else if (
          json?.success &&
          typeof json?.totalHojeMl === "number" &&
          json.totalHojeMl > 0
        ) {
          setAguaAtual(parseFloat((json.totalHojeMl / 1000).toFixed(2)));
        }
      } catch {
        // Fallback silencioso mantendo valor local
      }
    }
    loadTodayHidratacao();
  }, [realPacienteId]);

  // Sincroniza o peso atual e metas reais do paciente logado via API Oracle
  useEffect(() => {
    if (!realPacienteId) return;
    let isMounted = true;
    async function loadPesoEMetasRecentes() {
      try {
        const metasJson = await api.pacientes.getMetas(realPacienteId);
        if (isMounted && metasJson) {
          if (metasJson.metas?.aguaMlAlvo !== undefined) {
            setMetaAguaLitrosState(
              Number((Number(metasJson.metas.aguaMlAlvo) / 1000).toFixed(1)) || 0
            );
          }
          if (metasJson.pesoEvolucao) {
            setPesoInicialJornada(Number(metasJson.pesoEvolucao.pesoInicialKg) || 0);
            setPesoAtualJornada(Number(metasJson.pesoEvolucao.pesoAtualKg) || 0);
            setPesoMetaJornada(Number(metasJson.pesoEvolucao.pesoAlvoKg) || 0);
          }
        }
      } catch {
        // Mantém estado zerado
      }

      try {
        const json = await api.pacientes.getPesagens(realPacienteId);
        if (json && typeof json.pesoAtual === "number" && isMounted) {
          setPesoAtualJornada(json.pesoAtual);
        }
      } catch {
        // Mantém valor sincronizado
      }
    }
    loadPesoEMetasRecentes();
    return () => {
      isMounted = false;
    };
  }, [realPacienteId]);

  // Busca e sincroniza a Próxima Consulta do paciente logado na Agenda da Clínica FAAZ
  useEffect(() => {
    let isMounted = true;

    async function loadProximaConsulta() {
      try {
        const json = await api.pacientes.getProximaConsulta(realPacienteId);
        if (json && json.success && json.temProximaConsulta && json.proximaConsulta && isMounted) {
          const pc = json.proximaConsulta;
          setProximaConsulta({
            ...pc,
            dataFormatada:
              pc.dataFormatada || formatDataHumanaFromIso(pc.dataHora),
            horario: pc.horario || formatHorarioFromIso(pc.dataHora),
          });
        } else if (isMounted) {
          setProximaConsulta(null);
        }
      } catch {
        // Fallback silencioso mantendo o estado atual
      } finally {
        if (isMounted) {
          setCarregandoConsulta(false);
        }
      }
    }

    setCarregandoConsulta(true);
    loadProximaConsulta();

    const intervalId = setInterval(loadProximaConsulta, 5000);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [realPacienteId]);

  // Busca e sincroniza status do check-in de treino diário no WorkoutLog da Clínica FAAZ
  useEffect(() => {
    let isMounted = true;
    async function carregarStatusTreino() {
      try {
        const res = await api.checkins.getTreinoHoje(realPacienteId);
        if (isMounted && res && typeof res.treinouHoje === "boolean") {
          setTreinoFeito(res.treinouHoje);
        }
      } catch {
        // Fallback silencioso mantendo o estado local
      }
    }
    carregarStatusTreino();

    return () => {
      isMounted = false;
    };
  }, [realPacienteId]);

  async function handleRegistrarTreino() {
    if (treinoFeito || salvandoTreino) return;
    // Optimistic UI: atualização instantânea na interface
    setTreinoFeito(true);
    setSalvandoTreino(true);
    try {
      await api.checkins.registrarTreino(realPacienteId);
    } catch (err) {
      console.error("[HomeScreen] Erro ao registrar treino:", err);
    } finally {
      setSalvandoTreino(false);
    }
  }

  async function handleDesfazerTreino() {
    if (salvandoTreino) return;
    setTreinoFeito(false);
    setSalvandoTreino(true);
    try {
      await api.checkins.desfazerTreino(realPacienteId);
    } catch (err) {
      console.error("[HomeScreen] Erro ao desfazer treino:", err);
    } finally {
      setSalvandoTreino(false);
    }
  }

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

  // Compatibilidade com chamadas legadas
  const handleAgendarWhatsApp = handleOpenWhatsApp;

  async function handleAddAgua(ml: number = 250) {
    const incrementoLitros = ml / 1000;
    const novoValor = parseFloat((aguaAtual + incrementoLitros).toFixed(2));
    setAguaAtual(novoValor);

    try {
      const json = await api.checkins.registrarHidratacao({
        pacienteId: realPacienteId,
        volumeMl: ml,
        metaDiariaMl: Math.round(metaAguaLitros * 1000),
      });
      if (json && typeof json.totalHojeMl === "number") {
        setAguaAtual(parseFloat((json.totalHojeMl / 1000).toFixed(2)));
      }
    } catch {
      // Falha silenciosa no envio remoto, mantendo a atualização otimista local
    }
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
          {/* Lado Esquerdo: Botão Trocar Paciente */}
          <View style={styles.headerSideSlot}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                Alert.alert(
                  "Trocar Paciente",
                  `Deseja sair da conta de ${nomeExibicao} e trocar de paciente?`,
                  [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Trocar Paciente", style: "destructive", onPress: logout },
                  ]
                );
              }}
              style={styles.switchButton}
            >
              <LogOut size={13} color="#64748b" />
              <Text style={styles.switchButtonText}>Trocar</Text>
            </TouchableOpacity>
          </View>

          {/* Centro: Logo Oficial da Clínica FAAZ Centralizada */}
          <View style={styles.headerCenterLogo}>
            <Image
              source={logoFaaz}
              accessibilityLabel="Clínica FAAZ"
              resizeMode="contain"
              className="h-8 w-auto object-contain"
              style={styles.headerLogoImage}
            />
          </View>

          {/* Lado Direito: Foto de Perfil / Avatar */}
          <View style={[styles.headerSideSlot, { alignItems: "flex-end" }]}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                if (onTabPress) {
                  onTabPress("Perfil");
                }
              }}
              style={styles.avatarButton}
            >
              <View style={[styles.avatarCircle, { overflow: "hidden" }]}>
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={{ width: 34, height: 34, borderRadius: 17 }}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={styles.avatarInitial}>{initialLetter}</Text>
                )}
              </View>
              <View style={styles.avatarStatusBadge} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Saudação Amigável e Suave */}
        <View style={styles.greetingSection}>
          <Text style={styles.greetingText}>
            Bom dia, {nomeExibicao} ✨
          </Text>
          <Text style={styles.greetingSubtext}>
            {authPaciente?.focoClinico
              ? `Plano: ${authPaciente.focoClinico}`
              : "Seu plano de longevidade e nutrição para hoje."}
          </Text>
        </View>

        {/* ======================================================== */}
        {/* 2. AGENDA DE CONSULTAS: GHOST CARD TRANSPARENTE E DIRETO */}
        {/* ======================================================== */}
        <View style={styles.agendaGhostContainer}>
          {proximaConsulta ? (
            <View style={styles.appointmentGhostContent}>
              <View style={styles.appointmentGhostHeaderRow}>
                <View style={styles.appointmentGhostIconRow}>
                  <Calendar size={13} color="#0d9488" />
                  <Text style={styles.appointmentGhostLabel}>
                    PRÓXIMA CONSULTA • {proximaConsulta.tipoLegivel.toUpperCase()}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadgeGhostPill,
                    proximaConsulta.status === "CONFIRMADO"
                      ? styles.statusBadgeGhostConfirmado
                      : styles.statusBadgeGhostAgendado,
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor:
                          proximaConsulta.status === "CONFIRMADO"
                            ? "#059669"
                            : "#64748b",
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusBadgeGhostText,
                      proximaConsulta.status === "CONFIRMADO"
                        ? styles.statusBadgeGhostTextConfirmado
                        : styles.statusBadgeGhostTextAgendado,
                    ]}
                  >
                    {proximaConsulta.status === "CONFIRMADO"
                      ? "CONFIRMADO"
                      : "AGENDADO"}
                  </Text>
                </View>
              </View>

              <Text style={styles.appointmentGhostDate}>
                {proximaConsulta.dataFormatada.toUpperCase()}
              </Text>

              <View style={styles.appointmentGhostFooterRow}>
                <View style={styles.timePillBoxGhost}>
                  <Clock size={11} color="#0d9488" />
                  <Text style={styles.timePillTextGhost}>
                    {proximaConsulta.horario}
                  </Text>
                </View>
                <Text style={styles.doctorNameGhost}>
                  {proximaConsulta.medicoNome ||
                    authPaciente?.medicoResponsavel ||
                    "DR. CARLOS FANTINI"}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.emptyAgendaGhostContainer}>
              <View style={styles.emptyAgendaTextRow}>
                <Calendar size={13} color="#64748b" />
                <Text style={styles.emptyAgendaDirectNotice}>
                  NENHUMA CONSULTA AGENDADA. FALE COM A RECEPÇÃO.
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleOpenWhatsApp}
                style={styles.whatsappCompactButton}
              >
                <MessageCircle size={12} color="#ffffff" />
                <Text style={styles.whatsappCompactButtonText}>
                  FALAR NO WHATSAPP
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ======================================================== */}
        {/* JORNADA DE PESO (5 ESTRELAS) - CAMINHO GAMIFICADO        */}
        {/* ======================================================== */}
        <WeightJourneyPath
          pacienteId={realPacienteId}
          pesoInicial={pesoInicialJornada}
          pesoAtual={pesoAtualJornada}
          pesoMeta={pesoMetaJornada}
          onPesoUpdated={(novo) => {
            setPesoAtualJornada(novo);
          }}
        />

        {/* ======================================================== */}
        {/* 3. SESSÃO: "Suas Metas Hoje" (2 COLUNAS COMPACTAS)       */}
        {/* ======================================================== */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>SUAS METAS HOJE</Text>
            <Text style={styles.sectionSubtitle}>ACOMPANHAMENTO DIÁRIO</Text>
          </View>

          <View style={styles.goalsGrid}>
            {/* CARD 1 (ESQUERDA): ÁGUA INGERIDA */}
            <View style={styles.goalCard}>
              <View>
                <View style={styles.goalCardHeader}>
                  <View style={styles.cyanIconBoxCompact}>
                    <Droplets size={14} color="#0284c7" />
                  </View>
                  <View style={styles.waterPercentBadge}>
                    <Text style={styles.waterPercentBadgeText}>{percAgua}%</Text>
                  </View>
                </View>

                <View style={styles.goalCardBody}>
                  <Text style={styles.goalTitle} numberOfLines={1}>
                    ÁGUA INGERIDA
                  </Text>
                  <Text style={styles.goalAmount} numberOfLines={1}>
                    {aguaAtual}{" "}
                    <Text style={styles.goalUnit}>/ {metaAguaLitros} L</Text>
                  </Text>
                </View>
              </View>

              <View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressBar,
                      { width: `${percAgua}%`, backgroundColor: "#0284c7" },
                    ]}
                  />
                </View>

                <View style={styles.waterButtonsRow}>
                  <TouchableOpacity
                    onPress={() => handleAddAgua(250)}
                    activeOpacity={0.7}
                    style={styles.waterQuickButton}
                  >
                    <Text style={styles.waterQuickButtonText} numberOfLines={1}>
                      +250ml
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleAddAgua(500)}
                    activeOpacity={0.7}
                    style={[
                      styles.waterQuickButton,
                      styles.waterQuickButtonGarrafa,
                    ]}
                  >
                    <Text
                      style={[
                        styles.waterQuickButtonText,
                        styles.waterQuickButtonGarrafaText,
                      ]}
                      numberOfLines={1}
                    >
                      +500ml
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* CARD 2 (DIREITA): META CALÓRICA DIÁRIA */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                if (onTabPress) onTabPress("Dieta");
                else if (onNavigateToMetas) onNavigateToMetas();
              }}
              style={styles.goalCard}
            >
              <View>
                <View style={styles.goalCardHeader}>
                  <View style={styles.amberIconBox}>
                    <Flame size={14} color="#d97706" />
                  </View>
                  <View style={styles.calPercentBadge}>
                    <Text style={styles.calPercentBadgeText}>
                      {contextPercentualConsumido}%
                    </Text>
                  </View>
                </View>

                <View style={styles.goalCardBody}>
                  <Text style={styles.goalTitle} numberOfLines={1}>
                    Meta Calórica Diária
                  </Text>
                  <Text style={styles.goalAmount} numberOfLines={1}>
                    {contextCaloriasConsumidas}{" "}
                    <Text style={styles.goalUnit}>
                      / {contextCaloriasMeta} kcal
                    </Text>
                  </Text>
                </View>
              </View>

              <View style={[styles.progressTrack, styles.progressTrackFlush]}>
                <View
                  style={[
                    styles.progressBar,
                    {
                      width: `${contextPercentualConsumido}%`,
                      backgroundColor: "#f97316",
                    },
                  ]}
                />
              </View>
            </TouchableOpacity>
          </View>

          {/* Botão de Treino Primário Estilo Clínica FAAZ (Habit Tracker) */}
          {!treinoFeito ? (
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={salvandoTreino}
              onPress={handleRegistrarTreino}
              style={[
                styles.treinoButtonPrimary,
                salvandoTreino && { opacity: 0.7 },
              ]}
            >
              <Dumbbell size={18} color="#ffffff" />
              <Text style={styles.treinoButtonText}>
                {salvandoTreino ? "REGISTRANDO TREINO..." : "FIZ MEU TREINO DE HOJE!"}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.treinoSuccessCard}>
              <View style={styles.treinoSuccessLeft}>
                <CheckCircle2 size={18} color="#0f766e" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.treinoSuccessText}>
                    TREINO CONCLUÍDO! 🎉
                  </Text>
                  <Text style={{ fontSize: 10, color: "#0f766e", opacity: 0.8 }}>
                    Meta diária registrada no Habit Tracker
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={handleDesfazerTreino}
                disabled={salvandoTreino}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.undoLink}>DESFAZER</Text>
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
            {checkinsPendentes
              .filter((checkin) => checkin.id !== "humor")
              .map((checkin) => {
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
                        checkin.id === "glicemia"
                          ? { backgroundColor: "#ffe4e6" }
                          : checkin.id === "bristol"
                          ? { backgroundColor: "#fef3c7" }
                          : checkin.id === "sono"
                          ? { backgroundColor: "#e0e7ff" }
                          : { backgroundColor: "#f1f5f9" },
                      ]}
                    >
                      {checkin.id === "glicemia" ? (
                        <HeartPulse size={20} color="#e11d48" />
                      ) : checkin.id === "bristol" ? (
                        <Activity size={20} color="#b45309" />
                      ) : checkin.id === "sono" ? (
                        <Moon size={20} color="#4338ca" />
                      ) : (
                        <Activity size={20} color="#475569" />
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
          { label: "METAS", icon: Target },
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
                } else if (tab.label === "METAS") {
                  if (onNavigateToMetas) onNavigateToMetas();
                  else if (onTabPress) onTabPress("METAS");
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
  headerSideSlot: {
    width: 84,
    justifyContent: "center",
  },
  headerCenterLogo: {
    flex: 1,
    height: 32,
    maxHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  headerLogoImage: {
    height: 32,
    maxHeight: 32,
    width: 96,
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
    fontWeight: "500",
    color: "#4b5563",
    letterSpacing: -0.3,
  },
  brandName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 9,
    fontWeight: "600",
    color: "#0d9488",
    letterSpacing: 0.8,
    marginTop: 1,
  },
  headerRightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  switchButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  switchButtonText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#4b5563",
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
    fontWeight: "700",
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
    paddingTop: 4,
    paddingBottom: 8,
  },
  greetingText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.4,
  },
  greetingSubtext: {
    fontSize: 12,
    fontWeight: "400",
    color: "#4b5563",
    marginTop: 2,
  },

  /* 2. Agenda Ghost - Sem fundo, sem bordas, sem sombras (Transparente) */
  agendaGhostContainer: {
    backgroundColor: "transparent",
    paddingVertical: 6,
    paddingHorizontal: 2,
    marginBottom: 8,
    marginTop: 2,
  },
  emptyAgendaGhostContainer: {
    gap: 6,
  },
  emptyAgendaTextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  emptyAgendaDirectNotice: {
    fontSize: 10,
    fontWeight: "400",
    color: "#4b5563",
    letterSpacing: 0.2,
  },
  whatsappCompactButton: {
    backgroundColor: "#0d9488",
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
  },
  whatsappCompactButtonText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#ffffff",
    letterSpacing: 0.2,
  },

  /* Consulta Agendada em formato Ghost */
  appointmentGhostContent: {
    gap: 4,
  },
  appointmentGhostHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  appointmentGhostIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  appointmentGhostLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#0f766e",
    letterSpacing: 0.3,
  },
  statusBadgeGhostPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusBadgeGhostConfirmado: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  statusBadgeGhostAgendado: {
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  statusBadgeGhostText: {
    fontSize: 9,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  statusBadgeGhostTextConfirmado: {
    color: "#065f46",
  },
  statusBadgeGhostTextAgendado: {
    color: "#475569",
  },
  appointmentGhostDate: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  appointmentGhostFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timePillBoxGhost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f0fdfa",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ccfbf1",
  },
  timePillTextGhost: {
    fontSize: 10,
    fontWeight: "600",
    color: "#0f766e",
  },
  doctorNameGhost: {
    fontSize: 10,
    fontWeight: "400",
    color: "#4b5563",
    letterSpacing: 0.2,
  },

  /* 3. Metas Hoje - Layout Minimalista e Compacto Edge-to-Edge */
  sectionContainer: {
    marginTop: 2,
    marginBottom: 6,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: 0.3,
  },
  sectionSubtitle: {
    fontSize: 10,
    fontWeight: "400",
    color: "#4b5563",
    letterSpacing: 0.2,
  },

  cyanIconBoxCompact: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#e0f2fe",
    alignItems: "center",
    justifyContent: "center",
  },
  waterPercentBadge: {
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 9999,
  },
  waterPercentBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#0284c7",
    letterSpacing: 0.2,
  },
  calPercentBadge: {
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 9999,
  },
  calPercentBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#d97706",
    letterSpacing: 0.2,
  },
  goalsGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    marginBottom: 8,
  },
  goalCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    padding: 12,
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
    marginBottom: 6,
  },
  amberIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fef3c7",
    alignItems: "center",
    justifyContent: "center",
  },
  goalCardBody: {
    marginBottom: 8,
  },
  goalTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
  },
  goalAmount: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
    marginTop: 2,
  },
  goalUnit: {
    fontSize: 10,
    fontWeight: "400",
    color: "#64748b",
  },
  progressTrack: {
    width: "100%",
    backgroundColor: "#f1f5f9",
    borderRadius: 9999,
    height: 5,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressTrackFlush: {
    marginBottom: 0,
  },
  progressBar: {
    height: 5,
    borderRadius: 9999,
  },
  waterButtonsRow: {
    flexDirection: "row",
    gap: 6,
  },
  waterQuickButton: {
    flex: 1,
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  waterQuickButtonGarrafa: {
    backgroundColor: "#e0f2fe",
    borderColor: "#7dd3fc",
  },
  waterQuickButtonText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#0369a1",
  },
  waterQuickButtonGarrafaText: {
    color: "#0284c7",
  },

  /* Botão Treino Edge-to-Edge */
  treinoButtonPrimary: {
    width: "100%",
    backgroundColor: "#0f766e",
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
    elevation: 2,
    shadowColor: "#0f766e",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  treinoButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ffffff",
    letterSpacing: 0.2,
  },
  treinoSuccessCard: {
    width: "100%",
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#99f6e4",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  treinoSuccessLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  treinoSuccessText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#115e59",
    flex: 1,
  },
  undoLink: {
    fontSize: 11,
    fontWeight: "400",
    color: "#64748b",
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
    fontWeight: "600",
    color: "#0f172a",
  },
  checkinSubtitle: {
    fontSize: 12,
    fontWeight: "400",
    color: "#4b5563",
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
    fontWeight: "500",
  },
  bottomNavLabelActive: {
    color: "#0f766e",
  },
  bottomNavLabelInactive: {
    color: "#94a3b8",
  },
});

export default HomeScreen;
