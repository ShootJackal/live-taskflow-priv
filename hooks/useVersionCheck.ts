import { useEffect, useRef, useState, useCallback } from "react";
import { Platform } from "react-native";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const VERSION_URL = "/version.json";

interface VersionInfo {
  version: string;
  buildTime: string;
}

async function fetchVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data: VersionInfo = await res.json();
    return data.version ?? null;
  } catch {
    return null;
  }
}

export function useVersionCheck() {
  const launchVersion = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const reload = useCallback(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      // Navigate to root instead of reloading current URL.
      // Deep paths like /live would 404 on a hard reload since this is a SPA
      // with only index.html — going to / is always safe and re-runs the boot.
      window.location.href = "/";
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    mountedRef.current = true;

    // Record the version this session launched with, then start polling.
    fetchVersion().then((v) => {
      if (!mountedRef.current) return;
      launchVersion.current = v;

      timerRef.current = setInterval(async () => {
        if (!mountedRef.current) return;
        const latest = await fetchVersion();
        if (
          mountedRef.current &&
          latest &&
          launchVersion.current &&
          latest !== launchVersion.current
        ) {
          setUpdateAvailable(true);
          // Stop polling — we already know there's an update
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      }, POLL_INTERVAL_MS);
    });

    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { updateAvailable, reload };
}
