'use strict';
/**
 * System Provider — disk, uptime, LaunchAgent status.
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const cfg = require('../lib/config');
const { jsonReply } = require('../lib/http-helpers');

function getSystemInfo() {
  const info = {
    hostname: os.hostname(),
    cpus: os.cpus().length,
    loadAvg: { '1m': os.loadavg()[0], '5m': os.loadavg()[1], '15m': os.loadavg()[2] },
    nodeVersion: process.version.replace(/^v/, ''),
    memory: {},
  };

  // Keep system probing shell-free in hardened mode.
  try { info.platform = `${os.platform()} ${os.release()}`; } catch {}
  try { info.arch = os.arch(); } catch {}

  // App version
  try {
    info.clawVersion = JSON.parse(fs.readFileSync('/opt/homebrew/lib/node_modules/openclaw/package.json', 'utf8')).version;
  } catch {}
  if (!info.clawVersion) {
    try {
      info.clawVersion = JSON.parse(fs.readFileSync(path.join(cfg.DOT_OPENCLAW, 'package.json'), 'utf8')).version;
    } catch {}
  }

  // Memory
  try {
    const total = os.totalmem();
    const free = os.freemem();
    const usedPct = ((total - free) / total) * 100;
    info.memory = {
      total,
      free,
      used: total - free,
      usePct: Number(usedPct.toFixed(1)),
    };
  } catch {}

  // Disk and LaunchAgent probing disabled without shell access.
  info.disk = { unavailable: true, reason: 'disabled in hardened mode' };
  info.launchAgents = [];

  // Uptime
  try {
    const uptimeSeconds = Math.floor(os.uptime());
    info.uptime = `${uptimeSeconds}s`;
  } catch {}

  // Default model from openclaw.json
  try {
    const ocConfig = JSON.parse(fs.readFileSync(cfg.OPENCLAW_CONFIG_FILE, 'utf8'));
    const primary = ocConfig?.agents?.defaults?.model?.primary;
    const fallbacks = ocConfig?.agents?.defaults?.model?.fallbacks;
    if (primary) {
      info.models = {
        primary,
        fallbacks: fallbacks || [],
      };
    }
  } catch {
    // Ignore config read errors
  }

  return info;
}

function register(router) {
  router.add('GET', '/api/system', (_req, res) => {
    jsonReply(res, 200, getSystemInfo());
  });
  // Legacy compat
  router.add('GET', '/ops/system', (_req, res) => {
    jsonReply(res, 200, getSystemInfo());
  });
}

module.exports = { register, getSystemInfo };
