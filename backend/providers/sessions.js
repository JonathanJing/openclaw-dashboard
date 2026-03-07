'use strict';
/**
 * Sessions Provider — active sessions + sub-agents.
 * Reads: sessions.json, subagents/runs.json
 * Enriches with Ground Truth channel names.
 */
const fs = require('fs');
const cfg = require('../lib/config');
const { jsonReply } = require('../lib/http-helpers');
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
  const sessions = [];

  for (const [key, entry] of Object.entries(raw)) {
    const origin = entry.origin || {};
    const chatId = extractChatId(key, origin);
    sessions.push({
      key,
      sessionId: entry.sessionId,
      chatType: entry.chatType || 'unknown',
      channel: origin.provider || origin.surface || 'unknown',
      chatId,
      channelName: chatId ? (channelNames[chatId] || null) : null,
      updatedAt: entry.updatedAt,
      lastTo: entry.lastTo,
    });
  }

  // Sort by updatedAt desc
  sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  jsonReply(res, 200, { count: sessions.length, sessions });
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
  router.add('GET', '/ops/sessions',   (req, res) => handleSessions(req, res));
}

module.exports = { register, readSessions };
