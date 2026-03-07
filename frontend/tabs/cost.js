
/* Cost Tab — Channel Breakdown, All-Time Usage, Provider Audit */

async function loadOpsChannels() {
  const listEl = document.getElementById('opsChannelList');
  const subEl = document.getElementById('opsTotalSub');
  const pillsEl = document.getElementById('opsTotalPills');
  const barEl = document.getElementById('opsModelBar');
  if (!listEl) return;

  try {
    const data = await apiFetch('/ops/channels');
    const totals = data.totals || {};
    const channels = data.channels || [];

    // Total summary
    if (subEl) subEl.textContent = `${fmtTokens(totals.totalTokens)} tokens · ${totals.messages || 0} messages · $${(totals.cost || 0).toFixed(2)}`;
    if (pillsEl) {
      const modelEntries = Object.entries(totals.models || {}).filter(([,t]) => t > 0).sort((a, b) => b[1] - a[1]);
      pillsEl.innerHTML = modelEntries.slice(0, 4).map(([m, t]) =>
        `<span class="pill" style="border-color:${getModelColor(m)};color:${getModelColor(m)}">${shortModel(m)} ${fmtTokens(t)}</span>`
      ).join('');
    }

    // Model distribution bar
    if (barEl) {
      const modelEntries = Object.entries(totals.models || {}).filter(([,t]) => t > 0).sort((a, b) => b[1] - a[1]);
      const total = totals.totalTokens || 1;
      // Bar segments (flex container) + legend below (separate div)
      barEl.innerHTML =
        '<div class="ops-bar-track">' +
        modelEntries.map(([m, t]) =>
          `<div style="width:${(t/total*100).toFixed(2)}%;background:${getModelColor(m)}" title="${shortModel(m)}: ${fmtTokens(t)}"></div>`
        ).join('') +
        '</div>' +
        '<div class="ops-model-legend">' + modelEntries.map(([m, t]) =>
          `<span class="ops-model-legend-item"><span class="ops-model-dot" style="background:${getModelColor(m)}"></span>${shortModel(m)} ${((t/total)*100).toFixed(0)}%</span>`
        ).join('') + '</div>';
    }

    // Channel list
    if (channels.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><h3>No activity today</h3><p>Channel usage will appear here once messages flow.</p></div>';
      return;
    }
    listEl.innerHTML = channels.map(ch => {
      const modelList = Object.entries(ch.today.models || {}).sort((a, b) => b[1] - a[1]);
      const topModel = modelList[0] ? shortModel(modelList[0][0]) : '—';
      const icon = ch.channel === 'discord' ? '🎮' : (ch.channel === 'whatsapp' ? '📱' : '💬');
      const name = (ch.displayName || '').replace(/^discord:\d+#/, '#');
      return `<div class="ops-channel-card">
        <div class="ops-ch-left">
          <div class="ops-ch-name">${icon} ${escHtml(name)}</div>
          <div class="ops-ch-meta">
            <span>${ch.today.messages} msgs</span>
            <span>${topModel}</span>
            <span>${ch.status}</span>
          </div>
        </div>
        <div class="ops-ch-right">
          <div class="ops-ch-tokens">${fmtTokens(ch.today.totalTokens)}</div>
          <div class="ops-ch-cost">$${(ch.today.cost || 0).toFixed(2)}</div>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state"><h3>Unable to load</h3><p>${e.message}</p></div>`;
  }
}


async function loadOpsAlltime() {
  const modelsEl = document.getElementById('alltimeModels');
  const subEl = document.getElementById('alltimeSub');
  const auditEl = document.getElementById('auditStatus');
  const canvas = document.getElementById('dailyChart');
  if (!modelsEl) return;

  try {
    // Alltime is now driven by ledger history (no JSONL scan)
    const hist = await apiFetch('/ops/ledger/history?days=90');
    const today = await apiFetch('/ops/ledger/today');

    const dayRows = hist.rows || [];
    const totalCost = dayRows.reduce((a, r) => a + Number(r.cost_total || 0), 0);
    const totalTokens = dayRows.reduce((a, r) => a + Number(r.billed_total_tokens || 0), 0);

    if (subEl) subEl.textContent = `${fmtTokens(totalTokens)} tokens · $${totalCost.toFixed(2)} · last ${hist.days} days`;

    // Model breakdown (today)
    const models = (today.rows || []).map(r => ({
      name: r.model,
      tokens: Number(r.billed_total_tokens || 0),
      cost: Number(r.cost_total || 0),
      messages: Number(r.calls || 0),
    }));
    const t = { tokens: models.reduce((a, m) => a + (m.tokens || 0), 0) };
    modelsEl.innerHTML = models.map(m => {
      const pct = t.tokens > 0 ? ((m.tokens / t.tokens) * 100).toFixed(1) : '0';
      return `<div class="ops-channel-card">
        <div class="ops-ch-left">
          <div class="ops-ch-name" style="font-size:.85rem"><span class="ops-model-dot" style="background:${getModelColor(m.name)};display:inline-block;margin-right:6px"></span>${shortModel(m.name)}</div>
          <div class="ops-ch-meta"><span>${m.messages} msgs</span><span>${pct}%</span></div>
        </div>
        <div class="ops-ch-right">
          <div class="ops-ch-tokens">${fmtTokens(m.tokens)}</div>
          <div class="ops-ch-cost">$${(m.cost || 0).toFixed(2)}</div>
        </div>
      </div>`;
    }).join('');

    // Daily charts — week navigation
    const allDaily = data.recentDaily || [];
    if (allDaily.length > 0) {
      initWeekNav(allDaily);
    }

    // Audit status
    if (auditEl && data.audit) {
      const a = data.audit;
      auditEl.innerHTML = `🔍 <strong>Third-party Audit:</strong>
        OpenAI <span class="pill">${a.openai?.status}</span>
        Anthropic <span class="pill">${a.anthropic?.status}</span>
        Google <span class="pill">${a.google?.status}</span>`;
    }
  } catch (e) {
    modelsEl.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  }
}


async function loadOpsAudit() {
  const el = document.getElementById('auditContent');
  if (!el) return;
  try {
    const data = await apiFetch('/ops/audit');
    let html = '';

    // OpenAI
    const oi = data.openai;
    if (oi?.status === 'ok') {
      const t = oi.totals;
      const modelRows = Object.entries(oi.models || {}).sort((a, b) => b[1].input - a[1].input).map(([m, d]) =>
        `<div class="ops-channel-card" style="padding:8px 12px">
          <div class="ops-ch-left"><div class="ops-ch-name" style="font-size:.82rem">🟢 ${escHtml(m)}</div>
          <div class="ops-ch-meta"><span>${d.requests} reqs</span><span>cached: ${fmtTokens(d.cached)}</span></div></div>
          <div class="ops-ch-right"><div class="ops-ch-tokens">${fmtTokens(d.input + d.output)}</div></div></div>`
      ).join('');
      html += `<div style="margin-bottom:12px">
        <div style="font-weight:600;margin-bottom:6px">OpenAI <span class="pill" style="border-color:#34d399;color:#34d399">✓ verified</span></div>
        <div class="ops-ch-meta" style="margin-bottom:8px">7d: ${fmtTokens(t.input)} in + ${fmtTokens(t.output)} out · ${t.requests} reqs · ${fmtTokens(t.cached)} cached</div>
        <div class="ops-channel-list">${modelRows}</div>
        ${Object.keys(oi.days||{}).length > 0 ? `<div class="ops-ch-meta" style="margin-top:6px">Days: ${Object.entries(oi.days).sort().map(([d,v])=>d.slice(5)+':'+fmtTokens(v.input+v.output)).join(' · ')}</div>` : ''}
      </div>`;
    } else {
      html += `<div style="margin-bottom:8px">OpenAI <span class="pill">${oi?.status || 'unknown'}</span> ${oi?.error || ''}</div>`;
    }

    // Anthropic
    const ac = data.anthropic;
    if (ac?.status === 'org_only') {
      html += `<div style="margin-bottom:8px">
        <div style="font-weight:600;margin-bottom:4px">Anthropic <span class="pill" style="border-color:#c084fc;color:#c084fc">org verified</span></div>
        <div class="ops-ch-meta">Org: ${escHtml(ac.org?.name)} · ${ac.activeKeys?.length || 0} active keys</div>
        <div class="ops-ch-meta" style="margin-top:2px;font-style:italic">${ac.note}</div>
      </div>`;
    } else {
      html += `<div style="margin-bottom:8px">Anthropic <span class="pill">${ac?.status || 'unknown'}</span></div>`;
    }

    // Google
    html += `<div>Google <span class="pill">${data.google?.status || 'no_api'}</span> <span class="ops-ch-meta">${data.google?.note || ''}</span></div>`;

    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = `<div class="ops-ch-meta">Failed: ${e.message}</div>`;
  }
}

// ─── Ops Management Actions ───
