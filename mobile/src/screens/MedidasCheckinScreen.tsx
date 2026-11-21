import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ruler, Send, CheckCircle2, AlertTriangle } from "lucide-react-native";
import { StandardHeader } from "../components/StandardHeader";
import { usePatientAuth } from "../contexts/PatientAuthContext";
import { api, MeasurementItem, RegistrarMedidaPayload } from "../services/api";
import { formatarDataBR } from "../utils/dateBr";

export interface MedidasCheckinScreenProps {
  pacienteId?: string;
  onBack: () => void;
  onSuccess?: (created: MeasurementItem) => void;
}

type NumericFieldKey =
  | "waist"
  | "abdomen"
  | "hips"
  | "rightArm"
  | "leftArm"
  | "rightThigh"
  | "leftThigh";

interface FieldConfig {
  key: NumericFieldKey;
  label: string;
  unit: "cm";
  placeholder: string;
  min: number;
  max: number;
  group: "tronco" | "membros";
  fullWidth?: boolean;
}

const FIELDS: FieldConfig[] = [
  {
    key: "waist",
    label: "Cintura",
    unit: "cm",
    placeholder: "78,0",
    min: 15,
    max: 300,
    group: "tronco",
  },
  {
    key: "abdomen",
    label: "Abdômen",
    unit: "cm",
    placeholder: "84,5",
    min: 15,
    max: 300,
    group: "tronco",
  },
  {
    key: "hips",
    label: "Quadril",
    unit: "cm",
    placeholder: "98,0",
    min: 15,
    max: 300,
    group: "tronco",
    fullWidth: true,
  },
  {
    key: "rightArm",
    label: "Braço Direito",
    unit: "cm",
    placeholder: "32,0",
    min: 8,
    max: 120,
    group: "membros",
  },
  {
    key: "leftArm",
    label: "Braço Esquerdo",
    unit: "cm",
    placeholder: "31,8",
    min: 8,
    max: 120,
    group: "membros",
  },
  {
    key: "rightThigh",
    label: "Coxa Direita",
    unit: "cm",
    placeholder: "56,0",
    min: 15,
    max: 200,
    group: "membros",
  },
  {
    key: "leftThigh",
    label: "Coxa Esquerda",
    unit: "cm",
    placeholder: "55,8",
    min: 15,
    max: 200,
    group: "membros",
  },
];

type FormState = Record<NumericFieldKey, string> & { notes: string };

const INITIAL_FORM: FormState = {
  waist: "",
  abdomen: "",
  hips: "",
  rightArm: "",
  leftArm: "",
  rightThigh: "",
  leftThigh: "",
  notes: "",
};

function formatBr(val: number | null | undefined, unit: string): string {
  if (val === null || val === undefined) return "--";
  return `${Number(val).toFixed(1).replace(".", ",")} ${unit}`;
}

export function MedidasCheckinScreen({
  pacienteId,
  onBack,
  onSuccess,
}: MedidasCheckinScreenProps) {
  const { paciente } = usePatientAuth();
  const insets = useSafeAreaInsets();
  const realPacienteId = pacienteId || paciente?.id || "";

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [ultimaMedicao, setUltimaMedicao] = useState<MeasurementItem | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (!realPacienteId) return;
    let mounted = true;
    api.pacientes
      .getMedidas(realPacienteId)
      .then((res) => {
        if (mounted && Array.isArray(res?.measurements) && res.measurements.length > 0) {
          setUltimaMedicao(res.measurements[0]);
        }
      })
      .catch(() => {
        // Opcional — segue normalmente sem bloqueio
      });
    return () => {
      mounted = false;
    };
  }, [realPacienteId]);

  function handleFieldChange(key: NumericFieldKey, value: string) {
    const sanitized = value.replace(/[^0-9.,]/g, "").slice(0, 6);
    setForm((prev) => ({ ...prev, [key]: sanitized }));
    if (errorMsg) setErrorMsg(null);
  }

  async function handleSalvar() {
    if (isSubmitting || !realPacienteId) return;
    setErrorMsg(null);

    const payload: RegistrarMedidaPayload = {};
    let filledCount = 0;

    for (const field of FIELDS) {
      const raw = form[field.key].trim();
      if (!raw) continue;
      const parsed = Number(raw.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < field.min || parsed > field.max) {
        setErrorMsg(
          `${field.label} deve estar entre ${field.min} e ${field.max} ${field.unit}.`
        );
        return;
      }
      payload[field.key] = Math.round(parsed * 100) / 100;
      filledCount += 1;
    }

    if (filledCount === 0) {
      setErrorMsg("Preencha pelo menos uma circunferência antes de salvar.");
      return;
    }

    const trimmedNotes = form.notes.trim();
    if (trimmedNotes.length > 255) {
      setErrorMsg("Observação deve ter no máximo 255 caracteres.");
      return;
    }
    if (trimmedNotes) {
      payload.notes = trimmedNotes;
    }

    setIsSubmitting(true);
    try {
      const res = await api.pacientes.registrarMedida(realPacienteId, payload);
      if (res?.measurement) {
        onSuccess?.(res.measurement);
      }

      const feedback = "Circunferências sincronizadas com o seu prontuário.";
      if (Platform.OS === "web" && typeof alert === "function") {
        alert(feedback);
      } else {
        Alert.alert("Medidas registradas", feedback);
      }
      onBack();
    } catch (err: any) {
      setErrorMsg(
        err?.message || "Não foi possível salvar suas medidas. Verifique a conexão."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const troncoFields = FIELDS.filter((f) => f.group === "tronco");
  const membrosFields = FIELDS.filter((f) => f.group === "membros");
  const bottomSpacer = Math.max(insets.bottom + 64, 92);

  function renderFieldGrid(items: FieldConfig[]) {
    return (
      <View style={styles.grid}>
        {items.map((field) => {
          const prevVal = ultimaMedicao?.[field.key];
          return (
            <View
              key={field.key}
              style={[
                styles.fieldCard,
                field.fullWidth && styles.fieldCardFull,
              ]}
            >
              <View style={styles.fieldHeader}>
                <Text style={styles.fieldLabel} numberOfLines={1}>
                  {field.label}
                </Text>
              </View>
              <View style={styles.inputRow}>
                <TextInput
                  value={form[field.key]}
                  onChangeText={(txt) => handleFieldChange(field.key, txt)}
                  placeholder={field.placeholder}
                  placeholderTextColor="#94a3b8"
                  keyboardType="decimal-pad"
                  style={styles.numericInput}
                />
                <Text style={styles.unitTag}>{field.unit}</Text>
              </View>
              <Text style={styles.prevHint}>
                {prevVal !== null && prevVal !== undefined
                  ? `Anterior: ${formatBr(prevVal, field.unit)}`
                  : "Opcional"}
              </Text>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StandardHeader title="Registrar Medidas" onBack={onBack} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomSpacer },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Banner explicativo */}
        <View style={styles.infoBanner}>
          <View style={styles.infoIconBox}>
            <Ruler size={18} color="#0f766e" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Circunferências Corporais</Text>
            <Text style={styles.infoText}>
              Preencha apenas as medidas aferidas hoje com fita métrica. Campos
              vazios são ignorados e não substituem registros anteriores.
            </Text>
          </View>
        </View>

        {ultimaMedicao ? (
          <View style={styles.lastRecordPill}>
            <CheckCircle2 size={14} color="#0f766e" />
            <Text style={styles.lastRecordText}>
              Última aferição em {formatarDataBR(ultimaMedicao.measuredAt)}
            </Text>
          </View>
        ) : null}

        {/* Bloco 1: Tronco (Fita Métrica) */}
        <Text style={styles.sectionTitle}>Tronco (Fita Métrica)</Text>
        {renderFieldGrid(troncoFields)}

        {/* Bloco 2: Membros */}
        <Text style={styles.sectionTitle}>Membros</Text>
        {renderFieldGrid(membrosFields)}

        {/* Observação opcional */}
        <View style={styles.notesCard}>
          <Text style={styles.notesLabel}>Observação (opcional)</Text>
          <TextInput
            value={form.notes}
            onChangeText={(txt) => {
              setForm((prev) => ({ ...prev, notes: txt.slice(0, 255) }));
              if (errorMsg) setErrorMsg(null);
            }}
            placeholder="Ex: Aferido pela manhã em jejum com fita métrica"
            placeholderTextColor="#94a3b8"
            multiline
            numberOfLines={2}
            style={styles.notesInput}
          />
          <Text style={styles.charCount}>{form.notes.length}/255</Text>
        </View>

        {errorMsg ? (
          <View style={styles.errorBox}>
            <AlertTriangle size={15} color="#be123c" />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleSalvar}
          disabled={isSubmitting}
          style={[styles.submitButton, isSubmitting && { opacity: 0.65 }]}
        >
          {isSubmitting ? (
            <>
              <ActivityIndicator size="small" color="#ffffff" />
              <Text style={styles.submitText}>Salvando medidas...</Text>
            </>
          ) : (
            <>
              <Send size={16} color="#ffffff" />
              <Text style={styles.submitText}>Salvar Medidas</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
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
    padding: 16,
    gap: 14,
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  infoIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#ccfbf1",
    alignItems: "center",
    justifyContent: "center",
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 2,
  },
  infoText: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 17,
  },
  lastRecordPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#ccfbf1",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  lastRecordText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0f766e",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginTop: 2,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  fieldCard: {
    width: "48.3%",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  fieldCardFull: {
    width: "100%",
  },
  fieldHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1e293b",
    flex: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  numericInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    paddingVertical: 0,
  },
  unitTag: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginLeft: 4,
  },
  prevHint: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 5,
  },
  notesCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 8,
  },
  notesInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    color: "#0f172a",
    textAlignVertical: "top",
    minHeight: 60,
  },
  charCount: {
    fontSize: 10,
    color: "#94a3b8",
    textAlign: "right",
    marginTop: 6,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#be123c",
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0f766e",
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 4,
    shadowColor: "#0f766e",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
});

export default MedidasCheckinScreen;
