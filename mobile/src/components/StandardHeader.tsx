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
   * Título principal da tela exibido na 2ª linha.
   */
  title: string;
  /**
   * Subtítulo opcional exibido abaixo do título quando não há botão voltar.
   */
  subtitle?: string;
  /**
   * Ação ao tocar no botão de voltar (apenas em telas empilhadas/secundárias).
   */
  onBack?: () => void;
  /**
   * Texto opcional do botão de voltar (Padrão: "Voltar").
   */
  backLabel?: string;
  /**
   * Elemento opcional renderizado no canto direito (ex: badge de status/objetivo).
   */
  rightElement?: React.ReactNode;
  /**
   * Estilo customizado opcional para sobrepor ou complementar o container principal.
   */
  style?: StyleProp<ViewStyle>;
}

/**
 * StandardHeader - Cabeçalho Executivo Escuro Unificado (Clínica FAAZ)
 *
 * - Telas empilhadas (com `onBack`): botão `< Voltar` à esquerda + título centralizado.
 * - Telas raiz das 4 abas (sem `onBack`): branding + título alinhados à esquerda com `rightElement` à direita,
 *   seguindo o mesmo padrão executivo navy/slate escuro + acentos esmeralda do painel Web.
 */
export function StandardHeader({
  title,
  subtitle,
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

  const [leftSlotWidth, setLeftSlotWidth] = useState<number>(76);

  const paddingTop = Math.max(
    insets.top + 6,
    Platform.OS === "android" ? 16 : 12
  );

  // Modo tela raiz de aba (sem botão Voltar): alinhamento executivo à esquerda
  if (!onBack) {
    return (
      <View style={[styles.container, { paddingTop }, style]}>
        <View style={styles.rootTitleBlock}>
          <Text style={styles.brandText}>CLÍNICA FAAZ</Text>
          <Text style={styles.rootTitleText} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.rootSubtitleText} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {rightElement ? (
          <View style={styles.rootRightSlot}>{rightElement}</View>
        ) : null}
      </View>
    );
  }

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
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onBack}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronLeft size={21} color="#2dd4bf" strokeWidth={2.4} />
          <Text style={styles.backButtonText}>{backLabel}</Text>
        </TouchableOpacity>
      </View>

      {/* 2. CENTRO: BRANDING & TÍTULO DA TELA */}
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
  rootTitleBlock: {
    flex: 1,
    justifyContent: "center",
    paddingRight: 12,
  },
  rootTitleText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 2,
    letterSpacing: -0.2,
  },
  rootSubtitleText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "400",
    marginTop: 2,
  },
  rootRightSlot: {
    alignItems: "flex-end",
    justifyContent: "center",
  },
});
