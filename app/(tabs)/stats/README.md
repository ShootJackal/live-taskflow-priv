# Stats tab architecture

## Data flow
- `app/(tabs)/stats/index.tsx` owns query orchestration and section ordering.
- Complex data shaping belongs in `view-models/` pure functions.
- Heavy UI blocks belong in `components/` and receive prepared props.

## Dependencies
- Providers: `CollectionProvider`, `ThemeProvider`.
- Services: stats/profile/leaderboard/task actuals/carryover/admin plan APIs.
- Shared primitives: cards, iconography, haptics.
