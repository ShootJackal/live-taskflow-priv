import AsyncStorage from "@react-native-async-storage/async-storage";
import { Collector, Task, LogEntry, SubmitPayload, SubmitResponse, CollectorStats, TaskActualRow, FullLogEntry, AdminDashboardData, LeaderboardEntry } from "@/types";

const DEFAULT_SCRIPT_URL = "";
const REQUEST_TIMEOUT_MS = 25000;
const MAX_RETRY_ATTEMPTS = 2;
const MAX_POST_RETRY_ATTEMPTS = 0; // Prevent duplicate writes on flaky networks.
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_PATTERNS = [/network/i, /timeout/i, /abort/i, /failed to fetch/i];
const RETRY_DELAY_MS = [500, 1500];
const APP_CACHE_SNAPSHOT_TTL_MS = 20 * 1000;
const WARM_SERVER_MIN_INTERVAL_MS = 60 * 1000;

const STORAGE_PREFIX = "tf_cache_";

const memoryCache = new Map<string, { data: unknown; ts: number }>();
const appCacheSnapshotMemo = new Map<string, { data: Record<string, AppCacheEntry>; ts: number }>();
const warmServerLastRunByKey = new Map<string, number>();

const CACHE_TTL_MS: Record<string, number> = {
  getCollectors: 5 * 60 * 1000,
  getTasks: 5 * 60 * 1000,
  getLeaderboard: 2 * 60 * 1000,
  getCollectorStats: 2 * 60 * 1000,
  getRecollections: 60 * 1000,
  getFullLog: 60 * 1000,
  getTaskActualsSheet: 60 * 1000,
  getAdminDashboardData: 60 * 1000,
  getTodayLog: 30 * 1000,
  getActiveRigsCount: 60 * 1000,
};

const STORAGE_TTL_MS: Record<string, number> = {
  getCollectors: 30 * 60 * 1000,
  getTasks: 30 * 60 * 1000,
  getLeaderboard: 10 * 60 * 1000,
  getCollectorStats: 10 * 60 * 1000,
  getRecollections: 5 * 60 * 1000,
  getFullLog: 10 * 60 * 1000,
  getTaskActualsSheet: 10 * 60 * 1000,
  getAdminDashboardData: 10 * 60 * 1000,
  getTodayLog: 2 * 60 * 1000,
  getActiveRigsCount: 2 * 60 * 1000,
};

function getCached<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  const action = key.split("?")[0];
  const ttl = CACHE_TTL_MS[action] ?? 60000;
  if (Date.now() - entry.ts > ttl) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  memoryCache.set(key, { data, ts: Date.now() });
}

async function getStorageCached<T>(key: string): Promise<T | null> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_PREFIX + key);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { data: T; ts: number };
    const action = key.split("?")[0];
    const ttl = STORAGE_TTL_MS[action] ?? 5 * 60 * 1000;
    if (Date.now() - parsed.ts > ttl) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

async function setStorageCache(key: string, data: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_PREFIX + key,
      JSON.stringify({ data, ts: Date.now() })
    );
  } catch (err) {
    console.log("[Cache] AsyncStorage write failed:", err);
  }
}

function normalizeScriptUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return "";
  if (trimmed.endsWith("/exec")) return trimmed;
  if (/\/macros\/s\//.test(trimmed) && !trimmed.endsWith("/exec")) {
    return `${trimmed.replace(/\/$/, "")}/exec`;
  }
  return trimmed;
}

function isValidScriptUrl(url: string): boolean {
  if (!url) return false;
  if (/\[REDACTED\]/i.test(url)) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  } catch {
    return false;
  }
  return /\/exec$/i.test(url);
}

function getScriptUrl(): string {
  const fromEnvRaw = normalizeScriptUrl(process.env.EXPO_PUBLIC_GOOGLE_SCRIPT_URL ?? "");
  const fallbackRaw = normalizeScriptUrl(DEFAULT_SCRIPT_URL);
  const fromEnv = isValidScriptUrl(fromEnvRaw) ? fromEnvRaw : "";
  const fallback = isValidScriptUrl(fallbackRaw) ? fallbackRaw : "";
  const resolved = fromEnv || fallback;

  if (!resolved && (fromEnvRaw || fallbackRaw)) {
    console.log("[API] Ignoring invalid script URL config");
  }

  console.log("[API] getScriptUrl resolved:", resolved ? `${resolved.slice(0, 80)}...` : "EMPTY");
  return resolved;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface AppCacheEntry {
  value: unknown;
  updatedAt: string;
}

function createTimeoutController(ms: number): { controller: AbortController; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, cancel: () => clearTimeout(timer) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return RETRYABLE_ERROR_PATTERNS.some((p) => p.test(message));
}

function normalizeCollectorKey(name: string): string {
  return normalizeCollectorName(name).toLowerCase().replace(/\s+/g, " ").trim();
}

function collectorCacheKey(prefix: string, collectorName: string): string {
  return `${prefix}_${normalizeCollectorKey(collectorName)}`;
}

function tryParseResponseText<T>(text: string): ApiResponse<T> {
  const cleanText = text.trim().replace(/^\)\]\}'\n?/, "");
  try {
    return JSON.parse(cleanText) as ApiResponse<T>;
  } catch {
    throw new Error(cleanText || "Invalid API response format");
  }
}

async function parseApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as ApiResponse<T>;
  }
  const text = await response.text();
  return tryParseResponseText<T>(text);
}

async function apiGet<T>(action: string, params: Record<string, string> = {}, useCache = true): Promise<T> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) {
    throw new Error("Google Script URL not configured. Set EXPO_PUBLIC_GOOGLE_SCRIPT_URL.");
  }

  const cacheKey = `${action}?${JSON.stringify(params)}`;

  if (useCache) {
    const memoryCached = getCached<T>(cacheKey);
    if (memoryCached !== null) {
      console.log("[API] Memory cache hit:", action);
      return memoryCached;
    }
  }

  if (useCache) {
    const storageCached = await getStorageCached<T>(cacheKey);
    if (storageCached !== null) {
      console.log("[API] Storage cache hit:", action);
      setCache(cacheKey, storageCached);
      backgroundRefresh<T>(action, params, cacheKey);
      return storageCached;
    }
  }

  return fetchFromApi<T>(action, params, cacheKey, scriptUrl);
}

async function fetchFromApi<T>(action: string, params: Record<string, string>, cacheKey: string, scriptUrl: string): Promise<T> {
  const url = new URL(scriptUrl);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== "") url.searchParams.set(k, v);
  });

  console.log("[API] GET", action, params);

  for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    const timeout = createTimeoutController(REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url.toString(), {
        redirect: "follow",
        signal: timeout.controller.signal,
        cache: "no-store",
      });
      timeout.cancel();

      if (!response.ok) {
        const text = await response.text();
        const retryable = RETRYABLE_STATUS_CODES.has(response.status);
        console.log("[API] HTTP error:", response.status, "retryable:", retryable);
        if (retryable && attempt < MAX_RETRY_ATTEMPTS) {
          await sleep(RETRY_DELAY_MS[attempt] ?? 1500);
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${text || "Request failed"}`);
      }

      const json = await parseApiResponse<T>(response);
      console.log("[API] Response:", JSON.stringify(json).slice(0, 300));

      if (!json.success) {
        throw new Error(json.error ?? json.message ?? "Unknown API error");
      }

      const data = json.data as T;
      setCache(cacheKey, data);
      setStorageCache(cacheKey, data);
      return data;
    } catch (error) {
      timeout.cancel();
      const message = error instanceof Error ? error.message : "Network error";
      const canRetry = attempt < MAX_RETRY_ATTEMPTS && shouldRetryError(error);
      console.log("[API] GET failed:", message, "attempt:", attempt + 1, "retry:", canRetry);
      if (canRetry) {
        await sleep(RETRY_DELAY_MS[attempt] ?? 1500);
        continue;
      }
      throw new Error(`Request failed: ${message}`);
    }
  }
  throw new Error("Request failed after retries");
}

function backgroundRefresh<T>(action: string, params: Record<string, string>, cacheKey: string): void {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) return;
  setTimeout(() => {
    fetchFromApi<T>(action, params, cacheKey, scriptUrl).catch((err) => {
      console.log("[API] Background refresh failed:", action, err);
    });
  }, 100);
}

async function apiPost(payload: SubmitPayload): Promise<SubmitResponse> {
  const scriptUrl = getScriptUrl();
  if (!scriptUrl) {
    throw new Error("Google Script URL not configured. Set EXPO_PUBLIC_GOOGLE_SCRIPT_URL.");
  }

  console.log("[API] POST submit:", JSON.stringify(payload));

  for (let attempt = 0; attempt <= MAX_POST_RETRY_ATTEMPTS; attempt += 1) {
    const timeout = createTimeoutController(REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload),
        redirect: "follow",
        signal: timeout.controller.signal,
        cache: "no-store",
      });
      timeout.cancel();

      if (!response.ok) {
        const text = await response.text();
        const retryable = RETRYABLE_STATUS_CODES.has(response.status);
        if (retryable && attempt < MAX_POST_RETRY_ATTEMPTS) {
          await sleep(RETRY_DELAY_MS[attempt] ?? 1500);
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${text || "Submit failed"}`);
      }

      const json = await parseApiResponse<SubmitResponse>(response);
      if (!json.success) {
        throw new Error(json.error ?? json.message ?? "Submit failed");
      }

      memoryCache.clear();
      await clearStorageApiCache();

      return {
        success: true,
        message: json.message ?? "Success",
        ...json.data,
      } as SubmitResponse;
    } catch (error) {
      timeout.cancel();
      const message = error instanceof Error ? error.message : "Network error";
      const canRetry = attempt < MAX_POST_RETRY_ATTEMPTS && shouldRetryError(error);
      if (canRetry) {
        await sleep(RETRY_DELAY_MS[attempt] ?? 1500);
        continue;
      }
      throw new Error(`Submit failed: ${message}. Refresh log before retrying to avoid duplicate writes.`);
    }
  }
  throw new Error("Submit failed after retries");
}

function normalizeCacheKeyList(keys?: string[]): string[] {
  if (!keys || keys.length === 0) return [];
  return Array.from(new Set(keys.map((k) => (k ?? "").trim()).filter(Boolean))).sort();
}

async function getAppCacheSnapshot(keys?: string[]): Promise<Record<string, AppCacheEntry> | null> {
  const normalizedKeys = normalizeCacheKeyList(keys);
  const memoKey = normalizedKeys.length > 0 ? normalizedKeys.join("|") : "*";
  const memo = appCacheSnapshotMemo.get(memoKey);
  if (memo && Date.now() - memo.ts <= APP_CACHE_SNAPSHOT_TTL_MS) {
    return memo.data;
  }

  const params: Record<string, string> = {};
  if (normalizedKeys.length > 0) {
    params.keys = normalizedKeys.join(",");
  }

  try {
    const snapshot = await apiGet<Record<string, AppCacheEntry>>("getAppCache", params, false);
    appCacheSnapshotMemo.set(memoKey, { data: snapshot ?? {}, ts: Date.now() });
    return snapshot ?? {};
  } catch (err) {
    console.log("[API] getAppCache snapshot failed:", err);
    return null;
  }
}

function readFirstCachedValue<T>(cache: Record<string, AppCacheEntry> | null, keys: string[]): T | null {
  if (!cache) return null;
  for (const key of keys) {
    const candidate = cache[key];
    if (!candidate) continue;
    return candidate.value as T;
  }
  return null;
}

interface RawCollector {
  name: string;
  rigs: string[];
  email?: string;
  weeklyCap?: number;
  active?: boolean;
  hoursUploaded?: number;
  rating?: string;
}

interface RawTask {
  name: string;
}

export async function fetchCollectors(): Promise<Collector[]> {
  const raw = await apiGet<RawCollector[]>("getCollectors");
  return raw.map((c, i) => ({
    id: `c_${i}_${c.name.replace(/\s/g, "_")}`,
    name: c.name,
    rigs: c.rigs ?? [],
    email: c.email,
    weeklyCap: c.weeklyCap,
    active: c.active,
    hoursUploaded: c.hoursUploaded,
    rating: c.rating,
  }));
}

export async function fetchTasks(): Promise<Task[]> {
  const raw = await apiGet<RawTask[]>("getTasks");
  return raw.map((t, i) => ({
    id: `t_${i}_${t.name.replace(/\s/g, "_")}`,
    name: t.name,
    label: t.name,
  }));
}

export async function fetchTodayLog(collectorName: string): Promise<LogEntry[]> {
  try {
    return await apiGet<LogEntry[]>("getTodayLog", { collector: collectorName }, false);
  } catch (err) {
    const cacheKeys = [collectorCacheKey("todayLog", collectorName)];
    const cache = await getAppCacheSnapshot(cacheKeys);
    const cached = readFirstCachedValue<LogEntry[]>(cache, cacheKeys);
    if (Array.isArray(cached)) return cached;
    throw err;
  }
}

export async function fetchCollectorStats(collectorName: string): Promise<CollectorStats> {
  try {
    return await apiGet<CollectorStats>("getCollectorStats", { collector: collectorName });
  } catch (err) {
    const cacheKeys = [collectorCacheKey("collectorStats", collectorName)];
    const cache = await getAppCacheSnapshot(cacheKeys);
    const cached = readFirstCachedValue<CollectorStats>(cache, cacheKeys);
    if (cached && typeof cached === "object") return cached;
    throw err;
  }
}

export async function submitAction(payload: SubmitPayload): Promise<SubmitResponse> {
  return apiPost(payload);
}

export async function fetchRecollections(): Promise<string[]> {
  try {
    return await apiGet<string[]>("getRecollections");
  } catch (err) {
    const cacheKeys = ["recollections"];
    const cache = await getAppCacheSnapshot(cacheKeys);
    const cached = readFirstCachedValue<string[]>(cache, cacheKeys);
    if (Array.isArray(cached)) return cached;
    throw err;
  }
}

export async function fetchFullLog(collectorName?: string): Promise<FullLogEntry[]> {
  const params: Record<string, string> = {};
  if (collectorName) params.collector = collectorName;
  try {
    return await apiGet<FullLogEntry[]>("getFullLog", params);
  } catch (err) {
    const cacheKey = collectorName ? collectorCacheKey("fullLog", collectorName) : "fullLog_all";
    const cache = await getAppCacheSnapshot([cacheKey]);
    const cached = readFirstCachedValue<FullLogEntry[]>(cache, [cacheKey]);
    if (Array.isArray(cached)) return cached;
    throw err;
  }
}

export async function fetchTaskActualsData(): Promise<TaskActualRow[]> {
  try {
    return await apiGet<TaskActualRow[]>("getTaskActualsSheet");
  } catch (err) {
    const cacheKeys = ["taskActuals"];
    const cache = await getAppCacheSnapshot(cacheKeys);
    const cached = readFirstCachedValue<TaskActualRow[]>(cache, cacheKeys);
    if (Array.isArray(cached)) return cached;
    throw err;
  }
}

export async function fetchAdminDashboardData(): Promise<AdminDashboardData> {
  try {
    return await apiGet<AdminDashboardData>("getAdminDashboardData");
  } catch (err) {
    const cacheKeys = ["adminDashboard"];
    const cache = await getAppCacheSnapshot(cacheKeys);
    const cached = readFirstCachedValue<AdminDashboardData>(cache, cacheKeys);
    if (cached && typeof cached === "object") return cached;
    throw err;
  }
}

export interface ActiveRigsCount {
  activeRigsToday: number;
}

export async function fetchActiveRigsCount(): Promise<ActiveRigsCount> {
  try {
    return await apiGet<ActiveRigsCount>("getActiveRigsCount");
  } catch (err) {
    const cacheKeys = ["activeRigsCount"];
    const cache = await getAppCacheSnapshot(cacheKeys);
    const cached = readFirstCachedValue<ActiveRigsCount>(cache, cacheKeys);
    if (cached && typeof cached === "object" && typeof cached.activeRigsToday === "number") return cached;
    throw err;
  }
}

export async function warmServerCache(collectorName?: string): Promise<void> {
  const warmKey = normalizeCollectorName(collectorName ?? "").toLowerCase() || "*";
  const now = Date.now();
  const lastRun = warmServerLastRunByKey.get(warmKey) ?? 0;
  if (now - lastRun < WARM_SERVER_MIN_INTERVAL_MS) {
    return;
  }
  warmServerLastRunByKey.set(warmKey, now);

  const params: Record<string, string> = {};
  if (collectorName && collectorName.trim().length > 0) {
    params.collector = collectorName.trim();
  }
  params.scope = "light";
  try {
    await apiGet("refreshCache", params, false);
  } catch (err) {
    warmServerLastRunByKey.delete(warmKey);
    console.log("[API] warmServerCache failed:", err);
  }
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
    const hoursLogged = actualHours > 0 ? actualHours : 0;
    return {
      ...e,
      collectorName: normalizeCollectorName(e.collectorName),
      hoursLogged,
      actualHours,
      reportedHours,
      hoursSource: "actual",
      tasksCompleted: toNumber(e.tasksCompleted),
      tasksAssigned: toNumber(e.tasksAssigned),
      completionRate: toNumber(e.completionRate),
      region: normalizeRegion(e.region),
      rank: 0,
    };
  });
  entries.sort((a, b) => b.hoursLogged - a.hoursLogged);
  entries.forEach((e, i) => { e.rank = i + 1; });
  return entries;
}

export async function fetchLeaderboard(period: "thisWeek" | "lastWeek" = "thisWeek"): Promise<LeaderboardEntry[]> {
  console.log("[API] fetchLeaderboard — using server endpoint", period);

  try {
    // Always hit server for leaderboard to avoid stale storage snapshots masking live MX/SF updates.
    const serverLeaderboard = await apiGet<LeaderboardEntry[]>("getLeaderboard", { period }, false);
    if (serverLeaderboard && serverLeaderboard.length > 0) {
      console.log("[API] Server leaderboard returned", serverLeaderboard.length, "entries");
      return sanitizeLeaderboard(serverLeaderboard);
    }
    console.log("[API] Server leaderboard empty — trying _AppCache fallback");
  } catch (err) {
    console.log("[API] Server getLeaderboard failed:", err);
  }

  try {
    console.log("[API] Attempting _AppCache fallback for leaderboard");
    const periodCacheKeys = period === "lastWeek"
      ? ["leaderboard_lastWeek", "leaderboardLastWeek", "leaderboard"]
      : ["leaderboard_thisWeek", "leaderboardThisWeek", "leaderboard"];
    const cache = await getAppCacheSnapshot(periodCacheKeys);
    if (cache) {
      for (const key of periodCacheKeys) {
        const candidate = cache[key];
        if (!candidate) continue;
        const cached = candidate.value as LeaderboardEntry[];
        if (Array.isArray(cached) && cached.length > 0) {
          console.log("[API] _AppCache leaderboard fallback:", cached.length, "entries, updated:", candidate.updatedAt, "key:", key);
          return sanitizeLeaderboard(cached);
        }
      }
    }
  } catch (err) {
    console.log("[API] _AppCache fallback failed:", err);
  }

  console.log("[API] Leaderboard empty or failed, returning []");
  return [];
}

function normalizeCollectorName(name: string): string {
  return (name ?? "").replace(/\s*\(.*?\)\s*$/g, "").trim();
}

function toNumber(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

export function isApiConfigured(): boolean {
  const url = getScriptUrl();
  return !!url;
}

export function clearApiCache(): void {
  memoryCache.clear();
  appCacheSnapshotMemo.clear();
  console.log("[API] Memory cache cleared");
}

export async function clearAllCaches(): Promise<void> {
  memoryCache.clear();
  appCacheSnapshotMemo.clear();
  try {
    await clearStorageApiCache();
    console.log("[API] All caches cleared (memory + storage)");
  } catch (err) {
    console.log("[API] Storage clear failed:", err);
  }
}

async function clearStorageApiCache(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const cacheKeys = keys.filter((k) => k.startsWith(STORAGE_PREFIX));
  if (cacheKeys.length > 0) {
    await AsyncStorage.multiRemove(cacheKeys);
  }
}
