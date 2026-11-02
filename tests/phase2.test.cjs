const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');
const eventId='v2-event';
function get(h,action,extra={}) {return h.ctx.doGet({parameter:{action,eventId,...extra}});}
function score(h,hole,players=[1,2,3,4,5,6,7,8],gross=4) {
  const result=h.save({credential:h.admin,hole,scores:players.map(i=>({playerId:'p'+i,status:gross===null?'pickup':'scored',gross,expectedRevision:0}))});
  assert.equal(result.ok,true,result.error);
}
function finish(h) {for(const groupNo of [1,2]){const r=h.post({action:'completeGroup',credential:h.admin,eventId,groupNo});assert.equal(r.ok,true);assert.ok(r.group_results.every(p=>p.holes===15&&!p.revealed&&p.total.through_hole===15));}}
function reveal(h) {const r=h.post({action:'revealResults',credential:h.admin,eventId});assert.equal(r.ok,true,r.error);return r;}

test('physical front/back splits ignore shotgun order; reveal returns full 18-hole totals',()=>{
  const h=harness();h.sheets.get('Groups').rows.slice(1).forEach(r=>r[5]=13);
  const order=[13,14,15,16,17,18,1,2,3,4,5,6,7,8,9,10,11,12];
  for(const hole of order)score(h,hole,undefined,hole<=9?4:5);
  const live=get(h,'leaderboard').leaderboard.find(p=>p.player_id==='p1');
  assert.equal(live.front9.gross,36);assert.equal(live.front9.stableford,18);
  assert.equal(live.back9.gross,30);assert.equal(live.back9.stableford,6);
  assert.equal(live.back9.through_hole,15);assert.equal(live.back9.expected_holes,6);assert.equal(live.back9.partial,true);assert.equal(live.total.partial,true);
  assert.equal(live.total.gross,66);assert.equal(live.holes,15);assert.equal(live.playing_handicap,1);
  finish(h);const final=reveal(h).leaderboard.find(p=>p.player_id==='p1');
  assert.equal(final.front9.gross,36);assert.equal(final.front9.stableford,18);
  assert.equal(final.back9.gross,45);assert.equal(final.back9.stableford,9);
  assert.equal(final.total.gross,81);assert.equal(final.total.stableford,27);
  assert.equal(final.holes,18);assert.equal(final.revealed,true);
  assert.equal(final.total.partial,false);assert.equal(final.back9.expected_holes,9);
});

test('pickups mark only their physical nine and total Gross incomplete; zero-point numeric scores stay numeric',()=>{
  const h=harness();
  score(h,2,[1],null);score(h,11,[1],12);score(h,17,[1],null);
  let p=get(h,'leaderboard').leaderboard.find(p=>p.player_id==='p1');
  assert.equal(p.front9.gross,null);assert.equal(p.front9.gross_incomplete,true);
  assert.equal(p.back9.gross,12);assert.equal(p.back9.gross_incomplete,false);
  assert.equal(p.back9.stableford,0);assert.equal(p.total.gross,null);assert.equal(p.holes,2);
  const row=h.sheets.get('RoundEventsV2').rows[1],meta=JSON.parse(row[1]);meta.revealed_at='test-reveal';row[1]=JSON.stringify(meta);
  p=get(h,'leaderboard').leaderboard.find(p=>p.player_id==='p1');
  assert.equal(p.back9.gross,null);assert.equal(p.back9.gross_incomplete,true);assert.equal(p.holes,3);
  assert.equal(p.total.stableford,0);
});

test('partial rounds show saved physical holes without inventing missing scores',()=>{
  const h=harness();score(h,10,[1],5);score(h,1,[1],4);score(h,18,[1],1);
  const p=get(h,'leaderboard').leaderboard.find(p=>p.player_id==='p1');
  assert.equal(p.front9.holes,1);assert.equal(p.front9.gross,4);assert.equal(p.front9.partial,true);
  assert.equal(p.back9.holes,1);assert.equal(p.back9.gross,5);assert.equal(p.total.holes,2);
  const empty=get(h,'leaderboard').leaderboard.find(p=>p.player_id==='p2');
  assert.equal(empty.total.holes,0);assert.equal(empty.total.partial,true);assert.equal(empty.total.gross,0);
});

test('hidden-hole changes cannot affect any public endpoint or ranking before reveal',()=>{
  const h=harness();score(h,1,[1],4);score(h,1,[5],5);
  const actions=['status','currentEvent','groups','players','course','roundCourse','scores','leaderboard','competitions','season'];
  const before=actions.map(a=>JSON.stringify(get(h,a)));
  score(h,16,[1],20);score(h,17,[1],20);score(h,18,[1],20);
  score(h,16,[5],1);score(h,17,[5],1);score(h,18,[5],1);
  assert.deepEqual(actions.map(a=>JSON.stringify(get(h,a))),before);
  assert.ok(get(h,'scores').scores.every(s=>s.hole<=15));
  assert.equal(get(h,'leaderboard').leaderboard[0].player_id,'p1');
  assert.equal(get(h,'scoreHistory').ok,false);assert.equal(get(h,'roundBootstrap').ok,false);
  // A scorer may edit their own hidden holes, never inspect another group's.
  const own=h.post({action:'roundBootstrap',credential:h.group,eventId,groupNo:1});
  assert.equal(own.ok,true);assert.ok(own.scores.some(s=>s.hole===18));
  assert.ok(own.scores.every(s=>['p1','p2','p3','p4'].includes(s.player_id)));
  assert.equal(h.post({action:'roundBootstrap',credential:h.group,eventId,groupNo:2}).ok,false);
});

test('competition public projection hides last-three pin data, blind pairs and finish-derived results',()=>{
  const h=harness();h.ctx.saveCompetitionRecord(eventId,{row:null,enabled:true,holes:[3,17],pins:{3:'p1',17:'p5'},pairs:[['p1','p5']],blindEnabled:true,team234Enabled:true});
  const data=get(h,'competitions');assert.deepEqual(Array.from(data.config.nearest_holes),[3]);
  assert.equal(data.nearest_pins[17],undefined);assert.equal(data.blind_pairs.length,0);
  assert.equal(data.group_status.length,0);assert.equal(data.all_groups_finished,false);
  assert.equal(h.post({action:'adminCompetitionData',credential:h.group,eventId}).ok,false);
  assert.equal(h.post({action:'adminCompetitionData',credential:h.admin,eventId}).nearest_pins[17],'p5');
});

test('only admin can reveal a finished round; reveal is idempotent and permanently locks every score path',()=>{
  const h=harness();
  assert.match(h.post({action:'revealResults',credential:h.group,eventId}).error,/Admin/);
  assert.match(h.post({action:'revealResults',credential:h.admin,eventId}).error,/finish/);
  for(let hole=1;hole<=18;hole++)score(h,hole);
  assert.match(h.post({action:'revealResults',credential:h.admin,eventId}).error,/finish/);
  finish(h);
  const before=h.sheets.get('ScoreHistory').rows.length;
  const first=reveal(h),stamp=h.ctx.v2Meta(eventId).revealed_at;
  assert.equal(h.ctx.v2Meta(eventId).locked,true);assert.equal(get(h,'scores').scores.length,144);
  assert.equal(get(h,'season').season.length,8);
  const again=reveal(h);assert.deepEqual(again,first);assert.equal(h.ctx.v2Meta(eventId).revealed_at,stamp);
  assert.equal(h.sheets.get('ScoreHistory').rows.length,before);
  for(const action of ['saveHoleScores','saveScore','completeGroup','saveGroups','saveCompetitionSetup','drawBlindPairs','updatePinLeader','correctPinWinner','confirmGroupHandicaps','issueGroupCredential','recoverScores'])
    assert.match(h.post({action,credential:h.admin,eventId,groupNo:1}).error,/locked/,action);
});

test('reveal recovers accepted operations before publishing and requires configured blind draw',()=>{
  const h=harness();
  for(let hole=1;hole<=18;hole++)score(h,hole);
  finish(h);
  h.ctx.saveCompetitionRecord(eventId,{row:null,enabled:false,holes:[],pins:{},pairs:[],blindEnabled:true,team234Enabled:true});
  assert.match(h.post({action:'revealResults',credential:h.admin,eventId}).error,/Draw Blind/);
  assert.equal(h.post({action:'drawBlindPairs',credential:h.admin,eventId}).ok,true);
  h.fault(2,'after');
  const result=h.save({scores:[{playerId:'p1',status:'scored',gross:5,expectedRevision:1,reason:'Accepted before reveal'}]});
  h.clearFault();assert.equal(result.ok,false);
  assert.ok(h.ctx.v2Operations(eventId).some(o=>o.state==='PREPARED'));
  const final=reveal(h).leaderboard.find(p=>p.player_id==='p1');
  assert.equal(final.front9.gross,37);
  assert.ok(h.ctx.v2Operations(eventId).every(o=>o.state==='COMMITTED'));
  assert.equal(get(h,'competitions').blind_pairs.length,4);
});

test('final ranking may change only after reveal exposes the last three holes',()=>{
  const h=harness();
  for(let hole=1;hole<=18;hole++) {
    score(h,hole,[1],hole<=15?4:20);
    score(h,hole,[5],hole<=15?(hole===1?5:4):1);
    score(h,hole,[2,3,4,6,7,8],4);
  }
  const ids=()=>Array.from(get(h,'leaderboard').leaderboard,p=>p.player_id);
  assert.ok(ids().indexOf('p1')<ids().indexOf('p5'));
  finish(h);reveal(h);
  assert.ok(ids().indexOf('p5')<ids().indexOf('p1'));
});
