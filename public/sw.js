// Retired service worker (GA-19).
// The previous worker never installed (it precached a missing /favicon.svg) and,
// had it installed, would have served stale auth-dependent HTML. This version
// exists only so that any browser which did register it cleans up after itself.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
      await self.registration.unregister();
    })()
  );
});
