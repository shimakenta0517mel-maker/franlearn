/* FranLearn service worker — offline app shell + cache-on-demand audio */
const CACHE = 'franlearn-v2';
const SHELL = ['./', './index.html', './audio/index.json', './audio/index_m.json', './audio/index_ja.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // let Google TTS etc. hit the network directly

  // The app shell + audio index lists change between updates -> NETWORK-FIRST so the
  // latest UI/vocab always reaches the user when online; fall back to cache offline.
  const netFirst = req.mode === 'navigate'
    || url.pathname.endsWith('/')
    || url.pathname.endsWith('/index.html')
    || url.pathname.endsWith('/sw.js')
    || /\/audio\/index[^/]*\.json$/.test(url.pathname);

  if (netFirst) {
    // cache:'no-cache' => always revalidate with the server (bypasses the browser HTTP cache /
    // GitHub Pages' max-age=600), so a new index.html/sw.js reaches the user on the next reload
    // instead of being stuck on a stale copy for up to 10 minutes. Falls back to cache offline.
    e.respondWith(
      fetch(new Request(req.url, { cache: 'no-cache' })).then((resp) => {
        if (resp && resp.ok) { const cp = resp.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
        return resp;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // Audio mp3s are content-hashed (immutable) -> CACHE-FIRST for speed + offline.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((resp) => {
      if (resp && resp.ok) { const cp = resp.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
      return resp;
    }).catch(() => caches.match('./index.html')))
  );
});
