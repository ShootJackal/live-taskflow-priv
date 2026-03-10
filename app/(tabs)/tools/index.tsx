import React, { useCallback, useRef, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Animated,
  Platform,
  Alert,
} from "react-native";
import {
  MessageSquare,
  Clock,
  AlertTriangle,
  Palette,
  User,
  Cpu,
  Check,
  RotateCcw,
  RefreshCw,
  BarChart3,
  ExternalLink,
  Database,
  Zap,
  Shield,
  Activity,
  FileText,
  ChevronRight,
  Download,
  ClipboardList,
  LogOut,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useTheme, THEME_META, type ThemeMode } from "@/providers/ThemeProvider";
import { useLocale, type LocaleCode } from "@/providers/LocaleProvider";
import { useUiPrefs } from "@/providers/UiPrefsProvider";
import { useCollection } from "@/providers/CollectionProvider";
import { DesignTokens } from "@/constants/colors";
import ScreenContainer from "@/components/ScreenContainer";
import SelectPicker from "@/components/SelectPicker";
import RigAssignmentModal from "@/components/RigAssignmentModal";
import { AdminOverview } from "@/components/tools/AdminOverview";
import { AdminToolsPanel } from "@/components/tools/AdminToolsPanel";
import { SectionHeader } from "@/components/tools/SectionHeader";
import { QuickCard } from "@/components/tools/QuickCard";
import { AdminPasswordModal } from "@/components/tools/AdminPasswordModal";
import { DisplaySettingsModal } from "@/components/tools/DisplaySettingsModal";
import { SHEET_PAGES } from "@/components/tools/toolConstants";
import { deriveRigOptions } from "@/app/(tabs)/tools/view-models/rigOptions";
import { clearAllCaches } from "@/services/googleSheets";
import { Image } from "expo-image";

export default function ToolsScreen() {
  const { colors, resolvedMode, setThemeMode } = useTheme();
  const { t, locale, setLocale } = useLocale();
  const { hideStatusBar, setHideStatusBar } = useUiPrefs();
  const {
    collectors, tasks, selectedCollectorName, selectedCollector, selectedRig,
    selectCollector, setSelectedRig, configured, isAdmin, authenticateAdmin, logoutAdmin,
  } = useCollection();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showDisplayModal, setShowDisplayModal] = useState(false);
  const [showRigPicker, setShowRigPicker] = useState(false);
  const adminModalTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fadeAnim]);

  useEffect(() => {
    return () => {
      if (adminModalTimeoutRef.current) {
        clearTimeout(adminModalTimeoutRef.current);
        adminModalTimeoutRef.current = null;
      }
    };
  }, []);

  const collectorOptions = useMemo(() => {
    const opts = collectors.map(c => ({ value: c.name, label: c.name }));
    opts.push({ value: "__admin__", label: "Admin" });
    return opts;
  }, [collectors]);

  // SF collectors use the SOD rig picker in the Collect tab, not the tools picker.
  // MX collectors still pick from their collector-sheet assigned rigs here.
  const isSFCollector = selectedCollector?.team === "SF";

  const rigOptions = useMemo(() => {
    if (isSFCollector) return [];
    return deriveRigOptions(selectedCollector?.rigs ?? [], selectedRig);
  }, [isSFCollector, selectedCollector, selectedRig]);

  const handleSelectCollector = useCallback((name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (name === "__admin__") {
      if (isAdmin) {
        Alert.alert("Admin already unlocked", "Admin mode is already active on this device.");
        return;
      }
      // Allow the picker modal to close before opening the password modal.
      if (adminModalTimeoutRef.current) clearTimeout(adminModalTimeoutRef.current);
      adminModalTimeoutRef.current = setTimeout(() => setShowAdminModal(true), 220);
      return;
    }
    selectCollector(name);
  }, [selectCollector, isAdmin]);

  const handleAdminAuth = useCallback(async (password: string) => {
    return authenticateAdmin(password);
  }, [authenticateAdmin]);

  const handleAdminLogout = useCallback(() => {
    Alert.alert("Logout Admin", "Remove admin access?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: () => {
        logoutAdmin();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }},
    ]);
  }, [logoutAdmin]);

  const handleSelectRig = useCallback((rig: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedRig(rig);
  }, [setSelectedRig]);

  const openPreferredLink = useCallback(async (appUrl: string, webUrl: string) => {
    try {
      if (Platform.OS === "web") {
        await Linking.openURL(webUrl);
        return;
      }
      const canOpenApp = await Linking.canOpenURL(appUrl);
      await Linking.openURL(canOpenApp ? appUrl : webUrl);
    } catch {
      try {
        await Linking.openURL(webUrl);
      } catch {}
    }
  }, []);

  const openSlack = useCallback(() => {
    void openPreferredLink("slack://open", "https://slack.com/");
  }, [openPreferredLink]);

  const openHubstaff = useCallback(() => {
    void openPreferredLink("hubstaff://", "https://app.hubstaff.com/");
  }, [openPreferredLink]);

  const openSheets = useCallback(() => {
    void openPreferredLink("googlesheets://", "https://docs.google.com/spreadsheets/");
  }, [openPreferredLink]);

  const openAirtableRigIssue = useCallback(() => {
    void openPreferredLink("airtable://", "https://airtable.com/appvGgqeLbTxT4ld4/paghR1Qfi3cwZQtWZ/form");
  }, [openPreferredLink]);

  const openSheetPage = useCallback((sheetId: string, label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: "/tools/sheet-viewer" as any, params: { sheetId, title: label } });
  }, []);

  const handleSelectTheme = useCallback((theme: ThemeMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setThemeMode(theme);
  }, [setThemeMode]);

  const handleSelectLocale = useCallback((nextLocale: LocaleCode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void setLocale(nextLocale);
  }, [setLocale]);

  const handleToggleStatusBar = useCallback((next: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void setHideStatusBar(next);
  }, [setHideStatusBar]);

  const openInstallApp = useCallback(async () => {
    if (Platform.OS !== "web") {
      Alert.alert(
        "Install App",
        "Use your browser menu and tap 'Add to Home Screen' for full-screen mode."
      );
      return;
    }
    try {
      const promptEvent = (globalThis as any).__taskflowInstallPrompt;
      if (promptEvent && typeof promptEvent.prompt === "function") {
        await promptEvent.prompt();
      } else {
        Alert.alert("Install App", "Use your browser menu and choose 'Install App' or 'Add to Home Screen'.");
      }
    } catch {
      Alert.alert("Install App", "Use your browser menu and choose 'Install App' or 'Add to Home Screen'.");
    }
  }, []);

  const handleClearCache = useCallback(async () => {
    Alert.alert("Clear Cache", "Clear all locally cached data? The app will re-fetch from the server.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: async () => {
        await clearAllCaches();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Done", "Cache cleared. Pull to refresh any screen.");
      }},
    ]);
  }, []);

  const handleReloadApp = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (Platform.OS === "web" && typeof window !== "undefined") {
      // Always navigate to root — deep paths like /live can 404 on hard reload
      window.location.href = "/";
    } else {
      Alert.alert("Reload App", "Use your device's home button and relaunch the app to reload.");
    }
  }, []);

  const cardStyle = [styles.card, { backgroundColor: colors.bgCard, shadowColor: colors.shadow }];

  return (
    <ScreenContainer>
      <Animated.View style={[styles.flex, { opacity: fadeAnim }]}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header card — matches Live tab style */}
        <View style={[styles.pageHeader, { backgroundColor: colors.bgCard, shadowColor: colors.shadow }]}>
          {/* Tag row: label left, admin badge right */}
          <View style={styles.headerTopRow}>
            <View style={[styles.headerTag, { backgroundColor: colors.accentSoft, borderColor: colors.accentDim }]}>
              <Text style={[styles.headerTagText, { color: colors.accent }]}>SETTINGS</Text>
            </View>
            <View style={styles.pageHeaderRight}>
              {isAdmin && (
                <View style={[styles.adminBadge, { backgroundColor: colors.accentSoft, borderColor: colors.accentDim }]}>
                  <Shield size={11} color={colors.accent} />
                  <Text style={[styles.adminBadgeText, { color: colors.accent }]}>Admin</Text>
                </View>
              )}
            </View>
          </View>
          {/* Brand row */}
          <View style={styles.brandRow}>
            <Image source={require("../../../assets/images/icon.png")} style={styles.brandLogo} contentFit="contain" />
            <Text style={[styles.brandText, { color: colors.accent, fontFamily: "Lexend_700Bold" }]}>
              {t("tools", "Tools")}
            </Text>
          </View>
          <Text style={[styles.brandSub, { color: colors.textSecondary, fontFamily: "Lexend_400Regular" }]}>
            {t("settings", "Settings & Utilities")}
          </Text>
        </View>

        <SectionHeader label={t("my_profile", "My Profile")} icon={<User size={11} color={colors.textMuted} />} />

        <View style={cardStyle}>
          <View style={styles.settingRow}>
            <View style={[styles.settingIconWrap, { backgroundColor: colors.accentSoft }]}>
              <User size={16} color={colors.accent} />
            </View>
            <View style={styles.settingContent}>
              <Text style={[styles.settingLabel, { color: colors.textMuted }]}>Who are you?</Text>
              <SelectPicker
                label="" options={collectorOptions} selectedValue={selectedCollectorName}
                onValueChange={handleSelectCollector} placeholder="Select your name..." testID="settings-collector-picker"
              />
            </View>
          </View>

          {selectedCollectorName !== "" && (
            <>
              <View style={[styles.settingDivider, { backgroundColor: colors.border }]} />
              <View style={styles.settingRow}>
                <View style={[styles.settingIconWrap, { backgroundColor: colors.completeBg }]}>
                  <Cpu size={16} color={colors.complete} />
                </View>
                <View style={styles.settingContent}>
                  <Text style={[styles.settingLabel, { color: colors.textMuted }]}>Your Rig</Text>
                  {isSFCollector ? (
                    <TouchableOpacity onPress={() => setShowRigPicker(true)} activeOpacity={0.7}>
                      <Text style={[styles.settingValue, { color: selectedRig ? colors.accent : colors.textMuted }]}>
                        {selectedRig ? `Rig ${selectedRig}` : "No rig assigned — tap to pick"}
                      </Text>
                    </TouchableOpacity>
                  ) : rigOptions.length > 0 ? (
                    <SelectPicker
                      label="" options={rigOptions} selectedValue={selectedRig}
                      onValueChange={handleSelectRig} placeholder="Select your rig..." testID="rig-picker"
                    />
                  ) : (
                    <Text style={[styles.noRigText, { color: colors.textMuted }]}>No rigs assigned</Text>
                  )}
                  {!isSFCollector && (
                    <Text style={[styles.settingHint, { color: colors.textMuted }]}>
                      {rigOptions.length} available rigs
                    </Text>
                  )}
                </View>
              </View>
            </>
          )}
        </View>

        {selectedCollectorName !== "" && selectedRig !== "" && (
          <View style={[styles.profileBadge, { backgroundColor: colors.accentSoft, borderColor: colors.accentDim }]}>
            <Check size={12} color={colors.accent} />
            <Text style={[styles.profileBadgeText, { color: colors.accent }]}>
              {selectedCollectorName} · {selectedRig}
            </Text>
          </View>
        )}

        {isAdmin && (
          <TouchableOpacity
            style={[styles.adminLogoutRow, { borderColor: colors.cancel + '30' }]}
            onPress={handleAdminLogout}
            activeOpacity={0.7}
          >
            <LogOut size={14} color={colors.cancel} />
            <Text style={[styles.adminLogoutText, { color: colors.cancel }]}>Logout Admin</Text>
          </TouchableOpacity>
        )}


        <View style={styles.sectionGap} />
        <SectionHeader label={t("appearance_language", "Appearance & Language")} icon={<Palette size={11} color={colors.textMuted} />} />
        <TouchableOpacity
          style={[...cardStyle, styles.displaySettingsRow]}
          onPress={() => setShowDisplayModal(true)}
          activeOpacity={0.75}
          testID="theme-toggle"
          accessibilityRole="button"
          accessibilityLabel="Open display settings"
          accessibilityHint="Change theme, language, and status bar options."
        >
          <View style={[styles.settingIconWrap, { backgroundColor: colors.accentSoft }]}>
            <Palette size={16} color={colors.accent} />
          </View>
          <View style={styles.settingContent}>
            <Text style={[styles.settingLabel, { color: colors.textMuted }]}>{t("display_settings", "Display Settings")}</Text>
            <Text style={[styles.settingSubLabel, { color: colors.textSecondary }]}>
              {THEME_META[resolvedMode].label} · {locale.toUpperCase()}
            </Text>
          </View>
          <ChevronRight size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.sectionGap} />
        <SectionHeader label={t("quick_actions", "Quick Actions")} icon={<Zap size={11} color={colors.textMuted} />} />

        <View style={styles.quickGrid}>
          <QuickCard title="Slack" subtitle="Team chat" icon={<MessageSquare size={18} color={colors.slack} />} iconBg={colors.slackBg} onPress={openSlack} testID="slack-link" colors={colors} />
          <QuickCard title="Hubstaff" subtitle="Time track" icon={<Clock size={18} color={colors.hubstaff} />} iconBg={colors.hubstaffBg} onPress={openHubstaff} testID="hubstaff-link" colors={colors} />
          <QuickCard title="Sheets" subtitle="Open app" icon={<FileText size={18} color={colors.sheets} />} iconBg={colors.sheetsBg} onPress={openSheets} testID="sheets-link" colors={colors} />
          <QuickCard title={t("install_app", "Install App")} subtitle="Home screen" icon={<Download size={18} color={colors.accent} />} iconBg={colors.accentSoft} onPress={openInstallApp} testID="install-link" colors={colors} />
          <QuickCard title="Report" subtitle="Rig issue" icon={<AlertTriangle size={18} color={colors.airtable} />} iconBg={colors.airtableBg} onPress={openAirtableRigIssue} testID="airtable-link" colors={colors} />
        </View>

        {configured && (
          <>
            <View style={styles.sectionGap} />
            <SectionHeader label={isAdmin ? "Admin Dashboard" : "System Overview"} icon={<Shield size={11} color={colors.textMuted} />} />
            <AdminOverview colors={colors} isAdmin={isAdmin} />
          </>
        )}

        {configured && isAdmin && (
          <>
            <View style={styles.sectionGap} />
            <SectionHeader label="Admin Tools" icon={<Activity size={11} color={colors.textMuted} />} />
            <AdminToolsPanel colors={colors} collectors={collectors} tasks={tasks} />
          </>
        )}

        {configured && (
          <>
            <View style={styles.sectionGap} />
            <SectionHeader label="Data Viewer" icon={<Database size={11} color={colors.textMuted} />} />
            <View style={cardStyle}>
              {SHEET_PAGES.map((page, idx) => {
                const IconComp = page.id === "log" ? ClipboardList : BarChart3;
                return (
                  <View key={page.id}>
                    {idx > 0 && <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />}
                    <TouchableOpacity
                      style={styles.sheetRow}
                      onPress={() => openSheetPage(page.id, page.label)}
                      activeOpacity={0.7}
                      testID={`sheet-${page.id}`}
                    >
                      <View style={[styles.sheetIcon, { backgroundColor: colors.sheetsBg }]}>
                        <IconComp size={15} color={colors.sheets} />
                      </View>
                      <View style={styles.sheetInfo}>
                        <Text style={[styles.sheetRowText, { color: colors.textPrimary }]}>{page.label}</Text>
                        <Text style={[styles.sheetDesc, { color: colors.textMuted }]}>{page.desc}</Text>
                      </View>
                      <ExternalLink size={13} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <View style={styles.sectionGap} />

        {/* Reload app — safe navigation to / (avoids deep-URL 404 on web) */}
        <TouchableOpacity
          style={[styles.clearCacheBtn, { borderColor: colors.accentDim, backgroundColor: colors.accentSoft }]}
          onPress={handleReloadApp}
          activeOpacity={0.7}
        >
          <RefreshCw size={13} color={colors.accent} />
          <Text style={[styles.clearCacheText, { color: colors.accent }]}>Refresh App</Text>
        </TouchableOpacity>

        <View style={{ height: DesignTokens.spacing.sm }} />

        <TouchableOpacity
          style={[styles.clearCacheBtn, { borderColor: colors.border }]}
          onPress={handleClearCache}
          activeOpacity={0.7}
        >
          <RotateCcw size={13} color={colors.textMuted} />
          <Text style={[styles.clearCacheText, { color: colors.textMuted }]}>Clear Local Cache</Text>
        </TouchableOpacity>

          <View style={styles.bottomSpacer} />
        </ScrollView>

        <DisplaySettingsModal
          visible={showDisplayModal}
          onClose={() => setShowDisplayModal(false)}
          resolvedMode={resolvedMode}
          onSelectTheme={handleSelectTheme}
          locale={locale}
          onSelectLocale={handleSelectLocale}
          hideStatusBar={hideStatusBar}
          onToggleStatusBar={handleToggleStatusBar}
        />

        <AdminPasswordModal
          visible={showAdminModal}
          onClose={() => setShowAdminModal(false)}
          onAuthenticate={handleAdminAuth}
        />

        <RigAssignmentModal
          visible={showRigPicker}
          onClose={() => setShowRigPicker(false)}
        />
      </Animated.View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  content: {
    paddingHorizontal: DesignTokens.spacing.xl,
    paddingTop: DesignTokens.spacing.lg,
    paddingBottom: 150,
    gap: DesignTokens.spacing.xs,
  },

  // Header card — matches Live tab style
  pageHeader: {
    marginBottom: DesignTokens.spacing.md,
    padding: DesignTokens.spacing.lg,
    borderRadius: DesignTokens.radius.xl,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 6,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: DesignTokens.spacing.xs,
  },
  headerTag: {
    alignSelf: "flex-start",
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  headerTagText: {
    fontSize: 12,
    fontWeight: "700" as const,
    letterSpacing: 0.7,
  },
  pageHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: DesignTokens.spacing.sm,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: DesignTokens.spacing.xs,
  },
  brandLogo: { width: 28, height: 28, borderRadius: 8 },
  brandText: {
    fontSize: DesignTokens.fontSize.largeTitle,
    fontWeight: "700" as const,
    letterSpacing: 0.1,
  },
  brandSub: {
    fontSize: DesignTokens.fontSize.footnote,
    fontWeight: "500" as const,
    letterSpacing: 0.3,
    marginLeft: 38,
    marginTop: 3,
  },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: DesignTokens.radius.pill,
    borderWidth: 1,
  },
  adminBadgeText: {
    fontSize: DesignTokens.fontSize.caption2,
    fontWeight: "600" as const,
    letterSpacing: 0.3,
  },

  sectionGap: { height: DesignTokens.spacing.lg },

  // iOS grouped card — shadow only, no border
  card: {
    borderRadius: DesignTokens.radius.xl,
    overflow: "hidden",
    ...DesignTokens.shadow.float,
  },

  // Settings rows — iOS-style (44pt+ height, inset separator)
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: DesignTokens.spacing.lg,
    paddingVertical: DesignTokens.spacing.md,
    gap: DesignTokens.spacing.md,
    minHeight: 54,
  },
  settingIconWrap: {
    width: 36,
    height: 36,
    borderRadius: DesignTokens.radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  settingContent: { flex: 1 },
  settingLabel: {
    fontSize: DesignTokens.fontSize.caption1,
    letterSpacing: 0.3,
    marginBottom: 4,
    textTransform: "uppercase",
    fontWeight: "700" as const,
  },
  settingSubLabel: {
    fontSize: DesignTokens.fontSize.subhead,
    fontWeight: "600" as const,
    lineHeight: 20,
  },
  settingHint: {
    fontSize: DesignTokens.fontSize.caption2,
    marginTop: 4,
    letterSpacing: 0.1,
  },
  // Inset separator: starts after icon column (16 + 36 + 12 = 64)
  settingDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
  },
  noRigText: {
    fontSize: DesignTokens.fontSize.caption1,
    fontStyle: "italic" as const,
    paddingVertical: 4,
  },
  settingValue: {
    fontSize: DesignTokens.fontSize.callout,
    fontWeight: "500" as const,
    paddingVertical: 4,
  },
  profileBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: DesignTokens.radius.pill,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  profileBadgeText: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "600" as const,
  },
  adminLogoutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: DesignTokens.radius.sm,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  adminLogoutText: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "600" as const,
  },
  displaySettingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: DesignTokens.spacing.md,
    paddingHorizontal: DesignTokens.spacing.lg,
    paddingVertical: DesignTokens.spacing.md,
    minHeight: 54,
  },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: DesignTokens.spacing.sm },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: DesignTokens.spacing.lg,
    paddingVertical: DesignTokens.spacing.md,
    gap: DesignTokens.spacing.md,
    minHeight: 52,
  },
  sheetDivider: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
  sheetIcon: {
    width: 34,
    height: 34,
    borderRadius: DesignTokens.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetInfo: { flex: 1 },
  sheetRowText: { fontSize: DesignTokens.fontSize.footnote, fontWeight: "500" as const },
  sheetDesc: { fontSize: DesignTokens.fontSize.caption2, marginTop: 2 },
  clearCacheBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: DesignTokens.radius.md,
    borderWidth: 1,
  },
  clearCacheText: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "500" as const,
  },
  bottomSpacer: { height: 20 },
});
