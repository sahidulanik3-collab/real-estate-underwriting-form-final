'use strict';

/* ================================================================
   STATE & STORAGE
   ================================================================ */
const STORAGE = { DEALS: 'mc_deals_v4', THEME: 'mc_theme', SECTIONS: 'mc_sections_v3', CURRENCY: 'mc_currency' };
const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
];

const S = {
  view: 'dashboard',
  op: 'new', // 'new' or 'update'
  currency: null, // { code, symbol, name }
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
function currSym() { return S.currency ? S.currency.symbol : '$'; }
function fmtMoney(n) {
  const s = currSym();
  if (n >= 1e9) return s + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return s + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return s + (n / 1e3).toFixed(0) + 'K';
  return s + Math.round(n);
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
   CURRENCY
   ================================================================ */
function loadCurrency() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE.CURRENCY));
    S.currency = saved || CURRENCIES[0];
  } catch { S.currency = CURRENCIES[0]; }
}
function setCurrency(code) {
  const c = CURRENCIES.find(x => x.code === code) || CURRENCIES[0];
  S.currency = c;
  localStorage.setItem(STORAGE.CURRENCY, JSON.stringify(c));
  // Re-render everything that shows money
  updateLiveCalc();
  updateStats();
  if (S.view === 'deals') renderDeals();
  if (S.view === 'reports') renderReports();
  toast(`Currency: ${c.name} (${c.symbol})`, 'ok');
}

if ($('currencySelect')) {
  CURRENCIES.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.code;
    opt.textContent = `${c.symbol} ${c.code}`;
    $('currencySelect').appendChild(opt);
  });
  $('currencySelect').addEventListener('change', e => setCurrency(e.target.value));
}

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
  const req = f.required ? 'required' : '';
  const reqStar = f.required ? ' <span class="req-star">*</span>' : '';
  let inp = '';
  if (f.type === 'select') {
    const opts = (f.options || []).map(o => `<option value="${o}">${o || 'Select'}</option>`).join('');
    inp = `<select id="f_${f.key}" name="${f.key}" ${req}>${opts}</select>`;
  } else if (f.type === 'textarea') {
    inp = `<textarea id="f_${f.key}" name="${f.key}" rows="3" placeholder="${f.placeholder || ''}" ${req}></textarea>`;
  } else if (f.type === 'date') {
    inp = `<input type="date" id="f_${f.key}" name="${f.key}" ${req}>`;
  } else if (f.type === 'number') {
    inp = `<input type="text" id="f_${f.key}" name="${f.key}" placeholder="${f.placeholder || '0'}" data-numeric ${req}>`;
  } else {
    inp = `<input type="text" id="f_${f.key}" name="${f.key}" placeholder="${f.placeholder || ''}" ${req}>`;
  }
  return `<div class="field"><label for="f_${f.key}">${f.label}${reqStar}</label>${inp}</div>`;
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

  const cs = currSym();
  if ($('lcCost')) $('lcCost').textContent = total > 0 ? cs + fmtCommas(String(total)) : '—';
  if ($('lcRev')) $('lcRev').textContent = rev > 0 ? cs + fmtCommas(String(rev)) : '—';
  if ($('lcSpread')) $('lcSpread').textContent = total > 0 && rev > 0 ? `${spread >= 0 ? '+' : '−'}${cs}${fmtCommas(String(Math.abs(spread)))}` : '—';
  if ($('lcRoi')) $('lcRoi').textContent = roi !== '—' ? roi + '%' : '—';
}

/* ================================================================
   EDIT SECTIONS MODAL — Google Forms Style Builder
   ================================================================ */
$('editSectionsBtn').addEventListener('click', openEditSections);
$('editSectionsCloseBtn').addEventListener('click', closeEditSections);
$('editSectionsOverlay').addEventListener('click', e => { if (e.target === $('editSectionsOverlay')) closeEditSections(); });

function openEditSections() {
  renderEditSections();
  $('editSectionsOverlay').classList.add('is-open');
}
function closeEditSections() { $('editSectionsOverlay').classList.remove('is-open'); }

/* ── Field type icons ── */
const FIELD_TYPE_ICONS = {
  text: '𝐓',
  number: '#',
  date: '📅',
  textarea: '¶',
  select: '▾',
};
const FIELD_TYPES = [
  { value: 'text', label: 'Short Text', icon: '𝐓' },
  { value: 'number', label: 'Number', icon: '#' },
  { value: 'date', label: 'Date', icon: '📅' },
  { value: 'textarea', label: 'Long Text', icon: '¶' },
  { value: 'select', label: 'Dropdown', icon: '▾' },
];

function renderEditSections() {
  const body = $('editSectionsBody');
  body.innerHTML = '';

  S.sections.forEach((sec, si) => {
    /* ── Section card ── */
    const secBlock = document.createElement('div');
    secBlock.className = 'gf-section';
    secBlock.dataset.si = si;

    // Section header
    let secHead = `<div class="gf-section__head">
      <div class="gf-section__head-left">
        <span class="gf-section__num">${sec.num}</span>
        <input class="gf-section__title" value="${escHtml(sec.title)}" data-si="${si}" data-role="sec-title" placeholder="Section title…" />
      </div>
      <div class="gf-section__head-actions">
        ${si > 0 ? `<button class="gf-icon-btn" data-si="${si}" data-dir="up" title="Move Up">▲</button>` : ''}
        ${si < S.sections.length - 1 ? `<button class="gf-icon-btn" data-si="${si}" data-dir="down" title="Move Down">▼</button>` : ''}
        <button class="gf-icon-btn gf-icon-btn--del" data-si="${si}" data-role="del-sec" title="Delete Section">🗑</button>
      </div>
    </div>`;

    // Field cards
    let fieldsHtml = '';
    sec.fields.forEach((f, fi) => {
      fieldsHtml += buildFieldCard(si, fi, f, sec.fields.length);
    });

    // Add field button
    let addBtn = `<div class="gf-add-field">
      <button class="gf-add-field__btn" data-si="${si}" data-role="add-field">
        <span class="gf-add-field__icon">+</span> Add field
      </button>
    </div>`;

    secBlock.innerHTML = secHead + `<div class="gf-section__fields">${fieldsHtml}</div>` + addBtn;
    body.appendChild(secBlock);
  });

  // Add section button
  body.insertAdjacentHTML('beforeend', `
    <button class="gf-add-section" id="addSectionBtn">
      <span class="gf-add-section__icon">+</span>
      <span>Add new section</span>
    </button>
  `);

  bindEditEvents(body);
}

function escHtml(s) { return String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function buildFieldCard(si, fi, f, totalFields) {
  const typeOpts = FIELD_TYPES.map(t =>
    `<option value="${t.value}" ${t.value === f.type ? 'selected' : ''}>${t.icon} ${t.label}</option>`
  ).join('');

  let preview = '';
  if (f.type === 'text') preview = `<div class="gf-field__preview"><input type="text" placeholder="${escHtml(f.placeholder || 'Short answer text')}" disabled /></div>`;
  else if (f.type === 'number') preview = `<div class="gf-field__preview"><input type="text" placeholder="${escHtml(f.placeholder || '0')}" disabled /></div>`;
  else if (f.type === 'date') preview = `<div class="gf-field__preview"><input type="date" disabled /></div>`;
  else if (f.type === 'textarea') preview = `<div class="gf-field__preview"><div class="gf-preview-textarea">Long answer text</div></div>`;
  else if (f.type === 'select') {
    let optsList = '';
    (f.options || ['', 'Option 1']).forEach((opt, oi) => {
      if (oi === 0) return; // skip empty first option
      optsList += `<div class="gf-option-row">
        <span class="gf-option-row__num">${oi}.</span>
        <input class="gf-option-row__input" value="${escHtml(opt)}" data-si="${si}" data-fi="${fi}" data-oi="${oi}" data-role="edit-option" placeholder="Option ${oi}" />
        <button class="gf-option-row__del" data-si="${si}" data-fi="${fi}" data-oi="${oi}" data-role="del-option" title="Remove">✕</button>
      </div>`;
    });
    optsList += `<div class="gf-option-row gf-option-row--add">
      <span class="gf-option-row__num">${(f.options || []).length}.</span>
      <button class="gf-option-row__add-btn" data-si="${si}" data-fi="${fi}" data-role="add-option">+ Add option</button>
    </div>`;
    preview = `<div class="gf-field__options">${optsList}</div>`;
  }

  return `<div class="gf-field-card ${f._active ? 'gf-field-card--active' : ''}" data-si="${si}" data-fi="${fi}">
    <div class="gf-field-card__drag" title="Drag to reorder">⠿</div>
    <div class="gf-field-card__body">
      <div class="gf-field-card__top">
        <input class="gf-field-card__label" value="${escHtml(f.label)}" data-si="${si}" data-fi="${fi}" data-role="edit-label" placeholder="Question" />
        <select class="gf-field-card__type" data-si="${si}" data-fi="${fi}" data-role="change-type">${typeOpts}</select>
      </div>
      ${preview}
      <div class="gf-field-card__bottom">
        <input class="gf-field-card__placeholder" value="${escHtml(f.placeholder || '')}" data-si="${si}" data-fi="${fi}" data-role="edit-placeholder" placeholder="Placeholder text (optional)" />
        <div class="gf-field-card__controls">
          <label class="gf-toggle" title="Required">
            <input type="checkbox" data-si="${si}" data-fi="${fi}" data-role="toggle-required" ${f.required ? 'checked' : ''} />
            <span class="gf-toggle__slider"></span>
            <span class="gf-toggle__label">Required</span>
          </label>
          <div class="gf-field-card__actions">
            ${fi > 0 ? `<button class="gf-field-btn" data-si="${si}" data-fi="${fi}" data-dir="up" title="Move Up">↑</button>` : ''}
            ${fi < totalFields - 1 ? `<button class="gf-field-btn" data-si="${si}" data-fi="${fi}" data-dir="down" title="Move Down">↓</button>` : ''}
            <button class="gf-field-btn" data-si="${si}" data-fi="${fi}" data-role="dup-field" title="Duplicate">⧉</button>
            <button class="gf-field-btn gf-field-btn--del" data-si="${si}" data-fi="${fi}" data-role="del-field" title="Delete">🗑</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ── Bind all events inside edit modal ── */
function bindEditEvents(body) {
  // Section title edits
  body.querySelectorAll('[data-role="sec-title"]').forEach(inp => {
    inp.addEventListener('change', () => {
      S.sections[Number(inp.dataset.si)].title = inp.value.trim() || 'Untitled';
    });
  });

  // Section move
  body.querySelectorAll('.gf-icon-btn[data-dir]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncAllLabels();
      const si = Number(btn.dataset.si);
      const dir = btn.dataset.dir;
      const target = dir === 'up' ? si - 1 : si + 1;
      if (target < 0 || target >= S.sections.length) return;
      [S.sections[si], S.sections[target]] = [S.sections[target], S.sections[si]];
      S.sections.forEach((s, i) => s.num = String(i + 1).padStart(2, '0'));
      renderEditSections();
    });
  });

  // Section delete
  body.querySelectorAll('[data-role="del-sec"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const si = Number(btn.dataset.si);
      if (S.sections.length <= 1) { toast('At least one section required', 'err'); return; }
      if (!confirm(`Delete section "${S.sections[si].title}"?`)) return;
      S.sections.splice(si, 1);
      S.sections.forEach((s, i) => s.num = String(i + 1).padStart(2, '0'));
      renderEditSections();
    });
  });

  // Field label edits (live)
  body.querySelectorAll('[data-role="edit-label"]').forEach(inp => {
    inp.addEventListener('change', () => {
      const si = Number(inp.dataset.si), fi = Number(inp.dataset.fi);
      const label = inp.value.trim() || 'Untitled';
      S.sections[si].fields[fi].label = label;
      S.sections[si].fields[fi].key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    });
  });

  // Placeholder edits
  body.querySelectorAll('[data-role="edit-placeholder"]').forEach(inp => {
    inp.addEventListener('change', () => {
      S.sections[Number(inp.dataset.si)].fields[Number(inp.dataset.fi)].placeholder = inp.value.trim();
    });
  });

  // Type change
  body.querySelectorAll('[data-role="change-type"]').forEach(sel => {
    sel.addEventListener('change', () => {
      syncAllLabels();
      const si = Number(sel.dataset.si), fi = Number(sel.dataset.fi);
      const f = S.sections[si].fields[fi];
      f.type = sel.value;
      if (sel.value === 'select' && (!f.options || f.options.length < 2)) {
        f.options = ['', 'Option 1', 'Option 2'];
      }
      renderEditSections();
    });
  });

  // Required toggle
  body.querySelectorAll('[data-role="toggle-required"]').forEach(cb => {
    cb.addEventListener('change', () => {
      S.sections[Number(cb.dataset.si)].fields[Number(cb.dataset.fi)].required = cb.checked;
    });
  });

  // Field move
  body.querySelectorAll('.gf-field-btn[data-dir]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncAllLabels();
      const si = Number(btn.dataset.si), fi = Number(btn.dataset.fi);
      const dir = btn.dataset.dir;
      const target = dir === 'up' ? fi - 1 : fi + 1;
      const fields = S.sections[si].fields;
      if (target < 0 || target >= fields.length) return;
      [fields[fi], fields[target]] = [fields[target], fields[fi]];
      renderEditSections();
    });
  });

  // Field duplicate
  body.querySelectorAll('[data-role="dup-field"]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncAllLabels();
      const si = Number(btn.dataset.si), fi = Number(btn.dataset.fi);
      const dup = JSON.parse(JSON.stringify(S.sections[si].fields[fi]));
      dup.label += ' (copy)';
      dup.key += '_copy';
      S.sections[si].fields.splice(fi + 1, 0, dup);
      renderEditSections();
    });
  });

  // Field delete
  body.querySelectorAll('[data-role="del-field"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const si = Number(btn.dataset.si), fi = Number(btn.dataset.fi);
      S.sections[si].fields.splice(fi, 1);
      renderEditSections();
    });
  });

  // Add field
  body.querySelectorAll('[data-role="add-field"]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncAllLabels();
      const si = Number(btn.dataset.si);
      const num = S.sections[si].fields.length + 1;
      S.sections[si].fields.push({
        key: 'field_' + Date.now(),
        label: 'Untitled Field',
        type: 'text',
        placeholder: '',
        required: false,
      });
      renderEditSections();
      // Scroll to bottom of section
      setTimeout(() => {
        const cards = body.querySelectorAll(`.gf-section[data-si="${si}"] .gf-field-card`);
        if (cards.length) cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    });
  });

  // Dropdown: edit option
  body.querySelectorAll('[data-role="edit-option"]').forEach(inp => {
    inp.addEventListener('change', () => {
      const si = Number(inp.dataset.si), fi = Number(inp.dataset.fi), oi = Number(inp.dataset.oi);
      S.sections[si].fields[fi].options[oi] = inp.value.trim() || `Option ${oi}`;
    });
  });

  // Dropdown: delete option
  body.querySelectorAll('[data-role="del-option"]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncAllLabels();
      const si = Number(btn.dataset.si), fi = Number(btn.dataset.fi), oi = Number(btn.dataset.oi);
      const opts = S.sections[si].fields[fi].options;
      if (opts.length <= 2) { toast('Dropdown needs at least 1 option', 'err'); return; }
      opts.splice(oi, 1);
      renderEditSections();
    });
  });

  // Dropdown: add option
  body.querySelectorAll('[data-role="add-option"]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncAllLabels();
      const si = Number(btn.dataset.si), fi = Number(btn.dataset.fi);
      const opts = S.sections[si].fields[fi].options;
      opts.push(`Option ${opts.length}`);
      renderEditSections();
    });
  });

  // Add section
  const addSecBtn = $('addSectionBtn');
  if (addSecBtn) {
    addSecBtn.addEventListener('click', () => {
      syncAllLabels();
      const num = String(S.sections.length + 1).padStart(2, '0');
      S.sections.push({ id: 'custom_' + Date.now(), title: 'Untitled Section', num, fields: [] });
      renderEditSections();
      // Scroll to new section
      setTimeout(() => {
        const secs = body.querySelectorAll('.gf-section');
        if (secs.length) secs[secs.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    });
  }
}

/* Sync all label/placeholder inputs back to state before re-render */
function syncAllLabels() {
  $$('[data-role="sec-title"]').forEach(inp => {
    S.sections[Number(inp.dataset.si)].title = inp.value.trim() || 'Untitled';
  });
  $$('[data-role="edit-label"]').forEach(inp => {
    const si = Number(inp.dataset.si), fi = Number(inp.dataset.fi);
    if (S.sections[si] && S.sections[si].fields[fi]) {
      S.sections[si].fields[fi].label = inp.value.trim() || 'Untitled';
      S.sections[si].fields[fi].key = (inp.value.trim() || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    }
  });
  $$('[data-role="edit-placeholder"]').forEach(inp => {
    const si = Number(inp.dataset.si), fi = Number(inp.dataset.fi);
    if (S.sections[si] && S.sections[si].fields[fi]) {
      S.sections[si].fields[fi].placeholder = inp.value.trim();
    }
  });
  $$('[data-role="edit-option"]').forEach(inp => {
    const si = Number(inp.dataset.si), fi = Number(inp.dataset.fi), oi = Number(inp.dataset.oi);
    if (S.sections[si] && S.sections[si].fields[fi] && S.sections[si].fields[fi].options) {
      S.sections[si].fields[fi].options[oi] = inp.value.trim();
    }
  });
}

$('saveSectionsBtn').addEventListener('click', () => {
  syncAllLabels();
  saveSections();
  renderFormSections();
  closeEditSections();
  toast('Form sections saved!', 'ok');
});

$('resetSectionsBtn').addEventListener('click', () => {
  if (!confirm('Reset all sections to default? Custom fields will be lost.')) return;
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
  if (!csvText || !csvText.trim()) return [];

  const rows = [];
  let curRow = [];
  let curCell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const c = csvText[i];
    const next = csvText[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        curCell += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      curRow.push(curCell.trim());
      curCell = '';
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++; // skip \r\n
      curRow.push(curCell.trim());
      if (curRow.some(cell => cell.length > 0)) {
        rows.push(curRow);
      }
      curRow = [];
      curCell = '';
    } else {
      curCell += c;
    }
  }
  if (curCell.length > 0 || curRow.length > 0) {
    curRow.push(curCell.trim());
    if (curRow.some(cell => cell.length > 0)) {
      rows.push(curRow);
    }
  }

  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.replace(/^"|"$/g, '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));

  const deals = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0) continue;

    const d = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      let val = (row[idx] || '').replace(/^"|"$/g, '').trim();
      d[h] = val;
    });

    const did = (d.deal_id || '').trim();
    if (!did || did.length > 20) continue;
    if (/^[.\-•*\s]/.test(did)) continue; // skip bullet points or sentences parsed as deal_id
    if (did.includes('FORMULA') || did.includes('VIEW') || did.includes('AI ') || did.includes('Financing')) continue;

    deals.push(d);
  }
  return deals;
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

  // Only show valid deals from Google Sheet with a proper deal_id and basic info
  S.deals = Array.from(map.values()).filter(d => d.deal_id && (d.project_name || d.location || d.total_cost || d.land_cost));

  updateStats();
  updateNextDealId();
  if (S.op === 'update') updateDealSelect();
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
   OPERATION TOGGLE & AUTO DEAL ID
   ================================================================ */
function setOp(op) {
  S.op = op;
  $('opNewBtn').classList.toggle('is-active', op === 'new');
  $('opUpdateBtn').classList.toggle('is-active', op === 'update');
  $('opDealSelectWrap').style.display = op === 'update' ? 'flex' : 'none';
  $('opAutoIdWrap').style.display = op === 'new' ? 'flex' : 'none';
  $('formHeaderTitle').textContent = op === 'update' ? 'Update Existing Deal' : 'New Deal Submission';

  if (op === 'new') {
    $('dealForm').reset();
    updateLiveCalc();
    updateNextDealId();
  } else {
    updateDealSelect();
  }
}

$('opNewBtn').addEventListener('click', () => setOp('new'));
$('opUpdateBtn').addEventListener('click', () => setOp('update'));

function getNextDealId() {
  if (!S.deals || S.deals.length === 0) return 'DEAL-001';

  let maxNum = 0;
  let prefix = 'DEAL-';
  let padLen = 3;

  S.deals.forEach(d => {
    if (!d.deal_id) return;
    const match = d.deal_id.match(/(DEAL[-_]?|GS[-_]?)?(\d+)/i);
    if (match) {
      if (match[1]) prefix = match[1].toUpperCase();
      const num = parseInt(match[2], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
        padLen = Math.max(padLen, match[2].length);
      }
    }
  });

  const nextNum = maxNum + 1;
  const numStr = String(nextNum).padStart(padLen, '0');
  return `${prefix.endsWith('-') || prefix.endsWith('_') ? prefix : 'DEAL-'}${numStr}`;
}

function updateNextDealId() {
  const badge = $('nextDealIdBadge');
  if (badge) badge.textContent = getNextDealId();
}

function updateDealSelect() {
  const sel = $('dealIdSelect');
  if (!sel) return;
  sel.innerHTML = '';
  if (S.deals.length === 0) {
    sel.innerHTML = '<option value="">No deals found</option>';
    return;
  }
  sel.innerHTML = '<option value="">Select a deal to populate…</option>';
  S.deals.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.deal_id;
    opt.textContent = `${d.deal_id} — ${d.project_name || 'Untitled'}`;
    sel.appendChild(opt);
  });
}

$('dealIdSelect').addEventListener('change', (e) => {
  const dealId = e.target.value;
  if (!dealId) return;
  const deal = S.deals.find(x => x.deal_id === dealId);
  if (!deal) return;

  // Auto-populate form fields with existing deal data
  S.sections.forEach(sec => sec.fields.forEach(f => {
    const el = $('f_' + f.key);
    if (!el) return;
    const val = deal[f.key] || deal[f.key.replace(/_/g, '')] || '';
    if (f.type === 'number') {
      el.value = fmtCommas(rawNum(val));
    } else {
      el.value = val;
    }
  }));

  updateLiveCalc();
  toast(`Loaded data for ${dealId}`, 'ok');
});

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
  const p = {
    operation: S.op,
    submitted_at: new Date().toISOString()
  };

  if (S.op === 'update') {
    p.deal_id = $('dealIdSelect').value || getNextDealId();
  } else {
    p.deal_id = getNextDealId();
  }

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

  // Validate: if update mode, must select a deal
  if (S.op === 'update' && !$('dealIdSelect').value) {
    toast('Please select a deal to update first!', 'err');
    $('dealIdSelect').focus();
    return;
  }

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

  S.submitting = false;
  $('submitBtn').disabled = false;
  $('loadingOverlay').classList.remove('is-open');

  if (ok) {
    toast(`Deal ${payload.deal_id} ${S.op === 'update' ? 'updated' : 'submitted'} to n8n!`, 'ok');
    $('dealForm').reset();
    updateLiveCalc();
    // Refresh from sheet after a short delay to let n8n process
    setTimeout(() => loadDeals(true), 3000);
    switchView('deals');
  } else {
    toast(`Submission failed — check your webhook or internet connection`, 'err');
  }
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
    const cs = currSym();
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
        <div><dt>Total Cost</dt><dd>${cs}${fmtCommas(String(cost))}</dd></div>
        <div><dt>Revenue</dt><dd>${cs}${fmtCommas(String(rev))}</dd></div>
      </dl>
      ${scoreBadge}
      ${downloads}
      <div class="deal-card__foot">
        <span class="deal-card__arrow" onclick="event.stopPropagation(); openModal('${d.deal_id}')">View Details →</span>
        <button class="deal-card__del" onclick="event.stopPropagation(); deleteDeal('${d.deal_id}')" title="Delete deal">🗑</button>
      </div>
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
  const cs = currSym();
  html += `<div class="exec-row" style="margin-bottom:24px;">
    <div class="exec-box"><span class="exec-box__val">${cs}${fmtCommas(String(cost))}</span><span class="exec-box__lab">Total Cost</span></div>
    <div class="exec-box"><span class="exec-box__val">${cs}${fmtCommas(String(rev))}</span><span class="exec-box__lab">Revenue</span></div>
    <div class="exec-box"><span class="exec-box__val" style="color:var(--green)">${cs}${fmtCommas(String(profit))}</span><span class="exec-box__lab">Profit</span></div>
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
   DELETE DEAL
   ================================================================ */
function deleteDeal(dealId) {
  if (!confirm(`Delete deal ${dealId}? This will remove it from the local view.\n\nNote: To permanently delete from Google Sheet, do it directly in the sheet.`)) return;
  // Remove from local storage
  const local = getLocalDeals().filter(d => d.deal_id !== dealId);
  localStorage.setItem(STORAGE.DEALS, JSON.stringify(local));
  // Remove from current state
  S.deals = S.deals.filter(d => d.deal_id !== dealId);
  updateStats();
  updateNextDealId();
  renderDeals();
  closeModal();
  toast(`Deal ${dealId} removed`, 'ok');
}

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
  loadCurrency();
  if ($('currencySelect')) $('currencySelect').value = S.currency.code;
  loadSections();
  renderFormSections();
  updateLiveCalc();
  loadDeals();
  $('liveDate').textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

init();