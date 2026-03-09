---
name: openclaw-dashboard
description: Real-time operations dashboard for OpenClaw. Monitors sessions, costs, cron jobs, and gateway health. Use when installing the dashboard, starting the server, adding features, updating backend routes, or changing frontend tabs. Includes language toggle (EN/中文), watchdog 24h uptime bar, and cost analysis.
version: "2.0.0"
metadata:
  {
    "openclaw":
      {
        "emoji": "📊",
        "requires": { "bins": ["node", "openclaw"] },
        "optionalRequires":
          {
            "config": ["gateway.authToken"],
            "env": ["OPENCLAW_AUTH_TOKEN"],
          },
        "optionalEnv":
          [
            "OPENCLAW_HOOK_TOKEN",
            "OPENCLAW_LOAD_KEYS_ENV",
            "OPENCLAW_KEYS_ENV_PATH",
            "OPENCLAW_ENABLE_PROVIDER_AUDIT",
            "OPENCLAW_ENABLE_CONFIG_ENDPOINT",
            "OPENCLAW_ENABLE_SESSION_PATCH",
            "OPENCLAW_ALLOW_ATTACHMENT_FILEPATH_COPY",
            "OPENCLAW_ALLOW_ATTACHMENT_COPY_FROM_TMP",
            "OPENCLAW_ALLOW_ATTACHMENT_COPY_FROM_WORKSPACE",
            "OPENCLAW_ALLOW_ATTACHMENT_COPY_FROM_OPENCLAW_HOME",
            "OPENCLAW_ENABLE_SYSTEMCTL_RESTART",
            "OPENCLAW_ENABLE_MUTATING_OPS",
            "NOTION_API_KEY",
            "OPENAI_ADMIN_KEY",
            "ANTHROPIC_ADMIN_KEY",
          ],
      },
  }
---

# OpenClaw Dashboard Skill

## 🛠️ Installation

### 1. Ask OpenClaw (Recommended)
Tell OpenClaw: *"Install the openclaw-dashboard skill."* The agent will handle the installation and configuration automatically.

### 2. Manual Installation (CLI)
```bash
clawhub install openclaw-dashboard
```

## Mission

Keep this repository public-safe and easy to run. Prioritize:
1. Secret sanitization
2. Minimal setup steps
3. Stable API/UI behavior

## Architecture (v2.0)

The dashboard uses a **modular backend + tab-based frontend** architecture.

**Backend entry point:** `backend/server.js`  
**Business logic:** `backend/providers/` — one file per data domain  
**Frontend:** `frontend/tabs/` + `frontend/shared/` — one JS file per tab  
**Runtime data:** stored in `~/.openclaw/dashboard/` (outside skill dir, not Git-tracked)

### Provider map
| Provider | Routes | Responsibility |
|---|---|---|
| `sessions.js` | `/ops/sessions`, `/api/sessions` | Session stats + model |
| `ledger.js` | `/ops/ledger/*`, `/api/cost/*` | SQLite token/cost data |
| `cron.js` | `/ops/cron`, `/ops/cron-costs`, `/cron/today` | Cron jobs + run history + cost breakdown |
| `watchdog.js` | `/ops/watchdog` | Watchdog state + timeline |
| `spark.js` | `/ops/dgx-status`, `/api/spark/*` | DGX Spark inference node |
| `system.js` | `/ops/system` | Host metrics (CPU/RAM/disk) |
| `ground-truth.js` | `/api/ground-truth/*`, `/ops/models` | Model registry + colors |
| `tasks.js` | `/tasks`, `/tasks/:id` | Task CRUD + notes |
| `config.js` | `/ops/config`, `/files`, `/skills` | Config viewer + file editor |
| `ops-legacy.js` | `/ops/*` (remaining) | Audit, channels, model switch, restart |

### Frontend tab map
| Tab | File | Key functions |
|---|---|---|
| Overview | `tabs/overview.js` | `loadSessions()`, `loadTasks()` |
| Cost | `tabs/cost.js` | `loadOpsChannels()`, `loadOpsAlltime()` |
| Cron | `tabs/cron.js` | `loadCronEnhanced()`, `loadCronCosts()`, `loadCronRuns()` |
| Health | `tabs/health.js` | `renderAgentMonitor()`, `loadSystemInfo()`, `renderWatchdogStatus()` |
| Config | `tabs/config.js` | `loadConfig()`, `loadSkills()`, `loadFileList()` |
| Shared | `shared/api.js` | Auth, `apiFetch()`, watchdog renderers, toast, markdown |
| Shared | `shared/ui-utils.js` | `timeSince()`, task state |
| Shared | `shared/boot.js` | Init, week nav, chart renderers, confirm dialog |

## Apply when

Use this skill for:
- Dashboard feature requests (sessions, cost, cron, watchdog, operations)
- Backend route additions/fixes in `backend/providers/`
- Frontend behavior updates in `frontend/tabs/` or `frontend/shared/`
- README, setup, and environment simplification
- Public release checks for accidental sensitive data

## Key rules for agents editing this codebase

1. **No duplicate function definitions** across `api.js` and `ui-utils.js`. Shared utilities belong in `api.js` (loaded first). `ui-utils.js` only holds `timeSince()` and task state.
2. **Cross-tab function calls are implicit** — JS shares the same `window` scope. Keep shared helpers in `shared/` files.
3. **Runtime data goes to `~/.openclaw/dashboard/`**, not skill root. Path is set in `backend/lib/config.js` via `OPENCLAW_DASHBOARD_TASKS` env or default.
4. **`/ops/models` returns `{ registry: {...object...}, colors, displayNames, models }`** — `registry` must be an object keyed by alias, not an array.
5. **`/ops/cron-costs` returns `{ summary, jobs, dailyTrend, review, rows }`** — all five keys required for Cron tab to render correctly.
6. **`hideStale` query param** on `/ops/sessions` filters sessions with no activity for 7+ days.

## Public-safety guardrails

- Never hardcode tokens, API keys, cookies, or host-specific secrets.
- Never commit machine-specific absolute paths.
- Prefer `process.env.*` and safe defaults based on `HOME`.
- Keep examples as placeholders (`your_token_here`, `/path/to/...`).
- If uncertain, redact first and ask the user before exposing details.
- Keep sensitive behaviors opt-in (do not silently load local secret files).

## Runtime access declaration

The bundled server can access local OpenClaw files for dashboard views:
- Sessions, cron runs, watchdog state under `~/.openclaw/...`
- Local workspace files under `OPENCLAW_WORKSPACE`
- Task data in `~/.openclaw/dashboard/tasks.json`
- Task attachments in `~/.openclaw/dashboard/attachments/`

High-sensitivity features are disabled by default and require explicit env flags:
- `OPENCLAW_LOAD_KEYS_ENV=1` to load `keys.env`
- `OPENCLAW_ENABLE_PROVIDER_AUDIT=1` to call OpenAI/Anthropic org APIs
- `OPENCLAW_ENABLE_CONFIG_ENDPOINT=1` to expose `/ops/config`
- `OPENCLAW_ALLOW_ATTACHMENT_FILEPATH_COPY=1` for absolute-path attachment copy
- `OPENCLAW_ENABLE_MUTATING_OPS=1` to enable model-switch, backup, update ops

Network security:
- CORS restricted to loopback by default.
- Auth via HttpOnly cookie (`ds`) or `Authorization: Bearer` header.
- Set `DASHBOARD_CORS_ORIGINS` (comma-separated) for external origins.

## Default implementation workflow

1. Identify which provider or tab file owns the feature.
2. Implement the smallest change that preserves behavior.
3. Check: does any other tab/shared file also define the same function? If yes, deduplicate.
4. Run a sensitive-string scan before finalizing.
5. Ensure docs match the actual runtime defaults.

## Sensitive-data checks

Before final response, scan for:
- `token=`, `OPENCLAW_AUTH_TOKEN`, `OPENCLAW_HOOK_TOKEN`
- `API_KEY`, `SECRET`, `PASSWORD`, `COOKIE`
- absolute paths like `/Users/`, `C:\\`, machine names, personal emails

If found: replace with env-based values or placeholders, and mention what was sanitized.

## Files to touch most often

- `backend/providers/*.js` — server behavior and API routes
- `frontend/tabs/*.js` — tab-specific UI logic
- `frontend/shared/api.js` — auth, fetch, shared renderers
- `backend/lib/config.js` — path and env configuration
- `README.md` — quick start and operator docs
- `env.example` — public-safe environment template
