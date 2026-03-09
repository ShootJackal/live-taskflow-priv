import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Lock } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/providers/ThemeProvider";
import { DesignTokens } from "@/constants/colors";

export function AdminPasswordModal({
  visible,
  onClose,
  onAuthenticate,
}: {
  visible: boolean;
  onClose: () => void;
  onAuthenticate: (password: string) => Promise<boolean>;
}) {
  const { colors } = useTheme();
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!password.trim()) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const success = await onAuthenticate(password.trim());
      if (success) {
        setPassword("");
        onClose();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setErrorMsg("Incorrect password");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Authentication failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }, [password, onAuthenticate, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.overlayDismiss} onPress={() => { setPassword(""); setErrorMsg(""); onClose(); }} accessible={false} />
        <View style={[styles.card, { backgroundColor: colors.bgCard }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
              <Lock size={20} color={colors.accent} />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Admin Access
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Enter admin password to continue
            </Text>
          </View>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.bgInput,
                borderColor: errorMsg ? colors.cancel : colors.border,
                color: colors.textPrimary,
              },
            ]}
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setErrorMsg("");
            }}
            placeholder="Enter password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            keyboardType="number-pad"
            returnKeyType="done"
            autoFocus
            testID="admin-password-input"
          />
          {!!errorMsg && (
            <Text style={[styles.errorText, { color: colors.cancel }]}>
              {errorMsg}
            </Text>
          )}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.border }]}
              onPress={() => {
                setPassword("");
                setErrorMsg("");
                onClose();
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelText, { color: colors.textMuted }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.accent }]}
              onPress={handleSubmit}
              activeOpacity={0.8}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={[styles.submitText, { color: colors.white }]}>
                  Unlock
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  overlayDismiss: { flex: 1 },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  card: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: DesignTokens.spacing.xxl,
    paddingBottom: 36,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 14,
  },
  header: { alignItems: "center", marginBottom: 20 },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "700" as const, marginBottom: 4 },
  subtitle: { fontSize: 13, textAlign: "center" },
  input: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: "600" as const,
    borderWidth: 1,
    textAlign: "center",
    letterSpacing: 4,
  },
  errorText: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
    fontWeight: "500" as const,
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  cancelText: { fontSize: 14, fontWeight: "500" as const },
  submitBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  submitText: { fontSize: 14, fontWeight: "700" as const },
});
