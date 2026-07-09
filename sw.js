// Service worker minimal — satisfait les critères d'installation PWA de Chrome
// sans jamais mettre en cache quoi que ce soit (100% réseau, zéro risque de contenu périmé).
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Passthrough pur : toujours le réseau, jamais de cache.
  event.respondWith(fetch(event.request));
});
