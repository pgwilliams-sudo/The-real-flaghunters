const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const {IDBFactory}=require('fake-indexeddb'),{harness}=require('./harness.cjs');
async function fixture({h=harness(),indexedDB=new IDBFactory()}={}) {
  const ctx={indexedDB,crypto,AbortController,setTimeout,clearTimeout};vm.createContext(ctx);
  for(const p of ['v2-local.js','v2-sync.js','v2-recovery.js'])vm.runInContext(fs.readFileSync(p,'utf8'),ctx);
  const local=ctx.V2Local,who={backend:'test',eventId:'v2-event',groupNo:1,credentialId:h.group.split('.')[0]};
  const boot=h.post({action:'roundBootstrap',credential:h.group,eventId:'v2-event',groupNo:1});await local.prepare(who,boot);
  const calls=[];let token=h.group,lost=false;
  async function transport(data){calls.push(data);const result=h.post(data);if(lost&&data.action==='resolveOperation'){lost=false;throw new TypeError('Accepted response lost');}if(!result.ok)throw Error(result.error);return result;}
  const credential=async()=>({token});
  const recovery=ctx.V2Recovery.create({local,transport,credential,backend:who.backend});
  const sync=ctx.V2Sync.create({local,transport,credential,backend:who.backend,owner:crypto.randomUUID(),schedule:()=>0,cancel:()=>{}});
  const save=async(hole=1)=>local.saveDraft(who,{action:'saveHoleScores',eventId:who.eventId,hole,scores:[1,2,3,4].map(i=>({playerId:'p'+i,status:'scored',gross:4,expectedRevision:0,reason:''}))},crypto.randomUUID());
  return {ctx,local,who,h,save,calls,recovery,sync,indexedDB,token:value=>{token=value;},lose:()=>{lost=true;}};
}
async function conflict(f) {
  const draft=await f.save();assert.equal(f.h.save({scores:[1,2,3,4].map(i=>({playerId:'p'+i,status:i===2?'pickup':'scored',gross:i===2?null:5,expectedRevision:0}))}).ok,true);
  await f.sync.kick();return draft;
}
test('invalid credentials stop after one attempt across repeated reconnect/resume triggers; manual Retry is explicit',async()=>{
  const f=await fixture(),draft=await f.save();f.token('expired.invalid');
  await f.sync.kick();const n=f.calls.length;
  for(let i=0;i<5;i++)await f.sync.kick({force:true});
  assert.equal(f.calls.length,n);assert.equal((await f.local.getDraft(draft.operationId)).failureKind,'credential');
  await f.sync.kick({force:true,review:true});assert.ok(f.calls.length>n);assert.equal((await f.local.pending()).length,1);f.sync.stop();
});
test('old rounds never generate automatic requests or block the active stream',async()=>{
  const f=await fixture(),draft=await f.save();
  const current=ctxSync(f,()=> 'different-round');await current.kick({force:true,review:true});assert.equal(f.calls.length,0);assert.equal((await f.local.pending()).length,1);current.stop();f.sync.stop();
  function ctxSync(f,activeEvent){return f.ctx.V2Sync.create({local:f.local,transport:async d=>{f.calls.push(d);throw Error('Unexpected old-round request');},credential:async()=>({token:f.h.group}),backend:'test',activeEvent,owner:'new-owner'});}
});
test('explicit conflict review shows both values, requires confirmation and preserves original immutable request',async()=>{
  const f=await fixture(),draft=await conflict(f),review=await f.recovery.review(draft.operationId);
  assert.equal(review.serverScores[0].gross,5);assert.equal(review.draft.request.scores[0].gross,4);
  await assert.rejects(f.recovery.decide(review,'local',['p1'],'Reviewed two-device correction',false),/Confirm/);
  await f.recovery.decide(review,'local',['p1'],'Reviewed two-device correction',true);
  await f.sync.kick({force:true,review:true});const resolved=await f.local.getDraft(draft.operationId);
  assert.equal(resolved.status,'resolved');assert.equal(resolved.fingerprint,draft.fingerprint);
  assert.equal(JSON.stringify(resolved.request),JSON.stringify(draft.request));
  const scores=f.h.ctx.getScores('v2-event');assert.equal(scores.find(s=>s.player_id==='p1').gross,4);assert.equal(scores.find(s=>s.player_id==='p2').score_status,'pickup');
  const history=f.h.ctx.v2Rows('ScoreHistory').map(r=>JSON.parse(r.data));assert.equal(history.length,5);assert.equal(history.at(-1).reason,'Reviewed two-device correction');
  assert.equal((await f.local.pending()).length,0);f.sync.stop();
});
test('keep-server decision preserves rejected local data, creates no correction and tombstones a delayed original upload',async()=>{
  const f=await fixture(),draft=await conflict(f),review=await f.recovery.review(draft.operationId);
  await f.recovery.decide(review,'server',[],'',true);await f.sync.kick({force:true,review:true});
  assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,4);assert.equal((await f.local.getDraft(draft.operationId)).resolution.outcome,'kept-server');
  assert.match(f.h.post({...draft.request,operationId:draft.operationId,credential:f.h.group}).error,/resolved after review/);
  assert.equal(f.h.ctx.getScores('v2-event')[0].gross,5);assert.ok(JSON.stringify(await f.local.recovery()).includes(draft.operationId));f.sync.stop();
});
test('another device changing the reviewed score before confirmation rejects without overwrite or cancelling original',async()=>{
  const f=await fixture(),draft=await conflict(f),review=await f.recovery.review(draft.operationId);
  assert.equal(f.h.save({scores:[{playerId:'p1',status:'scored',gross:6,expectedRevision:1,reason:'Later device correction'}]}).ok,true);
  await f.recovery.decide(review,'local',['p1'],'First review',true);await f.sync.kick({force:true,review:true});
  assert.equal((await f.local.pending()).length,1);assert.equal(f.h.ctx.getScores('v2-event')[0].gross,6);assert.equal(f.h.ctx.v2Rows('ScoreOperations').some(r=>r.operation_id===draft.operationId),false);
  const next=await f.recovery.review(draft.operationId);await f.recovery.decide(next,'local',['p1'],'Fresh explicit review',true);await f.sync.kick({force:true,review:true});
  assert.equal((await f.local.pending()).length,0);assert.equal((await f.local.getDraft(draft.operationId)).recoveryHistory.length,1);f.sync.stop();
});
test('deterministic accepted recovery response loss survives reopen and resolves without duplicate correction/history',async()=>{
  const f=await fixture(),draft=await conflict(f),review=await f.recovery.review(draft.operationId);
  await f.recovery.decide(review,'local',['p1'],'Accepted response loss',true);const intent=(await f.local.getDraft(draft.operationId)).recoveryIntent;
  f.lose();await f.sync.kick({force:true,review:true});assert.equal((await f.local.pending()).length,1);assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,5);f.sync.stop();
  const reopened=await fixture({h:f.h,indexedDB:f.indexedDB});await reopened.sync.kick({force:true});
  assert.equal((await reopened.local.pending()).length,0);assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,5);
  assert.equal((await reopened.local.getDraft(draft.operationId)).recoveryIntent.resolutionId,intent.resolutionId);
  assert.equal(reopened.calls.filter(d=>d.action==='saveHoleScores').length,0);reopened.sync.stop();
});
test('reveal during review cannot be bypassed by recovery and retains every pending entry',async()=>{
  const f=await fixture(),draft=await conflict(f),review=await f.recovery.review(draft.operationId);
  const row=f.h.sheets.get('RoundEventsV2').rows[1],meta=JSON.parse(row[1]);meta.locked=true;meta.revealed_at='test';row[1]=JSON.stringify(meta);
  await f.recovery.decide(review,'local',['p1'],'Late test',true);await f.sync.kick({force:true,review:true});
  assert.equal((await f.local.pending()).length,1);assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,4);assert.match((await f.local.getDraft(draft.operationId)).lastError,/permanently locked/);f.sync.stop();
});
test('recovery requires valid same-group authentication, not a forged role or another group',async()=>{
  const f=await fixture(),draft=await conflict(f);
  for(const token of [f.h.group2,''])assert.equal(f.h.post({...draft.request,action:'reviewOperation',operationId:draft.operationId,credential:token,groupNo:1}).ok,false);
  const review=await f.recovery.review(draft.operationId);await f.recovery.decide(review,'server',[],'',true);
  const request={action:'resolveOperation',original:{...draft.request,operationId:draft.operationId,groupNo:1},...(await f.local.getDraft(draft.operationId)).recoveryIntent,credential:f.h.group2};
  assert.equal(f.h.post(request).ok,false);assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,4);f.sync.stop();
});
test('committed operation-status reads take no script lock; PREPARED recovery still takes it',()=>{
  const h=harness(),operationId=crypto.randomUUID();h.save({operationId});let locks=0;
  const original=h.ctx.LockService.getScriptLock;h.ctx.LockService.getScriptLock=()=>{locks++;return original();};
  assert.equal(h.post({action:'operationStatus',eventId:'v2-event',hole:1,scores:[{playerId:'p1',status:'pickup',gross:null,expectedRevision:0}],operationId,credential:h.group}).state,'COMMITTED');assert.equal(locks,0);
  const next=crypto.randomUUID();h.fault(2,'before');h.save({operationId:next,hole:2});h.clearFault();locks=0;
  assert.equal(h.post({action:'operationStatus',eventId:'v2-event',hole:2,scores:[{playerId:'p1',status:'pickup',gross:null,expectedRevision:0}],operationId:next,credential:h.group}).state,'COMMITTED');assert.equal(locks,1);
});
test('quota failure while confirming recovery leaves the original record and request intact',async()=>{
  const f=await fixture(),draft=await conflict(f),review=await f.recovery.review(draft.operationId);
  const proto=require('fake-indexeddb').IDBObjectStore.prototype,put=proto.put;
  proto.put=function(...args){if(this.name==='drafts')throw new DOMException('Storage full','QuotaExceededError');return put.apply(this,args);};
  try {await assert.rejects(f.recovery.decide(review,'server',[],'',true),{name:'QuotaExceededError'});}finally{proto.put=put;}
  const retained=await f.local.getDraft(draft.operationId);assert.equal(retained.recoveryIntent,undefined);assert.equal(retained.fingerprint,draft.fingerprint);assert.match(f.ctx.V2Recovery.message(new DOMException('Full','QuotaExceededError')),/not completed/);f.sync.stop();
});
test('every interrupted server recovery write resumes the same decision with one correction and retained cancellation audit',async()=>{
  async function setup() {
    const f=await fixture(),draft=await conflict(f),review=await f.recovery.review(draft.operationId);
    await f.recovery.decide(review,'local',['p1'],'Crash boundary recovery',true);
    const request={action:'resolveOperation',original:{...draft.request,operationId:draft.operationId,groupNo:1},...(await f.local.getDraft(draft.operationId)).recoveryIntent,credential:f.h.group};
    return {...f,draft,request};
  }
  const baseline=await setup();baseline.h.clearFault();assert.equal(baseline.h.post(baseline.request).ok,true);const boundaries=baseline.h.writes;baseline.sync.stop();assert.ok(boundaries>=8);
  for(const when of ['before','after'])for(let n=1;n<=boundaries;n++) {
    const f=await setup();f.h.fault(n,when);f.h.post(f.request);f.h.clearFault();
    const resumed=f.h.post(f.request);assert.equal(resumed.ok,true,JSON.stringify({n,when,resumed}));assert.equal(f.h.post(f.request).ok,true);
    assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,5);assert.equal(f.h.ctx.getScores('v2-event').find(s=>s.player_id==='p1').revision,2);
    assert.equal(f.h.ctx.v2Rows('ScoreOperations').find(r=>r.operation_id===f.draft.operationId).state,'CANCELLED');f.sync.stop();
  }
});
test('recovery request ID cannot change its decision and cannot impersonate an accepted earlier operation',async()=>{
  const f=await fixture(),draft=await conflict(f),review=await f.recovery.review(draft.operationId);
  await f.recovery.decide(review,'server',[],'',true);
  const request={action:'resolveOperation',original:{...draft.request,operationId:draft.operationId,groupNo:1},...(await f.local.getDraft(draft.operationId)).recoveryIntent,credential:f.h.group};
  assert.equal(f.h.post(request).ok,true);assert.equal(f.h.post({...request,choice:'local'}).ok,false);
  assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,4);f.sync.stop();
});
test('recovery correction reasons are retained and BLOB resubmission has null Gross',async()=>{
  const f=await fixture();await f.local.saveDraft(f.who,{action:'saveHoleScores',eventId:'v2-event',hole:1,scores:[1,2,3,4].map(i=>({playerId:'p'+i,status:i===1?'pickup':'scored',gross:i===1?null:4,expectedRevision:0,reason:'Original reason'}))},'blob_recovery_original_1');
  f.h.save({scores:[1,2,3,4].map(i=>({playerId:'p'+i,status:'scored',gross:5,expectedRevision:0}))});await f.sync.kick();
  const d=(await f.local.pending())[0],review=await f.recovery.review(d.operationId);await f.recovery.decide(review,'local',['p1'],'Reviewed on phone',true);await f.sync.kick({force:true,review:true});
  const score=f.h.ctx.getScores('v2-event').find(s=>s.player_id==='p1');assert.equal(score.gross,null);assert.equal(score.score_status,'pickup');
  const history=f.h.ctx.v2Rows('ScoreHistory').map(r=>JSON.parse(r.data));assert.equal(history.at(-1).reason,'Original reason | Reviewed on phone');f.sync.stop();
});
test('manual Retry cannot resubmit a conflict while the user is reviewing or has not confirmed',async()=>{
  const f=await fixture(),draft=await conflict(f);await f.recovery.review(draft.operationId);const count=f.calls.length;
  await f.sync.kick({force:true,review:true});assert.equal(f.calls.length,count);assert.equal((await f.local.getDraft(draft.operationId)).recoveryIntent,undefined);f.sync.stop();
});
test('keeping an empty server state never invents zero scores and leaves completion holes missing',async()=>{
  const f=await fixture(),draft=await f.save(),review=await f.recovery.review(draft.operationId);
  await f.recovery.decide(review,'server',[],'',true);await f.sync.kick({force:true,review:true});
  assert.equal((await f.local.pending()).length,0);assert.equal(f.h.ctx.getScores('v2-event').length,0);assert.equal((await f.local.getSnapshot(f.who)).acceptedScores.length,0);assert.equal(f.h.post({action:'completeGroup',eventId:'v2-event',groupNo:1,credential:f.h.group}).ok,false);f.sync.stop();
});
test('expired session recovery uses fresh scoped authentication only after explicit review and audits the new actor',async()=>{
  const f=await fixture(),draft=await f.save();
  const issued=f.h.post({action:'issueGroupCredential',credential:f.h.admin,eventId:'v2-event',groupNo:1});
  await f.sync.kick();assert.equal((await f.local.getDraft(draft.operationId)).failureKind,'credential');
  const opened=f.h.post({action:'openGroup',eventId:'v2-event',groupNo:1,pin:issued.pin});f.token(opened.token);
  const review=await f.recovery.review(draft.operationId);assert.equal(f.h.ctx.getScores('v2-event').length,0);
  await f.recovery.decide(review,'local',['p1','p2','p3','p4'],'Explicit reauthorized submission',true);await f.sync.kick({force:true,review:true});
  assert.equal((await f.local.pending()).length,0);const history=f.h.ctx.v2Rows('ScoreHistory').map(r=>JSON.parse(r.data));
  assert.equal(history.length,4);assert.equal(history[0].actor.credential_id,opened.credential_id);
  const exported=JSON.stringify(await f.local.recovery());for(const token of [opened.token,f.h.group,f.h.admin])assert.equal(exported.includes(token),false);f.sync.stop();
});
test('failed recovery acknowledgement transaction is atomic and can be resumed from the saved intent',async()=>{
  const f=await fixture(),draft=await conflict(f),review=await f.recovery.review(draft.operationId);
  await f.recovery.decide(review,'local',['p1'],'Durable recovery acknowledgement',true);
  const intent=(await f.local.getDraft(draft.operationId)).recoveryIntent;
  const result=f.h.post({action:'resolveOperation',original:{...draft.request,operationId:draft.operationId,groupNo:1},...intent,credential:f.h.group});assert.equal(result.ok,true);
  const proto=require('fake-indexeddb').IDBObjectStore.prototype,put=proto.put;
  proto.put=function(...args){if(this.name==='snapshots')throw new DOMException('Storage full','QuotaExceededError');return put.apply(this,args);};
  try{await assert.rejects(f.local.finishRecovery(draft.operationId,result),{name:'QuotaExceededError'});}finally{proto.put=put;}
  const retained=await f.local.getDraft(draft.operationId);assert.equal(retained.status,'recovering');assert.equal(retained.recoveryIntent.resolutionId,intent.resolutionId);
  await f.sync.kick({force:true,review:true});assert.equal((await f.local.pending()).length,0);assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,5);f.sync.stop();
});
test('PIN rotation reads credentials a bounded number of times and leaves exactly one active scoped credential',()=>{
  const h=harness(),sheet=h.sheets.get('ScoringCredentials'),read=sheet.getDataRange.bind(sheet);let reads=0;
  sheet.getDataRange=()=>{reads++;return read();};
  for(let i=0;i<6;i++) {
    reads=0;const result=h.post({action:'issueGroupCredential',eventId:'v2-event',groupNo:1,credential:h.admin});assert.equal(result.ok,true);assert.ok(reads<=3,'avoid repeated whole-credential-table scans under lock');
    const active=sheet.rows.slice(1).map(r=>JSON.parse(r[1])).filter(c=>c.role==='scorer'&&c.group_no===1&&!c.revoked);assert.equal(active.length,1);assert.ok(active[0].pin_hash);
  }
});
test('review and confirmation recover earlier PREPARED intents before displaying or trusting server revisions',async()=>{
  const f=await fixture(),draft=await f.save();
  f.h.fault(2,'before');f.h.save({scores:[1,2,3,4].map(i=>({playerId:'p'+i,status:'scored',gross:6,expectedRevision:0}))});f.h.clearFault();
  const review=await f.recovery.review(draft.operationId);assert.equal(review.serverScores[0].gross,6);assert.equal(review.reviewed[0].revision,1);
  f.h.fault(2,'before');f.h.save({scores:[{playerId:'p1',status:'scored',gross:7,expectedRevision:1,reason:'Earlier accepted intent'}]});f.h.clearFault();
  await f.recovery.decide(review,'server',[],'',true);await f.sync.kick({force:true,review:true});
  assert.equal((await f.local.pending()).length,1);assert.equal(f.h.ctx.getScores('v2-event').find(s=>s.player_id==='p1').gross,7);
  assert.equal(f.h.ctx.v2Rows('ScoreOperations').some(r=>r.operation_id===draft.operationId),false);f.sync.stop();
});
