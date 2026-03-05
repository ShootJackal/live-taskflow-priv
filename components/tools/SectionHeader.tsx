import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";

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
      {icon}
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    fontWeight: "700" as const,
  },
});
