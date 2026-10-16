'use strict';
/* تحويل تصدير نوشن (pages.json + databases.json من سكربت السحب) إلى هيكل «دفتر» */
const SKIP_DB_TITLES = [/^lesson plans$/i]; // قالب نوشن الجاهز، مو من بيانات المستخدم
const NOTION_ICON_MAP = { wall: '🧱', 'exclamation-mark': '❗', star: '⭐', home: '🏠', checkmark: '✅', calendar: '📅', book: '📖', fire: '🔥', heart: '❤️', target: '🎯', rocket: '🚀', clock: '🕒' };
const ymdLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function convertNotion(P, D, userId, existing, opts = {}) {
  const idMap = new Map();
  const nid = n => {
    if (existing && existing.has(n)) return existing.get(n);
    if (!idMap.has(n)) idMap.set(n, uid());
    return idMap.get(n);
  };
  const isNew = n => opts.overwrite || !(existing && existing.has(n));
  const rt = a => (a || []).map(t => t.plain_text || '').join('');
  const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
  const col = c => (COLORS.includes(c) ? c : 'gray');
  const iconOf = ic => !ic ? null : ic.type === 'emoji' ? ic.emoji : (ic.type === 'icon' && ic.icon ? (NOTION_ICON_MAP[ic.icon.name] || null) : null);
  const coverOf = c => !c ? null : (c.type === 'external' ? c.external.url : (c.file ? c.file.url : null));

  // قواعد مستبعدة (وكل صفوفها)
  const skipDb = new Set(Object.values(D).filter(d => SKIP_DB_TITLES.some(re => re.test((d.title || '').trim()))).map(d => d.id));
  const skipPages = new Set();
  for (const id of skipDb) for (const r of D[id].rows || []) skipPages.add(r);

  // أي كتلة -> أي صفحة تحتويها
  const blockToPage = new Map();
  const walk = (pid, bs) => { for (const b of bs || []) { blockToPage.set(b.id, pid); walk(pid, b.children); } };
  for (const p of Object.values(P)) walk(p.id, p.blocks);
  const pageOf = par => {
    if (!par) return null;
    if (par.type === 'page_id') return P[par.page_id] ? par.page_id : null;
    if (par.type === 'block_id') return P[par.block_id] ? par.block_id : (blockToPage.get(par.block_id) || null);
    return null;
  };
  const order = new Map();
  for (const p of Object.values(P)) {
    let i = 0; const go = bs => { for (const b of bs || []) { if (b.type === 'child_page' || b.type === 'child_database') order.set(b.id, i++); go(b.children); } };
    go(p.blocks);
  }

  /* ---- قواعد البيانات ---- */
  const dbOut = [], dbInfo = {};
  const rel = (name, t) => ({ prop: name, op: t });
  for (const d of Object.values(D)) {
    if (skipDb.has(d.id)) continue;
    const schema = [], byName = {};
    for (const [name, pr] of Object.entries(d.properties || {})) {
      const t = pr.type;
      if (t === 'title') { const sp = { id: 'title', name: name.trim() || 'الاسم', type: 'title' }; schema.unshift(sp); byName[name] = sp; continue; }
      let type = null, options;
      if (t === 'rich_text') type = 'text';
      else if (['number', 'date', 'checkbox', 'url'].includes(t)) type = t;
      else if (['select', 'multi_select', 'status'].includes(t)) {
        type = t; options = (pr[t].options || []).map(o => ({ id: o.id || o.name, name: o.name, color: col(o.color) }));
      } else if (t === 'created_time') type = 'created';
      if (!type) continue;
      const sp = { id: 'p_' + (pr.id || name).replace(/[^\w]/g, ''), name: name || (type === 'checkbox' ? 'منجز' : 'خاصية'), type };
      if (options) sp.options = options;
      schema.push(sp); byName[name] = sp;
    }
    if (!schema.find(s => s.id === 'title')) schema.unshift({ id: 'title', name: 'الاسم', type: 'title' });
    dbInfo[d.id] = { schema, byName };
    const rows = (d.rows || []).map(r => P[r]).filter(Boolean);
    const dt = schema.find(s => s.type === 'date'), cbp = schema.find(s => s.type === 'checkbox');
    const statusP = schema.find(s => s.type === 'status') || schema.find(s => s.type === 'select' && /status|حالة/i.test(s.name));
    const subjP = schema.find(s => s.type === 'select' && s !== statusP);
    const V = (name, type, extra) => Object.assign({ id: uid(), name, type, filters: [], sort: null }, extra || {});
    const T = (d.title || '').trim();
    let views = [], autogen = null;
    if (/habit/i.test(T) && statusP && dt) {
      // عروضه في نوشن: All / Today / Yesterday / List / Calendar
      views = [V('الكل', 'table', { sort: { prop: dt.id, dir: 'desc' } }),
        V('اليوم', 'board', { groupBy: statusP.id, filters: [{ prop: dt.id, op: 'today' }] }),
        V('أمس', 'board', { groupBy: statusP.id, filters: [{ prop: dt.id, op: 'yesterday' }] }),
        V('قائمة', 'list', { sort: { prop: dt.id, dir: 'desc' } }), V('تقويم', 'calendar', { dateProp: dt.id })];
      views.find(v => v.name === 'اليوم').default = true;
      // استنتاج قواعد التكرار اليومي من آخر 5 أسابيع من بياناته
      const dates = rows.map(r => ((r.properties[Object.keys(d.properties).find(k => d.properties[k].type === 'date')] || {}).date || {}).start).filter(Boolean).sort();
      if (dates.length) {
        const last = dates[dates.length - 1].slice(0, 10), lastD = new Date(last + 'T00:00:00'), from = new Date(lastD); from.setDate(from.getDate() - 34);
        const cnt = {}, icons = {};
        const dn = Object.keys(d.properties).find(k => d.properties[k].type === 'date'), tn = Object.keys(d.properties).find(k => d.properties[k].type === 'title');
        for (const r of rows) {
          const ds = ((r.properties[dn] || {}).date || {}).start; if (!ds) continue; const dd = new Date(ds.slice(0, 10) + 'T00:00:00'); if (dd < from) continue;
          const base = rt((r.properties[tn] || {}).title).replace(/\s*\(\d+\)\s*$/, '').trim(); if (!base) continue;
          (cnt[base] = cnt[base] || [0, 0, 0, 0, 0, 0, 0])[dd.getDay()]++; icons[base] = iconOf(r.icon) || icons[base];
        }
        const rules = Object.entries(cnt).map(([title, c]) => ({ title, icon: icons[title] || null, days: c.map((n, i) => n >= 2 ? i : -1).filter(i => i >= 0) })).filter(r => r.days.length);
        const pend = (statusP.options || []).find(o => /pending|لم|قيد/i.test(o.name)) || statusP.options[0];
        autogen = { rules, last, dateProp: dt.id, statusProp: statusP.id, pending: pend && pend.id };
      }
    } else if (cbp && subjP && dt) {
      // To Do List: ALL / UNCOMPLETE / UNSCHEDULED / SUBJECTS
      views = [V('الكل', 'table'), V('غير المنجز', 'table', { filters: [{ prop: cbp.id, op: 'is', value: false }] }),
        V('بدون موعد', 'table', { filters: [{ prop: dt.id, op: 'empty' }] }), V('حسب المادة', 'table', { group: subjP.id }),
        V('تقويم', 'calendar', { dateProp: dt.id })];
    } else if (T === 'YSF') {
      views = [V('معرض', 'gallery')];
    } else {
      views = [V('جدول', 'table', { sort: dt ? { prop: dt.id, dir: 'desc' } : null })];
      if (statusP || subjP) views.push(V('لوحة', 'board', { groupBy: (statusP || subjP).id }));
      if (dt) views.push(V('تقويم', 'calendar', { dateProp: dt.id }));
    }
    if (!isNew(d.id)) continue;
    dbOut.push({
      id: nid(d.id), user_id: userId, parent_page_id: pageOf(d.parent) ? nid(pageOf(d.parent)) : null,
      title: T || 'قاعدة بيانات', icon: iconOf(d.icon), schema, views, autogen,
      position: order.get(d.id) || 0, notion_id: d.id, created_at: new Date().toISOString()
    });
  }

  /* ---- الكتل ---- */
  function conv(bs, depth, out) {
    for (const b of bs || []) {
      const t = b.type, d = b[t] || {};
      const mk = (type, extra) => out.push(Object.assign({ id: uid(), type, text: rt(d.rich_text), indent: depth }, extra || {}));
      let skipKids = false;
      switch (t) {
        case 'paragraph': mk('p'); break;
        case 'heading_1': mk('h1'); break;
        case 'heading_2': mk('h2'); break;
        case 'heading_3': mk('h3'); break;
        case 'bulleted_list_item': case 'toggle': mk('ul'); break;
        case 'numbered_list_item': mk('ol'); break;
        case 'to_do': mk('todo', { checked: !!d.checked }); break;
        case 'quote': mk('quote'); break;
        case 'callout': mk('quote', { text: ((d.icon && d.icon.emoji) ? d.icon.emoji + ' ' : '') + rt(d.rich_text) }); break;
        case 'code': mk('p'); break;
        case 'divider': out.push({ id: uid(), type: 'divider', text: '', indent: 0 }); break;
        case 'image': { const u = d.type === 'external' ? (d.external || {}).url : (d.data_url && d.data_url.length > 600 ? d.data_url : null); if (u) out.push({ id: uid(), type: 'image', url: u, text: rt(d.caption), indent: 0 }); break; /* المرفوعة بنوشن تنتقل فقط إذا حمّلها سكربت السحب (data_url) */ }
        case 'column_list': {
          const cols = []; skipKids = true;
          for (const c of b.children || []) { const inner = []; conv(c.children, 0, inner); const wr = c.column && c.column.width_ratio; cols.push({ id: uid(), w: wr ? +(wr * (b.children.length)).toFixed(3) : 1, blocks: cleanBlocks(inner) }); }
          if (cols.length) out.push({ id: uid(), type: 'columns', cols, indent: 0 });
          break;
        }
        case 'child_database': if (!skipDb.has(b.id)) out.push(D[b.id] ? { id: uid(), type: 'db', dbId: nid(b.id), indent: 0 } : { id: uid(), type: 'db', missing: true, indent: 0 }); skipKids = true; break;
        case 'child_page': skipKids = true; break;
        case 'column': break;
        default: if (d.rich_text) mk('p');
      }
      if (!skipKids && b.children) conv(b.children, (t === 'column') ? depth : depth + 1, out);
    }
  }
  const cleanBlocks = out => {
    const r = []; let empties = 0;
    for (const b of out) {
      const empty = b.type === 'p' && !(b.text || '').trim();
      if (empty) { empties++; if (empties > 1) continue; } else empties = 0;
      r.push(b);
    }
    while (r.length && r[r.length - 1].type === 'p' && !(r[r.length - 1].text || '').trim()) r.pop();
    return r;
  };

  /* ---- الصفحات والصفوف ---- */
  const rowPos = {};
  for (const d of Object.values(D)) (d.rows || []).forEach((rid, i) => { rowPos[rid] = i; });
  const pageOut = [];
  for (const p of Object.values(P)) {
    if (!isNew(p.id) || skipPages.has(p.id)) continue;
    const par = p.parent || {};
    const dbId = par.type === 'database_id' && D[par.database_id] && !skipDb.has(par.database_id) ? par.database_id : null;
    if (par.type === 'database_id' && !dbId) continue; // صف من قاعدة مستبعدة
    const out = []; conv(p.blocks, 0, out);
    // قاعدة ما قدرنا نسحبها (مصادر بيانات مرتبطة) ← نعرض مكانها أول قاعدة بنفس الصفحة كتقويم
    const flat = []; const fl = a => a.forEach(x => { flat.push(x); if (x.type === 'columns') x.cols.forEach(c => fl(c.blocks)); }); fl(out);
    const real = flat.find(x => x.type === 'db' && !x.missing);
    flat.filter(x => x.missing).forEach(x => { if (real) { x.dbId = real.dbId; x.view = 'calendar'; } delete x.missing; });
    for (let k = out.length - 1; k >= 0; k--) if (out[k].type === 'db' && !out[k].dbId) out.splice(k, 1);
    let props = {}, title = (p.title || '').trim();
    if (dbId) {
      const info = dbInfo[dbId];
      for (const [name, pr] of Object.entries(p.properties || {})) {
        const sp = info.byName[name]; if (!sp || sp.id === 'title') continue;
        let v;
        const ensure = o => {
          if (!o) return null;
          let opt = (sp.options = sp.options || []).find(x => x.name === o.name);
          if (!opt) { opt = { id: o.id || o.name, name: o.name, color: col(o.color) }; sp.options.push(opt); }
          return opt.id;
        };
        switch (pr.type) {
          case 'select': v = ensure(pr.select); break;
          case 'status': v = ensure(pr.status); break;
          case 'multi_select': v = (pr.multi_select || []).map(ensure); break;
          case 'date': v = pr.date ? { start: pr.date.start, end: pr.date.end || null } : null; break;
          case 'checkbox': v = !!pr.checkbox; break;
          case 'number': v = pr.number; break;
          case 'rich_text': v = rt(pr.rich_text); break;
          case 'url': v = pr.url; break;
          default: v = undefined;
        }
        if (v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)) props[sp.id] = v;
      }
    }
    const pp = dbId ? null : pageOf(par);
    pageOut.push({
      id: nid(p.id), user_id: userId,
      parent_page_id: dbId ? null : (pp ? nid(pp) : null),
      database_id: dbId ? nid(dbId) : null,
      title, icon: iconOf(p.icon), cover: coverOf(p.cover),
      props, content: cleanBlocks(out),
      position: dbId ? (rowPos[p.id] || 0) : (order.get(p.id) || 0),
      archived: !!p.archived, notion_id: p.id, created_at: p.created || new Date().toISOString()
    });
  }
  // الأب قبل الابن (لقيد المفتاح الأجنبي)
  const byId = new Map(pageOut.map(x => [x.id, x]));
  const depthOf = x => { let d = 0, c = x; while (c && c.parent_page_id && byId.has(c.parent_page_id) && d < 50) { c = byId.get(c.parent_page_id); d++; } return d; };
  pageOut.sort((a, b) => depthOf(a) - depthOf(b));
  const existingIds = existing ? new Set(existing.values()) : new Set();
  for (const x of pageOut) if (x.parent_page_id && !byId.has(x.parent_page_id) && !existingIds.has(x.parent_page_id)) x.parent_page_id = null;
  return { pages: pageOut, dbs: dbOut, skipped: [...skipDb] };
}
