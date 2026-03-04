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
  "Verifying collector session state...",
  "Syncing assignment ledger...",
  "Loading task requirement profile...",
  "Initializing active rig routing...",
  "Refreshing CA_PLUS and CA_TAGGED indexes...",
  "Building live leaderboard snapshot...",
  "Validating collector identity map...",
  "Preparing weekly metrics window...",
  "Checking cache consistency...",
  "Applying user display preferences...",
  "Preloading dashboard data blocks...",
  "Negotiating network channel...",
  "Hydrating operational context...",
  "Finalizing interface services...",
  "Confirming data source readiness...",
  "Establishing command channel...",
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
    "TASKFLOW PLATFORM v4.0",
    "Booting core services...",
    "Loading live collection engine...",
    ...pickRandomMessages(3),
    "System online. TaskFlow operational.",
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
  glowOrb: { position: "absolute", width: SW * 1.2, height: SW * 1.2, borderRadius: SW * 0.6, top: -SW * 0.3 },
  glowOrb2: { position: "absolute", width: SW * 0.8, height: SW * 0.8, borderRadius: SW * 0.4, bottom: -SW * 0.2 },
  glowOrb3: { position: "absolute", width: SW * 0.92, height: SW * 0.92, borderRadius: SW * 0.48, left: -SW * 0.28, bottom: SW * 0.1 },
  logoWrap: { alignItems: "center", marginBottom: 44, width: SW * 0.9, maxWidth: 440 },
  logoIconDock: {
    width: 94,
    height: 94,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  logoIconRing: {
    position: "absolute",
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1.6,
    borderStyle: "dashed",
  },
  logoIcon: { width: 70, height: 70 },
  logoText: {
    fontSize: 40,
    fontWeight: "700" as const,
    letterSpacing: 3.8,
    fontFamily: "Lexend_700Bold",
    textAlign: "center",
  },
  logoSubRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, justifyContent: "center" },
  logoDash: { width: 26, height: 1, opacity: 0.48 },
  logoSub: { fontSize: 9, letterSpacing: 2.2, fontFamily: FONT_MONO, textAlign: "center" },
  welcomeText: { marginTop: 12, fontSize: 11, letterSpacing: 0.25, textAlign: "center", maxWidth: 340, lineHeight: 16 },
  terminalArea: { width: SW * 0.84, maxWidth: 420, minHeight: 130, paddingBottom: 8 },
  termLine: { fontSize: 11, lineHeight: 20, letterSpacing: 0.3 },
  cursor: { fontSize: 12, lineHeight: 20 },
  progressWrap: { width: SW * 0.58, maxWidth: 260, marginTop: 30, alignItems: "center", gap: 8 },
  progressTrack: { width: "100%", height: 3, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 3, borderRadius: 2 },
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
