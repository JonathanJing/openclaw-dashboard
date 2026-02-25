# Security Policy

## Threat Model (Summary)

- This dashboard reads local OpenClaw runtime data from `~/.openclaw/...`.
- Some operations can trigger local hooks and update workflows.
- Secrets and provider admin keys must remain opt-in and least-privilege.

## Secure Defaults

- `OPENCLAW_LOAD_KEYS_ENV=0` (disabled by default)
- `OPENCLAW_ENABLE_PROVIDER_AUDIT=0`
- `OPENCLAW_ENABLE_CONFIG_ENDPOINT=0`
- `OPENCLAW_ALLOW_ATTACHMENT_FILEPATH_COPY=0`
- `OPENCLAW_ALLOW_ATTACHMENT_COPY_FROM_TMP=0`
- `OPENCLAW_ALLOW_ATTACHMENT_COPY_FROM_WORKSPACE=0`
- `OPENCLAW_ALLOW_ATTACHMENT_COPY_FROM_OPENCLAW_HOME=0`
- `OPENCLAW_ENABLE_SYSTEMCTL_RESTART=0`
- `OPENCLAW_ENABLE_MUTATING_OPS=0`
- `DASHBOARD_HOST=127.0.0.1`

- `DASHBOARD_CORS_ORIGINS=` (empty = loopback only, no wildcard)

Mutating operations are additionally restricted to localhost callers.

## CORS Policy

CORS is restricted by default — only loopback origins (`localhost`, `127.0.0.1`) are allowed.
To allow external origins (e.g. for Tailscale Funnel access), set:
```
DASHBOARD_CORS_ORIGINS=https://your-tailscale-hostname.ts.net
```
Multiple origins: comma-separated. Use `*` only in trusted environments.

## Command Execution

All child_process calls use `execFileSync` with argument arrays (no shell interpolation).
Zero `execSync` calls exist in the codebase. The `runCmd()` helper wraps `execFileSync` with timeout and error handling.

## File Copy (FILEPATH_COPY)

When `OPENCLAW_ALLOW_ATTACHMENT_FILEPATH_COPY=1` is set:
- Source paths must match configured allowed prefixes
- Symlinks are resolved via `realpathSync` and re-checked against allowed prefixes
- Each sub-directory (`/tmp`, workspace, `.openclaw`) requires its own explicit env flag

## VirusTotal Compliance Checklist

Before each release:

1. Generate hashes:
   ```bash
   shasum -a 256 api-server.js agent-dashboard.html SKILL.md README.md .env.example > vt-hashes.txt
   ```
2. Submit hashes/files to VirusTotal.
3. Record report IDs in release notes.
4. Block release if suspicious detections are unresolved.

## Reporting a Vulnerability

Open a private security report with:
- affected version
- reproduction steps
- impact assessment
- suggested mitigation
