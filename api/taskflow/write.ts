import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { IDEMPOTENCY_TTL_SECONDS } from "./_lib/constants";
import { submitGasWrite } from "./_lib/gas";
import { appendEvent, getJson, hasUpstashConfigured, setJson } from "./_lib/upstash";

interface WriteBody {
  action: string;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const body = (req.body ?? {}) as WriteBody;
  const idempotencyKey =
    String(req.headers["x-idempotency-key"] ?? body.idempotencyKey ?? "").trim();

  if (!body.action) {
    return res.status(400).json({ success: false, error: "Missing action" });
  }
  if (!idempotencyKey) {
    return res.status(400).json({ success: false, error: "Missing idempotency key" });
  }

  const requestId = randomUUID();
  const idempotencyCacheKey = `taskflow:idempotency:${idempotencyKey}`;

  try {
    if (hasUpstashConfigured()) {
      const existing = await getJson<unknown>(idempotencyCacheKey);
      if (existing !== null) {
        return res.status(200).json({ success: true, replay: true, requestId, data: existing });
      }
    }

    const gasPayload = {
      action: body.action,
      ...(body.payload ?? {}),
    };

    const response = await submitGasWrite<unknown>(gasPayload);
    if (!response.success) {
      return res.status(502).json({ success: false, error: response.error ?? "Write failed" });
    }

    if (hasUpstashConfigured()) {
      await setJson(idempotencyCacheKey, response.data ?? null, IDEMPOTENCY_TTL_SECONDS);
      await appendEvent("taskflow:events:writes", {
        requestId,
        idempotencyKey,
        action: body.action,
        payload: body.payload ?? {},
        response: response.data ?? null,
        at: new Date().toISOString(),
      });
    }

    return res.status(200).json({ success: true, replay: false, requestId, data: response.data ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown write proxy error";
    return res.status(502).json({ success: false, error: message });
  }
}
