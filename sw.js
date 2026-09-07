// Offline cache: precache everything, serve cache-first, refresh in the background.
const CACHE = 'klubok-v5';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './src/main.js',
  './src/ui.js',
  './src/audio.js',
  './src/storage.js',
  './src/levels.js',
  './src/gen-worker.js',
  './src/core/rng.js',
  './src/core/level.js',
  './src/core/sim.js',
  './src/core/solver.js',
  './src/core/difficulty.js',
  './src/core/colors.js',
  './src/core/generator.js',
  './src/game/game.js',
  './src/render/track.js',
  './src/render/palette.js',
  './src/render/snake.js',
  './src/render/renderer.js',
  './src/render/input.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
