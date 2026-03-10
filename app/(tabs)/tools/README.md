# Tools tab architecture

## Data flow
- `app/(tabs)/tools/index.tsx` coordinates preferences/profile/admin actions.
- Reusable sub-panels and tiles should stay in `components/`.
- Sorting/filtering derivations should go to `view-models/`.

## Dependencies
- Providers: `ThemeProvider`, `LocaleProvider`, `UiPrefsProvider`, `CollectionProvider`.
- Existing shared tools components under `components/tools/`.
- Router and external deep-link integrations.
