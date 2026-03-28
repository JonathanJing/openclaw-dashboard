# Dashboard Usage Refactor Plan — 2026-03-27

## Goal

Make frontend data flow simple, auditable, and stable.

Principles:
1. Each UI module has one canonical backend source.
2. Each DOM block has one owner function.
3. Backend provides semantic shapes; frontend only renders.
4. Avoid mixing legacy `/ops/ledger/*`, `/api/ledger/*`, and new `/dashboard/usage/*` contracts.

---

## Step 1 — Overview top-card ownership cleanup

### Objective
Top 6 cards must have explicit owners and clear API sources.

### Target ownership
- `loadOverviewUsageCards()`
  - Today Cost
  - Today Tokens
  - Model Mix
  - Source: `/dashboard/usage/models/today`
- `loadOverviewHealthCards()`
  - Alert Snapshot
  - Watchdog
  - System Sentinel
  - Sources: `/ops/sessions`, `/ops/cron`, `/ops/watchdog`, `/ops/system`
- `loadSessions()`
  - Sessions table only
  - Must not mutate top cards

### Cleanup tasks
- Remove top-card writes from `loadSessions()`
- Remove leftover health/usage overlap from `renderAgentMonitor()` or split into two functions
- Ensure only one function writes each top-card DOM id

---

## Step 2 — Add canonical Cost source breakdown backend

### Objective
Replace legacy `/api/ledger/by-source` with dashboard-friendly semantic route.

### New endpoint
- `GET /dashboard/usage/source/history?days=N`

### Response shape
```json
{
  "ok": true,
  "days": 30,
  "summary": {
    "channel": { "tokens": 0, "costUsd": 0, "calls": 0 },
    "thread":  { "tokens": 0, "costUsd": 0, "calls": 0 },
    "cron":    { "tokens": 0, "costUsd": 0, "calls": 0 },
    "total":   { "tokens": 0, "costUsd": 0, "calls": 0 }
  },
  "daily": [
    {
      "day": "2026-03-27",
      "channel": { "tokens": 0, "costUsd": 0, "calls": 0 },
      "thread":  { "tokens": 0, "costUsd": 0, "calls": 0 },
      "cron":    { "tokens": 0, "costUsd": 0, "calls": 0 },
      "total":   { "tokens": 0, "costUsd": 0, "calls": 0 }
    }
  ]
}
```

### Attribution rules
- `source_kind='cron'` → cron
- `source_kind='interactive'` + thread-like context → thread
- `source_kind='interactive'` otherwise → channel
- defer special handling of `subagent` until explicitly needed

---

## Step 3 — Cost tab simplification

### Objective
Cost tab becomes pure usage page.

### Canonical sources
- Today card: `/dashboard/usage/models/today`
- History charts/tables: `/dashboard/usage/models/history?days=N`
- Source breakdown: `/dashboard/usage/source/history?days=N`

### Cleanup tasks
- Remove any remaining legacy by-source code
- Do not call `/ops/ledger/today` or `/api/ledger/history`

---

## Step 4 — Cron tab simplification

### Objective
Cron tab shows attribution only, not baseline/fixed/variable theory.

### Canonical sources
- `/dashboard/usage/cron/summary?days=N`
- `/dashboard/usage/cron/daily?days=N`
- optional: `/cron/today` for run feed

### Cleanup tasks
- Remove fixed / variable / baseline language and calculations
- Ensure cron cards/tables/charts use only new cron usage contract

---

## Step 5 — Health tab purification

### Objective
Health tab becomes system/alerts/control only.

### Canonical sources
- `/ops/system`
- `/ops/watchdog`
- `/ops/cron`
- `/ops/sessions`
- `/ops/local-api-hub`
- `/ops/dgx-status`

### Cleanup tasks
- No usage cards
- No model mix
- No token/cost charts

---

## Step 6 — Spark tab value model

### Objective
Spark tab should answer:
- what work happened today?
- how many tokens?
- how much GPU busy time / idle time?
- how much cloud cost did Spark save?

### New endpoint
- `GET /dashboard/spark/today`
- optional: `GET /dashboard/spark/gpu-history?hours=24`

### Proposed fields
- totalTasks, completedTasks, failedTasks
- totalTokens
- gpuBusyMinutes, gpuIdleMinutes, gpuUtilizationPct
- estimatedCloudCostUsd, estimatedSavingsUsd
- byTaskType[]
- recent[]

### Important semantic rule
Current Spark tab task summary tokens are not the same as Spark ledger totals.
If using task-summary tokens, label them explicitly.

---

## Step 7 — Final cleanup

### Checklist
- bump asset version
- final residual grep for legacy interfaces
- deprecate `/ops/cron-costs`
- document canonical API mapping
- run browser E2E and console check

---

## Step 8 — Sessions table product-interpretation logic

### Objective
Sessions table should answer product questions, not just dump usage.

### Focus
- clarify what each row represents (channel / cron / special worker)
- keep cost / token / fit logic aligned with actual session semantics
- avoid misleading "0 / $0.00 / 偏低" rows when the row is not a real interactive session
- separate usage reporting from product recommendation / model-fit explanation

### Likely cleanup tasks
- define row categories explicitly
- exclude non-user-facing pseudo-sessions from fit scoring
- reduce or remove misleading recommendations for cron/system rows
- ensure the table’s summary logic is not reused for top overview cards

---

## Current execution order
1. Step 1 — Overview ownership cleanup
2. Step 2 — Add `/dashboard/usage/source/history`
3. Step 3 — Cost tab full hookup
4. Step 4 — Cron tab cleanup
5. Step 5 — Health tab cleanup verification
6. Step 6 — Spark today/value API design + implementation
7. Step 7 — final cleanup + E2E
8. Step 8 — sessions table product-interpretation logic
