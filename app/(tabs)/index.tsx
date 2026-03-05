import React, { useMemo, useCallback, useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
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

const LogEntryRow = React.memo(function LogEntryRow({ entry, statusColor, colors, isLast }: {
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
  const taskProgressPct = Math.max(0, Math.min(100, Math.round(Number(entry.taskProgressPct ?? (taskTotal > 0 ? (taskCollected / taskTotal) * 100 : 0)))));

  return (
    <View style={[logStyles.row, !isLast && { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
      <View style={logStyles.rowLeft}>
        <View style={[logStyles.statusStripe, { backgroundColor: statusColor }]} />
        <View style={logStyles.rowContent}>
          <MarqueeText
            text={entry.taskName}
            style={[logStyles.taskName, { color: colors.textPrimary }]}
            speedMs={4300}
          />
          <View style={logStyles.metaRow}>
            <View style={[logStyles.statusBadge, { backgroundColor: statusColor + '14' }]}>
              <Text style={[logStyles.statusText, { color: statusColor }]}>
                {entry.status}
              </Text>
            </View>
            <Text style={[logStyles.hours, { color: colors.textMuted }]}>
              {Number(entry.loggedHours).toFixed(2)}h / {Number(entry.plannedHours).toFixed(2)}h
            </Text>
          </View>
          {hasTaskProgress && (
            <View style={[logStyles.taskSnapshot, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
              <View style={logStyles.taskSnapshotTop}>
                <Text style={[logStyles.taskStat, { color: colors.complete }]}>
                  Good {taskGood.toFixed(2)}h
                </Text>
                <Text style={[logStyles.taskStat, { color: colors.statusPending }]}>
                  Missing {taskRemaining.toFixed(2)}h
                </Text>
                <Text style={[logStyles.taskPct, { color: colors.textSecondary }]}>{taskProgressPct}%</Text>
              </View>
              {taskTotal > 0 && (
                <View style={[logStyles.taskTrack, { backgroundColor: colors.border }]}>
                  <View style={[logStyles.taskFill, { backgroundColor: colors.accent, width: `${taskProgressPct}%` as any }]} />
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
  row: { paddingVertical: 7 },
  rowLeft: { flexDirection: "row", gap: 10 },
  statusStripe: { width: 3, borderRadius: 2, minHeight: 30 },
  rowContent: { flex: 1 },
  taskName: { fontSize: 13, fontWeight: "600" as const, marginBottom: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: "600" as const },
  hours: { fontSize: 11 },
  remaining: { fontSize: 11, fontWeight: "500" as const },
  taskSnapshot: { marginTop: 6, borderRadius: 7, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  taskSnapshotTop: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  taskStat: { fontSize: 10, fontWeight: "500" as const },
  taskPct: { marginLeft: "auto", fontSize: 10, fontWeight: "700" as const },
  taskTrack: { marginTop: 6, height: 3, borderRadius: 2, overflow: "hidden" },
  taskFill: { height: 3, borderRadius: 2 },
});

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
  const slideAnim = useRef(new Animated.Value(20)).current;
  const searchAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, speed: 20, bounciness: 4, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const collectorOptions = useMemo(
    () => collectors.map((c) => ({ value: c.name, label: c.name })),
    [collectors]
  );

  const taskOptions = useMemo(
    () => {
      const allTasks = tasks.map((t) => ({ value: t.name, label: t.label }));
      if (!taskSearch.trim()) return allTasks;
      const q = taskSearch.toLowerCase();
      return allTasks.filter((t) => t.label.toLowerCase().includes(q));
    },
    [tasks, taskSearch]
  );

  const hasValidHours = !!hoursToLog.trim() && parseFloat(hoursToLog) > 0;
  const canSubmit = !!selectedCollectorName && !!selectedTaskName;
  const canSubmitWithHours = canSubmit && hasValidHours;
  const latestOpenTask = openTasks.length > 0 ? openTasks[0] : null;
  const plannedHoursHint = latestOpenTask ? latestOpenTask.plannedHours : 0;

  const toggleTaskSearch = useCallback(() => {
    const next = !showTaskSearch;
    setShowTaskSearch(next);
    Animated.timing(searchAnim, { toValue: next ? 1 : 0, duration: 200, useNativeDriver: false }).start();
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
    try { assignTask(); } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to assign task");
    }
  }, [assignTask]);

  const handleComplete = useCallback(() => {
    if (!latestOpenTask) return;
    try { completeTask(latestOpenTask.taskName); } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to complete task");
    }
  }, [completeTask, latestOpenTask]);

  const handleCancel = useCallback(() => {
    if (!latestOpenTask) return;
    Alert.alert("Cancel Task", `Cancel "${latestOpenTask.taskName}"?`, [
      { text: "No", style: "cancel" },
      { text: "Yes", style: "destructive", onPress: () => {
        try { cancelTask(latestOpenTask.taskName); } catch (e: unknown) {
          Alert.alert("Error", e instanceof Error ? e.message : "Failed to cancel");
        }
      }},
    ]);
  }, [cancelTask, latestOpenTask]);

  const handleAddNote = useCallback(() => {
    if (!latestOpenTask || !notes.trim()) return;
    try { addNote(latestOpenTask.taskName); } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save note");
    }
  }, [addNote, latestOpenTask, notes]);

  const todayStats = useMemo(() => {
    const completed = todayLog.filter((e) => e.status === "Completed").length;
    const totalLogged = todayLog.reduce((s, e) => s + e.loggedHours, 0);
    const totalPlanned = todayLog.reduce((s, e) => s + e.plannedHours, 0);
    return { completed, totalLogged, totalPlanned, total: todayLog.length };
  }, [todayLog]);
  const visibleLog = useMemo(() => todayLog.slice(0, logVisibleCount), [todayLog, logVisibleCount]);

  useEffect(() => {
    setLogVisibleCount(5);
  }, [selectedCollectorName]);

  useEffect(() => {
    setLogVisibleCount((prev) => {
      const cap = Math.max(todayLog.length, 5);
      return Math.min(prev, cap);
    });
  }, [todayLog.length]);

  const getStatusColor = useCallback((status: string) => {
    if (status === "Completed") return colors.statusActive;
    if (status === "Partial") return colors.statusPending;
    if (status === "Canceled") return colors.statusCancelled;
    return colors.accent;
  }, [colors]);

  const cardShadow = useMemo(() => ({
    shadowColor: colors.shadow,
    ...DesignTokens.shadow.elevated,
  }), [colors]);

  return (
    <ErrorBoundary fallbackMessage="Something went wrong loading the Collect screen.">
    <ScreenContainer>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Animated.View style={[styles.flex, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} colors={[colors.accent]} />
          }
        >
          <View style={[styles.header, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View pointerEvents="none" accessible={false} style={[styles.headerGlow, { backgroundColor: colors.accentSoft }]} />
            <View style={styles.headerLeft}>
              <View style={[styles.headerTag, { backgroundColor: colors.accentSoft, borderColor: colors.accentDim }]}>
                <Text style={[styles.headerTagText, { color: colors.accent }]}>COLLECT HUB</Text>
              </View>
              <View style={styles.brandRow}>
                <Image source={require("../../assets/images/icon.png")} style={styles.brandLogo} contentFit="contain" />
                <Text style={[styles.brandText, { color: colors.accent, fontFamily: "Lexend_700Bold" }]}>
                  {t("collect", "Collect")}
                </Text>
              </View>
              <Text style={[styles.brandSub, { color: colors.textSecondary, fontFamily: "Lexend_400Regular" }]}>
                {selectedCollector ? `${selectedCollector.name.split(" ")[0]}'s Workspace` : "Task Management"}
              </Text>
            </View>
            <View style={styles.headerRight}>
              {selectedRig !== "" && (
                <Text style={[styles.rigLabel, { color: colors.textMuted }]}>{selectedRig}</Text>
              )}
              {openTasks.length > 0 && (
                <View style={[styles.openPill, { backgroundColor: colors.accentSoft, borderColor: colors.accentDim }]}>
                  <Circle size={6} color={colors.accent} fill={colors.accent} />
                  <Text style={[styles.openPillText, { color: colors.accent }]}>{openTasks.length} open</Text>
                </View>
              )}
            </View>
          </View>

          {!configured && (
            <View style={[styles.notice, { backgroundColor: colors.bgCard, borderColor: colors.border, ...cardShadow }]}>
              <AlertCircle size={14} color={colors.statusPending} />
              <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
                Set EXPO_PUBLIC_GOOGLE_SCRIPT_URL to connect (or CORE/ANALYTICS URLs)
              </Text>
            </View>
          )}

          {!!submitError && (
            <View style={[styles.notice, { backgroundColor: colors.cancelBg, borderColor: colors.cancel + "25" }]}>
              <AlertCircle size={14} color={colors.cancel} />
              <Text style={[styles.noticeText, { color: colors.cancel }]}>{submitError}</Text>
            </View>
          )}

          <View style={[styles.formCard, { backgroundColor: colors.bgCard, borderColor: colors.border, ...cardShadow }]}>
            {!selectedCollectorName && (
              <View style={styles.formField}>
                <View style={styles.fieldRow}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Collector</Text>
                  {isLoadingCollectors && <ActivityIndicator size="small" color={colors.accent} />}
                </View>
                <SelectPicker
                  label=""
                  options={collectorOptions}
                  selectedValue={selectedCollectorName}
                  onValueChange={selectCollector}
                  placeholder="Who are you? (set in Tools)"
                  testID="collector-picker"
                />
                <View style={[styles.separator, { backgroundColor: colors.border }]} />
              </View>
            )}

            <View style={styles.formField}>
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Task</Text>
                <View style={styles.fieldRowRight}>
                  {isLoadingTasks && <ActivityIndicator size="small" color={colors.accent} />}
                  <TouchableOpacity
                    onPress={toggleTaskSearch}
                    style={[styles.searchToggle, {
                      backgroundColor: showTaskSearch ? colors.accentSoft : 'transparent',
                    }]}
                    activeOpacity={0.7}
                    testID="task-search-toggle"
                  >
                    {showTaskSearch ? <X size={14} color={colors.accent} /> : <Search size={14} color={colors.textMuted} />}
                  </TouchableOpacity>
                </View>
              </View>

              {showTaskSearch && (
                <Animated.View style={[styles.searchWrap, {
                  opacity: searchAnim,
                  maxHeight: searchAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 44] }),
                }]}>
                  <View style={[styles.searchBar, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
                    <Search size={13} color={colors.textMuted} />
                    <TextInput
                      style={[styles.searchInput, { color: colors.textPrimary }]}
                      value={taskSearch}
                      onChangeText={setTaskSearch}
                      placeholder="Search tasks..."
                      placeholderTextColor={colors.textMuted}
                      autoFocus
                      testID="task-search-input"
                    />
                    {taskSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setTaskSearch("")} activeOpacity={0.7}>
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
                placeholder={taskSearch ? `${taskOptions.length} tasks found...` : "Choose a task..."}
                testID="task-picker"
              />
            </View>

            <View style={[styles.separator, { backgroundColor: colors.border }]} />

            <View style={styles.formField}>
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Hours</Text>
                <Text style={[styles.requiredTag, { color: colors.cancel }]}>required</Text>
              </View>
              <TextInput
                style={[styles.input, {
                  backgroundColor: colors.bgInput,
                  borderColor: !hoursToLog.trim() ? colors.statusPending + '60' : colors.border,
                  color: colors.textPrimary,
                }]}
                value={hoursToLog}
                onChangeText={setHoursToLog}
                placeholder="Enter hours (e.g. 1.5)"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                returnKeyType="done"
                testID="hours-input"
              />
              {!hoursToLog.trim() && (
                <View style={styles.hintRow}>
                  <AlertCircle size={10} color={colors.statusPending} />
                  <Text style={[styles.hintText, { color: colors.statusPending }]}>
                    You must enter your actual hours before submitting
                  </Text>
                </View>
              )}
              {latestOpenTask && plannedHoursHint > 0 && (
                <View style={styles.hintRow}>
                  <Info size={10} color={colors.statusPending} />
                  <Text style={[styles.hintText, { color: colors.statusPending }]}>
                    Planned chunk: {Number(plannedHoursHint).toFixed(2)}h
                  </Text>
                </View>
              )}
            </View>

            <View style={[styles.separator, { backgroundColor: colors.border }]} />

            <View style={styles.formField}>
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Notes</Text>
                <Text style={[styles.optionalTag, { color: colors.textMuted }]}>optional</Text>
              </View>
              <TextInput
                style={[styles.input, styles.notesInput, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPrimary }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add notes..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                testID="notes-input"
              />
            </View>
          </View>

          <View style={styles.actionsRow}>
            <ActionButton
              title="Assign"
              icon={<UserCheck size={15} color={colors.assign} />}
              color={colors.assign}
              bgColor={colors.assignBg}
              onPress={handleAssign}
              disabled={!canSubmitWithHours}
              testID="assign-btn"
            />
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

          {isSyncing && (
            <View style={styles.syncBadge}>
              <ActivityIndicator size={10} color={colors.accent} />
              <Text style={[styles.syncText, { color: colors.textMuted }]}>Syncing...</Text>
            </View>
          )}

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

          {selectedCollectorName !== "" && todayLog.length > 0 && (
            <View style={[styles.logCard, { backgroundColor: colors.bgCard, borderColor: colors.border, ...cardShadow }]}>
              <View style={styles.logHeader}>
                <View style={styles.logHeaderLeft}>
                  <Clock size={12} color={colors.textMuted} />
                  <Text style={[styles.logTitle, { color: colors.textMuted }]}>{t("todays_activity", "Today's Activity")}</Text>
                </View>
                <View style={styles.logStats}>
                  <Text style={[styles.logStatText, { color: colors.complete }]}>
                    {todayStats.completed} done
                  </Text>
                  <Text style={[styles.logStatDivider, { color: colors.border }]}>|</Text>
                  <Text style={[styles.logStatText, { color: colors.accent }]}>
                    {todayStats.totalLogged.toFixed(2)}h
                  </Text>
                </View>
              </View>
              {isLoadingLog && <ActivityIndicator size="small" color={colors.accent} style={{ marginBottom: 6 }} />}
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
                  style={[styles.logMoreBtn, { borderColor: colors.border, backgroundColor: colors.bgInput }]}
                  onPress={() => {
                    setLogVisibleCount((prev) => (prev >= todayLog.length ? 5 : Math.min(todayLog.length, prev + 5)));
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.logMoreText, { color: colors.accent }]}>
                    {logVisibleCount >= todayLog.length ? t("show_less", "Show Less") : t("load_more", "Load More")}
                  </Text>
                </TouchableOpacity>
              )}
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
  content: { padding: DesignTokens.spacing.xl, paddingBottom: 140 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: DesignTokens.spacing.xl,
    padding: DesignTokens.spacing.lg,
    borderRadius: DesignTokens.radius.xl,
    borderWidth: 1,
    overflow: "hidden",
  },
  headerGlow: {
    position: "absolute",
    top: -44,
    left: -20,
    right: -20,
    height: 120,
    opacity: 0.78,
    borderBottomLeftRadius: 70,
    borderBottomRightRadius: 70,
  },
  headerLeft: { gap: DesignTokens.spacing.xs },
  headerTag: {
    alignSelf: "flex-start",
    borderRadius: DesignTokens.radius.xs,
    borderWidth: 1,
    paddingHorizontal: DesignTokens.spacing.sm,
    paddingVertical: 3,
    marginBottom: 2,
  },
  headerTagText: {
    fontSize: 9,
    fontWeight: "800" as const,
    letterSpacing: 1.1,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandLogo: { width: 26, height: 26, borderRadius: 8 },
  headerRight: { alignItems: "flex-end", gap: DesignTokens.spacing.xs + 2 },
  brandText: { fontSize: 34, fontWeight: "700" as const, letterSpacing: 0.2 },
  brandSub: { fontSize: 12, fontWeight: "500" as const, letterSpacing: 0.7, marginTop: 2, textTransform: "uppercase" },
  rigLabel: { fontSize: 10, letterSpacing: 0.6, fontWeight: "500" as const },
  openPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: DesignTokens.radius.sm,
    borderWidth: 1,
  },
  openPillText: { fontSize: 10, fontWeight: "700" as const, letterSpacing: 0.5 },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: DesignTokens.radius.md,
    padding: DesignTokens.spacing.md,
    marginBottom: DesignTokens.spacing.md,
    gap: 10,
    borderWidth: 1,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18 },
  formCard: { borderRadius: DesignTokens.radius.xl, padding: DesignTokens.spacing.xl, marginBottom: DesignTokens.spacing.lg, borderWidth: 1 },
  formField: { paddingVertical: 2 },
  fieldLabel: { fontSize: 11, fontWeight: "700" as const, marginBottom: 6, letterSpacing: 0.4, textTransform: "uppercase" },
  fieldRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  fieldRowRight: { flexDirection: "row", alignItems: "center", gap: DesignTokens.spacing.sm },
  optionalTag: { fontSize: 10, fontWeight: "500" as const },
  requiredTag: { fontSize: 10, fontWeight: "700" as const },
  separator: { height: 1, marginVertical: 10 },
  searchToggle: {
    width: 28, height: 28, borderRadius: DesignTokens.radius.sm, alignItems: "center", justifyContent: "center",
  },
  searchWrap: { marginBottom: 6, overflow: "hidden" },
  searchBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 10, borderRadius: DesignTokens.radius.sm, borderWidth: 1, gap: 6,
  },
  searchInput: { flex: 1, fontSize: 13, paddingVertical: DesignTokens.spacing.sm },
  input: { borderRadius: DesignTokens.radius.md, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontWeight: "500" as const, borderWidth: 1 },
  notesInput: { minHeight: 56, fontSize: 13 },
  hintRow: { flexDirection: "row", alignItems: "flex-start", gap: 5, marginTop: 6 },
  hintText: { flex: 1, fontSize: 11, lineHeight: 15, fontWeight: "500" as const },
  actionsRow: { flexDirection: "row", gap: DesignTokens.spacing.sm, marginBottom: 10 },
  syncBadge: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 8 },
  syncText: { fontSize: 11, fontWeight: "500" as const },
  logCard: { borderRadius: DesignTokens.radius.xl, padding: DesignTokens.spacing.lg, marginTop: DesignTokens.spacing.md, borderWidth: 1 },
  logHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: DesignTokens.spacing.sm,
    paddingBottom: DesignTokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.08)",
  },
  logHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 5 },
  logTitle: { fontSize: 10, fontWeight: "700" as const, letterSpacing: 1, textTransform: "uppercase" },
  logStats: { flexDirection: "row", alignItems: "center", gap: 6 },
  logStatText: { fontSize: 11, fontWeight: "600" as const },
  logStatDivider: { fontSize: 10 },
  logMoreBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.sm,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  logMoreText: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.4 },
  spacer: { height: DesignTokens.spacing.xl },
});
