'use strict';
/* دفتر — محرر الكتل: نصوص + صور + أعمدة + تضمين (يوتيوب/سبوتيفاي) + مؤقت + قاعدة بيانات مضمّنة */

const EXTRA_BLOCKS = [
  { k: 'image', label: 'صورة', icon: '🖼' }, { k: 'columns2', label: 'عمودين', icon: '◫' }, { k: 'columns3', label: 'ثلاثة أعمدة', icon: '▥' },
  { k: 'embed', label: 'يوتيوب / سبوتيفاي', icon: '▶' }, { k: 'timer', label: 'مؤقت تركيز', icon: '⏱' }, { k: 'db', label: 'قاعدة بيانات', icon: '🗃' }
];

/* ---------- صور: رابط أو رفع من الجهاز (تصغير تلقائي) ---------- */
function downscale(file, maxW, q = 0.78) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxW / img.width), c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('تعذّر قراءة الصورة')); };
    img.src = url;
  });
}
function imageSheet({ title = 'صورة', current = '', maxW = 1100, onPick, onRemove, extra }) {
  openSheet({
    title, body: api => {
      const url = h('input', { dir: 'ltr', placeholder: 'الصق رابط الصورة (بنترست، Unsplash…)', value: current && !String(current).startsWith('data:') && !String(current).startsWith('g:') ? current : '' });
      const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
      file.addEventListener('change', async () => { if (!file.files[0]) return; try { const d = await downscale(file.files[0], maxW); onPick(d); api.close(); } catch (e) { toast(e.message); } });
      return h('div', {}, h('div', { class: 'field' }, h('label', {}, 'رابط الصورة'), url),
        h('div', { class: 'muted', style: 'font-size:13px;margin:-6px 0 10px' }, 'من بنترست: اضغط مطوّلاً على الصورة ← «نسخ عنوان الصورة»، ثم الصقه هنا.'),
        h('div', { class: 'row' }, h('button', { class: 'btn primary grow', onclick: () => { const v = url.value.trim(); if (!/^https?:\/\//i.test(v)) { toast('الرابط لازم يبدأ بـ https://'); return; } onPick(v); api.close(); } }, 'استخدام الرابط'),
          h('button', { class: 'btn grow', onclick: () => file.click() }, '📁 رفع من الجهاز')), file,
        extra ? extra(api) : null,
        onRemove ? h('button', { class: 'act danger', style: 'margin-top:8px', onclick: () => { onRemove(); api.close(); } }, h('span', { class: 'ai' }, '🗑'), h('span', {}, 'إزالة')) : null);
    }
  });
}
const COVER_GRADS = ['linear-gradient(135deg,#1e3c72,#2a5298)', 'linear-gradient(135deg,#42275a,#734b6d)', 'linear-gradient(135deg,#134e5e,#71b280)', 'linear-gradient(135deg,#7b4397,#dc2430)', 'linear-gradient(135deg,#0f2027,#2c5364)', 'linear-gradient(135deg,#232526,#414345)', 'linear-gradient(135deg,#e65c00,#f9d423)', 'linear-gradient(135deg,#3a1c71,#d76d77,#ffaf7b)'];
function coverStyle(c) { if (!c) return ''; if (String(c).startsWith('g:')) return `background:${c.slice(2)}`; return `background-image:url("${String(c).replace(/"/g, '%22')}")`; }
function coverSheet(page, after) {
  imageSheet({
    title: 'غلاف الصفحة', current: page.cover, maxW: 1600,
    onPick: v => { page.cover = v; touchPage(page); after && after(); }, onRemove: page.cover ? () => { page.cover = null; touchPage(page); after && after(); } : null,
    extra: api => h('div', { style: 'margin-top:14px' }, h('div', { class: 'muted', style: 'font-size:13px;margin-bottom:6px' }, 'أو اختر ألوان جاهزة'),
      h('div', { class: 'row', style: 'flex-wrap:wrap;gap:8px' }, COVER_GRADS.map(g => h('button', { 'aria-label': 'لون', style: `width:64px;height:40px;border-radius:10px;border:1px solid var(--line);background:${g}`, onclick: () => { page.cover = 'g:' + g; touchPage(page); after && after(); api.close(); } }))))
  });
}

/* ---------- تضمين ---------- */
function embedInfo(u) {
  try {
    const x = new URL(u), host = x.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return { src: 'https://www.youtube.com/embed/' + x.pathname.slice(1), ratio: '16/9' };
    if (host.endsWith('youtube.com')) {
      if (x.pathname.startsWith('/embed/')) return { src: u, ratio: '16/9' };
      const v = x.searchParams.get('v'), list = x.searchParams.get('list');
      if (v) return { src: 'https://www.youtube.com/embed/' + v + (list ? '?list=' + list : ''), ratio: '16/9' };
      if (x.pathname.startsWith('/shorts/')) return { src: 'https://www.youtube.com/embed/' + x.pathname.split('/')[2], ratio: '9/16', narrow: true };
      if (list) return { src: 'https://www.youtube.com/embed/videoseries?list=' + list, ratio: '16/9' };
    }
    if (host === 'open.spotify.com') { const path = x.pathname.replace(/^\/intl-[a-z-]+/, ''); return { src: 'https://open.spotify.com/embed' + path, height: /^\/(track|episode)/.test(path) ? 152 : 352 }; }
    if (host === 'soundcloud.com') return { src: 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(u), height: 166 };
  } catch (e) {}
  return null;
}

/* ---------- مؤقت تركيز ---------- */
const TIMERS = {};
function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(); [0, 0.3, 0.6].forEach(t => { const o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.value = 0.2; o.start(a.currentTime + t); o.stop(a.currentTime + t + 0.18); }); } catch (e) {} if (navigator.vibrate) navigator.vibrate([200, 100, 200]); }
function timerEl(b, save) {
  const st = TIMERS[b.id] = TIMERS[b.id] || { left: (b.minutes || 25) * 60, running: false, end: 0 };
  const disp = h('div', { class: 'tm-t' }), btn = h('button', { class: 'btn primary' }), reset = h('button', { class: 'btn', onclick: () => { st.running = false; st.left = (b.minutes || 25) * 60; paint(); } }, '↺');
  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  function paint() { disp.textContent = fmt(Math.max(0, Math.ceil(st.left))); btn.textContent = st.running ? '⏸ إيقاف' : '▶ ابدأ'; }
  btn.addEventListener('click', () => { if (st.running) { st.left = Math.max(0, (st.end - Date.now()) / 1000); st.running = false; } else { if (st.left <= 0) st.left = (b.minutes || 25) * 60; st.end = Date.now() + st.left * 1000; st.running = true; } paint(); });
  const mins = [15, 25, 45, 60].map(m => h('button', { class: 'chip', onclick: () => { b.minutes = m; save(); st.running = false; st.left = m * 60; paint(); } }, m + ' د'));
  const iv = setInterval(() => {
    if (!document.body.contains(disp)) { clearInterval(iv); return; }
    if (st.running) { const left = (st.end - Date.now()) / 1000; if (left <= 0) { st.running = false; st.left = 0; paint(); beep(); toast('⏱ انتهى الوقت!'); } else { st.left = left; disp.textContent = fmt(Math.ceil(left)); } }
  }, 500);
  paint();
  return h('div', { class: 'timer' }, h('div', { class: 'muted', style: 'font-size:13px' }, 'مؤقت تركيز'), disp, h('div', { class: 'row', style: 'justify-content:center;flex-wrap:wrap' }, btn, reset, ...mins));
}

/* ---------- الكتل المعقّدة ---------- */
function embeddedDbIds(page) {
  const ids = new Set(); const walk = arr => { for (const b of arr || []) { if (b.type === 'db' && b.dbId) ids.add(b.dbId); if (b.type === 'columns') (b.cols || []).forEach(c => walk(c.blocks)); } };
  walk(page && page.content); return ids;
}

/* ---------- المحرر ---------- */
function blocksEditor(page, arr, nested, redrawTop) {
  if (!arr) { page.content = page.content || []; arr = page.content; }
  const root = h('div', { class: 'blocks' });
  const list = h('div', { class: 'blist', 'data-nested': nested ? '1' : '0' });
  list._arr = arr;
  const save = () => touchPage(page);
  const idx = b => arr.indexOf(b);
  const top = () => (redrawTop ? redrawTop() : draw(null));

  function olNumber(i) {
    const b = arr[i]; let n = 1;
    for (let j = i - 1; j >= 0; j--) { const x = arr[j]; if ((x.indent || 0) < (b.indent || 0)) break; if ((x.indent || 0) === (b.indent || 0)) { if (x.type === 'ol') n++; else break; } }
    return n;
  }
  function draw(focusId, off = 0) {
    list.replaceChildren(...arr.map((b, i) => blockEl(b, i)));
    if (focusId) { const el = list.querySelector(`[data-bid="${focusId}"] .tx`); if (el) setCaret(el, off); }
  }
  function insertAfter(b, nb) { arr.splice(idx(b) + 1, 0, nb); }
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
      const prev = arr[i - 1];
      if (!('text' in prev) || prev.type === 'divider') { arr.splice(i - 1, 1); save(); draw(b.id, 0); return true; }
      const len = prev.text.length; prev.text += b.text; arr.splice(i, 1); save(); draw(prev.id, len); return true;
    }
    if (!b.text && arr.length > 1) { arr.splice(i, 1); save(); draw(arr[0].id, 0); return true; }
    return false;
  }
  const SHORT = { '# ': 'h1', '## ': 'h2', '### ': 'h3', '- ': 'ul', '* ': 'ul', '1. ': 'ol', '[] ': 'todo', '> ': 'quote' };

  function richEl(b) {
    if (b.type === 'divider') return h('div', { class: 'hr' });
    if (b.type === 'image') {
      const fig = h('figure', { class: 'imgblk ' + (b.size || 'full'), onclick: () => imageBlockMenu(b) });
      if (b.url) {
        const img = h('img', { src: b.url, alt: b.text || '', loading: 'lazy', referrerpolicy: 'no-referrer' });
        img.addEventListener('error', () => { fig.replaceChildren(h('div', { class: 'imgerr' }, '🖼 تعذّر تحميل الصورة', h('div', { class: 'muted', style: 'font-size:12px' }, b.expiring ? 'رابط الصورة من نوشن انتهت صلاحيته — اضغط واختر رابط جديد' : 'اضغط لتغيير الرابط'))); });
        fig.append(img);
      } else fig.append(h('div', { class: 'imgerr' }, '🖼 اضغط لإضافة صورة'));
      if (b.text) fig.append(h('figcaption', { dir: 'auto' }, b.text));
      return fig;
    }
    if (b.type === 'columns') {
      const grid = h('div', { class: 'cols' });
      const handle = columnResizer(grid, b, save);
      (b.cols || []).forEach((c, k) => {
        if (k > 0) grid.append(handle(k - 1));
        if (!c.blocks.length) c.blocks.push({ id: uid(), type: 'p', text: '', indent: 0 });
        grid.append(h('div', { class: 'col-in' }, blocksEditor(page, c.blocks, true, top)));
      });
      return grid;
    }
    if (b.type === 'embed') {
      const info = embedInfo(b.url || '');
      if (!info) return h('a', { class: 'linkcard', href: b.url || '#', target: '_blank', rel: 'noopener noreferrer' }, '🔗 ' + (b.url || 'رابط'));
      const f = h('iframe', { src: info.src, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true, loading: 'lazy', referrerpolicy: 'strict-origin-when-cross-origin', style: info.height ? `height:${info.height}px` : `aspect-ratio:${info.ratio || '16/9'}${info.narrow ? ';max-width:320px' : ''}` });
      return h('div', { class: 'embed' }, f);
    }
    if (b.type === 'timer') return timerEl(b, save);
    if (b.type === 'db') {
      const d = S.dbs.get(b.dbId);
      return d ? dbEmbed(d, b.view) : h('div', { class: 'imgerr' }, 'قاعدة البيانات محذوفة');
    }
    return null;
  }

  function blockEl(b, i) {
    const el = h('div', { class: 'blk ' + b.type + (b.type === 'todo' && b.checked ? ' done' : ''), 'data-bid': b.id, 'data-type': b.type, style: b.indent ? `margin-inline-start:${b.indent * 24}px` : '' });
    el.append(h('span', { class: 'grip', title: 'اسحب للترتيب' }, '⠿'));
    const rich = richEl(b);
    if (rich) el.append(h('div', { class: 'rich' }, rich));
    else {
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
        else if (e.inputType === 'deleteContentBackward') { const sel = getSelection(); if (sel.isCollapsed && caretOffset(tx) === 0) { if (backspaceAtStart(b)) e.preventDefault(); } }
      });
      tx.addEventListener('keydown', e => {
        shiftEnter = e.key === 'Enter' && e.shiftKey;
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); splitBlock(b, caretOffset(tx)); }
        else if (e.key === 'Tab') { e.preventDefault(); b.indent = Math.max(0, Math.min(6, (b.indent || 0) + (e.shiftKey ? -1 : 1))); save(); draw(b.id, caretOffset(tx)); }
        else if (e.key === 'ArrowUp' && caretOffset(tx) === 0 && i > 0) { const p = list.children[i - 1].querySelector('.tx'); if (p) { e.preventDefault(); setCaret(p, p.textContent.length); } }
        else if (e.key === 'ArrowDown' && caretOffset(tx) >= tx.textContent.length && i < arr.length - 1) { const n = list.children[i + 1].querySelector('.tx'); if (n) { e.preventDefault(); setCaret(n, 0); } }
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
    el.append(h('button', { class: 'more', 'aria-label': 'خيارات الكتلة', onclick: () => blockMenu(b) }, '⋯'));
    longPress(el.querySelector('.grip'), () => blockMenu(b));
    return el;
  }

  function imageBlockMenu(b) {
    openSheet({
      title: 'الصورة', body: api => h('div', {},
        h('button', { class: 'act', onclick: () => { api.close(); imageSheet({ title: 'تغيير الصورة', current: b.url, onPick: v => { b.url = v; b.expiring = false; save(); top(); } }); } }, h('span', { class: 'ai' }, '🔄'), h('span', {}, 'تغيير الصورة')),
        h('div', { class: 'row', style: 'padding:6px 10px;flex-wrap:wrap;gap:6px' }, [['full', 'كاملة'], ['half', 'نصف'], ['small', 'صغيرة']].map(([k, l]) => h('button', { class: 'chip' + ((b.size || 'full') === k ? '' : ''), style: (b.size || 'full') === k ? 'outline:2px solid var(--accent)' : '', onclick: () => { b.size = k; save(); api.close(); top(); } }, l))),
        h('button', { class: 'act', onclick: async () => { api.close(); const v = await promptSheet('وصف الصورة (اختياري)', b.text || ''); if (v != null) { b.text = v; save(); top(); } } }, h('span', { class: 'ai' }, '✏️'), h('span', {}, 'وصف تحت الصورة')),
        h('button', { class: 'act', onclick: () => { api.close(); blockMenu(b); } }, h('span', { class: 'ai' }, '⋯'), h('span', {}, 'خيارات الكتلة')))
    });
  }
  function blockMenu(b) {
    const i = idx(b), isText = 'text' in b && !['image', 'columns', 'embed', 'timer', 'db'].includes(b.type);
    openSheet({
      title: isText ? 'تحويل هذا السطر إلى…' : 'خيارات', body: api => h('div', {},
        isText ? h('div', { class: 'grid', style: 'margin-bottom:8px' }, Object.entries(BLOCK_TYPES).filter(([k]) => k !== 'divider').map(([k, v]) =>
          h('button', { class: 'gbtn', style: b.type === k ? 'border-color:var(--accent)' : '', onclick: () => { b.type = k; if (k === 'todo' && b.checked == null) b.checked = false; save(); api.close(); draw(b.id, (b.text || '').length); } }, h('b', {}, v.icon), v.label))) : null,
        b.type === 'columns' ? h('button', { class: 'act', onclick: () => { api.close(); if ((b.cols || []).length < 4) { b.cols.push({ id: uid(), w: 1, blocks: [{ id: uid(), type: 'p', text: '', indent: 0 }] }); save(); top(); } } }, h('span', { class: 'ai' }, '＋'), h('span', {}, 'إضافة عمود')) : null,
        b.type === 'columns' && (b.cols || []).length > 1 ? h('button', { class: 'act', onclick: () => { api.close(); b.cols.pop(); save(); top(); } }, h('span', { class: 'ai' }, '−'), h('span', {}, 'حذف آخر عمود')) : null,
        b.type === 'columns' ? h('div', { class: 'row', style: 'padding:6px 10px;flex-wrap:wrap;gap:6px' }, [['متساوية', null], ['الأول أكبر', [2, 1, 1, 1]], ['الأخير أكبر', 'last']].map(([l, w]) => h('button', { class: 'chip', onclick: () => { b.cols.forEach((c, k) => { c.w = w === null ? 1 : w === 'last' ? (k === b.cols.length - 1 ? 2 : 1) : (w[k] || 1); }); save(); api.close(); top(); } }, 'عرض: ' + l))) : null,
        b.type === 'embed' ? h('button', { class: 'act', onclick: async () => { api.close(); const v = await promptSheet('رابط يوتيوب أو سبوتيفاي', b.url || '', { placeholder: 'https://' }); if (v) { b.url = v.trim(); save(); top(); } } }, h('span', { class: 'ai' }, '🔗'), h('span', {}, 'تغيير الرابط')) : null,
        h('button', { class: 'act', onclick: () => { api.close(); const nb = { id: uid(), type: 'p', text: '', indent: b.indent || 0 }; insertAfter(b, nb); save(); draw(nb.id, 0); } }, h('span', { class: 'ai' }, '＋'), h('span', {}, 'إضافة سطر تحتها')),
        b.type !== 'columns' ? h('button', { class: 'act', onclick: () => { api.close(); const nb = JSON.parse(JSON.stringify(b)); nb.id = uid(); insertAfter(b, nb); save(); draw(nb.id, 0); } }, h('span', { class: 'ai' }, '⧉'), h('span', {}, 'تكرار')) : null,
        isText ? h('button', { class: 'act', onclick: () => { api.close(); b.indent = Math.min(6, (b.indent || 0) + 1); save(); draw(b.id, (b.text || '').length); } }, h('span', { class: 'ai' }, '⇥'), h('span', {}, 'إزاحة للداخل')) : null,
        isText && (b.indent || 0) > 0 ? h('button', { class: 'act', onclick: () => { api.close(); b.indent--; save(); draw(b.id, (b.text || '').length); } }, h('span', { class: 'ai' }, '⇤'), h('span', {}, 'إزاحة للخارج')) : null,
        h('button', { class: 'act danger', onclick: () => { api.close(); arr.splice(i, 1); save(); if (!arr.length && nested) arr.push({ id: uid(), type: 'p', text: '', indent: 0 }); (nested || ['columns', 'db'].includes(b.type)) ? top() : draw(null); } }, h('span', { class: 'ai' }, '🗑'), h('span', {}, 'حذف')))
    });
  }
  function addBlock(nb) { arr.push(nb); save(); nested ? top() : draw(nb.id, 0); }
  function addMenu() {
    const T = (k, ic, l, desc, fn) => h('button', { class: 'gbtn desc', onclick: () => { api0.close(); fn(); } }, h('b', {}, ic), h('span', {}, l), h('small', {}, desc));
    let api0;
    const text = k => () => { const nb = { id: uid(), type: k, text: '', indent: 0 }; if (k === 'todo') nb.checked = false; addBlock(nb); };
    const dbIn = (tpl, view) => () => { addBlock(inlineDbBlock(page, tpl, view)); };
    api0 = openSheet({
      title: 'وش تبي تضيف؟', body: () => h('div', {},
        h('div', { class: 's-label' }, 'كتابة'),
        h('div', { class: 'grid' },
          T('p', '¶', 'نص', 'كتابة عادية', text('p')), T('h1', 'H1', 'عنوان كبير', 'عنوان قسم', text('h1')), T('h2', 'H2', 'عنوان', 'عنوان فرعي', text('h2')),
          T('todo', '☑', 'سطر مهمة', 'مربع صح بسيط داخل النص', text('todo')), T('ul', '•', 'نقاط', 'قائمة نقطية', text('ul')), T('ol', '1.', 'ترقيم', 'قائمة مرقّمة', text('ol')),
          T('quote', '❝', 'اقتباس', 'نص بارز بخط جانبي', text('quote')), T('divider', '—', 'فاصل', 'خط يفصل الأقسام', text('divider'))),
        h('div', { class: 's-label' }, 'قوائم وجداول داخل الصفحة'),
        h('div', { class: 'grid' },
          T('todo-db', '✅', 'قائمة مهام', 'جدول: المهمة، منجز، الموعد، التصنيف', dbIn('todo')),
          T('cal-db', '📅', 'تقويم', 'مهام على تقويم شهري/أسبوعي', dbIn('todo', 'calendar')),
          T('board-db', '▥', 'لوحة Kanban', 'أعمدة: لم يبدأ / قيد التنفيذ / منجز', dbIn('tasks', 'board')),
          T('study-db', '📚', 'خطة مذاكرة', 'فصول + وقت مقدّر ومنقضي + مراجعة', dbIn('study')),
          T('week-db', '🗓', 'جدول أسبوعي', 'دوام/مذاكرة/تمارين تتكرر كل أسبوع', dbIn('timetable')),
          T('table-db', '▦', 'جدول فارغ', 'تصمم أعمدته بنفسك', dbIn('empty')),
          T('exist-db', '🔗', 'قائمة موجودة', 'تعرض قائمة عندك أصلاً هنا', () => dbPicker(d => addBlock({ id: uid(), type: 'db', dbId: d.id, indent: 0 })))),
        h('div', { class: 's-label' }, 'تخطيط ووسائط'),
        h('div', { class: 'grid' },
          T('image', '🖼', 'صورة', 'رابط (بنترست…) أو من جهازك', () => imageSheet({ title: 'إضافة صورة', onPick: v => addBlock({ id: uid(), type: 'image', url: v, text: '', size: 'full', indent: 0 }) })),
          nested ? null : T('c2', '◫', 'عمودين', 'تقسم الصفحة يمين ويسار', () => addBlock({ id: uid(), type: 'columns', indent: 0, cols: [0, 1].map(() => ({ id: uid(), w: 1, blocks: [{ id: uid(), type: 'p', text: '', indent: 0 }] })) })),
          nested ? null : T('c3', '▥', 'ثلاثة أعمدة', 'ثلاث مساحات جنب بعض', () => addBlock({ id: uid(), type: 'columns', indent: 0, cols: [0, 1, 2].map(() => ({ id: uid(), w: 1, blocks: [{ id: uid(), type: 'p', text: '', indent: 0 }] })) })),
          T('embed', '▶', 'يوتيوب / سبوتيفاي', 'فيديو أو أغنية تشتغل داخل الصفحة', () => promptSheet('الصق رابط يوتيوب أو سبوتيفاي', '', { placeholder: 'https://', ok: 'إضافة' }).then(v => { if (v && v.trim()) addBlock({ id: uid(), type: 'embed', url: v.trim(), indent: 0 }); })),
          T('timer', '⏱', 'مؤقت تركيز', '15 / 25 / 45 / 60 دقيقة', () => addBlock({ id: uid(), type: 'timer', minutes: 25, indent: 0 }))),
        h('button', { class: 'btn ghost sm', style: 'margin-top:12px', onclick: () => { api0.close(); go('help'); } }, '❓ ما عرفت؟ افتح دليل «كيف أسوي…؟»'))
    });
  }
  Sortable.create(list, {
    group: 'blocks', handle: '.grip', animation: 150, ghostClass: 'sortable-ghost', draggable: '.blk', forceFallback: false, fallbackOnBody: true, swapThreshold: .6,
    onMove: e => !(e.dragged.dataset.type === 'columns' && e.to.dataset.nested === '1'),
    onEnd: e => { const from = e.from._arr, to = e.to._arr; if (!from || !to) return; const [m] = from.splice(e.oldIndex, 1); if (!to.length && false) return; to.splice(e.newIndex, 0, m); save(); setTimeout(top, 0); }
  });
  const tail = h('div', {
    style: nested ? 'min-height:30px;cursor:text' : 'min-height:90px;cursor:text', onclick: () => {
      const last = arr[arr.length - 1];
      if (!last || !('text' in last) || last.type === 'divider' || last.text) { const nb = { id: uid(), type: 'p', text: '', indent: 0 }; arr.push(nb); save(); nested ? top() : draw(nb.id, 0); }
      else { const el = list.querySelector(`[data-bid="${last.id}"] .tx`); if (el) setCaret(el, el.textContent.length); }
    }
  });
  root.append(list, h('div', { class: 'addblk' }, h('button', { class: 'btn sm ghost', onclick: addMenu }, nested ? '＋' : '＋ إضافة كتلة')), tail);
  draw(null);
  if (!nested) root._redraw = () => draw(null);
  return root;
}
function dbPicker(onPick) {
  const dbs = [...S.dbs.values()].sort(sortItems);
  openSheet({ title: 'اختر قاعدة بيانات', body: api => h('div', {}, dbs.length ? dbs.map(d => h('button', { class: 'act', onclick: () => { api.close(); onPick(d); } }, h('span', { class: 'ai' }, iconOf(d, 'db')), h('span', {}, titleOf(d)))) : h('div', { class: 'muted', style: 'padding:10px' }, 'ما عندك قواعد بيانات بعد.')) });
}
