import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  Cpu,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/providers/ThemeProvider";
import { useCollection } from "@/providers/CollectionProvider";
import { DesignTokens } from "@/constants/colors";
import type { PendingReviewItem } from "@/types";

interface ReviewSheetProps {
  visible: boolean;
  onClose: () => void;
}

export default function ReviewSheet({ visible, onClose }: ReviewSheetProps) {
  const { colors } = useTheme();
  const { pendingReview, approveRedashTask } = useCollection();

  const slideAnim = useRef(new Animated.Value(600)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  // Per-task edited hours; undefined = use Redash hours
  const [editedHours, setEditedHours] = useState<Record<string, string>>({});
  // Per-task loading state
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  // Keys skipped this session
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  // Approve-All loading
  const [approveAllLoading, setApproveAllLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(600);
      overlayAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          speed: 26,
          bounciness: 0,
        }),
        Animated.timing(overlayAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 600,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, overlayAnim]);

  const getHoursForItem = useCallback(
    (item: PendingReviewItem): number => {
      const edited = editedHours[item.taskKey];
      if (edited && edited.trim()) {
        const parsed = parseFloat(edited);
        if (parsed > 0) return parsed;
      }
      return item.redashHours;
    },
    [editedHours]
  );

  const handleApprove = useCallback(
    async (item: PendingReviewItem) => {
      const hours = getHoursForItem(item);
      if (hours <= 0) {
        Alert.alert("Enter hours", "Hours must be greater than 0 to approve.");
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setLoadingKey(item.taskKey);
      try {
        await approveRedashTask(item.taskName, hours, item.rig);
      } catch (e) {
        Alert.alert(
          "Approval failed",
          e instanceof Error ? e.message : "Unknown error"
        );
      } finally {
        setLoadingKey(null);
      }
    },
    [approveRedashTask, getHoursForItem]
  );

  const handleSkip = useCallback((item: PendingReviewItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSkipped((prev) => new Set([...prev, item.taskKey]));
  }, []);

  const visibleItems = pendingReview.filter((i) => !skipped.has(i.taskKey));

  const handleApproveAll = useCallback(async () => {
    if (visibleItems.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setApproveAllLoading(true);
    try {
      for (const item of visibleItems) {
        const hours = getHoursForItem(item);
        if (hours > 0) {
          await approveRedashTask(item.taskName, hours, item.rig);
        }
      }
      onClose();
    } catch (e) {
      Alert.alert(
        "Approve All failed",
        e instanceof Error ? e.message : "Unknown error"
      );
    } finally {
      setApproveAllLoading(false);
    }
  }, [visibleItems, getHoursForItem, approveRedashTask, onClose]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.overlay}>
        {/* Dim backdrop */}
        <Animated.View
          style={[
            styles.backdrop,
            { opacity: overlayAnim, backgroundColor: colors.overlay },
          ]}
        />
        <TouchableOpacity
          style={styles.backdropTouch}
          onPress={onClose}
          accessible={false}
        />

        {/* Sheet */}
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.bgCard,
              shadowColor: colors.shadow,
              transform: [{ translateY: slideAnim }],
            },
          ]}
          accessible
          accessibilityViewIsModal
        >
          {/* Handle */}
          <View
            style={[styles.handle, { backgroundColor: colors.border }]}
            accessible={false}
          />

          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View>
              <Text
                style={[
                  styles.headerTitle,
                  { color: colors.textPrimary, fontFamily: "Lexend_700Bold" },
                ]}
              >
                Review Today&apos;s Collection
              </Text>
              <Text style={[styles.headerSub, { color: colors.textMuted }]}>
                {visibleItems.length} task
                {visibleItems.length === 1 ? "" : "s"} from Redash
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: colors.bgInput }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <XCircle size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Items */}
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
            {visibleItems.length === 0 ? (
              <View style={styles.emptyState}>
                <CheckCircle size={32} color={colors.complete} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  All tasks reviewed for today
                </Text>
              </View>
            ) : (
              visibleItems.map((item, idx) => {
                const isLoading = loadingKey === item.taskKey;
                const edited = editedHours[item.taskKey] ?? "";
                const isLast = idx === visibleItems.length - 1;

                return (
                  <View
                    key={item.taskKey}
                    style={[
                      styles.item,
                      !isLast && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    {/* Rig chip */}
                    <View style={styles.itemTop}>
                      <View
                        style={[
                          styles.rigChip,
                          { backgroundColor: colors.accentSoft },
                        ]}
                      >
                        <Cpu size={10} color={colors.accent} />
                        <Text
                          style={[styles.rigText, { color: colors.accent }]}
                        >
                          {item.rig}
                        </Text>
                      </View>
                      <Text
                        style={[styles.redashHours, { color: colors.textMuted }]}
                      >
                        Redash: {item.redashHours.toFixed(2)}h
                      </Text>
                    </View>

                    {/* Task name */}
                    <Text
                      style={[styles.taskName, { color: colors.textPrimary }]}
                      numberOfLines={2}
                    >
                      {item.taskName}
                    </Text>

                    {/* Actions row */}
                    <View style={styles.actionsRow}>
                      {/* Hours input */}
                      <TextInput
                        style={[
                          styles.hoursInput,
                          {
                            backgroundColor: colors.bgInput,
                            borderColor: colors.border,
                            color: colors.textPrimary,
                          },
                        ]}
                        value={edited}
                        onChangeText={(v) =>
                          setEditedHours((prev) => ({
                            ...prev,
                            [item.taskKey]: v,
                          }))
                        }
                        placeholder={item.redashHours.toFixed(2)}
                        placeholderTextColor={colors.textMuted}
                        keyboardType="decimal-pad"
                        returnKeyType="done"
                      />

                      {/* Approve */}
                      <TouchableOpacity
                        style={[
                          styles.actionBtn,
                          {
                            backgroundColor: colors.completeBg,
                            opacity: isLoading ? 0.6 : 1,
                          },
                        ]}
                        onPress={() => handleApprove(item)}
                        disabled={isLoading || approveAllLoading}
                        activeOpacity={0.8}
                      >
                        {isLoading ? (
                          <ActivityIndicator
                            size="small"
                            color={colors.complete}
                          />
                        ) : (
                          <>
                            <CheckCircle
                              size={14}
                              color={colors.complete}
                            />
                            <Text
                              style={[
                                styles.actionBtnText,
                                { color: colors.complete },
                              ]}
                            >
                              Approve
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>

                      {/* Skip */}
                      <TouchableOpacity
                        style={[
                          styles.actionBtn,
                          {
                            backgroundColor: colors.bgInput,
                            opacity: isLoading ? 0.4 : 1,
                          },
                        ]}
                        onPress={() => handleSkip(item)}
                        disabled={isLoading || approveAllLoading}
                        activeOpacity={0.8}
                      >
                        <XCircle size={14} color={colors.textMuted} />
                        <Text
                          style={[
                            styles.actionBtnText,
                            { color: colors.textMuted },
                          ]}
                        >
                          Skip
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Approve All */}
          {visibleItems.length > 0 && (
            <View
              style={[
                styles.footer,
                {
                  borderTopColor: colors.border,
                  backgroundColor: colors.bgCard,
                  paddingBottom:
                    Platform.OS === "ios" ? 32 : 20,
                },
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.approveAllBtn,
                  {
                    backgroundColor: colors.accent,
                    opacity: approveAllLoading ? 0.7 : 1,
                  },
                ]}
                onPress={handleApproveAll}
                disabled={approveAllLoading}
                activeOpacity={0.82}
              >
                {approveAllLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <RefreshCw size={15} color="#fff" />
                    <Text style={styles.approveAllText}>
                      Approve All with Redash Hours
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: "82%",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 14,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: DesignTokens.fontSize.headline,
    fontWeight: "700" as const,
  },
  headerSub: {
    fontSize: DesignTokens.fontSize.caption1,
    marginTop: 3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: DesignTokens.fontSize.subhead,
    textAlign: "center",
  },
  item: {
    paddingVertical: 14,
    gap: 8,
  },
  itemTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rigChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: DesignTokens.radius.pill,
  },
  rigText: {
    fontSize: DesignTokens.fontSize.caption2,
    fontWeight: "600" as const,
    letterSpacing: 0.3,
  },
  redashHours: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "500" as const,
  },
  taskName: {
    fontSize: DesignTokens.fontSize.footnote,
    fontWeight: "600" as const,
    lineHeight: 20,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  hoursInput: {
    width: 80,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: DesignTokens.fontSize.footnote,
    textAlign: "center",
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    height: 38,
    borderRadius: DesignTokens.radius.sm,
  },
  actionBtnText: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "600" as const,
  },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  approveAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: DesignTokens.radius.md,
    paddingVertical: 15,
  },
  approveAllText: {
    color: "#fff",
    fontSize: DesignTokens.fontSize.subhead,
    fontWeight: "600" as const,
  },
});
