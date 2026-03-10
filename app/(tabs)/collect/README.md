# Collect tab architecture

## Data flow
- `app/(tabs)/index.tsx` orchestrates state reads/writes via `useCollection` and renders sections.
- Presentational rows/banners are in `components/`.
- Any non-UI derivations should live in `view-models/`.

## Dependencies
- Providers: `CollectionProvider`, `ThemeProvider`, `LocaleProvider`.
- Shared UI: `ScreenContainer`, `SelectPicker`, `ActionButton`, `ReviewSheet`, `RigAssignmentModal`.
- Side effects: assignment/cancel/complete actions from `useCollection`.
