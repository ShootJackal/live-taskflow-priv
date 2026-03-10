# Live tab architecture

## Data flow
- `app/(tabs)/live/index.tsx` is the orchestration layer for React Query fetches and section composition.
- Feature presentation should be split into `components/`.
- Derived aggregates/ticker inputs should live in `view-models/`.

## Dependencies
- Providers: `ThemeProvider`, `CollectionProvider`.
- Services: live/leaderboard/recollection queries from `services/googleSheets`.
- Shared shell: `ScreenContainer`.
