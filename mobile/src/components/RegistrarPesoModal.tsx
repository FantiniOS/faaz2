import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { Scale, X, Check } from "lucide-react-native";
import { api } from "../services/api";

export interface RegistrarPesoModalProps {
  visible: boolean;
  pacienteId: string;
  pesoAtual?: number | null;
  onClose: () => void;
  onSuccess?: (novoPeso: number, novoImc?: number | null) => void;
}

export function RegistrarPesoModal({
  visible,
  pacienteId,
  pesoAtual,
  onClose,
  onSuccess,
}: RegistrarPesoModalProps) {
  const [pesoInput, setPesoInput] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setErrorMsg(null);
      setPesoInput(
        pesoAtual && pesoAtual > 0 ? String(pesoAtual).replace(".", ",") : ""
      );
    }
  }, [visible, pesoAtual]);

  async function handleSalvar() {
    if (isSaving || !pacienteId) return;
    setErrorMsg(null);

    const parsed = parseFloat(pesoInput.replace(",", ".").trim());
    if (Number.isNaN(parsed) || parsed <= 20 || parsed >= 400) {
      setErrorMsg("Informe um peso válido entre 20 e 400 kg.");
      return;
    }

    setIsSaving(true);
    try {
      const res = await api.pacientes.registrarPesagem(pacienteId, parsed);
      const savedPeso =
        typeof res?.pesoAtual === "number" ? res.pesoAtual : parsed;
      const savedImc = typeof res?.imc === "number" ? res.imc : null;

      onSuccess?.(savedPeso, savedImc);
      onClose();

      const msg = `Peso de ${savedPeso.toFixed(1).replace(".", ",")} kg sincronizado com seu prontuário.`;
      if (Platform.OS === "web" && typeof alert === "function") {
        alert(msg);
      } else {
        Alert.alert("Peso registrado", msg);
      }
    } catch (err: any) {
      setErrorMsg(
        err?.message || "Não foi possível salvar a pesagem. Tente novamente."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconBox}>
                <Scale size={18} color="#0f766e" />
              </View>
              <View>
                <Text style={styles.title}>Registrar Peso</Text>
                <Text style={styles.subtitle}>
                  Sincronização direta com o prontuário
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={18} color="#64748b" />
            </TouchableOpacity>
          </View>

          <View style={styles.inputWrap}>
            <TextInput
              value={pesoInput}
              onChangeText={(txt) => {
                setPesoInput(txt.replace(/[^0-9.,]/g, "").slice(0, 6));
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="Ex: 74,5"
              placeholderTextColor="#94a3b8"
              keyboardType="decimal-pad"
              autoFocus
              style={styles.input}
            />
            <Text style={styles.unit}>kg</Text>
          </View>

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          <View style={styles.actionsRow}>
            <TouchableOpacity
              onPress={onClose}
              disabled={isSaving}
              style={styles.cancelBtn}
              activeOpacity={0.75}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSalvar}
              disabled={isSaving}
              style={[styles.saveBtn, isSaving && { opacity: 0.65 }]}
              activeOpacity={0.85}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Check size={16} color="#ffffff" />
                  <Text style={styles.saveText}>Salvar Peso</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.58)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#ccfbf1",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  subtitle: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  input: {
    fontSize: 38,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
    minWidth: 120,
    paddingVertical: 0,
  },
  unit: {
    fontSize: 18,
    fontWeight: "600",
    color: "#64748b",
    marginLeft: 6,
  },
  errorText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#e11d48",
    textAlign: "center",
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
  saveBtn: {
    flex: 1.4,
    flexDirection: "row",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
});
