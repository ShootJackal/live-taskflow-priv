import React, { useMemo, useCallback, useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ActivityIndicator,
  Animated,
  TouchableOpacity,
} from "react-native";
import {
  UserCheck,
  CheckCircle,
  XCircle,
  StickyNote,
  AlertCircle,
  Circle,
  Clock,
  Search,
  X,
  Radio,
} from "lucide-react-native";
import { useCollection } from "@/providers/CollectionProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { useLocale } from "@/providers/LocaleProvider";
import { DesignTokens } from "@/constants/colors";
import ScreenContainer from "@/components/ScreenContainer";
import ErrorBoundary from "@/components/ErrorBoundary";
import SelectPicker from "@/components/SelectPicker";
import ActionButton from "@/components/ActionButton";
import MarqueeText from "@/components/MarqueeText";
import ReviewSheet from "@/components/ReviewSheet";
import RigAssignmentModal from "@/components/RigAssignmentModal";
import { respondRigSwitch } from "@/services/googleSheets";
import { useQueryClient } from "@tanstack/react-query";
import type { LogEntry, RigSwitchRequest } from "@/types";
import type { ThemeColors } from "@/constants/colors";
// ─── Log entry row ───────────────────────────────────────────────────────────

const LogEntryRow = React.memo(function LogEntryRow({
  entry,
  statusColor,
  colors,
  isLast,
}: {
  entry: LogEntry;
  statusColor: string;
  colors: ThemeColors;
  isLast: boolean;
}) {
  const isClosed = entry.status === "Completed" || entry.status === "Canceled";
  const hasTaskProgress =
    typeof entry.taskGoodHours === "number" ||
    typeof entry.taskRemainingHours === "number";
  const taskGood = Number(entry.taskGoodHours ?? 0);
  const taskRemaining = Number(entry.taskRemainingHours ?? 0);
  // Progress = CB Actual ÷ (CB Actual + Remaining)
  const taskTotal = Math.max(taskGood + taskRemaining, 0);
  const taskProgressPct = Math.max(
    0,
    Math.min(100, taskTotal > 0 ? Math.round((taskGood / taskTotal) * 100) : 0)
  );

  return (
    <View
      style={[
        logStyles.row,
        !isLast && {
          borderBottomColor: colors.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
        isClosed && logStyles.rowClosed,
      ]}
    >
      <View style={logStyles.rowLeft}>
        <View
          style={[logStyles.statusStripe, { backgroundColor: statusColor }]}
        />
        <View style={logStyles.rowContent}>
          <MarqueeText
            text={entry.taskName}
            style={[logStyles.taskName, { color: isClosed ? colors.textMuted : colors.textPrimary }]}
            speedMs={4300}
          />
          <View style={logStyles.metaRow}>
            <View
              style={[
                logStyles.statusBadge,
                { backgroundColor: statusColor + "18" },
              ]}
            >
              <Text style={[logStyles.statusText, { color: statusColor }]}>
                {entry.status}
              </Text>
            </View>
            {Number(entry.loggedHours) > 0 && (
              <Text style={[logStyles.hours, { color: colors.textMuted }]}>
                {Number(entry.loggedHours).toFixed(2)}h logged
              </Text>
            )}
          </View>
          {hasTaskProgress && (
            <View
              style={[
                logStyles.taskSnapshot,
                {
                  backgroundColor: colors.bgInput,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={logStyles.taskSnapshotTop}>
                <Text style={[logStyles.taskStat, { color: colors.complete }]}>
                  CB Actual {taskGood.toFixed(2)}h
                </Text>
                <Text style={[logStyles.taskStat, { color: colors.statusPending }]}>
                  Remaining {taskRemaining.toFixed(2)}h
                </Text>
                <Text style={[logStyles.taskPct, { color: colors.textSecondary }]}>
                  {taskProgressPct}%
                </Text>
              </View>
              {taskTotal > 0 && (
                <View style={[logStyles.taskTrack, { backgroundColor: colors.border }]}>
                  <View
                    style={[
                      logStyles.taskFill,
                      { backgroundColor: colors.accent, width: `${taskProgressPct}%` as any },
                    ]}
                  />
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
});

const logStyles = StyleSheet.create({
  row: { paddingVertical: 10 },
  rowClosed: { opacity: 0.45 },
  rowLeft: { flexDirection: "row", gap: 12 },
  statusStripe: { width: 3, borderRadius: 2, minHeight: 32 },
  rowContent: { flex: 1 },
  taskName: {
    fontSize: DesignTokens.fontSize.footnote + 1,
    fontWeight: "600" as const,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: DesignTokens.radius.xs,
  },
  statusText: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "600" as const,
  },
  hours: { fontSize: DesignTokens.fontSize.caption1 },
  taskSnapshot: {
    marginTop: 6,
    borderRadius: DesignTokens.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  taskSnapshotTop: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  taskStat: {
    fontSize: DesignTokens.fontSize.caption2,
    fontWeight: "500" as const,
  },
  taskPct: {
    marginLeft: "auto",
    fontSize: DesignTokens.fontSize.caption2,
    fontWeight: "700" as const,
  },
  taskTrack: {
    marginTop: 6,
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
  },
  taskFill: { height: 3, borderRadius: 2 },
});

// ─── Rig switch request banner (incoming) ────────────────────────────────────

function RigSwitchBanner({
  request,
  colors,
}: {
  request: RigSwitchRequest;
  colors: ThemeColors;
}) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = React.useState<"APPROVE" | "DENY" | null>(null);

  const respond = React.useCallback(async (action: "APPROVE" | "DENY") => {
    setLoading(action);
    try {
      await respondRigSwitch({ assignmentId: request.assignmentId, action });
      queryClient.invalidateQueries({ queryKey: ["rigSwitchRequests"] });
      queryClient.invalidateQueries({ queryKey: ["rigStatus"] });
    } catch {
      // Non-fatal — banner will persist until next poll if this fails
    } finally {
      setLoading(null);
    }
  }, [request.assignmentId, queryClient]);

  return (
    <View style={[
      switchBannerStyles.banner,
      { backgroundColor: colors.alertYellowBg, borderColor: colors.alertYellow + "44" },
    ]}>
      <Radio size={14} color={colors.alertYellow ?? colors.statusPending} />
      <Text style={[switchBannerStyles.text, { color: colors.textPrimary }]}>
        <Text style={{ fontWeight: "700" }}>{request.requestedBy}</Text>
        {" wants to take Rig "}<Text style={{ fontWeight: "700" }}>{request.rig}</Text>
      </Text>
      <View style={switchBannerStyles.btns}>
        <TouchableOpacity
          style={[switchBannerStyles.btn, { backgroundColor: colors.complete + "22", borderColor: colors.complete + "44" }]}
          onPress={() => respond("APPROVE")}
          disabled={loading !== null}
        >
          {loading === "APPROVE"
            ? <ActivityIndicator size="small" color={colors.complete} />
            : <Text style={{ color: colors.complete, fontSize: 12, fontWeight: "600" }}>Approve</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity
          style={[switchBannerStyles.btn, { backgroundColor: colors.cancel + "22", borderColor: colors.cancel + "44" }]}
          onPress={() => respond("DENY")}
          disabled={loading !== null}
        >
          {loading === "DENY"
            ? <ActivityIndicator size="small" color={colors.cancel} />
            : <Text style={{ color: colors.cancel, fontSize: 12, fontWeight: "600" }}>Deny</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const switchBannerStyles = StyleSheet.create({
  banner: {
    flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap",
    borderWidth: 1, borderRadius: 10, padding: 10,
  },
  text: { flex: 1, fontSize: 13 },
  btns: { flexDirection: "row", gap: 6 },
  btn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { colors } = useTheme();
  const { t } = useLocale();
  const {
    configured,
    collectors,
    tasks,
    selectedCollectorName,
    selectedCollector,
    selectedRig,
    selectedTaskName,
    hoursToLog,
    notes,
    openTasks,
    todayLog,
    carryoverItems,
    hasCarryover,
    pendingReview,
    hasPendingReview,
    isLoadingCollectors,
    isLoadingTasks,
    isLoadingLog,
    isSyncing,
    submitError,
    selectCollector,
    setSelectedTaskName,
    setHoursToLog,
    setNotes,
    assignTask,
    completeTask,
    cancelTask,
    addNote,
    refreshData,
    pendingSwitchRequests,
    assignRigForDay,
  } = useCollection();

  // ── Local draft state for text inputs ────────────────────────────────────
  // Using local state prevents every keystroke from triggering a full context
  // re-render (which dismissed the keyboard on iOS PWA). We sync to the
  // provider on blur so the rest of the app stays in sync.
  const [localHours, setLocalHours] = useState(hoursToLog);
  const [localNotes, setLocalNotes] = useState(notes);

  // Keep local state in sync when the provider resets (e.g. after submit)
  useEffect(() => { setLocalHours(hoursToLog); }, [hoursToLog]);
  useEffect(() => { setLocalNotes(notes); }, [notes]);

  const [refreshing, setRefreshing] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [showTaskSearch, setShowTaskSearch] = useState(false);
  const [logVisibleCount, setLogVisibleCount] = useState(5);
  const [showReviewSheet, setShowReviewSheet] = useState(false);
  const [showRigPicker, setShowRigPicker] = useState(false);

  // SF collectors: show SOD rig picker if no rig is assigned yet today.
  const isSFCollector = selectedCollector?.team === "SF";
  useEffect(() => {
    if (isSFCollector && selectedCollectorName && !selectedRig && configured) {
      const t = setTimeout(() => setShowRigPicker(true), 600);
      return () => clearTimeout(t);
    }
  }, [isSFCollector, selectedCollectorName, selectedRig, configured]);

  // Incoming switch requests (someone wants the SF collector's rig).
  const incomingSwitchRequests = useMemo(
    () => pendingSwitchRequests.filter((r) => r.type === "incoming"),
    [pendingSwitchRequests]
  );
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;
  const searchAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        speed: 22,
        bounciness: 3,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const collectorOptions = useMemo(
    () => collectors.map((c) => ({ value: c.name, label: c.name })),
    [collectors]
  );

  const taskOptions = useMemo(() => {
    const allTasks = tasks.map((t) => ({ value: t.name, label: t.label }));
    if (!taskSearch.trim()) return allTasks;
    const q = taskSearch.toLowerCase();
    return allTasks.filter((t) => t.label.toLowerCase().includes(q));
  }, [tasks, taskSearch]);

  const hasValidHours =
    !!localHours.trim() && parseFloat(localHours) > 0;
  // Assign only needs collector + task. Hours are for Done/Cancel.
  const canSubmit = !!selectedCollectorName && !!selectedTaskName;
  const latestOpenTask = openTasks.length > 0 ? openTasks[0] : null;

  const toggleTaskSearch = useCallback(() => {
    const next = !showTaskSearch;
    setShowTaskSearch(next);
    Animated.timing(searchAnim, {
      toValue: next ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
    if (!next) setTaskSearch("");
  }, [showTaskSearch, searchAnim]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshData();
    } finally {
      setRefreshing(false);
    }
  }, [refreshData]);

  const handleAssign = useCallback(() => {
    // Flush local notes draft before assigning
    setNotes(localNotes);
    if (hasCarryover) {
      Alert.alert(
        "Incomplete Tasks from Yesterday",
        `You have ${carryoverItems.length} unresolved task${carryoverItems.length === 1 ? "" : "s"} from yesterday. Close them on the Stats tab first.`,
        [
          { text: "Go to Stats", style: "cancel" },
          {
            text: "Assign Anyway",
            onPress: () => {
              try { assignTask(); } catch (e: unknown) {
                Alert.alert("Error", e instanceof Error ? e.message : "Failed to assign task");
              }
            },
          },
        ]
      );
      return;
    }
    try {
      assignTask();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to assign task");
    }
  }, [assignTask, hasCarryover, carryoverItems.length, localNotes, setNotes]);

  const handleComplete = useCallback(() => {
    if (!latestOpenTask) return;
    // Flush local draft to provider before submitting
    setHoursToLog(localHours);
    setNotes(localNotes);
    try {
      completeTask(latestOpenTask.taskName);
    } catch (e: unknown) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Failed to complete task"
      );
    }
  }, [completeTask, latestOpenTask, localHours, localNotes, setHoursToLog, setNotes]);

  const handleCancel = useCallback(() => {
    if (!latestOpenTask) return;
    Alert.alert("Cancel Task", `Cancel "${latestOpenTask.taskName}"?`, [
      { text: "No", style: "cancel" },
      {
        text: "Yes",
        style: "destructive",
        onPress: () => {
          try {
            cancelTask(latestOpenTask.taskName);
          } catch (e: unknown) {
            Alert.alert(
              "Error",
              e instanceof Error ? e.message : "Failed to cancel"
            );
          }
        },
      },
    ]);
  }, [cancelTask, latestOpenTask]);

  const handleAddNote = useCallback(() => {
    if (!latestOpenTask || !localNotes.trim()) return;
    setNotes(localNotes);
    try {
      addNote(latestOpenTask.taskName);
    } catch (e: unknown) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Failed to save note"
      );
    }
  }, [addNote, latestOpenTask, localNotes, setNotes]);

  const todayDateStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  // Header summary counts only today-assigned entries. Carryover tasks
  // (assignedDate before today) must not inflate the reported totals.
  const todayStats = useMemo(() => {
    // Only count entries assigned today so carryover tasks from previous days
    // don't inflate the header stats.
    const todayOnly = todayLog.filter((e) => e.assignedDate === todayDateStr);
    const completed = todayOnly.filter((e) => e.status === "Completed").length;
    const totalLogged = todayOnly.reduce((s, e) => s + e.loggedHours, 0);
    return { completed, totalLogged, total: todayOnly.length };
  }, [todayLog, todayDateStr]);

  // Full log list keeps all entries (including carryovers) visible and actionable.
  const visibleLog = useMemo(
    () => todayLog.slice(0, logVisibleCount),
    [todayLog, logVisibleCount]
  );

  useEffect(() => {
    setLogVisibleCount(5);
  }, [selectedCollectorName]);

  useEffect(() => {
    setLogVisibleCount((prev) => {
      const cap = Math.max(todayLog.length, 5);
      return Math.min(prev, cap);
    });
  }, [todayLog.length]);

  const getStatusColor = useCallback(
    (status: string) => {
      if (status === "Completed") return colors.statusActive;
      if (status === "Partial") return colors.statusPending;
      if (status === "Canceled") return colors.statusCancelled;
      return colors.accent;
    },
    [colors]
  );

  const firstName = selectedCollector
    ? selectedCollector.name.split(" ")[0]
    : null;

  // Shared card style — shadow only, no border stroke
  const cardShadow = useMemo(
    () => ({
      shadowColor: colors.shadow,
      ...DesignTokens.shadow.float,
    }),
    [colors]
  );

  return (
    <ErrorBoundary fallbackMessage="Something went wrong loading the Collect screen.">
      <ScreenContainer>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Animated.View
            style={[
              styles.flex,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <ScrollView
              style={styles.container}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={colors.accent}
                  colors={[colors.accent]}
                />
              }
            >
              {/* ── Compact screen title ──────────────────────────────── */}
              <View style={styles.screenTitle}>
                <View style={styles.screenTitleLeft}>
                  <Text style={[styles.screenTitleText, { color: colors.textPrimary, fontFamily: "Lexend_700Bold" }]}>
                    {t("collect", "Collect")}
                  </Text>
                  {firstName && (
                    <Text style={[styles.screenTitleSub, { color: colors.textMuted }]}>
                      {`${firstName}'s Workspace`}
                    </Text>
                  )}
                </View>
                <View style={styles.screenTitleRight}>
                  {selectedRig !== "" && (
                    <Text style={[styles.rigLabel, { color: colors.textMuted }]}>{selectedRig}</Text>
                  )}
                  {openTasks.length > 0 && (
                    <View style={[styles.openPill, { backgroundColor: colors.accentSoft, borderColor: colors.accentDim }]}>
                      <Circle size={5} color={colors.accent} fill={colors.accent} />
                      <Text style={[styles.openPillText, { color: colors.accent }]}>{openTasks.length} open</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* ── Banners ───────────────────────────────────────────── */}
              {!configured && (
                <View
                  style={[
                    styles.notice,
                    {
                      backgroundColor: colors.bgCard,
                      borderLeftColor: colors.statusPending,
                      ...cardShadow,
                    },
                  ]}
                >
                  <AlertCircle size={15} color={colors.statusPending} />
                  <Text
                    style={[
                      styles.noticeText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Set EXPO_PUBLIC_GOOGLE_SCRIPT_URL to connect (or
                    CORE/ANALYTICS URLs)
                  </Text>
                </View>
              )}

              {!!submitError && (
                <View
                  style={[
                    styles.notice,
                    {
                      backgroundColor: colors.cancelBg,
                      borderLeftColor: colors.cancel,
                    },
                  ]}
                >
                  <AlertCircle size={15} color={colors.cancel} />
                  <Text
                    style={[styles.noticeText, { color: colors.cancel }]}
                  >
                    {submitError}
                  </Text>
                </View>
              )}

              {/* ── Open-task inline banner ───────────────────────────── */}
              {latestOpenTask && (
                <View
                  style={[
                    styles.openTaskBanner,
                    {
                      backgroundColor: colors.accentSoft,
                      borderColor: colors.accentDim,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.openTaskDot,
                      { backgroundColor: colors.accent },
                    ]}
                  />
                  <View style={styles.openTaskInfo}>
                    <Text
                      style={[
                        styles.openTaskLabel,
                        { color: colors.accent },
                      ]}
                      numberOfLines={1}
                    >
                      {latestOpenTask.taskName}
                    </Text>
                  <Text
                    style={[
                      styles.openTaskMeta,
                      { color: colors.accentLight },
                    ]}
                  >
                    In Progress · Enter hours below to complete or cancel
                  </Text>
                  </View>
                </View>
              )}

              {/* ── SF rig picker shortcut ───────────────────────────── */}
              {isSFCollector && !selectedRig && (
                <TouchableOpacity
                  style={[
                    styles.carryoverBanner,
                    { backgroundColor: colors.accentSoft, borderColor: colors.accentDim },
                  ]}
                  onPress={() => setShowRigPicker(true)}
                  activeOpacity={0.8}
                >
                  <Radio size={14} color={colors.accent} />
                  <Text style={[styles.carryoverBannerText, { color: colors.accent }]}>
                    No rig assigned — tap to pick your rig for today
                  </Text>
                </TouchableOpacity>
              )}

              {/* ── Incoming switch requests ──────────────────────────── */}
              {incomingSwitchRequests.map((req) => (
                <RigSwitchBanner
                  key={req.assignmentId}
                  request={req}
                  colors={colors}
                />
              ))}

              {/* ── Carryover warning ────────────────────────────────── */}
              {hasCarryover && (
                <View
                  style={[
                    styles.carryoverBanner,
                    {
                      backgroundColor: colors.alertYellowBg,
                      borderColor: colors.alertYellow + "55",
                    },
                  ]}
                >
                  <AlertCircle size={14} color={colors.alertYellow} />
                  <Text style={[styles.carryoverBannerText, { color: colors.alertYellow }]}>
                    {carryoverItems.length} incomplete task{carryoverItems.length === 1 ? "" : "s"} from yesterday — close them in Stats
                  </Text>
                </View>
              )}

              {/* ── iOS-grouped form section ──────────────────────────── */}
              <View
                style={[
                  styles.formSection,
                  {
                    backgroundColor: colors.bgCard,
                    ...cardShadow,
                    shadowColor: colors.shadow,
                  },
                ]}
              >
                {/* Collector field — shown when not yet set */}
                {!selectedCollectorName && (
                  <>
                    <View style={styles.formRow}>
                      <View style={styles.formRowContent}>
                        <Text style={[styles.formRowLabel, { color: colors.textSecondary }]}>
                          Collector
                        </Text>
                        {isLoadingCollectors ? (
                          <ActivityIndicator size="small" color={colors.accent} />
                        ) : (
                          <SelectPicker
                            label=""
                            options={collectorOptions}
                            selectedValue={selectedCollectorName}
                            onValueChange={selectCollector}
                            placeholder="Who are you? (set in Tools)"
                            testID="collector-picker"
                          />
                        )}
                      </View>
                    </View>
                    <View style={[styles.insetSeparator, { backgroundColor: colors.border }]} />
                  </>
                )}

                {/* Task field */}
                <View style={styles.formRow}>
                  <View style={styles.formRowContent}>
                    <View style={styles.formRowLabelRow}>
                      <Text
                        style={[
                          styles.formRowLabel,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Task
                      </Text>
                      <View style={styles.formRowLabelRight}>
                        {isLoadingTasks && (
                          <ActivityIndicator
                            size="small"
                            color={colors.accent}
                          />
                        )}
                        <TouchableOpacity
                          onPress={toggleTaskSearch}
                          style={[
                            styles.searchToggle,
                            {
                              backgroundColor: showTaskSearch
                                ? colors.accentSoft
                                : "transparent",
                            },
                          ]}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          testID="task-search-toggle"
                        >
                          {showTaskSearch ? (
                            <X size={14} color={colors.accent} />
                          ) : (
                            <Search size={14} color={colors.textMuted} />
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>

                    {showTaskSearch && (
                      <Animated.View
                        style={[
                          styles.searchWrap,
                          {
                            opacity: searchAnim,
                            maxHeight: searchAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, 48],
                            }),
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.searchBar,
                            {
                              backgroundColor: colors.bgInput,
                              borderColor: colors.border,
                            },
                          ]}
                        >
                          <Search size={13} color={colors.textMuted} />
                          <TextInput
                            style={[
                              styles.searchInput,
                              { color: colors.textPrimary },
                            ]}
                            value={taskSearch}
                            onChangeText={setTaskSearch}
                            placeholder="Search tasks…"
                            placeholderTextColor={colors.textMuted}
                            autoFocus
                            testID="task-search-input"
                          />
                          {taskSearch.length > 0 && (
                            <TouchableOpacity
                              onPress={() => setTaskSearch("")}
                              activeOpacity={0.7}
                              hitSlop={{
                                top: 8,
                                bottom: 8,
                                left: 8,
                                right: 8,
                              }}
                            >
                              <X size={13} color={colors.textMuted} />
                            </TouchableOpacity>
                          )}
                        </View>
                      </Animated.View>
                    )}

                    <SelectPicker
                      label=""
                      options={taskOptions}
                      selectedValue={selectedTaskName}
                      onValueChange={setSelectedTaskName}
                      placeholder={
                        taskSearch
                          ? `${taskOptions.length} tasks found…`
                          : "Choose a task…"
                      }
                      testID="task-picker"
                    />
                  </View>
                </View>

                <View
                  style={[
                    styles.insetSeparator,
                    { backgroundColor: colors.border },
                  ]}
                />

                {/* Hours field */}
                <View style={styles.formRow}>
                  <View style={styles.formRowContent}>
                    <View style={styles.formRowLabelRow}>
                      <Text
                        style={[
                          styles.formRowLabel,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Hours
                      </Text>
                      <Text
                        style={[
                          styles.optionalTag,
                          { color: colors.textMuted },
                        ]}
                      >
                        for completion
                      </Text>
                    </View>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: colors.bgInput,
                          borderColor: colors.border,
                          color: colors.textPrimary,
                        },
                      ]}
                      value={localHours}
                      onChangeText={setLocalHours}
                      onBlur={() => setHoursToLog(localHours)}
                      placeholder="0.00"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      testID="hours-input"
                    />
                  </View>
                </View>

                <View
                  style={[
                    styles.insetSeparator,
                    { backgroundColor: colors.border },
                  ]}
                />

                {/* Notes field */}
                <View style={[styles.formRow, { alignItems: "flex-start" }]}>
                  <View style={styles.formRowContent}>
                    <View style={styles.formRowLabelRow}>
                      <Text
                        style={[
                          styles.formRowLabel,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Notes
                      </Text>
                      <Text
                        style={[
                          styles.optionalTag,
                          { color: colors.textMuted },
                        ]}
                      >
                        optional
                      </Text>
                    </View>
                    <TextInput
                      style={[
                        styles.input,
                        styles.notesInput,
                        {
                          backgroundColor: colors.bgInput,
                          borderColor: colors.border,
                          color: colors.textPrimary,
                        },
                      ]}
                      value={localNotes}
                      onChangeText={setLocalNotes}
                      onBlur={() => setNotes(localNotes)}
                      placeholder="Add notes…"
                      placeholderTextColor={colors.textMuted}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      testID="notes-input"
                    />
                  </View>
                </View>
              </View>

              {/* ── Primary CTA ───────────────────────────────────────── */}
              {/*  • Open task present → Done is primary, shows hours in label  */}
              {/*  • No open task     → Assign Task is primary                  */}
              {latestOpenTask ? (
                <ActionButton
                  title={
                    hasValidHours
                      ? `Log ${parseFloat(localHours).toFixed(2)}h — Done`
                      : "Enter hours above to complete"
                  }
                  icon={<CheckCircle size={17} color={hasValidHours ? colors.white : colors.complete} />}
                  color={hasValidHours ? colors.white : colors.complete}
                  bgColor={hasValidHours ? colors.complete : colors.completeBg}
                  onPress={handleComplete}
                  disabled={!hasValidHours}
                  fullWidth
                  testID="complete-btn"
                />
              ) : (
                <ActionButton
                  title="Assign Task"
                  icon={<UserCheck size={17} color={colors.white} />}
                  color={colors.white}
                  bgColor={colors.accent}
                  onPress={handleAssign}
                  disabled={!canSubmit}
                  fullWidth
                  testID="assign-btn"
                />
              )}

              {/* ── Cancel current task — explicit destructive button ─── */}
              {latestOpenTask && (
                <TouchableOpacity
                  style={[
                    styles.cancelBtn,
                    {
                      backgroundColor: colors.cancelBg,
                      borderColor: colors.cancel + "55",
                    },
                  ]}
                  onPress={handleCancel}
                  activeOpacity={0.75}
                  testID="cancel-btn"
                >
                  <XCircle size={16} color={colors.cancel} />
                  <View style={styles.cancelBtnInner}>
                    <Text style={[styles.cancelBtnLabel, { color: colors.cancel }]}>
                      Cancel Current Task
                    </Text>
                    <Text
                      style={[styles.cancelBtnTask, { color: colors.cancel + "99" }]}
                      numberOfLines={1}
                    >
                      {latestOpenTask.taskName.split("|").pop()?.trim() ?? latestOpenTask.taskName}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* ── Syncing indicator ─────────────────────────────────── */}
              {isSyncing && (
                <View style={styles.syncBadge}>
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text
                    style={[
                      styles.syncText,
                      { color: colors.textMuted },
                    ]}
                  >
                    Syncing…
                  </Text>
                </View>
              )}

              {/* ── Save Note Only ────────────────────────────────────── */}
              {latestOpenTask !== null && localNotes.trim().length > 0 && (
                <ActionButton
                  title="Save Note Only"
                  icon={<StickyNote size={15} color={colors.accent} />}
                  color={colors.accent}
                  bgColor={colors.accentSoft}
                  onPress={handleAddNote}
                  fullWidth
                  testID="note-btn"
                />
              )}

              {/* ── Ready to Review (Redash EOD flow) ────────────────── */}
              {hasPendingReview && (
                <TouchableOpacity
                  style={[
                    styles.reviewBanner,
                    {
                      backgroundColor: colors.completeBg,
                      borderColor: colors.complete + "55",
                    },
                  ]}
                  onPress={() => setShowReviewSheet(true)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.reviewBadge, { backgroundColor: colors.complete }]}>
                    <Text style={styles.reviewBadgeText}>{pendingReview.length}</Text>
                  </View>
                  <View style={styles.reviewBannerInfo}>
                    <Text style={[styles.reviewBannerTitle, { color: colors.complete }]}>
                      Ready to Review
                    </Text>
                    <Text style={[styles.reviewBannerSub, { color: colors.textMuted }]}>
                      Redash detected {pendingReview.length} task{pendingReview.length === 1 ? "" : "s"} on your rig today
                    </Text>
                  </View>
                  <CheckCircle size={18} color={colors.complete} />
                </TouchableOpacity>
              )}

              {/* ── Today's activity log ─────────────────────────────── */}
              {selectedCollectorName !== "" && todayLog.length > 0 && (
                <View style={styles.logSection}>
                  {/* Section header */}
                  <View style={styles.logSectionHeader}>
                    <View style={styles.logHeaderLeft}>
                      <Clock size={13} color={colors.textMuted} />
                      <Text
                        style={[
                          styles.logSectionTitle,
                          { color: colors.textMuted },
                        ]}
                      >
                        {t("todays_activity", "Today's Activity")}
                      </Text>
                    </View>
                    <View style={styles.logStats}>
                      <Text
                        style={[
                          styles.logStatText,
                          { color: colors.complete },
                        ]}
                      >
                        {todayStats.completed} done
                      </Text>
                      <Text
                        style={[
                          styles.logStatDivider,
                          { color: colors.border },
                        ]}
                      >
                        ·
                      </Text>
                      <Text
                        style={[
                          styles.logStatText,
                          { color: colors.accent },
                        ]}
                      >
                        {todayStats.totalLogged.toFixed(2)}h
                      </Text>
                    </View>
                  </View>

                  {/* Log entries card */}
                  <View
                    style={[
                      styles.logCard,
                      {
                        backgroundColor: colors.bgCard,
                        ...cardShadow,
                      },
                    ]}
                  >
                    {isLoadingLog && (
                      <ActivityIndicator
                        size="small"
                        color={colors.accent}
                        style={{ marginBottom: 8 }}
                      />
                    )}
                    {visibleLog.map((entry, idx) => (
                      <LogEntryRow
                        key={entry.assignmentId || `log_${idx}`}
                        entry={entry}
                        statusColor={getStatusColor(entry.status)}
                        colors={colors}
                        isLast={idx === visibleLog.length - 1}
                      />
                    ))}
                    {todayLog.length > 5 && (
                      <TouchableOpacity
                        style={[
                          styles.logMoreBtn,
                          {
                            borderColor: colors.border,
                            backgroundColor: colors.bgInput,
                          },
                        ]}
                        onPress={() => {
                          setLogVisibleCount((prev) =>
                            prev >= todayLog.length
                              ? 5
                              : Math.min(todayLog.length, prev + 5)
                          );
                        }}
                        activeOpacity={0.75}
                      >
                        <Text
                          style={[
                            styles.logMoreText,
                            { color: colors.accent },
                          ]}
                        >
                          {logVisibleCount >= todayLog.length
                            ? t("show_less", "Show Less")
                            : t("load_more", "Load More")}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              <View style={styles.spacer} />
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </ScreenContainer>

      <ReviewSheet
        visible={showReviewSheet}
        onClose={() => setShowReviewSheet(false)}
      />

      {/* SF SOD rig picker */}
      <RigAssignmentModal
        visible={showRigPicker}
        onClose={() => setShowRigPicker(false)}
      />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 140,
    gap: 8,
  },

  // Compact screen title — no card, no large brand text
  screenTitle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  screenTitleLeft: { gap: 1 },
  screenTitleText: { fontSize: 20, fontWeight: "700" as const },
  screenTitleSub: { fontSize: 13 },
  screenTitleRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rigLabel: {
    fontSize: 13,
    letterSpacing: 0.2,
  },
  openPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: DesignTokens.radius.pill,
    borderWidth: 1,
  },
  openPillText: {
    fontSize: 12,
    fontWeight: "600" as const,
  },

  // Banners
  notice: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: DesignTokens.radius.md,
    padding: DesignTokens.spacing.md,
    gap: 10,
    borderLeftWidth: 3,
  },
  noticeText: {
    flex: 1,
    fontSize: DesignTokens.fontSize.footnote,
    lineHeight: 19,
  },

  // Ready to Review banner
  reviewBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: DesignTokens.radius.lg,
    paddingHorizontal: DesignTokens.spacing.lg,
    paddingVertical: DesignTokens.spacing.md,
    borderWidth: 1,
    gap: 10,
  },
  reviewBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewBadgeText: {
    color: "#fff",
    fontSize: DesignTokens.fontSize.caption2,
    fontWeight: "700" as const,
  },
  reviewBannerInfo: {
    flex: 1,
    gap: 2,
  },
  reviewBannerTitle: {
    fontSize: DesignTokens.fontSize.footnote,
    fontWeight: "700" as const,
  },
  reviewBannerSub: {
    fontSize: DesignTokens.fontSize.caption2,
  },

  // Carryover warning banner
  carryoverBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: DesignTokens.radius.md,
    paddingHorizontal: DesignTokens.spacing.md,
    paddingVertical: DesignTokens.spacing.sm + 2,
    borderWidth: 1,
    gap: 8,
  },
  carryoverBannerText: {
    flex: 1,
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "600" as const,
    lineHeight: 17,
  },

  // Open-task banner
  openTaskBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: DesignTokens.radius.lg,
    paddingHorizontal: DesignTokens.spacing.lg,
    paddingVertical: DesignTokens.spacing.md,
    borderWidth: 1,
    gap: 10,
  },
  openTaskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  openTaskInfo: { flex: 1 },
  openTaskLabel: {
    fontSize: DesignTokens.fontSize.footnote,
    fontWeight: "600" as const,
  },
  openTaskMeta: {
    fontSize: DesignTokens.fontSize.caption2,
    marginTop: 2,
  },

  // Form section — single grouped surface
  formSection: {
    borderRadius: 14,
    overflow: "hidden",
  },
  formRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
  },
  formRowContent: { flex: 1 },
  formRowLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  formRowLabel: {
    fontSize: 12,
    fontWeight: "600" as const,
    letterSpacing: 0.1,
  },
  formRowLabelRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  // Full-width hairline separator
  insetSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 14,
  },
  searchToggle: {
    width: 32,
    height: 32,
    borderRadius: DesignTokens.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  searchWrap: { overflow: "hidden", marginBottom: 6 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderRadius: DesignTokens.radius.sm,
    borderWidth: 1,
    gap: 6,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: DesignTokens.fontSize.footnote,
    paddingVertical: 0,
  },
  input: {
    borderRadius: DesignTokens.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: DesignTokens.fontSize.subhead,
    fontWeight: "500" as const,
    borderWidth: 1,
  },
  notesInput: {
    minHeight: 60,
    fontSize: DesignTokens.fontSize.footnote,
  },
  optionalTag: {
    fontSize: DesignTokens.fontSize.caption2,
    fontWeight: "500" as const,
  },

  // Cancel task — clear destructive button so users know it's tappable
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: DesignTokens.radius.md,
    borderWidth: 1,
    minHeight: 52,
  },
  cancelBtnInner: { flex: 1 },
  cancelBtnLabel: {
    fontSize: DesignTokens.fontSize.footnote,
    fontWeight: "600" as const,
  },
  cancelBtnTask: {
    fontSize: DesignTokens.fontSize.caption1,
    marginTop: 2,
  },

  // Sync indicator
  syncBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  syncText: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "500" as const,
  },

  // Activity log
  logSection: {
    gap: DesignTokens.spacing.sm,
  },
  logSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  logHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  logSectionTitle: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "700" as const,
    letterSpacing: 0.8,
  },
  logStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  logStatText: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "600" as const,
  },
  logStatDivider: {
    fontSize: DesignTokens.fontSize.caption1,
  },
  logCard: {
    borderRadius: DesignTokens.radius.xl,
    paddingHorizontal: DesignTokens.spacing.lg,
    paddingVertical: DesignTokens.spacing.sm,
  },
  logMoreBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.sm,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  logMoreText: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "700" as const,
    letterSpacing: 0.3,
  },
  spacer: { height: DesignTokens.spacing.lg },
});
