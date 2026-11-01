// Empire OS v7.0 — Supreme Global HTTPS & Offline-First Service Worker (iOS Safari Range 206 + Full Audio & Data Vault)
const CACHE_NAME = 'empire-os-global-vault-v7.0';

const CORE_ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'favicon.png',
  'audio/Day_01_Tam_Thai_Bo_Gia.mp3',
  'audio/Day_02_Dam_Phan_Black_Swan.mp3',
  'audio/Day_03_Co_Hoc_Ky_Thu_Tu_Ma_Y.mp3',
  'audio/Day_04_Tam_Ly_Dam_Dong_Le_Bon.mp3',
  'audio/Day_05_Phao_Dai_Tai_Chinh_3_Lop.mp3',
  'audio/Day_06_Thuong_Mai_Tam_Giac_Vang.mp3',
  'audio/Day_07_Ky_Luat_Thep_SEAL.mp3'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const relUrl of CORE_ASSETS) {
        try {
          const fullUrl = new URL(relUrl, self.registration.scope).href;
          const res = await fetch(fullUrl, { cache: 'no-cache' });
          if (res && res.status === 200) {
            await cache.put(fullUrl, res.clone());
          }
        } catch (err) {
          // Ignore individual failures during install
        }
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Helper to serve HTTP 206 Partial Content from cached full MP3 for iOS Safari Offline Audio
async function handleAudioRequest(request) {
  const cache = await caches.open(CACHE_NAME);

  // Try network first if online (with short timeout), fallback to cache immediately if offline
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2200);
    const netRes = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (netRes && (netRes.status === 200 || netRes.status === 206)) {
      return netRes;
    }
  } catch (e) {
    // Offline or no signal -> Serve from iPhone CacheStorage!
  }

  const cleanReqUrl = request.url.split('?')[0];
  const cachedResponse = (await cache.match(cleanReqUrl)) || (await cache.match(request));
  if (!cachedResponse) {
    return new Response('Audio not cached yet', { status: 404 });
  }

  const rangeHeader = request.headers.get('range');
  if (!rangeHeader) {
    return cachedResponse;
  }

  const arrayBuffer = await cachedResponse.arrayBuffer();
  const bytes = /^bytes\=(\d+)\-(\d+)?$/g.exec(rangeHeader);
  if (bytes) {
    const start = Number(bytes[1]);
    const end = Number(bytes[2]) || arrayBuffer.byteLength - 1;
    const sliced = arrayBuffer.slice(start, end + 1);
    return new Response(sliced, {
      status: 206,
      statusText: 'Partial Content',
      headers: [
        ['Content-Type', 'audio/mpeg'],
        ['Accept-Ranges', 'bytes'],
        ['Content-Length', String(sliced.byteLength)],
        ['Content-Range', `bytes ${start}-${end}/${arrayBuffer.byteLength}`]
      ]
    });
  }
  return cachedResponse;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. Audio files: Use Range-aware offline handler
  if (url.pathname.includes('/audio/')) {
    event.respondWith(handleAudioRequest(req));
    return;
  }

  // 2. HTML, Icons, Manifest, API GETs: Network-First with fast 1.8s timeout -> Cache Fallback
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1800);
        const netRes = await fetch(req, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (netRes && netRes.status === 200) {
          cache.put(req, netRes.clone());
          if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')) {
            const scopeRoot = self.registration.scope;
            cache.put(scopeRoot, netRes.clone());
            cache.put(scopeRoot + 'index.html', netRes.clone());
          }
          return netRes;
        }
      } catch (err) {
        // Offline or Server unreachable -> serve from local cache!
      }
      const scopeRoot = self.registration.scope;
      const cached =
        (await cache.match(req)) ||
        (await cache.match(req.url.split('?')[0])) ||
        (req.mode === 'navigate' ? (await cache.match(scopeRoot)) || (await cache.match(scopeRoot + 'index.html')) : null);
      if (cached) return cached;
      return new Response(JSON.stringify({ offline: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    })()
  );
});
