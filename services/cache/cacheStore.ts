import AsyncStorage from "@react-native-async-storage/async-storage";
import { log } from "@/utils/logger";

const STORAGE_PREFIX = "tf_cache_";

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

const memoryCache = new Map<string, { data: unknown; ts: number }>();

export function getCached<T>(key: string): T | null {
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

export function setCache(key: string, data: unknown): void {
  memoryCache.set(key, { data, ts: Date.now() });
}

export async function getStorageCached<T>(key: string): Promise<T | null> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_PREFIX + key);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { data: T; ts: number };
    const action = key.split("?")[0];
    const ttl = STORAGE_TTL_MS[action] ?? 5 * 60 * 1000;
    if (Date.now() - parsed.ts > ttl) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function setStorageCache(key: string, data: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
  } catch (err) {
    log("[Cache] AsyncStorage write failed:", err);
  }
}

export function clearMemoryCache(): void {
  memoryCache.clear();
}

export async function clearStorageApiCache(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const cacheKeys = keys.filter((k) => k.startsWith(STORAGE_PREFIX));
  if (cacheKeys.length > 0) await AsyncStorage.multiRemove(cacheKeys);
}
