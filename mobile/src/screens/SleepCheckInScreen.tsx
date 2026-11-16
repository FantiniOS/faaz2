import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Moon,
  Clock,
  Sparkles,
  Minus,
  Plus,
  CheckCircle2,
  Frown,
  Meh,
  Smile,
  Star,
} from "lucide-react-native";
import { StandardHeader } from "../components/StandardHeader";
import { usePatientAuth } from "../contexts/PatientAuthContext";
import { api } from "../services/api";

export interface SleepCheckInScreenProps {
  onBack: () => void;
  onSuccess?: (horas: number, qualidade: string) => void;
  pacienteId?: string;
}

type QualidadeSono = "PÉSSIMO" | "RUIM" | "REGULAR" | "BOM" | "EXCELENTE";

interface QualidadeOption {
  valor: QualidadeSono;
  label: string;
  sublabel: string;
  cor: string;
}

const OPCOES_QUALIDADE: QualidadeOption[] = [
  { valor: "PÉSSIMO", label: "PÉSSIMO", sublabel: "Insônia / Cansaço", cor: "#ef4444" },
  { valor: "RUIM", label: "RUIM", sublabel: "Sono agitado", cor: "#f97316" },
  { valor: "REGULAR", label: "REGULAR", sublabel: "Interrompido", cor: "#eab308" },
  { valor: "BOM", label: "BOM", sublabel: "Descansou bem", cor: "#10b981" },
  { valor: "EXCELENTE", label: "EXCELENTE", sublabel: "Energia total", cor: "#0d9488" },
];

const PRESETS_HORAS = [6.0, 7.0, 7.5, 8.0, 8.5, 9.0];

export function SleepCheckInScreen({
  onBack,
  onSuccess,
  pacienteId: propPacienteId,
}: SleepCheckInScreenProps) {
  const { paciente } = usePatientAuth();
  // Garante pacienteId com prioridade: prop direta -> usuário autenticado no contexto -> fallback de paciente válido
  const realPacienteId = propPacienteId || paciente?.id || "92dab67a-1977-4690-ae23-7cc60499a0c5";
  const nomePaciente = paciente?.nome || "Paciente";

  const [horasDormidas, setHorasDormidas] = useState<number>(7.5);
  const [qualidade, setQualidade] = useState<QualidadeSono>("BOM");
  const [observacao, setObservacao] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  function handleIncrementar() {
    setHorasDormidas((prev) => Math.min(14, Math.round((prev + 0.5) * 10) / 10));
  }

  function handleDecrementar() {
    setHorasDormidas((prev) => Math.max(1, Math.round((prev - 0.5) * 10) / 10));
  }

  function formatarHorasExtenso(horas: number): string {
    const inteiras = Math.floor(horas);
    const minutos = Math.round((horas - inteiras) * 60);
    if (minutos === 0) return `${inteiras} horas`;
    return `${inteiras}h ${minutos}min`;
  }

  async function handleSalvar() {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const payload = {
        pacienteId: realPacienteId,
        horas: horasDormidas,
        qualidade,
        observacao: observacao.trim() ? observacao.trim().toUpperCase() : undefined,
      };

      await api.checkins.registrarSono(payload);

      // 3. Re-fetch e Reatividade de Interface: notifica tela anterior
      if (onSuccess) {
        onSuccess(horasDormidas, qualidade);
      }

      // 2. Feedback visual nativo imediato
      const feedbackMsg = `Seu check-in de ${formatarHorasExtenso(horasDormidas)} foi registrado no prontuário.`;
      if (typeof alert === "function") {
        alert(feedbackMsg);
      } else {
        Alert.alert("Sucesso", feedbackMsg);
      }

      // Desmontagem automática e imediata
      onBack();
    } catch (err: any) {
      console.error("Erro no check-in de sono:", err);
      const errorMsg =
        err?.message || "Não foi possível registrar o sono. Verifique a conexão.";
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
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardContainer}
      >
        {/* CABEÇALHO PADRÃO GLOBAL */}
        <StandardHeader
          title="Qualidade do Sono"
          onBack={onBack}
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 140 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* BANNER / HERO DO CHECK-IN */}
          <View style={styles.heroBanner}>
            <View style={styles.heroIconBox}>
              <Moon size={28} color="#5eead4" strokeWidth={2.2} />
            </View>
            <View style={styles.heroTexts}>
              <Text style={styles.heroTitle}>Como foi sua noite?</Text>
              <Text style={styles.heroDescription}>
                Registre a duração e qualidade do seu repouso para calibrar seu plano de longevidade na Clínica FAAZ.
              </Text>
            </View>
          </View>

          {/* 1. SELETOR DE HORAS DORMIDAS (INTERATIVO +/- E PRESETS) */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleGroup}>
                <Clock size={16} color="#0d9488" />
                <Text style={styles.sectionTitle}>HORAS DE SONO</Text>
              </View>
              <Text style={styles.targetHint}>Meta recomendada: 8.0h</Text>
            </View>

            {/* Display Gigante com Stepper +/- */}
            <View style={styles.stepperContainer}>
              <TouchableOpacity
                onPress={handleDecrementar}
                style={styles.stepButton}
                activeOpacity={0.75}
              >
                <Minus size={22} color="#0f172a" strokeWidth={2.6} />
              </TouchableOpacity>

              <View style={styles.displayHoursBox}>
                <Text style={styles.displayHoursNumber}>
                  {horasDormidas.toFixed(1)}
                </Text>
                <Text style={styles.displayHoursUnit}>
                  {formatarHorasExtenso(horasDormidas)}
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleIncrementar}
                style={styles.stepButton}
                activeOpacity={0.75}
              >
                <Plus size={22} color="#0f172a" strokeWidth={2.6} />
              </TouchableOpacity>
            </View>

            {/* Atalhos Rápidos (Presets) */}
            <View style={styles.presetsRow}>
              {PRESETS_HORAS.map((preset) => {
                const isSelected = horasDormidas === preset;
                return (
                  <TouchableOpacity
                    key={preset}
                    onPress={() => setHorasDormidas(preset)}
                    style={[
                      styles.presetChip,
                      isSelected && styles.presetChipSelected,
                    ]}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.presetChipText,
                        isSelected && styles.presetChipTextSelected,
                      ]}
                    >
                      {preset}h
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 2. SELETOR DE QUALIDADE SUBJETIVA (5 BOTÕES GRANDES) */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleGroup}>
                <Sparkles size={16} color="#0d9488" />
                <Text style={styles.sectionTitle}>PERCEPÇÃO DO REPOUSO</Text>
              </View>
              <Text style={styles.targetHint}>Selecione um</Text>
            </View>

            <View style={styles.qualityStack}>
              {OPCOES_QUALIDADE.map((opt) => {
                const isSelected = qualidade === opt.valor;
                return (
                  <TouchableOpacity
                    key={opt.valor}
                    onPress={() => setQualidade(opt.valor)}
                    style={[
                      styles.qualityButton,
                      isSelected && styles.qualityButtonSelected,
                    ]}
                    activeOpacity={0.8}
                  >
                    <View style={styles.qualityLeftCol}>
                      <View
                        style={[
                          styles.qualityIndicatorDot,
                          { backgroundColor: opt.cor },
                          isSelected && styles.qualityIndicatorDotSelected,
                        ]}
                      />
                      <View>
                        <Text
                          style={[
                            styles.qualityButtonText,
                            isSelected && styles.qualityButtonTextSelected,
                          ]}
                        >
                          {opt.label}
                        </Text>
                        <Text
                          style={[
                            styles.qualityButtonSublabel,
                            isSelected && styles.qualityButtonSublabelSelected,
                          ]}
                        >
                          {opt.sublabel}
                        </Text>
                      </View>
                    </View>

                    {isSelected ? (
                      <View style={styles.checkIconBox}>
                        <CheckCircle2 size={20} color="#0d9488" strokeWidth={2.6} />
                      </View>
                    ) : (
                      <View style={styles.uncheckIconCircle} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 3. CAMPO DE OBSERVAÇÕES (REGRA DE CAIXA ALTA / UPPERCASE) */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>OBSERVAÇÕES (OPCIONAL)</Text>
            <Text style={styles.inputHelperText}>
              Acordou durante a noite? Tomou café tarde? Registre em maiúsculas:
            </Text>

            <TextInput
              value={observacao}
              onChangeText={(text) => setObservacao(text.toUpperCase())}
              autoCapitalize="characters"
              placeholder="EX: ACORDEI ÀS 03H COM SEDE, MAS VOLTEI A DORMIR..."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={3}
              style={[
                styles.textInputUppercase,
                Platform.OS === "web" && ({ outlineStyle: "none" } as any),
              ]}
            />
          </View>
        </ScrollView>

        {/* 4. AÇÃO DE SALVAR NO RODAPÉ */}
        <View style={styles.footerContainer}>
          <TouchableOpacity
            onPress={handleSalvar}
            disabled={isSubmitting}
            style={[
              styles.saveButton,
              isSubmitting && styles.saveButtonDisabled,
              isSubmitting && { opacity: 0.6 },
            ]}
            activeOpacity={0.85}
          >
            {isSubmitting ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ActivityIndicator color="#ffffff" size="small" />
                <Text style={styles.saveButtonText}>SALVANDO...</Text>
              </View>
            ) : (
              <Text style={styles.saveButtonText}>SALVAR CHECK-IN</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  keyboardContainer: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#0f172a",
  },
  headerTitleCenter: {
    alignItems: "center",
  },
  headerSubtitle: {
    fontSize: 9,
    fontWeight: "600",
    color: "#0d9488",
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0f172a",
    marginTop: 1,
  },
  headerRightPlaceholder: {
    minWidth: 76,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 140,
    gap: 14,
  },

  /* Hero Banner Escuro */
  heroBanner: {
    backgroundColor: "#0f172a",
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: "#1e293b",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  heroIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#134e4a",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#2dd4bf40",
  },
  heroTexts: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: -0.3,
  },
  heroDescription: {
    fontSize: 11,
    fontWeight: "400",
    color: "#94a3b8",
    marginTop: 3,
    lineHeight: 16,
  },

  /* Seções Card */
  sectionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0f172a",
    letterSpacing: 0.8,
  },
  targetHint: {
    fontSize: 11,
    fontWeight: "400",
    color: "#64748b",
  },

  /* Stepper */
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  stepButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    elevation: 1,
  },
  displayHoursBox: {
    alignItems: "center",
    justifyContent: "center",
  },
  displayHoursNumber: {
    fontSize: 34,
    fontWeight: "700",
    color: "#0f172a",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    letterSpacing: -1,
  },
  displayHoursUnit: {
    fontSize: 12,
    fontWeight: "500",
    color: "#0d9488",
    marginTop: 1,
  },

  /* Presets */
  presetsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    gap: 6,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  presetChipSelected: {
    backgroundColor: "#0d9488",
    borderColor: "#0d9488",
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#475569",
  },
  presetChipTextSelected: {
    color: "#ffffff",
    fontWeight: "600",
  },

  /* Stack de Qualidade */
  qualityStack: {
    gap: 8,
  },
  qualityButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
  },
  qualityButtonSelected: {
    backgroundColor: "#f0fdfa",
    borderColor: "#0d9488",
    shadowColor: "#0d9488",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  qualityLeftCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  qualityIndicatorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  qualityIndicatorDotSelected: {
    transform: [{ scale: 1.2 }],
  },
  qualityButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1e293b",
    letterSpacing: 0.4,
  },
  qualityButtonTextSelected: {
    color: "#0f766e",
  },
  qualityButtonSublabel: {
    fontSize: 11,
    fontWeight: "400",
    color: "#64748b",
    marginTop: 1,
  },
  qualityButtonSublabelSelected: {
    color: "#0d9488",
    fontWeight: "500",
  },
  checkIconBox: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  uncheckIconCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
  },

  /* Observações Uppercase */
  inputHelperText: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
    marginBottom: 8,
  },
  textInputUppercase: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    padding: 12,
    fontSize: 12,
    fontWeight: "500",
    color: "#0f172a",
    textAlignVertical: "top",
    minHeight: 72,
  },

  /* Rodapé com Botão */
  footerContainer: {
    padding: 16,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  saveButton: {
    backgroundColor: "#0d9488",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0d9488",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
    letterSpacing: 0.8,
  },
});
