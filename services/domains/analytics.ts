import { AdminStartPlanData, CollectorProfile, CollectorStats, FullLogEntry, LeaderboardEntry, TaskActualRow } from "@/types";
import { apiGet, collectorCacheKey, getAppCacheSnapshot, readFirstCachedValue } from "@/services/http/gasClient";
import { normalizeCollectorName } from "@/utils/normalize";

export interface ActiveRigsCount { activeRigsToday: number }

function toNumber(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function normalizeRegion(region: string): string {
  const clean = (region ?? "").replace(/^EGO-/i, "").trim().toUpperCase();
  if (clean === "SF" || clean === "EGO-SF") return "SF";
  if (clean === "MX" || clean === "EGO-MX") return "MX";
  return clean || "MX";
}

function sanitizeLeaderboard(raw: LeaderboardEntry[]): LeaderboardEntry[] {
  const entries = raw.map((e) => {
    const rawActual = toNumber((e as LeaderboardEntry).actualHours);
    const rawReported = toNumber((e as LeaderboardEntry).reportedHours);
    const fallbackHours = toNumber(e.hoursLogged);
    const incomingSource = e.hoursSource === "reported" ? "reported" : "actual";
    const actualHours = rawActual > 0 ? rawActual : (incomingSource === "actual" ? fallbackHours : 0);
    const reportedHours = rawReported > 0 ? rawReported : (incomingSource === "reported" ? fallbackHours : 0);
    return { ...e, collectorName: normalizeCollectorName(e.collectorName), hoursLogged: actualHours > 0 ? actualHours : 0, actualHours, reportedHours, hoursSource: "actual" as const, tasksCompleted: toNumber(e.tasksCompleted), tasksAssigned: toNumber(e.tasksAssigned), completionRate: toNumber(e.completionRate), region: normalizeRegion(e.region), rank: 0 };
  });
  entries.sort((a, b) => b.hoursLogged - a.hoursLogged);
  entries.forEach((e, i) => { e.rank = i + 1; });
  return entries;
}

export async function fetchCollectorStats(collectorName: string): Promise<CollectorStats> {
  try { return await apiGet<CollectorStats>("getCollectorStats", { collector: collectorName }); }
  catch (err) {
    const keys = [collectorCacheKey("collectorStats", collectorName)];
    const cached = readFirstCachedValue<CollectorStats>(await getAppCacheSnapshot(keys), keys);
    if (cached && typeof cached === "object") return cached;
    throw err;
  }
}

export async function fetchCollectorProfile(collectorName: string): Promise<CollectorProfile> {
  try { return await apiGet<CollectorProfile>("getCollectorProfile", { collector: collectorName }, false); }
  catch (err) {
    const keys = [collectorCacheKey("collectorProfile", collectorName)];
    const cached = readFirstCachedValue<CollectorProfile>(await getAppCacheSnapshot(keys), keys);
    if (cached && typeof cached === "object") return cached;
    throw err;
  }
}

export async function fetchRecollections(): Promise<string[]> {
  try { return await apiGet<string[]>("getRecollections"); }
  catch (err) {
    const keys = ["recollections"];
    const cached = readFirstCachedValue<string[]>(await getAppCacheSnapshot(keys), keys);
    if (Array.isArray(cached)) return cached;
    throw err;
  }
}

export async function fetchFullLog(collectorName?: string): Promise<FullLogEntry[]> {
  const params: Record<string, string> = {};
  if (collectorName) params.collector = collectorName;
  try { return await apiGet<FullLogEntry[]>("getFullLog", params); }
  catch (err) {
    const key = collectorName ? collectorCacheKey("fullLog", collectorName) : "fullLog_all";
    const cached = readFirstCachedValue<FullLogEntry[]>(await getAppCacheSnapshot([key]), [key]);
    if (Array.isArray(cached)) return cached;
    throw err;
  }
}

export async function fetchTaskActualsData(): Promise<TaskActualRow[]> {
  try { return await apiGet<TaskActualRow[]>("getTaskActualsSheet"); }
  catch (err) {
    const keys = ["taskActuals"];
    const cached = readFirstCachedValue<TaskActualRow[]>(await getAppCacheSnapshot(keys), keys);
    if (Array.isArray(cached)) return cached;
    throw err;
  }
}

export async function fetchActiveRigsCount(): Promise<ActiveRigsCount> {
  try { return await apiGet<ActiveRigsCount>("getActiveRigsCount"); }
  catch (err) {
    const keys = ["activeRigsCount"];
    const cached = readFirstCachedValue<ActiveRigsCount>(await getAppCacheSnapshot(keys), keys);
    if (cached && typeof cached === "object" && typeof cached.activeRigsToday === "number") return cached;
    throw err;
  }
}

export async function fetchLeaderboard(period: "thisWeek" | "lastWeek" = "thisWeek"): Promise<LeaderboardEntry[]> {
  try {
    const serverLeaderboard = await apiGet<LeaderboardEntry[]>("getLeaderboard", { period }, false);
    if (Array.isArray(serverLeaderboard) && serverLeaderboard.length > 0) return sanitizeLeaderboard(serverLeaderboard);
  } catch {}
  const keys = period === "lastWeek" ? ["leaderboard_lastWeek", "leaderboardLastWeek", "leaderboard"] : ["leaderboard_thisWeek", "leaderboardThisWeek", "leaderboard"];
  const cache = await getAppCacheSnapshot(keys);
  for (const key of keys) {
    const candidate = cache?.[key]?.value as LeaderboardEntry[] | undefined;
    if (Array.isArray(candidate) && candidate.length > 0) return sanitizeLeaderboard(candidate);
  }
  return [];
}
