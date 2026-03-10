import React, { useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
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
            shadowColor: colors.shadow,
          },
        ]}
        onPress={handlePress}
        activeOpacity={0.78}
        testID={testID}
      >
        <View style={[styles.icon, { backgroundColor: iconBg }]}>{icon}</View>
        <Text
          style={[styles.title, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          style={[styles.sub, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexBasis: "48%", flexGrow: 1 },
  card: {
    borderRadius: DesignTokens.radius.xl,
    paddingHorizontal: 12,
    paddingVertical: 14,
    minHeight: 96,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    ...DesignTokens.shadow.float,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: DesignTokens.radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  title: {
    fontSize: DesignTokens.fontSize.caption1,
    textAlign: "center",
    fontWeight: "700" as const,
  },
  sub: {
    fontSize: DesignTokens.fontSize.caption2,
    textAlign: "center",
  },
});
