/* Mnemoire service worker — lets the public (https) site open with no
   connection. The Desktop .html file doesn't use it (file:// has no service
   workers); it relies on the app's own IndexedDB copy instead.
   - the app page: network first (so updates show up immediately when online),
     falling back to the cached copy when the network fails or is slow
   - note pictures (Supabase Storage public bucket) and web fonts: cache first
   - everything else (Supabase REST/auth calls, etc.) is never touched */
const CACHE = 'mnemoire-shell-v1';
self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./', './index.html'])).catch(()=>{}).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
function networkFirst(req){
  return new Promise(resolve=>{
    let settled = false;
    const fallback = ()=>caches.match(req, {ignoreSearch:true}).then(r=>{ if(r && !settled){ settled = true; resolve(r); } });
    const timer = setTimeout(fallback, 3500);
    fetch(req).then(resp=>{
      clearTimeout(timer);
      if(resp && resp.ok){ const copy = resp.clone(); caches.open(CACHE).then(c=>c.put(req, copy)); }
      if(!settled){ settled = true; resolve(resp); }
    }).catch(()=>{
      clearTimeout(timer);
      caches.match(req, {ignoreSearch:true}).then(r=>{ if(!settled){ settled = true; resolve(r || Response.error()); } });
    });
  });
}
function cacheFirst(req){
  return caches.match(req).then(hit=>{
    if(hit) return hit;
    return fetch(req).then(resp=>{
      if(resp && (resp.ok || resp.type==='opaque')){ const copy = resp.clone(); caches.open(CACHE).then(c=>c.put(req, copy)); }
      return resp;
    });
  });
}
self.addEventListener('fetch', e=>{
  const req = e.request;
  if(req.method!=='GET') return;
  const url = new URL(req.url);
  if(url.origin===self.location.origin && (req.mode==='navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html'))){
    e.respondWith(networkFirst(req)); return;
  }
  if(url.pathname.indexOf('/storage/v1/object/public/note-images/')!==-1 ||
     url.hostname==='fonts.googleapis.com' || url.hostname==='fonts.gstatic.com'){
    e.respondWith(cacheFirst(req).catch(()=>Response.error())); return;
  }
});
