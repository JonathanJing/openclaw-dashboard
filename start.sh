#!/bin/bash
set -a; source ~/.openclaw/keys.env 2>/dev/null; set +a
export OPENCLAW_AUTH_TOKEN="REDACTED_SECRET"
export OPENCLAW_WORKSPACE="/Users/jonyopenclaw/.openclaw/workspace"
export DASHBOARD_PORT=18791
node api-server.js
