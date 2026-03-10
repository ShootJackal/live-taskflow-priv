import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "node:crypto";
import {
  BLOCKED_ACTIONS,
  READ_ACTION_ALIASES,
  READ_CACHE_TTL_SECONDS,
  READ_HEAVY_ACTIONS,
} from "./_lib/constants";
import { fetchGasRead } from "./_lib/gas";
import { getJson, hasUpstashConfigured, setJson } from "./_lib/upstash";

function normalizeAction(raw: string): string {
  const trimmed = raw.trim();
  return READ_ACTION_ALIASES[trimmed] ?? trimmed;
}

function makeCacheKey(action: string, params: Record<string, string>): string {
  const serialized = JSON.stringify(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));
  const digest = createHash("sha1").update(serialized).digest("hex");
  return `taskflow:read:${action}:${digest}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" });

  const action = normalizeAction(String(req.query.action ?? ""));
  if (!action) return res.status(400).json({ success: false, error: "Missing action parameter" });
  if (BLOCKED_ACTIONS.has(action)) {
    return res.status(403).json({ success: false, error: "Write actions belong on /api/taskflow/write" });
  }

  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.query)) {
    if (k === "action" || k === "_vercel_no_cache") continue;
    params[k] = Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
  }

  const isHeavyRead = READ_HEAVY_ACTIONS.has(action);
  const ttl = READ_CACHE_TTL_SECONDS[action] ?? 30;

  try {
    if (isHeavyRead && hasUpstashConfigured()) {
      const key = makeCacheKey(action, params);
      const cached = await getJson<unknown>(key);
      if (cached !== null) {
        res.setHeader("x-taskflow-cache", "hit");
        res.setHeader("Cache-Control", `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 5}`);
        return res.status(200).json({ success: true, data: cached, source: "upstash" });
      }

      const upstream = await fetchGasRead<unknown>(action, params);
      if (!upstream.success) {
        return res.status(502).json({ success: false, error: upstream.error ?? "Upstream error" });
      }

      await setJson(key, upstream.data, Math.max(ttl * 10, 120));
      res.setHeader("x-taskflow-cache", "miss");
      res.setHeader("Cache-Control", `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 5}`);
      return res.status(200).json({ success: true, data: upstream.data, source: "gas" });
    }

    const upstream = await fetchGasRead<unknown>(action, params);
    res.setHeader("Cache-Control", `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 5}`);
    return res.status(200).json(upstream);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown proxy error";
    return res.status(502).json({ success: false, error: message });
  }
}
