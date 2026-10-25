// Service worker mínimo: permite "instalar na tela inicial". Sempre busca da rede (dados ao vivo).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
