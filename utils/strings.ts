/**
 * Strips parenthetical suffixes from collector names.
 * e.g. "Jane Smith (MX)" → "Jane Smith"
 * Used in every screen and in the CollectionProvider.
 */
export function normalizeCollectorName(name: string): string {
  return (name ?? "").replace(/\s*\(.*?\)\s*$/g, "").trim();
}
