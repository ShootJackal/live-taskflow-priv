export const ANALYTICS_GET_ACTIONS = new Set<string>([
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

export const ANALYTICS_META_ACTIONS = new Set<string>(["FORCE_SERVER_REPULL"]);

export const BYPASS_PROXY_ACTIONS = new Set([
  "refreshCache",
  "forceServerRepull",
  "getAppCache",
  "getRigStatus",
  "getPendingSwitchRequests",
]);
