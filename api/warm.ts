/**
 * Vercel Cron Function: /api/warm
 *
 * Runs every 5 minutes (see vercel.json crons) to keep the Google Apps Script
 * runtime hot. GAS cold starts add 3-8 seconds to the first request after a
 * period of inactivity; this cron eliminates that delay for active users.
 *
 * Schedule: every 5 minutes, 24/7  (cron: "* /5 * * * *" without the space)
 *
 * This function always returns HTTP 200 so Vercel doesn't mark the cron as
 * failed even when GAS itself returns an error.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const gasUrl = (
    process.env.GAS_SCRIPT_URL?.trim() ??
    process.env.EXPO_PUBLIC_GOOGLE_SCRIPT_URL?.trim() ??
    ""
  );

  if (!gasUrl || !gasUrl.includes("/exec")) {
    return res.status(200).json({ skipped: true, reason: "GAS_SCRIPT_URL not configured" });
  }

  const started = Date.now();
  try {
    const url = new URL(gasUrl);
    url.searchParams.set("action", "refreshCache");
    url.searchParams.set("scope", "light");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const body = await response.text();
    return res.status(200).json({
      warmed: response.ok,
      status: response.status,
      ms: Date.now() - started,
      preview: body.slice(0, 200),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    return res.status(200).json({ warmed: false, ms: Date.now() - started, error: msg });
  }
}
