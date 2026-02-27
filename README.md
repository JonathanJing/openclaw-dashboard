# OpenClaw Dashboard

A single-file operations dashboard for [OpenClaw](https://github.com/openclaw/openclaw) — monitor sessions, costs, cron jobs, and watchdog status from one clean UI.

![Dashboard](https://img.shields.io/badge/OpenClaw-Dashboard-7c5cfc?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

## What's Inside

- **Sessions** — live view of all active agent sessions with model, token usage, cost, and model-fit scoring
- **Cost Analysis** — per-session and per-cron cost breakdown, daily trends, fixed vs. variable cost split
- **Cron Jobs** — all scheduled jobs with last run status, duration, and per-job model selector
- **Watchdog** — gateway health status, failure count, and incident timeline
- **Operations** — backup, update, and system control actions with audit log

## Quick Start

```bash
git clone https://github.com/JonathanJing/openclaw-dashboard.git
cd openclaw-dashboard
cp .env.example .env
# edit .env — set OPENCLAW_AUTH_TOKEN at minimum
node api-server.js
```

Open `http://localhost:18791/` in your browser.

> The dashboard requires a running OpenClaw gateway on the same machine. It reads session logs, cron runs, and watchdog state from `~/.openclaw/`.

## Configuration

All settings via environment variables. Copy `.env.example` to `.env` to get started.

### Core

| Variable | Default | Description |
|---|---|---|
| `OPENCLAW_AUTH_TOKEN` | *(none)* | Auth token for dashboard access. Strongly recommended. |
| `DASHBOARD_HOST` | `127.0.0.1` | Bind address. Keep localhost unless you use a tunnel (e.g. Tailscale). |
| `DASHBOARD_PORT` | `18791` | Port to serve on. |
| `DASHBOARD_CORS_ORIGINS` | *(loopback only)* | Comma-separated allowed origins for CORS. |

### Opt-in Features (disabled by default)

| Variable | What it enables |
|---|---|
| `OPENCLAW_LOAD_KEYS_ENV=1` | Load `~/.openclaw/keys.env` on startup |
| `OPENCLAW_ENABLE_PROVIDER_AUDIT=1` | Fetch usage from OpenAI/Anthropic org APIs |
| `OPENCLAW_ENABLE_CONFIG_ENDPOINT=1` | Expose `/ops/config` endpoint |
| `OPENCLAW_ENABLE_MUTATING_OPS=1` | Enable backup, update, and model-change actions |
| `OPENCLAW_ENABLE_SYSTEMCTL_RESTART=1` | Allow user-scoped systemctl restart |
| `OPENCLAW_ALLOW_ATTACHMENT_FILEPATH_COPY=1` | Enable absolute-path attachment copy |

## Security Notes

- Dashboard binds to `localhost` by default — not exposed to the network
- Auth token is passed via HttpOnly cookie, not URL query params
- All child process calls use `execFileSync` with args array (no shell interpolation)
- Mutating operations require both `OPENCLAW_ENABLE_MUTATING_OPS=1` and a localhost request
- No tokens or keys should be committed to version control

If you expose the dashboard beyond localhost (e.g. via Tailscale Funnel), always set `OPENCLAW_AUTH_TOKEN`.

## Files

| File | Description |
|---|---|
| `agent-dashboard.html` | Single-file frontend (~2,900 lines) |
| `api-server.js` | Backend API server (~3,300 lines) |
| `SKILL.md` | Agent instructions for OpenClaw |
| `.env.example` | Environment variable template |

## Publish to ClawHub

```bash
clawhub publish . \
  --slug openclaw-dashboard \
  --name "OpenClaw Dashboard" \
  --version 1.0.6
```

## License

MIT
