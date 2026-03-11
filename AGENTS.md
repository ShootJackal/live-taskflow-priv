# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

TaskFlow is a React Native/Expo (SDK 54) mobile task management app that also runs on the web. It communicates with a Google Sheets backend via Google Apps Script. See `README.md` for full details.

### Running the app

- **Web dev server:** `npm run start-web`
- **Lint:** `npm run lint` (runs `expo lint` / ESLint)
- **Type check:** `npx tsc --noEmit` (2 pre-existing TS errors in `app/(tabs)/tools/index.tsx` — these are in the existing codebase)

### Non-obvious caveats

- The default `package.json` scripts use Expo CLI directly (`npm run start`, `npm run start-web`).
- The app supports split Google Apps Script endpoints via `EXPO_PUBLIC_GAS_CORE_URL` and `EXPO_PUBLIC_GAS_ANALYTICS_URL` (preferred), with `EXPO_PUBLIC_GOOGLE_SCRIPT_URL` as a legacy fallback. Without any valid script URL, the app loads and renders UI but shows placeholder/mock data.
- `npm install` is the default dependency install command.
- No Docker, no database, no CI/CD, no setup scripts, no pre-commit hooks in this repo.
- The web export/build can be tested with `npx expo export --platform web`.
