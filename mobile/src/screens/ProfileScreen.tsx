import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
  Platform,
  Image,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import {
  ShieldCheck,
  Phone,
  FileText,
  LogOut,
  ChevronRight,
  HeartPulse,
  Calendar,
  Clock,
  Target,
  Camera,
  Pill,
  MessageCircle,
  User as UserIcon,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { usePatientAuth } from "../contexts/PatientAuthContext";
import { StandardHeader } from "../components/StandardHeader";
import { BottomTabBar, MainTabKey } from "../components/BottomTabBar";
import { api, resolveAssetUrl } from "../services/api";
import { getConfigObjetivoClinico } from "../utils/objetivoClinico";

export interface ProfileScreenProps {
  onBack?: () => void;
  onTabPress?: (tabName: MainTabKey | string) => void;
  onNavigateToDieta?: () => void;
  onNavigateToMetas?: () => void;
}

interface ProximaConsultaData {
  id: string;
  dataHora: string;
  duracaoMinutos?: number;
  tipo?: string;
  tipoLegivel?: string;
  status?: string;
  statusLegivel?: string;
  medicoNome?: string;
  medicoEspecialidade?: string;
  medico?: {
    nome?: string | null;
    especialidade?: string | null;
  } | null;
  observacao?: string;
}

const WHATSAPP_URL_OFICIAL =
  "https://wa.me/5531984400076?text=Olá!%20Sou%20paciente%20da%20Clínica%20FAAZ%20e%20gostaria%20de%20atendimento.";

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

/**
 * Formata data, horário e contagem regressiva EXCLUSIVAMENTE a partir do ISO UTC
 * no fuso local do dispositivo (evita divergência UTC do servidor).
 */
function formatConsultaLocal(isoStr: string): {
  dataExtenso: string;
  horarioLocal: string;
  contagemRegressiva: string;
} {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) {
    return {
      dataExtenso: "Data a confirmar",
      horarioLocal: "--:--",
      contagemRegressiva: "",
    };
  }

  const dia = d.getDate();
  const mes = MESES_PT[d.getMonth()] || "";
  const diaSemana = DIAS_SEMANA_PT[d.getDay()] || "";
  const pad = (n: number) => String(n).padStart(2, "0");

  const dataExtenso = `${dia} de ${mes}, ${diaSemana}`;
  const horarioLocal = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const agora = new Date();
  const hojeZero = new Date(
    agora.getFullYear(),
    agora.getMonth(),
    agora.getDate()
  );
  const consultaZero = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDias = Math.round(
    (consultaZero.getTime() - hojeZero.getTime()) / (1000 * 60 * 60 * 24)
  );

  let contagemRegressiva = "";
  if (diffDias <= 0) {
    contagemRegressiva = "Hoje";
  } else if (diffDias === 1) {
    contagemRegressiva = "Amanhã";
  } else {
    contagemRegressiva = `Em ${diffDias} dias`;
  }

  return { dataExtenso, horarioLocal, contagemRegressiva };
}

function formatCpfExibicao(cpf?: string | null): string {
  if (!cpf) return "Não informado";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatNomeTitleCase(nome?: string | null): string {
  if (!nome) return "Paciente FAAZ";
  return nome
    .trim()
    .split(/\s+/)
    .map((part) => {
      const lower = part.toLowerCase();
      if (["de", "da", "do", "das", "dos", "e"].includes(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function ProfileScreen({ onTabPress }: ProfileScreenProps) {
  const { paciente, logout, atualizarAvatarUrl } = usePatientAuth();
  const pacienteId = paciente?.id || "";

  const [isUploading, setIsUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [carregandoConsulta, setCarregandoConsulta] = useState(true);

  const [proximaConsulta, setProximaConsulta] =
    useState<ProximaConsultaData | null>(null);
  const [treatmentObjective, setTreatmentObjective] = useState<string>(
    paciente?.treatmentObjective || paciente?.focoClinico || ""
  );
  const [medicacoes, setMedicacoes] = useState<string | null>(
    paciente?.medicacoes ?? null
  );
  const [metaAguaMl, setMetaAguaMl] = useState<number>(
    paciente?.metaDiariaMl || 2500
  );
  const [convenio, setConvenio] = useState<string>(
    paciente?.convenio || "FAAZ Integrativo"
  );
  const [telefone, setTelefone] = useState<string | null>(
    paciente?.telefoneWhatsapp ?? null
  );
  const [email, setEmail] = useState<string | null>(paciente?.email ?? null);

  const nomeExibicao = formatNomeTitleCase(
    paciente?.socialName || paciente?.nome
  );
  const initialLetter = nomeExibicao.charAt(0).toUpperCase() || "P";
  const prontuarioCodigo = paciente?.recordCode || "--";
  const medicoConsulta =
    proximaConsulta?.medicoNome?.trim() ||
    proximaConsulta?.medico?.nome?.trim() ||
    "";
  const especialidadeConsulta =
    proximaConsulta?.medicoEspecialidade?.trim() ||
    proximaConsulta?.medico?.especialidade?.trim() ||
    "";
  const medicoResponsavel =
    medicoConsulta ||
    paciente?.medicoResponsavel?.trim() ||
    "Equipe Clínica FAAZ";
  const especialidade =
    especialidadeConsulta ||
    paciente?.especialidadeMedico?.trim() ||
    "Endocrinologia & Metabologia";
  const metaAguaLitros = (metaAguaMl / 1000).toFixed(1).replace(".", ",");

  const fullAvatarUrl = useMemo(
    () => resolveAssetUrl(paciente?.avatarUrl),
    [paciente?.avatarUrl]
  );

  const objetivoConfig = useMemo(
    () => getConfigObjetivoClinico(treatmentObjective),
    [treatmentObjective]
  );

  const carregarDadosClinica = useCallback(async () => {
    if (!pacienteId) {
      setCarregandoConsulta(false);
      return;
    }

    const [consultaRes, perfilRes, metasRes] = await Promise.allSettled([
      api.pacientes.getProximaConsulta(pacienteId),
      api.get(`/pacientes/${encodeURIComponent(pacienteId)}`),
      api.pacientes.getMetas(pacienteId),
    ]);

    if (consultaRes.status === "fulfilled" && consultaRes.value) {
      const c = consultaRes.value;
      if (c.success && c.temProximaConsulta && c.proximaConsulta) {
        setProximaConsulta(c.proximaConsulta);
      } else {
        setProximaConsulta(null);
      }
    }
    setCarregandoConsulta(false);

    if (perfilRes.status === "fulfilled" && perfilRes.value?.paciente) {
      const p = perfilRes.value.paciente;
      if (p.treatmentObjective || p.clinicalFocus) {
        setTreatmentObjective(p.treatmentObjective || p.clinicalFocus);
      }
      if (p.medicacoes !== undefined) {
        setMedicacoes(p.medicacoes || null);
      }
      if (p.convenio) setConvenio(p.convenio);
      if (p.phoneWhatsapp) setTelefone(p.phoneWhatsapp);
      if (p.email) setEmail(p.email);
      if (p.metaDiariaMl) setMetaAguaMl(Number(p.metaDiariaMl));
    }

    if (metasRes.status === "fulfilled" && metasRes.value?.metas) {
      const m = metasRes.value.metas;
      if (m.treatmentObjective || m.focoMetabolico) {
        setTreatmentObjective(m.treatmentObjective || m.focoMetabolico);
      }
      if (Number(m.aguaMlAlvo) > 0) {
        setMetaAguaMl(Number(m.aguaMlAlvo));
      }
    }
  }, [pacienteId]);

  useEffect(() => {
    carregarDadosClinica();
  }, [carregarDadosClinica]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await carregarDadosClinica();
    } finally {
      setRefreshing(false);
    }
  }, [carregarDadosClinica]);

  const handleSelectPhotoSource = () => {
    Alert.alert(
      "Foto de Perfil",
      "Escolha como deseja atualizar sua foto de perfil:",
      [
        { text: "Tirar Foto (Câmera)", onPress: () => handlePickImage("camera") },
        { text: "Escolher da Galeria", onPress: () => handlePickImage("gallery") },
        { text: "Cancelar", style: "cancel" },
      ]
    );
  };

  const handlePickImage = async (mode: "camera" | "gallery") => {
    if (!paciente?.id) {
      Alert.alert(
        "Atenção",
        "É necessário estar autenticado para alterar a foto de perfil."
      );
      return;
    }

    try {
      let result: ImagePicker.ImagePickerResult;
      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.4,
        base64: true,
      };

      if (mode === "camera") {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permissão da Câmera",
            "É necessário autorizar o acesso à câmera para tirar sua foto."
          );
          return;
        }
        result = await ImagePicker.launchCameraAsync(pickerOptions);
      } else {
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permissão da Galeria",
            "É necessário autorizar o acesso à galeria para selecionar sua foto."
          );
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
      }

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      if (!asset.uri) return;

      const MAX_FILE_SIZE_BYTES = 2048 * 1024;
      let fileSizeInBytes = asset.fileSize || 0;
      try {
        const fileInfo = await FileSystem.getInfoAsync(asset.uri);
        if (fileInfo.exists && typeof fileInfo.size === "number") {
          fileSizeInBytes = fileInfo.size;
        }
      } catch {
        // Segue com tamanho informado pelo picker
      }

      if (fileSizeInBytes > MAX_FILE_SIZE_BYTES) {
        Alert.alert(
          "Atenção",
          "A imagem selecionada excede 2MB. Escolha uma imagem menor."
        );
        return;
      }

      setIsUploading(true);
      let rawBase64 = asset.base64;

      try {
        const manipResult = await manipulateAsync(
          asset.uri,
          [{ resize: { width: 800, height: 800 } }],
          { compress: 0.4, format: SaveFormat.JPEG, base64: true }
        );
        if (manipResult.base64) {
          rawBase64 = manipResult.base64;
        }
      } catch {
        // Mantém base64 original se manipulator falhar
      }

      if (!rawBase64) {
        Alert.alert("Erro", "Não foi possível processar a imagem selecionada.");
        return;
      }

      const imageBase64 = "data:image/jpeg;base64," + rawBase64;
      const uploadRes = await api.pacientes.uploadAvatar(
        paciente.id,
        imageBase64,
        "image/jpeg"
      );

      if (uploadRes?.sucesso && uploadRes.avatarUrl) {
        atualizarAvatarUrl(uploadRes.avatarUrl);
        Alert.alert("Sucesso", "Foto de perfil atualizada.");
      } else {
        Alert.alert(
          "Falha no Salvamento",
          uploadRes?.error || "Não foi possível salvar a imagem."
        );
      }
    } catch (err: any) {
      Alert.alert(
        "Erro no Upload",
        err?.message || "Ocorreu uma falha ao enviar sua foto."
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleOpenWhatsApp = async () => {
    try {
      const targetUrl = encodeURI(decodeURI(WHATSAPP_URL_OFICIAL));
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.open(targetUrl, "_blank");
        return;
      }
      await Linking.openURL(targetUrl);
    } catch {
      Alert.alert(
        "WhatsApp Clínica FAAZ",
        "Não foi possível abrir o WhatsApp. Nosso número oficial: (31) 98440-0076"
      );
    }
  };

  const handleConfirmarLogout = () => {
    Alert.alert(
      "Trocar Paciente / Sair",
      `Deseja encerrar a sessão de ${nomeExibicao} neste dispositivo?`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Sair da Conta", style: "destructive", onPress: () => logout() },
      ]
    );
  };

  const consultaFormatada = useMemo(() => {
    if (!proximaConsulta?.dataHora) return null;
    return formatConsultaLocal(proximaConsulta.dataHora);
  }, [proximaConsulta?.dataHora]);

  return (
    <View style={styles.root}>
      {/* HEADER ESCURO EXECUTIVO (SEM VOLTAR) */}
      <StandardHeader
        title="Clínica"
        subtitle="Consultas, protocolo e sua conta"
        rightElement={
          <View style={styles.headerStatusBadge}>
            <ShieldCheck size={12} color="#2dd4bf" />
            <Text style={styles.headerStatusText}>Ativo</Text>
          </View>
        }
      />

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
        {/* ============================================================ */}
        {/* 1. CARD PRÓXIMA CONSULTA (FUSO LOCAL CORRIGIDO)              */}
        {/* ============================================================ */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardTitleGroup}>
              <View style={[styles.iconBox, { backgroundColor: "#f0fdfa" }]}>
                <Calendar size={16} color="#0f766e" />
              </View>
              <View>
                <Text style={styles.cardTitle}>Próxima Consulta</Text>
                <Text style={styles.cardSubtitle}>Agenda oficial Clínica FAAZ</Text>
              </View>
            </View>

            {consultaFormatada?.contagemRegressiva ? (
              <View style={styles.countdownPill}>
                <Text style={styles.countdownText}>
                  {consultaFormatada.contagemRegressiva}
                </Text>
              </View>
            ) : null}
          </View>

          {carregandoConsulta ? (
            <View style={styles.consultaLoadingRow}>
              <ActivityIndicator size="small" color="#0f766e" />
              <Text style={styles.consultaLoadingText}>
                Verificando agenda...
              </Text>
            </View>
          ) : proximaConsulta && consultaFormatada ? (
            <View style={styles.consultaBox}>
              <View style={styles.consultaDateRow}>
                <Text style={styles.consultaDateText}>
                  {consultaFormatada.dataExtenso}
                </Text>
                <View style={styles.consultaTimePill}>
                  <Clock size={12} color="#0f766e" />
                  <Text style={styles.consultaTimeText}>
                    {consultaFormatada.horarioLocal}
                  </Text>
                </View>
              </View>

              <View style={styles.consultaMetaList}>
                <Text style={styles.consultaDoctorName}>
                  {medicoConsulta || medicoResponsavel}
                </Text>
                <Text style={styles.consultaSpecialty}>
                  {especialidadeConsulta || especialidade}
                </Text>
              </View>

              <View style={styles.consultaTagsRow}>
                {proximaConsulta.tipoLegivel ? (
                  <View style={styles.tagPill}>
                    <Text style={styles.tagPillText}>
                      {proximaConsulta.tipoLegivel}
                    </Text>
                  </View>
                ) : null}
                {proximaConsulta.statusLegivel ? (
                  <View style={styles.tagPillSuccess}>
                    <Text style={styles.tagPillSuccessText}>
                      {proximaConsulta.statusLegivel}
                    </Text>
                  </View>
                ) : null}
                {proximaConsulta.duracaoMinutos ? (
                  <View style={styles.tagPill}>
                    <Text style={styles.tagPillText}>
                      {proximaConsulta.duracaoMinutos} min
                    </Text>
                  </View>
                ) : null}
              </View>

              {proximaConsulta.observacao ? (
                <Text style={styles.consultaNotes}>
                  {proximaConsulta.observacao}
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.emptyConsultaBox}>
              <Text style={styles.emptyConsultaTitle}>
                Nenhuma consulta futura agendada
              </Text>
              <Text style={styles.emptyConsultaSub}>
                Fale com nossa recepção pelo WhatsApp para agendar seu próximo
                retorno ou exame.
              </Text>
            </View>
          )}

          <TouchableOpacity
            activeOpacity={0.82}
            onPress={handleOpenWhatsApp}
            style={styles.whatsappBtn}
          >
            <MessageCircle size={16} color="#ffffff" />
            <Text style={styles.whatsappBtnText}>Falar no WhatsApp</Text>
          </TouchableOpacity>
        </View>

        {/* ============================================================ */}
        {/* 2. CARD PROTOCOLO CLÍNICO (OBJETIVO + MEDICAÇÕES)            */}
        {/* ============================================================ */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardTitleGroup}>
              <View style={[styles.iconBox, { backgroundColor: "#f0fdfa" }]}>
                <HeartPulse size={16} color="#0f766e" />
              </View>
              <View>
                <Text style={styles.cardTitle}>Protocolo Clínico</Text>
                <Text style={styles.cardSubtitle}>
                  Diretrizes definidas pela equipe médica
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.profileTypePill,
                {
                  backgroundColor: objetivoConfig.badgeBg,
                  borderColor: objetivoConfig.badgeBorder,
                },
              ]}
            >
              <Text
                style={[
                  styles.profileTypeText,
                  { color: objetivoConfig.badgeText },
                ]}
              >
                {objetivoConfig.rotuloCurto}
              </Text>
            </View>
          </View>

          {/* Objetivo do Tratamento */}
          <View style={styles.protocolBlock}>
            <View style={styles.protocolBlockHeader}>
              <Target size={13} color="#0f766e" />
              <Text style={styles.protocolBlockLabel}>
                Objetivo do Tratamento
              </Text>
            </View>
            <Text style={styles.protocolBlockValue}>
              {treatmentObjective?.trim() || "Nenhuma diretriz definida"}
            </Text>
          </View>

          {/* Plano + Meta Hídrica */}
          <View style={styles.protocolStatsRow}>
            <View style={styles.protocolStatBox}>
              <Text style={styles.protocolStatLabel}>Plano Ativo</Text>
              <Text style={styles.protocolStatVal} numberOfLines={1}>
                {convenio}
              </Text>
            </View>
            <View style={styles.protocolStatBox}>
              <Text style={styles.protocolStatLabel}>Meta Hídrica</Text>
              <Text style={styles.protocolStatVal}>{metaAguaLitros} L / dia</Text>
            </View>
          </View>

          {/* Equipe Médica */}
          <View style={styles.protocolBlock}>
            <Text style={styles.protocolBlockLabel}>Médico Responsável</Text>
            <Text style={styles.protocolBlockValue}>{medicoResponsavel}</Text>
            <Text style={styles.protocolBlockSub}>{especialidade}</Text>
          </View>

          {/* Medicações em Uso */}
          <View style={styles.protocolBlock}>
            <View style={styles.protocolBlockHeader}>
              <Pill size={13} color="#0f766e" />
              <Text style={styles.protocolBlockLabel}>Medicações em Uso</Text>
            </View>
            {medicacoes && medicacoes.trim().length > 0 ? (
              <Text style={styles.medsText}>{medicacoes.trim()}</Text>
            ) : (
              <Text style={styles.medsEmptyText}>
                Nenhuma medicação registrada no prontuário.
              </Text>
            )}
          </View>
        </View>

        {/* ============================================================ */}
        {/* 3. DADOS DO PACIENTE & CONTA                                 */}
        {/* ============================================================ */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardTitleGroup}>
              <View style={[styles.iconBox, { backgroundColor: "#f1f5f9" }]}>
                <UserIcon size={16} color="#334155" />
              </View>
              <View>
                <Text style={styles.cardTitle}>Dados do Paciente & Conta</Text>
                <Text style={styles.cardSubtitle}>
                  Prontuário {prontuarioCodigo}
                </Text>
              </View>
            </View>
          </View>

          {/* Avatar + Nome */}
          <View style={styles.accountProfileRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleSelectPhotoSource}
              disabled={isUploading}
              style={styles.avatarTouchable}
            >
              {fullAvatarUrl ? (
                <Image
                  source={{ uri: fullAvatarUrl }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>{initialLetter}</Text>
                </View>
              )}
              <View style={styles.cameraBadge}>
                <Camera size={11} color="#ffffff" />
              </View>
              {isUploading ? (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator size="small" color="#ffffff" />
                </View>
              ) : null}
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <Text style={styles.patientName}>{nomeExibicao}</Text>
              <Text style={styles.patientMetaText}>
                CPF: {formatCpfExibicao(paciente?.cpf)}
              </Text>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleSelectPhotoSource}
                disabled={isUploading}
                style={{ marginTop: 4 }}
              >
                <Text style={styles.changePhotoLink}>
                  {isUploading ? "Enviando foto..." : "Alterar foto de perfil"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Informações cadastrais */}
          <View style={styles.infoList}>
            <View style={styles.infoRow}>
              <Text style={styles.infoRowLabel}>Código do Prontuário</Text>
              <Text style={styles.infoRowValue}>{prontuarioCodigo}</Text>
            </View>
            {telefone ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoRowLabel}>WhatsApp</Text>
                <Text style={styles.infoRowValue}>{telefone}</Text>
              </View>
            ) : null}
            {email ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoRowLabel}>E-mail</Text>
                <Text style={styles.infoRowValue} numberOfLines={1}>
                  {email}
                </Text>
              </View>
            ) : null}
            <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.infoRowLabel}>Recepção Clínica FAAZ</Text>
              <TouchableOpacity
                onPress={handleOpenWhatsApp}
                style={styles.inlinePhoneBtn}
              >
                <Phone size={12} color="#0f766e" />
                <Text style={styles.inlinePhoneText}>(31) 98440-0076</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* LGPD */}
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() =>
              Alert.alert(
                "Privacidade & LGPD",
                "Seus dados clínicos são protegidos em conformidade com a LGPD e as normas do Conselho Federal de Medicina (CFM)."
              )
            }
            style={styles.lgpdRow}
          >
            <View style={styles.lgpdLeft}>
              <FileText size={14} color="#64748b" />
              <Text style={styles.lgpdText}>Termos de Uso e Privacidade</Text>
            </View>
            <ChevronRight size={16} color="#94a3b8" />
          </TouchableOpacity>

          {/* Trocar Paciente / Sair (movido da antiga Home para cá) */}
          <TouchableOpacity
            activeOpacity={0.82}
            onPress={handleConfirmarLogout}
            style={styles.logoutButton}
          >
            <LogOut size={16} color="#be123c" />
            <Text style={styles.logoutButtonText}>Trocar Paciente / Sair</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* BARRA INFERIOR UNIFICADA */}
      <BottomTabBar
        activeTab="Clínica"
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
  headerStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(45, 212, 191, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(45, 212, 191, 0.3)",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 4,
  },
  headerStatusText: {
    color: "#2dd4bf",
    fontSize: 11,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 28,
    gap: 14,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
    gap: 12,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 1,
  },
  countdownPill: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  countdownText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
  },
  consultaLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
  consultaLoadingText: {
    fontSize: 12,
    color: "#64748b",
  },
  consultaBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  consultaDateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  consultaDateText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
    flex: 1,
  },
  consultaTimePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#99f6e4",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  consultaTimeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f766e",
  },
  consultaMetaList: {
    gap: 2,
  },
  consultaDoctorName: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#1e293b",
  },
  consultaSpecialty: {
    fontSize: 12,
    color: "#64748b",
  },
  consultaTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  tagPill: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  tagPillSuccess: {
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagPillSuccessText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
  },
  consultaNotes: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 17,
    marginTop: 2,
  },
  emptyConsultaBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    gap: 4,
  },
  emptyConsultaTitle: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#1e293b",
  },
  emptyConsultaSub: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 17,
  },
  whatsappBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0f766e",
    borderRadius: 12,
    paddingVertical: 12,
  },
  whatsappBtnText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#ffffff",
  },
  profileTypePill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  profileTypeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  protocolBlock: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 4,
  },
  protocolBlockHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  protocolBlockLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  protocolBlockValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    lineHeight: 20,
  },
  protocolBlockSub: {
    fontSize: 12,
    color: "#64748b",
  },
  protocolStatsRow: {
    flexDirection: "row",
    gap: 10,
  },
  protocolStatBox: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  protocolStatLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
  },
  protocolStatVal: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f766e",
    marginTop: 3,
  },
  medsText: {
    fontSize: 13,
    color: "#1e293b",
    lineHeight: 20,
    marginTop: 2,
  },
  medsEmptyText: {
    fontSize: 12.5,
    color: "#64748b",
    fontStyle: "italic",
    marginTop: 2,
  },
  accountProfileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  avatarTouchable: {
    width: 64,
    height: 64,
    borderRadius: 32,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0fdfa",
    borderWidth: 2,
    borderColor: "#0f766e",
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 24,
    fontWeight: "700",
    color: "#ffffff",
  },
  cameraBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#0f172a",
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 32,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  patientName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  patientMetaText: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  changePhotoLink: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f766e",
  },
  infoList: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    gap: 12,
  },
  infoRowLabel: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "500",
  },
  infoRowValue: {
    fontSize: 12.5,
    color: "#0f172a",
    fontWeight: "700",
    flexShrink: 1,
    textAlign: "right",
  },
  inlinePhoneBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  inlinePhoneText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#0f766e",
  },
  lgpdRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  lgpdLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  lgpdText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#334155",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 2,
  },
  logoutButtonText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#be123c",
  },
});

export default ProfileScreen;
