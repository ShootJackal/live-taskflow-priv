import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import {
  Collector,
  Task,
  LogEntry,
  ActivityEntry,
  ActionType,
  SubmitPayload,
} from "@/types";
import {
  fetchCollectors,
  fetchTasks,
  fetchTodayLog,
  submitAction,
  isApiConfigured,
  warmServerCache,
  logCollectorRigSelection,
} from "@/services/googleSheets";
import { normalizeCollectorName } from "@/utils/normalize";
import { log } from "@/utils/logger";

const STORAGE_KEYS = {
  SELECTED_COLLECTOR: "ci_selected_collector",
  SELECTED_RIG: "ci_selected_rig",
  ACTIVITY: "ci_activity_log",
  ADMIN_AUTH: "ci_admin_auth",
};

// WARNING: Client-side password check is not secure. Anyone can inspect the
// JS bundle and extract this value. For production use, validate the password
// server-side (e.g. inside your Google Apps Script doPost handler) and return
// a signed session token.
const ADMIN_PASSWORD = process.env.EXPO_PUBLIC_ADMIN_PASSWORD ?? "";

function mergeCollectors(raw: Collector[]): Collector[] {
  const map = new Map<string, Collector>();
  for (const c of raw) {
    const key = normalizeCollectorName(c.name);
    if (map.has(key)) {
      const existing = map.get(key)!;
      const merged: Collector = {
        ...existing,
        rigs: Array.from(new Set([...existing.rigs, ...c.rigs])),
        hoursUploaded: Math.max(existing.hoursUploaded ?? 0, c.hoursUploaded ?? 0),
      };
      map.set(key, merged);
    } else {
      map.set(key, { ...c, name: key });
    }
  }
  return Array.from(map.values());
}

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

  const collectorQuery = useQuery({
    queryKey: ["collectors"],
    queryFn: fetchCollectors,
    enabled: configured,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const taskQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: fetchTasks,
    enabled: configured,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const todayLogQuery = useQuery({
    queryKey: ["todayLog", selectedCollectorName],
    queryFn: () => fetchTodayLog(selectedCollectorName),
    enabled: configured && !!selectedCollectorName,
    refetchInterval: 30000,
    retry: 1,
  });

  const savedCollectorQuery = useQuery({
    queryKey: ["savedCollector"],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_COLLECTOR);
      return stored ?? "";
    },
  });

  const savedRigQuery = useQuery({
    queryKey: ["savedRig"],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_RIG);
      return stored ?? "";
    },
  });

  const activityQuery = useQuery({
    queryKey: ["activityLocal"],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVITY);
      return stored ? (JSON.parse(stored) as ActivityEntry[]) : [];
    },
  });

  const adminAuthQuery = useQuery({
    queryKey: ["adminAuth"],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.ADMIN_AUTH);
      if (!stored) return false;
      const parsed = JSON.parse(stored) as { authenticated: boolean; ts: number };
      const ONE_DAY = 24 * 60 * 60 * 1000;
      if (Date.now() - parsed.ts > ONE_DAY) return false;
      return parsed.authenticated;
    },
  });

  useEffect(() => {
    if (savedCollectorQuery.data && !selectedCollectorName) {
      setSelectedCollectorName(savedCollectorQuery.data);
    }
  }, [savedCollectorQuery.data, selectedCollectorName]);

  useEffect(() => {
    if (savedRigQuery.data && !selectedRig) {
      setSelectedRigState(savedRigQuery.data);
    }
  }, [savedRigQuery.data, selectedRig]);

  useEffect(() => {
    if (activityQuery.data) {
      setActivity(activityQuery.data);
    }
  }, [activityQuery.data]);

  useEffect(() => {
    if (adminAuthQuery.data !== undefined) {
      setIsAdmin(adminAuthQuery.data);
    }
  }, [adminAuthQuery.data]);

  useEffect(() => {
    if (!configured) return;
    const timer = setTimeout(() => {
      void warmServerCache(selectedCollectorName || undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [configured, selectedCollectorName]);

  const collectors = useMemo<Collector[]>(() => {
    const raw = collectorQuery.data ?? [];
    return mergeCollectors(raw);
  }, [collectorQuery.data]);

  const tasks = useMemo<Task[]>(
    () => taskQuery.data ?? [],
    [taskQuery.data]
  );

  const todayLog = useMemo<LogEntry[]>(
    () => todayLogQuery.data ?? [],
    [todayLogQuery.data]
  );

  const openTasks = useMemo(
    () => todayLog.filter((e) => e.status === "In Progress" || e.status === "Partial"),
    [todayLog]
  );

  const selectedCollector = useMemo(
    () => collectors.find((c) => c.name === selectedCollectorName) ?? null,
    [collectors, selectedCollectorName]
  );

  const authenticateAdmin = useCallback(async (password: string): Promise<boolean> => {
    log("[Provider] authenticateAdmin attempt");
    if (password === ADMIN_PASSWORD) {
      setIsAdmin(true);
      await AsyncStorage.setItem(
        STORAGE_KEYS.ADMIN_AUTH,
        JSON.stringify({ authenticated: true, ts: Date.now() })
      );
      return true;
    }
    return false;
  }, []);

  const logoutAdmin = useCallback(async () => {
    log("[Provider] logoutAdmin");
    setIsAdmin(false);
    await AsyncStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
  }, []);

  const selectCollector = useCallback(async (name: string) => {
    log("[Provider] selectCollector:", name);
    setSelectedCollectorName(name);
    setSelectedTaskName("");
    setSelectedRigState("");
    await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_COLLECTOR, name);
    await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_RIG, "");
  }, []);

  const setSelectedRig = useCallback(async (rig: string) => {
    log("[Provider] setSelectedRig:", rig);
    setSelectedRigState(rig);
    await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_RIG, rig);
    if (selectedCollectorName && rig) {
      void logCollectorRigSelection(selectedCollectorName, rig, "TOOLS");
    }
  }, [selectedCollectorName]);

  const addActivityEntry = useCallback(
    async (
      action: ActionType,
      taskName: string,
      hours: number,
      planned: number,
      status: string,
      noteText: string
    ) => {
      const entry: ActivityEntry = {
        id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        collectorName: selectedCollectorName,
        taskName,
        action,
        hoursLogged: hours,
        plannedHours: planned,
        status,
        timestamp: Date.now(),
        notes: noteText,
      };
      const updated = [entry, ...activity].slice(0, 200);
      setActivity(updated);
      await AsyncStorage.setItem(STORAGE_KEYS.ACTIVITY, JSON.stringify(updated));
    },
    [selectedCollectorName, activity]
  );

  const submitMutation = useMutation({
    mutationFn: async (payload: SubmitPayload) => {
      log("[Provider] submitAction:", payload.actionType, payload.task);
      const result = await submitAction(payload);
      return { payload, result };
    },
    onSuccess: async ({ payload, result }) => {
      log("[Provider] Submit success:", result.message);
      await addActivityEntry(
        payload.actionType,
        payload.task,
        result.hours ?? payload.hours,
        result.planned ?? 0,
        result.status ?? "",
        payload.notes
      );
      queryClient.invalidateQueries({ queryKey: ["todayLog", selectedCollectorName] });
      queryClient.invalidateQueries({ queryKey: ["collectorStats", selectedCollectorName] });
      setHoursToLog("");
      setNotes("");
      if (payload.actionType === "ASSIGN") {
        setSelectedTaskName("");
      }
    },
  });

  const createRequestId = useCallback(
    (actionType: ActionType, taskName: string, hours: number) => {
      const collectorKey = normalizeCollectorName(selectedCollectorName || "unknown")
        .toLowerCase()
        .replace(/\s+/g, "_");
      const taskKey = normalizeCollectorName(taskName || "unknown")
        .toLowerCase()
        .replace(/\s+/g, "_");
      const roundedHours = Math.round((Number(hours) || 0) * 100) / 100;
      return [
        Date.now(),
        collectorKey,
        taskKey,
        actionType.toLowerCase(),
        roundedHours.toFixed(2),
        Math.random().toString(36).slice(2, 8),
      ].join("_");
    },
    [selectedCollectorName]
  );

  const submitOnce = useCallback(
    async (payload: SubmitPayload) => {
      if (submitInFlightRef.current) {
        throw new Error("Submit already in progress");
      }
      submitInFlightRef.current = true;
      try {
        return await submitMutation.mutateAsync(payload);
      } finally {
        submitInFlightRef.current = false;
      }
    },
    [submitMutation]
  );

  const assignTask = useCallback(async () => {
    if (!selectedCollectorName || !selectedTaskName) {
      throw new Error("Select collector and task first");
    }
    const hours = hoursToLog ? parseFloat(hoursToLog) : 0;
    if (!hours || hours <= 0) {
      throw new Error("Enter hours to log before assigning");
    }
    await submitOnce({
      collector: selectedCollectorName,
      task: selectedTaskName,
      hours,
      actionType: "ASSIGN",
      notes,
      rig: selectedRig || undefined,
      requestId: createRequestId("ASSIGN", selectedTaskName, hours),
    });
  }, [selectedCollectorName, selectedTaskName, hoursToLog, notes, selectedRig, createRequestId, submitOnce]);

  const completeTask = useCallback(
    async (taskName: string) => {
      if (!selectedCollectorName) throw new Error("No collector selected");
      const hours = hoursToLog ? parseFloat(hoursToLog) : 0;
      if (!hours || hours <= 0) {
        throw new Error("Enter hours to log before completing");
      }
      await submitOnce({
        collector: selectedCollectorName,
        task: taskName,
        hours,
        actionType: "COMPLETE",
        notes,
        rig: selectedRig || undefined,
        requestId: createRequestId("COMPLETE", taskName, hours),
      });
    },
    [selectedCollectorName, hoursToLog, notes, selectedRig, createRequestId, submitOnce]
  );

  const cancelTask = useCallback(
    async (taskName: string) => {
      if (!selectedCollectorName) throw new Error("No collector selected");
      await submitOnce({
        collector: selectedCollectorName,
        task: taskName,
        hours: 0,
        actionType: "CANCEL",
        notes,
        rig: selectedRig || undefined,
        requestId: createRequestId("CANCEL", taskName, 0),
      });
    },
    [selectedCollectorName, notes, selectedRig, createRequestId, submitOnce]
  );

  const addNote = useCallback(
    async (taskName: string) => {
      if (!selectedCollectorName || !notes.trim()) {
        throw new Error("Select collector and enter notes");
      }
      await submitOnce({
        collector: selectedCollectorName,
        task: taskName,
        hours: 0,
        actionType: "NOTE_ONLY",
        notes: notes.trim(),
        rig: selectedRig || undefined,
        requestId: createRequestId("NOTE_ONLY", taskName, 0),
      });
    },
    [selectedCollectorName, notes, selectedRig, createRequestId, submitOnce]
  );

  const refreshData = useCallback(async () => {
    log("[Provider] Refreshing all data");
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ["collectors"] }),
      queryClient.invalidateQueries({ queryKey: ["tasks"] }),
      queryClient.invalidateQueries({ queryKey: ["todayLog", selectedCollectorName] }),
      queryClient.invalidateQueries({ queryKey: ["collectorStats", selectedCollectorName] }),
    ]);
  }, [queryClient, selectedCollectorName]);

  return {
    configured,
    collectors,
    tasks,
    todayLog,
    openTasks,
    activity,
    selectedCollectorName,
    selectedCollector,
    selectedRig,
    selectedTaskName,
    hoursToLog,
    notes,
    isAdmin,

    isLoadingCollectors: collectorQuery.isLoading,
    isLoadingTasks: taskQuery.isLoading,
    isLoadingLog: todayLogQuery.isLoading,
    isSubmitting: submitMutation.isPending,
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
    refreshData,
    authenticateAdmin,
    logoutAdmin,
  };
});
