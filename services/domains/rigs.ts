import { RigAssignment, RigStatus, RigSwitchRequest } from "@/types";
import { apiGet, apiMetaPost } from "@/services/http/gasClient";

export async function fetchRigStatus(): Promise<RigStatus[]> {
  return await apiGet<RigStatus[]>("getRigStatus", {}, false);
}

export async function assignRigSOD(payload: { collector: string; rig: number }): Promise<RigAssignment> {
  return await apiMetaPost<RigAssignment>({ metaAction: "ASSIGN_RIG_SOD", collector: String(payload.collector ?? "").trim(), rig: payload.rig });
}

export async function releaseRig(payload: { assignmentId: string; reason?: string }): Promise<{ message: string; hours?: number }> {
  return await apiMetaPost({ metaAction: "RELEASE_RIG", assignmentId: String(payload.assignmentId ?? "").trim(), reason: String(payload.reason ?? "MANUAL").trim() });
}

export async function requestRigSwitch(payload: { requestingCollector: string; rig: number }): Promise<{ assignmentId: string; currentAssignee: string; message: string }> {
  return await apiMetaPost({ metaAction: "REQUEST_RIG_SWITCH", requestingCollector: String(payload.requestingCollector ?? "").trim(), rig: payload.rig });
}

export async function respondRigSwitch(payload: { assignmentId: string; action: "APPROVE" | "DENY" }): Promise<{ result: string; message: string }> {
  return await apiMetaPost({ metaAction: "RESPOND_RIG_SWITCH", assignmentId: String(payload.assignmentId ?? "").trim(), action: payload.action });
}

export async function fetchPendingSwitchRequests(collectorName: string): Promise<RigSwitchRequest[]> {
  if (!collectorName) return [];
  return await apiGet<RigSwitchRequest[]>("getPendingSwitchRequests", { collector: collectorName }, false);
}
