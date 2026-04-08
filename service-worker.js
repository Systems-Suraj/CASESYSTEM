const CACHE_NAME = 'casesys-v1';

// ये वो फ़ाइलें हैं जिन्हें हम डिवाइस में सेव (cache) करेंगे
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  'https://i.ibb.co/bRBNnZP6/Case-system-checklist-icon-design.png'
];

// 1. Install Event: फ़ाइलों को कैश में डालना
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. Activate Event: पुरानी कैश फ़ाइलों को डिलीट करना
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

// 3. Fetch Event: इंटरनेट न होने पर कैश से डेटा दिखाना
self.addEventListener('fetch', (event) => {
  // सिर्फ GET रिक्वेस्ट को कैश करेंगे (POST यानी आपका Apps Script API कॉल कैश नहीं होगा, जो कि सही है)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // अगर कैश में है, तो वहीं से दो, वरना इंटरनेट से लाओ
      return cachedResponse || fetch(event.request);
    }).catch(() => {
      // अगर इंटरनेट भी नहीं है और कैश भी नहीं है
      return caches.match('./index.html');
    })
  );
});
