import type { ApiEnvelope } from "./constants";

function getGasUrl(): string {
  const gasUrl =
    process.env.GAS_SCRIPT_URL?.trim() ??
    process.env.EXPO_PUBLIC_GAS_CORE_URL?.trim() ??
    process.env.EXPO_PUBLIC_GOOGLE_SCRIPT_URL?.trim() ??
    "";

  if (!gasUrl || !gasUrl.includes("/exec")) {
    throw new Error("GAS endpoint not configured");
  }
  return gasUrl;
}

export async function fetchGasRead<T>(
  action: string,
  params: Record<string, string>
): Promise<ApiEnvelope<T>> {
  const url = new URL(getGasUrl());
  url.searchParams.set("action", action);
  for (const [k, v] of Object.entries(params)) {
    if (v !== "") url.searchParams.set(k, v);
  }

  const response = await fetch(url.toString(), { method: "GET", redirect: "follow" });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `GAS read failed (${response.status})`);
  }

  return JSON.parse(text) as ApiEnvelope<T>;
}

export async function submitGasWrite<T>(payload: unknown): Promise<ApiEnvelope<T>> {
  const response = await fetch(getGasUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `GAS write failed (${response.status})`);
  }

  return JSON.parse(text) as ApiEnvelope<T>;
}
