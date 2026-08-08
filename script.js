'use strict';

/* ================================================================
   STATE & STORAGE
   ================================================================ */
const STORAGE = { DEALS: 'mc_deals_v4', THEME: 'mc_theme', SECTIONS: 'mc_sections_v3' };
const SYM = { BDT: '৳', USD: '$', EUR: '€', GBP: '£' };

const S = {
  view: 'dashboard',
  deals: [],
  submitting: false,
  currentDeal: null,
  sections: null, // form section config
};

/* ================================================================
   DEFAULT FORM SECTIONS (editable by user)
   ================================================================ */
const DEFAULT_SECTIONS = [
  {
    id: 'project', title: 'Project Information', num: '01',
    fields: [
      { key: 'project_name', label: 'Project Name', type: 'text', placeholder: 'e.g. Grand Horizon Tower' },
      { key: 'developer_name', label: 'Developer Name', type: 'text', placeholder: 'e.g. Apex Developments' },
      { key: 'location', label: 'Location', type: 'text', placeholder: 'e.g. Banani, Dhaka' },
      { key: 'property_type', label: 'Property Type', type: 'select', options: ['','Residential','Commercial','Mixed-Use','Industrial','Hospitality','Land Development'] },
      { key: 'land_area', label: 'Land Area (sqft)', type: 'number', placeholder: '0' },
      { key: 'floors', label: 'Floors', type: 'number', placeholder: '0' },
      { key: 'project_duration', label: 'Duration (months)', type: 'number', placeholder: '0' },
    ]
  },
  {
    id: 'financial', title: 'Financial Information', num: '02',
    fields: [
      { key: 'land_cost', label: 'Land Cost', type: 'number', placeholder: '0' },
      { key: 'construction_cost', label: 'Construction Cost', type: 'number', placeholder: '0' },
      { key: 'other_cost', label: 'Other Costs', type: 'number', placeholder: '0' },
      { key: 'expected_revenue', label: 'Expected Revenue', type: 'number', placeholder: '0' },
      { key: 'expected_sales', label: 'Expected Sales', type: 'number', placeholder: '0' },
    ],
    hasLiveCalc: true
  },
  {
    id: 'details', title: 'Project Details', num: '03',
    fields: [
      { key: 'status', label: 'Status', type: 'select', options: ['','NEW','In Progress','Under Review','Approved','Rejected'] },
      { key: 'construction_start', label: 'Start Date', type: 'date' },
      { key: 'construction_end', label: 'End Date', type: 'date' },
      { key: 'funding_type', label: 'Funding Type', type: 'select', options: ['','Self-funded','Bank Loan','Joint Venture','Private Equity','Mixed'] },
    ]
  },
  {
    id: 'notes', title: 'Notes & Additional Info', num: '04',
    fields: [
      { key: 'notes', label: 'Additional Notes', type: 'textarea', placeholder: 'Any context, caveats, comparable deals…' },
    ]
  },
];

/* ================================================================
   UTILITY
   ================================================================ */
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

function rawNum(v) { if (!v) return ''; return String(v).replace(/[^0-9.]/g, ''); }
function fmtCommas(v) {
  if (!v) return '';
  const [i, d] = String(v).split('.');
  const t = i.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return d !== undefined ? `${t || '0'}.${d}` : t;
}
function fmtMoney(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + Math.round(n);
}
function cleanNum(str) { return Number(String(str || '0').replace(/[^0-9.]/g, '')) || 0; }

/* ================================================================
   NAVIGATION
   ================================================================ */
function switchView(name) {
  S.view = name;
  $$('.nav__btn').forEach(b => b.classList.toggle('is-active', b.dataset.view === name));
  $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + name));
  if (name === 'deals') renderDeals();
  if (name === 'reports') renderReports();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$$('.nav__btn').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
$('gotoNewDealBtn').addEventListener('click', () => switchView('dashboard'));

/* ================================================================
   THEME
   ================================================================ */
function setTheme(t) { document.documentElement.dataset.theme = t; localStorage.setItem(STORAGE.THEME, t); }
$('themeBtn').addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
});

/* ================================================================
   RENDER FORM SECTIONS (Dynamic / Editable)
   ================================================================ */
function loadSections() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE.SECTIONS));
    S.sections = saved && saved.length > 0 ? saved : JSON.parse(JSON.stringify(DEFAULT_SECTIONS));
  } catch { S.sections = JSON.parse(JSON.stringify(DEFAULT_SECTIONS)); }
}
function saveSections() { localStorage.setItem(STORAGE.SECTIONS, JSON.stringify(S.sections)); }

function renderFormSections() {
  const container = $('formSections');
  container.innerHTML = '';
  S.sections.forEach((sec, si) => {
    const div = document.createElement('div');
    div.className = 'form-section';
    div.dataset.section = sec.id;

    let fieldsHtml = '';
    sec.fields.forEach(f => {
      let inp = '';
      if (f.type === 'select') {
        const opts = (f.options || []).map(o => `<option value="${o}">${o || 'Select'}</option>`).join('');
        inp = `<select id="f_${f.key}" name="${f.key}">${opts}</select>`;
      } else if (f.type === 'textarea') {
        inp = `<textarea id="f_${f.key}" name="${f.key}" rows="3" placeholder="${f.placeholder || ''}"></textarea>`;
      } else if (f.type === 'date') {
        inp = `<input type="date" id="f_${f.key}" name="${f.key}">`;
      } else if (f.type === 'number') {
        inp = `<input type="text" id="f_${f.key}" name="${f.key}" placeholder="${f.placeholder || '0'}" data-numeric>`;
      } else {
        inp = `<input type="text" id="f_${f.key}" name="${f.key}" placeholder="${f.placeholder || ''}">`;
      }
      fieldsHtml += `<div class="field"><label for="f_${f.key}">${f.label}</label>${inp}</div>`;
    });

    // wrap fields in rows of 2
    const fieldEls = sec.fields;
    let rowsHtml = '';
    for (let i = 0; i < fieldEls.length; i += 2) {
      const cls = fieldEls.length - i >= 3 && (i + 3 <= fieldEls.length) ? '' : '';
      const f1 = fieldEls[i];
      const f2 = fieldEls[i + 1];
      let row = '<div class="form-row">';
      row += buildFieldHtml(f1);
      if (f2) row += buildFieldHtml(f2);
      row += '</div>';
      rowsHtml += row;
    }

    let calcHtml = '';
    if (sec.hasLiveCalc) {
      calcHtml = `<div class="live-calc" id="liveCalc">
        <div class="live-calc__item"><span>Total Cost</span><strong id="lcCost">—</strong></div>
        <div class="live-calc__item"><span>Revenue</span><strong id="lcRev">—</strong></div>
        <div class="live-calc__item live-calc__item--green"><span>Net Spread</span><strong id="lcSpread">—</strong></div>
        <div class="live-calc__item"><span>ROI</span><strong id="lcRoi">—</strong></div>
      </div>`;
    }

    div.innerHTML = `
      <div class="form-section__head">
        <div class="form-section__title"><span class="form-section__num">${sec.num}</span>${sec.title}</div>
      </div>
      ${rowsHtml}
      ${calcHtml}
    `;
    container.appendChild(div);
  });

  attachNumericFormatting();
  attachLiveCalc();
}

function buildFieldHtml(f) {
  if (!f) return '';
  let inp = '';
  if (f.type === 'select') {
    const opts = (f.options || []).map(o => `<option value="${o}">${o || 'Select'}</option>`).join('');
    inp = `<select id="f_${f.key}" name="${f.key}">${opts}</select>`;
  } else if (f.type === 'textarea') {
    inp = `<textarea id="f_${f.key}" name="${f.key}" rows="3" placeholder="${f.placeholder || ''}"></textarea>`;
  } else if (f.type === 'date') {
    inp = `<input type="date" id="f_${f.key}" name="${f.key}">`;
  } else if (f.type === 'number') {
    inp = `<input type="text" id="f_${f.key}" name="${f.key}" placeholder="${f.placeholder || '0'}" data-numeric>`;
  } else {
    inp = `<input type="text" id="f_${f.key}" name="${f.key}" placeholder="${f.placeholder || ''}">`;
  }
  return `<div class="field"><label for="f_${f.key}">${f.label}</label>${inp}</div>`;
}

function attachNumericFormatting() {
  $$('input[data-numeric]').forEach(inp => {
    inp.addEventListener('input', () => {
      const c = inp.value.length - inp.selectionStart;
      inp.value = fmtCommas(rawNum(inp.value));
      inp.setSelectionRange(Math.max(0, inp.value.length - c), Math.max(0, inp.value.length - c));
    });
  });
}

function attachLiveCalc() {
  const form = $('dealForm');
  if (!form) return;
  form.addEventListener('input', updateLiveCalc);
  form.addEventListener('change', updateLiveCalc);
}

function updateLiveCalc() {
  const lc = cleanNum($('f_land_cost')?.value);
  const cc = cleanNum($('f_construction_cost')?.value);
  const oc = cleanNum($('f_other_cost')?.value);
  const rev = cleanNum($('f_expected_revenue')?.value);
  const total = lc + cc + oc;
  const spread = rev - total;
  const roi = total > 0 ? ((spread / total) * 100).toFixed(1) : '—';

  if ($('lcCost')) $('lcCost').textContent = total > 0 ? '$' + fmtCommas(String(total)) : '—';
  if ($('lcRev')) $('lcRev').textContent = rev > 0 ? '$' + fmtCommas(String(rev)) : '—';
  if ($('lcSpread')) $('lcSpread').textContent = total > 0 && rev > 0 ? `${spread >= 0 ? '+' : '−'}$${fmtCommas(String(Math.abs(spread)))}` : '—';
  if ($('lcRoi')) $('lcRoi').textContent = roi !== '—' ? roi + '%' : '—';
}

/* ================================================================
   EDIT SECTIONS MODAL
   ================================================================ */
$('editSectionsBtn').addEventListener('click', openEditSections);
$('editSectionsCloseBtn').addEventListener('click', closeEditSections);
$('editSectionsOverlay').addEventListener('click', e => { if (e.target === $('editSectionsOverlay')) closeEditSections(); });

function openEditSections() {
  renderEditSections();
  $('editSectionsOverlay').classList.add('is-open');
}
function closeEditSections() { $('editSectionsOverlay').classList.remove('is-open'); }

function renderEditSections() {
  const body = $('editSectionsBody');
  body.innerHTML = '';
  S.sections.forEach((sec, si) => {
    let html = `<div class="edit-section-item"><span class="edit-section-item__name">${sec.num}. ${sec.title}</span></div>`;
    sec.fields.forEach((f, fi) => {
      html += `<div class="edit-field-item"><span class="edit-field-item__label">${f.label} <small style="color:var(--text-3);">(${f.type})</small></span><button class="edit-field-item__del" data-si="${si}" data-fi="${fi}" title="Remove field">✕</button></div>`;
    });
    html += `<div class="add-field-row">
      <input type="text" placeholder="Field label…" id="newLabel_${si}">
      <select id="newType_${si}"><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="textarea">Textarea</option></select>
      <button class="btn btn--sm btn--gold" data-si="${si}" id="addFieldBtn_${si}">+ Add</button>
    </div>`;
    body.insertAdjacentHTML('beforeend', html);
  });

  // Bind delete buttons
  body.querySelectorAll('.edit-field-item__del').forEach(btn => {
    btn.addEventListener('click', () => {
      const si = Number(btn.dataset.si);
      const fi = Number(btn.dataset.fi);
      S.sections[si].fields.splice(fi, 1);
      renderEditSections();
    });
  });

  // Bind add buttons
  S.sections.forEach((sec, si) => {
    const addBtn = $(`addFieldBtn_${si}`);
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const label = $(`newLabel_${si}`).value.trim();
        const type = $(`newType_${si}`).value;
        if (!label) return;
        const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        S.sections[si].fields.push({ key, label, type, placeholder: '' });
        renderEditSections();
      });
    }
  });
}

$('saveSectionsBtn').addEventListener('click', () => {
  saveSections();
  renderFormSections();
  closeEditSections();
  toast('Form sections updated!', 'ok');
});

$('resetSectionsBtn').addEventListener('click', () => {
  S.sections = JSON.parse(JSON.stringify(DEFAULT_SECTIONS));
  saveSections();
  renderFormSections();
  renderEditSections();
  toast('Sections reset to default', 'ok');
});

/* ================================================================
   GOOGLE SHEET CSV FETCH (ALL 4 TABS)
   ================================================================ */
async function fetchSheetCsv(gid) {
  try {
    const res = await fetch(CONFIG.csvUrl(gid));
    if (!res.ok) return [];
    const text = await res.text();
    return parseCsv(text);
  } catch (e) {
    console.warn(`Sheet gid=${gid} fetch error:`, e);
    return [];
  }
}

function parseCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvRow(lines[0]).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
  const deals = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    if (row.length === 0) continue;
    const d = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      let val = (row[idx] || '').replace(/^"|"$/g, '').trim();
      d[h] = val;
    });
    // Skip formula/instruction rows (rows without a proper Deal_ID)
    if (!d.deal_id || d.deal_id.length > 20 || d.deal_id.includes('FORMULA') || d.deal_id.includes('VIEW') || d.deal_id.includes('AI ')) continue;
    deals.push(d);
  }
  return deals;
}

function parseCsvRow(str) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += c; }
  }
  result.push(cur);
  return result;
}

/* ================================================================
   LOAD DEALS — Fetch all 4 sheets, merge by Deal_ID
   ================================================================ */
async function loadDeals(showToast = false) {
  const btn = $('refreshBtn');
  if (btn) btn.classList.add('is-spinning');

  // Fetch all 4 sheets in parallel
  const [inputRows, execRows, assumRows, riskRows] = await Promise.all([
    fetchSheetCsv(CONFIG.SHEETS.INPUT_DATA.gid),
    fetchSheetCsv(CONFIG.SHEETS.EXECUTIVE_SUMMARY.gid),
    fetchSheetCsv(CONFIG.SHEETS.DEAL_ASSUMPTIONS.gid),
    fetchSheetCsv(CONFIG.SHEETS.RISK_RECOMMENDATION.gid),
  ]);

  // Build merged map by deal_id
  const map = new Map();

  // 1. Input Data (base)
  inputRows.forEach(d => {
    if (d.deal_id) map.set(d.deal_id, { ...d, _source: 'input' });
  });

  // 2. Executive Summary — merge (has PDF/PPT links!)
  execRows.forEach(d => {
    if (!d.deal_id) return;
    const existing = map.get(d.deal_id) || {};
    map.set(d.deal_id, { ...existing, ...d,
      // Map column names to standard keys
      pdf_link: d.ic_memo_pdf || d.pdf_link || existing.pdf_link || '',
      ppt_link: d.investor_deck_ppt || d.ppt_link || existing.ppt_link || '',
    });
  });

  // 3. Deal Assumptions — merge
  assumRows.forEach(d => {
    if (!d.deal_id) return;
    const existing = map.get(d.deal_id) || {};
    map.set(d.deal_id, { ...existing,
      cost_per_sqft: d.cost_per_sqft || existing.cost_per_sqft || '',
      revenue_per_sqft: d.revenue_per_sqft || existing.revenue_per_sqft || '',
      deal_score: d.deal_score || existing.deal_score || '',
      deal_category: d.deal_category || existing.deal_category || '',
      rule_version: d.rule_version || existing.rule_version || '',
      projected_profit: d.projected_profit || existing.projected_profit || '',
      roi_percent: d.roi_percent || existing.roi_percent || '',
      profit_margin_percent: d.profit_margin_percent || existing.profit_margin_percent || '',
    });
  });

  // 4. Risk & Recommendation — merge
  riskRows.forEach(d => {
    if (!d.deal_id) return;
    const existing = map.get(d.deal_id) || {};
    map.set(d.deal_id, { ...existing,
      ai_recommendation: d.ai_recommendation || existing.ai_recommendation || '',
      final_decision: d.final_decision || existing.final_decision || '',
      underwriting_summary: d.underwriting_summary || existing.underwriting_summary || '',
      strengths: d.strengths || existing.strengths || '',
      risks: d.risks || existing.risks || '',
      missing_information: d.missing_information || existing.missing_information || '',
      recommendation_reason: d.recommendation_reason || existing.recommendation_reason || '',
    });
  });

  // Merge local storage deals
  const local = getLocalDeals();
  local.forEach(d => {
    if (!d.deal_id) return;
    if (!map.has(d.deal_id)) map.set(d.deal_id, d);
  });

  S.deals = Array.from(map.values());

  updateStats();
  if (S.view === 'deals') renderDeals();
  if (S.view === 'reports') renderReports();

  if (btn) btn.classList.remove('is-spinning');
  if (showToast) toast(`Loaded ${S.deals.length} deals from ${Object.keys(CONFIG.SHEETS).length} sheets`, 'ok');
}

function getLocalDeals() {
  try { return JSON.parse(localStorage.getItem(STORAGE.DEALS) || '[]'); } catch { return []; }
}
function saveLocalDeal(d) {
  const list = getLocalDeals();
  const idx = list.findIndex(x => x.deal_id === d.deal_id);
  if (idx >= 0) list[idx] = d; else list.unshift(d);
  localStorage.setItem(STORAGE.DEALS, JSON.stringify(list));
}

/* ================================================================
   REFRESH BUTTON
   ================================================================ */
$('refreshBtn').addEventListener('click', () => loadDeals(true));
$('refreshDealsBtn').addEventListener('click', () => loadDeals(true));

/* ================================================================
   STATS
   ================================================================ */
function updateStats() {
  const n = S.deals.length;
  let cap = 0, rev = 0;
  S.deals.forEach(d => {
    cap += cleanNum(d.land_cost) + cleanNum(d.construction_cost) + cleanNum(d.other_cost);
    rev += cleanNum(d.expected_revenue);
  });
  $('statTotal').textContent = n;
  $('statCapital').textContent = fmtMoney(cap);
  $('statSpread').textContent = fmtMoney(rev - cap);
}

/* ================================================================
   QUICK FILL & CLEAR
   ================================================================ */
$('quickFillBtn').addEventListener('click', () => {
  const sample = {
    project_name: 'Willow Creek Residences', developer_name: 'Apex Developments',
    location: 'Banani, Dhaka', property_type: 'Residential', land_area: '18500', floors: '18',
    project_duration: '36', land_cost: '25000000', construction_cost: '45000000',
    other_cost: '5000000', expected_revenue: '98000000', expected_sales: '90000000',
    status: 'NEW',
    construction_start: new Date().toISOString().split('T')[0],
    construction_end: new Date(Date.now() + 1e10).toISOString().split('T')[0],
    funding_type: 'Joint Venture',
    notes: 'All zoning permits secured. High residential demand corridor.',
  };
  S.sections.forEach(sec => sec.fields.forEach(f => {
    const el = $('f_' + f.key);
    if (!el || !sample[f.key]) return;
    el.value = f.type === 'number' ? fmtCommas(sample[f.key]) : sample[f.key];
  }));
  updateLiveCalc();
  toast('Sample data loaded', 'ok');
});

$('clearFormBtn').addEventListener('click', () => {
  $('dealForm').reset();
  updateLiveCalc();
  toast('Form cleared', 'ok');
});

/* ================================================================
   BUILD PAYLOAD & SUBMIT
   ================================================================ */
function buildPayload() {
  const p = { deal_id: 'DEAL-' + Date.now().toString().slice(-6), submitted_at: new Date().toISOString() };
  S.sections.forEach(sec => sec.fields.forEach(f => {
    const el = $('f_' + f.key);
    if (!el) return;
    p[f.key] = f.type === 'number' ? rawNum(el.value) : el.value.trim();
  }));
  // Pre-calc
  const lc = cleanNum(p.land_cost), cc = cleanNum(p.construction_cost), oc = cleanNum(p.other_cost);
  const rev = cleanNum(p.expected_revenue);
  p.total_cost = lc + cc + oc;
  p.net_spread = rev - p.total_cost;
  p.roi_percent = p.total_cost > 0 ? Number(((p.net_spread / p.total_cost) * 100).toFixed(2)) : 0;
  return p;
}

$('dealForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (S.submitting) return;
  const payload = buildPayload();
  S.submitting = true;
  $('submitBtn').disabled = true;
  $('loadingOverlay').classList.add('is-open');

  let ok = false;
  try {
    const r = await fetch(CONFIG.SUBMIT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (r.ok) ok = true;
  } catch (e) { console.warn('Submit error:', e); }

  saveLocalDeal(payload);
  S.submitting = false;
  $('submitBtn').disabled = false;
  $('loadingOverlay').classList.remove('is-open');

  toast(ok ? `Deal ${payload.deal_id} submitted!` : `Deal ${payload.deal_id} saved locally`, 'ok');
  $('dealForm').reset();
  updateLiveCalc();
  loadDeals();
  switchView('deals');
});

/* ================================================================
   DEALS VIEW
   ================================================================ */
function renderDeals() {
  const grid = $('dealsGrid');
  const q = ($('searchInput').value || '').toLowerCase();
  const ft = $('filterType').value;
  const sort = $('filterSort').value;

  let list = [...S.deals];
  if (q) list = list.filter(d => [d.project_name, d.developer_name, d.location, d.deal_id].some(v => (v || '').toLowerCase().includes(q)));
  if (ft) list = list.filter(d => (d.property_type || d.project_type || '') === ft);
  if (sort === 'cost-desc') list.sort((a, b) => (cleanNum(b.total_cost || b.land_cost) + cleanNum(b.construction_cost)) - (cleanNum(a.total_cost || a.land_cost) + cleanNum(a.construction_cost)));
  else if (sort === 'cost-asc') list.sort((a, b) => (cleanNum(a.total_cost || a.land_cost) + cleanNum(a.construction_cost)) - (cleanNum(b.total_cost || b.land_cost) + cleanNum(b.construction_cost)));
  else list.sort((a, b) => (b.submitted_at || b.created_at || '').localeCompare(a.submitted_at || a.created_at || ''));

  grid.innerHTML = '';
  if (list.length === 0) {
    grid.innerHTML = '<div class="empty-state"><p>No deals found. Submit your first deal or click Refresh to load from Google Sheet.</p></div>';
    return;
  }

  list.forEach(d => {
    const cost = cleanNum(d.total_cost) || (cleanNum(d.land_cost) + cleanNum(d.construction_cost) + cleanNum(d.other_cost));
    const rev = cleanNum(d.expected_revenue);
    const score = d.deal_score || '';
    const category = (d.deal_category || '').toUpperCase();
    const decision = (d.final_decision || d.status || '').toUpperCase();

    // Status badge color
    let statusClass = '';
    if (decision === 'PROCEED' || decision === 'NEW') statusClass = 'deal-card__status--new';

    // Score badge
    let scoreBadge = '';
    if (score) {
      const scoreColor = Number(score) >= 70 ? 'var(--green)' : Number(score) >= 40 ? 'var(--gold)' : 'var(--red)';
      scoreBadge = `<div class="deal-card__score" style="color:${scoreColor}"><strong>${score}</strong>/100</div>`;
    }

    // Download buttons
    let downloads = '';
    if (d.pdf_link || d.ppt_link) {
      downloads = '<div class="deal-card__downloads">';
      if (d.pdf_link) downloads += `<a class="dl-btn" href="${d.pdf_link}" target="_blank" rel="noopener" onclick="event.stopPropagation()">📄 PDF</a>`;
      if (d.ppt_link) downloads += `<a class="dl-btn" href="${d.ppt_link}" target="_blank" rel="noopener" onclick="event.stopPropagation()">📊 PPT</a>`;
      downloads += '</div>';
    }

    const card = document.createElement('div');
    card.className = 'deal-card';
    card.innerHTML = `
      <div class="deal-card__top">
        <span class="deal-card__id">${d.deal_id || '—'}</span>
        <span class="deal-card__status ${statusClass}">${decision || 'Active'}${category ? ' · ' + category : ''}</span>
      </div>
      <div class="deal-card__name">${d.project_name || 'Untitled'}</div>
      <div class="deal-card__meta">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        ${d.location || '—'} · ${d.property_type || '—'}
      </div>
      <dl class="deal-card__nums">
        <div><dt>Total Cost</dt><dd>$${fmtCommas(String(cost))}</dd></div>
        <div><dt>Revenue</dt><dd>$${fmtCommas(String(rev))}</dd></div>
      </dl>
      ${scoreBadge}
      ${downloads}
      <div class="deal-card__arrow">View Details →</div>
    `;
    card.addEventListener('click', () => openModal(d.deal_id));
    grid.appendChild(card);
  });
}

$('searchInput').addEventListener('input', renderDeals);
$('filterType').addEventListener('change', renderDeals);
$('filterSort').addEventListener('change', renderDeals);

/* ================================================================
   DEAL DETAIL MODAL — Shows data from all 4 sheets
   ================================================================ */
function openModal(id) {
  const d = S.deals.find(x => x.deal_id === id);
  if (!d) return;
  S.currentDeal = d;

  const cost = cleanNum(d.total_cost) || (cleanNum(d.land_cost) + cleanNum(d.construction_cost) + cleanNum(d.other_cost));
  const rev = cleanNum(d.expected_revenue);
  const profit = cleanNum(d.projected_profit) || (rev - cost);
  const roi = d.roi_percent || (cost > 0 ? ((profit / cost) * 100).toFixed(1) : '0');
  const margin = d.profit_margin_percent || (rev > 0 ? ((profit / rev) * 100).toFixed(1) : '0');

  $('modalBadge').textContent = d.deal_id;
  $('modalTitle').textContent = d.project_name || 'Untitled';
  $('modalSub').textContent = [d.location, d.property_type].filter(Boolean).join(' · ');

  let html = '';

  // ── Decision Banner ──
  if (d.final_decision || d.deal_score) {
    const dec = (d.final_decision || '').toUpperCase();
    const cat = (d.deal_category || '').toUpperCase();
    const decColor = dec === 'PROCEED' ? 'var(--green)' : dec === 'REJECT' ? 'var(--red)' : 'var(--gold)';
    html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:var(--surface-2);border-radius:var(--radius-sm);margin-bottom:20px;">
      <div><span style="font-size:12px;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;">AI Decision</span>
      <div style="font-size:20px;font-weight:800;color:${decColor};">${dec || '—'} ${cat ? '· <span style="font-size:14px;color:var(--text-2);">' + cat + '</span>' : ''}</div></div>
      <div style="text-align:center;"><span style="font-size:28px;font-weight:800;">${d.deal_score || '—'}</span><div style="font-size:10px;color:var(--text-3);">SCORE</div></div>
    </div>`;
  }

  // ── Financial Summary Row ──
  html += `<div class="exec-row" style="margin-bottom:24px;">
    <div class="exec-box"><span class="exec-box__val">$${fmtCommas(String(cost))}</span><span class="exec-box__lab">Total Cost</span></div>
    <div class="exec-box"><span class="exec-box__val">$${fmtCommas(String(rev))}</span><span class="exec-box__lab">Revenue</span></div>
    <div class="exec-box"><span class="exec-box__val" style="color:var(--green)">$${fmtCommas(String(profit))}</span><span class="exec-box__lab">Profit</span></div>
    <div class="exec-box"><span class="exec-box__val">${roi}%</span><span class="exec-box__lab">ROI</span></div>
  </div>`;

  // ── Project Details Grid ──
  html += '<dl class="detail-grid">';
  const projectKeys = [
    ['project_name','Project Name'], ['location','Location'], ['property_type','Property Type'],
    ['land_area','Land Area'], ['project_duration','Duration (months)'], ['status','Status'],
    ['land_cost','Land Cost'], ['construction_cost','Construction Cost'], ['other_cost','Other Costs'],
    ['cost_per_sqft','Cost/sqft'], ['revenue_per_sqft','Revenue/sqft'], ['profit_margin_percent','Profit Margin %'],
    ['funding_type','Funding'], ['rule_version','Rule Version'], ['created_at','Created'],
  ];
  projectKeys.forEach(([k, label]) => {
    if (d[k]) html += `<div class="detail-item"><dt>${label}</dt><dd>${d[k]}</dd></div>`;
  });
  html += '</dl>';

  // ── Underwriting Summary ──
  if (d.underwriting_summary) {
    html += `<div style="margin-top:20px;padding:16px;background:var(--surface-2);border-radius:var(--radius-sm);border-left:3px solid var(--gold);">
      <h4 style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:8px;">Underwriting Summary</h4>
      <p style="font-size:13px;line-height:1.7;color:var(--text-2);">${d.underwriting_summary}</p>
    </div>`;
  }

  // ── Strengths ──
  if (d.strengths) {
    html += `<div style="margin-top:14px;padding:14px 16px;background:var(--green-bg);border-radius:var(--radius-sm);border-left:3px solid var(--green);">
      <h4 style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--green);margin-bottom:8px;">✓ Strengths</h4>
      <div style="font-size:13px;line-height:1.8;color:var(--text);white-space:pre-wrap;">${d.strengths}</div>
    </div>`;
  }

  // ── Risks ──
  if (d.risks) {
    html += `<div style="margin-top:14px;padding:14px 16px;background:var(--red-bg);border-radius:var(--radius-sm);border-left:3px solid var(--red);">
      <h4 style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--red);margin-bottom:8px;">⚠ Risks</h4>
      <div style="font-size:13px;line-height:1.8;color:var(--text);white-space:pre-wrap;">${d.risks}</div>
    </div>`;
  }

  // ── Missing Information ──
  if (d.missing_information) {
    html += `<div style="margin-top:14px;padding:14px 16px;background:var(--blue-bg);border-radius:var(--radius-sm);border-left:3px solid var(--blue);">
      <h4 style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--blue);margin-bottom:8px;">ℹ Missing Information</h4>
      <div style="font-size:13px;line-height:1.8;color:var(--text);white-space:pre-wrap;">${d.missing_information}</div>
    </div>`;
  }

  // ── Recommendation Reason ──
  if (d.recommendation_reason) {
    html += `<div style="margin-top:14px;padding:14px 16px;background:var(--surface-2);border-radius:var(--radius-sm);border-left:3px solid var(--navy);">
      <h4 style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:8px;">Recommendation Reason</h4>
      <p style="font-size:13px;line-height:1.7;color:var(--text-2);">${d.recommendation_reason}</p>
    </div>`;
  }

  // ── Notes ──
  if (d.notes) {
    html += `<div style="margin-top:14px;padding:14px 16px;background:var(--surface-2);border-radius:var(--radius-sm);">
      <h4 style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:6px;">Notes</h4>
      <p style="font-size:13px;color:var(--text-2);white-space:pre-wrap;">${d.notes}</p>
    </div>`;
  }

  // ── Download Links ──
  const dlLinks = [];
  if (d.pdf_link) dlLinks.push(`<a class="dl-btn" href="${d.pdf_link}" target="_blank">📄 Download IC Memo PDF</a>`);
  if (d.ppt_link) dlLinks.push(`<a class="dl-btn" href="${d.ppt_link}" target="_blank">📊 Download Investor Deck PPT</a>`);
  if (dlLinks.length > 0) {
    html += `<div class="modal-downloads"><h4>Documents & Downloads</h4><div class="modal-downloads__list">${dlLinks.join('')}</div></div>`;
  }

  $('modalBody').innerHTML = html;
  $('modalOverlay').classList.add('is-open');
}

function closeModal() { $('modalOverlay').classList.remove('is-open'); S.currentDeal = null; }
$('modalCloseBtn').addEventListener('click', closeModal);
$('modalCloseFootBtn').addEventListener('click', closeModal);
$('modalOverlay').addEventListener('click', e => { if (e.target === $('modalOverlay')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeEditSections(); } });

$('modalPrintBtn').addEventListener('click', () => window.print());
$('modalExportBtn').addEventListener('click', () => {
  if (!S.currentDeal) return;
  const blob = new Blob([JSON.stringify(S.currentDeal, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `${S.currentDeal.deal_id}_underwriting.json`; a.click();
});

/* ================================================================
   REPORTS
   ================================================================ */
function renderReports() {
  const deals = S.deals;
  const typeCounts = {}, statusCounts = {};
  let totalCap = 0, totalRev = 0, roiSum = 0;

  deals.forEach(d => {
    const c = cleanNum(d.land_cost) + cleanNum(d.construction_cost) + cleanNum(d.other_cost);
    const r = cleanNum(d.expected_revenue);
    totalCap += c; totalRev += r;
    roiSum += c > 0 ? ((r - c) / c) * 100 : 0;
    const type = d.property_type || d.project_type || 'Other';
    typeCounts[type] = (typeCounts[type] || 0) + c;
    const status = d.status || 'Unknown';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  $('execCap').textContent = fmtMoney(totalCap);
  $('execRev').textContent = fmtMoney(totalRev);
  $('execSpread').textContent = fmtMoney(totalRev - totalCap);
  $('execRoi').textContent = deals.length > 0 ? (roiSum / deals.length).toFixed(1) + '%' : '0%';

  renderBars($('chartAsset'), typeCounts, totalCap, true, 'gold');
  renderBars($('chartStatus'), statusCounts, deals.length, false, 'navy');
}

function renderBars(container, obj, total, isMoney, color) {
  container.innerHTML = '';
  if (Object.keys(obj).length === 0) { container.innerHTML = '<p style="color:var(--text-3);font-size:12px;">No data yet</p>'; return; }
  Object.entries(obj).forEach(([label, val]) => {
    const pct = total > 0 ? Math.round((val / total) * 100) : 0;
    const display = isMoney ? fmtMoney(val) + ` (${pct}%)` : `${val} deals (${pct}%)`;
    container.insertAdjacentHTML('beforeend', `
      <div class="bar-item">
        <div class="bar-item__head"><span>${label}</span><span style="font-weight:700;">${display}</span></div>
        <div class="bar-item__track"><div class="bar-item__fill bar-item__fill--${color}" style="width:${Math.max(pct, 4)}%;"></div></div>
      </div>
    `);
  });
}

$('exportCsvBtn').addEventListener('click', () => {
  if (S.deals.length === 0) { toast('No deals to export', 'err'); return; }
  const keys = Object.keys(S.deals[0]);
  let csv = keys.join(',') + '\n';
  S.deals.forEach(d => { csv += keys.map(k => `"${String(d[k] || '').replace(/"/g, '""')}"`).join(',') + '\n'; });
  const b = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'underwriting_pipeline.csv'; a.click();
});

/* ================================================================
   TOAST
   ================================================================ */
function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.textContent = msg;
  $('toastWrap').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 200); }, 3500);
}

/* ================================================================
   INIT
   ================================================================ */
function init() {
  setTheme(localStorage.getItem(STORAGE.THEME) || 'light');
  loadSections();
  renderFormSections();
  updateLiveCalc();
  loadDeals();
  $('liveDate').textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

init();