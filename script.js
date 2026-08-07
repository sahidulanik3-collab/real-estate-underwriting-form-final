'use strict';

/* ================================================================
   CONFIG & STORAGE
   ================================================================ */
const STORAGE = { DEALS: 'mcp_deals_v3', SETTINGS: 'mcp_cfg_v3', DRAFT: 'mcp_draft_v3', THEME: 'mcp_theme' };

const DEFAULTS = {
  submitUrl: 'https://n8n-scad.srv1492862.hstgr.cloud/webhook/19ee0d89-5430-444d-b1a7-a3493220a483',
  getDealsUrl: 'https://n8n-scad.srv1492862.hstgr.cloud/webhook/get-deals',
  sheetUrl: '',
};

const SYM = { BDT: '৳', USD: '$', EUR: '€', GBP: '£' };

/* ================================================================
   STATE
   ================================================================ */
const S = {
  view: 'dashboard',
  op: 'new',
  deals: [],
  cfg: { ...DEFAULTS },
  submitting: false,
  currentDeal: null,
};

/* ================================================================
   FIELD DEFINITIONS
   ================================================================ */
const FIELDS = [
  { k:'project_name',       id:'projectName',       req:true,  sec:'project', numType:null },
  { k:'developer_name',     id:'developerName',     req:true,  sec:'project', numType:null },
  { k:'location',           id:'location',          req:true,  sec:'project', numType:null },
  { k:'district',           id:'district',          req:true,  sec:'project', numType:null },
  { k:'project_type',       id:'projectType',       req:true,  sec:'project', numType:null },
  { k:'priority',           id:'priority',          req:true,  sec:'project', numType:null },
  { k:'land_area',          id:'landArea',          req:true,  sec:'project', numType:'num' },
  { k:'floors',             id:'floors',            req:true,  sec:'project', numType:'num' },
  { k:'project_duration',   id:'projectDuration',   req:true,  sec:'project', numType:'num' },
  { k:'currency',           id:'currency',          req:true,  sec:'financial', numType:null },
  { k:'land_cost',          id:'landCost',          req:true,  sec:'financial', numType:'num' },
  { k:'construction_cost',  id:'constructionCost',  req:true,  sec:'financial', numType:'num' },
  { k:'other_cost',         id:'otherCost',         req:false, sec:'financial', numType:'num' },
  { k:'expected_revenue',   id:'expectedRevenue',   req:true,  sec:'financial', numType:'num' },
  { k:'expected_sales',     id:'expectedSales',     req:true,  sec:'financial', numType:'num' },
  { k:'expected_rental_income', id:'expectedRentalIncome', req:false, sec:'financial', numType:'num' },
  { k:'expected_exit_value',id:'expectedExitValue', req:true,  sec:'financial', numType:'num' },
  { k:'construction_start', id:'constructionStart', req:true,  sec:'details', numType:null },
  { k:'construction_end',   id:'constructionEnd',   req:true,  sec:'details', numType:null },
  { k:'funding_type',       id:'fundingType',       req:true,  sec:'details', numType:null },
  { k:'land_ownership',     id:'landOwnership',     req:true,  sec:'details', numType:null },
  { k:'developer_experience', id:'developerExperience', req:true, sec:'details', numType:null },
  { k:'legal_status',       id:'legalStatus',       req:true,  sec:'risk', numType:null },
  { k:'site_condition',     id:'siteCondition',     req:true,  sec:'risk', numType:null },
  { k:'environmental_risk', id:'environmentalRisk', req:true,  sec:'risk', numType:null },
  { k:'market_demand',      id:'marketDemand',      req:true,  sec:'risk', numType:null },
  { k:'competition_level',  id:'competitionLevel',  req:true,  sec:'risk', numType:null },
  { k:'notes',              id:'notes',             req:false, sec:'notes', numType:null },
];

/* ================================================================
   DOM
   ================================================================ */
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

/* ================================================================
   UTILITY: NUMBER FORMATTING
   ================================================================ */
function rawNum(v) {
  if (!v) return '';
  let c = String(v).replace(/[^0-9.]/g, '');
  const p = c.split('.');
  if (p.length > 2) c = p[0] + '.' + p.slice(1).join('');
  return c;
}
function fmtCommas(v) {
  if (!v) return '';
  const [i, d] = v.split('.');
  const t = i.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return d !== undefined ? `${t || '0'}.${d}` : t;
}
function getNum(el) { return rawNum(el.value); }
function fmtMoney(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n;
}

function attachNumericFormatting() {
  $$('input[data-numeric]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const caret = inp.value.length - inp.selectionStart;
      const formatted = fmtCommas(rawNum(inp.value));
      inp.value = formatted;
      inp.setSelectionRange(Math.max(0, formatted.length - caret), Math.max(0, formatted.length - caret));
      updateLiveSummary();
    });
    inp.addEventListener('blur', () => { inp.value = fmtCommas(rawNum(inp.value)); });
  });
}

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
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem(STORAGE.THEME, t);
}
$('themeBtn').addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
});

/* ================================================================
   OPERATION TOGGLE
   ================================================================ */
function setOp(op) {
  S.op = op;
  $('opNewBtn').classList.toggle('is-active', op === 'new');
  $('opUpdateBtn').classList.toggle('is-active', op === 'update');
  $('dealIdSection').style.display = op === 'update' ? '' : 'none';
  if (op === 'update' && S.deals.length === 0) loadDeals();
}
$('opNewBtn').addEventListener('click', () => setOp('new'));
$('opUpdateBtn').addEventListener('click', () => setOp('update'));

/* ================================================================
   LOAD DEALS (API + LOCAL STORAGE FALLBACK)
   ================================================================ */
async function loadDeals() {
  let fetched = [];
  const targetUrl = S.cfg.getDealsUrl || S.cfg.sheetUrl;

  if (targetUrl) {
    try {
      // Check if URL is a Google Sheet URL
      if (targetUrl.includes('docs.google.com/spreadsheets')) {
        fetched = await fetchGoogleSheetCsv(targetUrl);
      } else {
        const r = await fetch(targetUrl, { headers: { 'Accept': 'application/json' } });
        if (r.ok) {
          const d = await r.json();
          fetched = normalizeDeals(d);
        }
      }
    } catch (e) {
      console.warn('Network fetch error, falling back to local deals:', e);
    }
  }

  const local = getLocalDeals();
  const map = new Map();
  local.forEach(d => d && d.deal_id && map.set(d.deal_id, d));
  fetched.forEach(d => d && d.deal_id && map.set(d.deal_id, d));
  S.deals = Array.from(map.values());

  updateDealSelect();
  updateStats();
  if (S.view === 'deals') renderDeals();
}

/* Parse Google Sheet CSV Directly */
async function fetchGoogleSheetCsv(url) {
  let csvUrl = url;
  // Convert standard Google Sheet URL to CSV export URL if needed
  if (!url.includes('output=csv') && !url.includes('/export?format=csv')) {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      csvUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv`;
    }
  }

  const res = await fetch(csvUrl);
  if (!res.ok) return [];
  const text = await res.text();
  return parseCsvToDeals(text);
}

function parseCsvToDeals(csvText) {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvRow(lines[0]).map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
  const deals = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    if (row.length === 0) continue;
    const deal = {};
    headers.forEach((h, idx) => {
      let val = row[idx] ? row[idx].trim() : '';
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      deal[h] = val;
    });
    if (!deal.deal_id) deal.deal_id = 'DEAL-GS-' + (i);
    deals.push(deal);
  }
  return deals;
}

function parseCsvRow(rowStr) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < rowStr.length; i++) {
    const char = rowStr[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function normalizeDeals(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data.map(i => i && i.json ? i.json : i);
  if (data.deals) return data.deals;
  if (data.data) return data.data;
  return [];
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

function updateDealSelect() {
  const sel = $('dealIdSelect');
  sel.innerHTML = '';
  if (S.deals.length === 0) {
    sel.innerHTML = '<option value="">No deals found</option>';
    return;
  }
  sel.innerHTML = '<option value="">Select a deal…</option>';
  S.deals.forEach(d => {
    const o = document.createElement('option');
    o.value = d.deal_id;
    o.textContent = `${d.deal_id} — ${d.project_name || 'Untitled'}`;
    sel.appendChild(o);
  });
}

$('dealIdSelect').addEventListener('change', () => {
  const deal = S.deals.find(d => d.deal_id === $('dealIdSelect').value);
  if (deal) {
    FIELDS.forEach(f => {
      const el = $(f.id);
      if (!el || deal[f.k] === undefined) return;
      el.value = f.numType === 'num' ? fmtCommas(String(deal[f.k])) : deal[f.k];
    });
    updateLiveSummary();
    toast('Deal data loaded', 'ok');
  }
});

$('refreshDealsBtn').addEventListener('click', loadDeals);

/* ================================================================
   LIVE SUMMARY (REAL-TIME FINANCIAL CALCULATIONS)
   ================================================================ */
function updateLiveSummary() {
  const sym = SYM[$('currency').value] || '$';
  const lc = Number(getNum($('landCost'))) || 0;
  const cc = Number(getNum($('constructionCost'))) || 0;
  const oc = Number(getNum($('otherCost'))) || 0;
  const rev = Number(getNum($('expectedRevenue'))) || 0;
  const total = lc + cc + oc;
  const spread = rev - total;
  const roi = total > 0 ? ((spread / total) * 100).toFixed(1) : '—';

  $('lsTotalCost').textContent = total > 0 ? `${sym}${fmtCommas(String(total))}` : '—';
  $('lsRevenue').textContent = rev > 0 ? `${sym}${fmtCommas(String(rev))}` : '—';
  $('lsSpread').textContent = total > 0 && rev > 0 ? `${spread >= 0 ? '+' : '−'}${sym}${fmtCommas(String(Math.abs(spread)))}` : '—';
  $('lsRoi').textContent = roi !== '—' ? `${roi}%` : '—';
}

$$('#dealForm input, #dealForm select, #dealForm textarea').forEach(el => {
  el.addEventListener('input', updateLiveSummary);
  el.addEventListener('change', updateLiveSummary);
});

/* ================================================================
   STATS
   ================================================================ */
function updateStats() {
  const n = S.deals.length;
  let cap = 0, rev = 0, active = 0;
  S.deals.forEach(d => {
    const c = Number(d.land_cost||0) + Number(d.construction_cost||0) + Number(d.other_cost||0);
    cap += c;
    rev += Number(d.expected_revenue||0);
    if (d.priority === 'High' || d.priority === 'Critical') active++;
  });
  $('statTotal').textContent = n;
  $('statCapital').textContent = fmtMoney(cap);
  $('statSpread').textContent = fmtMoney(rev - cap);
  $('statActive').textContent = active;
}

/* ================================================================
   QUICK FILL
   ================================================================ */
$('quickFillBtn').addEventListener('click', () => {
  const sample = {
    project_name:'Willow Creek Residences', developer_name:'Apex Developments', location:'Road 11, Banani',
    district:'Dhaka', project_type:'Residential', priority:'High', land_area:'18500', floors:'18',
    project_duration:'36', currency:'USD', land_cost:'25000000', construction_cost:'45000000',
    other_cost:'5000000', expected_revenue:'98000000', expected_sales:'90000000',
    expected_rental_income:'8000000', expected_exit_value:'105000000',
    construction_start: new Date().toISOString().split('T')[0],
    construction_end: new Date(Date.now() + 1e10).toISOString().split('T')[0],
    funding_type:'Joint Venture', land_ownership:'Freehold', developer_experience:'4-10 Projects',
    legal_status:'Clear Title', site_condition:'Ready to Build', environmental_risk:'Low',
    market_demand:'High', competition_level:'Medium',
    notes:'All zoning permits secured. High residential demand corridor.',
  };
  FIELDS.forEach(f => {
    const el = $(f.id);
    if (!el || !sample[f.k]) return;
    el.value = f.numType === 'num' ? fmtCommas(sample[f.k]) : sample[f.k];
    clearErr(f.id);
  });
  updateLiveSummary();
  toast('Sample data loaded', 'ok');
});

$('clearFormBtn').addEventListener('click', () => {
  $('dealForm').reset();
  clearAllErr();
  setOp('new');
  updateLiveSummary();
  toast('Form cleared', 'ok');
});

/* ================================================================
   VALIDATION
   ================================================================ */
function setErr(id, msg) {
  const el = $(id); if (!el) return;
  const f = el.closest('.field'); if (f) f.classList.add('is-invalid');
  const e = $('err-' + id); if (e) e.textContent = msg;
}
function clearErr(id) {
  const el = $(id); if (!el) return;
  const f = el.closest('.field'); if (f) f.classList.remove('is-invalid');
  const e = $('err-' + id); if (e) e.textContent = '';
}
function clearAllErr() {
  $$('.field.is-invalid').forEach(f => f.classList.remove('is-invalid'));
  $$('.field__err').forEach(e => e.textContent = '');
}

$$('#dealForm input, #dealForm select, #dealForm textarea').forEach(el => {
  el.addEventListener('input', () => clearErr(el.id));
  el.addEventListener('change', () => clearErr(el.id));
});

function validate() {
  clearAllErr();
  let first = null;
  FIELDS.filter(f => f.req).forEach(f => {
    const el = $(f.id); if (!el) return;
    const v = el.value.trim();
    let ok = !!v;
    if (ok && f.numType === 'num') { const n = rawNum(el.value); ok = n !== '' && Number(n) >= 0; }
    if (!ok) { setErr(f.id, f.numType === 'num' ? 'Enter a valid number' : 'Required'); if (!first) first = f.id; }
  });
  if (S.op === 'update' && !$('dealIdSelect').value) { setErr('dealIdSelect', 'Select a deal'); if (!first) first = 'dealIdSelect'; }
  const s = $('constructionStart').value, e = $('constructionEnd').value;
  if (s && e && new Date(e) < new Date(s)) { setErr('constructionEnd', 'Must be after start date'); if (!first) first = 'constructionEnd'; }
  return first;
}

/* ================================================================
   PAYLOAD & SUBMIT
   ================================================================ */
function buildPayload() {
  const p = { operation: S.op, submitted_at: new Date().toISOString() };
  p.deal_id = S.op === 'update' ? $('dealIdSelect').value : 'DEAL-' + Date.now().toString().slice(-6);
  FIELDS.forEach(f => {
    const el = $(f.id); if (!el) return;
    p[f.k] = f.numType === 'num' ? getNum(el) : el.value.trim();
  });
  return p;
}

$('dealForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (S.submitting) return;
  const inv = validate();
  if (inv) { $(inv).scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('Fix highlighted fields', 'err'); return; }

  const payload = buildPayload();
  S.submitting = true;
  $('submitBtn').disabled = true;
  $('loadingOverlay').style.display = '';

  let ok = false;
  try {
    const r = await fetch(S.cfg.submitUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (r.ok) ok = true;
  } catch (e) { /* offline fallback */ }

  saveLocalDeal(payload);
  S.submitting = false;
  $('submitBtn').disabled = false;
  $('loadingOverlay').style.display = 'none';
  localStorage.removeItem(STORAGE.DRAFT);

  toast(ok ? `Deal ${payload.deal_id} submitted!` : `Deal ${payload.deal_id} saved locally!`, 'ok');
  $('dealForm').reset();
  clearAllErr();
  setOp('new');
  updateLiveSummary();
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
  if (q) list = list.filter(d => [d.project_name, d.developer_name, d.location, d.deal_id].some(v => (v||'').toLowerCase().includes(q)));
  if (ft) list = list.filter(d => d.project_type === ft);
  if (sort === 'cost-desc') list.sort((a,b) => (Number(b.land_cost||0)+Number(b.construction_cost||0)) - (Number(a.land_cost||0)+Number(a.construction_cost||0)));
  else if (sort === 'cost-asc') list.sort((a,b) => (Number(a.land_cost||0)+Number(a.construction_cost||0)) - (Number(b.land_cost||0)+Number(b.construction_cost||0)));
  else list.sort((a,b) => (b.submitted_at||'').localeCompare(a.submitted_at||''));

  grid.innerHTML = '';
  if (list.length === 0) { grid.innerHTML = '<div class="empty-state"><p>No deals found. Submit a deal to get started.</p></div>'; return; }

  list.forEach(d => {
    const sym = SYM[d.currency] || '$';
    const cost = Number(d.land_cost||0) + Number(d.construction_cost||0) + Number(d.other_cost||0);
    const rev = Number(d.expected_revenue||0);
    const pClass = d.priority === 'High' || d.priority === 'Critical' ? 'high' : d.priority === 'Low' ? 'low' : 'medium';

    const card = document.createElement('div');
    card.className = 'deal-card';
    card.innerHTML = `
      <div class="deal-card__top">
        <span class="deal-card__id">${d.deal_id||'—'}</span>
        <span class="deal-card__badge deal-card__badge--${pClass}">${d.priority||'Normal'}</span>
      </div>
      <div class="deal-card__name">${d.project_name||'Untitled'}</div>
      <div class="deal-card__meta">${[d.developer_name, d.location].filter(Boolean).join(' · ')}</div>
      <dl class="deal-card__nums">
        <div><dt>Cost</dt><dd>${sym}${fmtCommas(String(cost))}</dd></div>
        <div><dt>Revenue</dt><dd>${sym}${fmtCommas(String(rev))}</dd></div>
      </dl>
      ${buildDownloadLinks(d)}
      <div class="deal-card__footer">View Full Details →</div>
    `;
    card.addEventListener('click', () => openModal(d.deal_id));
    grid.appendChild(card);
  });
}

/* Build PDF/PPT download links from Google Sheet data */
function buildDownloadLinks(deal) {
  const links = [];
  if (deal.pdf_link) links.push(`<a class="dl-link" href="${deal.pdf_link}" target="_blank" rel="noopener">📄 PDF Report</a>`);
  if (deal.ppt_link) links.push(`<a class="dl-link" href="${deal.ppt_link}" target="_blank" rel="noopener">📊 PPT Deck</a>`);
  if (deal.ic_memo_link) links.push(`<a class="dl-link" href="${deal.ic_memo_link}" target="_blank" rel="noopener">📋 IC Memo</a>`);
  if (deal.financial_model_link) links.push(`<a class="dl-link" href="${deal.financial_model_link}" target="_blank" rel="noopener">📈 Financial Model</a>`);
  if (links.length === 0) return '';
  return `<div class="deal-card__downloads">${links.join('')}</div>`;
}

$('searchInput').addEventListener('input', renderDeals);
$('filterType').addEventListener('change', renderDeals);
$('filterSort').addEventListener('change', renderDeals);

/* ================================================================
   DEAL DETAIL MODAL
   ================================================================ */
function openModal(id) {
  const d = S.deals.find(x => x.deal_id === id);
  if (!d) return;
  S.currentDeal = d;
  const sym = SYM[d.currency] || '$';
  const cost = Number(d.land_cost||0) + Number(d.construction_cost||0) + Number(d.other_cost||0);
  const rev = Number(d.expected_revenue||0);
  const spread = rev - cost;
  const roi = cost > 0 ? ((spread/cost)*100).toFixed(1) : '0';

  $('modalBadge').textContent = d.deal_id;
  $('modalTitle').textContent = d.project_name || 'Untitled';
  $('modalSub').textContent = [d.developer_name, d.location, d.district].filter(Boolean).join(' · ');

  let html = `
    <div class="exec-grid" style="margin-bottom:24px;">
      <div class="exec-box"><span class="exec-box__val">${sym}${fmtCommas(String(cost))}</span><span class="exec-box__label">Total Cost</span></div>
      <div class="exec-box"><span class="exec-box__val">${sym}${fmtCommas(String(rev))}</span><span class="exec-box__label">Revenue</span></div>
      <div class="exec-box"><span class="exec-box__val" style="color:var(--green)">${sym}${fmtCommas(String(spread))}</span><span class="exec-box__label">Net Spread</span></div>
      <div class="exec-box"><span class="exec-box__val">${roi}%</span><span class="exec-box__label">ROI</span></div>
    </div>
    <dl class="detail-grid">
      <div class="detail-item"><dt>Asset Type</dt><dd>${d.project_type||'—'}</dd></div>
      <div class="detail-item"><dt>Priority</dt><dd>${d.priority||'—'}</dd></div>
      <div class="detail-item"><dt>Land Area</dt><dd>${d.land_area ? fmtCommas(d.land_area)+' sqft' : '—'}</dd></div>
      <div class="detail-item"><dt>Floors</dt><dd>${d.floors||'—'}</dd></div>
      <div class="detail-item"><dt>Duration</dt><dd>${d.project_duration||'—'} months</dd></div>
      <div class="detail-item"><dt>Land Cost</dt><dd>${sym}${fmtCommas(String(d.land_cost||0))}</dd></div>
      <div class="detail-item"><dt>Construction</dt><dd>${sym}${fmtCommas(String(d.construction_cost||0))}</dd></div>
      <div class="detail-item"><dt>Other Costs</dt><dd>${sym}${fmtCommas(String(d.other_cost||0))}</dd></div>
      <div class="detail-item"><dt>Exit Value</dt><dd>${sym}${fmtCommas(String(d.expected_exit_value||0))}</dd></div>
      <div class="detail-item"><dt>Sales</dt><dd>${sym}${fmtCommas(String(d.expected_sales||0))}</dd></div>
      <div class="detail-item"><dt>Rental Income</dt><dd>${sym}${fmtCommas(String(d.expected_rental_income||0))}</dd></div>
      <div class="detail-item"><dt>Start Date</dt><dd>${d.construction_start||'—'}</dd></div>
      <div class="detail-item"><dt>End Date</dt><dd>${d.construction_end||'—'}</dd></div>
      <div class="detail-item"><dt>Funding</dt><dd>${d.funding_type||'—'}</dd></div>
      <div class="detail-item"><dt>Land Ownership</dt><dd>${d.land_ownership||'—'}</dd></div>
      <div class="detail-item"><dt>Dev. Experience</dt><dd>${d.developer_experience||'—'}</dd></div>
      <div class="detail-item"><dt>Legal Status</dt><dd>${d.legal_status||'—'}</dd></div>
      <div class="detail-item"><dt>Site Condition</dt><dd>${d.site_condition||'—'}</dd></div>
      <div class="detail-item"><dt>Env. Risk</dt><dd>${d.environmental_risk||'—'}</dd></div>
      <div class="detail-item"><dt>Market Demand</dt><dd>${d.market_demand||'—'}</dd></div>
      <div class="detail-item"><dt>Competition</dt><dd>${d.competition_level||'—'}</dd></div>
      <div class="detail-item"><dt>Currency</dt><dd>${d.currency||'—'}</dd></div>
    </dl>`;

  if (d.notes) html += `<div style="margin-top:16px;padding:14px;background:var(--surface-2);border-radius:var(--radius-sm);font-size:13px;color:var(--text-2);white-space:pre-wrap;">${d.notes}</div>`;

  // Download links from Google Sheet columns
  const dlLinks = [];
  if (d.pdf_link) dlLinks.push(`<a class="dl-link" href="${d.pdf_link}" target="_blank">📄 Download PDF Report</a>`);
  if (d.ppt_link) dlLinks.push(`<a class="dl-link" href="${d.ppt_link}" target="_blank">📊 Download PPT Deck</a>`);
  if (d.ic_memo_link) dlLinks.push(`<a class="dl-link" href="${d.ic_memo_link}" target="_blank">📋 IC Memo</a>`);
  if (d.financial_model_link) dlLinks.push(`<a class="dl-link" href="${d.financial_model_link}" target="_blank">📈 Financial Model</a>`);
  if (dlLinks.length > 0) {
    html += `<div class="modal-downloads"><h4>Documents & Downloads</h4><div class="modal-downloads__list">${dlLinks.join('')}</div></div>`;
  }

  $('modalBody').innerHTML = html;
  $('modalOverlay').style.display = '';
}

function closeModal() { $('modalOverlay').style.display = 'none'; S.currentDeal = null; }
$('modalCloseBtn').addEventListener('click', closeModal);
$('modalCloseFootBtn').addEventListener('click', closeModal);
$('modalOverlay').addEventListener('click', e => { if (e.target === $('modalOverlay')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('modalOverlay').style.display !== 'none') closeModal(); });

$('modalPrintBtn').addEventListener('click', () => window.print());
$('modalExportBtn').addEventListener('click', () => {
  if (!S.currentDeal) return;
  const blob = new Blob([JSON.stringify(S.currentDeal, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `${S.currentDeal.deal_id}_underwriting.json`; a.click(); URL.revokeObjectURL(a.href);
});

/* ================================================================
   REPORTS
   ================================================================ */
function renderReports() {
  const deals = S.deals;
  const typeCounts = {}, fundCounts = {}, riskCounts = {};
  let totalCap = 0, totalRev = 0, roiSum = 0;

  deals.forEach(d => {
    const c = Number(d.land_cost||0)+Number(d.construction_cost||0)+Number(d.other_cost||0);
    const r = Number(d.expected_revenue||0);
    totalCap += c; totalRev += r;
    roiSum += c > 0 ? ((r-c)/c)*100 : 0;
    typeCounts[d.project_type||'Other'] = (typeCounts[d.project_type||'Other']||0) + c;
    fundCounts[d.funding_type||'Other'] = (fundCounts[d.funding_type||'Other']||0) + 1;
    riskCounts[d.legal_status||'Other'] = (riskCounts[d.legal_status||'Other']||0) + 1;
  });

  $('execCap').textContent = fmtMoney(totalCap);
  $('execRev').textContent = fmtMoney(totalRev);
  $('execSpread').textContent = fmtMoney(totalRev - totalCap);
  $('execRoi').textContent = deals.length > 0 ? (roiSum / deals.length).toFixed(1) + '%' : '0%';

  renderBars($('chartAsset'), typeCounts, totalCap, true);
  renderBars($('chartFunding'), fundCounts, deals.length, false);
  renderBars($('chartRisk'), riskCounts, deals.length, false);
}

function renderBars(container, obj, total, isMoney) {
  container.innerHTML = '';
  if (Object.keys(obj).length === 0) { container.innerHTML = '<p style="color:var(--text-2);font-size:12px;">No data yet</p>'; return; }
  Object.entries(obj).forEach(([label, val]) => {
    const pct = total > 0 ? Math.round((val / total) * 100) : 0;
    const display = isMoney ? fmtMoney(val) + ` (${pct}%)` : `${val} deals (${pct}%)`;
    const item = document.createElement('div');
    item.className = 'bar-item';
    item.innerHTML = `<div class="bar-item__head"><span>${label}</span><span style="font-weight:700;">${display}</span></div><div class="bar-item__track"><div class="bar-item__fill" style="width:${Math.max(pct,4)}%;"></div></div>`;
    container.appendChild(item);
  });
}

$('exportCsvBtn').addEventListener('click', () => {
  if (S.deals.length === 0) { toast('No deals to export', 'err'); return; }
  const keys = Object.keys(S.deals[0]);
  let csv = keys.join(',') + '\n';
  S.deals.forEach(d => { csv += keys.map(k => `"${String(d[k]||'').replace(/"/g,'""')}"`).join(',') + '\n'; });
  const b = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b);
  a.download = `underwriting_pipeline_${new Date().toISOString().split('T')[0]}.csv`; a.click();
});

/* ================================================================
   SETTINGS
   ================================================================ */
function loadSettings() {
  try { const s = JSON.parse(localStorage.getItem(STORAGE.SETTINGS)); if (s) S.cfg = { ...DEFAULTS, ...s }; } catch {}
  $('cfgSubmitUrl').value = S.cfg.submitUrl;
  $('cfgGetDealsUrl').value = S.cfg.getDealsUrl;
  $('cfgSheetUrl').value = S.cfg.sheetUrl || '';
}

$('saveSettingsBtn').addEventListener('click', () => {
  S.cfg.submitUrl = $('cfgSubmitUrl').value.trim() || DEFAULTS.submitUrl;
  S.cfg.getDealsUrl = $('cfgGetDealsUrl').value.trim() || DEFAULTS.getDealsUrl;
  S.cfg.sheetUrl = $('cfgSheetUrl').value.trim();
  localStorage.setItem(STORAGE.SETTINGS, JSON.stringify(S.cfg));
  toast('Settings saved', 'ok');
  loadDeals();
});

$('resetSettingsBtn').addEventListener('click', () => {
  S.cfg = { ...DEFAULTS };
  localStorage.removeItem(STORAGE.SETTINGS);
  loadSettings();
  toast('Settings reset to defaults', 'ok');
});

$('testConnBtn').addEventListener('click', async () => {
  const el = $('testResult');
  el.style.display = '';
  el.className = 'test-result';
  el.textContent = 'Testing connection…';
  const targetUrl = S.cfg.getDealsUrl || S.cfg.sheetUrl;

  if (!targetUrl) {
    el.className = 'test-result test-result--err';
    el.textContent = '⚠ Please enter a Get Deals URL or Google Sheet URL first.';
    return;
  }

  try {
    if (targetUrl.includes('docs.google.com/spreadsheets')) {
      const deals = await fetchGoogleSheetCsv(targetUrl);
      el.className = 'test-result test-result--ok';
      el.textContent = `✓ Google Sheet Connected — Successfully fetched ${deals.length} deals from sheet!`;
    } else {
      const r = await fetch(targetUrl, { method: 'GET' });
      el.className = r.ok ? 'test-result test-result--ok' : 'test-result test-result--err';
      el.textContent = r.ok ? `✓ Connected to n8n Webhook — HTTP ${r.status}` : `⚠ Webhook returned HTTP ${r.status}`;
    }
  } catch (e) {
    el.className = 'test-result test-result--err';
    el.textContent = `✖ Connection failed: ${e.message}. (Note: n8n test webhooks expire or require active CORS). Local storage fallback is active.`;
  }
});

/* ================================================================
   TOAST
   ================================================================ */
function toast(msg, type) {
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
  loadSettings();
  attachNumericFormatting();
  setOp('new');
  updateLiveSummary();
  loadDeals();
  $('liveDate').textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

init();
