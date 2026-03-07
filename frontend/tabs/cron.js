
/* Cron Tab — Cron Jobs, Run History, Cost Analysis */

async function loadCronEnhanced() {
  const panel = document.getElementById('panel-tasks');
  if (!panel) return;

  let jobsContainer = document.getElementById('cronJobsContainer');
  if (!jobsContainer) {
    jobsContainer = document.createElement('div');
    jobsContainer.id = 'cronJobsContainer';
    jobsContainer.style.marginBottom = '12px';
    panel.insertBefore(jobsContainer, panel.firstElementChild);
  }

  try {
    const data = await apiFetch('/ops/cron');
    const jobs = data.jobs || [];

    let html = `<div class="glass-card" style="padding:14px;margin-bottom:12px">
      <div class="card-title">Cron Jobs</div>
      <div class="card-sub">${tt(
        `${data.total} jobs · ${data.enabled} enabled · ${data.disabled} disabled`,
        `${data.total} 个任务 · ${data.enabled} 启用 · ${data.disabled} 停用`
      )}</div>
    </div>`;

    for (const j of jobs) {
      const statusDot = !j.enabled ? 'off' : (j.lastRun?.status === 'finished' ? 'ok' : (j.lastRun?.status ? 'fail' : 'ok'));
      const lastRunText = j.lastRun ? (() => {
        const ago = timeSince(j.lastRun.ts || Date.now());
        const dur = j.lastRun.durationMs ? (j.lastRun.durationMs / 1000).toFixed(0) + 's' : '';
        const tokens = j.lastRun.tokens ? fmtTokens(j.lastRun.tokens) : '';
        return [ago, dur, tokens, j.lastRun.model ? shortModel(j.lastRun.model) : ''].filter(Boolean).join(' · ');
      })() : tt('Never run', '尚未运行');

      html += `<div class="cron-card ${j.enabled ? '' : 'disabled'}">
        <div class="cron-header">
          <div>
            <div class="cron-name">${escHtml(j.name)}</div>
            <div class="cron-schedule">🕐 ${escHtml(j.schedule)}</div>
          </div>
          <span class="cron-status"><span class="dot ${statusDot}"></span>${j.enabled ? tt('Enabled', '启用') : tt('Disabled', '停用')}</span>
        </div>
        <div class="cron-desc">${escHtml(j.description)}</div>
        <div class="cron-footer">
          <span>📋 ${j.payloadKind || '—'}</span>
          <span>🧠 ${buildModelSelect(j.model || '', j.id, 'cron')}</span>
          <span>⏱ ${tt('Last', '上次')}: ${lastRunText}</span>
        </div>
      </div>`;
    }
    jobsContainer.innerHTML = html;
  } catch (e) {
    jobsContainer.innerHTML = `<div class="glass-card" style="padding:14px;margin-bottom:12px"><p>${escHtml(e.message)}</p></div>`;
  }
}

// ─── Ops Channel Usage Panel ───
const MODEL_COLORS = {};

// Normalize model string: lowercase + dots and hyphens unified → '-'
// Allows "claude-opus-4-6" to match key "opus-4.6", and "Qwen3.5-35B" to match "qwen3-5-35b"
function normModelStr(s) { return (s || '').toLowerCase().replace(/[.\-]/g, '-'); }

function getModelColor(model) {
  const mNorm = normModelStr(model);
  const key = Object.keys(MODEL_COLORS).find(k => mNorm.includes(normModelStr(k)));
  return key ? MODEL_COLORS[key] : '#6b7280';
}

function shortModel(m) {
  const raw = (m || '').replace(/-preview$/, '');
  if (!raw || raw === 'unknown') return 'unknown';
  const rawNorm = normModelStr(raw);
  const pair = MODEL_DISPLAY_NAMES.find(([pattern]) => rawNorm.includes(normModelStr(pattern)));
  return pair ? pair[1] : raw.replace(/^[^/]+\//, '').replace(/[-_]/g, ' ').replace(/\.gguf$/i, '').trim();
}

function fmtTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'k';
  return String(n);
}

function fmtUsd(n, digits = 2) {
  return '$' + (Number(n || 0)).toFixed(digits);
}


async function loadCronRuns() {
  const body = document.getElementById('cronRunsBody');
  const count = document.getElementById('cronRunsCount');
  if (!body) return;

  try {
    const data = await apiFetch('/cron/today');
    const runs = data.todayJobs || [];
    count.textContent = runs.length;

    if (runs.length === 0) {
      body.innerHTML = `<div style="padding:12px 18px;font-size:.8rem;color:var(--text2)">${tt('No Cron runs today', '今日暂无 Cron 执行记录')}</div>`;
      return;
    }

    // Sort by last run time descending
    runs.sort((a, b) => (b.last?.endedAt || b.last?.startedAt || 0) - (a.last?.endedAt || a.last?.startedAt || 0));

    body.innerHTML = runs.map(r => {
      const last = r.last || {};
      const name = r.name || r.id?.slice(0, 8) || '—';
      const status = last.status === 'ok' ? '✅' : last.status === 'error' ? '❌' : '⏳';
      const time = last.endedAt ? new Date(last.endedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Los_Angeles' }) : (last.startedAt ? new Date(last.startedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Los_Angeles' }) : '—');
      const dur = (last.endedAt && last.startedAt) ? ((last.endedAt - last.startedAt) / 1000).toFixed(1) + 's' : '';
      const model = last.model ? shortModel(last.model) : '';
      const tokens = Number.isFinite(last.tokens) ? (fmtTokens(last.tokens) + ' tok') : '';
      const cost = Number.isFinite(last.costUsd) ? fmtUsd(last.costUsd, 3) : '';
      const detail = [model, tokens, cost, dur].filter(Boolean).join(' · ');

      return `<div class="agent-session-row">
        <span style="font-size:.9rem">${status}</span>
        <span class="agent-session-key" style="flex:1;font-family:inherit;font-size:.78rem">${escHtml(name)}</span>
        <span class="agent-session-tokens">${escHtml(detail)}</span>
        <span class="agent-session-age">${time}</span>
      </div>`;
    }).join('');
  } catch (e) {
    body.innerHTML = `<div style="padding:12px 18px;font-size:.8rem;color:var(--text2)">${e.message}</div>`;
  }
}

function formatAge(minutes) {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

function toggleSessionsPanel() {
  // Panel toggle handled by CSS via collapsed class
}

async function spawnSingleTask(taskId) {
  try {
    await apiFetch(`/tasks/${taskId}/spawn`, { method: 'POST' });
    toast('Task spawned as sub-agent', 'success');
    loadTasks(true);
  } catch(e) {
    toast(`Spawn failed: ${e.message}`, 'error');
  }
}

// ─── Sessions Panel ───
// ─── Model names (single source of truth for display) ───
const MODEL_DISPLAY_NAMES = [];

// ─── Model Selector ───
let globalDefaultModel = 'claude-sonnet-4-6'; // updated dynamically from /ops/system

// Starts with hardcoded defaults; refreshed from /ops/models on load.
// To update model names/ids: edit models-registry.json on the server — no code change needed.
let MODEL_OPTIONS = [
  { value: 'default', label: '', full: null, isDefault: true },
  { value: 'opus',   label: 'Claude Opus 4',   full: 'claude-opus-4-6' },
  { value: 'sonnet', label: 'Claude Sonnet 4', full: 'claude-sonnet-4-6' },
  { value: 'flash',  label: 'Gemini 3 Flash',  full: 'gemini-3-flash-preview' },
  { value: 'pro',    label: 'Gemini 3 Pro',     full: 'gemini-3-pro-preview' },
  { value: 'codex',  label: 'GPT-5.3 Codex',   full: 'gpt-5.3-codex' },
];


function refreshModelOptions(registry) {
  if (!registry || typeof registry !== 'object') return;
  const opts = [{ value: 'default', label: '', full: null, isDefault: true }];
  for (const [alias, entry] of Object.entries(registry)) {
    const id = typeof entry === 'string' ? entry : entry?.id;
    const label = (typeof entry === 'object' && entry?.label) ? entry.label : alias;
    if (id) opts.push({ value: alias, label, full: id.includes('/') ? id.split('/').pop() : id });
  }
  MODEL_OPTIONS = opts;
}

function getDefaultModelLabel() {
  // Show actual model name instead of "默认"
  const m = globalDefaultModel || '';
  return shortModel(m) + ' ★';
}

function buildModelSelect(currentModel, id, type) {
  // type: 'session' (channelId) or 'cron' (jobId)
  const opts = MODEL_OPTIONS.map(o => {
    let label = o.isDefault ? getDefaultModelLabel() : o.label;
    const isCurrent = o.full ? currentModel.includes(o.full) : (!currentModel || currentModel === 'unknown');
    return `<option value="${o.value}" ${isCurrent ? 'selected' : ''}>${label}</option>`;
  }).join('');
  const color = getModelColor(currentModel);
  return `<select class="model-select" style="border-color:${color};color:${color}"
    ${DASHBOARD_CAPS.mutatingOpsEnabled ? '' : 'disabled title="Model changes disabled by server policy"'}
    onchange="changeModel('${type}','${id}',this.value,this)">${opts}</select>`;
}

async function changeModel(type, id, model, el) {
  el.disabled = true;
  el.style.opacity = '0.5';
  const endpoint = type === 'session' ? '/ops/session-model' : '/ops/cron-model';
  const body = type === 'session' ? { channelId: id, model } : { jobId: id, model };
  try {
    await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
    el.style.borderColor = 'var(--green)';
    el.style.color = 'var(--green)';
    setTimeout(() => {
      el.style.opacity = '1';
      if (type === 'session') loadSessions();
      else loadCronEnhanced();
    }, 800);
  } catch (e) {
    el.style.borderColor = '#f87171';
    el.style.color = '#f87171';
    el.disabled = false;
    el.style.opacity = '1';
    toast('Model switch failed: ' + e.message, 'error');
  }
}

const SESSION_SORT_DEFAULT_DIR = {
  model: 'asc',
  messages: 'desc',
  tokens: 'desc',
  cost: 'desc',
  costPerMsg: 'desc',
  fit: 'desc',
};

const sessionSortState = {
  key: null,
  dir: 'desc',
};

function toggleSessionSort(key) {
  if (sessionSortState.key === key) {
    sessionSortState.dir = sessionSortState.dir === 'asc' ? 'desc' : 'asc';
  } else {
    sessionSortState.key = key;
    sessionSortState.dir = SESSION_SORT_DEFAULT_DIR[key] || 'desc';
  }
  loadSessions();
}

function sessionSortIndicator(key) {
  if (sessionSortState.key !== key) return '&harr;';
  return sessionSortState.dir === 'asc' ? '&uarr;' : '&darr;';
}

function normalizeTaskTag(tag) {
  if (!tag) return '';
  if (isZh()) return tag;
  const map = {
    '🔧 深度开发': '🔧 Deep build',
    '🧠 架构讨论': '🧠 Architecture',
    '📊 汇报转发': '📊 Reporting',
    '💬 闲聊': '💬 Chat',
    '🔍 监控播报': '🔍 Monitoring',
    '💼 搜索整理': '💼 Job research',
    '🐦 内容创作': '🐦 Content',
    '📰 摘要生成': '📰 Summary',
    '📝 内容摘要': '📝 Summary',
    '👁️ 图片路由': '👁️ Image routing',
    '🎯 活动搜索': '🎯 Event search',
    '📅 规划': '📅 Planning',
    '👤 信息录入': '👤 Data entry',
    '🍷 品鉴记录': '🍷 Tasting log',
    '🚬 品鉴记录': '🚬 Tasting log',
    '🍵 品鉴记录': '🍵 Tasting log',
    '🌱 记录': '🌱 Logging',
    '📖 灵修提醒': '📖 Reflection reminder',
  };
  return map[tag] || tag.replace(/[\u4E00-\u9FFF]/g, '').replace(/\s+/g, ' ').trim();
}

let _sessionsHideStale = false; // global toggle: hide sessions with no activity for 7+ days


async function loadCronCosts() {
  const summaryEl = document.getElementById('cronCostSummary');
  const contentEl = document.getElementById('cronCostContent');
  const canvas = document.getElementById('cronTrendChart');
  const legendEl = document.getElementById('cronTrendLegend');
  if (!contentEl) return;

  try {
    const data = await apiFetch('/ops/cron-costs');
    const s = data.summary || {};
    const today = s.today || {};
    summaryEl.textContent = tt(
      `${s.totalRuns || 0} runs · total fixed ${fmtUsd(s.totalCronCost, 2)} (${fmtTokens(s.totalCronTokens || 0)} tokens) · avg daily fixed ${fmtUsd(s.avgDailyCronCost, 2)} · baseline fixed ${fmtUsd(s.avgFixedBaselineCost, 2)} / workload variable ${fmtUsd(s.avgWorkloadVariableCost, 2)} / interactive variable ${fmtUsd(s.avgInteractiveVariableCost, 2)} · today fixed ${fmtUsd(today.cronCost, 2)} (${fmtTokens(today.cronTokens || 0)}) · today variable ${fmtUsd(today.interactiveCost, 2)} · ${s.days || 0} days`,
      `累计 ${s.totalRuns || 0} 次执行 · 总固定成本 ${fmtUsd(s.totalCronCost, 2)}（${fmtTokens(s.totalCronTokens || 0)} tokens） · 日均固定成本 ${fmtUsd(s.avgDailyCronCost, 2)} · 基线固定 ${fmtUsd(s.avgFixedBaselineCost, 2)} / 任务量波动 ${fmtUsd(s.avgWorkloadVariableCost, 2)} / 交互波动 ${fmtUsd(s.avgInteractiveVariableCost, 2)} · 今日固定 ${fmtUsd(today.cronCost, 2)}（${fmtTokens(today.cronTokens || 0)}） · 今日浮动 ${fmtUsd(today.interactiveCost, 2)} · ${s.days || 0} 天`
    );

    // Per-job cost table (each run + each day)
    const jobs = data.jobs || [];
    const review = data.review || {};
    const rc = review.cron || {};
    const ri = review.interactive || {};
    const cov = review.coverage || {};
    let html = `<div class="glass-card" style="padding:10px;margin-bottom:10px">
      <div style="font-size:.8rem;font-weight:600;margin-bottom:6px">🔎 ${tt('Data quality review', '数据质量 Review')}</div>
      <div style="font-size:.74rem;color:var(--text2);display:flex;gap:14px;flex-wrap:wrap">
        <span>Cron finished: <b>${rc.finishedRuns || 0}</b></span>
        <span>${tt('No usage', '无 usage')}: <b style="color:${(rc.runsWithoutUsage || 0) > 0 ? '#fbbf24' : 'var(--green)'}">${rc.runsWithoutUsage || 0}</b></span>
        <span>${tt('Zero tokens', '零 tokens')}: <b style="color:${(rc.runsWithZeroTokens || 0) > 0 ? '#fbbf24' : 'var(--green)'}">${rc.runsWithZeroTokens || 0}</b></span>
        <span>${tt('Interactive coverage days', '交互覆盖天数')}: <b>${cov.daysWithInteractive || 0}/${cov.daysWithCron || 0}</b>（${cov.interactiveCoveragePct || 0}%）</span>
        <span>${tt('Interactive msgs with usage', '交互 usage消息')}: <b>${ri.messagesWithUsage || 0}</b></span>
      </div>
      ${(review.notes || []).length > 0 ? `<div style="margin-top:6px;font-size:.72rem;color:#fbbf24">${(review.notes || []).map(n => `• ${escHtml(n)}`).join('<br>')}</div>` : ''}
    </div>`;

    html += `<table class="sessions-table"><thead><tr><th>${tt('Cron job', 'Cron 任务')}</th><th>${tt('Runs', '总次数')}</th><th>${tt('Avg duration/run', '平均时长/次')}</th><th>Tokens/${tt('run', '次')}</th><th>$/ ${tt('run', '次')}</th><th>${tt('Today (tokens / $)', '今日（tokens / $）')}</th><th>${tt('Avg daily $', '日均 $')}</th><th>${tt('Total cost', '总花费')}</th></tr></thead><tbody>`;
    for (const j of jobs) {
      html += `<tr>
        <td style="font-weight:600;font-size:.78rem">
          ${escHtml(j.name)}
          <div style="margin-top:4px"><span class="sess-model" style="border-color:${getModelColor(j.model)};color:${getModelColor(j.model)}">${shortModel(j.model)}</span></div>
        </td>
        <td>${j.runs}</td>
        <td>${j.avgDurationSec ? `${j.avgDurationSec.toFixed(1)}s` : '—'}</td>
        <td>${fmtTokens(j.tokensPerRun || 0)}</td>
        <td style="color:${j.costPerRun > 0.2 ? '#fbbf24' : 'var(--green)'}">${fmtUsd(j.costPerRun, 3)}</td>
        <td>${fmtTokens(j.today?.tokens || 0)} / ${fmtUsd(j.today?.cost, 3)}</td>
        <td>${fmtUsd(j.avgDailyCost, 3)}</td>
        <td style="font-weight:600">${fmtUsd(j.totalCost, 2)}</td>
      </tr>`;
    }
    html += '</tbody></table>';

    // Daily breakdown per cron (last 7 days)
    if (jobs.length > 0) {
      html += '<div style="margin-top:12px;display:grid;gap:8px">';
      for (const j of jobs) {
        const daily = (j.daily || []).slice(-7).reverse();
        html += `<details class="glass-card" style="padding:10px">
          <summary style="cursor:pointer;font-size:.78rem;font-weight:600">${escHtml(j.name)} · 最近 ${daily.length} 天每日成本</summary>
          <div style="margin-top:8px;overflow:auto">
            <table class="sessions-table" style="font-size:.74rem">
              <thead><tr><th>日期</th><th>次数</th><th>Tokens</th><th>Tokens/次</th><th>$/次</th><th>当日总$</th></tr></thead>
              <tbody>
                ${daily.map(d => `<tr>
                  <td>${d.date}</td>
                  <td>${d.runs}</td>
                  <td>${fmtTokens(d.tokens || 0)}</td>
                  <td>${fmtTokens(d.tokensPerRun || 0)}</td>
                  <td>${fmtUsd(d.costPerRun, 3)}</td>
                  <td style="font-weight:600">${fmtUsd(d.cost, 3)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </details>`;
      }
      html += '</div>';
    }

    contentEl.innerHTML = html;

    // Trend chart: stacked bar (cron fixed + interactive variable)
    const trend = data.dailyTrend || [];
    if (canvas && trend.length > 1) {
      const ctx = canvas.getContext('2d');
      const W = canvas.parentElement.clientWidth - 32;
      const H = 160;
      canvas.width = W * 2; canvas.height = H * 2;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.scale(2, 2);

      const maxCost = Math.max(...trend.map(d => d.totalCost), 1);
      const barW = Math.min(40, (W - 40) / trend.length - 4);
      const startX = 36;
      const chartH = H - 30;

      ctx.clearRect(0, 0, W, H);

      // Y axis labels
      ctx.fillStyle = '#8b949e'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
      for (let i = 0; i <= 4; i++) {
        const y = 10 + chartH - (i / 4) * chartH;
        ctx.fillText('$' + (maxCost * i / 4).toFixed(0), 30, y + 3);
        ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(W, y); ctx.stroke();
      }

      trend.forEach((d, i) => {
        const x = startX + i * ((W - startX) / trend.length) + 2;
        const fixedH = ((d.fixedBaselineCost || 0) / maxCost) * chartH;
        const cronVarH = ((d.workloadVariableCost || 0) / maxCost) * chartH;
        const interH = (d.interactiveCost / maxCost) * chartH;
        const baseY = 10 + chartH;

        // Interactive variable — bottom
        ctx.fillStyle = 'rgba(124,92,252,0.6)';
        ctx.fillRect(x, baseY - interH, barW, interH);

        // Cron volume variable — middle
        ctx.fillStyle = 'rgba(251,191,36,0.75)';
        ctx.fillRect(x, baseY - interH - cronVarH, barW, cronVarH);

        // Cron fixed baseline — top
        ctx.fillStyle = 'rgba(45,212,160,0.8)';
        ctx.fillRect(x, baseY - interH - cronVarH - fixedH, barW, fixedH);

        // Date label
        ctx.fillStyle = '#8b949e'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(d.date.slice(5), x + barW / 2, baseY + 12);

        // Total label
        ctx.fillStyle = '#e6edf3'; ctx.font = 'bold 9px sans-serif';
        ctx.fillText('$' + d.totalCost.toFixed(2), x + barW / 2, baseY - interH - cronVarH - fixedH - 3);
      });

      const avgFixed = trend.reduce((sum, d) => sum + (d.fixedCostSharePct || 0), 0) / trend.length;
      legendEl.innerHTML = `<span style="color:#2dd4a0">■ 固定基线（Cron）</span><span style="color:#fbbf24">■ 任务量波动（Cron）</span><span style="color:#7c5cfc">■ 交互浮动成本</span><span style="color:#8b949e">固定占比均值 ${avgFixed.toFixed(0)}%</span>`;
    } else if (legendEl) {
      legendEl.textContent = '趋势数据不足（至少需要 2 天）';
    }
  } catch (e) {
    contentEl.innerHTML = `<p>${e.message}</p>`;
  }
}

