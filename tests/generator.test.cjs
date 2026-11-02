const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),os=require('node:os'),path=require('node:path'),child=require('node:child_process');
const {harness}=require('./harness.cjs');
function generatorHarness() {
  const h=harness(),ctx=h.ctx,props=h.properties,books=new Map(),Sheet=h.sheets.get('Players').constructor;
  let count=0;
  class Workbook {
    constructor(id,name){this.id=id;this.name=name;this.sheets=new Map();this.metadata=[];}
    getId(){return this.id;} getName(){return this.name;}
    addDeveloperMetadata(key,value){this.metadata.push({getKey:()=>key,getValue:()=>value});}
    getDeveloperMetadata(){return this.metadata;}
    getSheetByName(name){return this.sheets.get(name)||null;}
    insertSheet(name){if(this.sheets.has(name))throw Error('Duplicate sheet');const sheet=new Sheet(name);this.sheets.set(name,sheet);return sheet;}
  }
  ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]??null,setProperty:(k,v)=>{props[k]=String(v);},deleteProperty:k=>{delete props[k];}})};
  ctx.ScriptApp={getScriptId:()=> 'isolated-generator-script'};
  ctx.SpreadsheetApp={create:name=>{const b=new Workbook('generated-'+(++count),name);books.set(b.id,b);return b;},openById:id=>{if(!books.has(id))throw Error('Refusing non-generated workbook access');return books.get(id);},flush:()=>{}};
  ctx.ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType(){return this;},getContent:()=>text})};
  vm.runInContext(fs.readFileSync('dev/TestRoundGenerator.gs','utf8'),ctx);
  delete props.V2_SPREADSHEET_ID;
  Object.assign(props,{V2_GENERATOR_MODE:'isolated-synthetic-only',V2_GENERATOR_SCRIPT_ID:'isolated-generator-script',V2_GENERATOR_SEED:'clubhouse-12-v1'});
  const api=data=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(data)}}).getContent());
  const get=(action,eventId,extra={})=>JSON.parse(ctx.doGet({parameter:{action,eventId,...extra}}).getContent());
  return {...h,ctx,props,books,api,get,book:()=>books.get(props.V2_SPREADSHEET_ID)};
}
function ready(h){h.ctx.initializeV2TestRoundGenerator();const r=h.ctx.generateV2TestRound();assert.equal(r.ready,true);return r;}

test('generator uses real authenticated scoring, revisions and realistic handicaps through physical hole 15',()=>{
  const h=generatorHarness(),r=ready(h),scores=h.ctx.getScores(r.event_id),groups=h.ctx.getGroups(r.event_id);
  assert.equal(groups.length,12);assert.equal(new Set(groups.map(p=>p.group_no)).size,3);
  assert.deepEqual(Array.from(new Set(groups.map(p=>p.start_hole))),[1,7,13]);
  assert.equal(scores.length,180);assert.ok(scores.every(s=>s.hole>=1&&s.hole<=15));
  assert.ok(scores.filter(s=>s.score_status==='pickup').length>=1);
  assert.ok(scores.filter(s=>s.score_status==='pickup').length<30);
  assert.ok(scores.filter(s=>s.score_status==='scored').every(s=>Number.isInteger(s.gross)&&s.gross>=1&&s.gross<=20));
  for(const s of scores.filter(s=>s.score_status==='scored')) {
    const p=groups.find(p=>p.player_id===s.player_id),hole=h.ctx.v2Course(h.ctx.v2Meta(r.event_id)).find(c=>c.hole===s.hole);
    assert.equal(s.stableford,h.ctx.v2ScoreV1(p,hole,s.gross).stableford);
  }
  const operations=h.ctx.v2Operations(r.event_id),history=h.ctx.v2Rows('ScoreHistory').map(x=>JSON.parse(x.data));
  assert.ok(operations.every(o=>o.state==='COMMITTED'));assert.equal(history.length,186);
  const corrections=history.filter(c=>c.before);assert.equal(corrections.length,6);
  assert.ok(corrections.every(c=>c.after.revision===2&&c.before.revision===1&&c.reason.length>0&&c.actor.role==='scorer'));
  assert.equal(new Set(corrections.map(c=>c.actor.group_no)).size,3);
  assert.ok(history.every(c=>c.actor.credential_id&&!('name' in c.actor)));
  const board=h.get('leaderboard',r.event_id);assert.equal(board.leaderboard.length,12);
  assert.ok(board.leaderboard.every(p=>p.total.holes===15&&p.back9.partial));assert.equal(board.revealed,false);
  const competition=h.ctx.getCompetitionData(r.event_id);assert.equal(competition.config.blind_enabled,true);assert.equal(competition.config.team234_enabled,true);assert.equal(competition.config.nearest_enabled,true);
  assert.equal(competition.all_groups_finished,false);
  const admin=h.ctx.trgAdmin_();assert.match(h.api({action:'revealResults',credential:admin,eventId:r.event_id}).error,/finish/);
  const before=h.ctx.v2Rows('ScoreHistory').length;assert.equal(h.ctx.generateV2TestRound().ready,true);assert.equal(h.ctx.v2Rows('ScoreHistory').length,before);
});

test('reset makes a fresh isolated workbook, preserves old history and repeats seeded golf results',()=>{
  const h=generatorHarness(),first=ready(h),old=h.book();
  const normalize=id=>Array.from(h.ctx.getScores(id),s=>[s.player_id,s.hole,s.score_status,s.gross,s.stableford,s.revision]).sort();
  const scores=normalize(first.event_id),history=JSON.stringify(old.getSheetByName('ScoreHistory').rows);
  h.ctx.resetV2TestRoundGenerator();assert.notEqual(h.book().id,old.id);
  const again=h.ctx.generateV2TestRound();assert.equal(again.ready,true);
  assert.deepEqual(normalize(again.event_id),scores);assert.equal(JSON.stringify(old.getSheetByName('ScoreHistory').rows),history);
  h.ctx.resetV2TestRoundGenerator();h.props.V2_GENERATOR_SEED='windy-12-v1';
  // Seed is captured at initialization; apply a changed seed with the next reset.
  h.ctx.resetV2TestRoundGenerator();const changed=h.ctx.generateV2TestRound();assert.notDeepEqual(normalize(changed.event_id),scores);
});

test('API timeout recovery reuses operation IDs without duplicate scores or fake corrections',()=>{
  const h=generatorHarness();h.ctx.initializeV2TestRoundGenerator();
  const original=h.ctx.trgCall_;let injected=false;
  h.ctx.trgCall_=function(s,token,action,data){const r=original(s,token,action,data);if(action==='saveHoleScores'&&!injected){injected=true;throw Error('Simulated response loss');}return r;};
  assert.throws(()=>h.ctx.generateV2TestRound(),/response loss/);
  h.ctx.trgCall_=original;
  const r=h.ctx.generateV2TestRound();assert.equal(r.ready,true);
  assert.equal(h.ctx.getScores(r.event_id).length,180);assert.equal(h.ctx.v2Rows('ScoreHistory').length,186);
});

test('finish scenario supports all competitions, keeps hidden holes private, then real reveal locks it',()=>{
  const h=generatorHarness(),r=ready(h),publicBefore=h.get('scorecard',r.event_id,{playerId:'synthetic-1'});
  const finished=h.ctx.finishV2GeneratedRound();assert.equal(finished.ready,true);assert.equal(finished.revealed,false);
  assert.equal(h.ctx.getScores(r.event_id).length,216);
  assert.deepEqual(h.get('scorecard',r.event_id,{playerId:'synthetic-1'}),publicBefore);
  assert.equal(h.ctx.getCompetitionData(r.event_id).blind_pairs.length,6);
  assert.equal(h.ctx.getCompetitionData(r.event_id).all_groups_finished,true);
  assert.ok(h.get('scores',r.event_id).scores.every(s=>s.hole<=15));assert.equal(h.get('competitions',r.event_id).blind_pairs.length,0);
  const admin=h.ctx.trgAdmin_(),reveal=h.api({action:'revealResults',credential:admin,eventId:r.event_id});assert.equal(reveal.ok,true);
  assert.equal(h.get('scorecard',r.event_id,{playerId:'synthetic-1'}).scorecard.holes.length,18);
  assert.equal(h.get('competitions',r.event_id).blind_pairs.length,6);
  assert.equal(h.ctx.v2Meta(r.event_id).locked,true);
  assert.match(h.api({action:'saveHoleScores',credential:admin,eventId:r.event_id}).error,/locked/);
  assert.throws(()=>h.ctx.generateV2TestRound(),/reset/i);
});

test('hard guard rejects production bindings, edited fixtures, unmanaged events and missing opt-ins',()=>{
  for(const [key,value] of [['V2_GENERATOR_MODE',''],['V2_TEST_ONLY','false'],['V2_ENABLED','false'],['V2_GENERATOR_SCRIPT_ID','production-script']]) {
    const h=generatorHarness();h.props[key]=value;assert.throws(()=>h.ctx.initializeV2TestRoundGenerator(),/isolated/);assert.equal(h.books.size,0);
  }
  let h=generatorHarness();h.props.V2_SPREADSHEET_ID='production-spreadsheet';assert.throws(()=>h.ctx.initializeV2TestRoundGenerator(),/NEW unbound/);assert.equal(h.books.size,0);
  h=generatorHarness();h.ctx.initializeV2TestRoundGenerator();h.props.V2_SPREADSHEET_ID='production-spreadsheet';assert.throws(()=>h.ctx.generateV2TestRound(),/binding mismatch/);assert.throws(()=>h.ctx.resetV2TestRoundGenerator(),/binding mismatch/);
  h=generatorHarness();h.ctx.initializeV2TestRoundGenerator();h.book().metadata=[];assert.throws(()=>h.ctx.generateV2TestRound(),/generator-owned/);
  h=generatorHarness();h.ctx.initializeV2TestRoundGenerator();h.book().getSheetByName('Players').rows[1][1]='Real Member';assert.throws(()=>h.ctx.generateV2TestRound(),/possible real data/);assert.throws(()=>h.ctx.resetV2TestRoundGenerator(),/possible real data/);
  h=generatorHarness();h.ctx.initializeV2TestRoundGenerator();h.book().getSheetByName('Events').appendRow(['unknown-event']);assert.throws(()=>h.ctx.generateV2TestRound(),/unmanaged event/);
});

test('generator is absent from production package and unavailable over public GET/POST',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'v2-package-'));
  try {
    child.execFileSync(process.execPath,['scripts/package-backend.cjs',temp]);assert.deepEqual(fs.readdirSync(temp).sort(),['Code.gs','Phase1.gs']);
    for(const name of fs.readdirSync(temp))assert.doesNotMatch(fs.readFileSync(path.join(temp,name),'utf8'),/generateV2TestRound|trgRun_|resetV2TestRoundGenerator/);
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
  const h=generatorHarness(),r=ready(h),admin=h.ctx.trgAdmin_();
  for(const action of ['generateV2TestRound','resetV2TestRoundGenerator','finishV2GeneratedRound']) {
    assert.equal(h.get(action,r.event_id).ok,false);
    assert.equal(h.api({action,credential:admin,eventId:r.event_id}).ok,false);
  }
});

test('finish preserves manually entered hidden scores and handles test PIN rotation',()=>{
  const h=generatorHarness(),r=ready(h),admin=h.ctx.trgAdmin_();
  const manual=h.api({action:'saveHoleScores',credential:admin,eventId:r.event_id,hole:16,operationId:'manual_generator_test_16',scores:[{playerId:'synthetic-1',status:'scored',gross:3,expectedRevision:0}]});
  assert.equal(manual.ok,true);
  assert.equal(h.api({action:'issueGroupCredential',credential:admin,eventId:r.event_id,groupNo:1}).ok,true);
  assert.equal(h.ctx.finishV2GeneratedRound().ready,true);
  const score=h.ctx.getScores(r.event_id).find(s=>s.player_id==='synthetic-1'&&s.hole===16);
  assert.equal(score.gross,3);assert.equal(score.revision,1);
});
