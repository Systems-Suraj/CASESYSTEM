// 🔥 CACHE VERSION BUMP (v1 se v2 kiya taaki phone naya code download kare)
const CACHE_NAME = 'casesys-v6';

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
      console.log('Opened cache v2');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting(); // Naya SW turant active hoga
});

// ============================
// 🔹 ACTIVATE (Purana Cache Delete Karega)
// ============================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          console.log("Deleting:", name);
          return caches.delete(name); // 🔥 ALL delete
        })
      );
    })
  );
  self.clients.claim();
});

// ============================
// 🔹 FETCH (PWA OFFLINE)
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
// 🔥 BACKGROUND NOTIFICATION HANDLER (FINAL)
// =======================================================
messaging.onBackgroundMessage(function(payload) {
  console.log('🔥 FULL PAYLOAD:', JSON.stringify(payload));

  let title = "";
  let body = "";

  // 🔥 DATA PAYLOAD (PRIMARY)
  if (payload.data) {
    title = payload.data.title || "";
    body = payload.data.body || "";
  }

  // 🔥 FALLBACK (if needed)
  if (!title && payload.notification) {
    title = payload.notification.title || "";
  }

  if (!body && payload.notification) {
    body = payload.notification.body || "";
  }

  // 🔥 FINAL SAFETY (no empty notification)
  if (!body || body.trim() === "") {
    body = "📩 New activity";
  }

  if (!title || title.trim() === "") {
    title = "Case Update";
  }

  const caseId =
    payload?.data?.caseId ||
    payload?.notification?.caseId ||
    "";

  self.registration.showNotification(title, {
    body: body,
    icon: 'https://i.ibb.co/bRBNnZP6/Case-system-checklist-icon-design.png',
    data: { caseId }
  });
});

// =======================================================
// 🔥 NOTIFICATION CLICK HANDLER (IMPORTANT)
// =======================================================
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const caseId = event.notification?.data?.caseId || "";

  // 🔥 open app (or focus if already open)
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {

      for (let client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) {
          client.postMessage({ caseId: caseId }); // send caseId to app
          return client.focus();
        }
      }

      // 🔥 अगर app बंद है → नया open करो
      return clients.openWindow('./index.html?caseId=' + caseId);
    })
  );
});
