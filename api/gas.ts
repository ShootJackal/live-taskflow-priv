/**
 * Vercel Serverless Function: /api/gas
 *
 * Acts as a CDN-caching proxy between the browser and Google Apps Script.
 * Browser → /api/gas (Vercel edge CDN) → GAS (Google)
 *
 * Benefits:
 *  - GAS URL never appears in the client JS bundle (read from server-side env var)
 *  - Responses are cached at Vercel's global CDN edge per action + collector
 *  - GAS cold starts only affect the first request after a cache miss, not every user
 *  - stale-while-revalidate means users see instant responses even while GAS refreshes
 *
 * Required env var (set in Vercel project settings, NOT prefixed EXPO_PUBLIC_):
 *   GAS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
 *
 * Falls back to EXPO_PUBLIC_GOOGLE_SCRIPT_URL if GAS_SCRIPT_URL is absent.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

// CDN s-maxage (seconds) per action. stale-while-revalidate = TTL × 5.
// 0 = no CDN cache (request always passes through to GAS).
const CACHE_TTL: Record<string, number> = {
  getCollectors:          300,  // 5 min — collector list changes rarely
  getTasks:               300,  // 5 min — task list changes rarely
  getLeaderboard:         120,  // 2 min — updated after each submission
  getCollectorStats:      120,  // 2 min
  getTaskActualsSheet:     60,  // 1 min — Redash sync updates this
  getAdminDashboardData:   60,  // 1 min
  getFullLog:              60,  // 1 min
  getRecollections:        60,  // 1 min
  getActiveRigsCount:      60,  // 1 min
  getCollectorProfile:     60,  // 1 min
  getAdminStartPlan:       60,  // 1 min
  getAppCache:             20,  // 20 s — GAS internal cache snapshot
  getLiveAlerts:           20,  // 20 s — real-time alerts need freshness
  getTodayLog:             20,  // 20 s — per-collector, params make cache key unique
  getDailyCarryover:       20,  // 20 s — per-collector
  getPendingReview:        20,  // 20 s
  refreshCache:             0,  // always pass-through; used for warm pings
};

// Write/admin actions that must never be routed through this proxy.
// They all use POST bodies, not GET params, so they'd fail here anyway.
const BLOCKED_ACTIONS = new Set([
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
  "SET_RIG",
  "PUSH_ALERT",
  "ADMIN_ASSIGN_TASK",
  "ADMIN_CANCEL_TASK",
  "ADMIN_EDIT_HOURS",
  "GRANT_AWARD",
  "CARRYOVER_REPORT",
  "CARRYOVER_CANCEL",
  "FORCE_SERVER_REPULL",
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const action = String(req.query.action ?? "").trim();
  if (!action) {
    return res.status(400).json({ success: false, error: "Missing action parameter" });
  }
  if (BLOCKED_ACTIONS.has(action)) {
    return res.status(403).json({ success: false, error: "Write actions must be sent directly to GAS" });
  }

  const gasUrl = (
    process.env.GAS_SCRIPT_URL?.trim() ??
    process.env.EXPO_PUBLIC_GOOGLE_SCRIPT_URL?.trim() ??
    ""
  );
  if (!gasUrl || !gasUrl.includes("/exec")) {
    return res.status(503).json({ success: false, error: "GAS endpoint not configured (set GAS_SCRIPT_URL in Vercel)" });
  }

  try {
    const url = new URL(gasUrl);
    // Forward all client query params verbatim — CDN cache key includes them,
    // so per-collector calls (getTodayLog?collector=Alice) are cached independently.
    for (const [k, v] of Object.entries(req.query)) {
      if (k === "_vercel_no_cache") continue;
      url.searchParams.set(k, String(Array.isArray(v) ? v[0] : (v ?? "")));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let upstream: Response;
    try {
      upstream = await fetch(url.toString(), {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const body = await upstream.text();

    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .json({ success: false, error: body.slice(0, 300) || "GAS returned an error" });
    }

    const ttl = CACHE_TTL[action] ?? 30;
    res.setHeader(
      "Cache-Control",
      ttl > 0
        ? `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 5}`
        : "no-store, max-age=0"
    );
    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? "unknown");
    return res.status(502).json({ success: false, error: `Proxy error: ${msg}` });
  }
}
