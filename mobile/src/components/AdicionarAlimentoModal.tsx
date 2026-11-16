import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Search, X, Plus, Flame, Check, Sparkles } from "lucide-react-native";
import api from "../services/api";
import { FoodThumbnail } from "./FoodThumbnail";

export interface AlimentoBuscaOption {
  id: string;
  nome: string;
  porcaoBase: number;
  calorias: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  categoria?: string | null;
  fonte?: string | null;
}

interface AdicionarAlimentoModalProps {
  visible: boolean;
  refeicaoNome?: string;
  onClose: () => void;
  onConfirm: (alimento: AlimentoBuscaOption, gramas: number) => void;
}

export function AdicionarAlimentoModal({
  visible,
  refeicaoNome = "Refeição",
  onClose,
  onConfirm,
}: AdicionarAlimentoModalProps) {
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [resultados, setResultados] = useState<AlimentoBuscaOption[]>([]);
  const [alimentoSelecionado, setAlimentoSelecionado] = useState<AlimentoBuscaOption | null>(null);
  const [gramas, setGramas] = useState<string>("100");

  const executarBusca = useCallback(async (termo: string) => {
    try {
      setCarregando(true);
      const res = await api.alimentos.buscar(termo);
      if (res?.sucesso && Array.isArray(res?.alimentos)) {
        setResultados(res.alimentos);
      } else if (Array.isArray(res?.alimentos)) {
        setResultados(res.alimentos);
      } else {
        setResultados([]);
      }
    } catch (err) {
      console.log("[AdicionarAlimentoModal] Erro ao buscar alimentos:", err);
      setResultados([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  // Debounce de 300ms na digitação
  useEffect(() => {
    if (!visible) return;

    const timer = setTimeout(() => {
      executarBusca(busca);
    }, 300);

    return () => clearTimeout(timer);
  }, [busca, visible, executarBusca]);

  // Carrega lista inicial de alimentos ao abrir o modal
  useEffect(() => {
    if (visible) {
      setBusca("");
      setAlimentoSelecionado(null);
      setGramas("100");
      executarBusca("");
    }
  }, [visible, executarBusca]);

  const gramasNum = parseFloat(gramas.replace(",", ".")) || 0;
  const caloriasCalculadas = alimentoSelecionado
    ? Math.round((gramasNum / 100) * alimentoSelecionado.calorias)
    : 0;

  function handleConfirmar() {
    if (!alimentoSelecionado || gramasNum <= 0) return;
    onConfirm(alimentoSelecionado, gramasNum);
    onClose();
  }

  function handleIncrementarGramas(valor: number) {
    const atual = parseFloat(gramas.replace(",", ".")) || 0;
    setGramas(String(Math.max(5, atual + valor)));
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.sheetContainer}>
          {/* BARRA SUPERIOR E CABEÇALHO */}
          <View style={styles.dragIndicator} />
          
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>Adicionar ao Diário</Text>
              <Text style={styles.headerSubtitle}>{refeicaoNome} • Tabela TACO</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              activeOpacity={0.7}
            >
              <X size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* CAMPO DE BUSCA IDÊNTICO AO PAINEL MÉDICO */}
          <View style={styles.searchBox}>
            <Search size={18} color="#94a3b8" style={styles.searchIcon} />
            <TextInput
              value={busca}
              onChangeText={(t) => {
                setBusca(t);
                if (alimentoSelecionado) setAlimentoSelecionado(null);
              }}
              placeholder="Buscar alimento (ex: banana, arroz, frango, ovo)..."
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {busca.length > 0 && (
              <TouchableOpacity
                onPress={() => setBusca("")}
                style={styles.clearSearchBtn}
              >
                <X size={15} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>

          {/* PAINEL DE SELEÇÃO E QUANTIDADE (QUANDO ALIMENTO FOI SELECIONADO) */}
          {alimentoSelecionado ? (
            <View style={styles.selectedFoodCard}>
              <View style={styles.selectedFoodHeader}>
                <FoodThumbnail
                  nome={alimentoSelecionado.nome}
                  categoria={alimentoSelecionado.categoria}
                  size={46}
                />
                <View style={styles.selectedFoodTexts}>
                  <Text style={styles.selectedFoodName} numberOfLines={2}>
                    {alimentoSelecionado.nome}
                  </Text>
                  <Text style={styles.selectedFoodCategory}>
                    {alimentoSelecionado.categoria || "Geral"} • {alimentoSelecionado.calorias} kcal / 100g
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setAlimentoSelecionado(null)}
                  style={styles.changeSelectionBtn}
                >
                  <Text style={styles.changeSelectionText}>Trocar</Text>
                </TouchableOpacity>
              </View>

              {/* SELETOR DE QUANTIDADE EM GRAMAS */}
              <View style={styles.portionControlBox}>
                <Text style={styles.portionLabel}>Quantidade consumida (gramas):</Text>
                <View style={styles.portionInputRow}>
                  <TextInput
                    value={gramas}
                    onChangeText={setGramas}
                    keyboardType="numeric"
                    style={styles.portionInput}
                    maxLength={5}
                  />
                  <Text style={styles.portionUnitLabel}>gramas</Text>

                  {/* Calorias Calculadas em Tempo Real */}
                  <View style={styles.calcCaloriesBadge}>
                    <Flame size={14} color="#ea580c" />
                    <Text style={styles.calcCaloriesText}>
                      {caloriasCalculadas} kcal
                    </Text>
                  </View>
                </View>

                {/* Botões de Ajuste Rápido */}
                <View style={styles.quickAddRow}>
                  {[50, 100, 150, 200].map((qtd) => (
                    <TouchableOpacity
                      key={qtd}
                      onPress={() => setGramas(String(qtd))}
                      style={[
                        styles.quickAddBtn,
                        gramas === String(qtd) && styles.quickAddBtnActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.quickAddText,
                          gramas === String(qtd) && styles.quickAddTextActive,
                        ]}
                      >
                        {qtd}g
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => handleIncrementarGramas(25)}
                    style={styles.quickAddBtn}
                  >
                    <Text style={styles.quickAddText}>+25g</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* BOTÃO CONFIRMAR ADIÇÃO */}
              <TouchableOpacity
                onPress={handleConfirmar}
                style={styles.confirmButton}
                activeOpacity={0.85}
              >
                <Check size={18} color="#ffffff" strokeWidth={2.5} />
                <Text style={styles.confirmButtonText}>
                  ADICIONAR À REFEIÇÃO ({caloriasCalculadas} KCAL)
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* LISTA DE RESULTADOS DA BUSCA */
            <View style={styles.resultsContainer}>
              {carregando ? (
                <View style={styles.centerStateBox}>
                  <ActivityIndicator size="small" color="#0f766e" />
                  <Text style={styles.loadingText}>Buscando alimentos...</Text>
                </View>
              ) : resultados.length === 0 ? (
                <View style={styles.centerStateBox}>
                  <Text style={styles.emptyTitle}>Nenhum alimento encontrado para esta busca.</Text>
                  <Text style={styles.emptySubtitle}>
                    Tente termos mais simples como &quot;arroz&quot;, &quot;frango&quot;, &quot;banana&quot; ou &quot;ovo&quot;.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={resultados}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.listContent}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => setAlimentoSelecionado(item)}
                      style={styles.foodRow}
                      activeOpacity={0.7}
                    >
                      <FoodThumbnail
                        nome={item.nome}
                        categoria={item.categoria}
                        size={40}
                      />
                      <View style={styles.foodRowTexts}>
                        <Text style={styles.foodRowName} numberOfLines={1}>
                          {item.nome}
                        </Text>
                        <Text style={styles.foodRowCategory}>
                          {item.categoria || "Geral"} • {item.calorias} kcal / 100g
                        </Text>
                      </View>
                      <View style={styles.selectPlusBtn}>
                        <Plus size={16} color="#0f766e" />
                      </View>
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    maxHeight: "88%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    backgroundColor: "#cbd5e1",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0f766e",
    marginTop: 1,
  },
  closeButton: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 14,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: "#0f172a",
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 4,
  },
  resultsContainer: {
    height: 380,
  },
  listContent: {
    paddingBottom: 20,
  },
  centerStateBox: {
    paddingVertical: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: "#64748b",
    fontWeight: "600",
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 6,
    paddingHorizontal: 24,
  },
  foodRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    borderRadius: 10,
  },
  foodRowTexts: {
    flex: 1,
    marginLeft: 12,
  },
  foodRowName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  foodRowCategory: {
    fontSize: 11,
    fontWeight: "500",
    color: "#64748b",
    marginTop: 2,
  },
  selectPlusBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#ccfbf1",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedFoodCard: {
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#99f6e4",
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  selectedFoodHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  selectedFoodTexts: {
    flex: 1,
    marginLeft: 12,
  },
  selectedFoodName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  selectedFoodCategory: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0f766e",
    marginTop: 2,
  },
  changeSelectionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#99f6e4",
  },
  changeSelectionText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0f766e",
  },
  portionControlBox: {
    marginTop: 16,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  portionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 8,
  },
  portionInputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  portionInput: {
    width: 80,
    height: 40,
    borderWidth: 1.5,
    borderColor: "#0f766e",
    borderRadius: 10,
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
    backgroundColor: "#f8fafc",
  },
  portionUnitLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
    marginLeft: 8,
  },
  calcCaloriesBadge: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  calcCaloriesText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ea580c",
  },
  quickAddRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
    flexWrap: "wrap",
  },
  quickAddBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  quickAddBtnActive: {
    backgroundColor: "#0f766e",
    borderColor: "#0f766e",
  },
  quickAddText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
  },
  quickAddTextActive: {
    color: "#ffffff",
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0f766e",
    borderRadius: 14,
    height: 48,
    marginTop: 14,
    shadowColor: "#0f766e",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  confirmButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
});
