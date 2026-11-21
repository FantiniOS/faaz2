import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import {
  ShieldCheck,
  Phone,
  FileText,
  LogOut,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  HeartPulse,
  Calendar,
  Clock,
  Target,
  Camera,
  Pill,
  MessageCircle,
  User as UserIcon,
  Check,
  CheckCircle2,
  X,
  Pencil,
  Mail,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import {
  usePatientAuth,
  type PacienteLogado,
} from "../contexts/PatientAuthContext";
import { StandardHeader } from "../components/StandardHeader";
import { BottomTabBar, MainTabKey } from "../components/BottomTabBar";
import { TermosPrivacidadeModal } from "../components/TermosPrivacidadeModal";
import {
  api,
  resolveAssetUrl,
  type MedicoResponsavelInfo,
  type PlanoResumoResponse,
  type ProximaConsultaItem,
} from "../services/api";
import { getConfigObjetivoClinico } from "../utils/objetivoClinico";
import {
  diffDiasBR,
  formatarDataBR,
  formatarDataCurtaBR,
  formatarDataExtensoBR,
  getDataBR,
  getHojeBR,
  getHoraBR,
} from "../utils/dateBr";

export interface ProfileScreenProps {
  onBack?: () => void;
  onTabPress?: (tabName: MainTabKey | string) => void;
  onNavigateToDieta?: () => void;
  onNavigateToMetas?: () => void;
  onPacienteUpdated?: (parcial: Partial<PacienteLogado>) => Promise<void> | void;
}

type ProximaConsultaData = ProximaConsultaItem;

const WHATSAPP_URL_OFICIAL =
  "https://wa.me/5531984400076?text=Olá!%20Sou%20paciente%20da%20Clínica%20FAAZ%20e%20gostaria%20de%20atendimento.";

/**
 * Formata data, horário e contagem regressiva EXCLUSIVAMENTE em America/Sao_Paulo
 * a partir do ISO UTC (imune ao fuso horário configurado no aparelho/emulador).
 */
function formatConsultaLocal(isoStr: string): {
  dataExtenso: string;
  dataCurtaDdMm: string;
  horarioLocal: string;
  contagemRegressiva: string;
} {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) {
    return {
      dataExtenso: "Data a confirmar",
      dataCurtaDdMm: "--/--",
      horarioLocal: "--:--",
      contagemRegressiva: "",
    };
  }

  const dataExtenso = formatarDataExtensoBR(d);
  const dataCurtaDdMm = formatarDataCurtaBR(d);
  const horarioLocal = getHoraBR(d);
  const diffDias = diffDiasBR(getHojeBR(), getDataBR(d));

  let contagemRegressiva = "";
  if (diffDias <= 0) {
    contagemRegressiva = "Hoje";
  } else if (diffDias === 1) {
    contagemRegressiva = "Amanhã";
  } else {
    contagemRegressiva = `Em ${diffDias} dias`;
  }

  return { dataExtenso, dataCurtaDdMm, horarioLocal, contagemRegressiva };
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

function formatDataIsoBr(iso?: string | null): string {
  return formatarDataBR(iso);
}

function formatTipoConsultaPacote(tipo?: string | null): string {
  const upper = (tipo || "").trim().toUpperCase();
  if (upper === "ONLINE") return "Online";
  if (upper === "RETORNO") return "Retorno";
  if (upper === "AVALIACAO") return "Avaliação";
  return "Presencial";
}

const EMAIL_REGEX_MOBILE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function formatTelefoneBrInput(val?: string | null): string {
  if (!val) return "";
  let digits = val.replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  digits = digits.slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function ProfileScreen({
  onTabPress,
  onPacienteUpdated,
}: ProfileScreenProps) {
  const { paciente, logout, atualizarAvatarUrl, atualizarPacienteLocal } =
    usePatientAuth();
  const insets = useSafeAreaInsets();
  const modalBottomPadding = Math.max(insets.bottom, 24) + 16;
  const pacienteId = paciente?.id || "";

  const [isUploading, setIsUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [carregandoConsulta, setCarregandoConsulta] = useState(true);
  const [respondendoAcao, setRespondendoAcao] = useState<
    "CONFIRMAR" | "CANCELAR" | null
  >(null);

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
    paciente?.convenio || "Particular"
  );
  const [planoResumo, setPlanoResumo] = useState<PlanoResumoResponse | null>(
    null
  );
  const [medicoResponsavelApi, setMedicoResponsavelApi] =
    useState<MedicoResponsavelInfo | null>(
      paciente?.medicoResponsavelDetalhes ?? null
    );
  const [historicoPlanoAberto, setHistoricoPlanoAberto] =
    useState<boolean>(false);
  const [telefone, setTelefone] = useState<string | null>(
    paciente?.telefoneWhatsapp ?? null
  );
  const [email, setEmail] = useState<string | null>(paciente?.email ?? null);
  const [isEditContatoOpen, setIsEditContatoOpen] = useState<boolean>(false);
  const [editTelefone, setEditTelefone] = useState<string>("");
  const [editEmail, setEditEmail] = useState<string>("");
  const [salvandoContato, setSalvandoContato] = useState<boolean>(false);
  const [erroContato, setErroContato] = useState<string | null>(null);
  const [contatoToast, setContatoToast] = useState<string | null>(null);
  const [isTermosModalOpen, setIsTermosModalOpen] = useState<boolean>(false);
  const inFlightRef = useRef<boolean>(false);

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
    proximaConsulta?.especialidade?.trim() ||
    proximaConsulta?.medicoEspecialidade?.trim() ||
    proximaConsulta?.medico?.especialidade?.trim() ||
    "";

  const medicoFonte: MedicoResponsavelInfo | null =
    medicoResponsavelApi?.nome?.trim()
      ? medicoResponsavelApi
      : paciente?.medicoResponsavelDetalhes?.nome?.trim()
        ? paciente.medicoResponsavelDetalhes
        : paciente?.medicoResponsavel?.trim() &&
            paciente.medicoResponsavel.trim() !== "Equipe Clínica FAAZ"
          ? {
              nome: paciente.medicoResponsavel.trim(),
              especialidade: paciente?.especialidadeMedico?.trim() || null,
              crm: paciente?.crmMedico?.trim() || null,
            }
          : medicoConsulta
            ? {
                nome: medicoConsulta,
                especialidade: especialidadeConsulta || null,
                crm: null,
              }
            : null;

  const medicoResponsavel = medicoFonte?.nome?.trim() || "Equipe Clínica FAAZ";
  const subtituloMedicoResponsavel = [
    medicoFonte?.especialidade?.trim() || null,
    medicoFonte?.crm?.trim() || null,
  ]
    .filter((item): item is string => Boolean(item))
    .join(" • ");
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

    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      // Micro-onda 1 (máx. 2 queries concorrentes): próxima consulta + resumo do Plano FAAZ
      const [consultaRes, planoRes] = await Promise.allSettled([
        api.pacientes.getProximaConsulta(pacienteId),
        api.pacientes.getPlanoResumo(pacienteId),
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

      if (planoRes.status === "fulfilled" && planoRes.value?.success) {
        setPlanoResumo(planoRes.value);
        if (planoRes.value.medicoResponsavel?.nome?.trim()) {
          setMedicoResponsavelApi(planoRes.value.medicoResponsavel);
        }
      }

      // Micro-onda 2 (máx. 2 queries concorrentes): perfil cadastral + metas
      const [perfilRes, metasRes] = await Promise.allSettled([
        api.get(`/pacientes/${encodeURIComponent(pacienteId)}`),
        api.pacientes.getMetas(pacienteId),
      ]);

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
        if (
          p.medicoResponsavel &&
          typeof p.medicoResponsavel === "object" &&
          typeof p.medicoResponsavel.nome === "string" &&
          p.medicoResponsavel.nome.trim()
        ) {
          setMedicoResponsavelApi(p.medicoResponsavel);
        }
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
    } finally {
      inFlightRef.current = false;
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

  const handleOpenWhatsAppRenovacao = async (nomePlano: string) => {
    const msg = `Olá! Vi no aplicativo Clínica FAAZ que meu ${nomePlano} está próximo de encerrar e gostaria de saber sobre a renovação.`;
    const url = `https://wa.me/5531984400076?text=${encodeURIComponent(msg)}`;
    try {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.open(url, "_blank");
        return;
      }
      await Linking.openURL(url);
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

  const handleAbrirEditarContato = () => {
    setEditTelefone(formatTelefoneBrInput(telefone));
    setEditEmail((email || "").trim());
    setErroContato(null);
    setIsEditContatoOpen(true);
  };

  const handleSalvarContato = async () => {
    if (!pacienteId || salvandoContato) return;

    const telDigits = editTelefone.replace(/\D/g, "");
    if (telDigits.length < 10 || telDigits.length > 11) {
      setErroContato(
        "Informe um WhatsApp/telefone válido com DDD (10 ou 11 dígitos)."
      );
      return;
    }

    const emailLimpo = editEmail.trim().toLowerCase();
    if (emailLimpo.length > 0 && !EMAIL_REGEX_MOBILE.test(emailLimpo)) {
      setErroContato("Informe um endereço de e-mail válido.");
      return;
    }

    setErroContato(null);
    setSalvandoContato(true);

    try {
      const res = await api.pacientes.atualizarContato(pacienteId, {
        telefone: formatTelefoneBrInput(editTelefone),
        email: emailLimpo || null,
      });

      if (res?.success) {
        const novoTelefone = res.telefone || formatTelefoneBrInput(editTelefone);
        const novoEmail = res.email ?? null;
        setTelefone(novoTelefone);
        setEmail(novoEmail);

        const persistFn = onPacienteUpdated ?? atualizarPacienteLocal;
        await persistFn({
          telefoneWhatsapp: novoTelefone,
          email: novoEmail,
        });

        setIsEditContatoOpen(false);
        setContatoToast("Contato atualizado com sucesso");
        setTimeout(() => {
          setContatoToast((prev) =>
            prev === "Contato atualizado com sucesso" ? null : prev
          );
        }, 3200);
      } else {
        setErroContato(
          res?.error || "Não foi possível atualizar seus dados de contato."
        );
      }
    } catch (err: any) {
      setErroContato(
        err?.message || "Erro de conexão ao salvar seus dados de contato."
      );
    } finally {
      setSalvandoContato(false);
    }
  };

  const consultaFormatada = useMemo(() => {
    if (!proximaConsulta?.dataHora) return null;
    return formatConsultaLocal(proximaConsulta.dataHora);
  }, [proximaConsulta?.dataHora]);

  const statusConsultaUpper = (proximaConsulta?.status || "").toUpperCase();
  const isConsultaConfirmada = statusConsultaUpper === "CONFIRMADO";

  const handleConfirmarConsulta = async () => {
    if (!pacienteId || !proximaConsulta?.id || respondendoAcao) return;
    try {
      setRespondendoAcao("CONFIRMAR");
      const res = await api.pacientes.responderConsulta(pacienteId, {
        agendamentoId: proximaConsulta.id,
        acao: "CONFIRMAR",
      });
      if (res?.success) {
        setProximaConsulta((prev) =>
          prev
            ? {
                ...prev,
                status: "CONFIRMADO",
                statusLegivel: "Confirmada",
                observacao: res.observacao ?? prev.observacao,
              }
            : null
        );
        await carregarDadosClinica();
      } else {
        Alert.alert(
          "Não foi possível confirmar",
          res?.error || "Tente novamente em instantes."
        );
      }
    } catch (err: any) {
      Alert.alert(
        "Erro ao confirmar",
        err?.message || "Não foi possível confirmar sua consulta agora."
      );
    } finally {
      setRespondendoAcao(null);
    }
  };

  const executarCancelamentoConsulta = async () => {
    if (!pacienteId || !proximaConsulta?.id || respondendoAcao) return;
    try {
      setRespondendoAcao("CANCELAR");
      const res = await api.pacientes.responderConsulta(pacienteId, {
        agendamentoId: proximaConsulta.id,
        acao: "CANCELAR",
      });
      if (res?.success) {
        setProximaConsulta(null);
        await carregarDadosClinica();
        Alert.alert(
          "Consulta cancelada",
          "Sua consulta foi cancelada e o horário foi liberado na agenda da clínica. Deseja reagendar pelo WhatsApp?",
          [
            { text: "Fechar", style: "cancel" },
            {
              text: "Reagendar no WhatsApp",
              onPress: () => void handleOpenWhatsApp(),
            },
          ]
        );
      } else {
        Alert.alert(
          "Não foi possível cancelar",
          res?.error || "Tente novamente em instantes."
        );
      }
    } catch (err: any) {
      Alert.alert(
        "Erro ao cancelar",
        err?.message || "Não foi possível cancelar sua consulta agora."
      );
    } finally {
      setRespondendoAcao(null);
    }
  };

  const handleSolicitarCancelamento = () => {
    if (!proximaConsulta || !consultaFormatada || respondendoAcao) return;
    const msg = `Deseja cancelar sua consulta de ${consultaFormatada.dataCurtaDdMm} às ${consultaFormatada.horarioLocal}? O horário será liberado na agenda da clínica.`;

    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm(msg)) {
        void executarCancelamentoConsulta();
      }
      return;
    }

    Alert.alert("Cancelar consulta", msg, [
      { text: "Manter consulta", style: "cancel" },
      {
        text: "Sim, cancelar",
        style: "destructive",
        onPress: () => void executarCancelamentoConsulta(),
      },
    ]);
  };

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
              <View style={[styles.cardTitleTextCol, { paddingRight: 8 }]}>
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
                {especialidadeConsulta || subtituloMedicoResponsavel ? (
                  <Text style={styles.consultaSpecialty}>
                    {especialidadeConsulta || subtituloMedicoResponsavel}
                  </Text>
                ) : null}
              </View>

              <View style={styles.consultaTagsRow}>
                {proximaConsulta.tipoLegivel ? (
                  <View style={styles.tagPill}>
                    <Text style={styles.tagPillText}>
                      {proximaConsulta.tipoLegivel}
                    </Text>
                  </View>
                ) : null}
                <View
                  style={
                    isConsultaConfirmada
                      ? styles.tagPillSuccess
                      : styles.tagPillPending
                  }
                >
                  <Text
                    style={
                      isConsultaConfirmada
                        ? styles.tagPillSuccessText
                        : styles.tagPillPendingText
                    }
                  >
                    {isConsultaConfirmada ? "Confirmada" : "Agendada"}
                  </Text>
                </View>
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

          {/* AÇÕES DO PACIENTE PARA A PRÓXIMA CONSULTA (CONFIRMAR / CANCELAR) */}
          {!carregandoConsulta && proximaConsulta && consultaFormatada ? (
            isConsultaConfirmada ? (
              <View style={styles.confirmedActionRow}>
                <View style={styles.confirmedStatusBox}>
                  <CheckCircle2 size={15} color="#047857" />
                  <Text style={styles.confirmedStatusText}>
                    Presença confirmada
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.75}
                  disabled={respondendoAcao !== null}
                  onPress={handleSolicitarCancelamento}
                  style={styles.cancelLinkBtn}
                >
                  {respondendoAcao === "CANCELAR" ? (
                    <ActivityIndicator size="small" color="#be123c" />
                  ) : (
                    <Text style={styles.cancelLinkText}>Precisa cancelar?</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.consultaActionsRow}>
                <TouchableOpacity
                  activeOpacity={0.82}
                  disabled={respondendoAcao !== null}
                  onPress={() => void handleConfirmarConsulta()}
                  style={[
                    styles.confirmBtn,
                    respondendoAcao !== null && styles.btnDisabled,
                  ]}
                >
                  {respondendoAcao === "CONFIRMAR" ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Check size={15} color="#ffffff" />
                      <Text style={styles.confirmBtnText}>Confirmar</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={respondendoAcao !== null}
                  onPress={handleSolicitarCancelamento}
                  style={[
                    styles.cancelOutlineBtn,
                    respondendoAcao !== null && styles.btnDisabled,
                  ]}
                >
                  {respondendoAcao === "CANCELAR" ? (
                    <ActivityIndicator size="small" color="#be123c" />
                  ) : (
                    <>
                      <X size={14} color="#be123c" />
                      <Text style={styles.cancelOutlineBtnText}>Cancelar</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )
          ) : null}

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
              <View style={[styles.cardTitleTextCol, { paddingRight: 8 }]}>
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
                {planoResumo?.planoLabel?.trim() || convenio || "Particular"}
              </Text>
            </View>
            <View style={styles.protocolStatBox}>
              <Text style={styles.protocolStatLabel}>Meta Hídrica</Text>
              <Text style={styles.protocolStatVal}>{metaAguaLitros} L / dia</Text>
            </View>
          </View>

          {/* Sub-bloco Acompanhamento do Plano (exibido SOMENTE quando possuiPacote === true) */}
          {planoResumo?.possuiPacote && planoResumo.pacote ? (
            <View style={styles.pacoteTrackBlock}>
              <View style={styles.pacoteTrackHeader}>
                <Text style={styles.pacoteTrackTitle}>Consultas do Pacote</Text>
                {(() => {
                  const p = planoResumo.pacote;
                  const isConcluido =
                    p.consultasRestantes === 0 || p.status === "CONCLUIDO";
                  const isUltima = !isConcluido && p.consultasRestantes === 1;
                  return (
                    <View
                      style={[
                        styles.pacoteStatusBadge,
                        isConcluido
                          ? styles.pacoteStatusBadgeConcluido
                          : isUltima
                            ? styles.pacoteStatusBadgeAmber
                            : styles.pacoteStatusBadgeAtivo,
                      ]}
                    >
                      <Text
                        style={[
                          styles.pacoteStatusBadgeText,
                          isConcluido
                            ? styles.pacoteStatusTextConcluido
                            : isUltima
                              ? styles.pacoteStatusTextAmber
                              : styles.pacoteStatusTextAtivo,
                        ]}
                      >
                        {isConcluido
                          ? "Concluído"
                          : isUltima
                            ? "Última consulta"
                            : "Ativo"}
                      </Text>
                    </View>
                  );
                })()}
              </View>

              {/* Métricas em linha: X de Y realizadas + Faltam Z */}
              <View style={styles.pacoteMetricsRow}>
                <Text style={styles.pacoteRealizadasText}>
                  {planoResumo.pacote.consultasRealizadas} de{" "}
                  {planoResumo.pacote.qtdTotalConsultas} realizadas
                </Text>
                <Text style={styles.pacoteRestantesText}>
                  Faltam {planoResumo.pacote.consultasRestantes}
                </Text>
              </View>

              {/* Barra de progresso limpa */}
              <View style={styles.pacoteProgressTrack}>
                <View
                  style={[
                    styles.pacoteProgressFill,
                    {
                      width: `${Math.min(
                        100,
                        Math.max(0, planoResumo.pacote.percentualUso || 0)
                      )}%`,
                    },
                  ]}
                />
              </View>

              {/* Linha discreta de vigência */}
              <View style={styles.pacoteDatesRow}>
                <Text style={styles.pacoteDateMeta}>
                  Início: {formatDataIsoBr(planoResumo.pacote.dataInicio)}
                </Text>
                {planoResumo.pacote.dataValidade ? (
                  <Text style={styles.pacoteDateMeta}>
                    Validade: {formatDataIsoBr(planoResumo.pacote.dataValidade)}
                  </Text>
                ) : null}
              </View>

              {/* Extrato expansível (fechado por padrão) */}
              <TouchableOpacity
                activeOpacity={0.78}
                onPress={() => setHistoricoPlanoAberto((prev) => !prev)}
                style={styles.pacoteHistoryToggle}
              >
                <Text style={styles.pacoteHistoryToggleText}>
                  Ver histórico de consultas ({planoResumo.pacote.consultas.length})
                </Text>
                {historicoPlanoAberto ? (
                  <ChevronUp size={15} color="#0f766e" />
                ) : (
                  <ChevronDown size={15} color="#0f766e" />
                )}
              </TouchableOpacity>

              {historicoPlanoAberto ? (
                <View style={styles.pacoteHistoryList}>
                  {planoResumo.pacote.consultas.length === 0 ? (
                    <Text style={styles.pacoteHistoryEmptyText}>
                      Nenhuma consulta contabilizada neste ciclo ainda.
                    </Text>
                  ) : (
                    planoResumo.pacote.consultas.map((c) => {
                      const statusUpper = (c.status || "").toUpperCase();
                      const isBonificada = statusUpper === "BONIFICADA";
                      const isFalta = statusUpper === "FALTA_COBRADA";
                      return (
                        <View
                          key={`${c.numero}-${c.dataConsulta}`}
                          style={styles.pacoteHistoryItem}
                        >
                          <Text
                            style={styles.pacoteHistoryItemMain}
                            numberOfLines={1}
                          >
                            #{c.numero} · {formatDataIsoBr(c.dataConsulta)} ·{" "}
                            {formatTipoConsultaPacote(c.tipo)}
                          </Text>
                          {isBonificada ? (
                            <View style={styles.pacoteHistoryTagBonus}>
                              <Text style={styles.pacoteHistoryTagBonusText}>
                                Bonificada
                              </Text>
                            </View>
                          ) : isFalta ? (
                            <View style={styles.pacoteHistoryTagFalta}>
                              <Text style={styles.pacoteHistoryTagFaltaText}>
                                Falta
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      );
                    })
                  )}
                </View>
              ) : null}

              {/* Botão de renovação condicional */}
              {planoResumo.pacote.alertaRenovacao ||
              planoResumo.pacote.consultasRestantes === 0 ? (
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() =>
                    void handleOpenWhatsAppRenovacao(
                      planoResumo.pacote?.nomePlano || "Plano FAAZ"
                    )
                  }
                  style={styles.pacoteRenewalBtn}
                >
                  <MessageCircle size={14} color="#0f766e" />
                  <Text style={styles.pacoteRenewalBtnText}>
                    Falar sobre renovação no WhatsApp
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {/* Equipe Médica */}
          <View style={styles.protocolBlock}>
            <Text style={styles.protocolBlockLabel}>Médico Responsável</Text>
            <Text style={styles.protocolBlockValue}>{medicoResponsavel}</Text>
            {subtituloMedicoResponsavel ? (
              <Text style={styles.protocolBlockSub}>
                {subtituloMedicoResponsavel}
              </Text>
            ) : null}
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
              <View style={[styles.cardTitleTextCol, { marginRight: 8 }]}>
                <Text style={styles.cardTitle}>Dados do Paciente & Conta</Text>
                <Text style={styles.cardSubtitle}>
                  Prontuário {prontuarioCodigo}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.75}
              onPress={handleAbrirEditarContato}
              style={styles.editContatoPill}
            >
              <Pencil size={12} color="#047857" />
              <Text style={styles.editContatoPillText}>Editar</Text>
            </TouchableOpacity>
          </View>

          {contatoToast ? (
            <View style={styles.contatoToastBanner}>
              <CheckCircle2 size={14} color="#047857" />
              <Text style={styles.contatoToastText}>{contatoToast}</Text>
            </View>
          ) : null}

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
            <TouchableOpacity
              activeOpacity={0.72}
              onPress={handleAbrirEditarContato}
              style={styles.infoRow}
            >
              <Text style={styles.infoRowLabel}>WhatsApp</Text>
              <View style={styles.editableRowRight}>
                <Text
                  style={
                    telefone ? styles.infoRowValue : styles.infoRowPlaceholder
                  }
                  numberOfLines={1}
                >
                  {telefone ? formatTelefoneBrInput(telefone) || telefone : "Adicionar WhatsApp"}
                </Text>
                <Pencil size={12} color="#059669" />
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.72}
              onPress={handleAbrirEditarContato}
              style={styles.infoRow}
            >
              <Text style={styles.infoRowLabel}>E-mail</Text>
              <View style={styles.editableRowRight}>
                <Text
                  style={
                    email ? styles.infoRowValue : styles.infoRowPlaceholder
                  }
                  numberOfLines={1}
                >
                  {email || "Adicionar e-mail"}
                </Text>
                <Pencil size={12} color="#059669" />
              </View>
            </TouchableOpacity>
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
            onPress={() => setIsTermosModalOpen(true)}
            style={styles.lgpdRow}
          >
            <View style={styles.lgpdLeft}>
              <FileText size={14} color="#0f766e" />
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

      {/* MODAL BOTTOM-SHEET: ATUALIZAR DADOS DE CONTATO (APENAS WHATSAPP E E-MAIL) */}
      <Modal
        visible={isEditContatoOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!salvandoContato) setIsEditContatoOpen(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
          <View
            style={[styles.modalSheet, { paddingBottom: modalBottomPadding }]}
          >
            <View style={styles.modalHandle} />

            <View style={styles.modalHeaderRow}>
              <View style={styles.modalTitleGroup}>
                <View style={styles.modalIconBox}>
                  <Pencil size={15} color="#047857" />
                </View>
                <View style={styles.modalTitleTextCol}>
                  <Text style={styles.modalTitle}>
                    Atualizar Dados de Contato
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    Sincronizado com seu cadastro na Clínica FAAZ
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.75}
                disabled={salvandoContato}
                onPress={() => setIsEditContatoOpen(false)}
                style={styles.modalCloseBtn}
              >
                <X size={16} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              {erroContato ? (
                <View style={styles.modalErrorBox}>
                  <Text style={styles.modalErrorText}>{erroContato}</Text>
                </View>
              ) : null}

              <View style={styles.modalFieldGroup}>
                <Text style={styles.modalFieldLabel}>WhatsApp / Telefone *</Text>
                <View style={styles.modalInputWrapper}>
                  <Phone size={15} color="#0f766e" />
                  <TextInput
                    value={editTelefone}
                    onChangeText={(txt) => {
                      setEditTelefone(formatTelefoneBrInput(txt));
                      if (erroContato) setErroContato(null);
                    }}
                    placeholder="(31) 99999-9999"
                    placeholderTextColor="#94a3b8"
                    keyboardType="phone-pad"
                    maxLength={15}
                    editable={!salvandoContato}
                    style={styles.modalInput}
                  />
                </View>
              </View>

              <View style={styles.modalFieldGroup}>
                <Text style={styles.modalFieldLabel}>E-mail</Text>
                <View style={styles.modalInputWrapper}>
                  <Mail size={15} color="#0f766e" />
                  <TextInput
                    value={editEmail}
                    onChangeText={(txt) => {
                      setEditEmail(txt);
                      if (erroContato) setErroContato(null);
                    }}
                    placeholder="seu.email@exemplo.com"
                    placeholderTextColor="#94a3b8"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!salvandoContato}
                    style={styles.modalInput}
                  />
                </View>
              </View>

              <Text style={styles.modalSecurityNote}>
                Nome, CPF e dados do prontuário só podem ser alterados pela
                recepção da Clínica FAAZ.
              </Text>

              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  activeOpacity={0.78}
                  disabled={salvandoContato}
                  onPress={() => setIsEditContatoOpen(false)}
                  style={styles.modalCancelBtn}
                >
                  <Text style={styles.modalCancelBtnText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.84}
                  disabled={salvandoContato}
                  onPress={() => void handleSalvarContato()}
                  style={[
                    styles.modalSaveBtn,
                    salvandoContato && styles.btnDisabled,
                  ]}
                >
                  {salvandoContato ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Check size={15} color="#ffffff" />
                      <Text style={styles.modalSaveBtnText}>
                        Salvar Alterações
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL DE LEITURA COMPLETA — TERMOS DE USO E PRIVACIDADE (LGPD / CFM) */}
      <TermosPrivacidadeModal
        visible={isTermosModalOpen}
        mode="leitura"
        pacienteId={pacienteId}
        termosVersaoAceita={
          planoResumo?.termosVersaoAceita ?? paciente?.termosVersaoAceita ?? null
        }
        termosAceitoEm={
          planoResumo?.termosAceitoEm ?? paciente?.termosAceitoEm ?? null
        }
        topInset={insets.top}
        bottomInset={insets.bottom}
        onClose={() => setIsTermosModalOpen(false)}
      />

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
    minWidth: 0,
  },
  cardTitleTextCol: {
    flex: 1,
    minWidth: 0,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
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
    flexShrink: 0,
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
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagPillSuccessText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
  },
  tagPillPending: {
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagPillPendingText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#b45309",
  },
  consultaActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  confirmBtn: {
    flex: 1.25,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#059669",
    borderRadius: 12,
    paddingVertical: 11,
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
  cancelOutlineBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#fecdd3",
    borderRadius: 12,
    paddingVertical: 11,
  },
  cancelOutlineBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#be123c",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  confirmedActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  confirmedStatusBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  confirmedStatusText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#047857",
  },
  cancelLinkBtn: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  cancelLinkText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9f1239",
    textDecorationLine: "underline",
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
    flexShrink: 0,
    alignSelf: "flex-start",
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
  pacoteTrackBlock: {
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    gap: 10,
  },
  pacoteTrackHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  pacoteTrackTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  pacoteStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  pacoteStatusBadgeAtivo: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  pacoteStatusBadgeAmber: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
  },
  pacoteStatusBadgeConcluido: {
    backgroundColor: "#f1f5f9",
    borderColor: "#cbd5e1",
  },
  pacoteStatusBadgeText: {
    fontSize: 10.5,
    fontWeight: "700",
  },
  pacoteStatusTextAtivo: {
    color: "#047857",
  },
  pacoteStatusTextAmber: {
    color: "#b45309",
  },
  pacoteStatusTextConcluido: {
    color: "#475569",
  },
  pacoteMetricsRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  pacoteRealizadasText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  pacoteRestantesText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#047857",
  },
  pacoteProgressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
    overflow: "hidden",
  },
  pacoteProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#0f766e",
  },
  pacoteDatesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
  },
  pacoteDateMeta: {
    fontSize: 11.5,
    color: "#64748b",
    fontWeight: "500",
  },
  pacoteHistoryToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  pacoteHistoryToggleText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f766e",
  },
  pacoteHistoryList: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pacoteHistoryEmptyText: {
    fontSize: 12,
    color: "#64748b",
    fontStyle: "italic",
    paddingVertical: 8,
    textAlign: "center",
  },
  pacoteHistoryItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 7,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f1f5f9",
    gap: 8,
  },
  pacoteHistoryItemMain: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1e293b",
    flex: 1,
  },
  pacoteHistoryTagBonus: {
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#99f6e4",
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  pacoteHistoryTagBonusText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0f766e",
  },
  pacoteHistoryTagFalta: {
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  pacoteHistoryTagFaltaText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#b45309",
  },
  pacoteRenewalBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#99f6e4",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 2,
  },
  pacoteRenewalBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f766e",
  },
  editContatoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexShrink: 0,
  },
  editContatoPillText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#047857",
  },
  contatoToastBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  contatoToastText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#065f46",
  },
  editableRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    maxWidth: "70%",
  },
  infoRowPlaceholder: {
    fontSize: 12,
    color: "#059669",
    fontWeight: "600",
    fontStyle: "italic",
    textAlign: "right",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 40,
    maxHeight: "88%",
    gap: 12,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 16,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalScrollContent: {
    gap: 14,
    paddingBottom: 4,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#cbd5e1",
    alignSelf: "center",
    marginBottom: 4,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  modalTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  modalTitleTextCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  modalIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  modalTitle: {
    fontSize: 15.5,
    fontWeight: "800",
    color: "#0f172a",
  },
  modalSubtitle: {
    fontSize: 11.5,
    color: "#64748b",
    marginTop: 1,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  modalErrorBox: {
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  modalErrorText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#be123c",
  },
  modalFieldGroup: {
    gap: 6,
  },
  modalFieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  modalInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
  },
  modalInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
    paddingVertical: 0,
  },
  modalSecurityNote: {
    fontSize: 11.5,
    color: "#64748b",
    lineHeight: 16.5,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  modalActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelBtnText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#475569",
  },
  modalSaveBtn: {
    flex: 1.4,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#0f766e",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  modalSaveBtnText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#ffffff",
  },
});

export default ProfileScreen;
