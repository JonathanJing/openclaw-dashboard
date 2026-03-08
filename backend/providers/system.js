'use strict';
/**
 * System Provider — disk, uptime, LaunchAgent status.
 */
const os = require('os');
const { execFileSync, execSync } = require('child_process');
const { jsonReply } = require('../lib/http-helpers');

function getSystemInfo() {
  const info = {
    hostname: os.hostname(),
    cpus: os.cpus().length,
    loadAvg: { '1m': os.loadavg()[0], '5m': os.loadavg()[1], '15m': os.loadavg()[2] },
    nodeVersion: process.version.replace(/^v/, ''),
    memory: {},
  };

  // macOS version/model
  try {
    info.macOS = execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8', timeout: 3000 }).trim();
  } catch {}
  try {
    info.macModel = execFileSync('sysctl', ['-n', 'hw.model'], { encoding: 'utf8', timeout: 3000 }).trim();
  } catch {}

  // App version
  try {
    info.clawVersion = execFileSync('openclaw', ['--version'], { encoding: 'utf8', timeout: 3000 }).trim().replace(/^v/, '');
  } catch {}
  if (!info.clawVersion) {
    try {
      info.clawVersion = JSON.parse(require('fs').readFileSync('/opt/homebrew/lib/node_modules/openclaw/package.json', 'utf8')).version;
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

  // Disk
  try {
    const df = execFileSync('df', ['-h', '/'], { encoding: 'utf8', timeout: 5000 });
    const lines = df.trim().split('\n');
    if (lines.length > 1) {
      const parts = lines[1].split(/\s+/);
      info.disk = {
        total: parts[1],
        used: parts[2],
        available: parts[3],
        percent: parts[4],
        usePct: parts[4],
      };
    }
  } catch {}

  // Uptime
  try {
    const up = execFileSync('uptime', [], { encoding: 'utf8', timeout: 5000 }).trim();
    info.uptime = up;
  } catch {}

  // macOS LaunchAgents
  try {
    const laList = execSync(
      'launchctl list 2>/dev/null | grep -E "com\\.jony\\.|com\\.openclaw\\."',
      { encoding: 'utf8', timeout: 5000 }
    );
    info.launchAgents = laList.trim().split('\n').filter(Boolean).map(line => {
      const [pid, exitCode, label] = line.split('\t');
      return {
        label: label || '',
        pid: pid === '-' ? null : parseInt(pid, 10),
        exitCode: exitCode === '-' ? null : parseInt(exitCode, 10),
        running: pid !== '-' && pid !== '0',
      };
    });
  } catch {
    info.launchAgents = [];
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
