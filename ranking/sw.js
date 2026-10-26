// Service worker: abre sempre a versão mais nova do app (a página vem da rede, sem cache)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode === 'navigate') e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => fetch(e.request)));
});
