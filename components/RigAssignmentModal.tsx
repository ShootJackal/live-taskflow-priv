/**
 * RigAssignmentModal — SF Start-of-Day rig picker.
 *
 * Shows the full SF rig list with live availability status.
 * Available rigs: tap to assign immediately.
 * In-use rigs: shows who has it + prompts to reach out / request a switch.
 */

import React, { useState, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, AlertCircle, Clock, Radio } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/providers/ThemeProvider";
import { DesignTokens } from "@/constants/colors";
import { useCollection } from "@/providers/CollectionProvider";
import {
  fetchRigStatus,
  requestRigSwitch,
} from "@/services/googleSheets";
import type { RigStatus } from "@/types";

interface Props {
  visible: boolean;
  onClose: () => void;
}

type ModalView = "picker" | "switch_confirm" | "switch_sent";

export default function RigAssignmentModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const { selectedCollectorName, assignRigForDay } = useCollection();
  const queryClient = useQueryClient();

  const [view, setView] = useState<ModalView>("picker");
  const [selectedRigForSwitch, setSelectedRigForSwitch] = useState<RigStatus | null>(null);
  const [assigning, setAssigning] = useState<number | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const rigStatusQuery = useQuery<RigStatus[]>({
    queryKey: ["rigStatus"],
    queryFn: fetchRigStatus,
    enabled: visible,
    staleTime: 10000,
    refetchInterval: visible ? 15000 : false,
    retry: 1,
  });

  const rigs = rigStatusQuery.data ?? [];

  const handleAssign = useCallback(async (rig: RigStatus) => {
    if (rig.status !== "available") {
      setSelectedRigForSwitch(rig);
      setView("switch_confirm");
      return;
    }
    setAssigning(rig.rig);
    setErrorMsg("");
    try {
      await assignRigForDay(rig.rig);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["rigStatus"] });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to assign rig");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setAssigning(null);
    }
  }, [assignRigForDay, queryClient, onClose]);

  const handleRequestSwitch = useCallback(async () => {
    if (!selectedRigForSwitch) return;
    setRequesting(true);
    setErrorMsg("");
    try {
      await requestRigSwitch({
        requestingCollector: selectedCollectorName,
        rig: selectedRigForSwitch.rig,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["rigStatus"] });
      queryClient.invalidateQueries({ queryKey: ["rigSwitchRequests"] });
      setView("switch_sent");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Request failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setRequesting(false);
    }
  }, [selectedRigForSwitch, selectedCollectorName, queryClient]);

  const reset = useCallback(() => {
    setView("picker");
    setSelectedRigForSwitch(null);
    setErrorMsg("");
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={[s.overlay, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
        <View style={[s.sheet, { backgroundColor: colors.bgCard }]}>
          <View style={[s.handle, { backgroundColor: colors.border }]} />

          {/* ── Rig Picker ── */}
          {view === "picker" && (
            <>
              <View style={s.header}>
                <Radio size={18} color={colors.accent} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[s.title, { color: colors.textPrimary }]}>
                    Pick your rig
                  </Text>
                  <Text style={[s.subtitle, { color: colors.textMuted }]}>
                    SF rigs — select the one you are on today
                  </Text>
                </View>
                {rigStatusQuery.isFetching && (
                  <ActivityIndicator size="small" color={colors.accent} />
                )}
              </View>

              {rigStatusQuery.isError && (
                <Text style={[s.errorText, { color: colors.cancel }]}>
                  {String((rigStatusQuery.error as Error)?.message ?? "").includes("Unknown action")
                    ? "Rig system not active yet — redeploy the GAS script to enable this."
                    : "Could not load rig status. Check your connection and try again."}
                </Text>
              )}

              <ScrollView style={s.rigList} showsVerticalScrollIndicator={false}>
                {rigs.map((rig) => {
                  const available = rig.status === "available";
                  const isPending = rig.status === "pending_transfer";
                  const isAssigning = assigning === rig.rig;
                  const statusColor = available
                    ? colors.complete
                    : isPending
                    ? colors.alertYellow ?? colors.statusPending
                    : colors.cancel;
                  const statusLabel = available
                    ? "Available"
                    : isPending
                    ? `Pending — ${rig.assignedTo}`
                    : `In use — ${rig.assignedTo}`;

                  return (
                    <TouchableOpacity
                      key={rig.rig}
                      style={[
                        s.rigRow,
                        {
                          backgroundColor: available ? colors.accentSoft : colors.bgInput,
                          borderColor: available ? colors.accentDim : colors.border,
                        },
                      ]}
                      onPress={() => handleAssign(rig)}
                      activeOpacity={0.75}
                      disabled={isAssigning !== false}
                    >
                      <View style={s.rigLeft}>
                        <View style={[s.rigNumBadge, { backgroundColor: statusColor + "22" }]}>
                          {isAssigning ? (
                            <ActivityIndicator size="small" color={statusColor} />
                          ) : available ? (
                            <CheckCircle size={16} color={statusColor} />
                          ) : isPending ? (
                            <Clock size={16} color={statusColor} />
                          ) : (
                            <AlertCircle size={16} color={statusColor} />
                          )}
                        </View>
                        <View>
                          <Text style={[s.rigNum, { color: colors.textPrimary }]}>
                            Rig {rig.rig}
                          </Text>
                          <Text style={[s.rigStatus, { color: statusColor }]}>
                            {statusLabel}
                          </Text>
                        </View>
                      </View>
                      {!available && (
                        <Text style={[s.switchHint, { color: colors.textMuted }]}>
                          Request switch →
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {!!errorMsg && (
                <Text style={[s.errorText, { color: colors.cancel }]}>{errorMsg}</Text>
              )}

              <TouchableOpacity
                style={[s.skipBtn, { borderColor: colors.border }]}
                onPress={handleClose}
              >
                <Text style={[s.skipText, { color: colors.textMuted }]}>Skip for now</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Switch Confirm ── */}
          {view === "switch_confirm" && selectedRigForSwitch && (
            <>
              <View style={s.header}>
                <AlertCircle size={18} color={colors.cancel} />
                <Text style={[s.title, { color: colors.textPrimary, marginLeft: 10 }]}>
                  Rig {selectedRigForSwitch.rig} is in use
                </Text>
              </View>
              <Text style={[s.body, { color: colors.textSecondary }]}>
                This rig is currently assigned to{" "}
                <Text style={{ fontWeight: "700", color: colors.textPrimary }}>
                  {selectedRigForSwitch.assignedTo}
                </Text>
                .{"\n\n"}
                Please message them directly before requesting a switch. If you
                can&apos;t reach them, contact your QM.
              </Text>
              {!!errorMsg && (
                <Text style={[s.errorText, { color: colors.cancel }]}>{errorMsg}</Text>
              )}
              <View style={s.actionRow}>
                <TouchableOpacity
                  style={[s.cancelBtn, { borderColor: colors.border }]}
                  onPress={reset}
                >
                  <Text style={[s.cancelText, { color: colors.textMuted }]}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.requestBtn, { backgroundColor: colors.accentSoft, borderColor: colors.accentDim }]}
                  onPress={handleRequestSwitch}
                  disabled={requesting}
                >
                  {requesting ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Text style={[s.requestText, { color: colors.accent }]}>
                      Send Switch Request
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── Switch Sent ── */}
          {view === "switch_sent" && selectedRigForSwitch && (
            <>
              <View style={s.header}>
                <CheckCircle size={18} color={colors.complete} />
                <Text style={[s.title, { color: colors.textPrimary, marginLeft: 10 }]}>
                  Request sent
                </Text>
              </View>
              <Text style={[s.body, { color: colors.textSecondary }]}>
                Your switch request for{" "}
                <Text style={{ fontWeight: "700", color: colors.textPrimary }}>
                  Rig {selectedRigForSwitch.rig}
                </Text>{" "}
                has been sent to{" "}
                <Text style={{ fontWeight: "700", color: colors.textPrimary }}>
                  {selectedRigForSwitch.assignedTo}
                </Text>
                .{"\n\n"}
                They will see a notification when they open the app. You&apos;ll
                be notified once they respond.
              </Text>
              <TouchableOpacity
                style={[s.requestBtn, { backgroundColor: colors.accentSoft, borderColor: colors.accentDim }]}
                onPress={handleClose}
              >
                <Text style={[s.requestText, { color: colors.accent }]}>Done</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: DesignTokens.radius.xl,
    borderTopRightRadius: DesignTokens.radius.xl,
    padding: DesignTokens.spacing.lg,
    paddingBottom: 36,
    maxHeight: "80%",
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: "center", marginBottom: DesignTokens.spacing.md,
  },
  header: {
    flexDirection: "row", alignItems: "center",
    marginBottom: DesignTokens.spacing.sm,
  },
  title: { fontSize: 17, fontWeight: "700" as const },
  subtitle: { fontSize: 13, marginTop: 2 },
  rigList: { marginVertical: DesignTokens.spacing.sm },
  rigRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1, borderRadius: DesignTokens.radius.md,
    padding: 14, marginBottom: 8,
  },
  rigLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  rigNumBadge: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  rigNum: { fontSize: 15, fontWeight: "700" as const },
  rigStatus: { fontSize: 12, marginTop: 2 },
  switchHint: { fontSize: 12 },
  errorText: { fontSize: 13, marginVertical: 8, textAlign: "center" },
  skipBtn: {
    borderWidth: 1, borderRadius: DesignTokens.radius.md,
    paddingVertical: 12, alignItems: "center", marginTop: 4,
  },
  skipText: { fontSize: 14 },
  body: { fontSize: 14, lineHeight: 22, marginBottom: DesignTokens.spacing.lg },
  actionRow: { flexDirection: "row", gap: 10 },
  cancelBtn: {
    flex: 1, borderWidth: 1, borderRadius: DesignTokens.radius.md,
    paddingVertical: 13, alignItems: "center",
  },
  cancelText: { fontSize: 14 },
  requestBtn: {
    flex: 2, borderWidth: 1, borderRadius: DesignTokens.radius.md,
    paddingVertical: 13, alignItems: "center",
  },
  requestText: { fontSize: 14, fontWeight: "600" as const },
});
