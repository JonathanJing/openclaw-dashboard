# OpenClaw Dashboard

A real-time operations dashboard for OpenClaw — built for teams running multi-agent workflows in production.

It helps you answer, fast:
- Is the system healthy right now?
- Where are tokens and cost going?
- Which cron/agent needs intervention first?

---

## Why OpenClaw Dashboard

Most AI dashboards stop at pretty charts.  
OpenClaw Dashboard is designed for **operational decisions**:
- top-level decision signals (cost, tokens, alerts, model mix, infra state)
- deep drill-down per session / channel / cron job
- architecture that is readable by both humans and agents

---

## Architecture (Technical Direction)

We moved from monolithic scripts to a **plug-in provider architecture**.

### Core ideas
- **Provider-first backend**: one provider = one clear data boundary
- **Tab-modular frontend**: each tab is independently evolvable
- **Ground Truth driven mapping**: channels/models/cron metadata from a single source
- **Backward compatibility**: legacy layer preserved for safe migrations

### Current structure
- `backend/server.js` — modular API entrypoint
- `backend/providers/*` — sessions, ledger, cron, watchdog, system, spark, tasks, config
- `frontend/tabs/*` + `frontend/shared/*` — modular UI
- `agent-dashboard.html` + `api-server.js` — legacy compatibility path

This design makes changes safer, faster, and easier for AI agents to patch correctly.

---

## Key Capabilities

### 1) Operations Overview
- Today cost / token usage
- Model mix distribution (including local vs cloud share)
- Alert snapshot (session/cron/watchdog)
- DGX Spark runtime visibility

### 2) Cost Intelligence
- model-level usage and spend
- channel-level breakdown
- time-range analysis (7d/30d/90d/all)

### 3) Cron & Reliability
- cron status and run history
- failure visibility and incident-oriented ops signals
- watchdog timeline and recovery context

### 4) System & Infra Readability
- host status (macOS, CPU, memory, disk, runtime versions)
- Spark node status (model/runtime/slot or GPU metrics depending on source)

---

## Quick Start

```bash
cd ~/.openclaw/workspace/skills/openclaw-dashboard
cp env.example .env
# set OPENCLAW_AUTH_TOKEN
node backend/server.js
```

Open: `http://127.0.0.1:18791/`

Legacy mode (if needed):
```bash
node api-server.js
```

---

## Security

- local-first binding by default
- token-based auth
- optional mutating ops behind explicit flags
- no hardcoded secrets in source

---

## Who this is for

- builders running always-on agent systems
- operators managing cron-heavy AI workflows
- teams needing both observability and controllability

---

## License
MIT
