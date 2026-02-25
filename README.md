# OpenClaw Dashboard

OpenClaw Dashboard is a zero-dependency, single-file administrative interface for monitoring and managing your OpenClaw agent. It provides real-time insights into costs, session activity, cron jobs, and system health.

## Key Features

- **Cost Management**: Track daily and all-time token usage, costs per channel, and model distribution.
- **Session Control**: Monitor active sessions across Discord/WhatsApp, adjust models on-the-fly, and view "Fit" scores (model vs. task complexity).
- **Cron Monitoring**: Manage all 18+ scheduled tasks, view execution timelines, and analyze cron-specific costs (Fixed vs. Variable).
- **Runtime Health**: Integrated Watchdog for gateway monitoring, system hardware stats, and an "Optimization" suite (Quality/Audit) to identify cost-saving opportunities.
- **Operations**: Perform backups, restores, and system updates directly from the UI.
- **Security & i18n**: Secure Cookie-based authentication and full Bilingual support (EN/ZH).

## Tech Stack

- **Backend**: Node.js (`api-server.js`) with native modules.
- **Frontend**: Single-file HTML (`agent-dashboard.html`) using Vanilla JS, Tailwind CSS, and Canvas for charts.
- **Authentication**: Secure Token-based login with HTTP-only cookies.

## Quick Start

1. Ensure OpenClaw is running.
2. Start the dashboard server:
   ```bash
   ./start.sh
   ```
3. Access the dashboard at `http://127.0.0.1:18793`.
4. Log in using your `AUTH_TOKEN`.

---
*Last Updated: 2026-02-25 (Post-PM Audit Cleanup)*
