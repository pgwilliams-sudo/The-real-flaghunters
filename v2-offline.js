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
  const panel=document.createElement('div');
  panel.innerHTML='<p id="v2OfflineStatus" role="status"></p><button type="button" id="v2PrepareOffline">Check offline access</button>';
  const button=panel.querySelector('#v2PrepareOffline'),output=panel.querySelector('#v2OfflineStatus');
  const prepared=document.createElement('div');
  prepared.id='v2PreparedGroups';
  prepared.hidden=true;
  document.getElementById('homeScreen').insertBefore(prepared,document.getElementById('homeMessage'));
  root.V2OfflineAssets.panel=panel;
  const assets=navigator.serviceWorker&&root.caches?create({base:new URL('./',location.href),serviceWorker:navigator.serviceWorker,caches:root.caches}):null;
  let busy=false,state=null,sequence=0;
  function ready(){return !!(state?.workerReady&&state.cacheComplete&&!state.waiting&&!state.installing);}
  function status(message){
    output.textContent=message;
    window.dispatchEvent(new Event('v2OfflineReadiness'));
  }
  function describe(){
    if(!assets)return 'Offline play is unavailable in this browser.';
    if(state?.waiting)return 'Update ready. Close all app tabs, then reopen. Saved scores will be kept.';
    if(state?.installing)return 'Preparing offline access…';
    if(ready())return 'Offline app is ready. Open and confirm your group before going offline.';
    return 'Connect to prepare offline access.';
  }
  async function refresh(auto=false){
    if(busy)return;
    const turn=++sequence;
    try{
      const inspected=await assets?.inspect();
      if(turn!==sequence||busy)return;
      state=inspected;
      status(describe());
      if(auto&&navigator.onLine&&assets&&!ready()&&!state?.waiting)await prepare();
    }catch(_){if(turn===sequence){state=null;status('Offline access could not be checked.');}}
  }
  async function prepare(manual=false){
    if(busy)return;
    button.disabled=true;busy=true;sequence++;
    status(navigator.onLine?'Preparing offline access…':'Checking offline access…');
    try {
      if(!isSecureContext||!assets)throw Error('Offline loading is unavailable in this browser.');
      const result=await assets.prepare();state=result.state;
      status(result.offline?'Reconnect to prepare or update offline access.':describe());
      if(manual&&!result.offline)try{await navigator.storage?.persist?.();}catch(_){}
    }catch(error){
      try{state=await assets?.inspect();}catch(_){state=null;}
      status((error.name==='TypeError'?'Offline check failed. Try again when connected.':error.message));
    }finally{busy=false;button.disabled=false;}
  }
  Object.assign(root.V2OfflineAssets,{ready,refresh});
  window.addEventListener('online',()=>refresh(true));
  window.addEventListener('offline',()=>refresh());
  window.addEventListener('pageshow',()=>refresh(true));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void refresh();});
  window.navigator.serviceWorker?.addEventListener('controllerchange',()=>refresh());
  button.onclick=()=>prepare(true);
})(globalThis);
