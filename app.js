/* AlumIndex — browse Alspec Industrial Catalogue profiles. Vanilla JS, hash routing. */
(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app = $('#app');
let DB = null, CAT = {}, BYID = {};
const LS = 'alumindex.shortlist.v1', VIEW = 'alumindex.view.v1';
let shortlist = new Set(JSON.parse(localStorage.getItem(LS) || '[]'));
const saveSL = () => { localStorage.setItem(LS, JSON.stringify([...shortlist])); updateBadges(); };

/* ---- Original schematic icons (not catalogue artwork) ---- */
const ICON = {
  flat:'<rect class="shape" x="4" y="17" width="32" height="6" rx="1"/>',
  rod:'<rect class="shape" x="5" y="8" width="13" height="13" rx="1"/><circle class="shape" cx="27" cy="27" r="8"/>',
  angle:'<path class="shape" d="M7 5h6v22h22v6H7z"/>',
  channel:'<path class="shape" d="M6 8h28v6h-5v-1H11v16h18v-1h5v6H6z" transform="rotate(90 20 20)"/>',
  tee:'<path class="shape" d="M5 7h30v6H23v21h-6V13H5z"/>',
  tube:'<circle class="shape-o" cx="20" cy="20" r="13" style="stroke-width:4"/>',
  shs:'<rect class="shape-o" x="8" y="8" width="24" height="24" rx="2" style="stroke-width:4"/>',
  rhs:'<rect class="shape-o" x="4" y="12" width="32" height="17" rx="2" style="stroke-width:4"/>',
  sheet:'<path class="shape" d="M4 26l14-8 18 6-14 8z"/><path class="shape-o" d="M4 22l14-8 18 6" />',
  mesh:'<path class="shape-o" d="M6 6l28 28M16 6l18 18M26 6l8 8M6 16l18 18M6 26l8 8M34 6L6 34M24 6L6 24M14 6l-8 8M34 16L16 34M34 26l-8 8"/>',
  fence:'<path class="shape-o" d="M6 6v28M34 6v28M6 11h28M6 17h28M6 23h28M6 29h28"/>',
  balustrade:'<path class="shape-o" d="M4 8h32M8 8v26M32 8v26M14 12v18M20 12v18M26 12v18M4 34h32"/>',
  louvre:'<path class="shape-o" d="M6 6v28M34 6v28M9 10l22 5M9 17l22 5M9 24l22 5"/>',
  patio:'<path class="shape-o" d="M4 14L20 6l16 8M8 14v20M32 14v20M4 14h32"/>',
  coolroom:'<rect class="shape-o" x="7" y="6" width="26" height="28" rx="2"/><path class="shape-o" d="M20 12v16M13 16l14 8M27 16l-14 8"/>',
  transport:'<path class="shape-o" d="M3 25h22V12h6l6 7v6h-3M3 25v4h4M14 29h12"/><circle class="shape-o" cx="10" cy="29" r="3"/><circle class="shape-o" cx="30" cy="29" r="3"/>',
  facade:'<path class="shape-o" d="M6 34V6h28v28M6 14h28M6 24h28M16 6v28M26 6v28"/>',
  misc:'<path class="shape" d="M5 28h30v5H5zM9 20h22v5H9zM13 12h14v5H13z"/>',
  hardware:'<path class="shape-o" d="M14 6v28M26 6v28M10 10h8M22 10h8M10 30h8M22 30h8M14 20h12"/>',
  endcap:'<rect class="shape" x="9" y="9" width="22" height="22" rx="3"/><rect x="14" y="14" width="12" height="12" rx="1" fill="var(--raised)"/>'
};
const svg = k => `<svg viewBox="0 0 40 40" aria-hidden="true">${ICON[k] || ICON.misc}</svg>`;
const STAR = '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>';

const GROUPS = [
  ['Standard geometrics', ['flat-bar','bar-rod','angle','channel','tee','round-tube','shs','rhs']],
  ['Rolled products', ['sheet-plate','mesh']],
  ['Systems & extrusions', ['fencing','balustrade','louvre','patio','coolroom','transport','facade','misc']],
  ['Accessories', ['hardware','endcaps']],
];

/* ---- helpers ---- */
const n = v => (v === null || v === undefined || v === '') ? null : +v;
const fmt = v => { if (v === null || v === undefined || v === '') return ''; const x = +v; return Number.isFinite(x) ? String(+x.toFixed(3)) : String(v); };
function dims(p) {
  if (p.dia_n != null) return `Ø${fmt(p.dia)}${p.th ? ' × ' + fmt(p.th) : ''}`;
  if (p.cat === 'flat-bar') return `${fmt(p.w)} × ${fmt(p.th)}`;
  if (p.cat === 'bar-rod') return p.w ? `${fmt(p.w)} sq` : '';
  if (p.w_n != null && p.h_n != null) return `${fmt(p.w)} × ${fmt(p.h)}${p.th ? ' × ' + fmt(p.th) : ''}`;
  if (p.th_n != null && p.w_n != null && p.length_n != null) return `${fmt(p.th)} × ${fmt(p.w)} × ${fmt(p.length)}`;
  if (p.sheet_size) return p.sheet_size;
  if (p.size) return p.size;
  return '';
}
const title = p => p.code || p.size || '—';
function subtitle(p) {
  const d = dims(p);
  const bits = [d ? d + (/\d$/.test(d) ? ' mm' : '') : '', p.description, p.finish].filter(Boolean);
  return [...new Set(bits)].join(' · ');
}
const iconFor = p => (CAT[p.cat] || {}).icon;
function searchText(p) {
  const d = [p.w, p.h, p.th, p.dia].filter(Boolean).map(fmt);
  const combos = [];
  if (p.w && p.h) combos.push(`${fmt(p.w)}x${fmt(p.h)}`, `${fmt(p.w)}x${fmt(p.h)}x${fmt(p.th)}`, `${fmt(p.h)}x${fmt(p.w)}`);
  if (p.dia) combos.push(`${fmt(p.dia)}x${fmt(p.th)}`, `od${fmt(p.dia)}`, `ø${fmt(p.dia)}`);
  if (p.cat === 'flat-bar') combos.push(`${fmt(p.w)}x${fmt(p.th)}`, `${fmt(p.th)}x${fmt(p.w)}`);
  if (p.cat === 'bar-rod' && p.w) combos.push(`${fmt(p.w)}x${fmt(p.w)}`);
  return [p.code, p.code.replace('-', ''), p.size, p.description, p.section, p.finish, p.alloy, (CAT[p.cat]||{}).label, p.sheet_size, ...d, ...combos, p.buy_in ? 'buy-in buyin' : '']
    .filter(Boolean).join(' ').toLowerCase().replace(/\s*[x×]\s*/g, 'x');
}
const normQ = q => q.toLowerCase().replace(/\s*[x×*]\s*/g, 'x').replace(/mm\b/g, '').trim();
function matches(p, q) {
  if (!q) return true;
  const toks = normQ(q).split(/\s+/).filter(Boolean);
  return toks.every(t => p._s.includes(t));
}

/* ---- data ---- */
async function load() {
  const res = await fetch('data/profiles.json', {cache: 'no-cache'});
  DB = await res.json();
  DB.categories.forEach(c => CAT[c.id] = c);
  DB.profiles.forEach(p => { p._s = searchText(p); BYID[p.id] = p; });
  [...shortlist].forEach(id => { if (!BYID[id]) shortlist.delete(id); });
  updateBadges();
}
function updateBadges() { document.querySelectorAll('[data-count]').forEach(b => b.textContent = shortlist.size || ''); }
function setNav(k) { document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === k)); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1600); }
const pdfLink = page => `${DB.pdf_url}#page=${page}`;

/* ---- views ---- */
function viewHome() {
  setNav('browse');
  const total = DB.count;
  let h = `<section class="hero" aria-label="AlumIndex">
    <picture>
      <source type="image/webp" srcset="img/hero.webp">
      <img src="img/hero.jpg" alt="Aluminium angle, channel, square tube, round tube and I-beam profiles" width="1600" height="900">
    </picture>
    <div class="hero-copy">
      <p class="eyebrow">Alspec Industrial Catalogue · Brendale / Chevallum</p>
      <h1>Aluminium profiles</h1>
      <p class="lede">${total.toLocaleString()} catalogue lines across ${DB.categories.length} categories.</p>
    </div>
  </section>
    <form class="searchbar" role="search" data-go-search><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>
    <input type="search" name="q" placeholder="Code or size, e.g. 50x50x3 or 1030625" autocomplete="off" enterkeyhint="search" aria-label="Search profiles"></form>`;
  for (const [g, ids] of GROUPS) {
    const cs = ids.map(i => CAT[i]).filter(Boolean);
    if (!cs.length) continue;
    h += `<div class="group-title"><h2>${g}</h2><span class="faint mono">${cs.reduce((a, c) => a + c.count, 0)}</span></div><div class="grid">`;
    h += cs.map(c => `<a class="cat" href="#/c/${c.id}"><span class="ico">${svg(c.icon)}</span><b>${esc(c.label)}</b><span class="sub">${esc(c.blurb)}</span>
      <span class="meta"><span><span class="n">${c.count}</span> lines</span><span>p.${c.pages[0]}${c.pages[1] !== c.pages[0] ? '–' + c.pages[1] : ''}</span></span></a>`).join('');
    h += `</div>`;
  }
  app.innerHTML = h;
  $('[data-go-search]').addEventListener('submit', e => { e.preventDefault(); const q = e.target.q.value.trim(); location.hash = '#/search' + (q ? '?q=' + encodeURIComponent(q) : ''); });
}

const state = { q: '', section: '', finish: '', alloy: '', wmin: '', wmax: '', smin: '', smax: '', sort: 'size', limit: 120 };
function parseQS() {
  const qs = new URLSearchParams((location.hash.split('?')[1]) || '');
  return Object.fromEntries(qs.entries());
}
function writeQS(base) {
  const o = {}; for (const k of ['q','section','finish','alloy','wmin','wmax','smin','smax']) if (state[k]) o[k] = state[k];
  if (state.sort !== 'size') o.sort = state.sort;
  const s = new URLSearchParams(o).toString();
  history.replaceState(null, '', base + (s ? '?' + s : ''));
}
const sizeKey = p => p.w_n ?? p.dia_n ?? p.th_n ?? 0;
const sorters = {
  size: (a, b) => sizeKey(a) - sizeKey(b) || (a.h_n ?? 0) - (b.h_n ?? 0) || (a.wall_n ?? 0) - (b.wall_n ?? 0) || a.code.localeCompare(b.code),
  code: (a, b) => (a.code || a.size || '').localeCompare(b.code || b.size || ''),
  kg: (a, b) => (a.kgm_n ?? 1e9) - (b.kgm_n ?? 1e9),
  page: (a, b) => a.page - b.page,
};

function viewList(catId) {
  const isSearch = !catId;
  setNav(isSearch ? 'search' : 'browse');
  const c = CAT[catId];
  if (catId && !c) { app.innerHTML = `<section class="head"><a class="crumb" href="#/">← All categories</a><h1>Unknown category</h1></section>`; return; }
  Object.assign(state, { q: '', section: '', finish: '', alloy: '', wmin: '', wmax: '', smin: '', smax: '', sort: 'size', limit: 120 }, parseQS());
  const base = isSearch ? '#/search' : `#/c/${catId}`;
  const pool = isSearch ? DB.profiles : DB.profiles.filter(p => p.cat === catId);
  const uniq = k => [...new Set(pool.map(p => p[k]).filter(Boolean))].sort();
  const finishes = uniq('finish'), alloys = uniq('alloy');
  const hasWall = pool.some(p => p.wall_n != null), hasSize = pool.some(p => p.w_n != null || p.dia_n != null);
  const sections = isSearch ? [] : c.sections;
  const tableView = localStorage.getItem(VIEW) === 'table';
  const opt = (arr, cur, all) => `<option value="">${all}</option>` + arr.map(v => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const nOpen = ['finish','alloy','wmin','wmax','smin','smax'].filter(k => state[k]).length;
  app.innerHTML = `<section class="head">
    ${isSearch ? '<p class="eyebrow">All categories</p><h1>Search</h1>' : `<a class="crumb" href="#/">← All categories</a><p class="eyebrow">Catalogue p.${c.pages[0]}${c.pages[1] !== c.pages[0] ? '–' + c.pages[1] : ''}</p><h1>${esc(c.label)}</h1><p class="lede">${esc(c.blurb)} · ${c.count} lines</p>`}
    </section>
    <div class="searchbar" role="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>
      <input id="q" type="search" value="${esc(state.q)}" placeholder="${isSearch ? 'Code, size or name — e.g. 50x25x3, 1070614, tread' : 'Filter by code or size'}" autocomplete="off" enterkeyhint="search" aria-label="Search">
      <button class="clear" type="button" aria-label="Clear" ${state.q ? '' : 'hidden'}>×</button></div>
    <p class="hint">Try <code>40x40x3</code> <code>25.4</code> <code>anodise</code> <code>6061</code> — sizes match either way round.</p>
    ${sections.length > 1 ? `<div class="chips" id="secs"><button class="chip ${!state.section ? 'on' : ''}" data-sec="">All</button>${sections.map(s => `<button class="chip ${state.section === s ? 'on' : ''}" data-sec="${esc(s)}">${esc(titleCase(s))}</button>`).join('')}</div>` : ''}
    <div class="toolbar"><button class="togglefilters" id="tf" type="button" aria-expanded="${nOpen ? 'true' : 'false'}">Filters${nOpen ? ` <span class="badge">${nOpen}</span>` : ''}</button>
      <span id="count" class="mono"></span>
      <span style="display:flex;gap:8px;align-items:center"><label class="f" style="flex-direction:row;align-items:center;gap:6px">Sort <select id="sort" style="height:36px;width:auto">
        ${[['size','Size'],['code','Code'],['kg','kg/m'],['page','Page']].map(([v,l]) => `<option value="${v}" ${state.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <span class="viewswitch"><button data-view="list" class="${tableView ? '' : 'on'}">Cards</button><button data-view="table" class="${tableView ? 'on' : ''}">Table</button></span></span></div>
    <div class="filters" id="filters" ${nOpen ? '' : 'hidden'}>
      <label class="f">Finish<select data-k="finish">${opt(finishes, state.finish, 'Any finish')}</select></label>
      <label class="f">Alloy / temper<select data-k="alloy" ${alloys.length ? '' : 'disabled'}>${opt(alloys, state.alloy, alloys.length ? 'Any alloy' : 'Not printed')}</select></label>
      <label class="f">Wall / thickness (mm)<span class="pair"><input data-k="wmin" inputmode="decimal" placeholder="min" value="${esc(state.wmin)}" ${hasWall ? '' : 'disabled'}><input data-k="wmax" inputmode="decimal" placeholder="max" value="${esc(state.wmax)}" ${hasWall ? '' : 'disabled'}></span></label>
      <label class="f">Size W / Ø (mm)<span class="pair"><input data-k="smin" inputmode="decimal" placeholder="min" value="${esc(state.smin)}" ${hasSize ? '' : 'disabled'}><input data-k="smax" inputmode="decimal" placeholder="max" value="${esc(state.smax)}" ${hasSize ? '' : 'disabled'}></span></label>
      <button class="linkbtn" id="reset" type="button">Reset filters</button>
    </div>
    <div id="results"></div>`;

  const run = () => {
    const wmin = parseFloat(state.wmin), wmax = parseFloat(state.wmax), smin = parseFloat(state.smin), smax = parseFloat(state.smax);
    let r = pool.filter(p => (!state.section || p.section === state.section)
      && (!state.finish || p.finish === state.finish) && (!state.alloy || p.alloy === state.alloy)
      && (isNaN(wmin) || (p.wall_n != null && p.wall_n >= wmin)) && (isNaN(wmax) || (p.wall_n != null && p.wall_n <= wmax))
      && (isNaN(smin) || ((p.w_n ?? p.dia_n) != null && Math.max(p.w_n ?? 0, p.h_n ?? 0, p.dia_n ?? 0) >= smin))
      && (isNaN(smax) || ((p.w_n ?? p.dia_n) != null && Math.max(p.w_n ?? 0, p.h_n ?? 0, p.dia_n ?? 0) <= smax))
      && matches(p, state.q));
    r.sort(sorters[state.sort] || sorters.size);
    $('#count').textContent = `${r.length} of ${pool.length}`;
    const box = $('#results');
    if (isSearch && !state.q && !nActive()) { box.innerHTML = `<div class="empty">Type a code, size or name to search all ${DB.count.toLocaleString()} lines.<br><span class="faint">Or <a href="#/">browse by category</a>.</span></div>`; return; }
    if (!r.length) { box.innerHTML = `<div class="empty">No matching profiles.<br><span class="faint">Try fewer words or clear a filter.</span></div>`; return; }
    const shown = r.slice(0, state.limit);
    box.innerHTML = (localStorage.getItem(VIEW) === 'table' && matchMedia('(min-width:760px)').matches ? renderTable(shown, isSearch) : `<div class="list">${shown.map(rowHTML).join('')}</div>`)
      + (r.length > shown.length ? `<button class="more" id="more">Show ${Math.min(120, r.length - shown.length)} more</button>` : '');
    const m = $('#more'); if (m) m.onclick = () => { state.limit += 120; run(); };
  };
  const nActive = () => ['finish','alloy','wmin','wmax','smin','smax','section'].some(k => state[k]);
  const update = () => { state.limit = 120; writeQS(base); run(); };
  const q = $('#q'); let t;
  q.addEventListener('input', () => { clearTimeout(t); $('.clear').hidden = !q.value; t = setTimeout(() => { state.q = q.value.trim(); update(); }, 90); });
  $('.clear').onclick = () => { q.value = ''; state.q = ''; $('.clear').hidden = true; q.focus(); update(); };
  app.querySelectorAll('[data-k]').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { state[el.dataset.k] = el.value.trim(); update(); }));
  $('#sort').onchange = e => { state.sort = e.target.value; update(); };
  $('#tf').onclick = () => { const f = $('#filters'); f.hidden = !f.hidden; $('#tf').setAttribute('aria-expanded', String(!f.hidden)); };
  $('#reset').onclick = () => { ['finish','alloy','wmin','wmax','smin','smax'].forEach(k => state[k] = ''); app.querySelectorAll('[data-k]').forEach(el => el.value = ''); update(); };
  const secs = $('#secs');
  if (secs) secs.onclick = e => { const b = e.target.closest('[data-sec]'); if (!b) return; state.section = b.dataset.sec; secs.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b)); update(); };
  app.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { localStorage.setItem(VIEW, b.dataset.view); app.querySelectorAll('[data-view]').forEach(x => x.classList.toggle('on', x === b)); run(); });
  run();
  if (isSearch && !state.q) setTimeout(() => q.focus(), 50);
}
function titleCase(s) { return s.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/\b(Shs|Rhs|Acm|Cnc|Ii)\b/g, m => m.toUpperCase()); }
function rowHTML(p) {
  const on = shortlist.has(p.id);
  return `<div class="row" data-open="${esc(p.id)}" role="button" tabindex="0">
    <span class="thumb">${svg(iconFor(p))}</span>
    <span class="t"><b>${esc(title(p))}${p.buy_in ? '<span class="tag buy">buy-in</span>' : ''}</b><span>${esc(subtitle(p))}</span></span>
    <span class="r">${p.kgm ? `<span><span class="kg">${esc(p.kgm)}</span><br>kg/m</span>` : ''}<button class="star ${on ? 'on' : ''}" data-star="${esc(p.id)}" aria-label="${on ? 'Remove from' : 'Add to'} shortlist" aria-pressed="${on}">${STAR}</button></span></div>`;
}
function renderTable(rows, showCat) {
  const cols = [['code','Code'],['description','Description'],['w','W'],['h','H'],['dia','Ø'],['th','TH'],['radius','R'],['length','Length'],['alloy','Alloy'],['finish','Finish'],['kgm','kg/m'],['page','Page']]
    .filter(([k]) => rows.some(p => p[k] !== undefined && p[k] !== '' && p[k] !== null));
  const num = new Set(['w','h','dia','th','radius','length','kgm','page']);
  return `<div class="tbl-wrap"><table><thead><tr><th></th>${cols.map(([k, l]) => `<th class="${num.has(k) ? 'num' : ''}">${l}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(p => `<tr data-open="${esc(p.id)}"><td><button class="star ${shortlist.has(p.id) ? 'on' : ''}" data-star="${esc(p.id)}" aria-label="Shortlist">${STAR}</button></td>${cols.map(([k]) => `<td class="${num.has(k) ? 'num' : ''} ${k === 'code' ? 'code' : ''}">${k === 'code' ? esc(title(p)) + (p.buy_in ? '<span class="tag buy">buy-in</span>' : '') : esc(p[k] ?? '')}</td>`).join('')}</tr>`).join('')}
  </tbody></table></div>`;
}

const LABELS = { code:'Code', size:'Size', description:'Description', w:'Width (mm)', h:'Height (mm)', dia:'Diameter (mm)', th:'Thickness / wall (mm)', radius:'Corner radius (mm)', length:'Length', alloy:'Alloy / temper', finish:'Finish', kgm:'kg / m', kg_sheet:'kg / sheet', sheet_size:'Sheet size', skin_thickness:'Skin thickness', front:'Front', back:'Back', open_area:'Open area', hole:'Hole size', hole_type:'Hole type', centres:'Centres (mm)', corner:'Corner', wall:'Wall thickness', outer_dia_mm:'Outer Ø (mm)', centre_rad_mm:'Centre radius (mm)' };
function openDetail(id) {
  const p = BYID[id]; if (!p) return;
  const sib = DB.profiles.filter(x => x !== p && x.page === p.page && x.section === p.section && p.code && x.code && x.code.slice(0, 7) === p.code.slice(0, 7));
  const keys = ['code','size','description','w','h','dia','th','radius','length','alloy','finish','kgm','kg_sheet','sheet_size','skin_thickness','front','back','open_area','hole','hole_type','centres','corner','wall','outer_dia_mm','centre_rad_mm'];
  const core = new Set(['code','description','length','alloy','finish']);
  const shown = keys.filter(k => (p[k] !== undefined && p[k] !== null && p[k] !== '') || (core.has(k) && p.cat !== 'endcaps' && p.cat !== 'hardware'));
  const on = shortlist.has(p.id);
  const card = $('.sheet-card');
  card.innerHTML = `<div class="grab"></div><div class="d-head"><span class="d-fig">${svg(iconFor(p))}</span><div style="min-width:0"><p class="eyebrow" style="margin:0 0 4px">${esc((CAT[p.cat]||{}).label)} · ${esc(titleCase(p.section))}</p><h2 id="sheet-title">${esc(title(p))}${p.buy_in ? '<span class="tag buy">buy-in</span>' : ''}</h2><p>${esc(dims(p) ? dims(p) + (/\d$/.test(dims(p)) ? ' mm' : '') : p.description || '')}</p></div><button class="d-close" data-close aria-label="Close">×</button></div>
    <dl class="specs">${shown.map(k => { const v = p[k]; const blank = v === undefined || v === null || v === '';
      return `<div class="spec ${['description','finish','sheet_size'].includes(k) ? 'wide' : ''}"><dt>${LABELS[k] || k}</dt><dd class="${blank ? 'blank' : ''}">${blank ? 'Not printed' : esc(k === 'length' && /^\d+$/.test(v) ? v + ' mm' : v)}</dd></div>`; }).join('')}
      <div class="spec ${p.buy_in ? '' : 'wide'}"><dt>Catalogue page</dt><dd>p.${p.page}</dd></div>${p.buy_in ? '<div class="spec"><dt>Stock</dt><dd>Buy-in · enquire</dd></div>' : ''}</dl>
    ${sib.length ? `<div class="variants"><h3>Other finishes of this profile</h3><div class="chips">${sib.map(s => `<button class="chip" data-open="${esc(s.id)}">${esc(s.finish || s.code)}</button>`).join('')}</div></div>` : ''}
    <div class="actions" style="margin-top:14px"><button class="btn primary" data-star="${esc(p.id)}">${STAR}<span>${on ? 'In shortlist' : 'Add to shortlist'}</span></button>
      <a class="btn" href="${pdfLink(p.page)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/></svg>Catalogue p.${p.page}</a>
      <button class="btn" data-copy="${esc(p.id)}"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>Copy</button></div>
    <p class="note">Values as printed in the Alspec Industrial Catalogue (Brendale / Chevallum). Blank fields weren't printed. Check stock and specs with Alspec before ordering.</p>`;
  $('#sheet').hidden = false; document.body.style.overflow = 'hidden';
  history.replaceState(null, '', location.hash.split('&p=')[0].split('?p=')[0] + (location.hash.includes('?') ? '&' : '?') + 'p=' + encodeURIComponent(p.id));
  $('.d-close').focus();
}
function closeDetail() {
  $('#sheet').hidden = true; document.body.style.overflow = '';
  history.replaceState(null, '', location.hash.replace(/[?&]p=[^&]*/, ''));
}
const lineText = p => [title(p), p.description, dims(p) && dims(p) + ' mm', p.finish, p.alloy, p.length && 'L ' + p.length, p.kgm && p.kgm + ' kg/m', 'p.' + p.page].filter(Boolean).join(' · ');

function viewShortlist() {
  setNav('shortlist');
  const items = [...shortlist].map(id => BYID[id]).filter(Boolean);
  app.innerHTML = `<section class="head"><p class="eyebrow">Saved on this device</p><h1>Shortlist</h1><p class="lede">${items.length ? `${items.length} profile${items.length > 1 ? 's' : ''}` : 'Star profiles to keep them here.'}</p></section>
    ${items.length ? `<div class="actions" style="margin:0 0 12px"><button class="btn" id="copyall">Copy list</button><button class="btn" id="share">Share</button><button class="btn" id="clear">Clear</button></div><div class="list">${items.map(rowHTML).join('')}</div>`
      : `<div class="empty">Nothing saved yet.<br><a href="#/">Browse categories</a> and tap ☆ on a profile.</div>`}`;
  if (!items.length) return;
  const text = () => 'Aluminium shortlist (Alspec Industrial Catalogue)\n' + [...shortlist].map(id => BYID[id]).filter(Boolean).map(p => '• ' + lineText(p)).join('\n');
  $('#copyall').onclick = () => copy(text());
  $('#share').onclick = async () => { if (navigator.share) { try { await navigator.share({ title: 'Aluminium shortlist', text: text() }); } catch (e) {} } else copy(text()); };
  $('#clear').onclick = () => { if (confirm('Clear the shortlist?')) { shortlist.clear(); saveSL(); viewShortlist(); } };
}
async function copy(t) { try { await navigator.clipboard.writeText(t); toast('Copied'); } catch (e) { prompt('Copy:', t); } }

function viewAbout() {
  setNav('about');
  const gaps = DB.gaps.map(g => `<li>p.${g.page}: ${esc(gapText(g))}</li>`).join('');
  app.innerHTML = `<section class="head"><p class="eyebrow">About</p><h1>About this index</h1></section>
    <div class="card"><h2>Source</h2><p>Every line comes from the <a href="${DB.pdf_url}" target="_blank" rel="noopener">Alspec Industrial Catalogue (Brendale / Chevallum)</a>, ${DB.pdf_pages} pages. A script reads the PDF tables into <code>data/profiles.json</code>. Codes, sizes, wall, length, alloy, finish and kg/m are kept as printed. Nothing is estimated, and prices aren't included.</p></div>
    <div class="card"><h2>Tips</h2><ul><li>Search sizes like <code>50x25x3</code>. The order doesn't matter and spaces are fine.</li><li>"Buy-in" means the catalogue marks the item with asterisks: buy in, enquire for lead time.</li><li>Each profile links to its catalogue page.</li><li>Shape icons are generic drawings, not the catalogue artwork.</li></ul></div>
    <div class="card"><h2>Not captured</h2><ul>${gaps}<li>p.13: the table of contents lists One-Way Vision Mesh, but only hidden text is on the page. No visible table, so it's not included.</li><li>p.84: CNC end caps are listed by size only. No product codes are printed.</li></ul></div>
    <div class="card"><h2>Counts</h2><ul>${DB.categories.map(c => `<li>${esc(c.label)}: ${c.count}</li>`).join('')}</ul></div>`;
}
function gapText(g) {
  if (g.page <= 3) return 'contents page (no products)';
  if (g.page === 4) return 'alloy properties reference table (no product codes)';
  if (g.page === 5) return 'temper designations reference (no product codes)';
  if (g.page === 78) return 'silicones and sealants have no product codes printed';
  return g.issue;
}

/* ---- events & routing ---- */
document.addEventListener('click', e => {
  const s = e.target.closest('[data-star]');
  if (s) { e.stopPropagation(); const id = s.dataset.star; shortlist.has(id) ? shortlist.delete(id) : shortlist.add(id); saveSL();
    const on = shortlist.has(id);
    document.querySelectorAll(`[data-star="${CSS.escape(id)}"]`).forEach(b => { b.classList.toggle('on', on); const sp = b.querySelector('span'); if (sp) sp.textContent = on ? 'In shortlist' : 'Add to shortlist'; });
    toast(on ? 'Added to shortlist' : 'Removed'); if (route() === 'shortlist' && !on) viewShortlist(); return; }
  const c = e.target.closest('[data-copy]'); if (c) { copy(lineText(BYID[c.dataset.copy])); return; }
  if (e.target.closest('[data-close]')) { closeDetail(); return; }
  const o = e.target.closest('[data-open]'); if (o) openDetail(o.dataset.open);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#sheet').hidden) closeDetail();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.row[data-open]')) { e.preventDefault(); openDetail(e.target.dataset.open); }
  if (e.key === '/' && !e.target.matches('input,select,textarea')) { e.preventDefault(); const q = $('#q'); q ? q.focus() : (location.hash = '#/search'); }
});
const route = () => (location.hash.replace(/^#\/?/, '').split('?')[0].split('/')[0]) || 'home';
function render() {
  if (!$('#sheet').hidden) { $('#sheet').hidden = true; document.body.style.overflow = ''; }
  const parts = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  const r = parts[0] || 'home';
  if (r === 'c') viewList(parts[1]); else if (r === 'search') viewList(null); else if (r === 'shortlist') viewShortlist(); else if (r === 'about') viewAbout(); else viewHome();
  const pid = parseQS().p; if (pid && BYID[pid]) openDetail(pid);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);
load().then(render).catch(err => { app.innerHTML = `<div class="empty">Couldn't load the profile data. ${esc(err.message)}</div>`; });
})();
