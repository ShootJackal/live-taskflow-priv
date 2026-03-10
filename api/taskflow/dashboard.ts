import type { VercelRequest, VercelResponse } from "@vercel/node";
import readHandler from "./read";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  req.query.action = "dashboard";
  return readHandler(req, res);
}
