// Temporary compatibility facade. Prefer importing from domain modules directly.
export * from "@/services/domains/collectors";
export * from "@/services/domains/tasks";
export * from "@/services/domains/alerts";
export * from "@/services/domains/rigs";
export * from "@/services/domains/admin";
export * from "@/services/domains/analytics";
export { clearApiCache, clearAllCaches, isApiConfigured, warmServerCache } from "@/services/http/gasClient";
