import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  X,
  ArrowLeftRight,
  Check,
  RotateCcw,
  ShieldCheck,
} from "lucide-react-native";
import { ItemRefeicaoApi, SubstituicaoPrescritaItem } from "../services/api";
import { FoodThumbnail } from "./FoodThumbnail";
import { formatQuantidadeMedida } from "../utils/dietaHelpers";

export interface TrocasModalProps {
  visible: boolean;
  item: ItemRefeicaoApi | null;
  substituicaoAtivaId: string | null;
  onSelectSubstituicao: (substituicaoId: string | null) => void;
  onClose: () => void;
}

export function TrocasModal({
  visible,
  item,
  substituicaoAtivaId,
  onSelectSubstituicao,
  onClose,
}: TrocasModalProps) {
  const insets = useSafeAreaInsets();

  if (!item) return null;

  const nomeOriginal = (item.alimento?.nome || "Alimento prescrito").trim();
  const medidaOriginal = formatQuantidadeMedida(
    item.quantidadeGramas,
    item.unidade,
    item.medidaCaseira
  );
  const substituicoes: SubstituicaoPrescritaItem[] = Array.isArray(
    item.substituicoes
  )
    ? [...item.substituicoes].sort(
        (a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0)
      )
    : [];

  const bottomPadding = Math.max(insets.bottom + 16, 24);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={[styles.sheet, { paddingBottom: bottomPadding }]}>
          {/* Cabeçalho escuro executivo do Bottom Sheet */}
          <View style={styles.sheetHeader}>
            <View style={styles.handleBar} />

            <View style={styles.headerTopRow}>
              <View style={styles.headerTitleCol}>
                <View style={styles.kickerRow}>
                  <ArrowLeftRight size={12} color="#2dd4bf" />
                  <Text style={styles.kickerText}>TROCAS PRESCRITAS</Text>
                </View>
                <Text style={styles.titleText} numberOfLines={2}>
                  Substituir: {nomeOriginal}
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.75}
                onPress={onClose}
                style={styles.closeBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Fechar trocas"
              >
                <X size={18} color="#cbd5e1" />
              </TouchableOpacity>
            </View>

            {/* Chip com medida original */}
            <View style={styles.originalChipRow}>
              <Text style={styles.originalChipLabel}>Original:</Text>
              <Text style={styles.originalChipValue} numberOfLines={1}>
                {medidaOriginal}
              </Text>
            </View>

            {/* Garantia clínica de equivalência */}
            <View style={styles.guaranteeRow}>
              <ShieldCheck size={13} color="#2dd4bf" />
              <Text style={styles.guaranteeText}>
                Todas as opções abaixo mantêm 100% da sua meta
              </Text>
            </View>
          </View>

          {/* Lista rolável de substituições */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Opção para restaurar o alimento original caso já esteja trocado */}
            {substituicaoAtivaId ? (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  onSelectSubstituicao(null);
                  onClose();
                }}
                style={styles.restoreCard}
              >
                <FoodThumbnail
                  nome={nomeOriginal}
                  categoria={item.alimento?.categoria}
                  imageUrl={item.alimento?.thumbnailUrl}
                  size={44}
                  style={styles.thumbRounded}
                />
                <View style={styles.optionTextCol}>
                  <Text style={styles.restoreLabel}>
                    Restaurar alimento original
                  </Text>
                  <Text style={styles.optionName} numberOfLines={1}>
                    {nomeOriginal}
                  </Text>
                  <Text style={styles.optionMeasure} numberOfLines={1}>
                    {medidaOriginal}
                  </Text>
                </View>
                <View style={styles.restoreIconPill}>
                  <RotateCcw size={15} color="#0f766e" />
                </View>
              </TouchableOpacity>
            ) : null}

            {substituicoes.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  Nenhuma substituição cadastrada para este alimento.
                </Text>
              </View>
            ) : (
              substituicoes.map((sub) => {
                const isSelected = substituicaoAtivaId === sub.id;
                const medidaTexto = formatQuantidadeMedida(
                  sub.quantidade,
                  sub.unidade,
                  sub.medidaCaseira
                );

                return (
                  <TouchableOpacity
                    key={sub.id}
                    activeOpacity={0.82}
                    onPress={() => {
                      onSelectSubstituicao(sub.id);
                      onClose();
                    }}
                    style={[
                      styles.optionCard,
                      isSelected && styles.optionCardSelected,
                    ]}
                  >
                    <FoodThumbnail
                      nome={sub.nomeExibicao}
                      categoria={sub.categoria}
                      imageUrl={sub.thumbnailUrl}
                      size={48}
                      style={styles.thumbRounded}
                    />

                    <View style={styles.optionTextCol}>
                      <Text style={styles.optionName} numberOfLines={2}>
                        {sub.nomeExibicao}
                      </Text>
                      <Text
                        style={[
                          styles.optionMeasure,
                          isSelected && styles.optionMeasureSelected,
                        ]}
                        numberOfLines={2}
                      >
                        {medidaTexto}
                      </Text>
                      {typeof sub.caloriasPorcao === "number" &&
                      sub.caloriasPorcao > 0 ? (
                        <Text style={styles.optionKcal}>
                          ~{Math.round(sub.caloriasPorcao)} kcal
                        </Text>
                      ) : null}
                    </View>

                    {isSelected ? (
                      <View style={styles.selectedCheckPill}>
                        <Check size={15} color="#ffffff" strokeWidth={2.8} />
                      </View>
                    ) : (
                      <View style={styles.selectActionPill}>
                        <Text style={styles.selectActionText}>Usar</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(15, 23, 42, 0.56)",
  },
  sheet: {
    backgroundColor: "#f8fafc",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "82%",
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 16,
  },
  sheetHeader: {
    backgroundColor: "#0f172a",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  handleBar: {
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(148, 163, 184, 0.4)",
    alignSelf: "center",
    marginBottom: 12,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTitleCol: {
    flex: 1,
  },
  kickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  kickerText: {
    color: "#2dd4bf",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  titleText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  originalChipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    backgroundColor: "rgba(30, 41, 59, 0.9)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.2)",
  },
  originalChipLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
  },
  originalChipValue: {
    color: "#f1f5f9",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  guaranteeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  guaranteeText: {
    color: "#99f6e4",
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
  },
  scrollArea: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 10,
  },
  restoreCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#f0fdfa",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#99f6e4",
  },
  restoreLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0f766e",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  restoreIconPill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#ccfbf1",
    alignItems: "center",
    justifyContent: "center",
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  optionCardSelected: {
    backgroundColor: "#f0fdfa",
    borderColor: "#0d9488",
    borderWidth: 1.5,
  },
  thumbRounded: {
    borderRadius: 11,
  },
  optionTextCol: {
    flex: 1,
  },
  optionName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    lineHeight: 19,
  },
  optionMeasure: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f766e",
    marginTop: 2,
  },
  optionMeasureSelected: {
    color: "#0d9488",
  },
  optionKcal: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  selectedCheckPill: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#0d9488",
    alignItems: "center",
    justifyContent: "center",
  },
  selectActionPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  selectActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
  },
  emptyBox: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
  },
});
