'use strict';
/**
 * Ops Legacy Provider — bridges remaining handlers from old api-server.js
 * that haven't been fully refactored yet.
 *
 * Each handler here is a thin wrapper that delegates to the old functions.
 * They will be migrated into dedicated providers incrementally.
 *
 * Handlers covered:
 * - /ops/sessions (detailed session view)
 * - /ops/channels (today channel breakdown via JSONL scan)
 * - /ops/alltime (historical via JSONL scan)
 * - /ops/cron-costs (cron cost analysis)
 * - /ops/cron (enhanced cron list)
 * - /ops/audit, /ops/secaudit
 * - /ops/dgx-status (DGX probe via HTTP)
 * - /ops/models (dynamic model registry)
 * - /ops/session-model, /ops/cron-model (model overrides)
 * - /ops/update-openclaw, /ops/restart
 * - /agents (agent monitor)
 * - /cron (CRUD)
 * - /backup, /memory, /metrics
 * - /vision/stats
 * - /tasks/:id/*, /tasks/spawn-batch
 */

const url = require('url');

// We load the old api-server.js module-style by extracting its handler functions.
// Since the old file is a monolith that starts its own server, we can't require() it directly.
// Instead, we'll register the routes in server.js using a "catch-all" that forwards
// unmatched routes to the old server on its original port.
//
// This is the cleanest approach: the old server keeps running, the new server proxies
// anything it doesn't handle yet.

const http = require('http');
const cfg = require('../lib/config');
const { jsonReply, errorReply } = require('../lib/http-helpers');

// Legacy proxy port: set to a DIFFERENT port if you still run the old api-server.js alongside.
// When the old server is NOT running, legacy routes will gracefully 501.
const OLD_SERVER_PORT = cfg.LEGACY_PROXY_PORT;

function proxyToOld(req, res) {
  // If no legacy server configured, return 501 with helpful message
  if (!OLD_SERVER_PORT) {
    return errorReply(res, 501, `Legacy route not yet migrated. Use /api/* endpoints instead.`);
  }

  const proxyReq = http.request({
    hostname: '127.0.0.1',
    port: OLD_SERVER_PORT,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      'authorization': req.headers['authorization'] || `Bearer ${cfg.AUTH_TOKEN}`,
    },
    timeout: 30000,
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (e) => {
    errorReply(res, 502, `Legacy backend unavailable: ${e.message}`);
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    errorReply(res, 504, 'Legacy backend timeout');
  });

  req.pipe(proxyReq);
}

// v2.6: legacy proxy is optional fallback only. Keep list as metadata for emergency rollback.
const LEGACY_ROUTES = [];

// ── Stub handlers for routes not yet fully migrated ─────────────────
const fs = require('fs');
const path = require('path');
const os = require('os');

function handleAgents(_req, res) {
  // Lightweight agent monitor from sessions.json
  try {
    const sessions = JSON.parse(fs.readFileSync(cfg.SESSIONS_FILE || path.join(os.homedir(), '.openclaw/agents/main/sessions/sessions.json'), 'utf8'));
    const agents = Object.entries(sessions)
      .filter(([k]) => k.includes(':subagent:') || k.includes(':run:'))
      .map(([k, v]) => ({ key: k, sessionId: v.sessionId, status: v.status || 'unknown', updatedAt: v.updatedAt }));
    jsonReply(res, 200, agents);
  } catch { jsonReply(res, 200, []); }
}

function handleOpsChannels(_req, res) {
  // Redirect to new ledger by-channel endpoint data format
  const { sqliteJson } = require('../lib/sqlite-helper');
  try {
    // Group cron sessions (session_key LIKE '%:cron:%') into a single synthetic row;
    // all other sessions keep their normal channel/chat_id grouping.
    const rows = sqliteJson(cfg.LEDGER_DB || path.join(os.homedir(), '.openclaw/ledger.db'), `
      SELECT
        CASE WHEN session_key LIKE '%:cron:%' THEN 'cron' ELSE channel END AS channel,
        CASE WHEN session_key LIKE '%:cron:%' THEN '__cron__' ELSE chat_id END AS chat_id,
        count(*) as messages,
        sum(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) as totalTokens,
        round(sum(cost_total), 6) as cost
      FROM calls WHERE date(ts, 'localtime') >= date('now', 'localtime')
      GROUP BY
        CASE WHEN session_key LIKE '%:cron:%' THEN 'cron' ELSE channel END,
        CASE WHEN session_key LIKE '%:cron:%' THEN '__cron__' ELSE chat_id END
      ORDER BY cost DESC, totalTokens DESC
    `);
    // Mark cron row for frontend labeling
    for (const r of rows) {
      if (r.chat_id === '__cron__') {
        r.isCron = true;
        r.displayName = 'Cron Jobs';
      }
    }
    jsonReply(res, 200, { channels: rows });
  } catch (e) { jsonReply(res, 200, { channels: [], error: e.message }); }
}

function handleOpsModels(_req, res) {
  // Build model registry from Ground Truth.
  // Returns { registry: { alias: { id, label } }, colors, models: [...] }
  // frontend health.js expects data.registry (object keyed by alias)
  // frontend cron.js refreshModelOptions() iterates Object.entries(registry)
  const gt = require('./ground-truth');
  const modelList = gt.getModelRegistry();
  const colors = gt.getModelColorMap();

  // registry: object { alias → { id, label } } for refreshModelOptions()
  const registry = {};
  for (const m of modelList) {
    registry[m.alias] = { id: m.id, label: m.alias };
  }

  // displayNames: [ [pattern, shortLabel], ... ] for shortModel()
  // Must match frontend cron.js MODEL_DISPLAY_NAMES
  const DISPLAY_NAME_MAP = {
    'opus-4.6': 'Claude Opus 4.6',
    'sonnet-4.6': 'Claude Sonnet 4.6',
    'haiku-4.5': 'Claude Haiku 4.5',
    'haiku-3.5': 'Claude Haiku 3.5',
    'gemini-3-flash': 'Gemini 3 Flash',
    'gemini-3.1-pro': 'Gemini 3.1 Pro',
    'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gpt-5.4': 'GPT-5.4',
    'gpt-5.3-codex': 'GPT-5.3 Codex',
    'gpt-5.3-instant': 'GPT-5.3 Instant',
    'gpt-5.3-instant-latest': 'GPT-5.3 Instant',
    'gpt-5.3-chat': 'GPT-5.3 Chat',
    'gpt-5.2': 'GPT-5.2',
    'gpt-5.1': 'GPT-5.1',
    'gpt-5': 'GPT-5',
    'gpt-5-mini': 'GPT-5 Mini',
    'gpt-5-nano': 'GPT-5 Nano',
    'kimi-k2.5': 'Kimi-K2.5',
    'doubao-seed-2-0-pro': 'Doubao Seed',
    'qwen-mac': 'Qwen-MacBook',
    'qwen-spark': 'Qwen-35B',
    'qwen-spark-35b': 'Qwen-35B',
    'qwen-spark-27b': 'Qwen-27B',
  };
  const displayNames = modelList.map(m => {
    const alias = m.alias.replace(/-preview$/, '');
    const displayName = DISPLAY_NAME_MAP[alias] || alias;
    return [m.alias, displayName];
  });

  jsonReply(res, 200, {
    registry,          // object — for refreshModelOptions()
    colors,            // object — for MODEL_COLORS
    displayNames,      // array  — for MODEL_DISPLAY_NAMES
    models: modelList, // array  — legacy callers
    source: 'ground-truth',
  });
}

function handleOpsAlltime(_req, res) {
  // Redirect to ledger history (last 90 days)
  const { sqliteJson } = require('../lib/sqlite-helper');
  try {
    const rows = sqliteJson(cfg.LEDGER_DB || path.join(os.homedir(), '.openclaw/ledger.db'), `
      SELECT provider, model, count(*) as messages,
        sum(input_tokens) as input, sum(output_tokens) as output,
        sum(cache_read_tokens) as cacheRead, sum(cache_write_tokens) as cacheWrite,
        round(sum(cost_total), 4) as cost
      FROM calls GROUP BY provider, model ORDER BY cost DESC
    `);
    const totals = { tokens: 0, cost: 0, messages: 0 };
    for (const r of rows) {
      totals.tokens += (r.input || 0) + (r.output || 0) + (r.cacheRead || 0) + (r.cacheWrite || 0);
      totals.cost += r.cost || 0;
      totals.messages += r.messages || 0;
    }
    jsonReply(res, 200, { totals, models: rows });
  } catch (e) { jsonReply(res, 200, { totals: {}, models: [], error: e.message }); }
}

function handleMetrics(_req, res) {
  const cpus = os.cpus();
  const loadAvg = os.loadavg();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  jsonReply(res, 200, {
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    cpu: { overall: Number(((loadAvg[0] / (cpus.length || 1)) * 100).toFixed(1)), count: cpus.length },
    memory: { pct: Number((((totalMem - freeMem) / totalMem) * 100).toFixed(1)), total: totalMem, used: totalMem - freeMem },
    uptime: { seconds: Math.floor(process.uptime()) },
    topProcesses: [],
  });
}

function register(router) {
  // ── Routes with NEW direct handlers (format differs from old) ─────
  router.add('GET', '/agents', (req, res) => handleAgents(req, res));
  router.add('GET', '/ops/channels', (req, res) => handleOpsChannels(req, res));
  router.add('GET', '/ops/alltime', (req, res) => handleOpsAlltime(req, res));
  router.add('GET', '/ops/models', (req, res) => handleOpsModels(req, res));
  router.add('GET', '/metrics', (req, res) => handleMetrics(req, res));

  // NOTE: All formerly-proxied routes are now handled by their dedicated providers
  // (sessions.js, system.js, watchdog.js, cron.js, ledger.js, config.js)
  // No proxy routes remain.

  // ── DGX Status (HTTP probe to Spark) ────────────────────────────────
  router.add('GET', '/ops/dgx-status', async (_req, res) => {
    const spark = require('./spark');
    const snapshot = spark.readSnapshot();
    const watchdog = spark.readWatchdogState();
    const gt = spark.readGroundTruth();
    const dgxBase = gt?.metricsUrl?.replace('/metrics', '') || 'http://192.168.1.152:8000';

    const nodeHttp = require('http');
    const fetchJson = (path, timeoutMs = 3000) => new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), timeoutMs);
      nodeHttp.get(`${dgxBase}${path}`, (r) => {
        let body = '';
        r.on('data', d => body += d);
        r.on('end', () => {
          clearTimeout(t);
          try { resolve(JSON.parse(body)); } catch { resolve(null); }
        });
      }).on('error', () => {
        clearTimeout(t);
        resolve(null);
      });
    });

    // Quick probe + richer runtime data
    const health = await fetchJson('/health', 3500);
    const props = await fetchJson('/props', 3500);
    const slots = await fetchJson('/slots', 3500);
    const models = await fetchJson('/v1/models', 3500);

    const online = health?.status === 'ok';

    // Use watchdog status as fallback for online determination
    const watchdogUp = watchdog?.status === 'up';
    const effectiveOnline = online || watchdogUp;

    const slotList = Array.isArray(slots) ? slots : [];
    const busySlots = slotList.filter(s => s?.is_processing);
    const activeTask = busySlots[0] ? {
      slotId: busySlots[0].id,
      taskId: busySlots[0].id_task || null,
      promptTokens: busySlots[0].n_prompt_tokens || null,
      generatedTokens: busySlots[0].n_decoded || null,
    } : null;
    const modelName =
      props?.model_path ||
      props?.model ||
      props?.model_name ||
      models?.data?.[0]?.id ||
      models?.models?.[0]?.name ||
      'local-dgx-spark (configured)';

    jsonReply(res, 200, {
      online: effectiveOnline,
      isSleeping: false,
      baseUrl: dgxBase,
      model: modelName ? { name: modelName } : null,
      activeTask,
      slots: {
        total: slotList.length,
        busy: busySlots.length,
        list: slotList,
      },
      snapshot: snapshot ? {
        gpu: snapshot.gpu,
        ram: snapshot.ram,
        llama: snapshot.llama,
        ts: snapshot.ts,
        ts_iso: snapshot.ts_iso,
      } : null,
      watchdog,
      fetchedAt: Date.now(),
    });
  });

  // ── Model Changelog (stub) ──────────────────────────────────────────
  router.add('GET', '/ops/model-changelog', (_req, res) => {
    jsonReply(res, 200, { entries: [], note: 'Model changelog not yet tracked in modular backend' });
  });

  // ── Security/Provider Audit (stub) ────────────────────────────────
  router.add('GET', '/ops/secaudit', (_req, res) => {
    try {
      const cronStore = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.openclaw/cron/jobs.json'), 'utf8'));
      const cronJobs = Array.isArray(cronStore?.jobs) ? cronStore.jobs.length : 0;
      const sessions = JSON.parse(fs.readFileSync(cfg.SESSIONS_FILE || path.join(os.homedir(), '.openclaw/agents/main/sessions/sessions.json'), 'utf8'));
      const sessionCount = Object.keys(sessions).length;
      jsonReply(res, 200, { cronJobs, sessions: sessionCount, timestamp: new Date().toISOString() });
    } catch (e) { jsonReply(res, 200, { cronJobs: 0, sessions: 0, error: e.message }); }
  });

  router.add('GET', '/ops/audit', (_req, res) => {
    jsonReply(res, 200, {
      openai: { status: 'no_key' },
      anthropic: { status: 'no_key' },
      google: { status: 'no_api', note: 'Google has no public usage API' },
      fetchedAt: Date.now(),
    });
  });

  // ── Memory files ──────────────────────────────────────────────────
  router.add('GET', '/memory', (req, res) => {
    const parsed = url.parse(req.url, true);
    const file = parsed.query?.file || '';
    if (!file || file.includes('/') || file.includes('..')) return errorReply(res, 400, 'Invalid file param');
    const memDir = path.join(os.homedir(), '.openclaw/workspace/memory');
    try {
      const content = fs.readFileSync(path.join(memDir, file), 'utf8');
      jsonReply(res, 200, JSON.parse(content));
    } catch (e) { errorReply(res, 404, `Cannot read memory file: ${e.message}`); }
  });

  // ── Vision stats (stub) ───────────────────────────────────────────
  router.add('GET', '/vision/stats', (_req, res) => {
    jsonReply(res, 200, { total: 0, byCategory: {}, note: 'Vision stats not available in modular backend yet' });
  });

  // ── Control ops are disabled in hardened mode ──────────────────────
  // Do not execute local binaries from this provider.
  router.add('POST', '/ops/restart', (req, res) => {
    errorReply(res, 403, 'Restart is disabled in hardened mode.');
  });

  router.add('POST', '/ops/doctor', (req, res) => {
    errorReply(res, 403, 'Doctor fix is disabled in hardened mode.');
  });

  // All other mutating routes removed — dashboard is read-only.
  // Removed: /ops/update-openclaw, /ops/session-model, /ops/cron-model, /backup, /backup/load
}

// Export the proxy function for the catch-all
module.exports = { register, proxyToOld, LEGACY_ROUTES };
