// 🔥 CACHE VERSION BUMP (v1 se v2 kiya taaki phone naya code download kare)
const CACHE_NAME = 'casesys-v2';

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
          if (name !== CACHE_NAME) {
            console.log('Deleting old cache:', name);
            return caches.delete(name);
          }
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
// 🔥 FIREBASE PUSH NOTIFICATION
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

// 🔥 BACKGROUND NOTIFICATION HANDLER
messaging.onBackgroundMessage(function(payload) {
  console.log('Received background message ', payload);

  // ? lagane se error nahi aayega agar data empty ho
  const notificationTitle = payload?.data?.title || '💬 New Message';
  const notificationBody = payload?.data?.body || 'You have a new update'; 
  const caseId = payload?.data?.caseId || '';

  const notificationOptions = {
    body: notificationBody,
    icon: 'https://i.ibb.co/bRBNnZP6/Case-system-checklist-icon-design.png',
    data: { caseId: caseId } // Future use ke liye (notification click karne par app open hone ke liye)
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
