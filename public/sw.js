// Network-first for same-origin GETs so updates arrive immediately; the cache only serves when offline.
const CACHE='flop-v1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  const request=e.request;
  if(request.method!=='GET'||new URL(request.url).origin!==location.origin)return;
  e.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(request,copy));}return response;})
    .catch(()=>caches.match(request).then(hit=>hit||caches.match('./'))));
});
