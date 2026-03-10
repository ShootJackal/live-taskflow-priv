import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { ActivityEntry, ActionType, AssignmentStatus, LogEntry, RigAssignment, RigSwitchRequest, SubmitPayload } from "@/types";
import { logCollectorRigSelection } from "@/services/domains/collectors";
import { submitAction } from "@/services/domains/tasks";
import { isApiConfigured } from "@/services/http/gasClient";
import { queryKeys } from "@/services/queryKeys";
import { useCollectionDomainData } from "@/hooks/useCollectionDomainData";
import { normalizeCollectorName } from "@/utils/normalize";

const STORAGE_KEYS = {
  SELECTED_COLLECTOR: "ci_selected_collector",
  SELECTED_RIG: "ci_selected_rig",
  ACTIVITY: "ci_activity_log",
  ADMIN_AUTH: "ci_admin_auth",
};

const ADMIN_PASSWORD = process.env.EXPO_PUBLIC_ADMIN_PASSWORD ?? "";

export const [CollectionProvider, useCollection] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [selectedCollectorName, setSelectedCollectorName] = useState<string>("");
  const [selectedRig, setSelectedRigState] = useState<string>("");
  const [selectedTaskName, setSelectedTaskName] = useState<string>("");
  const [hoursToLog, setHoursToLog] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const submitInFlightRef = useRef(false);
  const configured = isApiConfigured();

  const domain = useCollectionDomainData(selectedCollectorName, selectedRig, configured);

  const savedCollectorQuery = useQuery({ queryKey: queryKeys.savedCollector(), queryFn: async () => (await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_COLLECTOR)) ?? "" });
  const savedRigQuery = useQuery({ queryKey: queryKeys.savedRig(), queryFn: async () => (await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_RIG)) ?? "" });
  const activityQuery = useQuery({ queryKey: queryKeys.activityLocal(), queryFn: async () => { const stored = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVITY); return stored ? (JSON.parse(stored) as ActivityEntry[]) : []; } });
  const adminAuthQuery = useQuery({ queryKey: queryKeys.adminAuth(), queryFn: async () => { const stored = await AsyncStorage.getItem(STORAGE_KEYS.ADMIN_AUTH); if (!stored) return false; const parsed = JSON.parse(stored) as { authenticated: boolean; ts: number }; return Date.now() - parsed.ts <= 24 * 60 * 60 * 1000 && parsed.authenticated; } });

  useEffect(() => { if (savedCollectorQuery.data && !selectedCollectorName) setSelectedCollectorName(savedCollectorQuery.data); }, [savedCollectorQuery.data, selectedCollectorName]);
  useEffect(() => { if (savedRigQuery.data && !selectedRig) setSelectedRigState(savedRigQuery.data); }, [savedRigQuery.data, selectedRig]);
  useEffect(() => { if (activityQuery.data) setActivity(activityQuery.data); }, [activityQuery.data]);
  useEffect(() => { if (adminAuthQuery.data !== undefined) setIsAdmin(adminAuthQuery.data); }, [adminAuthQuery.data]);

  const todayLog = domain.todayLog;
  const openTasks = useMemo(() => todayLog.filter((e) => e.status === "In Progress" || e.status === "Partial"), [todayLog]);
  const selectedCollector = useMemo(() => domain.collectors.find((c) => c.name === selectedCollectorName) ?? null, [domain.collectors, selectedCollectorName]);

  const authenticateAdmin = useCallback(async (password: string): Promise<boolean> => {
    if (!ADMIN_PASSWORD) throw new Error("Admin password not configured. Add EXPO_PUBLIC_ADMIN_PASSWORD in Vercel environment variables.");
    if (password === ADMIN_PASSWORD) {
      setIsAdmin(true);
      await AsyncStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, JSON.stringify({ authenticated: true, ts: Date.now() }));
      return true;
    }
    return false;
  }, []);

  const logoutAdmin = useCallback(async () => { setIsAdmin(false); await AsyncStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH); }, []);

  const selectCollector = useCallback(async (name: string) => {
    setSelectedCollectorName(name);
    setSelectedTaskName("");
    setSelectedRigState("");
    await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_COLLECTOR, name);
    await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_RIG, "");
  }, []);

  const setSelectedRig = useCallback(async (rig: string) => {
    setSelectedRigState(rig);
    await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_RIG, rig);
    if (selectedCollectorName && rig) void logCollectorRigSelection(selectedCollectorName, rig, "TOOLS");
  }, [selectedCollectorName]);

  const addActivityEntry = useCallback(async (action: ActionType, taskName: string, hours: number, planned: number, status: string, noteText: string) => {
    const entry: ActivityEntry = { id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, collectorName: selectedCollectorName, taskName, action, hoursLogged: hours, plannedHours: planned, status, timestamp: Date.now(), notes: noteText };
    const updated = [entry, ...activity].slice(0, 200);
    setActivity(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVITY, JSON.stringify(updated));
  }, [selectedCollectorName, activity]);

  const buildOptimisticLogEntry = useCallback((payload: SubmitPayload): LogEntry => ({ assignmentId: `optimistic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, taskId: "", taskName: payload.task, status: payload.actionType === "COMPLETE" ? "Completed" : payload.actionType === "CANCEL" ? "Canceled" : "In Progress" as AssignmentStatus, loggedHours: payload.hours, plannedHours: payload.hours, remainingHours: 0, notes: payload.notes, assignedDate: new Date().toISOString().split("T")[0], completedDate: payload.actionType === "COMPLETE" ? new Date().toISOString().split("T")[0] : "" }), []);

  const applyOptimisticUpdate = useCallback((logRows: LogEntry[], payload: SubmitPayload, entry: LogEntry): LogEntry[] => {
    if (payload.actionType === "ASSIGN") return [entry, ...logRows];
    return logRows.map((e) => {
      if (e.taskName !== payload.task || (e.status !== "In Progress" && e.status !== "Partial")) return e;
      if (payload.actionType === "COMPLETE") return { ...e, status: "Completed" as AssignmentStatus, loggedHours: payload.hours, completedDate: entry.completedDate };
      if (payload.actionType === "CANCEL") return { ...e, status: "Canceled" as AssignmentStatus };
      if (payload.actionType === "NOTE_ONLY") return { ...e, notes: payload.notes };
      return e;
    });
  }, []);

  const submitMutation = useMutation({
    mutationFn: async (payload: SubmitPayload) => ({ payload, result: await submitAction(payload) }),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.todayLog(payload.collector) });
      const previousLog = queryClient.getQueryData<LogEntry[]>(queryKeys.todayLog(payload.collector));
      const optimistic = buildOptimisticLogEntry(payload);
      queryClient.setQueryData<LogEntry[]>(queryKeys.todayLog(payload.collector), (old) => applyOptimisticUpdate(old ?? [], payload, optimistic));
      setHoursToLog("");
      setNotes("");
      if (payload.actionType === "ASSIGN") setSelectedTaskName("");
      return { previousLog, collector: payload.collector };
    },
    onError: (err, payload, context) => {
      if (context?.previousLog !== undefined) queryClient.setQueryData(queryKeys.todayLog(context.collector), context.previousLog);
      Alert.alert("Sync Failed", `Could not ${payload.actionType.toLowerCase()} "${payload.task}". ${err instanceof Error ? err.message : "Sync failed"}`);
    },
    onSuccess: async ({ payload, result }) => { await addActivityEntry(payload.actionType, payload.task, result.hours ?? payload.hours, result.planned ?? 0, result.status ?? "", payload.notes); },
    onSettled: (_data, _err, payload) => {
      submitInFlightRef.current = false;
      if (payload) {
        queryClient.invalidateQueries({ queryKey: queryKeys.todayLog(payload.collector) });
        queryClient.invalidateQueries({ queryKey: queryKeys.collectorStats(payload.collector) });
      }
    },
  });

  const createRequestId = useCallback((actionType: ActionType, taskName: string, hours: number) => [Date.now(), normalizeCollectorName(selectedCollectorName || "unknown").toLowerCase().replace(/\s+/g, "_"), normalizeCollectorName(taskName || "unknown").toLowerCase().replace(/\s+/g, "_"), actionType.toLowerCase(), (Math.round((Number(hours) || 0) * 100) / 100).toFixed(2), Math.random().toString(36).slice(2, 8)].join("_"), [selectedCollectorName]);

  const submitOnce = useCallback((payload: SubmitPayload) => { if (submitInFlightRef.current) return; submitInFlightRef.current = true; submitMutation.mutate(payload); }, [submitMutation]);

  const assignTask = useCallback(() => { if (!selectedCollectorName || !selectedTaskName) throw new Error("Select collector and task first"); submitOnce({ collector: selectedCollectorName, task: selectedTaskName, hours: 0, actionType: "ASSIGN", notes, rig: selectedRig || undefined, requestId: createRequestId("ASSIGN", selectedTaskName, 0) }); }, [selectedCollectorName, selectedTaskName, notes, selectedRig, createRequestId, submitOnce]);
  const completeTask = useCallback((taskName: string) => { if (!selectedCollectorName) throw new Error("No collector selected"); const hours = hoursToLog ? parseFloat(hoursToLog) : 0; if (!hours || hours <= 0) throw new Error("Enter hours to log before completing"); submitOnce({ collector: selectedCollectorName, task: taskName, hours, actionType: "COMPLETE", notes, rig: selectedRig || undefined, requestId: createRequestId("COMPLETE", taskName, hours) }); }, [selectedCollectorName, hoursToLog, notes, selectedRig, createRequestId, submitOnce]);
  const cancelTask = useCallback((taskName: string) => { if (!selectedCollectorName) throw new Error("No collector selected"); submitOnce({ collector: selectedCollectorName, task: taskName, hours: 0, actionType: "CANCEL", notes, rig: selectedRig || undefined, requestId: createRequestId("CANCEL", taskName, 0) }); }, [selectedCollectorName, notes, selectedRig, createRequestId, submitOnce]);
  const addNote = useCallback((taskName: string) => { if (!selectedCollectorName || !notes.trim()) throw new Error("Select collector and enter notes"); submitOnce({ collector: selectedCollectorName, task: taskName, hours: 0, actionType: "NOTE_ONLY", notes: notes.trim(), rig: selectedRig || undefined, requestId: createRequestId("NOTE_ONLY", taskName, 0) }); }, [selectedCollectorName, notes, selectedRig, createRequestId, submitOnce]);

  return {
    configured,
    collectors: domain.collectors,
    tasks: domain.tasks,
    todayLog,
    openTasks,
    carryoverItems: domain.carryoverItems,
    hasCarryover: domain.carryoverItems.length > 0,
    pendingReview: domain.pendingReview,
    hasPendingReview: domain.pendingReview.length > 0,
    selectedCollectorName,
    selectedCollector,
    selectedRig,
    selectedTaskName,
    hoursToLog,
    notes,
    isAdmin,
    isLoadingCollectors: domain.isLoadingCollectors,
    isLoadingTasks: domain.isLoadingTasks,
    isLoadingLog: domain.isLoadingLog,
    isSyncing: submitMutation.isPending,
    submitError: submitMutation.error?.message ?? null,
    selectCollector,
    setSelectedRig,
    setSelectedTaskName,
    setHoursToLog,
    setNotes,
    assignTask,
    completeTask,
    cancelTask,
    addNote,
    approveRedashTask: domain.approveRedashTask,
    refreshData: domain.refreshData,
    authenticateAdmin,
    logoutAdmin,
    pendingSwitchRequests: domain.pendingSwitchRequests as RigSwitchRequest[],
    assignRigForDay: async (rig: number): Promise<RigAssignment> => domain.assignRigForDay(rig, setSelectedRig),
  };
});
