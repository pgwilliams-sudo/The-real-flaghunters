/* No app credentials or data. IndexedDB use is a disposable API feasibility check. */
(() => {
  'use strict';
  const SCOPE='/offline-feasibility/',WORKER='/offline-probe-sw.js';
  const DB='flaghunters-stage1-feasibility',CACHE='flaghunters-stage1-feasibility-v1';
  let busy=false;
  const report={stage:1,diagnostic_version:3,secure_context:isSecureContext,service_worker_api:'serviceWorker' in navigator,
    indexeddb_api:'indexedDB' in window,cache_api:'caches' in window,user_agent:navigator.userAgent,page_path:location.pathname,checks:[]};
  const state=document.getElementById('state'),output=document.getElementById('report');
  function render(message) {state.textContent=message;report.online_hint=navigator.onLine;report.controller=navigator.serviceWorker?.controller?.scriptURL||null;output.textContent=JSON.stringify(report,null,2);}
  function trace(phase,details={}) {report.checks.push({phase,...details,at:new Date().toISOString()});render(state.textContent);}
  navigator.serviceWorker?.addEventListener('message',event=>{
    if(event.data?.type==='v2-stage1-worker'&&event.source&&new URL(event.source.scriptURL).pathname===WORKER) {
      const {type,...details}=event.data;trace('worker-message',details);
    }
  });
  document.addEventListener('securitypolicyviolation',event=>{
    let blocked=event.blockedURI;try{const url=new URL(blocked,location.href);blocked=url.origin+url.pathname;}catch(_){}
    trace('csp-violation',{directive:event.effectiveDirective,blocked_uri:blocked});
  });
  async function waitForWorker(registration) {
    return new Promise((resolve,reject)=>{
      const watched=new Set();let finished=false,poll,timeout;
      const end=error=>{if(finished)return;finished=true;clearInterval(poll);clearTimeout(timeout);registration.removeEventListener('updatefound',check);error?reject(error):resolve();};
      function check() {
        if(finished)return;
        for(const worker of [registration.installing,registration.waiting,registration.active])if(worker&&!watched.has(worker)) {
          watched.add(worker);trace('worker-observed',{state:worker.state,script:new URL(worker.scriptURL).pathname});
          worker.addEventListener('statechange',()=>{trace('worker-state',{state:worker.state});check();});
          worker.addEventListener('error',()=>trace('worker-error',{state:worker.state}));
        }
        if(registration.active?.state==='activated')return end();
        if([...watched].some(worker=>worker.state==='redundant')&&!registration.installing&&!registration.waiting)return end(Error('Worker installation failed; inspect worker messages and lifecycle states below'));
      }
      registration.addEventListener('updatefound',check);
      poll=setInterval(check,250);
      timeout=setTimeout(()=>end(Error('Worker activation timed out; inspect the recorded registration/lifecycle and worker messages')),30000);
      check();
    });
  }
  function database() {return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore('dummy');
    request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Dummy database blocked by another tab'));request.onsuccess=()=>resolve(request.result);
  });}
  async function marker(write) {
    const db=await database();
    try {return await new Promise((resolve,reject)=>{
      const tx=db.transaction('dummy',write?'readwrite':'readonly'),store=tx.objectStore('dummy');
      let value;
      const request=write?store.put({id:crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join(''),created_at:new Date().toISOString()},'marker'):store.get('marker');
      request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Dummy transaction aborted'));
    });}finally{db.close();}
  }
  async function inspect(label) {
    const value=await marker(false),registration=await navigator.serviceWorker.getRegistration(SCOPE);
    const cache=await caches.open(CACHE),keys=await cache.keys();
    const entry={label,at:new Date().toISOString(),marker:value||null,controlled:!!navigator.serviceWorker.controller,
      worker_state:registration?.active?.state||null,scope:registration?.scope||null,cached_paths:keys.map(r=>new URL(r.url).pathname)};
    entry.pass=!!value&&entry.controlled&&entry.worker_state==='activated'&&[SCOPE,SCOPE+'probe.js'].every(path=>entry.cached_paths.includes(path));
    report.checks.push(entry);render(entry.pass?'PASS: marker retained, worker controls this diagnostic, both assets cached.':'Not yet passed: inspect marker, controller and cache below.');
  }
  async function run(fn) {if(busy)return;busy=true;try{await fn();}catch(error){report.checks.push({error:String(error.message||error),at:new Date().toISOString()});render('Diagnostic failed; keep this report for review.');}finally{busy=false;}}
  document.getElementById('prepare').onclick=()=>run(async()=>{
    if(!isSecureContext||!('serviceWorker' in navigator)||!('indexedDB' in window)||!('caches' in window))throw Error('Required secure-context/browser API unavailable');
    const response=await fetch(WORKER,{cache:'no-store',redirect:'error',credentials:'same-origin'});
    report.worker_response={status:response.status,type:response.headers.get('content-type'),allowed_scope:response.headers.get('service-worker-allowed'),csp:response.headers.get('content-security-policy'),cache_control:response.headers.get('cache-control')};
    if(!response.ok||response.redirected||!/javascript/.test(report.worker_response.type||''))throw Error('Private host did not serve the worker as JavaScript');
    for(const path of [SCOPE,SCOPE+'probe.js']) {
      const asset=await fetch(path,{cache:'no-store',redirect:'error',credentials:'same-origin'});
      trace('page-asset-preflight',{path,status:asset.status,content_type:asset.headers.get('content-type')});
      if(!asset.ok)throw Error('Page-context asset fetch failed: '+path+' ('+asset.status+')');
    }
    const existing=await navigator.serviceWorker.getRegistration(SCOPE);
    if(existing&&new URL(existing.scope).pathname===SCOPE&&new URL((existing.active||existing.waiting||existing.installing).scriptURL).pathname!==WORKER)throw Error('Another worker owns the diagnostic scope; refusing to replace it');
    const registration=await navigator.serviceWorker.register(WORKER,{scope:SCOPE,updateViaCache:'none'});
    trace('registration-returned',{scope:registration.scope,installing:registration.installing?.state||null,waiting:registration.waiting?.state||null,active:registration.active?.state||null});
    await waitForWorker(registration);
    await marker(true);await inspect('prepared online');render('Prepared. Reload this page online once; then follow the offline checks below.');
  });
  document.getElementById('check').onclick=()=>run(()=>inspect('manual check'));
  document.getElementById('export').onclick=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='v2-stage1-feasibility.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  };
  document.getElementById('cleanup').onclick=()=>run(async()=>{
    if(!confirm('Remove only this diagnostic worker, cache and dummy marker? Golf app data will not be touched.'))return;
    const registration=await navigator.serviceWorker.getRegistration(SCOPE);
    if(registration&&new URL(registration.scope).pathname===SCOPE) {
      const worker=registration.active||registration.waiting||registration.installing;
      if(worker&&new URL(worker.scriptURL).pathname===WORKER)await registration.unregister();
    }
    await caches.delete(CACHE);await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase(DB);request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Close other diagnostic tabs before removing its dummy data'));});
    render('Diagnostic removed. Close this tab to release its current worker.');
  });
  render('Ready for Stage 1 preparation. Online hints alone do not prove connectivity.');
})();
