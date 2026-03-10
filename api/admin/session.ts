import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  clearAdminCookie,
  readAdminTokenFromRequest,
  verifyAdminSessionToken,
} from "../_lib/adminAuth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const token = readAdminTokenFromRequest(req);
    const payload = verifyAdminSessionToken(token);
    if (!payload) {
      res.setHeader("Set-Cookie", clearAdminCookie());
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    return res.status(200).json({ success: true, expiresAt: payload.exp });
  } catch {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
}
