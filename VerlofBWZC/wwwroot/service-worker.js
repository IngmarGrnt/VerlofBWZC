// In development, always fetch from the network and do not enable offline support.
// This is because caching would make development more difficult (changes would not
// be reflected on the first load after each change).
self.addEventListener('fetch', () => { });

//self.addEventListener('fetch', (event) => {
//    const url = new URL(event.request.url);

//    // Never intercept API or cross-origin requests
//    if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) {
//        return; // let the browser handle it
//    }

//    // ... keep the rest of your existing asset caching strategy here ...
//});
//// Minimal, pass-through service worker (no caching)
//self.addEventListener('install', () => self.skipWaiting());
//self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

//// Explicitly accept the event argument
//self.addEventListener('fetch', (event) => {
//    // No interception; let the browser handle requests
//    // If you later add caching, use: event.respondWith(fetch(event.request));
//});