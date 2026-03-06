import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";
import { DesignTokens } from "@/constants/colors";

export default function NotFoundScreen() {
  const { colors } = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: "Not Found" }} />
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <Text style={[styles.code, { color: colors.textMuted }]}>404</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Page not found
        </Text>
        <Text style={[styles.message, { color: colors.textSecondary }]}>
          The screen you requested doesn&apos;t exist.
        </Text>

        <Link href="/" style={[styles.link, { backgroundColor: colors.accentSoft }]}>
          <Text style={[styles.linkText, { color: colors.accent }]}>
            Back to Dashboard
          </Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 8,
  },
  code: {
    fontSize: DesignTokens.fontSize.largeTitle + 12,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 4,
  },
  title: {
    fontSize: DesignTokens.fontSize.title2,
    fontWeight: "700",
  },
  message: {
    fontSize: DesignTokens.fontSize.body,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 20,
  },
  link: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: DesignTokens.radius.md,
  },
  linkText: {
    fontSize: DesignTokens.fontSize.callout,
    fontWeight: "600",
  },
});
