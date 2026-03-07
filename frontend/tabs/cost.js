
/* Cost Tab — Channel Breakdown, All-Time Usage, Provider Audit */

async function loadOpsChannels() {
  const listEl = document.getElementById('opsChannelList');
  const subEl = document.getElementById('opsTotalSub');
  const pillsEl = document.getElementById('opsTotalPills');
  const barEl = document.getElementById('opsModelBar');
  if (!listEl) return;

  try {
    const data = await apiFetch('/ops/channels');
    // New format: { channels: [{channel, chat_id, messages, totalTokens, cost}] }
    // Old format: { totals: {...}, channels: [{today: {models, messages, totalTokens, cost}, channel, displayName, status}] }
    const rawChannels = data.channels || [];

    // Detect new vs old format by checking first channel structure
    const isNewFormat = rawChannels.length > 0 && rawChannels[0].chat_id !== undefined && rawChannels[0].today === undefined;

    if (isNewFormat) {
      // New format: flat rows from SQLite
      const totalTokens = rawChannels.reduce((s, c) => s + (c.totalTokens || 0), 0);
      const totalCost   = rawChannels.reduce((s, c) => s + (c.cost || 0), 0);
      const totalMsgs   = rawChannels.reduce((s, c) => s + (c.messages || 0), 0);

      if (subEl) subEl.textContent = `${fmtTokens(totalTokens)} tokens · ${totalMsgs} messages · $${totalCost.toFixed(2)}`;
      if (pillsEl) pillsEl.innerHTML = ''; // no model breakdown in new format
      if (barEl) barEl.innerHTML = '';

      if (rawChannels.length === 0) {
        listEl.innerHTML = '<div class="empty-state"><h3>No activity today</h3><p>Channel usage will appear here once messages flow.</p></div>';
        return;
      }
      listEl.innerHTML = rawChannels.map(ch => {
        const icon = ch.channel === 'discord' ? '🎮' : (ch.channel === 'whatsapp' ? '📱' : '💬');
        const name = (ch.chat_id || ch.channel || '?');
        return `<div class="ops-channel-card">
          <div class="ops-ch-left">
            <div class="ops-ch-name">${icon} ${escHtml(name)}</div>
            <div class="ops-ch-meta">
              <span>${ch.messages || 0} msgs</span>
              <span>${ch.channel || '—'}</span>
            </div>
          </div>
          <div class="ops-ch-right">
            <div class="ops-ch-tokens">${fmtTokens(ch.totalTokens || 0)}</div>
            <div class="ops-ch-cost">$${(ch.cost || 0).toFixed(2)}</div>
          </div>
        </div>`;
      }).join('');

    } else {
      // Old format (legacy)
      const totals = data.totals || {};
      if (subEl) subEl.textContent = `${fmtTokens(totals.totalTokens)} tokens · ${totals.messages || 0} messages · $${(totals.cost || 0).toFixed(2)}`;
      if (pillsEl) {
        const modelEntries = Object.entries(totals.models || {}).filter(([,t]) => t > 0).sort((a, b) => b[1] - a[1]);
        pillsEl.innerHTML = modelEntries.slice(0, 4).map(([m, t]) =>
          `<span class="pill" style="border-color:${getModelColor(m)};color:${getModelColor(m)}">${shortModel(m)} ${fmtTokens(t)}</span>`
        ).join('');
      }
      if (barEl) {
        const modelEntries = Object.entries(totals.models || {}).filter(([,t]) => t > 0).sort((a, b) => b[1] - a[1]);
        const total = totals.totalTokens || 1;
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

      if (rawChannels.length === 0) {
        listEl.innerHTML = '<div class="empty-state"><h3>No activity today</h3><p>Channel usage will appear here once messages flow.</p></div>';
        return;
      }
      listEl.innerHTML = rawChannels.map(ch => {
        const modelList = Object.entries(ch.today?.models || {}).sort((a, b) => b[1] - a[1]);
        const topModel = modelList[0] ? shortModel(modelList[0][0]) : '—';
        const icon = ch.channel === 'discord' ? '🎮' : (ch.channel === 'whatsapp' ? '📱' : '💬');
        const name = (ch.displayName || '').replace(/^discord:\d+#/, '#');
        return `<div class="ops-channel-card">
          <div class="ops-ch-left">
            <div class="ops-ch-name">${icon} ${escHtml(name)}</div>
            <div class="ops-ch-meta">
              <span>${(ch.today?.messages || 0)} msgs</span>
              <span>${topModel}</span>
              <span>${ch.status || ''}</span>
            </div>
          </div>
          <div class="ops-ch-right">
            <div class="ops-ch-tokens">${fmtTokens(ch.today?.totalTokens || 0)}</div>
            <div class="ops-ch-cost">$${(ch.today?.cost || 0).toFixed(2)}</div>
          </div>
        </div>`;
      }).join('');
    }
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state"><h3>Unable to load</h3><p>${e.message}</p></div>`;
  }
}


// ─── Time Range Filter State ──────────────────────────────────────────
let _costRangeDays = 30;

function _ensureCostRangeFilter() {
  // Inject filter buttons next to the "All-Time Usage" card title if not already there
  const subEl = document.getElementById('alltimeSub');
  if (!subEl) return;
  const parent = subEl.closest('.glass-card') || subEl.parentElement;
  if (!parent) return;

  // Already injected?
  if (document.getElementById('costRangeFilter')) return;

  const filterDiv = document.createElement('div');
  filterDiv.id = 'costRangeFilter';
  filterDiv.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:10px;flex-wrap:wrap';
  ['7d', '30d', '90d', 'All'].forEach(label => {
    const days = label === 'All' ? 9999 : parseInt(label);
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.dataset.days = days;
    btn.style.cssText = `padding:3px 10px;border-radius:10px;border:1px solid var(--border);
      background:${days === _costRangeDays ? 'var(--accent)' : 'var(--surface)'};
      color:${days === _costRangeDays ? '#fff' : 'var(--text2)'};
      cursor:pointer;font-size:.72rem;transition:background .15s`;
    btn.onclick = () => {
      _costRangeDays = days;
      document.querySelectorAll('#costRangeFilter button').forEach(b => {
        const active = Number(b.dataset.days) === _costRangeDays;
        b.style.background = active ? 'var(--accent)' : 'var(--surface)';
        b.style.color = active ? '#fff' : 'var(--text2)';
      });
      loadOpsAlltime(_costRangeDays);
    };
    filterDiv.appendChild(btn);
  });

  // Insert filter bar before the first child of the card header area
  const cardHeader = parent.querySelector('.card-header');
  if (cardHeader) {
    cardHeader.after(filterDiv);
  } else {
    parent.insertBefore(filterDiv, parent.firstChild);
  }
}


async function loadOpsAlltime(days) {
  if (days === undefined) days = _costRangeDays;
  else _costRangeDays = days;

  const modelsEl = document.getElementById('alltimeModels');
  const subEl = document.getElementById('alltimeSub');
  if (!modelsEl) return;

  _ensureCostRangeFilter();

  try {
    // Fetch history (time-range filtered) and today's breakdown
    const apiDays = days >= 9999 ? 9999 : days;
    const hist  = await apiFetch(`/api/ledger/history?days=${apiDays}`);
    const today = await apiFetch('/api/ledger/today');

    const dayRows = hist.rows || [];
    const totalCost   = dayRows.reduce((a, r) => a + Number(r.cost_total   || 0), 0);
    const totalTokens = dayRows.reduce((a, r) => a + Number(r.total_tokens || 0), 0);

    const rangeLabel = days >= 9999 ? 'all time' : `last ${hist.days || days} days`;
    if (subEl) subEl.textContent = `${fmtTokens(totalTokens)} tokens · $${totalCost.toFixed(2)} · ${rangeLabel}`;

    // Today's model breakdown (from /api/ledger/today → by_model)
    const todayModels = (today.by_model || []).map(r => ({
      name: r.model,
      tokens: Number((r.input_tokens || 0) + (r.output_tokens || 0) + (r.cache_read_tokens || 0) + (r.cache_write_tokens || 0)),
      cost: Number(r.cost_total || 0),
      messages: Number(r.calls || 0),
    }));
    const todayTotal = { tokens: todayModels.reduce((a, m) => a + m.tokens, 0) };

    modelsEl.innerHTML = todayModels.length ? todayModels.map(m => {
      const pct = todayTotal.tokens > 0 ? ((m.tokens / todayTotal.tokens) * 100).toFixed(1) : '0';
      return `<div class="ops-channel-card">
        <div class="ops-ch-left">
          <div class="ops-ch-name" style="font-size:.85rem">
            <span class="ops-model-dot" style="background:${getModelColor(m.name)};display:inline-block;margin-right:6px"></span>
            ${shortModel(m.name)}
          </div>
          <div class="ops-ch-meta"><span>${m.messages} msgs</span><span>${pct}%</span></div>
        </div>
        <div class="ops-ch-right">
          <div class="ops-ch-tokens">${fmtTokens(m.tokens)}</div>
          <div class="ops-ch-cost">$${(m.cost || 0).toFixed(2)}</div>
        </div>
      </div>`;
    }).join('')
    : '<div class="ops-ch-meta" style="padding:8px 0">No usage today yet.</div>';

    // Build daily data for week charts from hist.rows
    // Group by day
    const dailyMap = {};
    for (const r of dayRows) {
      const d = r.day;
      if (!dailyMap[d]) dailyMap[d] = { date: d, tokens: 0, cost: 0, models: {}, modelCosts: {} };
      const toks = Number(r.total_tokens || 0);
      const cost = Number(r.cost_total || 0);
      const modelAlias = r.model || 'unknown';
      dailyMap[d].tokens += toks;
      dailyMap[d].cost   += cost;
      dailyMap[d].models[modelAlias]      = (dailyMap[d].models[modelAlias]      || 0) + toks;
      dailyMap[d].modelCosts[modelAlias]  = (dailyMap[d].modelCosts[modelAlias]  || 0) + cost;
    }
    const allDaily = Object.values(dailyMap).sort((a, b) => a.date < b.date ? -1 : 1);
    if (allDaily.length > 0) {
      initWeekNav(allDaily);
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
