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
  ListTodo,
  Hash,
  FileText,
  User,
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
import type { LogEntry } from "@/types";
import type { ThemeColors } from "@/constants/colors";
import { Image } from "expo-image";

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
  } = useCollection();

  const [refreshing, setRefreshing] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [showTaskSearch, setShowTaskSearch] = useState(false);
  const [logVisibleCount, setLogVisibleCount] = useState(5);
  const [showReviewSheet, setShowReviewSheet] = useState(false);
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
    !!hoursToLog.trim() && parseFloat(hoursToLog) > 0;
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
  }, [assignTask, hasCarryover, carryoverItems.length]);

  const handleComplete = useCallback(() => {
    if (!latestOpenTask) return;
    try {
      completeTask(latestOpenTask.taskName);
    } catch (e: unknown) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Failed to complete task"
      );
    }
  }, [completeTask, latestOpenTask]);

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
    if (!latestOpenTask || !notes.trim()) return;
    try {
      addNote(latestOpenTask.taskName);
    } catch (e: unknown) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Failed to save note"
      );
    }
  }, [addNote, latestOpenTask, notes]);

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
    const totalPlanned = todayOnly.reduce((s, e) => s + e.plannedHours, 0);
    return { completed, totalLogged, totalPlanned, total: todayOnly.length };
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
              {/* ── Large-title header ─────────────────────────────────── */}
              <View style={styles.pageHeader}>
                <View style={styles.headerLeft}>
                  <View style={styles.brandRow}>
                    <Image
                      source={require("../../assets/images/icon.png")}
                      style={styles.brandLogo}
                      contentFit="contain"
                    />
                    <Text
                      style={[
                        styles.brandText,
                        {
                          color: colors.accent,
                          fontFamily: "Lexend_700Bold",
                        },
                      ]}
                    >
                      {t("collect", "Collect")}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.brandSub,
                      {
                        color: colors.textSecondary,
                        fontFamily: "Lexend_400Regular",
                      },
                    ]}
                  >
                    {firstName
                      ? `${firstName}'s Workspace`
                      : "Task Management"}
                  </Text>
                </View>

                <View style={styles.headerRight}>
                  {selectedRig !== "" && (
                    <Text
                      style={[
                        styles.rigLabel,
                        { color: colors.textMuted },
                      ]}
                    >
                      {selectedRig}
                    </Text>
                  )}
                  {openTasks.length > 0 && (
                    <View
                      style={[
                        styles.openPill,
                        {
                          backgroundColor: colors.accentSoft,
                        },
                      ]}
                    >
                      <Circle
                        size={5}
                        color={colors.accent}
                        fill={colors.accent}
                      />
                      <Text
                        style={[
                          styles.openPillText,
                          { color: colors.accent },
                        ]}
                      >
                        {openTasks.length} open
                      </Text>
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
                      <View
                        style={[
                          styles.formRowIcon,
                          { backgroundColor: colors.accentSoft },
                        ]}
                      >
                        <User size={16} color={colors.accent} />
                      </View>
                      <View style={styles.formRowContent}>
                        <Text
                          style={[
                            styles.formRowLabel,
                            { color: colors.textSecondary },
                          ]}
                        >
                          Collector
                        </Text>
                        {isLoadingCollectors ? (
                          <ActivityIndicator
                            size="small"
                            color={colors.accent}
                          />
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
                    <View
                      style={[
                        styles.insetSeparator,
                        { backgroundColor: colors.border },
                      ]}
                    />
                  </>
                )}

                {/* Task field */}
                <View style={styles.formRow}>
                  <View
                    style={[
                      styles.formRowIcon,
                      { backgroundColor: colors.completeBg },
                    ]}
                  >
                    <ListTodo size={16} color={colors.complete} />
                  </View>
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
                  <View
                    style={[
                      styles.formRowIcon,
                      { backgroundColor: colors.assignBg },
                    ]}
                  >
                    <Hash size={16} color={colors.assign} />
                  </View>
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
                      value={hoursToLog}
                      onChangeText={setHoursToLog}
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
                  <View
                    style={[
                      styles.formRowIcon,
                      { backgroundColor: colors.bgInput, marginTop: 2 },
                    ]}
                  >
                    <FileText size={16} color={colors.textMuted} />
                  </View>
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
                      value={notes}
                      onChangeText={setNotes}
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

              {/* ── Primary CTA: Assign ───────────────────────────────── */}
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

              {/* ── Secondary row: Done + Cancel ─────────────────────── */}
              <View style={styles.secondaryRow}>
                <ActionButton
                  title="Done"
                  icon={<CheckCircle size={15} color={colors.complete} />}
                  color={colors.complete}
                  bgColor={colors.completeBg}
                  onPress={handleComplete}
                  disabled={!latestOpenTask || !hasValidHours}
                  testID="complete-btn"
                />
                <ActionButton
                  title="Cancel"
                  icon={<XCircle size={15} color={colors.cancel} />}
                  color={colors.cancel}
                  bgColor={colors.cancelBg}
                  onPress={handleCancel}
                  disabled={!latestOpenTask}
                  testID="cancel-btn"
                />
              </View>

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
              {latestOpenTask !== null && notes.trim().length > 0 && (
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
                        shadowColor: colors.shadow,
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
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  content: {
    paddingHorizontal: DesignTokens.spacing.xl,
    paddingTop: DesignTokens.spacing.lg,
    paddingBottom: 160,
    gap: DesignTokens.spacing.lg,
  },

  // Header — plain text, no card
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: DesignTokens.spacing.md,
    marginBottom: DesignTokens.spacing.sm,
  },
  headerLeft: { gap: 4 },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  brandLogo: { width: 32, height: 32, borderRadius: 10 },
  brandText: {
    fontSize: DesignTokens.fontSize.largeTitle,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
  },
  brandSub: {
    fontSize: DesignTokens.fontSize.subhead,
    letterSpacing: 0.2,
    marginLeft: 44, // align under text
  },
  headerRight: {
    alignItems: "flex-end",
    gap: DesignTokens.spacing.sm,
  },
  rigLabel: {
    fontSize: DesignTokens.fontSize.footnote,
    letterSpacing: 0.5,
    fontWeight: "500" as const,
  },
  openPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: DesignTokens.radius.pill,
    borderWidth: 0,
  },
  openPillText: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "600" as const,
    letterSpacing: 0.3,
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

  // iOS-grouped form section — no border, shadow only
  formSection: {
    borderRadius: DesignTokens.radius.xxl,
    overflow: "hidden",
    marginBottom: DesignTokens.spacing.sm,
  },
  formRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: DesignTokens.spacing.xl,
    paddingVertical: DesignTokens.spacing.lg,
    gap: DesignTokens.spacing.lg,
    minHeight: 58,
  },
  formRowIcon: {
    width: 38,
    height: 38,
    borderRadius: DesignTokens.radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  formRowContent: { flex: 1 },
  formRowLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  formRowLabel: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "600" as const,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  formRowLabelRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: DesignTokens.spacing.sm,
  },
  // Inset separator — starts after icon column
  insetSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 76, // 22 padding + 38 icon + 16 gap
  },
  searchToggle: {
    width: 34,
    height: 34,
    borderRadius: DesignTokens.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  searchWrap: { overflow: "hidden", marginBottom: 8 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderRadius: DesignTokens.radius.md,
    borderWidth: 0,
    gap: 8,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: DesignTokens.fontSize.body,
    paddingVertical: 0,
  },
  input: {
    borderRadius: DesignTokens.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: DesignTokens.fontSize.body,
    fontWeight: "500" as const,
    borderWidth: 0,
  },
  notesInput: {
    minHeight: 70,
    fontSize: DesignTokens.fontSize.subhead,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    marginTop: 5,
  },
  hintText: {
    flex: 1,
    fontSize: DesignTokens.fontSize.caption2,
    lineHeight: 15,
    fontWeight: "500" as const,
  },
  optionalTag: {
    fontSize: DesignTokens.fontSize.caption2,
    fontWeight: "500" as const,
  },
  requiredTag: {
    fontSize: DesignTokens.fontSize.caption2,
    fontWeight: "700" as const,
  },

  // Secondary actions (Done / Cancel)
  secondaryRow: {
    flexDirection: "row",
    gap: DesignTokens.spacing.sm,
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
    textTransform: "uppercase",
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
    borderRadius: DesignTokens.radius.xxl,
    paddingHorizontal: DesignTokens.spacing.xl,
    paddingVertical: DesignTokens.spacing.md,
  },
  logMoreBtn: {
    marginTop: 10,
    borderWidth: 0,
    borderRadius: DesignTokens.radius.md,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  logMoreText: {
    fontSize: DesignTokens.fontSize.footnote,
    fontWeight: "600" as const,
    letterSpacing: 0.4,
  },
  spacer: { height: DesignTokens.spacing.xl },
});
