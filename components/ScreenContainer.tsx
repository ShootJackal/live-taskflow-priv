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

  const decorativeProps = useMemo(
    () =>
      Platform.OS === "web"
        ? ({ "aria-hidden": true, focusable: false } as any)
        : ({ accessible: false } as any),
    []
  );

  const mainLandmarkProps = useMemo(
    () =>
      Platform.OS === "web"
        ? ({ role: "main", "aria-label": "TaskFlow main content" } as any)
        : {},
    []
  );

  // Level 0 — one soft ambient field, not multiple competing blobs.
  // Dark: a single top-left lavender-indigo radial glow.
  // Light: a very gentle top lavender wash.
  const ambientColor = isDark
    ? "rgba(100,80,200,0.10)"   // soft violet, contained top-left
    : "rgba(110,80,220,0.05)";  // barely-there lavender

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
              borderColor: colors.border,
              backgroundColor: colors.bgSecondary,
              shadowColor: colors.shadow,
            },
          ]
        : null,
    [isWide, maxWidth, colors]
  );

  const ambientLayer = (
    <View
      pointerEvents="none"
      style={[styles.ambientGlow, { backgroundColor: ambientColor }]}
      {...decorativeProps}
    />
  );

  if (isWide) {
    return (
      <View style={containerStyle} {...mainLandmarkProps}>
        {ambientLayer}
        <View style={[styles.stage, { backgroundColor: "transparent" }]}>
          <View style={bezelStyle}>
            <View
              pointerEvents="none"
              style={[
                styles.bezelHighlight,
                { backgroundColor: isDark ? "rgba(140,120,240,0.04)" : "rgba(255,255,255,0.55)" },
              ]}
              {...decorativeProps}
            />
            {children}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={containerStyle} {...mainLandmarkProps}>
      {ambientLayer}
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Single contained ambient glow — top area only, no busy field everywhere
  ambientGlow: {
    position: "absolute",
    top: -200,
    left: -100,
    width: 600,
    height: 600,
    borderRadius: 300,
    opacity: 1,
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
