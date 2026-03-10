import React from "react";
import { View, Text } from "react-native";
import { Target } from "lucide-react-native";
import type { ThemeColors } from "@/constants/colors";

export function RecommendationsSection({
  recommendedTasks,
  colors,
  cardShadow,
  styles,
}: {
  recommendedTasks: any[];
  colors: ThemeColors;
  cardShadow: { shadowColor?: string; shadowOffset?: any; shadowOpacity?: number; shadowRadius?: number; elevation?: number };
  styles: any;
}) {
  if (!recommendedTasks.length) return null;

  return (
    <View style={[styles.recommendCard, { backgroundColor: colors.bgCard, ...cardShadow }]}> 
      <View style={styles.recommendHeader}>
        <Target size={12} color={colors.mxOrange} />
        <Text style={[styles.recommendTitle, { color: colors.mxOrange }]}>Recommended Tasks</Text>
      </View>
      {recommendedTasks.map((task, idx) => {
        const pctVal = Math.round((task.pct ?? 0) * 100);
        const labelColor = task.isActive
          ? colors.complete
          : task.isMine
          ? colors.accent
          : task.isRecollect
          ? colors.recollectRed
          : colors.mxOrange;
        const tag = task.isActive ? "▶ Active" : task.isMine ? "↩ Continue" : task.isRecollect ? "↺ Recollect" : null;
        return (
          <View key={`rec_${idx}`} style={[styles.recommendRow, { borderBottomColor: colors.border }, idx === recommendedTasks.length - 1 && styles.recommendLast]}>
            <View style={styles.recommendRowLeft}>
              {tag && <Text style={[styles.recommendTag, { color: labelColor, borderColor: labelColor + "40" }]}>{tag}</Text>}
              <Text style={[styles.recommendName, { color: colors.textPrimary }]} numberOfLines={1}>{task.taskName}</Text>
              <Text style={[styles.recommendSub, { color: colors.textMuted }]}>{pctVal}% collected · {Number(task.remainingHours).toFixed(1)}h left</Text>
            </View>
            <Text style={[styles.recommendMeta, { color: colors.statusPending }]}>{Number(task.remainingHours).toFixed(1)}h</Text>
          </View>
        );
      })}
    </View>
  );
}
