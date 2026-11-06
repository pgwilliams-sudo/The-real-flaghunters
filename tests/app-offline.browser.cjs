// Real HTTP + real service worker/CacheStorage/IndexedDB. No Google requests.
const http=require('node:http'),fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright'),{harness}=require('./harness.cjs');
async function run(browser,label){
  const h=harness(),events=h.sheets.get('Events').rows;events.push(events.splice(1,1)[0]);
  let version=1,deny=false,holdWrites=true;const calls=[];
  const server=http.createServer((req,res)=>{
    const file=req.url==='/offline-readiness/'?'dev/offline-readiness/index.html':req.url==='/offline-readiness/check.js'?'dev/offline-readiness/check.js':req.url==='/'?'index.html':req.url==='/offline-probe-sw.js'?'dev/offline-feasibility/offline-probe-sw.js':req.url==='/offline-feasibility/'?'dev/offline-feasibility/index.html':req.url==='/offline-feasibility/probe.js'?'dev/offline-feasibility/probe.js':req.url.slice(1);
    if(!['index.html','v2-app-sw.js','v2-offline.js','v2.js','v2-local.js','v2-sync.js','v2-recovery.js','v2.css','app-icon.PNG','dev/offline-feasibility/offline-probe-sw.js','dev/offline-feasibility/index.html','dev/offline-feasibility/probe.js','dev/offline-readiness/index.html','dev/offline-readiness/check.js'].includes(file)){res.writeHead(404);return res.end();}
    if(deny&&file==='v2.css'){res.writeHead(403);return res.end('denied');}
    res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.PNG')?'image/png':'text/html','Cache-Control':'no-store'});
    let content=fs.readFileSync(file);if(file==='v2-app-sw.js')content=content.toString().replace(/const VERSION='[^']+'/,"const VERSION='stage5-test-v"+version+"'");
    res.end(content);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port+'/',endpoint='https://script.google.com/macros/s/offline-fixture/exec';
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];
  await context.addInitScript(url=>localStorage.setItem('flaghunters.v2.api',url),endpoint);
  await context.route(endpoint+'**',async route=>{
    if(!await context.pages()[0]?.evaluate(()=>navigator.onLine).catch(()=>true))return route.abort();
    const req=route.request(),data=req.method()==='POST'?JSON.parse(req.postData()):null;
    if(data)calls.push(data);
    if(holdWrites&&['saveHoleScores','operationStatus'].includes(data?.action))return route.abort();
    const result=data?h.post(data):h.ctx.doGet({parameter:Object.fromEntries(new URL(req.url()).searchParams)});
    await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(result)});
  });
  async function page(){const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(origin);return p;}
  try{
    let p=await page();await p.evaluate(async()=>{const r=await navigator.serviceWorker.register('/offline-probe-sw.js',{scope:'/offline-feasibility/'});if(!r.active)await new Promise(resolve=>{const w=r.installing;w.addEventListener('statechange',()=>{if(w.state==='activated')resolve();});});});await p.getByRole('button',{name:/Enter Scores/}).click();await p.locator('.group-button').first().click();
    await p.locator('#v2Code').fill(h.groupPin);await p.getByRole('button',{name:'Open group',exact:true}).click();await p.locator('#scoreScreen.active').waitFor();
    // Auth-page/asset denial must not produce a partially published shell cache.
    deny=true;await p.locator('#v2PrepareOffline').click();await p.locator('#v2OfflineStatus').filter({hasText:/could not be installed/}).waitFor();
    assert.deepEqual(await p.evaluate(async()=>(await caches.keys()).filter(n=>n.startsWith('flaghunters-app:'))),[]);deny=false;
    await p.locator('#v2PrepareOffline').click();await p.locator('#v2OfflineStatus').filter({hasText:/App assets prepared/}).waitFor({timeout:40000}).catch(async e=>{console.log('PREPARE:',await p.locator('#v2OfflineStatus').innerText(),await p.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).map(r=>({active:r.active?.state,waiting:r.waiting?.state,installing:r.installing?.state}))));throw e;});await p.reload();
    await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await context.setOffline(true);await p.reload();
    await p.getByRole('button',{name:/Reopen prepared round/}).click();await p.locator('#scoreScreen.active').waitFor();
    for(const b of await p.locator('.v2-pickup').all())await b.click();await p.getByRole('button',{name:'Save this hole',exact:true}).click();
    await observe(p,async()=>(await V2Local.pending()).length===1);
    const before=await p.evaluate(()=>V2Local.pending());assert.equal(before[0].attempts,0);assert.equal(calls.filter(c=>c.action==='saveHoleScores').length,0);
    await p.close();p=await page();await p.getByRole('button',{name:/Reopen prepared round/}).click();await p.locator('#scoreScreen.active').waitFor();
    assert.deepEqual(await p.evaluate(()=>V2Local.pending()),before);assert.match(await p.locator('#v2OfflineStatus').innerText(),/Offline.*stale/);
    await p.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal((await p.evaluate(()=>V2Local.pending()))[0].operationId,before[0].operationId);
    const keys=await p.evaluate(async()=>{const names=(await caches.keys()).filter(n=>n.startsWith('flaghunters-app:'));return Promise.all(names.map(async n=>({name:n,urls:(await(await caches.open(n)).keys()).map(r=>r.url)})));});
    assert.equal(keys.length,1);assert.equal(keys[0].urls.length,8);assert.ok(keys[0].urls.every(u=>u.startsWith(locationOrigin(origin))&&!u.includes('?')));
    assert.equal(await p.evaluate(async()=>{const requests=await(await caches.open((await caches.keys()).find(n=>n.startsWith('flaghunters-app:')))).keys();return requests.some(r=>/script.google|offline-feasibility|admin/.test(r.url));}),false);
    // An update waits while a scoring tab is alive and never alters the outbox.
    await context.setOffline(false);version=2;await p.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
    await observe(p,async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
    assert.equal((await p.evaluate(()=>V2Local.pending()))[0].operationId,before[0].operationId);
    await p.close();p=await page();await p.waitForFunction(()=>navigator.serviceWorker.controller?.state==='activated');
    // Reopen after update while offline, then reconcile only in the foreground online.
    await context.setOffline(true);await p.reload();await p.getByRole('button',{name:/Reopen prepared round/}).click();await p.locator('#scoreScreen.active').waitFor();
    assert.equal((await p.evaluate(()=>V2Local.pending()))[0].operationId,before[0].operationId);
    // A tab interrupted mid-upload may retain the intentional 60-second lease.
    // Advance the fixture clock rather than depending on lease-release timing.
    await p.evaluate(()=>{const now=Date.now;Date.now=()=>now()+61000;});
    holdWrites=false;await context.setOffline(false);await p.locator('#v2RetryLocal').click();await observe(p,async()=>(await V2Local.pending()).length===0);
    assert.equal(h.ctx.v2Rows('ScoreHistory').length,4);assert.deepEqual(errors,[]);
    assert.equal(await p.evaluate(()=>caches.has('flaghunters-stage1-feasibility-v1')),true);
    assert.equal(await p.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).some(r=>new URL(r.scope).pathname==='/offline-feasibility/')),true);
    const metadataBefore=await p.evaluate(async()=>({caches:await caches.keys(),drafts:await V2Local.recovery()}));
    const inspector=await context.newPage();await inspector.goto(origin+'offline-readiness/');await inspector.locator('#check').click();
    await inspector.locator('#status').filter({hasText:/Read complete/}).waitFor();
    const readiness=JSON.parse(await inspector.locator('#report').innerText());
    assert.equal(readiness.rootWorkerActivated,true);assert.equal(readiness.updateWaiting,false);assert.equal(readiness.completeAppCachePresent,true);
    assert.deepEqual(readiness.appCaches.map(c=>c.version),['stage5-test-v2']);assert.equal(readiness.appCaches[0].assetCount,8);
    assert.equal(JSON.stringify(readiness).includes(before[0].operationId),false);assert.equal(JSON.stringify(readiness).includes('synthetic-5'),false);
    const metadataAfter=await p.evaluate(async()=>({caches:await caches.keys(),drafts:await V2Local.recovery()}));
    assert.deepEqual(metadataAfter.caches,metadataBefore.caches);assert.deepEqual(metadataAfter.drafts.drafts,metadataBefore.drafts.drafts);assert.deepEqual(metadataAfter.drafts.snapshots,metadataBefore.drafts.snapshots);
    const download=inspector.waitForEvent('download');await inspector.locator('#export').click();assert.equal((await download).suggestedFilename(),'flaghunters-offline-readiness.json');await inspector.close();
    console.log('PASS '+label+': read-only diagnostics report root worker/cache state, export safely and preserve caches/drafts/snapshots');
    await p.evaluate(async()=>{await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('flaghunters-v2-local');r.onsuccess=resolve;r.onerror=reject;});});
    await context.setOffline(true);await p.reload();await p.locator('#v2PreparedGroups').filter({hasText:/storage may have been evicted/}).waitFor();
    assert.equal(await p.getByRole('button',{name:/Reopen prepared round/}).count(),0);
    console.log('PASS '+label+': denied install, full offline reload/tab reopen, resume signals, private cache allowlist, waiting update, unchanged pending ID and foreground acceptance');
  }finally{await context.close();await new Promise(r=>server.close(r));}
}
async function observe(page,fn){const deadline=Date.now()+20000;while(!await page.evaluate(fn)){if(Date.now()>deadline)throw Error('Browser observation timed out');await new Promise(r=>setTimeout(r,20));}}
function locationOrigin(url){return new URL(url).origin;}
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{await run(browser,'Chromium');}finally{await browser.close();}
  if(fs.existsSync(webkit.executablePath())){const b=await webkit.launch();try{await run(b,'WebKit');}finally{await b.close();}}else console.log('LIMITATION: physical Safari lock/resume, eviction and private-origin acceptance require the Stage 5 plan.');
})().catch(e=>{console.error(e);process.exitCode=1;});
