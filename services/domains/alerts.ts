import { LiveAlert } from "@/types";
import { apiGet, apiMetaPost, getAppCacheSnapshot, readFirstCachedValue } from "@/services/http/gasClient";

export async function fetchLiveAlerts(): Promise<LiveAlert[]> {
  try { return await apiGet<LiveAlert[]>("getLiveAlerts"); }
  catch (err) {
    const keys = ["liveAlerts"];
    const cached = readFirstCachedValue<LiveAlert[]>(await getAppCacheSnapshot(keys), keys);
    if (Array.isArray(cached)) return cached;
    throw err;
  }
}

export async function pushLiveAlert(payload: { message: string; level?: string; target?: string; createdBy?: string; expiryHours?: number }): Promise<void> {
  await apiMetaPost<Record<string, unknown>>({
    metaAction: "PUSH_ALERT",
    message: String(payload.message ?? "").trim(),
    level: String(payload.level ?? "INFO").trim(),
    target: String(payload.target ?? "ALL").trim(),
    createdBy: String(payload.createdBy ?? "").trim(),
    ...(payload.expiryHours && payload.expiryHours > 0 ? { expiryHours: payload.expiryHours } : {}),
  });
}

export async function clearAllAlerts(): Promise<void> {
  await apiMetaPost<Record<string, unknown>>({ metaAction: "CLEAR_ALL_ALERTS" });
}
