/* BTC Thesis service worker: network-first with a short timeout, cache fallback.
 * App files and data feeds always try the network first (so a new version or a new
 * daily feed shows up on the next open), and fall back to the last good copy offline. */
const VERSION = 'btc-thesis-web-1.3.0';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest', 'lib/uPlot.iife.min.js', 'lib/uPlot.min.css',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFeed = sameOrigin && /\.json$/.test(url.pathname) && !url.pathname.includes('/app/');
  const isCoinbase = url.hostname === 'api.exchange.coinbase.com';
  const isRaw = url.hostname === 'raw.githubusercontent.com';
  if (!sameOrigin && !isCoinbase && !isRaw) return;
  // Coinbase candle URLs carry start/end times; cache them under one key per granularity.
  let cacheKey = req;
  if (isCoinbase) { const k = new URL(url); k.searchParams.delete('start'); k.searchParams.delete('end'); cacheKey = new Request(k.toString()); }
  const ms = isCoinbase ? 8000 : (isFeed || isRaw) ? 10000 : 4000;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await Promise.race([fetch(req, { cache: 'no-cache' }), timeout(ms)]);
      if (res && res.ok) cache.put(cacheKey, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      const hit = await cache.match(cacheKey, { ignoreSearch: sameOrigin && !isFeed });
      if (hit) return hit;
      if (req.mode === 'navigate') { const shell = await cache.match('index.html'); if (shell) return shell; }
      throw err;
    }
  })());
});
