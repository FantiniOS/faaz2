import React, { useState } from "react";
import { View, Text, Image, ViewStyle, StyleProp } from "react-native";
import { getFoodVisual } from "../utils/foodVisual";
import { resolveAssetUrl } from "../services/api";

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
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const visual = getFoodVisual(nome, categoria);
  const resolvedUri = resolveAssetUrl(imageUrl);
  const hasError = Boolean(resolvedUri && failedUri === resolvedUri);

  const containerStyle = {
    width: size,
    height: size,
    borderRadius: 8,
    backgroundColor: resolvedUri && !hasError ? "#ffffff" : visual.bgColor,
    borderColor: visual.borderColor,
    borderWidth: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    overflow: "hidden" as const,
  };

  const fontSize = Math.round(size * 0.58);

  if (resolvedUri && !hasError) {
    return (
      <View style={[containerStyle, style]}>
        <Image
          source={{ uri: resolvedUri, cache: "force-cache" }}
          style={{ width: "100%", height: "100%", borderRadius: 7 }}
          resizeMode="cover"
          onError={() => setFailedUri(resolvedUri)}
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
