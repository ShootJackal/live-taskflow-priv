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
  Modal,
  useWindowDimensions,
} from "react-native";
import {
  Sun, Moon,
  AlertTriangle, TrendingUp, Radio,
  RotateCcw, Wifi, WifiOff, Clock,
  BookOpen, X,
} from "lucide-react-native";
import { DesignTokens } from "@/constants/colors";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/providers/ThemeProvider";
import { useCollection } from "@/providers/CollectionProvider";
import ScreenContainer from "@/components/ScreenContainer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchCollectorStats, fetchRecollections, fetchActiveRigsCount,
  fetchLeaderboard, fetchLiveAlerts, fetchTodayLog,
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
  collectors: number; tasksAssigned: number; tasksCompleted: number;
  hoursLogged: number; completionRate: number;
}

// ─── Ticker segment ───────────────────────────────────────────────────────────
interface TickerSegment { label: string; color: string; items: string[]; speed: number; }

// ─── News ticker ──────────────────────────────────────────────────────────────
const NewsTicker = React.memo(function NewsTicker({ segments }: { segments: TickerSegment[] }) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(screenWidth)).current;
  const pillSlide = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seg = segments[activeIndex] ?? segments[0];

  const startScroll = useCallback((segIndex: number) => {
    const segment = segments[segIndex];
    if (!segment) return;
    const text = segment.items.join("     |     ");
    const textWidth = text.length * 7 + screenWidth;
    const duration = Math.max(textWidth * (segment.speed || 28), 10000);
    scrollX.setValue(screenWidth * 1.2);
    if (animRef.current) animRef.current.stop();
    const anim = Animated.timing(scrollX, { toValue: -textWidth + screenWidth * 0.3, duration, useNativeDriver: true });
    animRef.current = anim;
    anim.start(({ finished }) => {
      if (finished && segments.length > 1) {
        const next = (segIndex + 1) % segments.length;
        Animated.timing(pillSlide, { toValue: 1, duration: 300, useNativeDriver: true }).start(() => {
          setActiveIndex(next); pillSlide.setValue(0);
          timerRef.current = setTimeout(() => startScroll(next), 400);
        });
      } else if (finished) {
        timerRef.current = setTimeout(() => startScroll(segIndex), 2000);
      }
    });
  }, [segments, scrollX, pillSlide, screenWidth]);

  useEffect(() => {
    setActiveIndex(0); pillSlide.setValue(0); startScroll(0);
    return () => { if (animRef.current) animRef.current.stop(); if (timerRef.current) clearTimeout(timerRef.current); };
  }, [segments, pillSlide, startScroll]);

  if (!seg) return null;
  const tickerText = seg.items.join("   |   ");
  const fadeOpacity = scrollX.interpolate({ inputRange: [screenWidth * 0.8, screenWidth * 1.2], outputRange: [1, 0], extrapolate: "clamp" });

  return (
    <View style={[tStyles.container, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}>
      <Animated.View style={[tStyles.pillWrap, { opacity: pillSlide.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.3, 1] }) }]}>
        <View style={[tStyles.pill, { backgroundColor: seg.color + "22" }]}>
          <View style={[tStyles.pillDot, { backgroundColor: seg.color }]} />
          <Text style={[tStyles.pillText, { color: seg.color }]}>{seg.label}</Text>
        </View>
      </Animated.View>
      <View style={[tStyles.separator, { backgroundColor: colors.border }]} />
      <View style={tStyles.scrollWrap}>
        <Animated.Text style={[tStyles.scrollText, { color: seg.color, opacity: fadeOpacity, transform: [{ translateX: scrollX }] }]} numberOfLines={1}>{tickerText}</Animated.Text>
        <View style={[tStyles.fadeL, { backgroundColor: colors.bgCard }]} pointerEvents="none" accessible={false} />
        <View style={[tStyles.fadeR, { backgroundColor: colors.bgCard }]} pointerEvents="none" accessible={false} />
      </View>
    </View>
  );
});

const tStyles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", height: 36, overflow: "hidden", borderBottomWidth: StyleSheet.hairlineWidth },
  pillWrap: { paddingHorizontal: 10 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  pillDot: { width: 5, height: 5, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.5 },
  separator: { width: 1, height: 16 },
  scrollWrap: { flex: 1, overflow: "hidden", height: 34, justifyContent: "center", marginLeft: 8, position: "relative" as const },
  scrollText: { fontSize: 12, letterSpacing: 0.2, width: 5000 },
  fadeL: { position: "absolute" as const, top: 0, left: 0, bottom: 0, width: 14, opacity: 0.85 },
  fadeR: { position: "absolute" as const, top: 0, right: 0, bottom: 0, width: 22, opacity: 0.9 },
});

// ─── Guide modal ──────────────────────────────────────────────────────────────
const GuideModal = React.memo(function GuideModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const steps = [
    { num: "01", title: "Set Your Profile", desc: "Tools → pick your name and rig." },
    { num: "02", title: "Assign a Task", desc: "Collect → choose a task → Assign Task." },
    { num: "03", title: "Log Hours", desc: "Enter hours → tap Log Xh — Done." },
    { num: "04", title: "Check Stats", desc: "Stats → your performance and leaderboard." },
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={gStyles.overlay}>
        <TouchableOpacity style={gStyles.dim} onPress={onClose} accessible={false} />
        <View style={[gStyles.card, { backgroundColor: colors.bgCard }]}>
          <View style={[gStyles.handle, { backgroundColor: colors.border }]} />
          <View style={gStyles.header}>
            <Text style={[gStyles.title, { color: colors.textPrimary, fontFamily: "Lexend_700Bold" }]}>Quick Start</Text>
            <TouchableOpacity onPress={onClose} style={gStyles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          {steps.map((step, idx) => (
            <View key={step.num} style={[gStyles.step, idx < steps.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
              <View style={[gStyles.num, { backgroundColor: colors.accentSoft }]}>
                <Text style={[gStyles.numText, { color: colors.accent }]}>{step.num}</Text>
              </View>
              <View style={gStyles.content}>
                <Text style={[gStyles.stepTitle, { color: colors.textPrimary }]}>{step.title}</Text>
                <Text style={[gStyles.stepDesc, { color: colors.textSecondary }]}>{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
});

const gStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  dim: { flex: 1, backgroundColor: "rgba(0,0,0,0.38)" },
  card: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 36, shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 14 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  title: { fontSize: DesignTokens.fontSize.headline },
  closeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingVertical: 14 },
  num: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  numText: { fontSize: 12, fontWeight: "800" as const },
  content: { flex: 1 },
  stepTitle: { fontSize: 15, fontWeight: "600" as const, marginBottom: 3 },
  stepDesc: { fontSize: 13, lineHeight: 19 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function LiveScreen() {
  const { colors, resolvedMode, toggleTheme } = useTheme();
  const { configured, collectors, todayLog, selectedCollectorName } = useCollection();
  const queryClient = useQueryClient();

  const [isOnline, setIsOnline] = useState(false);
  const [clockNow, setClockNow] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [recollectExpanded, setRecollectExpanded] = useState(false);
  const [alertExpanded, setAlertExpanded] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const livePulse = useRef(new Animated.Value(0)).current;

  // ── Queries (unchanged) ────────────────────────────────────────────────────
  const statsQuery = useQuery({
    queryKey: ["liveStats", selectedCollectorName],
    queryFn: () => fetchCollectorStats(selectedCollectorName),
    enabled: configured && !!selectedCollectorName,
    staleTime: 30000, refetchInterval: 60000,
  });
  const leaderboardQuery = useQuery({
    queryKey: ["leaderboard", "thisWeek"],
    queryFn: () => fetchLeaderboard("thisWeek"),
    enabled: configured, staleTime: 60000, refetchInterval: 60000, retry: 2,
  });
  const todayLogQuery = useQuery({
    queryKey: ["todayLog", selectedCollectorName],
    queryFn: () => fetchTodayLog(selectedCollectorName),
    enabled: configured && !!selectedCollectorName, staleTime: 15000, refetchInterval: 30000,
  });
  const recollectionsQuery = useQuery({
    queryKey: ["recollections"],
    queryFn: () => fetchRecollections(),
    enabled: configured, staleTime: 30000, refetchInterval: 45000, retry: 3,
  });
  const activeRigsQuery = useQuery({
    queryKey: ["activeRigsCount"],
    queryFn: () => fetchActiveRigsCount(),
    enabled: configured, staleTime: 60000, refetchInterval: 60000,
  });
  const alertsQuery = useQuery<LiveAlert[]>({
    queryKey: ["liveAlerts"],
    queryFn: fetchLiveAlerts,
    enabled: configured, staleTime: 20000, refetchInterval: 30000, retry: 1,
  });

  // ── Derived data ───────────────────────────────────────────────────────────
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
    let mx = 0, sf = 0;
    for (const c of collectors) {
      if ((c.rigs ?? []).some(r => getRigRegion(r) === "SF")) sf++; else mx++;
    }
    return { mx, sf };
  }, [collectors]);

  const mappedRigCounts = useMemo(() => {
    let mxRigs = 0, sfRigs = 0;
    for (const c of collectors)
      for (const r of (c.rigs ?? []))
        if (r) { if (getRigRegion(r) === "SF") sfRigs++; else mxRigs++; }
    return { mxRigs, sfRigs, total: mxRigs + sfRigs };
  }, [collectors]);

  const leaderboardEntries = useMemo(() => leaderboardQuery.data ?? [], [leaderboardQuery.data]);

  const regionOverview = useMemo(() => {
    const base: Record<"MX"|"SF", RegionSnapshot> = {
      MX: { collectors:0, tasksAssigned:0, tasksCompleted:0, hoursLogged:0, completionRate:0 },
      SF: { collectors:0, tasksAssigned:0, tasksCompleted:0, hoursLogged:0, completionRate:0 },
    };
    for (const e of leaderboardEntries) {
      const r = String(e.region).toUpperCase() === "SF" ? "SF" : "MX";
      base[r].collectors += 1;
      base[r].tasksAssigned += Number(e.tasksAssigned) || 0;
      base[r].tasksCompleted += Number(e.tasksCompleted) || 0;
      base[r].hoursLogged += Number(e.hoursLogged) || 0;
    }
    for (const r of ["MX","SF"] as const)
      base[r].completionRate = base[r].tasksAssigned > 0
        ? (base[r].tasksCompleted / base[r].tasksAssigned) * 100 : 0;
    const ta = base.MX.tasksAssigned + base.SF.tasksAssigned;
    const tc = base.MX.tasksCompleted + base.SF.tasksCompleted;
    const th = base.MX.hoursLogged + base.SF.hoursLogged;
    return {
      mx: base.MX, sf: base.SF, hasData: leaderboardEntries.length > 0,
      totalTasksAssigned: ta, totalTasksCompleted: tc, totalHoursLogged: th,
      combinedRate: ta > 0 ? (tc / ta) * 100 : 0,
      avgHoursPerTask: tc > 0 ? th / tc : 0,
    };
  }, [leaderboardEntries]);

  const totalRigCount = activeRigsQuery.data?.activeRigsToday
    ?? (mappedRigCounts.total > 0 ? mappedRigCounts.total : Math.max(collectors.length, 1));
  const mxRigCount = mappedRigCounts.mxRigs > 0 ? mappedRigCounts.mxRigs
    : (regionOverview.mx.collectors > 0 ? regionOverview.mx.collectors : fallbackCollectorCounts.mx);
  const sfRigCount = mappedRigCounts.sfRigs > 0 ? mappedRigCounts.sfRigs
    : (regionOverview.sf.collectors > 0 ? regionOverview.sf.collectors : fallbackCollectorCounts.sf);

  const liveAlerts = useMemo(() => alertsQuery.data ?? [], [alertsQuery.data]);
  const stats = statsQuery.data;
  const isSyncing = leaderboardQuery.isFetching || recollectionsQuery.isFetching || alertsQuery.isFetching;

  // ── Ticker segments ────────────────────────────────────────────────────────
  const tickerSegments = useMemo((): TickerSegment[] => {
    const alertItems = liveAlerts.length > 0
      ? liveAlerts.slice(0, 6).map(a => `${a.level || "INFO"}: ${a.message}`)
      : ["No active alerts"];
    const recollectItems2 = recollectItems.length > 0
      ? recollectItems.slice(0, 5)
      : ["No pending recollections"];
    const regionItems = regionOverview.hasData
      ? [
          `MX ${regionOverview.mx.hoursLogged.toFixed(2)}h · ${regionOverview.mx.tasksCompleted}/${regionOverview.mx.tasksAssigned} done`,
          `SF ${regionOverview.sf.hoursLogged.toFixed(2)}h · ${regionOverview.sf.tasksCompleted}/${regionOverview.sf.tasksAssigned} done`,
          `Combined ${regionOverview.totalHoursLogged.toFixed(2)}h · ${regionOverview.combinedRate.toFixed(1)}%`,
        ]
      : ["Waiting for feed…"];
    const statsItems = stats
      ? [`${normalizeCollectorName(selectedCollectorName || "—")} · ${stats.completionRate.toFixed(0)}% · ${stats.weeklyLoggedHours.toFixed(2)}h this week`]
      : ["Set your profile to see personal stats"];
    return [
      { label: "Alerts",  color: colors.alertYellow,  items: alertItems,     speed: 32 },
      { label: "Recollect", color: colors.recollectRed, items: recollectItems2, speed: 24 },
      { label: "Regions", color: colors.mxOrange,     items: regionItems,    speed: 34 },
      { label: "Stats",   color: colors.statsGreen,   items: statsItems,     speed: 36 },
    ];
  }, [liveAlerts, recollectItems, regionOverview, stats, selectedCollectorName, colors]);

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => { setIsOnline(configured); }, [configured]);
  useEffect(() => {
    const i = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  useEffect(() => {
    const p = Animated.loop(Animated.sequence([
      Animated.timing(livePulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(livePulse, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]));
    p.start();
    return () => p.stop();
  }, [livePulse]);

  const liveClock = useMemo(() => {
    const d = clockNow;
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
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

  const liveDotColor = isOnline ? colors.terminalGreen : colors.cancel;

  // ── Render helpers ─────────────────────────────────────────────────────────
  const renderRegionCol = (
    label: string,
    tint: string,
    snap: RegionSnapshot,
    rigs: number,
    isLast?: boolean,
  ) => {
    const pct = snap.tasksAssigned > 0
      ? Math.round((snap.tasksCompleted / snap.tasksAssigned) * 100) : 0;
    return (
      <View style={[s.regionCol, !isLast && { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border }]}>
        <Text style={[s.regionColLabel, { color: tint }]}>{label}</Text>
        <Text style={[s.regionBigVal, { color: tint }]}>{snap.hoursLogged.toFixed(1)}h</Text>
        <Text style={[s.regionMeta, { color: colors.textMuted }]}>
          {snap.tasksCompleted}/{snap.tasksAssigned} tasks
        </Text>
        <View style={[s.regionBar, { backgroundColor: colors.bgInput }]}>
          <View style={[s.regionBarFill, { backgroundColor: tint, width: `${pct}%` as any }]} />
        </View>
        <Text style={[s.regionMeta, { color: colors.textMuted }]}>
          {snap.collectors} collectors · {rigs} rigs
        </Text>
      </View>
    );
  };

  return (
    <ScreenContainer>
      {/* ── Slim status bar ─────────────────────────────────────────────── */}
      <View style={[s.statusBar, { borderBottomColor: colors.border }]}>
        <View style={s.statusLeft}>
          <Animated.View style={[s.pulseDot, {
            backgroundColor: liveDotColor,
            opacity: livePulse.interpolate({ inputRange:[0,1], outputRange:[0.5,1] }),
            transform:[{ scale: livePulse.interpolate({ inputRange:[0,1], outputRange:[0.8,1.2] }) }],
          }]} />
          <Text style={[s.statusTitle, { color: colors.textPrimary, fontFamily:"Lexend_700Bold" }]}>
            Live
          </Text>
          {isOnline
            ? <Wifi size={13} color={colors.textMuted} />
            : <WifiOff size={13} color={colors.cancel} />}
          <Text style={[s.statusMeta, { color: colors.textMuted }]}>
            {totalRigCount} rigs
          </Text>
          {liveAlerts.length > 0 && (
            <View style={[s.alertPip, { backgroundColor: colors.alertYellow }]}>
              <Text style={s.alertPipText}>{liveAlerts.length}</Text>
            </View>
          )}
        </View>
        <View style={s.statusRight}>
          <View style={[s.clockRow, { borderColor: colors.border }]}>
            <Clock size={11} color={isSyncing ? colors.statusPending : colors.textMuted} />
            <Text style={[s.clockText, { color: isSyncing ? colors.statusPending : colors.textMuted }]}>
              {liveClock}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleTheme(); }}
            style={s.themeBtn}
            hitSlop={{ top:8, bottom:8, left:8, right:8 }}
          >
            {resolvedMode === "dark" ? <Moon size={16} color={colors.accent} /> : <Sun size={16} color={colors.statusPending} />}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowGuide(true); }}
            style={s.themeBtn}
            hitSlop={{ top:8, bottom:8, left:8, right:8 }}
          >
            <BookOpen size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Ticker ──────────────────────────────────────────────────────── */}
      <NewsTicker segments={tickerSegments} />

      {/* ── Scroll ──────────────────────────────────────────────────────── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh}
            tintColor={colors.accent} colors={[colors.accent]} />
        }
      >
        {/* Alerts */}
        {liveAlerts.length > 0 && (
          <View style={[s.alertBanner, { backgroundColor: colors.alertYellowBg, borderColor: colors.alertYellow+"40" }]}>
            <AlertTriangle size={14} color={colors.alertYellow} />
            <Text style={[s.alertBannerText, { color: colors.alertYellow }]} numberOfLines={alertExpanded ? 0 : 1}>
              {liveAlerts[0].message}
              {liveAlerts.length > 1 && !alertExpanded ? ` (+${liveAlerts.length - 1} more)` : ""}
            </Text>
            {liveAlerts.length > 1 && (
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAlertExpanded(v=>!v); }}
                hitSlop={{ top:8, bottom:8, left:8, right:8 }}
              >
                <Text style={[s.alertToggle, { color: colors.alertYellow }]}>
                  {alertExpanded ? "Less" : "All"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Region data ─────────────────────────────────────────────── */}
        <View style={[s.section, { backgroundColor: colors.bgCard, shadowColor: colors.shadow }]}>
          {/* Section header */}
          <View style={[s.sectionHeader, { borderBottomColor: colors.border }]}>
            <View style={s.sectionHeaderLeft}>
              <TrendingUp size={14} color={colors.accent} />
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>This Week</Text>
            </View>
            {(leaderboardQuery.isFetching || isSyncing) && (
              <ActivityIndicator size="small" color={colors.accent} />
            )}
          </View>

          {regionOverview.hasData ? (
            <>
              {/* Two-column region comparison */}
              <View style={s.regionGrid}>
                {renderRegionCol("EGO-MX", colors.mxOrange, regionOverview.mx, mxRigCount)}
                {renderRegionCol("EGO-SF", colors.sfBlue, regionOverview.sf, sfRigCount, true)}
              </View>

              {/* Combined team strip */}
              <View style={[s.combinedRow, { borderTopColor: colors.border }]}>
                <View style={s.combinedCell}>
                  <Text style={[s.combinedVal, { color: colors.accent }]}>
                    {regionOverview.totalHoursLogged.toFixed(1)}h
                  </Text>
                  <Text style={[s.combinedLabel, { color: colors.textMuted }]}>Total</Text>
                </View>
                <View style={[s.combinedDivider, { backgroundColor: colors.border }]} />
                <View style={s.combinedCell}>
                  <Text style={[s.combinedVal, { color: colors.complete }]}>
                    {regionOverview.totalTasksCompleted}
                  </Text>
                  <Text style={[s.combinedLabel, { color: colors.textMuted }]}>Done</Text>
                </View>
                <View style={[s.combinedDivider, { backgroundColor: colors.border }]} />
                <View style={s.combinedCell}>
                  <Text style={[s.combinedVal, { color: colors.accent }]}>
                    {regionOverview.combinedRate.toFixed(0)}%
                  </Text>
                  <Text style={[s.combinedLabel, { color: colors.textMuted }]}>Rate</Text>
                </View>
                <View style={[s.combinedDivider, { backgroundColor: colors.border }]} />
                <View style={s.combinedCell}>
                  <Text style={[s.combinedVal, { color: colors.textSecondary }]}>
                    {regionOverview.avgHoursPerTask.toFixed(1)}h
                  </Text>
                  <Text style={[s.combinedLabel, { color: colors.textMuted }]}>Avg</Text>
                </View>
              </View>
            </>
          ) : leaderboardQuery.isLoading ? (
            <View style={s.emptySection}>
              <ActivityIndicator color={colors.accent} />
              <Text style={[s.emptyText, { color: colors.textMuted }]}>Loading…</Text>
            </View>
          ) : (
            <View style={s.emptySection}>
              <Radio size={22} color={colors.border} />
              <Text style={[s.emptyText, { color: colors.textMuted }]}>
                {configured ? "Waiting for feed…" : "Configure GAS endpoint to see data"}
              </Text>
            </View>
          )}
        </View>

        {/* ── Recollections ────────────────────────────────────────────── */}
        {recollectItems.length > 0 && (
          <View style={[s.section, { backgroundColor: colors.bgCard, shadowColor: colors.shadow }]}>
            <View style={[s.sectionHeader, { borderBottomColor: colors.border }]}>
              <View style={s.sectionHeaderLeft}>
                <RotateCcw size={14} color={colors.recollectRed} />
                <Text style={[s.sectionTitle, { color: colors.recollectRed }]}>
                  Needs Recollection
                </Text>
              </View>
              <View style={[s.badge, { backgroundColor: colors.recollectRed }]}>
                <Text style={s.badgeText}>{recollectItems.length}</Text>
              </View>
            </View>
            {(recollectExpanded ? recollectItems : recollectItems.slice(0, 3)).map((item, i, arr) => (
              <View
                key={i}
                style={[
                  s.listRow,
                  i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                ]}
              >
                <View style={[s.dot, { backgroundColor: colors.recollectRed }]} />
                <Text style={[s.listRowText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item}
                </Text>
              </View>
            ))}
            {recollectItems.length > 3 && (
              <TouchableOpacity
                style={s.showMoreRow}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setRecollectExpanded(v=>!v); }}
                hitSlop={{ top:4, bottom:4, left:8, right:8 }}
              >
                <Text style={[s.showMoreText, { color: colors.accent }]}>
                  {recollectExpanded ? "Show less" : `Show ${recollectItems.length - 3} more`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Personal stats ───────────────────────────────────────────── */}
        {stats && selectedCollectorName && (
          <View style={[s.section, { backgroundColor: colors.bgCard, shadowColor: colors.shadow }]}>
            <View style={[s.sectionHeader, { borderBottomColor: colors.border }]}>
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>My Stats</Text>
              <Text style={[s.sectionSubtitle, { color: colors.textMuted }]}>
                {normalizeCollectorName(selectedCollectorName)}
              </Text>
            </View>
            <View style={s.combinedRow}>
              <View style={s.combinedCell}>
                <Text style={[s.combinedVal, { color: colors.accent }]}>
                  {stats.weeklyLoggedHours.toFixed(1)}h
                </Text>
                <Text style={[s.combinedLabel, { color: colors.textMuted }]}>This week</Text>
              </View>
              <View style={[s.combinedDivider, { backgroundColor: colors.border }]} />
              <View style={s.combinedCell}>
                <Text style={[s.combinedVal, { color: colors.complete }]}>
                  {stats.completionRate.toFixed(0)}%
                </Text>
                <Text style={[s.combinedLabel, { color: colors.textMuted }]}>Rate</Text>
              </View>
              <View style={[s.combinedDivider, { backgroundColor: colors.border }]} />
              <View style={s.combinedCell}>
                <Text style={[s.combinedVal, { color: colors.textSecondary }]}>
                  {stats.totalCompleted}/{stats.totalAssigned}
                </Text>
                <Text style={[s.combinedLabel, { color: colors.textMuted }]}>Done</Text>
              </View>
            </View>
          </View>
        )}

        <View style={s.bottomSpacer} />
      </ScrollView>

      <GuideModal visible={showGuide} onClose={() => setShowGuide(false)} />
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  // Status bar
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statusLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
  pulseDot: { width: 7, height: 7, borderRadius: 4 },
  statusTitle: { fontSize: 15, fontWeight: "700" as const },
  statusMeta: { fontSize: 13 },
  alertPip: {
    minWidth: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 5,
  },
  alertPipText: { fontSize: 11, color: "#fff", fontWeight: "700" as const },
  statusRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  clockRow: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
  },
  clockText: { fontSize: 12, fontFamily: "monospace" as any },
  themeBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },

  // Alert banner
  alertBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  alertBannerText: { flex: 1, fontSize: 13, lineHeight: 18 },
  alertToggle: { fontSize: 13, fontWeight: "600" as const, paddingLeft: 4 },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: 12, gap: 10 },
  bottomSpacer: { height: 110 },

  // Section surface
  section: {
    borderRadius: 14,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
  sectionTitle: { fontSize: 14, fontWeight: "600" as const },
  sectionSubtitle: { fontSize: 13 },
  badge: {
    minWidth: 20, height: 20, borderRadius: 10,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 6,
  },
  badgeText: { fontSize: 12, color: "#fff", fontWeight: "700" as const },

  // Region two-column grid
  regionGrid: { flexDirection: "row" },
  regionCol: {
    flex: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 4,
  },
  regionColLabel: { fontSize: 12, fontWeight: "700" as const, letterSpacing: 0.3 },
  regionBigVal: { fontSize: 24, fontWeight: "700" as const, marginTop: 2 },
  regionMeta: { fontSize: 12, lineHeight: 17 },
  regionBar: {
    height: 4, borderRadius: 2, overflow: "hidden", marginVertical: 4,
  },
  regionBarFill: { height: 4, borderRadius: 2 },

  // Combined row
  combinedRow: {
    flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth,
  },
  combinedCell: { flex: 1, alignItems: "center", paddingVertical: 10 },
  combinedDivider: { width: StyleSheet.hairlineWidth },
  combinedVal: { fontSize: 17, fontWeight: "700" as const },
  combinedLabel: { fontSize: 11, marginTop: 2 },

  // Empty state
  emptySection: { alignItems: "center", paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 13, textAlign: "center" },

  // List rows (recollections)
  listRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 11, minHeight: 44,
  },
  dot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  listRowText: { flex: 1, fontSize: 13 },
  showMoreRow: { paddingHorizontal: 14, paddingVertical: 10, minHeight: 38 },
  showMoreText: { fontSize: 13, fontWeight: "600" as const },
});
