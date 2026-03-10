import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  clearAdminCookie,
  readAdminTokenFromRequest,
  verifyAdminSessionToken,
} from "../_lib/adminAuth";

const ALLOWED_META_ACTIONS = new Set([
  "ADMIN_ASSIGN_TASK",
  "ADMIN_CANCEL_TASK",
  "ADMIN_EDIT_HOURS",
  "GRANT_AWARD",
  "CARRYOVER_REPORT",
  "CARRYOVER_CANCEL",
  "FORCE_SERVER_REPULL",
  "PUSH_ALERT",
  "CLEAR_ALL_ALERTS",
]);

function getGasUrl(): string {
  const gasUrl = (
    process.env.GAS_SCRIPT_URL?.trim() ??
    process.env.EXPO_PUBLIC_GAS_CORE_URL?.trim() ??
    process.env.EXPO_PUBLIC_GOOGLE_SCRIPT_URL?.trim() ??
    ""
  );
  if (!gasUrl || !gasUrl.includes("/exec")) {
    throw new Error("GAS endpoint not configured. Set GAS_SCRIPT_URL in server environment variables.");
  }
  return gasUrl;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const token = readAdminTokenFromRequest(req);
  const payload = verifyAdminSessionToken(token);
  if (!payload) {
    res.setHeader("Set-Cookie", clearAdminCookie());
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  const body = req.body as Record<string, unknown>;
  const metaAction = String(body?.metaAction ?? "").trim().toUpperCase();
  if (!metaAction || !ALLOWED_META_ACTIONS.has(metaAction)) {
    return res.status(400).json({ success: false, error: "Unsupported admin action" });
  }

  try {
    const upstream = await fetch(getGasUrl(), {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ ...body, metaAction }),
      redirect: "follow",
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ success: false, error: text || "Admin action failed" });
    }

    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Admin action failed";
    return res.status(502).json({ success: false, error: message });
  }
}
