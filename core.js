'use strict';
/* أدوات + طبقة التخزين (Supabase أو محلي للتجربة) */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
}

function h(tag, a, ...kids) {
  const el = document.createElement(tag);
  for (const k in (a || {})) {
    const v = a[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(9)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ضغطة مطوّلة = بديل كليك يمين */
function longPress(el, cb, ms = 520) {
  let t = null, sx = 0, sy = 0, fired = false;
  const clear = () => { clearTimeout(t); t = null; };
  el.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    sx = e.clientX; sy = e.clientY; fired = false; clear();
    t = setTimeout(() => { fired = true; t = null; cb(e); }, ms);
  });
  el.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clear(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => el.addEventListener(n, clear));
  el.addEventListener('click', e => { if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; } }, true);
  el.addEventListener('contextmenu', e => { e.preventDefault(); clear(); if (!fired) cb(e); });
}

const PAGE_COLS = ['id', 'user_id', 'parent_page_id', 'database_id', 'title', 'icon', 'cover', 'props', 'content', 'position', 'archived', 'notion_id', 'created_at'];
const DB_COLS = ['id', 'user_id', 'parent_page_id', 'title', 'icon', 'schema', 'views', 'autogen', 'templates', 'position', 'notion_id', 'created_at'];
const pick = (o, cols) => { const r = {}; for (const c of cols) if (o[c] !== undefined) r[c] = o[c]; return r; };

/* ---------- Supabase ---------- */
class SupaStore {
  constructor(cfg) {
    this.kind = 'supabase';
    this.sb = supabase.createClient(cfg.url, cfg.publishable_key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }
  async session() { const { data } = await this.sb.auth.getSession(); return data.session; }
  onAuth(cb) { this.sb.auth.onAuthStateChange((ev, s) => cb(ev, s)); }
  async signIn(email, password) { const { data, error } = await this.sb.auth.signInWithPassword({ email, password }); if (error) throw error; return data.session; }
  async signUp(email, password) {
    // رابط التأكيد يرجع لصفحة التطبيق نفسها (مع المسار /daftar/)
    const { data, error } = await this.sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error; return data;
  }
  async signOut() { await this.sb.auth.signOut(); }
  async fetchAll(t) {
    let out = [], from = 0; const step = 1000;
    for (;;) {
      const { data, error } = await this.sb.from(t).select('*').order('created_at').order('id').range(from, from + step - 1);
      if (error) throw error;
      out = out.concat(data); if (data.length < step) break; from += step;
    }
    return out;
  }
  async loadAll() { return { pages: await this.fetchAll('pages'), dbs: await this.fetchAll('databases') }; }
  async upsert(table, rows) {
    const t = table === 'pages' ? 'pages' : 'databases';
    const cols = table === 'pages' ? PAGE_COLS : DB_COLS;
    const clean = rows.map(r => pick(r, cols));
    for (let i = 0; i < clean.length; i += 100) {
      const { error } = await this.sb.from(t).upsert(clean.slice(i, i + 100));
      if (error) throw error;
    }
  }
  async remove(table, id) {
    const { error } = await this.sb.from(table === 'pages' ? 'pages' : 'databases').delete().eq('id', id);
    if (error) throw error;
  }
  subscribe(handler) {
    this.ch = this.sb.channel('daftar-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pages' }, p => handler('pages', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'databases' }, p => handler('dbs', p))
      .subscribe();
  }
}

/* ---------- محلي (للتجربة ?demo=1) ---------- */
class LocalStore {
  constructor() { this.kind = 'local'; this.key = 'daftar_demo_v1'; }
  async session() { return { user: { id: 'local-user', email: 'تجريبي' } }; }
  onAuth() {}
  async signOut() {}
  async loadAll() {
    try { const s = localStorage.getItem(this.key); if (s) return JSON.parse(s); } catch (e) {}
    const base = '_demo/'; // نسخة محلية للتجربة فقط — لا تُرفع مع التطبيق
    const [P, D] = await Promise.all([fetch(base + 'pages.json').then(r => r.json()), fetch(base + 'databases.json').then(r => r.json())]);
    const conv = convertNotion(P, D, 'local-user');
    this.data = { pages: conv.pages, dbs: conv.dbs };
    this.persist();
    return this.data;
  }
  persist() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { console.warn('local persist failed', e); } }
  async upsert(table, rows) {
    if (!this.data) this.data = JSON.parse(localStorage.getItem(this.key) || '{"pages":[],"dbs":[]}');
    const arr = table === 'pages' ? this.data.pages : this.data.dbs;
    for (const r of rows) { const i = arr.findIndex(x => x.id === r.id); if (i >= 0) arr[i] = JSON.parse(JSON.stringify(r)); else arr.push(JSON.parse(JSON.stringify(r))); }
    this.persist();
  }
  async remove(table, id) {
    if (!this.data) this.data = JSON.parse(localStorage.getItem(this.key) || '{"pages":[],"dbs":[]}');
    const k = table === 'pages' ? 'pages' : 'dbs';
    this.data[k] = this.data[k].filter(x => x.id !== id); this.persist();
  }
  subscribe() {}
}
