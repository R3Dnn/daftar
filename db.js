'use strict';
/* دفتر — قواعد البيانات: جدول / لوحة / قائمة / تقويم + محررات الخصائص */

const VIEW_TYPES = { table: { label: 'جدول', icon: '▦' }, board: { label: 'لوحة', icon: '▥' }, list: { label: 'قائمة', icon: '☰' }, calendar: { label: 'تقويم', icon: '📅' } };
const SEL = t => t === 'select' || t === 'multi_select' || t === 'status';
let dbQuery = '';

/* ---------- قيم ---------- */
const optOf = (prop, id) => (prop.options || []).find(o => o.id === id);
function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fmtDate(v) {
  if (!v || !v.start) return '';
  const f = s => { const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s); if (isNaN(d)) return s; const t = s.length > 10 ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : ''; return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}${t}`; };
  return f(v.start) + (v.end ? ' ← ' + f(v.end) : '');
}
function textOf(prop, v, page) {
  if (prop.type === 'created') return page ? page.created_at.slice(0, 10) : '';
  if (prop.type === 'repeat') return v ? fmtRepeat(v) : '';
  if (v == null || v === '') return '';
  if (prop.type === 'select' || prop.type === 'status') { const o = optOf(prop, v); return o ? o.name : ''; }
  if (prop.type === 'multi_select') return (v || []).map(i => (optOf(prop, i) || {}).name).filter(Boolean).join('، ');
  if (prop.type === 'date') return fmtDate(v);
  if (prop.type === 'checkbox') return v ? '✓' : '';
  return String(v);
}
function pill(o) { return h('span', { class: 'pill c-' + (o.color || 'gray') }, o.name); }
function valueEl(prop, page, { interactive = true, empty = '' } = {}) {
  const v = page.props ? page.props[prop.id] : undefined;
  if (prop.type === 'checkbox') {
    const b = h('button', { class: 'cb' + (v ? ' on' : ''), 'aria-label': prop.name }, v ? '✓' : '');
    if (interactive) b.addEventListener('click', e => { e.stopPropagation(); page.props[prop.id] = !page.props[prop.id]; touchPage(page); b.className = 'cb' + (page.props[prop.id] ? ' on' : ''); b.textContent = page.props[prop.id] ? '✓' : ''; });
    return b;
  }
  if (prop.type === 'select' || prop.type === 'status') { const o = optOf(prop, v); return o ? pill(o) : h('span', { class: 'muted' }, empty); }
  if (prop.type === 'multi_select') { const os = (v || []).map(i => optOf(prop, i)).filter(Boolean); return os.length ? h('span', { style: 'display:inline-flex;gap:4px;flex-wrap:wrap' }, os.map(pill)) : h('span', { class: 'muted' }, empty); }
  if (prop.type === 'url') return v ? h('span', { dir: 'ltr', style: 'color:var(--accent)' }, String(v).replace(/^https?:\/\//, '')) : h('span', { class: 'muted' }, empty);
  const t = textOf(prop, v, page);
  return t ? h('span', { dir: 'auto' }, t) : h('span', { class: 'muted' }, empty);
}
function nextColor(prop) { return COLORS[(prop.options || []).length % COLORS.length]; }

/* ---------- محررات القيم ---------- */
function editValue(page, prop, after) {
  const db = S.dbs.get(page.database_id);
  const done = () => { touchPage(page); after && after(); };
  if (prop.type === 'created') return;
  if (prop.type === 'repeat') return editRepeat(page, prop, done);
  if (prop.type === 'checkbox') { page.props[prop.id] = !page.props[prop.id]; return done(); }
  if (SEL(prop.type)) return editSelect(page, prop, db, done);
  if (prop.type === 'date') return editDate(page, prop, done);
  const multiline = prop.type === 'text';
  const cur = page.props[prop.id];
  const input = multiline ? h('textarea', { rows: 5, dir: 'auto', value: cur == null ? '' : String(cur) }) : h('input', { dir: prop.type === 'number' ? 'ltr' : 'auto', type: prop.type === 'number' ? 'number' : (prop.type === 'url' ? 'url' : 'text'), inputmode: prop.type === 'number' ? 'decimal' : undefined, value: cur == null ? '' : String(cur) });
  const commit = () => { let v = input.value; if (prop.type === 'number') v = v === '' ? null : Number(v); if (v === '' || v == null) delete page.props[prop.id]; else page.props[prop.id] = v; done(); };
  const sh = openSheet({
    title: prop.name, body: api => h('div', {}, input, h('div', { class: 'row', style: 'margin-top:12px' },
      h('button', { class: 'btn primary grow', onclick: () => { commit(); api.close(); } }, 'تم'),
      h('button', { class: 'btn', onclick: () => { input.value = ''; commit(); api.close(); } }, 'مسح')))
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !multiline) { commit(); sh.close(); } });
  setTimeout(() => input.focus(), 60);
}
function editSelect(page, prop, db, done) {
  const multi = prop.type === 'multi_select';
  prop.options = prop.options || [];
  openSheet({
    title: prop.name, body: api => {
      const box = h('div');
      const cur = () => page.props[prop.id];
      const isOn = id => multi ? (cur() || []).includes(id) : cur() === id;
      const pickOpt = id => {
        if (multi) { const a = (cur() || []).slice(); const i = a.indexOf(id); if (i >= 0) a.splice(i, 1); else a.push(id); if (a.length) page.props[prop.id] = a; else delete page.props[prop.id]; draw(); done(); }
        else { if (cur() === id) delete page.props[prop.id]; else page.props[prop.id] = id; done(); api.close(); }
      };
      const nameIn = h('input', { dir: 'auto', placeholder: 'خيار جديد…', enterkeyhint: 'done' });
      const add = () => {
        const n = nameIn.value.trim(); if (!n) return;
        const o = { id: uid(), name: n, color: nextColor(prop) }; prop.options.push(o); touchDb(db); nameIn.value = '';
        if (multi) { page.props[prop.id] = (cur() || []).concat(o.id); draw(); done(); } else { page.props[prop.id] = o.id; done(); api.close(); }
      };
      nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
      function draw() {
        box.replaceChildren(
          ...(prop.options.length ? prop.options.map(o => h('div', { class: 'optrow' },
            h('button', { class: 'act grow', onclick: () => pickOpt(o.id) }, pill(o), isOn(o.id) ? h('span', { class: 'chk' }, '✓') : null),
            h('button', { class: 'ibtn', 'aria-label': 'تعديل الخيار', onclick: () => editOption(db, prop, o, () => { draw(); done(); }) }, '✎'))) : [h('div', { class: 'muted', style: 'padding:6px' }, 'لا خيارات بعد، أضف أول خيار 👇')]),
          h('div', { class: 'row', style: 'margin-top:10px' }, nameIn, h('button', { class: 'btn primary', onclick: add }, 'إضافة')),
          multi ? h('button', { class: 'btn grow', style: 'width:100%;margin-top:10px', onclick: api.close }, 'تم') : (cur() != null ? h('button', { class: 'btn', style: 'width:100%;margin-top:10px', onclick: () => { delete page.props[prop.id]; done(); api.close(); } }, 'بدون قيمة') : null));
      }
      draw(); return box;
    }
  });
}
function editOption(db, prop, o, after) {
  openSheet({
    title: 'تعديل الخيار', body: api => {
      const nm = h('input', { dir: 'auto', value: o.name });
      const sw = h('div', { class: 'swatches' }, COLORS.map(c => h('button', { class: 'sw' + (o.color === c ? ' on' : ''), style: `background:var(--c-${c})`, 'aria-label': c, onclick: e => { o.color = c; $$('.sw', sw).forEach(x => x.classList.remove('on')); e.currentTarget.classList.add('on'); } })));
      return h('div', {}, h('div', { class: 'field' }, h('label', {}, 'الاسم'), nm), h('div', { class: 'field' }, h('label', {}, 'اللون'), sw),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary grow', onclick: () => { o.name = nm.value.trim() || o.name; touchDb(db); api.close(); after && after(); } }, 'حفظ'),
          h('button', { class: 'btn danger', onclick: async () => { api.close(); if (await confirmSheet(`حذف الخيار «${o.name}»؟`)) { prop.options = prop.options.filter(x => x !== o); for (const r of dbRows(db.id)) { const v = r.props[prop.id]; if (Array.isArray(v)) { r.props[prop.id] = v.filter(i => i !== o.id); touchPage(r); } else if (v === o.id) { delete r.props[prop.id]; touchPage(r); } } touchDb(db); after && after(); } } }, 'حذف')));
    }
  });
}
function editDate(page, prop, done) {
  const cur = page.props[prop.id] || {};
  openSheet({
    title: prop.name, body: api => {
      const s = h('input', { type: 'date', value: cur.start ? cur.start.slice(0, 10) : '' });
      const e = h('input', { type: 'date', value: cur.end ? cur.end.slice(0, 10) : '' });
      const t = h('input', { type: 'time', value: cur.start && cur.start.length > 10 ? cur.start.slice(11, 16) : '' });
      return h('div', {}, h('div', { class: 'field' }, h('label', {}, 'التاريخ'), s), h('div', { class: 'field' }, h('label', {}, 'الوقت (اختياري)'), t), h('div', { class: 'field' }, h('label', {}, 'تاريخ النهاية (اختياري)'), e),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary grow', onclick: () => { if (s.value) { const start = t.value ? `${s.value}T${t.value}:00` : s.value; page.props[prop.id] = { start, end: e.value || null }; } else delete page.props[prop.id]; done(); api.close(); } }, 'تم'),
          h('button', { class: 'btn', onclick: () => { s.value = new Date().toISOString().slice(0, 10) === s.value ? s.value : ymd(new Date()); } }, 'اليوم'),
          h('button', { class: 'btn danger', onclick: () => { delete page.props[prop.id]; done(); api.close(); } }, 'مسح')));
    }
  });
}

/* ---------- لوحة خصائص الصفحة (صف) ---------- */
function propsPanel(page, db) {
  const wrap = h('div');
  const draw = () => {
    const props = db.schema.filter(p => p.id !== 'title');
    wrap.replaceChildren(h('div', { class: 'props' }, props.flatMap(pr => {
      const val = h('div', { class: 'pv', onclick: () => editValue(page, pr, draw) }, valueEl(pr, page, { empty: 'فارغ' }));
      return [h('div', { class: 'pk' }, h('span', {}, PROP_TYPES[pr.type].icon), pr.name), val];
    })), h('button', { class: 'btn sm ghost', style: 'margin-top:-10px', onclick: () => addPropSheet(db, null, pr => { draw(); }) }, '＋ خاصية'));
  };
  draw(); return wrap;
}

/* ---------- فلاتر وفرز ---------- */
function rangeHas(v, k) { return v.start.slice(0, 10) <= k && (v.end || v.start).slice(0, 10) >= k; }
function matchFilter(db, r, f) {
  const prop = db.schema.find(p => p.id === f.prop); if (!prop) return true;
  const v = prop.id === 'title' ? r.title : r.props[prop.id];
  switch (f.op) {
    case 'is': if (prop.type === 'checkbox') return !!v === !!f.value; if (prop.type === 'multi_select') return (v || []).includes(f.value); return v === f.value;
    case 'isnot': if (prop.type === 'multi_select') return !(v || []).includes(f.value); return v !== f.value;
    case 'contains': return String(prop.id === 'title' ? v : textOf(prop, v, r)).toLowerCase().includes(String(f.value || '').toLowerCase());
    case 'eq': return Number(v) === Number(f.value);
    case 'gt': return Number(v) > Number(f.value);
    case 'lt': return Number(v) < Number(f.value);
    case 'on': return v && v.start && v.start.slice(0, 10) === f.value;
    case 'before': return v && v.start && v.start.slice(0, 10) < f.value;
    case 'after': return v && v.start && v.start.slice(0, 10) > f.value;
    case 'today': return !!(v && v.start && rangeHas(v, ymd(new Date())));
    case 'yesterday': { const d = new Date(); d.setDate(d.getDate() - 1); return !!(v && v.start && rangeHas(v, ymd(d))); }
    case 'thisweek': { const a = new Date(); a.setDate(a.getDate() - a.getDay()); const b = new Date(a); b.setDate(b.getDate() + 6); return !!(v && v.start && v.start.slice(0, 10) <= ymd(b) && (v.end || v.start).slice(0, 10) >= ymd(a)); }
    case 'overdue': return !!(v && v.start && (v.end || v.start).slice(0, 10) < ymd(new Date()));
    case 'empty': return v == null || v === '' || (Array.isArray(v) && !v.length) || v === false;
    case 'notempty': return !(v == null || v === '' || (Array.isArray(v) && !v.length) || v === false);
  }
  return true;
}
const OPS = {
  select: [['is', 'هو'], ['isnot', 'ليس'], ['empty', 'فارغ'], ['notempty', 'غير فارغ']],
  checkbox: [['is', 'هو']],
  text: [['contains', 'يحتوي'], ['empty', 'فارغ'], ['notempty', 'غير فارغ']],
  number: [['eq', '='], ['gt', '>'], ['lt', '<'], ['empty', 'فارغ']],
  date: [['today', 'اليوم'], ['yesterday', 'أمس'], ['thisweek', 'هذا الأسبوع'], ['overdue', 'قبل اليوم'], ['on', 'في'], ['before', 'قبل'], ['after', 'بعد'], ['empty', 'فارغ'], ['notempty', 'غير فارغ']]
};
const opsFor = t => SEL(t) ? OPS.select : (t === 'checkbox' ? OPS.checkbox : (t === 'number' ? OPS.number : (t === 'date' || t === 'created' ? OPS.date : OPS.text)));
function cmpVals(prop, a, b, r1, r2) {
  const empty = x => x == null || x === '' || (Array.isArray(x) && !x.length);
  if (empty(a) && empty(b)) return 0; if (empty(a)) return 1; if (empty(b)) return -1;
  if (prop.type === 'number') return a - b;
  if (prop.type === 'date') return String(a.start).localeCompare(String(b.start));
  if (prop.type === 'checkbox') return (a ? 1 : 0) - (b ? 1 : 0);
  if (prop.type === 'select' || prop.type === 'status') return (prop.options.findIndex(o => o.id === a)) - (prop.options.findIndex(o => o.id === b));
  return textOf(prop, a).localeCompare(textOf(prop, b), 'ar');
}
function visibleRows(db, view, qq) {
  let rows = dbRows(db.id);
  const q = (qq !== undefined ? qq : dbQuery).trim().toLowerCase();
  if (q) rows = rows.filter(r => titleOf(r).toLowerCase().includes(q) || db.schema.some(p => p.id !== 'title' && textOf(p, r.props[p.id], r).toLowerCase().includes(q)));
  for (const f of view.filters || []) rows = rows.filter(r => matchFilter(db, r, f));
  if (view.sort) {
    const prop = view.sort.prop === '__created' ? { id: '__created', type: 'created', name: 'تاريخ الإضافة' } : db.schema.find(p => p.id === view.sort.prop);
    if (prop) {
      const dir = view.sort.dir === 'desc' ? -1 : 1;
      const isEmpty = r => { if (prop.id === 'title' || prop.type === 'created') return false; const x = r.props[prop.id]; return x == null || x === '' || x === false || (Array.isArray(x) && !x.length) || (prop.type === 'date' && !x.start); };
      rows.sort((a, b) => {
        const ea = isEmpty(a), eb = isEmpty(b);
        if (ea !== eb) return ea ? 1 : -1; // الفارغ دائماً في الآخر
        if (ea && eb) return sortItems(a, b);
        const c = prop.id === 'title' ? titleOf(a).localeCompare(titleOf(b), 'ar') : prop.type === 'created' ? a.created_at.localeCompare(b.created_at) : cmpVals(prop, a.props[prop.id], b.props[prop.id]);
        return dir * c || sortItems(a, b);
      });
      return rows;
    }
  }
  return rows.sort(sortItems);
}

/* ---------- صفحة قاعدة البيانات ---------- */
function currentView(db) {
  if (!db.views || !db.views.length) { db.views = [{ id: uid(), name: 'جدول', type: 'table', filters: [], sort: null }]; touchDb(db); }
  return db.views.find(v => v.id === S.ui.view[db.id]) || db.views.find(v => v.default) || db.views[0];
}
function dbBody(db, rerender) {
  const view = currentView(db);
  let q = '';
  const tabs = h('div', { class: 'vtabs' }, db.views.map(v => h('button', { class: 'vtab' + (v.id === view.id ? ' on' : ''), onclick: () => { if (v.id === view.id) viewSheet(db, v, rerender); else { S.ui.view[db.id] = v.id; saveUi(); rerender(); } } }, VIEW_TYPES[v.type].icon, v.name)),
    h('button', { class: 'vtab', onclick: () => addViewSheet(db, rerender) }, '＋ عرض'));
  const nf = (view.filters || []).length;
  const bar = h('div', { class: 'toolbar' },
    h('input', { type: 'search', placeholder: '🔍 بحث', dir: 'auto', oninput: e => { q = e.target.value; renderViewBody(); } }),
    h('button', { class: 'btn sm', onclick: () => filterSheet(db, view, rerender) }, '⚲ فلتر', nf ? h('span', { class: 'chip' }, nf) : null),
    h('button', { class: 'btn sm', onclick: () => sortSheet(db, view, rerender) }, '⇅ ترتيب', view.sort ? h('span', { class: 'chip' }, view.sort.prop === '__created' ? 'تاريخ الإضافة' : ((db.schema.find(p => p.id === view.sort.prop) || {}).name || '') + (view.sort.dir === 'desc' ? ' ↓' : ' ↑')) : null),
    view.type === 'table' ? h('button', { class: 'btn sm', onclick: () => columnsSheet(db, view, rerender) }, '☷ الأعمدة') : null,
    h('span', { class: 'grow' }),
    h('button', { class: 'btn primary', onclick: () => { if (view.type === 'week') { quickAddSheet(db, view, null, rerender); return; } const r = newPage({ database_id: db.id, props: presetsFromFilters(db, view) }); openRow(r.id); } }, view.type === 'week' ? '＋ فترة' : '＋ جديد'));
  const bodyHost = h('div');
  const qa = (view.type === 'week' || view.type === 'gallery') ? null : h('input', { class: 'qadd', dir: 'auto', enterkeyhint: 'done', placeholder: view.type === 'calendar' ? '＋ اكتب مهمة لليوم واضغط Enter' : '＋ اكتب مهمة جديدة واضغط Enter' });
  if (qa) qa.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !qa.value.trim()) return;
    const props = presetsFromFilters(db, view);
    const dp = db.schema.find(p => p.type === 'date');
    const today = (view.filters || []).some(f => f.op === 'today');
    if (dp && (view.type === 'calendar' || today)) props[dp.id] = { start: ymd(new Date()), end: null };
    if (view.type === 'board') { const gp = groupProp(db, view); if (gp && !props[gp.id] && (gp.options || [])[0]) props[gp.id] = gp.options[0].id; }
    const st = db.schema.find(isStatusProp); if (st && !props[st.id]) { const first = (st.options || []).find(o => !DONE_RE.test(o.name) && !MISS_RE.test(o.name)); if (first) props[st.id] = first.id; }
    newPage({ database_id: db.id, title: qa.value.trim(), props }); qa.value = ''; renderViewBody(); toast('✓ انضافت');
  });
  function renderViewBody() {
    const rows = visibleRows(db, view, q);
    const el = view.type === 'week' ? weekView(db, view, rows, rerender) : view.type === 'board' ? boardView(db, view, rows, rerender) : view.type === 'calendar' ? calendarView(db, view, rows, rerender) : view.type === 'gallery' ? galleryView(db, view, rows, rerender) : view.type === 'list' ? listView(db, view, rows, rerender) : tableView(db, view, rows, rerender);
    bodyHost.replaceChildren(el);
  }
  renderViewBody();
  return h('div', { class: 'dbbody' }, tabs, bar, qa, bodyHost);
}
function dbPage(db) {
  const rerender = () => { const m = $('#main'); const t = m.scrollTop; m.replaceChildren(dbPage(db)); m.scrollTop = t; };
  const titleIn = h('input', { class: 'db-title', dir: 'auto', value: db.title || '', placeholder: 'اسم القاعدة', oninput: e => { db.title = e.target.value; touchDb(db); } });
  titleIn.addEventListener('change', renderSide);
  const iconB = h('button', { class: 'ibtn', style: 'font-size:30px;width:52px;height:52px', onclick: () => emojiSheet(db.icon, e => { db.icon = e; touchDb(db); render(); }) }, db.icon || '🗃️');
  const head = [h('span', { class: 'sync', id: 'syncind' }), h('button', { class: 'ibtn', 'aria-label': 'المزيد', onclick: () => itemMenu('db', db) }, '⋯')];
  return h('div', {}, topbar(crumbsFor(db), head), h('div', { class: 'page wide' }, h('div', { class: 'db-head' }, iconB, titleIn), dbBody(db, rerender)));
}
/* قاعدة بيانات داخل صفحة (مثل نوشن): عنوان صغير + عروضها */
function dbEmbed(db) {
  const host = h('div', { class: 'dbembed' });
  const re = () => {
    host.replaceChildren(h('div', { class: 'db-embed-h' }, h('span', {}, iconOf(db, 'db')), h('a', { class: 'db-embed-t', onclick: () => openItem('db', db.id) }, titleOf(db)),
      h('button', { class: 'ibtn', style: 'width:36px;height:36px', 'aria-label': 'فتح كاملة', onclick: () => openItem('db', db.id) }, '↗')), dbBody(db, re));
  };
  re(); return host;
}

/* ---------- معرض (بطاقات بصور) ---------- */
function galleryView(db, view, rows, rerender) {
  const shown = db.schema.filter(p => p.id !== 'title' && p.type !== 'created' && !(view.hidden || []).includes(p.id)).slice(0, 2);
  const grid = h('div', { class: 'gallery' });
  for (const r of rows) {
    const card = h('div', { class: 'gcard' + stClass(db, r), onclick: () => openRow(r.id) },
      h('div', { class: 'gcover', style: coverStyle(r.cover) || 'background:var(--panel3)' }),
      h('div', { class: 'gtitle', dir: 'auto' }, h('span', {}, r.icon || '📄'), h('span', {}, titleOf(r))),
      (() => { const els = shown.map(p => valueEl(p, r, { interactive: false })).filter(e => e.textContent || e.tagName === 'BUTTON'); return els.length ? h('div', { class: 'cp', style: 'padding:0 10px 10px' }, els) : null; })());
    longPress(card, () => rowMenu(r)); grid.append(card);
  }
  grid.append(h('div', { class: 'gcard gnew', onclick: () => { const r = newPage({ database_id: db.id, props: presetsFromFilters(db, view) }); openRow(r.id); } }, '＋ صفحة جديدة'));
  return grid;
}
function presetsFromFilters(db, view) {
  const pr = {};
  for (const f of view.filters || []) { const p = db.schema.find(x => x.id === f.prop); if (!p || f.op !== 'is') continue; if (p.type === 'checkbox') pr[p.id] = !!f.value; else if (p.type === 'multi_select') pr[p.id] = [f.value]; else if (SEL(p.type)) pr[p.id] = f.value; }
  return pr;
}
function openRow(id) {
  const p = S.pages.get(id); if (!p) return;
  const sh = openSheet({
    modal: true, title: iconOf(p) + ' ' + titleOf(p), onClose: () => { if (S.route.t === 'd') { const m = $('#main'); const t = m.scrollTop; m.replaceChildren(dbPage(S.dbs.get(S.route.id))); m.scrollTop = t; } renderSide(); },
    head: [h('button', { class: 'ibtn', 'aria-label': 'فتح كصفحة', onclick: () => { sh.close(); openItem('page', id); } }, '↗'), h('button', { class: 'ibtn', 'aria-label': 'المزيد', onclick: () => rowMenu(p, sh) }, '⋯')]
  });
  sh.body.append(pageView(p, { modal: true }));
}
function rowMenu(p, sh) {
  actionSheet(titleOf(p), [
    { icon: '⧉', label: 'تكرار', run: () => { const c = newPage({ database_id: p.database_id, title: (p.title || '') + ' (نسخة)', icon: p.icon, props: JSON.parse(JSON.stringify(p.props || {})) }); c.content = JSON.parse(JSON.stringify(p.content || [])).map(b => Object.assign(b, { id: uid() })); touchPage(c); if (sh) sh.close(); const m = $('#main'); if (S.route.t === 'd') m.replaceChildren(dbPage(S.dbs.get(S.route.id))); toast('تم التكرار'); } },
    { icon: '🖼', label: 'تغيير صورة البطاقة (الغلاف)', run: () => coverSheet(p, () => { const m = $('#main'); if (m) render(); }) },
    { icon: '🙂', label: 'تغيير الأيقونة', run: () => emojiSheet(p.icon, e => { p.icon = e; touchPage(p); if (S.route.t === 'd') $('#main').replaceChildren(dbPage(S.dbs.get(S.route.id))); }) },
    { icon: '🗑', label: 'حذف', danger: true, run: async () => { if (await confirmSheet(`حذف «${titleOf(p)}»؟`)) { if (sh) sh.close(); await deletePageTree(p.id); if (S.route.t === 'd') $('#main').replaceChildren(dbPage(S.dbs.get(S.route.id))); } } }
  ]);
}

/* ---------- جدول ---------- */
function visibleProps(db, view) { return db.schema.filter(p => p.id !== 'title' && !(view.hidden || []).includes(p.id)); }
function tableView(db, view, rows, rerender) {
  const props = visibleProps(db, view); const tp = db.schema.find(p => p.id === 'title') || { id: 'title', name: 'الاسم', type: 'title' };
  const thead = h('thead', {}, h('tr', {}, h('th', { class: 'g' }), h('th', { onclick: () => propSheet(db, view, tp, rerender) }, 'Aa ' + tp.name),
    props.map(pr => h('th', { onclick: () => propSheet(db, view, pr, rerender) }, PROP_TYPES[pr.type].icon + ' ' + pr.name + (view.sort && view.sort.prop === pr.id ? (view.sort.dir === 'desc' ? ' ↓' : ' ↑') : ''))),
    h('th', { class: 'g', onclick: () => addPropSheet(db, view, () => rerender()), 'aria-label': 'إضافة خاصية' }, '＋')));
  const tbody = h('tbody');
  const addRowEl = r => {
    const tr = h('tr', { 'data-id': r.id },
      h('td', { class: 'g' }, h('span', { class: 'rgrip', title: 'اسحب للترتيب' }, '⠿')),
      h('td', { class: 'tcell' + stClass(db, r), onclick: () => openRow(r.id) }, h('span', {}, iconOf(r) === '📄' ? '' : iconOf(r) + ' '), titleOf(r)),
      props.map(pr => cellTd(pr, r, rerender)),
      h('td', { class: 'g' }));
    longPress(tr, () => rowMenu(r));
    return tr;
  };
  const gp = view.group ? db.schema.find(p => p.id === view.group && SEL(p.type)) : null;
  if (gp) {
    const groups = (gp.options || []).map(o => ({ key: o.id, opt: o, rows: [] })).concat([{ key: '', opt: null, rows: [] }]);
    for (const r of rows) { const v = r.props[gp.id]; const k = gp.type === 'multi_select' ? (v || [])[0] || '' : (v || ''); (groups.find(x => x.key === k) || groups[groups.length - 1]).rows.push(r); }
    const cbp = db.schema.find(p => p.type === 'checkbox');
    const estP = db.schema.find(p => p.type === 'number' && /مقدّر|مقدر|estimate/i.test(p.name)), spP = db.schema.find(p => p.type === 'number' && /منقضي|spent/i.test(p.name));
    for (const g of groups) {
      if (!g.rows.length) continue;
      const ck = 'g:' + db.id + ':' + view.id + ':' + g.key; S.ui.collapsed = S.ui.collapsed || []; const col = S.ui.collapsed.includes(ck);
      const done = cbp ? g.rows.filter(r => r.props[cbp.id]).length : 0;
      let sum = '';
      if (cbp) sum += `${done}/${g.rows.length} منجز`;
      if (estP) { const left = g.rows.filter(r => !(cbp && r.props[cbp.id])).reduce((a, r) => a + Math.max(0, (r.props[estP.id] || 0) - (spP ? (r.props[spP.id] || 0) : 0)), 0); if (left) sum += ` · باقي ${left} د (${(left / 60).toFixed(1)} س)`; }
      tbody.append(h('tr', { class: 'grp' }, h('td', { colspan: props.length + 3, onclick: () => { const i = S.ui.collapsed.indexOf(ck); if (i >= 0) S.ui.collapsed.splice(i, 1); else S.ui.collapsed.push(ck); saveUi(); rerender(); } },
        h('span', { class: 'gtw' }, col ? '◂' : '▾'), g.opt ? pill(g.opt) : h('span', { class: 'muted' }, 'بدون ' + gp.name), h('span', { class: 'muted', style: 'margin-inline-start:8px;font-size:13px' }, sum || g.rows.length))));
      if (!col) g.rows.forEach(r => tbody.append(addRowEl(r)));
    }
  } else {
    rows.forEach(r => tbody.append(addRowEl(r)));
    Sortable.create(tbody, { handle: '.rgrip', animation: 150, ghostClass: 'sortable-ghost', onEnd: e => reorderRow(e.item, view) });
  }
  const wrap = h('div', { class: 'tbl-wrap' }, h('table', {}, thead, tbody));
  return h('div', {}, wrap, h('div', { class: 'newrow', onclick: () => { const r = newPage({ database_id: db.id, props: presetsFromFilters(db, view) }); openRow(r.id); } }, '＋ جديد'),
    h('div', { class: 'muted', style: 'padding:4px 8px;font-size:13px' }, rows.length + ' عنصر'));
}
function cellTd(pr, r, rerender) {
  const td = h('td', { class: 'cell', onclick: () => { if (pr.type !== 'checkbox') editValue(r, pr, () => rerender()); } }, valueEl(pr, r));
  if (typeof isStatusProp === 'function' && isStatusProp(pr)) {
    const done = (pr.options || []).find(o => DONE_RE.test(o.name)), miss = (pr.options || []).find(o => MISS_RE.test(o.name));
    const mk = (o, ic, cls) => h('button', { class: 'qb ' + cls, 'aria-label': o.name, onclick: e => { e.stopPropagation(); if (r.props[pr.id] === o.id) { const first = (pr.options || [])[0]; if (first && first !== o) r.props[pr.id] = first.id; else delete r.props[pr.id]; } else r.props[pr.id] = o.id; touchPage(r); rerender(); } }, ic);
    if (done || miss) td.append(...[done && mk(done, '✓', 'ok'), miss && mk(miss, '✗', 'bad')].filter(Boolean));
  }
  return td;
}
function reorderRow(item, view) {
  const r = S.pages.get(item.dataset.id); if (!r) return;
  const a = S.pages.get(item.previousElementSibling && item.previousElementSibling.dataset.id), b = S.pages.get(item.nextElementSibling && item.nextElementSibling.dataset.id);
  r.position = a && b ? (a.position + b.position) / 2 : a ? a.position + 1 : b ? b.position - 1 : r.position;
  touchPage(r);
}

/* ---------- لوحة ---------- */
function groupProp(db, view) { return db.schema.find(p => p.id === view.groupBy && (p.type === 'select' || p.type === 'status')); }
function boardView(db, view, rows, rerender) {
  const gp = groupProp(db, view);
  if (!gp) return h('div', { class: 'muted', style: 'padding:20px' }, 'اختر خاصية «اختيار/حالة» للتجميع: اضغط على تبويب العرض ثم اختر التجميع.', h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn', onclick: () => viewSheet(db, view, rerender) }, 'إعدادات العرض')));
  const cols = (gp.options || []).map(o => ({ id: o.id, opt: o })).concat([{ id: '', opt: null }]);
  const shown = db.schema.filter(p => p.id !== 'title' && p.id !== gp.id && !(view.hidden || []).includes(p.id)).slice(0, 3);
  const wrap = h('div', { class: 'board' });
  for (const c of cols) {
    const items = rows.filter(r => (r.props[gp.id] || '') === c.id);
    if (!c.opt && !items.length) continue;
    const body = h('div', { class: 'col-b', 'data-opt': c.id });
    for (const r of items) {
      const card = h('div', { class: 'card' + stClass(db, r), 'data-id': r.id }, h('span', { class: 'cg', title: 'اسحب' }, '⠿'),
        h('div', { class: 'cb-body', onclick: () => openRow(r.id) }, h('div', { class: 'ct', dir: 'auto' }, (r.icon ? r.icon + ' ' : '') + titleOf(r)),
          (() => { const ps = shown.map(p => ({ p, el: valueEl(p, r, { interactive: false }) })).filter(x => textOf(x.p, r.props[x.p.id], r) || SEL(x.p.type) && r.props[x.p.id]); return ps.length ? h('div', { class: 'cp' }, ps.map(x => x.el)) : null; })()));
      longPress(card, () => rowMenu(r));
      body.append(card);
    }
    Sortable.create(body, {
      group: 'board-' + view.id, handle: '.cg', animation: 150, ghostClass: 'sortable-ghost', onEnd: e => {
        const r = S.pages.get(e.item.dataset.id); if (!r) return;
        const to = e.to.dataset.opt;
        if (to) r.props[gp.id] = to; else delete r.props[gp.id];
        if (!view.sort) {
          const a = S.pages.get(e.item.previousElementSibling && e.item.previousElementSibling.dataset.id), b = S.pages.get(e.item.nextElementSibling && e.item.nextElementSibling.dataset.id);
          r.position = a && b ? (a.position + b.position) / 2 : a ? a.position + 1 : b ? b.position - 1 : r.position;
        }
        touchPage(r); rerender();
      }
    });
    const head = h('div', { class: 'col-h' }, c.opt ? pill(c.opt) : h('span', { class: 'muted' }, 'بدون ' + gp.name), h('span', { class: 'muted' }, items.length), h('span', { class: 'grow' }),
      h('button', { class: 'ibtn', style: 'width:36px;height:36px', 'aria-label': 'إضافة', onclick: () => { const pre = presetsFromFilters(db, view); if (c.id) pre[gp.id] = c.id; const r = newPage({ database_id: db.id, props: pre }); openRow(r.id); } }, '＋'));
    wrap.append(h('div', { class: 'col' }, head, body));
  }
  return wrap;
}

/* ---------- قائمة ---------- */
function listView(db, view, rows, rerender) {
  const cb = db.schema.find(p => p.type === 'checkbox'); const sel = db.schema.filter(p => SEL(p.type)).slice(0, 2); const dt = db.schema.find(p => p.type === 'date');
  const box = h('div', { class: 'tbl-wrap', style: 'padding:0 6px' });
  const list = h('div');
  for (const r of rows) {
    const row = h('div', { class: 'lrow' + stClass(db, r), 'data-id': r.id }, h('span', { class: 'rgrip' }, '⠿'), cb ? valueEl(cb, r) : null,
      h('div', { class: 'lt', dir: 'auto', onclick: () => openRow(r.id), style: cb && r.props[cb.id] ? 'text-decoration:line-through;color:var(--muted)' : '' }, (r.icon ? r.icon + ' ' : '') + titleOf(r)),
      sel.map(p => valueEl(p, r, { interactive: false })), dt ? h('span', { class: 'muted', style: 'font-size:13px' }, fmtDate(r.props[dt.id])) : null);
    longPress(row, () => rowMenu(r)); list.append(row);
  }
  Sortable.create(list, { handle: '.rgrip', animation: 150, ghostClass: 'sortable-ghost', onEnd: e => reorderRow(e.item, view) });
  box.append(list, h('div', { class: 'newrow', onclick: () => { const r = newPage({ database_id: db.id, props: presetsFromFilters(db, view) }); openRow(r.id); } }, '＋ جديد'));
  if (!rows.length) box.prepend(h('div', { class: 'muted', style: 'padding:16px' }, 'لا عناصر'));
  return box;
}

/* ---------- تقويم ---------- */
function calCard(db, r, rerender, { bar = false, cls = '' } = {}) {
  const st = rowState(db, r), track = isTaskDb(db);
  const sel = db.schema.find(p => p.type === 'select' && !isStatusProp(p)), op = sel ? optOf(sel, r.props[sel.id]) : null;
  const txt = db.schema.find(p => p.type === 'text'), note = txt ? (r.props[txt.id] || '') : '';
  const cb = track ? h('button', { class: 'cb sm' + (st === 'done' ? ' on' : ''), 'aria-label': 'إنجاز', onclick: e => { e.stopPropagation(); toggleRowDone(db, r); rerender(); } }, st === 'done' ? '✓' : '') : null;
  return h('div', { class: (bar ? 'cbar' : 'ccard') + (st ? ' st-' + st : '') + cls, 'data-id': r.id, onclick: () => openRow(r.id) },
    cb, h('div', { class: 'cc-b' }, h('div', { class: 'cbt', dir: 'auto' }, (r.icon ? r.icon + ' ' : '') + titleOf(r)),
      op || note ? h('div', { class: 'cc-m' }, op ? pill(op) : null, note ? h('span', { class: 'muted', dir: 'auto' }, String(note).slice(0, 40)) : null) : null));
}
function calendarView(db, view, rows, rerender) {
  const dp = db.schema.find(p => p.id === view.dateProp && p.type === 'date');
  if (!dp) return h('div', { class: 'muted', style: 'padding:20px' }, 'اختر خاصية «تاريخ» لهذا العرض.', h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn', onclick: () => viewSheet(db, view, rerender) }, 'إعدادات العرض')));
  const mode = view.calMode || 'month';
  const key = db.id + ':' + view.id + ':' + mode; const today = new Date(), tk = ymd(today);
  const evs = [];
  for (const r of rows) { const v = r.props[dp.id]; if (v && v.start) { const s0 = v.start.slice(0, 10), e0 = (v.end || v.start).slice(0, 10); evs.push({ r, s: s0, e: e0 < s0 ? s0 : e0 }); } }
  const addOn = k => () => { const pre = presetsFromFilters(db, view); pre[dp.id] = { start: k, end: null }; const r = newPage({ database_id: db.id, props: pre }); openRow(r.id); };
  const dropTo = lst => Sortable.create(lst, {
    group: 'cal-' + view.id, animation: 150, delay: 160, delayOnTouchOnly: true, ghostClass: 'sortable-ghost', draggable: '[data-single]', onEnd: e => {
      const r = S.pages.get(e.item.dataset.id); if (!r) return; const old = r.props[dp.id] || {};
      const t = old.start && old.start.length > 10 ? old.start.slice(10) : '';
      r.props[dp.id] = { start: e.to.dataset.day + t, end: null }; touchPage(r); rerender();
    }
  });
  const modeBtns = h('div', { class: 'seg' }, [['month', 'شهر'], ['week', 'أسبوع']].map(([m, l]) => h('button', { class: mode === m ? 'on' : '', onclick: () => { view.calMode = m; touchDb(db); rerender(); } }, l)));
  let body, label, shift;
  if (mode === 'week') {
    const base = S.ui.cal[key] ? new Date(S.ui.cal[key] + 'T00:00:00') : weekStart(today);
    shift = n => { const d = new Date(base); d.setDate(d.getDate() + 7 * n); S.ui.cal[key] = ymd(d); saveUi(); rerender(); };
    const last = new Date(base); last.setDate(last.getDate() + 6); label = `${base.getDate()}/${base.getMonth() + 1} — ${last.getDate()}/${last.getMonth() + 1}`;
    body = h('div', { class: 'week' });
    for (let i = 0; i < 7; i++) {
      const d = new Date(base); d.setDate(d.getDate() + i); const k = ymd(d);
      const lst = h('div', { class: 'wk-list', 'data-day': k, style: 'min-height:80px' });
      for (const ev of evs) if (ev.s <= k && ev.e >= k) { const c = calCard(db, ev.r, rerender, { cls: ev.s === ev.e ? '' : ' multi' }); if (ev.s === ev.e) c.dataset.single = '1'; else c.append(h('span', { class: 'muted', style: 'font-size:11px;margin-inline-start:auto' }, `${Math.round((new Date(k) - new Date(ev.s)) / 864e5) + 1}/${Math.round((new Date(ev.e) - new Date(ev.s)) / 864e5) + 1}`)); lst.append(c); }
      dropTo(lst);
      body.append(h('div', { class: 'wk-col' + (k === tk ? ' today' : '') }, h('div', { class: 'wk-h' }, h('b', {}, DAYS[d.getDay()]), h('span', { class: 'muted' }, `${d.getDate()}/${d.getMonth() + 1}`), h('span', { class: 'grow' }),
        h('button', { class: 'ibtn', style: 'width:32px;height:32px', 'aria-label': 'إضافة', onclick: addOn(k) }, '＋')), lst));
    }
  } else {
    const ym = S.ui.cal[key] || `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
    const [Y, M] = ym.split('-').map(Number);
    const first = new Date(Y, M - 1, 1), start = new Date(Y, M - 1, 1 - first.getDay());
    shift = n => { const d = new Date(Y, M - 1 + n, 1); S.ui.cal[key] = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; saveUi(); rerender(); };
    label = new Intl.DateTimeFormat('ar-u-ca-gregory', { month: 'long', year: 'numeric' }).format(first);
    body = h('div', { class: 'cal2' });
    const dow = h('div', { class: 'cdow' }); DAYS.forEach(d => dow.append(h('div', {}, d))); body.append(dow);
    for (let w = 0; w < 6; w++) {
      const ws = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7); if (w >= 5 && ws.getMonth() !== M - 1) break;
      const days = Array.from({ length: 7 }, (_, i) => new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i)), keys = days.map(ymd), wk0 = keys[0], wk6 = keys[6];
      const bars = [], singles = {};
      for (const ev of evs) {
        if (ev.e < wk0 || ev.s > wk6) continue;
        if (ev.s === ev.e) { (singles[ev.s] = singles[ev.s] || []).push(ev); continue; }
        bars.push({ ev, c1: keys.indexOf(ev.s < wk0 ? wk0 : ev.s), c2: keys.indexOf(ev.e > wk6 ? wk6 : ev.e), cutL: ev.s < wk0, cutR: ev.e > wk6 });
      }
      bars.sort((x, y) => x.c1 - y.c1 || (y.c2 - y.c1) - (x.c2 - x.c1));
      const lanes = []; for (const b of bars) { let l = 0; while (lanes[l] !== undefined && lanes[l] >= b.c1) l++; lanes[l] = b.c2; b.lane = l; }
      const nl = lanes.length;
      const grid = h('div', { class: 'cweek', style: `grid-template-rows:auto repeat(${nl},auto) minmax(40px,auto)` });
      days.forEach((d, i) => {
        grid.append(h('div', { class: 'cbg' + (d.getMonth() !== M - 1 ? ' out' : '') + (keys[i] === tk ? ' today' : ''), style: `grid-column:${i + 1};grid-row:1/-1` }));
        grid.append(h('div', { class: 'cdn', style: `grid-column:${i + 1};grid-row:1` }, h('span', { class: 'dnum' + (keys[i] === tk ? ' now' : '') }, d.getDate()), h('button', { class: 'dn', 'aria-label': 'إضافة في هذا اليوم', onclick: addOn(keys[i]) }, '＋')));
      });
      for (const b of bars) { const c = calCard(db, b.ev.r, rerender, { bar: true, cls: (b.cutL ? ' cutl' : '') + (b.cutR ? ' cutr' : '') }); c.style.cssText = `grid-column:${b.c1 + 1}/${b.c2 + 2};grid-row:${2 + b.lane}`; grid.append(c); }
      days.forEach((d, i) => {
        const lst = h('div', { class: 'evs', 'data-day': keys[i], style: `grid-column:${i + 1};grid-row:${2 + nl}` });
        for (const ev of singles[keys[i]] || []) { const c = calCard(db, ev.r, rerender); c.dataset.single = '1'; lst.append(c); }
        dropTo(lst); grid.append(lst);
      });
      body.append(grid);
    }
  }
  return h('div', {}, h('div', { class: 'cal-head' }, modeBtns, h('button', { class: 'ibtn', onclick: () => shift(-1), 'aria-label': 'السابق' }, '›'), h('b', { class: 'grow', style: 'text-align:center' }, label), h('button', { class: 'ibtn', onclick: () => shift(1), 'aria-label': 'التالي' }, '‹'),
    h('button', { class: 'btn sm', onclick: () => { delete S.ui.cal[key]; saveUi(); rerender(); } }, 'اليوم')), body);
}

/* ---------- شيتات الإعدادات ---------- */
function filterSheet(db, view, rerender) {
  view.filters = view.filters || [];
  openSheet({
    title: 'الفلتر', onClose: rerender, body: api => {
      const box = h('div');
      const save = () => touchDb(db);
      const draw = () => {
        box.replaceChildren(...view.filters.map((f, i) => {
          const prop = db.schema.find(p => p.id === f.prop) || db.schema[0];
          const propSel = h('select', { onchange: e => { f.prop = e.target.value; const np = db.schema.find(p => p.id === f.prop); f.op = opsFor(np.type)[0][0]; f.value = np.type === 'checkbox' ? true : ''; save(); draw(); } }, db.schema.map(p => h('option', { value: p.id, selected: p.id === f.prop }, p.name)));
          const opSel = h('select', { onchange: e => { f.op = e.target.value; save(); draw(); } }, opsFor(prop.type).map(([k, l]) => h('option', { value: k, selected: k === f.op }, l)));
          let val = null;
          if (!['empty', 'notempty', 'today', 'yesterday', 'thisweek', 'overdue'].includes(f.op)) {
            if (SEL(prop.type)) val = h('select', { onchange: e => { f.value = e.target.value; save(); } }, [h('option', { value: '' }, '— اختر —')].concat((prop.options || []).map(o => h('option', { value: o.id, selected: o.id === f.value }, o.name))));
            else if (prop.type === 'checkbox') val = h('select', { onchange: e => { f.value = e.target.value === '1'; save(); } }, [h('option', { value: '1', selected: f.value === true }, 'مفعّل'), h('option', { value: '0', selected: f.value === false }, 'غير مفعّل')]);
            else if (prop.type === 'date' || prop.type === 'created') val = h('input', { type: 'date', value: f.value || '', onchange: e => { f.value = e.target.value; save(); } });
            else if (prop.type === 'number') val = h('input', { type: 'number', value: f.value || '', onchange: e => { f.value = e.target.value; save(); } });
            else val = h('input', { dir: 'auto', value: f.value || '', onchange: e => { f.value = e.target.value; save(); }, placeholder: 'القيمة' });
          }
          return h('div', { class: 'field', style: 'border:1px solid var(--line);border-radius:12px;padding:10px' }, h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('div', { class: 'grow' }, propSel), h('div', { class: 'grow' }, opSel), h('button', { class: 'ibtn', 'aria-label': 'حذف الفلتر', onclick: () => { view.filters.splice(i, 1); save(); draw(); } }, '🗑')), val ? h('div', { style: 'margin-top:8px' }, val) : null);
        }), h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn primary grow', onclick: () => { const p = db.schema[0]; const np = db.schema.find(x => SEL(x.type)) || p; view.filters.push({ prop: np.id, op: opsFor(np.type)[0][0], value: np.type === 'checkbox' ? true : '' }); save(); draw(); } }, '＋ إضافة فلتر'), h('button', { class: 'btn', onclick: api.close }, 'تم')));
      };
      draw(); return box;
    }
  });
}
function sortSheet(db, view, rerender) {
  const dp = db.schema.find(p => p.type === 'date');
  const key = dp ? dp.id : '__created', kname = dp ? dp.name : 'تاريخ الإضافة';
  openSheet({
    title: 'الترتيب', onClose: rerender, body: api => {
      const set = (prop, dir) => { view.sort = prop ? { prop, dir } : null; touchDb(db); api.close(); };
      const cur = view.sort ? view.sort.prop + ':' + view.sort.dir : '';
      const quick = [[key, 'desc', `🕒 الأحدث أولاً (${kname})`], [key, 'asc', `🕰 الأقدم أولاً (${kname})`], ['__created', 'desc', '🆕 آخر ما أضفته'], ['title', 'asc', 'أ ← ي (الاسم)']];
      const sel = h('select', {}, [h('option', { value: '' }, '— اختر خاصية —')].concat(db.schema.map(p => h('option', { value: p.id, selected: view.sort && view.sort.prop === p.id }, p.name))));
      return h('div', {},
        quick.map(([p, dir, l]) => h('button', { class: 'act', onclick: () => set(p, dir) }, h('span', {}, l), cur === p + ':' + dir ? h('span', { class: 'chk' }, '✓') : null)),
        h('button', { class: 'act', onclick: () => set(null) }, h('span', {}, '✋ يدوي (اسحب الصفوف بنفسك)'), !view.sort ? h('span', { class: 'chk' }, '✓') : null),
        h('div', { class: 's-label' }, 'ترتيب مخصص'), h('div', { class: 'field' }, sel),
        h('div', { class: 'row' }, h('button', { class: 'btn grow', onclick: () => sel.value && set(sel.value, 'asc') }, '↑ تصاعدي'), h('button', { class: 'btn grow', onclick: () => sel.value && set(sel.value, 'desc') }, '↓ تنازلي')));
    }
  });
}
function columnsSheet(db, view, rerender) {
  openSheet({
    title: 'الأعمدة', onClose: rerender, body: api => h('div', {}, db.schema.filter(p => p.id !== 'title').map(p => {
      const on = !(view.hidden || []).includes(p.id);
      const b = h('button', { class: 'act', onclick: () => { view.hidden = view.hidden || []; const i = view.hidden.indexOf(p.id); if (i >= 0) view.hidden.splice(i, 1); else view.hidden.push(p.id); touchDb(db); const now = !view.hidden.includes(p.id); b.querySelector('.chk').textContent = now ? '✓' : ''; } },
        h('span', { class: 'ai' }, PROP_TYPES[p.type].icon), h('span', {}, p.name), h('span', { class: 'chk' }, on ? '✓' : ''));
      return b;
    }))
  });
}
function viewSheet(db, view, rerender) {
  openSheet({
    title: 'إعدادات العرض', onClose: rerender, body: api => {
      const nm = h('input', { dir: 'auto', value: view.name, onchange: e => { view.name = e.target.value.trim() || view.name; touchDb(db); } });
      const typeGrid = h('div', { class: 'grid', style: 'margin-bottom:12px' }, Object.entries(VIEW_TYPES).map(([k, v]) => h('button', { class: 'gbtn', style: view.type === k ? 'border-color:var(--accent)' : '', onclick: () => { setViewType(db, view, k); touchDb(db); api.close(); } }, h('b', {}, v.icon), v.label)));
      const selects = [];
      if (view.type === 'board') selects.push(h('div', { class: 'field' }, h('label', {}, 'تجميع حسب'), h('select', { onchange: e => { view.groupBy = e.target.value; touchDb(db); } }, db.schema.filter(p => p.type === 'select' || p.type === 'status').map(p => h('option', { value: p.id, selected: p.id === view.groupBy }, p.name)))));
      if (view.type === 'table' || view.type === 'list') selects.push(h('div', { class: 'field' }, h('label', {}, 'تجميع حسب'), h('select', { onchange: e => { view.group = e.target.value || null; touchDb(db); } }, [h('option', { value: '' }, '— بدون تجميع —')].concat(db.schema.filter(p => SEL(p.type)).map(p => h('option', { value: p.id, selected: p.id === view.group }, p.name))))));
      if (view.type === 'calendar') selects.push(h('div', { class: 'field' }, h('label', {}, 'خاصية التاريخ'), h('select', { onchange: e => { view.dateProp = e.target.value; touchDb(db); } }, db.schema.filter(p => p.type === 'date').map(p => h('option', { value: p.id, selected: p.id === view.dateProp }, p.name)))));
      return h('div', {}, h('div', { class: 'field' }, h('label', {}, 'الاسم'), nm), typeGrid, ...selects,
        h('button', { class: 'act', onclick: () => { api.close(); const c = JSON.parse(JSON.stringify(view)); c.id = uid(); c.name += ' (نسخة)'; db.views.push(c); S.ui.view[db.id] = c.id; saveUi(); touchDb(db); } }, h('span', { class: 'ai' }, '⧉'), h('span', {}, 'تكرار العرض')),
        db.views.length > 1 ? h('button', { class: 'act danger', onclick: async () => { api.close(); if (await confirmSheet('حذف هذا العرض؟ (لن تُحذف البيانات)')) { db.views = db.views.filter(v => v !== view); S.ui.view[db.id] = db.views[0].id; touchDb(db); rerender(); } } }, h('span', { class: 'ai' }, '🗑'), h('span', {}, 'حذف العرض')) : null);
    }
  });
}
function setViewType(db, view, type) {
  view.type = type;
  if (type === 'board' && !groupProp(db, view)) {
    let gp = db.schema.find(p => p.type === 'status') || db.schema.find(p => p.type === 'select');
    if (!gp) { gp = { id: uid(), name: 'الحالة', type: 'status', options: [{ id: uid(), name: 'لم يبدأ', color: 'gray' }, { id: uid(), name: 'قيد التنفيذ', color: 'blue' }, { id: uid(), name: 'منجز', color: 'green' }] }; db.schema.push(gp); }
    view.groupBy = gp.id;
  }
  if (type === 'calendar' && !db.schema.find(p => p.id === view.dateProp && p.type === 'date')) {
    let dp = db.schema.find(p => p.type === 'date');
    if (!dp) { dp = { id: uid(), name: 'التاريخ', type: 'date' }; db.schema.push(dp); }
    view.dateProp = dp.id;
  }
}
function addViewSheet(db, rerender) {
  openSheet({
    title: 'عرض جديد', body: api => h('div', { class: 'grid' }, Object.entries(VIEW_TYPES).map(([k, v]) => h('button', { class: 'gbtn', onclick: () => { api.close(); const view = { id: uid(), name: v.label, type: k, filters: [], sort: null }; setViewType(db, view, k); db.views.push(view); S.ui.view[db.id] = view.id; saveUi(); touchDb(db); rerender(); } }, h('b', {}, v.icon), v.label)))
  });
}
function addPropSheet(db, view, after) {
  openSheet({
    title: 'خاصية جديدة', body: api => h('div', { class: 'grid' }, Object.entries(PROP_TYPES).filter(([k]) => k !== 'title').map(([k, v]) => h('button', {
      class: 'gbtn', onclick: () => {
        api.close(); const p = { id: uid(), name: v.label, type: k }; if (SEL(k)) p.options = []; db.schema.push(p); touchDb(db);
        if (view) { propSheet(db, view, p, () => after && after(p)); } else after && after(p);
      }
    }, h('b', {}, v.icon), v.label)))
  });
}
function propSheet(db, view, prop, rerender) {
  const isTitle = prop.id === 'title';
  openSheet({
    title: prop.name, onClose: rerender, body: api => {
      const nm = h('input', { dir: 'auto', value: prop.name, onchange: e => { prop.name = e.target.value.trim() || prop.name; touchDb(db); api.setTitle(prop.name); } });
      const typeRow = isTitle ? null : h('div', { class: 'field' }, h('label', {}, 'النوع'), h('div', { class: 'grid' }, Object.entries(PROP_TYPES).filter(([k]) => k !== 'title' && k !== 'created' && k !== 'repeat' && prop.type !== 'repeat').map(([k, v]) =>
        h('button', { class: 'gbtn', style: prop.type === k ? 'border-color:var(--accent)' : 'min-height:52px', onclick: async () => { if (k === prop.type) return; if (await confirmSheet(`تحويل «${prop.name}» إلى ${v.label}؟ قد تتغير القيم الحالية.`, 'تحويل', false)) { changeType(db, prop, k); api.close(); } } }, h('b', {}, v.icon), v.label))));
      const acts = [
        { icon: '↑', label: 'ترتيب تصاعدي', run: () => { view.sort = { prop: prop.id, dir: 'asc' }; touchDb(db); } },
        { icon: '↓', label: 'ترتيب تنازلي', run: () => { view.sort = { prop: prop.id, dir: 'desc' }; touchDb(db); } },
        !isTitle ? { icon: '👁', label: 'إخفاء من هذا العرض', run: () => { view.hidden = (view.hidden || []).concat(prop.id); touchDb(db); } } : null,
        SEL(prop.type) ? { icon: '✎', label: 'تعديل الخيارات', keep: true, run: () => optionsManager(db, prop) } : null,
        !isTitle ? { icon: '🗑', label: 'حذف الخاصية', danger: true, run: async () => { if (await confirmSheet(`حذف الخاصية «${prop.name}» وقيمها؟`)) { db.schema = db.schema.filter(p => p !== prop); for (const r of dbRows(db.id)) { delete r.props[prop.id]; touchPage(r); } for (const v of db.views) { if (v.sort && v.sort.prop === prop.id) v.sort = null; v.filters = (v.filters || []).filter(f => f.prop !== prop.id); } touchDb(db); rerender && rerender(); } } } : null
      ].filter(Boolean);
      return h('div', {}, h('div', { class: 'field' }, h('label', {}, 'الاسم'), nm), typeRow,
        acts.map(it => h('button', { class: 'act' + (it.danger ? ' danger' : ''), onclick: async () => { if (!it.keep) api.close(); await it.run(); } }, h('span', { class: 'ai' }, it.icon), h('span', {}, it.label))));
    }
  });
}
function optionsManager(db, prop) {
  openSheet({
    title: 'خيارات ' + prop.name, body: api => {
      const box = h('div'); prop.options = prop.options || [];
      const draw = () => {
        const nameIn = h('input', { dir: 'auto', placeholder: 'خيار جديد…' });
        const add = () => { const n = nameIn.value.trim(); if (!n) return; prop.options.push({ id: uid(), name: n, color: nextColor(prop) }); touchDb(db); draw(); };
        nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
        box.replaceChildren(...prop.options.map(o => h('div', { class: 'optrow' }, h('button', { class: 'act grow', onclick: () => editOption(db, prop, o, draw) }, pill(o), h('span', { class: 'chk' }, '✎')))), h('div', { class: 'row', style: 'margin-top:8px' }, nameIn, h('button', { class: 'btn primary', onclick: add }, 'إضافة')));
      };
      draw(); return box;
    }
  });
}
function changeType(db, prop, nt) {
  const old = prop.type; if (old === nt) return;
  const rows = dbRows(db.id);
  const toText = r => textOf(prop, r.props[prop.id], r);
  if (SEL(nt)) {
    if (SEL(old)) {
      for (const r of rows) { const v = r.props[prop.id]; if (v == null) continue; if (nt === 'multi_select' && old !== 'multi_select') r.props[prop.id] = [v]; else if (nt !== 'multi_select' && old === 'multi_select') { if (v.length) r.props[prop.id] = v[0]; else delete r.props[prop.id]; } touchPage(r); }
    } else {
      const names = [...new Set(rows.flatMap(r => { const t = toText(r); return t ? (nt === 'multi_select' ? t.split(/[,،]/).map(s => s.trim()).filter(Boolean) : [t.trim()]) : []; }))];
      prop.options = names.slice(0, 60).map((n, i) => ({ id: uid(), name: n, color: COLORS[i % COLORS.length] }));
      for (const r of rows) { const t = toText(r); if (!t) { delete r.props[prop.id]; continue; } const parts = nt === 'multi_select' ? t.split(/[,،]/).map(s => s.trim()).filter(Boolean) : [t.trim()]; const ids = parts.map(n => (prop.options.find(o => o.name === n) || {}).id).filter(Boolean); if (!ids.length) delete r.props[prop.id]; else r.props[prop.id] = nt === 'multi_select' ? ids : ids[0]; touchPage(r); }
    }
  } else {
    for (const r of rows) {
      const t = toText(r); const had = r.props[prop.id] != null;
      if (!had) continue;
      if (nt === 'checkbox') r.props[prop.id] = !!t && !['0', 'لا', 'false', ''].includes(t);
      else if (nt === 'number') { const n = parseFloat(t); if (isNaN(n)) delete r.props[prop.id]; else r.props[prop.id] = n; }
      else if (nt === 'date') { const d = new Date(t); if (isNaN(d)) delete r.props[prop.id]; else r.props[prop.id] = { start: ymd(d), end: null }; }
      else r.props[prop.id] = t;
      touchPage(r);
    }
    delete prop.options;
  }
  prop.type = nt; touchDb(db);
}
