# TaskFlow BFF Migration Map

This document tracks the migration from direct client→GAS access to the new BFF surface under `/api/taskflow/*`.

## Target architecture

- **Client-facing API:** `/api/taskflow/*` only.
- **Source of truth (phase 1):** Google Apps Script (GAS).
- **External aggregation store:** Upstash Redis (replace with Supabase Postgres + scheduled sync jobs in phase 2 if desired).
- **Write safety:** idempotency keys + append-only event log.

## Endpoint ownership and deprecation plan

| Domain | Current GAS action | New BFF endpoint | Owner now | Owner target | GAS deprecation target |
|---|---|---|---|---|---|
| Leaderboard | `getLeaderboard` | `GET /api/taskflow/leaderboard` | GAS | BFF + external aggregate | 2026-04-30 |
| Collector stats | `getCollectorStats` | `GET /api/taskflow/collector-stats` | GAS | BFF + external aggregate | 2026-05-15 |
| Dashboard | `getAdminDashboardData` | `GET /api/taskflow/dashboard` | GAS | BFF + external aggregate | 2026-05-31 |
| Task actuals | `getTaskActualsSheet` | `GET /api/taskflow/task-actuals` | GAS | BFF + external aggregate | 2026-06-15 |
| Generic reads | many | `GET /api/taskflow/read?action=...` | GAS | BFF proxy | 2026-06-30 |
| Write actions (assign/complete/cancel/admin edit) | `submitAction` + admin actions | `POST /api/taskflow/write` | GAS | BFF write gateway + event sourcing | 2026-07-15 |

## Rollout phases

1. **Phase 1 (now):**
   - Read-heavy endpoints routed through BFF.
   - Upstash-backed cache/materialized read acceleration.
   - Writes still execute in GAS with BFF write endpoint available for controlled rollout.
2. **Phase 2:**
   - Scheduled sync jobs populate external storage from GAS snapshots.
   - Read-heavy endpoints serve primarily from external storage.
3. **Phase 3:**
   - Write path enforces idempotency and event-log-first semantics by default.
   - GAS read calculations retired endpoint-by-endpoint.
4. **Phase 4:**
   - GAS retained as fallback/legacy bridge only, then sunset.

## Operational notes

- Required env vars:
  - `GAS_SCRIPT_URL` (preferred server-side GAS endpoint)
  - `egostorage_KV_REST_API_URL`
  - `egostorage_KV_REST_API_TOKEN`
- Optional read-only token for diagnostics:
  - `egostorage_KV_REST_API_READ_ONLY_TOKEN`
- Event stream key:
  - `taskflow:events:writes`
