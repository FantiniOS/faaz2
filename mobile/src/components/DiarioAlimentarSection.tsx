import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import {
  Coffee,
  Sun,
  Apple,
  Moon,
  Utensils,
  Plus,
  CheckCircle2,
  Circle,
  Flame,
  Trash2,
  Clock,
  Sparkles,
  RefreshCw,
} from "lucide-react-native";
import { useDiarioAlimentar, RefeicaoDiario } from "../contexts/DiarioAlimentarContext";
import { FoodThumbnail } from "./FoodThumbnail";
import { AdicionarAlimentoModal, AlimentoBuscaOption } from "./AdicionarAlimentoModal";

export function DiarioAlimentarSection() {
  const {
    refeicoes,
    toggleCheckinRefeicao,
    adicionarAlimentoExtra,
    removerAlimentoExtra,
    substituirAlimentoPrescrito,
  } = useDiarioAlimentar();

  const [modalRefeicaoId, setModalRefeicaoId] = useState<string | null>(null);
  const [itemParaSubstituir, setItemParaSubstituir] = useState<{
    itemId: string;
    itemNome: string;
  } | null>(null);

  const refeicaoModalAtiva = refeicoes.find((r) => r.id === modalRefeicaoId);

  function getMealIcon(nome: string) {
    const n = (nome || "").toLowerCase();
    if (n.includes("café") || n.includes("desjejum") || n.includes("manhã")) {
      return <Coffee size={16} color="#d97706" />;
    }
    if (n.includes("almoço")) {
      return <Sun size={16} color="#ea580c" />;
    }
    if (n.includes("lanche")) {
      return <Apple size={16} color="#059669" />;
    }
    if (n.includes("jantar") || n.includes("ceia") || n.includes("noite")) {
      return <Moon size={16} color="#6366f1" />;
    }
    return <Utensils size={16} color="#0f766e" />;
  }

  function handleAbrirModalAdicionar(refeicaoId: string) {
    setModalRefeicaoId(refeicaoId);
  }

  function handleConfirmarAdicionar(alimento: AlimentoBuscaOption, gramas: number) {
    if (modalRefeicaoId) {
      adicionarAlimentoExtra(modalRefeicaoId, alimento, gramas);
    }
  }

  function handleAbrirSubstituicao(itemId: string, itemNome: string) {
    setItemParaSubstituir({ itemId, itemNome });
  }

  async function handleConfirmarSubstituicao(alimento: AlimentoBuscaOption, gramas: number) {
    if (itemParaSubstituir) {
      await substituirAlimentoPrescrito(itemParaSubstituir.itemId, alimento, gramas);
      setItemParaSubstituir(null);
    }
  }

  return (
    <View style={styles.container}>
      {/* TÍTULO DA SEÇÃO */}
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionTitleBox}>
          <Utensils size={16} color="#0f766e" />
          <Text style={styles.sectionTitle}>DIÁRIO ALIMENTAR DE HOJE</Text>
        </View>
        <Text style={styles.sectionSubtitle}>Check-in & Registro de Refeições</Text>
      </View>

      {/* BLOCOS DE REFEIÇÃO DIÁRIA */}
      <View style={styles.mealBlocksList}>
        {refeicoes.map((refeicao) => {
          const isConsumido = refeicao.consumido;
          const temItens =
            refeicao.itensPrescritos.length > 0 || refeicao.itensExtras.length > 0;

          return (
            <View
              key={refeicao.id}
              style={[
                styles.mealCard,
                isConsumido && styles.mealCardConsumido,
              ]}
            >
              {/* CABEÇALHO DO BLOCO DA REFEIÇÃO */}
              <View style={styles.mealCardHeader}>
                <View style={styles.mealHeaderLeft}>
                  <View
                    style={[
                      styles.mealIconCircle,
                      isConsumido && styles.mealIconCircleActive,
                    ]}
                  >
                    {getMealIcon(refeicao.nome)}
                  </View>
                  <View>
                    <Text style={styles.mealName}>{refeicao.nome}</Text>
                    <View style={styles.mealTimeRow}>
                      <Clock size={11} color="#94a3b8" />
                      <Text style={styles.mealTimeText}>{refeicao.horario}</Text>
                    </View>
                  </View>
                </View>

                {/* AÇÕES: CALORIAS + BOTÃO DE CHECK-IN */}
                <View style={styles.mealHeaderRight}>
                  {refeicao.caloriasTotal > 0 && (
                    <View
                      style={[
                        styles.mealCaloriesBadge,
                        isConsumido && styles.mealCaloriesBadgeActive,
                      ]}
                    >
                      <Flame
                        size={12}
                        color={isConsumido ? "#0f766e" : "#d97706"}
                      />
                      <Text
                        style={[
                          styles.mealCaloriesText,
                          isConsumido && styles.mealCaloriesTextActive,
                        ]}
                      >
                        {refeicao.caloriasTotal} kcal
                      </Text>
                    </View>
                  )}

                  {/* BOTÃO CHECKBOX DE CHECK-IN ("MARCAR COMO CONSUMIDO") */}
                  <TouchableOpacity
                    onPress={() => toggleCheckinRefeicao(refeicao.id)}
                    activeOpacity={0.75}
                    style={[
                      styles.checkinButton,
                      isConsumido && styles.checkinButtonActive,
                    ]}
                  >
                    {isConsumido ? (
                      <>
                        <CheckCircle2 size={16} color="#ffffff" strokeWidth={2.5} />
                        <Text style={styles.checkinButtonTextActive}>Consumido</Text>
                      </>
                    ) : (
                      <>
                        <Circle size={15} color="#0f766e" strokeWidth={2} />
                        <Text style={styles.checkinButtonText}>Check-in</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* LISTA DE ALIMENTOS PRESCRITOS PELA MÉDICA */}
              {refeicao.itensPrescritos.length > 0 && (
                <View style={styles.foodItemsList}>
                  {refeicao.itensPrescritos.map((item) => {
                    const sub = item.substituicao;
                    const hasSub = !!sub;

                    return (
                      <View key={item.id} style={styles.prescribedItemBlock}>
                        <View
                          style={[
                            styles.foodItemRow,
                            hasSub && styles.foodItemRowSubstituted,
                          ]}
                        >
                          <FoodThumbnail
                            nome={item.nome}
                            categoria={item.categoria}
                            imageUrl={item.thumbnailUrl}
                            size={32}
                          />
                          <View style={styles.foodItemTexts}>
                            <Text
                              style={[
                                styles.foodItemName,
                                hasSub && styles.foodItemNameSubstituted,
                              ]}
                              numberOfLines={1}
                            >
                              {item.nome}
                            </Text>
                            <Text
                              style={[
                                styles.foodItemGrams,
                                hasSub && styles.foodItemGramsSubstituted,
                              ]}
                            >
                              {item.quantidadeGramas}g • Prescrito
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.foodItemCalories,
                              hasSub && styles.foodItemCaloriesSubstituted,
                            ]}
                          >
                            {item.calorias} kcal
                          </Text>

                          {/* Botão de Troca (🔄) */}
                          <TouchableOpacity
                            style={styles.inlineSwapBtn}
                            onPress={() => handleAbrirSubstituicao(item.id, item.nome)}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <RefreshCw size={12} color="#0f766e" />
                          </TouchableOpacity>
                        </View>

                        {/* RENDERIZAÇÃO INLINE DO SUBSTITUTO SE HOUVER TROCA */}
                        {hasSub && sub && (
                          <View style={styles.inlineSubBox}>
                            <View style={styles.inlineSubBadge}>
                              <RefreshCw size={10} color="#047857" />
                              <Text style={styles.inlineSubBadgeText}>
                                Substituído pelo Paciente
                              </Text>
                            </View>
                            <View style={styles.inlineSubRow}>
                              <FoodThumbnail
                                nome={sub.substituteFoodName}
                                imageUrl={sub.substituteThumbnailUrl}
                                size={26}
                              />
                              <View style={styles.foodItemTexts}>
                                <Text style={styles.inlineSubName} numberOfLines={1}>
                                  {sub.substituteFoodName}
                                </Text>
                                <Text style={styles.inlineSubGrams}>
                                  {sub.quantityGrams}g consumido
                                </Text>
                              </View>
                              <Text style={styles.inlineSubCalories}>
                                {sub.calories} kcal
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* LISTA DE ALIMENTOS EXTRAS ADICIONADOS PELO PACIENTE */}
              {refeicao.itensExtras.length > 0 && (
                <View style={styles.extraItemsBox}>
                  <Text style={styles.extraItemsHeaderLabel}>
                    ITENS ADICIONAIS CONSUMIDOS:
                  </Text>
                  {refeicao.itensExtras.map((extra) => (
                    <View key={extra.id} style={styles.extraItemRow}>
                      <FoodThumbnail
                        nome={extra.nome}
                        categoria={extra.categoria}
                        imageUrl={extra.thumbnailUrl}
                        size={30}
                      />
                      <View style={styles.foodItemTexts}>
                        <View style={styles.extraTitleRow}>
                          <Text style={styles.foodItemName} numberOfLines={1}>
                            {extra.nome}
                          </Text>
                          <View style={styles.extraTagBadge}>
                            <Text style={styles.extraTagText}>+ Extra</Text>
                          </View>
                        </View>
                        <Text style={styles.foodItemGrams}>
                          {extra.quantidadeGramas}g
                        </Text>
                      </View>
                      <Text style={styles.extraItemCalories}>
                        +{extra.calorias} kcal
                      </Text>
                      <TouchableOpacity
                        onPress={() => removerAlimentoExtra(refeicao.id, extra.id)}
                        style={styles.deleteExtraBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Trash2 size={13} color="#f43f5e" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* MENSAGEM SE NÃO HÁ ALIMENTOS CADASTRADOS AINDA */}
              {!temItens && (
                <View style={styles.emptyMealBox}>
                  <Text style={styles.emptyMealText}>
                    Nenhum alimento prescrito para este horário.
                  </Text>
                </View>
              )}

              {/* BOTÃO + ADICIONAR ALIMENTO LIVRE */}
              <TouchableOpacity
                onPress={() => handleAbrirModalAdicionar(refeicao.id)}
                activeOpacity={0.7}
                style={styles.addFoodButton}
              >
                <Plus size={14} color="#0f766e" />
                <Text style={styles.addFoodButtonText}>Adicionar Alimento</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {/* MODAL DE BUSCA LIVRE (TABELA TACO) */}
      <AdicionarAlimentoModal
        visible={modalRefeicaoId !== null}
        refeicaoNome={refeicaoModalAtiva?.nome || "Refeição"}
        onClose={() => setModalRefeicaoId(null)}
        onConfirm={handleConfirmarAdicionar}
      />

      {/* MODAL DE SUBSTITUIÇÃO ANCORADA A PRESCRIBED DIET ITEM */}
      <AdicionarAlimentoModal
        visible={itemParaSubstituir !== null}
        refeicaoNome={
          itemParaSubstituir
            ? `Substituir: ${itemParaSubstituir.itemNome}`
            : "Substituição"
        }
        onClose={() => setItemParaSubstituir(null)}
        onConfirm={handleConfirmarSubstituicao}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 18,
    marginBottom: 10,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitleBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0f766e",
    letterSpacing: 0.5,
  },
  sectionSubtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
  },
  mealBlocksList: {
    gap: 12,
  },
  mealCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  mealCardConsumido: {
    borderColor: "#a7f3d0",
    backgroundColor: "#fafdfb",
  },
  mealCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  mealHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  mealIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  mealIconCircleActive: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  mealName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  mealTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  mealTimeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
  },
  mealHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mealCaloriesBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  mealCaloriesBadgeActive: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  mealCaloriesText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#b45309",
    fontFamily: "monospace",
  },
  mealCaloriesTextActive: {
    color: "#0f766e",
  },
  checkinButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#ccfbf1",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  checkinButtonActive: {
    backgroundColor: "#0f766e",
    borderColor: "#0f766e",
  },
  checkinButtonText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0f766e",
  },
  checkinButtonTextActive: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ffffff",
  },
  foodItemsList: {
    paddingTop: 8,
    gap: 6,
  },
  foodItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
  },
  foodItemTexts: {
    flex: 1,
    marginLeft: 10,
  },
  foodItemName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1e293b",
  },
  foodItemGrams: {
    fontSize: 10,
    fontWeight: "500",
    color: "#64748b",
    marginTop: 1,
  },
  foodItemCalories: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    fontFamily: "monospace",
  },
  extraItemsBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    gap: 6,
  },
  extraItemsHeaderLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#0f766e",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  extraItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  extraTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  extraTagBadge: {
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  extraTagText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#0284c7",
  },
  extraItemCalories: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ea580c",
    fontFamily: "monospace",
    marginRight: 8,
  },
  deleteExtraBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: "#ffe4e6",
  },
  emptyMealBox: {
    paddingVertical: 8,
    alignItems: "center",
  },
  emptyMealText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#94a3b8",
    fontStyle: "italic",
  },
  addFoodButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    marginTop: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
  },
  addFoodButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0f766e",
  },
  prescribedItemBlock: {
    gap: 4,
  },
  foodItemRowSubstituted: {
    opacity: 0.6,
    backgroundColor: "#f8fafc",
  },
  foodItemNameSubstituted: {
    textDecorationLine: "line-through",
    color: "#94a3b8",
  },
  foodItemGramsSubstituted: {
    textDecorationLine: "line-through",
    color: "#cbd5e1",
  },
  foodItemCaloriesSubstituted: {
    textDecorationLine: "line-through",
    color: "#cbd5e1",
  },
  inlineSwapBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    marginLeft: 4,
  },
  inlineSubBox: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    borderRadius: 10,
    padding: 8,
    marginLeft: 16,
    gap: 6,
  },
  inlineSubBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#d1fae5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  inlineSubBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#047857",
  },
  inlineSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inlineSubName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#064e3b",
  },
  inlineSubGrams: {
    fontSize: 10,
    fontWeight: "500",
    color: "#059669",
    marginTop: 1,
  },
  inlineSubCalories: {
    fontSize: 11,
    fontWeight: "800",
    color: "#047857",
    fontFamily: "monospace",
  },
});
