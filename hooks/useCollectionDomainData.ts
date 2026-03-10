import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Collector, DailyCarryoverItem, LogEntry, PendingReviewItem, RigAssignment, RigSwitchRequest, SubmitPayload, Task } from "@/types";
import { fetchCollectors, logCollectorRigSelection } from "@/services/domains/collectors";
import { fetchDailyCarryover, fetchPendingReview, fetchTasks, fetchTodayLog, submitAction } from "@/services/domains/tasks";
import { assignRigSOD, fetchPendingSwitchRequests } from "@/services/domains/rigs";
import { warmServerCache } from "@/services/http/gasClient";
import { queryKeys } from "@/services/queryKeys";
import { normalizeCollectorName } from "@/utils/normalize";

export function useCollectionDomainData(selectedCollectorName: string, selectedRig: string, configured: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!configured) return;
    void warmServerCache(selectedCollectorName || undefined);
  }, [configured, selectedCollectorName]);

  const collectorsQuery = useQuery({ queryKey: queryKeys.collectors(), queryFn: fetchCollectors, enabled: configured, staleTime: 5 * 60 * 1000, retry: 2 });
  const tasksQuery = useQuery({ queryKey: queryKeys.tasks(), queryFn: fetchTasks, enabled: configured, staleTime: 5 * 60 * 1000, retry: 2 });
  const todayLogQuery = useQuery({ queryKey: queryKeys.todayLog(selectedCollectorName), queryFn: () => fetchTodayLog(selectedCollectorName), enabled: configured && !!selectedCollectorName, refetchInterval: 30000, retry: 1 });
  const dailyCarryoverQuery = useQuery<DailyCarryoverItem[]>({ queryKey: queryKeys.dailyCarryover(selectedCollectorName), queryFn: () => fetchDailyCarryover(selectedCollectorName), enabled: configured && !!selectedCollectorName, staleTime: 30000, retry: 1 });
  const pendingReviewQuery = useQuery<PendingReviewItem[]>({ queryKey: queryKeys.pendingReview(selectedCollectorName, selectedRig), queryFn: () => fetchPendingReview(selectedCollectorName, selectedRig), enabled: configured && !!selectedCollectorName && !!selectedRig, staleTime: 60000, refetchInterval: 120000, retry: 1 });
  const switchRequestsQuery = useQuery<RigSwitchRequest[]>({ queryKey: queryKeys.rigSwitchRequests(selectedCollectorName), queryFn: () => fetchPendingSwitchRequests(selectedCollectorName), enabled: configured && !!selectedCollectorName, staleTime: 15000, refetchInterval: 20000, retry: 0 });

  const refreshData = async () => {
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: queryKeys.collectors() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.todayLog(selectedCollectorName) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.collectorStats(selectedCollectorName) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyCarryover(selectedCollectorName) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingReview(selectedCollectorName, selectedRig) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.rigStatus() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.rigSwitchRequests(selectedCollectorName) }),
    ]);
  };

  const mergeCollectors = (raw: Collector[] = []) => {
    const map = new Map<string, Collector>();
    for (const c of raw) {
      const key = normalizeCollectorName(c.name);
      const existing = map.get(key);
      if (existing) {
        map.set(key, { ...existing, rigs: Array.from(new Set([...existing.rigs, ...c.rigs])), hoursUploaded: Math.max(existing.hoursUploaded ?? 0, c.hoursUploaded ?? 0) });
      } else map.set(key, { ...c, name: key });
    }
    return Array.from(map.values());
  };

  const assignRigForDay = async (rig: number, setSelectedRig: (value: string) => Promise<void>): Promise<RigAssignment> => {
    try {
      const result = await assignRigSOD({ collector: selectedCollectorName, rig });
      await setSelectedRig(String(rig));
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Unknown action")) {
        await logCollectorRigSelection(selectedCollectorName, String(rig), "SOD_ASSIGN");
        await setSelectedRig(String(rig));
        return { assignmentId: `RH_${Date.now()}_${rig}`, collector: selectedCollectorName, team: "SF", rig, assignedAt: new Date().toISOString(), status: "ACTIVE", message: `Rig ${rig} assigned` };
      }
      throw err;
    }
  };

  const approveRedashTask = async (taskName: string, hours: number, rig: string): Promise<void> => {
    const payload: SubmitPayload = { collector: selectedCollectorName, task: taskName, hours, actionType: "COMPLETE", notes: "Redash auto-approved", rig: rig || selectedRig || undefined, requestId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
    await submitAction(payload);
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: queryKeys.todayLog(selectedCollectorName) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingReview(selectedCollectorName, selectedRig) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.collectorStats(selectedCollectorName) }),
    ]);
  };

  return {
    collectors: useMemo(() => mergeCollectors(collectorsQuery.data ?? []), [collectorsQuery.data]),
    tasks: useMemo<Task[]>(() => tasksQuery.data ?? [], [tasksQuery.data]),
    todayLog: useMemo<LogEntry[]>(() => todayLogQuery.data ?? [], [todayLogQuery.data]),
    carryoverItems: useMemo<DailyCarryoverItem[]>(() => dailyCarryoverQuery.data ?? [], [dailyCarryoverQuery.data]),
    pendingReview: useMemo<PendingReviewItem[]>(() => pendingReviewQuery.data ?? [], [pendingReviewQuery.data]),
    pendingSwitchRequests: switchRequestsQuery.data ?? [],
    isLoadingCollectors: collectorsQuery.isLoading,
    isLoadingTasks: tasksQuery.isLoading,
    isLoadingLog: todayLogQuery.isLoading,
    refreshData,
    approveRedashTask,
    assignRigForDay,
  };
}
