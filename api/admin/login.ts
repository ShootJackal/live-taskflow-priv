import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createAdminCookie,
  createAdminSessionToken,
  getRequiredAdminSecret,
} from "../_lib/adminAuth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const secret = getRequiredAdminSecret();
    const password = String(req.body?.password ?? "").trim();
    if (!password || password !== secret) {
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    }

    const { token, expiresAt } = createAdminSessionToken();
    res.setHeader("Set-Cookie", createAdminCookie(token));
    return res.status(200).json({ success: true, token, expiresAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed";
    return res.status(500).json({ success: false, error: message });
  }
}
