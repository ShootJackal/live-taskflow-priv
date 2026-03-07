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
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 60,
      bounciness: 2,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 60,
      bounciness: 2,
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
        {
          transform: [{ scale: scaleAnim }],
          opacity: disabled ? 0.42 : 1,
        },
      ]}
    >
      <TouchableOpacity
        style={[styles.button, { backgroundColor: bgColor }]}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={0.82}
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || loading }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={color} />
        ) : (
          <View style={styles.content}>
            {icon}
            <Text style={[styles.text, { color }]}>{title}</Text>
          </View>
        )}
      </TouchableOpacity>
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
  button: {
    borderRadius: DesignTokens.radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  text: {
    fontSize: DesignTokens.fontSize.subhead,
    fontWeight: "600" as const,
    letterSpacing: 0.2,
  },
});
