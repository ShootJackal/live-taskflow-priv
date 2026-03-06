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
  Info,
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
  const hasTaskProgress =
    typeof entry.taskCollectedHours === "number" ||
    typeof entry.taskGoodHours === "number" ||
    typeof entry.taskRemainingHours === "number";
  const taskCollected = Number(entry.taskCollectedHours ?? 0);
  const taskGood = Number(entry.taskGoodHours ?? 0);
  const taskRemaining = Number(entry.taskRemainingHours ?? 0);
  const taskTotal = Math.max(taskCollected + taskRemaining, 0);
  const taskProgressPct = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        Number(
          entry.taskProgressPct ??
            (taskTotal > 0 ? (taskCollected / taskTotal) * 100 : 0)
        )
      )
    )
  );

  return (
    <View
      style={[
        logStyles.row,
        !isLast && {
          borderBottomColor: colors.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={logStyles.rowLeft}>
        <View
          style={[logStyles.statusStripe, { backgroundColor: statusColor }]}
        />
        <View style={logStyles.rowContent}>
          <MarqueeText
            text={entry.taskName}
            style={[logStyles.taskName, { color: colors.textPrimary }]}
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
            <Text style={[logStyles.hours, { color: colors.textMuted }]}>
              {Number(entry.loggedHours).toFixed(2)}h /{" "}
              {Number(entry.plannedHours).toFixed(2)}h planned
            </Text>
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
                <Text
                  style={[logStyles.taskStat, { color: colors.complete }]}
                >
                  Good {taskGood.toFixed(2)}h
                </Text>
                <Text
                  style={[
                    logStyles.taskStat,
                    { color: colors.statusPending },
                  ]}
                >
                  Remaining {taskRemaining.toFixed(2)}h
                </Text>
                <Text
                  style={[
                    logStyles.taskPct,
                    { color: colors.textSecondary },
                  ]}
                >
                  {taskProgressPct}%
                </Text>
              </View>
              {taskTotal > 0 && (
                <View
                  style={[
                    logStyles.taskTrack,
                    { backgroundColor: colors.border },
                  ]}
                >
                  <View
                    style={[
                      logStyles.taskFill,
                      {
                        backgroundColor: colors.accent,
                        width: `${taskProgressPct}%` as any,
                      },
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
  const canSubmit = !!selectedCollectorName && !!selectedTaskName;
  const canSubmitWithHours = canSubmit && hasValidHours;
  const latestOpenTask = openTasks.length > 0 ? openTasks[0] : null;
  const plannedHoursHint = latestOpenTask ? latestOpenTask.plannedHours : 0;

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
    try {
      assignTask();
    } catch (e: unknown) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Failed to assign task"
      );
    }
  }, [assignTask]);

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
                          borderColor: colors.accentDim,
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
                      In Progress · {Number(latestOpenTask.plannedHours).toFixed(2)}h planned
                    </Text>
                  </View>
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
                          styles.requiredTag,
                          { color: colors.cancel },
                        ]}
                      >
                        required
                      </Text>
                    </View>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: colors.bgInput,
                          borderColor: !hoursToLog.trim()
                            ? colors.statusPending + "55"
                            : colors.border,
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
                    {!hoursToLog.trim() && (
                      <View style={styles.hintRow}>
                        <AlertCircle
                          size={11}
                          color={colors.statusPending}
                        />
                        <Text
                          style={[
                            styles.hintText,
                            { color: colors.statusPending },
                          ]}
                        >
                          Enter actual hours before submitting
                        </Text>
                      </View>
                    )}
                    {latestOpenTask && plannedHoursHint > 0 && (
                      <View style={styles.hintRow}>
                        <Info size={11} color={colors.textMuted} />
                        <Text
                          style={[
                            styles.hintText,
                            { color: colors.textMuted },
                          ]}
                        >
                          Planned chunk:{" "}
                          {Number(plannedHoursHint).toFixed(2)}h
                        </Text>
                      </View>
                    )}
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
                disabled={!canSubmitWithHours}
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
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  content: {
    paddingHorizontal: DesignTokens.spacing.xl,
    paddingTop: DesignTokens.spacing.lg,
    paddingBottom: 150,
    gap: DesignTokens.spacing.md,
  },

  // Header — plain text, no card
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: DesignTokens.spacing.sm,
    marginBottom: DesignTokens.spacing.xs,
  },
  headerLeft: { gap: 3 },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandLogo: { width: 28, height: 28, borderRadius: 8 },
  brandText: {
    fontSize: DesignTokens.fontSize.largeTitle,
    fontWeight: "700" as const,
    letterSpacing: 0.1,
  },
  brandSub: {
    fontSize: DesignTokens.fontSize.footnote,
    letterSpacing: 0.3,
    marginLeft: 38, // align under text
  },
  headerRight: {
    alignItems: "flex-end",
    gap: DesignTokens.spacing.xs,
  },
  rigLabel: {
    fontSize: DesignTokens.fontSize.caption1,
    letterSpacing: 0.4,
    fontWeight: "500" as const,
  },
  openPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: DesignTokens.radius.pill,
    borderWidth: 1,
  },
  openPillText: {
    fontSize: DesignTokens.fontSize.caption2,
    fontWeight: "700" as const,
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
    borderRadius: DesignTokens.radius.xl,
    overflow: "hidden",
    marginBottom: DesignTokens.spacing.xs,
  },
  formRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: DesignTokens.spacing.lg,
    paddingVertical: DesignTokens.spacing.md,
    gap: DesignTokens.spacing.md,
    minHeight: 52,
  },
  formRowIcon: {
    width: 34,
    height: 34,
    borderRadius: DesignTokens.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  formRowContent: { flex: 1 },
  formRowLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  formRowLabel: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "700" as const,
    letterSpacing: 0.3,
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
    marginLeft: 66, // 16 padding + 34 icon + 16 gap
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
