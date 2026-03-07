'use strict';
/**
 * System Provider — disk, uptime, LaunchAgent status.
 */
const { execFileSync, execSync } = require('child_process');
const { jsonReply, bytesHuman, formatDuration } = require('../lib/http-helpers');

function getSystemInfo() {
  const info = {};

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
