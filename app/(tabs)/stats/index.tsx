import React, { useRef, useEffect, useMemo, useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Animated,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TrendingUp, CheckCircle, Target, Inbox, Calendar, Trophy, Medal, Crown, Upload, AlertTriangle, XCircle, RefreshCw } from "lucide-react-native";
import { useCollection } from "@/providers/CollectionProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { DesignTokens } from "@/constants/colors";
import ScreenContainer from "@/components/ScreenContainer";
import {
  fetchCollectorStats,
  fetchCollectorProfile,
  fetchLeaderboard,
  fetchTaskActualsData,
  fetchAdminStartPlan,
  fetchDailyCarryover,
  reportDailyCarryover,
  cancelDailyCarryover,
  clearApiCache,
} from "@/services/googleSheets";
import { CollectorStats, LeaderboardEntry, TaskActualRow, CollectorProfile, AdminStartPlanData, DailyCarryoverItem } from "@/types";
import { normalizeCollectorName } from "@/utils/normalize";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";

type LeaderboardTab = "combined" | "sf" | "mx";
type LeaderboardPeriod = "thisWeek" | "lastWeek";

const AnimatedBar = React.memo(function AnimatedBar({ value, maxValue, color, delay }: { value: number; maxValue: number; color: string; delay: number }) {
  const widthAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const pct = maxValue > 0 ? Math.min(value / maxValue, 1) : 0;
    Animated.timing(widthAnim, { toValue: pct * 100, duration: 800, delay, useNativeDriver: false }).start();
  }, [value, maxValue, delay, widthAnim]);

  return (
    <View style={barStyles.track}>
      <Animated.View style={[barStyles.fill, { backgroundColor: color, width: widthAnim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) }]} />
    </View>
  );
});

const barStyles = StyleSheet.create({
  track: { height: 5, borderRadius: 3, backgroundColor: "rgba(128,128,128,0.08)", overflow: "hidden" },
  fill: { height: 5, borderRadius: 3 },
});

const HeroStat = React.memo(function HeroStat({ label, value, icon, color, index }: { label: string; value: string; icon: React.ReactNode; color: string; index: number }) {
  const { colors } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, delay: index * 60, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, delay: index * 60, speed: 22, bounciness: 4, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim, index]);

  return (
    <Animated.View style={[styles.heroCard, { backgroundColor: colors.bgCard, shadowColor: colors.shadow, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={[styles.heroIconWrap, { backgroundColor: color + "12" }]}>{icon}</View>
      <Text style={[styles.heroValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.heroLabel, { color: colors.textMuted }]}>{label}</Text>
    </Animated.View>
  );
});

const LeaderboardRow = React.memo(function LeaderboardRow({ entry, index, isCurrentUser, colors }: { entry: LeaderboardEntry; index: number; isCurrentUser: boolean; colors: ReturnType<typeof useTheme>["colors"] }) {
  const rankColor = entry.rank === 1 ? colors.gold : entry.rank === 2 ? colors.silver : entry.rank === 3 ? colors.bronze : colors.textMuted;
  const rankBg = entry.rank === 1 ? colors.goldBg : entry.rank === 2 ? colors.silverBg : entry.rank === 3 ? colors.bronzeBg : colors.bgInput;
  const regionColor = entry.region === "MX" ? colors.mxOrange : entry.region === "SF" ? colors.sfBlue : colors.accent;
  const source = "ACTUAL";
  const sourceColor = colors.terminalGreen;

  return (
    <View style={[lbStyles.row, {
      backgroundColor: isCurrentUser ? colors.accentSoft : "transparent",
      borderColor: isCurrentUser ? colors.accentDim : "transparent",
      borderWidth: isCurrentUser ? 1 : 0,
      borderRadius: 12,
    }]}>
      <View style={[lbStyles.rankBadge, { backgroundColor: rankBg }]}>
        {entry.rank <= 3 ? (
          <Crown size={12} color={rankColor} />
        ) : (
          <Text style={[lbStyles.rankText, { color: rankColor }]}>{entry.rank}</Text>
        )}
      </View>
      <View style={lbStyles.info}>
        <View style={lbStyles.nameRow}>
          <Text style={[lbStyles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {entry.collectorName}
          </Text>
          <View style={[lbStyles.regionTag, { backgroundColor: regionColor + '14' }]}>
            <Text style={[lbStyles.regionText, { color: regionColor }]}>{entry.region}</Text>
          </View>
          <View style={[lbStyles.sourceTag, { backgroundColor: sourceColor + '16' }]}>
            <Text style={[lbStyles.sourceText, { color: sourceColor }]}>{source}</Text>
          </View>
        </View>
        <View style={lbStyles.statsRow}>
          <Text style={[lbStyles.statVal, { color: colors.accent }]}>{entry.hoursLogged.toFixed(2)}h</Text>
          <Text style={[lbStyles.statSep, { color: colors.border }]}>|</Text>
          <Text style={[lbStyles.statVal, { color: colors.complete }]}>{entry.tasksCompleted} done</Text>
          <Text style={[lbStyles.statSep, { color: colors.border }]}>|</Text>
          <Text style={[lbStyles.statVal, { color: colors.textMuted }]}>{entry.completionRate.toFixed(0)}%</Text>
        </View>
      </View>
      <AnimatedBar value={entry.hoursLogged} maxValue={80} color={rankColor} delay={index * 50 + 200} />
    </View>
  );
});

const lbStyles = StyleSheet.create({
  row: { paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4 },
  rankBadge: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", position: "absolute" as const, left: 12, top: 10 },
  rankText: { fontSize: 12, fontWeight: "700" as const },
  info: { marginLeft: 40, flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },
  name: { fontSize: 14, fontWeight: "600" as const, flex: 1 },
  regionTag: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  regionText: { fontSize: 9, fontWeight: "700" as const, letterSpacing: 0.5 },
  sourceTag: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  sourceText: { fontSize: 9, fontWeight: "700" as const, letterSpacing: 0.4 },
  statsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  statVal: { fontSize: 11, fontWeight: "500" as const },
  statSep: { fontSize: 10 },
  metaText: { fontSize: 10, marginBottom: 4 },
});

const ComparisonCard = React.memo(function ComparisonCard({ mxHours, sfHours, mxCompleted, sfCompleted, colors }: {
  mxHours: number; sfHours: number; mxCompleted: number; sfCompleted: number; colors: ReturnType<typeof useTheme>["colors"];
}) {
  const totalHours = mxHours + sfHours;
  const mxPct = totalHours > 0 ? (mxHours / totalHours) * 100 : 50;

  return (
    <View style={[compStyles.card, { backgroundColor: colors.bgCard, shadowColor: colors.shadow }]}>
      <Text style={[compStyles.title, { color: colors.textMuted }]}>MX vs SF THIS WEEK</Text>
      <View style={compStyles.barWrap}>
        <View style={[compStyles.barLeft, { backgroundColor: colors.mxOrange, width: `${Math.max(mxPct, 5)}%` }]}>
          <Text style={compStyles.barLabel}>MX</Text>
        </View>
        <View style={[compStyles.barRight, { backgroundColor: colors.sfBlue, width: `${Math.max(100 - mxPct, 5)}%` }]}>
          <Text style={compStyles.barLabel}>SF</Text>
        </View>
      </View>
      <View style={compStyles.statsWrap}>
        <View style={compStyles.statCol}>
          <Text style={[compStyles.statValue, { color: colors.mxOrange }]}>{mxHours.toFixed(2)}h</Text>
          <Text style={[compStyles.statSub, { color: colors.textMuted }]}>MX Hours</Text>
        </View>
        <View style={[compStyles.divider, { backgroundColor: colors.border }]} />
        <View style={compStyles.statCol}>
          <Text style={[compStyles.statValue, { color: colors.sfBlue }]}>{sfHours.toFixed(2)}h</Text>
          <Text style={[compStyles.statSub, { color: colors.textMuted }]}>SF Hours</Text>
        </View>
        <View style={[compStyles.divider, { backgroundColor: colors.border }]} />
        <View style={compStyles.statCol}>
          <Text style={[compStyles.statValue, { color: colors.mxOrange }]}>{mxCompleted}</Text>
          <Text style={[compStyles.statSub, { color: colors.textMuted }]}>MX Done</Text>
        </View>
        <View style={[compStyles.divider, { backgroundColor: colors.border }]} />
        <View style={compStyles.statCol}>
          <Text style={[compStyles.statValue, { color: colors.sfBlue }]}>{sfCompleted}</Text>
          <Text style={[compStyles.statSub, { color: colors.textMuted }]}>SF Done</Text>
        </View>
      </View>
    </View>
  );
});

const compStyles = StyleSheet.create({
  card: {
    borderRadius: DesignTokens.radius.xl,
    padding: DesignTokens.spacing.lg,
    marginBottom: DesignTokens.spacing.md,
    ...DesignTokens.shadow.float,
  },
  title: { fontSize: 10, fontWeight: "700" as const, letterSpacing: 1.2, marginBottom: 10 },
  barWrap: { flexDirection: "row", height: 24, borderRadius: 6, overflow: "hidden", marginBottom: 12 },
  barLeft: { justifyContent: "center", alignItems: "center" },
  barRight: { justifyContent: "center", alignItems: "center" },
  barLabel: { color: "#fff", fontSize: 10, fontWeight: "800" as const, letterSpacing: 1 },
  statsWrap: { flexDirection: "row", alignItems: "center" },
  statCol: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 15, fontWeight: "700" as const },
  statSub: { fontSize: 9, marginTop: 2 },
  divider: { width: 1, height: 24 },
});

export default function StatsScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { selectedCollector, selectedCollectorName, selectedRig, todayLog, configured, isAdmin } = useCollection();
  const [refreshing, setRefreshing] = useState(false);
  const [lbTab, setLbTab] = useState<LeaderboardTab>("combined");
  const [lbPeriod, setLbPeriod] = useState<LeaderboardPeriod>("thisWeek");
  const [lbVisibleCount, setLbVisibleCount] = useState(10);
  const [carryoverPendingId, setCarryoverPendingId] = useState<string | null>(null);
  const [carryoverHoursInput, setCarryoverHoursInput] = useState<Record<string, string>>({});
  const syncPulse = useRef(new Animated.Value(0)).current;

  const normalizedName = useMemo(() => normalizeCollectorName(selectedCollectorName), [selectedCollectorName]);

  const statsQuery = useQuery<CollectorStats>({
    queryKey: ["collectorStats", selectedCollectorName],
    queryFn: () => fetchCollectorStats(selectedCollectorName),
    enabled: configured && !!selectedCollectorName,
    staleTime: 60000,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  const profileQuery = useQuery<CollectorProfile>({
    queryKey: ["collectorProfile", selectedCollectorName],
    queryFn: () => fetchCollectorProfile(selectedCollectorName),
    enabled: configured && !!selectedCollectorName,
    staleTime: 60000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const adminStartPlanQuery = useQuery<AdminStartPlanData>({
    queryKey: ["adminStartPlan"],
    queryFn: fetchAdminStartPlan,
    enabled: configured && isAdmin,
    staleTime: 90000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const leaderboardQuery = useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard", lbPeriod],
    queryFn: () => fetchLeaderboard(lbPeriod),
    enabled: configured,
    staleTime: 120000,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  const taskActualsQuery = useQuery<TaskActualRow[]>({
    queryKey: ["taskActuals", "statsRecommendations"],
    queryFn: fetchTaskActualsData,
    enabled: configured,
    staleTime: 120000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const dailyCarryoverQuery = useQuery<DailyCarryoverItem[]>({
    queryKey: ["dailyCarryover", selectedCollectorName],
    queryFn: () => fetchDailyCarryover(selectedCollectorName),
    enabled: configured && !!selectedCollectorName,
    staleTime: 20000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const todayDateStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  // Only count entries assigned today. Carryover tasks from previous days
  // (assignedDate !== today) must not inflate today's summary numbers.
  const todayOnlyLog = useMemo(
    () => todayLog.filter((e) => e.assignedDate === todayDateStr),
    [todayLog, todayDateStr],
  );

  const localStats = useMemo(() => {
    const completed = todayOnlyLog.filter((e) => e.status === "Completed").length;
    const totalLogged = todayOnlyLog.reduce((s, e) => s + e.loggedHours, 0);
    const active = todayOnlyLog.filter((e) => e.status === "In Progress" || e.status === "Partial").length;
    return { completed, totalLogged, active, total: todayOnlyLog.length };
  }, [todayOnlyLog]);

  const leaderboard = useMemo<LeaderboardEntry[]>(() => {
    return leaderboardQuery.data ?? [];
  }, [leaderboardQuery.data]);

  const { sfEntries, mxEntries, regionStats } = useMemo(() => {
    const sf: LeaderboardEntry[] = [];
    const mx: LeaderboardEntry[] = [];
    for (const e of leaderboard) {
      if (e.region === "SF") sf.push({ ...e });
      else mx.push({ ...e, region: "MX" });
    }
    sf.sort((a, b) => b.hoursLogged - a.hoursLogged);
    mx.sort((a, b) => b.hoursLogged - a.hoursLogged);

    const sfRanked = sf.map((e, i) => ({ ...e, rank: i + 1 }));
    const mxRanked = mx.map((e, i) => ({ ...e, rank: i + 1 }));

    const mxHours = mx.reduce((s, e) => s + e.hoursLogged, 0);
    const sfHours = sf.reduce((s, e) => s + e.hoursLogged, 0);
    const mxCompleted = mx.reduce((s, e) => s + e.tasksCompleted, 0);
    const sfCompleted = sf.reduce((s, e) => s + e.tasksCompleted, 0);

    return {
      sfEntries: sfRanked,
      mxEntries: mxRanked,
      regionStats: { mxHours, sfHours, mxCompleted, sfCompleted },
    };
  }, [leaderboard]);

  const recentCompleted = useMemo(() => {
    return leaderboard
      .filter(e => e.tasksCompleted > 0)
      .sort((a, b) => b.tasksCompleted - a.tasksCompleted)
      .slice(0, 8)
      .map(e => ({
        name: e.collectorName,
        tasks: e.tasksCompleted,
        region: e.region,
      }));
  }, [leaderboard]);

  const recommendedTasks = useMemo(() => {
    const rows = taskActualsQuery.data ?? [];
    return rows
      .filter((row) => {
        const remaining = Number(row.remainingHours) || 0;
        const status = String(row.status ?? "").toUpperCase();
        if (remaining <= 0) return false;
        if (status === "DONE" || status === "COMPLETED" || status === "COMPLETE") return false;
        return true;
      })
      .sort((a, b) => (Number(b.remainingHours) || 0) - (Number(a.remainingHours) || 0))
      .slice(0, 6);
  }, [taskActualsQuery.data]);

  const dailyCarryover = useMemo(() => dailyCarryoverQuery.data ?? [], [dailyCarryoverQuery.data]);

  const handleCarryoverAction = useCallback(async (
    mode: "report" | "reportHours" | "cancel",
    item: DailyCarryoverItem,
    manualHours?: number,
  ) => {
    if (!selectedCollectorName) return;
    setCarryoverPendingId(item.assignmentId);
    try {
      if (mode === "cancel") {
        await cancelDailyCarryover({
          collector: selectedCollectorName,
          task: item.taskName,
          assignmentId: item.assignmentId,
        });
      } else {
        // "report" uses the GAS-detected actual hours; "reportHours" uses manual input
        const hours = mode === "reportHours" ? (manualHours ?? 0) : Number(item.actualHours) || 0;
        await reportDailyCarryover({
          collector: selectedCollectorName,
          task: item.taskName,
          assignmentId: item.assignmentId,
          actualHours: hours,
        });
      }
      // Clear manual input for this item
      setCarryoverHoursInput((prev) => {
        const next = { ...prev };
        delete next[item.assignmentId];
        return next;
      });
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["dailyCarryover", selectedCollectorName] }),
        queryClient.invalidateQueries({ queryKey: ["todayLog", selectedCollectorName] }),
        queryClient.invalidateQueries({ queryKey: ["collectorStats", selectedCollectorName] }),
        queryClient.invalidateQueries({ queryKey: ["collectorProfile", selectedCollectorName] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
      ]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert("Carryover update failed", err instanceof Error ? err.message : "Unknown error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setCarryoverPendingId(null);
    }
  }, [queryClient, selectedCollectorName]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    clearApiCache();
    try {
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["collectorStats", selectedCollectorName] }),
        queryClient.invalidateQueries({ queryKey: ["collectorProfile", selectedCollectorName] }),
        queryClient.invalidateQueries({ queryKey: ["dailyCarryover", selectedCollectorName] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
        queryClient.invalidateQueries({ queryKey: ["adminStartPlan"] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, selectedCollectorName]);

  const stats = statsQuery.data;
  const profile = profileQuery.data;
  const adminStartPlan = adminStartPlanQuery.data;
  // todayActualHours from GAS is Redash-verified data; it lags by at least one
  // pipeline cycle and reads 0 for the current day. Fall back to the sum of
  // today-only logged hours so the stat is never misleadingly empty.
  const todayActualUploaded = useMemo(() => {
    const fromGas = Number(stats?.todayActualHours);
    if (Number.isFinite(fromGas) && fromGas > 0) return fromGas;
    return localStats.totalLogged;
  }, [stats?.todayActualHours, localStats.totalLogged]);
  const cardShadow = useMemo(() => ({
    shadowColor: colors.shadow,
    ...DesignTokens.shadow.float,
  }), [colors]);
  const refreshControl = Platform.OS === "web"
    ? undefined
    : <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} colors={[colors.accent]} />;

  const tabItems: { key: LeaderboardTab; label: string; color: string }[] = [
    { key: "combined", label: "All", color: colors.accent },
    { key: "mx", label: "MX", color: colors.mxOrange },
    { key: "sf", label: "SF", color: colors.sfBlue },
  ];
  const periodItems: { key: LeaderboardPeriod; label: string }[] = [
    { key: "thisWeek", label: "This Week" },
    { key: "lastWeek", label: "Last Week" },
  ];
  const periodLabel = lbPeriod === "thisWeek" ? "THIS WEEK" : "LAST WEEK";

  const currentLbEntries = lbTab === "sf" ? sfEntries : lbTab === "mx" ? mxEntries : leaderboard;
  const visibleLbEntries = useMemo(
    () => currentLbEntries.slice(0, lbVisibleCount),
    [currentLbEntries, lbVisibleCount]
  );

  const isInitialLoad = leaderboardQuery.isLoading && !leaderboardQuery.data;
  const hasLeaderboardError = leaderboardQuery.isError && !leaderboardQuery.data && !leaderboardQuery.isLoading;
  const hasStatsError = statsQuery.isError && !statsQuery.data && !statsQuery.isLoading;
  const isStatsLoading = statsQuery.isLoading && !statsQuery.data;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(syncPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(syncPulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [syncPulse]);

  useEffect(() => {
    setLbVisibleCount(10);
  }, [lbTab, lbPeriod]);

  useEffect(() => {
    setLbVisibleCount((prev) => {
      const cap = Math.max(currentLbEntries.length, 10);
      return Math.min(prev, cap);
    });
  }, [currentLbEntries.length]);

  if (!selectedCollector) {
    return (
      <ScreenContainer>
        <View style={styles.empty}>
          <Inbox size={44} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Collector Selected</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Set your profile in the Tools tab to view stats</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {/* Large-title header — no card container */}
      <View style={styles.pageHeader}>
        <View>
          <View style={styles.brandRow}>
            <Image
              source={require("../../../assets/images/icon.png")}
              style={styles.brandLogo}
              contentFit="contain"
            />
            <Text
              style={[styles.brandText, { color: colors.accent, fontFamily: "Lexend_700Bold" }]}
            >
              Stats
            </Text>
          </View>
          <Text
            style={[
              styles.brandSub,
              { color: colors.textSecondary, fontFamily: "Lexend_400Regular" },
            ]}
          >
            {normalizeCollectorName(selectedCollector.name)}
          </Text>
        </View>
        <View style={styles.pageHeaderRight}>
          {selectedRig !== "" && (
            <Text style={[styles.rigBadge, { color: colors.textMuted }]}>{selectedRig}</Text>
          )}
          {Platform.OS === "web" && (
            <TouchableOpacity
              style={[
                styles.webRefreshBtn,
                { backgroundColor: colors.accentSoft, borderColor: colors.accentDim },
              ]}
              onPress={handleRefresh}
              activeOpacity={0.7}
              disabled={refreshing}
            >
              <RefreshCw size={15} color={colors.accent} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Calendar size={12} color={colors.accent} />
        <Text style={[styles.sectionLabel, { color: colors.accent }]}>TODAY</Text>
      </View>

      <View style={styles.heroGrid}>
        <HeroStat label="Assigned" value={String(localStats.total)} icon={<Target size={18} color={colors.accent} />} color={colors.accent} index={0} />
        <HeroStat label="Completed" value={String(localStats.completed)} icon={<CheckCircle size={18} color={colors.complete} />} color={colors.complete} index={1} />
        <HeroStat label="Logged Today" value={`${todayActualUploaded.toFixed(2)}h`} icon={<Upload size={18} color={colors.statusPending} />} color={colors.statusPending} index={2} />
        <HeroStat label="Active" value={String(localStats.active)} icon={<TrendingUp size={18} color={colors.accentLight} />} color={colors.accentLight} index={3} />
      </View>

      {dailyCarryover.length > 0 && (
        <View style={[styles.carryoverCard, { backgroundColor: colors.bgCard, ...cardShadow }]}>
          <View style={styles.carryoverHeader}>
            <AlertTriangle size={12} color={colors.alertYellow} />
            <Text style={[styles.carryoverTitle, { color: colors.alertYellow }]}>INCOMPLETE FROM YESTERDAY</Text>
          </View>
          {dailyCarryover.map((item, idx) => {
            const pending = carryoverPendingId === item.assignmentId;
            const autoHours = Number(item.actualHours || 0);
            const manualHoursStr = carryoverHoursInput[item.assignmentId] ?? "";
            const manualHours = parseFloat(manualHoursStr);
            const hasManualHours = manualHoursStr.trim().length > 0 && manualHours > 0;
            return (
              <View
                key={`carry_${item.assignmentId}_${idx}`}
                style={[styles.carryoverRow, { borderBottomColor: colors.border }, idx === dailyCarryover.length - 1 && styles.carryoverLast]}
              >
                <Text style={[styles.carryoverTask, { color: colors.textPrimary }]} numberOfLines={1}>{item.taskName}</Text>
                <Text style={[styles.carryoverMeta, { color: colors.textMuted }]}>
                  {item.assignedDate} · CB Actual {autoHours.toFixed(2)}h
                </Text>
                {/* Manual hours input row */}
                <View style={[styles.carryoverHoursRow, { borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.carryoverHoursInput, { backgroundColor: colors.bgInput, color: colors.textPrimary, borderColor: colors.border }]}
                    value={manualHoursStr}
                    onChangeText={(v) => setCarryoverHoursInput((prev) => ({ ...prev, [item.assignmentId]: v }))}
                    placeholder="Enter hours"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                  />
                  <TouchableOpacity
                    style={[styles.carryoverBtn, styles.carryoverHoursBtn, {
                      backgroundColor: hasManualHours ? colors.completeBg : colors.bgInput,
                      borderColor: hasManualHours ? colors.complete + "40" : colors.border,
                      opacity: pending || !hasManualHours ? 0.6 : 1,
                    }]}
                    onPress={() => hasManualHours && handleCarryoverAction("reportHours", item, manualHours)}
                    disabled={pending || !hasManualHours}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.carryoverBtnText, { color: hasManualHours ? colors.complete : colors.textMuted }]}>Report Hours</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.carryoverActions}>
                  <TouchableOpacity
                    style={[styles.carryoverBtn, { backgroundColor: colors.completeBg, borderColor: colors.complete + "40", opacity: pending ? 0.7 : 1 }]}
                    onPress={() => handleCarryoverAction("report", item)}
                    disabled={pending}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.carryoverBtnText, { color: colors.complete }]}>Complete ({autoHours.toFixed(2)}h)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.carryoverBtn, { backgroundColor: colors.cancelBg, borderColor: colors.cancel + "40", opacity: pending ? 0.7 : 1 }]}
                    onPress={() => handleCarryoverAction("cancel", item)}
                    disabled={pending}
                    activeOpacity={0.8}
                  >
                    <XCircle size={12} color={colors.cancel} />
                    <Text style={[styles.carryoverBtnText, { color: colors.cancel }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {profile && (
        <View style={[styles.profileCard, { backgroundColor: colors.bgCard, ...cardShadow }]}>
          <View style={styles.profileTop}>
            <View style={[styles.profileAvatar, { backgroundColor: colors.accentSoft, borderColor: colors.accentDim }]}>
              <Text style={[styles.profileAvatarText, { color: colors.accent }]}>
                {profile.collectorName.slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileMain}>
              <Text style={[styles.profileName, { color: colors.textPrimary }]}>{profile.collectorName}</Text>
              <Text style={[styles.profileMeta, { color: colors.textMuted }]}>
                {profile.weeklyActualHours.toFixed(2)}h this week · {profile.totalActualHours.toFixed(2)}h all time
              </Text>
            </View>
            <View style={[styles.profileMedalCount, { backgroundColor: colors.goldBg }]}>
              <Text style={[styles.profileMedalText, { color: colors.gold }]}>{profile.medalsCount} medals</Text>
            </View>
          </View>

          <View style={styles.profileStatsGrid}>
            <View style={[styles.profileStatBox, { backgroundColor: colors.bgInput }]}>
              <Text style={[styles.profileStatValue, { color: colors.complete }]}>{profile.completionRate}%</Text>
              <Text style={[styles.profileStatLabel, { color: colors.textMuted }]}>Completion</Text>
            </View>
            <View style={[styles.profileStatBox, { backgroundColor: colors.bgInput }]}>
              <Text style={[styles.profileStatValue, { color: colors.accent }]}>{profile.longestRecordingHours.toFixed(2)}h</Text>
              <Text style={[styles.profileStatLabel, { color: colors.textMuted }]}>Longest Recording</Text>
            </View>
            <View style={[styles.profileStatBox, { backgroundColor: colors.bgInput }]}>
              <Text style={[styles.profileStatValue, { color: colors.statusPending }]}>
                {profile.shortestDowntimeMinutes > 0 ? `${profile.shortestDowntimeMinutes.toFixed(1)}m` : "--"}
              </Text>
              <Text style={[styles.profileStatLabel, { color: colors.textMuted }]}>Shortest Downtime</Text>
            </View>
          </View>

          <View style={styles.awardsRow}>
            {[0, 1, 2].map((slot) => {
              const award = profile.pinnedAwards?.[slot];
              return (
                <View
                  key={`award_slot_${slot}`}
                  style={[styles.awardChip, {
                    borderColor: award ? colors.gold + "44" : colors.border,
                    backgroundColor: award ? colors.goldBg : colors.bgInput,
                  }]}
                >
                  <Text
                    style={[styles.awardChipText, { color: award ? colors.gold : colors.textMuted }]}
                    numberOfLines={1}
                  >
                    {award ? award.award : "Empty Medal Slot"}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {isAdmin && adminStartPlan && (
        <View style={[styles.startPlanCard, { backgroundColor: colors.bgCard, ...cardShadow }]}>
          <View style={styles.startPlanHeader}>
            <Target size={12} color={colors.alertYellow} />
            <Text style={[styles.startPlanTitle, { color: colors.alertYellow }]}>
              START OF DAY PLAN ({adminStartPlan.yesterday})
            </Text>
          </View>
          {(["SF", "MX"] as const).map((region) => (
            <View key={`plan_${region}`} style={styles.startPlanRegion}>
              <Text style={[styles.startPlanRegionLabel, { color: region === "SF" ? colors.sfBlue : colors.mxOrange }]}>
                {region} TEAM
              </Text>
              {(adminStartPlan.regions?.[region] ?? []).slice(0, 8).map((entry, idx) => (
                <View key={`plan_${region}_${idx}`} style={[styles.startPlanRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.startPlanCollector, { color: colors.textPrimary }]}>{entry.collector}</Text>
                  <Text style={[styles.startPlanTasks, { color: colors.textSecondary }]} numberOfLines={2}>
                    {(entry.suggested ?? []).length > 0 ? (entry.suggested ?? []).join(" · ") : "No task suggestion"}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      {stats && stats.weeklyLoggedHours > 0 && (
        <>
      <View style={[styles.sectionHeader, { marginTop: 20 }]}>
        <Calendar size={12} color={colors.complete} />
        <Text style={[styles.sectionLabel, { color: colors.complete }]}>THIS WEEK (MON-SUN)</Text>
      </View>
      <View style={[styles.weekCard, { backgroundColor: colors.bgCard, ...cardShadow }]}>
        <View style={styles.weekRow}>
          <View style={styles.weekItem}>
            <Text style={[styles.weekVal, { color: colors.accent }]}>{stats.weeklyLoggedHours.toFixed(2)}h</Text>
            <Text style={[styles.weekLbl, { color: colors.textMuted }]}>Hours</Text>
          </View>
              <View style={[styles.weekSep, { backgroundColor: colors.border }]} />
              <View style={styles.weekItem}>
                <Text style={[styles.weekVal, { color: colors.complete }]}>{stats.weeklyCompleted}</Text>
                <Text style={[styles.weekLbl, { color: colors.textMuted }]}>Done</Text>
              </View>
              <View style={[styles.weekSep, { backgroundColor: colors.border }]} />
              <View style={styles.weekItem}>
                <Text style={[styles.weekVal, { color: colors.textPrimary }]}>{stats.avgHoursPerTask.toFixed(2)}h</Text>
                <Text style={[styles.weekLbl, { color: colors.textMuted }]}>Avg/Task</Text>
              </View>
              <View style={[styles.weekSep, { backgroundColor: colors.border }]} />
              <View style={styles.weekItem}>
                <Text style={[styles.weekVal, { color: colors.complete }]}>{stats.completionRate.toFixed(0)}%</Text>
                <Text style={[styles.weekLbl, { color: colors.textMuted }]}>Rate</Text>
              </View>
            </View>
          </View>
        </>
      )}

      {recommendedTasks.length > 0 && (
        <View style={[styles.recommendCard, { backgroundColor: colors.bgCard, ...cardShadow }]}>
          <View style={styles.recommendHeader}>
            <Target size={12} color={colors.mxOrange} />
            <Text style={[styles.recommendTitle, { color: colors.mxOrange }]}>RECOMMENDED NEXT TASKS</Text>
          </View>
          {recommendedTasks.map((task, idx) => (
            <View
              key={`rec_${idx}`}
              style={[styles.recommendRow, { borderBottomColor: colors.border }, idx === recommendedTasks.length - 1 && styles.recommendLast]}
            >
              <Text style={[styles.recommendName, { color: colors.textPrimary }]} numberOfLines={1}>
                {task.taskName}
              </Text>
              <Text style={[styles.recommendMeta, { color: colors.statusPending }]}>
                {Number(task.remainingHours).toFixed(2)}h left
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.sectionHeader, { marginTop: 24 }]}>
        <Trophy size={12} color={colors.gold} />
        <Text style={[styles.sectionLabel, { color: colors.gold }]}>{`LEADERBOARD · ${periodLabel}`}</Text>
      </View>

      <View style={[styles.periodSwitchRow, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        {periodItems.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[styles.periodBtn, lbPeriod === item.key && { backgroundColor: colors.accentSoft, borderColor: colors.accentDim }]}
            onPress={() => setLbPeriod(item.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.periodBtnText, {
              color: lbPeriod === item.key ? colors.accent : colors.textMuted,
              fontWeight: lbPeriod === item.key ? "700" as const : "500" as const,
            }]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.lbTabRow, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        {tabItems.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.lbTabBtn, lbTab === tab.key && { backgroundColor: tab.color + '18', borderColor: tab.color + '40' }]}
            onPress={() => setLbTab(tab.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.lbTabText, {
              color: lbTab === tab.key ? tab.color : colors.textMuted,
              fontWeight: lbTab === tab.key ? "700" as const : "500" as const,
            }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {lbTab === "combined" && leaderboard.length > 0 && (
        <ComparisonCard
          mxHours={regionStats.mxHours}
          sfHours={regionStats.sfHours}
          mxCompleted={regionStats.mxCompleted}
          sfCompleted={regionStats.sfCompleted}
          colors={colors}
        />
      )}

      {isInitialLoad ? (
        <View style={[styles.lbEmpty, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={styles.loadingRow}>
            <Animated.View style={[styles.inlineSyncDot, {
              backgroundColor: colors.statusPending,
              opacity: syncPulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
            }]} />
            <Text style={[styles.lbEmptyText, { color: colors.textMuted }]}>Syncing leaderboard...</Text>
          </View>
        </View>
      ) : hasLeaderboardError ? (
        <TouchableOpacity
          style={[styles.lbEmpty, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
          onPress={() => leaderboardQuery.refetch()}
          activeOpacity={0.7}
        >
          <Text style={[styles.lbEmptyText, { color: colors.textMuted }]}>Failed to load leaderboard</Text>
          <Text style={[styles.lbEmptyRetry, { color: colors.accent }]}>Tap to retry</Text>
        </TouchableOpacity>
      ) : currentLbEntries.length > 0 ? (
        <View style={[styles.leaderboardCard, { backgroundColor: colors.bgCard, ...cardShadow }]}>
          <View style={styles.lbHeaderRow}>
            <Text style={[styles.lbHeaderText, { color: colors.textMuted }]}>
              {`${lbTab === "sf" ? "San Francisco" : lbTab === "mx" ? "Los Cabos (MX)" : "Combined"} Rankings · ${periodLabel}`}
            </Text>
            <Medal size={14} color={colors.gold} />
          </View>
          {visibleLbEntries.map((entry, idx) => (
            <LeaderboardRow
              key={`lb_${lbPeriod}_${lbTab}_${idx}`}
              entry={entry}
              index={idx}
              isCurrentUser={normalizeCollectorName(entry.collectorName).toLowerCase() === normalizedName.toLowerCase()}
              colors={colors}
            />
          ))}
          {currentLbEntries.length > 10 && (
            <TouchableOpacity
              style={[styles.lbMoreBtn, { borderColor: colors.border, backgroundColor: colors.bgInput }]}
              onPress={() => {
                setLbVisibleCount((prev) =>
                  prev >= currentLbEntries.length ? 10 : Math.min(currentLbEntries.length, prev + 10)
                );
              }}
              activeOpacity={0.75}
            >
              <Text style={[styles.lbMoreText, { color: colors.accent }]}>
                {lbVisibleCount >= currentLbEntries.length ? "Show Less" : "Load More"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={[styles.lbEmpty, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Text style={[styles.lbEmptyText, { color: colors.textMuted }]}>No leaderboard data available</Text>
          <TouchableOpacity onPress={() => leaderboardQuery.refetch()} activeOpacity={0.7}>
            <Text style={[styles.lbEmptyRetry, { color: colors.accent }]}>Tap to refresh</Text>
          </TouchableOpacity>
        </View>
      )}

      {lbTab === "combined" && recentCompleted.length > 0 && (
        <View style={[styles.recentCard, { backgroundColor: colors.bgCard, ...cardShadow }]}>
          <Text style={[styles.recentTitle, { color: colors.textMuted }]}>{`TOP COLLECTORS · ${periodLabel}`}</Text>
          {recentCompleted.map((item, idx) => {
            const regionColor = item.region === "MX" ? colors.mxOrange : colors.sfBlue;
            return (
              <View key={`rc_${idx}`} style={[styles.recentRow, { borderBottomColor: colors.border }, idx === recentCompleted.length - 1 && styles.recentRowLast]}>
                <View style={[styles.recentDot, { backgroundColor: regionColor }]} />
                <Text style={[styles.recentName, { color: colors.textSecondary }]} numberOfLines={1}>{item.name}</Text>
                <View style={[styles.recentRegionTag, { backgroundColor: regionColor + '14' }]}>
                  <Text style={[styles.recentRegionText, { color: regionColor }]}>{item.region}</Text>
                </View>
                <Text style={[styles.recentTasks, { color: colors.complete }]}>{item.tasks} done</Text>
              </View>
            );
          })}
        </View>
      )}

      {isStatsLoading && (
        <View style={styles.loadingWrap}>
          <Animated.View style={[styles.inlineSyncDot, {
            backgroundColor: colors.statusPending,
            opacity: syncPulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
          }]} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Syncing stats...</Text>
        </View>
      )}

      {hasStatsError && (
        <TouchableOpacity
          style={[styles.lbEmpty, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
          onPress={() => statsQuery.refetch()}
          activeOpacity={0.7}
        >
          <Text style={[styles.lbEmptyText, { color: colors.textMuted }]}>Failed to load stats</Text>
          <Text style={[styles.lbEmptyRetry, { color: colors.accent }]}>Tap to retry</Text>
        </TouchableOpacity>
      )}

      {stats && (
        <>
          <View style={[styles.sectionHeader, { marginTop: 24 }]}>
            <TrendingUp size={12} color={colors.textMuted} />
            <Text style={[styles.sectionLabelMuted, { color: colors.textMuted }]}>ALL TIME</Text>
          </View>
          <View style={[styles.allTimeCard, { backgroundColor: colors.bgCard, ...cardShadow }]}>
            <View style={styles.allTimeGrid}>
              <View style={styles.allTimeItem}>
                <Text style={[styles.allTimeVal, { color: colors.textPrimary }]}>{stats.totalAssigned}</Text>
                <Text style={[styles.allTimeLbl, { color: colors.textMuted }]}>Tasks</Text>
              </View>
              <View style={[styles.allTimeSep, { backgroundColor: colors.border }]} />
              <View style={styles.allTimeItem}>
                <Text style={[styles.allTimeVal, { color: colors.complete }]}>{stats.totalCompleted}</Text>
                <Text style={[styles.allTimeLbl, { color: colors.textMuted }]}>Done</Text>
              </View>
              <View style={[styles.allTimeSep, { backgroundColor: colors.border }]} />
              <View style={styles.allTimeItem}>
                <Text style={[styles.allTimeVal, { color: colors.accent }]}>{stats.totalLoggedHours.toFixed(2)}h</Text>
                <Text style={[styles.allTimeLbl, { color: colors.textMuted }]}>Hours</Text>
              </View>
              <View style={[styles.allTimeSep, { backgroundColor: colors.border }]} />
              <View style={styles.allTimeItem}>
                <Text style={[styles.allTimeVal, { color: colors.complete }]}>{stats.completionRate.toFixed(0)}%</Text>
                <Text style={[styles.allTimeLbl, { color: colors.textMuted }]}>Rate</Text>
              </View>
            </View>
            <View style={[styles.allTimeDivider, { backgroundColor: colors.border }]} />
            <AnimatedBar value={stats.totalCompleted} maxValue={stats.totalAssigned || 1} color={colors.complete} delay={400} />
            <Text style={[styles.allTimeSub, { color: colors.textMuted }]}>
              {stats.totalCompleted} of {stats.totalAssigned} tasks completed
            </Text>
          </View>

          {stats.topTasks && stats.topTasks.length > 0 && (
            <View style={[styles.topTasksCard, { backgroundColor: colors.bgCard, ...cardShadow }]}>
              <Text style={[styles.topTasksTitle, { color: colors.textMuted }]}>Recent Tasks</Text>
              {stats.topTasks.slice(0, 8).map((task, idx) => {
                const dotColor = task.status === "Completed" ? colors.statusActive : task.status === "Canceled" ? colors.statusCancelled : colors.accent;
                return (
                  <View key={`task_${idx}`} style={[styles.topTaskRow, { borderBottomColor: colors.border }, idx === Math.min(stats.topTasks.length - 1, 7) && styles.topTaskLast]}>
                    <View style={[styles.topTaskDot, { backgroundColor: dotColor }]} />
                    <Text style={[styles.topTaskName, { color: colors.textSecondary }]} numberOfLines={1}>{task.name}</Text>
                    <Text style={[styles.topTaskHours, { color: dotColor }]}>{Number(task.hours).toFixed(2)}h</Text>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}

      <View style={styles.spacer} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: DesignTokens.spacing.xl,
    paddingTop: DesignTokens.spacing.lg,
    paddingBottom: 150,
    gap: DesignTokens.spacing.md,
  },
  // Header — plain text, no card container
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingVertical: DesignTokens.spacing.sm,
    marginBottom: DesignTokens.spacing.xs,
  },
  headerGlow: { display: "none" },
  pageHeaderRight: { alignItems: "flex-end", gap: DesignTokens.spacing.xs + 2 },
  webRefreshBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTag: {
    alignSelf: "flex-start",
    borderRadius: DesignTokens.radius.xs,
    borderWidth: 1,
    paddingHorizontal: DesignTokens.spacing.sm,
    paddingVertical: 3,
    marginBottom: 2,
  },
  headerTagText: {
    fontSize: DesignTokens.fontSize.caption2,
    fontWeight: "700" as const,
    letterSpacing: 0.7,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandLogo: { width: 28, height: 28, borderRadius: 8 },
  brandText: {
    fontSize: DesignTokens.fontSize.largeTitle,
    fontWeight: "700" as const,
    letterSpacing: 0.1,
  },
  brandSub: {
    fontSize: DesignTokens.fontSize.footnote,
    fontWeight: "500" as const,
    letterSpacing: 0.3,
    marginLeft: 38,
  },
  rigBadge: {
    fontSize: DesignTokens.fontSize.caption1,
    letterSpacing: 0.4,
    fontWeight: "500" as const,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: DesignTokens.spacing.sm,
    paddingHorizontal: 2,
  },
  sectionLabel: {
    fontSize: DesignTokens.fontSize.caption1,
    letterSpacing: 0.8,
    fontWeight: "700" as const,
    textTransform: "uppercase",
  },
  sectionLabelMuted: {
    fontSize: DesignTokens.fontSize.caption1,
    letterSpacing: 0.8,
    fontWeight: "600" as const,
    textTransform: "uppercase",
  },
  heroGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  // Hero cards — shadow only, no border
  heroCard: {
    flex: 1,
    minWidth: "44%",
    borderRadius: DesignTokens.radius.xl,
    padding: DesignTokens.spacing.lg,
    ...DesignTokens.shadow.float,
  },
  heroIconWrap: {
    width: 38,
    height: 38,
    borderRadius: DesignTokens.radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  heroValue: { fontSize: 26, letterSpacing: -0.5, fontWeight: "700" as const },
  heroLabel: {
    fontSize: DesignTokens.fontSize.caption1,
    marginTop: 3,
    fontWeight: "500" as const,
  },
  // Carryover card
  carryoverCard: {
    borderRadius: DesignTokens.radius.xl,
    padding: DesignTokens.spacing.lg,
    ...DesignTokens.shadow.float,
  },
  carryoverHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  carryoverTitle: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "700" as const,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  carryoverRow: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  carryoverLast: { borderBottomWidth: 0, paddingBottom: 2 },
  carryoverTask: { fontSize: DesignTokens.fontSize.footnote, fontWeight: "700" as const },
  carryoverMeta: { fontSize: DesignTokens.fontSize.caption1, marginTop: 3, marginBottom: 8 },
  carryoverHoursRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 6,
    alignItems: "center",
  },
  carryoverHoursInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: DesignTokens.fontSize.footnote,
  },
  carryoverHoursBtn: {
    flexShrink: 0,
    paddingHorizontal: 12,
  },
  carryoverActions: { flexDirection: "row", gap: 8 },
  carryoverBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.sm,
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  carryoverBtnText: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "700" as const,
    letterSpacing: 0.2,
  },
  // Profile card
  profileCard: {
    borderRadius: DesignTokens.radius.xl,
    padding: DesignTokens.spacing.lg,
    ...DesignTokens.shadow.float,
  },
  profileTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarText: {
    fontSize: DesignTokens.fontSize.headline,
    fontWeight: "700" as const,
    letterSpacing: 0.3,
  },
  profileMain: { flex: 1 },
  profileName: { fontSize: DesignTokens.fontSize.subhead + 1, fontWeight: "700" as const },
  profileMeta: { fontSize: DesignTokens.fontSize.caption1, marginTop: 3 },
  profileMedalCount: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  profileMedalText: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "700" as const,
    letterSpacing: 0.2,
  },
  profileStatsGrid: { flexDirection: "row", gap: 8, marginBottom: 10 },
  profileStatBox: {
    flex: 1,
    borderRadius: DesignTokens.radius.sm,
    paddingVertical: 10,
    alignItems: "center",
  },
  profileStatValue: { fontSize: DesignTokens.fontSize.footnote, fontWeight: "700" as const },
  profileStatLabel: {
    fontSize: DesignTokens.fontSize.caption2,
    marginTop: 3,
    letterSpacing: 0.2,
  },
  awardsRow: { flexDirection: "row", gap: 8 },
  awardChip: {
    flex: 1,
    borderRadius: DesignTokens.radius.sm,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  awardChipText: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "600" as const,
    textAlign: "center",
  },
  // Start plan card
  startPlanCard: {
    borderRadius: DesignTokens.radius.xl,
    padding: DesignTokens.spacing.lg,
    ...DesignTokens.shadow.float,
  },
  startPlanHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  startPlanTitle: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "700" as const,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  startPlanRegion: { marginTop: 8 },
  startPlanRegionLabel: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "700" as const,
    letterSpacing: 0.6,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  startPlanRow: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  startPlanCollector: { fontSize: DesignTokens.fontSize.footnote, fontWeight: "700" as const, marginBottom: 2 },
  startPlanTasks: { fontSize: DesignTokens.fontSize.caption1, lineHeight: 17 },
  // Week stats card
  weekCard: {
    borderRadius: DesignTokens.radius.xl,
    padding: 18,
    ...DesignTokens.shadow.float,
  },
  weekRow: { flexDirection: "row", alignItems: "center" },
  weekSep: { width: StyleSheet.hairlineWidth, height: 32 },
  weekItem: { flex: 1, alignItems: "center" },
  weekVal: { fontSize: DesignTokens.fontSize.callout, fontWeight: "600" as const },
  weekLbl: { fontSize: DesignTokens.fontSize.caption2, marginTop: 4 },
  // Period switcher
  periodSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: DesignTokens.radius.md,
    borderWidth: 1,
    padding: 5,
  },
  periodBtn: {
    flex: 1,
    borderRadius: DesignTokens.radius.xs,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  periodBtnText: {
    fontSize: DesignTokens.fontSize.caption1,
    letterSpacing: 0.2,
  },
  // Leaderboard tabs
  lbTabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: DesignTokens.radius.md,
    borderWidth: 1,
    padding: 5,
  },
  lbTabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: DesignTokens.radius.xs,
    borderWidth: 1,
    borderColor: "transparent",
  },
  lbTabText: { fontSize: DesignTokens.fontSize.caption1, letterSpacing: 0.2 },
  // Leaderboard card
  leaderboardCard: {
    borderRadius: DesignTokens.radius.xl,
    padding: 14,
    ...DesignTokens.shadow.float,
  },
  lbHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingBottom: DesignTokens.spacing.sm,
    marginBottom: 4,
  },
  lbHeaderText: {
    fontSize: DesignTokens.fontSize.caption2,
    fontWeight: "600" as const,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  lbEmpty: {
    borderRadius: DesignTokens.radius.lg,
    padding: DesignTokens.spacing.xl,
    borderWidth: 1,
    alignItems: "center",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: DesignTokens.spacing.sm,
  },
  inlineSyncDot: { width: 7, height: 7, borderRadius: 4 },
  lbEmptyText: { fontSize: DesignTokens.fontSize.footnote },
  lbEmptyRetry: {
    fontSize: DesignTokens.fontSize.caption1,
    marginTop: 6,
    fontWeight: "600" as const,
  },
  lbMoreBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.sm,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  lbMoreText: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "600" as const,
    letterSpacing: 0.2,
  },
  // Recommended tasks
  recommendCard: {
    borderRadius: DesignTokens.radius.xl,
    padding: DesignTokens.spacing.lg,
    ...DesignTokens.shadow.float,
  },
  recommendHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  recommendTitle: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "700" as const,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  recommendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recommendLast: { borderBottomWidth: 0 },
  recommendName: {
    flex: 1,
    fontSize: DesignTokens.fontSize.footnote,
    fontWeight: "600" as const,
  },
  recommendMeta: { fontSize: DesignTokens.fontSize.caption1, fontWeight: "600" as const },
  // Recent collectors
  recentCard: {
    borderRadius: DesignTokens.radius.xl,
    padding: DesignTokens.spacing.lg,
    ...DesignTokens.shadow.float,
  },
  recentTitle: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "700" as const,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: DesignTokens.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: DesignTokens.spacing.sm,
  },
  recentRowLast: { borderBottomWidth: 0 },
  recentDot: { width: 7, height: 7, borderRadius: 4 },
  recentName: { flex: 1, fontSize: DesignTokens.fontSize.footnote, fontWeight: "500" as const },
  recentRegionTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: DesignTokens.radius.xs,
  },
  recentRegionText: {
    fontSize: DesignTokens.fontSize.caption2,
    fontWeight: "700" as const,
    letterSpacing: 0.4,
  },
  recentTasks: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "600" as const,
  },
  loadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: DesignTokens.spacing.sm,
    paddingVertical: DesignTokens.spacing.xl,
  },
  loadingText: { fontSize: DesignTokens.fontSize.footnote },
  // All-time card
  allTimeCard: {
    borderRadius: DesignTokens.radius.xl,
    padding: DesignTokens.spacing.lg,
    ...DesignTokens.shadow.float,
  },
  allTimeGrid: { flexDirection: "row", alignItems: "center", marginBottom: DesignTokens.spacing.md },
  allTimeItem: { flex: 1, alignItems: "center" },
  allTimeSep: { width: StyleSheet.hairlineWidth, height: 28 },
  allTimeVal: { fontSize: DesignTokens.fontSize.subhead, fontWeight: "600" as const },
  allTimeLbl: { fontSize: DesignTokens.fontSize.caption2, marginTop: 4 },
  allTimeDivider: { height: StyleSheet.hairlineWidth, marginBottom: 12 },
  allTimeSub: {
    fontSize: DesignTokens.fontSize.caption2,
    marginTop: DesignTokens.spacing.sm,
    textAlign: "center",
  },
  // Recent tasks
  topTasksCard: {
    borderRadius: DesignTokens.radius.xl,
    padding: DesignTokens.spacing.lg,
    ...DesignTokens.shadow.float,
  },
  topTasksTitle: {
    fontSize: DesignTokens.fontSize.caption1,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
    fontWeight: "600" as const,
  },
  topTaskRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: DesignTokens.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  topTaskLast: { borderBottomWidth: 0 },
  topTaskDot: { width: 6, height: 6, borderRadius: 3 },
  topTaskName: { flex: 1, fontSize: DesignTokens.fontSize.caption1 },
  topTaskHours: { fontSize: DesignTokens.fontSize.caption1, fontWeight: "600" as const },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 10 },
  emptyTitle: { fontSize: DesignTokens.fontSize.headline, fontWeight: "600" as const },
  emptyText: { fontSize: DesignTokens.fontSize.footnote, textAlign: "center" },
  spacer: { height: DesignTokens.spacing.xl },
});
