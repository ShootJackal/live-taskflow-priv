import { Tabs } from "expo-router";
import { Send, Wrench, BarChart3, Radio } from "lucide-react-native";
import React, { useRef, useCallback, useMemo, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
  useWindowDimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/providers/ThemeProvider";
import { useLocale } from "@/providers/LocaleProvider";
import { useCollection } from "@/providers/CollectionProvider";
import { DesignTokens } from "@/constants/colors";
import { fetchLiveAlerts } from "@/services/googleSheets";
import type { LiveAlert } from "@/types";
import * as Haptics from "expo-haptics";

const { width: FALLBACK_SCREEN_WIDTH } = Dimensions.get("window");
const ALERT_LAST_SEEN_KEY = "ci_live_alert_seen_ts";

const TAB_ORDER = ["live", "index", "stats", "tools"] as const;
const MAIN_TAB_ORDER = ["index", "stats", "tools"] as const;
type TabName = (typeof TAB_ORDER)[number];

const TAB_CONFIG: Record<TabName, { titleKey: string; fallback: string; icon: (color: string, size: number) => React.ReactNode }> = {
  live: { titleKey: "live", fallback: "LIVE", icon: (color, size) => <Radio size={size} color={color} /> },
  index: { titleKey: "collect", fallback: "Collect", icon: (color, size) => <Send size={size} color={color} /> },
  stats: { titleKey: "stats", fallback: "Stats", icon: (color, size) => <BarChart3 size={size} color={color} /> },
  tools: { titleKey: "tools", fallback: "Tools", icon: (color, size) => <Wrench size={size} color={color} /> },
};

function CustomTabBar({ state, navigation }: { state: any; navigation: any }) {
  const { colors, isDark } = useTheme();
  const { t } = useLocale();
  const { configured } = useCollection();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const sliderAnim = useRef(new Animated.Value(0)).current;
  const liveScaleAnim = useRef(new Animated.Value(1)).current;
  const [lastSeenAlertTs, setLastSeenAlertTs] = useState(0);

  const alertsQuery = useQuery<LiveAlert[]>({
    queryKey: ["liveAlerts"],
    queryFn: fetchLiveAlerts,
    enabled: configured,
    staleTime: 20000,
    refetchInterval: 30000,
    retry: 1,
  });

  const getRouteIndexByName = useCallback(
    (name: TabName) => state.routes.findIndex((route: any) => route.name === name),
    [state.routes]
  );

  const liveRouteIndex = getRouteIndexByName("live");
  const isLiveFocused = state.index === liveRouteIndex;

  const latestAlertTs = useMemo(() => {
    const alerts = alertsQuery.data ?? [];
    return alerts.reduce((latest, item) => {
      const ts = Date.parse(String(item.createdAt ?? ""));
      if (!Number.isFinite(ts)) return latest;
      return ts > latest ? ts : latest;
    }, 0);
  }, [alertsQuery.data]);

  useEffect(() => {
    AsyncStorage.getItem(ALERT_LAST_SEEN_KEY).then((raw) => {
      const parsed = Number(raw ?? 0);
      if (Number.isFinite(parsed) && parsed > 0) {
        setLastSeenAlertTs(parsed);
      }
    });
  }, []);

  useEffect(() => {
    if (!isLiveFocused || latestAlertTs <= 0 || latestAlertTs <= lastSeenAlertTs) return;
    setLastSeenAlertTs(latestAlertTs);
    void AsyncStorage.setItem(ALERT_LAST_SEEN_KEY, String(latestAlertTs));
  }, [isLiveFocused, latestAlertTs, lastSeenAlertTs]);

  const unreadCount = latestAlertTs > lastSeenAlertTs ? 1 : 0;

  const { TAB_WIDTH, islandMaxWidth, islandWidth } = useMemo(() => {
    const safeWidth = windowWidth > 0 ? windowWidth : FALLBACK_SCREEN_WIDTH;
    const ISLAND_MARGIN = DesignTokens.spacing.lg;
    const maxW = Platform.OS === "web" ? Math.min(safeWidth, DesignTokens.maxContentWidth) : safeWidth;
    const usableWidth = Math.max(300, maxW - ISLAND_MARGIN * 2);
    const liveButtonWidth = 70;
    const interGap = 10;
    const mainIslandWidth = Math.max(220, usableWidth - liveButtonWidth - interGap);
    return {
      TAB_WIDTH: mainIslandWidth / MAIN_TAB_ORDER.length,
      islandMaxWidth: usableWidth,
      islandWidth: mainIslandWidth,
    };
  }, [windowWidth]);

  const focusedRouteName = state.routes[state.index]?.name as TabName | undefined;
  const focusedMainIndex = MAIN_TAB_ORDER.findIndex((name) => name === focusedRouteName);

  useEffect(() => {
    Animated.spring(sliderAnim, {
      toValue: Math.max(0, focusedMainIndex) * TAB_WIDTH,
      useNativeDriver: true, speed: 28, bounciness: 5,
    }).start();
  }, [focusedMainIndex, TAB_WIDTH, sliderAnim]);

  useEffect(() => {
    Animated.spring(liveScaleAnim, {
      toValue: isLiveFocused ? 1.06 : 1,
      speed: 24,
      bounciness: 7,
      useNativeDriver: true,
    }).start();
  }, [isLiveFocused, liveScaleAnim]);

  const handlePressRoute = useCallback(
    (index: number) => {
      const route = state.routes[index];
      const isFocused = state.index === index;
      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!isFocused && !event.defaultPrevented) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        navigation.navigate(route.name);
      }
    },
    [state, navigation]
  );

  const BOTTOM_PAD = insets.bottom > 0 ? insets.bottom : 10;
  const FLOAT_OFFSET = 10;

  return (
    <View style={[barStyles.outerWrap, { paddingBottom: BOTTOM_PAD + FLOAT_OFFSET }]}>
      <View style={[barStyles.islandWrap, { maxWidth: islandMaxWidth + 24 }]}>
        <View style={barStyles.navRow}>
          <Animated.View style={{ transform: [{ scale: liveScaleAnim }] }}>
            <TouchableOpacity
              style={[
                barStyles.liveOrb,
                {
                  backgroundColor: isLiveFocused ? colors.complete + "18" : colors.tabBar,
                  borderColor: isLiveFocused ? colors.complete + "45" : (isDark ? colors.border : colors.borderLight),
                  shadowColor: colors.shadow,
                },
              ]}
              onPress={() => {
                if (liveRouteIndex >= 0) handlePressRoute(liveRouteIndex);
              }}
              activeOpacity={0.78}
              testID="tab-live"
            >
              <View style={barStyles.liveIconWrap}>
                {TAB_CONFIG.live.icon(isLiveFocused ? colors.complete : colors.textMuted, 20)}
                <View style={[barStyles.liveBlip, { backgroundColor: colors.complete }]} />
                {unreadCount > 0 && (
                  <View style={[barStyles.alertBadge, { backgroundColor: colors.cancel }]}>
                    <Text style={barStyles.alertBadgeText}>+{unreadCount}</Text>
                  </View>
                )}
              </View>
              <Text
                style={[
                  barStyles.label,
                  {
                    color: isLiveFocused ? colors.complete : colors.textMuted,
                    fontWeight: isLiveFocused ? ("700" as const) : ("500" as const),
                    fontSize: 8,
                    letterSpacing: 1.5,
                    fontFamily: isLiveFocused ? "Lexend_700Bold" : "Lexend_500Medium",
                  },
                ]}
              >
                {t(TAB_CONFIG.live.titleKey, TAB_CONFIG.live.fallback).toUpperCase()}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          <View style={[barStyles.mainIslandWrap, { width: islandWidth }]}>
            <View style={[barStyles.island, {
              backgroundColor: colors.tabBar,
              shadowColor: colors.shadow,
              borderColor: isDark ? colors.border : colors.borderLight,
            }]}>
              <Animated.View style={[barStyles.slider, {
                backgroundColor: colors.accent,
                width: TAB_WIDTH * 0.5,
                left: TAB_WIDTH * 0.25,
                opacity: focusedMainIndex >= 0 ? 1 : 0,
                transform: [{ translateX: sliderAnim }],
              }]} />

              {MAIN_TAB_ORDER.map((tabName) => {
                const routeIndex = getRouteIndexByName(tabName);
                if (routeIndex < 0) return null;
                const isFocused = state.index === routeIndex;
                const cfg = TAB_CONFIG[tabName];
                const iconColor = isFocused ? colors.accent : colors.textMuted;

                return (
                  <TouchableOpacity
                    key={tabName}
                    style={[barStyles.tab, { width: TAB_WIDTH }]}
                    onPress={() => handlePressRoute(routeIndex)}
                    activeOpacity={0.74}
                    testID={`tab-${tabName}`}
                  >
                    <View style={[barStyles.iconWrap, isFocused && {
                      backgroundColor: colors.accent + "12",
                      borderRadius: 14,
                    }]}>
                      {cfg.icon(iconColor, 19)}
                    </View>
                    <Text style={[barStyles.label, {
                      color: iconColor,
                      fontWeight: isFocused ? ("700" as const) : ("500" as const),
                      fontSize: 9,
                      letterSpacing: 0.5,
                      fontFamily: isFocused ? "Lexend_700Bold" : "Lexend_500Medium",
                    }]}>
                      {t(cfg.titleKey, cfg.fallback)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { colors } = useTheme();
  const { t } = useLocale();
  return (
    <Tabs
      initialRouteName="live"
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.textMuted }}
    >
      <Tabs.Screen name="live" options={{ title: t("live", "LIVE").toUpperCase() }} />
      <Tabs.Screen name="index" options={{ title: t("collect", "Collect"), headerShown: false }} />
      <Tabs.Screen name="stats" options={{ title: t("stats", "Stats") }} />
      <Tabs.Screen name="tools" options={{ title: t("tools", "Tools") }} />
    </Tabs>
  );
}

const barStyles = StyleSheet.create({
  outerWrap: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    alignItems: "center", paddingHorizontal: DesignTokens.spacing.lg + 2,
  },
  islandWrap: {
    width: "100%",
    position: "relative",
    alignSelf: "center",
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  liveOrb: {
    width: 66,
    height: 54,
    borderRadius: DesignTokens.radius.xl,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 8,
  },
  liveIconWrap: { width: 36, height: 28, alignItems: "center", justifyContent: "center", position: "relative" },
  mainIslandWrap: {
    position: "relative",
    alignSelf: "center",
  },
  island: {
    flexDirection: "row", borderRadius: DesignTokens.radius.xxl + 4, borderWidth: 1, paddingVertical: 6,
    shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.16, shadowRadius: 16, elevation: 10,
    position: "relative", overflow: "hidden", width: "100%",
  },
  slider: { position: "absolute", bottom: 0, height: 2.5, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  tab: { alignItems: "center", justifyContent: "center", paddingVertical: 6, gap: 3 },
  iconWrap: { width: 40, height: 32, alignItems: "center", justifyContent: "center", position: "relative" },
  liveBlip: { position: "absolute", top: 1, right: 5, width: 5, height: 5, borderRadius: 3 },
  alertBadge: {
    position: "absolute",
    top: -4,
    right: -7,
    minWidth: 18,
    height: 18,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  alertBadgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "700" as const, letterSpacing: 0.2 },
  label: { textTransform: "uppercase" },
});
