/* ═══════════════════════════════════════════════
   Agent Dashboard — Vanilla JS
   ═══════════════════════════════════════════════ */

// ─── Auth ───
// Token is read once from URL param (e.g. ?token=xxx) then stripped from the address bar.
// All API calls send it via Authorization header — never in URL query strings.
function getToken() {
  const p = new URLSearchParams(location.search).get('token');
  if (p) {
    // Strip token from URL to avoid leaking in Referer / logs / browser history
    const clean = new URL(location.href);
    clean.searchParams.delete('token');
    history.replaceState(null, '', clean.pathname + clean.search + clean.hash);
    return p;
  }
  return '';
}
const TOKEN = getToken();
const API = (['18789', '18791', '18792', '18793', '18799', ''].includes(location.port))
  ? ''
  : 'http://127.0.0.1:18789';
const LANG_KEY = 'openclaw.dashboard.lang';
let currentLang = localStorage.getItem(LANG_KEY) || 'en';
if (currentLang !== 'en' && currentLang !== 'zh') currentLang = 'en';

function isZh() { return currentLang === 'zh'; }
function tt(en, zh) { return isZh() ? zh : en; }
function currentLocale() { return isZh() ? 'zh-CN' : 'en-US'; }

function applyLanguageUI() {
  const html = document.documentElement;
  if (html) html.lang = isZh() ? 'zh' : 'en';

  const btn = document.getElementById('langToggleBtn');
  const label = document.getElementById('langToggleLabel');
  if (btn) {
    btn.classList.add('active');
    btn.title = tt('Switch language', '切换语言');
  }
  if (label) label.textContent = isZh() ? '中文' : 'EN';

  const openOpsBtn = document.getElementById('openOpsBtn');
  if (openOpsBtn) openOpsBtn.textContent = tt('Open Health', '打开健康面板');

  const tabOverviewLabel = document.getElementById('tabOverviewLabel');
  if (tabOverviewLabel) tabOverviewLabel.textContent = tt('Overview', '总览');
  const tabCostLabel = document.getElementById('tabCostLabel');
  if (tabCostLabel) tabCostLabel.textContent = tt('Cost', '成本');
  const tabCronLabel = document.getElementById('tabCronLabel');
  if (tabCronLabel) tabCronLabel.textContent = tt('Cron', '定时任务');
  const tabHealthLabel = document.getElementById('tabHealthLabel');
  if (tabHealthLabel) tabHealthLabel.textContent = tt('Health', '健康');
  const tabConfigLabel = document.getElementById('tabConfigLabel');
  if (tabConfigLabel) tabConfigLabel.textContent = tt('Config', '配置');

  const cronRunsTitle = document.getElementById('cronRunsTitleText');
  if (cronRunsTitle) cronRunsTitle.textContent = tt("Today's Cron Runs", '今日 Cron 执行记录');

  const wdStatus = document.getElementById('watchdogStatusText');
  if (wdStatus && !wdStatus.dataset.liveRendered) wdStatus.textContent = tt('Loading watchdog status...', '正在加载看门狗状态...');

  const cronCostTitle = document.getElementById('cronCostTitle');
  if (cronCostTitle) cronCostTitle.textContent = tt('💰 Cron Cost Analysis', '💰 Cron 成本分析');
  const cronTrendTitle = document.getElementById('cronTrendTitle');
  if (cronTrendTitle) cronTrendTitle.textContent = tt('📈 Fixed vs Variable Cost Trend', '📈 固定成本 vs 浮动成本趋势');
  const cronTrendSub = document.getElementById('cronTrendSub');
  if (cronTrendSub) cronTrendSub.textContent = tt(
    'Cron (fixed) = scheduled jobs · Interactive (variable) = manually triggered chats',
    'Cron（固定）= 每日自动任务 · 交互（浮动）= 人工触发的对话'
  );

  const sentinelLabel = document.getElementById('sentinelLabel');
  if (sentinelLabel) sentinelLabel.textContent = tt('Sentinel', '系统哨兵');

  // Default model label is now dynamic (set by loadSystemInfo)
}

function toggleLanguage() {
  currentLang = isZh() ? 'en' : 'zh';
  localStorage.setItem(LANG_KEY, currentLang);
  applyLanguageUI();
  if (_watchdogCache) renderWatchdogStatus(_watchdogCache);
  loadSessions();
  loadCronEnhanced();
  loadCronCosts();
}

async function apiFetch(path, opts = {}) {
  if (window._forceNoCache) {
    path += (path.includes('?') ? '&' : '?') + 'nocache=1';
  }
  const url = `${API}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) {
      const data = await res.json().catch(() => ({}));
      const msg = data?.error || data?.message || res.statusText;
      throw new Error(msg);
    }
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) return res.json();
  return res.text();
}

const DASHBOARD_CAPS = {
  mutatingOpsEnabled: false,
  mutatingOpsLoopbackOnly: true,
  attachmentFilePathCopyEnabled: false,
};

function applyCapabilitiesUI() {
  const mutatingEnabled = !!DASHBOARD_CAPS.mutatingOpsEnabled;
  ['btnBackup', 'btnRestore', 'btnUpdateOpenClaw'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = mutatingEnabled ? '' : 'none';
  });
  document.querySelectorAll('.model-select').forEach((el) => {
    el.disabled = !mutatingEnabled;
    el.title = mutatingEnabled ? '' : 'Model changes disabled by server policy';
  });
}

async function refreshCapabilities() {
  try {
    const data = await apiFetch('/ops/config');
    const caps = data?.capabilities || {};
    DASHBOARD_CAPS.mutatingOpsEnabled = !!caps.mutatingOpsEnabled;
    DASHBOARD_CAPS.mutatingOpsLoopbackOnly = caps.mutatingOpsLoopbackOnly !== false;
    DASHBOARD_CAPS.attachmentFilePathCopyEnabled = !!caps.attachmentFilePathCopyEnabled;
  } catch {
    DASHBOARD_CAPS.mutatingOpsEnabled = false;
    DASHBOARD_CAPS.attachmentFilePathCopyEnabled = false;
  }
  applyCapabilitiesUI();
}

// ─── Connection Check ───
async function checkConnection() {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  try {
    await apiFetch('/health');
    dot.className = 'status-dot ok';
    txt.textContent = 'Connected';
  } catch(e) {
    dot.className = 'status-dot err';
    txt.textContent = 'Disconnected';
  }
}

// ─── Tabs ───
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'overview') { loadSessions(); loadTasks(true); }
    if (btn.dataset.tab === 'tasks') { loadCronEnhanced(); loadCronCosts(); }
    if (btn.dataset.tab === 'ops') { loadOpsChannels(); loadOpsAlltime(); loadOpsAudit(); }
    if (btn.dataset.tab === 'health') { loadOperationsStatus(); loadQuality(); loadAudit(); loadDgxStatus(); }
    if (btn.dataset.tab === 'config') { loadConfig(); loadFileList(); }
  });
});

let _watchdogCache = null;

function focusHealthTab() {
  const btn = document.querySelector('.tab-btn[data-tab="health"]');
  if (btn) btn.click();
}

async function pollWatchdogStatus() {
  try {
    const data = await apiFetch('/ops/watchdog?limit=200&windowMinutes=1440');
    _watchdogCache = data;
    renderWatchdogStatus(data);
  } catch (e) {
    renderWatchdogStatus({
      effectiveStatus: 'unknown',
      runtime: { running: false, checkedAt: new Date().toISOString() },
      watchdog: null, recentEvents: [], timeline: { points: [] },
      error: e.message,
    });
  }
}

function wdParseMs(v) {
  const t = Date.parse(v || '');
  return Number.isFinite(t) ? t : NaN;
}

function wdFmtClock(tsMs) {
  if (!Number.isFinite(tsMs)) return tt('Unknown time', '未知时间');
  return new Date(tsMs).toLocaleTimeString(currentLocale(), { timeZone: 'America/Los_Angeles', hour12: false });
}

function wdFmtDateTime(tsMs) {
  if (!Number.isFinite(tsMs)) return tt('Unknown time', '未知时间');
  return new Date(tsMs).toLocaleString(currentLocale(), {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

// Group raw events into incidents (alert → suppressed... → recovered = one incident)
function wdGroupIncidents(events) {
  const sorted = [...events].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  const incidents = [];
  const sysEvents = [];
  let cur = null;
  for (const ev of sorted) {
    if (ev.event === 'baseline_updated' || ev.event === 'baseline_promotion_pending') {
      sysEvents.push(ev); continue;
    }
    if (ev.event === 'alert') {
      if (!cur) {
        cur = { start: ev.time, reason: ev.reason, severity: ev.severity, suppressed: 0, end: null };
        incidents.push(cur);
      } else {
        cur.suppressed++;
      }
    } else if (ev.event === 'suppressed') {
      if (cur) cur.suppressed++;
    } else if (ev.event === 'recovered') {
      if (cur) { cur.end = ev.time; cur = null; }
    }
  }
  return { incidents: incidents.slice(-7).reverse(), sysEvents };
}

function wdFmtDuration(seconds) {
  let s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (sec || !parts.length) parts.push(`${sec}s`);
  return parts.join(' ');
}

function wdFmtAgo(tsMs) {
  if (!Number.isFinite(tsMs)) return tt('unknown', '未知');
  const diffSec = Math.floor((Date.now() - tsMs) / 1000);
  if (diffSec < 0) return tt('just now', '刚刚');
  return tt(`${wdFmtDuration(diffSec)} ago`, `${wdFmtDuration(diffSec)}前`);
}

function wdStatusZh(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'healthy') return tt('healthy', '健康');
  if (s === 'down') return tt('down', '断连');
  if (s === 'degraded') return tt('degraded', '降级');
  if (s === 'critical') return tt('critical', '严重');
  if (s === 'warning' || s === 'warn') return tt('warning', '告警');
  return tt('unknown', '未知');
}

function wdReasonZh(reason) {
  const r = String(reason || '').toLowerCase();
  const map = {
    recovered: tt('recovered', '已恢复'),
    runtime_stopped: tt('runtime stopped', '运行时停止'),
    rpc_probe_failed: tt('RPC probe failed', 'RPC 探活失败'),
    health_unreachable: tt('health check unreachable', '健康检查不可达'),
    config_invalid: tt('invalid config', '配置无效'),
    config_rewritten: tt('config overwritten', '配置被改写'),
    auth_mismatch: tt('auth mismatch', '鉴权不匹配'),
    gateway_check_failed: tt('gateway check failed', '网关检查失败'),
    none: tt('none', '无'),
    unknown: tt('unknown', '未知'),
  };
  return map[r] || String(reason || tt('unknown', '未知'));
}

function renderWatchdogUptimeBar(tl, containerEl) {
  if (!containerEl) return;
  const pts = Array.isArray(tl?.points) ? tl.points : [];
  if (!pts.length) {
    containerEl.innerHTML = `<div class="ops-ch-meta">${tt('No timeline data.', '无时间线数据。')}</div>`;
    return;
  }
  const total = pts.length;
  const downCount  = pts.filter(p => p.status === 'down').length;
  const degraded   = pts.filter(p => p.status === 'degraded').length;
  const healthy    = total - downCount - degraded;
  const uptimePct  = ((healthy / total) * 100).toFixed(1);
  const COLOR = { healthy: '#3fb950', degraded: '#d29922', down: '#f85149', null: '#30363d' };
  const bars = pts.map(p => {
    const c = COLOR[p.status] || COLOR.null;
    const label = (p.ts ? wdFmtClock(Date.parse(p.ts)) + ' · ' : '') + (p.status || '?');
    return `<div title="${escHtml(label)}" style="flex:1;min-width:3px;height:20px;background:${c};border-radius:2px"></div>`;
  }).join('');
  containerEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">
      <span style="font-size:.72rem;color:var(--text2)">${tt('24h uptime', '24小时可用率')}</span>
      <span style="font-size:.8rem;font-weight:600;color:${downCount > 0 ? 'var(--yellow)' : 'var(--green)'}">${uptimePct}%</span>
    </div>
    <div style="display:flex;gap:2px;width:100%">${bars}</div>
    <div style="display:flex;justify-content:space-between;margin-top:3px;font-size:.62rem;color:var(--text2)">
      <span>24h ago</span>
      <span style="color:${downCount?'var(--red)':degraded?'var(--yellow)':'var(--text2)'}">
        ${downCount ? `${downCount} down · ` : ''}${degraded ? `${degraded} degraded · ` : ''}${healthy} healthy
      </span>
      <span>now</span>
    </div>`;
}

function renderWatchdogStatus(data) {
  const statusEl  = document.getElementById('watchdogStatusText');
  const metaEl    = document.getElementById('watchdogStatusMeta');
  const eventsEl  = document.getElementById('watchdogEventsList');
  const tlEl      = document.getElementById('watchdogTimeline');
  const globalAlert = document.getElementById('watchdogGlobalAlert');
  const globalText  = document.getElementById('watchdogGlobalText');
  if (!statusEl) return;

  const effective  = data?.effectiveStatus || 'unknown';
  const running    = !!data?.runtime?.running;
  const wd         = data?.watchdog || {};
  const cfg        = data?.configGuard || {};
  const failures   = wd?.consecutive_failures ?? 0;
  const reason     = wd?.last_reason || 'none';
  const lastAlertMs    = Number.isFinite(Number(wd?.last_alert_at))    ? Number(wd.last_alert_at)    * 1000 : NaN;
  const lastRecovMs    = Number.isFinite(Number(wd?.last_recovered_at)) ? Number(wd.last_recovered_at) * 1000 : NaN;
  const checkedAt      = data?.runtime?.checkedAt || wd?.updated_at || '';
  const events     = Array.isArray(data?.recentEvents) ? data.recentEvents : [];
  const tl         = data?.timeline || { points: [] };

  // ── Global down banner ──
  const isDown = effective === 'down' || !running;
  if (globalAlert) {
    if (isDown) {
      const downFor = Number.isFinite(lastAlertMs) ? wdFmtDuration(Math.floor((Date.now() - lastAlertMs) / 1000)) : '?';
      globalAlert.style.display = 'block';
      if (globalText) globalText.textContent = `OpenClaw 已断连 ${downFor} · 原因: ${wdReasonZh(reason)}`;
    } else {
      globalAlert.style.display = 'none';
    }
  }

  // ── Status line ──
  const DOT  = { healthy: '🟢', down: '🔴', degraded: '🟡' };
  const COL  = { healthy: 'var(--green)', down: 'var(--red)', degraded: 'var(--yellow)' };
  const dot  = DOT[effective] || '⚪';
  const col  = COL[effective] || 'var(--text2)';

  let lastIncident = '';
  if (Number.isFinite(lastAlertMs) && Number.isFinite(lastRecovMs) && lastRecovMs >= lastAlertMs) {
    const outageSec = Math.floor((lastRecovMs - lastAlertMs) / 1000);
    lastIncident = ` · <span style="font-size:.72rem;color:var(--text2)">上次断连 <strong>${wdFmtDuration(outageSec)}</strong>，${wdFmtAgo(lastRecovMs)}恢复</span>`;
  } else if (Number.isFinite(lastAlertMs) && isDown) {
    const downFor = wdFmtDuration(Math.floor((Date.now() - lastAlertMs) / 1000));
    lastIncident = ` · <span style="color:var(--red);font-size:.72rem">已断连 <strong>${downFor}</strong></span>`;
  }

  statusEl.innerHTML = `<span style="color:${col};font-size:.88rem"><strong>${dot} ${wdStatusZh(effective)}</strong></span>`
    + (failures > 0 ? ` · <span style="color:var(--red);font-size:.72rem">连续失败 ${failures}</span>` : '')
    + lastIncident
    + (checkedAt ? ` · <span style="font-size:.68rem;color:var(--text2)">检查于 ${wdFmtAgo(Date.parse(checkedAt))}</span>` : '');
  statusEl.dataset.liveRendered = '1';

  // ── Update Overview Card ──
  const ovValue = document.getElementById('sentinelValue');
  const ovBadge = document.getElementById('sentinelBadge');
  const ovDetail = document.getElementById('sentinelDetail');
  if (ovValue) {
    ovValue.textContent = wdStatusZh(effective);
    ovValue.style.color = col;
    ovBadge.className = `agent-stat-badge ${effective === 'healthy' ? 'active' : 'idle'}`;
    ovBadge.innerHTML = effective === 'healthy' ? '<span class="pulse-dot"></span> healthy' : 'degraded';
    if (effective === 'down') {
      ovBadge.className = 'agent-stat-badge error';
      ovBadge.innerHTML = 'down';
    }
    ovDetail.textContent = checkedAt ? tt('Checked ', '检查于 ') + wdFmtAgo(Date.parse(checkedAt)) : '—';
  }

  // ── Config guard meta ──
  if (metaEl) {
    const drift = cfg.driftDetected;
    const driftBadge = drift
      ? `<span style="color:var(--yellow)">⚠️ 配置漂移</span>`
      : `<span style="color:var(--green)">✓ 配置一致</span>`;
    metaEl.innerHTML = `${driftBadge} · <span style="color:var(--text2);font-size:.7rem">来源: ${escHtml(wd.source || '—')} · 原因: ${escHtml(wdReasonZh(reason))}</span>`;
  }

  // ── 24h uptime bar ──
  renderWatchdogUptimeBar(tl, tlEl);

  // ── Incidents ──
  if (!eventsEl) return;
  const { incidents, sysEvents } = wdGroupIncidents(events);

  if (!incidents.length && !sysEvents.length) {
    eventsEl.innerHTML = `<div class="ops-ch-meta" style="padding:8px 0">${tt('No events in the past 24 hours — system has been quiet.', '过去 24 小时无事件，系统运行平稳。')}</div>`;
    return;
  }

  let html = '';

  if (incidents.length) {
    html += `<div style="font-size:.7rem;font-weight:600;color:var(--text2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Incidents</div>`;
    for (const inc of incidents) {
      const startMs  = Date.parse(inc.start);
      const endMs    = inc.end ? Date.parse(inc.end) : null;
      const resolved = endMs !== null;
      const duration = resolved ? wdFmtDuration(Math.floor((endMs - startMs) / 1000)) : null;
      const sev      = inc.severity || 'critical';
      const sevCol   = sev === 'critical' ? 'var(--red)' : 'var(--yellow)';
      const badge    = resolved
        ? `<span style="background:rgba(63,185,80,.15);color:var(--green);font-size:.65rem;padding:2px 6px;border-radius:4px">✓ resolved</span>`
        : `<span style="background:rgba(248,81,73,.15);color:var(--red);font-size:.65rem;padding:2px 6px;border-radius:4px;animation:pulse 2s infinite">⚠ ongoing</span>`;

      html += `<div class="ops-channel-card" style="padding:10px 14px;margin-bottom:6px;border-left:3px solid ${sevCol}">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div style="min-width:0">
            <span style="color:${sevCol};font-size:.8rem;font-weight:600">${escHtml(wdReasonZh(inc.reason))}</span>
            <span style="color:var(--text2);font-size:.68rem;margin-left:8px">${wdFmtDateTime(startMs)}</span>
          </div>
          ${badge}
        </div>
        <div style="margin-top:5px;font-size:.7rem;color:var(--text2);display:flex;flex-wrap:wrap;gap:12px">
          ${duration ? `<span>时长 <strong style="color:var(--text1)">${duration}</strong></span>` : '<span style="color:var(--red)">未恢复</span>'}
          <span>严重性 <strong style="color:${sevCol}">${sev}</strong></span>
          ${inc.suppressed > 0 ? `<span style="opacity:.6">${inc.suppressed} 条已抑制</span>` : ''}
        </div>
      </div>`;
    }
  }

  // System health events summary (baseline_updated / baseline_promotion_pending)
  if (sysEvents.length) {
    const baselineUpdates = sysEvents.filter(e => e.event === 'baseline_updated').length;
    const pending         = sysEvents.filter(e => e.event === 'baseline_promotion_pending').length;
    html += `<div style="margin-top:8px;padding:7px 10px;border:1px solid var(--border);border-radius:6px;background:rgba(255,255,255,.025);font-size:.7rem;color:var(--text2)">
      🛡️ 系统健康
      ${baselineUpdates > 0 ? `<span style="color:var(--green);margin-left:8px">基线已更新 ×${baselineUpdates}</span>` : ''}
      ${pending > 0 ? `<span style="margin-left:8px">晋级候选 ×${pending}</span>` : ''}
    </div>`;
  }

  eventsEl.innerHTML = html;
}

function loadOperationsStatus() {
  if (_watchdogCache) renderWatchdogStatus(_watchdogCache);
  pollWatchdogStatus();
}

function refreshCurrentTab() {
  window._forceNoCache = true;
  setTimeout(() => window._forceNoCache = false, 1000);
  const active = document.querySelector('.tab-btn.active');
  if (active) active.click();
  checkConnection();
  loadAgentMonitor();
}

// ─── Toast ───
function toast(message, type = 'info') {
  const c = document.getElementById('toastContainer');
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
  c.appendChild(t);
  setTimeout(() => { if (t.parentNode) t.remove(); }, 3500);
}

// ─── Simple Markdown ───
function renderMarkdown(text) {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  return `<p>${html}</p>`;
}

// ─── Full Markdown (using marked.js library + DOMPurify) ───
function sanitizeHtml(html) {
  if (typeof DOMPurify !== 'undefined') return DOMPurify.sanitize(html);
  // Fallback: strip all tags
  const d = document.createElement('div'); d.textContent = html; return d.innerHTML;
}
function renderFullMarkdown(text) {
  if (!text) return '';
  try {
    if (typeof marked !== 'undefined' && marked.parse) {
      return sanitizeHtml(marked.parse(text, { breaks: true, gfm: true }));
    }
  } catch(e) { /* fallback */ }
  return renderMarkdown(text);
}
