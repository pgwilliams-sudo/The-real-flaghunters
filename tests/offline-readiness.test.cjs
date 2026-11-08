const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture({online=true,incomplete=false}={}){
  const origin='https://app.test/',script=origin+'v2-app-sw.js',listeners=new Map();
  const worker=state=>({scriptURL:script,state,addEventListener(name,fn){listeners.set(this,fn);},removeEventListener(){listeners.delete(this);}});
  const active=worker('activated'),r={scope:origin,active,waiting:null,installing:null,addEventListener(name,fn){this.listener=fn;},removeEventListener(){this.listener=null;},async update(){calls.update++;}};
  const calls={update:0,register:0,opens:[]},names=['flaghunters-app:/:stage5-v2','flaghunters-stage1-feasibility-v1'];
  const urls=['','v2.css','v2-local.js','v2-sync.js','v2-recovery.js','v2-offline.js','v2.js','app-icon.PNG'].map(p=>origin+p);if(incomplete)urls.pop();
  const cache={keys:async()=>urls.map(url=>({url,method:'GET',headers:{has:()=>false}})),match:async url=>({status:200,headers:{get:()=>url.endsWith('.js')?'text/javascript':url.endsWith('.css')?'text/css':url.endsWith('.PNG')?'image/png':'text/html'}}),put:()=>{throw Error('Mutation forbidden');}};
  const caches={keys:async()=>[...names],open:async name=>{assert.equal(name,'flaghunters-app:/:stage5-v2');calls.opens.push(name);return cache;},delete:()=>{throw Error('Mutation forbidden');}};
  const sw={controller:active,getRegistrations:async()=>[r],register:async()=>{calls.register++;return r;}};
  const ctx={URL,Date,setTimeout,clearTimeout,setInterval,clearInterval};vm.createContext(ctx);vm.runInContext(fs.readFileSync('v2-offline.js','utf8'),ctx);
  const api=ctx.V2OfflineAssets.create({base:origin,serviceWorker:sw,caches,online:()=>online,timeout:1000});
  return {api,r,worker,sw,caches,cache,calls,active,names,listeners};
}
test('offline preparation verifies retained static cache without registering or claiming a network check',async()=>{
  const f=fixture({online:false}),result=await f.api.prepare();assert.equal(result.offline,true);assert.equal(result.checkedOnline,false);assert.equal(result.state.cacheComplete,true);assert.equal(f.calls.update,0);assert.equal(f.calls.register,0);assert.deepEqual(f.names,['flaghunters-app:/:stage5-v2','flaghunters-stage1-feasibility-v1']);
});
test('missing cached asset is reported as incomplete without deleting surviving cache data',async()=>{
  const f=fixture({online:false,incomplete:true}),result=await f.api.prepare();assert.equal(result.state.cacheComplete,false);assert.equal(result.checkedOnline,false);assert.equal(f.names.length,2);
});
test('an existing active worker forces update and waits for the new installer rather than reporting old active worker success',async()=>{
  const f=fixture(),candidate=f.worker('installing');let finished=false;
  f.r.update=async()=>{f.calls.update++;f.r.installing=candidate;f.r.listener();};
  const task=f.api.prepare().then(result=>{finished=true;return result;});
  while(!f.listeners.has(candidate))await new Promise(r=>setImmediate(r));assert.equal(finished,false);assert.equal(f.r.active,f.active);
  f.r.installing=null;f.r.waiting=candidate;candidate.state='installed';f.listeners.get(candidate)();
  const result=await task;assert.equal(f.calls.update,1);assert.equal(f.calls.register,0);assert.equal(result.state.waiting,true);assert.equal(f.r.active,f.active);
});
test('network update failure rejects while retaining the complete prior cache and active worker',async()=>{
  const f=fixture();f.r.update=async()=>{f.calls.update++;throw new TypeError('Load failed');};await assert.rejects(f.api.prepare(),/Load failed/);assert.equal((await f.api.inspect()).cacheComplete,true);assert.equal(f.r.active,f.active);assert.equal(f.names.length,2);assert.equal(f.calls.register,0);
});
test('failed new installer cannot turn an existing active registration into a preparation success',async()=>{
  const f=fixture(),candidate=f.worker('redundant');f.r.update=async()=>{f.r.installing=candidate;f.r.listener();};await assert.rejects(f.api.prepare(),/could not be installed/);assert.equal(f.r.active,f.active);assert.equal((await f.api.inspect()).cacheComplete,true);assert.equal((await f.api.inspect()).installing,false);
});
test('another worker owning root is never updated or replaced',async()=>{
  const f=fixture();f.r.active={...f.active,scriptURL:'https://app.test/other-worker.js'};await assert.rejects(f.api.prepare(),/Another worker owns/);assert.equal(f.calls.update,0);assert.equal(f.calls.register,0);
});
test('first installation waits for activation instead of treating an activating worker as ready',async()=>{
  const f=fixture(),first=f.worker('activating');f.r.active=null;
  f.sw.register=async()=>{f.calls.register++;f.r.active=first;return f.r;};let finished=false;
  const task=f.api.prepare().then(result=>{finished=true;return result;});
  while(!f.listeners.has(first))await new Promise(r=>setImmediate(r));assert.equal(finished,false);
  first.state='activated';f.listeners.get(first)();const result=await task;
  assert.equal(result.state.workerReady,true);assert.equal(result.state.waiting,false);assert.equal(f.calls.register,1);assert.equal(f.calls.update,0);
});
