const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {harness}=require('./harness.cjs');
function anonymous(h,no=1){delete h.properties.V2_SCORING_ACCESS_MODE;const r=h.post({action:'openGroup',eventId:'v2-event',groupNo:no});assert.equal(r.ok,true,r.error);return r;}
function startRequest(h,eventId='v2-event'){return {action:'startRound',credential:h.admin,eventId,groupVersion:h.ctx.v2Meta(eventId).group_version,operationId:crypto.randomUUID(),nearest_enabled:false,nearest_holes:[],blind_enabled:false,team234_enabled:false};}
test('default PIN-free group access issues no PIN and preserves scope, corrections and idempotency',()=>{
 const h=harness(),a=anonymous(h),credential=a.token;
 const stored=JSON.parse(h.ctx.v2Rows('ScoringCredentials').find(c=>c.credential_id===a.credential_id).data);
 assert.equal(stored.access_mode,'pin-free');assert.equal(stored.pin_hash,undefined);assert.equal(a.pin,undefined);
 const req={credential,operationId:crypto.randomUUID(),scores:[{playerId:'p1',status:'scored',gross:5,expectedRevision:0}]};
 assert.equal(h.save(req).ok,true);assert.equal(h.save(req).ok,true);assert.equal(h.ctx.v2Rows('ScoreHistory').length,1);
 assert.match(h.save({credential,hole:2,scores:[{playerId:'p5',status:'scored',gross:5,expectedRevision:0}]}).error,/player/);
 assert.match(h.post({action:'roundBootstrap',credential,eventId:'v2-event',groupNo:2}).error,/group/);
 assert.match(h.save({credential,scores:[{playerId:'p1',status:'scored',gross:6,expectedRevision:1}]}).error,/reason/);
 assert.equal(h.save({credential,scores:[{playerId:'p1',status:'scored',gross:6,expectedRevision:1,reason:'Checked card'}]}).ok,true);
 const rows=h.post({action:'scoreHistory',credential,eventId:'v2-event',playerId:'p1',hole:1}).history;
 assert.equal(rows.length,2);assert.equal(rows[1].reason,'Checked card');assert.equal(rows[1].actor.role,'scorer');
 assert.equal(rows[1].actor.access_mode,'pin-free');
 const own=h.post({action:'roundBootstrap',credential,eventId:'v2-event',groupNo:1});
 assert.ok(own.scores.every(s=>['p1','p2','p3','p4'].includes(s.player_id)));
 assert.equal(JSON.stringify(own).includes(h.properties.V2_ADMIN_SECRET),false);
});
test('anonymous scoring never authorizes admin setup, PIN generation, competitions or reveal',()=>{
 const h=harness(),a=anonymous(h);
 for(const action of ['createEvent','saveGroups','saveCompetitionSetup','startRound','adminCompetitionData','drawBlindPairs','correctPinWinner','revealResults','recoverScores','issueGroupCredential']){
  const r=h.post({action,credential:a.token,eventId:'v2-event',groupNo:1});assert.equal(r.ok,false,action);assert.match(r.error,/Admin authentication required/,action);
 }
 assert.match(h.post({action:'issueGroupCredential',credential:h.admin,eventId:'v2-event',groupNo:1}).error,/disabled/);
 assert.match(h.post({action:'openGroup',eventId:'v2-event',groupNo:999}).error,/Invalid scoring group/);
 assert.match(h.post({action:'openGroup',eventId:'missing',groupNo:1}).error,/Event not found/);
});
test('configuration switching, policy revisions and expiry reject stale sessions without changing scores',()=>{
 const h=harness(),a=anonymous(h);assert.equal(h.save({credential:a.token}).ok,true);
 h.properties.V2_SCORING_ACCESS_MODE='group-pin';
 assert.match(h.post({action:'verifyGroupCredential',credential:a.token,eventId:'v2-event',groupNo:1}).error,/access mode changed/);
 const issued=h.post({action:'issueGroupCredential',credential:h.admin,eventId:'v2-event',groupNo:1});assert.match(issued.pin,/^\d{2}$/);
 assert.equal(h.post({action:'openGroup',eventId:'v2-event',groupNo:1}).ok,false);
 const pin=h.post({action:'openGroup',eventId:'v2-event',groupNo:1,pin:issued.pin});assert.equal(pin.ok,true);
 h.properties.V2_SCORING_ACCESS_REVISION='2';
 assert.match(h.post({action:'verifyGroupCredential',credential:pin.token,eventId:'v2-event',groupNo:1}).error,/access mode changed/);
 delete h.properties.V2_SCORING_ACCESS_MODE;const fresh=anonymous(h);
 const row=h.ctx.v2Rows('ScoringCredentials').find(r=>r.credential_id===fresh.credential_id),data=JSON.parse(row.data);data.expires_at=0;
 h.ctx.v2Put('ScoringCredentials',row.credential_id,[row.credential_id,JSON.stringify(data)]);
 assert.match(h.post({action:'verifyGroupCredential',credential:fresh.token,eventId:'v2-event',groupNo:1}).error,/expired/);
 assert.equal(h.ctx.getScores('v2-event').length,1);
 h.properties.V2_SCORING_ACCESS_MODE='typo';
 assert.match(h.post({action:'openGroup',eventId:'v2-event',groupNo:1}).error,/configuration/);
});
test('PIN-free finishing uses accepted scores; permanent lock rejects later opens and mutations',()=>{
 const h=harness(),a=anonymous(h);
 assert.equal(h.post({action:'completeGroup',credential:a.token,eventId:'v2-event',groupNo:1}).ok,false);
 for(let hole=1;hole<=18;hole++)assert.equal(h.save({credential:a.token,hole,scores:[1,2,3,4].map(i=>({playerId:'p'+i,status:'scored',gross:5,expectedRevision:0}))}).ok,true);
 assert.equal(h.post({action:'completeGroup',credential:a.token,eventId:'v2-event',groupNo:1}).ok,true);
 const meta=h.ctx.v2Meta('v2-event');meta.locked=true;meta.revealed_at='2026-11-20T12:00:00Z';h.ctx.v2Put('RoundEventsV2','v2-event',['v2-event',JSON.stringify(meta)]);
 assert.match(h.post({action:'openGroup',eventId:'v2-event',groupNo:1}).error,/permanently locked/);
 assert.match(h.save({credential:a.token}).error,/permanently locked/);
 assert.match(h.post({action:'completeGroup',credential:a.token,eventId:'v2-event',groupNo:1}).error,/permanently locked/);
});
test('start is admin-only, group-version scoped and idempotent after lost response',()=>{
 const h=harness(),request=startRequest(h);
 const first=h.post(request);assert.equal(first.ok,true,first.error);
 const writes=h.writes,rows=JSON.stringify(h.sheets.get('Competitions').rows);
 assert.deepEqual(h.post(request),first);assert.equal(h.writes,writes);assert.equal(JSON.stringify(h.sheets.get('Competitions').rows),rows);
 assert.match(h.post({...request,groupVersion:'stale'}).error,/Group setup changed/);
 assert.match(h.post({...request,blind_enabled:true}).error,/choices changed/);
});
test('new round scoring waits for admin start; partial setup failures retry without duplicate competition rows',()=>{
 const probe=harness(),base=startRequest(probe);assert.equal(probe.post(base).ok,true);const writes=probe.writes;
 for(let n=1;n<=writes;n++)for(const when of ['before','after']){
  const h=harness(),request=startRequest(h),meta=h.ctx.v2Meta('v2-event');meta.start_required=true;h.ctx.v2Put('RoundEventsV2','v2-event',['v2-event',JSON.stringify(meta)]);
  h.fault(n,when);h.post(request);h.clearFault();const retry=h.post(request);assert.equal(retry.ok,true,n+'/'+when+': '+retry.error);
  assert.ok(h.ctx.v2Meta('v2-event').started_at);assert.equal(h.sheets.get('Competitions').rows.filter(r=>r[0]==='v2-event').length,1);
 }
 const h=harness(),created=h.post({action:'createEvent',credential:h.admin,tee:'White'});assert.equal(created.ok,true);
 const eventId=created.event_id;
 const saved=h.post({action:'saveGroups',credential:h.admin,eventId,groups:[1,2,3,4].map(i=>({player_id:'p'+i,group_no:1,handicap_index:i,scorer:i===1,start_hole:1}))});assert.equal(saved.ok,true,saved.error);
 delete h.properties.V2_SCORING_ACCESS_MODE;
 assert.match(h.post({action:'openGroup',eventId,groupNo:1}).error,/start this round/);
 assert.equal(h.post(startRequest(h,eventId)).ok,true);
 assert.equal(h.post({action:'openGroup',eventId,groupNo:1}).ok,true);
});

test('PIN-free queued saves retain their IDs and payloads when a mode change rejects synchronization',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),{IDBFactory}=require('fake-indexeddb');
 const h=harness(),opened=anonymous(h),ctx={indexedDB:new IDBFactory(),AbortController,crypto,setTimeout,clearTimeout};
 vm.createContext(ctx);for(const path of ['v2-local.js','v2-sync.js'])vm.runInContext(fs.readFileSync(path,'utf8'),ctx);
 const local=ctx.V2Local,who={backend:'synthetic-stage7',eventId:'v2-event',groupNo:1,credentialId:opened.credential_id};
 const boot=h.post({action:'roundBootstrap',credential:opened.token,eventId:who.eventId,groupNo:1});await local.prepare(who,boot);
 const request={action:'saveHoleScores',eventId:who.eventId,hole:1,scores:[1,2,3,4].map(i=>({playerId:'p'+i,status:'scored',gross:5,expectedRevision:0,reason:''}))};
 const draft=await local.saveDraft(who,request,crypto.randomUUID());
 h.properties.V2_SCORING_ACCESS_MODE='group-pin';
 const sync=ctx.V2Sync.create({local,backend:who.backend,activeEvent:()=>who.eventId,credential:async()=>({token:opened.token}),transport:async data=>{const r=h.post(data);if(!r.ok)throw Error(r.error);return r;},schedule:()=>0,cancel:()=>{}});
 await sync.kick();sync.stop();
 const kept=await local.getDraft(draft.operationId);assert.equal(kept.status,'needs-review');assert.equal(kept.operationId,draft.operationId);assert.equal(kept.fingerprint,draft.fingerprint);
 assert.equal(JSON.stringify(kept.request),JSON.stringify(draft.request));assert.equal((await local.pending()).length,1);assert.equal(h.ctx.v2Rows('ScoreHistory').length,0);
});
