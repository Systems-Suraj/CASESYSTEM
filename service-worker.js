// 🔥 CACHE VERSION UPDATED
const CACHE_NAME = 'casesys-v73';

// 🔥 CACHE FILES
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  'https://i.ibb.co/bRBNnZP6/Case-system-checklist-icon-design.png'
];

// ============================
// 🔹 INSTALL
// ============================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('✅ Cache Opened v36');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );

  self.skipWaiting();
});

// ============================
// 🔹 ACTIVATE (Clear Old Cache)
// ============================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log("🧹 Deleting old cache:", name);
            return caches.delete(name);
          }
        })
      );
    })
  );

  self.clients.claim();
});

// ============================
// 🔹 FETCH (FIXED)
// ============================
self.addEventListener('fetch', (event) => {

  // ✅ Only GET requests
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);

  // =====================================================
  // ❌ NEVER CACHE API / DYNAMIC CASE REQUESTS
  // =====================================================
  if (
    requestUrl.hostname.includes('script.google.com') ||
    requestUrl.pathname.includes('/exec') ||
    requestUrl.search.includes('caseId=')
  ) {

    event.respondWith(
      fetch(event.request, {
        cache: 'no-store'
      })
    );

    return;
  }

  // =====================================================
  // ✅ CACHE STATIC FILES ONLY
  // =====================================================
  event.respondWith(

    caches.match(event.request).then((cachedResponse) => {

      // ✅ Return cache first
      if (cachedResponse) {
        return cachedResponse;
      }

      // ✅ Otherwise fetch from network
      return fetch(event.request)

        .then((networkResponse) => {

          // ✅ Clone for cache
          const responseClone = networkResponse.clone();

          // =====================================================
          // ✅ Cache only safe static assets
          // =====================================================
          if (
            event.request.destination === 'script' ||
            event.request.destination === 'style' ||
            event.request.destination === 'image' ||
            event.request.destination === 'document' ||
            requestUrl.pathname.endsWith('.js') ||
            requestUrl.pathname.endsWith('.css') ||
            requestUrl.pathname.endsWith('.html') ||
            requestUrl.pathname.endsWith('.png') ||
            requestUrl.pathname.endsWith('.jpg') ||
            requestUrl.pathname.endsWith('.jpeg') ||
            requestUrl.pathname.endsWith('.webp')
          ) {

            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });

          }

          return networkResponse;

        })

        .catch(() => {

          // Optional fallback
          return caches.match('./index.html');

        });

    })

  );

});

// =======================================================
// 🔥 FIREBASE IMPORTS & INIT
// =======================================================
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAxn1ouF6XKnMGnD_unb4bxULotdL3VOko",
  authDomain: "casesys-d96b1.firebaseapp.com",
  projectId: "casesys-d96b1",
  messagingSenderId: "399513476851",
  appId: "1:399513476851:web:668ec94543bbe3c1186186"
});

const messaging = firebase.messaging();

// =======================================================
// 🔥 BACKGROUND NOTIFICATION
// =======================================================
messaging.onBackgroundMessage(function(payload) {

  console.log("📩 Background Notification:", payload);

  const title = payload.data?.title || "Case Update";
  const body = payload.data?.body || "📩 New activity";
  const caseId = payload.data?.caseId || "";
  const uniqueId = payload.data?.uniqueId || "";

  self.registration.showNotification(title, {
    body: body,

    icon: 'https://i.ibb.co/bRBNnZP6/Case-system-checklist-icon-design.png',

    badge: 'https://i.ibb.co/bRBNnZP6/Case-system-checklist-icon-design.png',

    data: {
      caseId,
      uniqueId
    },

    tag: uniqueId || caseId,

    renotify: true,

    requireInteraction: false
  });

});

// =======================================================
// 🔥 NOTIFICATION CLICK
// =======================================================
self.addEventListener('notificationclick', function(event) {

  event.notification.close();

  const caseId = event.notification?.data?.caseId || "";
  const uniqueId = event.notification?.data?.uniqueId || "";

  event.waitUntil(

    clients.matchAll({
      type: "window",
      includeUncontrolled: true
    })

    .then((clientList) => {

      // =====================================================
      // ✅ Reuse existing app window
      // =====================================================
      for (let client of clientList) {

        if (
          client.url.includes('CASESYSTEM') &&
          'focus' in client
        ) {

          client.postMessage({
            action: 'OPEN_CASE',
            caseId: caseId,
            uniqueId: uniqueId,
            forceRefresh: true
          });

          return client.focus();
        }
      }

      // =====================================================
      // ✅ Open fresh window if none exists
      // =====================================================
      return clients.openWindow(
        './index.html?caseId=' +
        encodeURIComponent(caseId) +
        '&notification=1' +
        '&t=' + Date.now()
      );

    })

  );

});
