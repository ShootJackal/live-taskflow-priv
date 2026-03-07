import React from "react";
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { RefreshCw } from "lucide-react-native";
import { useTheme } from "@/providers/ThemeProvider";
import { DesignTokens } from "@/constants/colors";
import { useVersionCheck } from "@/hooks/useVersionCheck";

/**
 * Polls /version.json every 5 minutes.
 * When a new deployment is detected, shows a non-dismissible banner.
 * Tapping it hard-reloads the page so users always run current code.
 * Renders nothing on native (version updates come through app stores).
 */
export default function UpdateBanner() {
  const { colors } = useTheme();
  const { updateAvailable, reload } = useVersionCheck();

  if (Platform.OS !== "web" || !updateAvailable) return null;

  return (
    <TouchableOpacity
      style={[styles.banner, { backgroundColor: colors.accent }]}
      onPress={reload}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel="New version available. Tap to update."
    >
      <RefreshCw size={13} color="#fff" strokeWidth={2.5} />
      <Text style={styles.text}>New version available — tap to update</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: DesignTokens.spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: DesignTokens.spacing.lg,
    // no zIndex needed — layout order keeps it above content
  },
  text: {
    color: "#fff",
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "600" as const,
    letterSpacing: 0.2,
  },
});
