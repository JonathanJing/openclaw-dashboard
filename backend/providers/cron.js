'use strict';
/**
 * Cron Provider — reads cron/jobs.json + cron/runs/, enriches with Ground Truth + Ledger.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('../lib/config');
const { jsonReply } = require('../lib/http-helpers');
const { sqliteJson } = require('../lib/sqlite-helper');
const gt = require('./ground-truth');

function loadCronStore() {
  try {
    const raw = fs.readFileSync(cfg.CRON_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : (parsed.jobs || []);
  } catch {
    return [];
  }
}

function loadCronRuns(jobId, limit = 10) {
  const runsDir = path.join(cfg.CRON_RUNS_DIR, jobId);
  try {
    const files = fs.readdirSync(runsDir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);
    return files.map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(runsDir, f), 'utf8')); }
      catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function loadLastCronRun(jobId) {
  const runs = loadCronRuns(jobId, 1);
  return runs[0] || null;
}

function handleCronList(_req, res) {
  const jobs = loadCronStore();
  const channelNames = gt.parse().channelNames;

  const enriched = jobs.map(job => {
    const id = job.id || job.jobId;
    const lastRun = loadLastCronRun(id);
    const deliveryTo = job.delivery?.to;
    const chatId = deliveryTo ? (deliveryTo.match(/(\d{17,20})/) || [])[1] : null;

    return {
      id,
      name: job.name,
      enabled: job.enabled !== false,
      schedule: job.schedule,
      model: job.payload?.model || null,
      sessionTarget: job.sessionTarget,
      delivery: job.delivery,
      deliveryChatId: chatId,
      deliveryChannelName: chatId ? (channelNames[chatId] || null) : null,
      lastRun: lastRun ? {
        status: lastRun.status,
        startedAt: lastRun.startedAt,
        finishedAt: lastRun.finishedAt,
        durationMs: lastRun.durationMs,
        usage: lastRun.usage || null,
      } : null,
    };
  });

  jsonReply(res, 200, { count: enriched.length, jobs: enriched });
}

function handleCronRuns(req, res, query) {
  const jobId = query.jobId;
  if (!jobId) return jsonReply(res, 400, { error: 'jobId required' });
  const limit = parseInt(query.limit || '10', 10);
  const runs = loadCronRuns(jobId, limit);
  jsonReply(res, 200, { jobId, count: runs.length, runs });
}

function handleCronCosts(_req, res) {
  // Get cron session costs from ledger (source_kind = 'cron' in turns table)
  const rows = sqliteJson(cfg.LEDGER_DB, `
    SELECT session_key, model, provider,
      count(*) as calls,
      sum(input_tokens + output_tokens) as total_tokens,
      round(sum(cost_total), 6) as cost_total,
      min(ts) as first_call,
      max(ts) as last_call
    FROM calls
    WHERE session_key LIKE '%:cron:%'
    GROUP BY session_key
    ORDER BY cost_total DESC
    LIMIT 50
  `);

  // Extract cron job IDs from session keys
  for (const r of rows) {
    const m = r.session_key.match(/:cron:([a-f0-9-]+)/);
    r.cron_job_id = m ? m[1] : null;
  }

  jsonReply(res, 200, { rows });
}

function handleCronToday(_req, res) {
  const jobs = loadCronStore();
  const now = new Date();
  const todayStart = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  todayStart.setHours(0, 0, 0, 0);
  const channelNames = gt.parse().channelNames;

  const todayJobs = jobs.filter(j => j.enabled !== false).map(job => {
    const id = job.id || job.jobId;
    const lastRun = loadLastCronRun(id);
    const ranToday = lastRun && new Date(lastRun.startedAt || lastRun.finishedAt) >= todayStart;
    return {
      id,
      name: job.name,
      model: job.payload?.model || null,
      lastRun: lastRun ? {
        status: lastRun.status,
        startedAt: lastRun.startedAt,
        durationMs: lastRun.durationMs,
      } : null,
      ranToday,
    };
  });

  jsonReply(res, 200, { date: todayStart.toISOString().split('T')[0], jobs: todayJobs });
}

function register(router) {
  router.add('GET', '/api/cron',        (req, res) => handleCronList(req, res));
  router.add('GET', '/api/cron/runs',   (req, res, q) => handleCronRuns(req, res, q));
  router.add('GET', '/api/cron/costs',  (req, res) => handleCronCosts(req, res));
  router.add('GET', '/api/cron/today',  (req, res) => handleCronToday(req, res));

  // Legacy compat
  router.add('GET', '/ops/cron',        (req, res) => handleCronList(req, res));
  router.add('GET', '/ops/cron-costs',  (req, res) => handleCronCosts(req, res));
  router.add('GET', '/cron/today',      (req, res) => handleCronToday(req, res));
}

module.exports = { register };
