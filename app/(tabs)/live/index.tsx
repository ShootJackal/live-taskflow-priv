import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import {
  Sun,
  Moon,
  Snowflake,
  Glasses,
  AlertTriangle,
  TrendingUp,
  Radio,
  RotateCcw,
  ChevronRight,
  Wifi,
  WifiOff,
  Users,
  Clock,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/providers/ThemeProvider";
import { useCollection } from "@/providers/CollectionProvider";
import { DesignTokens } from "@/constants/colors";
import ScreenContainer from "@/components/ScreenContainer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchCollectorStats,
  fetchRecollections,
  fetchActiveRigsCount,
  fetchLeaderboard,
  fetchLiveAlerts,
  fetchTodayLog,
} from "@/services/googleSheets";
import { normalizeCollectorName } from "@/utils/normalize";
import type { LiveAlert } from "@/types";

const SF_RIG_NUMBERS = new Set(["2", "3", "4", "5", "6", "9", "11"]);

function getRigRegion(rig: unknown): "SF" | "MX" {
  const key = String(rig ?? "").trim().toUpperCase();
  if (!key) return "MX";
  if (key.includes("EGO-SF") || key.includes("-SF") || key.startsWith("SF")) return "SF";
  const match = key.match(/(\d+)(?!.*\d)/);
  if (match && SF_RIG_NUMBERS.has(String(Number(match[1])))) return "SF";
  return "MX";
}

interface RegionSnapshot {
  collectors: number;
  tasksAssigned: number;
  tasksCompleted: number;
  hoursLogged: number;
  completionRate: number;
}

// ─── Metric row inside a region card ─────────────────────────────────────────
function MetricRow({
  label,
  value,
  color,
  isLast,
}: {
  label: string;
  value: string;
  color: string;
  isLast?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        s.metricRow,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      <Text style={[s.metricLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[s.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

// ─── Region card (MX or SF) ───────────────────────────────────────────────────
function RegionCard({
  region,
  snapshot,
  rigCount,
  isLoading,
}: {
  region: "MX" | "SF";
  snapshot: RegionSnapshot;
  rigCount: number;
  isLoading: boolean;
}) {
  const { colors } = useTheme();
  const isMX = region === "MX";
  const tint = isMX ? colors.mxOrange : colors.sfBlue;
  const tintBg = isMX ? colors.mxOrangeBg : colors.sfBlueBg;
  const label = isMX ? "EGO-MX · Los Cabos" : "EGO-SF · San Francisco";

  const pct = snapshot.tasksAssigned > 0
    ? Math.round((snapshot.tasksCompleted / snapshot.tasksAssigned) * 100)
    : 0;

  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, shadowColor: colors.shadow }]}>
      {/* Region header */}
      <View style={s.cardHeader}>
        <View style={[s.regionTag, { backgroundColor: tintBg }]}>
          <Text style={[s.regionTagText, { color: tint }]}>{label}</Text>
        </View>
        {isLoading && <ActivityIndicator size="small" color={tint} />}
      </View>

      {/* Completion progress bar */}
      <View style={[s.progressTrack, { backgroundColor: colors.bgInput }]}>
        <Animated.View
          style={[
            s.progressFill,
            { backgroundColor: tint, width: `${pct}%` as any },
          ]}
        />
      </View>
      <Text style={[s.progressLabel, { color: colors.textMuted }]}>
        {snapshot.tasksCompleted} of {snapshot.tasksAssigned} tasks · {pct}% complete
      </Text>

      {/* Metrics */}
      <View style={[s.metricsSection, { borderTopColor: colors.border }]}>
        <MetricRow
          label="Hours logged"
          value={`${snapshot.hoursLogged.toFixed(2)}h`}
          color={tint}
        />
        <MetricRow
          label="Collectors online"
          value={String(snapshot.collectors)}
          color={colors.textPrimary}
        />
        <MetricRow
          label="Rigs mapped"
          value={String(rigCount)}
          color={colors.textPrimary}
          isLast
        />
      </View>
    </View>
  );
}

// ─── Alert card ───────────────────────────────────────────────────────────────
function AlertCard({ alerts }: { alerts: LiveAlert[] }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const shown = expanded ? alerts : alerts.slice(0, 2);

  return (
    <View style={[s.card, { backgroundColor: colors.alertYellowBg, shadowColor: colors.shadow }]}>
      <View style={s.cardHeader}>
        <AlertTriangle size={16} color={colors.alertYellow} />
        <Text style={[s.cardTitle, { color: colors.alertYellow }]}>
          {alerts.length} Active Alert{alerts.length === 1 ? "" : "s"}
        </Text>
      </View>
      {shown.map((a, i) => (
        <View
          key={a.id ?? i}
          style={[
            s.alertRow,
            i < shown.length - 1 && {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.alertYellow + "30",
            },
          ]}
        >
          <View style={[s.alertDot, { backgroundColor: colors.alertYellow }]} />
          <Text style={[s.alertText, { color: colors.alertYellow }]} numberOfLines={2}>
            {a.message}
          </Text>
        </View>
      ))}
      {alerts.length > 2 && (
        <TouchableOpacity
          style={s.expandBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setExpanded((v) => !v);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[s.expandText, { color: colors.alertYellow }]}>
            {expanded ? "Show less" : `Show ${alerts.length - 2} more`}
          </Text>
          <ChevronRight
            size={14}
            color={colors.alertYellow}
            style={{ transform: [{ rotate: expanded ? "-90deg" : "0deg" }] }}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Recollections card ───────────────────────────────────────────────────────
function RecollectionsCard({ items }: { items: string[] }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, 3);

  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, shadowColor: colors.shadow }]}>
      <View style={s.cardHeader}>
        <RotateCcw size={15} color={colors.recollectRed} />
        <Text style={[s.cardTitle, { color: colors.recollectRed }]}>
          Needs Recollection
        </Text>
        <View style={[s.countBadge, { backgroundColor: colors.recollectRed }]}>
          <Text style={s.countBadgeText}>{items.length}</Text>
        </View>
      </View>
      {shown.map((item, i) => (
        <View
          key={i}
          style={[
            s.recollectRow,
            i < shown.length - 1 && {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <View style={[s.alertDot, { backgroundColor: colors.recollectRed }]} />
          <Text style={[s.recollectText, { color: colors.textSecondary }]} numberOfLines={2}>
            {item}
          </Text>
        </View>
      ))}
      {items.length > 3 && (
        <TouchableOpacity
          style={s.expandBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setExpanded((v) => !v);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[s.expandText, { color: colors.accent }]}>
            {expanded ? "Show less" : `Show ${items.length - 3} more`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Combined team card ───────────────────────────────────────────────────────
function TeamOverviewCard({
  totalHours,
  totalCompleted,
  totalAssigned,
  avgHoursPerTask,
  combinedRate,
  isLoading,
}: {
  totalHours: number;
  totalCompleted: number;
  totalAssigned: number;
  avgHoursPerTask: number;
  combinedRate: number;
  isLoading: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, shadowColor: colors.shadow }]}>
      <View style={s.cardHeader}>
        <TrendingUp size={15} color={colors.accent} />
        <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Combined Team · This Week</Text>
        {isLoading && <ActivityIndicator size="small" color={colors.accent} />}
      </View>
      <View style={s.statGrid}>
        <View style={s.statCell}>
          <Text style={[s.statBigVal, { color: colors.accent }]}>
            {totalHours.toFixed(1)}h
          </Text>
          <Text style={[s.statCellLabel, { color: colors.textMuted }]}>Total hours</Text>
        </View>
        <View style={[s.statDivider, { backgroundColor: colors.border }]} />
        <View style={s.statCell}>
          <Text style={[s.statBigVal, { color: colors.complete }]}>
            {totalCompleted}
          </Text>
          <Text style={[s.statCellLabel, { color: colors.textMuted }]}>Completed</Text>
        </View>
        <View style={[s.statDivider, { backgroundColor: colors.border }]} />
        <View style={s.statCell}>
          <Text style={[s.statBigVal, { color: colors.accent }]}>
            {combinedRate.toFixed(0)}%
          </Text>
          <Text style={[s.statCellLabel, { color: colors.textMuted }]}>Rate</Text>
        </View>
        <View style={[s.statDivider, { backgroundColor: colors.border }]} />
        <View style={s.statCell}>
          <Text style={[s.statBigVal, { color: colors.textSecondary }]}>
            {avgHoursPerTask.toFixed(1)}h
          </Text>
          <Text style={[s.statCellLabel, { color: colors.textMuted }]}>Avg/task</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Personal stats card ──────────────────────────────────────────────────────
function PersonalStatsCard({
  name,
  completionRate,
  weeklyHours,
  totalCompleted,
  totalAssigned,
}: {
  name: string;
  completionRate: number;
  weeklyHours: number;
  totalCompleted: number;
  totalAssigned: number;
}) {
  const { colors } = useTheme();
  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, shadowColor: colors.shadow }]}>
      <View style={s.cardHeader}>
        <Users size={15} color={colors.accent} />
        <Text style={[s.cardTitle, { color: colors.textPrimary }]}>My Stats</Text>
        <Text style={[s.cardSubtitle, { color: colors.textMuted }]}>{name}</Text>
      </View>
      <View style={s.statGrid}>
        <View style={s.statCell}>
          <Text style={[s.statBigVal, { color: colors.accent }]}>
            {weeklyHours.toFixed(1)}h
          </Text>
          <Text style={[s.statCellLabel, { color: colors.textMuted }]}>This week</Text>
        </View>
        <View style={[s.statDivider, { backgroundColor: colors.border }]} />
        <View style={s.statCell}>
          <Text style={[s.statBigVal, { color: colors.complete }]}>
            {completionRate.toFixed(0)}%
          </Text>
          <Text style={[s.statCellLabel, { color: colors.textMuted }]}>Rate</Text>
        </View>
        <View style={[s.statDivider, { backgroundColor: colors.border }]} />
        <View style={s.statCell}>
          <Text style={[s.statBigVal, { color: colors.textSecondary }]}>
            {totalCompleted}/{totalAssigned}
          </Text>
          <Text style={[s.statCellLabel, { color: colors.textMuted }]}>Done</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function LiveScreen() {
  const { colors, resolvedMode, toggleTheme } = useTheme();
  const { configured, collectors, todayLog, selectedCollectorName } = useCollection();
  const queryClient = useQueryClient();

  const [isOnline, setIsOnline] = useState(false);
  const [clockNow, setClockNow] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);
  const livePulse = useRef(new Animated.Value(0)).current;

  // ── Data queries (same as before) ──────────────────────────────────────────
  const statsQuery = useQuery({
    queryKey: ["liveStats", selectedCollectorName],
    queryFn: () => fetchCollectorStats(selectedCollectorName),
    enabled: configured && !!selectedCollectorName,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const leaderboardQuery = useQuery({
    queryKey: ["leaderboard", "thisWeek"],
    queryFn: () => fetchLeaderboard("thisWeek"),
    enabled: configured,
    staleTime: 60000,
    refetchInterval: 60000,
    retry: 2,
  });

  const todayLogQuery = useQuery({
    queryKey: ["todayLog", selectedCollectorName],
    queryFn: () => fetchTodayLog(selectedCollectorName),
    enabled: configured && !!selectedCollectorName,
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const recollectionsQuery = useQuery({
    queryKey: ["recollections"],
    queryFn: () => fetchRecollections(),
    enabled: configured,
    staleTime: 30000,
    refetchInterval: 45000,
    retry: 3,
  });

  const activeRigsQuery = useQuery({
    queryKey: ["activeRigsCount"],
    queryFn: () => fetchActiveRigsCount(),
    enabled: configured,
    staleTime: 60000,
    refetchInterval: 60000,
  });

  const alertsQuery = useQuery<LiveAlert[]>({
    queryKey: ["liveAlerts"],
    queryFn: fetchLiveAlerts,
    enabled: configured,
    staleTime: 20000,
    refetchInterval: 30000,
    retry: 1,
  });

  // ── Derived data (same logic as before) ────────────────────────────────────
  const recollectItems = useMemo(() => {
    const sheetItems = recollectionsQuery.data;
    if (sheetItems && sheetItems.length > 0) return sheetItems;
    const log = todayLogQuery.data ?? todayLog;
    const fallback = log
      .filter(e => e.status === "Partial" || Math.round((Number(e.remainingHours) || 0) * 100) / 100 > 0)
      .map(e => `${normalizeCollectorName(e.taskName)} (${Number(e.remainingHours).toFixed(2)}h left)`);
    return fallback.length > 0 ? fallback : [];
  }, [recollectionsQuery.data, todayLogQuery.data, todayLog]);

  const fallbackCollectorCounts = useMemo(() => {
    let mx = 0;
    let sf = 0;
    for (const collector of collectors) {
      const hasSFRig = (collector.rigs ?? []).some((rig) => getRigRegion(rig) === "SF");
      if (hasSFRig) sf += 1;
      else mx += 1;
    }
    return { mx, sf };
  }, [collectors]);

  const mappedRigCounts = useMemo(() => {
    let mxRigs = 0;
    let sfRigs = 0;
    for (const collector of collectors) {
      for (const rig of (collector.rigs ?? [])) {
        if (!rig) continue;
        if (getRigRegion(rig) === "SF") sfRigs += 1;
        else mxRigs += 1;
      }
    }
    return { mxRigs, sfRigs, total: mxRigs + sfRigs };
  }, [collectors]);

  const leaderboardEntries = useMemo(() => leaderboardQuery.data ?? [], [leaderboardQuery.data]);

  const regionOverview = useMemo(() => {
    const base: Record<"MX" | "SF", RegionSnapshot> = {
      MX: { collectors: 0, tasksAssigned: 0, tasksCompleted: 0, hoursLogged: 0, completionRate: 0 },
      SF: { collectors: 0, tasksAssigned: 0, tasksCompleted: 0, hoursLogged: 0, completionRate: 0 },
    };
    for (const entry of leaderboardEntries) {
      const region = String(entry.region).toUpperCase() === "SF" ? "SF" : "MX";
      const target = base[region];
      target.collectors += 1;
      target.tasksAssigned += Number(entry.tasksAssigned) || 0;
      target.tasksCompleted += Number(entry.tasksCompleted) || 0;
      target.hoursLogged += Number(entry.hoursLogged) || 0;
    }
    for (const region of ["MX", "SF"] as const) {
      const t = base[region];
      t.completionRate = t.tasksAssigned > 0 ? (t.tasksCompleted / t.tasksAssigned) * 100 : 0;
    }
    const totalTasksAssigned = base.MX.tasksAssigned + base.SF.tasksAssigned;
    const totalTasksCompleted = base.MX.tasksCompleted + base.SF.tasksCompleted;
    const totalHoursLogged = base.MX.hoursLogged + base.SF.hoursLogged;
    const combinedRate = totalTasksAssigned > 0 ? (totalTasksCompleted / totalTasksAssigned) * 100 : 0;
    const avgHoursPerTask = totalTasksCompleted > 0 ? totalHoursLogged / totalTasksCompleted : 0;
    return {
      mx: base.MX,
      sf: base.SF,
      hasData: leaderboardEntries.length > 0,
      totalTasksAssigned,
      totalTasksCompleted,
      totalHoursLogged,
      combinedRate,
      avgHoursPerTask,
    };
  }, [leaderboardEntries]);

  const totalRigCount = activeRigsQuery.data?.activeRigsToday
    ?? (mappedRigCounts.total > 0 ? mappedRigCounts.total : Math.max(collectors.length, 1));

  const liveAlerts = useMemo(() => alertsQuery.data ?? [], [alertsQuery.data]);
  const stats = statsQuery.data;
  const isSyncing = leaderboardQuery.isFetching || recollectionsQuery.isFetching || alertsQuery.isFetching;

  // ── Side effects ───────────────────────────────────────────────────────────
  useEffect(() => { setIsOnline(configured); }, [configured]);

  useEffect(() => {
    const interval = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(livePulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(livePulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [livePulse]);

  const liveClock = useMemo(() => {
    const d = clockNow;
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  }, [clockNow]);

  const handleRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRefreshing(true);
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
      queryClient.invalidateQueries({ queryKey: ["recollections"] }),
      queryClient.invalidateQueries({ queryKey: ["liveAlerts"] }),
      queryClient.invalidateQueries({ queryKey: ["activeRigsCount"] }),
      queryClient.invalidateQueries({ queryKey: ["liveStats"] }),
    ]);
    setRefreshing(false);
  }, [queryClient]);

  const handleToggleTheme = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleTheme();
  }, [toggleTheme]);

  const livePillColor = isOnline ? colors.terminalGreen : colors.cancel;

  // ── MX/SF rig counts ──────────────────────────────────────────────────────
  const mxRigCount = mappedRigCounts.mxRigs > 0
    ? mappedRigCounts.mxRigs
    : (regionOverview.mx.collectors > 0 ? regionOverview.mx.collectors : fallbackCollectorCounts.mx);
  const sfRigCount = mappedRigCounts.sfRigs > 0
    ? mappedRigCounts.sfRigs
    : (regionOverview.sf.collectors > 0 ? regionOverview.sf.collectors : fallbackCollectorCounts.sf);

  return (
    <ScreenContainer>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <View style={[s.header, { backgroundColor: colors.bgCard, shadowColor: colors.shadow }]}>
        <View style={s.headerTopRow}>
          <View style={[s.headerTag, { backgroundColor: colors.accentSoft, borderColor: colors.accentDim }]}>
            <Text style={[s.headerTagText, { color: colors.accent }]}>Live Monitor</Text>
          </View>
          <View style={s.headerActions}>
            {/* Theme toggle */}
            <TouchableOpacity
              style={[s.iconBtn, { backgroundColor: colors.bgInput, borderColor: colors.border }]}
              onPress={handleToggleTheme}
              activeOpacity={0.7}
              testID="theme-toggle-live"
            >
              {resolvedMode === "dark" ? <Moon size={15} color={colors.accent} /> :
               resolvedMode === "frosted" ? <Snowflake size={15} color={colors.accent} /> :
               resolvedMode === "tinted" ? <Glasses size={15} color={colors.accent} /> :
               <Sun size={15} color={colors.statusPending} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* Brand row */}
        <View style={s.brandRow}>
          <Text style={[s.brandText, { color: colors.accent, fontFamily: "Lexend_700Bold" }]}>
            TaskFlow
          </Text>
          {/* Online / offline badge */}
          <View style={[s.liveBadge, { backgroundColor: livePillColor + "18", borderColor: livePillColor + "40" }]}>
            <Animated.View
              style={[s.liveDot, {
                backgroundColor: livePillColor,
                opacity: livePulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
                transform: [{ scale: livePulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] }) }],
              }]}
            />
            <Text style={[s.liveLabel, { color: livePillColor }]}>
              {isOnline ? "Live" : "Offline"}
            </Text>
          </View>
        </View>

        {/* Meta row */}
        <View style={s.metaRow}>
          <View style={[s.metaChip, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
            {isOnline
              ? <Wifi size={11} color={colors.textMuted} />
              : <WifiOff size={11} color={colors.cancel} />}
            <Text style={[s.metaChipText, { color: colors.textSecondary }]}>
              {totalRigCount} rigs active
            </Text>
          </View>
          {liveAlerts.length > 0 && (
            <View style={[s.metaChip, { backgroundColor: colors.alertYellowBg, borderColor: colors.alertYellow + "40" }]}>
              <AlertTriangle size={11} color={colors.alertYellow} />
              <Text style={[s.metaChipText, { color: colors.alertYellow }]}>
                {liveAlerts.length} alert{liveAlerts.length === 1 ? "" : "s"}
              </Text>
            </View>
          )}
          <View style={[s.metaChip, { backgroundColor: isSyncing ? colors.statusPending + "14" : colors.bgInput, borderColor: isSyncing ? colors.statusPending + "40" : colors.border }]}>
            <Clock size={11} color={isSyncing ? colors.statusPending : colors.textMuted} />
            <Text style={[s.metaChipText, { color: isSyncing ? colors.statusPending : colors.textSecondary }]}>
              {liveClock}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        {/* Alerts section */}
        {liveAlerts.length > 0 && <AlertCard alerts={liveAlerts} />}

        {/* Region cards */}
        {regionOverview.hasData ? (
          <>
            <RegionCard
              region="MX"
              snapshot={regionOverview.mx}
              rigCount={mxRigCount}
              isLoading={leaderboardQuery.isFetching}
            />
            <RegionCard
              region="SF"
              snapshot={regionOverview.sf}
              rigCount={sfRigCount}
              isLoading={leaderboardQuery.isFetching}
            />
            <TeamOverviewCard
              totalHours={regionOverview.totalHoursLogged}
              totalCompleted={regionOverview.totalTasksCompleted}
              totalAssigned={regionOverview.totalTasksAssigned}
              avgHoursPerTask={regionOverview.avgHoursPerTask}
              combinedRate={regionOverview.combinedRate}
              isLoading={leaderboardQuery.isFetching}
            />
          </>
        ) : leaderboardQuery.isLoading ? (
          <View style={[s.card, s.loadingCard, { backgroundColor: colors.bgCard }]}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={[s.loadingText, { color: colors.textMuted }]}>Loading team data…</Text>
          </View>
        ) : (
          <View style={[s.card, s.loadingCard, { backgroundColor: colors.bgCard }]}>
            <Radio size={28} color={colors.border} />
            <Text style={[s.loadingText, { color: colors.textMuted }]}>
              {configured ? "Waiting for leaderboard feed…" : "Configure your GAS endpoint to see live data"}
            </Text>
          </View>
        )}

        {/* Recollections */}
        {recollectItems.length > 0 && <RecollectionsCard items={recollectItems} />}

        {/* Personal stats */}
        {stats && selectedCollectorName && (
          <PersonalStatsCard
            name={normalizeCollectorName(selectedCollectorName)}
            completionRate={stats.completionRate}
            weeklyHours={stats.weeklyLoggedHours}
            totalCompleted={stats.totalCompleted}
            totalAssigned={stats.totalAssigned}
          />
        )}

        {/* Bottom spacer for tab bar */}
        <View style={s.bottomSpacer} />
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Header
  header: {
    marginHorizontal: DesignTokens.spacing.md,
    marginTop: DesignTokens.spacing.sm,
    padding: DesignTokens.spacing.lg,
    borderRadius: DesignTokens.radius.xl,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 6,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: DesignTokens.spacing.xs,
  },
  headerTag: {
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  headerTagText: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "600" as const,
    letterSpacing: 0.2,
  },
  headerActions: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
    marginBottom: 8,
  },
  brandText: {
    fontSize: DesignTokens.fontSize.largeTitle,
    fontWeight: "700" as const,
    letterSpacing: 0.1,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveLabel: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "600" as const,
    letterSpacing: 0.2,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  metaChipText: { fontSize: DesignTokens.fontSize.caption1, letterSpacing: 0.2 },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: DesignTokens.spacing.md,
    paddingTop: DesignTokens.spacing.md,
    gap: DesignTokens.spacing.md,
  },
  bottomSpacer: { height: 120 },

  // Cards
  card: {
    borderRadius: DesignTokens.radius.xl,
    padding: DesignTokens.spacing.lg,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: DesignTokens.spacing.md,
  },
  cardTitle: {
    fontSize: DesignTokens.fontSize.subhead,
    fontWeight: "600" as const,
    flex: 1,
  },
  cardSubtitle: {
    fontSize: DesignTokens.fontSize.caption1,
  },
  loadingCard: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    fontSize: DesignTokens.fontSize.footnote,
    textAlign: "center",
  },

  // Region card
  regionTag: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  regionTagText: {
    fontSize: DesignTokens.fontSize.footnote,
    fontWeight: "600" as const,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 6,
  },
  progressFill: { height: 6, borderRadius: 3 },
  progressLabel: { fontSize: DesignTokens.fontSize.caption1, marginBottom: DesignTokens.spacing.md },

  // Metric rows inside cards
  metricsSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: DesignTokens.spacing.sm,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    minHeight: 44,
  },
  metricLabel: { fontSize: DesignTokens.fontSize.footnote },
  metricValue: { fontSize: DesignTokens.fontSize.subhead, fontWeight: "600" as const },

  // Stat grid (team overview + personal stats)
  statGrid: {
    flexDirection: "row",
    alignItems: "center",
  },
  statCell: { flex: 1, alignItems: "center", paddingVertical: 8 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 32 },
  statBigVal: { fontSize: DesignTokens.fontSize.title3, fontWeight: "700" as const },
  statCellLabel: { fontSize: DesignTokens.fontSize.caption2, marginTop: 3 },

  // Alerts + recollections
  alertRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 10, minHeight: 44 },
  alertDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  alertText: { flex: 1, fontSize: DesignTokens.fontSize.footnote, lineHeight: 20 },
  recollectRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 10, minHeight: 44 },
  recollectText: { flex: 1, fontSize: DesignTokens.fontSize.footnote, lineHeight: 20 },

  countBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: DesignTokens.radius.pill,
    minWidth: 22,
    alignItems: "center",
  },
  countBadgeText: { fontSize: DesignTokens.fontSize.caption2, color: "#fff", fontWeight: "700" as const },

  expandBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingTop: 10,
    alignSelf: "flex-start",
    minHeight: 44,
    paddingBottom: 4,
  },
  expandText: { fontSize: DesignTokens.fontSize.footnote, fontWeight: "600" as const },
});
