/* Stage 1 diagnostic only. Root-located script, deliberately narrow scope. */
const PROBE_SCOPE='/offline-feasibility/';
const PROBE_CACHE='flaghunters-stage1-feasibility-v1';
const PROBE_FILES=[PROBE_SCOPE+'index.html',PROBE_SCOPE+'probe.js'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  if(new URL(self.registration.scope).pathname!==PROBE_SCOPE)throw Error('Refusing scope outside the diagnostic path');
  const cache=await caches.open(PROBE_CACHE);
  for(const path of PROBE_FILES) {
    const response=await fetch(new Request(path,{cache:'no-store',redirect:'error',credentials:'same-origin'}));
    const type=response.headers.get('content-type')||'';
    if(!response.ok||response.redirected||!(path.endsWith('.js')?/javascript/:/text\/html/).test(type))throw Error('Host returned an auth redirect, error, or incorrect content type for '+path);
    if(path.endsWith('.html')&&!(await response.clone().text()).includes('<meta name="v2-stage1-probe" content="1">'))throw Error('Refusing to cache an authentication or fallback page');
    await cache.put(path,response);
  }
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  // No API, app root, authentication URL, query parameters or other resources.
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.search||!PROBE_FILES.includes(url.pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(PROBE_CACHE),hit=await cache.match(url.pathname);
    return hit||fetch(event.request);
  })());
});
