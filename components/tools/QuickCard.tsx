import React, { useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/providers/ThemeProvider";
import { DesignTokens } from "@/constants/colors";
import type { ThemeColors } from "@/constants/colors";

export function QuickCard({
  title,
  subtitle,
  icon,
  iconBg,
  onPress,
  testID,
  colors,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconBg: string;
  onPress: () => void;
  testID: string;
  colors: ThemeColors;
}) {
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: colors.bgCard,
            borderColor: colors.border,
            shadowColor: colors.shadow,
          },
        ]}
        onPress={handlePress}
        activeOpacity={0.85}
        testID={testID}
      >
        <View style={[styles.icon, { backgroundColor: iconBg }]}>{icon}</View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>{subtitle}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexBasis: "48%", flexGrow: 1 },
  card: {
    borderRadius: DesignTokens.radius.xl - 2,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 86,
    alignItems: "center",
    justifyContent: "center",
    ...DesignTokens.shadow.card,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: DesignTokens.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
  },
  title: { fontSize: 10, marginBottom: 1, textAlign: "center", fontWeight: "700" as const },
  sub: { fontSize: 9, textAlign: "center" },
});
