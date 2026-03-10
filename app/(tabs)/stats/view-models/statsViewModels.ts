import { normalizeCollectorName } from "@/utils/normalize";
import type { LeaderboardEntry, TaskActualRow, LogEntry } from "@/types";

export function deriveRegionLeaderboard(leaderboard: LeaderboardEntry[]) {
  const sf: LeaderboardEntry[] = [];
  const mx: LeaderboardEntry[] = [];
  for (const e of leaderboard) {
    if (e.region === "SF") sf.push({ ...e });
    else mx.push({ ...e, region: "MX" });
  }
  sf.sort((a, b) => b.hoursLogged - a.hoursLogged);
  mx.sort((a, b) => b.hoursLogged - a.hoursLogged);

  const sfEntries = sf.map((e, i) => ({ ...e, rank: i + 1 }));
  const mxEntries = mx.map((e, i) => ({ ...e, rank: i + 1 }));

  const mxHours = mx.reduce((s, e) => s + e.hoursLogged, 0);
  const sfHours = sf.reduce((s, e) => s + e.hoursLogged, 0);
  const mxCompleted = mx.reduce((s, e) => s + e.tasksCompleted, 0);
  const sfCompleted = sf.reduce((s, e) => s + e.tasksCompleted, 0);

  return { sfEntries, mxEntries, regionStats: { mxHours, sfHours, mxCompleted, sfCompleted } };
}

export function deriveRecommendedTasks(rows: TaskActualRow[], todayLog: LogEntry[]) {
  const DONE_STATUSES = new Set(["DONE", "COMPLETED", "COMPLETE", "CANCELED", "CANCELLED"]);
  const myTaskKeys = new Set(todayLog.map(e => normalizeCollectorName(e.taskName).toLowerCase()));
  const myActiveKeys = new Set(
    todayLog
      .filter(e => e.status === "In Progress" || e.status === "Partial")
      .map(e => normalizeCollectorName(e.taskName).toLowerCase())
  );

  const seen = new Set<string>();
  const candidates = rows
    .filter((row) => {
      const remaining = Number(row.remainingHours) || 0;
      const status = String(row.status ?? "").toUpperCase();
      if (remaining <= 0 || DONE_STATUSES.has(status)) return false;
      const key = normalizeCollectorName(String(row.taskName || "")).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((row) => {
      const remaining = Number(row.remainingHours) || 0;
      const collected = Number((row as any).collectedHours ?? (row as any).goodHours ?? 0);
      const total = remaining + collected;
      const pct = total > 0 ? collected / total : 0;
      const isRecollect = String(row.status ?? "").toUpperCase() === "RECOLLECT";
      const key = normalizeCollectorName(String(row.taskName || "")).toLowerCase();
      const isActive = myActiveKeys.has(key);
      const isMine = myTaskKeys.has(key);
      return { ...row, remaining, pct, isRecollect, isActive, isMine };
    })
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
      if (a.isRecollect !== b.isRecollect) return a.isRecollect ? -1 : 1;
      if (Math.abs(b.pct - a.pct) > 0.05) return b.pct - a.pct;
      return a.remaining - b.remaining;
    });

  const personal = candidates.filter(t => t.isMine);
  const newToThem = candidates.filter(t => !t.isMine);

  if (personal.length > 0) {
    const result = personal.slice(0, 4);
    const slots = Math.max(0, 5 - result.length);
    const worthwhile = newToThem.filter(t => t.remaining >= 1 && t.pct >= 0.5);
    return [...result, ...worthwhile.slice(0, slots)];
  }

  const actionable = newToThem.filter(t => t.remaining >= 1 && t.pct >= 0.4);
  return actionable.slice(0, 4);
}
