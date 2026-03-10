import { SubmitPayload } from "@/types";

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

const ANALYTICS_META_ACTIONS = new Set<string>(["FORCE_SERVER_REPULL"]);

type ScriptRole = "core" | "analytics";

export function normalizeScriptUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^['\"]|['\"]$/g, "");
  if (!trimmed) return "";
  if (trimmed.endsWith("/exec")) return trimmed;
  if (/\/macros\/s\//.test(trimmed) && !trimmed.endsWith("/exec")) {
    return `${trimmed.replace(/\/$/, "")}/exec`;
  }
  return trimmed;
}

export function isValidScriptUrl(url: string): boolean {
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

export function getRoleForGetAction(action: string): ScriptRole {
  return ANALYTICS_GET_ACTIONS.has(action) ? "analytics" : "core";
}

export function getRoleForMetaAction(metaAction: string): ScriptRole {
  const clean = String(metaAction ?? "").trim().toUpperCase();
  return ANALYTICS_META_ACTIONS.has(clean) ? "analytics" : "core";
}

export function buildGetActionUrl(scriptUrl: string, action: string, params: Record<string, string>): string {
  const url = new URL(scriptUrl);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== "") url.searchParams.set(k, v);
  });
  return url.toString();
}

export function buildSubmitActionContract(payload: SubmitPayload): SubmitPayload {
  return { ...payload };
}

export function buildAdminAssignTaskContract(payload: {
  collector: string;
  task: string;
  hours: number;
  notes?: string;
  rig?: string;
}): Record<string, unknown> {
  return {
    metaAction: "ADMIN_ASSIGN_TASK",
    collector: String(payload.collector ?? "").trim(),
    task: String(payload.task ?? "").trim(),
    hours: Number(payload.hours ?? 0),
    notes: String(payload.notes ?? "").trim(),
    rig: String(payload.rig ?? "").trim(),
  };
}

export function buildAdminCancelTaskContract(payload: {
  collector: string;
  task: string;
  notes?: string;
  rig?: string;
}): Record<string, unknown> {
  return {
    metaAction: "ADMIN_CANCEL_TASK",
    collector: String(payload.collector ?? "").trim(),
    task: String(payload.task ?? "").trim(),
    notes: String(payload.notes ?? "").trim(),
    rig: String(payload.rig ?? "").trim(),
  };
}

export function buildAdminEditHoursContract(payload: {
  collector: string;
  task: string;
  hours: number;
  plannedHours?: number;
  status?: string;
  notes?: string;
}): Record<string, unknown> {
  return {
    metaAction: "ADMIN_EDIT_HOURS",
    collector: String(payload.collector ?? "").trim(),
    task: String(payload.task ?? "").trim(),
    hours: Number(payload.hours ?? 0),
    plannedHours: Number(payload.plannedHours ?? 0),
    status: String(payload.status ?? "").trim(),
    notes: String(payload.notes ?? "").trim(),
  };
}
