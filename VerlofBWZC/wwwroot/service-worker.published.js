// Service worker van de Verlofplanner (gepubliceerde versie).
// Enkel nodig om de app op een gsm te kunnen installeren (PWA). Geen offline cache:
// alles komt van het netwerk, zodat een nieuwe versie na een deploy meteen doorkomt.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        // Caches van vroegere versies (offline-cache-...) opruimen
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith('offline-cache-')).map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});

// Geen eigen afhandeling: de browser haalt alles zelf op
self.addEventListener('fetch', () => { });
