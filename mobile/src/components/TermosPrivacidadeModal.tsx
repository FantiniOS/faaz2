import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Platform,
  Alert,
} from "react-native";
import {
  ShieldCheck,
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  LogOut,
  X,
} from "lucide-react-native";
import { api } from "../services/api";
import {
  AVISO_EMERGENCIA_TERMOS,
  DATA_VIGENCIA_TERMOS,
  SECOES_TERMOS_PRIVACIDADE,
  URL_PRIVACIDADE_WEB,
  VERSAO_ATUAL_TERMOS,
} from "../constants/termosPrivacidade";
import { formatarDataHoraBR } from "../utils/dateBr";

export interface TermosPrivacidadeModalProps {
  visible: boolean;
  mode: "aceite" | "leitura";
  pacienteId?: string;
  termosVersaoAceita?: string | null;
  termosAceitoEm?: string | null;
  onAccepted?: (versao: string, aceitoEm: string) => Promise<void> | void;
  onLogout?: () => Promise<void> | void;
  onClose?: () => void;
}

function formatDataHoraAceiteLocal(iso?: string | null): string | null {
  return formatarDataHoraBR(iso);
}

export function TermosPrivacidadeModal({
  visible,
  mode,
  pacienteId,
  termosVersaoAceita,
  termosAceitoEm,
  onAccepted,
  onLogout,
  onClose,
}: TermosPrivacidadeModalProps) {
  const [concordou, setConcordou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setConcordou(false);
      setErro(null);
      setSalvando(false);
    }
  }, [visible, mode]);

  const dataHoraAceiteLabel = formatDataHoraAceiteLocal(termosAceitoEm);

  const handleAceitar = async () => {
    if (!concordou || !pacienteId || salvando) return;
    setErro(null);
    setSalvando(true);
    try {
      const res = await api.pacientes.aceitarTermos(
        pacienteId,
        VERSAO_ATUAL_TERMOS
      );
      if (res?.success) {
        const versaoFinal = res.versao || VERSAO_ATUAL_TERMOS;
        const aceitoEmFinal = res.aceitoEm || new Date().toISOString();
        await onAccepted?.(versaoFinal, aceitoEmFinal);
      } else {
        setErro(
          res?.error ||
            "Não foi possível registrar seu aceite agora. Tente novamente."
        );
      }
    } catch (err: any) {
      setErro(
        err?.message ||
          "Erro de conexão ao registrar o aceite dos termos. Tente novamente."
      );
    } finally {
      setSalvando(false);
    }
  };

  const handleAbrirVersaoWeb = async () => {
    try {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.open(URL_PRIVACIDADE_WEB, "_blank");
        return;
      }
      await Linking.openURL(URL_PRIVACIDADE_WEB);
    } catch {
      Alert.alert(
        "Versão Web",
        `Acesse pelo navegador: ${URL_PRIVACIDADE_WEB}`
      );
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      transparent={false}
      onRequestClose={() => {
        if (mode === "leitura" && !salvando) {
          onClose?.();
        }
      }}
    >
      <View style={styles.root}>
        {/* CABEÇALHO EXECUTIVO */}
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerIconBox}>
              <ShieldCheck size={18} color="#2dd4bf" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>
                {mode === "aceite"
                  ? "Antes de começar — Termos & Privacidade"
                  : "Termos de Uso e Privacidade"}
              </Text>
              <Text style={styles.headerSubtitle}>
                Clínica FAAZ · Versão {VERSAO_ATUAL_TERMOS} ·{" "}
                {DATA_VIGENCIA_TERMOS}
              </Text>
            </View>

            {mode === "leitura" ? (
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={onClose}
                style={styles.headerCloseBtn}
                accessibilityLabel="Fechar"
              >
                <X size={18} color="#e2e8f0" />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* PÍLULA DE COMPROVAÇÃO NO MODO LEITURA */}
          {mode === "leitura" && termosVersaoAceita ? (
            <View style={styles.proofPill}>
              <CheckCircle2 size={13} color="#34d399" />
              <Text style={styles.proofPillText}>
                {dataHoraAceiteLabel
                  ? `✓ Aceito em ${dataHoraAceiteLabel} · Versão ${termosVersaoAceita}`
                  : `✓ Aceito · Versão ${termosVersaoAceita}`}
              </Text>
            </View>
          ) : null}
        </View>

        {/* CORPO ROLÁVEL */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
          {/* CAIXA DE DESTAQUE — NÃO-URGÊNCIA / EMERGÊNCIA */}
          <View style={styles.emergencyBox}>
            <View style={styles.emergencyHeader}>
              <View style={styles.emergencyIconWrap}>
                <AlertTriangle size={15} color="#be123c" />
              </View>
              <Text style={styles.emergencyTitle}>
                Não substitui urgência ou emergência
              </Text>
              <View style={styles.samuBadge}>
                <Text style={styles.samuBadgeText}>SAMU 192</Text>
              </View>
            </View>
            <Text style={styles.emergencyText}>
              {AVISO_EMERGENCIA_TERMOS.resumoCurto}
            </Text>
          </View>

          {/* SEÇÕES COMPLETAS (PARIDADE COM /privacidade) */}
          {SECOES_TERMOS_PRIVACIDADE.map((secao) => (
            <View key={secao.id} style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View
                  style={[
                    styles.sectionNumberBadge,
                    secao.destaque === "emergencia" &&
                      styles.sectionNumberBadgeRose,
                  ]}
                >
                  <Text
                    style={[
                      styles.sectionNumberText,
                      secao.destaque === "emergencia" &&
                        styles.sectionNumberTextRose,
                    ]}
                  >
                    {secao.numero}
                  </Text>
                </View>
                <Text style={styles.sectionTitle}>{secao.titulo}</Text>
              </View>

              <View style={styles.sectionBody}>
                {secao.paragrafos.map((p, idx) => (
                  <Text key={idx} style={styles.sectionParagraph}>
                    {p}
                  </Text>
                ))}

                {secao.topicos && secao.topicos.length > 0 ? (
                  <View style={styles.topicsList}>
                    {secao.topicos.map((topico, idx) => (
                      <View key={idx} style={styles.topicItem}>
                        <View style={styles.topicDot} />
                        <Text style={styles.topicText}>{topico}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>

        {/* RODAPÉ FIXO CONFORME MODO */}
        {mode === "aceite" ? (
          <View style={styles.footer}>
            {erro ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{erro}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              activeOpacity={0.78}
              disabled={salvando}
              onPress={() => {
                setConcordou((prev) => !prev);
                if (erro) setErro(null);
              }}
              style={[
                styles.checkboxRow,
                concordou && styles.checkboxRowChecked,
              ]}
            >
              <View
                style={[styles.checkboxBox, concordou && styles.checkboxBoxOn]}
              >
                {concordou ? <Check size={13} color="#ffffff" /> : null}
              </View>
              <Text style={styles.checkboxLabel}>
                Li e concordo com os Termos de Uso e a Política de Privacidade
                (v{VERSAO_ATUAL_TERMOS})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              disabled={!concordou || salvando}
              onPress={() => void handleAceitar()}
              style={[
                styles.acceptBtn,
                (!concordou || salvando) && styles.acceptBtnDisabled,
              ]}
            >
              {salvando ? (
                <>
                  <ActivityIndicator size="small" color="#ffffff" />
                  <Text style={styles.acceptBtnText}>Registrando aceite...</Text>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} color="#ffffff" />
                  <Text style={styles.acceptBtnText}>Aceitar e Continuar</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.72}
              disabled={salvando}
              onPress={() => void onLogout?.()}
              style={styles.logoutLinkBtn}
            >
              <LogOut size={13} color="#64748b" />
              <Text style={styles.logoutLinkText}>Sair / Trocar Paciente</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.footer}>
            <TouchableOpacity
              activeOpacity={0.76}
              onPress={() => void handleAbrirVersaoWeb()}
              style={styles.webLinkBtn}
            >
              <ExternalLink size={14} color="#0f766e" />
              <Text style={styles.webLinkText}>
                Abrir versão web (faaz2.vercel.app/privacidade)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.82}
              onPress={onClose}
              style={styles.closeFooterBtn}
            >
              <Text style={styles.closeFooterBtnText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    backgroundColor: "#0f172a",
    paddingTop: Platform.OS === "ios" ? 54 : 22,
    paddingBottom: 16,
    paddingHorizontal: 18,
    gap: 10,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(45, 212, 191, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(45, 212, 191, 0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 15.5,
    fontWeight: "800",
    color: "#ffffff",
    lineHeight: 20,
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: "#94a3b8",
    marginTop: 2,
    fontWeight: "500",
  },
  headerCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  proofPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: "rgba(16, 185, 129, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.35)",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  proofPillText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#a7f3d0",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 26,
    gap: 12,
  },
  emergencyBox: {
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fda4af",
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  emergencyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  emergencyIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "#ffe4e6",
    alignItems: "center",
    justifyContent: "center",
  },
  emergencyTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#881337",
    flex: 1,
  },
  samuBadge: {
    backgroundColor: "#e11d48",
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 999,
  },
  samuBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.4,
  },
  emergencyText: {
    fontSize: 12.5,
    lineHeight: 18.5,
    color: "#334155",
    fontWeight: "600",
  },
  sectionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionNumberBadge: {
    width: 25,
    height: 25,
    borderRadius: 8,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionNumberBadgeRose: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
  },
  sectionNumberText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#047857",
  },
  sectionNumberTextRose: {
    color: "#be123c",
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#0f172a",
    flex: 1,
    lineHeight: 18,
  },
  sectionBody: {
    gap: 8,
  },
  sectionParagraph: {
    fontSize: 12.5,
    lineHeight: 19,
    color: "#475569",
  },
  topicsList: {
    gap: 7,
    marginTop: 2,
  },
  topicItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  topicDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#059669",
    marginTop: 6.5,
  },
  topicText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: "#334155",
  },
  footer: {
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    gap: 10,
  },
  errorBox: {
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  errorText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#be123c",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  checkboxRowChecked: {
    backgroundColor: "#ecfdf5",
    borderColor: "#6ee7b7",
  },
  checkboxBox: {
    width: 21,
    height: 21,
    borderRadius: 6,
    borderWidth: 1.8,
    borderColor: "#94a3b8",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxBoxOn: {
    borderColor: "#059669",
    backgroundColor: "#059669",
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: "700",
    color: "#0f172a",
    lineHeight: 17.5,
  },
  acceptBtn: {
    height: 46,
    borderRadius: 12,
    backgroundColor: "#059669",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  acceptBtnDisabled: {
    backgroundColor: "#94a3b8",
  },
  acceptBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff",
  },
  logoutLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
  },
  logoutLinkText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#64748b",
  },
  webLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#99f6e4",
  },
  webLinkText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f766e",
  },
  closeFooterBtn: {
    height: 44,
    borderRadius: 12,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  closeFooterBtnText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#ffffff",
  },
});

export default TermosPrivacidadeModal;
