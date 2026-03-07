
/* Health Tab — System Info, Watchdog, Security Audit, Spark Metrics */

async function loadSystemInfo() {
  // Refresh model options from server dynamically
  try {
    const data = await apiFetch('/ops/models');
    if (data.registry) refreshModelOptions(data.registry);
    if (data.colors) Object.assign(MODEL_COLORS, data.colors);
    if (data.displayNames) {
      // clear and push to avoid duplicates on refresh
      MODEL_DISPLAY_NAMES.length = 0;
      MODEL_DISPLAY_NAMES.push(...data.displayNames);
    }
  } catch(e) {}

  apiFetch('/ops/system').then(sys => {
    // Update global default model from live config
    if (sys.models?.primary) {
      const p = sys.models.primary;
      globalDefaultModel = p.includes('/') ? p.split('/').pop() : p;
    }
    const el = document.getElementById('systemInfoBar');
    const c = document.getElementById('systemInfoContent');
    if (!el || !c) return;
    const memPct = sys.memory?.usePct || '0';
    const memColor = +memPct > 85 ? 'var(--red)' : +memPct > 60 ? 'var(--yellow)' : 'var(--green)';
    const diskPct = parseInt(sys.disk?.usePct) || 0;
    const diskColor = diskPct > 80 ? 'var(--red)' : diskPct > 60 ? 'var(--yellow)' : 'var(--green)';
    c.innerHTML = `
      <span>🖥️ <strong>${sys.macModel || sys.hostname}</strong></span>
      <span>🍎 ${sys.macOS || '—'}</span>
      <span>🧮 ${sys.cpus} ${tt('cores', '核')} · Load ${sys.loadAvg?.['1m']?.toFixed(1) || '—'}</span>
      <span style="color:${memColor}">💾 RAM ${memPct}%</span>
      <span style="color:${diskColor}">💿 Disk ${sys.disk?.usePct || '—'}</span>
      <span>📦 Node ${sys.nodeVersion || '—'}</span>
      <span>🦞 v${sys.clawVersion || '—'}</span>
    `;
    el.style.display = '';
  }).catch(() => {});
}

async function renderAgentMonitor() {
  if (!agentData) return;
  const d = agentData;

  await loadSystemInfo();

  // Fetch today's usage from SQLite Ledger (single source of truth)
  apiFetch('/ops/ledger/today').then((ledger) => {
    const rows = ledger.rows || [];
    let totalCost = 0;
    let totalTokens = 0; // billed_total_tokens
    const models = {};
    let totalCalls = 0;

    rows.forEach(r => {
      const cost = Number(r.cost_total || 0);
      const billed = Number(r.billed_total_tokens || 0);
      const m = r.model || 'unknown';
      totalCost += cost;
      totalTokens += billed;
      totalCalls += Number(r.calls || 0);
      models[m] = (models[m] || 0) + billed;
    });

    // Card 1: Today Cost
    const mainBadge = document.getElementById('mainAgentBadge');
    const mainValue = document.getElementById('mainAgentValue');
    const mainDetail = document.getElementById('mainAgentDetail');
    mainBadge.className = 'agent-stat-badge active';
    mainBadge.innerHTML = '<span class="pulse-dot"></span> today';
    mainValue.textContent = '$' + totalCost.toFixed(2);
    mainDetail.textContent = totalCalls + ' calls';

    // Card 2: Today Tokens — use billed_total_tokens (prompt_context + output)
    const subVal = document.getElementById('subagentValue');
    const subBadge = document.getElementById('subagentBadge');
    const subDetail = document.getElementById('subagentDetail');
    subVal.textContent = fmtTokens(totalTokens);
    subBadge.className = 'agent-stat-badge active';
    subBadge.innerHTML = 'today';
    const topModel = Object.entries(models).filter(([k]) => k !== 'delivery-mirror' && k !== 'unknown').sort((a, b) => b[1] - a[1])[0];
    subDetail.textContent = topModel ? 'Top: ' + shortModel(topModel[0]) : '—';

    // Card 5: Model Mix — visual bars (by billed_total_tokens)
    const sorted = Object.entries(models).filter(([k]) => k !== 'delivery-mirror' && k !== 'unknown').sort((a, b) => b[1] - a[1]);
    const mixEl = document.getElementById('modelMixBars');
    const totalVal5 = document.getElementById('totalValue');
    const totalBadge5 = document.getElementById('totalBadge');
    if (mixEl) {
      if (!sorted.length) {
        mixEl.innerHTML = '<div class="ops-ch-meta">No ledger data today</div>';
        return;
      }
      totalVal5.textContent = sorted.length + ' models';
      totalBadge5.className = 'agent-stat-badge active';
      totalBadge5.innerHTML = 'today';
      let barHtml = '<div style="display:flex;height:10px;border-radius:5px;overflow:hidden;margin-bottom:6px">';
      const colors = {};
      sorted.forEach(([m, tk]) => {
        const pct = ((tk / (totalTokens || 1)) * 100);
        const c = getModelColor(m);
        colors[m] = c;
        barHtml += `<div style="width:${pct}%;background:${c};min-width:2px" title="${shortModel(m)} ${pct.toFixed(0)}%"></div>`;
      });
      barHtml += '</div>';
      barHtml += '<div style="display:flex;flex-wrap:wrap;gap:4px 10px;font-size:.7rem">';
      sorted.forEach(([m, tk]) => {
        const pct = ((tk / (totalTokens || 1)) * 100).toFixed(0);
        barHtml += `<span style="color:${colors[m]}">● ${shortModel(m)} <b>${pct}%</b></span>`;
      });
      barHtml += '</div>';
      mixEl.innerHTML = barHtml;
    }
  }).catch(() => {});

  // Card 3: Cron Jobs (from agent data)
  const cronVal = document.getElementById('cronValue');
  const cronBadge = document.getElementById('cronBadge');
  const cronDetail = document.getElementById('cronDetail');
  cronVal.textContent = d.crons?.total || 0;
  cronBadge.className = `agent-stat-badge ${d.crons?.active > 0 ? 'active' : 'idle'}`;
  cronBadge.innerHTML = d.crons?.active > 0 ? `<span class="pulse-dot"></span> ${d.crons.active} running` : `${d.crons?.total || 0} total`;
  cronDetail.textContent = d.crons?.active > 0 ? d.crons.active + ' running' : 'all idle';

  // Card 4: Sessions
  const hookVal = document.getElementById('hookValue');
  const hookBadge = document.getElementById('hookBadge');
  const hookDetail = document.getElementById('hookDetail');
  hookVal.textContent = d.activeSessions || 0;
  hookBadge.className = `agent-stat-badge ${d.activeSessions > 0 ? 'active' : 'idle'}`;
  hookBadge.innerHTML = d.activeSessions + ' active';
  hookDetail.textContent = (d.totalSessions || 0) + ' total';

  // Card 5: Model Mix — rendered by /ops/sessions fetch above

  // Render sessions panel
  renderSessionsPanel();
}

function renderSessionsPanel() {
  // Load today's cron runs instead of active sessions
  loadCronRuns();
}


async function loadQuality() {
  const el = document.getElementById('qualityContent');
  if (!el) return;
  try {
    const data = await apiFetch('/ops/sessions');
    const sessions = (data.sessions || []).filter(s => s.today.messages > 0);
    // Sort by idle rate desc
    sessions.sort((a, b) => b.today.noReplyRate - a.today.noReplyRate);

    let html = `<div class="glass-card" style="padding:16px;margin-bottom:12px"><div class="card-title">${tt('Session Quality (Today)', '会话质量（今日）')}</div><div class="card-sub">${tt(
      'Silent rate = (NO_REPLY + HEARTBEAT_OK) / total messages. High silent rate means many messages need no response, so you can downgrade the model to save cost.',
      '静默率 = (NO_REPLY 无回复 + HEARTBEAT_OK 心跳) / 总消息数。高静默率说明该频道大量消息不需要回复，可考虑降级模型节省成本。'
    )}</div></div>`;
    html += '<div class="ops-channel-list">';
    for (const s of sessions) {
      const barWidth = Math.min(s.today.noReplyRate, 100);
      const color = s.today.noReplyRate > 60 ? '#f87171' : s.today.noReplyRate > 30 ? '#fbbf24' : '#34d399';
      html += `<div class="ops-channel-card">
        <div class="ops-ch-left" style="flex:1">
          <div class="ops-ch-name">${escHtml(s.displayName)}</div>
          <div style="height:6px;background:var(--border);border-radius:3px;margin-top:4px">
            <div style="width:${barWidth}%;height:100%;background:${color};border-radius:3px"></div>
          </div>
          <div class="ops-ch-meta"><span>${s.today.messages} msgs</span><span>${s.today.effectiveMessages} effective</span><span>${s.today.noReply} silent</span><span>${s.today.heartbeat} heartbeat</span></div>
        </div>
        <div class="ops-ch-right"><div class="ops-ch-tokens" style="color:${color}">${s.today.noReplyRate}%</div><div class="ops-ch-cost">${tt('Silent rate', '静默率')}</div></div>
      </div>`;
    }
    html += '</div>';
    el.innerHTML = html;
  } catch (e) { el.innerHTML = `<p>${e.message}</p>`; }
}


async function loadAudit() {
  const el = document.getElementById('auditContent2');
  if (!el) return;
  try {
    const [data, changelog] = await Promise.all([
      apiFetch('/ops/sessions'),
      apiFetch('/ops/model-changelog').catch(() => ({ entries: [] })),
    ]);
    const channelMap = new Map((data.sessions || []).map(s => [String(s.channelId), s.displayName || s.channelId]));
    const sessions = (data.sessions || []).filter(s => s.today.messages > 0);
    const changeEntries = Array.isArray(changelog?.entries) ? changelog.entries.slice(0, 20) : [];

    const recommendations = [];
    for (const s of sessions) {
      // Expensive model with high idle rate
      if (s.model?.includes('opus') && s.today.noReplyRate > 40 && s.today.messages > 3) {
        recommendations.push({ severity: 'high', session: s.displayName, msg: `Using Claude Opus 4 but ${s.today.noReplyRate}% idle → switch to Claude Sonnet 4 (save ~$${(s.today.cost * 0.8).toFixed(0)}/day)`, model: s.model });
      }
      // Opus for simple channel
      if (s.model?.includes('opus') && s.today.effectiveMessages < 5 && s.today.cost > 1) {
        recommendations.push({ severity: 'medium', session: s.displayName, msg: `Claude Opus 4 overkill — only ${s.today.effectiveMessages} effective msgs, costing $${s.today.cost.toFixed(2)}`, model: s.model });
      }
      // No thinking level set
      if (s.thinkingLevel === '—' && s.today.messages > 0) {
        recommendations.push({ severity: 'low', session: s.displayName, msg: 'No thinking level set — consider setting to "low" to save tokens', model: s.model });
      }
    }

    let html = '<div class="glass-card" style="padding:16px;margin-bottom:12px"><div class="card-title">Config Audit</div><div class="card-sub">' + recommendations.length + ' recommendations</div></div>';

    if (recommendations.length === 0) {
      html += '<div class="empty-state"><h3>✅ All Good</h3><p>No optimization opportunities detected.</p></div>';
    } else {
      html += '<div class="ops-channel-list">';
      const sevColors = { high: '#f87171', medium: '#fbbf24', low: '#6b7280' };
      for (const r of recommendations) {
        html += `<div class="sess-alert" style="background:${sevColors[r.severity]}15;border:1px solid ${sevColors[r.severity]}40">
          <span style="font-size:1.1rem">${r.severity === 'high' ? '🔴' : r.severity === 'medium' ? '🟡' : '⚪'}</span>
          <div><strong>${escHtml(r.session)}</strong><br><span style="font-size:.8rem;color:var(--text2)">${escHtml(r.msg)}</span></div>
        </div>`;
      }
      html += '</div>';
    }

    // Provider audit (from existing)
    try {
      const audit = await apiFetch('/ops/audit');
      html += '<div class="glass-card" style="padding:16px;margin-top:12px"><div class="card-title">Provider Verification</div>';
      const oi = audit.openai;
      if (oi?.status === 'ok') {
        html += `<div style="margin:8px 0"><strong>OpenAI</strong> <span class="pill" style="border-color:#34d399;color:#34d399">✓</span> 7d: ${oi.totals.requests} reqs</div>`;
      }
      const ac = audit.anthropic;
      if (ac?.org) {
        html += `<div><strong>Anthropic</strong> <span class="pill" style="border-color:#c084fc;color:#c084fc">org ✓</span> ${ac.org.name} · ${ac.activeKeys?.length} keys</div>`;
      }
      html += '</div>';
    } catch {}

    // System info
    try {
      const sys = await apiFetch('/ops/system');
      const memPct = sys.memory?.usePct || '—';
      const memUsed = ((sys.memory?.used || 0) / 1073741824).toFixed(1);
      const memTotal = ((sys.memory?.total || 0) / 1073741824).toFixed(1);
      const load = sys.loadAvg?.['1m']?.toFixed(2) || '—';
      const uptimeH = Math.floor((sys.dashboardUptime || 0) / 3600);
      const uptimeM = Math.floor(((sys.dashboardUptime || 0) % 3600) / 60);
      html += `<div class="glass-card" style="padding:16px;margin-top:12px">
        <div class="card-title">🖥️ System (${escHtml(sys.hostname || '')})</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;font-size:.82rem">
          <div>💻 <strong>${escHtml(sys.macModel || sys.platform)}</strong></div>
          <div>🍎 macOS ${escHtml(sys.macOS || '—')}</div>
          <div>🧮 CPU: ${sys.cpus} cores · Load: ${load}</div>
          <div>💾 RAM: ${memUsed}/${memTotal} GB (${memPct}%)</div>
          <div>💿 Disk: ${sys.disk?.used || '—'} / ${sys.disk?.total || '—'} (${sys.disk?.usePct || '—'})</div>
          <div>⏱️ Dashboard: ${uptimeH}h ${uptimeM}m</div>
          <div>📦 Node: ${escHtml(sys.nodeVersion || '—')}</div>
          <div>🦞 OpenClaw: ${escHtml(sys.clawVersion || '—')}</div>
        </div>
        <div style="margin-top:8px">
          <div style="font-size:.72rem;color:var(--text2);margin-bottom:2px">Memory ${memPct}%</div>
          <div style="height:8px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden">
            <div style="height:100%;width:${memPct}%;background:${+memPct>80?'var(--red)':+memPct>60?'var(--yellow)':'var(--green)'};border-radius:4px;transition:width .5s"></div>
          </div>
          <div style="font-size:.72rem;color:var(--text2);margin:4px 0 2px">Disk ${sys.disk?.usePct || '—'}</div>
          <div style="height:8px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden">
            <div style="height:100%;width:${sys.disk?.usePct || '0%'};background:${parseInt(sys.disk?.usePct)>80?'var(--red)':parseInt(sys.disk?.usePct)>60?'var(--yellow)':'var(--green)'};border-radius:4px;transition:width .5s"></div>
          </div>
        </div>
      </div>`;
    } catch {}

    const fmtChangeTs = (ts) => {
      const ms = Date.parse(ts || '');
      if (!Number.isFinite(ms)) return '—';
      const d = new Date(ms);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      return `${mm}/${dd} ${hh}:${mi}`;
    };
    const shortId = (id) => {
      const raw = String(id || '');
      if (!raw) return '—';
      if (raw.length <= 14) return raw;
      return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
    };

    html += `<div class="glass-card" style="padding:16px;margin-top:12px">
      <div class="card-title">🔄 ${tt('Model Change History', '模型变更历史')}</div>`;
    if (!changeEntries.length) {
      html += `<div class="empty-state" style="padding:10px 4px 2px"><p>${tt('No model changes yet', '暂无变更记录')}</p></div>`;
    } else {
      html += '<div style="margin-top:8px">';
      for (const item of changeEntries) {
        const isCron = item?.type === 'cron';
        const typeLabel = isCron ? 'CRON' : 'SESSION';
        const typeColor = isCron ? 'var(--yellow)' : 'var(--blue)';
        const displayName = isCron ? (item?.name || item?.id || '—') : (channelMap.get(String(item?.id)) || shortId(item?.id));
        const fromModel = shortModel(item?.from || 'unknown');
        const toModel = shortModel(item?.to || 'unknown');
        const via = item?.via || 'dashboard';
        html += `<div style="display:grid;grid-template-columns:82px 74px 1fr;gap:8px;align-items:center;padding:7px 2px;border-bottom:1px solid var(--border);font-size:.76rem">
          <span style="font-family:var(--mono);color:var(--text2)">${fmtChangeTs(item?.ts)}</span>
          <span style="display:inline-flex;align-items:center;justify-content:center;padding:2px 8px;border-radius:999px;font-size:.66rem;font-weight:700;letter-spacing:.5px;background:${typeColor}1f;color:${typeColor};border:1px solid ${typeColor}4d">${typeLabel}</span>
          <div style="min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="color:var(--text);font-family:var(--mono);font-size:.72rem">${escHtml(displayName)}</span>
            <span style="color:var(--text2)">${escHtml(fromModel)} → ${escHtml(toModel)}</span>
            <span style="display:inline-flex;align-items:center;padding:1px 7px;border-radius:999px;border:1px solid var(--border);color:var(--text2);font-size:.64rem;text-transform:lowercase">${escHtml(via)}</span>
          </div>
        </div>`;
      }
      html += '</div>';
    }
    html += '</div>';

    el.innerHTML = html;
  } catch (e) { el.innerHTML = `<p>${e.message}</p>`; }
}

function timeSince(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

// ─── Config Viewer ───
