---
name: clawhub-dashboard
description: Operates and extends the OpenClaw mobile-first dashboard in this repository. Use when the user asks to add dashboard features, debug `api-server.js` endpoints, improve `agent-dashboard.html`, analyze sessions/cost/cron/watchdog views, or prepare deployment and operations workflows.
---

# ClawHub Dashboard

## When to apply

Apply this skill when requests mention any of:
- OpenClaw dashboard feature changes
- API route changes in `api-server.js`
- UI and interaction changes in `agent-dashboard.html`
- Sessions, cost, cron, watchdog, or operations panels
- Mobile/PWA usability improvements
- Deployment, remote access, or runbook updates

## Repo landmarks

- Backend server: `api-server.js`
- Frontend single file: `agent-dashboard.html`
- Service docs and quick start: `README.md`
- LaunchAgent template: `macos/com.openclaw.dashboard.plist.example`

## Default workflow

1. Confirm the target area (Sessions/Cost/Cron/Watchdog/Config/Operations).
2. Map impacted API endpoints first, then the UI rendering and interactions.
3. Implement the smallest change that preserves existing dashboard behavior.
4. Verify auth assumptions (`token` query or valid `ds` cookie) are unchanged.
5. Summarize changes with user-visible behavior, risks, and rollback notes.

## API change checklist

- Keep endpoint naming under `/ops/*` consistent with existing routes.
- Return stable JSON shapes to avoid breaking existing frontend rendering.
- Handle missing local data files gracefully (empty state, no crash).
- Keep secrets masked in config/audit related responses.

## UI change checklist

- Prioritize mobile readability and touch targets.
- Keep high-signal warnings visible near the top of relevant sections.
- Avoid introducing framework/runtime dependencies by default.
- Preserve sorting/filtering behavior when extending tables/cards.

## Ops and reliability checklist

- Preserve watchdog and incident visibility paths.
- Keep update/restart style operations explicit and auditable.
- Document any new env vars or operational assumptions in `README.md`.

## Response format

When completing a task, report:
1. What changed for operators.
2. Which files were updated.
3. Any API contract or env var changes.
4. Validation performed and what still needs manual verification.

## Additional resources

- Installation and distribution: [reference.md](reference.md)
