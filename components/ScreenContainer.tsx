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
        top: "rgba(124,94,255,0.26)",
        mid: "rgba(80,198,163,0.16)",
        left: "rgba(95,124,255,0.16)",
        right: "rgba(244,144,206,0.13)",
        bottom: "rgba(35,58,132,0.20)",
        veil: "rgba(255,255,255,0.035)",
      };
    }
    return {
      top: "rgba(126,86,255,0.20)",
      mid: "rgba(96,180,240,0.12)",
      left: "rgba(112,152,255,0.10)",
      right: "rgba(236,126,190,0.11)",
      bottom: "rgba(119,168,255,0.10)",
      veil: "rgba(255,255,255,0.34)",
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
              backgroundColor: colors.bg,
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
            styles.topAura,
            { backgroundColor: auraTones.top },
          ]}
          {...decorativeProps}
        />
        <View
          pointerEvents="none"
          style={[
            styles.midAura,
            { backgroundColor: auraTones.mid },
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
        <View
          pointerEvents="none"
          style={[
            styles.topVeil,
            { backgroundColor: auraTones.veil, top: insets.top ? insets.top - 10 : 0 },
          ]}
          {...decorativeProps}
        />
        <View style={[styles.stage, { backgroundColor: colors.bgSecondary }]}>
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
          styles.topAura,
          { backgroundColor: auraTones.top },
        ]}
        {...decorativeProps}
      />
      <View
        pointerEvents="none"
        style={[
          styles.midAura,
          { backgroundColor: auraTones.mid },
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
      <View
        pointerEvents="none"
        style={[
          styles.topVeil,
          { backgroundColor: auraTones.veil, top: insets.top ? insets.top - 10 : 0 },
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
  topAura: {
    position: "absolute",
    top: -140,
    left: -20,
    right: -20,
    height: 330,
    borderBottomLeftRadius: 180,
    borderBottomRightRadius: 180,
    opacity: 0.95,
  },
  midAura: {
    position: "absolute",
    top: 150,
    left: 10,
    right: 10,
    height: 360,
    borderRadius: 220,
    opacity: 0.72,
  },
  gradientBlobLeft: {
    position: "absolute",
    top: 96,
    left: -110,
    width: 250,
    height: 250,
    borderRadius: 140,
    opacity: 0.6,
  },
  gradientBlobRight: {
    position: "absolute",
    top: 190,
    right: -126,
    width: 280,
    height: 280,
    borderRadius: 150,
    opacity: 0.58,
  },
  bottomAura: {
    position: "absolute",
    left: -40,
    right: -40,
    bottom: -180,
    height: 340,
    borderTopLeftRadius: 200,
    borderTopRightRadius: 200,
    opacity: 0.65,
  },
  topVeil: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 120,
    opacity: 0.9,
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
