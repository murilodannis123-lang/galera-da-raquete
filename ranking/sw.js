// Service worker: página sempre da rede (versão nova), com reserva no cache se a rede demorar ou cair.
// Arquivos com ?v= (mudam de nome a cada versão), a biblioteca do Supabase e as imagens do app vêm do cache: abrem na hora.
const C = 'galera-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== C) await caches.delete(k);
  await self.clients.claim();
})()));
const estatico = (u) => (u.origin === self.location.origin && (u.search.includes('v=') || /\/icones\/|\/patrocinadores\//.test(u.pathname)))
  || u.href.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@');
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(C);
      const rede = fetch(req.url, { cache: 'no-store', credentials: 'same-origin' }).then((r) => { if (r.ok) cache.put('pagina', r.clone()); return r; });
      const guardada = await cache.match('pagina');
      if (!guardada) return rede.catch(() => fetch(req));
      // espera a rede até 2,5 s; se demorar, abre a última versão guardada
      return Promise.race([rede, new Promise((ok) => setTimeout(() => ok(guardada), 2500))]).catch(() => guardada);
    })());
    return;
  }
  const u = new URL(req.url);
  if (estatico(u)) {
    e.respondWith(caches.open(C).then(async (cache) => {
      const r = await cache.match(req);
      if (r) return r;
      const n = await fetch(req);
      if (n.ok || n.type === 'opaque') cache.put(req, n.clone());
      return n;
    }));
  }
});
