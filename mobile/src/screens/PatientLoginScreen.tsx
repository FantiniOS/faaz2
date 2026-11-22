import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
  Animated,
  Easing,
} from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Rect,
  Path,
  Circle,
  Line,
  Pattern,
} from "react-native-svg";
import {
  ShieldCheck,
  UserCheck,
  ArrowRight,
  Check,
  AlertCircle,
  MessageCircle,
  FileText,
  Activity,
  Lock,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import logoFaaz from "../assets/logo.png";
import { usePatientAuth } from "../contexts/PatientAuthContext";
import { TermosPrivacidadeModal } from "../components/TermosPrivacidadeModal";

const WHATSAPP_RECEPCAO_URL =
  "https://wa.me/5531984400076?text=Olá!%20Sou%20paciente%20da%20Clínica%20FAAZ%20e%20preciso%20de%20ajuda%20para%20acessar%20o%20aplicativo.";

function formatCpf(text: string): string {
  const numbers = text.replace(/\D/g, "").slice(0, 11);
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 6) return `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
  if (numbers.length <= 9) {
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
  }
  return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9)}`;
}

export function PatientLoginScreen() {
  const { loginComCpf, isLoading } = usePatientAuth();
  const insets = useSafeAreaInsets();
  const [cpf, setCpf] = useState<string>("");
  const [manterConectado, setManterConectado] = useState<boolean>(true);
  const [cpfFocused, setCpfFocused] = useState<boolean>(false);
  const [erroLogin, setErroLogin] = useState<string | null>(null);
  const [isTermosOpen, setIsTermosOpen] = useState<boolean>(false);
  const cpfInputRef = useRef<React.ComponentRef<typeof TextInput> | null>(null);

  // Pulso vivo sutil para o indicador de telemetria ativa (GPU-friendly native driver)
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1400,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.85],
  });
  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.65, 0],
  });

  const cpfDigits = cpf.replace(/\D/g, "");
  const isCpfCompleto = cpfDigits.length === 11;

  function handleCpfChange(text: string) {
    setCpf(formatCpf(text));
    if (erroLogin) setErroLogin(null);
  }

  async function handleLogin() {
    if (isLoading) return;
    const cleanCpf = cpf.replace(/\D/g, "");

    if (cleanCpf.length !== 11) {
      setErroLogin(
        "Digite os 11 números do seu CPF para acessar seu acompanhamento."
      );
      return;
    }

    setErroLogin(null);

    try {
      const res = await loginComCpf(cleanCpf, manterConectado);
      if (!res.sucesso) {
        setErroLogin(
          res.error ||
            "CPF não localizado na base ativa. Verifique os dígitos ou fale com a recepção."
        );
      }
    } catch (error: any) {
      setErroLogin(
        error?.message ||
          "Não foi possível conectar ao servidor da Clínica FAAZ. Tente novamente."
      );
    }
  }

  async function handleFalarRecepcao() {
    try {
      const targetUrl = encodeURI(decodeURI(WHATSAPP_RECEPCAO_URL));
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.open(targetUrl, "_blank");
        return;
      }
      await Linking.openURL(targetUrl);
    } catch {
      Alert.alert(
        "Recepção Clínica FAAZ",
        "Entre em contato pelo WhatsApp oficial: (31) 98440-0076"
      );
    }
  }

  return (
    <View style={styles.root}>
      {/* ================================================================== */}
      {/* CAMADA DE FUNDO CLINICAL LIGHT HIGH-TECH (GRADIENTE + AURAS + GRID) */}
      {/* ================================================================== */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg
          pointerEvents="none"
          width="100%"
          height="100%"
          viewBox="0 0 400 840"
          preserveAspectRatio="xMidYMid slice"
        >
          <Defs>
            <LinearGradient id="bgCeramic" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#F8FAFC" />
              <Stop offset="52%" stopColor="#F1FCF9" />
              <Stop offset="100%" stopColor="#ECFDF5" />
            </LinearGradient>
            <RadialGradient id="auraTopGold" cx="50%" cy="16%" r="48%">
              <Stop offset="0%" stopColor="#D9A94E" stopOpacity="0.16" />
              <Stop offset="55%" stopColor="#10B981" stopOpacity="0.06" />
              <Stop offset="100%" stopColor="#F8FAFC" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="auraBottomTeal" cx="85%" cy="88%" r="54%">
              <Stop offset="0%" stopColor="#0D9488" stopOpacity="0.14" />
              <Stop offset="55%" stopColor="#06B6D4" stopOpacity="0.05" />
              <Stop offset="100%" stopColor="#ECFDF5" stopOpacity="0" />
            </RadialGradient>
            <Pattern
              id="precisionDots"
              x="0"
              y="0"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <Circle cx="2" cy="2" r="1" fill="#0F766E" fillOpacity="0.09" />
            </Pattern>
          </Defs>

          <Rect x="0" y="0" width="400" height="840" fill="url(#bgCeramic)" />
          <Rect x="0" y="0" width="400" height="840" fill="url(#precisionDots)" />
          <Rect x="0" y="0" width="400" height="840" fill="url(#auraTopGold)" />
          <Rect x="0" y="0" width="400" height="840" fill="url(#auraBottomTeal)" />
        </Svg>

        {/* Marca d'Água Arquitetônica do Emblema Clínica FAAZ */}
        <Image
          source={logoFaaz}
          resizeMode="contain"
          style={styles.architecturalWatermark}
          accessible={false}
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + 8,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* ============================================================== */}
          {/* HERO DE MARCA PROTAGONISTA — MEDALHÃO DOURADO CLÍNICA FAAZ     */}
          {/* ============================================================== */}
          <View pointerEvents="none" style={styles.brandingSection}>
            <View style={styles.logoHaloWrap}>
              <View style={styles.logoMedallion}>
                <Image
                  source={logoFaaz}
                  accessibilityLabel="Logotipo Clínica FAAZ"
                  resizeMode="contain"
                  style={styles.logoImage}
                />
              </View>
            </View>

            <Text style={styles.brandTitle}>CLÍNICA FAAZ</Text>
            <Text style={styles.brandSubtitle}>
              MEDICINA &amp; SAÚDE INTEGRATIVA
            </Text>

            {/* Pílula tecnológica viva (espelho do FRDOC 2.0 na Web) */}
            <View style={styles.portalPill}>
              <View style={styles.liveDotWrap}>
                <Animated.View
                  style={[
                    styles.liveDotPing,
                    {
                      transform: [{ scale: pulseScale }],
                      opacity: pulseOpacity,
                    },
                  ]}
                />
                <View style={styles.liveDotCore} />
              </View>
              <Text style={styles.portalPillText}>
                PORTAL DO PACIENTE • FRDOC 2.0
              </Text>
            </View>
          </View>

          {/* ============================================================== */}
          {/* CARD CIRÚRGICO DE IDENTIFICAÇÃO (GLASS / CERAMIC HIGH-TECH)    */}
          {/* ============================================================== */}
          <View style={styles.loginCard} collapsable={false}>
            {/* Micro-HUD Biométrico no topo do card (assinatura visual da Web) */}
            <View pointerEvents="none" style={styles.hudStrip}>
              <View style={styles.hudHeaderRow}>
                <View style={styles.hudBadgeLeft}>
                  <View style={styles.hudIconBox}>
                    <Activity size={11} color="#047857" />
                  </View>
                  <Text
                    style={styles.hudLabel}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    Acompanhamento Clínico Sincronizado
                  </Text>
                </View>
                <View style={styles.hudLockChip}>
                  <Lock size={10} color="#0f766e" />
                  <Text style={styles.hudLockText}>TLS</Text>
                </View>
              </View>

              <Svg
                pointerEvents="none"
                width="100%"
                height={22}
                viewBox="0 0 320 40"
                preserveAspectRatio="none"
              >
                <Defs>
                  <LinearGradient id="miniWaveFill" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0%" stopColor="#10B981" stopOpacity="0.22" />
                    <Stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                  </LinearGradient>
                  <LinearGradient id="miniWaveStroke" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0%" stopColor="#059669" stopOpacity="0.45" />
                    <Stop offset="50%" stopColor="#0D9488" stopOpacity="1" />
                    <Stop offset="100%" stopColor="#10B981" stopOpacity="0.7" />
                  </LinearGradient>
                </Defs>
                <Line
                  x1="0"
                  y1="20"
                  x2="320"
                  y2="20"
                  stroke="#CBD5E1"
                  strokeOpacity="0.45"
                  strokeDasharray="3 4"
                />
                <Path
                  d="M0 30 C28 30 42 24 64 24 C86 24 98 12 122 12 C142 12 150 26 170 26 C186 26 194 6 208 6 C220 6 228 31 244 31 C260 31 274 16 296 16 C308 16 314 19 320 18 L320 40 L0 40 Z"
                  fill="url(#miniWaveFill)"
                />
                <Path
                  d="M0 30 C28 30 42 24 64 24 C86 24 98 12 122 12 C142 12 150 26 170 26 C186 26 194 6 208 6 C220 6 228 31 244 31 C260 31 274 16 296 16 C308 16 314 19 320 18"
                  stroke="url(#miniWaveStroke)"
                  strokeWidth={2}
                  fill="none"
                  strokeLinecap="round"
                />
                <Circle
                  cx={122}
                  cy={12}
                  r={3}
                  fill="#ffffff"
                  stroke="#059669"
                  strokeWidth={1.8}
                />
                <Circle
                  cx={208}
                  cy={6}
                  r={4.2}
                  fill="#10B981"
                  fillOpacity={0.22}
                />
                <Circle
                  cx={208}
                  cy={6}
                  r={2.8}
                  fill="#059669"
                  stroke="#ffffff"
                  strokeWidth={1.4}
                />
              </Svg>
            </View>

            {/* Cabeçalho do Formulário */}
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Identificação do Paciente</Text>
              <Text style={styles.cardDescription}>
                Informe o CPF cadastrado na clínica para acessar seu plano
                alimentar, consultas e acompanhamento clínico.
              </Text>
            </View>

            {/* Feedback de erro inline limpo */}
            {erroLogin ? (
              <View style={styles.errorBanner}>
                <AlertCircle size={15} color="#be123c" />
                <Text style={styles.errorBannerText}>{erroLogin}</Text>
              </View>
            ) : null}

            {/* Campo CPF */}
            <View style={styles.inputContainer} collapsable={false}>
              <Text style={styles.inputLabel}>CPF DO PACIENTE</Text>
              <Pressable
                collapsable={false}
                onPress={() => {
                  if (!isLoading) {
                    cpfInputRef.current?.focus();
                  }
                }}
                style={[
                  styles.inputWrapper,
                  cpfFocused && styles.inputWrapperFocused,
                  erroLogin && styles.inputWrapperError,
                ]}
              >
                <View pointerEvents="none" style={styles.inputIconWrap}>
                  <UserCheck
                    size={19}
                    color={cpfFocused ? "#059669" : "#64748b"}
                  />
                </View>
                <TextInput
                  ref={cpfInputRef}
                  style={[
                    styles.textInput,
                    Platform.OS === "web" && ({ outlineStyle: "none" } as any),
                  ]}
                  placeholder="000.000.000-00"
                  placeholderTextColor="#94a3b8"
                  keyboardType={Platform.OS === "web" ? "numeric" : "number-pad"}
                  returnKeyType="done"
                  value={cpf}
                  onChangeText={handleCpfChange}
                  onFocus={() => setCpfFocused(true)}
                  onBlur={() => setCpfFocused(false)}
                  onSubmitEditing={() => void handleLogin()}
                  maxLength={14}
                  editable={!isLoading}
                  autoFocus={false}
                  autoCorrect={false}
                  autoComplete="off"
                  importantForAutofill="no"
                  underlineColorAndroid="transparent"
                  disableFullscreenUI={true}
                />
                {isCpfCompleto ? (
                  <View pointerEvents="none" style={styles.cpfValidBadge}>
                    <Check size={12} color="#047857" strokeWidth={3} />
                  </View>
                ) : null}
              </Pressable>
            </View>

            {/* Checkbox: Manter conectado */}
            <TouchableOpacity
              style={styles.checkboxRow}
              activeOpacity={0.72}
              disabled={isLoading}
              onPress={() => setManterConectado((prev) => !prev)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: manterConectado }}
            >
              <View
                style={[
                  styles.checkboxBox,
                  manterConectado && styles.checkboxBoxChecked,
                ]}
              >
                {manterConectado ? (
                  <Check size={12} color="#ffffff" strokeWidth={3} />
                ) : null}
              </View>
              <Text style={styles.checkboxLabel}>Manter conectado</Text>
            </TouchableOpacity>

            {/* Botão Principal Esmeralda */}
            <TouchableOpacity
              style={[
                styles.loginButton,
                isLoading && styles.loginButtonDisabled,
              ]}
              onPress={() => void handleLogin()}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <View style={styles.buttonContent}>
                  <ActivityIndicator color="#ffffff" size="small" />
                  <Text style={styles.loginButtonText}>Autenticando...</Text>
                </View>
              ) : (
                <View style={styles.buttonContent}>
                  <Text style={styles.loginButtonText}>Acessar Meu Painel</Text>
                  <ArrowRight size={17} color="#ffffff" strokeWidth={2.5} />
                </View>
              )}
            </TouchableOpacity>

            {/* Ajuda discreta — Recepção via WhatsApp oficial */}
            <View style={styles.helpRow}>
              <Text style={styles.helpPromptText}>
                Primeiro acesso ou precisa de ajuda?
              </Text>
              <TouchableOpacity
                activeOpacity={0.72}
                onPress={() => void handleFalarRecepcao()}
                style={styles.helpLinkBtn}
              >
                <MessageCircle size={13} color="#047857" />
                <Text style={styles.helpLinkText}>Falar com a recepção</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ============================================================== */}
          {/* RODAPÉ INSTITUCIONAL COMPLETO (SEGURANÇA + TERMOS LGPD/CFM)    */}
          {/* ============================================================== */}
          <View style={styles.footerBlock}>
            <View style={styles.securityRow}>
              <ShieldCheck size={14} color="#059669" />
              <Text style={styles.securityText}>
                Ambiente Seguro • Sigilo Médico &amp; Criptografia Clínica FAAZ
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.72}
              onPress={() => setIsTermosOpen(true)}
              style={styles.termsLinkBtn}
            >
              <FileText size={12} color="#64748b" />
              <Text style={styles.termsLinkText}>
                Termos de Uso e Política de Privacidade
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal completo de leitura dos Termos e Privacidade (LGPD / CFM) */}
      <TermosPrivacidadeModal
        visible={isTermosOpen}
        mode="leitura"
        topInset={insets.top}
        bottomInset={insets.bottom}
        onClose={() => setIsTermosOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  architecturalWatermark: {
    position: "absolute",
    top: -14,
    right: -68,
    width: 270,
    height: 326,
    opacity: 0.055,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  brandingSection: {
    alignItems: "center",
    marginBottom: 12,
  },
  logoHaloWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
  },
  logoMedallion: {
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(217, 169, 78, 0.28)",
    shadowColor: "#b4821e",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 5,
  },
  logoImage: {
    width: 48,
    height: 56,
  },
  brandTitle: {
    fontSize: 19.5,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: 1.5,
  },
  brandSubtitle: {
    fontSize: 9.5,
    fontWeight: "700",
    color: "#64748b",
    letterSpacing: 2,
    marginTop: 2,
  },
  portalPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 7,
    shadowColor: "#0f766e",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  liveDotWrap: {
    width: 10,
    height: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  liveDotPing: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#34d399",
  },
  liveDotCore: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#10b981",
  },
  portalPillText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#065f46",
    letterSpacing: 1,
  },
  loginCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.95)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 6,
  },
  hudStrip: {
    backgroundColor: "#f8fafc",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 4,
    marginBottom: 10,
    overflow: "hidden",
  },
  hudHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 3,
    gap: 8,
  },
  hudBadgeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  hudIconBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  hudLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
  },
  hudLockChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#ccfbf1",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    flexShrink: 0,
  },
  hudLockText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#0f766e",
    letterSpacing: 0.5,
  },
  cardHeader: {
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  cardDescription: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 16.5,
    marginTop: 3,
    fontWeight: "500",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginBottom: 10,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: "600",
    color: "#be123c",
    lineHeight: 16,
  },
  inputContainer: {
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#334155",
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 13,
    paddingHorizontal: 13,
    height: 46,
  },
  inputWrapperFocused: {
    backgroundColor: "#ffffff",
    borderColor: "#059669",
  },
  inputWrapperError: {
    borderColor: "#fb7185",
  },
  inputIconWrap: {
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  textInput: {
    flex: 1,
    height: "100%",
    paddingVertical: 0,
    fontSize: 15.5,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: 1.1,
  },
  cpfValidBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 11,
    alignSelf: "flex-start",
    paddingVertical: 1,
  },
  checkboxBox: {
    width: 19,
    height: 19,
    borderRadius: 6,
    borderWidth: 1.6,
    borderColor: "#94a3b8",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxBoxChecked: {
    backgroundColor: "#059669",
    borderColor: "#059669",
  },
  checkboxLabel: {
    fontSize: 12.5,
    color: "#334155",
    fontWeight: "600",
  },
  loginButton: {
    backgroundColor: "#059669",
    height: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.26,
    shadowRadius: 12,
    elevation: 4,
  },
  loginButtonDisabled: {
    opacity: 0.68,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loginButtonText: {
    color: "#ffffff",
    fontSize: 14.5,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  helpRow: {
    marginTop: 11,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    alignItems: "center",
    gap: 3,
  },
  helpPromptText: {
    fontSize: 11.5,
    color: "#64748b",
    fontWeight: "500",
  },
  helpLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  helpLinkText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#047857",
  },
  footerBlock: {
    alignItems: "center",
    marginTop: 12,
    gap: 7,
  },
  securityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 8,
  },
  securityText: {
    flexShrink: 1,
    fontSize: 10.5,
    fontWeight: "600",
    color: "#0f766e",
    textAlign: "center",
  },
  termsLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.9)",
  },
  termsLinkText: {
    fontSize: 10.5,
    fontWeight: "600",
    color: "#475569",
  },
});

export default PatientLoginScreen;
