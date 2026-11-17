import React, { useState, useMemo } from "react";
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
} from "react-native";
import {
  User,
  ShieldCheck,
  Phone,
  FileText,
  LogOut,
  ChevronRight,
  HeartPulse,
  Droplets,
  Calendar,
  Home as HomeIcon,
  Utensils,
  Target,
  Camera,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { usePatientAuth } from "../contexts/PatientAuthContext";
import { StandardHeader } from "../components/StandardHeader";
import { api, getBaseApiUrl } from "../services/api";

export interface ProfileScreenProps {
  onBack?: () => void;
  onTabPress?: (tabName: string) => void;
  onNavigateToDieta?: () => void;
  onNavigateToMetas?: () => void;
}

const WHATSAPP_RECEPCAO = "5531984400076";
const WHATSAPP_URL_OFICIAL =
  "https://wa.me/5531984400076?text=Olá!%20Sou%20paciente%20da%20Clínica%20FAAZ%20e%20gostaria%20de%20atendimento.";

export function ProfileScreen({
  onBack,
  onTabPress,
  onNavigateToDieta,
  onNavigateToMetas,
}: ProfileScreenProps) {
  const { paciente, logout, atualizarAvatarUrl } = usePatientAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [treatmentObjective, setTreatmentObjective] = useState<string>(
    paciente?.treatmentObjective || paciente?.focoClinico || "Otimização Metabólica & Saúde Integrativa"
  );

  const nomeExibicao = (paciente?.nome || "PACIENTE FAAZ").toUpperCase();
  const initialLetter = nomeExibicao.trim().charAt(0) || "P";
  const prontuarioCodigo = paciente?.recordCode || "FAAZ-00001";
  const medicoResponsavel = paciente?.medicoResponsavel || "DR. CARLOS FANTINI";
  const especialidade = paciente?.especialidadeMedico || "ENDOCRINOLOGIA & METABOLOGIA";
  const focoClinico = treatmentObjective || paciente?.focoClinico || "OTIMIZAÇÃO METABÓLICA & SAÚDE INTEGRATIVA";
  const metaAguaLitros = paciente?.metaDiariaMl ? (paciente.metaDiariaMl / 1000).toFixed(1) : "2.5";

  // Sincroniza em tempo real o Objetivo Clínico definido pela médica no Prontuário Web
  React.useEffect(() => {
    let isMounted = true;
    async function loadFreshObjective() {
      if (!paciente?.id) return;
      try {
        const res = await api.get(`/pacientes/${paciente.id}`);
        if (isMounted && res?.paciente) {
          const fresh = res.paciente.treatmentObjective || res.paciente.clinicalFocus;
          if (fresh) {
            setTreatmentObjective(fresh);
            return;
          }
        }
      } catch {
        // Tenta via endpoint de metas como fallback
      }

      try {
        const metasRes = await api.pacientes.getMetas(paciente.id);
        if (isMounted && metasRes?.metas) {
          const freshMetas = metasRes.metas.treatmentObjective || metasRes.metas.focoMetabolico;
          if (freshMetas) setTreatmentObjective(freshMetas);
        }
      } catch {
        // Fallback silencioso mantendo o estado anterior
      }
    }
    loadFreshObjective();
    const interval = setInterval(loadFreshObjective, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [paciente?.id]);

  // URL absoluta normalizada para exibir no componente Image do React Native
  const fullAvatarUrl = useMemo(() => {
    if (!paciente?.avatarUrl) return null;
    const url = paciente.avatarUrl;
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
      return url;
    }
    const base = getBaseApiUrl().replace(/\/api\/?$/, "");
    return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
  }, [paciente?.avatarUrl]);

  /**
   * Abre o seletor para o paciente escolher entre Câmera ou Galeria de Fotos
   */
  const handleSelectPhotoSource = () => {
    Alert.alert(
      "Foto de Perfil",
      "Escolha como deseja atualizar sua foto de perfil:",
      [
        {
          text: "Tirar Foto (Câmera)",
          onPress: () => handlePickImage("camera"),
        },
        {
          text: "Escolher da Galeria",
          onPress: () => handlePickImage("gallery"),
        },
        {
          text: "Cancelar",
          style: "cancel",
        },
      ]
    );
  };

  /**
   * Executa a captura/seleção da imagem via expo-image-picker e faz o upload
   * com compressão nativa (quality: 0.4), trava de 2MB e redimensionamento 800x800.
   */
  const handlePickImage = async (mode: "camera" | "gallery") => {
    if (!paciente?.id) {
      Alert.alert("Atenção", "É necessário estar autenticado para alterar a foto de perfil.");
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
            "É necessário autorizar o acesso à câmera para tirar sua foto de perfil."
          );
          return;
        }
        result = await ImagePicker.launchCameraAsync(pickerOptions);
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permissão da Galeria",
            "É necessário autorizar o acesso à galeria de fotos para selecionar sua foto."
          );
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
      }

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      if (!asset.uri) {
        Alert.alert("Erro", "Não foi possível carregar a imagem selecionada.");
        return;
      }

      // 2. Trava de Tamanho Rigorosa (Máximo de 2MB = 2048 * 1024 bytes)
      const MAX_FILE_SIZE_BYTES = 2048 * 1024; // 2MB (2.097.152 bytes)
      let fileSizeInBytes = asset.fileSize || 0;

      try {
        const fileInfo = await FileSystem.getInfoAsync(asset.uri);
        if (fileInfo.exists && typeof fileInfo.size === "number") {
          fileSizeInBytes = fileInfo.size;
        }
      } catch (fsErr) {
        console.warn("[ProfileScreen] Aviso ao verificar fileSize:", fsErr);
      }

      if (fileSizeInBytes > MAX_FILE_SIZE_BYTES) {
        Alert.alert(
          "Atenção",
          "A imagem selecionada é muito pesada. Por favor, escolha uma foto menor (máximo 2MB)."
        );
        return;
      }

      setIsUploading(true);

      // 3. Otimização de Resolução com expo-image-manipulator (máx 800x800) e geração Base64
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
      } catch (manipErr) {
        console.warn("[ProfileScreen] Falha ao redimensionar com manipulator:", manipErr);
      }

      if (!rawBase64) {
        setIsUploading(false);
        Alert.alert("Erro", "Não foi possível gerar a codificação Base64 da imagem.");
        return;
      }

      // Monta a string de exibição oficial em Base64 Data URI
      const imageBase64 = "data:image/jpeg;base64," + rawBase64;

      // Trava de segurança no peso final da string Base64
      const approximateBytes = Math.round((rawBase64.length * 3) / 4);
      if (approximateBytes > MAX_FILE_SIZE_BYTES) {
        setIsUploading(false);
        Alert.alert(
          "Atenção",
          "A imagem selecionada é muito pesada. Por favor, escolha uma foto menor (máximo 2MB)."
        );
        return;
      }

      // Envia a string Base64 diretamente no payload da API para salvar no banco de dados (Lean MVP)
      const uploadRes = await api.pacientes.uploadAvatar(
        paciente.id,
        imageBase64,
        "image/jpeg"
      );

      if (uploadRes && uploadRes.sucesso && uploadRes.avatarUrl) {
        atualizarAvatarUrl(uploadRes.avatarUrl);
        Alert.alert("Sucesso", "Foto de perfil atualizada com sucesso!");
      } else {
        Alert.alert(
          "Falha no Salvamento",
          uploadRes?.error || "Não foi possível salvar a imagem no servidor da clínica."
        );
      }
    } catch (err: any) {
      console.error("[ProfileScreen] Erro no upload da foto de perfil:", err);
      Alert.alert(
        "Erro no Upload",
        err.message || "Ocorreu uma falha ao enviar sua foto de perfil. Tente novamente."
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleOpenWhatsApp = async () => {
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
  };

  const handleAbrirWhatsApp = handleOpenWhatsApp;

  const handleConfirmarLogout = () => {
    Alert.alert(
      "CONFIRMAR SAÍDA",
      "DESEJA REALMENTE SAIR DA SUA CONTA DO APP FAAZ?",
      [
        { text: "CANCELAR", style: "cancel" },
        {
          text: "SAIR",
          style: "destructive",
          onPress: () => logout(),
        },
      ]
    );
  };

  return (
    <View style={styles.rootContainer}>
      {/* ======================================================== */}
      {/* 1. CABEÇALHO PADRÃO GLOBAL FAAZ                         */}
      {/* ======================================================== */}
      <StandardHeader
        title="Meu Perfil"
        onBack={() => (onBack ? onBack() : onTabPress?.("Home"))}
        rightElement={
          <View style={styles.headerVerifiedBadge}>
            <ShieldCheck size={12} color="#2dd4bf" />
            <Text style={styles.headerVerifiedText}>Ativo</Text>
          </View>
        }
      />

      {/* ======================================================== */}
      {/* 2. CONTEÚDO ROLÁVEL                                      */}
      {/* ======================================================== */}
      <ScrollView
        className="flex-1 w-full"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
      >
        {/* CARD DO PACIENTE */}
        <View style={styles.patientCard}>
          {/* FOTO DE PERFIL / AVATAR INTERATIVO */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleSelectPhotoSource}
            disabled={isUploading}
            className="w-24 h-24 rounded-full relative items-center justify-center overflow-hidden border-2 border-teal-500 shadow-md mb-2 bg-teal-50"
            style={styles.avatarTouchable}
          >
            {fullAvatarUrl ? (
              <Image
                source={{ uri: fullAvatarUrl }}
                className="w-24 h-24 rounded-full object-cover"
                resizeMode="cover"
                style={styles.avatarImage}
              />
            ) : (
              <View className="w-24 h-24 rounded-full bg-teal-600 items-center justify-center" style={styles.avatarPlaceholder}>
                <Text className="text-white text-3xl font-extrabold" style={styles.avatarLargeText}>
                  {initialLetter}
                </Text>
              </View>
            )}

            {/* Ícone de Câmera / Edição */}
            <View style={styles.cameraBadge}>
              <Camera size={13} color="#ffffff" />
            </View>

            {/* Overlay de carregamento */}
            {isUploading && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="small" color="#ffffff" />
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleSelectPhotoSource}
            disabled={isUploading}
            style={{ marginBottom: 6 }}
          >
            <Text style={styles.alterarFotoText}>
              {isUploading ? "Enviando foto..." : "Toque na foto para alterar"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.patientName}>{nomeExibicao}</Text>
          <View style={styles.prontuarioBadge}>
            <Text style={styles.prontuarioBadgeText}>PRONTUÁRIO: {prontuarioCodigo}</Text>
          </View>

          <View style={styles.patientDetailsRow}>
            <View style={styles.patientDetailItem}>
              <Text style={styles.patientDetailLabel}>PLANO</Text>
              <Text style={styles.patientDetailValue}>FAAZ INTEGRATIVO</Text>
            </View>
            <View style={styles.detailDivider} />
            <View style={styles.patientDetailItem}>
              <Text style={styles.patientDetailLabel}>META HÍDRICA</Text>
              <Text style={styles.patientDetailValue}>{metaAguaLitros}L / DIA</Text>
            </View>
          </View>
        </View>

        {/* ======================================================== */}
        {/* BLOCO: OBJETIVO CLÍNICO ATUAL                            */}
        {/* ======================================================== */}
        <View
          className="w-full bg-slate-50/90 border border-slate-200/80 rounded-2xl p-4 my-2 shadow-xs"
          style={styles.objectiveCard}
        >
          <View className="flex-row items-center gap-2 mb-1.5" style={styles.objectiveHeaderRow}>
            <View className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-100 items-center justify-center" style={styles.objectiveIconBox}>
              <Target size={15} color="#0f766e" />
            </View>
            <View style={{ flex: 1 }}>
              <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider" style={styles.objectiveLabel}>
                OBJETIVO CLÍNICO ATUAL
              </Text>
              <Text className="text-[10px] text-teal-700 font-semibold" style={styles.objectiveSublabel}>
                Definido pela médica assistente
              </Text>
            </View>
          </View>
          <Text className="text-sm font-semibold text-slate-800 tracking-tight leading-snug pl-0.5" style={styles.objectiveText}>
            {treatmentObjective}
          </Text>
        </View>

        {/* CORPO CLÍNICO RESPONSÁVEL */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <HeartPulse size={16} color="#0f766e" />
            <Text style={styles.sectionTitle}>EQUIPE MÉDICA ASSISTENTE</Text>
          </View>

          <View style={styles.doctorInfoRow}>
            <View style={styles.doctorBadgeIcon}>
              <ShieldCheck size={18} color="#0d9488" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.doctorName}>{medicoResponsavel}</Text>
              <Text style={styles.doctorSpecialty}>{especialidade}</Text>
              <Text style={styles.doctorFocus}>{focoClinico}</Text>
            </View>
          </View>
        </View>

        {/* ATENDIMENTO E SUPORTE */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Phone size={16} color="#0f766e" />
            <Text style={styles.sectionTitle}>SUPORTE E RECEPÇÃO</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleOpenWhatsApp}
            style={styles.actionRowButton}
          >
            <View style={styles.actionRowLeft}>
              <View style={styles.whatsappIconCircle}>
                <Phone size={14} color="#0f766e" />
              </View>
              <View>
                <Text style={styles.actionRowTitle}>CONCIERGE CLÍNICA FAAZ</Text>
                <Text style={styles.actionRowSubtitle}>FALAR COM A RECEPÇÃO VIA WHATSAPP</Text>
              </View>
            </View>
            <ChevronRight size={18} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* TERMOS E POLÍTICAS */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <FileText size={16} color="#0f766e" />
            <Text style={styles.sectionTitle}>DOCUMENTAÇÃO</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() =>
              Alert.alert(
                "LGPD & PRIVACIDADE",
                "SEUS DADOS CLÍNICOS SÃO PROTEGIDOS POR CRIPTOGRAFIA DE PONTA A PONTA EM CONFORMIDADE COM A LGPD E O CFM."
              )
            }
            style={styles.actionRowButton}
          >
            <View style={styles.actionRowLeft}>
              <View style={styles.actionIconCircle}>
                <FileText size={14} color="#64748b" />
              </View>
              <Text style={styles.actionRowTitle}>TERMOS DE USO E PRIVACIDADE</Text>
            </View>
            <ChevronRight size={18} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* BOTÃO DE LOGOUT */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleConfirmarLogout}
          style={styles.logoutButton}
        >
          <LogOut size={16} color="#ef4444" />
          <Text style={styles.logoutButtonText}>SAIR DA CONTA</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ======================================================== */}
      {/* 3. BARRA DE NAVEGAÇÃO INFERIOR                           */}
      {/* ======================================================== */}
      <View style={styles.bottomNavContainer}>
        {[
          { label: "Home", icon: HomeIcon },
          { label: "Dieta", icon: Utensils },
          { label: "METAS", icon: Target },
          { label: "Perfil", icon: User },
        ].map((tab) => {
          const Icon = tab.icon;
          const isSelected = tab.label === "Perfil";

          return (
            <TouchableOpacity
              key={tab.label}
              activeOpacity={0.7}
              onPress={() => {
                if (tab.label === "Home") {
                  onTabPress ? onTabPress("Home") : onBack?.();
                } else if (tab.label === "Dieta") {
                  onTabPress ? onTabPress("Dieta") : onNavigateToDieta?.();
                } else if (tab.label === "METAS") {
                  onTabPress ? onTabPress("METAS") : onNavigateToMetas?.();
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
                  isSelected && styles.bottomNavLabelActive,
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
  headerVerifiedBadge: {
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
  headerVerifiedText: {
    color: "#2dd4bf",
    fontSize: 10,
    fontWeight: "500",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  patientCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  avatarTouchable: {
    width: 96,
    height: 96,
    borderRadius: 48,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    backgroundColor: "#f0fdfa",
    borderWidth: 2,
    borderColor: "#0d9488",
    shadowColor: "#0d9488",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#0d9488",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLargeText: {
    fontSize: 32,
    fontWeight: "800",
    color: "#ffffff",
  },
  cameraBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#0f766e",
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
  },
  uploadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  alterarFotoText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0f766e",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  patientName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  prontuarioBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 6,
    marginBottom: 16,
  },
  prontuarioBadgeText: {
    fontSize: 9.5,
    fontWeight: "500",
    color: "#475569",
    letterSpacing: 0.5,
  },
  patientDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    width: "100%",
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  patientDetailItem: {
    alignItems: "center",
  },
  patientDetailLabel: {
    fontSize: 9,
    fontWeight: "500",
    color: "#64748b",
    letterSpacing: 0.5,
  },
  patientDetailValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0f766e",
    marginTop: 2,
  },
  detailDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#e2e8f0",
  },
  objectiveCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginTop: 10,
    marginBottom: 6,
  },
  objectiveHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  objectiveIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#ccfbf1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  objectiveLabel: {
    fontSize: 9.5,
    fontWeight: "700",
    color: "#64748b",
    letterSpacing: 0.5,
  },
  objectiveSublabel: {
    fontSize: 9.5,
    fontWeight: "600",
    color: "#0f766e",
    marginTop: 1,
  },
  objectiveText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1e293b",
    lineHeight: 18,
  },
  sectionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0f172a",
    letterSpacing: 0.6,
  },
  doctorInfoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  doctorBadgeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ccfbf1",
    alignItems: "center",
    justifyContent: "center",
  },
  doctorName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f172a",
    letterSpacing: 0.3,
  },
  doctorSpecialty: {
    fontSize: 10.5,
    fontWeight: "500",
    color: "#0f766e",
    marginTop: 1,
  },
  doctorFocus: {
    fontSize: 9.5,
    fontWeight: "400",
    color: "#64748b",
    marginTop: 3,
  },
  actionRowButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  actionRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  whatsappIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ccfbf1",
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  actionRowTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1e293b",
    letterSpacing: 0.2,
  },
  actionRowSubtitle: {
    fontSize: 9,
    fontWeight: "400",
    color: "#64748b",
    marginTop: 1,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 6,
  },
  logoutButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#dc2626",
    letterSpacing: 0.6,
  },
  bottomNavContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingVertical: 10,
  },
  bottomNavTab: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  bottomNavLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: "#94a3b8",
    marginTop: 2,
    letterSpacing: 0.2,
  },
  bottomNavLabelActive: {
    color: "#0f766e",
    fontWeight: "600",
  },
});
