/* Read-only client evidence. No golf API calls, worker mutations or private storage reads. */
(() => {
  'use strict';
  const base=new URL('../',location.href),prefix='flaghunters-app:'+base.pathname+':';
  const expected=['','v2.css','v2-local.js','v2-sync.js','v2-recovery.js','v2-offline.js','v2.js','app-icon.PNG'].map(p=>new URL(p,base).href);
  const diagnosticCache='flaghunters-stage1-feasibility-v1';
  const button=document.getElementById('check'),exportButton=document.getElementById('export'),status=document.getElementById('status'),output=document.getElementById('report');
  let report;
  function safePath(value){try{const url=new URL(value);return url.origin===base.origin&&!url.search&&!url.hash?url.pathname:'[unexpected URL; details omitted]';}catch{return '[invalid URL]';}}
  function worker(value){return value?{path:safePath(value.scriptURL),state:value.state}:null;}
  function errorName(error){return /^[A-Za-z]{1,40}$/.test(error?.name||'')?error.name:'Error';}
  button.onclick=async()=>{
    button.disabled=true;exportButton.disabled=true;status.textContent='Reading local worker and cache metadata…';
    report={diagnostic:'v2-offline-readiness',version:1,at:new Date().toISOString(),secureContext:isSecureContext,onlineHint:navigator.onLine,appBasePath:base.pathname,controller:worker(navigator.serviceWorker?.controller),registrations:[],appCaches:[],diagnosticCache:null,errors:[]};
    try{
      if(!navigator.serviceWorker||!globalThis.caches)throw Error('Required browser APIs unavailable');
      const registrations=await navigator.serviceWorker.getRegistrations();
      for(const r of registrations)if(r.scope===base.href||r.scope===new URL('offline-feasibility/',base).href)report.registrations.push({scope:safePath(r.scope),active:worker(r.active),waiting:worker(r.waiting),installing:worker(r.installing)});
      const names=await caches.keys();
      for(const name of names){
        const app=name.startsWith(prefix),probe=name===diagnosticCache;
        if(!app&&!probe)continue;
        const version=app?name.slice(prefix.length):null;
        if(app&&!/^[a-zA-Z0-9_-]{1,60}$/.test(version)){report.errors.push('Unexpected app cache name; details omitted');continue;}
        // Open only cache names already observed; never add/put/delete cache data.
        const cache=await caches.open(name),requests=await cache.keys(),assets=[];
        for(const request of requests){
          const allowed=app?expected.includes(request.url):[new URL('offline-feasibility/',base).href,new URL('offline-feasibility/probe.js',base).href].includes(request.url);
          const response=await cache.match(request);
          const contentType=response?.headers.get('content-type')||'';
          assets.push({path:allowed?safePath(request.url):'[unexpected asset; URL omitted]',allowlisted:allowed,method:request.method,authorizationHeaderPresent:request.headers.has('authorization'),status:response?.status??null,contentType:/^[\w/;= .+-]{0,120}$/.test(contentType)?contentType:'[unexpected type]'});
        }
        const entry={version,assetCount:assets.length,assets};
        if(app){entry.completeStaticAllowlist=assets.length===expected.length&&expected.every(url=>requests.some(r=>r.url===url))&&assets.every(a=>a.allowlisted&&a.method==='GET'&&!a.authorizationHeaderPresent&&a.status===200);report.appCaches.push(entry);}
        else report.diagnosticCache=entry;
      }
      const root=report.registrations.find(r=>r.scope===base.pathname);
      report.rootWorkerActivated=root?.active?.state==='activated';
      report.updateWaiting=!!root?.waiting;
      report.completeAppCachePresent=report.appCaches.some(c=>c.completeStaticAllowlist);
      status.textContent='Read complete. Worker state and cache version are separate evidence; this check does not prove every offline or update scenario.';
    }catch(error){report.errors.push(errorName(error));status.textContent='Read incomplete. Export the report; do not clear site data.';}
    finally{output.textContent=JSON.stringify(report,null,2);button.disabled=false;exportButton.disabled=false;}
  };
  exportButton.onclick=()=>{
    if(!report)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download='flaghunters-offline-readiness.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  };
})();
