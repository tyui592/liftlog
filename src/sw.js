// Versioned offline shell. No skipWaiting: open workouts keep their current release.
const PREFIX='liftlog:'+self.registration.scope+':';
const CACHE=PREFIX+'__RELEASE__';
const FILES=__SHELL_FILES__;
const SHELL=new Set(FILES.map(file=>new URL(file,self.registration.scope).href));
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url),sameOrigin=url.origin===location.origin;
  const inScope=url.href.startsWith(self.registration.scope);
  // All navigation and core assets come from this worker's complete release.
  if(sameOrigin&&inScope&&(event.request.mode==='navigate'||SHELL.has(url.href))){
    event.respondWith(caches.open(CACHE).then(async cache=>{
      const key=event.request.mode==='navigate'?new URL('./index.html',self.registration.scope).href:event.request;
      return (await cache.match(key))||fetch(event.request);
    }));
    return;
  }
  const optional=(sameOrigin&&inScope&&url.pathname.includes('/img/'))||['fonts.googleapis.com','fonts.gstatic.com','cdn.jsdelivr.net'].includes(url.hostname);
  if(!optional)return; // Never cache cloud API responses.
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const cached=await cache.match(event.request);if(cached)return cached;
    try{
      const response=await fetch(event.request);
      if(response.ok)await cache.put(event.request,response.clone());
      return response;
    }catch(error){return Response.error();}
  }));
});
