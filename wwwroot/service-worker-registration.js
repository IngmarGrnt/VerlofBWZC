   // Auto-reload bij nieuwe SW-versie
(function () {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('service-worker.js');

      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        if (!newSW) return;

        newSW.addEventListener('statechange', () => {
          // Als er al een controller is en de nieuwe SW is 'installed',
          // dan is er een nieuwe versie beschikbaar.
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            // Direct herladen (of toon een toast met "Nu updaten")
            window.location.reload();
          }
        });
      });

      // Voor het geval de nieuwe SW al klaar staat:
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        window.location.reload();
      }
    } catch (e) {
      // no-op
    }
  });

  // Activeer nieuwe SW meteen
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Als de controller wijzigt, is de nieuwe SW actief: herlaad.
    window.location.reload();
  });
})();