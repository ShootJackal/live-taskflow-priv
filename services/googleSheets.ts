import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Collector,
  Task,
  LogEntry,
  SubmitPayload,
  SubmitResponse,
  CollectorStats,
  TaskActualRow,
  FullLogEntry,
  AdminDashboardData,
  LeaderboardEntry,
  LiveAlert,
  CollectorProfile,
  AdminStartPlanData,
  DailyCarryoverItem,
  PendingReviewItem,
  RigStatus,
  RigAssignment,
  RigSwitchRequest,
} from "@/types";
import { normalizeCollectorName } from "@/utils/normalize";
import { log } from "@/utils/logger";

// Single deployment — all actions route through this URL.
// EXPO_PUBLIC_GOOGLE_SCRIPT_URL in your env overrides this at build time.
const DEFAULT_SCRIPT_URL_LEGACY = "https://script.google.com/macros/s/AKfycbxNNZjODqxTEehH8iylSUMxdLvJ5UrHLp4uqDmMGaeAzpnwFxqWXIyPVfAHsExl7bCfOw/exec";
const DEFAULT_SCRIPT_URL_CORE = "";
const DEFAULT_SCRIPT_URL_ANALYTICS = "";
const REQUEST_TIMEOUT_MS = 12000; // GAS rarely exceeds 8-10 s even cold
const MAX_RETRY_ATTEMPTS = 1;     // one retry is enough; fast fail is better UX
const MAX_POST_RETRY_ATTEMPTS = 0;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_PATTERNS = [/network/i, /timeout/i, /abort/i, /failed to fetch/i];
const RETRY_DELAY_MS = [300, 900]; // shorter retry delays
const APP_CACHE_SNAPSHOT_TTL_MS = 20 * 1000;
const WARM_SERVER_MIN_INTERVAL_MS = 45 * 1000; // re-warm every 45 s

const STORAGE_PREFIX = "tf_cache_";

type ScriptRole = "core" | "analytics";

const ANALYTICS_GET_ACTIONS = new Set<string>([
  "getLeaderboard",
  "getCollectorStats",
  "getCollectorProfile",
  "getTaskActualsSheet",
  "getAdminDashboardData",
  "getActiveRigsCount",
  "getRecollections",
  "getAdminStartPlan",
  "getAppCache",
  "refreshCache",
  "forceServerRepull",
]);

const ANALYTICS_META_ACTIONS = new Set<string>([
  "FORCE_SERVER_REPULL",
]);

const memoryCache = new Map<string, { data: unknown; ts: number }>();
const appCacheSnapshotMemo = new Map<string, { data: Record<string, AppCacheEntry>; ts: number }>();
const warmServerLastRunByKey = new Map<string, number>();

// Actions that must always hit GAS directly (bypass the CDN proxy).
// These are internal GAS-side cache operations or rarely-used admin reads.
const BYPASS_PROXY_ACTIONS = new Set([
  "refreshCache",
  "forceServerRepull",
  "getAppCache",
  "getRigStatus",
  "getPendingSwitchRequests",
]);

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
  getLiveAlerts: 20 * 1000,
  getCollectorProfile: 60 * 1000,
  getAdminStartPlan: 60 * 1000,
  getDailyCarryover: 20 * 1000,
  getRigStatus: 15 * 1000,
  getPendingSwitchRequests: 15 * 1000,
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
  getLiveAlerts: 2 * 60 * 1000,
  getCollectorProfile: 5 * 60 * 1000,
  getAdminStartPlan: 5 * 60 * 1000,
  getDailyCarryover: 2 * 60 * 1000,
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
    log("[Cache] AsyncStorage write failed:", err);
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

let _resolvedUrls: { legacy: string; core: string; analytics: string } | null = null;

function resolveScriptUrls(): { legacy: string; core: string; analytics: string } {
  if (_resolvedUrls) return _resolvedUrls;

  const legacyEnvRaw = normalizeScriptUrl(process.env.EXPO_PUBLIC_GOOGLE_SCRIPT_URL ?? "");
  const coreEnvRaw = normalizeScriptUrl(process.env.EXPO_PUBLIC_GAS_CORE_URL ?? "");
  const analyticsEnvRaw = normalizeScriptUrl(process.env.EXPO_PUBLIC_GAS_ANALYTICS_URL ?? "");

  const legacyFallbackRaw = normalizeScriptUrl(DEFAULT_SCRIPT_URL_LEGACY);
  const coreFallbackRaw = normalizeScriptUrl(DEFAULT_SCRIPT_URL_CORE);
  const analyticsFallbackRaw = normalizeScriptUrl(DEFAULT_SCRIPT_URL_ANALYTICS);

  const legacy = isValidScriptUrl(legacyEnvRaw)
    ? legacyEnvRaw
    : (isValidScriptUrl(legacyFallbackRaw) ? legacyFallbackRaw : "");
  const core = isValidScriptUrl(coreEnvRaw)
    ? coreEnvRaw
    : (isValidScriptUrl(coreFallbackRaw) ? coreFallbackRaw : "");
  const analytics = isValidScriptUrl(analyticsEnvRaw)
    ? analyticsEnvRaw
    : (isValidScriptUrl(analyticsFallbackRaw) ? analyticsFallbackRaw : "");

  _resolvedUrls = { legacy, core, analytics };
  return _resolvedUrls;
}

function getScriptUrlForRole(role: ScriptRole): string {
  const { legacy, core, analytics } = resolveScriptUrls();
  // Split-first mode: if any split endpoint is configured, prefer split routing.
  const splitEnabled = Boolean(core || analytics);
  if (role === "analytics") {
    return splitEnabled ? (analytics || core) : legacy;
  }
  return splitEnabled ? (core || analytics) : legacy;
}

function getScriptUrlForAction(action: string): string {
  return getScriptUrlForRole(ANALYTICS_GET_ACTIONS.has(action) ? "analytics" : "core");
}

function getScriptUrlForMetaAction(metaAction: string): string {
  const clean = String(metaAction ?? "").trim().toUpperCase();
  return getScriptUrlForRole(ANALYTICS_META_ACTIONS.has(clean) ? "analytics" : "core");
}

function getMissingScriptUrlError(role: ScriptRole): Error {
  const target = role === "analytics" ? "analytics" : "core";
  return new Error(
    `Google Script URL not configured for ${target}. Set ` +
    `EXPO_PUBLIC_GOOGLE_SCRIPT_URL (monolith) or ` +
    `EXPO_PUBLIC_GAS_CORE_URL / EXPO_PUBLIC_GAS_ANALYTICS_URL.`
  );
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

/**
 * Returns the Vercel CDN proxy URL for a given action when running on web.
 * The proxy (api/gas.ts) caches GAS responses at the edge, shielding users
 * from GAS cold-start latency. Falls back to direct GAS if proxy is unavailable.
 */
function getProxyUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URL("/api/gas", window.location.origin).toString();
  } catch {
    return null;
  }
}

async function apiGet<T>(action: string, params: Record<string, string> = {}, useCache = true): Promise<T> {
  const cacheKey = `${action}?${JSON.stringify(params)}`;

  if (useCache) {
    const memoryCached = getCached<T>(cacheKey);
    if (memoryCached !== null) {
      log("[API] Memory cache hit:", action);
      return memoryCached;
    }
  }

  if (useCache) {
    const storageCached = await getStorageCached<T>(cacheKey);
    if (storageCached !== null) {
      log("[API] Storage cache hit:", action);
      setCache(cacheKey, storageCached);
      backgroundRefresh<T>(action, params, cacheKey);
      return storageCached;
    }
  }

  // On web: route through the Vercel CDN proxy so GAS cold-start latency is
  // absorbed at the edge and responses are cached globally.
  // Certain internal actions bypass the proxy and always go direct to GAS.
  const proxyUrl = !BYPASS_PROXY_ACTIONS.has(action) ? getProxyUrl() : null;
  if (proxyUrl) {
    try {
      return await fetchFromApi<T>(action, params, cacheKey, proxyUrl);
    } catch (proxyErr) {
      // Proxy unavailable (local dev without Vercel, misconfigured env, etc.)
      // — fall through to direct GAS below.
      log("[API] CDN proxy failed, falling back to direct GAS:", proxyErr);
    }
  }

  const scriptUrl = getScriptUrlForAction(action);
  if (!scriptUrl) {
    throw getMissingScriptUrlError(ANALYTICS_GET_ACTIONS.has(action) ? "analytics" : "core");
  }
  return fetchFromApi<T>(action, params, cacheKey, scriptUrl);
}

async function fetchFromApi<T>(action: string, params: Record<string, string>, cacheKey: string, scriptUrl: string): Promise<T> {
  const url = new URL(scriptUrl);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== "") url.searchParams.set(k, v);
  });

  log("[API] GET", action, params);

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
        log("[API] HTTP error:", response.status, "retryable:", retryable);
        if (retryable && attempt < MAX_RETRY_ATTEMPTS) {
          await sleep(RETRY_DELAY_MS[attempt] ?? 1500);
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${text || "Request failed"}`);
      }

      const json = await parseApiResponse<T>(response);
      log("[API] Response:", JSON.stringify(json).slice(0, 300));

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
      log("[API] GET failed:", message, "attempt:", attempt + 1, "retry:", canRetry);
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
  setTimeout(() => {
    const proxyUrl = !BYPASS_PROXY_ACTIONS.has(action) ? getProxyUrl() : null;
    const url = proxyUrl ?? getScriptUrlForAction(action);
    if (!url) return;
    fetchFromApi<T>(action, params, cacheKey, url).catch((err) => {
      log("[API] Background refresh failed:", action, err);
    });
  }, 100);
}

async function apiPost(payload: SubmitPayload): Promise<SubmitResponse> {
  const scriptUrl = getScriptUrlForRole("core");
  if (!scriptUrl) {
    throw getMissingScriptUrlError("core");
  }

  log("[API] POST submit:", JSON.stringify(payload));

  for (let attempt = 0; attempt <= MAX_POST_RETRY_ATTEMPTS; attempt += 1) {
    const timeout = createTimeoutController(REQUEST_TIMEOUT_MS);
    try {
      // text/plain avoids CORS preflight which Google Apps Script cannot handle.
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

async function apiMetaPost<T>(payload: Record<string, unknown>): Promise<T> {
  const metaAction = String(payload?.metaAction ?? "").trim().toUpperCase();
  const scriptUrl = getScriptUrlForMetaAction(metaAction);
  if (!scriptUrl) {
    throw getMissingScriptUrlError(ANALYTICS_META_ACTIONS.has(metaAction) ? "analytics" : "core");
  }

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

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text || "Request failed"}`);
    }

    const json = await parseApiResponse<T>(response);
    if (!json.success) {
      throw new Error(json.error ?? json.message ?? "Request failed");
    }

    memoryCache.clear();
    appCacheSnapshotMemo.clear();
    return (json.data as T);
  } finally {
    timeout.cancel();
  }
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
    log("[API] getAppCache snapshot failed:", err);
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

// SF collector names used as a client-side fallback when the Collectors sheet
// doesn't have a Team column yet (or GAS hasn't been redeployed).
const SF_COLLECTOR_NAMES = new Set(["travis", "tony", "veronika"]);

interface RawCollector {
  name: string;
  rigs: string[];
  team?: string;
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
  return raw.map((c, i) => {
    // Prefer team from GAS (sheet column); fall back to the known SF name list
    // so the SOD rig picker works even before the GAS script is redeployed.
    const sheetTeam = (c.team ?? "").toUpperCase().trim();
    const team: "SF" | "MX" = sheetTeam === "SF"
      ? "SF"
      : sheetTeam === "MX"
      ? "MX"
      : SF_COLLECTOR_NAMES.has(normalizeCollectorName(c.name).toLowerCase())
      ? "SF"
      : "MX";
    return {
      id: `c_${i}_${c.name.replace(/\s/g, "_")}`,
      name: c.name,
      rigs: c.rigs ?? [],
      team,
      email: c.email,
      weeklyCap: c.weeklyCap,
      active: c.active,
      hoursUploaded: c.hoursUploaded,
      rating: c.rating,
    };
  });
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

export async function fetchCollectorProfile(collectorName: string): Promise<CollectorProfile> {
  try {
    return await apiGet<CollectorProfile>("getCollectorProfile", { collector: collectorName }, false);
  } catch (err) {
    const cacheKeys = [collectorCacheKey("collectorProfile", collectorName)];
    const cache = await getAppCacheSnapshot(cacheKeys);
    const cached = readFirstCachedValue<CollectorProfile>(cache, cacheKeys);
    if (cached && typeof cached === "object") return cached;
    throw err;
  }
}

export async function fetchAdminStartPlan(): Promise<AdminStartPlanData> {
  try {
    return await apiGet<AdminStartPlanData>("getAdminStartPlan");
  } catch (err) {
    const cacheKeys = ["adminStartPlan"];
    const cache = await getAppCacheSnapshot(cacheKeys);
    const cached = readFirstCachedValue<AdminStartPlanData>(cache, cacheKeys);
    if (cached && typeof cached === "object") return cached;
    throw err;
  }
}

export async function fetchDailyCarryover(collectorName: string): Promise<DailyCarryoverItem[]> {
  try {
    return await apiGet<DailyCarryoverItem[]>("getDailyCarryover", { collector: collectorName }, false);
  } catch (err) {
    const cacheKeys = [collectorCacheKey("dailyCarryover", collectorName)];
    const cache = await getAppCacheSnapshot(cacheKeys);
    const cached = readFirstCachedValue<DailyCarryoverItem[]>(cache, cacheKeys);
    if (Array.isArray(cached)) return cached;
    throw err;
  }
}

export async function fetchPendingReview(
  collectorName: string,
  rig: string,
): Promise<PendingReviewItem[]> {
  if (!collectorName || !rig) return [];
  try {
    return await apiGet<PendingReviewItem[]>(
      "getPendingReview",
      { collector: collectorName, rig },
      false,
    );
  } catch (err) {
    // Non-fatal — degrades to empty list if GAS endpoint not deployed yet.
    // Log so it's visible in dev without crashing production.
    log("[API] fetchPendingReview failed (non-fatal):", err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function submitAction(payload: SubmitPayload): Promise<SubmitResponse> {
  return apiPost(payload);
}

export async function logCollectorRigSelection(
  collectorName: string,
  rig: string,
  source = "TOOLS"
): Promise<void> {
  const collector = normalizeCollectorName(collectorName ?? "").trim();
  const rigValue = String(rig ?? "").trim();
  if (!collector || !rigValue) return;

  const scriptUrl = getScriptUrlForMetaAction("SET_RIG");
  if (!scriptUrl) return;

  const timeout = createTimeoutController(REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        metaAction: "SET_RIG",
        collector,
        rig: rigValue,
        source,
      }),
      redirect: "follow",
      signal: timeout.controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text || "Rig log failed"}`);
    }

    const json = await parseApiResponse<Record<string, unknown>>(response);
    if (!json.success) {
      throw new Error(json.error ?? json.message ?? "Rig log failed");
    }

    // Rig mapping affects all-time stats resolution; clear local snapshots.
    memoryCache.clear();
    appCacheSnapshotMemo.clear();
  } catch (err) {
    log("[API] logCollectorRigSelection failed:", err);
  } finally {
    timeout.cancel();
  }
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

export async function fetchLiveAlerts(): Promise<LiveAlert[]> {
  try {
    return await apiGet<LiveAlert[]>("getLiveAlerts");
  } catch (err) {
    const cacheKeys = ["liveAlerts"];
    const cache = await getAppCacheSnapshot(cacheKeys);
    const cached = readFirstCachedValue<LiveAlert[]>(cache, cacheKeys);
    if (Array.isArray(cached)) return cached;
    throw err;
  }
}

export async function pushLiveAlert(payload: {
  message: string;
  level?: string;
  target?: string;
  createdBy?: string;
  expiryHours?: number;
}): Promise<void> {
  const scriptUrl = getScriptUrlForMetaAction("PUSH_ALERT");
  if (!scriptUrl) {
    throw getMissingScriptUrlError("core");
  }

  const timeout = createTimeoutController(REQUEST_TIMEOUT_MS);
  try {
    const body: Record<string, unknown> = {
      metaAction: "PUSH_ALERT",
      message: String(payload.message ?? "").trim(),
      level: String(payload.level ?? "INFO").trim(),
      target: String(payload.target ?? "ALL").trim(),
      createdBy: String(payload.createdBy ?? "").trim(),
    };
    if (payload.expiryHours && payload.expiryHours > 0) {
      body.expiryHours = payload.expiryHours;
    }

    const response = await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(body),
      redirect: "follow",
      signal: timeout.controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text || "Alert push failed"}`);
    }

    const json = await parseApiResponse<Record<string, unknown>>(response);
    if (!json.success) {
      throw new Error(json.error ?? json.message ?? "Alert push failed");
    }

    memoryCache.clear();
    appCacheSnapshotMemo.clear();
  } finally {
    timeout.cancel();
  }
}

export async function clearAllAlerts(): Promise<void> {
  const scriptUrl = getScriptUrlForMetaAction("CLEAR_ALL_ALERTS");
  if (!scriptUrl) throw getMissingScriptUrlError("core");

  const timeout = createTimeoutController(REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ metaAction: "CLEAR_ALL_ALERTS" }),
      redirect: "follow",
      signal: timeout.controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text || "Clear alerts failed"}`);
    }
    const json = await parseApiResponse<Record<string, unknown>>(response);
    if (!json.success) throw new Error(json.error ?? json.message ?? "Clear alerts failed");
    memoryCache.clear();
    appCacheSnapshotMemo.clear();
  } finally {
    timeout.cancel();
  }
}

export async function adminAssignTask(payload: {
  collector: string;
  task: string;
  hours: number;
  notes?: string;
  rig?: string;
}): Promise<SubmitResponse> {
  return await apiMetaPost<SubmitResponse>({
    metaAction: "ADMIN_ASSIGN_TASK",
    collector: String(payload.collector ?? "").trim(),
    task: String(payload.task ?? "").trim(),
    hours: Number(payload.hours ?? 0),
    notes: String(payload.notes ?? "").trim(),
    rig: String(payload.rig ?? "").trim(),
  });
}

export async function adminCancelTask(payload: {
  collector: string;
  task: string;
  notes?: string;
  rig?: string;
}): Promise<SubmitResponse> {
  return await apiMetaPost<SubmitResponse>({
    metaAction: "ADMIN_CANCEL_TASK",
    collector: String(payload.collector ?? "").trim(),
    task: String(payload.task ?? "").trim(),
    notes: String(payload.notes ?? "").trim(),
    rig: String(payload.rig ?? "").trim(),
  });
}

export async function adminEditHours(payload: {
  collector: string;
  task: string;
  hours: number;
  plannedHours?: number;
  status?: string;
  notes?: string;
}): Promise<SubmitResponse> {
  return await apiMetaPost<SubmitResponse>({
    metaAction: "ADMIN_EDIT_HOURS",
    collector: String(payload.collector ?? "").trim(),
    task: String(payload.task ?? "").trim(),
    hours: Number(payload.hours ?? 0),
    plannedHours: Number(payload.plannedHours ?? 0),
    status: String(payload.status ?? "").trim(),
    notes: String(payload.notes ?? "").trim(),
  });
}

export async function grantCollectorAward(payload: {
  collector: string;
  award: string;
  pinned?: boolean;
  grantedBy?: string;
  notes?: string;
}): Promise<void> {
  await apiMetaPost<Record<string, unknown>>({
    metaAction: "GRANT_AWARD",
    collector: String(payload.collector ?? "").trim(),
    award: String(payload.award ?? "").trim(),
    pinned: !!payload.pinned,
    grantedBy: String(payload.grantedBy ?? "").trim(),
    notes: String(payload.notes ?? "").trim(),
  });
}

export async function reportDailyCarryover(payload: {
  collector: string;
  task: string;
  assignmentId: string;
  actualHours?: number;
  notes?: string;
}): Promise<SubmitResponse> {
  return await apiMetaPost<SubmitResponse>({
    metaAction: "CARRYOVER_REPORT",
    collector: String(payload.collector ?? "").trim(),
    task: String(payload.task ?? "").trim(),
    assignmentId: String(payload.assignmentId ?? "").trim(),
    actualHours: Number(payload.actualHours ?? 0),
    notes: String(payload.notes ?? "").trim(),
  });
}

export async function cancelDailyCarryover(payload: {
  collector: string;
  task: string;
  assignmentId: string;
  notes?: string;
}): Promise<SubmitResponse> {
  return await apiMetaPost<SubmitResponse>({
    metaAction: "CARRYOVER_CANCEL",
    collector: String(payload.collector ?? "").trim(),
    task: String(payload.task ?? "").trim(),
    assignmentId: String(payload.assignmentId ?? "").trim(),
    notes: String(payload.notes ?? "").trim(),
  });
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
    log("[API] warmServerCache failed:", err);
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
      hoursSource: "actual" as const,
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
  log("[API] fetchLeaderboard — using server endpoint", period);
  let serverFetchFailed = false;
  let serverErrorMessage = "";

  try {
    // Always hit server for leaderboard to avoid stale storage snapshots masking live MX/SF updates.
    const serverLeaderboard = await apiGet<LeaderboardEntry[]>("getLeaderboard", { period }, false);
    if (!Array.isArray(serverLeaderboard)) {
      throw new Error("Malformed leaderboard payload (expected array)");
    }
    if (serverLeaderboard.length > 0) {
      log("[API] Server leaderboard returned", serverLeaderboard.length, "entries");
      return sanitizeLeaderboard(serverLeaderboard);
    }
    log("[API] Server leaderboard empty — trying _AppCache fallback");
  } catch (err) {
    serverFetchFailed = true;
    serverErrorMessage = err instanceof Error ? err.message : String(err ?? "Unknown error");
    log("[API] Server getLeaderboard failed:", err);
  }

  try {
    log("[API] Attempting _AppCache fallback for leaderboard");
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
          log("[API] _AppCache leaderboard fallback:", cached.length, "entries, updated:", candidate.updatedAt, "key:", key);
          return sanitizeLeaderboard(cached);
        }
      }
    }
  } catch (err) {
    log("[API] _AppCache fallback failed:", err);
  }

  if (serverFetchFailed) {
    throw new Error(`Leaderboard feed unavailable: ${serverErrorMessage || "server fetch failed"}`);
  }

  log("[API] Leaderboard empty, returning []");
  return [];
}

function toNumber(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

export function isApiConfigured(): boolean {
  const coreUrl = getScriptUrlForRole("core");
  const analyticsUrl = getScriptUrlForRole("analytics");
  return !!(coreUrl || analyticsUrl);
}

export function clearApiCache(): void {
  memoryCache.clear();
  appCacheSnapshotMemo.clear();
  _resolvedUrls = null;
  log("[API] Memory cache cleared");
}

export async function clearAllCaches(): Promise<void> {
  memoryCache.clear();
  appCacheSnapshotMemo.clear();
  _resolvedUrls = null;
  try {
    await clearStorageApiCache();
    log("[API] All caches cleared (memory + storage)");
  } catch (err) {
    log("[API] Storage clear failed:", err);
  }
}

export async function forceServerRepull(options?: {
  collector?: string;
  scope?: "light" | "full";
  reason?: string;
}): Promise<Record<string, unknown>> {
  const params: Record<string, string> = {};
  const collector = String(options?.collector ?? "").trim();
  if (collector) params.collector = collector;
  params.scope = options?.scope === "light" ? "light" : "full";
  const reason = String(options?.reason ?? "").trim();
  if (reason) params.reason = reason;
  return await apiGet<Record<string, unknown>>("forceServerRepull", params, false);
}

// ── Rig Assignment System ────────────────────────────────────────────────────

export async function fetchRigStatus(): Promise<RigStatus[]> {
  return await apiGet<RigStatus[]>("getRigStatus", {}, false);
}

export async function assignRigSOD(payload: {
  collector: string;
  rig: number;
}): Promise<RigAssignment> {
  return await apiMetaPost<RigAssignment>({
    metaAction: "ASSIGN_RIG_SOD",
    collector: String(payload.collector ?? "").trim(),
    rig: payload.rig,
  });
}

export async function releaseRig(payload: {
  assignmentId: string;
  reason?: string;
}): Promise<{ message: string; hours?: number }> {
  return await apiMetaPost({
    metaAction: "RELEASE_RIG",
    assignmentId: String(payload.assignmentId ?? "").trim(),
    reason: String(payload.reason ?? "MANUAL").trim(),
  });
}

export async function requestRigSwitch(payload: {
  requestingCollector: string;
  rig: number;
}): Promise<{ assignmentId: string; currentAssignee: string; message: string }> {
  return await apiMetaPost({
    metaAction: "REQUEST_RIG_SWITCH",
    requestingCollector: String(payload.requestingCollector ?? "").trim(),
    rig: payload.rig,
  });
}

export async function respondRigSwitch(payload: {
  assignmentId: string;
  action: "APPROVE" | "DENY";
}): Promise<{ result: string; message: string }> {
  memoryCache.clear();
  return await apiMetaPost({
    metaAction: "RESPOND_RIG_SWITCH",
    assignmentId: String(payload.assignmentId ?? "").trim(),
    action: payload.action,
  });
}

export async function fetchPendingSwitchRequests(
  collectorName: string
): Promise<RigSwitchRequest[]> {
  if (!collectorName) return [];
  return await apiGet<RigSwitchRequest[]>(
    "getPendingSwitchRequests",
    { collector: collectorName },
    false
  );
}

// ── End Rig Assignment System ────────────────────────────────────────────────

async function clearStorageApiCache(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const cacheKeys = keys.filter((k) => k.startsWith(STORAGE_PREFIX));
  if (cacheKeys.length > 0) {
    await AsyncStorage.multiRemove(cacheKeys);
  }
}
