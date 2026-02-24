# ClawHub Dashboard Skill Reference

## GitHub

- Repository: `https://github.com/JonathanJing/jony-openclaw-dashboard`
- Skill folder URL: `https://github.com/JonathanJing/jony-openclaw-dashboard/tree/main/.cursor/skills/clawhub-dashboard`

Use these links when you want users to install from GitHub directly.

## Installation options

### Option A: Easiest (already in this repo)

If the user is working inside this repository, no extra setup is needed.
Cursor can discover project skills under:

`./.cursor/skills/clawhub-dashboard/`

### Option B: Install as a personal skill from GitHub

Run:

```bash
mkdir -p ~/.cursor/skills/clawhub-dashboard
curl -fsSL "https://raw.githubusercontent.com/JonathanJing/jony-openclaw-dashboard/main/.cursor/skills/clawhub-dashboard/SKILL.md" -o ~/.cursor/skills/clawhub-dashboard/SKILL.md
curl -fsSL "https://raw.githubusercontent.com/JonathanJing/jony-openclaw-dashboard/main/.cursor/skills/clawhub-dashboard/reference.md" -o ~/.cursor/skills/clawhub-dashboard/reference.md
```

Then restart Cursor or open a new chat session.

### Option C: Install by cloning only the skill folder

```bash
tmp_dir="$(mktemp -d)"
git clone --depth 1 https://github.com/JonathanJing/jony-openclaw-dashboard.git "$tmp_dir"
mkdir -p ~/.cursor/skills/clawhub-dashboard
cp -R "$tmp_dir/.cursor/skills/clawhub-dashboard/." ~/.cursor/skills/clawhub-dashboard/
rm -rf "$tmp_dir"
```

## Recommended share message

Use this message when sharing with users:

```text
Install ClawHub dashboard skill:
https://github.com/JonathanJing/jony-openclaw-dashboard/tree/main/.cursor/skills/clawhub-dashboard

Quick install:
mkdir -p ~/.cursor/skills/clawhub-dashboard
curl -fsSL "https://raw.githubusercontent.com/JonathanJing/jony-openclaw-dashboard/main/.cursor/skills/clawhub-dashboard/SKILL.md" -o ~/.cursor/skills/clawhub-dashboard/SKILL.md
curl -fsSL "https://raw.githubusercontent.com/JonathanJing/jony-openclaw-dashboard/main/.cursor/skills/clawhub-dashboard/reference.md" -o ~/.cursor/skills/clawhub-dashboard/reference.md
```

## Maintenance

- Keep `SKILL.md` under 500 lines.
- Update this file when repository path or default branch changes.
- Keep trigger terms in `SKILL.md` aligned with real dashboard modules.
- For public sharing, keep mutating ops flags disabled by default (`OPENCLAW_ENABLE_MUTATING_OPS=0`, `OPENCLAW_ALLOW_ATTACHMENT_FILEPATH_COPY=0`).
