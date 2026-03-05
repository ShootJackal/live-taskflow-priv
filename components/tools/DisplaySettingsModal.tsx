import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Switch,
  StyleSheet,
} from "react-native";
import { X } from "lucide-react-native";
import { useTheme, THEME_META, type ThemeMode } from "@/providers/ThemeProvider";
import { useLocale, type LocaleCode } from "@/providers/LocaleProvider";
import { DesignTokens } from "@/constants/colors";

export function DisplaySettingsModal({
  visible,
  onClose,
  resolvedMode,
  onSelectTheme,
  locale,
  onSelectLocale,
  hideStatusBar,
  onToggleStatusBar,
}: {
  visible: boolean;
  onClose: () => void;
  resolvedMode: Exclude<ThemeMode, "system">;
  onSelectTheme: (theme: Exclude<ThemeMode, "system">) => void;
  locale: LocaleCode;
  onSelectLocale: (next: LocaleCode) => void;
  hideStatusBar: boolean;
  onToggleStatusBar: (next: boolean) => void;
}) {
  const { colors } = useTheme();
  const { t } = useLocale();

  const themeEntries = Object.entries(THEME_META) as [
    Exclude<ThemeMode, "system">,
    (typeof THEME_META)["light"],
  ][];
  const languageEntries: { code: LocaleCode; label: string }[] = [
    { code: "en", label: "English" },
    { code: "es", label: "Español" },
    { code: "ru", label: "Русский" },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.bgCard, borderColor: colors.border },
          ]}
          accessible
          accessibilityViewIsModal
          accessibilityLabel={t("display_settings", "Display Settings")}
          accessibilityHint="Adjust app theme, language, and visual behavior."
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {t("display_settings", "Display Settings")}
            </Text>
            <TouchableOpacity
              style={[styles.closeBtn, { borderColor: colors.border }]}
              onPress={onClose}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Close display settings"
            >
              <X size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text
            accessibilityRole="header"
            style={[styles.sectionLabel, { color: colors.textMuted }]}
          >
            {t("theme", "Theme")}
          </Text>
          <View
            style={[
              styles.listCard,
              { backgroundColor: colors.bgInput, borderColor: colors.border },
            ]}
          >
            {themeEntries.map(([key, meta], idx) => (
              <View key={key}>
                {idx > 0 && (
                  <View
                    style={[styles.divider, { backgroundColor: colors.border }]}
                  />
                )}
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => onSelectTheme(key)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Theme ${meta.label}`}
                  accessibilityHint={
                    resolvedMode === key
                      ? "Currently selected."
                      : "Double tap to apply this theme."
                  }
                  accessibilityState={{ selected: resolvedMode === key }}
                >
                  <Text
                    style={[styles.rowLabel, { color: colors.textPrimary }]}
                  >
                    {meta.label}
                  </Text>
                  <Switch
                    value={resolvedMode === key}
                    onValueChange={(next) => {
                      if (next) onSelectTheme(key);
                    }}
                    trackColor={{
                      false: colors.border,
                      true: colors.accent + "66",
                    }}
                    thumbColor={
                      resolvedMode === key ? colors.accent : colors.white
                    }
                    ios_backgroundColor={colors.border}
                    accessible={false}
                  />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <Text
            accessibilityRole="header"
            style={[
              styles.sectionLabel,
              { color: colors.textMuted, marginTop: 14 },
            ]}
          >
            {t("language", "Language")}
          </Text>
          <View
            style={[
              styles.listCard,
              { backgroundColor: colors.bgInput, borderColor: colors.border },
            ]}
          >
            {languageEntries.map((entry, idx) => (
              <View key={entry.code}>
                {idx > 0 && (
                  <View
                    style={[styles.divider, { backgroundColor: colors.border }]}
                  />
                )}
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => onSelectLocale(entry.code)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Language ${entry.label}`}
                  accessibilityHint={
                    locale === entry.code
                      ? "Currently selected."
                      : "Double tap to switch language."
                  }
                  accessibilityState={{ selected: locale === entry.code }}
                >
                  <Text
                    style={[styles.rowLabel, { color: colors.textPrimary }]}
                  >
                    {entry.label}
                  </Text>
                  <Switch
                    value={locale === entry.code}
                    onValueChange={(next) => {
                      if (next) onSelectLocale(entry.code);
                    }}
                    trackColor={{
                      false: colors.border,
                      true: colors.accent + "66",
                    }}
                    thumbColor={
                      locale === entry.code ? colors.accent : colors.white
                    }
                    ios_backgroundColor={colors.border}
                    accessible={false}
                  />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <Text
            accessibilityRole="header"
            style={[
              styles.sectionLabel,
              { color: colors.textMuted, marginTop: 14 },
            ]}
          >
            System
          </Text>
          <View
            style={[
              styles.listCard,
              { backgroundColor: colors.bgInput, borderColor: colors.border },
            ]}
          >
            <TouchableOpacity
              style={styles.row}
              onPress={() => onToggleStatusBar(!hideStatusBar)}
              activeOpacity={0.75}
              accessibilityRole="switch"
              accessibilityLabel={t("hide_status_bar", "Hide Status Bar")}
              accessibilityState={{ checked: hideStatusBar }}
              accessibilityHint="Controls whether the phone status bar is hidden while using TaskFlow."
            >
              <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                {t("hide_status_bar", "Hide Status Bar")}
              </Text>
              <Switch
                value={hideStatusBar}
                onValueChange={onToggleStatusBar}
                trackColor={{
                  false: colors.border,
                  true: colors.accent + "66",
                }}
                thumbColor={hideStatusBar ? colors.accent : colors.white}
                ios_backgroundColor={colors.border}
                accessible={false}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.42)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: { fontSize: 17, fontWeight: "700" as const },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "700" as const,
    marginBottom: 8,
    marginTop: 6,
    textTransform: "uppercase",
  },
  listCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowLabel: { fontSize: 14, fontWeight: "600" as const },
  divider: { height: 1 },
});
