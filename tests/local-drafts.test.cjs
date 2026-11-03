const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {IDBFactory}=require('fake-indexeddb');
function local(indexedDB=new IDBFactory()) {
  const context={indexedDB,console};vm.createContext(context);vm.runInContext(fs.readFileSync('v2-local.js','utf8'),context);
  return {api:context.V2Local,indexedDB};
}
const who={backend:'https://test-backend.invalid/exec',eventId:'test-round',groupNo:1,credentialId:'group-credential'};
function snapshot(){return {meta:{course_snapshot_id:'course-v1',locked:false},course:[{hole:1,par:4}],groups:[{player_id:'p1',group_no:1,snapshot_id:'hcp-v1',playing_handicap:12}],scores:[],competitions:{config:{nearest_enabled:false}}};}
const payload=(hole=1,gross=4,extra={})=>({action:'saveHoleScores',eventId:who.eventId,hole,scores:[{playerId:'p1',status:gross===null?'pickup':'scored',gross,expectedRevision:0,reason:'',...extra}]});
const accepted=(hole=1,gross=4,revision=1)=>[{event_id:who.eventId,player_id:'p1',hole,gross,score_status:gross===null?'pickup':'scored',stableford:2,revision}];
async function db(factory){return new Promise((resolve,reject)=>{const r=factory.open('flaghunters-v2-local',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}

test('local transaction commits before reporting a saved draft; record survives a fresh module instance',async()=>{
  const h=local();await h.api.prepare(who,snapshot());
  const database=await db(h.indexedDB),prototype=Object.getPrototypeOf(database),original=prototype.transaction;let complete=false;
  prototype.transaction=function(names,mode,...args){const tx=original.call(this,names,mode,...args);if(mode==='readwrite')tx.addEventListener('complete',()=>{complete=true;});return tx;};
  try {const record=await h.api.saveDraft(who,payload(),'durable_operation_0001');assert.equal(complete,true);assert.equal(record.status,'local');}
  finally{prototype.transaction=original;database.close();}
  const reopened=local(h.indexedDB).api,records=await reopened.pending(who);assert.equal(records.length,1);assert.equal(records[0].request.scores[0].gross,4);
});
test('transaction abort after request success cannot claim a durable save or leave a partial record',async()=>{
  const h=local();await h.api.prepare(who,snapshot());
  const database=await db(h.indexedDB),prototype=Object.getPrototypeOf(database),original=prototype.transaction;
  prototype.transaction=function(names,mode,...args){const tx=original.call(this,names,mode,...args);if(mode==='readwrite'&&names.includes('drafts')){const store=tx.objectStore('drafts'),add=store.add.bind(store);store.add=value=>{const r=add(value);r.addEventListener('success',()=>tx.abort());return r;};}return tx;};
  try {await assert.rejects(h.api.saveDraft(who,payload(),'aborted_operation_001'),/abort/i);}finally{prototype.transaction=original;database.close();}
  assert.equal((await h.api.pending(who)).length,0);
});
test('pending payload and stable operation ID are retained, never overwritten by later local edits',async()=>{
  const h=local();await h.api.prepare(who,snapshot());
  const original=await h.api.saveDraft(who,payload(),'same_operation_id_001');
  const repeated=await h.api.saveDraft(who,payload(),'different_operation_02');assert.equal(repeated.operationId,original.operationId);
  await assert.rejects(h.api.saveDraft(who,payload(1,5),'different_operation_03'),/unaccepted local save/);
  await assert.rejects(h.api.saveDraft(who,payload(2,5),'same_operation_id_001'));
  assert.equal((await h.api.pending(who)).length,1);assert.equal((await h.api.pending(who))[0].request.scores[0].gross,4);
});
test('server acceptance updates snapshot and draft together, and invalid acknowledgements retain recovery data',async()=>{
  const h=local();await h.api.prepare(who,snapshot());const d=await h.api.saveDraft(who,payload(),'accept_operation_001');
  await h.api.markSending(d.operationId);await assert.rejects(h.api.accept(d.operationId,accepted(1,9)),/does not match/);
  assert.equal((await h.api.pending(who)).length,1);assert.equal((await h.api.getSnapshot(who)).acceptedScores.length,0);
  await h.api.accept(d.operationId,accepted());assert.equal((await h.api.pending(who)).length,0);
  assert.equal((await h.api.getSnapshot(who)).acceptedScores[0].revision,1);
  await assert.rejects(h.api.forget(who),/confirmation/);await h.api.forget(who,true);assert.equal(await h.api.getSnapshot(who),null);
});
test('pending or ambiguous saves cannot be cleared, even after credential removal or another bootstrap',async()=>{
  const h=local();await h.api.prepare(who,snapshot());
  await h.api.putSession(who.backend,who.eventId,1,{token:'group-credential.private-secret',credentialId:who.credentialId,expires_at:Date.now()+10000});
  const d=await h.api.saveDraft(who,payload(),'recovery_operation_01');await h.api.markSending(d.operationId);await h.api.problem(d.operationId,'Response lost; acceptance unknown');
  await h.api.removeSession(who.backend,who.eventId,1);assert.equal((await h.api.pending(who)).length,1);
  const newer=snapshot();newer.scores=accepted();await h.api.prepare(who,newer);
  assert.equal((await h.api.saveDraft(who,payload(),'replacement_id_0001')).operationId,d.operationId,'retry must preserve original body after bootstrap');
  await assert.rejects(h.api.forget(who,true),/cannot be cleared/);
  const exportData=JSON.stringify(await h.api.recovery());assert.ok(exportData.includes('recovery_operation_01'));assert.ok(exportData.includes('needs-review'));assert.equal(exportData.includes('private-secret'),false);assert.equal(exportData.includes('"token"'),false);
});
test('identity separates backend, round, group and credential; no private scores enter another scope',async()=>{
  const h=local();await h.api.prepare(who,snapshot());await h.api.saveDraft(who,payload(16,null),'private_hole_operation');
  for(const other of [{...who,backend:'https://other.invalid'},{...who,eventId:'another-round'},{...who,groupNo:2},{...who,credentialId:'rotated-credential'}]){assert.equal(await h.api.getSnapshot(other),null);assert.equal((await h.api.pending(other)).length,0);}
  assert.equal((await h.api.pending({backend:who.backend,eventId:who.eventId,groupNo:1})).length,1,'old credential data stays visible for recovery/Finish gating');
});
test('local validation preserves pickups, revision checks, reasons, group bounds and known reveal locks',async()=>{
  const h=local();await h.api.prepare(who,snapshot());
  await assert.rejects(h.api.saveDraft(who,payload(1,0),'invalid_score_000001'),/Invalid score/);
  await assert.rejects(h.api.saveDraft(who,payload(1,4,{playerId:'other'}),'invalid_group_000001'),/outside/);
  const s=snapshot();s.scores=accepted();await h.api.prepare(who,s);
  await assert.rejects(h.api.saveDraft(who,payload(1,5),'stale_revision_00001'),/revision/);
  await assert.rejects(h.api.saveDraft(who,payload(1,5,{expectedRevision:1}),'missing_reason_00001'),/reason/);
  await h.api.saveDraft(who,payload(1,null,{expectedRevision:1,reason:'Picked up after checking card'}),'pickup_correction_001');
  s.meta.revealed_at='server-reveal';await h.api.prepare(who,s);
  await assert.rejects(h.api.saveDraft(who,payload(2,4),'locked_operation_001'),/permanently locked/);
  assert.equal((await h.api.pending(who)).length,1,'locks never erase a pending score');
});
test('unavailable storage fails closed and credentials persist without exporting PIN/admin secrets',async()=>{
  const missing=local(null);await assert.rejects(missing.api.saveDraft(who,payload(),'no_storage_operation'),/unavailable/);
  const h=local();await h.api.putSession(who.backend,who.eventId,1,{token:'scorer.secret',credentialId:'scorer',expires_at:Date.now()+10000});
  assert.equal((await local(h.indexedDB).api.getSession(who.backend,who.eventId,1)).token,'scorer.secret');
  assert.equal(JSON.stringify(await h.api.recovery()).includes('secret'),false);
});

test('failed acknowledgement transaction cannot partially overwrite accepted snapshot or remove pending data',async()=>{
  const h=local();await h.api.prepare(who,snapshot());const draft=await h.api.saveDraft(who,payload(),'atomic_ack_operation1');
  const database=await db(h.indexedDB),prototype=Object.getPrototypeOf(database),original=prototype.transaction;
  prototype.transaction=function(names,mode,...args){const tx=original.call(this,names,mode,...args);if(mode==='readwrite'&&names.includes('snapshots')){const store=tx.objectStore('snapshots'),put=store.put.bind(store);store.put=value=>{const r=put(value);r.addEventListener('success',()=>tx.abort());return r;};}return tx;};
  try{await assert.rejects(h.api.accept(draft.operationId,accepted()),/abort/i);}finally{prototype.transaction=original;database.close();}
  assert.equal((await h.api.getSnapshot(who)).acceptedScores.length,0);assert.equal((await h.api.pending(who)).length,1);
  await h.api.accept(draft.operationId,accepted());assert.equal((await h.api.pending(who)).length,0);
});
test('quota/storage errors abort rather than returning a fake successful save',async()=>{
  const h=local();await h.api.prepare(who,snapshot());
  const database=await db(h.indexedDB),prototype=Object.getPrototypeOf(database),original=prototype.transaction;
  prototype.transaction=function(names,mode,...args){const tx=original.call(this,names,mode,...args);if(mode==='readwrite'&&names.includes('drafts'))tx.objectStore('drafts').add=()=>{throw new DOMException('Storage full','QuotaExceededError');};return tx;};
  try{await assert.rejects(h.api.saveDraft(who,payload(),'quota_operation_0001'),/Storage full/);}finally{prototype.transaction=original;database.close();}
  assert.equal((await h.api.pending(who)).length,0);
});
test('unknown future database version fails closed without deleting its stored data',async()=>{
  const factory=new IDBFactory();await new Promise((resolve,reject)=>{const r=factory.open('flaghunters-v2-local',2);r.onupgradeneeded=()=>r.result.createObjectStore('future').put('retained','marker');r.onsuccess=()=>{r.result.close();resolve();};r.onerror=()=>reject(r.error);});
  await assert.rejects(local(factory).api.pending(),{name:'VersionError'});
  const retained=await new Promise(resolve=>{const r=factory.open('flaghunters-v2-local',2);r.onsuccess=()=>{const read=r.result.transaction('future').objectStore('future').get('marker');read.onsuccess=()=>{r.result.close();resolve(read.result);};};});assert.equal(retained,'retained');
});
