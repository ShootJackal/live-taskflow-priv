import React, { useMemo } from "react";
import { View, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/providers/ThemeProvider";
import { DesignTokens } from "@/constants/colors";

interface ScreenContainerProps {
  children: React.ReactNode;
  withTopInset?: boolean;
  withBottomInset?: boolean;
  maxWidth?: number;
}

export default React.memo(function ScreenContainer({
  children,
  withTopInset = true,
  withBottomInset = false,
  maxWidth = DesignTokens.maxContentWidth,
}: ScreenContainerProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = Platform.OS === "web" && windowWidth > maxWidth + 80;

  const containerStyle = useMemo(
    () => [
      styles.root,
      { backgroundColor: isWide ? colors.bgSecondary : colors.bg },
      withTopInset && { paddingTop: insets.top },
      withBottomInset && { paddingBottom: insets.bottom },
    ],
    [colors.bgSecondary, colors.bg, isWide, insets.top, insets.bottom, withTopInset, withBottomInset]
  );

  const bezelStyle = useMemo(
    () =>
      isWide
        ? [
            styles.bezel,
            {
              maxWidth,
              borderColor: isDark ? colors.border : colors.borderLight,
              backgroundColor: colors.bg,
              shadowColor: colors.shadow,
            },
          ]
        : null,
    [isWide, maxWidth, isDark, colors]
  );

  if (isWide) {
    return (
      <View style={containerStyle}>
        <View style={[styles.stage, { backgroundColor: colors.bgSecondary }]}>
          <View style={bezelStyle}>
            <View
              pointerEvents="none"
              style={[
                styles.bezelHighlight,
                { backgroundColor: isDark ? "rgba(255,255,255,0.03)" : colors.cardDepth },
              ]}
            />
            {children}
          </View>
        </View>
      </View>
    );
  }

  return <View style={containerStyle}>{children}</View>;
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  stage: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  bezel: {
    flex: 1,
    alignSelf: "center",
    width: "100%",
    borderWidth: 1,
    borderRadius: DesignTokens.radius.xxl + 8,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 32,
    elevation: 16,
    overflow: "hidden",
  },
  bezelHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    opacity: 0.9,
  },
});
