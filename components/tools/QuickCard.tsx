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
    paddingHorizontal: 14,
    paddingVertical: 18,
    minHeight: 105,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    ...DesignTokens.shadow.float,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: DesignTokens.radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: DesignTokens.fontSize.footnote,
    textAlign: "center",
    fontWeight: "600" as const,
    letterSpacing: 0.2,
  },
  sub: {
    fontSize: DesignTokens.fontSize.caption1,
    textAlign: "center",
    letterSpacing: 0.1,
  },
});
