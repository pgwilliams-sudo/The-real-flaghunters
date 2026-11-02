/** DEVELOPMENT ONLY. Install manually in a NEW isolated test Apps Script project.
 * Not an HTTP API, not part of backend packaging. See docs/TEST_GENERATOR.md.
 */
const TRG_MODE='isolated-synthetic-only';
const TRG_PREFIX='[V2 SYNTHETIC ONLY] ';
const TRG_HANDICAPS=[-1.2,2.4,5.8,8.1,10.6,13.2,15.5,18.4,21.1,24.7,29.3,35.6];

function trgProps_() {return PropertiesService.getScriptProperties();}
function trgState_() {return JSON.parse(trgProps_().getProperty('V2_GENERATOR_STATE')||'null');}
function trgSave_(s) {trgProps_().setProperty('V2_GENERATOR_STATE',JSON.stringify(s));}
function trgConfig_() {
  const p=trgProps_();
  if(p.getProperty('V2_GENERATOR_MODE')!==TRG_MODE || p.getProperty('V2_TEST_ONLY')!=='true' ||
     p.getProperty('V2_ENABLED')!=='true' || p.getProperty('V2_GENERATOR_SCRIPT_ID')!==ScriptApp.getScriptId() ||
     SPREADSHEET_ID!=='REPLACE_WITH_SPREADSHEET_ID' || ADMIN_PIN!=='REPLACE_WITH_ADMIN_PIN')
    throw new Error('Generator requires an explicitly bound, isolated development script with production constants unset');
  if((p.getProperty('V2_ADMIN_SECRET')||'').length<32) throw new Error('Configure the separate strong test admin secret');
}
function trgFixtures_() {
  const players=[['player_id','name','active','handicap_index'],...TRG_HANDICAPS.map((h,i)=>['synthetic-'+(i+1),'Synthetic Golfer '+(i+1),true,h])];
  const pars=[4,5,3,4,4,5,4,3,4,4,5,3,4,4,5,4,3,4];
  const indexes=[7,1,15,9,3,11,5,17,13,8,2,16,10,4,12,6,18,14];
  const course=[['course','tee','hole','par','stroke_index','yards','slope','course_rating'],
    ...['White','Yellow'].flatMap(tee=>pars.map((par,i)=>['Brickendon Grange',tee,i+1,par,indexes[i],par===3?155:par===5?510:365,tee==='White'?121:115,tee==='White'?71.8:70.1]))];
  return {Players:players,Course:course,
    Events:[['event_id','date','course','tee','status','completed']],
    Groups:[['event_id','group_no','player_id','playing_handicap','scorer','start_hole','handicap_index','handicap_confirmed']],
    Scores:[['event_id','player_id','hole','gross','net','stableford','blob','birdie','eagle','timestamp']]};
}
function trgGuard_() {
  trgConfig_();
  const p=trgProps_(),id=p.getProperty('V2_GENERATOR_SPREADSHEET_ID'),marker=p.getProperty('V2_GENERATOR_MARKER');
  if(!id||!marker||p.getProperty('V2_SPREADSHEET_ID')!==id) throw new Error('Generator spreadsheet binding mismatch');
  const ss=SpreadsheetApp.openById(id);
  if(ss.getId()!==id||!ss.getName().startsWith(TRG_PREFIX)||!ss.getDeveloperMetadata().some(m=>m.getKey()==='V2_SYNTHETIC_OWNER'&&m.getValue()===ScriptApp.getScriptId()+':'+marker))
    throw new Error('Not a generator-owned synthetic workbook');
  const fixtures=trgFixtures_();
  for(const name of ['Players','Course']) {
    const sheet=ss.getSheetByName(name);
    if(!sheet||JSON.stringify(sheet.getDataRange().getValues())!==JSON.stringify(fixtures[name]))
      throw new Error('Synthetic master fixtures changed; refusing to touch possible real data');
  }
  const s=trgState_(),events=getRowsAsObjects(ss.getSheetByName('Events'));
  if(events.some(e=>String(e.event_id)!==String(s&&s.eventId))) throw new Error('Workbook contains an unmanaged event');
  return s;
}
function trgLease_(fn) {
  const p=trgProps_();
  const lease=withScriptLock(()=>{
    const old=Number(p.getProperty('V2_GENERATOR_LEASE')||0);
    if(old>Date.now()) throw new Error('Generator already running; retry after its eight-minute lease expires');
    const until=Date.now()+480000;p.setProperty('V2_GENERATOR_LEASE',String(until));return until;
  });
  try{return fn();}finally{withScriptLock(()=>{if(p.getProperty('V2_GENERATOR_LEASE')===String(lease))p.deleteProperty('V2_GENERATOR_LEASE');});}
}
function trgNewWorkbook_() {
  const p=trgProps_(),seed=p.getProperty('V2_GENERATOR_SEED')||'clubhouse-12-v1';
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(seed)) throw new Error('Seed must be 1–64 letters, digits, underscores or hyphens');
  const marker=Utilities.getUuid(),ss=SpreadsheetApp.create(TRG_PREFIX+seed+' '+marker.slice(0,8));
  ss.addDeveloperMetadata('V2_SYNTHETIC_OWNER',ScriptApp.getScriptId()+':'+marker);
  // Fixture INPUTS only. All score/history/credential/result writes go through V2 APIs.
  const fixtures=trgFixtures_();
  Object.keys(fixtures).forEach(name=>{const rows=fixtures[name];ss.insertSheet(name).getRange(1,1,rows.length,rows[0].length).setValues(rows);});
  p.setProperty('V2_GENERATOR_SPREADSHEET_ID',ss.getId());p.setProperty('V2_GENERATOR_MARKER',marker);
  p.setProperty('V2_SPREADSHEET_ID',ss.getId());
  trgSave_({version:1,seed,eventId:null,cursor:0,finishCursor:0,groups:{}});
  initializeV2TestSchema();
  const result={spreadsheet_id:ss.getId(),spreadsheet_url:'https://docs.google.com/spreadsheets/d/'+ss.getId()+'/edit',seed,status:'Fresh synthetic workbook ready; run generateV2TestRound'};
  console.log(JSON.stringify(result));return result;
}
function initializeV2TestRoundGenerator() {
  trgConfig_();
  return trgLease_(()=>{
    const p=trgProps_();
    if(p.getProperty('V2_SPREADSHEET_ID')||p.getProperty('V2_GENERATOR_SPREADSHEET_ID'))
      throw new Error('Initialization requires a NEW unbound script; use reset only for an owned generator workbook');
    return trgNewWorkbook_();
  });
}
function resetV2TestRoundGenerator() {
  trgConfig_();
  return trgLease_(()=>{trgGuard_();return trgNewWorkbook_();});
}
function trgPost_(data) {
  // Never log requests: they can contain test admin or group bearer credentials.
  const result=JSON.parse(doPost({postData:{contents:JSON.stringify(data)}}).getContent());
  if(!result.ok) throw new Error(result.error||'V2 API request failed');
  return result;
}
function trgAdmin_() {return trgPost_({action:'adminLogin',pin:trgProps_().getProperty('V2_ADMIN_SECRET')}).token;}
function trgCall_(s,token,action,data) {return trgPost_({...data,action,eventId:s.eventId,credential:token});}
function trgRandom_(key) {
  let x=2166136261;
  for(let i=0;i<key.length;i++)x=Math.imul(x^key.charCodeAt(i),16777619)>>>0;
  x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;
}
function trgScore_(s,player,hole) {
  const course=v2Course(v2Meta(s.eventId)).find(h=>Number(h.hole)===hole);
  const key=s.seed+':'+player.player_id+':'+hole;
  const pickup=trgRandom_(key+':pickup')<0.045 || (player.player_id==='synthetic-4'&&hole===6);
  if(pickup)return {status:'pickup',gross:null};
  const r=trgRandom_(key+':score'),delta=r<0.03?-2:r<0.17?-1:r<0.53?0:r<0.80?1:r<0.95?2:3;
  const strokes=Math.floor((Number(player.playing_handicap)+18-Number(course.stroke_index))/18);
  return {status:'scored',gross:Math.max(1,Math.min(20,Number(course.par)+strokes+delta))};
}
function trgOperation_(s,label) {return 'generator_'+v2Hash(s.eventId+':'+s.seed+':'+label).slice(0,48);}
function trgPin_(s,groupNo,hole) {
  const record=competitionRecord(s.eventId),expectedLeader=String(record.pins[hole]||'');
  const members=getGroups(s.eventId).filter(p=>Number(p.group_no)===groupNo);
  const previous=getPinAcknowledgements(s.eventId);
  if(Object.prototype.hasOwnProperty.call(previous[hole]||{},String(groupNo)))return;
  trgCall_(s,s.groups[groupNo],'updatePinLeader',{groupNo,hole,expectedLeader,
    pinAction:groupNo===1?'challenge':'keep',playerId:groupNo===1?members[0].player_id:''});
}
function trgSteps_(s,admin,finish) {
  const steps=[];
  if(!finish) {
    steps.push(()=>{s.eventId=trgPost_({action:'createEvent',credential:admin,tee:'White',date:'2026-06-20'}).event_id;});
    steps.push(()=>trgCall_(s,admin,'saveGroups',{groups:TRG_HANDICAPS.map((h,i)=>({player_id:'synthetic-'+(i+1),group_no:Math.floor(i/4)+1,handicap_index:h,scorer:i%4===0,start_hole:[1,7,13][Math.floor(i/4)]}))}));
    steps.push(()=>trgCall_(s,admin,'saveCompetitionSetup',{nearest_enabled:true,nearest_holes:[3,8,12,17],blind_enabled:true,team234_enabled:true}));
    for(const groupNo of [1,2,3]) {
      steps.push(()=>{
        const issued=trgCall_(s,admin,'issueGroupCredential',{groupNo});
        s.groups[groupNo]=trgPost_({action:'openGroup',eventId:s.eventId,groupNo,pin:issued.pin}).token;
      });
      steps.push(()=>trgCall_(s,s.groups[groupNo],'confirmGroupHandicaps',{groupNo,handicaps:TRG_HANDICAPS.slice((groupNo-1)*4,groupNo*4).map((h,i)=>({player_id:'synthetic-'+((groupNo-1)*4+i+1),handicap_index:h}))}));
    }
  }
  for(let hole=finish?16:1;hole<=(finish?18:15);hole++)for(const groupNo of [1,2,3])steps.push(()=>{
    let members=getGroups(s.eventId).filter(p=>Number(p.group_no)===groupNo);
    if(finish) {
      const saved=getScores(s.eventId);
      members=members.filter(p=>!saved.some(score=>String(score.player_id)===String(p.player_id)&&Number(score.hole)===hole));
      if(!members.length)return;
    }
    trgCall_(s,s.groups[groupNo],'saveHoleScores',{hole,operationId:trgOperation_(s,'initial:'+groupNo+':'+hole),
      scores:members.map(p=>({playerId:p.player_id,...trgScore_(s,p,hole),expectedRevision:0}))});
  });
  if(!finish)for(const groupNo of [1,2,3])for(const hole of [2,7])steps.push(()=>{
    const player=getGroups(s.eventId).find(p=>Number(p.group_no)===groupNo);
    const original=trgScore_(s,player,hole);
    trgCall_(s,s.groups[groupNo],'saveHoleScores',{hole,operationId:trgOperation_(s,'correction:'+groupNo+':'+hole),
      scores:[{playerId:player.player_id,status:'scored',gross:original.gross===null?Number(v2Course(v2Meta(s.eventId)).find(h=>Number(h.hole)===hole).par)+1:original.gross+1,
        expectedRevision:1,reason:'Synthetic scorer correction: checked the test card'}]});
  });
  for(const hole of finish?[17]:[3,8,12])for(const groupNo of [1,2,3])steps.push(()=>trgPin_(s,groupNo,hole));
  if(finish) {
    for(const groupNo of [1,2,3])steps.push(()=>trgCall_(s,s.groups[groupNo],'completeGroup',{groupNo}));
    steps.push(()=>trgCall_(s,admin,'drawBlindPairs',{}));
  }
  return steps;
}
function trgRun_(finish) {
  trgConfig_();
  return trgLease_(()=>{
    const s=trgGuard_(),started=Date.now();
    if(!s)throw new Error('Initialize the generator first');
    if(!finish&&s.finishCursor>0)throw new Error('Scenario already extended past hole 15; reset for another through-15 round');
    const admin=trgAdmin_();
    if(finish && s.cursor!==trgSteps_(s,admin,false).length) throw new Error('Finish generating the through-15 scenario first');
    const steps=trgSteps_(s,admin,finish),key=finish?'finishCursor':'cursor';
    if(finish && s[key]<steps.length) {
      trgCall_(s,admin,'recoverScores',{});
      for(const groupNo of [1,2,3]) {
        try {trgCall_(s,s.groups[groupNo],'verifyGroupCredential',{groupNo});}
        catch(error) {
          if(!/credential|expired|authorize/i.test(error.message))throw error;
          const issued=trgCall_(s,admin,'issueGroupCredential',{groupNo});
          s.groups[groupNo]=trgPost_({action:'openGroup',eventId:s.eventId,groupNo,pin:issued.pin}).token;
          trgSave_(s);
        }
      }
    }
    while(s[key]<steps.length) {
      // Keep comfortably below Apps Script's execution timeout. Re-run to resume.
      if(Date.now()-started>210000)break;
      steps[s[key]]();s[key]++;trgSave_(s);
    }
    return {event_id:s.eventId,seed:s.seed,steps_done:s[key],steps_total:steps.length,
      ready:s[key]===steps.length,through_hole:s[key]===steps.length?(finish?18:15):null,
      revealed:Boolean(s.eventId&&v2Meta(s.eventId).revealed_at)};
  });
}
function generateV2TestRound() {const r=trgRun_(false);console.log(JSON.stringify(r));return r;}
function finishV2GeneratedRound() {const r=trgRun_(true);console.log(JSON.stringify(r));return r;}
