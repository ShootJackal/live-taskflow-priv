import { useState, useEffect, useCallback, useMemo } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { LightTheme, DarkTheme, FrostedGlassTheme, TintedGlassTheme, ThemeColors } from "@/constants/colors";

export type ThemeMode = "light" | "dark" | "frosted" | "tinted" | "system";

const THEME_KEY = "ci_theme_mode";

const THEME_ORDER: ThemeMode[] = ["light", "dark", "frosted", "tinted"];

const THEME_MAP: Record<Exclude<ThemeMode, "system">, ThemeColors> = {
  light: LightTheme,
  dark: DarkTheme,
  frosted: FrostedGlassTheme,
  tinted: TintedGlassTheme,
};

export const THEME_META: Record<Exclude<ThemeMode, "system">, { label: string; icon: string; dark: boolean }> = {
  light: { label: "Light", icon: "sun", dark: false },
  dark: { label: "Dark", icon: "moon", dark: true },
  frosted: { label: "Frosted Glass", icon: "snowflake", dark: false },
  tinted: { label: "Tinted Glass", icon: "glasses", dark: true },
};

export const [ThemeProvider, useTheme] = createContextHook(() => {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>("system");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((stored) => {
      if (stored === "light" || stored === "dark" || stored === "frosted" || stored === "tinted" || stored === "system") {
        setMode(stored);
      }
      setLoaded(true);
    });
  }, []);

  const resolvedMode = useMemo((): Exclude<ThemeMode, "system"> => {
    if (mode === "system") return systemScheme === "dark" ? "dark" : "light";
    return mode;
  }, [mode, systemScheme]);

  const isDark = useMemo(() => {
    return THEME_META[resolvedMode].dark;
  }, [resolvedMode]);

  const colors = useMemo<ThemeColors>(() => {
    return THEME_MAP[resolvedMode];
  }, [resolvedMode]);

  const setThemeMode = useCallback(async (newMode: ThemeMode) => {
    setMode(newMode);
    await AsyncStorage.setItem(THEME_KEY, newMode);
  }, []);

  const toggleTheme = useCallback(async () => {
    const currentIndex = THEME_ORDER.indexOf(resolvedMode);
    const nextIndex = (currentIndex + 1) % THEME_ORDER.length;
    await setThemeMode(THEME_ORDER[nextIndex]);
  }, [resolvedMode, setThemeMode]);

  return {
    mode,
    resolvedMode,
    isDark,
    colors,
    loaded,
    setThemeMode,
    toggleTheme,
  };
});
