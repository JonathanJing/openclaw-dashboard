'use strict';
/**
 * Centralized configuration — reads environment variables once.
 * Every provider imports from here instead of reading process.env directly.
 */
const path = require('path');

const HOME = process.env.HOME || '';
const DOT_OPENCLAW = path.join(HOME, '.openclaw');

module.exports = {
  // Server
  PORT:   parseInt(process.env.DASHBOARD_PORT || '18791', 10),
  HOST:   process.env.DASHBOARD_HOST || '127.0.0.1',
  AUTH_TOKEN: process.env.OPENCLAW_AUTH_TOKEN || '',

  // Paths
  HOME,
  DOT_OPENCLAW,
  WORKSPACE: process.env.OPENCLAW_WORKSPACE || path.join(DOT_OPENCLAW, 'workspace'),

  // Sessions
  SESSIONS_FILE: process.env.OPENCLAW_SESSIONS_FILE
    || path.join(DOT_OPENCLAW, 'agents', 'main', 'sessions', 'sessions.json'),
  SESSIONS_DIR: path.join(DOT_OPENCLAW, 'agents', 'main', 'sessions'),
  SUBAGENT_RUNS_FILE: process.env.OPENCLAW_SUBAGENT_RUNS
    || path.join(DOT_OPENCLAW, 'subagents', 'runs.json'),

  // Cron
  CRON_STORE_PATH: path.join(DOT_OPENCLAW, 'cron', 'jobs.json'),
  CRON_RUNS_DIR:   path.join(DOT_OPENCLAW, 'cron', 'runs'),

  // Watchdog
  WATCHDOG_DIR: process.env.OPENCLAW_WATCHDOG_DIR
    || path.join(DOT_OPENCLAW, 'watchdogs', 'gateway-discord'),

  // Spark
  SPARK_METRICS_GT_FILE: process.env.OPENCLAW_SPARK_METRICS_GT
    || path.join(DOT_OPENCLAW, 'spark-metrics', 'ground-truth.json'),
  SPARK_WATCHDOG_STATE: path.join(DOT_OPENCLAW, 'spark-watchdog-state.json'),

  // Ledger
  LEDGER_DB: process.env.OPENCLAW_LEDGER_DB
    || path.join(DOT_OPENCLAW, 'ledger.db'),

  // OpenClaw config
  OPENCLAW_CONFIG_FILE: process.env.OPENCLAW_CONFIG_FILE
    || path.join(DOT_OPENCLAW, 'openclaw.json'),
  OPENCLAW_CONFIG_BASELINE: process.env.OPENCLAW_CONFIG_BASELINE_FILE
    || path.join(DOT_OPENCLAW, 'openclaw.json.good'),

  // Ground Truth
  GROUND_TRUTH_FILE: path.join(
    process.env.OPENCLAW_WORKSPACE || path.join(DOT_OPENCLAW, 'workspace'),
    'MODEL_GROUND_TRUTH.md'
  ),

  // Feature flags
  ENABLE_CONFIG_ENDPOINT:  process.env.OPENCLAW_ENABLE_CONFIG_ENDPOINT === '1',
  ENABLE_MUTATING_OPS:     process.env.OPENCLAW_ENABLE_MUTATING_OPS === '1',
  ENABLE_PROVIDER_AUDIT:   process.env.OPENCLAW_ENABLE_PROVIDER_AUDIT === '1',
  ENABLE_SESSION_PATCH:    process.env.OPENCLAW_ENABLE_SESSION_PATCH === '1',

  // Attachment security
  ALLOW_ATTACHMENT_FILEPATH_COPY:      process.env.OPENCLAW_ALLOW_ATTACHMENT_FILEPATH_COPY === '1',
  ALLOW_ATTACHMENT_COPY_FROM_TMP:      process.env.OPENCLAW_ALLOW_ATTACHMENT_COPY_FROM_TMP === '1',
  ALLOW_ATTACHMENT_COPY_FROM_WORKSPACE:process.env.OPENCLAW_ALLOW_ATTACHMENT_COPY_FROM_WORKSPACE === '1',
  ALLOW_ATTACHMENT_COPY_FROM_OPENCLAW_HOME: process.env.OPENCLAW_ALLOW_ATTACHMENT_COPY_FROM_OPENCLAW_HOME === '1',

  // Backup
  BACKUP_REMOTE: process.env.OPENCLAW_BACKUP_REMOTE || 'origin',
  BACKUP_BRANCH: process.env.OPENCLAW_BACKUP_BRANCH || '',

  // Gateway
  GATEWAY_HOOKS_URL: 'http://127.0.0.1:18789/hooks',
  HOOK_TOKEN: process.env.OPENCLAW_HOOK_TOKEN || '',

  // Limits
  MAX_BODY:   1 * 1024 * 1024,
  MAX_UPLOAD: 20 * 1024 * 1024,
  MAX_UNTRUSTED_PROMPT_FIELD: 800,
  MAX_CRON_MESSAGE_LENGTH: 3000,

  // Tasks
  TASKS_FILE: path.join(__dirname, '..', '..', 'tasks.json'),
  ATTACHMENTS_DIR: path.join(__dirname, '..', '..', 'attachments'),
  SKILLS_DIR: path.join(
    process.env.OPENCLAW_WORKSPACE || path.join(DOT_OPENCLAW, 'workspace'),
    'skills'
  ),
  MEMORY_DIR: path.join(
    process.env.OPENCLAW_WORKSPACE || path.join(DOT_OPENCLAW, 'workspace'),
    'memory'
  ),

  // External API keys (optional)
  OPENAI_ADMIN_KEY:    process.env.OPENAI_ADMIN_KEY || '',
  ANTHROPIC_ADMIN_KEY: process.env.ANTHROPIC_ADMIN_KEY || '',
  NOTION_API_KEY:      process.env.NOTION_API_KEY || '',
  VISION_DB: {
    NETWORKING: process.env.VISION_DB_NETWORKING || '',
    WINE:      process.env.VISION_DB_WINE || '',
    CIGAR:     process.env.VISION_DB_CIGAR || '',
    TEA:       process.env.VISION_DB_TEA || '',
  },
};
