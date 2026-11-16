import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import logoFaaz from "../assets/logo.png";
import {
  Hexagon,
  ShieldCheck,
  UserCheck,
  Sparkles,
  ArrowRight,
  Stethoscope,
  Check,
} from "lucide-react-native";
import { usePatientAuth } from "../contexts/PatientAuthContext";

export function PatientLoginScreen() {
  const { loginComCpf, isLoading } = usePatientAuth();
  const [cpf, setCpf] = useState<string>("");
  const [manterConectado, setManterConectado] = useState<boolean>(true);

  function formatCpf(text: string): string {
    const numbers = text.replace(/\D/g, "").slice(0, 11);
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
    if (numbers.length <= 9)
      return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9)}`;
  }

  function handleCpfChange(text: string) {
    setCpf(formatCpf(text.toUpperCase()));
  }

  async function handleLogin(customCpf?: string) {
    const targetCpf = customCpf || cpf || "";
    const cleanCpf = targetCpf.replace(/\D/g, "");

    if (cleanCpf.length !== 11) {
      const msg = "Por favor, digite os 11 números do seu CPF para acessar seu prontuário.";
      if (typeof alert === "function") {
        alert(msg);
      } else {
        Alert.alert("CPF Incompleto", msg);
      }
      return;
    }

    try {
      const res = await loginComCpf(cleanCpf, manterConectado);
      if (!res.sucesso) {
        throw new Error(res.error || "Acesso não autorizado. Verifique o CPF informado.");
      }
    } catch (error: any) {
      const errorMsg = error?.message || String(error) || "Falha ao conectar com o servidor da Clínica FAAZ.";
      // Alerta nativo de navegador/mobile para evitar falhas silenciosas
      if (typeof alert === "function") {
        alert(errorMsg);
      } else {
        Alert.alert("Falha no Login", errorMsg);
      }
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.keyboardContainer}
      pointerEvents="box-none"
    >
      <ScrollView
        className="flex-1 w-full"
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        {/* BANNER SUPERIOR DE BRANDING DA CLÍNICA FAAZ */}
        <View style={styles.brandingSection}>
          <Image
            source={logoFaaz}
            accessibilityLabel="Clínica FAAZ"
            resizeMode="contain"
            style={{ width: 96, height: 32, maxHeight: 32, marginBottom: 8 }}
          />

          <View style={styles.brandTitleRow}>
            <Text style={styles.brandPrefix}>Clínica </Text>
            <Text style={styles.brandName}>FAAZ</Text>
          </View>
          <Text style={styles.brandSubtitle}>MEDICINA & SAÚDE INTEGRATIVA</Text>

          <View style={styles.portalBadge}>
            <Sparkles size={13} color="#0f766e" />
            <Text style={styles.portalBadgeText}>PORTAL DO PACIENTE</Text>
          </View>
        </View>

        {/* CARD PRINCIPAL DE LOGIN */}
        <View style={styles.loginCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Identificação do Paciente</Text>
            <Text style={styles.cardDescription}>
              Informe seu CPF para sincronizar suas metas de hidratação e check-ins com seu médico.
            </Text>
          </View>

          {/* CAMPO DE CPF */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>CPF DO PACIENTE</Text>
            <View style={styles.inputWrapper}>
              <UserCheck size={20} color="#0d9488" style={styles.inputIcon} />
              <TextInput
                style={[
                  styles.textInput,
                  Platform.OS === "web" && ({ outlineStyle: "none" } as any),
                ]}
                placeholder="000.000.000-00"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                autoCapitalize="characters"
                value={cpf}
                onChangeText={handleCpfChange}
                maxLength={14}
                editable={!isLoading}
                autoFocus={false}
              />
            </View>
          </View>

          {/* CHECKBOX: MANTER CONECTADO (PERSISTENT LOGIN) */}
          <TouchableOpacity
            style={styles.checkboxRow}
            activeOpacity={0.7}
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
              {manterConectado && (
                <Check size={13} color="#ffffff" strokeWidth={3} />
              )}
            </View>
            <Text style={styles.checkboxLabel}>Manter conectado</Text>
          </TouchableOpacity>

          {/* BOTÃO PRINCIPAL DE ENTRADA */}
          <TouchableOpacity
            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
            onPress={() => handleLogin()}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <View style={styles.buttonContent}>
                <Text style={styles.loginButtonText}>Acessar Meu Painel</Text>
                <ArrowRight size={18} color="#ffffff" strokeWidth={2.4} />
              </View>
            )}
          </TouchableOpacity>

          {/* DIVISOR SUTIL */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>PACIENTES CADASTRADOS PARA TESTE</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* BOTÕES DE TESTE RÁPIDO */}
          <View style={styles.testButtonsContainer}>
            <TouchableOpacity
              style={styles.testButton}
              activeOpacity={0.7}
              onPress={() => {
                setCpf("111.222.333-44");
                handleLogin("11122233344");
              }}
              disabled={isLoading}
            >
              <View style={styles.testButtonBadge}>
                <Text style={styles.testButtonInitial}>C</Text>
              </View>
              <View style={styles.testButtonTexts}>
                <Text style={styles.testButtonName}>Carlos Eduardo Fantini</Text>
                <Text style={styles.testButtonCpf}>CPF: 111.222.333-44 • Meta: 2.5L</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.testButton}
              activeOpacity={0.7}
              onPress={() => {
                setCpf("222.333.444-55");
                handleLogin("22233344455");
              }}
              disabled={isLoading}
            >
              <View style={[styles.testButtonBadge, styles.testButtonBadgePurple]}>
                <Text style={[styles.testButtonInitial, styles.testButtonInitialPurple]}>M</Text>
              </View>
              <View style={styles.testButtonTexts}>
                <Text style={styles.testButtonName}>Maria Luiza Silva</Text>
                <Text style={styles.testButtonCpf}>CPF: 222.333.444-55 • Meta: 3.0L</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* RODAPÉ COM SEGURANÇA E LGPD */}
        <View style={styles.securityFooter}>
          <ShieldCheck size={16} color="#0f766e" />
          <Text style={styles.securityText}>
            Ambiente Seguro • Sigilo Médico & Criptografia Clínica FAAZ
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 32,
  },
  brandingSection: {
    alignItems: "center",
    marginBottom: 28,
  },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: "#f0fdfa",
    borderWidth: 1.5,
    borderColor: "#ccfbf1",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    shadowColor: "#0d9488",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  logoDot: {
    position: "absolute",
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#0d9488",
  },
  brandTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 14,
  },
  brandPrefix: {
    fontSize: 26,
    fontWeight: "300",
    color: "#0f172a",
    letterSpacing: -0.5,
  },
  brandName: {
    fontSize: 27,
    fontWeight: "700",
    color: "#0d9488",
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 10,
    fontWeight: "500",
    color: "#0f766e",
    letterSpacing: 1.8,
    marginTop: 3,
  },
  portalBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ccfbf1",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 14,
  },
  portalBadgeText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#0f766e",
    letterSpacing: 0.8,
  },
  loginCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
  },
  cardHeader: {
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  cardDescription: {
    fontSize: 13,
    color: "#4b5563",
    lineHeight: 18,
    marginTop: 4,
  },
  inputContainer: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#374151",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a",
    letterSpacing: 1,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    marginBottom: 16,
    alignSelf: "flex-start",
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#94a3b8",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxBoxChecked: {
    backgroundColor: "#0d9488",
    borderColor: "#0d9488",
  },
  checkboxLabel: {
    fontSize: 13,
    color: "#334155",
    fontWeight: "500",
  },
  loginButton: {
    backgroundColor: "#0d9488",
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0d9488",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  loginButtonDisabled: {
    opacity: 0.65,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loginButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#f1f5f9",
  },
  dividerText: {
    fontSize: 10,
    fontWeight: "400",
    color: "#64748b",
    marginHorizontal: 10,
    letterSpacing: 0.6,
  },
  testButtonsContainer: {
    gap: 10,
  },
  testButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#ccfbf1",
    padding: 10,
    borderRadius: 12,
    gap: 10,
  },
  testButtonBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#0d9488",
    alignItems: "center",
    justifyContent: "center",
  },
  testButtonBadgePurple: {
    backgroundColor: "#7c3aed",
  },
  testButtonInitial: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 15,
  },
  testButtonInitialPurple: {
    color: "#ffffff",
  },
  testButtonTexts: {
    flex: 1,
  },
  testButtonName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f172a",
  },
  testButtonCpf: {
    fontSize: 11,
    color: "#0f766e",
    fontWeight: "400",
    marginTop: 1,
  },
  securityFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 24,
  },
  securityText: {
    fontSize: 11,
    fontWeight: "400",
    color: "#0f766e",
  },
});

export default PatientLoginScreen;

