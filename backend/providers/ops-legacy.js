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
const OLD_SERVER_PORT = parseInt(process.env.DASHBOARD_LEGACY_PORT || '18790', 10);

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

// Routes that still need the old server
const LEGACY_ROUTES = [
  // Ops views
  '/ops/sessions',
  '/ops/channels',
  '/ops/alltime',
  '/ops/cron-costs',
  '/ops/audit',
  '/ops/secaudit',
  '/ops/dgx-status',
  '/ops/models',
  '/ops/session-model',
  '/ops/cron-model',
  '/ops/update-openclaw',
  '/ops/restart',
  '/ops/config',
  // Agent monitor
  '/agents',
  // Cron CRUD (old)
  '/cron',
  '/cron/status',
  // Others
  '/backup',
  '/backup/load',
  '/memory',
  '/metrics',
  '/vision/stats',
];

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
    const rows = sqliteJson(cfg.LEDGER_DB || path.join(os.homedir(), '.openclaw/ledger.db'), `
      SELECT channel, chat_id, count(*) as messages,
        sum(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) as totalTokens,
        round(sum(cost_total), 6) as cost
      FROM calls WHERE date(ts) >= date('now')
      GROUP BY channel, chat_id ORDER BY cost DESC
    `);
    jsonReply(res, 200, { channels: rows });
  } catch (e) { jsonReply(res, 200, { channels: [], error: e.message }); }
}

function handleOpsModels(_req, res) {
  // Build model registry from Ground Truth + hardcoded pricing
  const gt = require('./ground-truth');
  const models = gt.getModelRegistry();
  const registry = models.map(m => ({
    id: m.id, alias: m.alias, available: true,
  }));
  jsonReply(res, 200, { models: registry, source: 'ground-truth' });
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

    // Quick probe
    let online = false;
    const nodeHttp = require('http');
    try {
      online = await new Promise((resolve) => {
        const t = setTimeout(() => resolve(false), 4000);
        nodeHttp.get(`${dgxBase}/health`, (r) => {
          let body = '';
          r.on('data', d => body += d);
          r.on('end', () => { clearTimeout(t); try { resolve(JSON.parse(body)?.status === 'ok'); } catch { resolve(false); } });
        }).on('error', () => { clearTimeout(t); resolve(false); });
      });
    } catch {}

    jsonReply(res, 200, {
      online,
      baseUrl: dgxBase,
      snapshot: snapshot ? { gpu: snapshot.gpu, ram: snapshot.ram, llama: snapshot.llama } : null,
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

  // ── Mutating ops (require OPENCLAW_ENABLE_MUTATING_OPS=1) ─────────
  const { requireMutatingOps, readJsonBody } = require('../lib/http-helpers');

  router.add('POST', '/ops/restart', (req, res) => {
    if (!requireMutatingOps(req, res, 'ops restart')) return;
    const nodeHttp = require('http');
    const hookToken = process.env.OPENCLAW_HOOK_TOKEN || '';
    const postData = JSON.stringify({ action: 'restart', token: hookToken });
    const gwReq = nodeHttp.request({
      hostname: '127.0.0.1', port: 18789, path: '/hooks', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
      timeout: 10000,
    }, (gwRes) => {
      let body = '';
      gwRes.on('data', c => body += c);
      gwRes.on('end', () => {
        if (gwRes.statusCode < 300) return jsonReply(res, 200, { ok: true, message: 'Restart signal sent.' });
        errorReply(res, gwRes.statusCode || 502, body || 'Gateway error');
      });
    });
    gwReq.on('error', e => errorReply(res, 502, `Gateway unreachable: ${e.message}`));
    gwReq.write(postData);
    gwReq.end();
  });

  router.add('POST', '/ops/update-openclaw', (req, res) => {
    if (!requireMutatingOps(req, res, 'ops update-openclaw')) return;
    errorReply(res, 501, 'OpenClaw update must be triggered via CLI or cron. Use: openclaw update');
  });

  router.add('POST', '/ops/session-model', async (req, res) => {
    if (!requireMutatingOps(req, res, 'ops session-model')) return;
    errorReply(res, 501, 'Session model override not yet available in modular backend. Use /status in Discord.');
  });

  router.add('POST', '/ops/cron-model', async (req, res) => {
    if (!requireMutatingOps(req, res, 'ops cron-model')) return;
    errorReply(res, 501, 'Cron model override not yet available in modular backend.');
  });

  router.add('POST', '/backup', (req, res) => {
    if (!requireMutatingOps(req, res, 'backup')) return;
    const { execFileSync } = require('child_process');
    const ws = process.env.OPENCLAW_WORKSPACE || path.join(os.homedir(), '.openclaw/workspace');
    try {
      execFileSync('git', ['-C', ws, 'add', '-A'], { timeout: 20000 });
      execFileSync('git', ['-C', ws, 'commit', '-m', 'auto-backup', '--allow-empty'], { timeout: 20000 });
      const pushResult = execFileSync('git', ['-C', ws, 'push'], { encoding: 'utf8', timeout: 45000 });
      jsonReply(res, 200, { ok: true, output: pushResult });
    } catch (e) { errorReply(res, 500, e.message); }
  });

  router.add('POST', '/backup/load', (req, res) => {
    if (!requireMutatingOps(req, res, 'backup load')) return;
    errorReply(res, 501, 'Backup restore not yet available in modular backend.');
  });
}

// Export the proxy function for the catch-all
module.exports = { register, proxyToOld, LEGACY_ROUTES };
