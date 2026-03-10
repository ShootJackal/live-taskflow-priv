import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Radio } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { respondRigSwitch } from "@/services/googleSheets";
import type { ThemeColors } from "@/constants/colors";
import type { RigSwitchRequest } from "@/types";

export function RigSwitchBanner({ request, colors }: { request: RigSwitchRequest; colors: ThemeColors }) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = React.useState<"APPROVE" | "DENY" | null>(null);

  const respond = React.useCallback(async (action: "APPROVE" | "DENY") => {
    setLoading(action);
    try {
      await respondRigSwitch({ assignmentId: request.assignmentId, action });
      queryClient.invalidateQueries({ queryKey: ["rigSwitchRequests"] });
      queryClient.invalidateQueries({ queryKey: ["rigStatus"] });
    } catch {
      // Non-fatal — banner will persist until next poll if this fails
    } finally {
      setLoading(null);
    }
  }, [request.assignmentId, queryClient]);

  return (
    <View style={[styles.banner, { backgroundColor: colors.alertYellowBg, borderColor: colors.alertYellow + "44" }]}>
      <Radio size={14} color={colors.alertYellow ?? colors.statusPending} />
      <Text style={[styles.text, { color: colors.textPrimary }]}>
        <Text style={{ fontWeight: "700" }}>{request.requestedBy}</Text>
        {" wants to take Rig "}<Text style={{ fontWeight: "700" }}>{request.rig}</Text>
      </Text>
      <View style={styles.btns}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.complete + "22", borderColor: colors.complete + "44" }]}
          onPress={() => respond("APPROVE")}
          disabled={loading !== null}
        >
          {loading === "APPROVE" ? <ActivityIndicator size="small" color={colors.complete} /> : <Text style={{ color: colors.complete, fontSize: 12, fontWeight: "600" }}>Approve</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.cancel + "22", borderColor: colors.cancel + "44" }]}
          onPress={() => respond("DENY")}
          disabled={loading !== null}
        >
          {loading === "DENY" ? <ActivityIndicator size="small" color={colors.cancel} /> : <Text style={{ color: colors.cancel, fontSize: 12, fontWeight: "600" }}>Deny</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap",
    borderWidth: 1, borderRadius: 10, padding: 10,
  },
  text: { flex: 1, fontSize: 13 },
  btns: { flexDirection: "row", gap: 6 },
  btn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
});
