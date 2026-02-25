# OpenClaw Dashboard

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A self-hosted, mobile-first operations dashboard for [OpenClaw](https://github.com/openclaw/openclaw) — monitor sessions, costs, cron jobs, model configuration, and system health from a single page.

![Dashboard Preview](screenshots/tasks-kanban.png)

## Features

### 📊 Sessions & Cost Analytics
- **Live session overview** — model, messages, tokens, cost per session at a glance
- **Sortable columns** — click any header to sort by model, tokens, cost, cost/message, or match score
- **Daily & historical cost breakdown** — by model, with trend charts and heatmaps
- **Cron cost analysis** — fixed vs. variable cost composition for budget planning

### ⏱️ Cron Management
- **Visual cron cards** — see schedule, last run, duration, model, and token usage
- **Model selector per job** — change cron models directly from the dashboard
- **Run history** — expandable per-job execution logs

### 🛡️ Watchdog & Reliability
- **Global alert banner** — watchdog issues surface at the top with one-click jump to Operations
- **Time-window filtering** — 5/10/15/30/60 min windows + "critical only" toggle
- **Health timeline** — continuous healthy/down status bar for quick incident identification
- **Config drift detection** — spot unintended configuration changes

### 🔧 Operations Panel
- **System info** — OS, hardware, disk, memory, OpenClaw version (always visible)
- **One-click actions** — restart gateway, trigger backups, run audits, generate cost reports
- **Session model defaults** — configure default models per channel

### 🌐 Internationalization
- **English / 中文 toggle** — switch UI language with one click

### 📱 Mobile-First Design
- **PWA-ready** — install to home screen, works offline
- **Touch-optimized** — cards, tabs, and controls designed for phone-sized screens
- **Cookie-based auth** — secure browser login for remote access

### 🏗️ Architecture
- **Single-file frontend** — `agent-dashboard.html` with inline CSS/JS, zero build step
- **Lightweight backend** — `api-server.js` using Node.js native `http/fs/https`, no frameworks
- **Security hardened** — no `execSync` (shell injection proof), CORS restricted to loopback, mutating operations gated behind env flags

## Quick Start

```bash
# Clone
git clone https://github.com/JonathanJing/openclaw-dashboard.git
cd openclaw-dashboard

# Configure
cp env.example .env
cp start.sh.example start.sh
chmod +x start.sh

# Edit .env with your settings
# OPENCLAW_DIR — path to your OpenClaw config directory
# AUTH_TOKEN — dashboard access token
# PORT — server port (default: 18791)

# Run
./start.sh
# → http://localhost:18791
```

## Configuration

| Environment Variable | Description | Default |
|---|---|---|
| `OPENCLAW_DIR` | Path to OpenClaw config directory | `~/.openclaw` |
| `AUTH_TOKEN` | Dashboard access token | *(required)* |
| `PORT` | Server port | `18791` |
| `DASHBOARD_CORS_ORIGINS` | Allowed CORS origins (comma-separated) | loopback only |
| `OPENCLAW_ENABLE_MUTATING_OPS` | Enable restart/backup actions | `0` (disabled) |
| `OPENCLAW_ENABLE_SYSTEMCTL_RESTART` | Enable systemctl restart | `0` (disabled) |

## Screenshots

| Sessions | Cron Jobs | Logs |
|---|---|---|
| ![](screenshots/tasks-kanban.png) | ![](screenshots/task-detail.png) | ![](screenshots/logs.png) |

## Security

- All shell commands use `execFileSync` (no shell interpolation)
- CORS defaults to loopback-only (`127.0.0.1` / `localhost`)
- Mutating operations (restart, backup) require explicit opt-in via env vars
- Auth token required for all API access

See [SECURITY.md](SECURITY.md) for full details.

## ClawHub

Install as an OpenClaw skill:

```bash
clawhub install openclaw-dashboard
```

See [SKILL.md](SKILL.md) for skill metadata.

## License

MIT — see [LICENSE](LICENSE).
