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

  const auraTones = useMemo(() => {
    if (isDark) {
      return {
        top: "rgba(126,96,255,0.24)",
        center: "rgba(82,196,170,0.14)",
        left: "rgba(95,124,255,0.14)",
        right: "rgba(244,144,206,0.12)",
        bottom: "rgba(37,58,132,0.16)",
        wash: "rgba(255,255,255,0.02)",
      };
    }
    return {
      top: "rgba(126,86,255,0.18)",
      center: "rgba(96,180,240,0.10)",
      left: "rgba(112,152,255,0.09)",
      right: "rgba(236,126,190,0.10)",
      bottom: "rgba(119,168,255,0.09)",
      wash: "rgba(255,255,255,0.16)",
    };
  }, [isDark]);

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
              backgroundColor: colors.bgSecondary,
              shadowColor: colors.shadow,
            },
          ]
        : null,
    [isWide, maxWidth, isDark, colors]
  );

  if (isWide) {
    return (
      <View style={containerStyle} {...mainLandmarkProps}>
        <View
          pointerEvents="none"
          style={[
            styles.colorWash,
            { backgroundColor: auraTones.wash },
          ]}
          {...decorativeProps}
        />
        <View
          pointerEvents="none"
          style={[
            styles.topAura,
            { backgroundColor: auraTones.top },
          ]}
          {...decorativeProps}
        />
        <View
          pointerEvents="none"
          style={[
            styles.centerAura,
            { backgroundColor: auraTones.center },
          ]}
          {...decorativeProps}
        />
        <View
          pointerEvents="none"
          style={[
            styles.gradientBlobLeft,
            { backgroundColor: auraTones.left },
          ]}
          {...decorativeProps}
        />
        <View
          pointerEvents="none"
          style={[
            styles.gradientBlobRight,
            { backgroundColor: auraTones.right },
          ]}
          {...decorativeProps}
        />
        <View
          pointerEvents="none"
          style={[
            styles.bottomAura,
            { backgroundColor: auraTones.bottom },
          ]}
          {...decorativeProps}
        />
        <View style={[styles.stage, { backgroundColor: "transparent" }]}>
          <View style={bezelStyle}>
            <View
              pointerEvents="none"
              style={[
                styles.bezelHighlight,
                { backgroundColor: isDark ? "rgba(255,255,255,0.03)" : colors.cardDepth },
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
      <View
        pointerEvents="none"
        style={[
          styles.colorWash,
          { backgroundColor: auraTones.wash },
        ]}
        {...decorativeProps}
      />
      <View
        pointerEvents="none"
        style={[
          styles.topAura,
          { backgroundColor: auraTones.top },
        ]}
        {...decorativeProps}
      />
      <View
        pointerEvents="none"
        style={[
          styles.centerAura,
          { backgroundColor: auraTones.center },
        ]}
        {...decorativeProps}
      />
      <View
        pointerEvents="none"
        style={[
          styles.gradientBlobLeft,
          { backgroundColor: auraTones.left },
        ]}
        {...decorativeProps}
      />
      <View
        pointerEvents="none"
        style={[
          styles.gradientBlobRight,
          { backgroundColor: auraTones.right },
        ]}
        {...decorativeProps}
      />
      <View
        pointerEvents="none"
        style={[
          styles.bottomAura,
          { backgroundColor: auraTones.bottom },
        ]}
        {...decorativeProps}
      />
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  colorWash: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.9,
  },
  topAura: {
    position: "absolute",
    top: -260,
    left: -180,
    width: 620,
    height: 620,
    borderRadius: 320,
    opacity: 0.92,
  },
  centerAura: {
    position: "absolute",
    top: 130,
    left: "16%",
    width: 430,
    height: 430,
    borderRadius: 215,
    opacity: 0.62,
  },
  gradientBlobLeft: {
    position: "absolute",
    top: 120,
    left: -130,
    width: 290,
    height: 290,
    borderRadius: 160,
    opacity: 0.58,
  },
  gradientBlobRight: {
    position: "absolute",
    top: 190,
    right: -146,
    width: 310,
    height: 310,
    borderRadius: 170,
    opacity: 0.56,
  },
  bottomAura: {
    position: "absolute",
    bottom: -260,
    right: -170,
    width: 620,
    height: 620,
    borderRadius: 320,
    opacity: 0.64,
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
