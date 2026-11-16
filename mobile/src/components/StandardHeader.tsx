import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
  Platform,
} from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface StandardHeaderProps {
  /**
   * Título principal da tela exibido na 2ª linha do centro.
   * Ex: "Meu Plano Alimentar", "Qualidade do Sono", "Seu Desempenho", "Meu Perfil"
   */
  title: string;
  /**
   * Ação ao tocar no botão de voltar.
   */
  onBack?: () => void;
  /**
   * Texto opcional do botão de voltar (Padrão: "Voltar").
   */
  backLabel?: string;
  /**
   * Elemento opcional renderizado no canto direito (ex: Tag de médico, badge de calorias/status).
   */
  rightElement?: React.ReactNode;
  /**
   * Estilo customizado opcional para sobrepor ou complementar o container principal.
   */
  style?: StyleProp<ViewStyle>;
}

/**
 * StandardHeader - Componente Universal de Cabeçalho do App Mobile (Padrão Global FAAZ)
 *
 * Características:
 * - Fundo escuro oficial `#0f172a` (Slate 900) com borda inferior `#1e293b`.
 * - Lado Esquerdo: Botão com ícone ChevronLeft e texto "Voltar" na cor Teal `#2dd4bf`.
 * - Centro: Duas linhas ("CLÍNICA FAAZ" em caixa alta/Teal + Título da tela em Branco).
 * - Lado Direito: `rightElement` opcional ou `View` de largura espelhada para centralização matemática.
 */
export function StandardHeader({
  title,
  onBack,
  backLabel = "Voltar",
  rightElement,
  style,
}: StandardHeaderProps) {
  let insets = { top: 0, bottom: 0, left: 0, right: 0 };
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    insets = useSafeAreaInsets();
  } catch {
    // Fallback gracioso se renderizado fora de SafeAreaProvider
  }

  // Largura dinâmica do botão Voltar para espelhamento simétrico perfeito
  const [leftSlotWidth, setLeftSlotWidth] = useState<number>(76);

  const paddingTop = Math.max(
    insets.top,
    Platform.OS === "android" ? 14 : 10
  );

  return (
    <View style={[styles.container, { paddingTop }, style]}>
      {/* 1. LADO ESQUERDO: BOTÃO VOLTAR */}
      <View
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0 && Math.abs(w - leftSlotWidth) > 1) {
            setLeftSlotWidth(w);
          }
        }}
        style={styles.leftSlot}
      >
        {onBack ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onBack}
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ChevronLeft size={22} color="#2dd4bf" strokeWidth={2.4} />
            <Text style={styles.backButtonText}>{backLabel}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: leftSlotWidth }} />
        )}
      </View>

      {/* 2. CENTRO: BRANDING & TÍTULO DA TELA (MATEMATICAMENTE CENTRALIZADO) */}
      <View style={styles.centerSlot}>
        <Text style={styles.brandText}>CLÍNICA FAAZ</Text>
        <Text style={styles.titleText} numberOfLines={1}>
          {title}
        </Text>
      </View>

      {/* 3. LADO DIREITO: ELEMENTO OPCIONAL OU ESPELHO DE LARGURA */}
      <View
        style={[
          styles.rightSlot,
          {
            minWidth: leftSlotWidth,
            width: rightElement ? undefined : leftSlotWidth,
          },
        ]}
      >
        {rightElement ? (
          rightElement
        ) : (
          <View style={{ width: leftSlotWidth, height: 1 }} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#0f172a",
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    zIndex: 10,
    elevation: 4,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  leftSlot: {
    alignItems: "flex-start",
    justifyContent: "center",
    minWidth: 70,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingRight: 8,
  },
  backButtonText: {
    color: "#2dd4bf",
    fontSize: 12,
    fontWeight: "500",
    marginLeft: 2,
    letterSpacing: 0.2,
  },
  centerSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  brandText: {
    color: "#2dd4bf",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  titleText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 1,
    textAlign: "center",
    letterSpacing: 0.2,
  },
  rightSlot: {
    alignItems: "flex-end",
    justifyContent: "center",
  },
});
