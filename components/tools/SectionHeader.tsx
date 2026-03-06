import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";
import { DesignTokens } from "@/constants/colors";

export const SectionHeader = React.memo(function SectionHeader({
  label,
  icon,
}: {
  label: string;
  icon?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {icon && <View style={styles.icon}>{icon}</View>}
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: DesignTokens.spacing.sm,
    marginTop: DesignTokens.spacing.sm,
    paddingHorizontal: 4,
  },
  icon: {
    opacity: 0.7,
  },
  label: {
    fontSize: DesignTokens.fontSize.caption1,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    fontWeight: "600" as const,
  },
});
