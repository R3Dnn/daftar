'use strict';
/* دفتر — الإقلاع وتسجيل الدخول */

function showBoot(msg) { const b = $('#boot'); b.hidden = false; b.textContent = msg; $('#app').hidden = true; }

function showAuth(note) {
  $('#boot').hidden = true; $('#app').hidden = false;
  const side = $('#side'); side.replaceChildren(); side.style.display = 'none';
  let mode = 'in';
  const email = h('input', { type: 'email', dir: 'ltr', placeholder: 'البريد الإلكتروني', autocomplete: 'email', inputmode: 'email' });
  const pass = h('input', { type: 'password', dir: 'ltr', placeholder: 'كلمة المرور', autocomplete: 'current-password' });
  const msg = h('div', { class: 'err' }, note || '');
  const btn = h('button', { class: 'btn primary', style: 'width:100%;margin-top:6px' }, 'دخول');
  const swap = h('button', { class: 'btn ghost', style: 'width:100%;margin-top:6px' }, 'ما عندي حساب — إنشاء حساب');
  const setMode = m => { mode = m; btn.textContent = m === 'in' ? 'دخول' : 'إنشاء الحساب'; swap.textContent = m === 'in' ? 'ما عندي حساب — إنشاء حساب' : 'عندي حساب — دخول'; pass.autocomplete = m === 'in' ? 'current-password' : 'new-password'; msg.textContent = ''; };
  swap.addEventListener('click', () => setMode(mode === 'in' ? 'up' : 'in'));
  const submit = async () => {
    msg.style.color = ''; msg.textContent = '';
    if (!email.value || !pass.value) { msg.textContent = 'اكتب البريد وكلمة المرور'; return; }
    btn.disabled = true;
    try {
      if (mode === 'in') { const s = await store.signIn(email.value.trim(), pass.value); await start(s.user); }
      else {
        if (pass.value.length < 8) throw new Error('كلمة المرور لازم 8 أحرف على الأقل');
        const r = await store.signUp(email.value.trim(), pass.value);
        if (r.session) await start(r.user);
        else { msg.style.color = 'var(--ok)'; msg.textContent = 'تم! أرسلنا رابط تأكيد إلى بريدك. افتحه ثم ارجع وسجّل الدخول.'; setMode('in'); msg.textContent = 'تم! أرسلنا رابط تأكيد إلى بريدك. افتحه ثم ارجع وسجّل الدخول.'; msg.style.color = 'var(--ok)'; }
      }
    } catch (e) {
      const m = String(e.message || e);
      msg.textContent = /invalid login/i.test(m) ? 'البريد أو كلمة المرور غلط (أو لم تؤكّد بريدك بعد)' : /already|registered/i.test(m) ? 'هذا البريد مسجّل، اضغط «دخول»' : m;
    } finally { btn.disabled = false; }
  };
  btn.addEventListener('click', submit);
  [email, pass].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); }));
  $('#main').replaceChildren(h('div', { class: 'auth' }, h('h1', {}, '📓 دفتر'), h('p', { class: 'muted', style: 'margin:0 0 18px' }, 'مساحتك الخاصة، داكنة وسهلة باللمس.'),
    h('div', { class: 'field' }, email), h('div', { class: 'field' }, pass), msg, btn, swap));
}

async function start(user) {
  S.user = user; showBoot('جارٍ تحميل بياناتك…');
  try {
    const { pages, dbs } = await store.loadAll();
    S.pages = new Map(pages.map(p => [p.id, Object.assign({ props: {}, content: [] }, p)]));
    S.dbs = new Map(dbs.map(d => [d.id, Object.assign({ schema: [], views: [] }, d)]));
  } catch (e) { console.error(e); showBoot('تعذّر تحميل البيانات: ' + (e.message || e)); return; }
  $('#boot').hidden = true; $('#app').hidden = false; $('#side').style.display = '';
  store.subscribe(onRealtime);
  try { ensureAutogenAll(); } catch (e) { console.warn('autogen', e); }
  if (!S.ui.startPage) { const hp = [...S.pages.values()].find(p => !p.database_id && !p.parent_page_id && /^unbeatable/i.test((p.title || '').trim())); if (hp) { S.ui.startPage = hp.id; saveUi(); } }
  parseHash();
  if (S.route.t === 'home' && S.ui.startPage && S.pages.has(S.ui.startPage)) { S.route = { t: 'p', id: S.ui.startPage }; history.replaceState(null, '', '#/p/' + S.ui.startPage); }
  render();
  $('#scrim').addEventListener('click', closeDrawer);
  enablePullToRefresh();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
}

(async function boot() {
  if (typeof supabase === 'undefined' && !new URLSearchParams(location.search).has('demo')) { showBoot('تعذّر تحميل مكتبة الاتصال. تأكد من الإنترنت ثم أعد التحميل.'); return; }
  const demo = new URLSearchParams(location.search).has('demo');
  store = demo ? new LocalStore() : new SupaStore(window.DAFTAR_CONFIG);
  try {
    const sess = await store.session();
    if (sess) await start(sess.user); else showAuth();
    store.onAuth((ev) => { if (ev === 'SIGNED_OUT') location.reload(); });
  } catch (e) { console.error(e); showBoot('خطأ: ' + (e.message || e)); }
})();
