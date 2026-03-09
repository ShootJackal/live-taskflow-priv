import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Switch,
} from "react-native";
import {
  RotateCcw,
  Users,
  Star,
  AlertTriangle,
  BarChart3,
  Target,
  Clock,
  ChevronDown,
  Search,
  Check,
  Activity,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DesignTokens } from "@/constants/colors";
import type { ThemeColors } from "@/constants/colors";
import { useCollection } from "@/providers/CollectionProvider";
import {
  normalizeTaskStatus,
  COMPLETED_TASK_STATUSES,
  RECOLLECT_TASK_STATUSES,
  AWARD_OPTIONS,
} from "@/components/tools/toolConstants";
import type { Collector, Task, FullLogEntry, TaskActualRow, LeaderboardEntry } from "@/types";
import { log } from "@/utils/logger";
import {
  fetchFullLog,
  fetchTaskActualsData,
  fetchLeaderboard,
  clearAllCaches,
  forceServerRepull,
  pushLiveAlert,
  adminAssignTask,
  adminCancelTask,
  adminEditHours,
  grantCollectorAward,
} from "@/services/googleSheets";
import SelectPicker from "@/components/SelectPicker";

const atStyles = StyleSheet.create({
  container: { gap: DesignTokens.spacing.sm },
  toolBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 12,
    minHeight: 44, borderRadius: DesignTokens.radius.md, borderWidth: 1, marginBottom: 4,
  },
  toolBtnText: { fontSize: 12, fontWeight: "600" as const, letterSpacing: 0.3 },
  card: {
    borderRadius: DesignTokens.radius.xl,
    padding: DesignTokens.spacing.lg,
    ...DesignTokens.shadow.float,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: DesignTokens.spacing.sm },
  cardTitle: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "700" as const,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    flex: 1,
  },
  perfGrid: { flexDirection: "row", gap: 6 },
  perfItem: { flex: 1, borderRadius: DesignTokens.radius.sm, padding: DesignTokens.spacing.sm, alignItems: "center" },
  perfValue: { fontSize: DesignTokens.fontSize.callout, fontWeight: "700" as const },
  perfLabel: {
    fontSize: DesignTokens.fontSize.caption2,
    fontWeight: "500" as const,
    marginTop: 3,
    letterSpacing: 0.2,
  },
  regionBar: { flexDirection: "row", height: 22, borderRadius: DesignTokens.radius.xs, overflow: "hidden" },
  regionSegment: { justifyContent: "center", alignItems: "center" },
  regionBarLabel: { color: "#fff", fontSize: 12, fontWeight: "800" as const, letterSpacing: 0.5 },
  regionDetail: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  regionText: { fontSize: 12, fontWeight: "600" as const },
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
    paddingVertical: 12,
    minHeight: 44,
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
    paddingVertical: 12,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  controlSearchBtnText: { fontSize: 12, fontWeight: "700" as const, letterSpacing: 0.2 },
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
    paddingVertical: 12,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  controlBtnText: { fontSize: 12, fontWeight: "700" as const, letterSpacing: 0.3 },
  controlPinRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 8 },
  controlPinText: { fontSize: 12, fontWeight: "500" as const },
  taskRow: { borderTopWidth: 1, paddingTop: DesignTokens.spacing.sm, marginTop: DesignTokens.spacing.sm },
  taskInfo: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  taskName: { fontSize: 12, fontWeight: "500" as const, flex: 1 },
  taskBar: { height: 4, borderRadius: 2, overflow: "hidden", marginBottom: 4 },
  taskBarFill: { height: 4, borderRadius: 2 },
  taskMeta: { flexDirection: "row", alignItems: "center", gap: DesignTokens.spacing.sm },
  taskHours: { fontSize: 12, fontWeight: "600" as const },
  taskGood: { fontSize: 12, fontWeight: "500" as const },
  activityRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, paddingTop: DesignTokens.spacing.sm, marginTop: DesignTokens.spacing.sm, gap: DesignTokens.spacing.sm },
  activityDot: { width: 6, height: 6, borderRadius: 3 },
  activityContent: { flex: 1 },
  activityCollector: { fontSize: 12, fontWeight: "600" as const },
  activityTask: { fontSize: 12, marginTop: 1 },
  activityRight: { alignItems: "flex-end" },
  activityHours: { fontSize: 12, fontWeight: "700" as const },
  activityStatus: { fontSize: 12, marginTop: 1 },
  expandHint: { fontSize: 12, textAlign: "center", marginTop: DesignTokens.spacing.xs },
});

export function AdminToolsPanel({
  colors,
  collectors,
  tasks,
}: {
  colors: ThemeColors;
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
      log("[Admin] forceServerRepull failed:", err);
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
        } catch (err) {
          log("[Admin] Alert push after task action failed:", err);
        }
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
        } catch (err) {
          log("[Admin] Alert push after task action failed:", err);
        }
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

      <View style={[atStyles.card, { backgroundColor: colors.bgCard }]}>
        <View style={atStyles.cardHeader}>
          <Users size={12} color={colors.accent} />
          <Text style={[atStyles.cardTitle, { color: colors.accent }]}>Task Control</Text>
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

      <View style={[atStyles.card, { backgroundColor: colors.bgCard }]}>
        <View style={atStyles.cardHeader}>
          <Star size={12} color={colors.gold} />
          <Text style={[atStyles.cardTitle, { color: colors.gold }]}>Collector Awards</Text>
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

      <View style={[atStyles.card, { backgroundColor: colors.bgCard }]}>
        <View style={atStyles.cardHeader}>
          <AlertTriangle size={12} color={colors.alertYellow} />
          <Text style={[atStyles.cardTitle, { color: colors.alertYellow }]}>Broadcast Alert</Text>
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
        <View style={[atStyles.card, { backgroundColor: colors.bgCard }]}>
          <View style={atStyles.cardHeader}>
            <BarChart3 size={12} color={colors.accent} />
            <Text style={[atStyles.cardTitle, { color: colors.accent }]}>Team Performance</Text>
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
        style={[atStyles.card, { backgroundColor: colors.bgCard }]}
        onPress={() => toggleSection("tasks")}
        activeOpacity={0.8}
      >
        <View style={atStyles.cardHeader}>
          <Target size={12} color={colors.mxOrange} />
          <Text style={[atStyles.cardTitle, { color: colors.mxOrange }]}>Active Tasks</Text>
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
        style={[atStyles.card, { backgroundColor: colors.bgCard }]}
        onPress={() => toggleSection("activity")}
        activeOpacity={0.8}
      >
        <View style={atStyles.cardHeader}>
          <Clock size={12} color={colors.statsGreen} />
          <Text style={[atStyles.cardTitle, { color: colors.statsGreen }]}>Recent Activity</Text>
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
