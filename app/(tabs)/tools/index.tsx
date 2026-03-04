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
import { AdminOverview } from "@/components/tools/AdminOverview";
import { AdminToolsPanel } from "@/components/tools/AdminToolsPanel";
import { SectionHeader } from "@/components/tools/SectionHeader";
import { QuickCard } from "@/components/tools/QuickCard";
import { AdminPasswordModal } from "@/components/tools/AdminPasswordModal";
import { DisplaySettingsModal } from "@/components/tools/DisplaySettingsModal";
import { buildRigSortValue, SHEET_PAGES } from "@/components/tools/toolConstants";
import { clearAllCaches } from "@/services/googleSheets";
import { Image } from "expo-image";

const FONT_MONO = DesignTokens.fontMono;

export default function ToolsScreen() {
  const { colors, resolvedMode, setThemeMode } = useTheme();
  const { t, locale, setLocale } = useLocale();
  const { hideStatusBar, setHideStatusBar } = useUiPrefs();
  const {
    collectors, tasks, selectedCollectorName, selectedRig,
    selectCollector, setSelectedRig, configured, isAdmin, authenticateAdmin, logoutAdmin,
  } = useCollection();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showDisplayModal, setShowDisplayModal] = useState(false);
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

  const rigOptions = useMemo(() => {
    const rigSet = new Set<string>();
    for (const collector of collectors) {
      for (const rig of collector.rigs ?? []) {
        const clean = String(rig ?? "").trim();
        if (clean) rigSet.add(clean);
      }
    }
    if (selectedRig) rigSet.add(selectedRig);
    return Array.from(rigSet)
      .sort((a, b) => {
        const [aNum, aText] = buildRigSortValue(a);
        const [bNum, bText] = buildRigSortValue(b);
        if (aNum !== bNum) return aNum - bNum;
        return aText.localeCompare(bText, undefined, { numeric: true, sensitivity: "base" });
      })
      .map((rig) => ({ value: rig, label: rig }));
  }, [collectors, selectedRig]);

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

  const cardStyle = [styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, shadowColor: colors.shadow }];

  return (
    <ScreenContainer>
      <Animated.View style={[styles.flex, { opacity: fadeAnim }]}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.pageHeader, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View pointerEvents="none" accessible={false} style={[styles.headerGlow, { backgroundColor: colors.accentSoft }]} />
          <View>
            <View style={[styles.headerTag, { backgroundColor: colors.accentSoft, borderColor: colors.accentDim }]}>
              <Text style={[styles.headerTagText, { color: colors.accent }]}>SETTINGS</Text>
            </View>
            <View style={styles.brandRow}>
              <Image source={require("../../../assets/images/icon.png")} style={styles.brandLogo} contentFit="contain" />
              <Text style={[styles.brandText, { color: colors.accent, fontFamily: "Lexend_700Bold" }]}>{t("tools", "Tools")}</Text>
            </View>
            <Text style={[styles.brandSub, { color: colors.textSecondary, fontFamily: "Lexend_400Regular" }]}>{t("settings", "Settings & Utilities")}</Text>
          </View>
          <View style={styles.pageHeaderRight}>
            {isAdmin && (
              <View style={[styles.adminBadge, { backgroundColor: colors.accentSoft, borderColor: colors.accentDim }]}>
                <Shield size={9} color={colors.accent} />
                <Text style={[styles.adminBadgeText, { color: colors.accent, fontFamily: FONT_MONO }]}>ADMIN</Text>
              </View>
            )}
          </View>
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
                  {rigOptions.length > 0 ? (
                    <SelectPicker
                      label="" options={rigOptions} selectedValue={selectedRig}
                      onValueChange={handleSelectRig} placeholder="Select your rig..." testID="rig-picker"
                    />
                  ) : (
                    <Text style={[styles.noRigText, { color: colors.textMuted }]}>No rigs assigned</Text>
                  )}
                  <Text style={[styles.settingHint, { color: colors.textMuted }]}>
                    {rigOptions.length} available rigs
                  </Text>
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
      </Animated.View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  content: { paddingHorizontal: DesignTokens.spacing.xl, paddingTop: 14, paddingBottom: 120 },
  pageHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: DesignTokens.spacing.lg, padding: DesignTokens.spacing.lg,
    borderRadius: DesignTokens.radius.xl, borderWidth: 1, overflow: "hidden",
  },
  headerGlow: {
    position: "absolute",
    top: -44,
    left: -24,
    right: -24,
    height: 120,
    opacity: 0.75,
    borderBottomLeftRadius: 70,
    borderBottomRightRadius: 70,
  },
  pageHeaderRight: { alignItems: "flex-end", gap: DesignTokens.spacing.xs },
  headerTag: {
    alignSelf: "flex-start",
    borderRadius: DesignTokens.radius.xs,
    borderWidth: 1,
    paddingHorizontal: DesignTokens.spacing.sm,
    paddingVertical: 3,
    marginBottom: 2,
  },
  headerTagText: { fontSize: 9, fontWeight: "800" as const, letterSpacing: 1.1 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandLogo: { width: 26, height: 26, borderRadius: 8 },
  brandText: { fontSize: 34, fontWeight: "700" as const, letterSpacing: 0.2 },
  brandSub: { fontSize: 12, fontWeight: "500" as const, letterSpacing: 0.7, marginTop: 2, textTransform: "uppercase" },
  adminBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  adminBadgeText: { fontSize: 8, fontWeight: "800" as const, letterSpacing: 1.2 },
  sectionGap: { height: DesignTokens.spacing.xl },
  card: {
    borderRadius: DesignTokens.radius.xl, borderWidth: 1, overflow: "hidden", marginBottom: 2,
    ...DesignTokens.shadow.card,
  },
  settingRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: DesignTokens.spacing.md, gap: 10 },
  settingIconWrap: { width: 36, height: 36, borderRadius: DesignTokens.radius.md, alignItems: "center", justifyContent: "center" },
  settingContent: { flex: 1 },
  settingLabel: { fontSize: 10, letterSpacing: 0.4, marginBottom: 4, textTransform: "uppercase", fontWeight: "600" as const },
  settingSubLabel: { fontSize: 13, fontWeight: "600" as const, lineHeight: 18 },
  settingHint: { fontSize: 10, marginTop: 5, letterSpacing: 0.2 },
  settingDivider: { height: 1, marginLeft: 60 },
  noRigText: { fontSize: 12, fontStyle: "italic" as const, paddingVertical: 4 },
  profileBadge: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: DesignTokens.spacing.sm,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: DesignTokens.radius.sm, borderWidth: 1, alignSelf: "flex-start",
  },
  profileBadgeText: { fontSize: 11, fontWeight: "600" as const },
  adminLogoutRow: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignSelf: "flex-start",
  },
  adminLogoutText: { fontSize: 12, fontWeight: "600" as const },
  displaySettingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  sheetRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  sheetDivider: { height: 1, marginLeft: 58 },
  sheetIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sheetInfo: { flex: 1 },
  sheetRowText: { fontSize: 13, fontWeight: "500" as const },
  sheetDesc: { fontSize: 10, marginTop: 2 },
  clearCacheBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 10, borderRadius: DesignTokens.radius.md, borderWidth: 1,
  },
  clearCacheText: { fontSize: 12, fontWeight: "500" as const },
  bottomSpacer: { height: 20 },
});
