'use strict';
/* دفتر — قوالب المهام: أنواع تتكرر (Quiz / Mid / Lab…) + مهام مرة وحدة */

const subjOf = db => db.schema.find(p => p.type === 'select' && !isStatusProp(p));
const noteOf = db => db.schema.find(p => p.type === 'text');

/* أول مرة: نستخرج الأنواع من مهامك الموجودة (مثل «ديناميكا حرارية | Quiz 2» ← النوع Quiz) */
function seedTemplates(db) {
  if (db.templates) return db.templates;
  const sp = subjOf(db), np = noteOf(db), kinds = {};
  for (const r of dbRows(db.id)) {
    const t = (r.title || '').trim(); if (!t) continue;
    let kind = t.includes('|') ? t.split('|').pop() : t;
    kind = kind.replace(/[\d٠-٩]+/g, '').replace(/\s+/g, ' ').trim();
    if (!kind || kind.length > 30) continue;
    const k = kinds[kind] = kinds[kind] || { n: 0, notes: {}, icon: null, piped: t.includes('|') };
    k.n++; if (r.icon) k.icon = r.icon; if (t.includes('|')) k.piped = true;
    const nv = np ? r.props[np.id] : null; if (nv) k.notes[nv] = (k.notes[nv] || 0) + 1;
  }
  db.templates = Object.entries(kinds).filter(([, k]) => k.n >= 2 || k.piped).sort((a, b) => b[1].n - a[1].n).slice(0, 10).map(([name, k]) => ({
    id: uid(), name, icon: k.icon, note: (Object.entries(k.notes).sort((a, b) => b[1] - a[1])[0] || [''])[0], subjFirst: k.piped && !!sp
  }));
  touchDb(db); return db.templates;
}
function autoTitle(db, tpl, subjId) {
  if (!tpl) return '';
  const sp = subjOf(db), so = sp && subjId ? optOf(sp, subjId) : null;
  const n = dbRows(db.id).filter(r => (r.title || '').includes(tpl.name) && (!sp || !subjId || r.props[sp.id] === subjId)).length + 1;
  const base = tpl.name + (/quiz|كويز|اسبوع|أسبوع|lab|واجب/i.test(tpl.name) ? ' ' + n : '');
  return so && tpl.subjFirst ? `${so.name} | ${base}` : base;
}

function taskFormSheet({ db, dbs, date, presets, after, open = false } = {}) {
  dbs = dbs || [db]; db = db || dbs[0];
  let tpl = null, subj = null, when = date ? 'custom' : 'today', custom = date || '', edited = false, keep = false; const remind = [];
  const title = h('input', { dir: 'auto', placeholder: 'وش المهمة؟ (أو اختر نوع جاهز تحت)', enterkeyhint: 'done' });
  const note = h('input', { dir: 'auto', placeholder: 'تعليمات / ملاحظة (مثلاً: عليه 5 درجات)' });
  title.addEventListener('input', () => { edited = !!title.value; });
  const box = h('div');
  const refill = () => { if (!edited && tpl) title.value = autoTitle(db, tpl, subj); };
  function create() {
    const t = title.value.trim() || (tpl ? autoTitle(db, tpl, subj) : '');
    if (!t) { toast('اكتب المهمة أو اختر نوع'); title.focus(); return; }
    const props = Object.assign({}, presets || {});
    const dp = db.schema.find(p => p.type === 'date');
    if (dp) { if (when === 'none') delete props[dp.id]; else { const d = new Date(); if (when === 'tomorrow') d.setDate(d.getDate() + 1); props[dp.id] = { start: when === 'custom' ? (custom || ymd(new Date())) : ymd(d), end: null }; } }
    const sp = subjOf(db); if (sp && subj) props[sp.id] = subj;
    const np = noteOf(db); if (np && note.value.trim()) props[np.id] = note.value.trim();
    const st = db.schema.find(isStatusProp); if (st && !props[st.id]) { const first = (st.options || []).find(o => !DONE_RE.test(o.name) && !MISS_RE.test(o.name)); if (first) props[st.id] = first.id; }
    if (remind.length && when !== 'none') props.__remind = remind.slice();
    const r = newPage({ database_id: db.id, title: t, icon: tpl && tpl.icon, props });
    S.ui.lastTaskDb = db.id; saveUi();
    toast(`✓ «${t}» انضافت`);
    title.value = ''; note.value = ''; edited = false; tpl = null; draw();
    if (!keep) sh.close(); else title.focus();
    after && after(r); if (open && !keep) openRow(r.id);
  }
  title.addEventListener('keydown', e => { if (e.key === 'Enter') { keep = true; create(); keep = false; } });
  function draw() {
    const sp = subjOf(db), dp = db.schema.find(p => p.type === 'date'), tpls = seedTemplates(db);
    const chip = (on, label, fn) => h('button', { class: 'chip' + (on ? ' on' : ''), onclick: () => { fn(); draw(); } }, label);
    box.replaceChildren(
      dbs.length > 1 ? h('div', { class: 'field' }, h('label', {}, 'في أي قائمة؟'), h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' }, dbs.map(d => chip(d === db, iconOf(d, 'db') + ' ' + titleOf(d), () => { db = d; tpl = null; subj = null; })))) : null,
      h('div', { class: 'field' }, h('label', {}, 'النوع — مهمة تتكرر (اختر) أو مرة وحدة (اكتبها فوق)'), h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' },
        chip(!tpl, '✏️ مرة وحدة', () => { tpl = null; if (!edited) title.value = ''; }),
        ...tpls.map(x => chip(tpl === x, (x.icon ? x.icon + ' ' : '') + x.name, () => { tpl = x; note.value = x.note || ''; refill(); })),
        h('button', { class: 'chip', onclick: () => templatesManager(db, draw) }, '⚙ تعديل الأنواع'))),
      sp && (sp.options || []).length ? h('div', { class: 'field' }, h('label', {}, sp.name), h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' }, sp.options.map(o => h('button', { class: 'chip' + (subj === o.id ? ' on' : ''), onclick: () => { subj = subj === o.id ? null : o.id; refill(); draw(); } }, pill(o))))) : null,
      dp ? h('div', { class: 'field' }, h('label', {}, 'متى؟'), h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' },
        date ? chip(when === 'custom' && custom === date, '📅 ' + fmtDate({ start: date }), () => { when = 'custom'; custom = date; }) : null,
        chip(when === 'today', 'اليوم', () => { when = 'today'; }), chip(when === 'tomorrow', 'بكرة', () => { when = 'tomorrow'; }), chip(when === 'none', 'بدون موعد', () => { when = 'none'; }),
        h('input', { type: 'date', value: when === 'custom' ? custom : '', style: 'max-width:170px;min-height:36px', onchange: e => { custom = e.target.value; when = 'custom'; draw(); } }))) : null,
      dp && when !== 'none' ? h('div', { class: 'field' }, h('label', {}, 'ذكّرني (اختياري)'), remindChips(remind)) : null);
    refill();
  }
  draw();
  const sh = openSheet({
    title: '＋ مهمة', body: () => h('div', {}, h('div', { class: 'field' }, title), h('div', { class: 'field' }, note), box,
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn primary grow', onclick: () => create() }, 'إضافة'), h('button', { class: 'btn grow', onclick: () => { keep = true; create(); keep = false; } }, 'إضافة وأضيف ثانية')))
  });
  setTimeout(() => title.focus(), 80);
}
function templatesManager(db, after) {
  seedTemplates(db);
  openSheet({
    title: 'أنواع المهام — ' + titleOf(db), onClose: after, body: () => {
      const box = h('div');
      const draw = () => box.replaceChildren(
        h('p', { class: 'muted', style: 'margin:0 0 10px;font-size:14px' }, 'النوع = مهمة تتكرر (Quiz، Mid، واجب…) بتعليماتها. تختاره وقت الإضافة ويتعبّى العنوان والملاحظة لحالهم.'),
        ...db.templates.map(t => h('div', { class: 'optrow' },
          h('button', { class: 'ibtn', 'aria-label': 'أيقونة', onclick: () => emojiSheet(t.icon, e => { t.icon = e; touchDb(db); draw(); }) }, t.icon || '🏷'),
          h('input', { dir: 'auto', value: t.name, onchange: e => { t.name = e.target.value.trim() || t.name; touchDb(db); } }),
          h('input', { dir: 'auto', value: t.note || '', placeholder: 'تعليمات', onchange: e => { t.note = e.target.value; touchDb(db); } }),
          h('button', { class: 'ibtn', 'aria-label': 'حذف', onclick: () => { db.templates = db.templates.filter(x => x !== t); touchDb(db); draw(); } }, '🗑'))),
        h('button', { class: 'btn primary', style: 'margin-top:8px', onclick: () => { db.templates.push({ id: uid(), name: 'نوع جديد', icon: null, note: '', subjFirst: !!subjOf(db) }); touchDb(db); draw(); } }, '＋ نوع جديد'));
      draw(); return box;
    }
  });
}
function saveAsTemplate(r) {
  const db = S.dbs.get(r.database_id); if (!db) return;
  seedTemplates(db);
  let name = (r.title || '').includes('|') ? r.title.split('|').pop() : (r.title || '');
  name = name.replace(/[\d٠-٩]+/g, '').trim() || 'قالب';
  const np = noteOf(db);
  db.templates.push({ id: uid(), name, icon: r.icon || null, note: np ? (r.props[np.id] || '') : '', subjFirst: (r.title || '').includes('|') });
  touchDb(db); toast(`💾 صار «${name}» نوع جاهز — تلقاه وقت الإضافة`);
}
function newRowFlow(db, view, pre, after, date) {
  if (isTaskDb(db) && !db.autogen) return taskFormSheet({ db, presets: pre, date, after: () => after && after() });
  const r = newPage({ database_id: db.id, props: pre }); openRow(r.id);
}
quickTaskSheet = function (presetDbId) {
  const dbs = taskDbs().filter(d => !d.autogen);
  if (!dbs.length) dbs.push(newDb({ template: 'todo' }));
  const db = S.dbs.get(presetDbId) || dbs[0];
  taskFormSheet({ db, dbs, after: () => { if (S.route.t !== 'p') scheduleRefresh(true); } });
};

/* ---------- سحب الفاصل بين الأعمدة (مثل نوشن) ---------- */
function columnResizer(grid, b, save) {
  const cols = b.cols;
  const paint = () => { grid.style.gridTemplateColumns = cols.map(c => (c.w || 1) + 'fr').join(' 14px '); };
  paint();
  return i => {
    const hnd = h('div', { class: 'col-rs', title: 'اسحب لتكبير/تصغير الأعمدة — ضغطتين = متساوية' });
    hnd.addEventListener('dblclick', () => { cols.forEach(c => { c.w = 1; }); paint(); save(); });
    hnd.addEventListener('pointerdown', e => {
      e.preventDefault(); hnd.setPointerCapture(e.pointerId); hnd.classList.add('on');
      const kids = [...grid.children].filter(x => x.classList.contains('col-in'));
      const pl = kids[i].getBoundingClientRect().width, pr = kids[i + 1].getBoundingClientRect().width;
      const tw = (cols[i].w || 1) + (cols[i + 1].w || 1), x0 = e.clientX, min = Math.min(140, (pl + pr) * 0.15);
      const move = ev => { const nl = Math.max(min, Math.min(pl + pr - min, pl + (ev.clientX - x0))); cols[i].w = +(tw * nl / (pl + pr)).toFixed(3); cols[i + 1].w = +(tw - cols[i].w).toFixed(3); paint(); };
      const up = () => { hnd.classList.remove('on'); hnd.removeEventListener('pointermove', move); hnd.removeEventListener('pointerup', up); save(); };
      hnd.addEventListener('pointermove', move); hnd.addEventListener('pointerup', up);
    });
    return hnd;
  };
}

/* ---------- تذكيرات قبل الموعد (تظهر في «اليوم»؛ الإشعار للجوال يحتاج قناة إرسال) ---------- */
const REMIND_OPTS = [[0, 'يوم الموعد'], [1, 'قبل بيوم'], [2, 'قبل يومين'], [3, 'قبل 3 أيام'], [7, 'قبل أسبوع']];
const fmtRemind = a => (a || []).length ? a.slice().sort((x, y) => x - y).map(n => (REMIND_OPTS.find(o => o[0] === n) || [n, `قبل ${n} يوم`])[1]).join('، ') : '';
function remindChips(arr, onChange) {
  const box = h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' });
  const draw = () => box.replaceChildren(...REMIND_OPTS.map(([n, l]) => h('button', { class: 'chip' + (arr.includes(n) ? ' on' : ''), onclick: () => { const i = arr.indexOf(n); if (i >= 0) arr.splice(i, 1); else arr.push(n); draw(); onChange && onChange(arr); } }, '🔔 ' + l)));
  draw(); return box;
}
function remindSheet(page, done) {
  page.props.__remind = page.props.__remind || [];
  openSheet({ title: '🔔 ذكّرني', onClose: () => { if (!page.props.__remind.length) delete page.props.__remind; touchPage(page); done && done(); },
    body: api => h('div', {}, h('p', { class: 'muted', style: 'margin:0 0 10px;font-size:14px' }, 'اختر متى تبي التذكير قبل موعد المهمة (تقدر تختار أكثر من وقت).'), remindChips(page.props.__remind),
      h('button', { class: 'btn primary', style: 'width:100%;margin-top:12px', onclick: api.close }, 'تم')) });
}
function remindersDue() {
  const out = [], today = new Date(new Date().toDateString());
  for (const db of S.dbs.values()) {
    const dp = db.schema.find(p => p.type === 'date'); if (!dp) continue;
    for (const r of dbRows(db.id)) {
      const rem = r.props.__remind, v = r.props[dp.id]; if (!rem || !rem.length || !v || !v.start || rowState(db, r) === 'done') continue;
      const left = Math.round((new Date(v.start.slice(0, 10) + 'T00:00:00') - today) / 864e5);
      if (left >= 0 && left <= Math.max(...rem)) out.push({ db, r, left });
    }
  }
  return out.sort((a, b) => a.left - b.left);
}
