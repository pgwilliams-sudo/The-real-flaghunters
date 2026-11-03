const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const {IDBFactory}=require('fake-indexeddb');
const {harness}=require('./harness.cjs');
async function fixture({indexedDB=new IDBFactory(),h=harness()}={}) {
  const ctx={indexedDB,AbortController,crypto,setTimeout,clearTimeout};vm.createContext(ctx);
  for(const p of ['v2-local.js','v2-sync.js'])vm.runInContext(fs.readFileSync(p,'utf8'),ctx);
  const local=ctx.V2Local,who={backend:'test-backend',eventId:'v2-event',groupNo:1,credentialId:h.group.split('.')[0]};
  const boot=h.post({action:'roundBootstrap',credential:h.group,eventId:who.eventId,groupNo:1});
  await local.prepare(who,boot);
  const save=async(hole=1)=>local.saveDraft(who,{action:'saveHoleScores',eventId:who.eventId,hole,scores:[1,2,3,4].map(i=>({playerId:'p'+i,status:'scored',gross:4,expectedRevision:0,reason:''}))},crypto.randomUUID());
  const calls=[],timers=new Map();let timer=0;
  const create=(transport,extra={})=>ctx.V2Sync.create({local,backend:who.backend,owner:crypto.randomUUID(),credential:async()=>({token:h.group}),transport:async(data,options)=>{calls.push(JSON.parse(JSON.stringify(data)));const result=transport?await transport(data,options):h.post(data);if(result?.ok===false)throw Error(result.error);return result;},schedule:(fn,delay)=>{timers.set(++timer,{fn,delay});return timer;},cancel:id=>timers.delete(id),...extra});
  return {local,who,h,save,calls,timers,create,indexedDB};
}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
const tick=()=>new Promise(r=>setImmediate(r));
test('ordered uploads wait for earlier acceptance; duplicate triggers coalesce; stable sequence resolves identical timestamps',async()=>{
  const f=await fixture(),a=await f.save(1),b=await f.save(2),gate=deferred();
  assert.ok(b.sequence>a.sequence);
  const sync=f.create(async d=>{if(d.hole===1)await gate.promise;return f.h.post(d);});
  const first=sync.kick();while(!f.calls.length)await tick();const duplicate=sync.kick();
  assert.deepEqual(f.calls.map(d=>d.hole),[1]);assert.equal((await f.local.getDraft(a.operationId)).status,'syncing');
  gate.resolve();await Promise.all([first,duplicate]);
  assert.deepEqual(f.calls.filter(d=>d.action==='saveHoleScores').map(d=>d.hole),[1,2]);
  assert.equal((await f.local.pending()).length,0);assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,8);sync.stop();
});
test('interrupted upload after server commit reconciles after reload without duplicate history or a second mutation',async()=>{
  const f=await fixture(),draft=await f.save();
  const sync=f.create(async d=>{const result=f.h.post(d);if(d.action==='saveHoleScores')throw new TypeError('Response lost');return result;});
  await sync.kick();sync.stop();assert.equal((await f.local.pending()).length,1);assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,4);
  const reopened=await fixture({indexedDB:f.indexedDB,h:f.h}),next=reopened.create();await next.kick({force:true});
  assert.equal((await reopened.local.pending()).length,0);assert.equal(reopened.calls[0].action,'operationStatus');
  assert.equal(reopened.calls[0].operationId,draft.operationId);assert.equal(reopened.calls.filter(d=>d.action==='saveHoleScores').length,0);
  assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,4);next.stop();
});
test('offline-to-online retry replays identical ID and payload then drains in order',async()=>{
  const f=await fixture(),a=await f.save(1);await f.save(2);let offline=true;
  const sync=f.create(d=>{if(offline)throw new TypeError('Offline');return f.h.post(d);});
  await sync.kick();assert.equal(f.calls.length,1);assert.equal((await f.local.pending()).length,2);
  offline=false;await sync.kick({force:true});assert.equal((await f.local.pending()).length,0);
  const writes=f.calls.filter(d=>d.action==='saveHoleScores');assert.deepEqual(writes.map(d=>d.hole),[1,1,2]);
  assert.deepEqual(writes[0],writes[1]);assert.equal(writes[1].operationId,a.operationId);sync.stop();
});
test('server conflict is retained, stops the group stream and never rebases on automatic or manual retry',async()=>{
  const f=await fixture(),a=await f.save(1);await f.save(2);
  assert.equal(f.h.save({scores:[1,2,3,4].map(i=>({playerId:'p'+i,status:'scored',gross:5,expectedRevision:0}))}).ok,true);
  const sync=f.create();await sync.kick();assert.equal((await f.local.getDraft(a.operationId)).status,'needs-review');
  const n=f.calls.length;await sync.kick({force:true});assert.equal(f.calls.length,n);
  await sync.kick({force:true,review:true});assert.equal(f.calls.at(-1).scores[0].expectedRevision,0);
  assert.ok(f.calls.every(d=>d.hole===1));assert.equal((await f.local.pending()).length,2);assert.equal(f.h.ctx.getScores('v2-event')[0].gross,5);sync.stop();
});
test('cross-tab lease prevents parallel senders and expires after crashed owner',async()=>{
  const f=await fixture();await f.save();const gate=deferred();
  const one=f.create(async d=>{await gate.promise;return f.h.post(d);}),two=f.create();
  const task=one.kick();while(!f.calls.length)await tick();await two.kick();assert.equal(f.calls.length,1);
  gate.resolve();await task;one.stop();two.stop();
  const g=await fixture();await g.save();await g.local.lease(g.who,'crashed',0);
  const recovered=g.create(null,{now:()=>60001});await recovered.kick();assert.equal((await g.local.pending()).length,0);recovered.stop();
});
test('lost response can be reconciled with rotated group credential; absent old operation cannot be impersonated',async()=>{
  for(const committed of [true,false]) {
    const f=await fixture(),draft=await f.save();await f.local.markSending(draft.operationId);
    if(committed)assert.equal(f.h.post({...draft.request,operationId:draft.operationId,credential:f.h.group}).ok,true);
    const issued=f.h.post({action:'issueGroupCredential',credential:f.h.admin,eventId:'v2-event',groupNo:1});
    const fresh=f.h.post({action:'openGroup',eventId:'v2-event',groupNo:1,pin:issued.pin});
    const sync=f.create(null,{credential:async()=>({token:fresh.token})});await sync.kick();
    assert.ok(f.calls.every(d=>d.action==='operationStatus'));
    assert.equal((await f.local.pending()).length,committed?0:1);
    if(!committed)assert.match((await f.local.getDraft(draft.operationId)).lastError,/different identity/);
    sync.stop();
  }
});
test('offline retries use bounded exponential backoff and stop after five failures',async()=>{
  const f=await fixture(),draft=await f.save();let clock=0;
  const sync=f.create(()=>{throw new TypeError('Offline');},{now:()=>clock});
  await sync.kick();
  for(let i=1;i<5;i++){
    const [id,timer]=[...f.timers.entries()][0];assert.ok(timer.delay<=30000);f.timers.delete(id);clock+=timer.delay;await timer.fn();
    while((await f.local.getDraft(draft.operationId)).syncFailures<i+1)await tick();
    // Let onChange/finally finish before the next scheduled trigger.
    await tick();await tick();
  }
  assert.equal(f.timers.size,0);assert.equal((await f.local.getDraft(draft.operationId)).syncFailures,5);
  assert.equal((await f.local.pending()).length,1);assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,0);sync.stop();
});
test('operation status cannot disclose another group, wrong round, modified payload or unauthenticated result; remains readable after reveal',()=>{
  const h=harness(),operationId=crypto.randomUUID(),request={eventId:'v2-event',hole:16,scores:[{playerId:'p1',status:'scored',gross:4,expectedRevision:0}]};
  assert.equal(h.save({...request,operationId}).ok,true);
  const data={...request,action:'operationStatus',operationId,credential:h.group,groupNo:1};
  assert.equal(h.post(data).state,'COMMITTED');
  for(const change of [{credential:h.group2},{credential:''},{eventId:'other'},{hole:17},{scores:[{playerId:'p5',status:'scored',gross:4,expectedRevision:0}]}])assert.equal(h.post({...data,...change}).ok,false);
  const row=h.sheets.get('RoundEventsV2').rows[1],meta=JSON.parse(row[1]);meta.locked=true;meta.revealed_at='test';row[1]=JSON.stringify(meta);
  assert.equal(h.post(data).state,'COMMITTED');assert.match(h.save({...request,operationId}).error,/permanently locked/);
  assert.equal(JSON.stringify(h.post(data)).includes(h.group),false);
});
test('PREPARED operation status recovers its one immutable history chain after interrupted server writes',()=>{
  const h=harness(),operationId=crypto.randomUUID(),request={eventId:'v2-event',hole:1,scores:[{playerId:'p1',status:'pickup',gross:null,expectedRevision:0}]};
  h.fault(2,'before');h.save({...request,operationId});h.clearFault();
  const data={...request,operationId,action:'operationStatus',credential:h.group,groupNo:1};
  assert.equal(h.post(data).state,'COMMITTED');assert.equal(h.post(data).state,'COMMITTED');assert.equal(h.ctx.v2Rows('ScoreHistory').length,1);
});
test('bounded upload timeout aborts the transport and retains an unchanged recoverable request',async()=>{
  const f=await fixture(),draft=await f.save();let signal;
  const sync=f.create((_,options)=>{signal=options.signal;return new Promise(()=>{});});
  const task=sync.kick();while(!signal)await tick();
  const deadline=[...f.timers.values()].find(t=>t.delay===25000);assert.ok(deadline);deadline.fn();await task;
  assert.equal(signal.aborted,true);const retained=await f.local.getDraft(draft.operationId);
  assert.equal(retained.status,'local');assert.match(retained.lastError,/timed out/);assert.equal(retained.fingerprint,draft.fingerprint);sync.stop();
});
test('failed durable acknowledgement retains evidence then reconciles acceptance without another score write',async()=>{
  const f=await fixture(),draft=await f.save(),accept=f.local.accept;let first=true;
  f.local.accept=async(...args)=>{if(first){first=false;throw new DOMException('Interrupted acknowledgement','AbortError');}return accept(...args);};
  const sync=f.create();await sync.kick();assert.equal((await f.local.pending()).length,1);
  await sync.kick({force:true});assert.equal((await f.local.pending()).length,0);
  assert.equal(f.calls.filter(d=>d.action==='saveHoleScores').length,1);assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,4);
  assert.equal((await f.local.getDraft(draft.operationId)).status,'accepted');sync.stop();
});
test('Stage 2 network-failure records resume automatically, while rejected legacy records remain blocked',async()=>{
  for(const [message,accepted] of [['Load failed',true],['Score changed on another device. Reload before correcting.',false]]) {
    const f=await fixture(),draft=await f.save();await f.local.markSending(draft.operationId);await f.local.problem(draft.operationId,message);
    const sync=f.create();await sync.kick();assert.equal((await f.local.pending()).length,accepted?0:1);
    if(!accepted)assert.equal(f.calls.length,0);sync.stop();
  }
});
test('late bootstrap cannot erase an accepted queue acknowledgement or regress a known reveal lock',async()=>{
  const f=await fixture(),stale=f.h.post({action:'roundBootstrap',credential:f.h.group,eventId:'v2-event',groupNo:1});
  await f.save();const sync=f.create();await sync.kick();assert.equal((await f.local.getSnapshot(f.who)).acceptedScores.length,4);
  await f.local.prepare(f.who,stale);assert.equal((await f.local.getSnapshot(f.who)).acceptedScores.length,4);
  const locked={...stale,meta:{...stale.meta,locked:true,revealed_at:'test-reveal'}};await f.local.prepare(f.who,locked);
  await f.local.prepare(f.who,stale);assert.equal((await f.local.getSnapshot(f.who)).meta.locked,true);sync.stop();
});
test('truncated JSON after commit is ambiguous and reconciled rather than rejected or duplicated',async()=>{
  const f=await fixture();await f.save();let lost=true;
  const sync=f.create(d=>{const result=f.h.post(d);if(d.action==='saveHoleScores'&&lost){lost=false;throw new SyntaxError('Unexpected end of JSON input');}return result;});
  await sync.kick();assert.equal((await f.local.pending())[0].status,'local');
  await sync.kick({force:true});assert.equal((await f.local.pending()).length,0);
  assert.equal(f.calls.filter(d=>d.action==='saveHoleScores').length,1);assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,4);sync.stop();
});
