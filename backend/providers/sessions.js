'use strict';
/**
 * Sessions Provider — active sessions + sub-agents.
 * Reads: sessions.json, subagents/runs.json
 * Enriches with Ground Truth channel names.
 */
const fs = require('fs');
const cfg = require('../lib/config');
const { jsonReply } = require('../lib/http-helpers');
const { sqliteJson } = require('../lib/sqlite-helper');
const gt = require('./ground-truth');

function readSessions() {
  try {
    return JSON.parse(fs.readFileSync(cfg.SESSIONS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function readSubagentRuns() {
  try {
    return JSON.parse(fs.readFileSync(cfg.SUBAGENT_RUNS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function handleSessions(_req, res) {
  const raw = readSessions();
  const channelNames = gt.parse().channelNames;

  // Get today's date in PST
  const now = new Date();
  const pst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const todayDate = `${pst.getFullYear()}-${String(pst.getMonth()+1).padStart(2,'0')}-${String(pst.getDate()).padStart(2,'0')}`;

  // Fetch today's per-session stats from ledger
  let todayStats = {};
  try {
    const rows = sqliteJson(cfg.LEDGER_DB, `
      SELECT session_key, chat_id, channel, model,
        count(*) as messages,
        sum(input_tokens) as input_tokens,
        sum(output_tokens) as output_tokens,
        sum(cache_read_tokens + cache_write_tokens) as cache_tokens,
        sum(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) as totalTokens,
        round(sum(cost_total), 6) as cost
      FROM calls WHERE date(ts) >= '${todayDate}'
      GROUP BY session_key
    `);
    for (const r of rows) todayStats[r.session_key] = r;
  } catch {}

  const sessions = [];
  for (const [key, entry] of Object.entries(raw)) {
    const origin = entry.origin || {};
    const chatId = extractChatId(key, origin);
    const channel = origin.provider || origin.surface || 'unknown';
    const displayName = chatId ? (channelNames[chatId] || `#${chatId}`) : (entry.displayName || entry.groupChannel || key);
    const daysSinceUpdate = entry.updatedAt ? ((Date.now() - entry.updatedAt) / 86400000) : 99;

    // Match ledger stats by session_key pattern
    const ledger = todayStats[key] || findLedgerStats(todayStats, entry.sessionId);

    const todayCost = ledger?.cost || 0;
    const todayTokens = ledger?.totalTokens || 0;
    const todayMessages = ledger?.messages || 0;

    sessions.push({
      key,
      sessionId: entry.sessionId,
      chatType: entry.chatType || 'unknown',
      channel,
      chatId,
      channelId: chatId,
      channelName: chatId ? (channelNames[chatId] || null) : null,
      displayName,
      model: entry.model || 'unknown',
      thinkingLevel: entry.thinkingLevel || '—',
      status: todayMessages > 0 ? 'active' : (daysSinceUpdate < 1 ? 'idle' : 'stale'),
      updatedAt: entry.updatedAt,
      daysSinceUpdate: daysSinceUpdate.toFixed(1),
      allTime: { tokens: entry.totalTokens || 0 },
      today: {
        messages: todayMessages,
        totalTokens: todayTokens,
        cost: todayCost,
        effectiveMessages: todayMessages,
        noReplyRate: 0,
        topModels: ledger ? [{ model: ledger.model, tokens: todayTokens }] : [],
        models: {},
      },
      recentTopics: [],
      lastTo: entry.lastTo,
    });
  }

  // Sort: active first, then by today cost
  const statusOrder = { error: 0, active: 1, idle: 2, stale: 3 };
  sessions.sort((a, b) => (statusOrder[a.status] || 9) - (statusOrder[b.status] || 9) || b.today.cost - a.today.cost);

  // Build summary
  const active = sessions.filter(s => s.status === 'active').length;
  const todayCostTotal = sessions.reduce((s, r) => s + r.today.cost, 0);
  const todayMsgTotal = sessions.reduce((s, r) => s + r.today.messages, 0);

  jsonReply(res, 200, {
    sessions,
    alerts: [],
    summary: {
      total: sessions.length,
      active,
      errors: 0,
      todayCost: todayCostTotal,
      todayMessages: todayMsgTotal,
      topModel: '—',
    },
    cachedAt: Date.now(),
  });
}

function findLedgerStats(todayStats, sessionId) {
  if (!sessionId) return null;
  for (const [k, v] of Object.entries(todayStats)) {
    if (k.includes(sessionId)) return v;
  }
  return null;
}

function handleSubagents(_req, res) {
  const runs = readSubagentRuns();
  jsonReply(res, 200, { count: runs.length, runs });
}

function extractChatId(sessionKey, origin) {
  // Discord: "agent:main:discord:channel:1234567890"
  const m = sessionKey.match(/discord:channel:(\d+)/);
  if (m) return m[1];
  // From origin.to: "channel:1234567890"
  const to = origin.to || '';
  const m2 = to.match(/channel:(\d+)/);
  if (m2) return m2[1];
  return null;
}

function register(router) {
  router.add('GET', '/api/sessions',   (req, res) => handleSessions(req, res));
  router.add('GET', '/api/subagents',  (req, res) => handleSubagents(req, res));
  // Legacy compat
}

module.exports = { register, readSessions };
