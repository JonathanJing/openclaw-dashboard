'use strict';
/**
 * Watchdog Provider — gateway watchdog + spark watchdog.
 * Reads: watchdogs/gateway-discord/{state.json, events.jsonl}
 */
const fs = require('fs');
const path = require('path');
const cfg = require('../lib/config');
const { jsonReply } = require('../lib/http-helpers');

const WATCHDOG_STATE_FILE  = path.join(cfg.WATCHDOG_DIR, 'state.json');
const WATCHDOG_EVENTS_FILE = path.join(cfg.WATCHDOG_DIR, 'events.jsonl');

function readState() {
  try {
    return JSON.parse(fs.readFileSync(WATCHDOG_STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function readEvents(limit = 200) {
  try {
    const raw = fs.readFileSync(WATCHDOG_EVENTS_FILE, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const events = [];
    const start = Math.max(0, lines.length - limit);
    for (let i = start; i < lines.length; i++) {
      try { events.push(JSON.parse(lines[i])); } catch {}
    }
    return events;
  } catch {
    return [];
  }
}

function buildTimeline(eventsAsc, startMs, endMs, stepMs, initialStatus) {
  const steps = [];
  let currentStatus = initialStatus || 'unknown';
  for (let t = startMs; t <= endMs; t += stepMs) {
    // Find the latest event before this step
    for (const e of eventsAsc) {
      const ets = new Date(e.ts || e.timestamp).getTime();
      if (ets <= t) currentStatus = e.status || e.state || currentStatus;
    }
    steps.push({ ts: t, status: currentStatus });
  }
  return steps;
}

function handleWatchdog(req, res, query) {
  const hours = parseInt(query.hours || '24', 10);
  const state = readState();
  const events = readEvents(500);

  const now = Date.now();
  const startMs = now - (hours * 3600 * 1000);
  const stepMs = Math.max(60000, (hours * 3600 * 1000) / 288); // ~5min steps for 24h

  const eventsInRange = events.filter(e => {
    const ets = new Date(e.ts || e.timestamp).getTime();
    return ets >= startMs && ets <= now;
  });

  const timeline = buildTimeline(eventsInRange, startMs, now, stepMs, 'unknown');

  jsonReply(res, 200, {
    state,
    events: eventsInRange.slice(-50),
    timeline,
    hours,
  });
}

function register(router) {
  router.add('GET', '/api/watchdog', (req, res, q) => handleWatchdog(req, res, q));
  // Legacy compat
}

module.exports = { register, readState, readEvents };
