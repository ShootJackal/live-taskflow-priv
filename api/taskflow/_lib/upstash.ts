const token = process.env.egostorage_KV_REST_API_TOKEN?.trim() ?? "";
const baseUrl = process.env.egostorage_KV_REST_API_URL?.trim().replace(/\/$/, "") ?? "";

function enabled(): boolean {
  return Boolean(token && baseUrl);
}

async function command<T>(...parts: (string | number)[]): Promise<T | null> {
  if (!enabled()) return null;

  const response = await fetch(`${baseUrl}/${parts.map((p) => encodeURIComponent(String(p))).join("/")}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Upstash command failed (${response.status})`);
  }

  const body = (await response.json()) as { result?: T };
  return body.result ?? null;
}

export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await command<string>("get", key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

export async function setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await command("set", key, JSON.stringify(value), "EX", ttlSeconds);
}

export async function appendEvent(streamKey: string, event: unknown): Promise<void> {
  await command("xadd", streamKey, "*", "event", JSON.stringify(event));
}

export function hasUpstashConfigured(): boolean {
  return enabled();
}
