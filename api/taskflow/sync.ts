import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "node:crypto";
import { READ_CACHE_TTL_SECONDS } from "./_lib/constants";
import { fetchGasRead } from "./_lib/gas";
import { setJson } from "./_lib/upstash";

const SYNC_ACTIONS = ["getLeaderboard", "getAdminDashboardData", "getTaskActualsSheet"];

function makeCacheKey(action: string): string {
  const digest = createHash("sha1").update(JSON.stringify([])).digest("hex");
  return `taskflow:read:${action}:${digest}`;
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const results: Array<{ action: string; ok: boolean; error?: string }> = [];

  for (const action of SYNC_ACTIONS) {
    try {
      const upstream = await fetchGasRead<unknown>(action, {});
      if (!upstream.success) {
        results.push({ action, ok: false, error: upstream.error ?? "Upstream error" });
        continue;
      }
      const key = makeCacheKey(action);
      await setJson(key, upstream.data, Math.max((READ_CACHE_TTL_SECONDS[action] ?? 60) * 10, 120));
      results.push({ action, ok: true });
    } catch (error) {
      results.push({ action, ok: false, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  return res.status(200).json({ success: results.every((r) => r.ok), results });
}
