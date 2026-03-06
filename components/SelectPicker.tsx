import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
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
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  const selectedOption = options.find((o) => o.value === selectedValue);

  const open = useCallback(() => {
    setVisible(true);
    slideAnim.setValue(280);
    overlayAnim.setValue(0);
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        speed: 28,
        bounciness: 0,
      }),
      Animated.timing(overlayAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [slideAnim, overlayAnim]);

  const close = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 280,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => setVisible(false));
  }, [slideAnim, overlayAnim]);

  const handleSelect = useCallback(
    (value: string) => {
      onValueChange(value);
      close();
    },
    [onValueChange, close]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Option; index: number }) => {
      const isSelected = item.value === selectedValue;
      const isLast = index === options.length - 1;
      return (
        <TouchableOpacity
          style={[
            styles.option,
            { backgroundColor: isSelected ? colors.accentSoft : "transparent" },
            !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
          ]}
          onPress={() => handleSelect(item.value)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          accessibilityState={{ selected: isSelected }}
        >
          <Text
            style={[
              styles.optionText,
              {
                color: isSelected ? colors.accent : colors.textPrimary,
                fontWeight: isSelected ? ("600" as const) : ("400" as const),
              },
            ]}
          >
            {item.label}
          </Text>
          {isSelected && <Check size={18} color={colors.accent} strokeWidth={2.5} />}
        </TouchableOpacity>
      );
    },
    [selectedValue, handleSelect, colors, options.length]
  );

  const keyExtractor = useCallback((item: Option) => item.value, []);

  return (
    <View style={styles.container} testID={testID}>
      {label ? (
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      ) : null}

      <TouchableOpacity
        style={[
          styles.trigger,
          {
            backgroundColor: colors.bgInput,
            borderColor: colors.border,
          },
        ]}
        onPress={open}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={
          label
            ? `${label}. ${selectedOption?.label ?? placeholder}`
            : `Picker. ${selectedOption?.label ?? placeholder}`
        }
        accessibilityHint="Double tap to open options."
        accessibilityState={{ expanded: visible }}
      >
        <Text
          style={[
            styles.triggerText,
            { color: selectedOption ? colors.textPrimary : colors.textMuted },
          ]}
          numberOfLines={1}
        >
          {selectedOption?.label ?? placeholder}
        </Text>
        <ChevronDown size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={close}
        statusBarTranslucent
        presentationStyle="overFullScreen"
      >
        <View style={styles.overlay}>
          <Animated.View
            style={[styles.overlayBg, { opacity: overlayAnim, backgroundColor: colors.overlay }]}
          />
          <Pressable
            style={styles.overlayTouch}
            onPress={close}
            accessible={false}
            {...(Platform.OS === "web" ? ({ "aria-hidden": true, focusable: false } as any) : {})}
          />
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.bgCard,
                shadowColor: colors.shadow,
                transform: [{ translateY: slideAnim }],
              },
            ]}
            accessible
            accessibilityViewIsModal
            accessibilityLabel={label || "Select Option"}
          >
            <View
              style={[styles.sheetHandle, { backgroundColor: colors.border }]}
              accessible={false}
              {...(Platform.OS === "web" ? ({ "aria-hidden": true, focusable: false } as any) : {})}
            />
            {label ? (
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{label}</Text>
            ) : null}
            <FlatList
              data={options}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              style={styles.list}
              showsVerticalScrollIndicator={false}
              bounces={false}
            />
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 2,
  },
  label: {
    fontSize: DesignTokens.fontSize.caption1,
    fontWeight: "600" as const,
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: DesignTokens.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    minHeight: 46,
  },
  triggerText: {
    flex: 1,
    fontSize: DesignTokens.fontSize.subhead,
    fontWeight: "400" as const,
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  overlayBg: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTouch: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "web" ? 24 : 44,
    maxHeight: "62%",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 14,
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
    fontSize: DesignTokens.fontSize.headline,
    fontWeight: "600" as const,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  list: {
    flexGrow: 0,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: DesignTokens.radius.sm,
    marginBottom: 0,
  },
  optionText: {
    flex: 1,
    fontSize: DesignTokens.fontSize.subhead,
  },
});
