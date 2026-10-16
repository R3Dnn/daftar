'use strict';
/* دفتر — مهمة سريعة، صفحة اليوم، المتأخرة، دليل «كيف أسوي…؟» */

const isTaskDb = d => d.schema.some(p => p.type === 'checkbox' || isStatusProp(p));
function taskDbs() {
  const list = [...S.dbs.values()].filter(isTaskDb);
  const last = S.ui.lastTaskDb; list.sort((a, b) => (b.id === last) - (a.id === last) || (a.autogen ? 1 : 0) - (b.autogen ? 1 : 0) || sortItems(a, b));
  return list;
}

/* ---------- مهمة سريعة (من أي مكان) ---------- */
function quickTaskSheet(presetDbId) {
  const dbs = taskDbs();
  if (!dbs.length) { const d = newDb({ template: 'todo' }); dbs.push(d); }
  let db = S.dbs.get(presetDbId) || dbs[0], date = 'today', custom = '', opt = null;
  const title = h('input', { dir: 'auto', placeholder: 'وش المهمة؟ (مثلاً: أحل واجب الديناميكا)', enterkeyhint: 'done' });
  const box = h('div');
  const add = keepOpen => {
    const t = title.value.trim(); if (!t) { toast('اكتب المهمة أول'); title.focus(); return; }
    const props = {};
    const dp = db.schema.find(p => p.type === 'date');
    const d = new Date(); if (date === 'tomorrow') d.setDate(d.getDate() + 1); if (date === 'after') d.setDate(d.getDate() + 2);
    if (dp && date !== 'none') props[dp.id] = { start: date === 'custom' ? (custom || ymd(new Date())) : ymd(d), end: null };
    const sp = db.schema.find(p => p.type === 'select' && !isStatusProp(p)); if (sp && opt) props[sp.id] = opt;
    const st = db.schema.find(isStatusProp); if (st && !props[st.id]) { const first = (st.options || []).find(o => !DONE_RE.test(o.name) && !MISS_RE.test(o.name)); if (first) props[st.id] = first.id; }
    newPage({ database_id: db.id, title: t, props });
    S.ui.lastTaskDb = db.id; saveUi();
    toast(`✓ انضافت إلى «${titleOf(db)}»`);
    title.value = '';
    if (!keepOpen) sh.close(); else title.focus();
    if (S.route.t === 'd' || S.route.t === 'today' || S.route.t === 'p') scheduleRefresh(true);
  };
  title.addEventListener('keydown', e => { if (e.key === 'Enter') add(true); });
  function draw() {
    const sp = db.schema.find(p => p.type === 'select' && !isStatusProp(p));
    const dp = db.schema.find(p => p.type === 'date');
    const chip = (on, label, fn) => h('button', { class: 'chip' + (on ? ' on' : ''), onclick: () => { fn(); draw(); } }, label);
    box.replaceChildren(
      h('div', { class: 'field' }, h('label', {}, 'في أي قائمة؟'), h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' }, dbs.map(d => chip(d === db, iconOf(d, 'db') + ' ' + titleOf(d), () => { db = d; opt = null; })))),
      dp ? h('div', { class: 'field' }, h('label', {}, 'متى؟'), h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' },
        chip(date === 'today', 'اليوم', () => { date = 'today'; }), chip(date === 'tomorrow', 'بكرة', () => { date = 'tomorrow'; }), chip(date === 'after', 'بعد بكرة', () => { date = 'after'; }), chip(date === 'none', 'بدون موعد', () => { date = 'none'; }),
        h('input', { type: 'date', value: custom, style: 'max-width:170px;min-height:36px', onchange: e => { custom = e.target.value; date = 'custom'; draw(); } }))) : null,
      sp && (sp.options || []).length ? h('div', { class: 'field' }, h('label', {}, sp.name), h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' }, sp.options.map(o => h('button', { class: 'chip' + (opt === o.id ? ' on' : ''), onclick: () => { opt = opt === o.id ? null : o.id; draw(); } }, pill(o))))) : null);
  }
  draw();
  const sh = openSheet({
    title: '＋ مهمة سريعة', body: () => h('div', {}, h('div', { class: 'field' }, title), box,
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn primary grow', onclick: () => add(false) }, 'إضافة'), h('button', { class: 'btn grow', onclick: () => add(true) }, 'إضافة وأضيف ثانية')),
      h('div', { class: 'muted', style: 'font-size:13px;margin-top:8px' }, 'تلميح: اكتب واضغط Enter عشان تضيف مهام ورا بعض بسرعة.'))
  });
  setTimeout(() => title.focus(), 80);
}

/* ---------- المتأخرة: كل القوائم بمكان واحد (ما تظهر إلا إذا دخلت عليها) ---------- */
function lateItems() {
  const out = [], today = ymd(new Date());
  for (const db of S.dbs.values()) {
    if (db.autogen || !isTaskDb(db)) continue;
    const dp = db.schema.find(p => p.type === 'date'); if (!dp) continue;
    for (const r of dbRows(db.id)) { const v = r.props[dp.id]; if (v && v.start && (v.end || v.start).slice(0, 10) < today && rowState(db, r) !== 'done') out.push({ db, r, v }); }
  }
  return out.sort((a, b) => String(b.v.start).localeCompare(String(a.v.start)));
}
function taskLine(db, r, after, { showDb = true, extra } = {}) {
  const st = rowState(db, r);
  const cb = h('button', { class: 'cb' + (st === 'done' ? ' on' : ''), 'aria-label': 'إنجاز', onclick: e => { e.stopPropagation(); toggleRowDone(db, r); after && after(); } }, st === 'done' ? '✓' : '');
  const dp = db.schema.find(p => p.type === 'date'), sp = db.schema.find(p => p.type === 'select' && !isStatusProp(p));
  const o = sp ? optOf(sp, r.props[sp.id]) : null;
  return h('div', { class: 'tline' + (st ? ' st-' + st : '') }, cb,
    h('div', { class: 'grow', style: 'cursor:pointer', onclick: () => openRow(r.id) }, h('div', { class: 'wk-title', dir: 'auto' }, (r.icon ? r.icon + ' ' : '') + titleOf(r)),
      h('div', { class: 'cp' }, dp && r.props[dp.id] ? h('span', { class: 'muted', style: 'font-size:12px' }, fmtDate(r.props[dp.id])) : null, o ? pill(o) : null, showDb ? h('span', { class: 'pill' }, titleOf(db)) : null)),
    extra || null);
}
function lateView() {
  const wrap = h('div', { class: 'page' });
  const draw = () => {
    const items = lateItems();
    const groups = new Map(); for (const it of items) { if (!groups.has(it.db)) groups.set(it.db, []); groups.get(it.db).push(it); }
    wrap.replaceChildren(h('h1', { style: 'font-size:28px;margin:6px 0 4px' }, '⏰ المهام المتأخرة'),
      h('p', { class: 'muted', style: 'margin:0 0 14px' }, items.length ? 'كل المهام اللي فات موعدها من كل قوائمك. أشّر على اللي خلصته، أو أجّله لليوم.' : 'ما عندك ولا مهمة متأخرة 🎉'),
      ...[...groups.entries()].map(([db, list]) => h('div', { style: 'margin-bottom:18px' },
        h('div', { class: 's-label' }, h('span', {}, iconOf(db, 'db') + ' ' + titleOf(db)), h('span', {}, list.length)),
        h('div', { class: 'wk-list' }, list.map(({ r }) => taskLine(db, r, draw, {
          showDb: false, extra: h('button', { class: 'btn sm', onclick: e => { e.stopPropagation(); const dp = db.schema.find(p => p.type === 'date'); const old = r.props[dp.id] || {}; const t = ymd(new Date()); r.props[dp.id] = { start: t, end: old.end && old.end > t ? old.end : null }; touchPage(r); draw(); renderSide(); toast('تأجّلت لليوم'); } }, '↷ لليوم')
        }))))));
  };
  draw();
  return h('div', {}, topbar('المتأخرة', [h('span', { class: 'sync', id: 'syncind' })]), wrap);
}

/* ---------- صفحة «اليوم» ---------- */
function todayView() {
  const wrap = h('div', { class: 'page' });
  const draw = () => {
    const today = new Date(), soon = [];
    for (let k = 1; k <= 7; k++) { const d = new Date(today); d.setDate(d.getDate() + k); const kk = ymd(d);
      for (const db of S.dbs.values()) { if (db.autogen || !isTaskDb(db)) continue; const dp = db.schema.find(p => p.type === 'date'); if (!dp) continue;
        for (const r of dbRows(db.id)) { const v = r.props[dp.id]; if (v && v.start && v.start.slice(0, 10) === kk && rowState(db, r) !== 'done') soon.push({ db, r }); } } }
    const late = lateItems().length;
    wrap.replaceChildren(
      h('div', { class: 'row', style: 'flex-wrap:wrap;margin:6px 0 10px' }, h('h1', { class: 'grow', style: 'font-size:28px;margin:0' }, 'يومك'),
        h('button', { class: 'btn primary', onclick: () => quickTaskSheet() }, '＋ مهمة سريعة')),
      todayPanel(),
      soon.length ? h('div', { style: 'margin-top:14px' }, h('div', { class: 's-label' }, h('span', {}, 'القادم خلال أسبوع'), h('span', {}, soon.length)), h('div', { class: 'wk-list' }, soon.slice(0, 12).map(({ db, r }) => taskLine(db, r, draw)))) : null,
      late ? h('button', { class: 'btn ghost sm', style: 'margin-top:14px;color:var(--muted)', onclick: () => go('late') }, `عندك ${late} مهمة فات موعدها ← اعرضها`) : null);
  };
  draw();
  return h('div', {}, topbar('اليوم', [h('span', { class: 'sync', id: 'syncind' })]), wrap);
}

/* ---------- دليل «كيف أسوي…؟» ---------- */
function newPageWith(title, icon, content, cover) {
  const p = newPage({ title, icon }); p.content = content; if (cover) p.cover = cover; touchPage(p); return p;
}
function inlineDbBlock(parentPage, template, view) {
  const d = newDb({ template, parent_page_id: parentPage.id });
  if (view) { const v = d.views.find(x => x.type === view); if (v) { S.ui.view[d.id] = v.id; saveUi(); } }
  return { id: uid(), type: 'db', dbId: d.id, indent: 0 };
}
const HELP = [
  { t: 'أضيف مهمة بسرعة', i: '⚡', steps: ['اضغط «＋ مهمة سريعة» من الشريط الجانبي (أو من صفحة اليوم).', 'اكتب المهمة، واختر القائمة والموعد (اليوم / بكرة / تاريخ).', 'اضغط Enter وتقدر تكتب اللي بعدها مباشرة.', 'أو داخل أي جدول: اكتب في خانة «＋ اكتب مهمة جديدة» فوقه واضغط Enter.'], run: () => quickTaskSheet() },
  { t: 'أسوي قائمة مهام داخل صفحة', i: '✅', steps: ['افتح الصفحة.', 'اضغط «＋ إضافة كتلة» تحت المحتوى.', 'من قسم «قوائم وجداول داخل الصفحة» اختر «قائمة مهام».', 'تنضاف قائمة فيها: المهمة، منجز، الموعد، التصنيف — وفيها عرض «غير المنجز» و«تقويم».'], run: () => { const p = newPageWith('مهامي', '✅', []); p.content.push(inlineDbBlock(p, 'todo')); touchPage(p); openItem('page', p.id); } },
  { t: 'أسوي تقويم أو لوحة (Kanban)', i: '📅', steps: ['داخل صفحة: ＋ إضافة كتلة ← «تقويم» أو «لوحة».', 'أو داخل أي قائمة موجودة: اضغط «＋ عرض» فوقها واختر تقويم / لوحة.', 'في التقويم تقدر تبدّل بين «شهر» و«أسبوع»، وتأشّر على المهمة مباشرة.'], run: () => { const p = newPageWith('التقويم', '📅', []); p.content.push(inlineDbBlock(p, 'todo', 'calendar')); touchPage(p); openItem('page', p.id); } },
  { t: 'أقسم الصفحة لأعمدة (صورة جنب قائمة)', i: '◫', steps: ['＋ إضافة كتلة ← «عمودين» أو «ثلاثة أعمدة».', 'كل عمود فيه زر ＋ خاص فيه تضيف فيه أي شي: صورة، قائمة، مؤقت…', 'تقدر تسحب أي كتلة من المقبض ⠿ وتحطها في عمود ثاني.', 'من ⋯ على الأعمدة: إضافة عمود، أو تكبير العمود الأول.'], run: () => { const p = newPageWith('صفحة بعمودين', '◫', []); p.content.push({ id: uid(), type: 'columns', indent: 0, cols: [{ id: uid(), w: 1, blocks: [{ id: uid(), type: 'image', url: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=900', text: '', size: 'full', indent: 0 }] }, { id: uid(), w: 2, blocks: [inlineDbBlock(p, 'todo')] }] }); touchPage(p); openItem('page', p.id); } },
  { t: 'أضيف غلاف أو صورة (من بنترست)', i: '🖼', steps: ['الغلاف: افتح الصفحة واضغط «🖼 إضافة غلاف» فوق العنوان.', 'صورة داخل الصفحة: ＋ إضافة كتلة ← «صورة».', 'من بنترست: اضغط مطوّلاً على الصورة ← «نسخ عنوان الصورة» ← الصقه.', 'أو «📁 رفع من الجهاز» وتختار صورة من الآيباد.'] },
  { t: 'أغيّر صورة بطاقة في المعرض (الصفحة الرئيسية)', i: '🃏', steps: ['في المعرض اضغط مطوّلاً على البطاقة (أو كليك يمين).', 'اختر «🖼 تغيير صورة البطاقة».', 'الصق رابط أو ارفع صورة.'] },
  { t: 'جلسة مذاكرة: مؤقت + موسيقى', i: '🎯', steps: ['تنشئ لك صفحة فيها مؤقت تركيز (15/25/45/60 دقيقة).', 'تضيف تحت «موسيقى الخلفية» رابط يوتيوب أو سبوتيفاي: ＋ ← «يوتيوب / سبوتيفاي».', 'وجنبها قائمة المهام اللي بتشتغل عليها.'], run: () => { const p = focusPageTemplate(null); openItem('page', p.id); } },
  { t: 'خطة مذاكرة بالفصول والوقت', i: '📚', steps: ['لكل فصل: الوقت المقدّر، والوقت المنقضي، ومنجز، وللمراجعة.', 'عرض «حسب المادة» يوريك كم خلصت وكم باقي ساعة لكل مادة.', 'عرض «قائمة المراجعة» يجمع الفصول اللي أشّرت عليها للمراجعة.'], run: () => { const d = newDb({ template: 'study' }); openItem('db', d.id); } },
  { t: 'جدول أسبوعي متكرر (دوام / تمارين)', i: '🗓', steps: ['تنشئ جدول أسبوعي، وتضيف «＋ فترة».', 'تختار الأيام (أحد–خميس مثلاً) والوقت، وتتكرر كل أسبوع لحالها.', 'تأشّر على كل يوم بيومه، واللي فات بدون إنجاز ينصبغ أحمر.'], run: () => { const d = newDb({ template: 'timetable' }); openItem('db', d.id); } },
  { t: 'العادات اليومية (تتولد كل يوم)', i: '💪', steps: ['Habit Database تتولد فيها عاداتك تلقائياً كل يوم حسب أيامك المعتادة.', 'عرض «اليوم» فيه: Pending / Done / Missed — اسحب البطاقة أو اضغط ✓ أو ✗.', 'ما تحتاج تسوي شي، بس افتح التطبيق.'] },
  { t: 'أرتب من الأقدم أو الأحدث، وأفلتر', i: '⇅', steps: ['فوق أي قائمة: «⇅ ترتيب» ← «الأحدث أولاً» أو «الأقدم أولاً».', '«⚲ فلتر» ← اختر الخاصية (مثلاً منجز = غير مفعّل، أو التاريخ = اليوم).', 'لو تبي تحفظه كعرض دائم: «＋ عرض» ثم حط الفلتر فيه.'] },
  { t: 'أشوف المتأخرة', i: '⏰', steps: ['من الشريط الجانبي «⏰ المتأخرة».', 'كل اللي فات موعده من كل القوائم، تأشّر عليه أو تأجّله لليوم بضغطة.'], run: () => go('late') },
  { t: 'أرتب صفحاتي وأنقلها', i: '⠿', steps: ['اسحب من المقبض ⠿ بجانب أي صفحة في الشريط الجانبي.', 'ضغطة مطوّلة (أو كليك يمين) على أي شي = قائمة خياراته: نقل، تكرار، أيقونة، حذف.', 'تقدر تخلّي أي صفحة «صفحة البداية» من نفس القائمة.'] },
  { t: 'أحدّث بياناتي من نوشن', i: '📥', steps: ['⚙ الإعدادات ← «تحديث من نوشن».', 'اختر الملفين pages.json و databases.json من E:\\NotionClone\\01_Notion_Export\\export.', 'يستبدل نسخة نوشن القديمة بالجديدة (ما يكرر).'], run: () => openSettings() }
];
function helpView() {
  return h('div', {}, topbar('كيف أسوي…؟', [h('span', { class: 'sync', id: 'syncind' })]), h('div', { class: 'page' },
    h('h1', { style: 'font-size:28px;margin:6px 0 4px' }, '❓ كيف أسوي…؟'),
    h('p', { class: 'muted', style: 'margin:0 0 14px' }, 'اختر اللي تبيه. كل واحد فيه الخطوات، وأغلبها فيه زر «سوّها لي» يجهّزه لك على طول.'),
    h('div', { class: 'helpgrid' }, HELP.map(x => h('details', { class: 'help' },
      h('summary', {}, h('span', { class: 'hi' }, x.i), h('span', { class: 'grow' }, x.t)),
      h('ol', {}, x.steps.map(s => h('li', {}, s))),
      x.run ? h('button', { class: 'btn primary sm', onclick: () => x.run() }, '✨ سوّها لي') : null)))));
}

/* ---------- تنبيه: نسخة نوشن قديمة ---------- */
function staleImportBanner() {
  const notion = [...S.pages.values()].filter(p => p.notion_id);
  if (!notion.length) return null;
  const hasLayout = notion.some(p => (p.content || []).some(b => b.type === 'db' || b.type === 'columns'));
  const hasLesson = [...S.dbs.values()].some(d => /^lesson plans$/i.test((d.title || '').trim()));
  if (hasLayout && !hasLesson) return null;
  return h('div', { class: 'banner' }, h('span', { class: 'grow' }, '📥 بياناتك من نوشن مستوردة بنسخة قديمة (بدون الأغلفة والأعمدة والقوائم داخل الصفحات). حدّثها مرة وحدة:'),
    h('button', { class: 'btn primary sm', onclick: pickImportFiles }, 'تحديث من نوشن'));
}
function pickImportFiles() {
  const imp = h('input', { type: 'file', accept: '.json,application/json', multiple: true, hidden: true });
  imp.addEventListener('change', async () => { if (imp.files.length) await importFiles([...imp.files]); imp.remove(); });
  document.body.append(imp); imp.click();
}

function todoViewsFn(schema) {
  const cb = schema.find(x => x.type === 'checkbox'), dt = schema.find(x => x.type === 'date'), sp = schema.find(x => x.type === 'select');
  return [{ id: uid(), name: 'الكل', type: 'table', filters: [], sort: null }, { id: uid(), name: 'غير المنجز', type: 'table', filters: [{ prop: cb.id, op: 'is', value: false }], sort: { prop: dt.id, dir: 'asc' } },
    { id: uid(), name: 'تقويم', type: 'calendar', dateProp: dt.id, filters: [], sort: null }, { id: uid(), name: 'حسب التصنيف', type: 'table', group: sp.id, filters: [], sort: null }];
}
