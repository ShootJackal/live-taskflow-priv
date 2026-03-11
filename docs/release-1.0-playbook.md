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

1. **Confirm Vercel env values exist** for Production environment (`GAS_SCRIPT_URL` and any `EXPO_PUBLIC_*` values used).
2. **Confirm URL shape**: each GAS URL ends with `/exec` and opens without redirect loops.
3. **Smoke-test API routes** (see Health Checks section below).
4. **Validate admin unlock** in Tools tab using `EXPO_PUBLIC_ADMIN_PASSWORD`.
5. **Deploy production build** and re-run all health checks on the production domain.

---

## 2) Endpoint health checks

Use your deployed base URL in examples below:

```bash
export APP_BASE_URL="https://<your-prod-domain>"
```

### A. `/api/gas` proxy health

**Basic action check** (read path through Vercel proxy):

```bash
curl -sS "$APP_BASE_URL/api/gas?action=getCollectors" | jq
```

Pass criteria:
- HTTP 200
- JSON response body
- No `"success": false` proxy/config error

**Negative check** (method restrictions):

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

Run for each configured endpoint (`GAS_SCRIPT_URL`, `EXPO_PUBLIC_GAS_CORE_URL`, `EXPO_PUBLIC_GAS_ANALYTICS_URL`, or fallback URL):

```bash
curl -sS "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?action=refreshCache&scope=light"
```

Pass criteria:
- Endpoint responds within 25s
- No HTML error page, no 5xx
- JSON/body indicates script execution path is healthy

---

## 3) Manual UX checks (all tabs + admin features)

> Test on production web and one mobile device (Expo Go/PWA) before go-live.

### Live tab

- Tab loads without crash and shows live feed area.
- Unread/live indicator updates when a new alert is posted.
- Pull-to-refresh updates data without duplicate rows.

### Collect tab

- Collector selection works.
- Task search and task selection work.
- Submit flow completes and success state appears.
- Rig switch banner/request flow displays and responds correctly (approve/deny paths where applicable).

### Stats tab

- Leaderboard and collector stats load.
- Time-range toggles/filters update visible values.
- Empty-state handling is readable if no data exists.

### Tools tab

- Theme and language selectors apply immediately.
- External quick links open expected destination.
- Cache clear and app reload controls work as documented.
- Sheet viewer navigation opens selected sheet page.

### Admin features (Tools)

- Admin password modal appears from collector picker (`Admin` option).
- Correct password unlocks admin mode and badge appears.
- Admin overview cards populate.
- Admin tool actions render and complete without runtime errors.
- Admin logout removes elevated mode immediately.

---

## 4) Cache clear / refresh runbook

### When to run

- After Apps Script schema/logic changes.
- After stale data reports from multiple users.
- Immediately after launch if dashboards mismatch sheet state.

### Procedure

1. In **Tools** tab, run **Clear Cache**.
2. Trigger manual data refresh:
   - Web: hard refresh browser tab.
   - Mobile: pull-to-refresh on Live/Collect/Stats tabs.
3. Call warm endpoint:
   ```bash
   curl -sS "$APP_BASE_URL/api/warm" | jq
   ```
4. Validate with proxy read call:
   ```bash
   curl -sS "$APP_BASE_URL/api/gas?action=getAppCache" | jq
   ```
5. Re-check one critical collector workflow (Collect submit + Stats visibility).

Escalate if stale/incorrect values persist after 2 refresh cycles.

---

## 5) Go / No-Go criteria

Release is **GO** only if all criteria below pass:

### Critical flow pass list (must be 100%)

1. App loads and renders all four tabs.
2. Collector can submit a task from Collect tab.
3. Live tab receives or displays latest alerts feed.
4. Stats tab reflects recently submitted data.
5. Tools tab cache clear + reload controls execute.
6. Admin login, admin panel access, and admin logout work.
7. `/api/gas` and `/api/warm` health checks pass.

### Performance targets

- P95 `/api/gas` read calls: **< 2.5s**
- P95 route/tab transition on web: **< 1.5s** perceived completion
- No sustained client freeze/stutter > 3s during tab usage

### Error-rate thresholds

- 5xx rate on `/api/gas`: **< 1%** over a 30-minute smoke window
- JS runtime fatal errors: **0** during launch validation
- Any blocked critical action = automatic **NO-GO**

---

## 6) Rollback procedure

### A. Vercel rollback (frontend/API layer)

1. Open Vercel project → **Deployments**.
2. Identify last known-good production deployment.
3. Click **Promote to Production** (or rollback action).
4. Re-run health checks:
   - `/api/gas?action=getCollectors`
   - `/api/warm`
5. Validate one end-to-end collector submission in UI.

If incident persists, disable new release communications and keep prior deployment active.

### B. Google Apps Script rollback (backend layer)

1. Open Apps Script project → **Deploy** → **Manage deployments**.
2. Select production deployment.
3. Edit deployment and set **Version** to last known-good version.
4. Save deployment update.
5. Run warm ping against active `/exec` URL.
6. Validate critical flows (Collect submit, Live read, Stats read).

If split endpoints are used, rollback **core and analytics versions together** (or follow a pre-approved compatibility matrix).

---

## 7) Post-launch monitoring checklist (Day 0 to Day 7)

Run the following once daily for first 7 days (plus extra checks on Day 0 launch window):

1. **Endpoint uptime**
   - `/api/gas?action=getCollectors` returns 200 + valid JSON
   - `/api/warm` returns 200 and at least one warmed endpoint
2. **Data freshness**
   - Submit one test action (or verify latest real submission) and confirm appears in Live + Stats
3. **Error review**
   - Check Vercel function logs for `/api/gas` and `/api/warm` spikes/timeouts
   - Check client error monitoring (if configured)
4. **Performance review**
   - Inspect median and P95 latency for `/api/gas`
   - Confirm no upward trend day-over-day
5. **Admin capability check**
   - Verify admin unlock still works
   - Verify admin actions still return expected responses
6. **Cache hygiene**
   - If freshness drifts, run cache clear/refresh runbook and log incident
7. **Daily status log**
   - Record GO/at-risk status, incidents, mitigations, and owner

### Escalation triggers during first week

- `/api/gas` 5xx error rate >= 1% for 15+ minutes
- Any critical flow failure reproduced by 2+ users
- Multiple stale-data incidents in the same 24h period

Trigger rollback if escalation cannot be resolved within agreed incident SLA.
