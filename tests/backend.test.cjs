const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm');
const {harness}=require('./harness.cjs');
test('all backend and frontend scripts parse',()=>{
  for(const p of ['backend/Code.gs','backend/Phase1.gs','v2.js'])new vm.Script(fs.readFileSync(p,'utf8'),{filename:p});
  for(const m of fs.readFileSync('index.html','utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
});
test('pickup is completed, nullable gross/net and distinct from numeric zero points',()=>{
  const h=harness();assert.equal(h.save().ok,true);assert.equal(h.save({hole:2,scores:[{playerId:'p1',status:'scored',gross:12,expectedRevision:0}]}).ok,true);
  const scores=h.ctx.getScores('v2-event');assert.equal(scores[0].gross,null);assert.equal(scores[0].net,null);assert.equal(scores[0].stableford,0);assert.equal(scores[1].gross,12);assert.equal(scores[1].score_status,'scored');
  const board=h.ctx.getLeaderboard('v2-event')[0];assert.equal(board.holes,2);assert.equal(board.gross_incomplete,true);
});
test('signed handicap allocation retains legacy Stableford behaviour',()=>{
  const h=harness();for(let handicap=-9;handicap<=54;handicap++){
    const allocated=Array.from({length:18},(_,i)=>h.ctx.getHoleStrokes(handicap,i+1));assert.equal(allocated.reduce((s,n)=>s+n,0),handicap);
  }
  assert.equal(h.ctx.calculateScore({playing_handicap:-2},{stroke_index:18,par:4},4).stableford,1);
});
test('corrections require reasons, immutable history, revision checks and authenticated actor',()=>{
  const h=harness();assert.equal(h.save().ok,true);
  const scores=[{playerId:'p1',status:'scored',gross:4,expectedRevision:1}];assert.match(h.save({scores}).error,/reason/);
  scores[0].reason='Recorded pickup for wrong player';assert.equal(h.save({scores}).ok,true);assert.match(h.save({scores}).error,/another device/);
  const history=h.post({action:'scoreHistory',credential:h.group,eventId:'v2-event',playerId:'p1',hole:1});assert.equal(history.history.length,2);assert.equal(history.history[1].before.score_status,'pickup');assert.equal(history.history[1].actor.role,'scorer');assert.ok(history.history[1].actor.credential_id);assert.equal(JSON.stringify(history).includes(h.group),false);
  assert.equal(h.sheets.get('ScoreHistory').rows.length,3);
});
test('no-op resaves do not require reasons or append revisions',()=>{
  const h=harness();h.save();assert.equal(h.save({scores:[{playerId:'p1',status:'pickup',gross:null,expectedRevision:1}]}).ok,true);assert.equal(h.sheets.get('ScoreHistory').rows.length,2);
});
test('unauthenticated, forged role, cross-group and revoked credentials fail; admin can correct any group',()=>{
  const h=harness();assert.match(h.save({credential:'',role:'admin'}).error,/credential/);assert.match(h.save({credential:h.group2}).error,/player/);
  assert.equal(h.save({credential:h.admin,scores:[{playerId:'p5',status:'pickup',gross:null,expectedRevision:0}]}).ok,true);
  h.post({action:'issueGroupCredential',credential:h.admin,eventId:'v2-event',groupNo:1});assert.match(h.save().error,/credential/);
  assert.equal(h.post({action:'adminLogin',pin:'bad'}).ok,false);
  const c=h.sheets.get('ScoringCredentials').rows.slice(1).map(r=>r[1]).join('');assert.equal(c.includes(h.admin),false);assert.equal(c.includes(h.group),false);
});
test('expiry and admin/scorer authentication are independent',()=>{
  const h=harness();const row=h.sheets.get('ScoringCredentials').rows.find(r=>r[0]===h.group.split('.')[0]),c=JSON.parse(row[1]);c.expires_at=0;row[1]=JSON.stringify(c);assert.match(h.save().error,/expired/);assert.equal(h.post({action:'issueGroupCredential',credential:h.group2,eventId:'v2-event',groupNo:1}).ok,false);
});
test('snapshot inputs survive master edits; handicaps lock after first score',()=>{
  const h=harness(),before=JSON.stringify(h.ctx.getGroups('v2-event'));h.sheets.get('Course').rows[1][3]=8;h.sheets.get('Course').rows[1][6]=160;h.sheets.get('Players').rows[1][3]=54;
  assert.equal(JSON.stringify(h.ctx.getGroups('v2-event')),before);assert.equal(h.ctx.getTeeData(h.ctx.getEventById('v2-event')).slope,113);
  assert.equal(h.save({scores:[{playerId:'p1',status:'scored',gross:4,expectedRevision:0}]}).ok,true);assert.equal(h.ctx.getScores('v2-event')[0].stableford,3);
  const r=h.post({action:'confirmGroupHandicaps',credential:h.group,eventId:'v2-event',groupNo:1,handicaps:[1,2,3,4].map(i=>({player_id:'p'+i,handicap_index:54}))});assert.match(r.error,/locked/);
});
test('invalid scores/duplicates cause no score/history writes',()=>{
  const h=harness();for(const scores of [[{playerId:'p1',status:'pickup',gross:0,expectedRevision:0}],[{playerId:'p1',status:'scored',gross:0,expectedRevision:0}],[{playerId:'p1',status:'scored',gross:'4',expectedRevision:0}],[{playerId:'p1',status:'pickup',gross:null,expectedRevision:0},{playerId:'p1',status:'pickup',gross:null,expectedRevision:0}]])assert.equal(h.save({scores}).ok,false);
  assert.equal(h.ctx.getScores('v2-event').length,0);assert.equal(h.sheets.get('ScoreHistory').rows.length,1);
});
test('same operation retries are idempotent; reused operation with different payload fails',()=>{
  const h=harness(),operationId=crypto.randomUUID();const a=h.save({operationId}),b=h.save({operationId});assert.deepEqual(a,b);assert.equal(h.sheets.get('ScoreHistory').rows.length,2);assert.match(h.save({operationId,hole:2}).error,/reused/);
});
test('fault injection before/after EVERY score transaction write recovers one complete batch',()=>{
  const scores=[{playerId:'p1',status:'pickup',gross:null,expectedRevision:0},{playerId:'p2',status:'scored',gross:4,expectedRevision:0}];
  const baseline=harness();assert.equal(baseline.save({scores}).ok,true);const boundaries=baseline.writes;assert.ok(boundaries>=8);
  for(const when of ['before','after'])for(let n=1;n<=boundaries;n++) {
    const h=harness(),operationId=crypto.randomUUID();h.fault(n,when);h.save({operationId,scores});
    const visible=h.ctx.getScores('v2-event');assert.ok(visible.length===0||visible.length===2,'partial batch became visible at '+n+' '+when);
    h.clearFault();const recovered=h.save({operationId,scores});assert.equal(recovered.ok,true,JSON.stringify({n,when,recovered}));assert.equal(h.ctx.getScores('v2-event').length,2);assert.equal(h.sheets.get('ScoreHistory').rows.length,3);assert.equal(h.sheets.get('ScoresV2').rows.length,3);
  }
});
test('new operation recovers earlier prepared intent then rejects stale revision',()=>{
  const h=harness();h.fault(2,'before');h.save();h.clearFault();assert.match(h.save().error,/another device/);assert.equal(h.ctx.getScores('v2-event').length,1);
});
test('journal corruption fails closed, does not publish incomplete batch',()=>{
  const h=harness();h.fault(4,'before');h.save();h.clearFault();const rows=h.sheets.get('ScoresV2').rows;if(rows[1])rows[1][3]='{}';assert.equal(h.save().ok,false);assert.equal(h.ctx.getScores('v2-event').length,0);
});
test('group Finish and completed-event corrections work, future reveal locks every mutation',()=>{
  const h=harness();for(let hole=1;hole<=18;hole++)assert.equal(h.save({hole,scores:[1,2,3,4].map(i=>({playerId:'p'+i,status:'pickup',gross:null,expectedRevision:0}))}).ok,true);
  const r=h.post({action:'completeGroup',credential:h.group,eventId:'v2-event',groupNo:1});assert.equal(r.ok,true);assert.equal(r.group_results.length,4);assert.equal(r.event_complete,false);
  h.sheets.get('Events').rows[1][4]='complete';assert.equal(h.save({scores:[{playerId:'p1',status:'scored',gross:4,reason:'Correction after Finish',expectedRevision:1}]}).ok,true);
  const row=h.sheets.get('RoundEventsV2').rows[1],meta=JSON.parse(row[1]);meta.revealed_at='2026-11-02T15:00:00Z';row[1]=JSON.stringify(meta);
  for(const action of ['saveHoleScores','saveScore','completeGroup','saveGroups','saveCompetitionSetup','drawBlindPairs','updatePinLeader','correctPinWinner','confirmGroupHandicaps','issueGroupCredential'])assert.match(h.post({action,credential:h.admin,eventId:'v2-event',groupNo:1}).error,/locked/,action);
});
test('pickups count toward completed rounds/POTY; no legacy snapshots are invented',()=>{
  const h=harness();for(let hole=1;hole<=18;hole++)assert.equal(h.save({credential:h.admin,hole,scores:Array.from({length:8},(_,i)=>({playerId:'p'+(i+1),status:'pickup',gross:null,expectedRevision:0}))}).ok,true);
  for(const no of [1,2])assert.equal(h.post({action:'completeGroup',credential:h.admin,eventId:'v2-event',groupNo:no}).ok,true);
  const stats=h.ctx.getSeasonStats();assert.equal(stats.length,8);assert.ok(stats.every(p=>p.appearances===1&&p.blobs===18&&p.poty_points===5));assert.equal(h.ctx.v2Meta('legacy-event'),null);assert.equal(h.ctx.getScores('legacy-event').length,0);
});
test('pin concurrency, required acknowledgements, explicit finish and saved blind draw survive V2',()=>{
  const h=harness();const setup=h.post({action:'saveCompetitionSetup',credential:h.admin,eventId:'v2-event',nearest_enabled:true,nearest_holes:[3],blind_enabled:true,team234_enabled:true});assert.equal(setup.ok,true);
  assert.equal(h.post({action:'updatePinLeader',credential:h.group,eventId:'v2-event',groupNo:1,hole:3,pinAction:'challenge',playerId:'p1',expectedLeader:''}).ok,true);
  assert.match(h.post({action:'updatePinLeader',credential:h.group2,eventId:'v2-event',groupNo:2,hole:3,pinAction:'challenge',playerId:'p5',expectedLeader:''}).error,/changed/);
  for(let hole=1;hole<=18;hole++)h.save({credential:h.admin,hole,scores:Array.from({length:8},(_,i)=>({playerId:'p'+(i+1),status:'pickup',gross:null,expectedRevision:0}))});
  assert.match(h.post({action:'completeGroup',credential:h.group2,eventId:'v2-event',groupNo:2}).error,/decision/);
  h.post({action:'updatePinLeader',credential:h.group2,eventId:'v2-event',groupNo:2,hole:3,pinAction:'keep',expectedLeader:'p1'});
  for(const no of [1,2])assert.equal(h.post({action:'completeGroup',credential:h.admin,eventId:'v2-event',groupNo:no}).ok,true);
  const a=h.post({action:'drawBlindPairs',credential:h.admin,eventId:'v2-event'}),b=h.post({action:'drawBlindPairs',credential:h.admin,eventId:'v2-event'});assert.equal(a.ok,true);assert.deepEqual(a,b);assert.equal(a.competitions.blind_pairs.length,4);
  assert.equal(h.post({action:'correctPinWinner',credential:h.admin,eventId:'v2-event',hole:3,playerId:'p2',reason:'Verified final measurement'}).ok,true);
});
test('initializer is repeatable, validates headers and requires explicit isolated setup',()=>{
  const h=harness();const count=h.sheets.size;h.ctx.initializeV2TestSchema();assert.equal(h.sheets.size,count);h.properties.V2_TEST_ONLY='false';assert.throws(()=>h.ctx.initializeV2TestSchema(),/test spreadsheet/);h.properties.V2_TEST_ONLY='true';h.sheets.get('ScoresV2').rows[0][0]='bad';assert.throws(()=>h.ctx.initializeV2TestSchema(),/schema/);
});
test('V2 write disable and default UI endpoint fail closed',()=>{
  const h=harness();h.properties.V2_ENABLED='false';assert.match(h.save().error,/disabled/);const html=fs.readFileSync('index.html','utf8');assert.equal(/AKfycb/.test(html),false);assert.ok(html.includes("localStorage.getItem('flaghunters.v2.api') || ''"));
});
test('GET competition reads are side-effect free, including missing helper sheets',()=>{
  const h=harness(),count=h.sheets.size,writes=h.writes;const r=h.ctx.doGet({parameter:{action:'competitions',eventId:'v2-event'}});assert.equal(r.ok,true);assert.equal(h.sheets.size,count);assert.equal(h.writes,writes);
});
test('historical numeric corrections are audited without inventing snapshots or rewriting legacy scores',()=>{
  const h=harness();h.sheets.get('Groups').rows.push(['legacy-event',1,'p1',1,true,1,1,true]);h.sheets.get('Scores').rows.push(['legacy-event','p1',1,5,4,2,false,false,false,'old']);
  const issued=h.post({action:'issueGroupCredential',credential:h.admin,eventId:'legacy-event',groupNo:1});assert.equal(issued.ok,true);
  const session=h.post({action:'openGroup',eventId:'legacy-event',groupNo:1,pin:issued.pin});
  const scores=[{playerId:'p1',status:'scored',gross:4,expectedRevision:0}];assert.match(h.save({credential:session.token,eventId:'legacy-event',scores}).error,/reason/);
  scores[0].reason='Verified scorecard';assert.equal(h.save({credential:session.token,eventId:'legacy-event',scores}).ok,true);
  const current=h.ctx.getScores('legacy-event')[0];assert.equal(current.gross,4);assert.equal(current.course_snapshot_id,null);assert.equal(current.calculation_source,'legacy_live_course_not_historical');assert.equal(h.sheets.get('Scores').rows[1][3],5);assert.equal(h.ctx.v2Meta('legacy-event'),null);
  assert.match(h.save({credential:session.token,eventId:'legacy-event',scores:[{playerId:'p1',status:'pickup',gross:null,expectedRevision:1,reason:'Test'}]}).error,/Legacy/);
});
test('Eclectic candidates exclude pickups but retain numeric zero-point scores',()=>{
  const h=harness();h.save();h.save({hole:2,scores:[{playerId:'p1',status:'scored',gross:12,expectedRevision:0}]});const candidates=h.ctx.v2EclecticCandidates('v2-event');assert.equal(candidates.length,1);assert.equal(candidates[0].gross,12);
});
test('new events get V2 course snapshots; failed setup never becomes a writable legacy event',()=>{
  const h=harness(),r=h.post({action:'createEvent',credential:h.admin,tee:'White'});assert.equal(r.ok,true);assert.equal(h.ctx.v2Meta(r.event_id).schema_version,2);assert.equal(h.ctx.getEventById(r.event_id).status,'active');
  h.fault(2,'before');const failed=h.post({action:'createEvent',credential:h.admin,tee:'White'});h.clearFault();assert.equal(failed.ok,false);const last=h.sheets.get('Events').rows.at(-1);assert.equal(last[4],'setup');assert.throws(()=>h.ctx.v2Writable(last[0]),/cannot be edited/);
});
test('partially written handicap snapshots remain invisible until the group manifest commits',()=>{
  const h=harness(),row=h.sheets.get('RoundEventsV2').rows[1],meta=JSON.parse(row[1]);delete meta.confirmed_groups['1'];row[1]=JSON.stringify(meta);h.fault(3,'after');
  const r=h.post({action:'confirmGroupHandicaps',credential:h.group,eventId:'v2-event',groupNo:1,handicaps:[1,2,3,4].map(i=>({player_id:'p'+i,handicap_index:3}))});h.clearFault();assert.equal(r.ok,false);assert.ok(h.ctx.getGroups('v2-event').filter(p=>p.group_no===1).every(p=>!p.handicap_confirmed));assert.equal(h.save().ok,false);
});
test('calculation version is explicit and independent from mutable legacy calculator',()=>{
  const h=harness();h.ctx.calculateScore=()=>({stableford:999});assert.equal(h.save({scores:[{playerId:'p1',status:'scored',gross:4,expectedRevision:0}]}).scores[0].stableford,3);
  const row=h.sheets.get('RoundEventsV2').rows[1],meta=JSON.parse(row[1]);meta.calculation_version='unknown-v999';row[1]=JSON.stringify(meta);assert.match(h.save({hole:2}).error,/Unsupported/);
});
test('fault recovery of corrections never exposes a mixture of batch revisions',()=>{
  const initial=[1,2].map(i=>({playerId:'p'+i,status:'pickup',gross:null,expectedRevision:0}));const corrections=[1,2].map(i=>({playerId:'p'+i,status:'scored',gross:4,expectedRevision:1,reason:'Verified score'}));
  const baseline=harness();baseline.save({scores:initial});baseline.clearFault();baseline.save({scores:corrections});const count=baseline.writes;
  for(const when of ['before','after'])for(let n=1;n<=count;n++){
    const h=harness();h.save({scores:initial});const operationId=crypto.randomUUID();h.fault(n,when);h.save({scores:corrections,operationId});const revisions=new Set(h.ctx.getScores('v2-event').map(s=>s.revision));assert.equal(revisions.size,1);h.clearFault();assert.equal(h.save({scores:corrections,operationId}).ok,true);assert.equal(h.sheets.get('ScoreHistory').rows.length,5);
  }
});
test('admin login throttles repeated failures',()=>{
  const h=harness();for(let i=0;i<10;i++)assert.equal(h.post({action:'adminLogin',pin:'wrong'}).ok,false);assert.match(h.post({action:'adminLogin',pin:h.properties.V2_ADMIN_SECRET}).error,/Too many/);
});

test('two-digit group PIN opens a scoped reusable session, never an admin identity',()=>{
  const h=harness();
  assert.match(h.groupPin,/^\d{2}$/);
  const opened=h.post({action:'openGroup',eventId:'v2-event',groupNo:1,pin:h.groupPin});
  assert.equal(opened.ok,true);assert.equal(opened.token,h.group);
  assert.equal(h.save({credential:opened.token}).ok,true);
  assert.match(h.save({credential:opened.token,scores:[{playerId:'p5',status:'pickup',gross:null,expectedRevision:0}]}).error,/player/);
  assert.match(h.post({action:'roundBootstrap',credential:opened.token,eventId:'legacy-event',groupNo:1}).error,/authorize/);
  assert.match(h.post({action:'issueGroupCredential',credential:opened.token,eventId:'v2-event',groupNo:2}).error,/Admin/);
  const history=h.post({action:'scoreHistory',credential:opened.token,eventId:'v2-event',playerId:'p1'}).history;
  assert.equal(history[0].actor.credential_id,opened.credential_id);
  assert.equal(history[0].actor.group_no,1);assert.equal(history[0].actor.role,'scorer');
  assert.equal(history[0].actor.name,undefined);
});
test('PIN generation preserves 00/leading zeroes and rotation changes PIN and revokes sessions',()=>{
  const h=harness();
  h.ctx.v2Id=()=> '00000000-0000-4000-8000-000000000000';
  assert.equal(h.ctx.v2GroupPin(), '00');
  h.ctx.v2Id=()=> '09000000-0000-4000-8000-000000000000';
  assert.equal(h.ctx.v2GroupPin(), '09');
  h.ctx.v2Id=()=>crypto.randomUUID();
  const rotated=h.post({action:'issueGroupCredential',credential:h.admin,eventId:'v2-event',groupNo:1});
  assert.equal(rotated.ok,true);assert.match(rotated.pin,/^\d{2}$/);assert.notEqual(rotated.pin,h.groupPin);
  assert.equal(rotated.token,undefined);
  assert.match(h.save().error,/expired/);
  assert.equal(h.post({action:'openGroup',eventId:'v2-event',groupNo:1,pin:h.groupPin}).ok,false);
  assert.equal(h.post({action:'openGroup',eventId:'v2-event',groupNo:1,pin:rotated.pin}).ok,true);
});
test('PIN attempt limiting persists without cache, is group-scoped and recovers after a minute',()=>{
  const h=harness(),row=h.sheets.get('ScoringCredentials').rows.find(r=>r[0]===h.group.split('.')[0]);
  const wrong=h.groupPin==='00'?'01':'00';
  // Harness setup used one successful attempt; four failures exhaust this window.
  for(let i=0;i<4;i++)assert.match(h.post({action:'openGroup',eventId:'v2-event',groupNo:1,pin:wrong}).error,/invalid/);
  h.cache.clear();
  assert.match(h.post({action:'openGroup',eventId:'v2-event',groupNo:1,pin:h.groupPin}).error,/Too many/);
  assert.equal(h.post({action:'openGroup',eventId:'v2-event',groupNo:2,pin:h.group2Pin}).ok,true);
  assert.equal(h.save().ok,true,'existing sessions do not spend PIN attempts');
  const c=JSON.parse(row[1]);c.attempt_window=Date.now()-61000;row[1]=JSON.stringify(c);
  assert.equal(h.post({action:'openGroup',eventId:'v2-event',groupNo:1,pin:h.groupPin}).ok,true);
  assert.equal(h.post({action:'openGroup',eventId:'v2-event',groupNo:1,pin:'1'}).ok,false);
});
test('public responses exclude PINs, PIN hashes and session secrets; locks still reject PIN login',()=>{
  const h=harness();
  const publicResponses=['groups','currentEvent','scores','competitions','status'].map(action=>h.ctx.doGet({parameter:{action,eventId:'v2-event'}}));
  const bootstrap=h.post({action:'roundBootstrap',credential:h.group,eventId:'v2-event',groupNo:1});
  const encoded=JSON.stringify([...publicResponses,bootstrap]);
  assert.doesNotMatch(encoded,/pin_hash|attempt_window|credential_id|"pin"|"token"/);
  assert.equal(encoded.includes(h.group),false);
  const credentials=h.sheets.get('ScoringCredentials').rows.slice(1).map(r=>JSON.parse(r[1]));
  assert.ok(credentials.filter(c=>c.role==='scorer').every(c=>c.pin_hash&&!('pin' in c)));
  const row=h.sheets.get('RoundEventsV2').rows[1],meta=JSON.parse(row[1]);meta.revealed_at=new Date().toISOString();row[1]=JSON.stringify(meta);
  assert.match(h.post({action:'openGroup',eventId:'v2-event',groupNo:1,pin:h.groupPin}).error,/locked/);
});

test('PIN exchange accepts 00 literally and rejects malformed PINs without coercion',()=>{
  const h=harness(),row=h.sheets.get('ScoringCredentials').rows.find(r=>r[0]===h.group.split('.')[0]);
  const c=JSON.parse(row[1]);c.pin_hash=h.ctx.v2Hash('00');row[1]=JSON.stringify(c);
  for(const pin of [0,'0','000'])assert.equal(h.post({action:'openGroup',eventId:'v2-event',groupNo:1,pin}).ok,false);
  assert.equal(h.post({action:'openGroup',eventId:'v2-event',groupNo:1,pin:'00'}).ok,true);
});
