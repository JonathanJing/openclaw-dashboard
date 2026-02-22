#!/bin/bash
set -a; source ~/.openclaw/keys.env 2>/dev/null; set +a
export OPENCLAW_AUTH_TOKEN="451374645a4c6bcfc20641ab49ea3091803287d23ccebea2"
export OPENCLAW_WORKSPACE="/Users/jonyopenclaw/.openclaw/workspace"
export DASHBOARD_PORT=18791
node api-server.js
