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
import * as Haptics from "expo-haptics";
import { useTheme } from "@/providers/ThemeProvider";
import { useLocale } from "@/providers/LocaleProvider";
import { useCollection } from "@/providers/CollectionProvider";
import { DesignTokens } from "@/constants/colors";
import { fetchLiveAlerts } from "@/services/googleSheets";
import type { LiveAlert } from "@/types";

const { width: FALLBACK_SCREEN_WIDTH } = Dimensions.get("window");
const ALERT_LAST_SEEN_KEY = "ci_live_alert_seen_ts";

const TAB_ORDER = ["live", "index", "stats", "tools"] as const;
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
  const unreadPulse = useRef(new Animated.Value(0)).current;
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

  useEffect(() => {
    if (unreadCount <= 0) {
      unreadPulse.stopAnimation();
      unreadPulse.setValue(0);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(unreadPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(unreadPulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [unreadCount, unreadPulse]);

  const { TAB_WIDTH, islandWidth } = useMemo(() => {
    const safeWidth = windowWidth > 0 ? windowWidth : FALLBACK_SCREEN_WIDTH;
    const islandMargin = DesignTokens.spacing.lg;
    const maxW = Platform.OS === "web" ? Math.min(safeWidth, DesignTokens.maxContentWidth + 44) : safeWidth;
    const usableWidth = Math.max(290, maxW - islandMargin * 2);
    return {
      TAB_WIDTH: usableWidth / TAB_ORDER.length,
      islandWidth: usableWidth,
    };
  }, [windowWidth]);

  const focusedRouteName = state.routes[state.index]?.name as TabName | undefined;
  const focusedTabIndex = TAB_ORDER.findIndex((name) => name === focusedRouteName);

  useEffect(() => {
    Animated.spring(sliderAnim, {
      toValue: Math.max(0, focusedTabIndex) * TAB_WIDTH,
      useNativeDriver: true,
      speed: 26,
      bounciness: 7,
    }).start();
  }, [focusedTabIndex, TAB_WIDTH, sliderAnim]);

  const handlePressRoute = useCallback(
    (index: number) => {
      const route = state.routes[index];
      const isFocused = state.index === index;
      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (event.defaultPrevented) return;

      if (!isFocused) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
        navigation.navigate(route.name);
        return;
      }

      Haptics.selectionAsync();
    },
    [state, navigation]
  );

  const bottomPad = insets.bottom > 0 ? insets.bottom : 10;

  return (
    <View style={[barStyles.outerWrap, { paddingBottom: bottomPad + 8 }]}>
      <View
        style={[
          barStyles.island,
          {
            width: islandWidth,
            backgroundColor: colors.tabBar,
            borderColor: isDark ? colors.border : colors.borderLight,
            shadowColor: colors.shadow,
          },
        ]}
        {...(Platform.OS === "web" ? ({ role: "tablist", "aria-label": "TaskFlow navigation" } as any) : {})}
      >
        {/* glass sheen removed — flatter, calmer island */}

        <Animated.View
          pointerEvents="none"
          accessible={false}
          style={[
            barStyles.activePill,
            {
              width: TAB_WIDTH - 10,
              backgroundColor: colors.accent + "20",
              borderColor: colors.accent + "42",
              transform: [{ translateX: sliderAnim }],
            },
          ]}
          {...(Platform.OS === "web" ? ({ "aria-hidden": true, focusable: false } as any) : {})}
        />

        {TAB_ORDER.map((tabName) => {
          const routeIndex = getRouteIndexByName(tabName);
          if (routeIndex < 0) return null;

          const isFocused = state.index === routeIndex;
          const cfg = TAB_CONFIG[tabName];
          const iconColor = isFocused ? colors.accent : colors.textMuted;
          const label = t(cfg.titleKey, cfg.fallback);

          return (
            <TouchableOpacity
              key={tabName}
              style={[barStyles.tab, { width: TAB_WIDTH }]}
              onPress={() => handlePressRoute(routeIndex)}
              activeOpacity={0.8}
              testID={`tab-${tabName}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={`${label} tab`}
            >
              <View
                style={[
                  barStyles.iconWrap,
                  isFocused && {
                    backgroundColor: colors.accent + "14",
                    borderRadius: 14,
                  },
                ]}
              >
                {cfg.icon(iconColor, tabName === "live" ? 20 : 19)}
                {tabName === "live" && (
                  <Animated.View
                    style={[
                      barStyles.liveDot,
                      {
                        backgroundColor: unreadCount > 0 ? colors.cancel : colors.complete,
                        opacity: unreadCount > 0
                          ? unreadPulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] })
                          : 0.85,
                        transform: [{
                          scale: unreadCount > 0
                            ? unreadPulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.18] })
                            : 1,
                        }],
                      },
                    ]}
                    pointerEvents="none"
                  />
                )}
                {tabName === "live" && unreadCount > 0 && (
                  <View style={[barStyles.alertBadge, { backgroundColor: colors.cancel }]}>
                    <Text style={barStyles.alertBadgeText}>+{unreadCount}</Text>
                  </View>
                )}
              </View>
              <Text
                style={[
                  barStyles.label,
                  {
                    color: iconColor,
                    fontWeight: isFocused ? ("700" as const) : ("500" as const),
                    fontSize: 11,
                    letterSpacing: isFocused ? 0.2 : 0.1,
                    fontFamily: isFocused ? "Lexend_700Bold" : "Lexend_500Medium",
                  },
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
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
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen name="live" options={{ title: t("live", "Live") }} />
      <Tabs.Screen name="index" options={{ title: t("collect", "Collect"), headerShown: false }} />
      <Tabs.Screen name="stats" options={{ title: t("stats", "Stats") }} />
      <Tabs.Screen name="tools" options={{ title: t("tools", "Tools") }} />
    </Tabs>
  );
}

const barStyles = StyleSheet.create({
  outerWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: DesignTokens.spacing.lg,
  },
  island: {
    borderRadius: 30,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 11,
    overflow: "hidden",
    position: "relative",
  },
  activePill: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 5,
    borderRadius: 24,
    borderWidth: 1,
  },
  tab: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 3,
  },
  iconWrap: {
    width: 42,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  liveDot: {
    position: "absolute",
    top: 1,
    right: 5,
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  alertBadge: {
    position: "absolute",
    top: -5,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  alertBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700" as const,
    letterSpacing: 0.2,
  },
  label: {
    textAlign: "center",
  },
});
