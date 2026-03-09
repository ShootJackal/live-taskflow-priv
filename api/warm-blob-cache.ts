/**
 * Vercel Serverless Function — called by Vercel Cron every 10 minutes.
 *
 * Fetches the most-requested GAS endpoints in parallel and writes the
 * results into Vercel Blob as public JSON files. The Expo app reads from
 * these Blob URLs first (global CDN, ~80 ms) and only falls back to GAS
 * on a cache miss.
 *
 * Environment variables required (server-side only — never EXPO_PUBLIC_):
 *   GAS_URL              Your Google Apps Script /exec URL
 *   BLOB_READ_WRITE_TOKEN  Vercel Blob read-write token (set in Vercel dashboard)
 *
 * Environment variable needed by the Expo client:
 *   EXPO_PUBLIC_BLOB_BASE_URL  The public base URL of your Blob store
 *                              (visible in Vercel → Storage → Blob → Settings)
 */

import { put } from "@vercel/blob";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const GAS_URL = process.env.GAS_URL || "";
const CACHE_PREFIX = "taskflow-cache";

// Actions to pre-fetch and their file names
const ACTIONS: { action: string; params?: Record<string, string>; file: string }[] = [
  { action: "getCollectors",     file: "collectors" },
  { action: "getTasks",          file: "tasks" },
  { action: "getLeaderboard",    params: { period: "thisWeek" }, file: "leaderboard-thisWeek" },
  { action: "getLeaderboard",    params: { period: "lastWeek" }, file: "leaderboard-lastWeek" },
  { action: "getRecollections",  file: "recollections" },
  { action: "getActiveRigsCount", file: "activeRigsCount" },
  { action: "getLiveAlerts",     file: "liveAlerts" },
];

async function fetchFromGAS(action: string, params?: Record<string, string>): Promise<unknown> {
  if (!GAS_URL) throw new Error("GAS_URL not configured");
  const url = new URL(GAS_URL);
  url.searchParams.set("action", action);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`GAS ${action} returned HTTP ${res.status}`);
  const json = await res.json() as { success?: boolean; data?: unknown } | unknown;
  // GAS wraps responses in { success, data } — unwrap
  if (json && typeof json === "object" && "data" in (json as Record<string, unknown>)) {
    return (json as { data: unknown }).data;
  }
  return json;
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  if (!GAS_URL) {
    return res.status(500).json({ error: "GAS_URL env var not set" });
  }

  const results: Record<string, "ok" | string> = {};
  const now = new Date().toISOString();

  await Promise.allSettled(
    ACTIONS.map(async ({ action, params, file }) => {
      try {
        const data = await fetchFromGAS(action, params);
        const payload = JSON.stringify({ updatedAt: now, data });

        await put(`${CACHE_PREFIX}/${file}.json`, payload, {
          access: "public",
          addRandomSuffix: false,
          contentType: "application/json",
        });

        results[file] = "ok";
      } catch (err) {
        results[file] = err instanceof Error ? err.message : String(err);
      }
    })
  );

  const failures = Object.values(results).filter((v) => v !== "ok").length;
  return res.status(failures === ACTIONS.length ? 500 : 200).json({
    updatedAt: now,
    results,
    failures,
  });
}
