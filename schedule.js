'use strict';
/* دفتر — الجدول الأسبوعي، التكرار، ألوان الحالة (أحمر/أخضر)، لوحة «اليوم» */

PROP_TYPES.repeat = { label: 'تكرار أسبوعي', icon: '🔁' };
VIEW_TYPES.week = { label: 'أسبوعي', icon: '🗓' };
VIEW_TYPES.gallery = { label: 'معرض', icon: '🖼' };

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAYS_S = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
const DONE_RE = /done|complete|finished|☑|✅|^منجز|^مكتمل|^تم$/i;
const MISS_RE = /missed|❌|فاتت|فائت|لم ينجز/i;
const isStatusProp = p => p.type === 'status' || (p.type === 'select' && /status|حالة|state/i.test(p.name));

function fmtRepeat(v) {
  if (!v) return '';
  const t = v.start ? (v.end ? `${v.start}–${v.end}` : v.start) : '';
  if (v.once) return `${fmtDate({ start: v.once })}${t ? ' · ' + t : ''}`;
  const days = v.days || [];
  const d = days.length === 7 ? 'كل يوم' : days.length === 5 && [0, 1, 2, 3, 4].every(x => days.includes(x)) ? 'أحد–خميس' : days.map(x => DAYS_S[x]).join('، ');
  return `${d}${t ? ' · ' + t : ''}`;
}

/* ---------- حالة العنصر: منجز (أخضر) / متأخر (أحمر) ---------- */
function rowState(db, row) {
  for (const p of db.schema) {
    const v = row.props[p.id];
    if (p.type === 'checkbox' && v) return 'done';
    if (isStatusProp(p) && v) { const o = optOf(p, v); if (o) { if (MISS_RE.test(o.name)) return 'late'; if (DONE_RE.test(o.name)) return 'done'; } }
  }
  const dp = db.schema.find(p => p.type === 'date');
  const trackable = db.schema.some(p => p.type === 'checkbox' || isStatusProp(p));
  if (dp) { const v = row.props[dp.id]; if (v && v.start) { const end = (v.end || v.start).slice(0, 10); if (end < ymd(new Date())) return 'late'; } }
  return trackable ? 'open' : null;
}
const stClass = (db, row) => { const s = rowState(db, row); return s ? ' st-' + s : ''; };

function toggleRowDone(db, r) {
  const cb = db.schema.find(p => p.type === 'checkbox');
  if (cb) r.props[cb.id] = !r.props[cb.id];
  else {
    const st = db.schema.find(isStatusProp);
    if (st) {
      const done = (st.options || []).find(o => DONE_RE.test(o.name)), cur = r.props[st.id];
      if (done) { if (cur === done.id) { const first = st.options[0]; if (first && first !== done) r.props[st.id] = first.id; else delete r.props[st.id]; } else r.props[st.id] = done.id; }
    }
  }
  touchPage(r);
}

/* ---------- ظهور العناصر في يوم معيّن ---------- */
function occurrencesOn(db, d, rows) {
  const k = ymd(d), dow = d.getDay(), out = [];
  const rps = db.schema.filter(p => p.type === 'repeat'), dp = db.schema.find(p => p.type === 'date');
  for (const r of rows || dbRows(db.id)) {
    let hit = false;
    for (const p of rps) {
      const v = r.props[p.id]; if (!v) continue;
      if (v.once ? v.once === k : (v.days || []).includes(dow)) { out.push({ row: r, kind: 'repeat', start: v.start || '', end: v.end || '', key: k, db }); hit = true; }
    }
    if (!hit && dp) {
      const v = r.props[dp.id];
      if (v && v.start && v.start.slice(0, 10) === k) out.push({ row: r, kind: 'date', start: v.start.length > 10 ? v.start.slice(11, 16) : '', end: v.end && v.end.length > 10 ? v.end.slice(11, 16) : '', key: k, db });
    }
  }
  return out.sort((a, b) => (a.start || '99').localeCompare(b.start || '99'));
}
function occPast(o) {
  const today = ymd(new Date()); if (o.key < today) return true;
  if (o.key === today && o.end) { const n = new Date(); return pad(n.getHours()) + ':' + pad(n.getMinutes()) > o.end; }
  return false;
}
function occState(o) {
  if (o.kind === 'repeat') { if ((o.row.props.__log || {})[o.key]) return 'done'; return occPast(o) ? 'late' : null; }
  return rowState(o.db, o.row);
}
function toggleOcc(o, after) {
  const r = o.row;
  if (o.kind === 'repeat') { r.props.__log = r.props.__log || {}; if (r.props.__log[o.key]) delete r.props.__log[o.key]; else r.props.__log[o.key] = true; touchPage(r); }
  else toggleRowDone(o.db, r);
  after && after();
}
function occEl(o, rerender, { showDb = false } = {}) {
  const st = occState(o);
  const b = h('button', { class: 'cb' + (st === 'done' ? ' on' : ''), 'aria-label': 'إنجاز', onclick: e => { e.stopPropagation(); toggleOcc(o, rerender); } }, st === 'done' ? '✓' : '');
  const time = o.start ? (o.end ? `${o.start}–${o.end}` : o.start) : '';
  const el = h('div', { class: 'wk-item' + (st ? ' st-' + st : '') },
    b, h('div', { class: 'wk-body', onclick: () => openRow(o.row.id) },
      time ? h('div', { class: 'wk-time' }, time) : null,
      h('div', { class: 'wk-title', dir: 'auto' }, (o.row.icon ? o.row.icon + ' ' : '') + titleOf(o.row)),
      (() => { const tp = o.db.schema.find(p => p.type === 'select' && !isStatusProp(p)); const op = tp ? optOf(tp, o.row.props[tp.id]) : null; return op || showDb ? h('div', { class: 'cp' }, op ? pill(op) : null, showDb ? h('span', { class: 'pill' }, titleOf(o.db)) : null) : null; })()));
  longPress(el, () => rowMenu(o.row));
  return el;
}

/* ---------- نموذج التكرار ---------- */
function repeatForm(val, presetDate) {
  const v = Object.assign({ days: [], start: '', end: '', once: null }, val || {});
  let weekly = !v.once;
  const box = h('div');
  const dayBtns = DAYS.map((n, i) => h('button', { class: 'chip', style: 'min-height:44px;padding:6px 12px', onclick: e => { const k = v.days.indexOf(i); if (k >= 0) v.days.splice(k, 1); else v.days.push(i); paint(); } }, n));
  const s = h('input', { type: 'time', value: v.start || '' }), e = h('input', { type: 'time', value: v.end || '' });
  const od = h('input', { type: 'date', value: v.once || presetDate || ymd(new Date()) });
  const wkBtn = h('button', { class: 'btn grow', onclick: () => { weekly = true; paint(); } }, '🔁 كل أسبوع');
  const onBtn = h('button', { class: 'btn grow', onclick: () => { weekly = false; paint(); } }, '📅 مرة وحدة');
  const daysRow = h('div', {}, h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px;margin-bottom:8px' }, dayBtns),
    h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px;margin-bottom:10px' },
      h('button', { class: 'chip', onclick: () => { v.days = [0, 1, 2, 3, 4, 5, 6]; paint(); } }, 'كل يوم'),
      h('button', { class: 'chip', onclick: () => { v.days = [0, 1, 2, 3, 4]; paint(); } }, 'أحد–خميس'),
      h('button', { class: 'chip', onclick: () => { v.days = [5, 6]; paint(); } }, 'الويكند')));
  const onceRow = h('div', { class: 'field' }, h('label', {}, 'التاريخ'), od);
  box.append(h('div', { class: 'row', style: 'margin-bottom:10px' }, wkBtn, onBtn), daysRow, onceRow,
    h('div', { class: 'row' }, h('div', { class: 'field grow' }, h('label', {}, 'من'), s), h('div', { class: 'field grow' }, h('label', {}, 'إلى'), e)));
  function paint() {
    daysRow.hidden = !weekly; onceRow.hidden = weekly;
    wkBtn.classList.toggle('primary', weekly); onBtn.classList.toggle('primary', !weekly);
    dayBtns.forEach((b, i) => { b.style.background = v.days.includes(i) ? 'var(--accent2)' : ''; b.style.color = v.days.includes(i) ? '#fff' : ''; });
  }
  paint();
  return { el: box, get: () => ({ days: weekly ? v.days.slice().sort() : [], once: weekly ? null : od.value, start: s.value, end: e.value }), weekly: () => weekly };
}
function editRepeat(page, prop, done) {
  const f = repeatForm(page.props[prop.id]);
  openSheet({
    title: prop.name, body: api => h('div', {}, f.el, h('div', { class: 'row', style: 'margin-top:12px' },
      h('button', { class: 'btn primary grow', onclick: () => { const v = f.get(); if (f.weekly() && !v.days.length) { toast('اختر يوم واحد على الأقل'); return; } page.props[prop.id] = v; done(); api.close(); } }, 'تم'),
      h('button', { class: 'btn danger', onclick: () => { delete page.props[prop.id]; done(); api.close(); } }, 'مسح')))
  });
}

/* ---------- إضافة سريعة لفترة ---------- */
function ensureRepeatProp(db) {
  let rp = db.schema.find(p => p.type === 'repeat');
  if (!rp) { rp = { id: uid(), name: 'التكرار', type: 'repeat' }; db.schema.push(rp); touchDb(db); }
  return rp;
}
function quickAddSheet(db, view, presetDay, rerender, presetDate) {
  const rp = ensureRepeatProp(db);
  const tp = db.schema.find(p => p.type === 'select' && !isStatusProp(p) && /نوع|type/i.test(p.name)) || null;
  const f = repeatForm(presetDay != null ? { days: [presetDay] } : { days: [] }, presetDate);
  const title = h('input', { dir: 'auto', placeholder: 'مثلاً: أخلّص حل 10 مسائل ديناميكا' });
  let chosen = null;
  const typeRow = tp && (tp.options || []).length ? h('div', { class: 'field' }, h('label', {}, 'النوع'), h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' },
    tp.options.map(o => { const b = h('button', { class: 'chip', style: 'min-height:40px', onclick: () => { chosen = chosen === o.id ? null : o.id; $$('.tq', typeRow).forEach(x => x.style.outline = ''); if (chosen) b.style.outline = '2px solid var(--accent)'; } }, pill(o)); b.classList.add('tq'); return b; }))) : null;
  openSheet({
    title: 'إضافة سريعة', onClose: rerender, body: api => h('div', {},
      h('div', { class: 'field' }, h('label', {}, 'وش تسوي / تخلّص في هذي الفترة؟'), title), typeRow, f.el,
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', {
        class: 'btn primary grow', onclick: () => {
          const rep = f.get();
          if (!title.value.trim()) { toast('اكتب العنوان أو الهدف'); return; }
          if (f.weekly() && !rep.days.length) { toast('اختر يوم واحد على الأقل'); return; }
          const props = { [rp.id]: rep }; if (tp && chosen) props[tp.id] = chosen;
          newPage({ database_id: db.id, title: title.value.trim(), props });
          api.close(); toast('تمت الإضافة');
        }
      }, 'إضافة'), h('button', { class: 'btn', onclick: api.close }, 'إلغاء')))
  });
  setTimeout(() => title.focus(), 80);
}

/* ---------- العرض الأسبوعي ---------- */
function weekStart(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - x.getDay()); return x; }
function weekView(db, view, rows, rerender) {
  const key = 'w:' + db.id + ':' + view.id;
  const base = S.ui.cal[key] ? new Date(S.ui.cal[key] + 'T00:00:00') : weekStart(new Date());
  const shift = n => { const d = new Date(base); d.setDate(d.getDate() + 7 * n); S.ui.cal[key] = ymd(d); saveUi(); rerender(); };
  const today = ymd(new Date());
  const rp = db.schema.some(p => p.type === 'repeat');
  const grid = h('div', { class: 'week' });
  let total = 0, done = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(base); d.setDate(d.getDate() + i);
    const occ = occurrencesOn(db, d, rows);
    const list = h('div', { class: 'wk-list' });
    if (!occ.length) list.append(h('div', { class: 'muted', style: 'padding:8px;font-size:13px' }, '—'));
    for (const o of occ) { total++; if (occState(o) === 'done') done++; list.append(occEl(o, rerender)); }
    grid.append(h('div', { class: 'wk-col' + (ymd(d) === today ? ' today' : '') },
      h('div', { class: 'wk-h' }, h('b', {}, DAYS[d.getDay()]), h('span', { class: 'muted' }, `${d.getDate()}/${d.getMonth() + 1}`), h('span', { class: 'grow' }),
        h('button', { class: 'ibtn', style: 'width:36px;height:36px', 'aria-label': 'إضافة', onclick: () => quickAddSheet(db, view, d.getDay(), rerender, ymd(d)) }, '＋')), list));
  }
  const first = new Date(base), last = new Date(base); last.setDate(last.getDate() + 6);
  const label = `${first.getDate()}/${first.getMonth() + 1} — ${last.getDate()}/${last.getMonth() + 1}`;
  return h('div', {},
    h('div', { class: 'cal-head' }, h('button', { class: 'ibtn', onclick: () => shift(-1), 'aria-label': 'الأسبوع السابق' }, '›'), h('b', { class: 'grow', style: 'text-align:center' }, 'أسبوع ' + label), h('button', { class: 'ibtn', onclick: () => shift(1), 'aria-label': 'الأسبوع التالي' }, '‹'),
      h('button', { class: 'btn sm', onclick: () => { delete S.ui.cal[key]; saveUi(); rerender(); } }, 'هذا الأسبوع')),
    h('div', { class: 'muted', style: 'margin:-2px 2px 8px;font-size:13px' }, total ? `أنجزت ${done} من ${total} هذا الأسبوع` : 'ما فيه عناصر هذا الأسبوع. اضغط ＋ تحت أي يوم.'),
    grid,
    !rp ? h('div', { class: 'muted', style: 'padding:10px;font-size:13px' }, 'هذا العرض يعرض العناصر المؤرّخة. لإضافة فترات متكررة اضغط ＋.') : null);
}

/* ---------- لوحة «اليوم» (الرئيسية) ---------- */
function todayPanel() {
  const wrap = h('div');
  const draw = () => {
    const today = new Date(), items = [], late = [];
    for (const db of S.dbs.values()) {
      const rows = dbRows(db.id); if (!rows.length) continue;
      const hasSched = db.schema.some(p => p.type === 'repeat' || p.type === 'date'); if (!hasSched) continue;
      items.push(...occurrencesOn(db, today, rows));
      // متأخرات آخر 14 يوم (للعناصر المؤرّخة غير المنجزة، ومرات التكرار غير المسجّلة)
      if (db.autogen) continue;
      for (let k = 1; k <= 14; k++) { const d = new Date(today); d.setDate(d.getDate() - k); for (const o of occurrencesOn(db, d, rows)) if (occState(o) === 'late') late.push(o); }
    }
    items.sort((a, b) => (a.start || '99').localeCompare(b.start || '99'));
    const doneN = items.filter(o => occState(o) === 'done').length;
    const kids = [];
    kids.push(h('div', { class: 's-label' }, h('span', {}, `اليوم · ${DAYS[today.getDay()]} ${today.getDate()}/${today.getMonth() + 1}`), items.length ? h('span', {}, `${doneN}/${items.length}`) : null));
    if (items.length) {
      kids.push(h('div', { class: 'bar' }, h('i', { style: `width:${Math.round(100 * doneN / items.length)}%` })));
      kids.push(h('div', { class: 'wk-list' }, items.map(o => occEl(o, draw, { showDb: true }))));
    } else kids.push(h('div', { class: 'muted', style: 'padding:8px 2px' }, 'ما فيه شيء مجدول اليوم 🎉'));
    if (late.length) {
      kids.push(h('div', { class: 's-label', style: 'color:var(--c-red)' }, h('span', {}, `مهام متأخرة (${late.length})`)));
      kids.push(h('div', { class: 'wk-list' }, late.slice(0, 8).map(o => { const e = occEl(o, draw, { showDb: true }); const t = e.querySelector('.wk-time'); const lab = `${o.key.slice(5).replace('-', '/')}${o.start ? ' · ' + o.start : ''}`; if (t) t.textContent = lab; else e.querySelector('.wk-body').prepend(h('div', { class: 'wk-time' }, lab)); return e; })));
      if (late.length > 8) kids.push(h('div', { class: 'muted', style: 'padding:4px 2px;font-size:13px' }, `+${late.length - 8} أخرى`));
    }
    wrap.replaceChildren(...kids);
  };
  draw(); return wrap;
}


/* ---------- توليد العادات اليومية تلقائياً (بديل أتمتة نوشن اللي تتوقف) ---------- */
const normT = t => String(t || '').replace(/\s*\(\d+\)\s*$/, '').trim().toLowerCase();
function ensureAutogen(db) {
  const ag = db.autogen; if (!ag || !(ag.rules || []).length) return 0;
  const today = new Date(), tk = ymd(today);
  let from = ag.last ? new Date(ag.last + 'T00:00:00') : new Date(today); from.setDate(from.getDate() + 1);
  const minFrom = new Date(today); minFrom.setDate(minFrom.getDate() - 45); if (from < minFrom) from = minFrom;
  const have = new Set(dbRows(db.id).map(r => (((r.props[ag.dateProp] || {}).start) || '').slice(0, 10) + '|' + normT(r.title)));
  let n = 0;
  for (const d = new Date(from); ymd(d) <= tk; d.setDate(d.getDate() + 1)) {
    const k = ymd(d), dow = d.getDay();
    for (const rule of ag.rules) {
      if (!(rule.days || []).includes(dow) || have.has(k + '|' + normT(rule.title))) continue;
      const props = { [ag.dateProp]: { start: k, end: null } }; if (ag.statusProp && ag.pending) props[ag.statusProp] = ag.pending;
      newPage({ database_id: db.id, title: rule.title, icon: rule.icon, props }); n++;
    }
  }
  if (ag.last !== tk) { ag.last = tk; touchDb(db); }
  return n;
}
function ensureAutogenAll() { let n = 0; for (const db of S.dbs.values()) if (db.autogen) n += ensureAutogen(db); if (n) toast(`أضفت ${n} عنصر لعاداتك اليومية`); return n; }

/* ---------- قوالب ---------- */
function templatesSheet(parentId) {
  openSheet({
    title: 'قوالب جاهزة', body: api => h('div', {},
      h('button', { class: 'act', onclick: () => { api.close(); const d = newDb({ template: 'study', parent_page_id: parentId }); if (parentId && !S.ui.expanded.includes(parentId)) S.ui.expanded.push(parentId); openItem('db', d.id); toast('خطة مذاكرة: أضف الفصول ووقتها وتابع التقدم'); } },
        h('span', { class: 'ai' }, '📚'), h('span', {}, 'خطة مذاكرة (فصول + وقت مقدّر ومنقضي + مراجعة)')),
      h('button', { class: 'act', onclick: () => { api.close(); const p = focusPageTemplate(parentId); openItem('page', p.id); } },
        h('span', { class: 'ai' }, '🎯'), h('span', {}, 'جلسة مذاكرة (مؤقت + موسيقى خلفية + مهامك)')),
      h('button', { class: 'act', onclick: () => { api.close(); const d = newDb({ template: 'timetable', parent_page_id: parentId }); openItem('db', d.id); } },
        h('span', { class: 'ai' }, '🗓'), h('span', {}, 'جدول أسبوعي (دوام / مذاكرة / تمارين)')),
      h('button', { class: 'act', onclick: () => { api.close(); const d = newDb({ template: 'habits', parent_page_id: parentId }); openItem('db', d.id); } },
        h('span', { class: 'ai' }, '💪'), h('span', {}, 'متتبع عادات')))
  });
}
function focusPageTemplate(parentId) {
  const p = newPage({ parent_page_id: parentId, title: 'جلسة مذاكرة', icon: '🎯' });
  p.cover = 'g:' + COVER_GRADS[4];
  const study = [...S.dbs.values()].find(d => d.schema.some(x => /منقضي/.test(x.name)));
  const tasks = [...S.dbs.values()].find(d => /to ?do|مهام/i.test(d.title));
  const left = [{ id: uid(), type: 'h2', text: '⏱ المؤقت', indent: 0 }, { id: uid(), type: 'timer', minutes: 25, indent: 0 }, { id: uid(), type: 'h2', text: '🎧 موسيقى الخلفية', indent: 0 }, { id: uid(), type: 'p', text: 'أضف يوتيوب أو سبوتيفاي: ＋ إضافة كتلة ← يوتيوب / سبوتيفاي', indent: 0 }];
  const right = [{ id: uid(), type: 'h2', text: '✅ اللي بسويه الحين', indent: 0 }];
  if (study) right.push({ id: uid(), type: 'db', dbId: study.id, indent: 0 }); else if (tasks) right.push({ id: uid(), type: 'db', dbId: tasks.id, indent: 0 }); else right.push({ id: uid(), type: 'todo', text: 'المهمة الأولى', checked: false, indent: 0 });
  p.content = [{ id: uid(), type: 'columns', indent: 0, cols: [{ id: uid(), w: 1, blocks: left }, { id: uid(), w: 2, blocks: right }] }];
  touchPage(p); if (parentId && !S.ui.expanded.includes(parentId)) S.ui.expanded.push(parentId);
  return p;
}
