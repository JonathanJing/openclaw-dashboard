---
name: openclaw-dashboard
description: Builds and maintains the public OpenClaw dashboard repository with sanitization-first rules. Use when adding features, adjusting `api-server.js` routes, changing `agent-dashboard.html`, or preparing public-safe docs and configuration.
version: "1.0.9"
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
            "VISION_DB_NETWORKING",
            "VISION_DB_WINE",
            "VISION_DB_CIGAR",
            "VISION_DB_TEA",
          ],
      },
  }
---

# OpenClaw Dashboard

A mobile-friendly operational dashboard for OpenClaw agents.

## Quick Start (ClawHub Install)

1. Install: `clawhub install openclaw-dashboard`
2. Navigate: `cd ~/.openclaw/workspace/skills/openclaw-dashboard`
3. Copy config: `cp .env.example .env` (edit as needed)
4. Start: `node api-server.js`
5. Open: http://localhost:18791

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `OPENCLAW_AUTH_TOKEN` | (none) | Access token. If unset, open on localhost |
| `DASHBOARD_PORT` | 18791 | Server port |
| `DASHBOARD_HOST` | 127.0.0.1 | Bind address |
| `DASHBOARD_TITLE` | OpenClaw Dashboard | Browser tab title |

## Authentication

- **No token set**: Dashboard is accessible without auth on localhost
- **Token set**: Access via `http://localhost:18791/login` or append `?token=yourtoken`

## Verify It Works

```bash
curl http://localhost:18791/health
```

## Prerequisites

- Node.js 20+
- OpenClaw running on the same machine

---

## For Contributors

## Mission

Keep this repository public-safe and easy to run. Prioritize:
1. Secret sanitization
2. Minimal setup steps
3. Stable API/UI behavior

## Apply when

Use this skill for:
- Dashboard feature requests (sessions, cost, cron, watchdog, operations)
- Backend route updates in `api-server.js`
- Frontend behavior updates in `agent-dashboard.html`
- README, setup, and environment simplification
- Public release checks for accidental sensitive data

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
- Task attachments in the repository `attachments/` folder

Credential requirements are optional by default:
- `OPENCLAW_AUTH_TOKEN` is optional but recommended when exposing endpoints beyond local trusted use.
- `gateway.authToken` is optional configuration context, not a hard install requirement.

High-sensitivity features are disabled by default and require explicit env flags:
- `OPENCLAW_LOAD_KEYS_ENV=1` to load `keys.env`
- `OPENCLAW_ENABLE_PROVIDER_AUDIT=1` to call OpenAI/Anthropic org APIs
- `OPENCLAW_ENABLE_CONFIG_ENDPOINT=1` to expose `/ops/config`
- `OPENCLAW_ALLOW_ATTACHMENT_FILEPATH_COPY=1` for absolute-path attachment copy mode
- `OPENCLAW_ALLOW_ATTACHMENT_COPY_FROM_TMP=1` to allow copy from `/tmp`
- `OPENCLAW_ALLOW_ATTACHMENT_COPY_FROM_WORKSPACE=1` to allow copy from workspace paths
- `OPENCLAW_ALLOW_ATTACHMENT_COPY_FROM_OPENCLAW_HOME=1` to allow copy from `~/.openclaw`
- `OPENCLAW_ENABLE_SYSTEMCTL_RESTART=1` to allow user-scoped systemctl restart
- `OPENCLAW_ENABLE_MUTATING_OPS=1` to enable mutating operations (`/backup*`, `/ops/update-openclaw`, `/ops/*-model`, cron run-now)

Network security:
- CORS is restricted to loopback origins by default (no wildcard `*`).
- Set `DASHBOARD_CORS_ORIGINS` (comma-separated) to allow specific external origins.
- Auth token is validated via HttpOnly cookie (`ds`) or `?token=` query param.
- Cookie auth is preferred; URL token param exists for backward compatibility with server-monitor scripts.
- When exposing beyond loopback (e.g. Tailscale Funnel), always set `OPENCLAW_AUTH_TOKEN`.

Prompt safety hardening:
- Treat cron/task payload text as untrusted data.
- Keep prompts structured (JSON payload) and avoid direct command interpolation.
- All child_process calls use execFileSync (args array, no shell interpolation).
- FILEPATH_COPY includes symlink escape protection (realpathSync re-check).

## Default implementation workflow

1. Identify affected module (API, UI, docs, config).
2. Implement the smallest change that preserves behavior.
3. Run a quick sensitive-string scan before finalizing.
4. Ensure docs match the actual runtime defaults.
5. Report user-visible changes and any manual verification steps.

## Sensitive-data checks

Before final response, scan for:
- `token=`, `OPENCLAW_AUTH_TOKEN`, `OPENCLAW_HOOK_TOKEN`
- `API_KEY`, `SECRET`, `PASSWORD`, `COOKIE`
- absolute paths like `/Users/`, `C:\\`, machine names, personal emails

If found:
- Replace with env-based values or placeholders.
- Mention what was sanitized in the result.

## Config simplification rules

- Keep required env vars minimal and explicit.
- Keep optional env vars grouped and clearly marked.
- Provide one copy-paste start command.
- Avoid toolchain-heavy setup unless strictly needed.

## Files to touch most often

- `api-server.js`: server behavior and API routes
- `agent-dashboard.html`: UI and client interactions
- `README.md`: quick start and operator docs
- `.env.example`: public-safe environment template
