# Changelog

## [2.0.0] - 2026-02-22

### 🏗️ Architecture Overhaul
- **Session-centric design**: Replaced original 5-tab layout (Ops/Documents/APIs/Logs) with 6 operational tabs (Sessions/Cost/Cron/Quality/Audit/Config)
- **Unified pricing engine**: All cost estimates use official per-token pricing with input/output split (Claude Opus $15/$75, Gemini 3 Pro $2/$12, etc.)
- **Unified PST timezone**: Shared `getTodayPstStartIso()` helper across all endpoints
- **Auto-load keys**: Server reads `~/.openclaw/keys.env` at startup (no env vars needed in LaunchAgent)

### 📊 New: Sessions Tab (Default)
- Per-session table: model, thinking level, messages (effective/total), tokens, cost, idle rate, last active
- Real-time alerts: session errors, model waste detection, stale session warnings
- Header cards: Today Cost / Tokens / Cron Jobs / Active Sessions / Primary Model

### 💰 New: Cost Analytics
- Today's channel breakdown with model distribution bar
- All-time model breakdown with per-model cost cards
- Daily token chart (stacked by model, color-coded)
- Daily cost chart (stacked by model, dollar labels)
- Cost heatmap: model × day matrix with heat coloring
- Provider audit: OpenAI Admin API (7-day usage) + Anthropic org verification

### 📈 New: Quality Panel
- Per-session idle rate visualization (NO_REPLY + HEARTBEAT_OK percentage)
- Color-coded progress bars (green/yellow/red thresholds)
- Effective vs silent message breakdown

### 🔍 New: Config Audit Panel
- Auto-detect: Opus on high-idle channels → suggest downgrade to Sonnet
- Missing thinking level warnings
- Cost-saving recommendations with estimated savings
- Provider verification status

### ⚙️ New: Config Viewer
- Browse openclaw.json, SOUL*.md, AGENTS.md, USER.md, TOOLS.md, IDENTITY.md, HEARTBEAT.md, MEMORY.md
- API keys from keys.env with automatic masking (first 8 + last 4 chars)
- Click-to-expand accordion UI
- File size and modification time

### ⏰ Enhanced: Cron Tab
- Visual card layout replacing timeline view
- Chinese descriptions for each job (🔍 监控 OpenClaw 生态动态, 💼 AI 求职机会扫描, etc.)
- Human-readable schedules (每天 9:00, 每 2 小时, 每周五 9:00)
- Last run: time ago, duration, tokens, model
- Enable/disable status with visual indicators

### 🔐 Security
- Cookie-based auth: HttpOnly, SameSite=Strict, 30-day expiry
- Login page at `/login`, logout at `/logout`
- Key masking in config viewer (never expose full keys)

### 📱 Mobile
- PWA meta tags (apple-mobile-web-app-capable, theme-color, viewport-fit=cover)
- Safe-area padding for notched devices
- Touch targets ≥ 44px
- Responsive tab bar

### 🐛 Bug Fixes
- Fixed PST timezone calculation (was double-converting offsets)
- Fixed model distribution bar gaps (0-token models, legend inside flex container)
- Fixed cost discrepancy between endpoints (unified estimator, removed cron from channels total)
- Filtered `delivery-mirror` model from all views

### API Endpoints Added
- `GET /ops/sessions` — per-session overview with today's usage + alerts
- `GET /ops/channels` — per-channel cost/token breakdown
- `GET /ops/alltime` — historical usage with daily model breakdown
- `GET /ops/audit` — OpenAI/Anthropic official API verification
- `GET /ops/config` — config file viewer with key masking
- `GET /ops/cron` — enhanced cron job list

---

## [1.0.0] - 2026-02-21

### Initial Fork
- Forked from [karem505/openclaw-agent-dashboard](https://github.com/karem505/openclaw-agent-dashboard)
- Added cookie-based auth (login/logout)
- Added system + workspace skills scan (56 skills)
- Added mobile PWA support
- Added Cron Timeline + Vision Ingestion panels
- Added macOS LaunchAgent plist example
- Replaced Kanban tasks with operational monitoring
