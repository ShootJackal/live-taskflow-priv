# Split Apps Script Deployment (Core + Analytics)

Use two separate Google Apps Script projects:

1. **Core script**: copy from `scripts/appscript-core.gs`
2. **Analytics script**: copy from `scripts/appscript-analytics.gs`

Both scripts point to the same spreadsheet, but each only allows its own action set.

## Core Script

- File: `scripts/appscript-core.gs`
- Handles stable/write-critical actions:
  - `getCollectors`
  - `getTasks`
  - `getTodayLog`
  - `getDailyCarryover`
  - `getFullLog`
  - `getLiveAlerts`
  - submit write actions (`ASSIGN/COMPLETE/CANCEL/NOTE_ONLY`)
  - meta actions: `SET_RIG`, `PUSH_ALERT`, `ADMIN_ASSIGN_TASK`, `ADMIN_CANCEL_TASK`, `ADMIN_EDIT_HOURS`, `GRANT_AWARD`, `CARRYOVER_REPORT`, `CARRYOVER_CANCEL`

## Analytics Script

- File: `scripts/appscript-analytics.gs`
- Handles read-heavy/volatile calculation actions:
  - `getLeaderboard`
  - `getCollectorStats`
  - `getRecollections`
  - `getTaskActualsSheet`
  - `getAdminDashboardData`
  - `getActiveRigsCount`
  - `getCollectorProfile`
  - `getAdminStartPlan`
  - `getAppCache`
  - `refreshCache`
  - `forceServerRepull`
  - meta action: `FORCE_SERVER_REPULL`

## Web App Deploy

Deploy each script as a Web App (`Anyone` access) and set:

- `EXPO_PUBLIC_GAS_CORE_URL=<core /exec URL>`
- `EXPO_PUBLIC_GAS_ANALYTICS_URL=<analytics /exec URL>`

Optional fallback:

- `EXPO_PUBLIC_GOOGLE_SCRIPT_URL=<single /exec URL>`

## Notes

- Keep both scripts on the same sheet file.
- Core owns writes to source tabs.
- Analytics handles volatile derived calculations and cache warming.
