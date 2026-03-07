'use strict';
/**
 * Ledger Provider — reads from ledger.db (SQLite).
 * Provides: today summary, history trends, per-channel breakdown, drift detection.
 */
const cfg = require('../lib/config');
const { sqliteJson } = require('../lib/sqlite-helper');
const { jsonReply } = require('../lib/http-helpers');
const gt = require('./ground-truth');

function getTodayPstStartIso() {
  const now = new Date();
  const pst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  pst.setHours(0, 0, 0, 0);
  // Convert back to UTC ISO
  const offset = now.getTime() - pst.getTime();
  const utcStart = new Date(now.getTime() - (now.getTime() - pst.getTime()) + (pst.getTimezoneOffset() * 60000));
  // Simpler: use date string
  const y = pst.getFullYear();
  const m = String(pst.getMonth() + 1).padStart(2, '0');
  const d = String(pst.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function handleToday(_req, res) {
  const todayDate = getTodayPstStartIso();
  const rows = sqliteJson(cfg.LEDGER_DB, `
    SELECT provider, model, channel, chat_id,
      count(*) as calls,
      sum(input_tokens) as input_tokens,
      sum(output_tokens) as output_tokens,
      sum(cache_read_tokens) as cache_read_tokens,
      sum(cache_write_tokens) as cache_write_tokens,
      round(sum(cost_total), 6) as cost_total
    FROM calls
    WHERE date(ts) >= '${todayDate}'
    GROUP BY provider, model, channel, chat_id
    ORDER BY cost_total DESC
  `);

  // Enrich with channel names from Ground Truth
  const channelNames = gt.parse().channelNames;
  for (const r of rows) {
    r.channel_name = channelNames[r.chat_id] || r.channel || null;
  }

  // Compute totals
  let totalCost = 0, totalTokens = 0, totalCalls = 0;
  for (const r of rows) {
    totalCost += r.cost_total || 0;
    totalTokens += (r.input_tokens || 0) + (r.output_tokens || 0)
      + (r.cache_read_tokens || 0) + (r.cache_write_tokens || 0);
    totalCalls += r.calls || 0;
  }

  jsonReply(res, 200, {
    date: todayDate,
    total_cost: Math.round(totalCost * 10000) / 10000,
    total_tokens: totalTokens,
    total_calls: totalCalls,
    by_model: rows,
  });
}

function handleHistory(req, res, query) {
  const days = parseInt(query.days || '30', 10);
  const rows = sqliteJson(cfg.LEDGER_DB, `
    SELECT date(ts) as day, provider, model,
      count(*) as calls,
      sum(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) as total_tokens,
      round(sum(cost_total), 6) as cost_total
    FROM calls
    WHERE ts >= date('now', '-${days} days')
    GROUP BY day, provider, model
    ORDER BY day ASC, cost_total DESC
  `);
  jsonReply(res, 200, { days, rows });
}

function handleByChannel(req, res, query) {
  const days = parseInt(query.days || '7', 10);
  const channelNames = gt.parse().channelNames;
  const rows = sqliteJson(cfg.LEDGER_DB, `
    SELECT chat_id, channel,
      count(*) as calls,
      sum(input_tokens + output_tokens) as total_tokens,
      round(sum(cost_total), 6) as cost_total
    FROM calls
    WHERE ts >= date('now', '-${days} days') AND chat_id IS NOT NULL
    GROUP BY chat_id
    ORDER BY cost_total DESC
  `);
  for (const r of rows) {
    r.channel_name = channelNames[r.chat_id] || r.channel || null;
  }
  jsonReply(res, 200, { days, rows });
}

function handleDrift(req, res, query) {
  const days = parseInt(query.days || '30', 10);
  const provider = query.provider || 'anthropic';
  const rows = sqliteJson(cfg.LEDGER_DB, `
    SELECT date(ts) as day,
      sum(input_tokens) as ledger_input,
      sum(output_tokens) as ledger_output,
      round(sum(cost_total), 6) as ledger_cost
    FROM calls
    WHERE provider = '${provider}' AND ts >= date('now', '-${days} days')
    GROUP BY day ORDER BY day
  `);
  jsonReply(res, 200, { provider, days, rows });
}

function register(router) {
  router.add('GET', '/api/ledger/today',      (req, res) => handleToday(req, res));
  router.add('GET', '/api/ledger/history',     (req, res, q) => handleHistory(req, res, q));
  router.add('GET', '/api/ledger/by-channel',  (req, res, q) => handleByChannel(req, res, q));
  router.add('GET', '/api/ledger/drift',       (req, res, q) => handleDrift(req, res, q));

  // Legacy compatibility routes (old frontend uses these)
  router.add('GET', '/ops/ledger/today',    (req, res) => handleToday(req, res));
  router.add('GET', '/ops/ledger/history',  (req, res, q) => handleHistory(req, res, q));
  router.add('GET', '/ops/ledger/drift',    (req, res, q) => handleDrift(req, res, q));
}

module.exports = { register };
