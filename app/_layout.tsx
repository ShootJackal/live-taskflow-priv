import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, Text, StyleSheet, Animated, Platform, Dimensions, TouchableOpacity } from "react-native";
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

const FONT_MONO = Platform.select({ ios: "Courier New", android: "monospace", default: "monospace" });

const BOOT_MESSAGES_POOL = [
  "Authenticating session...",
  "Syncing task ledger...",
  "Loading assignments...",
  "Connecting to operations...",
  "Building leaderboard...",
  "Validating identity...",
  "Preparing metrics...",
  "Checking cache...",
  "Loading preferences...",
  "Preloading data...",
  "Establishing connection...",
  "Hydrating context...",
  "Finalizing services...",
  "Confirming readiness...",
];

function pickRandomMessages(count: number): string[] {
  const shuffled = [...BOOT_MESSAGES_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function BootSequence({ onComplete }: { onComplete: () => void }) {
  const { colors } = useTheme();
  const [lines, setLines] = useState<string[]>([]);
  const [phase, setPhase] = useState<"booting" | "ready">("booting");
  const fadeOut = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoSlide = useRef(new Animated.Value(30)).current;
  const enterScale = useRef(new Animated.Value(0)).current;
  const enterGlow = useRef(new Animated.Value(0.3)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const cursorBlink = useRef(new Animated.Value(1)).current;
  const orbPulse = useRef(new Animated.Value(0.03)).current;
  const iconFloat = useRef(new Animated.Value(0)).current;
  const ringSpin = useRef(new Animated.Value(0)).current;
  const titleBreath = useRef(new Animated.Value(0)).current;

  const bootLines = useRef([
    "TASKFLOW v4.0",
    "Initializing...",
    ...pickRandomMessages(2),
    "System ready.",
  ]).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(logoSlide, { toValue: 0, speed: 8, bounciness: 4, useNativeDriver: true }),
    ]).start();

    const blink = Animated.loop(Animated.sequence([
      Animated.timing(cursorBlink, { toValue: 0, duration: 500, useNativeDriver: true }),
      Animated.timing(cursorBlink, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]));
    blink.start();

    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(orbPulse, { toValue: 0.06, duration: 3000, useNativeDriver: true }),
      Animated.timing(orbPulse, { toValue: 0.03, duration: 3000, useNativeDriver: true }),
    ]));
    pulse.start();

    const float = Animated.loop(Animated.sequence([
      Animated.timing(iconFloat, { toValue: 1, duration: 2100, useNativeDriver: true }),
      Animated.timing(iconFloat, { toValue: -1, duration: 2100, useNativeDriver: true }),
    ]));
    float.start();

    const spin = Animated.loop(Animated.timing(ringSpin, { toValue: 1, duration: 5200, useNativeDriver: true }));
    spin.start();

    const breathe = Animated.loop(Animated.sequence([
      Animated.timing(titleBreath, { toValue: 1, duration: 2600, useNativeDriver: true }),
      Animated.timing(titleBreath, { toValue: 0, duration: 2600, useNativeDriver: true }),
    ]));
    breathe.start();

    return () => { blink.stop(); pulse.stop(); float.stop(); spin.stop(); breathe.stop(); };
  }, [logoOpacity, logoSlide, cursorBlink, orbPulse, iconFloat, ringSpin, titleBreath]);

  useEffect(() => {
    if (phase !== "booting") return;
    let idx = 0;
    let timeoutId: ReturnType<typeof setTimeout>;
    const addLine = () => {
      if (idx >= bootLines.length) { setPhase("ready"); return; }
      const line = bootLines[idx];
      const prefix = idx < 3 ? "\u25B8 " : "$ ";
      setLines(prev => [...prev.slice(-6), `${prefix}${line}`]);
      idx++;
      Animated.timing(progressAnim, { toValue: (idx / bootLines.length) * 100, duration: 200, useNativeDriver: false }).start();
      timeoutId = setTimeout(addLine, 450 + Math.random() * 350);
    };
    timeoutId = setTimeout(addLine, 600);
    return () => clearTimeout(timeoutId);
  }, [phase, bootLines, progressAnim]);

  useEffect(() => {
    if (phase !== "ready") return;
    Animated.timing(progressAnim, { toValue: 100, duration: 300, useNativeDriver: false }).start();
    Animated.spring(enterScale, { toValue: 1, speed: 10, bounciness: 6, useNativeDriver: true, delay: 200 }).start();
    const glow = Animated.loop(Animated.sequence([
      Animated.timing(enterGlow, { toValue: 0.8, duration: 1400, useNativeDriver: true }),
      Animated.timing(enterGlow, { toValue: 0.3, duration: 1400, useNativeDriver: true }),
    ]));
    glow.start();
    return () => glow.stop();
  }, [phase, enterScale, enterGlow, progressAnim]);

  const handleEnter = useCallback(() => {
    Animated.timing(fadeOut, { toValue: 0, duration: 450, useNativeDriver: true }).start(() => onComplete());
  }, [fadeOut, onComplete]);

  const bgColor = colors.bg;
  const accentColor = colors.accent;
  const dimColor = colors.terminalDim;

  return (
    <Animated.View style={[bootStyles.container, { backgroundColor: bgColor, opacity: fadeOut }]}>
      <Animated.View style={[bootStyles.glowOrb, { backgroundColor: accentColor, opacity: orbPulse }]} />
      <View style={[bootStyles.glowOrb2, { backgroundColor: colors.terminalGreen, opacity: 0.03 }]} />
      <View style={[bootStyles.glowOrb3, { backgroundColor: colors.accentLight, opacity: 0.04 }]} />

      <Animated.View style={[bootStyles.logoWrap, { opacity: logoOpacity, transform: [{ translateY: logoSlide }] }]}>
        <Animated.View
          style={[
            bootStyles.logoIconDock,
            {
              borderColor: colors.accent + "66",
              backgroundColor: colors.bgCard,
              transform: [{ translateY: iconFloat.interpolate({ inputRange: [-1, 1], outputRange: [4, -4] }) }],
            },
          ]}
        >
          <Animated.View
            style={[
              bootStyles.logoIconRing,
              {
                borderColor: accentColor + "80",
                transform: [{ rotate: ringSpin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }],
              },
            ]}
          />
          <Image
            source={require("../assets/images/icon.png")}
            style={bootStyles.logoIcon}
            contentFit="contain"
          />
        </Animated.View>

        <Animated.Text
          style={[
            bootStyles.logoText,
            {
              color: accentColor,
              transform: [{ scale: titleBreath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] }) }],
            },
          ]}
        >
          TASKFLOW
        </Animated.Text>
        <View style={bootStyles.logoSubRow}>
          <View style={[bootStyles.logoDash, { backgroundColor: accentColor }]} />
          <Text style={[bootStyles.logoSub, { color: dimColor }]}>LIVE COLLECTION OPERATIONS</Text>
          <View style={[bootStyles.logoDash, { backgroundColor: accentColor }]} />
        </View>
        <Text style={[bootStyles.welcomeText, { color: colors.textMuted }]}>
          Securely connecting your workspace and loading live operational data.
        </Text>
      </Animated.View>

      <View style={bootStyles.terminalArea}>
        {lines.map((line, idx) => (
          <Text key={`boot_${idx}`} style={[bootStyles.termLine, {
            color: line.startsWith("\u25B8") ? dimColor : accentColor,
            fontFamily: FONT_MONO,
          }]}>{line}</Text>
        ))}
        {phase === "booting" && (
          <Animated.Text style={[bootStyles.cursor, { color: colors.terminalGreen, opacity: cursorBlink, fontFamily: FONT_MONO }]}>
            $ _
          </Animated.Text>
        )}
      </View>

      <View style={bootStyles.progressWrap}>
        <View style={[bootStyles.progressTrack, { backgroundColor: colors.bgElevated }]}>
          <Animated.View style={[bootStyles.progressFill, {
            backgroundColor: accentColor,
            width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
          }]} />
        </View>
        <Text style={[bootStyles.progressLabel, { color: dimColor, fontFamily: FONT_MONO }]}>
          {phase === "ready" ? "READY" : "LOADING"}
        </Text>
      </View>

      {phase === "ready" && (
        <Animated.View style={[bootStyles.enterWrap, { transform: [{ scale: enterScale }] }]}>
          <Animated.View style={[bootStyles.enterGlow, { backgroundColor: accentColor, opacity: enterGlow }]} />
          <TouchableOpacity
            style={[bootStyles.enterBtn, { backgroundColor: accentColor, shadowColor: accentColor }]}
            onPress={handleEnter} activeOpacity={0.8} testID="enter-system-btn"
          >
            <Text style={[bootStyles.enterText, { color: '#FFFFFF' }]}>ENTER SYSTEM</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const { width: SW } = Dimensions.get("window");

const bootStyles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", zIndex: 999 },
  glowOrb: { position: "absolute", width: SW * 1.0, height: SW * 1.0, borderRadius: SW * 0.5, top: -SW * 0.25 },
  glowOrb2: { position: "absolute", width: SW * 0.7, height: SW * 0.7, borderRadius: SW * 0.35, bottom: -SW * 0.15 },
  glowOrb3: { position: "absolute", width: SW * 0.8, height: SW * 0.8, borderRadius: SW * 0.4, left: -SW * 0.2, bottom: SW * 0.15 },
  logoWrap: { alignItems: "center", marginBottom: 48, width: SW * 0.85, maxWidth: 400 },
  logoIconDock: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
    overflow: "hidden",
    marginBottom: 20,
  },
  logoIconRing: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  logoIcon: { width: 64, height: 64 },
  logoText: {
    fontSize: 36,
    fontWeight: "700" as const,
    letterSpacing: 6,
    fontFamily: "Lexend_700Bold",
    textAlign: "center",
  },
  logoSubRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10, justifyContent: "center" },
  logoDash: { width: 24, height: 1, opacity: 0.35 },
  logoSub: { fontSize: 10, letterSpacing: 2.5, fontFamily: FONT_MONO, textAlign: "center" },
  welcomeText: { marginTop: 16, fontSize: 13, letterSpacing: 0.3, textAlign: "center", maxWidth: 320, lineHeight: 20 },
  terminalArea: { width: SW * 0.8, maxWidth: 380, minHeight: 100, paddingBottom: 12 },
  termLine: { fontSize: 12, lineHeight: 22, letterSpacing: 0.4 },
  cursor: { fontSize: 12, lineHeight: 22 },
  progressWrap: { width: SW * 0.5, maxWidth: 220, marginTop: 36, alignItems: "center", gap: 10 },
  progressTrack: { width: "100%", height: 2, borderRadius: 1, overflow: "hidden" },
  progressFill: { height: 2, borderRadius: 1 },
  progressLabel: { fontSize: 9, letterSpacing: 3.5 },
  enterWrap: { marginTop: 44, alignItems: "center", justifyContent: "center" },
  enterGlow: { position: "absolute", width: 180, height: 50, borderRadius: 25 },
  enterBtn: {
    paddingHorizontal: 40, paddingVertical: 16, borderRadius: 25,
    shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.25, shadowRadius: 28, elevation: 16,
  },
  enterText: { fontSize: 11, fontWeight: "600" as const, letterSpacing: 4, fontFamily: "Lexend_600SemiBold" },
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
