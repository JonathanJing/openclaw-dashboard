# OpenClaw Dashboard

OpenClaw Dashboard is a unified administrative interface for monitoring and managing your OpenClaw ecosystem. It provides a real-time, bilingual (EN/ZH) control plane for costs, sessions, automation, and system reliability.

## Overview & Tabs

The dashboard is organized into five primary functional areas:

### 1. Overview
The command center for your OpenClaw instance.
- **Summary Cards**: Real-time snapshots of Today's Cost, Token Usage, Active Cron Jobs, and Active Sessions.
- **Model Mix**: Visual distribution of model usage (Opus/Sonnet/Flash) across your workspace.
- **System Stats**: Live hardware telemetry including CPU Load, RAM utilization, Disk usage, and Node.js versioning.
- **Session Matrix**: Detailed breakdown of active channels, assigned tasks, and "Fit" scores (Model alignment with task complexity).

### 2. Cost Analysis
Deep-dive into financial metrics and token economics.
- **Usage Breakdown**: Detailed tables showing messages, tokens, and estimated costs per channel and model.
- **Historical Trends**: 14-day rolling charts for daily token volume and model-specific cost distribution.
- **Cost Heatmap**: A Model × Day matrix to identify high-cost peaks and optimization opportunities.
- **All-Time Metrics**: Cumulative stats for long-term budget tracking.

### 3. Cron Monitoring
The central hub for OpenClaw's 18+ automated tasks.
- **Task Timeline**: A visual log of today's cron runs with success/failure status and execution duration.
- **Management Suite**: Enable/Disable tasks, trigger manual runs, and inspect specific cron configurations.
- **Cost Profiling**: Analysis of Fixed vs. Variable costs for automated background intelligence.

### 4. Health & Operations
Infrastructure monitoring and platform maintenance.
- **Watchdog Status**: Integration with the OpenClaw Watchdog system, showing runtime health, outages, and recovery logs.
- **System Management**: Direct access to restart the OpenClaw gateway and perform system-wide updates.
- **Audit Logs**: Access to operational logs and quality assessment reports (identifying cost-inefficient model use).

### 5. Configuration & Files
Direct management of the OpenClaw personality and system settings.
- **Config Viewer**: Inspect `openclaw.json`, `keys.env`, and other core system files.
- **Personality Management**: View and edit the primary agent files (SOUL, IDENTITY, AGENTS.md, MEMORY.md, TOOLS.md).
- **Workspace Explorer**: Browse and edit local workspace files directly through the web interface.

## Tech Stack
- **Backend**: Node.js (`api-server.js`) with native module dependencies.
- **Frontend**: Single-file Vanilla JS + Tailwind CSS + Canvas (Chart.js-like visualizations).
- **Security**: Bearer Token authentication with secure session persistence.

## Installation & Usage
1. Run `./start.sh` to initialize the dashboard server.
2. Visit `http://127.0.0.1:18793` in your browser.
3. Authenticate using your provided `AUTH_TOKEN`.

---
*Last Updated: 2026-02-25 (Post-Refactor Pipeline v2)*
