import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { RefreshCw, AlertCircle, Clock, RotateCcw } from "lucide-react-native";
import { useTheme } from "@/providers/ThemeProvider";
import type { ThemeColors } from "@/constants/colors";
import { useCollection } from "@/providers/CollectionProvider";
import MarqueeText from "@/components/MarqueeText";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchFullLog,
  fetchTaskActualsData,
  fetchTodayLog,
} from "@/services/googleSheets";
import type { TaskActualRow } from "@/types";

function formatTwoDecimals(value: number): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  if (Math.abs(n) > 10000) return "0.00";
  return n.toFixed(2);
}

function formatCount(value: number): string {
  return String(Math.max(0, Math.trunc(Number(value) || 0)));
}

function StatusBadge({ status, colors }: { status: string; colors: ThemeColors }) {
  const upper = status.toUpperCase();
  const isComplete = upper === "COMPLETED" || upper === "DONE";
  const isCanceled = upper === "CANCELED";
  const isRecollect = upper === "RECOLLECT";
  const isPartial = upper === "PARTIAL";
  const isProgress = upper === "IN PROGRESS" || upper === "IN_PROGRESS";

  const bg = isComplete ? colors.completeBg
    : isCanceled ? colors.cancelBg
    : isRecollect ? colors.cancel + "18"
    : isPartial ? colors.statusPending + "18"
    : isProgress ? colors.accentSoft
    : colors.bgInput;

  const fg = isComplete ? colors.complete
    : isCanceled ? colors.cancel
    : isRecollect ? colors.cancel
    : isPartial ? colors.statusPending
    : isProgress ? colors.accent
    : colors.textMuted;

  return (
    <View style={[badgeStyles.badge, { backgroundColor: bg }]}>
      <Text style={[badgeStyles.text, { color: fg }]}>{status || "\u2014"}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  text: { fontSize: 10, fontWeight: "700" as const, letterSpacing: 0.3 },
});

function LoadingState({ colors, message }: { colors: ThemeColors; message: string }) {
  return (
    <View style={viewStyles.center}>
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={[viewStyles.loadingText, { color: colors.textMuted }]}>{message}</Text>
    </View>
  );
}

function ErrorState({ colors, message, onRetry }: { colors: ThemeColors; message: string; onRetry: () => void }) {
  return (
    <View style={viewStyles.center}>
      <AlertCircle size={32} color={colors.cancel} />
      <Text style={[viewStyles.errorTitle, { color: colors.textPrimary }]}>Failed to load</Text>
      <Text style={[viewStyles.errorText, { color: colors.textMuted }]}>{message}</Text>
      <TouchableOpacity
        style={[viewStyles.retryBtn, { backgroundColor: colors.accentSoft }]}
        onPress={onRetry}
        activeOpacity={0.7}
      >
        <RotateCcw size={14} color={colors.accent} />
        <Text style={[viewStyles.retryText, { color: colors.accent }]}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

function EmptyState({ colors, message }: { colors: ThemeColors; message: string }) {
  return (
    <View style={viewStyles.center}>
      <Text style={[viewStyles.emptyText, { color: colors.textMuted }]}>{message}</Text>
    </View>
  );
}

function AssignmentLogView({ collectorName, configured }: { collectorName: string; configured: boolean }) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();

  const logQuery = useQuery({
    queryKey: ["fullLog", collectorName],
    queryFn: () => fetchFullLog(collectorName || undefined),
    enabled: configured,
    staleTime: 30000,
    retry: 2,
  });

  const todayLogQuery = useQuery({
    queryKey: ["todayLog", collectorName],
    queryFn: () => fetchTodayLog(collectorName),
    enabled: configured && !!collectorName,
    staleTime: 30000,
  });

  const entries = logQuery.data ?? [];
  const todayEntries = todayLogQuery.data ?? [];
  const displayEntries = entries.length > 0 ? entries : todayEntries.map((e) => ({
    collector: collectorName,
    taskName: e.taskName,
    status: e.status,
    loggedHours: e.loggedHours,
    plannedHours: e.plannedHours,
    remainingHours: e.remainingHours,
    taskCollectedHours: e.taskCollectedHours,
    taskGoodHours: e.taskGoodHours,
    taskRemainingHours: e.taskRemainingHours,
    taskProgressPct: e.taskProgressPct,
    assignedDate: e.assignedDate,
  }));

  if (logQuery.isLoading && todayLogQuery.isLoading) {
    return <LoadingState colors={colors} message="Loading assignment log..." />;
  }

  if (logQuery.isError && todayLogQuery.isError) {
    return (
      <ErrorState
        colors={colors}
        message={logQuery.error?.message ?? "Unknown error"}
        onRetry={() => {
          queryClient.invalidateQueries({ queryKey: ["fullLog"] });
          queryClient.invalidateQueries({ queryKey: ["todayLog"] });
        }}
      />
    );
  }

  if (!displayEntries.length) {
    return <EmptyState colors={colors} message={collectorName ? `No log entries found for ${collectorName}` : "Select a collector in Tools to see your log"} />;
  }

  return (
    <View style={viewStyles.list}>
      <Text style={[viewStyles.countLabel, { color: colors.textMuted }]}>
        {displayEntries.length} {displayEntries.length === 1 ? "entry" : "entries"}
      </Text>
      {displayEntries.map((entry, idx) => (
        <View
          key={`log_${idx}`}
          style={[viewStyles.entryCard, { backgroundColor: colors.bgCard, borderColor: colors.border, shadowColor: colors.shadow }]}
        >
          <View style={viewStyles.entryTop}>
            <MarqueeText
              text={entry.taskName}
              style={[viewStyles.taskName, { color: colors.textPrimary }]}
              speedMs={4600}
            />
            <StatusBadge status={entry.status} colors={colors} />
          </View>
          <View style={viewStyles.entryMeta}>
            {entry.collector ? (
              <Text style={[viewStyles.metaChip, { color: colors.accent, backgroundColor: colors.accentSoft }]}>
                {entry.collector}
              </Text>
            ) : null}
            {Number(entry.loggedHours) > 0 && (
              <Text style={[viewStyles.metaText, { color: colors.textSecondary }]}>
                {Number(entry.loggedHours).toFixed(2)}h logged
              </Text>
            )}
          </View>
          {(typeof entry.taskGoodHours === "number" || typeof entry.taskRemainingHours === "number") && (
            <View style={[viewStyles.taskMetaRow, { borderColor: colors.border, backgroundColor: colors.bgInput }]}>
              <Text style={[viewStyles.taskMetaText, { color: colors.complete }]}>
                CB Actual {Number(entry.taskGoodHours ?? 0).toFixed(2)}h
              </Text>
              <Text style={[viewStyles.taskMetaText, { color: colors.statusPending }]}>
                Missing {Number(entry.taskRemainingHours ?? 0).toFixed(2)}h
              </Text>
              <Text style={[viewStyles.taskMetaPct, { color: colors.textSecondary }]}>
                {Math.round(Number(entry.taskProgressPct ?? 0))}%
              </Text>
            </View>
          )}
          {entry.assignedDate ? (
            <Text style={[viewStyles.dateText, { color: colors.textMuted }]}>{entry.assignedDate}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function TaskActualsView({ configured }: { configured: boolean }) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();

  const taskQuery = useQuery({
    queryKey: ["taskActualsSheet"],
    queryFn: fetchTaskActualsData,
    enabled: configured,
    staleTime: 60000,
    retry: 2,
  });

  const tasks = useMemo(() => taskQuery.data ?? [], [taskQuery.data]);

  const grouped = useMemo(() => {
    const done: TaskActualRow[] = [];
    const active: TaskActualRow[] = [];
    const recollect: TaskActualRow[] = [];
    const other: TaskActualRow[] = [];

    for (const t of tasks) {
      const st = String(t.status ?? "").toUpperCase();
      if (st === "DONE") done.push(t);
      else if (st === "RECOLLECT") recollect.push(t);
      else if (st === "IN_PROGRESS") active.push(t);
      else other.push(t);
    }
    return { recollect, active, other, done };
  }, [tasks]);

  const hourTotals = useMemo(() => {
    return tasks.reduce(
      (acc, task) => {
        const collected = Number(task.collectedHours) || 0;
        const good = Number(task.goodHours) || 0;
        const remaining = Number(task.remainingHours) || 0;
        acc.collected += Math.abs(collected) > 10000 ? 0 : collected;
        acc.good += Math.abs(good) > 10000 ? 0 : good;
        acc.remaining += Math.abs(remaining) > 10000 ? 0 : remaining;
        return acc;
      },
      { collected: 0, good: 0, remaining: 0 }
    );
  }, [tasks]);

  if (taskQuery.isLoading) {
    return <LoadingState colors={colors} message="Loading task actuals..." />;
  }

  if (taskQuery.isError) {
    return (
      <ErrorState
        colors={colors}
        message={taskQuery.error?.message ?? "Add getTaskActualsSheet endpoint to your Apps Script and redeploy"}
        onRetry={() => queryClient.invalidateQueries({ queryKey: ["taskActualsSheet"] })}
      />
    );
  }

  if (!tasks.length) {
    return <EmptyState colors={colors} message="No task actuals data available" />;
  }

  return (
    <View style={viewStyles.list}>
      <View style={viewStyles.summaryRow}>
        <SummaryChip label="Total" value={formatCount(tasks.length)} color={colors.textPrimary} bg={colors.bgInput} />
        <SummaryChip label="Active" value={formatCount(grouped.active.length)} color={colors.accent} bg={colors.accentSoft} />
        <SummaryChip label="Recollect" value={formatCount(grouped.recollect.length)} color={colors.cancel} bg={colors.cancelBg} />
        <SummaryChip label="Done" value={formatCount(grouped.done.length)} color={colors.complete} bg={colors.completeBg} />
      </View>
      <View style={viewStyles.summaryRow}>
        <SummaryChip label="Collected hrs" value={`${formatTwoDecimals(hourTotals.collected)}h`} color={colors.accent} bg={colors.accentSoft} />
        <SummaryChip label="Good hrs" value={`${formatTwoDecimals(hourTotals.good)}h`} color={colors.complete} bg={colors.completeBg} />
        <SummaryChip label="Remaining hrs" value={`${formatTwoDecimals(hourTotals.remaining)}h`} color={colors.statusPending} bg={colors.alertYellowBg} />
      </View>

      {grouped.recollect.length > 0 && (
        <View style={viewStyles.section}>
          <Text style={[viewStyles.sectionTitle, { color: colors.cancel }]}>RECOLLECT ({formatCount(grouped.recollect.length)})</Text>
          {grouped.recollect.map((t, i) => <TaskRow key={`r_${i}`} task={t} colors={colors} showRecollectTime />)}
        </View>
      )}

      {grouped.active.length > 0 && (
        <View style={viewStyles.section}>
          <Text style={[viewStyles.sectionTitle, { color: colors.accent }]}>IN PROGRESS ({formatCount(grouped.active.length)})</Text>
          {grouped.active.map((t, i) => <TaskRow key={`a_${i}`} task={t} colors={colors} />)}
        </View>
      )}

      {grouped.other.length > 0 && (
        <View style={viewStyles.section}>
          <Text style={[viewStyles.sectionTitle, { color: colors.textMuted }]}>OTHER ({formatCount(grouped.other.length)})</Text>
          {grouped.other.map((t, i) => <TaskRow key={`o_${i}`} task={t} colors={colors} />)}
        </View>
      )}

      {grouped.done.length > 0 && (
        <View style={viewStyles.section}>
          <Text style={[viewStyles.sectionTitle, { color: colors.complete }]}>DONE ({formatCount(grouped.done.length)})</Text>
          {grouped.done.map((t, i) => <TaskRow key={`d_${i}`} task={t} colors={colors} />)}
        </View>
      )}
    </View>
  );
}

function TaskRow({ task, colors, showRecollectTime }: { task: TaskActualRow; colors: ThemeColors; showRecollectTime?: boolean }) {
  const isRecollect = task.status.toUpperCase() === "RECOLLECT";
  const remainingRaw = Number(task.remainingHours) || 0;
  const remaining = Math.abs(remainingRaw) > 10000 ? 0 : Math.round(remainingRaw * 100) / 100;
  const recollectNeeded = isRecollect && remaining > 0 ? remaining : 0;
  const collected = Math.abs(Number(task.collectedHours) || 0) > 10000 ? 0 : (Number(task.collectedHours) || 0);
  const good = Math.abs(Number(task.goodHours) || 0) > 10000 ? 0 : (Number(task.goodHours) || 0);
  const goodGap = isRecollect ? Math.round(Math.max(collected - good, 0) * 100) / 100 : 0;

  return (
    <View style={[viewStyles.taskCard, { backgroundColor: colors.bgCard, borderColor: colors.border, shadowColor: colors.shadow }]}>
      <View style={viewStyles.taskTop}>
        <MarqueeText
          text={task.taskName}
          style={[viewStyles.taskName, { color: colors.textPrimary }]}
          speedMs={4400}
        />
        <StatusBadge status={task.status} colors={colors} />
      </View>
      {task.assignedCollector ? (
        <View style={[viewStyles.assignedRow, { borderColor: colors.border }]}>
          <Text style={[viewStyles.assignedLabel, { color: colors.textMuted }]}>Top collector</Text>
          <Text style={[viewStyles.assignedName, { color: colors.accent }]}>{task.assignedCollector}</Text>
          {(task.collectorHours ?? 0) > 0 && (
            <Text style={[viewStyles.assignedHours, { color: colors.complete }]}>{formatTwoDecimals(task.collectorHours ?? 0)}h</Text>
          )}
          {(task.collectorCount ?? 0) > 1 && (
            <Text style={[viewStyles.assignedLabel, { color: colors.textMuted }]}>+{(task.collectorCount ?? 1) - 1} more</Text>
          )}
        </View>
      ) : null}
      <View style={viewStyles.taskStats}>
        <StatChip label="Collected" value={`${formatTwoDecimals(task.collectedHours)}h`} color={colors.accent} />
        <StatChip label="Good" value={`${formatTwoDecimals(task.goodHours)}h`} color={colors.complete} />
        <StatChip label="Remaining" value={`${formatTwoDecimals(remaining)}h`} color={remaining > 0 ? colors.statusPending : colors.textMuted} />
      </View>
      {showRecollectTime && isRecollect && (
        <View style={[viewStyles.recollectInfo, { backgroundColor: colors.cancelBg, borderColor: colors.cancel + '20' }]}>
          <Clock size={11} color={colors.cancel} />
          <Text style={[viewStyles.recollectInfoText, { color: colors.cancel }]}>
            Recollection needed: {recollectNeeded > 0 ? `${formatTwoDecimals(recollectNeeded)}h remaining` : `${formatTwoDecimals(goodGap)}h good data gap`}
          </Text>
        </View>
      )}
    </View>
  );
}

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={viewStyles.statChip}>
      <Text style={[viewStyles.statLabel, { color: color + "99" }]}>{label}</Text>
      <Text style={[viewStyles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

function SummaryChip({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <View style={[viewStyles.sumChip, { backgroundColor: bg }]}>
      <Text style={[viewStyles.sumValue, { color }]}>{value}</Text>
      <Text style={[viewStyles.sumLabel, { color: color + "99" }]}>{label}</Text>
    </View>
  );
}

export default function SheetViewerScreen() {
  const { colors } = useTheme();
  const { sheetId = "log", title = "Data" } = useLocalSearchParams<{ sheetId?: string; title?: string }>();
  const { selectedCollectorName, configured } = useCollection();
  const queryClient = useQueryClient();

  const handleRefresh = useCallback(() => {
    if (sheetId === "log") {
      queryClient.invalidateQueries({ queryKey: ["fullLog"] });
      queryClient.invalidateQueries({ queryKey: ["todayLog"] });
    } else if (sheetId === "taskActuals") {
      queryClient.invalidateQueries({ queryKey: ["taskActualsSheet"] });
    }
  }, [sheetId, queryClient]);

  return (
    <View style={[pageStyles.container, { backgroundColor: colors.bg }]}>
      <Stack.Screen
        options={{
          title: title as string,
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.textPrimary,
          headerShadowVisible: false,
          headerRight: () => (
            <TouchableOpacity onPress={handleRefresh} style={pageStyles.headerBtn} activeOpacity={0.7}>
              <RefreshCw size={18} color={colors.accent} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={pageStyles.scroll}
        contentContainerStyle={pageStyles.content}
        showsVerticalScrollIndicator={false}
      >
        {sheetId === "log" && (
          <AssignmentLogView collectorName={selectedCollectorName} configured={configured} />
        )}
        {sheetId === "taskActuals" && (
          <TaskActualsView configured={configured} />
        )}
        {sheetId !== "log" && sheetId !== "taskActuals" && (
          <View style={[viewStyles.center, { paddingVertical: 40 }]}>
            <Text style={[viewStyles.emptyText, { color: colors.textMuted }]}>
              Unknown view. Use Tools → Data Viewer to open Assignment Log or Task Actuals.
            </Text>
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const viewStyles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 10,
  },
  loadingText: { fontSize: 14 },
  errorTitle: { fontSize: 16, fontWeight: "700" as const, marginTop: 4 },
  errorText: { fontSize: 13, textAlign: "center", maxWidth: 280 },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 8,
  },
  retryText: { fontSize: 14, fontWeight: "600" as const },
  emptyText: { fontSize: 14, textAlign: "center" },
  list: { gap: 12 },
  countLabel: { fontSize: 12, marginBottom: 4 },
  entryCard: {
    borderRadius: 14,
    padding: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 12,
    elevation: 4,
  },
  entryTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 8,
  },
  taskName: { flex: 1, fontSize: 14, fontWeight: "600" as const, lineHeight: 18 },
  entryMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  metaChip: {
    fontSize: 11,
    fontWeight: "600" as const,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  metaText: { fontSize: 12, fontWeight: "500" as const },
  taskMetaRow: {
    marginTop: 8,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  taskMetaText: { fontSize: 11, fontWeight: "600" as const },
  taskMetaPct: { marginLeft: "auto", fontSize: 11, fontWeight: "700" as const },
  dateText: { fontSize: 11, marginTop: 6 },
  summaryRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  sumChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 12,
    gap: 2,
  },
  sumValue: { fontSize: 18, fontWeight: "800" as const },
  sumLabel: { fontSize: 10, fontWeight: "600" as const, letterSpacing: 0.3 },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700" as const,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 4,
  },
  taskCard: {
    borderRadius: 14,
    padding: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 12,
    elevation: 4,
  },
  taskTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 8,
  },
  taskStats: {
    flexDirection: "row",
    gap: 12,
  },
  statChip: { gap: 1 },
  statLabel: { fontSize: 10, fontWeight: "500" as const },
  statValue: { fontSize: 14, fontWeight: "700" as const },
  recollectInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  recollectInfoText: { fontSize: 11, fontWeight: "600" as const },
  assignedRow: {
    flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8,
    paddingBottom: 8, borderBottomWidth: 1,
  },
  assignedLabel: { fontSize: 10, fontWeight: "500" as const },
  assignedName: { fontSize: 12, fontWeight: "700" as const },
  assignedHours: { fontSize: 11, fontWeight: "600" as const },
});

const pageStyles = StyleSheet.create({
  container: { flex: 1 },
  headerBtn: { padding: 8 },
  scroll: { flex: 1 },
  content: { padding: 16 },
});
