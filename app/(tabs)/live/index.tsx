import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Dimensions,
  TouchableOpacity,
  Modal,
} from "react-native";
import { RefreshCw, Sun, Moon, Snowflake, Glasses, BookOpen, X, User, Clock3 } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/providers/ThemeProvider";
import { useLocale } from "@/providers/LocaleProvider";
import { useCollection } from "@/providers/CollectionProvider";
import { DesignTokens } from "@/constants/colors";
import ScreenContainer from "@/components/ScreenContainer";
import { useQuery } from "@tanstack/react-query";
import { fetchTodayLog, fetchCollectorStats, fetchRecollections, fetchActiveRigsCount, fetchLeaderboard, fetchLiveAlerts } from "@/services/googleSheets";
import { Image } from "expo-image";
import type { LiveAlert } from "@/types";
import { normalizeCollectorName } from "@/utils/strings";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const FONT_MONO = DesignTokens.fontMono;
const SF_RIG_NUMBERS = new Set(["2", "3", "4", "5", "6", "9", "11"]);

function getRigRegion(rig: unknown): "SF" | "MX" {
  const key = String(rig ?? "").trim().toUpperCase();
  if (!key) return "MX";
  if (key.includes("EGO-SF") || key.includes("-SF") || key.startsWith("SF")) return "SF";
  const match = key.match(/(\d+)(?!.*\d)/);
  if (match && SF_RIG_NUMBERS.has(String(Number(match[1])))) return "SF";
  return "MX";
}

interface TerminalLine {
  id: string;
  text: string;
  type: "header" | "data" | "divider" | "empty" | "label" | "cmd" | "prompt";
  color?: string;
}

interface TickerSegment {
  label: string;
  color: string;
  items: string[];
  speed: number;
}

interface RegionSnapshot {
  collectors: number;
  tasksAssigned: number;
  tasksCompleted: number;
  hoursLogged: number;
  completionRate: number;
}

const NewsTicker = React.memo(function NewsTicker({ segments }: { segments: TickerSegment[] }) {
  const { colors, isDark } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const pillSlide = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const seg = segments[activeIndex] ?? segments[0];

  const startScroll = useCallback((segIndex: number) => {
    const segment = segments[segIndex];
    if (!segment) return;

    const tickerText = segment.items.join("     |     ");
    const textWidth = tickerText.length * 7 + SCREEN_WIDTH;
    const charSpeed = segment.speed || 28;
    const duration = Math.max(textWidth * charSpeed, 10000);

    scrollX.setValue(SCREEN_WIDTH * 1.2);

    if (animRef.current) animRef.current.stop();

    const scrollAnim = Animated.timing(scrollX, {
      toValue: -textWidth + SCREEN_WIDTH * 0.3,
      duration,
      useNativeDriver: true,
    });

    animRef.current = scrollAnim;

    scrollAnim.start(({ finished }) => {
      if (finished && segments.length > 1) {
        const nextIdx = (segIndex + 1) % segments.length;

        Animated.timing(pillSlide, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          setActiveIndex(nextIdx);
          pillSlide.setValue(0);

          timerRef.current = setTimeout(() => {
            startScroll(nextIdx);
          }, 400);
        });
      } else if (finished && segments.length <= 1) {
        timerRef.current = setTimeout(() => {
          startScroll(segIndex);
        }, 2000);
      }
    });
  }, [segments, scrollX, pillSlide]);

  useEffect(() => {
    setActiveIndex(0);
    pillSlide.setValue(0);
    startScroll(0);

    return () => {
      if (animRef.current) animRef.current.stop();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [segments, pillSlide, startScroll]);

  if (!seg) return null;

  const tickerText = seg.items.join("   |   ");

  const fadeOpacity = scrollX.interpolate({
    inputRange: [SCREEN_WIDTH * 0.8, SCREEN_WIDTH * 1.2],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={[tickerStyles.container, {
      backgroundColor: colors.bgSecondary,
      borderBottomColor: colors.border,
    }]}>
      <Animated.View style={[tickerStyles.pillWrap, {
        opacity: pillSlide.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.3, 1] }),
      }]}>
        <View style={[tickerStyles.pill, { backgroundColor: seg.color + '22' }]}>
          <View style={[tickerStyles.pillDot, { backgroundColor: seg.color }]} />
          <Text style={[tickerStyles.pillText, { color: seg.color, fontFamily: FONT_MONO }]}>
            {seg.label}
          </Text>
        </View>
      </Animated.View>
      <View style={[tickerStyles.separator, { backgroundColor: colors.border }]} />
      <View style={tickerStyles.scrollWrap}>
        <View style={[tickerStyles.scrollHighlight, { backgroundColor: seg.color + (isDark ? '12' : '0A') }]} />
        <Animated.Text
          style={[tickerStyles.scrollText, {
            color: seg.color,
            fontFamily: FONT_MONO,
            opacity: fadeOpacity,
            transform: [{ translateX: scrollX }],
          }]}
          numberOfLines={1}
        >
          {tickerText}
        </Animated.Text>
        <View style={[tickerStyles.fadeEdgeLeft, { backgroundColor: colors.bgSecondary }]} pointerEvents="none" accessible={false} />
        <View style={[tickerStyles.fadeEdgeRight, { backgroundColor: colors.bgSecondary }]} pointerEvents="none" accessible={false} />
      </View>
    </View>
  );
});

const CmdTerminal = React.memo(function CmdTerminal({ lines, isLoading, activeRigs, onResync, onPersonalStats }: {
  lines: TerminalLine[];
  isLoading: boolean;
  activeRigs: number;
  onResync: () => void;
  onPersonalStats: () => void;
}) {
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const cursorAnim = useRef(new Animated.Value(0)).current;
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(cursorAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, [cursorAnim]);

  useEffect(() => {
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };
  }, [lines.length]);

  const termBg = colors.terminalBg;
  const termBorder = colors.border;

  const getLineColor = useCallback((line: TerminalLine) => {
    if (line.type === "header") return colors.accent;
    if (line.type === "cmd") return colors.terminalGreen;
    if (line.type === "prompt") return colors.terminalDim;
    if (line.type === "divider") return colors.terminalDim;
    if (line.type === "label") return colors.mxOrange;
    if (line.type === "empty") return "transparent";
    return line.color ?? colors.textPrimary;
  }, [colors]);

  const getPrefix = useCallback((type: string) => {
    if (type === "prompt") return "$ ";
    if (type === "cmd") return "> ";
    if (type === "header") return "# ";
    if (type === "label") return "  ~ ";
    return "  ";
  }, []);

  return (
    <View style={[cmdStyles.window, { backgroundColor: termBg, borderColor: termBorder }]}>
      <View style={[cmdStyles.titleBar, { borderBottomColor: termBorder }]}>
        <View style={cmdStyles.dots}>
          <View style={[cmdStyles.dot, { backgroundColor: '#E87070' }]} />
          <View style={[cmdStyles.dot, { backgroundColor: '#D4A843' }]} />
          <View style={[cmdStyles.dot, { backgroundColor: '#5EBD8A' }]} />
        </View>
        <Text style={[cmdStyles.titleText, { color: colors.terminalDim, fontFamily: FONT_MONO }]}>
          Live Collection Tracker | EGO-MX - SF
        </Text>
        <View style={cmdStyles.sessionMeta}>
          <View style={[cmdStyles.sessionBadge, { backgroundColor: isLoading ? colors.statusPending + '18' : colors.terminalGreen + '18' }]}>
            <View style={[cmdStyles.sessionDot, { backgroundColor: isLoading ? colors.statusPending : colors.terminalGreen }]} />
            <Text style={[cmdStyles.sessionLabel, { color: isLoading ? colors.statusPending : colors.terminalGreen, fontFamily: FONT_MONO }]}>
              {isLoading ? 'SYNCING' : 'SYNCED'}
            </Text>
          </View>
          <Text style={[cmdStyles.rigCountMini, { color: colors.terminalDim, fontFamily: FONT_MONO }]}>
            {activeRigs} rigs
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={cmdStyles.scrollArea}
        contentContainerStyle={cmdStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {lines.map((line) => {
          if (line.type === "empty") return <View key={line.id} style={{ height: 8 }} />;
          const lineColor = getLineColor(line);
          if (line.type === "divider") {
            return (
              <Text key={line.id} style={[cmdStyles.line, { color: lineColor, fontFamily: FONT_MONO, opacity: 0.25 }]}>
                {line.text}
              </Text>
            );
          }
          return (
            <Text
              key={line.id}
              style={[cmdStyles.line, {
                color: lineColor,
                fontFamily: FONT_MONO,
                fontWeight: line.type === "header" ? "700" as const : "400" as const,
                fontSize: line.type === "header" ? 12 : 11,
              }]}
            >
              {getPrefix(line.type)}{line.text}
            </Text>
          );
        })}

        {isLoading && (
          <Animated.Text style={[cmdStyles.line, {
            color: colors.terminalGreen,
            fontFamily: FONT_MONO,
            opacity: cursorAnim,
          }]}>
            {"  \u2588"}
          </Animated.Text>
        )}

        {!isLoading && lines.length > 3 && (
          <View style={cmdStyles.actionRow}>
            <TouchableOpacity
              style={[cmdStyles.actionBtn, { backgroundColor: colors.accentSoft, borderColor: colors.accentDim }]}
              onPress={onResync}
              activeOpacity={0.7}
            >
              <RefreshCw size={11} color={colors.accent} />
              <Text style={[cmdStyles.actionText, { color: colors.accent, fontFamily: FONT_MONO }]}>RESYNC</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[cmdStyles.actionBtn, { backgroundColor: colors.completeBg, borderColor: colors.complete + '30' }]}
              onPress={onPersonalStats}
              activeOpacity={0.7}
            >
              <User size={11} color={colors.complete} />
              <Text style={[cmdStyles.actionText, { color: colors.complete, fontFamily: FONT_MONO }]}>MY STATS</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
});

const GuideModal = React.memo(function GuideModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const steps = [
    { num: "01", title: "Select Your Profile", desc: "Go to Tools and pick your name & rig." },
    { num: "02", title: "Assign a Task", desc: "Head to Collect, choose a task, and hit Assign." },
    { num: "03", title: "Complete or Log Hours", desc: "Track your progress and mark tasks Done." },
    { num: "04", title: "Check Your Stats", desc: "Visit Stats for performance and leaderboard." },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={guideStyles.overlay}>
        <View style={[guideStyles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={guideStyles.cardHeader}>
            <Text style={[guideStyles.cardTitle, { color: colors.accent, fontFamily: FONT_MONO }]}>QUICK START</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <X size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          {steps.map((step, idx) => (
            <View key={step.num} style={[guideStyles.step, idx < steps.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
              <View style={[guideStyles.stepNum, { backgroundColor: colors.accentSoft }]}>
                <Text style={[guideStyles.stepNumText, { color: colors.accent, fontFamily: FONT_MONO }]}>{step.num}</Text>
              </View>
              <View style={guideStyles.stepContent}>
                <Text style={[guideStyles.stepTitle, { color: colors.textPrimary, fontWeight: "600" as const }]}>{step.title}</Text>
                <Text style={[guideStyles.stepDesc, { color: colors.textSecondary }]}>{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
});

export default function LiveScreen() {
  const { colors, isDark, resolvedMode, toggleTheme } = useTheme();
  const { t } = useLocale();
  const { configured, collectors, todayLog, selectedCollectorName } = useCollection();

  const [liveLines, setLiveLines] = useState<TerminalLine[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [isFeeding, setIsFeeding] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [clockNow, setClockNow] = useState(() => new Date());
  const lineIndexRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const livePulse = useRef(new Animated.Value(0)).current;
  const brandWave = useRef(new Animated.Value(0)).current;

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
      const target = base[region];
      target.completionRate = target.tasksAssigned > 0
        ? (target.tasksCompleted / target.tasksAssigned) * 100
        : 0;
    }

    const totalTasksAssigned = base.MX.tasksAssigned + base.SF.tasksAssigned;
    const totalTasksCompleted = base.MX.tasksCompleted + base.SF.tasksCompleted;
    const totalHoursLogged = base.MX.hoursLogged + base.SF.hoursLogged;
    const combinedCompletionRate = totalTasksAssigned > 0
      ? (totalTasksCompleted / totalTasksAssigned) * 100
      : 0;

    return {
      mx: base.MX,
      sf: base.SF,
      hasLeaderboardData: leaderboardEntries.length > 0,
      totalTasksAssigned,
      totalTasksCompleted,
      totalHoursLogged,
      combinedCompletionRate,
      avgHoursPerCompletedTask: totalTasksCompleted > 0 ? totalHoursLogged / totalTasksCompleted : 0,
    };
  }, [leaderboardEntries]);

  const totalRigCountFallback = useMemo(() => {
    if (mappedRigCounts.total > 0) return mappedRigCounts.total;
    return Math.max(collectors.length, 1);
  }, [mappedRigCounts.total, collectors.length]);

  /** Active rigs = rigs with an upload today in collector actuals (CA_PLUS preferred, CA_TAGGED fallback). */
  const totalRigCount = activeRigsQuery.data != null
    ? activeRigsQuery.data.activeRigsToday
    : totalRigCountFallback;
  const liveAlerts = useMemo(() => alertsQuery.data ?? [], [alertsQuery.data]);

  const stats = statsQuery.data;
  const isSyncing = isFeeding || statsQuery.isFetching || leaderboardQuery.isFetching || todayLogQuery.isFetching || recollectionsQuery.isFetching || activeRigsQuery.isFetching || alertsQuery.isFetching;

  const tickerSegments = useMemo((): TickerSegment[] => {
    const segs: TickerSegment[] = [];
    const alertItems = liveAlerts.length > 0
      ? liveAlerts.slice(0, 8).map((item) => `${item.level || "INFO"}: ${item.message}`)
      : ["Welcome to TaskFlow", "Check your daily assignments", "Stay on target"];
    segs.push({
      label: "ALERT", color: colors.alertYellow,
      items: alertItems,
      speed: 32,
    });
    segs.push({
      label: "RECOLLECT", color: colors.recollectRed,
      items: recollectItems.length > 0 ? recollectItems : ["No pending recollections"],
      speed: recollectItems.length > 0 ? 22 : 32,
    });
    const regionItems: string[] = regionOverview.hasLeaderboardData
      ? [
        `MX ${regionOverview.mx.hoursLogged.toFixed(2)}h · ${regionOverview.mx.tasksCompleted}/${regionOverview.mx.tasksAssigned} done`,
        `SF ${regionOverview.sf.hoursLogged.toFixed(2)}h · ${regionOverview.sf.tasksCompleted}/${regionOverview.sf.tasksAssigned} done`,
        `Combined ${regionOverview.totalHoursLogged.toFixed(2)}h · ${regionOverview.combinedCompletionRate.toFixed(1)}%`,
      ]
      : ["Waiting for weekly leaderboard feed..."];
    segs.push({ label: "REGIONS", color: colors.mxOrange, items: regionItems, speed: 34 });
    const statsItems: string[] = [];
    if (stats) {
      statsItems.push(`Completion: ${stats.completionRate.toFixed(0)}%`);
      statsItems.push(`Hours (this week): ${stats.weeklyLoggedHours.toFixed(2)}h`);
      statsItems.push(`Done: ${stats.totalCompleted}`);
      if (stats.topTasks?.length) {
        stats.topTasks.slice(0, 5).forEach((t, i) => {
          statsItems.push(`#${i + 1} ${t.name} (${Number(t.hours).toFixed(2)}h)`);
        });
      }
    } else {
      statsItems.push("Loading stats...");
    }
    segs.push({ label: "STATS", color: colors.statsGreen, items: statsItems, speed: 36 });
    return segs;
  }, [colors, recollectItems, stats, regionOverview, liveAlerts]);

  const buildTerminalLines = useCallback((): TerminalLine[] => {
    const lines: TerminalLine[] = [];
    const ts = Date.now();
    const mxRigs = mappedRigCounts.mxRigs;
    const sfRigs = mappedRigCounts.sfRigs;
    const mxCount = regionOverview.mx.collectors > 0 ? regionOverview.mx.collectors : fallbackCollectorCounts.mx;
    const sfCount = regionOverview.sf.collectors > 0 ? regionOverview.sf.collectors : fallbackCollectorCounts.sf;

    lines.push({ id: `p1_${ts}`, text: "taskflow --connect --live", type: "prompt" });
    lines.push({ id: `c1_${ts}`, text: "Establishing connection to EGO data pipeline...", type: "cmd" });
    lines.push({ id: `c2_${ts}`, text: "Authenticated. Pulling latest collection intel.", type: "cmd" });
    lines.push({ id: `d1_${ts}`, text: "", type: "empty" });
    lines.push({ id: `d2_${ts}`, text: "\u2500".repeat(44), type: "divider" });

    lines.push({ id: `p2_${ts}`, text: "fetch --region mx --status live", type: "prompt" });
    lines.push({ id: `mx_h_${ts}`, text: "EGO-MX  |  LOS CABOS", type: "header" });
    lines.push({ id: `mx_c_${ts}`, text: `Collectors Online:  ${mxCount}`, type: "data", color: colors.textPrimary });
    lines.push({ id: `mx_r_${ts}`, text: `Mapped Rigs:        ${mxRigs}`, type: "data", color: colors.textPrimary });
    if (regionOverview.hasLeaderboardData) {
      lines.push({ id: `mx_t_${ts}`, text: `Tasks Assigned (wk): ${regionOverview.mx.tasksAssigned}`, type: "data", color: colors.mxOrange });
      lines.push({ id: `mx_h2_${ts}`, text: `Hours Captured (wk): ${regionOverview.mx.hoursLogged.toFixed(2)}h`, type: "data", color: colors.mxOrange });
      lines.push({ id: `mx_r2_${ts}`, text: `Completion Rate:    ${regionOverview.mx.completionRate.toFixed(1)}%`, type: "data", color: colors.terminalGreen });
    } else {
      lines.push({ id: `mx_w_${ts}`, text: "Awaiting data feed...", type: "label" });
    }

    lines.push({ id: `d3_${ts}`, text: "", type: "empty" });
    lines.push({ id: `p3_${ts}`, text: "fetch --region sf --status live", type: "prompt" });
    lines.push({ id: `sf_h_${ts}`, text: "EGO-SF  |  SAN FRANCISCO", type: "header" });
    lines.push({ id: `sf_c_${ts}`, text: `Collectors Online:  ${sfCount}`, type: "data", color: colors.textPrimary });
    lines.push({ id: `sf_r_${ts}`, text: `Mapped Rigs:        ${sfRigs}`, type: "data", color: colors.textPrimary });
    if (regionOverview.hasLeaderboardData) {
      lines.push({ id: `sf_t_${ts}`, text: `Tasks Assigned (wk): ${regionOverview.sf.tasksAssigned}`, type: "data", color: colors.sfBlue });
      lines.push({ id: `sf_h2_${ts}`, text: `Hours Captured (wk): ${regionOverview.sf.hoursLogged.toFixed(2)}h`, type: "data", color: colors.sfBlue });
      lines.push({ id: `sf_r2_${ts}`, text: `Completion Rate:    ${regionOverview.sf.completionRate.toFixed(1)}%`, type: "data", color: colors.terminalGreen });
    } else {
      lines.push({ id: `sf_w_${ts}`, text: "Awaiting data feed...", type: "label" });
    }

    lines.push({ id: `d4_${ts}`, text: "", type: "empty" });
    lines.push({ id: `d5_${ts}`, text: "\u2500".repeat(44), type: "divider" });
    lines.push({ id: `p4_${ts}`, text: "aggregate --combined --weekly", type: "prompt" });
    lines.push({ id: `cb_h_${ts}`, text: "COMBINED TEAM OVERVIEW", type: "header" });
    if (regionOverview.hasLeaderboardData) {
      lines.push({ id: `cb_1_${ts}`, text: `Overall Rate:       ${regionOverview.combinedCompletionRate.toFixed(1)}%`, type: "data", color: colors.terminalGreen });
      lines.push({ id: `cb_2_${ts}`, text: `Avg Hours/Task:     ${regionOverview.avgHoursPerCompletedTask.toFixed(2)}h`, type: "data", color: colors.textPrimary });
      lines.push({ id: `cb_3_${ts}`, text: `Weekly Hours:       ${regionOverview.totalHoursLogged.toFixed(2)}h`, type: "data", color: colors.accentLight });
      lines.push({ id: `cb_4_${ts}`, text: `Weekly Completed:   ${regionOverview.totalTasksCompleted}`, type: "data", color: colors.terminalGreen });
      lines.push({ id: `cb_5_${ts}`, text: `Total Rigs Active:  ${totalRigCount} (mapped MX: ${mxRigs} | SF: ${sfRigs})`, type: "data", color: colors.textPrimary });
    } else {
      lines.push({ id: `cb_w_${ts}`, text: "Syncing with server...", type: "label" });
    }

    if (recollectItems.length > 0) {
      lines.push({ id: `d6_${ts}`, text: "", type: "empty" });
      lines.push({ id: `p5_${ts}`, text: "query --recollections --pending", type: "prompt" });
      lines.push({ id: `rc_h_${ts}`, text: "PENDING RECOLLECTIONS", type: "header" });
      recollectItems.slice(0, 5).forEach((item, i) => {
        lines.push({ id: `rc_${ts}_${i}`, text: item, type: "data", color: colors.cancel });
      });
      if (recollectItems.length > 5) {
        lines.push({ id: `rc_more_${ts}`, text: `+ ${recollectItems.length - 5} more pending...`, type: "label" });
      }
    }

    lines.push({ id: `d7_${ts}`, text: "", type: "empty" });
    lines.push({ id: `d8_${ts}`, text: "\u2500".repeat(44), type: "divider" });
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}.${String(now.getMilliseconds()).padStart(3, "0")}`;
    lines.push({ id: `ts_${ts}`, text: `Last sync: ${timeStr} PST`, type: "cmd" });
    lines.push({ id: `rdy_${ts}`, text: "Ready for commands.", type: "cmd" });

    return lines;
  }, [mappedRigCounts, fallbackCollectorCounts, regionOverview, colors, recollectItems, totalRigCount]);

  const allLines = useMemo(() => buildTerminalLines(), [buildTerminalLines]);

  useEffect(() => {
    setIsOnline(configured);
    setLiveLines([]);
    setIsFeeding(true);
    lineIndexRef.current = 0;
    if (intervalRef.current) clearInterval(intervalRef.current);

    const feed = () => {
      if (lineIndexRef.current >= allLines.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setIsFeeding(false);
        return;
      }
      const next = allLines[lineIndexRef.current];
      lineIndexRef.current += 1;
      setLiveLines(prev => [...prev, next].slice(-50));
    };

    feed();
    intervalRef.current = setInterval(feed, 90);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [allLines, configured]);

  useEffect(() => {
    const clockInterval = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(clockInterval);
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

  useEffect(() => {
    const waving = Animated.loop(
      Animated.sequence([
        Animated.timing(brandWave, { toValue: 1, duration: 2100, useNativeDriver: true }),
        Animated.timing(brandWave, { toValue: 0, duration: 2100, useNativeDriver: true }),
      ])
    );
    waving.start();
    return () => waving.stop();
  }, [brandWave]);

  const handleResync = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    statsQuery.refetch();
    leaderboardQuery.refetch();
    todayLogQuery.refetch();
    recollectionsQuery.refetch();
    activeRigsQuery.refetch();
    alertsQuery.refetch();
    setLiveLines([]);
    setIsFeeding(true);
    lineIndexRef.current = 0;
  }, [statsQuery, leaderboardQuery, todayLogQuery, recollectionsQuery, activeRigsQuery, alertsQuery]);

  const handlePersonalStats = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!stats || !selectedCollectorName) return;
    const ts = Date.now();
    const personalLines: TerminalLine[] = [
      { id: `ps_p_${ts}`, text: `stats --collector "${selectedCollectorName}"`, type: "prompt" },
      { id: `ps_h_${ts}`, text: `PERSONAL STATS: ${normalizeCollectorName(selectedCollectorName)}`, type: "header" },
      { id: `ps_1_${ts}`, text: `Total Assigned:     ${stats.totalAssigned}`, type: "data", color: colors.textPrimary },
      { id: `ps_2_${ts}`, text: `Total Completed:    ${stats.totalCompleted}`, type: "data", color: colors.terminalGreen },
      { id: `ps_3_${ts}`, text: `Hours Logged (wk):  ${stats.weeklyLoggedHours.toFixed(2)}h`, type: "data", color: colors.accentLight },
      { id: `ps_4_${ts}`, text: `Completion Rate:    ${stats.completionRate.toFixed(0)}%`, type: "data", color: colors.terminalGreen },
      { id: `ps_5_${ts}`, text: `Avg Hours/Task:     ${stats.avgHoursPerTask.toFixed(2)}h`, type: "data", color: colors.accent },
      { id: `ps_d_${ts}`, text: "\u2500".repeat(44), type: "divider" },
    ];
    setLiveLines(prev => [...prev, ...personalLines].slice(-50));
  }, [stats, selectedCollectorName, colors]);

  const handleToggleTheme = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleTheme();
  }, [toggleTheme]);

  const livePillColor = isDark ? colors.terminalGreen : '#2D8A56';
  const liveClock = useMemo(() => {
    const d = clockNow;
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  }, [clockNow]);

  return (
    <ScreenContainer>
      <View style={[liveStyles.topBar, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View pointerEvents="none" accessible={false} style={[liveStyles.headerGlow, { backgroundColor: colors.accentSoft }]} />
        <View style={liveStyles.topBarLeft}>
          <View style={[liveStyles.headerTag, { backgroundColor: colors.accentSoft, borderColor: colors.accentDim }]}>
            <Text style={[liveStyles.headerTagText, { color: colors.accent }]}>{`${t("live", "Live").toUpperCase()} MONITOR`}</Text>
          </View>
          <View style={liveStyles.brandRow}>
            <Image source={require("../../../assets/images/icon.png")} style={liveStyles.brandLogo} contentFit="contain" />
            <View style={liveStyles.brandStack}>
              <Animated.Text
                style={[
                  liveStyles.brandStroke,
                  {
                    color: colors.accentDim,
                    transform: [{ translateX: brandWave.interpolate({ inputRange: [0, 1], outputRange: [-2, 2] }) }],
                  },
                ]}
              >
                TASKFLOW
              </Animated.Text>
              <Animated.Text
                style={[
                  liveStyles.brandText,
                  {
                    color: colors.accent,
                    fontFamily: "Lexend_700Bold",
                    textShadowColor: colors.accent + "33",
                    textShadowRadius: 9,
                    transform: [{ translateX: brandWave.interpolate({ inputRange: [0, 1], outputRange: [2, -2] }) }],
                  },
                ]}
              >
                TASKFLOW
              </Animated.Text>
            </View>
            <View style={[liveStyles.liveBadge, {
              backgroundColor: isOnline ? livePillColor + '14' : colors.cancel + '14',
              borderColor: isOnline ? livePillColor + '40' : colors.cancel + '40',
            }]}>
              <Animated.View
                pointerEvents="none"
                accessible={false}
                style={[liveStyles.liveGlow, {
                  backgroundColor: isOnline ? livePillColor : colors.cancel,
                  opacity: livePulse.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.28] }),
                  transform: [{ scale: livePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }],
                }]}
              />
              <View style={[liveStyles.liveDot, { backgroundColor: isOnline ? livePillColor : colors.cancel }]} />
              <Text style={[liveStyles.liveLabel, { color: isOnline ? livePillColor : colors.cancel, fontFamily: FONT_MONO }]}>
                {isOnline ? "LIVE" : "OFF"}
              </Text>
            </View>
          </View>
          <View style={liveStyles.metaRow}>
            <View style={[liveStyles.rigCountChip, {
              borderColor: isOnline ? livePillColor + "40" : colors.border,
              backgroundColor: isOnline ? livePillColor + "10" : colors.bgInput,
            }]}>
              <Animated.View
                style={[liveStyles.rigCountDot, {
                  backgroundColor: isOnline ? livePillColor : colors.statusPending,
                  opacity: livePulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
                  transform: [{ scale: livePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] }) }],
                }]}
              />
              <Text style={[liveStyles.rigCountText, { color: colors.textSecondary, fontFamily: "Lexend_500Medium" }]}>
                {totalRigCount} rigs active
              </Text>
            </View>
            {liveAlerts.length > 0 && (
              <View style={[liveStyles.alertChip, { borderColor: colors.alertYellow + "35", backgroundColor: colors.alertYellowBg }]}>
                <Text style={[liveStyles.alertChipText, { color: colors.alertYellow, fontFamily: FONT_MONO }]}>
                  {liveAlerts.length} alerts
                </Text>
              </View>
            )}
            <View style={[liveStyles.clockPill, {
              backgroundColor: isSyncing ? colors.statusPending + "14" : colors.bgCard,
              borderColor: isSyncing ? colors.statusPending + "3A" : colors.border,
            }]}>
              <Clock3 size={11} color={isSyncing ? colors.statusPending : colors.textMuted} />
              <Text style={[liveStyles.clockText, {
                color: isSyncing ? colors.statusPending : colors.textSecondary,
                fontFamily: FONT_MONO,
              }]}>
                {liveClock}
              </Text>
            </View>
          </View>
        </View>
        <View style={liveStyles.topBarRight}>
          <TouchableOpacity
            style={[liveStyles.iconBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
            onPress={handleToggleTheme}
            activeOpacity={0.7}
            testID="theme-toggle-live"
          >
            {resolvedMode === "dark" ? <Moon size={15} color={colors.accent} /> :
             resolvedMode === "frosted" ? <Snowflake size={15} color={colors.accent} /> :
             resolvedMode === "tinted" ? <Glasses size={15} color={colors.accent} /> :
             <Sun size={15} color={colors.alertYellow} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={[liveStyles.iconBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowGuide(true); }}
            activeOpacity={0.7}
            testID="guide-btn"
          >
            <BookOpen size={15} color={colors.accent} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={liveStyles.tickerWrap}>
        <NewsTicker segments={tickerSegments} />
      </View>

      <ScrollView style={liveStyles.terminalScroll} contentContainerStyle={liveStyles.terminalContent} showsVerticalScrollIndicator={false}>
        <CmdTerminal
          lines={liveLines}
          isLoading={isFeeding}
          activeRigs={totalRigCount}
          onResync={handleResync}
          onPersonalStats={handlePersonalStats}
        />
      </ScrollView>

      <GuideModal visible={showGuide} onClose={() => setShowGuide(false)} />
    </ScreenContainer>
  );
}

const tickerStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    overflow: "hidden",
    borderBottomWidth: 1,
    borderRadius: 12,
  },
  pillWrap: { paddingHorizontal: 10 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  pillDot: { width: 5, height: 5, borderRadius: 3 },
  pillText: { fontSize: 8, fontWeight: "800" as const, letterSpacing: 1.2 },
  separator: { width: 1, height: 16 },
  scrollWrap: { flex: 1, overflow: "hidden", height: 34, justifyContent: "center", marginLeft: 8, position: "relative" as const },
  scrollHighlight: { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 },
  scrollText: { fontSize: 10, letterSpacing: 0.3, width: 5000 },
  fadeEdgeLeft: { position: "absolute" as const, top: 0, left: 0, bottom: 0, width: 16, opacity: 0.7 },
  fadeEdgeRight: { position: "absolute" as const, top: 0, right: 0, bottom: 0, width: 24, opacity: 0.8 },
});

const cmdStyles = StyleSheet.create({
  window: { borderRadius: DesignTokens.radius.lg, borderWidth: 1, overflow: "hidden" },
  titleBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: DesignTokens.spacing.sm,
    paddingHorizontal: DesignTokens.spacing.md,
    borderBottomWidth: 1,
  },
  dots: { flexDirection: "row", gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  titleText: { fontSize: 9, letterSpacing: 0.3, marginLeft: 10, flex: 1 },
  sessionMeta: { alignItems: "flex-end", gap: 2 },
  sessionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sessionDot: { width: 4, height: 4, borderRadius: 2 },
  sessionLabel: { fontSize: 7, fontWeight: "800" as const, letterSpacing: 1 },
  rigCountMini: { fontSize: 7, letterSpacing: 0.5 },
  scrollArea: { maxHeight: 420 },
  scrollContent: { padding: 12, paddingBottom: 8 },
  line: { lineHeight: 19, letterSpacing: 0.2, fontSize: 11 },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(128,128,128,0.1)",
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionText: { fontSize: 9, fontWeight: "700" as const, letterSpacing: 1 },
});

const guideStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center", padding: DesignTokens.spacing.xxl },
  card: { width: "100%", maxWidth: 380, borderRadius: DesignTokens.radius.xl, borderWidth: 1, padding: DesignTokens.spacing.xl },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  cardTitle: { fontSize: 14, fontWeight: "800" as const, letterSpacing: 3 },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 14 },
  stepNum: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  stepNumText: { fontSize: 11, fontWeight: "800" as const },
  stepContent: { flex: 1 },
  stepTitle: { fontSize: 14, marginBottom: 3 },
  stepDesc: { fontSize: 12, lineHeight: 17 },
});

const liveStyles = StyleSheet.create({
  tickerWrap: {
    paddingHorizontal: DesignTokens.spacing.md,
    paddingTop: 8,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginHorizontal: DesignTokens.spacing.md,
    marginTop: DesignTokens.spacing.sm,
    padding: DesignTokens.spacing.lg,
    borderRadius: DesignTokens.radius.xl,
    borderWidth: 1,
    overflow: "hidden",
  },
  headerGlow: {
    position: "absolute",
    top: -44,
    left: -22,
    right: -22,
    height: 126,
    opacity: 0.8,
    borderBottomLeftRadius: 74,
    borderBottomRightRadius: 74,
  },
  topBarLeft: { flex: 1 },
  headerTag: {
    alignSelf: "flex-start",
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 4,
  },
  headerTagText: { fontSize: 9, fontWeight: "800" as const, letterSpacing: 1.1 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandLogo: { width: 26, height: 26, borderRadius: 8 },
  brandStack: { position: "relative", minWidth: 190, height: 42, justifyContent: "center" },
  brandStroke: {
    position: "absolute",
    top: 0,
    left: 0,
    fontSize: 34,
    fontWeight: "700" as const,
    letterSpacing: 0.4,
    opacity: 0.58,
  },
  brandText: { fontSize: 34, fontWeight: "700" as const, letterSpacing: 0.2 },
  liveBadge: {
    position: "relative" as const,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
  },
  liveGlow: {
    position: "absolute" as const,
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 9,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveLabel: { fontSize: 9, fontWeight: "800" as const, letterSpacing: 1.2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  rigCountChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  rigCountDot: { width: 6, height: 6, borderRadius: 4 },
  rigCountText: { fontSize: 10, letterSpacing: 0.5 },
  alertChip: {
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  alertChipText: { fontSize: 9, letterSpacing: 0.5, fontWeight: "700" as const },
  clockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  clockText: { fontSize: 9, letterSpacing: 0.45 },
  topBarRight: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  terminalScroll: { flex: 1 },
  terminalContent: { paddingHorizontal: DesignTokens.spacing.md, paddingTop: 10, paddingBottom: 120 },
});
