/* App-asset readiness only. Never handles private sessions, scores or the outbox. */
((root) => {
  'use strict';
  function create({base,serviceWorker,caches,online=()=>root.navigator.onLine,timeout=30000}) {
    base=new URL(base);const script=new URL('v2-app-sw.js',base).href,prefix='flaghunters-app:'+base.pathname+':';
    const urls=['','v2.css','v2-local.js','v2-sync.js','v2-recovery.js','v2-offline.js','v2.js','app-icon.PNG'].map(p=>new URL(p,base).href);
    const expectedType=url=>url.endsWith('.js')?/javascript/:url.endsWith('.css')?/text\/css/:url.endsWith('.PNG')?/image\/png/:/text\/html/;
    async function registration(){return (await serviceWorker.getRegistrations()).find(r=>r.scope===base.href);}
    function owned(r){if(r&&![r.active,r.waiting,r.installing].filter(Boolean).every(w=>w.scriptURL===script))throw Error('Another worker owns this app scope; preparation stopped.');}
    async function inspect(r) {
      r ||= await registration();owned(r);const complete=[];
      for(const name of await caches.keys())if(name.startsWith(prefix)) {
        const cache=await caches.open(name),keys=await cache.keys();
        if(keys.length!==urls.length||!urls.every(url=>keys.some(k=>k.url===url&&k.method==='GET'&&!k.headers.has('authorization'))))continue;
        let valid=true;
        for(const url of urls){const response=await cache.match(url);if(!response||response.status!==200||!expectedType(url).test(response.headers.get('content-type')||'')){valid=false;break;}}
        if(valid)complete.push(name.slice(prefix.length));
      }
      return {cacheComplete:complete.length>0,versions:complete,workerReady:r?.active?.state==='activated',waiting:!!(r?.waiting&&r?.active),installing:!!r?.installing&&r.installing.state!=='redundant'};
    }
    async function prepare() {
      if(!online())return {offline:true,checkedOnline:false,state:await inspect()};
      let r=await registration();owned(r);if(r&&!r.active&&!r.waiting&&!r.installing)r=null;let candidate=r?.installing||(r?.active&&r.active.state!=='activated'?r.active:null),deadline=Date.now()+timeout;
      const found=()=>{candidate=r.installing||candidate;};
      async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Preparation timed out; an update may still finish. Existing saved data is retained.')),Math.max(1,deadline-Date.now()));})]);}finally{clearTimeout(timer);}}
      function settled(worker){return new Promise((resolve,reject)=>{
        let poll,timer;const done=error=>{clearInterval(poll);clearTimeout(timer);worker.removeEventListener('statechange',check);error?reject(error):resolve();};
        const check=()=>{if(worker.state==='redundant')done(Error('Offline assets could not be installed. Existing cached assets and saved scores are retained.'));else if(worker.state==='activated'||r.active&&r.waiting===worker&&worker.state==='installed')done();};
        worker.addEventListener('statechange',check);poll=setInterval(check,30);timer=setTimeout(()=>done(Error('Preparation timed out; an update may still finish. Existing saved data is retained.')),Math.max(1,deadline-Date.now()));check();
      });}
      if(r)r.addEventListener('updatefound',found);
      try {
        if(!r){r=await bounded(serviceWorker.register(script,{scope:base.href,updateViaCache:'none'}));candidate=r.installing||(!r.active?r.waiting:null)||(r.active?.state!=='activated'?r.active:null);r.addEventListener('updatefound',found);}
        // register() alone can reuse an existing registration without checking for new bytes.
        else if(!r.waiting&&!candidate){await bounded(r.update());candidate=r.installing||candidate;}
        if(candidate)await settled(candidate);
        if(!r.active&&!r.waiting)throw Error('App worker is not ready. Existing saved data is retained.');
        const state=await inspect(r);if(!state.cacheComplete)throw Error('App asset cache is incomplete. Reconnect and prepare again; saved scores are retained.');
        return {offline:false,checkedOnline:true,state};
      }finally{r?.removeEventListener('updatefound',found);}
    }
    return {inspect,prepare};
  }
  root.V2OfflineAssets={create};
  if(!root.document)return;
  const panel=document.createElement('section');panel.className='v2-local-status';
  panel.innerHTML='<strong>Offline app</strong><p id="v2OfflineStatus" role="status"></p><button id="v2PrepareOffline">Prepare offline app</button><div id="v2PreparedGroups"></div>';
  document.body.prepend(panel);
  const button=document.getElementById('v2PrepareOffline'),output=document.getElementById('v2OfflineStatus');
  const assets=navigator.serviceWorker&&root.caches?create({base:new URL('./',location.href),serviceWorker:navigator.serviceWorker,caches:root.caches}):null;
  let readiness='Checking cached app assets…',action='',busy=false,sequence=0;
  function status(){output.textContent=(navigator.onLine?'Connection available; server data may still be stale. ':'Offline. Previously opened group data may be stale. Scores saved here await server acceptance. ')+readiness+' '+action+' Group access must be prepared separately. Safari may evict site storage. Keep recovery exports; if prepared data is missing, reconnect and reopen the group. Never clear site data with pending scores.';}
  function describe(state){return state.waiting?'Update ready. Close all app tabs, then reopen to use it. Pending scores are retained.':state.installing?'An app update is installing; keep this tab open.':state.cacheComplete?'Cached app assets verified on this device.':'No complete app asset cache found. Connect and prepare before relying on offline loading.';}
  async function refresh(){status();if(busy)return;const turn=++sequence;try{const state=await assets?.inspect();if(turn===sequence&&!busy)readiness=state?describe(state):'Offline loading is unavailable in this browser.';}catch(_){if(turn===sequence&&!busy)readiness='Cached app assets could not be verified. Saved scores were not changed.';}status();}
  window.addEventListener('online',refresh);window.addEventListener('offline',refresh);window.addEventListener('pageshow',refresh);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void refresh();});
  button.onclick=async()=>{
    button.disabled=true;busy=true;sequence++;action='';readiness=navigator.onLine?'Checking app preparation and updates… Keep this tab open.':'Checking existing cached assets only…';status();
    try {
      if(!isSecureContext||!assets)throw Error('Offline loading is unavailable in this browser.');
      const result=await assets.prepare();readiness=describe(result.state);
      if(result.offline)action='No new preparation or update check was performed while offline. Reconnect to check for updates.';
      else {action='App assets prepared and verified. Online preparation/update check completed.';try{await navigator.storage?.persist?.();}catch(_){action+=' Persistent storage was not granted; keep recovery exports.';}}
    }catch(error){
      try{readiness=describe(await assets.inspect());}catch(_){readiness='Cached app readiness is unknown.';}
      action=error.name==='TypeError'?'Preparation/update check failed. Existing cached assets and saved scores are retained. Reconnect and try again.':error.message;
    }finally{busy=false;button.disabled=false;status();}
  };
  void refresh();
})(globalThis);
