
/* Cost Tab — All-Time Usage, Provider Audit, Usage by Source */

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
  const subEl    = document.getElementById('alltimeSub');
  const opsTotalSub = document.getElementById('opsTotalSub');
  const opsTotalPills = document.getElementById('opsTotalPills');
  const opsModelBar = document.getElementById('opsModelBar');
  if (!modelsEl) return;

  _ensureCostRangeFilter();

  try {
    const apiDays = days >= 9999 ? 9999 : days;
    const hist = await apiFetch(`/dashboard/usage/models/history?days=${apiDays}`);
    const dayRows = hist.rows || [];

    // ── Totals ────────────────────────────────────────────────────────
    let totalCost   = Number(hist.summary?.costUsd || 0);
    let totalTokens = Number(hist.summary?.totalTokens || 0);

    const rangeLabel = days >= 9999 ? 'all time' : `last ${hist.days || days} days`;
    if (subEl) subEl.textContent = `${fmtTokens(totalTokens)} tokens · $${totalCost.toFixed(2)} · ${rangeLabel}`;

    // Today's Usage (PST) card uses today's dashboard-friendly usage endpoint
    try {
      const today = await apiFetch('/dashboard/usage/models/today');
      const todaySummary = today.summary || {};
      const todayRows = today.rows || [];
      if (opsTotalSub) {
        opsTotalSub.textContent = `${fmtTokens(todaySummary.totalTokens || 0)} tokens · $${Number(todaySummary.costUsd || 0).toFixed(2)} · ${todaySummary.calls || 0} calls today`;
      }
      if (opsTotalPills) {
        opsTotalPills.innerHTML = todayRows.slice(0, 4).map(r => `<span class="pill" style="border-color:${getModelColor(r.model)};color:${getModelColor(r.model)}">${shortModel(r.model)} ${fmtTokens(r.totalTokens || 0)}</span>`).join('');
      }
      if (opsModelBar) {
        const total = Number(todaySummary.totalTokens || 0) || 1;
        opsModelBar.innerHTML = '<div class="ops-bar-track">' + todayRows.map(r => `<div style="width:${((Number(r.totalTokens || 0)/total)*100).toFixed(2)}%;background:${getModelColor(r.model)}" title="${shortModel(r.model)}: ${fmtTokens(r.totalTokens || 0)}"></div>`).join('') + '</div>';
      }
    } catch {}

    // ── Model aggregation from HISTORY (not just today) ───────────────
    // Normalise local-model name variants so Qwen gguf rows don't appear
    // as separate entries for each filename/provider variant.
    // Map raw (provider, model) from ledger → stable display key + metadata
    // Must match the LEDGER_ALIAS_MAP in backend/providers/ground-truth.js
    function canonicalKey(provider, model) {
      const p = (provider || '').toLowerCase();
      const m = (model || '').toLowerCase().replace(/\.gguf$/i, '');
      // All local Qwen3.5 35B variants (dgx-spark + macbook + ollama-remote) → single key
      if (m.includes('qwen') && m.includes('35b') &&
          (p.includes('local') || p.includes('ollama'))) {
        // Distinguish mac vs spark
        if (p.includes('macbook') || p.includes('mac-pro') || p.includes('mac pro')) return 'local/qwen-mac';
        return 'local/qwen-spark';
      }
      // Qwen 27B variants
      if (m.includes('qwen') && m.includes('27b') &&
          (p.includes('local') || p.includes('ollama'))) {
        return 'local/qwen-27b';
      }
      if (m.includes('qwen') && m.includes('30b') &&
          (p.includes('local') || p.includes('ollama'))) return 'local/qwen3.5-30b';
      // anthropic/anthropic/... double prefix artifact → clean
      if (p.startsWith('anthropic/')) return `anthropic/${model || 'unknown'}`;
      return `${p}/${model || 'unknown'}`;
    }

    // Display name for the canonical key
    function canonicalDisplayName(key, rawModel) {
      if (key === 'local/qwen-spark') return 'Qwen-35B';
      if (key === 'local/qwen-27b')   return 'Qwen-27B';
      if (key === 'local/qwen-mac')   return 'Qwen-MacBook';
      if (key === 'local/qwen3.5-30b') return 'Qwen-30B';
      return shortModel(rawModel || key);
    }

    // Color lookup key for getModelColor(): prefer full "provider/model" id
    function colorKey(key, rawModel) {
      if (key === 'local/qwen-spark') return 'local-dgx-spark/Qwen3.5-35B-A3B-UD-Q4_K_XL.gguf';
      if (key === 'local/qwen-mac')   return 'local-macbook-pro/qwen3.5:35b-a3b';
      return rawModel || key;
    }

    const modelAgg = new Map(); // key → { key, displayName, provider, rawModel, tokens, cost, messages, isLocal }

    for (const r of dayRows) {
      const key   = canonicalKey(r.provider, r.model);
      const toks  = Number(r.totalTokens || 0);
      const cost  = Number(r.costUsd || 0);
      const calls = Number(r.calls || 0);
      const prev  = modelAgg.get(key);
      const prov  = (r.provider || '').toLowerCase();
      const isLocal = prov.includes('local') || prov.includes('ollama') ||
                      (r.model || '').toLowerCase().includes('gguf');
      if (prev) {
        prev.tokens   += toks;
        prev.cost     += cost;
        prev.messages += calls;
      } else {
        modelAgg.set(key, {
          key,
          displayName: canonicalDisplayName(key, r.model),
          colorRef:    colorKey(key, r.model),
          provider:    r.provider || 'unknown',
          rawModel:    r.model || key,
          tokens:      toks,
          cost,
          messages:    calls,
          isLocal,
        });
      }
    }

    // Sort: local models by token desc, cloud models by cost desc, then interleave
    const cloudModels = [...modelAgg.values()].filter(m => !m.isLocal)
      .sort((a, b) => b.cost - a.cost);
    const localModels = [...modelAgg.values()].filter(m => m.isLocal)
      .sort((a, b) => b.tokens - a.tokens);
    const sortedModels = [...cloudModels, ...localModels];

    const grandTokens = sortedModels.reduce((s, m) => s + m.tokens, 0);

    modelsEl.innerHTML = sortedModels.length
      ? sortedModels.map(m => {
          const pct = grandTokens > 0 ? ((m.tokens / grandTokens) * 100).toFixed(1) : '0';
          const costStr = m.isLocal
            ? `<span style="color:var(--green);font-size:.7rem">local $0</span>`
            : `$${m.cost.toFixed(2)}`;
          return `<div class="ops-channel-card">
            <div class="ops-ch-left">
              <div class="ops-ch-name" style="font-size:.85rem">
                <span class="ops-model-dot" style="background:${getModelColor(m.colorRef || m.rawModel)};display:inline-block;margin-right:6px"></span>
                ${escHtml(m.displayName)}
                ${m.isLocal ? '<span style="font-size:.65rem;margin-left:4px;padding:1px 6px;border-radius:8px;background:rgba(63,185,80,.15);color:var(--green)">local</span>' : ''}
              </div>
              <div class="ops-ch-meta">
                <span>${m.messages.toLocaleString()} msgs</span>
                <span>${pct}% of tokens</span>
              </div>
            </div>
            <div class="ops-ch-right">
              <div class="ops-ch-tokens">${fmtTokens(m.tokens)}</div>
              <div class="ops-ch-cost">${costStr}</div>
            </div>
          </div>`;
        }).join('')
      : '<div class="ops-ch-meta" style="padding:8px 0">No usage data in this range.</div>';

    // ── Daily chart data ──────────────────────────────────────────────
    // Use daily_totals from API (pre-split local vs paid) when available,
    // fall back to building from rows for per-model color breakdown.
    const dailyMap = {};
    for (const r of dayRows) {
      const d = r.day;
      if (!dailyMap[d]) dailyMap[d] = { date: d, tokens: 0, cost: 0, localTokens: 0, paidTokens: 0, models: {}, modelCosts: {}, localModels: {} };
      const toks = Number(r.totalTokens || 0);
      const cost = Number(r.costUsd || 0);
      const alias = canonicalKey(r.provider, r.model);
      dailyMap[d].tokens           += toks;
      dailyMap[d].cost             += cost;
      dailyMap[d].models[alias]     = (dailyMap[d].models[alias]    || 0) + toks;
      dailyMap[d].modelCosts[alias] = (dailyMap[d].modelCosts[alias]|| 0) + cost;
      const provider = String(r.provider || '').toLowerCase();
      const modelRaw = String(r.model || '').toLowerCase();
      const isLocal = provider.includes('local') || provider.includes('ollama') || modelRaw.includes('gguf');
      if (isLocal) {
        dailyMap[d].localTokens += toks;
        dailyMap[d].localModels[alias] = (dailyMap[d].localModels[alias] || 0) + toks;
      } else {
        dailyMap[d].paidTokens += toks;
      }
    }
    const allDaily = Object.values(dailyMap).sort((a, b) => a.date < b.date ? -1 : 1);
    if (allDaily.length > 0) initWeekNav(allDaily);

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
          <div class="ops-ch-left"><div class="ops-ch-name" style="font-size:.82rem">🟢 ${escHtml(shortModel(m))}</div>
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

// ─── Usage by Source Type (Channel / Thread / Cron) ─────────────────────
let _sourceRangeDays = 7;

function _ensureSourceRangeFilter() {
  const subEl = document.getElementById('bySourceSub');
  if (!subEl) return;
  const parent = subEl.closest('.glass-card') || subEl.parentElement;
  if (!parent) return;
  if (document.getElementById('sourceRangeFilter')) return;

  const filterDiv = document.createElement('div');
  filterDiv.id = 'sourceRangeFilter';
  filterDiv.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:10px;flex-wrap:wrap';
  ['7d', '14d', '30d'].forEach(label => {
    const days = parseInt(label);
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.dataset.days = days;
    btn.style.cssText = `padding:3px 10px;border-radius:10px;border:1px solid var(--border);
      background:${days === _sourceRangeDays ? 'var(--accent)' : 'var(--surface)'};
      color:${days === _sourceRangeDays ? '#fff' : 'var(--text2)'};
      cursor:pointer;font-size:.72rem;transition:background .15s`;
    btn.onclick = () => {
      _sourceRangeDays = days;
      document.querySelectorAll('#sourceRangeFilter button').forEach(b => {
        const active = Number(b.dataset.days) === _sourceRangeDays;
        b.style.background = active ? 'var(--accent)' : 'var(--surface)';
        b.style.color = active ? '#fff' : 'var(--text2)';
      });
      loadOpsBySource(_sourceRangeDays);
    };
    filterDiv.appendChild(btn);
  });

  const cardHeader = parent.querySelector('.card-header');
  if (cardHeader) {
    cardHeader.after(filterDiv);
  } else {
    parent.insertBefore(filterDiv, parent.firstChild);
  }
}

async function loadOpsBySource(days) {
  if (days === undefined) days = _sourceRangeDays;
  else _sourceRangeDays = days;

  const listEl = document.getElementById('bySourceList');
  const subEl = document.getElementById('bySourceSub');
  const chartEl = document.getElementById('bySourceChart');
  if (!listEl) return;

  // Temporary downgrade: source breakdown is still on legacy API shape and should not render misleading data.
  if (subEl) subEl.textContent = tt('Temporarily hidden during usage API migration', 'Usage API 迁移中，暂时隐藏');
  if (chartEl) chartEl.innerHTML = '';
  listEl.innerHTML = `<div class="empty-state"><h3>${tt('Temporarily unavailable', '暂不可用')}</h3><p>${tt('Usage by Source is being migrated to the new dashboard usage contract.', 'Usage by Source 正在迁移到新的 dashboard usage 契约。')}</p></div>`;
}

// ─── Ops Management Actions ───
