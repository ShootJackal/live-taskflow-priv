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
      { backgroundColor: colors.bg },
      withTopInset && { paddingTop: insets.top },
      withBottomInset && { paddingBottom: insets.bottom },
    ],
    [colors.bg, insets.top, insets.bottom, withTopInset, withBottomInset]
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
              shadowColor: isDark ? "#000" : colors.shadow,
            },
          ]
        : null,
    [isWide, maxWidth, isDark, colors]
  );

  if (isWide) {
    return (
      <View style={containerStyle}>
        <View style={bezelStyle}>{children}</View>
      </View>
    );
  }

  return <View style={containerStyle}>{children}</View>;
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  bezel: {
    flex: 1,
    alignSelf: "center",
    width: "100%",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 40,
    elevation: 12,
    overflow: "hidden",
  },
});
