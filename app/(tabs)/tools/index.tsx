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
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Switch,
} from "react-native";
import {
  MessageSquare,
  Clock,
  AlertTriangle,
  Palette,
  User,
  Cpu,
  Check,
  Play,
  Pause,
  RotateCcw,
  BarChart3,
  ExternalLink,
  Database,
  Zap,
  Timer,
  Shield,
  Activity,
  Target,
  FileText,
  ChevronDown,
  ChevronRight,
  Download,
  ClipboardList,
  Lock,
  LogOut,
  Users,
  Star,
  X,
  Search,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useTheme, THEME_META, type ThemeMode } from "@/providers/ThemeProvider";
import { useLocale, type LocaleCode } from "@/providers/LocaleProvider";
import { useUiPrefs } from "@/providers/UiPrefsProvider";
import { useCollection } from "@/providers/CollectionProvider";
import { DesignTokens } from "@/constants/colors";
import ScreenContainer from "@/components/ScreenContainer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminDashboardData,
  fetchTaskActualsData,
  fetchFullLog,
  fetchLeaderboard,
  clearAllCaches,
  forceServerRepull,
  pushLiveAlert,
  adminAssignTask,
  adminCancelTask,
  adminEditHours,
  grantCollectorAward,
} from "@/services/googleSheets";
import { AdminDashboardData, CollectorSummary, TaskActualRow, FullLogEntry, LeaderboardEntry, Collector, Task } from "@/types";
import SelectPicker from "@/components/SelectPicker";
import { Image } from "expo-image";

const FONT_MONO = DesignTokens.fontMono;

const COMPLETED_TASK_STATUSES = new Set(["DONE", "COMPLETED", "COMPLETE", "FINISHED", "CLOSED"]);
const RECOLLECT_TASK_STATUSES = new Set(["RECOLLECT", "NEEDS_RECOLLECTION", "NEEDS_RECOLLECT", "RECOLLECTION"]);
const OPEN_TASK_STATUSES = new Set(["IN_PROGRESS", "INPROGRESS", "ACTIVE", "IP", "OPEN", "PARTIAL", "ASSIGNED", "IN_QUEUE"]);

function normalizeTaskStatus(status: string): string {
  return String(status ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function buildRigSortValue(rig: string): [number, string] {
  const clean = String(rig ?? "").trim();
  const match = clean.match(/(\d+)(?!.*\d)/);
  const numberPart = match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  return [Number.isFinite(numberPart) ? numberPart : Number.MAX_SAFE_INTEGER, clean.toLowerCase()];
}

/** IDs must match sheet-viewer: log = Assignment Log (Collector Task Assignments Log), taskActuals = Task Actuals (Task Actuals | Redashpull). */
const SHEET_PAGES = [
  { id: "log", label: "Assignment Log", icon: ClipboardList, desc: "View task assignment history" },
  { id: "taskActuals", label: "Task Actuals", icon: BarChart3, desc: "Collection progress by task" },
];

const TIMER_OPTIONS = [
  { mins: 5, label: "5 min", color: "#5EBD8A" },
  { mins: 10, label: "10 min", color: "#4A6FA5" },
  { mins: 15, label: "15 min", color: "#7C3AED" },
  { mins: 20, label: "20 min", color: "#D4A843" },
  { mins: 25, label: "25 min", color: "#C47A3A" },
  { mins: 30, label: "30 min", color: "#C53030" },
  { mins: 45, label: "45 min", color: "#6B21A8" },
  { mins: 60, label: "60 min", color: "#1D4ED8" },
];

const AWARD_OPTIONS = [
  "Iron Consistency",
  "Speed Runner",
  "Long Session Pro",
  "Zero Downtime",
  "Quality King/Queen",
  "Team MVP",
];

const SectionHeader = React.memo(function SectionHeader({ label, icon }: { label: string; icon?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={sectionStyles.row}>
      {icon}
      <Text style={[sectionStyles.label, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
});

const sectionStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10, marginTop: 4, paddingHorizontal: 2 },
  label: { fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: "700" as const },
});

function CompactTimer() {
  const { colors, isDark } = useTheme();
  const [selectedMinutes, setSelectedMinutes] = useState(10);
  const [secondsLeft, setSecondsLeft] = useState(10 * 60);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pickerFade = useRef(new Animated.Value(0)).current;

  const totalSeconds = selectedMinutes * 60;
  const progress = totalSeconds > 0 ? (totalSeconds - secondsLeft) / totalSeconds : 0;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  useEffect(() => {
    Animated.timing(progressAnim, { toValue: progress * 100, duration: 250, useNativeDriver: false }).start();
  }, [progress, progressAnim]);

  const start = useCallback(() => {
    if (finished) { setFinished(false); setSecondsLeft(selectedMinutes * 60); }
    setRunning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [finished, selectedMinutes]);

  const pause = useCallback(() => { setRunning(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }, []);

  const reset = useCallback(() => {
    setRunning(false); setFinished(false); setSecondsLeft(selectedMinutes * 60);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [selectedMinutes]);

  const selectDuration = useCallback((mins: number) => {
    setSelectedMinutes(mins);
    setSecondsLeft(mins * 60);
    setRunning(false);
    setFinished(false);
    setShowPicker(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const togglePicker = useCallback(() => {
    if (running) return;
    const next = !showPicker;
    setShowPicker(next);
    Animated.timing(pickerFade, { toValue: next ? 1 : 0, duration: 200, useNativeDriver: false }).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [running, showPicker, pickerFade]);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setRunning(false);
          setFinished(true);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [running]);

  const activeOption = TIMER_OPTIONS.find(p => p.mins === selectedMinutes);
  const ringColor = finished ? colors.cancel : running ? (activeOption?.color ?? colors.accent) : colors.textMuted;

  return (
    <View style={[timerStyles.bar, {
      backgroundColor: colors.bgCard,
      borderColor: finished ? colors.cancel + '30' : colors.border,
      shadowColor: colors.shadow,
    }]}>
      <View style={timerStyles.topRow}>
        <Text style={[timerStyles.time, {
          color: finished ? colors.cancel : running ? colors.textPrimary : colors.textSecondary,
          fontFamily: FONT_MONO,
        }]}>
          {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </Text>
        {finished && <Text style={[timerStyles.doneTag, { color: colors.cancel, fontFamily: FONT_MONO }]}>DONE</Text>}

        <TouchableOpacity
          style={[timerStyles.durationBtn, {
            backgroundColor: isDark ? (activeOption?.color ?? colors.accent) + '18' : (activeOption?.color ?? colors.accent) + '10',
            borderColor: (activeOption?.color ?? colors.accent) + '40',
            opacity: running ? 0.5 : 1,
          }]}
          onPress={togglePicker}
          activeOpacity={0.7}
          disabled={running}
        >
          <Text style={[timerStyles.durationText, {
            color: activeOption?.color ?? colors.accent,
            fontFamily: FONT_MONO,
          }]}>
            {activeOption?.label ?? `${selectedMinutes}m`}
          </Text>
          <ChevronDown size={12} color={activeOption?.color ?? colors.accent} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[timerStyles.resetBtn, { backgroundColor: colors.bgInput }]}
          onPress={reset}
          activeOpacity={0.75}
        >
          <RotateCcw size={13} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[timerStyles.playBtn, {
            backgroundColor: finished ? colors.cancel : (activeOption?.color ?? colors.accent),
          }]}
          onPress={running ? pause : start}
          activeOpacity={0.85}
        >
          {running ? <Pause size={14} color={colors.white} /> : <Play size={14} color={colors.white} />}
        </TouchableOpacity>
      </View>

      {showPicker && !running && (
        <Animated.View style={[timerStyles.pickerWrap, {
          opacity: pickerFade,
          maxHeight: pickerFade.interpolate({ inputRange: [0, 1], outputRange: [0, 120] }),
        }]}>
          <View style={timerStyles.pickerGrid}>
            {TIMER_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.mins}
                style={[timerStyles.pickerChip, {
                  backgroundColor: opt.mins === selectedMinutes ? opt.color + '20' : colors.bgInput,
                  borderColor: opt.mins === selectedMinutes ? opt.color + '50' : 'transparent',
                }]}
                onPress={() => selectDuration(opt.mins)}
                activeOpacity={0.7}
              >
                <Text style={[timerStyles.pickerLabel, {
                  color: opt.mins === selectedMinutes ? opt.color : colors.textMuted,
                  fontWeight: opt.mins === selectedMinutes ? "700" as const : "400" as const,
                }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      )}

      <View style={[timerStyles.progressTrack, { backgroundColor: colors.bgInput }]}>
        <Animated.View style={[timerStyles.progressFill, {
          backgroundColor: ringColor,
          width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
        }]} />
      </View>
    </View>
  );
}

function AdminPasswordModal({ visible, onClose, onAuthenticate }: {
  visible: boolean;
  onClose: () => void;
  onAuthenticate: (password: string) => Promise<boolean>;
}) {
  const { colors } = useTheme();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!password.trim()) return;
    setLoading(true);
    setError(false);
    const success = await onAuthenticate(password.trim());
    setLoading(false);
    if (success) {
      setPassword("");
      onClose();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      setError(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [password, onAuthenticate, onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={adminModalStyles.overlay}>
        <View style={[adminModalStyles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={adminModalStyles.header}>
            <View style={[adminModalStyles.iconWrap, { backgroundColor: colors.accentSoft }]}>
              <Lock size={20} color={colors.accent} />
            </View>
            <Text style={[adminModalStyles.title, { color: colors.textPrimary }]}>Admin Access</Text>
            <Text style={[adminModalStyles.subtitle, { color: colors.textMuted }]}>Enter admin password to continue</Text>
          </View>
          <TextInput
            style={[adminModalStyles.input, {
              backgroundColor: colors.bgInput,
              borderColor: error ? colors.cancel : colors.border,
              color: colors.textPrimary,
            }]}
            value={password}
            onChangeText={(t) => { setPassword(t); setError(false); }}
            placeholder="Enter password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            keyboardType="number-pad"
            autoFocus
            testID="admin-password-input"
          />
          {error && (
            <Text style={[adminModalStyles.errorText, { color: colors.cancel }]}>Incorrect password</Text>
          )}
          <View style={adminModalStyles.actions}>
            <TouchableOpacity
              style={[adminModalStyles.cancelBtn, { borderColor: colors.border }]}
              onPress={() => { setPassword(""); setError(false); onClose(); }}
              activeOpacity={0.7}
            >
              <Text style={[adminModalStyles.cancelText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[adminModalStyles.submitBtn, { backgroundColor: colors.accent }]}
              onPress={handleSubmit}
              activeOpacity={0.8}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={[adminModalStyles.submitText, { color: colors.white }]}>Unlock</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DisplaySettingsModal({
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

  const themeEntries = Object.entries(THEME_META) as [Exclude<ThemeMode, "system">, typeof THEME_META["light"]][];
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
      <View style={displayModalStyles.overlay}>
        <View
          style={[displayModalStyles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
          accessible
          accessibilityViewIsModal
          accessibilityLabel={t("display_settings", "Display Settings")}
          accessibilityHint="Adjust app theme, language, and visual behavior."
        >
          <View style={displayModalStyles.header}>
            <Text style={[displayModalStyles.title, { color: colors.textPrimary }]}>{t("display_settings", "Display Settings")}</Text>
            <TouchableOpacity
              style={[displayModalStyles.closeBtn, { borderColor: colors.border }]}
              onPress={onClose}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Close display settings"
            >
              <X size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text accessibilityRole="header" style={[displayModalStyles.sectionLabel, { color: colors.textMuted }]}>{t("theme", "Theme")}</Text>
          <View style={[displayModalStyles.listCard, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
            {themeEntries.map(([key, meta], idx) => (
              <View key={key}>
                {idx > 0 && <View style={[displayModalStyles.divider, { backgroundColor: colors.border }]} />}
                <TouchableOpacity
                  style={displayModalStyles.row}
                  onPress={() => onSelectTheme(key)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Theme ${meta.label}`}
                  accessibilityHint={resolvedMode === key ? "Currently selected." : "Double tap to apply this theme."}
                  accessibilityState={{ selected: resolvedMode === key }}
                >
                  <Text style={[displayModalStyles.rowLabel, { color: colors.textPrimary }]}>{meta.label}</Text>
                  <Switch
                    value={resolvedMode === key}
                    onValueChange={(next) => {
                      if (next) onSelectTheme(key);
                    }}
                    trackColor={{ false: colors.border, true: colors.accent + "66" }}
                    thumbColor={resolvedMode === key ? colors.accent : colors.white}
                    ios_backgroundColor={colors.border}
                    accessible={false}
                  />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <Text accessibilityRole="header" style={[displayModalStyles.sectionLabel, { color: colors.textMuted, marginTop: 14 }]}>{t("language", "Language")}</Text>
          <View style={[displayModalStyles.listCard, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
            {languageEntries.map((entry, idx) => (
              <View key={entry.code}>
                {idx > 0 && <View style={[displayModalStyles.divider, { backgroundColor: colors.border }]} />}
                <TouchableOpacity
                  style={displayModalStyles.row}
                  onPress={() => onSelectLocale(entry.code)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Language ${entry.label}`}
                  accessibilityHint={locale === entry.code ? "Currently selected." : "Double tap to switch language."}
                  accessibilityState={{ selected: locale === entry.code }}
                >
                  <Text style={[displayModalStyles.rowLabel, { color: colors.textPrimary }]}>{entry.label}</Text>
                  <Switch
                    value={locale === entry.code}
                    onValueChange={(next) => {
                      if (next) onSelectLocale(entry.code);
                    }}
                    trackColor={{ false: colors.border, true: colors.accent + "66" }}
                    thumbColor={locale === entry.code ? colors.accent : colors.white}
                    ios_backgroundColor={colors.border}
                    accessible={false}
                  />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <Text accessibilityRole="header" style={[displayModalStyles.sectionLabel, { color: colors.textMuted, marginTop: 14 }]}>System</Text>
          <View style={[displayModalStyles.listCard, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
            <TouchableOpacity
              style={displayModalStyles.row}
              onPress={() => onToggleStatusBar(!hideStatusBar)}
              activeOpacity={0.75}
              accessibilityRole="switch"
              accessibilityLabel={t("hide_status_bar", "Hide Status Bar")}
              accessibilityState={{ checked: hideStatusBar }}
              accessibilityHint="Controls whether the phone status bar is hidden while using TaskFlow."
            >
              <Text style={[displayModalStyles.rowLabel, { color: colors.textPrimary }]}>{t("hide_status_bar", "Hide Status Bar")}</Text>
              <Switch
                value={hideStatusBar}
                onValueChange={onToggleStatusBar}
                trackColor={{ false: colors.border, true: colors.accent + "66" }}
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

const adminModalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center", padding: DesignTokens.spacing.xxl },
  card: { width: "100%", maxWidth: 340, borderRadius: DesignTokens.radius.xl, borderWidth: 1, padding: DesignTokens.spacing.xxl },
  header: { alignItems: "center", marginBottom: 20 },
  iconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  title: { fontSize: 18, fontWeight: "700" as const, marginBottom: 4 },
  subtitle: { fontSize: 13, textAlign: "center" },
  input: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 18, fontWeight: "600" as const, borderWidth: 1, textAlign: "center", letterSpacing: 4 },
  errorText: { fontSize: 12, textAlign: "center", marginTop: 8, fontWeight: "500" as const },
  actions: { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  cancelText: { fontSize: 14, fontWeight: "500" as const },
  submitBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  submitText: { fontSize: 14, fontWeight: "700" as const },
});

const displayModalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.42)", justifyContent: "center", alignItems: "center", padding: 18 },
  card: { width: "100%", maxWidth: 380, borderRadius: 20, borderWidth: 1, padding: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  title: { fontSize: 17, fontWeight: "700" as const },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: { fontSize: 10, letterSpacing: 1, fontWeight: "700" as const, marginBottom: 8, marginTop: 6, textTransform: "uppercase" },
  listCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10 },
  rowLabel: { fontSize: 14, fontWeight: "600" as const },
  divider: { height: 1 },
});

function AdminOverview({ colors, isAdmin }: { colors: ReturnType<typeof useTheme>["colors"]; isAdmin: boolean }) {
  const { configured } = useCollection();

  const adminQuery = useQuery<AdminDashboardData>({
    queryKey: ["adminDashboard"],
    queryFn: fetchAdminDashboardData,
    enabled: configured,
    staleTime: 60000,
    retry: 1,
  });

  const taskActualsQuery = useQuery<TaskActualRow[]>({
    queryKey: ["adminTaskActualsOverview"],
    queryFn: fetchTaskActualsData,
    enabled: configured,
    staleTime: 60000,
    retry: 1,
  });

  const data = adminQuery.data;
  const taskActuals = useMemo(() => taskActualsQuery.data ?? [], [taskActualsQuery.data]);

  const derivedCounts = useMemo(() => {
    if (taskActuals.length === 0) return null;
    let totalTasks = 0;
    let completedTasks = 0;
    let recollectTasks = 0;
    let inProgressTasks = 0;

    for (const task of taskActuals) {
      totalTasks += 1;
      const status = normalizeTaskStatus(task.status);
      const remainingHours = Number(task.remainingHours) || 0;

      if (COMPLETED_TASK_STATUSES.has(status)) {
        completedTasks += 1;
        continue;
      }
      if (RECOLLECT_TASK_STATUSES.has(status)) {
        recollectTasks += 1;
        continue;
      }
      if (OPEN_TASK_STATUSES.has(status) || remainingHours > 0) {
        inProgressTasks += 1;
      }
    }

    return { totalTasks, completedTasks, recollectTasks, inProgressTasks };
  }, [taskActuals]);

  if (adminQuery.isLoading) {
    return (
      <View style={adminStyles.loadingWrap}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={[adminStyles.loadingText, { color: colors.textMuted }]}>Loading dashboard...</Text>
      </View>
    );
  }

  if (!data) return null;

  const totalTasks = derivedCounts?.totalTasks ?? data.totalTasks;
  const completedTasks = derivedCounts?.completedTasks ?? data.completedTasks;
  const recollectTasks = derivedCounts?.recollectTasks ?? data.recollectTasks;
  const inProgressTasks = derivedCounts?.inProgressTasks ?? data.inProgressTasks;

  const items = [
    { label: "Total Tasks", value: String(totalTasks), color: colors.textPrimary, icon: <FileText size={14} color={colors.accent} /> },
    { label: "Completed", value: String(completedTasks), color: colors.complete, icon: <Check size={14} color={colors.complete} /> },
    { label: "In Progress", value: String(inProgressTasks), color: colors.accent, icon: <Activity size={14} color={colors.accent} /> },
    { label: "Recollect", value: String(recollectTasks), color: colors.cancel, icon: <AlertTriangle size={14} color={colors.cancel} /> },
  ];

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <View style={[adminStyles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, shadowColor: colors.shadow }]}>
      <View style={adminStyles.headerRow}>
        <View style={adminStyles.headerLeft}>
          <Shield size={14} color={colors.accent} />
          <Text style={[adminStyles.headerText, { color: colors.accent }]}>SYSTEM OVERVIEW</Text>
        </View>
        <Text style={[adminStyles.rateText, { color: colors.complete }]}>{completionRate}%</Text>
      </View>

      <View style={adminStyles.grid}>
        {items.map((item, idx) => (
          <View key={idx} style={[adminStyles.gridItem, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
            <View style={adminStyles.gridItemIcon}>{item.icon}</View>
            <Text style={[adminStyles.gridValue, { color: item.color }]}>{item.value}</Text>
            <Text style={[adminStyles.gridLabel, { color: colors.textMuted }]}>{item.label}</Text>
          </View>
        ))}
      </View>

      {data.recollections && data.recollections.length > 0 && (
        <View style={[adminStyles.recollectSection, { borderTopColor: colors.border }]}>
          <Text style={[adminStyles.recollectTitle, { color: colors.cancel }]}>
            PENDING RECOLLECTIONS ({data.recollections.length})
          </Text>
          {data.recollections.slice(0, 5).map((item, idx) => (
            <Text key={idx} style={[adminStyles.recollectItem, { color: colors.textSecondary }]} numberOfLines={1}>
              {item}
            </Text>
          ))}
          {data.recollections.length > 5 && (
            <Text style={[adminStyles.recollectMore, { color: colors.textMuted }]}>
              + {data.recollections.length - 5} more
            </Text>
          )}
        </View>
      )}

      {isAdmin && data.collectorSummary && data.collectorSummary.length > 0 && (
        <View style={[adminStyles.collectorSection, { borderTopColor: colors.border }]}>
          <View style={adminStyles.collectorHeader}>
            <Users size={12} color={colors.accent} />
            <Text style={[adminStyles.collectorTitle, { color: colors.accent }]}>
              ALL COLLECTORS ({data.totalCollectors ?? data.collectorSummary.length})
            </Text>
            <Text style={[adminStyles.totalHours, { color: colors.complete }]}>
              {(data.totalHoursUploaded ?? 0).toFixed(2)}h total
            </Text>
          </View>
          {data.collectorSummary.map((c: CollectorSummary, idx: number) => (
            <View key={idx} style={[adminStyles.collectorRow, { borderBottomColor: colors.border }]}>
              <View style={adminStyles.collectorInfo}>
                <Text style={[adminStyles.collectorName, { color: colors.textPrimary }]} numberOfLines={1}>{c.name}</Text>
                <Text style={[adminStyles.collectorRig, { color: colors.textMuted }]}>{c.rig}</Text>
              </View>
              <View style={adminStyles.collectorStats}>
                <Text style={[adminStyles.collectorHours, { color: colors.accent }]}>{c.hoursUploaded.toFixed(2)}h</Text>
                {c.rating ? (
                  <View style={adminStyles.ratingRow}>
                    <Star size={9} color={colors.gold} />
                    <Text style={[adminStyles.ratingText, { color: colors.gold }]}>{c.rating}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}

      {isAdmin && data.taskRequirements && data.taskRequirements.length > 0 && (
        <View style={[adminStyles.reqSection, { borderTopColor: colors.border }]}>
          <Text style={[adminStyles.reqTitle, { color: colors.mxOrange }]}>
            TASK REQUIREMENTS ({data.taskRequirements.length})
          </Text>
          {data.taskRequirements.slice(0, 10).map((req, idx) => (
            <View key={idx} style={[adminStyles.reqRow, { borderBottomColor: colors.border }]}>
              <Text style={[adminStyles.reqName, { color: colors.textSecondary }]} numberOfLines={1}>{req.taskName}</Text>
              <Text style={[adminStyles.reqHours, { color: colors.mxOrange }]}>{Number(req.requiredGoodHours).toFixed(2)}h req</Text>
            </View>
          ))}
          {data.taskRequirements.length > 10 && (
            <Text style={[adminStyles.recollectMore, { color: colors.textMuted }]}>
              + {data.taskRequirements.length - 10} more tasks
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const adminStyles = StyleSheet.create({
  card: {
    borderRadius: DesignTokens.radius.xl, borderWidth: 1, padding: DesignTokens.spacing.lg, marginBottom: 2,
    ...DesignTokens.shadow.card,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerText: { fontSize: 10, fontWeight: "700" as const, letterSpacing: 1.2 },
  rateText: { fontSize: 16, fontWeight: "700" as const },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  gridItem: {
    flex: 1, minWidth: "44%" as unknown as number, borderRadius: 10, padding: 10, borderWidth: 1, alignItems: "center",
  },
  gridItemIcon: { marginBottom: 4 },
  gridValue: { fontSize: 18, fontWeight: "700" as const },
  gridLabel: { fontSize: 9, fontWeight: "500" as const, marginTop: 2, letterSpacing: 0.3 },
  recollectSection: { borderTopWidth: 1, marginTop: 10, paddingTop: 10 },
  recollectTitle: { fontSize: 9, fontWeight: "700" as const, letterSpacing: 1, marginBottom: 6 },
  recollectItem: { fontSize: 11, lineHeight: 18, paddingLeft: 8 },
  recollectMore: { fontSize: 10, marginTop: 4, fontStyle: "italic" as const },
  collectorSection: { borderTopWidth: 1, marginTop: 12, paddingTop: 12 },
  collectorHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  collectorTitle: { fontSize: 9, fontWeight: "700" as const, letterSpacing: 1, flex: 1 },
  totalHours: { fontSize: 11, fontWeight: "600" as const },
  collectorRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1 },
  collectorInfo: { flex: 1 },
  collectorName: { fontSize: 12, fontWeight: "600" as const },
  collectorRig: { fontSize: 10, marginTop: 1 },
  collectorStats: { alignItems: "flex-end" },
  collectorHours: { fontSize: 12, fontWeight: "700" as const },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 },
  ratingText: { fontSize: 9 },
  reqSection: { borderTopWidth: 1, marginTop: 12, paddingTop: 12 },
  reqTitle: { fontSize: 9, fontWeight: "700" as const, letterSpacing: 1, marginBottom: 8 },
  reqRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1 },
  reqName: { flex: 1, fontSize: 11 },
  reqHours: { fontSize: 11, fontWeight: "600" as const },
  loadingWrap: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 },
  loadingText: { fontSize: 12 },
});

function AdminToolsPanel({
  colors,
  collectors,
  tasks,
}: {
  colors: ReturnType<typeof useTheme>["colors"];
  collectors: Collector[];
  tasks: Task[];
}) {
  const { configured } = useCollection();
  const queryClient = useQueryClient();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState("");
  const [isSendingAlert, setIsSendingAlert] = useState(false);
  const [controlCollector, setControlCollector] = useState("");
  const [controlTask, setControlTask] = useState("");
  const [controlTaskSearch, setControlTaskSearch] = useState("");
  const [controlHours, setControlHours] = useState("0.50");
  const [controlNotes, setControlNotes] = useState("");
  const [isRunningTaskAction, setIsRunningTaskAction] = useState(false);
  const [awardCollector, setAwardCollector] = useState("");
  const [awardName, setAwardName] = useState(AWARD_OPTIONS[0]);
  const [awardPinned, setAwardPinned] = useState(true);
  const [awardNotes, setAwardNotes] = useState("");
  const [isGrantingAward, setIsGrantingAward] = useState(false);

  const collectorOptions = useMemo(
    () => collectors.map((c) => ({ value: c.name, label: c.name })),
    [collectors]
  );
  const taskOptions = useMemo(
    () => tasks.map((t) => ({ value: t.name, label: t.label || t.name })),
    [tasks]
  );
  const awardOptions = useMemo(
    () => AWARD_OPTIONS.map((name) => ({ value: name, label: name })),
    []
  );

  useEffect(() => {
    if (!controlCollector && collectors.length > 0) setControlCollector(collectors[0].name);
    if (!awardCollector && collectors.length > 0) setAwardCollector(collectors[0].name);
  }, [collectors, controlCollector, awardCollector]);

  const fullLogQuery = useQuery<FullLogEntry[]>({
    queryKey: ["adminFullLog"],
    queryFn: () => fetchFullLog(),
    enabled: configured,
    staleTime: 60000,
    retry: 1,
  });

  const taskActualsQuery = useQuery<TaskActualRow[]>({
    queryKey: ["adminTaskActuals"],
    queryFn: fetchTaskActualsData,
    enabled: configured,
    staleTime: 60000,
    retry: 1,
  });

  const leaderboardQuery = useQuery<LeaderboardEntry[]>({
    queryKey: ["adminLeaderboard"],
    queryFn: () => fetchLeaderboard("thisWeek"),
    enabled: configured,
    staleTime: 120000,
    retry: 1,
  });

  const recentActivity = useMemo(() => {
    const entries = fullLogQuery.data ?? [];
    return entries.slice(0, 15);
  }, [fullLogQuery.data]);

  const taskProgress = useMemo(() => {
    const tasks = taskActualsQuery.data ?? [];
    return tasks
      .filter(t => {
        const st = normalizeTaskStatus(t.status);
        return !COMPLETED_TASK_STATUSES.has(st);
      })
      .sort((a, b) => (Number(b.remainingHours) || 0) - (Number(a.remainingHours) || 0))
      .slice(0, 12);
  }, [taskActualsQuery.data]);

  const teamPerformance = useMemo(() => {
    const entries = leaderboardQuery.data ?? [];
    if (entries.length === 0) return null;
    const totalHours = entries.reduce((s, e) => s + e.hoursLogged, 0);
    const totalCompleted = entries.reduce((s, e) => s + e.tasksCompleted, 0);
    const avgRate = entries.length > 0 ? entries.reduce((s, e) => s + e.completionRate, 0) / entries.length : 0;
    const mxEntries = entries.filter(e => e.region === "MX");
    const sfEntries = entries.filter(e => e.region === "SF");
    const mxHours = mxEntries.reduce((s, e) => s + e.hoursLogged, 0);
    const sfHours = sfEntries.reduce((s, e) => s + e.hoursLogged, 0);
    return { totalHours, totalCompleted, avgRate, mxHours, sfHours, mxCount: mxEntries.length, sfCount: sfEntries.length, total: entries.length };
  }, [leaderboardQuery.data]);

  const toggleSection = useCallback((section: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedSection(prev => prev === section ? null : section);
  }, []);

  const handleForceResync = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await clearAllCaches();
    try {
      await forceServerRepull({
        collector: controlCollector || undefined,
        scope: "full",
        reason: "admin_force_resync",
      });
    } catch (err) {
      console.log("[Admin] forceServerRepull failed:", err);
    }
    queryClient.invalidateQueries();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [queryClient, controlCollector]);

  const handleSendAlert = useCallback(async () => {
    const message = alertMessage.trim();
    if (!message) return;
    setIsSendingAlert(true);
    try {
      await pushLiveAlert({ message, level: "INFO", target: "ALL", createdBy: "ADMIN" });
      setAlertMessage("");
      queryClient.invalidateQueries({ queryKey: ["liveAlerts"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert("Failed to send alert", err instanceof Error ? err.message : "Unknown error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSendingAlert(false);
    }
  }, [alertMessage, queryClient]);

  const runTaskAction = useCallback(async (mode: "assign" | "cancel" | "edit") => {
    const collector = controlCollector.trim();
    const task = controlTask.trim();
    if (!collector || !task) {
      Alert.alert("Missing fields", "Select collector and task first.");
      return;
    }
    const hours = Number(controlHours);
    setIsRunningTaskAction(true);
    try {
      if (mode === "assign") {
        await adminAssignTask({
          collector,
          task,
          hours: Number.isFinite(hours) && hours > 0 ? hours : 0.5,
          notes: controlNotes.trim() || "Admin assignment",
        });
        try {
          await pushLiveAlert({
            message: `${collector}: assigned ${task}`,
            level: "INFO",
            target: collector,
            createdBy: "ADMIN",
          });
        } catch {}
      } else if (mode === "cancel") {
        await adminCancelTask({
          collector,
          task,
          notes: controlNotes.trim() || "Admin canceled task",
        });
        try {
          await pushLiveAlert({
            message: `${collector}: task canceled ${task}`,
            level: "WARN",
            target: collector,
            createdBy: "ADMIN",
          });
        } catch {}
      } else {
        if (!(Number.isFinite(hours) && hours >= 0)) {
          Alert.alert("Invalid hours", "Enter a valid number for reported hours.");
          return;
        }
        await adminEditHours({
          collector,
          task,
          hours,
          notes: controlNotes.trim() || "Admin adjusted reported hours",
        });
      }

      queryClient.invalidateQueries({ queryKey: ["todayLog", collector] });
      queryClient.invalidateQueries({ queryKey: ["collectorStats", collector] });
      queryClient.invalidateQueries({ queryKey: ["collectorProfile", collector] });
      queryClient.invalidateQueries({ queryKey: ["adminFullLog"] });
      queryClient.invalidateQueries({ queryKey: ["adminTaskActuals"] });
      queryClient.invalidateQueries({ queryKey: ["adminLeaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["liveAlerts"] });
      setControlNotes("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert("Admin action failed", err instanceof Error ? err.message : "Unknown error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsRunningTaskAction(false);
    }
  }, [controlCollector, controlTask, controlHours, controlNotes, queryClient]);

  const handleSearchTask = useCallback(() => {
    const term = controlTaskSearch.trim().toLowerCase();
    if (!term) {
      Alert.alert("Search task", "Type part of a task name first.");
      return;
    }
    const match = tasks.find((task) => {
      const name = String(task.name ?? "").toLowerCase();
      const label = String(task.label ?? task.name ?? "").toLowerCase();
      return name.includes(term) || label.includes(term);
    });
    if (!match) {
      Alert.alert("Task not found", `No task matched "${controlTaskSearch.trim()}".`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    setControlTask(match.name);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [controlTaskSearch, tasks]);

  const handleGrantAward = useCallback(async () => {
    const collector = awardCollector.trim();
    const award = awardName.trim();
    if (!collector || !award) {
      Alert.alert("Missing fields", "Select collector and award.");
      return;
    }
    setIsGrantingAward(true);
    try {
      await grantCollectorAward({
        collector,
        award,
        pinned: awardPinned,
        grantedBy: "ADMIN",
        notes: awardNotes.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ["collectorProfile", collector] });
      setAwardNotes("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert("Grant failed", err instanceof Error ? err.message : "Unknown error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsGrantingAward(false);
    }
  }, [awardCollector, awardName, awardPinned, awardNotes, queryClient]);

  const getStatusIcon = useCallback((status: string) => {
    const st = normalizeTaskStatus(status);
    if (COMPLETED_TASK_STATUSES.has(st)) return <Check size={10} color={colors.complete} />;
    if (RECOLLECT_TASK_STATUSES.has(st)) return <AlertTriangle size={10} color={colors.cancel} />;
    return <Activity size={10} color={colors.accent} />;
  }, [colors]);

  return (
    <View style={atStyles.container}>
      <TouchableOpacity
        style={[atStyles.toolBtn, { backgroundColor: colors.accentSoft, borderColor: colors.accentDim }]}
        onPress={handleForceResync}
        activeOpacity={0.7}
      >
        <RotateCcw size={13} color={colors.accent} />
        <Text style={[atStyles.toolBtnText, { color: colors.accent }]}>Force Resync All Data</Text>
      </TouchableOpacity>

      <View style={[atStyles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View style={atStyles.cardHeader}>
          <Users size={12} color={colors.accent} />
          <Text style={[atStyles.cardTitle, { color: colors.accent }]}>ADMIN TASK CONTROL</Text>
        </View>
        <SelectPicker
          label="Collector"
          options={collectorOptions}
          selectedValue={controlCollector}
          onValueChange={setControlCollector}
          placeholder="Select collector..."
          testID="admin-control-collector"
        />
        <View style={atStyles.controlSpacer} />
        <SelectPicker
          label="Task"
          options={taskOptions}
          selectedValue={controlTask}
          onValueChange={setControlTask}
          placeholder="Select task..."
          testID="admin-control-task"
        />
        <View style={atStyles.controlSearchRow}>
          <TextInput
            style={[atStyles.controlSearchInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgInput }]}
            value={controlTaskSearch}
            onChangeText={setControlTaskSearch}
            placeholder="Search task name..."
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            onSubmitEditing={handleSearchTask}
          />
          <TouchableOpacity
            style={[atStyles.controlSearchBtn, { backgroundColor: colors.accentSoft, borderColor: colors.accentDim }]}
            onPress={handleSearchTask}
            activeOpacity={0.8}
          >
            <Search size={12} color={colors.accent} />
            <Text style={[atStyles.controlSearchBtnText, { color: colors.accent }]}>Search</Text>
          </TouchableOpacity>
        </View>
        <View style={atStyles.controlRow}>
          <TextInput
            style={[atStyles.controlHoursInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgInput }]}
            value={controlHours}
            onChangeText={setControlHours}
            keyboardType="decimal-pad"
            placeholder="Hours"
            placeholderTextColor={colors.textMuted}
          />
          <TextInput
            style={[atStyles.controlNotesInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgInput }]}
            value={controlNotes}
            onChangeText={setControlNotes}
            placeholder="Notes (optional)"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={atStyles.controlActions}>
          <TouchableOpacity
            style={[atStyles.controlBtn, { backgroundColor: colors.accentSoft, borderColor: colors.accentDim }]}
            onPress={() => runTaskAction("assign")}
            disabled={isRunningTaskAction}
            activeOpacity={0.8}
          >
            <Text style={[atStyles.controlBtnText, { color: colors.accent }]}>Assign</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[atStyles.controlBtn, { backgroundColor: colors.cancelBg, borderColor: colors.cancel + "40" }]}
            onPress={() => runTaskAction("cancel")}
            disabled={isRunningTaskAction}
            activeOpacity={0.8}
          >
            <Text style={[atStyles.controlBtnText, { color: colors.cancel }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[atStyles.controlBtn, { backgroundColor: colors.completeBg, borderColor: colors.complete + "40" }]}
            onPress={() => runTaskAction("edit")}
            disabled={isRunningTaskAction}
            activeOpacity={0.8}
          >
            <Text style={[atStyles.controlBtnText, { color: colors.complete }]}>Save Hours</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[atStyles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View style={atStyles.cardHeader}>
          <Star size={12} color={colors.gold} />
          <Text style={[atStyles.cardTitle, { color: colors.gold }]}>COLLECTOR MEDALS</Text>
        </View>
        <SelectPicker
          label="Collector"
          options={collectorOptions}
          selectedValue={awardCollector}
          onValueChange={setAwardCollector}
          placeholder="Select collector..."
          testID="award-collector"
        />
        <View style={atStyles.controlSpacer} />
        <SelectPicker
          label="Award"
          options={awardOptions}
          selectedValue={awardName}
          onValueChange={setAwardName}
          placeholder="Select award..."
          testID="award-name"
        />
        <View style={atStyles.controlPinRow}>
          <Text style={[atStyles.controlPinText, { color: colors.textSecondary }]}>Pin on profile (max 3)</Text>
          <Switch
            value={awardPinned}
            onValueChange={setAwardPinned}
            trackColor={{ false: colors.border, true: colors.gold + "55" }}
            thumbColor={awardPinned ? colors.gold : colors.white}
            ios_backgroundColor={colors.border}
          />
        </View>
        <TextInput
          style={[atStyles.alertInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgInput }]}
          placeholder="Award note (optional)"
          placeholderTextColor={colors.textMuted}
          value={awardNotes}
          onChangeText={setAwardNotes}
          multiline
          numberOfLines={2}
        />
        <TouchableOpacity
          style={[atStyles.alertSendBtn, { backgroundColor: colors.goldBg, borderColor: colors.gold, opacity: isGrantingAward ? 0.7 : 1 }]}
          onPress={handleGrantAward}
          disabled={isGrantingAward}
          activeOpacity={0.8}
        >
          <Text style={[atStyles.alertSendText, { color: colors.gold }]}>
            {isGrantingAward ? "Granting..." : "Grant Medal"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[atStyles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View style={atStyles.cardHeader}>
          <AlertTriangle size={12} color={colors.alertYellow} />
          <Text style={[atStyles.cardTitle, { color: colors.alertYellow }]}>LIVE ALERT BROADCAST</Text>
        </View>
        <TextInput
          style={[atStyles.alertInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgInput }]}
          placeholder="Send an alert to all collectors..."
          placeholderTextColor={colors.textMuted}
          value={alertMessage}
          onChangeText={setAlertMessage}
          multiline
          numberOfLines={2}
        />
        <TouchableOpacity
          style={[
            atStyles.alertSendBtn,
            {
              backgroundColor: alertMessage.trim().length > 0 ? colors.alertYellowBg : colors.bgInput,
              borderColor: alertMessage.trim().length > 0 ? colors.alertYellow : colors.border,
              opacity: isSendingAlert ? 0.7 : 1,
            },
          ]}
          onPress={handleSendAlert}
          disabled={isSendingAlert || alertMessage.trim().length === 0}
          activeOpacity={0.8}
        >
          <Text
            style={[
              atStyles.alertSendText,
              { color: alertMessage.trim().length > 0 ? colors.alertYellow : colors.textMuted },
            ]}
          >
            {isSendingAlert ? "Sending..." : "Send Alert"}
          </Text>
        </TouchableOpacity>
      </View>

      {teamPerformance && (
        <View style={[atStyles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={atStyles.cardHeader}>
            <BarChart3 size={12} color={colors.accent} />
            <Text style={[atStyles.cardTitle, { color: colors.accent }]}>TEAM PERFORMANCE</Text>
          </View>
          <View style={atStyles.perfGrid}>
            <View style={[atStyles.perfItem, { backgroundColor: colors.bgInput }]}>
              <Text style={[atStyles.perfValue, { color: colors.accent }]}>{teamPerformance.totalHours.toFixed(1)}h</Text>
              <Text style={[atStyles.perfLabel, { color: colors.textMuted }]}>Total Hours</Text>
            </View>
            <View style={[atStyles.perfItem, { backgroundColor: colors.bgInput }]}>
              <Text style={[atStyles.perfValue, { color: colors.complete }]}>{teamPerformance.totalCompleted}</Text>
              <Text style={[atStyles.perfLabel, { color: colors.textMuted }]}>Completed</Text>
            </View>
            <View style={[atStyles.perfItem, { backgroundColor: colors.bgInput }]}>
              <Text style={[atStyles.perfValue, { color: colors.textPrimary }]}>{teamPerformance.avgRate.toFixed(0)}%</Text>
              <Text style={[atStyles.perfLabel, { color: colors.textMuted }]}>Avg Rate</Text>
            </View>
            <View style={[atStyles.perfItem, { backgroundColor: colors.bgInput }]}>
              <Text style={[atStyles.perfValue, { color: colors.textPrimary }]}>{teamPerformance.total}</Text>
              <Text style={[atStyles.perfLabel, { color: colors.textMuted }]}>Collectors</Text>
            </View>
          </View>
          <View style={[atStyles.regionBar, { marginTop: DesignTokens.spacing.sm }]}>
            <View style={[atStyles.regionSegment, { backgroundColor: colors.mxOrange, flex: Math.max(teamPerformance.mxHours, 1) }]}>
              <Text style={atStyles.regionBarLabel}>MX</Text>
            </View>
            <View style={[atStyles.regionSegment, { backgroundColor: colors.sfBlue, flex: Math.max(teamPerformance.sfHours, 1) }]}>
              <Text style={atStyles.regionBarLabel}>SF</Text>
            </View>
          </View>
          <View style={atStyles.regionDetail}>
            <Text style={[atStyles.regionText, { color: colors.mxOrange }]}>MX: {teamPerformance.mxHours.toFixed(1)}h ({teamPerformance.mxCount})</Text>
            <Text style={[atStyles.regionText, { color: colors.sfBlue }]}>SF: {teamPerformance.sfHours.toFixed(1)}h ({teamPerformance.sfCount})</Text>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[atStyles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
        onPress={() => toggleSection("tasks")}
        activeOpacity={0.8}
      >
        <View style={atStyles.cardHeader}>
          <Target size={12} color={colors.mxOrange} />
          <Text style={[atStyles.cardTitle, { color: colors.mxOrange }]}>ACTIVE TASK PROGRESS</Text>
          <ChevronDown size={14} color={colors.textMuted} style={expandedSection === "tasks" ? { transform: [{ rotate: "180deg" }] } : undefined} />
        </View>
        {taskActualsQuery.isLoading && (
          <ActivityIndicator size="small" color={colors.accent} />
        )}
        {expandedSection === "tasks" && taskProgress.map((task, idx) => {
          const collected = Number(task.collectedHours) || 0;
          const good = Number(task.goodHours) || 0;
          const remaining = Number(task.remainingHours) || 0;
          const total = collected + remaining;
          const pct = total > 0 ? Math.min(collected / total, 1) : 0;
          const isRecollect = normalizeTaskStatus(task.status) === "RECOLLECT";
          return (
            <View key={`tp_${idx}`} style={[atStyles.taskRow, { borderTopColor: colors.border }]}>
              <View style={atStyles.taskInfo}>
                {getStatusIcon(task.status)}
                <Text style={[atStyles.taskName, { color: colors.textPrimary }]} numberOfLines={1}>{task.taskName}</Text>
              </View>
              <View style={[atStyles.taskBar, { backgroundColor: colors.bgInput }]}>
                <View style={[atStyles.taskBarFill, {
                  backgroundColor: isRecollect ? colors.cancel : colors.complete,
                  width: `${Math.round(pct * 100)}%` as any,
                }]} />
              </View>
              <View style={atStyles.taskMeta}>
                <Text style={[atStyles.taskHours, { color: isRecollect ? colors.cancel : colors.accent }]}>
                  {collected.toFixed(1)}h / {total.toFixed(1)}h
                </Text>
                {good > 0 && (
                  <Text style={[atStyles.taskGood, { color: colors.complete }]}>{good.toFixed(1)}h good</Text>
                )}
              </View>
            </View>
          );
        })}
        {expandedSection !== "tasks" && taskProgress.length > 0 && (
          <Text style={[atStyles.expandHint, { color: colors.textMuted }]}>{taskProgress.length} active tasks — tap to expand</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[atStyles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
        onPress={() => toggleSection("activity")}
        activeOpacity={0.8}
      >
        <View style={atStyles.cardHeader}>
          <Clock size={12} color={colors.statsGreen} />
          <Text style={[atStyles.cardTitle, { color: colors.statsGreen }]}>RECENT ACTIVITY</Text>
          <ChevronDown size={14} color={colors.textMuted} style={expandedSection === "activity" ? { transform: [{ rotate: "180deg" }] } : undefined} />
        </View>
        {fullLogQuery.isLoading && (
          <ActivityIndicator size="small" color={colors.accent} />
        )}
        {expandedSection === "activity" && recentActivity.map((entry, idx) => {
          const statusColor = entry.status === "Completed" ? colors.complete
            : entry.status === "Canceled" ? colors.cancel
            : colors.accent;
          return (
            <View key={`ra_${idx}`} style={[atStyles.activityRow, { borderTopColor: colors.border }]}>
              <View style={[atStyles.activityDot, { backgroundColor: statusColor }]} />
              <View style={atStyles.activityContent}>
                <Text style={[atStyles.activityCollector, { color: colors.textPrimary }]} numberOfLines={1}>{entry.collector}</Text>
                <Text style={[atStyles.activityTask, { color: colors.textSecondary }]} numberOfLines={1}>{entry.taskName}</Text>
              </View>
              <View style={atStyles.activityRight}>
                <Text style={[atStyles.activityHours, { color: statusColor }]}>{Number(entry.loggedHours).toFixed(2)}h</Text>
                <Text style={[atStyles.activityStatus, { color: colors.textMuted }]}>{entry.status}</Text>
              </View>
            </View>
          );
        })}
        {expandedSection !== "activity" && recentActivity.length > 0 && (
          <Text style={[atStyles.expandHint, { color: colors.textMuted }]}>{recentActivity.length} recent entries — tap to expand</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const atStyles = StyleSheet.create({
  container: { gap: DesignTokens.spacing.sm },
  toolBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 10, borderRadius: DesignTokens.radius.md, borderWidth: 1, marginBottom: 4,
  },
  toolBtnText: { fontSize: 12, fontWeight: "600" as const, letterSpacing: 0.3 },
  card: {
    borderRadius: DesignTokens.radius.xl, borderWidth: 1, padding: DesignTokens.spacing.lg,
    ...DesignTokens.shadow.card,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: DesignTokens.spacing.sm },
  cardTitle: { fontSize: 10, fontWeight: "700" as const, letterSpacing: 1.2, flex: 1 },
  perfGrid: { flexDirection: "row", gap: 6 },
  perfItem: { flex: 1, borderRadius: DesignTokens.radius.sm, padding: DesignTokens.spacing.sm, alignItems: "center" },
  perfValue: { fontSize: 16, fontWeight: "700" as const },
  perfLabel: { fontSize: 8, fontWeight: "500" as const, marginTop: 2, letterSpacing: 0.3 },
  regionBar: { flexDirection: "row", height: 22, borderRadius: DesignTokens.radius.xs, overflow: "hidden" },
  regionSegment: { justifyContent: "center", alignItems: "center" },
  regionBarLabel: { color: "#fff", fontSize: 9, fontWeight: "800" as const, letterSpacing: 0.5 },
  regionDetail: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  regionText: { fontSize: 10, fontWeight: "600" as const },
  alertInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    textAlignVertical: "top",
    minHeight: 52,
  },
  alertSendBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  alertSendText: { fontSize: 12, fontWeight: "700" as const, letterSpacing: 0.35 },
  controlSpacer: { height: 8 },
  controlSearchRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  controlSearchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
  },
  controlSearchBtn: {
    minWidth: 94,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  controlSearchBtnText: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.2 },
  controlRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  controlHoursInput: {
    width: 92,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
  },
  controlNotesInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
  },
  controlActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  controlBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  controlBtnText: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.3 },
  controlPinRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 8 },
  controlPinText: { fontSize: 11, fontWeight: "500" as const },
  taskRow: { borderTopWidth: 1, paddingTop: DesignTokens.spacing.sm, marginTop: DesignTokens.spacing.sm },
  taskInfo: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  taskName: { fontSize: 12, fontWeight: "500" as const, flex: 1 },
  taskBar: { height: 4, borderRadius: 2, overflow: "hidden", marginBottom: 4 },
  taskBarFill: { height: 4, borderRadius: 2 },
  taskMeta: { flexDirection: "row", alignItems: "center", gap: DesignTokens.spacing.sm },
  taskHours: { fontSize: 10, fontWeight: "600" as const },
  taskGood: { fontSize: 10, fontWeight: "500" as const },
  activityRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, paddingTop: DesignTokens.spacing.sm, marginTop: DesignTokens.spacing.sm, gap: DesignTokens.spacing.sm },
  activityDot: { width: 6, height: 6, borderRadius: 3 },
  activityContent: { flex: 1 },
  activityCollector: { fontSize: 12, fontWeight: "600" as const },
  activityTask: { fontSize: 10, marginTop: 1 },
  activityRight: { alignItems: "flex-end" },
  activityHours: { fontSize: 12, fontWeight: "700" as const },
  activityStatus: { fontSize: 9, marginTop: 1 },
  expandHint: { fontSize: 11, textAlign: "center", marginTop: DesignTokens.spacing.xs },
});

function QuickCard({ title, subtitle, icon, iconBg, onPress, testID, colors }: {
  title: string; subtitle: string; icon: React.ReactNode; iconBg: string;
  onPress: () => void; testID: string; colors: ReturnType<typeof useTheme>["colors"];
}) {
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  return (
    <View style={styles.quickCardWrap}>
      <TouchableOpacity
        style={[styles.quickCard, { backgroundColor: colors.bgCard, borderColor: colors.border, shadowColor: colors.shadow }]}
        onPress={handlePress} activeOpacity={0.85} testID={testID}
      >
        <View style={[styles.quickIcon, { backgroundColor: iconBg }]}>{icon}</View>
        <Text style={[styles.quickTitle, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.quickSub, { color: colors.textMuted }]}>{subtitle}</Text>
      </TouchableOpacity>
    </View>
  );
}

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

        <View style={styles.hiddenTimer}>
          <SectionHeader label="Collection Timer" icon={<Timer size={11} color={colors.textMuted} />} />
          <CompactTimer />
        </View>

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
                const IconComp = page.icon;
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

const timerStyles = StyleSheet.create({
  bar: {
    borderRadius: DesignTokens.radius.xl - 2, borderWidth: 1, padding: 14, marginBottom: 2,
    ...DesignTokens.shadow.card,
  },
  topRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  time: { fontSize: 20, fontWeight: "900" as const, letterSpacing: 1, minWidth: 62 },
  doneTag: { fontSize: 7, fontWeight: "800" as const, letterSpacing: 2 },
  durationBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1,
  },
  durationText: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.5 },
  resetBtn: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  playBtn: { width: 34, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  pickerWrap: { marginTop: 8, overflow: "hidden" },
  pickerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pickerChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
    minWidth: 60, alignItems: "center",
  },
  pickerLabel: { fontSize: 11 },
  progressTrack: { height: 2, borderRadius: 1, overflow: "hidden", marginTop: 8 },
  progressFill: { height: 2, borderRadius: 1 },
});

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
  hiddenTimer: { display: "none" },
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
  quickCardWrap: { width: "48%" },
  quickCard: {
    borderRadius: DesignTokens.radius.xl - 2, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 10, minHeight: 86,
    alignItems: "center", justifyContent: "center",
    ...DesignTokens.shadow.card,
  },
  quickIcon: { width: 30, height: 30, borderRadius: DesignTokens.radius.sm, alignItems: "center", justifyContent: "center", marginBottom: 5 },
  quickTitle: { fontSize: 10, marginBottom: 1, textAlign: "center", fontWeight: "700" as const },
  quickSub: { fontSize: 9, textAlign: "center" },
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
