import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import logoFaaz from "../assets/logo.png";
import {
  ArrowLeft,
  HeartPulse,
  CheckCircle2,
  Sparkles,
  Send,
  AlertTriangle,
} from "lucide-react-native";
import { usePatientAuth } from "../contexts/PatientAuthContext";
import { StandardHeader } from "../components/StandardHeader";
import api from "../services/api";
import { classificarGlicemiaClinica } from "../utils/glicemiaClassificacao";

export type MomentoGlicemia = "JEJUM" | "POS_PRANDIAL" | "CASUAL";

export interface GlicemiaCheckinScreenProps {
  onBack: () => void;
  onSuccess?: (valor: number, momento: MomentoGlicemia) => void;
}

const MOMENTOS: { id: MomentoGlicemia; label: string; sub: string }[] = [
  { id: "JEJUM", label: "Em Jejum", sub: "Ao acordar / 8h+ sem comer" },
  { id: "POS_PRANDIAL", label: "Pós-Refeição", sub: "1h a 2h após comer" },
  { id: "CASUAL", label: "Outro", sub: "Medição de rotina" },
];

export function GlicemiaCheckinScreen({
  onBack,
  onSuccess,
}: GlicemiaCheckinScreenProps) {
  const { paciente } = usePatientAuth();
  const realPacienteId =
    paciente?.id || "92dab67a-1977-4690-ae23-7cc60499a0c5";
  const nomePaciente = paciente?.nome || "Paciente FAAZ";

  const [valorInput, setValorInput] = useState<string>("");
  const [momentoSelecionado, setMomentoSelecionado] =
    useState<MomentoGlicemia>("JEJUM");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const valorNumerico = parseInt(valorInput.replace(/\D/g, ""), 10);
  const isValorValido =
    !isNaN(valorNumerico) && valorNumerico >= 20 && valorNumerico <= 600;
  const classificacaoAtual = isValorValido
    ? classificarGlicemiaClinica(valorNumerico, momentoSelecionado)
    : null;
  const isAlertaCritico = Boolean(classificacaoAtual?.isForaDoAlvo);

  async function handleRegistrarGlicemia() {
    if (!isValorValido || isSubmitting) {
      const msg = "Por favor, digite um valor de glicemia entre 20 e 600 mg/dL.";
      if (typeof alert === "function") alert(msg);
      else Alert.alert("Valor Inválido", msg);
      return;
    }

    setIsSubmitting(true);
    try {
      await api.checkins.registrarGlicemia({
        pacienteId: realPacienteId,
        valor: valorNumerico,
        momento: momentoSelecionado,
      });

      // 3. Re-fetch e Reatividade de Interface: atualiza os dados da tela anterior
      if (onSuccess) {
        onSuccess(valorNumerico, momentoSelecionado);
      }

      // 2. Feedback visual nativo imediato
      const feedbackMsg = isAlertaCritico
        ? `Sua medição de ${valorNumerico} mg/dL foi sincronizada com prioridade médica.`
        : `Medição de ${valorNumerico} mg/dL sincronizada com o prontuário de ${nomePaciente}.`;

      if (typeof alert === "function") {
        alert(feedbackMsg);
      } else {
        Alert.alert("Sucesso", feedbackMsg);
      }

      // Desmontagem automática e imediata da tela
      onBack();
    } catch (err: any) {
      const errorMsg =
        err?.message || "Não foi possível registrar a medição. Verifique a conexão.";
      if (typeof alert === "function") {
        alert(errorMsg);
      } else {
        Alert.alert("Falha no Registro", errorMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* CABEÇALHO PADRÃO GLOBAL */}
      <StandardHeader
        title="Registro de Glicemia"
        onBack={onBack}
      />

      <ScrollView
        className="flex-1 w-full"
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* CARD CENTRAL DE INPUT NUMÉRICO EM DESTAQUE */}
        <View style={styles.inputCard}>
          <View style={styles.badgeTop}>
            <HeartPulse size={15} color="#e11d48" />
            <Text style={styles.badgeTopText}>GLICEMIA CAPILAR (MG/DL)</Text>
          </View>

          <View style={styles.numericInputContainer}>
            <TextInput
              value={valorInput}
              autoCapitalize="characters"
              onChangeText={(txt) =>
                setValorInput(txt.toUpperCase().replace(/\D/g, "").slice(0, 3))
              }
              placeholder="98"
              placeholderTextColor="#cbd5e1"
              keyboardType="number-pad"
              maxLength={3}
              autoFocus
              style={[
                styles.numericInput,
                isAlertaCritico ? styles.numericInputCritico : null,
                Platform.OS === "web" && ({ outlineStyle: "none" } as any),
              ]}
            />
            <Text style={styles.unitLabel}>mg/dL</Text>
          </View>

          {isValorValido && classificacaoAtual && (
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: classificacaoAtual.badgeBg,
                  borderWidth: 1,
                  borderColor: classificacaoAtual.badgeBorder,
                },
              ]}
            >
              {classificacaoAtual.isNoAlvo ? (
                <CheckCircle2 size={13} color={classificacaoAtual.badgeText} />
              ) : (
                <AlertTriangle size={13} color={classificacaoAtual.badgeText} />
              )}
              <Text
                style={[
                  styles.statusPillText,
                  { color: classificacaoAtual.badgeText },
                ]}
              >
                {classificacaoAtual.status === "HIPO"
                  ? `Hipoglicemia: abaixo de ${classificacaoAtual.alvoMin} mg/dL`
                  : classificacaoAtual.isForaDoAlvo
                    ? `Acima do alvo (meta ≤${classificacaoAtual.alvoMax} mg/dL)`
                    : `No alvo (${classificacaoAtual.alvoMin}–${classificacaoAtual.alvoMax} mg/dL)`}
              </Text>
            </View>
          )}
        </View>

        {/* 3 BOTÕES / CHIPS RÁPIDOS DE SELEÇÃO DE MOMENTO */}
        <View style={styles.momentoSection}>
          <Text style={styles.sectionTitle}>Momento da Medição</Text>
          <View style={styles.chipsRow}>
            {MOMENTOS.map((item) => {
              const isSelected = momentoSelecionado === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.8}
                  onPress={() => setMomentoSelecionado(item.id)}
                  style={[
                    styles.chipButton,
                    isSelected ? styles.chipButtonActive : styles.chipButtonInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      isSelected ? styles.chipLabelActive : styles.chipLabelInactive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* BOTÃO DE AÇÃO PRIMÁRIA */}
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={!isValorValido || isSubmitting}
          onPress={handleRegistrarGlicemia}
          style={[
            styles.primaryButton,
            (!isValorValido || isSubmitting) ? styles.primaryButtonDisabled : null,
            isSubmitting && { opacity: 0.6 },
          ]}
        >
          {isSubmitting ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator color="#ffffff" size="small" />
              <Text style={styles.primaryButtonText}>SALVANDO...</Text>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Send size={18} color="#ffffff" />
              <Text style={styles.primaryButtonText}>SALVAR GLICEMIA</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.footerInfo}>
          <Sparkles size={14} color="#0d9488" />
          <Text style={styles.footerInfoText}>
            Sincronização instantânea com o prontuário médico da Clínica FAAZ.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingRight: 8,
  },
  backText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#4b5563",
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0f172a",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
  },
  inputCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 24,
  },
  badgeTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff1f2",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 16,
  },
  badgeTopText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#be123c",
    letterSpacing: 0.6,
  },
  numericInputContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    marginVertical: 8,
  },
  numericInput: {
    fontSize: 64,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
    minWidth: 140,
    paddingVertical: 4,
  },
  numericInputCritico: {
    color: "#e11d48",
  },
  unitLabel: {
    fontSize: 20,
    fontWeight: "500",
    color: "#64748b",
    marginLeft: 6,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 12,
  },
  statusPillNormal: {
    backgroundColor: "#ecfdf5",
  },
  statusPillCritico: {
    backgroundColor: "#ffe4e6",
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "500",
  },
  statusPillTextNormal: {
    color: "#047857",
  },
  statusPillTextCritico: {
    color: "#be123c",
  },
  momentoSection: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipsRow: {
    flexDirection: "row",
    gap: 10,
  },
  chipButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  chipButtonActive: {
    backgroundColor: "#0f766e",
    borderColor: "#0f766e",
  },
  chipButtonInactive: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  chipLabelActive: {
    color: "#ffffff",
  },
  chipLabelInactive: {
    color: "#334155",
  },
  primaryButton: {
    backgroundColor: "#059669",
    borderRadius: 18,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryButtonDisabled: {
    backgroundColor: "#94a3b8",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  footerInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 18,
  },
  footerInfoText: {
    fontSize: 12,
    color: "#4b5563",
    fontWeight: "400",
  },
});
