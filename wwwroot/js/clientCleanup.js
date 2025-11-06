// Clears HTTP CacheStorage entries (used by service workers and fetch cache)
export async function clearAllCaches() {
    if (!("caches" in self)) return;
    try {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
    } catch { /* ignore */ }
}

// Clears browser localStorage
export function clearLocalStorage() {
    try { localStorage.clear(); } catch { /* ignore */ }
}

// Clears browser sessionStorage
export function clearSessionStorage() {
    try { sessionStorage.clear(); } catch { /* ignore */ }
}

// Clears all IndexedDB databases (supported in modern browsers)
export async function clearIndexedDB() {
    try {
        if (!("indexedDB" in self)) return;
        if (indexedDB.databases) {
            const dbs = await indexedDB.databases();
            await Promise.all((dbs || []).map(db => {
                if (!db?.name) return Promise.resolve();
                return new Promise(resolve => {
                    const req = indexedDB.deleteDatabase(db.name);
                    req.onsuccess = req.onerror = req.onblocked = () => resolve();
                });
            }));
        }
    } catch { /* ignore */ }
}

// Optional: fully unregister service workers
export async function unregisterServiceWorkers() {
    try {
        if (!("serviceWorker" in navigator)) return;
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
    } catch { /* ignore */ }
}