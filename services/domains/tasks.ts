import { DailyCarryoverItem, LogEntry, PendingReviewItem, SubmitPayload, SubmitResponse, Task } from "@/types";
import { apiGet, apiPost, collectorCacheKey, getAppCacheSnapshot, readFirstCachedValue } from "@/services/http/gasClient";
import { log } from "@/utils/logger";

interface RawTask { name: string }

export async function fetchTasks(): Promise<Task[]> {
  const raw = await apiGet<RawTask[]>("getTasks");
  return raw.map((t, i) => ({ id: `t_${i}_${t.name.replace(/\s/g, "_")}`, name: t.name, label: t.name }));
}

export async function fetchTodayLog(collectorName: string): Promise<LogEntry[]> {
  try { return await apiGet<LogEntry[]>("getTodayLog", { collector: collectorName }, false); }
  catch (err) {
    const keys = [collectorCacheKey("todayLog", collectorName)];
    const cached = readFirstCachedValue<LogEntry[]>(await getAppCacheSnapshot(keys), keys);
    if (Array.isArray(cached)) return cached;
    throw err;
  }
}

export async function fetchDailyCarryover(collectorName: string): Promise<DailyCarryoverItem[]> {
  try { return await apiGet<DailyCarryoverItem[]>("getDailyCarryover", { collector: collectorName }, false); }
  catch (err) {
    const keys = [collectorCacheKey("dailyCarryover", collectorName)];
    const cached = readFirstCachedValue<DailyCarryoverItem[]>(await getAppCacheSnapshot(keys), keys);
    if (Array.isArray(cached)) return cached;
    throw err;
  }
}

export async function fetchPendingReview(collectorName: string, rig: string): Promise<PendingReviewItem[]> {
  if (!collectorName || !rig) return [];
  try { return await apiGet<PendingReviewItem[]>("getPendingReview", { collector: collectorName, rig }, false); }
  catch (err) { log("[API] fetchPendingReview failed (non-fatal):", err instanceof Error ? err.message : String(err)); return []; }
}

export async function submitAction(payload: SubmitPayload): Promise<SubmitResponse> {
  const data = await apiPost<SubmitResponse>(payload as unknown as Record<string, unknown>);
  return { ...data, success: true, message: data.message ?? "Success" } as SubmitResponse;
}
