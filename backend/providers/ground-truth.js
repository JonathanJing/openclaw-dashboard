'use strict';
/**
 * Ground Truth Provider
 * Parses MODEL_GROUND_TRUTH.md YAML blocks → channel map, cron map, model registry.
 * Single Source of Truth for "what channels exist", "what crons should run", etc.
 *
 * Re-reads file only when mtime changes (cached in memory).
 */
const fs = require('fs');
const cfg = require('../lib/config');

let _cache = null;
let _mtime = 0;

function parse() {
  const file = cfg.GROUND_TRUTH_FILE;
  try {
    const st = fs.statSync(file);
    if (st.mtimeMs === _mtime && _cache) return _cache;
    _mtime = st.mtimeMs;
  } catch {
    return _cache || { channels: {}, crons: [], models: [], channelNames: {} };
  }

  const raw = fs.readFileSync(file, 'utf8');

  // ── Parse channel mapping ─────────────────────────────────────────
  const channels = {};      // id → {name, file, type, notion_db}
  const channelNames = {};  // id → "#name"
  const chBlock = extractYamlBlock(raw, 'channels:');
  if (chBlock) {
    const re = /- id:\s*"(\d+)"\s*\n\s*name:\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(chBlock)) !== null) {
      const id = m[1];
      const name = m[2];
      channels[id] = { name, id };
      channelNames[id] = name;

      // Extract optional fields from the block following this match
      const after = chBlock.slice(m.index + m[0].length, chBlock.indexOf('\n  - id:', m.index + m[0].length));
      const typeM = after.match(/type:\s*(\w+)/);
      if (typeM) channels[id].type = typeM[1];
      const fileM = after.match(/file:\s*"([^"]+)"/);
      if (fileM) channels[id].file = fileM[1];
    }
  }

  // ── Parse cron jobs ───────────────────────────────────────────────
  const crons = [];
  const cronBlock = extractYamlBlock(raw, 'cron_jobs:');
  if (cronBlock) {
    const re = /- id:\s*(\S+)\s*\n\s*name:\s*(.+)/g;
    let m;
    while ((m = re.exec(cronBlock)) !== null) {
      const id = m[1];
      const name = m[2].trim();
      const after = cronBlock.slice(m.index, cronBlock.indexOf('\n  - id:', m.index + 1));
      const modelM = after.match(/model:\s*(.+)/);
      const schedM = after.match(/schedule:\s*"([^"]+)"/);
      const delivM = after.match(/delivery_to:\s*"(\d+)"/);
      crons.push({
        id,
        name,
        model: modelM ? modelM[1].trim() : null,
        schedule: schedM ? schedM[1] : null,
        delivery_to: delivM ? delivM[1] : null,
        delivery_channel_name: delivM ? (channelNames[delivM[1]] || null) : null,
      });
    }
  }

  // ── Parse model registry ──────────────────────────────────────────
  const models = [];
  const modelBlock = extractYamlBlock(raw, 'models:');
  if (modelBlock) {
    const re = /- id:\s*(.+)\s*\n\s*alias:\s*(\S+)/g;
    let m;
    while ((m = re.exec(modelBlock)) !== null) {
      models.push({ id: m[1].trim(), alias: m[2].trim() });
    }
  }

  _cache = { channels, crons, models, channelNames };
  console.log(`[ground-truth] loaded: ${Object.keys(channels).length} channels, ${crons.length} crons, ${models.length} models`);
  return _cache;
}

/**
 * Extract a YAML-ish block starting with `key` inside a ```yaml fenced block.
 */
function extractYamlBlock(text, key) {
  // Find the key inside any ```yaml block
  const blocks = text.match(/```yaml\n([\s\S]*?)```/g) || [];
  for (const block of blocks) {
    const inner = block.replace(/```yaml\n/, '').replace(/```$/, '');
    const idx = inner.indexOf(key);
    if (idx >= 0) {
      return inner.slice(idx);
    }
  }
  return null;
}

// ── Public API (used by other providers) ─────────────────────────────
function getChannelName(id) {
  const gt = parse();
  return gt.channelNames[id] || null;
}

function getChannelMap() {
  return parse().channels;
}

function getCronGroundTruth() {
  return parse().crons;
}

function getModelRegistry() {
  return parse().models;
}

// ── HTTP handler ─────────────────────────────────────────────────────
function register(router) {
  router.add('GET', '/api/ground-truth', (_req, res) => {
    const gt = parse();
    const { jsonReply } = require('../lib/http-helpers');
    jsonReply(res, 200, {
      channels: gt.channels,
      crons: gt.crons,
      models: gt.models,
    });
  });

  router.add('GET', '/api/ground-truth/channels', (_req, res) => {
    const { jsonReply } = require('../lib/http-helpers');
    jsonReply(res, 200, parse().channels);
  });
}

module.exports = {
  register,
  parse,
  getChannelName,
  getChannelMap,
  getCronGroundTruth,
  getModelRegistry,
};
