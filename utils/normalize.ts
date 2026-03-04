export function normalizeCollectorName(name: string): string {
  return (name ?? "").replace(/\s*\(.*?\)\s*$/g, "").trim();
}
