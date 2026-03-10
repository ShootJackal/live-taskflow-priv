/**
 * Vercel Cron Function: /api/warm
 *
 * Pings every configured GAS endpoint every 5 minutes to keep the script
 * runtimes hot. Supports both monolith and split-endpoint deployments.
 *
 * Priority order for URLs:
 *   1. GAS_SCRIPT_URL        — server-side monolith (preferred, not in bundle)
 *   2. EXPO_PUBLIC_GAS_CORE_URL      — split mode core script
 *   3. EXPO_PUBLIC_GAS_ANALYTICS_URL — split mode analytics script
 *   4. EXPO_PUBLIC_GOOGLE_SCRIPT_URL — legacy monolith fallback
 *
 * Deduplicates URLs so the same script is never pinged twice.
 * Always returns HTTP 200 — Vercel must not mark a cron as failed.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

function isValidGasUrl(url: string | undefined): url is string {
  const s = url?.trim() ?? "";
  return s.includes("/exec");
}

async function warmUrl(
  url: string,
  timeout: number
): Promise<{ url: string; ok: boolean; status?: number; ms: number; error?: string }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const target = new URL(url);
    target.searchParams.set("action", "refreshCache");
    target.searchParams.set("scope", "light");

    const response = await fetch(target.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    await response.text();
    return { url, ok: response.ok, status: response.status, ms: Date.now() - started };
  } catch (err) {
    return { url, ok: false, ms: Date.now() - started, error: err instanceof Error ? err.message : String(err ?? "") };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  // Collect all configured GAS URLs and deduplicate.
  const candidates = [
    process.env.GAS_SCRIPT_URL,
    process.env.EXPO_PUBLIC_GAS_CORE_URL,
    process.env.EXPO_PUBLIC_GAS_ANALYTICS_URL,
    process.env.EXPO_PUBLIC_GOOGLE_SCRIPT_URL,
  ];

  const seen = new Set<string>();
  const urls: string[] = [];
  for (const c of candidates) {
    if (isValidGasUrl(c) && !seen.has(c.trim())) {
      seen.add(c.trim());
      urls.push(c.trim());
    }
  }

  if (urls.length === 0) {
    return res.status(200).json({ skipped: true, reason: "No GAS URLs configured" });
  }

  const results = await Promise.all(urls.map((u) => warmUrl(u, 25000)));
  const anyWarmed = results.some((r) => r.ok);

  return res.status(200).json({ warmed: anyWarmed, results });
}
