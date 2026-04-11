// 🔥 CACHE VERSION
const CACHE_NAME = 'casesys-v7';

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
// 🔹 FETCH (Offline)
// ============================
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    }).catch(() => {
      return caches.match('./index.html');
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

  // ❌ IMPORTANT: Android payload ignore karo
  if (payload.data?.type && payload.data.type !== "web") {
    console.log("⛔ Ignored (Not Web)");
    return;
  }

  // ✅ DATA ONLY (NO notification override)
  const title = payload.data?.title || "Case Update";
  const body = payload.data?.body || "📩 New activity";
  const caseId = payload.data?.caseId || "";

  self.registration.showNotification(title, {
    body: body,
    icon: 'https://i.ibb.co/bRBNnZP6/Case-system-checklist-icon-design.png',
    badge: 'https://i.ibb.co/bRBNnZP6/Case-system-checklist-icon-design.png',
    data: { caseId },
    tag: caseId, // 🔥 prevents duplicate spam
    renotify: true
  });
});

// =======================================================
// 🔥 NOTIFICATION CLICK
// =======================================================
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const caseId = event.notification?.data?.caseId || "";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {

      for (let client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) {
          client.postMessage({ caseId: caseId });
          return client.focus();
        }
      }

      return clients.openWindow('./index.html?caseId=' + caseId);
    })
  );
});
