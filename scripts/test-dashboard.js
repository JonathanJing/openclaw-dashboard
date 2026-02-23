#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'agent-dashboard.html');
const html = fs.readFileSync(file, 'utf8');

const checks = [
  { name: 'Title updated', ok: html.includes("Jony's Dashboard") },
  { name: 'OG title updated', ok: html.includes("Jony's OpenClaw Dashboard") },
  { name: 'Gateway WS set', ok: html.includes("const GATEWAY_WS = 'ws://127.0.0.1:18789'") },
  { name: 'Discord API entry', ok: html.includes("id: 'discord'") && html.includes("provider: 'Discord API'") },
  { name: 'Notion API entry', ok: html.includes("id: 'notion'") && html.includes("provider: 'Notion API'") },
  { name: 'Anthropic API entry', ok: html.includes("id: 'anthropic'") && html.includes("provider: 'Claude API'") },
  { name: 'OpenAI API entry', ok: html.includes("id: 'openai'") && html.includes("provider: 'OpenAI API'") },
  { name: 'Google API entry', ok: html.includes("id: 'google'") && html.includes("provider: 'Gemini API'") },
  { name: 'Brave Search entry', ok: html.includes("id: 'brave-search'") && html.includes("provider: 'Brave API'") },
  { name: 'X API entry', ok: html.includes("id: 'x-api'") && html.includes("provider: 'X (Twitter) API'") },
  { name: 'Bob-specific removed', ok: !html.toLowerCase().includes('bob') },
];

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? '✅' : '❌'} ${c.name}`);
}

if (failed) {
  console.error(`\n${failed} checks failed.`);
  process.exit(1);
}

console.log('\nAll checks passed.');
