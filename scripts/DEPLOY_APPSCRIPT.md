# TaskFlow Apps Script – Deploy & API Reference

For split endpoint deployment (Core + Analytics), use `scripts/DEPLOY_SPLIT_APPSCRIPTS.md`.

## Full redeploy (replace existing script)

1. Open your **Google Sheet** (the one connected to TaskFlow).
2. **Extensions → Apps Script** (opens the script editor).
3. In the editor, **select all** (Cmd+A / Ctrl+A) and **delete**.
4. Build the generated Apps Script outputs: `node scripts/build-gas.js`.
5. Open **`scripts/dist/appscript-core.gs`** in this repo, select all, copy.
6. Paste into the Apps Script editor and **Save** (Ctrl+S / Cmd+S).
7. **Deploy → Manage deployments** → click the **pencil (Edit)** on the existing deployment.
8. Under **Version**, choose **New version** (optional: add description e.g. "v4.3 CA_PLUS live stats").
9. Click **Deploy**. Do **not** change the Web app URL.
10. Copy the **Web app URL** only if you created a new deployment; otherwise the existing URL (in `EXPO_PUBLIC_GOOGLE_SCRIPT_URL`) stays the same.

---

## Read actions (GET)

| Action | Parameter(s) | Returns | Source sheet(s) |
|--------|--------------|--------|------------------|
| `getCollectors` | — | `{ name, rigs, email, weeklyCap, active, hoursUploaded, rating }[]` | Collectors |
| `getTasks` | — | `{ name }[]` | TASK_LIST |
| `getLeaderboard` | `period` (optional: `thisWeek`, `lastWeek`) | `{ rank, collectorName, hoursLogged, tasksCompleted, tasksAssigned, completionRate, region }[]` | Collector Task Assignments Log + CA_PLUS (preferred) / CA_TAGGED (fallback), filtered by week when period set |
| `getCollectorStats` | `collector` | Collector stats + weekly hours, top tasks | Collector Task Assignments Log, CA_PLUS (preferred) / CA_TAGGED (fallback), Collectors |
| `getTodayLog` | `collector` | Today’s assignments + active (with live logged-hour overlay by rig/task) | Collector Task Assignments Log + CA_PLUS (preferred) / CA_TAGGED (fallback) |
| `getRecollections` | — | Task names needing recollection | Task Actuals \| Redashpull (or Collector Actuals \| RedashPull) |
| `getFullLog` | `collector` (optional) | All assignments (optionally filtered, with live overlay for active rows) | Collector Task Assignments Log + CA_PLUS (preferred) / CA_TAGGED (fallback) |
| `getTaskActualsSheet` | — | Task actuals rows (collected/good/remaining hrs, status) + top collector by upload hours | Task Actuals \| Redashpull (or Collector Actuals \| RedashPull) + CA_PLUS (preferred) / CA_TAGGED (fallback) |
| `getAdminDashboardData` | — | Tasks/recollect counts, collector summary, `activeRigsToday` | Task Actuals \| Redashpull (or Collector Actuals \| RedashPull), Collectors, RS_Task_Req, CA_PLUS (preferred) / CA_TAGGED (fallback) |
| `getActiveRigsCount` | — | `{ activeRigsToday: number }` | CA_PLUS (preferred) / CA_TAGGED (fallback), unique rigs with upload date = today |
| `getAppCache` | — | Cached key/value (e.g. leaderboard fallback) | _AppCache |
| `refreshCache` | — | Warms cache; returns `{ leaderboardCount, cached }` | — |

---

## Write action (POST)

**Endpoint:** same Web app URL, method **POST**, body **JSON**.

| Payload | Description |
|--------|-------------|
| `submitAction(body)` | `body`: `{ collector, task, hours, actionType, notes }`. `actionType`: `ASSIGN` \| `COMPLETE` \| `CANCEL` \| `NOTE_ONLY`. Writes to **Collector Task Assignments Log** (append or update row). |

---

## Sheet names (must match exactly)

Tab names in your Google Sheet must match one of these exactly (including spaces and pipe):

- **Collectors**
- **TASK_LIST**
- **CA_PLUS** (preferred) — upload feed with Date / RigID / Task / Hours (extra columns are fine)
- **CA_TAGGED** (fallback)
- **CA_INDEX**
- **Task Actuals \| Redashpull** — or **Collector Actuals \| RedashPull** (script accepts either)
- **Collector Task Assignments Log**
- **RS_Task_Req**
- **_AppCache**

---

## Behavior summary

- **Leaderboard “This Week” / “Last Week”**: Uses **Collector Task Assignments Log** with `AssignedDate` in that Mon–Sun window; no fallback to Collectors hours for weekly.
- **Active rigs (Live tab)**: Unique rigs in **CA_PLUS** (fallback **CA_TAGGED**) with **Date = today** (script timezone).
- **Collector stats**: Assignment counts/status come from **Collector Task Assignments Log**; logged hours are overlaid from **CA_PLUS** (fallback **CA_TAGGED**) by collector/rig.
- **Today/Full assignment log**: Active rows can show live logged/remaining updates from **CA_PLUS** (fallback **CA_TAGGED**) using rig + task matching.
- **Submit (ASSIGN/COMPLETE/CANCEL/NOTE_ONLY)**: Finds matching open assignment by collector + task and updates **Collector Task Assignments Log** (Status, LoggedHrs, RemainingHrs, CompletedDate, Notes) or appends new row for ASSIGN/COMPLETE.
