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
import { useFonts, Lexend_300Light, Lexend_400Regular, Lexend_500Medium, Lexend_600SemiBold, Lexend_700Bold, Lexend_800ExtraBold } from "@expo-google-fonts/lexend";
import { Image } from "expo-image";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, refetchOnWindowFocus: false, refetchOnReconnect: true, networkMode: "online" },
    mutations: { retry: 1, networkMode: "online" },
  },
});


/**
 * Clean branded splash — fades in the logo, holds for 800 ms,
 * then fades out and calls onComplete. No terminal ceremony.
 */
function BootSequence({ onComplete }: { onComplete: () => void }) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    // Fade + scale in
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, speed: 14, bounciness: 4, useNativeDriver: true }),
    ]).start(() => {
      // Hold 800 ms then fade out
      const timer = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 320, useNativeDriver: true })
          .start(() => onComplete());
      }, 800);
      return () => clearTimeout(timer);
    });
  }, [opacity, scale, onComplete]);

  return (
    <Animated.View
      style={[
        bootStyles.container,
        { backgroundColor: colors.bg, opacity },
      ]}
    >
      <Animated.View
        style={[bootStyles.logoWrap, { transform: [{ scale }] }]}
      >
        <View style={[bootStyles.iconDock, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Image
            source={require("../assets/images/icon.png")}
            style={bootStyles.icon}
            contentFit="contain"
          />
        </View>
        <ActivityIndicator
          size="small"
          color={colors.accent}
          style={bootStyles.spinner}
        />
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
  logoWrap: { alignItems: "center", gap: 24 },
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
    Lexend_300Light,
    Lexend_400Regular,
    Lexend_500Medium,
    Lexend_600SemiBold,
    Lexend_700Bold,
    Lexend_800ExtraBold,
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
