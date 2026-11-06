const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture({waiting=false,badAsset=false,fail=false}={}){
  const origin='https://private.test',paths=['/','/v2.css','/v2-local.js','/v2-sync.js','/v2-recovery.js','/v2-offline.js','/v2.js','/app-icon.PNG'];
  const nodes=Object.fromEntries(['check','export','status','report'].map(id=>[id,{}])),opened=[];
  const names=['unrelated-private-cache','flaghunters-app:/:stage5-v2','flaghunters-stage1-feasibility-v1'];if(waiting)names.push('flaghunters-app:/:stage5-v1');
  const registration={scope:origin+'/',active:{scriptURL:origin+'/v2-app-sw.js',state:'activated'},waiting:waiting?{scriptURL:origin+'/v2-app-sw.js',state:'installed'}:null,installing:null};
  const ctx={URL,Date,JSON,isSecureContext:true,location:{href:origin+'/offline-readiness/'},document:{getElementById:id=>nodes[id]},navigator:{onLine:true,serviceWorker:{controller:registration.active,getRegistrations:async()=>[registration,{scope:origin+'/offline-feasibility/',active:{scriptURL:origin+'/offline-probe-sw.js',state:'activated'}}]}},caches:{keys:async()=>{if(fail)throw Error('PRIVATE_ERROR_CONTENT');return names;},open:async name=>{
    assert.ok(names.includes(name));assert.notEqual(name,'unrelated-private-cache');opened.push(name);
    const probe=name==='flaghunters-stage1-feasibility-v1';let urls=probe?['/offline-feasibility/','/offline-feasibility/probe.js']:paths;
    if(badAsset&&!probe)urls=[...urls,'https://script.google.com/exec?credential=PRIVATE_ERROR_CONTENT'];
    return {keys:async()=>urls.map(p=>({url:p.startsWith('https:')?p:origin+p,method:'GET',headers:{has:()=>p.startsWith('https:')}})),match:async r=>({status:200,headers:{get:()=>r.url.endsWith('.js')?'text/javascript':r.url.endsWith('.css')?'text/css':r.url.endsWith('.PNG')?'image/png':'text/html'},text:()=>{throw Error('Response bodies must not be read');}}),put:()=>{throw Error('Cache mutation forbidden');}};
  },delete:()=>{throw Error('Cache mutation forbidden');}},fetch:()=>{throw Error('Network request forbidden');},indexedDB:{open:()=>{throw Error('IndexedDB must not be opened');}}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync('dev/offline-readiness/check.js','utf8'),ctx);
  return {nodes,opened,read:async()=>{await nodes.check.onclick();return JSON.parse(nodes.report.textContent);}};
}
test('read-only readiness reports activated root worker and complete static cache without accessing private cache/storage/network',async()=>{
  const f=fixture(),report=await f.read();assert.equal(report.rootWorkerActivated,true);assert.equal(report.updateWaiting,false);assert.equal(report.appCaches[0].version,'stage5-v2');assert.equal(report.appCaches[0].assetCount,8);assert.equal(report.completeAppCachePresent,true);assert.equal(report.diagnosticCache.assetCount,2);assert.equal(f.opened.length,2);assert.deepEqual(report.errors,[]);assert.equal(f.nodes.export.disabled,false);
});
test('waiting worker and both cache versions remain separate evidence, without activating or deleting anything',async()=>{
  const report=await fixture({waiting:true}).read();assert.equal(report.updateWaiting,true);assert.equal(report.registrations[0].waiting.state,'installed');assert.equal(report.appCaches.length,2);assert.deepEqual(report.appCaches.map(c=>c.version),['stage5-v2','stage5-v1']);
});
test('unexpected cache URLs and authorization values are never exposed in diagnostic output',async()=>{
  const report=await fixture({badAsset:true}).read(),text=JSON.stringify(report);assert.equal(text.includes('PRIVATE_ERROR_CONTENT'),false);assert.equal(text.includes('script.google.com'),false);assert.equal(report.completeAppCachePresent,false);assert.equal(report.appCaches[0].assets.at(-1).authorizationHeaderPresent,true);assert.equal(report.appCaches[0].assets.at(-1).allowlisted,false);
});
test('read failure exports only an error category rather than sensitive exception text',async()=>{
  const f=fixture({fail:true}),report=await f.read();assert.deepEqual(report.errors,['Error']);assert.equal(JSON.stringify(report).includes('PRIVATE_ERROR_CONTENT'),false);assert.match(f.nodes.status.textContent,/Read incomplete/);
});
