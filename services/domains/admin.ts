import { AdminDashboardData, AdminStartPlanData, SubmitResponse } from "@/types";
import { apiGet, apiMetaPost, getAppCacheSnapshot, readFirstCachedValue } from "@/services/http/gasClient";

export async function fetchAdminStartPlan(): Promise<AdminStartPlanData> {
  try { return await apiGet<AdminStartPlanData>("getAdminStartPlan"); }
  catch (err) {
    const keys = ["adminStartPlan"];
    const cached = readFirstCachedValue<AdminStartPlanData>(await getAppCacheSnapshot(keys), keys);
    if (cached && typeof cached === "object") return cached;
    throw err;
  }
}

export async function fetchAdminDashboardData(): Promise<AdminDashboardData> {
  try { return await apiGet<AdminDashboardData>("getAdminDashboardData"); }
  catch (err) {
    const keys = ["adminDashboard"];
    const cached = readFirstCachedValue<AdminDashboardData>(await getAppCacheSnapshot(keys), keys);
    if (cached && typeof cached === "object") return cached;
    throw err;
  }
}

export async function adminAssignTask(payload: { collector: string; task: string; hours: number; notes?: string; rig?: string }): Promise<SubmitResponse> {
  return await apiMetaPost<SubmitResponse>({ metaAction: "ADMIN_ASSIGN_TASK", collector: String(payload.collector ?? "").trim(), task: String(payload.task ?? "").trim(), hours: Number(payload.hours ?? 0), notes: String(payload.notes ?? "").trim(), rig: String(payload.rig ?? "").trim() });
}

export async function adminCancelTask(payload: { collector: string; task: string; notes?: string; rig?: string }): Promise<SubmitResponse> {
  return await apiMetaPost<SubmitResponse>({ metaAction: "ADMIN_CANCEL_TASK", collector: String(payload.collector ?? "").trim(), task: String(payload.task ?? "").trim(), notes: String(payload.notes ?? "").trim(), rig: String(payload.rig ?? "").trim() });
}

export async function adminEditHours(payload: { collector: string; task: string; hours: number; plannedHours?: number; status?: string; notes?: string }): Promise<SubmitResponse> {
  return await apiMetaPost<SubmitResponse>({ metaAction: "ADMIN_EDIT_HOURS", collector: String(payload.collector ?? "").trim(), task: String(payload.task ?? "").trim(), hours: Number(payload.hours ?? 0), plannedHours: Number(payload.plannedHours ?? 0), status: String(payload.status ?? "").trim(), notes: String(payload.notes ?? "").trim() });
}

export async function grantCollectorAward(payload: { collector: string; award: string; pinned?: boolean; grantedBy?: string; notes?: string }): Promise<void> {
  await apiMetaPost<Record<string, unknown>>({ metaAction: "GRANT_AWARD", collector: String(payload.collector ?? "").trim(), award: String(payload.award ?? "").trim(), pinned: !!payload.pinned, grantedBy: String(payload.grantedBy ?? "").trim(), notes: String(payload.notes ?? "").trim() });
}

export async function reportDailyCarryover(payload: { collector: string; task: string; assignmentId: string; actualHours?: number; notes?: string }): Promise<SubmitResponse> {
  return await apiMetaPost<SubmitResponse>({ metaAction: "CARRYOVER_REPORT", collector: String(payload.collector ?? "").trim(), task: String(payload.task ?? "").trim(), assignmentId: String(payload.assignmentId ?? "").trim(), actualHours: Number(payload.actualHours ?? 0), notes: String(payload.notes ?? "").trim() });
}

export async function cancelDailyCarryover(payload: { collector: string; task: string; assignmentId: string; notes?: string }): Promise<SubmitResponse> {
  return await apiMetaPost<SubmitResponse>({ metaAction: "CARRYOVER_CANCEL", collector: String(payload.collector ?? "").trim(), task: String(payload.task ?? "").trim(), assignmentId: String(payload.assignmentId ?? "").trim(), notes: String(payload.notes ?? "").trim() });
}

export async function forceServerRepull(options?: { collector?: string; scope?: "light" | "full"; reason?: string }): Promise<Record<string, unknown>> {
  const params: Record<string, string> = {};
  const collector = String(options?.collector ?? "").trim();
  if (collector) params.collector = collector;
  params.scope = options?.scope === "light" ? "light" : "full";
  const reason = String(options?.reason ?? "").trim();
  if (reason) params.reason = reason;
  return await apiGet<Record<string, unknown>>("forceServerRepull", params, false);
}
