import React, { useRef, useEffect, useMemo, useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Animated,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TrendingUp, CheckCircle, Target, Inbox, Calendar, Trophy, Medal, Crown, Upload } from "lucide-react-native";
import { useCollection } from "@/providers/CollectionProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { DesignTokens } from "@/constants/colors";
import ScreenContainer from "@/components/ScreenContainer";
import { fetchCollectorStats, fetchLeaderboard, clearApiCache } from "@/services/googleSheets";
import { CollectorStats, LeaderboardEntry } from "@/types";

function normalizeCollectorName(name: string): string {
  return name.replace(/\s*\(.*?\)\s*$/g, "").trim();
}

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
    <Animated.View style={[styles.heroCard, { backgroundColor: colors.bgCard, borderColor: colors.border, shadowColor: colors.shadow, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
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
  statsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  statVal: { fontSize: 11, fontWeight: "500" as const },
  statSep: { fontSize: 10 },
});

const ComparisonCard = React.memo(function ComparisonCard({ mxHours, sfHours, mxCompleted, sfCompleted, colors }: {
  mxHours: number; sfHours: number; mxCompleted: number; sfCompleted: number; colors: ReturnType<typeof useTheme>["colors"];
}) {
  const totalHours = mxHours + sfHours;
  const mxPct = totalHours > 0 ? (mxHours / totalHours) * 100 : 50;

  return (
    <View style={[compStyles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, shadowColor: colors.shadow }]}>
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
    borderRadius: DesignTokens.radius.xl, padding: DesignTokens.spacing.lg, borderWidth: 1, marginBottom: DesignTokens.spacing.md,
    ...DesignTokens.shadow.card,
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
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();
  const { selectedCollector, selectedCollectorName, selectedRig, todayLog, configured } = useCollection();
  const [refreshing, setRefreshing] = useState(false);
  const [lbTab, setLbTab] = useState<LeaderboardTab>("combined");
  const [lbPeriod, setLbPeriod] = useState<LeaderboardPeriod>("thisWeek");
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

  const leaderboardQuery = useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard", lbPeriod],
    queryFn: () => fetchLeaderboard(lbPeriod),
    enabled: configured,
    staleTime: 120000,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  const localStats = useMemo(() => {
    const completed = todayLog.filter((e) => e.status === "Completed").length;
    const totalLogged = todayLog.reduce((s, e) => s + e.loggedHours, 0);
    const active = todayLog.filter((e) => e.status === "In Progress" || e.status === "Partial").length;
    return { completed, totalLogged, active, total: todayLog.length };
  }, [todayLog]);

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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    clearApiCache();
    try {
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["collectorStats", selectedCollectorName] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
      ]);
      await Promise.allSettled([statsQuery.refetch(), leaderboardQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [statsQuery, leaderboardQuery, queryClient, selectedCollectorName]);

  const stats = statsQuery.data;
  const cardShadow = useMemo(() => ({
    shadowColor: isDark ? colors.accent : colors.shadow,
    ...DesignTokens.shadow.elevated,
  }), [isDark, colors]);
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
      <View style={[styles.pageHeader, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View>
          <View style={[styles.headerTag, { backgroundColor: colors.accentSoft, borderColor: colors.accentDim }]}>
            <Text style={[styles.headerTagText, { color: colors.accent }]}>PERFORMANCE</Text>
          </View>
          <Text style={[styles.brandText, { color: colors.accent, fontFamily: "Lexend_700Bold" }]}>Stats</Text>
          <Text style={[styles.brandSub, { color: colors.textSecondary, fontFamily: "Lexend_400Regular" }]}>
            {normalizeCollectorName(selectedCollector.name)}
          </Text>
        </View>
        <View style={styles.pageHeaderRight}>
          {selectedRig !== "" && (
            <Text style={[styles.rigBadge, { color: colors.textMuted }]}>{selectedRig}</Text>
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
        <HeroStat label="Uploaded" value={`${localStats.totalLogged.toFixed(2)}h`} icon={<Upload size={18} color={colors.statusPending} />} color={colors.statusPending} index={2} />
        <HeroStat label="Active" value={String(localStats.active)} icon={<TrendingUp size={18} color={colors.accentLight} />} color={colors.accentLight} index={3} />
      </View>

      {stats && stats.weeklyLoggedHours > 0 && (
        <>
          <View style={[styles.sectionHeader, { marginTop: 20 }]}>
            <Calendar size={12} color={colors.complete} />
            <Text style={[styles.sectionLabel, { color: colors.complete }]}>THIS WEEK (MON-SUN)</Text>
          </View>
          <View style={[styles.weekCard, { backgroundColor: colors.bgCard, borderColor: colors.border, ...cardShadow }]}>
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
        <View style={[styles.leaderboardCard, { backgroundColor: colors.bgCard, borderColor: colors.border, ...cardShadow }]}>
          <View style={styles.lbHeaderRow}>
            <Text style={[styles.lbHeaderText, { color: colors.textMuted }]}>
              {`${lbTab === "sf" ? "San Francisco" : lbTab === "mx" ? "Los Cabos (MX)" : "Combined"} Rankings · ${periodLabel}`}
            </Text>
            <Medal size={14} color={colors.gold} />
          </View>
          {currentLbEntries.slice(0, 20).map((entry, idx) => (
            <LeaderboardRow
              key={`lb_${lbPeriod}_${lbTab}_${idx}`}
              entry={entry}
              index={idx}
              isCurrentUser={normalizeCollectorName(entry.collectorName).toLowerCase() === normalizedName.toLowerCase()}
              colors={colors}
            />
          ))}
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
        <View style={[styles.recentCard, { backgroundColor: colors.bgCard, borderColor: colors.border, ...cardShadow }]}>
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
          <View style={[styles.allTimeCard, { backgroundColor: colors.bgCard, borderColor: colors.border, ...cardShadow }]}>
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
            <View style={[styles.topTasksCard, { backgroundColor: colors.bgCard, borderColor: colors.border, ...cardShadow }]}>
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
  content: { padding: DesignTokens.spacing.xl, paddingBottom: 140 },
  pageHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    marginBottom: DesignTokens.spacing.xxl, padding: DesignTokens.spacing.lg,
    borderRadius: DesignTokens.radius.xl, borderWidth: 1,
  },
  pageHeaderRight: { alignItems: "flex-end", gap: DesignTokens.spacing.xs },
  headerTag: {
    alignSelf: "flex-start",
    borderRadius: DesignTokens.radius.xs,
    borderWidth: 1,
    paddingHorizontal: DesignTokens.spacing.sm,
    paddingVertical: 3,
    marginBottom: 2,
  },
  headerTagText: {
    fontSize: 9,
    fontWeight: "800" as const,
    letterSpacing: 1.1,
  },
  brandText: { fontSize: 34, fontWeight: "700" as const, letterSpacing: 0.2 },
  brandSub: { fontSize: 12, fontWeight: "500" as const, letterSpacing: 0.7, marginTop: 2, textTransform: "uppercase" },
  rigBadge: { fontSize: 10, letterSpacing: 0.6, fontWeight: "500" as const },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: DesignTokens.spacing.md },
  sectionLabel: { fontSize: 10, letterSpacing: 1.4, fontWeight: "700" as const },
  sectionLabelMuted: { fontSize: 10, letterSpacing: 1.2, fontWeight: "600" as const },
  heroGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  heroCard: {
    flex: 1, minWidth: "44%", borderRadius: DesignTokens.radius.xl, padding: DesignTokens.spacing.lg, borderWidth: 1,
    ...DesignTokens.shadow.card,
  },
  heroIconWrap: { width: 36, height: 36, borderRadius: DesignTokens.radius.md, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  heroValue: { fontSize: 24, letterSpacing: -0.5, fontWeight: "700" as const },
  heroLabel: { fontSize: 11, marginTop: 2, fontWeight: "500" as const },
  weekCard: { borderRadius: DesignTokens.radius.xl, padding: 18, marginBottom: DesignTokens.spacing.md, borderWidth: 1 },
  weekRow: { flexDirection: "row", alignItems: "center" },
  weekSep: { width: 1, height: 28 },
  weekItem: { flex: 1, alignItems: "center" },
  weekVal: { fontSize: 16, fontWeight: "600" as const },
  weekLbl: { fontSize: 10, marginTop: 3 },
  periodSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: DesignTokens.radius.md,
    borderWidth: 1,
    padding: 6,
    marginBottom: DesignTokens.spacing.sm,
  },
  periodBtn: {
    flex: 1,
    borderRadius: DesignTokens.radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
  },
  periodBtnText: { fontSize: 11, letterSpacing: 0.3 },
  lbTabRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: DesignTokens.radius.md, borderWidth: 1, padding: 6, marginBottom: 10,
  },
  lbTabBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: DesignTokens.radius.sm, borderWidth: 1, borderColor: "transparent",
  },
  lbTabText: { fontSize: 12, letterSpacing: 0.3 },
  leaderboardCard: { borderRadius: DesignTokens.radius.xl, padding: 14, marginBottom: 14, borderWidth: 1 },
  lbHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 4, paddingBottom: DesignTokens.spacing.sm, marginBottom: 4 },
  lbHeaderText: { fontSize: 10, fontWeight: "600" as const, letterSpacing: 0.5, textTransform: "uppercase" },
  lbEmpty: { borderRadius: DesignTokens.radius.lg, padding: DesignTokens.spacing.xl, borderWidth: 1, marginBottom: DesignTokens.spacing.md, alignItems: "center" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: DesignTokens.spacing.sm },
  inlineSyncDot: { width: 7, height: 7, borderRadius: 4 },
  lbEmptyText: { fontSize: 13 },
  lbEmptyRetry: { fontSize: 12, marginTop: 6, fontWeight: "600" as const },
  recentCard: { borderRadius: DesignTokens.radius.xl, padding: DesignTokens.spacing.lg, marginBottom: 14, borderWidth: 1 },
  recentTitle: { fontSize: 10, fontWeight: "700" as const, letterSpacing: 1.2, marginBottom: 10 },
  recentRow: { flexDirection: "row", alignItems: "center", paddingVertical: DesignTokens.spacing.sm, borderBottomWidth: 1, gap: DesignTokens.spacing.sm },
  recentRowLast: { borderBottomWidth: 0 },
  recentDot: { width: 6, height: 6, borderRadius: 3 },
  recentName: { flex: 1, fontSize: 13, fontWeight: "500" as const },
  recentRegionTag: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: DesignTokens.radius.xs },
  recentRegionText: { fontSize: 9, fontWeight: "700" as const, letterSpacing: 0.5 },
  recentTasks: { fontSize: 12, fontWeight: "600" as const },
  loadingWrap: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: DesignTokens.spacing.sm, paddingVertical: DesignTokens.spacing.xl },
  loadingText: { fontSize: 13 },
  allTimeCard: { borderRadius: DesignTokens.radius.xl, padding: DesignTokens.spacing.lg, marginBottom: DesignTokens.spacing.md, borderWidth: 1 },
  allTimeGrid: { flexDirection: "row", alignItems: "center", marginBottom: DesignTokens.spacing.md },
  allTimeItem: { flex: 1, alignItems: "center" },
  allTimeSep: { width: 1, height: 24 },
  allTimeVal: { fontSize: 15, fontWeight: "600" as const },
  allTimeLbl: { fontSize: 10, marginTop: 3 },
  allTimeDivider: { height: 1, marginBottom: 10 },
  allTimeSub: { fontSize: 10, marginTop: DesignTokens.spacing.sm, textAlign: "center" },
  topTasksCard: { borderRadius: DesignTokens.radius.xl, padding: DesignTokens.spacing.lg, marginBottom: DesignTokens.spacing.md, borderWidth: 1 },
  topTasksTitle: { fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 10, fontWeight: "600" as const },
  topTaskRow: { flexDirection: "row", alignItems: "center", paddingVertical: DesignTokens.spacing.sm, borderBottomWidth: 1, gap: 10 },
  topTaskLast: { borderBottomWidth: 0 },
  topTaskDot: { width: 5, height: 5, borderRadius: 3 },
  topTaskName: { flex: 1, fontSize: 12 },
  topTaskHours: { fontSize: 12, fontWeight: "600" as const },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: "600" as const },
  emptyText: { fontSize: 14, textAlign: "center" },
  spacer: { height: DesignTokens.spacing.xl },
});
