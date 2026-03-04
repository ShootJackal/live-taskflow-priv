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
  "Calibrating the vibes...",
  "Convincing rigs to cooperate...",
  "Syncing with the mothership...",
  "Running rig diagnostics...",
  "Warming up the data pipeline...",
  "Optimizing snack break algorithms...",
  "Bribing the Wi-Fi gods...",
  "Turning coffee into data...",
  "Consulting the rig whisperer...",
  "Spinning up the hamster wheels...",
  "Deploying tactical vibes...",
  "Charging the flux capacitor...",
  "Feeding the data gnomes...",
  "Giving the servers a pep talk...",
  "Adjusting the vibe frequency...",
  "Making EGO RIGs heavier...",
  "Asking Redash nicely for data...",
  "Untangling USB cables mentally...",
  "Counting pixels for QA...",
  "Downloading more RAM... jk...",
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
  const logoDriftX = useRef(new Animated.Value(0)).current;

  const bootLines = useRef([
    "TASKFLOW SYSTEM v3.1",
    "Initializing modules...",
    "Loading collection engine...",
    ...pickRandomMessages(3),
    "Systems online. Welcome to TaskFlow.",
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

    const drift = Animated.loop(Animated.sequence([
      Animated.timing(logoDriftX, { toValue: 1, duration: 2400, useNativeDriver: true }),
      Animated.timing(logoDriftX, { toValue: -1, duration: 2400, useNativeDriver: true }),
    ]));
    drift.start();

    return () => { blink.stop(); pulse.stop(); drift.stop(); };
  }, [logoOpacity, logoSlide, cursorBlink, orbPulse, logoDriftX]);

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
      <View style={[bootStyles.glowOrb2, { backgroundColor: colors.terminalGreen, opacity: 0.02 }]} />

      <Animated.View style={[bootStyles.logoWrap, { opacity: logoOpacity, transform: [{ translateY: logoSlide }] }]}>
        <Animated.View
          style={[
            bootStyles.logoIconWrap,
            {
              transform: [{ translateX: logoDriftX.interpolate({ inputRange: [-1, 1], outputRange: [-4, 4] }) }],
            },
          ]}
        >
          <Image
            source={require("../assets/images/icon.png")}
            style={bootStyles.logoIcon}
            contentFit="contain"
          />
        </Animated.View>
        <Text style={[bootStyles.logoText, { color: accentColor }]}>TaskFlow</Text>
        <View style={bootStyles.logoSubRow}>
          <View style={[bootStyles.logoDash, { backgroundColor: accentColor }]} />
          <Text style={[bootStyles.logoSub, { color: dimColor }]}>COLLECTION SYSTEM</Text>
          <View style={[bootStyles.logoDash, { backgroundColor: accentColor }]} />
        </View>
        <Text style={[bootStyles.welcomeText, { color: colors.textMuted }]}>
          Welcome back. Live operations are syncing now.
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
  glowOrb: { position: "absolute", width: SW * 1.2, height: SW * 1.2, borderRadius: SW * 0.6, top: -SW * 0.3 },
  glowOrb2: { position: "absolute", width: SW * 0.8, height: SW * 0.8, borderRadius: SW * 0.4, bottom: -SW * 0.2 },
  logoWrap: { alignItems: "center", marginBottom: 52 },
  logoIconWrap: {
    width: 92,
    height: 92,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  logoIcon: { width: 78, height: 78 },
  logoText: { fontSize: 42, fontWeight: "300" as const, letterSpacing: 2, fontFamily: "Lexend_300Light" },
  logoSubRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  logoDash: { width: 20, height: 1, opacity: 0.4 },
  logoSub: { fontSize: 10, letterSpacing: 4, fontFamily: FONT_MONO },
  welcomeText: { marginTop: 10, fontSize: 11, letterSpacing: 0.5, textAlign: "center" },
  terminalArea: { width: SW * 0.82, maxWidth: 380, minHeight: 130, paddingBottom: 8 },
  termLine: { fontSize: 11, lineHeight: 20, letterSpacing: 0.3 },
  cursor: { fontSize: 12, lineHeight: 20 },
  progressWrap: { width: SW * 0.5, maxWidth: 240, marginTop: 36, alignItems: "center", gap: 10 },
  progressTrack: { width: "100%", height: 2, borderRadius: 1, overflow: "hidden" },
  progressFill: { height: 2, borderRadius: 1 },
  progressLabel: { fontSize: 8, letterSpacing: 3 },
  enterWrap: { marginTop: 40, alignItems: "center", justifyContent: "center" },
  enterGlow: { position: "absolute", width: 200, height: 52, borderRadius: 26 },
  enterBtn: {
    paddingHorizontal: 36, paddingVertical: 15, borderRadius: 26,
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 24, elevation: 14,
  },
  enterText: { fontSize: 12, fontWeight: "600" as const, letterSpacing: 3, fontFamily: "Lexend_600SemiBold" },
});

function RootLayoutNav() {
  const { colors, isDark } = useTheme();
  const { hideStatusBar } = useUiPrefs();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
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
    </GestureHandlerRootView>
  );
}

function AppWithBoot() {
  const [booted, setBooted] = useState(false);
  const handleBootComplete = useCallback(() => setBooted(true), []);
  return (
    <>
      <RootLayoutNav />
      {!booted && <BootSequence onComplete={handleBootComplete} />}
    </>
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
