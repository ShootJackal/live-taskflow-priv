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
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const reload = useCallback(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.reload();
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    let timer: ReturnType<typeof setInterval>;

    const init = async () => {
      const v = await fetchVersion();
      launchVersion.current = v;

      timer = setInterval(async () => {
        const latest = await fetchVersion();
        if (
          latest &&
          launchVersion.current &&
          latest !== launchVersion.current
        ) {
          setUpdateAvailable(true);
          clearInterval(timer); // stop polling once we know there's an update
        }
      }, POLL_INTERVAL_MS);
    };

    void init();
    return () => clearInterval(timer);
  }, []);

  return { updateAvailable, reload };
}
