import React from "react";
import { View, Text } from "react-native";
import { Target } from "lucide-react-native";
import type { AdminStartPlanData } from "@/types";
import type { ThemeColors } from "@/constants/colors";

export function AdminStartPlanSection({
  isAdmin,
  adminStartPlan,
  colors,
  cardShadow,
  styles,
}: {
  isAdmin: boolean;
  adminStartPlan?: AdminStartPlanData;
  colors: ThemeColors;
  cardShadow: { shadowColor?: string; shadowOffset?: any; shadowOpacity?: number; shadowRadius?: number; elevation?: number };
  styles: any;
}) {
  if (!isAdmin || !adminStartPlan) return null;

  return (
    <View style={[styles.startPlanCard, { backgroundColor: colors.bgCard, ...cardShadow }]}> 
      <View style={styles.startPlanHeader}>
        <Target size={12} color={colors.alertYellow} />
        <Text style={[styles.startPlanTitle, { color: colors.alertYellow }]}>START OF DAY PLAN ({adminStartPlan.yesterday})</Text>
      </View>
      {(["SF", "MX"] as const).map((region) => (
        <View key={`plan_${region}`} style={styles.startPlanRegion}>
          <Text style={[styles.startPlanRegionLabel, { color: region === "SF" ? colors.sfBlue : colors.mxOrange }]}>{region} TEAM</Text>
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
  );
}
