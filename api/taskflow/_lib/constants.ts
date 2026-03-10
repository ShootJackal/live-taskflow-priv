export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export const READ_HEAVY_ACTIONS = new Set([
  "getLeaderboard",
  "getCollectorStats",
  "getAdminDashboardData",
  "getTaskActualsSheet",
]);

export const READ_ACTION_ALIASES: Record<string, string> = {
  leaderboard: "getLeaderboard",
  "collector-stats": "getCollectorStats",
  dashboard: "getAdminDashboardData",
  "task-actuals": "getTaskActualsSheet",
};

export const BLOCKED_ACTIONS = new Set([
  "submitAction",
  "authenticateAdmin",
  "pushLiveAlert",
  "adminAssignTask",
  "adminCancelTask",
  "adminEditHours",
  "grantCollectorAward",
  "reportDailyCarryover",
  "cancelDailyCarryover",
  "metaAction",
]);

export const READ_CACHE_TTL_SECONDS: Record<string, number> = {
  getLeaderboard: 120,
  getCollectorStats: 120,
  getAdminDashboardData: 60,
  getTaskActualsSheet: 60,
};

export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
