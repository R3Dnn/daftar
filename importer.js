'use strict';
/* تحويل تصدير نوشن (pages.json + databases.json من سكربت السحب) إلى هيكل «دفتر» */
function convertNotion(P, D, userId, existing) {
  const idMap = new Map();
  const nid = n => {
    if (existing && existing.has(n)) return existing.get(n);
    if (!idMap.has(n)) idMap.set(n, uid());
    return idMap.get(n);
  };
  const isNew = n => !(existing && existing.has(n));
  const rt = a => (a || []).map(t => t.plain_text || '').join('');
  const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
  const col = c => (COLORS.includes(c) ? c : 'gray');

  // أي كتلة -> أي صفحة تحتويها (لقواعد البيانات والصفحات التي أبوها block)
  const blockToPage = new Map();
  const walk = (pid, bs) => { for (const b of bs || []) { blockToPage.set(b.id, pid); walk(pid, b.children); } };
  for (const p of Object.values(P)) walk(p.id, p.blocks);
  const pageOf = par => {
    if (!par) return null;
    if (par.type === 'page_id') return P[par.page_id] ? par.page_id : null;
    if (par.type === 'block_id') return P[par.block_id] ? par.block_id : (blockToPage.get(par.block_id) || null);
    return null;
  };

  // ترتيب الأبناء حسب ظهورهم في كتل أبيهم
  const order = new Map();
  for (const p of Object.values(P)) {
    let i = 0; const go = bs => { for (const b of bs || []) { if (b.type === 'child_page' || b.type === 'child_database') order.set(b.id, i++); go(b.children); } };
    go(p.blocks);
  }

  /* ---- قواعد البيانات ---- */
  const dbOut = [], dbInfo = {};
  for (const d of Object.values(D)) {
    const schema = [], byName = {};
    for (const [name, pr] of Object.entries(d.properties || {})) {
      const t = pr.type;
      if (t === 'title') { const sp = { id: 'title', name: name || 'الاسم', type: 'title' }; schema.unshift(sp); byName[name] = sp; continue; }
      let type = null, options;
      if (t === 'rich_text') type = 'text';
      else if (['number', 'date', 'checkbox', 'url'].includes(t)) type = t;
      else if (['select', 'multi_select', 'status'].includes(t)) {
        type = t;
        options = (pr[t].options || []).map(o => ({ id: o.id || o.name, name: o.name, color: col(o.color) }));
      } else if (t === 'created_time') type = 'created';
      if (!type) continue;
      const sp = { id: 'p_' + (pr.id || name).replace(/[^\w]/g, ''), name: name || (type === 'checkbox' ? 'منجز' : 'خاصية'), type };
      if (options) sp.options = options;
      schema.push(sp); byName[name] = sp;
    }
    if (!schema.find(s => s.id === 'title')) schema.unshift({ id: 'title', name: 'الاسم', type: 'title' });
    dbInfo[d.id] = { schema, byName };
    const views = [];
    const dt = schema.find(s => s.type === 'date');
    views.push({ id: uid(), name: 'جدول', type: 'table', filters: [], sort: dt ? { prop: dt.id, dir: 'desc' } : null });
    const sel = schema.find(s => s.type === 'status') || schema.find(s => s.type === 'select');
    if (sel) views.push({ id: uid(), name: 'لوحة', type: 'board', groupBy: sel.id, filters: [], sort: null });
    if (dt) views.push({ id: uid(), name: 'تقويم', type: 'calendar', dateProp: dt.id, filters: [], sort: null });
    if (!isNew(d.id)) continue;
    dbOut.push({
      id: nid(d.id), user_id: userId, parent_page_id: pageOf(d.parent) ? nid(pageOf(d.parent)) : null,
      title: (d.title || '').trim() || 'قاعدة بيانات', icon: d.icon && d.icon.type === 'emoji' ? d.icon.emoji : null,
      schema, views, position: order.get(d.id) || 0, notion_id: d.id, created_at: new Date().toISOString()
    });
  }

  /* ---- الكتل ---- */
  function conv(bs, depth, out) {
    for (const b of bs || []) {
      const t = b.type, d = b[t] || {};
      const mk = (type, extra) => out.push(Object.assign({ id: uid(), type, text: rt(d.rich_text), indent: depth }, extra || {}));
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
        case 'image': out.push({ id: uid(), type: 'p', text: '🖼 ' + (rt(d.caption) || '(صورة لم تُنقل)'), indent: depth }); break;
        case 'child_page': case 'child_database': case 'column_list': case 'column': break;
        default: if (d.rich_text) mk('p');
      }
      if (b.children && t !== 'child_page' && t !== 'child_database') {
        conv(b.children, (t === 'column_list' || t === 'column') ? depth : depth + 1, out);
      }
    }
  }
  const cleanBlocks = out => {
    const r = []; let empties = 0;
    for (const b of out) {
      const empty = b.type === 'p' && !b.text.trim();
      if (empty) { empties++; if (empties > 1) continue; } else empties = 0;
      r.push(b);
    }
    while (r.length && r[r.length - 1].type === 'p' && !r[r.length - 1].text.trim()) r.pop();
    return r;
  };

  /* ---- الصفحات والصفوف ---- */
  const rowPos = {};
  for (const d of Object.values(D)) (d.rows || []).forEach((rid, i) => { rowPos[rid] = i; });
  const pageOut = [];
  for (const p of Object.values(P)) {
    if (!isNew(p.id)) continue;
    const par = p.parent || {};
    const dbId = par.type === 'database_id' && D[par.database_id] ? par.database_id : null;
    const out = []; conv(p.blocks, 0, out);
    let props = {}, title = (p.title || '').trim();
    if (dbId) {
      const info = dbInfo[dbId];
      const dbOutObj = dbOut.find(x => x.notion_id === dbId);
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
      void dbOutObj;
    }
    const pp = dbId ? null : pageOf(par);
    pageOut.push({
      id: nid(p.id), user_id: userId,
      parent_page_id: dbId ? (par.type === 'page_id' ? nid(par.page_id) : null) : (pp ? nid(pp) : null),
      database_id: dbId ? nid(dbId) : null,
      title, icon: p.icon && p.icon.type === 'emoji' ? p.icon.emoji : null, cover: null,
      props, content: cleanBlocks(out),
      position: dbId ? (rowPos[p.id] || 0) : (order.get(p.id) || 0),
      archived: !!p.archived, notion_id: p.id, created_at: p.created || new Date().toISOString()
    });
  }
  // الأب قبل الابن (لقيد المفتاح الأجنبي)
  const byId = new Map(pageOut.map(x => [x.id, x]));
  const depthOf = x => { let d = 0, c = x; while (c && c.parent_page_id && byId.has(c.parent_page_id) && d < 50) { c = byId.get(c.parent_page_id); d++; } return d; };
  pageOut.sort((a, b) => depthOf(a) - depthOf(b));
  // أب غير موجود (ليس في التصدير) -> null
  for (const x of pageOut) if (x.parent_page_id && !byId.has(x.parent_page_id) && !(existing && [...existing.values()].includes(x.parent_page_id))) x.parent_page_id = null;
  return { pages: pageOut, dbs: dbOut };
}
