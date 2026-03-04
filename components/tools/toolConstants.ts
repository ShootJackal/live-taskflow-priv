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

export const TIMER_OPTIONS = [
  { mins: 5, label: "5 min", color: "#5EBD8A" },
  { mins: 10, label: "10 min", color: "#4A6FA5" },
  { mins: 15, label: "15 min", color: "#7C3AED" },
  { mins: 20, label: "20 min", color: "#D4A843" },
  { mins: 25, label: "25 min", color: "#C47A3A" },
  { mins: 30, label: "30 min", color: "#C53030" },
  { mins: 45, label: "45 min", color: "#6B21A8" },
  { mins: 60, label: "60 min", color: "#1D4ED8" },
];

export const AWARD_OPTIONS = [
  "Iron Consistency",
  "Speed Runner",
  "Long Session Pro",
  "Zero Downtime",
  "Quality King/Queen",
  "Team MVP",
];
