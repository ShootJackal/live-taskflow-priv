import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Animated,
  Platform,
} from "react-native";
import { ChevronDown, Check } from "lucide-react-native";
import { useTheme } from "@/providers/ThemeProvider";
import { DesignTokens } from "@/constants/colors";

interface Option {
  value: string;
  label: string;
}

interface SelectPickerProps {
  label: string;
  options: Option[];
  selectedValue: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  testID?: string;
}

export default React.memo(function SelectPicker({
  label,
  options,
  selectedValue,
  onValueChange,
  placeholder = "Select...",
  testID,
}: SelectPickerProps) {
  const { colors, isDark } = useTheme();
  const [visible, setVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const selectedOption = options.find((o) => o.value === selectedValue);

  const open = useCallback(() => {
    setVisible(true);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const close = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => setVisible(false));
  }, [fadeAnim]);

  const handleSelect = useCallback(
    (value: string) => {
      onValueChange(value);
      close();
    },
    [onValueChange, close]
  );

  const renderItem = useCallback(
    ({ item }: { item: Option }) => {
      const isSelected = item.value === selectedValue;
      return (
        <TouchableOpacity
          style={[
            styles.option,
            { backgroundColor: isSelected ? colors.bgElevated : "transparent" },
          ]}
          onPress={() => handleSelect(item.value)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.optionText,
              { color: isSelected ? colors.accent : colors.textPrimary },
              isSelected && styles.optionTextSelected,
            ]}
          >
            {item.label}
          </Text>
          {isSelected && <Check size={18} color={colors.accent} />}
        </TouchableOpacity>
      );
    },
    [selectedValue, handleSelect, colors]
  );

  const keyExtractor = useCallback((item: Option) => item.value, []);

  return (
    <View style={styles.container} testID={testID}>
      {label ? <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text> : null}
      <View
        style={[
          styles.triggerShell,
          {
            backgroundColor: colors.bg,
            borderColor: isDark ? colors.border : colors.borderLight,
            shadowColor: colors.shadow,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.trigger, { backgroundColor: colors.bgInput, borderColor: colors.border }]}
          onPress={open}
          activeOpacity={0.92}
        >
          <View
            pointerEvents="none"
            style={[
              styles.topSheen,
              { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : colors.cardDepth },
            ]}
          />
          <Text
            style={[
              styles.triggerText,
              { color: selectedOption ? colors.textPrimary : colors.textMuted },
            ]}
            numberOfLines={1}
          >
            {selectedOption?.label ?? placeholder}
          </Text>
          <ChevronDown size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={close}
        statusBarTranslucent
      >
        <Animated.View style={[styles.overlay, { opacity: fadeAnim, backgroundColor: colors.overlay }]}>
          <TouchableOpacity
            style={styles.overlayTouch}
            activeOpacity={1}
            onPress={close}
          />
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.bgCard,
                borderColor: colors.border,
                shadowColor: colors.shadow,
                transform: [
                  {
                    translateY: fadeAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [300, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
              {label || "Select Option"}
            </Text>
            <FlatList
              data={options}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              style={styles.list}
              showsVerticalScrollIndicator={false}
            />
          </Animated.View>
        </Animated.View>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: "600" as const,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  triggerShell: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    ...DesignTokens.shadow.card,
  },
  topSheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
  },
  triggerText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500" as const,
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  overlayTouch: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "web" ? 20 : 40,
    maxHeight: "60%",
    borderWidth: 1,
    ...DesignTokens.shadow.elevated,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    marginBottom: 8,
  },
  list: {
    flexGrow: 0,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 2,
  },
  optionText: {
    flex: 1,
    fontSize: 15,
  },
  optionTextSelected: {
    fontWeight: "600" as const,
  },
});
