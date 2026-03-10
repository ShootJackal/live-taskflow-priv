# Release Smoke Checklist

Run this after deploying candidate changes and before promoting to `release`.

## 0) Pre-flight

- [ ] Use a build with valid `EXPO_PUBLIC_GAS_CORE_URL` / `EXPO_PUBLIC_GAS_ANALYTICS_URL` (or legacy URL) configured.
- [ ] Confirm network connectivity and Apps Script availability.
- [ ] Sign in/select a collector profile used for validation.

## 1) Collect tab (`/(tabs)/index`)

- [ ] Select collector + rig and ensure picker persists.
- [ ] Load tasks and submit one action with notes.
- [ ] Verify Today Log updates with the new action and no duplicate write warning.
- [ ] Confirm daily carryover + pending review areas render without crashing.

## 2) Live tab (`/(tabs)/live`)

- [ ] Open Live feed and verify `getLiveAlerts` data appears (or empty state if none).
- [ ] From admin tools, push a test alert and verify it appears in Live.
- [ ] Clear alerts and verify Live feed updates accordingly.

## 3) Stats tab (`/(tabs)/stats`)

- [ ] Open leaderboard and verify data loads for current period.
- [ ] Switch period (this week/last week) and verify list updates.
- [ ] Open collector stats/profile view and verify values populate.

## 4) Tools tab (`/(tabs)/tools`)

- [ ] Open Admin panel with password.
- [ ] Run one admin assign action and verify success response.
- [ ] Run one admin cancel or edit-hours action and verify success response.
- [ ] Validate rig status/switch requests list can load.

## 5) Final release gate

- [ ] Run `npm run release:gate`.
- [ ] Ensure no new lint errors.
- [ ] Ensure typecheck results are unchanged from known baseline.
- [ ] Ensure smoke tests pass.
