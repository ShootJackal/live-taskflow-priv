import { Stack } from "expo-router";
import { useTheme } from "@/providers/ThemeProvider";

export default function ToolsLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="sheet-viewer"
        options={{ title: "Google Sheet" }}
      />
    </Stack>
  );
}
