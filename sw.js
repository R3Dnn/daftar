// خدمة بسيطة: تخزّن ملفات التطبيق ليفتح بسرعة؛ البيانات دائماً من الشبكة.
const V = 'daftar-v2';
const SHELL = ['./', 'index.html', 'style.css', 'core.js', 'importer.js', 'app.js', 'db.js', 'schedule.js', 'boot.js', 'config.js', 'icon.svg', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // الشبكة أولاً (لنأخذ التحديثات)، والكاش عند انقطاع الإنترنت
  // no-cache = يتحقق من السيرفر كل مرة (ETag) فتوصلك التحديثات فوراً بدل انتظار الكاش
  e.respondWith(fetch(new Request(e.request, { cache: 'no-cache' })).then(r => { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
