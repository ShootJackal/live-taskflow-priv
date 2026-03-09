import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, StyleSheet, Animated, ActivityIndicator, Platform } from "react-native";
import { ThemeProvider, useTheme } from "@/providers/ThemeProvider";
import { LocaleProvider } from "@/providers/LocaleProvider";
import { UiPrefsProvider, useUiPrefs } from "@/providers/UiPrefsProvider";
import { CollectionProvider } from "@/providers/CollectionProvider";
import ErrorBoundary from "@/components/ErrorBoundary";
import UpdateBanner from "@/components/UpdateBanner";
import { useFonts, Lexend_400Regular, Lexend_500Medium, Lexend_700Bold } from "@expo-google-fonts/lexend";
import { Image } from "expo-image";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, refetchOnWindowFocus: false, refetchOnReconnect: true, networkMode: "online" },
    mutations: { retry: 1, networkMode: "online" },
  },
});


/**
 * Boot splash — holds while the GAS script warms up from cold start.
 *
 * Timeline:
 *   0 ms   — fade in + fire warm-up ping in background
 *   300 ms — fully visible
 *   2500 ms — fade out begins (gives GAS ~2-3 s to wake up)
 *   2750 ms — onComplete, app is ready
 *
 * The warm-up ping (refreshCache) fires immediately so GAS is already
 * processing before any data queries land.
 */
function BootSequence({ onComplete }: { onComplete: () => void }) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale  = useRef(new Animated.Value(0.92)).current;
  const statusOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fire warm-up ping immediately — GAS cold start happens here
    if (Platform.OS === "web" || true) {
      try {
        const url = process.env.EXPO_PUBLIC_GOOGLE_SCRIPT_URL
          || process.env.EXPO_PUBLIC_GAS_CORE_URL
          || "https://script.google.com/macros/s/AKfycbxNNZjODqxTEehH8iylSUMxdLvJ5UrHLp4uqDmMGaeAzpnwFxqWXIyPVfAHsExl7bCfOw/exec";
        if (url) {
          void fetch(`${url}?action=refreshCache&scope=light`, {
            redirect: "follow",
            signal: AbortSignal.timeout?.(8000),
          }).catch(() => {/* ignore — just a warm-up */});
        }
      } catch { /* ignore */ }
    }

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, speed: 16, bounciness: 3, useNativeDriver: true }),
    ]).start(() => {
      // Show status hint after 800 ms if still on screen
      const hintTimer = setTimeout(() => {
        Animated.timing(statusOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      }, 800);

      // Hold until GAS has had ~2.5 s to warm up, then exit
      const exitTimer = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true })
          .start(() => onComplete());
      }, 2200);

      return () => { clearTimeout(hintTimer); clearTimeout(exitTimer); };
    });
  }, [opacity, scale, statusOpacity, onComplete]);

  return (
    <Animated.View style={[bootStyles.container, { backgroundColor: colors.bg, opacity }]}>
      <Animated.View style={[bootStyles.logoWrap, { transform: [{ scale }] }]}>
        <View style={[bootStyles.iconDock, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Image
            source={require("../assets/images/icon.png")}
            style={bootStyles.icon}
            contentFit="contain"
          />
        </View>
        <ActivityIndicator size="small" color={colors.accent} style={bootStyles.spinner} />
        <Animated.Text style={[bootStyles.status, { color: colors.textMuted, opacity: statusOpacity }]}>
          Connecting…
        </Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}

const bootStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  logoWrap: { alignItems: "center", gap: 20 },
  iconDock: {
    width: 88,
    height: 88,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  icon: { width: 64, height: 64 },
  spinner: { marginTop: 4 },
  status: { fontSize: 13, letterSpacing: 0.2 },
});

function RootLayoutNav() {
  const { colors, isDark } = useTheme();
  const { hideStatusBar } = useUiPrefs();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ErrorBoundary fallbackMessage="TaskFlow ran into a problem. Tap below to reload.">
        <CollectionProvider>
          <StatusBar
            style={isDark ? "light" : "dark"}
            hidden={hideStatusBar}
            translucent
            backgroundColor="transparent"
          />
          <Stack screenOptions={{ headerBackTitle: "Back" }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        </CollectionProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

function AppWithBoot() {
  const [booted, setBooted] = useState(false);
  const handleBootComplete = useCallback(() => setBooted(true), []);
  return (
    <View style={{ flex: 1 }}>
      {/* Sits at the top of the flex column — pushes content down when visible */}
      <UpdateBanner />
      <View style={{ flex: 1 }}>
        <RootLayoutNav />
      </View>
      {!booted && <BootSequence onComplete={handleBootComplete} />}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Lexend_400Regular,
    Lexend_500Medium,
    Lexend_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const webGlobal = globalThis as any;
    if (!webGlobal || typeof webGlobal.addEventListener !== "function") return;
    const listener = (event: Event) => {
      const installEvent = event as Event & { preventDefault: () => void };
      installEvent.preventDefault();
      webGlobal.__taskflowInstallPrompt = installEvent;
    };
    webGlobal.addEventListener("beforeinstallprompt", listener as EventListener);
    return () => {
      webGlobal.removeEventListener("beforeinstallprompt", listener as EventListener);
    };
  }, []);

  // If the app is loaded at a deep path (e.g. /live from a stale bookmark),
  // redirect to root so the SPA boots cleanly and the tab bar restores state.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const path = window.location.pathname;
    const isAsset = path.startsWith("/_expo") || path.startsWith("/favicon");
    if (path !== "/" && path !== "" && !isAsset) {
      // Replace history entry so Back doesn't loop to the 404-prone path
      window.history.replaceState({}, "", "/");
    }
  }, []);

  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <ThemeProvider>
          <UiPrefsProvider>
            <AppWithBoot />
          </UiPrefsProvider>
        </ThemeProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}
