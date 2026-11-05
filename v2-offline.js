/* Explicit preparation and honest offline/storage status; never handles scoring traffic. */
(() => {
  'use strict';
  const panel=document.createElement('section');panel.className='v2-local-status';
  panel.innerHTML='<strong>Offline app</strong><p id="v2OfflineStatus" role="status"></p><button id="v2PrepareOffline">Prepare offline app</button><div id="v2PreparedGroups"></div>';
  document.body.prepend(panel);
  let preparation='App assets have not been checked.';
  function status(){document.getElementById('v2OfflineStatus').textContent=(navigator.onLine?'Connection available; server data may still be stale. ':'Offline. Previously opened group data may be stale. Scores saved here await server acceptance. ')+preparation+' Safari may evict site storage. Keep recovery exports; if prepared data is missing, reconnect and reopen the group. Never clear site data with pending scores.';}
  window.addEventListener('online',status);window.addEventListener('offline',status);window.addEventListener('pageshow',status);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')status();});
  document.getElementById('v2PrepareOffline').onclick=async()=>{
    const button=document.getElementById('v2PrepareOffline');button.disabled=true;preparation='Preparing app assets… Keep this tab open.';status();
    try{
      if(!isSecureContext||!navigator.serviceWorker)throw Error('Offline loading is unavailable in this browser.');
      const base=new URL('./',location.href),worker=new URL('v2-app-sw.js',base);
      const existing=(await navigator.serviceWorker.getRegistrations()).find(r=>r.scope===base.href);
      if(existing&&![existing.active,existing.waiting,existing.installing].filter(Boolean).every(w=>w.scriptURL===worker.href))throw Error('Another worker owns this app scope; preparation stopped.');
      const registration=await navigator.serviceWorker.register(worker.href,{scope:base.href,updateViaCache:'none'});
      const pending=registration.installing;
      if(pending)await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('Offline preparation timed out. Reconnect and retry.')),30000);
        const check=()=>{if(['installed','activated','redundant'].includes(pending.state)){clearTimeout(timer);pending.state==='redundant'?reject(Error('Offline assets could not be installed; check private-host access.')):resolve();}};
        pending.addEventListener('statechange',check);check();
      });
      if(registration.waiting&&registration.active)preparation='Update ready. Close all app tabs, then reopen to use it. Pending scores are retained.';
      else preparation='App assets prepared. Reload once online, then verify offline reopening. Group access must be prepared separately.';
      await navigator.storage?.persist?.();
    }catch(error){preparation=error.message;}
    finally{button.disabled=false;status();}
  };
  status();
})();
