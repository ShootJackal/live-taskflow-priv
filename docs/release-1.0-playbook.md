# TaskFlow Release 1.0 Playbook

## 1) Required environment variables + validation steps

### Required for production launch

| Variable | Required | Scope | Purpose |
|---|---|---|---|
| `EXPO_PUBLIC_ADMIN_PASSWORD` | Yes | Client (Expo public) | Unlocks Tools tab admin panel. |
| `GAS_SCRIPT_URL` | Strongly recommended | Server (Vercel) | Backend URL for `/api/gas` proxy and `/api/warm` cron. Keeps GAS URL out of web bundle. |

### Endpoint variables (at least one valid GAS URL must be configured)

| Variable | Required | Scope | Use case |
|---|---|---|---|
| `EXPO_PUBLIC_GAS_CORE_URL` | Optional | Client | Split deployment: core read/write actions. |
| `EXPO_PUBLIC_GAS_ANALYTICS_URL` | Optional | Client | Split deployment: analytics-heavy actions. |
| `EXPO_PUBLIC_GOOGLE_SCRIPT_URL` | Fallback | Client | Legacy/monolith fallback endpoint. |

> Launch rule: configure either split (`EXPO_PUBLIC_GAS_CORE_URL` + `EXPO_PUBLIC_GAS_ANALYTICS_URL`) or monolith (`GAS_SCRIPT_URL` and/or `EXPO_PUBLIC_GOOGLE_SCRIPT_URL`).

### Validation steps (before go-live)

1. Confirm Vercel env values exist for Production (`GAS_SCRIPT_URL` and any `EXPO_PUBLIC_*` values used).
2. Confirm URL shape: each GAS URL ends with `/exec` and opens without redirect loops.
3. Smoke-test API routes (see Health Checks section below).
4. Validate admin unlock in Tools tab using `EXPO_PUBLIC_ADMIN_PASSWORD`.
5. Deploy production build and re-run all health checks on the production domain.

---

## 2) Endpoint health checks

Use your deployed base URL in examples below:

```bash
export APP_BASE_URL="https://<your-prod-domain>"
```

### A. `/api/gas` proxy health

```bash
curl -sS "$APP_BASE_URL/api/gas?action=getCollectors" | jq
```

Pass criteria:
- HTTP 200
- JSON response body
- No `"success": false` proxy/config error

Negative check:

```bash
curl -i -X POST "$APP_BASE_URL/api/gas"
```

Pass criteria:
- HTTP `405 Method Not Allowed`

### B. `/api/warm` cron endpoint health

```bash
curl -sS "$APP_BASE_URL/api/warm" | jq
```

Pass criteria:
- HTTP 200
- Response has either:
  - `"warmed": true` with at least one successful result, or
  - `"skipped": true` only when intentionally running without configured GAS URLs

### C. Direct GAS endpoint health

```bash
curl -sS "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?action=refreshCache&scope=light"
```

Pass criteria:
- Endpoint responds within 25s
- No HTML error page, no 5xx
- JSON/body indicates script execution path is healthy

---

## 3) Manual UX checks (all tabs + admin features)

Test on production web and one mobile device (Expo Go/PWA) before go-live.

### Live tab
- Tab loads and shows live feed area.
- Unread/live indicator updates when a new alert is posted.
- Pull-to-refresh updates data without duplicate rows.

### Collect tab
- Collector selection works.
- Task search and task selection work.
- Submit flow completes and success state appears.

### Stats tab
- Leaderboard and collector stats load.
- Time-range toggles/filters update visible values.

### Tools tab + admin
- Theme and language selectors apply.
- Cache clear and app reload controls work.
- Admin unlock works and admin actions execute without runtime errors.

---

## 4) Cache clear / refresh runbook

When to run:
- After Apps Script schema/logic changes.
- After stale data reports from multiple users.
- Immediately after launch if dashboards mismatch sheet state.

Procedure:

1. In Tools tab, run Clear Cache.
2. Trigger manual data refresh (web hard refresh + mobile pull-to-refresh).
3. Call warm endpoint:

```bash
curl -sS "$APP_BASE_URL/api/warm" | jq
```

4. Validate with proxy read call:

```bash
curl -sS "$APP_BASE_URL/api/gas?action=getAppCache" | jq
```

5. Re-check one critical collector workflow (Collect submit + Stats visibility).

---

## 5) Go / No-Go criteria

Release is GO only if all criteria below pass:

1. App loads and renders all four tabs.
2. Collector can submit a task from Collect tab.
3. Live tab receives/displays latest alerts feed.
4. Stats tab reflects recently submitted data.
5. Tools tab cache clear + reload controls execute.
6. Admin login/panel/logout work.
7. `/api/gas` and `/api/warm` health checks pass.

Performance targets:
- P95 `/api/gas` read calls: < 2.5s
- P95 route/tab transition on web: < 1.5s perceived completion

Error thresholds:
- 5xx rate on `/api/gas`: < 1% over a 30-minute smoke window
- JS runtime fatal errors: 0 during launch validation

---

## 6) Rollback procedure

### A. Vercel rollback (frontend/API layer)

1. Open Vercel project Deployments.
2. Identify last known-good production deployment.
3. Promote to Production.
4. Re-run `/api/gas` and `/api/warm` health checks.
5. Validate one end-to-end collector submission in UI.

### B. Google Apps Script rollback (backend layer)

1. Open Apps Script project -> Deploy -> Manage deployments.
2. Select production deployment.
3. Set Version to last known-good.
4. Save deployment update.
5. Run warm ping against active `/exec` URL.
6. Validate Collect submit + Live read + Stats read.
