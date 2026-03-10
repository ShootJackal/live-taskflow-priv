import React from "react";
import { View, Text, StyleSheet } from "react-native";
import MarqueeText from "@/components/MarqueeText";
import { DesignTokens, type ThemeColors } from "@/constants/colors";
import type { LogEntry } from "@/types";

export const LogEntryRow = React.memo(function LogEntryRow({
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
  const taskTotal = Math.max(taskGood + taskRemaining, 0);
  const taskProgressPct = Math.max(
    0,
    Math.min(100, taskTotal > 0 ? Math.round((taskGood / taskTotal) * 100) : 0)
  );

  return (
    <View
      style={[
        styles.row,
        !isLast && {
          borderBottomColor: colors.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
        isClosed && styles.rowClosed,
      ]}
    >
      <View style={styles.rowLeft}>
        <View style={[styles.statusStripe, { backgroundColor: statusColor }]} />
        <View style={styles.rowContent}>
          <MarqueeText
            text={entry.taskName}
            style={[styles.taskName, { color: isClosed ? colors.textMuted : colors.textPrimary }]}
            speedMs={4300}
          />
          <View style={styles.metaRow}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>{entry.status}</Text>
            </View>
            {Number(entry.loggedHours) > 0 && (
              <Text style={[styles.hours, { color: colors.textMuted }]}>
                {Number(entry.loggedHours).toFixed(2)}h logged
              </Text>
            )}
          </View>
          {hasTaskProgress && (
            <View style={[styles.taskSnapshot, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
              <View style={styles.taskSnapshotTop}>
                <Text style={[styles.taskStat, { color: colors.complete }]}>CB Actual {taskGood.toFixed(2)}h</Text>
                <Text style={[styles.taskStat, { color: colors.statusPending }]}>Remaining {taskRemaining.toFixed(2)}h</Text>
                <Text style={[styles.taskPct, { color: colors.textSecondary }]}>{taskProgressPct}%</Text>
              </View>
              {taskTotal > 0 && (
                <View style={[styles.taskTrack, { backgroundColor: colors.border }]}>
                  <View style={[styles.taskFill, { backgroundColor: colors.accent, width: `${taskProgressPct}%` as any }]} />
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
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
