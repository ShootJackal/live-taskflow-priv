export const COMPLETED_TASK_STATUSES = new Set([
  "DONE", "COMPLETED", "COMPLETE", "FINISHED", "CLOSED",
]);
export const RECOLLECT_TASK_STATUSES = new Set([
  "RECOLLECT", "NEEDS_RECOLLECTION", "NEEDS_RECOLLECT", "RECOLLECTION",
]);
export const OPEN_TASK_STATUSES = new Set([
  "IN_PROGRESS", "INPROGRESS", "ACTIVE", "IP", "OPEN", "PARTIAL", "ASSIGNED", "IN_QUEUE",
]);

export function normalizeTaskStatus(status: string): string {
  return String(status ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

export function buildRigSortValue(rig: string): [number, string] {
  const clean = String(rig ?? "").trim();
  const match = clean.match(/(\d+)(?!.*\d)/);
  const numberPart = match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  return [Number.isFinite(numberPart) ? numberPart : Number.MAX_SAFE_INTEGER, clean.toLowerCase()];
}

export const SHEET_PAGES = [
  { id: "log", label: "Assignment Log", desc: "View task assignment history" },
  { id: "taskActuals", label: "Task Actuals", desc: "Collection progress by task" },
] as const;

export const AWARD_OPTIONS = [
  "Iron Consistency",
  "Speed Runner",
  "Long Session Pro",
  "Zero Downtime",
  "Quality King/Queen",
  "Team MVP",
];
