import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleProp, StyleSheet, TextStyle, View } from "react-native";

interface MarqueeTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  speedMs?: number;
  pauseMs?: number;
  numberOfLines?: number;
}

export default React.memo(function MarqueeText({
  text,
  style,
  speedMs = 4800,
  pauseMs = 1000,
  numberOfLines = 1,
}: MarqueeTextProps) {
  const [containerW, setContainerW] = useState(0);
  const [textW, setTextW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  const shouldScroll = useMemo(() => containerW > 0 && textW > containerW + 14, [containerW, textW]);
  const distance = Math.max(textW - containerW + 18, 0);

  useEffect(() => {
    if (!shouldScroll || distance <= 0) {
      x.setValue(0);
      if (loopRef.current) {
        loopRef.current.stop();
        loopRef.current = null;
      }
      return;
    }

    x.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(pauseMs),
        Animated.timing(x, {
          toValue: -distance,
          duration: speedMs,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.delay(350),
        Animated.timing(x, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loopRef.current = loop;
    loop.start();

    return () => {
      if (loopRef.current) {
        loopRef.current.stop();
        loopRef.current = null;
      }
    };
  }, [distance, pauseMs, shouldScroll, speedMs, x]);

  return (
    <View style={styles.wrap} onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}>
      <Animated.Text
        numberOfLines={numberOfLines}
        style={[style, { transform: [{ translateX: x }] }]}
        onLayout={(e) => setTextW(e.nativeEvent.layout.width)}
      >
        {text}
      </Animated.Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    flex: 1,
  },
});
