// SM Utilities Service Worker
// Cache-first for app shells, network-first for everything else
const CACHE_NAME = 'sm-utils-v1';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/Calculator.html',
  '/stopWatch.html',
  '/percentage.html',
  '/unit-converter.html',
  '/clock.html',
  '/countdown.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install: precache all app shells
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete old caches, claim all clients
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first for precached URLs, network-first with cache fallback for others
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only handle GET requests from same origin
  if (event.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  const isPrecached = PRECACHE_URLS.some(p => {
    const norm = p === '/' ? '/index.html' : p;
    return url.pathname === p || url.pathname === norm;
  });

  if (isPrecached) {
    // Cache-first: serve from cache immediately; update in background
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return resp;
        });
      })
    );
  } else {
    // Network-first: try network, fall back to cache
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
  }
});

// ── Alarm background check (for clock.html) ─────────────────────────────────
self.addEventListener('periodicsync', event => {
  if (event.tag === 'check-alarms') {
    event.waitUntil(checkAndNotifyAlarms());
  }
});

async function checkAndNotifyAlarms() {
  try {
    const db = await openAlarmDB();
    const alarms = await getAllAlarms(db);
    const now = new Date();
    for (const alarm of alarms) {
      if (!alarm.active || alarm.fired) continue;
      const alarmTime = new Date(alarm.datetime);
      const diffSec = (now - alarmTime) / 1000;
      if (diffSec >= 0 && diffSec < 120) {
        await self.registration.showNotification('\u23F0 ' + (alarm.label || 'Alarm'), {
          body: new Date(alarm.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          icon: '/icons/icon-192.png',
          requireInteraction: true,
          tag: 'alarm-' + alarm.id,
        });
        alarm.fired = true;
        await putAlarm(db, alarm);
      }
    }
    db.close();
  } catch (e) {
    // Silently fail — SW alarm sync is best-effort
  }
}

function openAlarmDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('utilities-alarm-db', 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore('alarms', { keyPath: 'id' });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllAlarms(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('alarms', 'readonly');
    const req = tx.objectStore('alarms').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function putAlarm(db, alarm) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('alarms', 'readwrite');
    const req = tx.objectStore('alarms').put(alarm);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
