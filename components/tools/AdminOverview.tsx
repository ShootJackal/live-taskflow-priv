import React, { useMemo } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Check, Activity, AlertTriangle, FileText, Shield, Users, Star } from "lucide-react-native";
import { useTheme } from "@/providers/ThemeProvider";
import { useCollection } from "@/providers/CollectionProvider";
import { useQuery } from "@tanstack/react-query";
import {
  normalizeTaskStatus,
  COMPLETED_TASK_STATUSES,
  RECOLLECT_TASK_STATUSES,
  OPEN_TASK_STATUSES,
} from "@/components/tools/toolConstants";
import { fetchAdminDashboardData, fetchTaskActualsData } from "@/services/googleSheets";
import type { AdminDashboardData, TaskActualRow, CollectorSummary } from "@/types";
import type { ThemeColors } from "@/constants/colors";
import { DesignTokens } from "@/constants/colors";

export function AdminOverview({
  colors,
  isAdmin,
}: {
  colors: ThemeColors;
  isAdmin: boolean;
}) {
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
  gridLabel: { fontSize: 10, fontWeight: "500" as const, marginTop: 2, letterSpacing: 0.3 },
  recollectSection: { borderTopWidth: 1, marginTop: 10, paddingTop: 10 },
  recollectTitle: { fontSize: 10, fontWeight: "700" as const, letterSpacing: 0.8, marginBottom: 6 },
  recollectItem: { fontSize: 12, lineHeight: 18, paddingLeft: 8 },
  recollectMore: { fontSize: 11, marginTop: 4, fontStyle: "italic" as const },
  collectorSection: { borderTopWidth: 1, marginTop: 12, paddingTop: 12 },
  collectorHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  collectorTitle: { fontSize: 10, fontWeight: "700" as const, letterSpacing: 0.8, flex: 1 },
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
  reqTitle: { fontSize: 10, fontWeight: "700" as const, letterSpacing: 0.8, marginBottom: 8 },
  reqRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1 },
  reqName: { flex: 1, fontSize: 12 },
  reqHours: { fontSize: 12, fontWeight: "600" as const },
  loadingWrap: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 },
  loadingText: { fontSize: 12 },
});
