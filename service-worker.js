// 🔥 CACHE VERSION
const CACHE_NAME = 'casesys-v10';

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
      console.log('✅ Cache Opened');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// ============================
// 🔹 ACTIVATE
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
// 🔹 FETCH (🔥 FIXED NETWORK FIRST)
// ============================
self.addEventListener('fetch', (event) => {

  const url = event.request.url;

  // 🔥 IMPORTANT: Google Apps Script bypass
  if (url.includes('script.google.com')) {
    return;
  }

  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {

        // 🔥 cache update
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });

        return networkResponse;
      })
      .catch(() => {
        // 🔥 fallback cache
        return caches.match(event.request);
      })
  );
});

// =======================================================
// 🔥 FIREBASE IMPORTS
// =======================================================
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// =======================================================
// 🔥 FIREBASE INIT
// =======================================================
firebase.initializeApp({
  apiKey: "AIzaSyAxn1ouF6XKnMGnD_unb4bxULotdL3VOko",
  authDomain: "casesys-d96b1.firebaseapp.com",
  projectId: "casesys-d96b1",
  messagingSenderId: "399513476851",
  appId: "1:399513476851:web:668ec94543bbe3c1186186"
});

const messaging = firebase.messaging();

// =======================================================
// 🔥 BACKGROUND NOTIFICATION (FINAL FIX)
// =======================================================
messaging.onBackgroundMessage(function(payload) {

  console.log('🔥 FULL PAYLOAD:', payload);

  const title = payload.data?.title || "Case Update";
  const body = payload.data?.body || "📩 New activity";
  const caseId = payload.data?.caseId || "";

  self.registration.showNotification(title, {
    body: body,
    icon: 'https://i.ibb.co/bRBNnZP6/Case-system-checklist-icon-design.png',
    badge: 'https://i.ibb.co/bRBNnZP6/Case-system-checklist-icon-design.png',
    data: { caseId },
    tag: caseId,
    renotify: true
  });
});

// =======================================================
// 🔥 NOTIFICATION CLICK (FINAL FIX)
// =======================================================
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const caseId = event.notification?.data?.caseId || "";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {

      for (let client of clientList) {

        // 👉 अगर app already open है
        if (client.url.includes('CASESYSTEM') && 'focus' in client) {

          client.postMessage({ caseId: caseId });
          return client.focus();
        }
      }

      // 👉 अगर app बंद है
      return clients.openWindow('./index.html?caseId=' + caseId);
    })
  );
});
