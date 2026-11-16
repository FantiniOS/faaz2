import React, { useState } from "react";
import { View, Text, Image, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { getFoodVisual } from "../utils/foodVisual";

export interface FoodThumbnailProps {
  nome: string;
  categoria?: string | null;
  imageUrl?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function FoodThumbnail({
  nome,
  categoria,
  imageUrl,
  size = 40,
  style,
}: FoodThumbnailProps) {
  const [hasError, setHasError] = useState(false);
  const visual = getFoodVisual(nome, categoria);

  const containerStyle = {
    width: size,
    height: size,
    borderRadius: 8,
    backgroundColor: visual.bgColor,
    borderColor: visual.borderColor,
    borderWidth: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    overflow: "hidden" as const,
  };

  const fontSize = Math.round(size * 0.58);

  if (imageUrl && !hasError) {
    return (
      <View style={[containerStyle, style]}>
        <Image
          source={{ uri: imageUrl }}
          style={{ width: "100%", height: "100%", borderRadius: 7 }}
          resizeMode="cover"
          onError={() => setHasError(true)}
        />
      </View>
    );
  }

  return (
    <View style={[containerStyle, style]}>
      <Text style={{ fontSize, lineHeight: fontSize + 4, textAlign: "center" }}>
        {visual.emoji}
      </Text>
    </View>
  );
}
