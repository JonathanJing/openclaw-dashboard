# OpenClaw Agent Dashboard

[![Built by Jony Jing](https://img.shields.io/badge/Built%20by-Jony%20Jing-a78bfa.svg)](https://github.com/JonathanJing)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A mobile-first operational dashboard for OpenClaw agents. Monitor sessions, costs, cron jobs, and configuration from your phone via Tailscale Funnel.

![Dashboard Preview](screenshots/dashboard-preview.png)

## Features

### 📊 Sessions Overview (Default Tab)
- Per-session table: model, thinking level, today's messages, tokens, cost, idle rate
- Real-time alerts: errors, model waste detection, stale sessions
- Status indicators: active / idle / stale / error

### 💰 Cost Analytics
- **Today's Usage**: per-channel token/cost breakdown with model distribution bar
- **All-Time Usage**: historical token + cost by model with daily stacked charts
- **Cost Heatmap**: model × day matrix with heat coloring
- **Provider Audit**: OpenAI official usage API + Anthropic org verification

### ⏰ Cron Jobs
- Visual cards with Chinese descriptions for each job
- Human-readable schedules (每天 9:00, 每 2 小时, 每周五)
- Last run status, duration, token usage, model

### 📈 Quality Panel
- Per-session idle rate (NO_REPLY + HEARTBEAT_OK / total)
- Visual progress bars: green < 30%, yellow 30-60%, red > 60%
- Effective vs silent message breakdown

### 🔍 Config Audit
- Auto-detect model waste (Opus on high-idle channels → suggest Sonnet)
- Missing thinking level warnings
- Provider verification (OpenAI ✓ / Anthropic org ✓)

### ⚙️ Config Viewer
- Browse `openclaw.json`, all SOUL/AGENTS/USER .md files
- API keys with automatic masking (show first 8 + last 4 chars)
- Click-to-expand with syntax highlighting

### 🔐 Security
- Cookie-based auth (HttpOnly, SameSite=Strict, 30-day expiry)
- Auto-loads keys from `~/.openclaw/keys.env` (never hardcoded)
- Key masking in config viewer

### 📱 Mobile-First
- PWA-ready (apple-mobile-web-app-capable, theme-color)
- Safe-area support for notched devices
- Touch targets ≥ 44px, bottom nav bar
- Horizontal scroll on data tables

## Pricing Model

All cost estimates use official per-token pricing (input/output split):

| Model | Input/1M | Output/1M |
|---|---|---|
| Claude Opus 4-6 | $15 | $75 |
| Claude Sonnet 4-6 | $3 | $15 |
| GPT-5.2 Codex | $2.50 | $10 |
| Gemini 3 Pro | $2.00 | $12.00 |
| Gemini 3 Flash | $0.50 | $3.00 |

## Quick Start

```bash
# Clone
git clone https://github.com/JonathanJing/jony-openclaw-dashboard.git
cd jony-openclaw-dashboard

# Configure
export OPENCLAW_AUTH_TOKEN="your-secret-token"
export DASHBOARD_PORT=18791

# Run
node api-server.js
```

The server auto-reads `~/.openclaw/keys.env` for API keys (OpenAI Admin, Anthropic Admin).

### Tailscale Funnel (Remote Access)

```bash
tailscale funnel --bg 18791
```

Access from anywhere: `https://your-node.tail*.ts.net/`

### macOS LaunchAgent (Auto-Start)

```bash
cp macos/com.openclaw.dashboard.plist.example ~/Library/LaunchAgents/com.jony.dashboard.plist
# Edit paths, then:
launchctl load ~/Library/LaunchAgents/com.jony.dashboard.plist
```

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Health check |
| `GET /agents` | Agent monitor data |
| `GET /ops/sessions` | Per-session overview (today's usage, alerts, config) |
| `GET /ops/channels` | Per-channel token/cost breakdown (today) |
| `GET /ops/alltime` | Historical usage by model + daily breakdown |
| `GET /ops/audit` | OpenAI usage API + Anthropic org verification |
| `GET /ops/config` | Config files viewer (keys masked) |
| `GET /ops/cron` | Enhanced cron job list with Chinese descriptions |
| `GET /cron/today` | Today's cron timeline |
| `GET /skills` | Installed skills list |

All endpoints require `?token=<AUTH_TOKEN>` or a valid `ds` session cookie.

## Architecture

- **Zero dependencies** — vanilla Node.js `http` + `fs` + `https`
- **Single HTML file** — `agent-dashboard.html` with inline CSS/JS
- **Local data only** — reads OpenClaw session files + cron JSONL directly
- **60s cache** — per-endpoint TTL to avoid re-scanning large JSONL files
- **PST timezone** — all "today" calculations use `America/Los_Angeles`

## Credits

Originally forked from [karem505/openclaw-agent-dashboard](https://github.com/karem505/openclaw-agent-dashboard) by Abo-Elmakarem Shohoud.

Extensively rewritten by [Jony Jing](https://github.com/JonathanJing) with:
- Session-centric architecture (6 tabs replacing original 5)
- Real-time cost analytics with official provider pricing
- Provider audit integration (OpenAI Admin API, Anthropic Admin API)
- Config viewer with key masking
- Enhanced cron with Chinese descriptions
- Mobile-first PWA redesign

## License

MIT
