/* App shell only. Private sessions, scores and outbox live exclusively in IndexedDB. */
'use strict';
const VERSION='stage5-v5';
const BASE=new URL('./',self.location.href);
const CACHE='flaghunters-app:'+BASE.pathname+':'+VERSION;
const ASSETS=['','v2.css','v2-local.js','v2-sync.js','v2-recovery.js','v2-offline.js','v2.js','app-icon.PNG'];
const urls=ASSETS.map(path=>new URL(path,BASE).href);
self.addEventListener('install',event=>event.waitUntil((async()=>{
  // Validate every response before publishing the complete cache. Never cache an auth page.
  const responses=[],controller=new AbortController();let timer;
  // Bound downloads AND body reads; the page's deadline alone cannot stop install.
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{
    reject(Error('Offline asset preparation timed out'));controller.abort();
  },25000);});
  try{
    await Promise.race([(async()=>{
      for(const url of urls){
        const response=await fetch(url,{cache:'no-store',credentials:'same-origin',redirect:'error',signal:controller.signal});
        if(!response.ok||response.type==='opaque'||response.url!==url)throw Error('Offline asset unavailable');
        const type=response.headers.get('content-type')||'';
        if(url===BASE.href&&!type.includes('text/html'))throw Error('Not the golf app shell');
        if(url!==BASE.href&&(url.endsWith('.js')&&!/javascript/.test(type)||url.endsWith('.css')&&!type.includes('text/css')||url.endsWith('.PNG')&&!type.includes('image/png')))throw Error('Unexpected asset type');
        // Consume once, avoiding a cloned/teed HTML stream during Safari installation.
        const body=await response.arrayBuffer();
        if(controller.signal.aborted)throw Error('Offline asset preparation timed out');
        if(url===BASE.href&&!new TextDecoder().decode(body).includes('src="v2-offline.js"'))throw Error('Not the golf app shell');
        responses.push(new Response(body,{status:response.status,headers:response.headers}));
      }
    })(),deadline]);
  }catch(error){controller.abort();throw error;}
  finally{clearTimeout(timer);}
  const cache=await caches.open(CACHE);
  try{for(let i=0;i<urls.length;i++)await cache.put(urls[i],responses[i]);}
  catch(error){await caches.delete(CACHE);throw error;}
  // No skipWaiting: an open scoring tab retains one consistent application version.
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith('flaghunters-app:'+BASE.pathname+':')&&name!==CACHE)await caches.delete(name);
  // No clients.claim: do not take control of diagnostic or unrelated existing pages.
})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==BASE.origin||url.search||request.headers.has('authorization')||request.headers.has('range'))return;
  // Fragments identify document state, not a different asset. Safari reloads may retain
  // even an empty # in request.url; clear it unconditionally before exact matching.
  url.hash='';
  if(url.pathname===BASE.pathname+'index.html')url.pathname=BASE.pathname;
  if(!urls.includes(url.href))return; // Includes no API, diagnostic, admin or private response routes.
  event.respondWith((async()=>{
    const cached=await (await caches.open(CACHE)).match(url.href);
    if(cached)return cached;
    // Eviction is recoverable online. Never populate runtime responses or auth pages.
    return fetch(request);
  })());
});
