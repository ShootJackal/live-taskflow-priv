import { Platform } from "react-native";

/**
 * Navigates to the app root — always safe on web because the SPA has a
 * single index.html. Use this instead of window.location.reload() anywhere
 * in the app to avoid 404s when the current URL is a deep path like /live.
 *
 * On native this is a no-op (native apps don't have the reload concept).
 */
export function reloadApp(): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  window.location.href = "/";
}

/**
 * Returns true when the app was launched at a deep path (e.g. /live).
 * Used to detect if the user somehow bypassed the root entry point.
 */
export function isDeepLinked(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  const path = window.location.pathname;
  return path !== "/" && path !== "";
}
