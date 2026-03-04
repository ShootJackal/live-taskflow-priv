import React, { useRef, useCallback } from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  ActivityIndicator,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/providers/ThemeProvider";
import { DesignTokens } from "@/constants/colors";

interface ActionButtonProps {
  title: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  fullWidth?: boolean;
}

export default React.memo(function ActionButton({
  title,
  icon,
  color,
  bgColor,
  onPress,
  disabled = false,
  loading = false,
  testID,
  fullWidth = false,
}: ActionButtonProps) {
  const { colors, isDark } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  }, [onPress]);

  return (
    <Animated.View
      style={[
        fullWidth ? styles.fullWidth : styles.wrapper,
        { transform: [{ scale: scaleAnim }] },
      ]}
    >
      <View
        style={[
          styles.shell,
          {
            backgroundColor: colors.bg,
            borderColor: isDark ? colors.border : colors.borderLight,
            shadowColor: colors.shadow,
          },
          disabled && styles.disabled,
        ]}
      >
        <TouchableOpacity
          style={[
            styles.button,
            {
              backgroundColor: bgColor,
              borderColor: colors.border,
            },
          ]}
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled || loading}
          activeOpacity={0.92}
          testID={testID}
        >
          <View
            pointerEvents="none"
            style={[
              styles.topSheen,
              { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : colors.cardDepth },
            ]}
          />
          {loading ? (
            <ActivityIndicator size="small" color={color} />
          ) : (
            <View style={styles.content}>
              {icon}
              <Text style={[styles.text, { color }]}>{title}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  fullWidth: {
    width: "100%",
  },
  shell: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    ...DesignTokens.shadow.card,
  },
  button: {
    borderRadius: 9,
    paddingVertical: 13,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    minHeight: 48,
    overflow: "hidden",
  },
  topSheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  text: {
    fontSize: 13,
    fontWeight: "600" as const,
    letterSpacing: 0.3,
  },
  disabled: {
    opacity: 0.5,
  },
});
