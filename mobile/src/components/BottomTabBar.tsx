import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Home, Utensils, TrendingUp, Stethoscope } from "lucide-react-native";

export type MainTabKey = "Hoje" | "Dieta" | "Evolução" | "Clínica";

export interface BottomTabBarProps {
  activeTab: MainTabKey;
  onTabPress?: (tab: MainTabKey) => void;
}

const TABS: Array<{
  key: MainTabKey;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}> = [
  { key: "Hoje", label: "Hoje", icon: Home },
  { key: "Dieta", label: "Dieta", icon: Utensils },
  { key: "Evolução", label: "Evolução", icon: TrendingUp },
  { key: "Clínica", label: "Clínica", icon: Stethoscope },
];

export function BottomTabBar({ activeTab, onTabPress }: BottomTabBarProps) {
  return (
    <View style={styles.container}>
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isSelected = activeTab === tab.key;

        return (
          <TouchableOpacity
            key={tab.key}
            activeOpacity={0.75}
            onPress={() => onTabPress?.(tab.key)}
            style={styles.tabButton}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
          >
            <View
              style={[
                styles.activeIndicator,
                isSelected && styles.activeIndicatorVisible,
              ]}
            />
            <Icon
              size={20}
              color={isSelected ? "#0f766e" : "#64748b"}
              strokeWidth={isSelected ? 2.3 : 1.8}
            />
            <Text
              style={[
                styles.label,
                isSelected ? styles.labelActive : styles.labelInactive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 6,
    paddingBottom: Platform.OS === "ios" ? 10 : 8,
    paddingHorizontal: 8,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    gap: 3,
  },
  activeIndicator: {
    width: 22,
    height: 3,
    borderRadius: 999,
    backgroundColor: "transparent",
    marginBottom: 2,
  },
  activeIndicatorVisible: {
    backgroundColor: "#0f766e",
  },
  label: {
    fontSize: 11,
    letterSpacing: 0.1,
  },
  labelActive: {
    color: "#0f766e",
    fontWeight: "700",
  },
  labelInactive: {
    color: "#64748b",
    fontWeight: "500",
  },
});
