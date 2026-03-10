import { clearMemoryCache, clearStorageApiCache, getCached, getStorageCached, setCache, setStorageCache } from "@/services/cache/cacheStore";
import { ANALYTICS_GET_ACTIONS, ANALYTICS_META_ACTIONS, BYPASS_PROXY_ACTIONS } from "@/services/config/actionRouting";
import { normalizeCollectorName } from "@/utils/normalize";
import { log } from "@/utils/logger";

const DEFAULT_SCRIPT_URL_LEGACY = "https://script.google.com/macros/s/AKfycbxNNZjODqxTEehH8iylSUMxdLvJ5UrHLp4uqDmMGaeAzpnwFxqWXIyPVfAHsExl7bCfOw/exec";
const DEFAULT_SCRIPT_URL_CORE = "";
const DEFAULT_SCRIPT_URL_ANALYTICS = "";
const REQUEST_TIMEOUT_MS = 12000;
const MAX_RETRY_ATTEMPTS = 1;
const MAX_POST_RETRY_ATTEMPTS = 0;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_PATTERNS = [/network/i, /timeout/i, /abort/i, /failed to fetch/i];
const RETRY_DELAY_MS = [300, 900];
const APP_CACHE_SNAPSHOT_TTL_MS = 20 * 1000;
const WARM_SERVER_MIN_INTERVAL_MS = 45 * 1000;

type ScriptRole = "core" | "analytics";

interface ApiResponse<T> { success: boolean; data?: T; error?: string; message?: string }
export interface AppCacheEntry { value: unknown; updatedAt: string }

const appCacheSnapshotMemo = new Map<string, { data: Record<string, AppCacheEntry>; ts: number }>();
const warmServerLastRunByKey = new Map<string, number>();
let _resolvedUrls: { legacy: string; core: string; analytics: string } | null = null;

function normalizeScriptUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return "";
  if (trimmed.endsWith("/exec")) return trimmed;
  if (/\/macros\/s\//.test(trimmed) && !trimmed.endsWith("/exec")) return `${trimmed.replace(/\/$/, "")}/exec`;
  return trimmed;
}
function isValidScriptUrl(url: string): boolean {
  if (!url || /\[REDACTED\]/i.test(url)) return false;
  try { const parsed = new URL(url); if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false; } catch { return false; }
  return /\/exec$/i.test(url);
}
function resolveScriptUrls() {
  if (_resolvedUrls) return _resolvedUrls;
  const legacy = normalizeScriptUrl(process.env.EXPO_PUBLIC_GOOGLE_SCRIPT_URL ?? "");
  const core = normalizeScriptUrl(process.env.EXPO_PUBLIC_GAS_CORE_URL ?? "");
  const analytics = normalizeScriptUrl(process.env.EXPO_PUBLIC_GAS_ANALYTICS_URL ?? "");
  _resolvedUrls = {
    legacy: isValidScriptUrl(legacy) ? legacy : (isValidScriptUrl(DEFAULT_SCRIPT_URL_LEGACY) ? DEFAULT_SCRIPT_URL_LEGACY : ""),
    core: isValidScriptUrl(core) ? core : (isValidScriptUrl(DEFAULT_SCRIPT_URL_CORE) ? DEFAULT_SCRIPT_URL_CORE : ""),
    analytics: isValidScriptUrl(analytics) ? analytics : (isValidScriptUrl(DEFAULT_SCRIPT_URL_ANALYTICS) ? DEFAULT_SCRIPT_URL_ANALYTICS : ""),
  };
  return _resolvedUrls;
}

function getScriptUrlForRole(role: ScriptRole): string {
  const { legacy, core, analytics } = resolveScriptUrls();
  const splitEnabled = Boolean(core || analytics);
  if (role === "analytics") return splitEnabled ? (analytics || core) : legacy;
  return splitEnabled ? (core || analytics) : legacy;
}

function getScriptUrlForAction(action: string): string {
  return getScriptUrlForRole(ANALYTICS_GET_ACTIONS.has(action) ? "analytics" : "core");
}

function getMissingScriptUrlError(role: ScriptRole): Error {
  return new Error(`Google Script URL not configured for ${role}. Set EXPO_PUBLIC_GOOGLE_SCRIPT_URL or split GAS urls.`);
}

function createTimeoutController(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, cancel: () => clearTimeout(timer) };
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const shouldRetryError = (error: unknown) => RETRYABLE_ERROR_PATTERNS.some((p) => p.test(error instanceof Error ? error.message : String(error ?? "")));

function tryParseResponseText<T>(text: string): ApiResponse<T> {
  const cleanText = text.trim().replace(/^\)\]\}'\n?/, "");
  try { return JSON.parse(cleanText) as ApiResponse<T>; } catch { throw new Error(cleanText || "Invalid API response format"); }
}

async function parseApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return (await response.json()) as ApiResponse<T>;
  return tryParseResponseText<T>(await response.text());
}

function getProxyUrl(): string | null {
  if (typeof window === "undefined") return null;
  try { return new URL("/api/gas", window.location.origin).toString(); } catch { return null; }
}

async function fetchFromApi<T>(action: string, params: Record<string, string>, cacheKey: string, scriptUrl: string): Promise<T> {
  const url = new URL(scriptUrl);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k, v]) => { if (v !== "") url.searchParams.set(k, v); });

  for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    const timeout = createTimeoutController(REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url.toString(), { redirect: "follow", signal: timeout.controller.signal, cache: "no-store" });
      timeout.cancel();
      if (!response.ok) {
        const text = await response.text();
        if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < MAX_RETRY_ATTEMPTS) { await sleep(RETRY_DELAY_MS[attempt] ?? 1500); continue; }
        throw new Error(`HTTP ${response.status}: ${text || "Request failed"}`);
      }
      const json = await parseApiResponse<T>(response);
      if (!json.success) throw new Error(json.error ?? json.message ?? "Unknown API error");
      const data = json.data as T;
      setCache(cacheKey, data);
      void setStorageCache(cacheKey, data);
      return data;
    } catch (error) {
      timeout.cancel();
      const canRetry = attempt < MAX_RETRY_ATTEMPTS && shouldRetryError(error);
      if (canRetry) { await sleep(RETRY_DELAY_MS[attempt] ?? 1500); continue; }
      throw new Error(`Request failed: ${error instanceof Error ? error.message : "Network error"}`);
    }
  }
  throw new Error("Request failed after retries");
}

function backgroundRefresh<T>(action: string, params: Record<string, string>, cacheKey: string): void {
  setTimeout(() => {
    const proxyUrl = !BYPASS_PROXY_ACTIONS.has(action) ? getProxyUrl() : null;
    const url = proxyUrl ?? getScriptUrlForAction(action);
    if (!url) return;
    fetchFromApi<T>(action, params, cacheKey, url).catch((err) => log("[API] Background refresh failed:", action, err));
  }, 100);
}

export async function apiGet<T>(action: string, params: Record<string, string> = {}, useCache = true): Promise<T> {
  const cacheKey = `${action}?${JSON.stringify(params)}`;
  if (useCache) {
    const memory = getCached<T>(cacheKey);
    if (memory !== null) return memory;
    const storage = await getStorageCached<T>(cacheKey);
    if (storage !== null) { setCache(cacheKey, storage); backgroundRefresh<T>(action, params, cacheKey); return storage; }
  }

  const proxyUrl = !BYPASS_PROXY_ACTIONS.has(action) ? getProxyUrl() : null;
  if (proxyUrl) {
    try { return await fetchFromApi<T>(action, params, cacheKey, proxyUrl); } catch (err) { log("[API] CDN proxy failed:", err); }
  }

  const scriptUrl = getScriptUrlForAction(action);
  if (!scriptUrl) throw getMissingScriptUrlError(ANALYTICS_GET_ACTIONS.has(action) ? "analytics" : "core");
  return fetchFromApi<T>(action, params, cacheKey, scriptUrl);
}

export async function apiPost<T>(payload: Record<string, unknown>): Promise<T> {
  const scriptUrl = getScriptUrlForRole("core");
  if (!scriptUrl) throw getMissingScriptUrlError("core");

  for (let attempt = 0; attempt <= MAX_POST_RETRY_ATTEMPTS; attempt += 1) {
    const timeout = createTimeoutController(REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(scriptUrl, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(payload), redirect: "follow", signal: timeout.controller.signal, cache: "no-store" });
      timeout.cancel();
      if (!response.ok) {
        const text = await response.text();
        if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < MAX_POST_RETRY_ATTEMPTS) { await sleep(RETRY_DELAY_MS[attempt] ?? 1500); continue; }
        throw new Error(`HTTP ${response.status}: ${text || "Submit failed"}`);
      }
      const json = await parseApiResponse<T>(response);
      if (!json.success) throw new Error(json.error ?? json.message ?? "Submit failed");
      clearMemoryCache();
      await clearStorageApiCache();
      appCacheSnapshotMemo.clear();
      return json.data as T;
    } catch (error) {
      timeout.cancel();
      const canRetry = attempt < MAX_POST_RETRY_ATTEMPTS && shouldRetryError(error);
      if (canRetry) { await sleep(RETRY_DELAY_MS[attempt] ?? 1500); continue; }
      throw new Error(`Submit failed: ${error instanceof Error ? error.message : "Network error"}`);
    }
  }
  throw new Error("Submit failed after retries");
}

export async function apiMetaPost<T>(payload: Record<string, unknown>): Promise<T> {
  const metaAction = String(payload.metaAction ?? "").trim().toUpperCase();
  const role: ScriptRole = ANALYTICS_META_ACTIONS.has(metaAction) ? "analytics" : "core";
  const scriptUrl = getScriptUrlForRole(role);
  if (!scriptUrl) throw getMissingScriptUrlError(role);

  const timeout = createTimeoutController(REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(scriptUrl, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(payload), redirect: "follow", signal: timeout.controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text() || "Request failed"}`);
    const json = await parseApiResponse<T>(response);
    if (!json.success) throw new Error(json.error ?? json.message ?? "Request failed");
    clearMemoryCache();
    appCacheSnapshotMemo.clear();
    return json.data as T;
  } finally {
    timeout.cancel();
  }
}

function normalizeCacheKeyList(keys?: string[]): string[] {
  if (!keys?.length) return [];
  return Array.from(new Set(keys.map((k) => (k ?? "").trim()).filter(Boolean))).sort();
}

export async function getAppCacheSnapshot(keys?: string[]): Promise<Record<string, AppCacheEntry> | null> {
  const normalizedKeys = normalizeCacheKeyList(keys);
  const memoKey = normalizedKeys.length > 0 ? normalizedKeys.join("|") : "*";
  const memo = appCacheSnapshotMemo.get(memoKey);
  if (memo && Date.now() - memo.ts <= APP_CACHE_SNAPSHOT_TTL_MS) return memo.data;

  const params: Record<string, string> = {};
  if (normalizedKeys.length > 0) params.keys = normalizedKeys.join(",");
  try {
    const snapshot = await apiGet<Record<string, AppCacheEntry>>("getAppCache", params, false);
    appCacheSnapshotMemo.set(memoKey, { data: snapshot ?? {}, ts: Date.now() });
    return snapshot ?? {};
  } catch (err) {
    log("[API] getAppCache snapshot failed:", err);
    return null;
  }
}

export function readFirstCachedValue<T>(cache: Record<string, AppCacheEntry> | null, keys: string[]): T | null {
  if (!cache) return null;
  for (const key of keys) {
    const candidate = cache[key];
    if (candidate) return candidate.value as T;
  }
  return null;
}

export function collectorCacheKey(prefix: string, collectorName: string): string {
  const normalized = normalizeCollectorName(collectorName).toLowerCase().replace(/\s+/g, " ").trim();
  return `${prefix}_${normalized}`;
}

export async function warmServerCache(collectorName?: string): Promise<void> {
  const warmKey = normalizeCollectorName(collectorName ?? "").toLowerCase() || "*";
  const now = Date.now();
  if (now - (warmServerLastRunByKey.get(warmKey) ?? 0) < WARM_SERVER_MIN_INTERVAL_MS) return;
  warmServerLastRunByKey.set(warmKey, now);
  const params: Record<string, string> = { scope: "light" };
  if (collectorName?.trim()) params.collector = collectorName.trim();
  try { await apiGet("refreshCache", params, false); } catch (err) { warmServerLastRunByKey.delete(warmKey); log("[API] warmServerCache failed:", err); }
}

export function isApiConfigured(): boolean {
  return !!(getScriptUrlForRole("core") || getScriptUrlForRole("analytics"));
}

export function clearApiCache(): void {
  clearMemoryCache();
  appCacheSnapshotMemo.clear();
  _resolvedUrls = null;
}

export async function clearAllCaches(): Promise<void> {
  clearApiCache();
  await clearStorageApiCache();
}
