'use strict';
/* دفتر — الحالة، الواجهة العامة، الشريط الجانبي، محرر الصفحات */

const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
const BLOCK_TYPES = {
  p: { label: 'نص', icon: '¶' }, h1: { label: 'عنوان كبير', icon: 'H1' }, h2: { label: 'عنوان', icon: 'H2' },
  h3: { label: 'عنوان صغير', icon: 'H3' }, ul: { label: 'قائمة نقطية', icon: '•' }, ol: { label: 'قائمة رقمية', icon: '1.' },
  todo: { label: 'مهمة', icon: '☑' }, quote: { label: 'اقتباس', icon: '❝' }, divider: { label: 'فاصل', icon: '—' }
};
const PROP_TYPES = {
  title: { label: 'العنوان', icon: 'Aa' }, text: { label: 'نص', icon: '≡' }, number: { label: 'رقم', icon: '#' },
  select: { label: 'اختيار', icon: '◉' }, multi_select: { label: 'اختيار متعدد', icon: '☰' }, status: { label: 'حالة', icon: '◐' },
  date: { label: 'تاريخ', icon: '📅' }, checkbox: { label: 'مربع تحديد', icon: '☑' }, url: { label: 'رابط', icon: '🔗' },
  created: { label: 'تاريخ الإنشاء', icon: '🕒' }
};
const EMOJIS = '📄 📝 📓 📔 📚 📖 🗂️ 📁 📌 📍 ⭐ 🌟 ✨ 🔥 💡 🎯 ✅ ☑️ 📅 🗓️ ⏰ ⏳ 🧠 💪 🏃 🏋️ 🧘 💧 🥗 😴 🌙 ☀️ 🕌 📿 🤲 📈 📊 💰 💳 🛒 🏠 🚗 ✈️ 🎮 🎬 🎵 🎧 📱 💻 🖥️ ⚙️ 🔧 🧪 🔬 🧮 📐 ✏️ 🖊️ 📎 🔖 🏷️ ❤️ 💙 💚 💛 🟣 🔴 🟢 🔵 ⚡ 🌱 🌳 🌊 🍎 ☕ 🎓 🏆 🥇 📣 🔔 🔒 🔑 👤 👥 🧩 🚀'.split(' ');

const S = {
  user: null, pages: new Map(), dbs: new Map(), route: { t: 'home' }, sync: 'saved',
  ui: loadUi()
};
function loadUi() {
  try { const u = JSON.parse(localStorage.getItem('daftar_ui') || '{}'); return Object.assign({ expanded: [], view: {}, search: '', cal: {} }, u); } catch (e) { return { expanded: [], view: {}, search: '', cal: {} }; }
}
const saveUi = debounce(() => { try { localStorage.setItem('daftar_ui', JSON.stringify(S.ui)); } catch (e) {} }, 300);
let store = null;

/* ---------------- مساعدات بيانات ---------------- */
const nowIso = () => new Date().toISOString();
const sortItems = (a, b) => ((a.position || 0) - (b.position || 0)) || String(a.created_at || '').localeCompare(String(b.created_at || ''));
const titleOf = x => (x.title || '').trim() || 'بدون عنوان';
const iconOf = (x, kind) => x.icon || (kind === 'db' ? '🗃️' : '📄');
const isRow = p => !!p.database_id;

function kidsOf(parentId) {
  const out = [];
  for (const p of S.pages.values()) if (!p.database_id && !p.archived && (p.parent_page_id || null) === parentId) out.push({ kind: 'page', o: p });
  for (const d of S.dbs.values()) if ((d.parent_page_id || null) === parentId) out.push({ kind: 'db', o: d });
  return out.sort((a, b) => sortItems(a.o, b.o));
}
function rowKids(rowId) { return [...S.pages.values()].filter(p => p.parent_page_id === rowId && !p.archived).sort(sortItems); }
function nextPos(siblings) { return siblings.length ? Math.max(...siblings.map(s => s.o ? s.o.position : s.position || 0)) + 1 : 0; }
function dbRows(dbId) { return [...S.pages.values()].filter(p => p.database_id === dbId && !p.archived); }

function newPage(opts = {}) {
  const sib = opts.database_id ? dbRows(opts.database_id) : kidsOf(opts.parent_page_id || null);
  const p = {
    id: uid(), user_id: S.user && S.user.id, parent_page_id: opts.parent_page_id || null, database_id: opts.database_id || null,
    title: opts.title || '', icon: opts.icon || null, cover: null, props: opts.props || {}, content: [],
    position: nextPos(sib), archived: false, notion_id: null, created_at: nowIso(), updated_at: nowIso()
  };
  S.pages.set(p.id, p); touchPage(p); return p;
}
function newDb(opts = {}) {
  const tpl = opts.template || 'empty';
  const statusOpts = [{ id: uid(), name: 'لم يبدأ', color: 'gray' }, { id: uid(), name: 'قيد التنفيذ', color: 'blue' }, { id: uid(), name: 'منجز', color: 'green' }];
  let schema = [{ id: 'title', name: 'الاسم', type: 'title' }];
  let title = 'قاعدة بيانات جديدة', icon = '🗃️';
  if (tpl === 'tasks') {
    title = 'المهام'; icon = '✅';
    schema.push({ id: uid(), name: 'الحالة', type: 'status', options: statusOpts }, { id: uid(), name: 'الموعد', type: 'date' }, { id: uid(), name: 'ملاحظات', type: 'text' });
  } else if (tpl === 'timetable') {
    title = 'الجدول الأسبوعي'; icon = '🗓';
    schema.push({ id: uid(), name: 'النوع', type: 'select', options: [{ id: uid(), name: 'دوام', color: 'blue' }, { id: uid(), name: 'مذاكرة', color: 'purple' }, { id: uid(), name: 'تمرين', color: 'orange' }, { id: uid(), name: 'راحة', color: 'gray' }, { id: uid(), name: 'أخرى', color: 'yellow' }] },
      { id: uid(), name: 'التكرار', type: 'repeat' }, { id: uid(), name: 'ملاحظات', type: 'text' });
  } else if (tpl === 'habits') {
    title = 'متتبع العادات'; icon = '💪';
    schema.push({ id: uid(), name: 'اليوم', type: 'date' }, { id: uid(), name: 'تم', type: 'checkbox' }, { id: uid(), name: 'ملاحظة', type: 'text' });
  } else {
    schema.push({ id: uid(), name: 'الوسوم', type: 'multi_select', options: [] });
  }
  const views = tpl === 'timetable' ? [{ id: uid(), name: 'الأسبوع', type: 'week', filters: [], sort: null }, { id: uid(), name: 'جدول', type: 'table', filters: [], sort: null }] : [{ id: uid(), name: 'جدول', type: 'table', filters: [], sort: null }];
  const st = schema.find(s => s.type === 'status'); if (st) views.push({ id: uid(), name: 'لوحة', type: 'board', groupBy: st.id, filters: [], sort: null });
  const dt = schema.find(s => s.type === 'date'); if (dt) views.push({ id: uid(), name: 'تقويم', type: 'calendar', dateProp: dt.id, filters: [], sort: null });
  const d = {
    id: uid(), user_id: S.user && S.user.id, parent_page_id: opts.parent_page_id || null, title, icon, schema, views,
    position: nextPos(kidsOf(opts.parent_page_id || null)), notion_id: null, created_at: nowIso(), updated_at: nowIso()
  };
  S.dbs.set(d.id, d); touchDb(d); return d;
}

function descendantsOfPage(rootId) {
  const pageIds = new Set(), dbIds = new Set(); const stack = [rootId];
  while (stack.length) {
    const id = stack.pop(); if (pageIds.has(id)) continue; pageIds.add(id);
    for (const p of S.pages.values()) if (p.parent_page_id === id) stack.push(p.id);
    for (const d of S.dbs.values()) if (d.parent_page_id === id) { dbIds.add(d.id); for (const r of dbRows(d.id)) stack.push(r.id); }
  }
  return { pageIds, dbIds };
}
async function deletePageTree(id) {
  const { pageIds, dbIds } = descendantsOfPage(id);
  try {
    for (const d of dbIds) await store.remove('dbs', d);
    await store.remove('pages', id);
  } catch (e) { toast('تعذّر الحذف: ' + (e.message || e)); return; }
  for (const d of dbIds) S.dbs.delete(d);
  for (const p of pageIds) { S.pages.delete(p); dirty.pages.delete(p); }
  afterDelete(id);
}
async function deleteDbTree(id) {
  const rows = dbRows(id); const pageIds = new Set();
  for (const r of rows) for (const x of descendantsOfPage(r.id).pageIds) pageIds.add(x);
  try { await store.remove('dbs', id); } catch (e) { toast('تعذّر الحذف: ' + (e.message || e)); return; }
  S.dbs.delete(id); for (const p of pageIds) { S.pages.delete(p); dirty.pages.delete(p); }
  afterDelete(id);
}
function afterDelete(id) {
  if (S.route.id === id || !currentExists()) go('');
  else render();
  toast('تم الحذف');
}
function currentExists() {
  const r = S.route; if (r.t === 'home') return true;
  return r.t === 'p' ? S.pages.has(r.id) : S.dbs.has(r.id);
}

/* ---------------- الحفظ والتزامن ---------------- */
const dirty = { pages: new Set(), dbs: new Set() };
let saveTimer = null, saving = false;
function setSync(s) { S.sync = s; const el = $('#syncind'); if (el) { el.textContent = { saved: '✓ محفوظ', saving: '… جارٍ الحفظ', error: '⚠ تعذّر الحفظ' }[s] || ''; el.className = 'sync' + (s === 'error' ? ' err' : ''); } }
function touchPage(p) { p.updated_at = nowIso(); dirty.pages.add(p.id); schedSave(); }
function touchDb(d) { d.updated_at = nowIso(); dirty.dbs.add(d.id); schedSave(); }
function schedSave(ms = 600) { setSync('saving'); clearTimeout(saveTimer); saveTimer = setTimeout(flush, ms); }
async function flush() {
  if (saving) { schedSave(300); return; }
  const pids = [...dirty.pages], dids = [...dirty.dbs];
  if (!pids.length && !dids.length) { setSync('saved'); return; }
  saving = true;
  try {
    const dbs = dids.map(i => S.dbs.get(i)).filter(Boolean);
    if (dbs.length) await store.upsert('dbs', dbs);
    // الأب قبل الابن
    const pages = pids.map(i => S.pages.get(i)).filter(Boolean);
    const depth = p => { let d = 0, c = p; while (c && c.parent_page_id && S.pages.has(c.parent_page_id) && d < 40) { c = S.pages.get(c.parent_page_id); d++; } return d; };
    pages.sort((a, b) => depth(a) - depth(b));
    if (pages.length) await store.upsert('pages', pages);
    pids.forEach(i => dirty.pages.delete(i)); dids.forEach(i => dirty.dbs.delete(i));
    setSync(dirty.pages.size || dirty.dbs.size ? 'saving' : 'saved');
  } catch (e) {
    console.error('save failed', e); setSync('error'); toast('تعذّر الحفظ، سأعيد المحاولة… ' + (e.message || ''));
    saving = false; schedSave(5000); return;
  }
  saving = false;
  if (dirty.pages.size || dirty.dbs.size) schedSave(300);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
window.addEventListener('pagehide', () => flush());

function onRealtime(kind, payload) {
  const map = kind === 'pages' ? S.pages : S.dbs, dset = kind === 'pages' ? dirty.pages : dirty.dbs;
  if (payload.eventType === 'DELETE') { const id = payload.old && payload.old.id; if (id && map.has(id)) { map.delete(id); scheduleRefresh(true); } return; }
  const r = payload.new; if (!r || dset.has(r.id)) return;
  const cur = map.get(r.id);
  if (cur && cur.updated_at && r.updated_at && cur.updated_at >= r.updated_at) return;
  map.set(r.id, r); scheduleRefresh(false);
}
let refreshT = null;
function scheduleRefresh(structural) {
  clearTimeout(refreshT);
  refreshT = setTimeout(function tryR() {
    const ae = document.activeElement;
    const editing = ae && (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName));
    if (editing && !structural) { refreshT = setTimeout(tryR, 2500); return; }
    if ($$('.sheet-bg').length) { renderSide(); return; }
    render();
  }, 400);
}

/* ---------------- مكوّنات الواجهة ---------------- */
function toast(msg, ms = 2600) {
  const t = h('div', { class: 'toast' }, msg); $('#toasts').append(t); setTimeout(() => t.remove(), ms);
}
function openSheet({ title = '', modal = false, body, head = [], onClose } = {}) {
  const bg = h('div', { class: 'sheet-bg' });
  const sh = h('div', { class: 'sheet' + (modal ? ' modal' : '') });
  let closed = false;
  const close = () => { if (closed) return; closed = true; bg.remove(); onClose && onClose(); };
  const titleEl = h('div', { class: 't' }, title);
  sh.append(h('div', { class: 'sheet-h' }, titleEl, ...head, h('button', { class: 'ibtn', 'aria-label': 'إغلاق', onclick: close }, '✕')));
  const b = h('div', { class: 'sheet-b' }); sh.append(b);
  bg.append(sh); $('#sheets').append(bg);
  bg.addEventListener('pointerdown', e => { bg._down = e.target === bg; });
  bg.addEventListener('click', e => { if (e.target === bg && bg._down) close(); });
  const api = { close, body: b, sheet: sh, setTitle: t => { titleEl.textContent = t; } };
  const content = typeof body === 'function' ? body(api) : body;
  if (content) b.append(content);
  return api;
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { const all = $$('.sheet-bg'); if (all.length) all[all.length - 1].querySelector('.sheet-h .ibtn:last-child').click(); }
});
function actionSheet(title, items) {
  return openSheet({
    title, body: api => h('div', {}, items.filter(Boolean).map(it => h('button', {
      class: 'act' + (it.danger ? ' danger' : ''), onclick: async () => { if (!it.keep) api.close(); await it.run(api); }
    }, h('span', { class: 'ai' }, it.icon || ''), h('span', {}, it.label), it.checked ? h('span', { class: 'chk' }, '✓') : null)))
  });
}
function promptSheet(title, value = '', { ok = 'حفظ', placeholder = '', multiline = false } = {}) {
  return new Promise(res => {
    let done = false;
    const input = multiline ? h('textarea', { rows: 4, dir: 'auto', value, placeholder }) : h('input', { dir: 'auto', value, placeholder, enterkeyhint: 'done' });
    const sh = openSheet({
      title, onClose: () => { if (!done) res(null); }, body: api => h('div', {}, input,
        h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn primary grow', onclick: () => { done = true; res(input.value); api.close(); } }, ok),
          h('button', { class: 'btn', onclick: api.close }, 'إلغاء')))
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !multiline) { done = true; res(input.value); sh.close(); } });
    setTimeout(() => { input.focus(); input.select && input.select(); }, 60);
  });
}
function confirmSheet(msg, ok = 'حذف', danger = true) {
  return new Promise(res => {
    let done = false;
    openSheet({
      title: 'تأكيد', onClose: () => { if (!done) res(false); },
      body: api => h('div', {}, h('p', { style: 'margin:4px 2px 16px' }, msg),
        h('div', { class: 'row' }, h('button', { class: 'btn grow ' + (danger ? 'danger' : 'primary'), onclick: () => { done = true; res(true); api.close(); } }, ok),
          h('button', { class: 'btn grow', onclick: api.close }, 'إلغاء')))
    });
  });
}
function emojiSheet(current, onPick) {
  openSheet({
    title: 'اختر أيقونة', body: api => h('div', {},
      h('div', { class: 'emojis' }, EMOJIS.map(e => h('button', { onclick: () => { onPick(e); api.close(); } }, e))),
      h('div', { class: 'row', style: 'margin-top:12px' },
        h('input', { id: 'emo-in', placeholder: 'أو اكتب إيموجي', maxlength: 8, style: 'max-width:200px' }),
        h('button', { class: 'btn', onclick: () => { const v = $('#emo-in').value.trim(); if (v) { onPick(v); api.close(); } } }, 'تم'),
        current ? h('button', { class: 'btn danger', onclick: () => { onPick(null); api.close(); } }, 'إزالة') : null))
  });
}

/* ---------------- التوجيه ---------------- */
function parseHash() {
  const m = location.hash.match(/^#\/(p|d)\/([\w-]+)/);
  S.route = m ? { t: m[1], id: m[2] } : { t: 'home' };
}
function go(path) { const target = path ? '#/' + path : '#/'; if (location.hash === target) render(); else location.hash = target; }
window.addEventListener('hashchange', () => { parseHash(); closeDrawer(); render(); try { $('#main').scrollTop = 0; } catch (e) {} });
function openItem(kind, id) { go((kind === 'db' ? 'd/' : 'p/') + id); }
function openDrawer() { document.body.classList.add('drawer'); }
function closeDrawer() { document.body.classList.remove('drawer'); }

function render() {
  const main = $('#main'); const top = main ? main.scrollTop : 0;
  renderSide(); renderMain();
  if (main) main.scrollTop = top;
}

/* ---------------- الشريط الجانبي ---------------- */
function renderSide() {
  const side = $('#side'); if (!side) return;
  const q = S.ui.search.trim();
  const tree = h('div', { class: 's-scroll' });
  if (q) {
    const hits = [];
    for (const p of S.pages.values()) if (!p.archived && titleOf(p).includes(q)) hits.push({ kind: 'page', o: p });
    for (const d of S.dbs.values()) if (titleOf(d).includes(q)) hits.push({ kind: 'db', o: d });
    hits.slice(0, 60).forEach(it => tree.append(nodeEl(it, false)));
    if (!hits.length) tree.append(h('div', { class: 'muted', style: 'padding:14px' }, 'لا نتائج'));
  } else {
    tree.append(h('div', { class: 's-label' }, h('span', {}, 'صفحاتي')));
    tree.append(treeLevel(null));
  }
  side.replaceChildren(
    h('div', { class: 's-head' }, h('div', { class: 'logo' }, '📓 دفتر'), h('span', { class: 'sync', id: 'syncind' }), h('button', { class: 'ibtn', 'aria-label': 'الإعدادات', onclick: openSettings }, '⚙')),
    h('div', { class: 's-search' }, h('input', { type: 'search', placeholder: '🔍 بحث', value: S.ui.search, dir: 'auto', oninput: e => { S.ui.search = e.target.value; saveUi(); const pos = e.target.selectionStart; renderSide(); const n = $('.s-search input'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } } })),
    h('div', { class: 's-foot' },
      h('button', { class: 'btn primary', onclick: () => createPageIn(null) }, '＋ صفحة'),
      h('button', { class: 'btn', onclick: () => createDbIn(null) }, '＋ قاعدة بيانات')),
    tree
  );
  // نضع الشريط السفلي بعد القائمة: الترتيب العمودي: head, search, tree(flex:1), foot
  side.append(side.querySelector('.s-foot'));
  setSync(S.sync);
  const home = h('div', { class: 'node' + (S.route.t === 'home' ? ' active' : '') }, h('span', { class: 'tw none' }, '▾'), h('span', { class: 'ic' }, '🏠'), h('div', { class: 'tt', onclick: () => go('') }, 'الرئيسية'));
  tree.prepend(home);
}
function treeLevel(parentId) {
  const wrap = h('div', { class: 'kids', 'data-parent': parentId || '' });
  for (const it of kidsOf(parentId)) wrap.append(nodeEl(it, true));
  makeTreeSortable(wrap);
  return wrap;
}
function nodeEl(it, withKids) {
  const { kind, o } = it; const id = o.id;
  const kids = withKids ? kidsOf(id) : [];
  const open = S.ui.expanded.includes(id);
  const active = S.route.id === id;
  const el = h('div', { class: 'tnode', 'data-id': id, 'data-kind': kind });
  const row = h('div', { class: 'node' + (active ? ' active' : '') },
    h('span', { class: 'sgrip', title: 'اسحب للترتيب' }, '⠿'),
    h('button', {
      class: 'tw' + (open ? ' open' : '') + (kids.length || (kind === 'page') ? '' : ' none'), 'aria-label': 'طيّ/فتح', onclick: e => {
        e.stopPropagation(); const i = S.ui.expanded.indexOf(id); if (i >= 0) S.ui.expanded.splice(i, 1); else S.ui.expanded.push(id); saveUi(); renderSide();
      }
    }, '◂'),
    h('span', { class: 'ic' }, iconOf(o, kind)),
    h('div', { class: 'tt', onclick: () => openItem(kind, id) }, titleOf(o)),
    h('button', { class: 'more', 'aria-label': 'المزيد', onclick: e => { e.stopPropagation(); itemMenu(kind, o); } }, '⋯'));
  longPress(row, () => itemMenu(kind, o));
  el.append(row);
  if (open && withKids) {
    const inner = treeLevel(id);
    if (!kids.length) inner.append(h('div', { class: 'muted', style: 'padding:6px 40px;font-size:13px' }, 'لا صفحات داخلها'));
    el.append(inner);
  }
  return el;
}
function makeTreeSortable(el) {
  Sortable.create(el, {
    group: 'tree', handle: '.sgrip', animation: 150, ghostClass: 'sortable-ghost', draggable: '.tnode', fallbackOnBody: true, swapThreshold: .6,
    onEnd: e => {
      const id = e.item.dataset.id, kind = e.item.dataset.kind;
      const obj = kind === 'db' ? S.dbs.get(id) : S.pages.get(id); if (!obj) return;
      const parent = e.to.dataset.parent || null;
      if (parent === id) { renderSide(); return; }
      const prev = e.item.previousElementSibling, next = e.item.nextElementSibling;
      const g = n => { if (!n || !n.dataset.id) return null; return S.pages.get(n.dataset.id) || S.dbs.get(n.dataset.id); };
      const a = g(prev), b = g(next);
      obj.position = a && b ? (a.position + b.position) / 2 : a ? a.position + 1 : b ? b.position - 1 : 0;
      obj.parent_page_id = parent;
      if (parent && !S.ui.expanded.includes(parent)) S.ui.expanded.push(parent);
      kind === 'db' ? touchDb(obj) : touchPage(obj);
      renderSide();
    }
  });
}
function itemMenu(kind, o) {
  actionSheet(titleOf(o), [
    { icon: '↗', label: 'فتح', run: () => openItem(kind, o.id) },
    { icon: '✏️', label: 'إعادة تسمية', run: async () => { const v = await promptSheet('الاسم', o.title || ''); if (v != null) { o.title = v; kind === 'db' ? touchDb(o) : touchPage(o); render(); } } },
    { icon: '🙂', label: 'تغيير الأيقونة', run: () => emojiSheet(o.icon, e => { o.icon = e; kind === 'db' ? touchDb(o) : touchPage(o); render(); }) },
    kind === 'page' ? { icon: '＋', label: 'صفحة فرعية', run: () => createPageIn(o.id) } : null,
    kind === 'page' ? { icon: '🗃️', label: 'قاعدة بيانات داخلها', run: () => createDbIn(o.id) } : null,
    { icon: '📂', label: 'نقل إلى…', run: () => movePicker(kind, o) },
    kind === 'page' ? { icon: '⧉', label: 'تكرار', run: () => duplicatePage(o) } : null,
    { icon: '🗑', label: 'حذف', danger: true, run: async () => { if (await confirmSheet(`حذف «${titleOf(o)}» وكل ما بداخلها نهائياً؟`)) kind === 'db' ? deleteDbTree(o.id) : deletePageTree(o.id); } }
  ]);
}
function movePicker(kind, o) {
  const banned = kind === 'page' ? descendantsOfPage(o.id).pageIds : new Set();
  const rows = [];
  const walk = (pid, depth) => { for (const it of kidsOf(pid)) { if (it.kind !== 'page' || banned.has(it.o.id)) continue; rows.push({ p: it.o, depth }); walk(it.o.id, depth + 1); } };
  walk(null, 0);
  openSheet({
    title: 'نقل إلى', body: api => h('div', {},
      h('button', { class: 'act', onclick: () => { api.close(); moveTo(kind, o, null); } }, h('span', { class: 'ai' }, '🏠'), h('span', {}, 'الجذر (بدون أب)')),
      rows.map(r => h('button', { class: 'act', style: `padding-inline-start:${10 + r.depth * 22}px`, onclick: () => { api.close(); moveTo(kind, o, r.p.id); } }, h('span', { class: 'ai' }, iconOf(r.p)), h('span', {}, titleOf(r.p)))))
  });
}
function moveTo(kind, o, parentId) {
  o.parent_page_id = parentId; o.position = nextPos(kidsOf(parentId));
  if (parentId && !S.ui.expanded.includes(parentId)) S.ui.expanded.push(parentId);
  kind === 'db' ? touchDb(o) : touchPage(o); render(); toast('تم النقل');
}
function duplicatePage(o) {
  const c = newPage({ parent_page_id: o.parent_page_id, title: (o.title || '') + ' (نسخة)', icon: o.icon });
  c.content = JSON.parse(JSON.stringify(o.content || [])).map(b => Object.assign(b, { id: uid() })); touchPage(c); render(); openItem('page', c.id);
}
function createPageIn(parentId) {
  const p = newPage({ parent_page_id: parentId });
  if (parentId && !S.ui.expanded.includes(parentId)) S.ui.expanded.push(parentId);
  openItem('page', p.id); S.focusTitle = true; closeDrawer();
}
function createDbIn(parentId) {
  openSheet({
    title: 'قاعدة بيانات جديدة', body: api => h('div', { class: 'grid' },
      [['timetable', '🗓', 'جدول أسبوعي (دوام/مذاكرة/تمارين)'], ['tasks', '✅', 'مهام (حالة + موعد)'], ['habits', '💪', 'متتبع عادات'], ['empty', '🗃️', 'جدول فارغ']].map(([t, ic, lb]) =>
        h('button', { class: 'gbtn', onclick: () => { api.close(); const d = newDb({ template: t, parent_page_id: parentId }); if (parentId && !S.ui.expanded.includes(parentId)) S.ui.expanded.push(parentId); openItem('db', d.id); closeDrawer(); } }, h('b', {}, ic), lb)))
  });
}

/* ---------------- الإعدادات / استيراد / تصدير ---------------- */
function openSettings() {
  openSheet({
    title: 'الإعدادات', body: api => {
      const info = h('div', { class: 'muted', style: 'padding:4px 6px 12px' }, `الحساب: ${S.user ? (S.user.email || '') : ''} · ${S.pages.size} صفحة · ${S.dbs.size} قاعدة`);
      const imp = h('input', { type: 'file', accept: '.json,application/json', multiple: true, hidden: true });
      imp.addEventListener('change', async () => { if (imp.files.length) { api.close(); await importFiles([...imp.files]); } });
      return h('div', {}, info, imp,
        h('button', { class: 'act', onclick: () => imp.click() }, h('span', { class: 'ai' }, '📥'), h('span', {}, 'استيراد من نوشن (ملفا pages.json و databases.json)')),
        h('button', { class: 'act', onclick: exportBackup }, h('span', { class: 'ai' }, '💾'), h('span', {}, 'تنزيل نسخة احتياطية (JSON)')),
        store.kind === 'supabase' ? h('button', { class: 'act danger', onclick: async () => { api.close(); await flush(); await store.signOut(); location.reload(); } }, h('span', { class: 'ai' }, '🚪'), h('span', {}, 'تسجيل خروج')) : null,
        store.kind === 'local' ? h('button', { class: 'act danger', onclick: () => { localStorage.removeItem('daftar_demo_v1'); location.reload(); } }, h('span', { class: 'ai' }, '↺'), h('span', {}, 'إعادة بيانات التجربة')) : null);
    }
  });
}
async function importFiles(files) {
  const t = toastKeep('جارٍ قراءة الملفات…');
  try {
    let P = null, D = null;
    for (const f of files) {
      const j = JSON.parse(await f.text()); const first = Object.values(j)[0] || {};
      if (first.blocks !== undefined) P = j; else if (first.rows !== undefined) D = j;
    }
    if (!P || !D) throw new Error('اختر الملفين: pages.json و databases.json');
    const existing = new Map();
    for (const p of S.pages.values()) if (p.notion_id) existing.set(p.notion_id, p.id);
    for (const d of S.dbs.values()) if (d.notion_id) existing.set(d.notion_id, d.id);
    const conv = convertNotion(P, D, S.user.id, existing);
    t.textContent = `جارٍ الرفع: ${conv.dbs.length} قاعدة، ${conv.pages.length} صفحة…`;
    await store.upsert('dbs', conv.dbs); conv.dbs.forEach(d => S.dbs.set(d.id, d));
    await store.upsert('pages', conv.pages); conv.pages.forEach(p => S.pages.set(p.id, p));
    t.remove(); toast(`تم الاستيراد: ${conv.dbs.length} قاعدة و${conv.pages.length} صفحة`, 5000); render();
  } catch (e) { console.error(e); t.remove(); toast('فشل الاستيراد: ' + (e.message || e), 7000); }
}
function toastKeep(msg) { const t = h('div', { class: 'toast' }, msg); $('#toasts').append(t); return t; }
function exportBackup() {
  const data = { exported: nowIso(), pages: [...S.pages.values()], databases: [...S.dbs.values()] };
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })), download: `daftar-backup-${nowIso().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
}

/* ---------------- المحتوى الرئيسي ---------------- */
function topbar(crumbs, extra = []) {
  return h('div', { class: 'topbar' }, h('button', { class: 'ibtn menu-btn', 'aria-label': 'القائمة', onclick: openDrawer }, '☰'),
    h('div', { class: 'crumbs' }, crumbs), ...extra);
}
function crumbsFor(x, kind) {
  const parts = []; let cur = x, guard = 0;
  while (cur && cur.parent_page_id && guard++ < 10) { cur = S.pages.get(cur.parent_page_id); if (cur) parts.unshift(iconOf(cur) + ' ' + titleOf(cur)); }
  return parts.length ? parts.join(' / ') + ' /' : '';
}
function renderMain() {
  const main = $('#main'); if (!main) return;
  const r = S.route;
  if (r.t === 'p' && S.pages.has(r.id)) { const p = S.pages.get(r.id); if (isRow(p)) { // صف في قاعدة: افتح القاعدة ثم نافذة الصف
      main.replaceChildren(pageView(p)); return; }
    main.replaceChildren(pageView(p)); }
  else if (r.t === 'd' && S.dbs.has(r.id)) main.replaceChildren(dbPage(S.dbs.get(r.id)));
  else main.replaceChildren(homeView());
  setSync(S.sync);
}
function homeView() {
  const recent = [...S.pages.values()].filter(p => !p.archived && !p.database_id).sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))).slice(0, 8);
  const dbs = [...S.dbs.values()].sort(sortItems);
  return h('div', {}, topbar('الرئيسية', [h('span', { class: 'sync', id: 'syncind' })]),
    h('div', { class: 'page' },
      h('h1', { style: 'font-size:32px;margin:6px 0 10px' }, 'أهلاً 👋'),
      todayPanel(),
      h('div', { class: 'row', style: 'flex-wrap:wrap;margin-bottom:18px' },
        h('button', { class: 'btn primary', onclick: () => createPageIn(null) }, '＋ صفحة جديدة'),
        h('button', { class: 'btn', onclick: () => createDbIn(null) }, '＋ قاعدة بيانات'),
        h('button', { class: 'btn', onclick: openSettings }, '📥 استيراد / نسخة احتياطية')),
      dbs.length ? h('div', {}, h('div', { class: 's-label' }, 'قواعد البيانات'), h('div', { class: 'grid' }, dbs.map(d => h('button', { class: 'gbtn', onclick: () => openItem('db', d.id) }, h('b', {}, iconOf(d, 'db')), titleOf(d), h('span', { class: 'muted', style: 'font-size:12px' }, dbRows(d.id).length + ' عنصر'))))) : null,
      recent.length ? h('div', { style: 'margin-top:20px' }, h('div', { class: 's-label' }, 'آخر ما تم تعديله'), recent.map(p => h('div', { class: 'subpages', style: 'border:0;margin:0;padding:0' }, h('div', { class: 'item', onclick: () => openItem('page', p.id) }, h('span', {}, iconOf(p)), h('span', {}, titleOf(p)))))) : null,
      !S.pages.size && !S.dbs.size ? h('p', { class: 'muted' }, 'ما فيه شيء بعد. أنشئ صفحة، أو استورد بياناتك من نوشن من ⚙ الإعدادات.') : null));
}

/* ---------------- صفحة ---------------- */
function autosize(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
function pageView(page, { modal = false } = {}) {
  const db = page.database_id ? S.dbs.get(page.database_id) : null;
  const title = h('textarea', { class: 'p-title', rows: 1, dir: 'auto', placeholder: 'بدون عنوان', value: page.title || '', enterkeyhint: 'next' });
  title.addEventListener('input', () => { page.title = title.value.replace(/\n/g, ' '); autosize(title); touchPage(page); });
  title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const f = $('.blk .tx', body); if (f) f.focus(); else { page.content.push({ id: uid(), type: 'p', text: '', indent: 0 }); touchPage(page); body.replaceWith(pageView(page, { modal })); } } });
  const iconBtn = h('button', { class: 'p-icon', 'aria-label': 'الأيقونة', onclick: () => emojiSheet(page.icon, e => { page.icon = e; touchPage(page); iconBtn.textContent = e || '📄'; renderSide(); }) }, page.icon || '📄');
  const body = h('div', { class: 'page' }, iconBtn, title);
  if (db) body.append(propsPanel(page, db));
  body.append(blocksEditor(page));
  // صفحات فرعية
  const subs = page.database_id ? rowKids(page.id).map(o => ({ kind: 'page', o })) : kidsOf(page.id);
  const sub = h('div', { class: 'subpages' },
    subs.map(it => h('div', { class: 'item', onclick: () => { if (modal) $$('.sheet-bg').forEach(b => b.querySelector('.sheet-h .ibtn:last-child').click()); openItem(it.kind, it.o.id); } }, h('span', {}, iconOf(it.o, it.kind)), h('span', {}, titleOf(it.o)), it.kind === 'db' ? h('span', { class: 'muted' }, '· قاعدة بيانات') : null)),
    h('div', { class: 'row', style: 'margin-top:6px;flex-wrap:wrap' },
      h('button', { class: 'btn sm ghost', onclick: () => { const c = newPage({ parent_page_id: page.id }); if (!page.database_id && !S.ui.expanded.includes(page.id)) S.ui.expanded.push(page.id); if (modal) $$('.sheet-bg').forEach(b => b.querySelector('.sheet-h .ibtn:last-child').click()); openItem('page', c.id); S.focusTitle = true; } }, '＋ صفحة فرعية'),
      !page.database_id ? h('button', { class: 'btn sm ghost', onclick: () => createDbIn(page.id) }, '＋ قاعدة بيانات هنا') : null));
  body.append(sub);
  if (modal) { setTimeout(() => autosize(title), 0); return body; }
  const head = [
    page.database_id ? h('button', { class: 'btn sm', onclick: () => openItem('db', page.database_id) }, '↩ ' + titleOf(S.dbs.get(page.database_id) || {})) : null,
    h('span', { class: 'sync', id: 'syncind' }),
    h('button', { class: 'ibtn', 'aria-label': 'المزيد', onclick: () => itemMenu('page', page) }, '⋯')];
  const wrap = h('div', {}, topbar(crumbsFor(page), head), body);
  setTimeout(() => { autosize(title); if (S.focusTitle) { S.focusTitle = false; title.focus(); } }, 0);
  return wrap;
}

const CE_MODE = (() => { const d = document.createElement('div'); try { d.contentEditable = 'plaintext-only'; } catch (e) {} return d.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true'; })();
function caretOffset(el) {
  const sel = getSelection(); if (!sel.rangeCount) return el.textContent.length;
  const r = sel.getRangeAt(0), pre = r.cloneRange(); pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset); return pre.toString().length;
}
function setCaret(el, off) {
  el.focus(); const sel = getSelection(), r = document.createRange(), n = el.firstChild;
  if (!n) r.setStart(el, 0); else r.setStart(n, Math.min(off, n.length));
  r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
}

function blocksEditor(page) {
  page.content = page.content || [];
  const root = h('div', { class: 'blocks' });
  const list = h('div', { class: 'blist' });
  const save = () => touchPage(page);
  const idx = b => page.content.indexOf(b);

  function olNumber(i) {
    const b = page.content[i]; let n = 1;
    for (let j = i - 1; j >= 0; j--) { const x = page.content[j]; if ((x.indent || 0) < (b.indent || 0)) break; if ((x.indent || 0) === (b.indent || 0)) { if (x.type === 'ol') n++; else break; } }
    return n;
  }
  function draw(focusId, off = 0) {
    list.replaceChildren(...page.content.map((b, i) => blockEl(b, i)));
    if (focusId) { const el = list.querySelector(`[data-bid="${focusId}"] .tx`); if (el) setCaret(el, off); }
  }
  function insertAfter(b, nb) { page.content.splice(idx(b) + 1, 0, nb); }
  function splitBlock(b, off) {
    const listy = ['ul', 'ol', 'todo'].includes(b.type);
    if (listy && !b.text) { b.type = 'p'; save(); draw(b.id, 0); return; }
    const before = b.text.slice(0, off), after = b.text.slice(off);
    b.text = before;
    const nb = { id: uid(), type: listy ? b.type : 'p', text: after, indent: b.indent || 0 }; if (b.type === 'todo') nb.checked = false;
    insertAfter(b, nb); save(); draw(nb.id, 0);
  }
  function backspaceAtStart(b) {
    const i = idx(b);
    if (b.type !== 'p') { b.type = 'p'; save(); draw(b.id, 0); return true; }
    if ((b.indent || 0) > 0) { b.indent--; save(); draw(b.id, 0); return true; }
    if (i > 0) {
      const prev = page.content[i - 1];
      if (prev.type === 'divider') { page.content.splice(i - 1, 1); save(); draw(b.id, 0); return true; }
      const len = prev.text.length; prev.text += b.text; page.content.splice(i, 1); save(); draw(prev.id, len); return true;
    }
    if (!b.text && page.content.length > 1) { page.content.splice(i, 1); save(); draw(page.content[0].id, 0); return true; }
    return false;
  }
  const SHORT = { '# ': 'h1', '## ': 'h2', '### ': 'h3', '- ': 'ul', '* ': 'ul', '1. ': 'ol', '[] ': 'todo', '> ': 'quote' };
  function blockEl(b, i) {
    const el = h('div', { class: 'blk ' + b.type + (b.type === 'todo' && b.checked ? ' done' : ''), 'data-bid': b.id, style: b.indent ? `margin-inline-start:${b.indent * 24}px` : '' });
    el.append(h('span', { class: 'grip', title: 'اسحب للترتيب' }, '⠿'));
    if (b.type === 'divider') {
      el.append(h('div', { class: 'hr' }));
    } else {
      if (b.type === 'ul') el.append(h('span', { class: 'mk' }, '•'));
      else if (b.type === 'ol') el.append(h('span', { class: 'mk' }, olNumber(i) + '.'));
      else if (b.type === 'todo') el.append(h('span', { class: 'mk' }, h('button', {
        class: 'cb' + (b.checked ? ' on' : ''), 'aria-label': 'إنجاز', onclick: e => { b.checked = !b.checked; e.currentTarget.className = 'cb' + (b.checked ? ' on' : ''); e.currentTarget.textContent = b.checked ? '✓' : ''; el.classList.toggle('done', b.checked); save(); }
      }, b.checked ? '✓' : '')));
      const tx = h('div', { class: 'tx', contenteditable: CE_MODE, dir: 'auto', 'data-ph': b.type === 'p' ? 'اكتب هنا…' : (BLOCK_TYPES[b.type] || {}).label, spellcheck: 'false' });
      tx.textContent = b.text || '';
      tx.addEventListener('input', () => {
        b.text = tx.textContent;
        const sc = SHORT[b.text];
        if (sc && b.type === 'p') { b.type = sc; b.text = ''; if (sc === 'todo') b.checked = false; save(); draw(b.id, 0); return; }
        save();
      });
      let shiftEnter = false;
      tx.addEventListener('beforeinput', e => {
        if ((e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') && !shiftEnter) { e.preventDefault(); splitBlock(b, caretOffset(tx)); }
        else if (e.inputType === 'deleteContentBackward') {
          const sel = getSelection();
          if (sel.isCollapsed && caretOffset(tx) === 0) { if (backspaceAtStart(b)) e.preventDefault(); }
        }
      });
      tx.addEventListener('keydown', e => {
        shiftEnter = e.key === 'Enter' && e.shiftKey;
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); splitBlock(b, caretOffset(tx)); }
        else if (e.key === 'Tab') { e.preventDefault(); b.indent = Math.max(0, Math.min(6, (b.indent || 0) + (e.shiftKey ? -1 : 1))); save(); draw(b.id, caretOffset(tx)); }
        else if (e.key === 'ArrowUp' && caretOffset(tx) === 0 && i > 0) { const p = list.children[i - 1].querySelector('.tx'); if (p) { e.preventDefault(); setCaret(p, p.textContent.length); } }
        else if (e.key === 'ArrowDown' && caretOffset(tx) >= tx.textContent.length && i < page.content.length - 1) { const n = list.children[i + 1].querySelector('.tx'); if (n) { e.preventDefault(); setCaret(n, 0); } }
      });
      tx.addEventListener('paste', e => {
        e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text/plain');
        const lines = t.split(/\r?\n/);
        if (lines.length <= 1) { document.execCommand('insertText', false, t); return; }
        const off = caretOffset(tx), before = b.text.slice(0, off), after = b.text.slice(off);
        b.text = before + lines[0]; let last = b;
        for (let k = 1; k < lines.length; k++) { const nb = { id: uid(), type: 'p', text: lines[k], indent: b.indent || 0 }; insertAfter(last, nb); last = nb; }
        last.text += after; save(); draw(last.id, last.text.length - after.length);
      });
      el.append(tx);
    }
    const more = h('button', { class: 'more', 'aria-label': 'خيارات الكتلة', onclick: () => blockMenu(b) }, '⋯');
    el.append(more);
    longPress(el.querySelector('.grip'), () => blockMenu(b));
    return el;
  }
  function blockMenu(b) {
    const i = idx(b);
    openSheet({
      title: 'الكتلة', body: api => h('div', {},
        h('div', { class: 'grid', style: 'margin-bottom:8px' }, Object.entries(BLOCK_TYPES).filter(([k]) => k !== 'divider').map(([k, v]) =>
          h('button', { class: 'gbtn', style: b.type === k ? 'border-color:var(--accent)' : '', onclick: () => { b.type = k; if (k === 'todo' && b.checked == null) b.checked = false; save(); api.close(); draw(b.id, (b.text || '').length); } }, h('b', {}, v.icon), v.label))),
        h('button', { class: 'act', onclick: () => { api.close(); const nb = { id: uid(), type: 'p', text: '', indent: b.indent || 0 }; insertAfter(b, nb); save(); draw(nb.id, 0); } }, h('span', { class: 'ai' }, '＋'), h('span', {}, 'إضافة سطر تحتها')),
        h('button', { class: 'act', onclick: () => { api.close(); const nb = Object.assign({}, b, { id: uid() }); insertAfter(b, nb); save(); draw(nb.id, 0); } }, h('span', { class: 'ai' }, '⧉'), h('span', {}, 'تكرار')),
        h('button', { class: 'act', onclick: () => { api.close(); b.indent = Math.min(6, (b.indent || 0) + 1); save(); draw(b.id, (b.text || '').length); } }, h('span', { class: 'ai' }, '⇥'), h('span', {}, 'إزاحة للداخل')),
        (b.indent || 0) > 0 ? h('button', { class: 'act', onclick: () => { api.close(); b.indent--; save(); draw(b.id, (b.text || '').length); } }, h('span', { class: 'ai' }, '⇤'), h('span', {}, 'إزاحة للخارج')) : null,
        h('button', { class: 'act danger', onclick: () => { api.close(); page.content.splice(i, 1); save(); draw(null); } }, h('span', { class: 'ai' }, '🗑'), h('span', {}, 'حذف')))
    });
  }
  function addMenu() {
    openSheet({
      title: 'إضافة', body: api => h('div', { class: 'grid' }, Object.entries(BLOCK_TYPES).map(([k, v]) =>
        h('button', { class: 'gbtn', onclick: () => { api.close(); const nb = { id: uid(), type: k, text: '', indent: 0 }; if (k === 'todo') nb.checked = false; page.content.push(nb); save(); draw(nb.id, 0); } }, h('b', {}, v.icon), v.label)))
    });
  }
  Sortable.create(list, {
    handle: '.grip', animation: 150, ghostClass: 'sortable-ghost', draggable: '.blk', forceFallback: false,
    onEnd: e => { const [m] = page.content.splice(e.oldIndex, 1); page.content.splice(e.newIndex, 0, m); save(); setTimeout(() => draw(null), 0); }
  });
  const tail = h('div', {
    style: 'min-height:90px;cursor:text', onclick: () => {
      const last = page.content[page.content.length - 1];
      if (!last || last.type === 'divider' || last.text) { const nb = { id: uid(), type: 'p', text: '', indent: 0 }; page.content.push(nb); save(); draw(nb.id, 0); }
      else { const el = list.querySelector(`[data-bid="${last.id}"] .tx`); if (el) setCaret(el, el.textContent.length); }
    }
  });
  root.append(list, h('div', { class: 'addblk' }, h('button', { class: 'btn sm ghost', onclick: addMenu }, '＋ إضافة كتلة')), tail);
  draw(null);
  return root;
}
