# Dependency policy (1.0 branch)

## Import inventory (app runtime source)

Scanned runtime source directories: `app/`, `components/`, `providers/`, `services/`, `hooks/`, `utils/`, and `constants/`.

Direct runtime imports found in app source map to these packages:

- `@expo-google-fonts/lexend`
- `@nkzw/create-context-hook`
- `@react-native-async-storage/async-storage`
- `@tanstack/react-query`
- `expo-haptics`
- `expo-image`
- `expo-router`
- `expo-splash-screen`
- `expo-status-bar`
- `lucide-react-native`
- `react`
- `react-native`
- `react-native-gesture-handler`
- `react-native-safe-area-context`

## Required at runtime

These packages are required for the shipped app at runtime (including direct imports and framework/runtime peers):

- `@expo-google-fonts/lexend` (direct import)
- `@nkzw/create-context-hook` (direct import)
- `@react-native-async-storage/async-storage` (direct import)
- `@tanstack/react-query` (direct import)
- `expo` (Expo runtime)
- `expo-font` (required by `@expo-google-fonts/lexend` integration)
- `expo-haptics` (direct import)
- `expo-image` (direct import)
- `expo-router` (direct import)
- `expo-splash-screen` (direct import)
- `expo-status-bar` (direct import)
- `lucide-react-native` (direct import)
- `react` (direct import)
- `react-dom` (web runtime)
- `react-native` (direct import)
- `react-native-gesture-handler` (direct import)
- `react-native-safe-area-context` (direct import)
- `react-native-screens` (Expo Router / React Navigation runtime peer)
- `react-native-svg` (runtime peer for `lucide-react-native`)
- `react-native-web` (web runtime)
- `react-native-worklets` (runtime peer used by Expo SDK 54 stack)

## Dev-only packages

- `@babel/core`
- `@expo/ngrok`
- `@types/react`
- `@vercel/node`
- `eslint`
- `eslint-config-expo`
- `typescript`

## Version freeze policy for `1.0`

- All dependency versions in `package.json` must be pinned to exact versions (no `^` or `~`).
- Dependency upgrades are **not** allowed in ad-hoc changes.
- Upgrades must be submitted in a dedicated, changelogged PR that includes:
  - upgraded package list and old/new versions,
  - reason/risk summary,
  - lint/typecheck results,
  - any required follow-up migration notes.
