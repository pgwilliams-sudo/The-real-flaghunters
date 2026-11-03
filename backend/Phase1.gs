/** V2 scoring backend. No setup runs at load time. See docs/PHASE1.md and docs/PHASE2.md. */
const V2_SCHEMA = {
  RoundEventsV2: ['event_id','data'],
  RoundCourseHoles: ['snapshot_id','hole','data'],
  RoundPlayers: ['snapshot_id','event_id','player_id','data'],
  ScoresV2: ['operation_id','score_key','revision','data'],
  ScoreHistory: ['operation_id','score_key','revision','data'],
  ScoreOperations: ['operation_id','state','data'],
  ScoringCredentials: ['credential_id','data'],
  SchemaMigrations: ['version','state','timestamp']
};

function v2Props() { return PropertiesService.getScriptProperties(); }
function v2Enabled() { return v2Props().getProperty('V2_ENABLED') === 'true'; }
function v2AssertEnabled() { if (!v2Enabled()) throw new Error('V2 is disabled'); }
function v2Now() { return new Date().toISOString(); }
function v2Id() { return Utilities.getUuid(); }
function v2Hash(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
function v2Equal(a,b) {
  a=String(a); b=String(b); let diff=a.length ^ b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++) diff |= (a.charCodeAt(i)||0) ^ (b.charCodeAt(i)||0);
  return diff===0;
}
function v2Table(name) {
  const sheet=sheetNamed(name), expected=V2_SCHEMA[name];
  if (!expected || JSON.stringify(sheet.getRange(1,1,1,expected.length).getValues()[0]) !== JSON.stringify(expected))
    throw new Error('Unexpected schema: '+name);
  return sheet;
}
function v2Rows(name) { return getRowsAsObjects(v2Table(name)); }
function v2Append(name,row) { v2Table(name).appendRow(row); }
function v2Put(name,key,row) {
  const sheet=v2Table(name), values=sheet.getDataRange().getValues();
  const i=values.findIndex((r,j)=>j>0 && String(r[0])===String(key));
  if(i<0) sheet.appendRow(row); else sheet.getRange(i+1,1,1,row.length).setValues([row]);
}
/** Explicit administrator-run initializer; never called by a GET or at startup. */
function initializeV2TestSchema() {
  v2AssertEnabled();
  if(v2Props().getProperty('V2_TEST_ONLY')!=='true' || !v2Props().getProperty('V2_SPREADSHEET_ID'))
    throw new Error('Explicit separate test spreadsheet configuration required');
  return withScriptLock(()=>{
    const ss=getSpreadsheet();
    // Preflight every existing table before creating any new one.
    Object.keys(V2_SCHEMA).forEach(name=>{if(ss.getSheetByName(name)) v2Table(name);});
    Object.keys(V2_SCHEMA).forEach(name=>{
      if(!ss.getSheetByName(name)) ss.insertSheet(name).appendRow(V2_SCHEMA[name]);
    });
    v2Put('SchemaMigrations','phase1',['phase1','ready',v2Now()]);
    return {ok:true};
  });
}
function v2Meta(eventId) {
  const sheet=getSpreadsheet().getSheetByName('RoundEventsV2');
  if(!sheet) return null;
  const row=v2Rows('RoundEventsV2').find(r=>String(r.event_id)===String(eventId));
  return row ? JSON.parse(row.data) : null;
}
function v2Writable(eventId) {
  v2AssertEnabled();
  const event=getEventById(eventId); if(!event) throw new Error('Event not found');
  const meta=v2Meta(eventId);
  if(meta && (meta.revealed_at || meta.locked)) throw new Error('Results are permanently locked');
  if(!['active','complete'].includes(String(event.status).toLowerCase())) throw new Error('Round cannot be edited');
  return meta;
}
function v2Issue(role,eventId,groupNo,extra={}) {
  const id=v2Id(),secret=role==='scorer'?v2GroupSecret(id):v2Id()+v2Id();
  const data={role,event_id:String(eventId||''),group_no:Number(groupNo)||0,hash:v2Hash(secret),
    expires_at:Date.now()+(role==='admin'?12*3600:30*86400)*1000,revoked:false,...extra};
  v2Append('ScoringCredentials',[id,JSON.stringify(data)]);
  return {token:id+'.'+secret,credential_id:id,role,expires_at:data.expires_at};
}
// The two-digit PIN only opens a scoped bearer session; it is not a person's identity.
function v2GroupSecret(id) {
  const secret=v2Props().getProperty('V2_ADMIN_SECRET');
  if(!secret || secret.length<32) throw new Error('Configure the separate admin secret first');
  return v2Hash(secret+':group-session:'+id);
}
function v2GroupPin(previousHash) {
  // Rejection sampling keeps 00–99 equally likely and rotation changes the PIN.
  for(;;) {
    const n=parseInt(v2Id().replace(/-/g,'').slice(0,2),16);
    if(n<200) {
      const pin=String(n%100).padStart(2,'0');
      if(!previousHash || !v2Equal(v2Hash(pin),previousHash)) return pin;
    }
  }
}
function v2OpenGroup(data) {
  return withScriptLock(()=>{
    v2Writable(data.eventId);
    const row=v2Rows('ScoringCredentials').reverse().find(r=>{
      const c=JSON.parse(r.data);
      return c.role==='scorer' && c.event_id===String(data.eventId) &&
        c.group_no===Number(data.groupNo) && !c.revoked && c.expires_at>Date.now() && c.pin_hash;
    });
    if(!row) throw new Error('Group PIN invalid or expired');
    const c=JSON.parse(row.data),now=Date.now();
    if(!c.attempt_window || now-c.attempt_window>=60000) {c.attempt_window=now;c.attempts=0;}
    if(c.attempts>=5) throw new Error('Too many PIN attempts. Try again in one minute.');
    c.attempts++;
    const valid=/^[0-9]{2}$/.test(String(data.pin||'')) && v2Equal(c.pin_hash,v2Hash(String(data.pin)));
    v2Put('ScoringCredentials',row.credential_id,[row.credential_id,JSON.stringify(c)]);
    if(!valid) throw new Error('Group PIN invalid or expired');
    const token=row.credential_id+'.'+v2GroupSecret(row.credential_id);
    v2Scope(v2Auth(token),data.eventId,[],data.groupNo);
    return {ok:true,token,credential_id:row.credential_id,expires_at:c.expires_at};
  });
}
function v2Auth(token) {
  const parts=String(token||'').split('.');
  const row=parts.length===2 && v2Rows('ScoringCredentials').find(r=>r.credential_id===parts[0]);
  const c=row && JSON.parse(row.data);
  if(!c || c.revoked || c.expires_at<=Date.now() || !v2Equal(c.hash,v2Hash(parts[1]))) throw new Error('Scoring credential invalid or expired');
  return {role:c.role,credential_id:row.credential_id,event_id:c.event_id,group_no:c.group_no};
}
function v2RecheckActor(actor) {
  if(!actor) throw new Error('Authentication required');
  const row=v2Rows('ScoringCredentials').find(r=>r.credential_id===actor.credential_id),c=row&&JSON.parse(row.data);
  if(!c||c.revoked||c.expires_at<=Date.now()) throw new Error('Scoring credential invalid or expired');
}
function v2Admin(actor) { v2RecheckActor(actor); if(actor.role!=='admin') throw new Error('Admin authentication required'); }
function v2Scope(actor,eventId,playerIds,groupNo) {
  v2RecheckActor(actor);
  if(actor.role==='admin') return;
  if(actor.role!=='scorer' || actor.event_id!==String(eventId) || (groupNo!==undefined && Number(groupNo)!==actor.group_no))
    throw new Error('Credential does not authorize this group');
  const ids=new Set(legacyGetGroups(eventId).filter(p=>p.group_no===actor.group_no).map(p=>String(p.player_id)));
  if((playerIds||[]).some(id=>!ids.has(String(id)))) throw new Error('Credential does not authorize this player');
}
function v2Course(meta) {
  const rows=v2Rows('RoundCourseHoles').filter(r=>r.snapshot_id===meta.course_snapshot_id).map(r=>JSON.parse(r.data));
  if(rows.length!==18 || !Array.from({length:18},(_,i)=>i+1).every(h=>rows.some(r=>Number(r.hole)===h)))
    throw new Error('Incomplete immutable course snapshot');
  return rows;
}
function v2SnapshotEvent(eventId) {
  const event=getEventById(eventId), id=v2Id();
  const holes=getCourse().filter(h=>String(h.course)===String(event.course)&&String(h.tee)===String(event.tee));
  legacyGetTeeData(event);
  if(!Array.from({length:18},(_,i)=>i+1).every(h=>holes.some(r=>Number(r.hole)===h))) throw new Error('Invalid hole numbers');
  const indexes=holes.map(h=>Number(h.stroke_index));
  if(new Set(indexes).size!==18 || indexes.some(i=>!Number.isInteger(i)||i<1||i>18) || holes.some(h=>!Number.isInteger(Number(h.par))||Number(h.par)<1)) throw new Error('Invalid par or stroke indexes');
  holes.forEach(h=>v2Append('RoundCourseHoles',[id,Number(h.hole),JSON.stringify(h)]));
  const meta={schema_version:2,course_snapshot_id:id,allowance:1,calculation_version:'stableford-v1',rounding:'nearest-ties-away-from-zero',revealed_at:null,locked:false};
  v2Put('RoundEventsV2',eventId,[eventId,JSON.stringify(meta)]);
  return meta;
}
function getTeeData(event) {
  const meta=v2Meta(event.event_id); if(!meta) return legacyGetTeeData(event);
  const holes=v2Course(meta);
  return {slope:Number(holes[0].slope),rating:Number(holes[0].course_rating),par:holes.reduce((s,h)=>s+Number(h.par),0)};
}
function getCurrentEvent() {
  const event=legacyGetCurrentEvent(); if(!event) return event;
  const meta=v2Meta(event.event_id); return {...event,schema_version:meta?2:1,locked:Boolean(meta&&(meta.locked||meta.revealed_at))};
}
function getGroups(eventId) {
  const groups=legacyGetGroups(eventId),meta=v2Meta(eventId); if(!meta) return groups;
  const snapshots=v2Rows('RoundPlayers').filter(r=>String(r.event_id)===String(eventId)).filter(r=>JSON.parse(r.data).group_version===meta.group_version);
  return groups.map(p=>{
    const accepted=(meta.confirmed_groups||{})[String(p.group_no)]||[];
    const rows=snapshots.filter(r=>String(r.player_id)===String(p.player_id)&&accepted.includes(r.snapshot_id));
    return rows.length ? {...p,...JSON.parse(rows[rows.length-1].data),handicap_confirmed:true} : {...p,handicap_confirmed:false};
  });
}
function v2Operations(eventId) { return v2Rows('ScoreOperations').map(r=>({...r,payload:JSON.parse(r.data)})).filter(r=>r.payload.event_id===String(eventId)); }
function getScores(eventId) {
  const meta=v2Meta(eventId);
  if(!getSpreadsheet().getSheetByName('ScoreOperations')) return legacyGetScores(eventId);
  const committed=new Set(v2Operations(eventId).filter(o=>o.state==='COMMITTED').map(o=>o.operation_id));
  const map={};
  if(!meta) legacyGetScores(eventId).forEach(s=>{map[JSON.stringify([String(eventId),String(s.player_id),Number(s.hole)])]={...s,revision:0,score_status:'scored'};});
  v2Rows('ScoresV2').filter(r=>committed.has(r.operation_id)).forEach(r=>{
    const s=JSON.parse(r.data); if(!map[r.score_key] || s.revision>map[r.score_key].revision) map[r.score_key]=s;
  });
  return Object.values(map);
}
function v2EnsureImmutableRow(table,operation,key,revision,data) {
  const existing=v2Rows(table).filter(r=>r.operation_id===operation && r.score_key===key && Number(r.revision)===revision);
  const encoded=JSON.stringify(data);
  if(existing.length>1 || existing.some(r=>r.data!==encoded)) throw new Error('Journal integrity error: '+table);
  if(!existing.length) v2Append(table,[operation,key,revision,encoded]);
}
/** WAL recovery. PREPARED rows contain the complete validated result, never a credential secret. */
function v2RecoverOperation(o) {
  o.payload.changes.forEach(c=>{
    v2EnsureImmutableRow('ScoresV2',o.operation_id,c.key,c.after.revision,c.after);
    v2EnsureImmutableRow('ScoreHistory',o.operation_id,c.key,c.after.revision,c);
  });
  SpreadsheetApp.flush();
  v2Put('ScoreOperations',o.operation_id,[o.operation_id,'COMMITTED',o.data]);
  SpreadsheetApp.flush();
}
function v2Recover(eventId) {
  v2Operations(eventId).filter(o=>o.state==='PREPARED').forEach(v2RecoverOperation);
}
function v2Save(data,actor) {return withScriptLock(()=>v2SaveLocked(data,actor));}
function v2SaveLocked(data,actor,dryRun=false) {
    const eventId=String(data.eventId||''),meta=v2Writable(eventId);
    v2Scope(actor,eventId,(data.scores||[]).map(s=>s.playerId));
    if(!/^[a-zA-Z0-9_-]{16,100}$/.test(String(data.operationId||''))) throw new Error('A stable operation ID is required');
    const request={eventId,hole:Number(data.hole),scores:data.scores};
    const requestHash=v2Hash(JSON.stringify(request));
    const prior=v2Rows('ScoreOperations').find(r=>r.operation_id===data.operationId);
    if(prior) {
      const p=JSON.parse(prior.data);
      if(!['COMMITTED','PREPARED','CANCELLED'].includes(prior.state))throw Error('Journal integrity error: unknown operation state');
      if(prior.state==='CANCELLED')throw Error('Operation resolved after review; reopen recovery');
      if(p.actor.credential_id!==actor.credential_id || p.request_hash!==requestHash || p.event_id!==eventId) throw new Error('Operation ID reused with different request');
      v2Recover(eventId); return p.result;
    }
    // Recover all earlier accepted intents BEFORE checking this request's expected revisions.
    v2Recover(eventId);
    const hole=Number(data.hole),incoming=data.scores;
    if(!Number.isInteger(hole)||hole<1||hole>18 || !Array.isArray(incoming)||!incoming.length) throw new Error('Invalid hole or scores');
    if(new Set(incoming.map(s=>String(s.playerId))).size!==incoming.length) throw new Error('Duplicate player scores');
    const event=getEventById(eventId);
    const courseHole=meta?v2Course(meta).find(h=>Number(h.hole)===hole):getCourseHole(event.course,event.tee,hole), groups=getGroups(eventId),scores=getScores(eventId);
    if(!courseHole) throw new Error('Course hole not found');
    const changes=incoming.map(item=>{
      const player=groups.find(p=>String(p.player_id)===String(item.playerId));
      if(!player || (meta && !player.snapshot_id)) throw new Error('Confirm immutable handicaps before scoring');
      if(!meta && item.status==='pickup') throw new Error('Legacy rounds require numeric gross scores');
      if(!meta) requireConfirmedHandicaps(eventId,[String(item.playerId)]);
      const before=scores.find(s=>String(s.player_id)===String(item.playerId)&&Number(s.hole)===hole)||null;
      if(Number(item.expectedRevision)!==(before?before.revision:0)) throw new Error('Score changed on another device. Reload before correcting.');
      if(!['pickup','scored'].includes(item.status)) throw new Error('Invalid score status');
      if(item.status==='pickup' && item.gross!==null) throw new Error('A pickup must have no gross score');
      if(item.status==='scored' && (typeof item.gross!=='number'||!Number.isInteger(item.gross))) throw new Error('Numeric gross required');
      if(item.status==='scored') validateGrossScore(hole,item.gross);
      const changed=!before || before.score_status!==item.status || before.gross!==item.gross;
      const reason=String(item.reason||'').trim();
      if(before && changed && (!reason || reason.length>500)) throw new Error('Correction reason required (1–500 characters)');
      if(!changed) return null;
      if(meta) v2Rules(meta,player);
      const calc=item.status==='pickup'?{gross:null,net:null,stableford:0,blob:true,birdie:false,eagle:false}: {gross:item.gross,...(meta?v2ScoreV1(player,courseHole,item.gross):calculateScore(player,courseHole,item.gross))};
      const after={event_id:eventId,player_id:String(item.playerId),hole,score_status:item.status,...calc,
        revision:before?before.revision+1:1,course_snapshot_id:meta?meta.course_snapshot_id:null,player_snapshot_id:meta?player.snapshot_id:null,
        calculation_source:meta?'immutable_snapshot':'legacy_live_course_not_historical',
        operation_id:data.operationId,updated_at:v2Now()};
      return {key:JSON.stringify([eventId,String(item.playerId),hole]),before,after,reason:before?reason:'Initial entry',actor};
    }).filter(Boolean);
    const result={ok:true,scores:incoming.map(item=>{
      const c=changes.find(c=>c.after.player_id===String(item.playerId));
      return c?c.after:scores.find(s=>String(s.player_id)===String(item.playerId)&&Number(s.hole)===hole);
    })};
    const payload={event_id:eventId,actor,request_hash:requestHash,changes,result};
    if(dryRun)return result;
    v2Append('ScoreOperations',[data.operationId,'PREPARED',JSON.stringify(payload)]);
    SpreadsheetApp.flush();
    v2RecoverOperation({operation_id:data.operationId,data:JSON.stringify(payload),payload});
    return result;
}
/** Authenticated reconciliation of an immutable request, including after reveal/rotation.
 * Only accepted journal intents are recovered; this never creates a new score operation.
 */
function v2StatusRead(data,actor,recover=false) {
  const eventId=String(data.eventId||'');
  v2Scope(actor,eventId,(data.scores||[]).map(s=>s.playerId),data.groupNo);
  if(!/^[a-zA-Z0-9_-]{16,100}$/.test(String(data.operationId||'')))throw Error('A stable operation ID is required');
  const prior=v2Rows('ScoreOperations').find(r=>r.operation_id===data.operationId);
  if(!prior)return {ok:true,state:'ABSENT'};
  const p=JSON.parse(prior.data);
  if(!['COMMITTED','PREPARED','CANCELLED'].includes(prior.state))throw Error('Journal integrity error: unknown operation state');
  if(p.event_id!==eventId)throw Error('Operation does not authorize this round');
  v2Scope(actor,eventId,p.player_ids||p.result.scores.map(s=>s.player_id));
  if(v2Hash(JSON.stringify({eventId,hole:Number(data.hole),scores:data.scores}))!==p.request_hash)throw Error('Operation ID reused with different request');
  if(prior.state==='PREPARED') {
    if(!recover)return {ok:true,state:'PREPARED'};
    v2RecoverOperation({operation_id:prior.operation_id,data:prior.data,payload:p});
  }
  if(prior.state==='CANCELLED') {
    const intent=p.resolutions[p.resolutions.length-1];
    if(intent.result)return {ok:true,state:'CANCELLED',resolution:intent.result};
    const child=v2Rows('ScoreOperations').find(r=>r.operation_id===intent.id);
    if(child) {
      const accepted=JSON.parse(child.data),expected=v2Hash(JSON.stringify({eventId:p.event_id,hole:Number(intent.request.hole),scores:intent.request.scores}));
      if(accepted.event_id!==p.event_id||accepted.request_hash!==expected)throw Error('Recovery operation ID reused with different request');
      v2Scope(actor,p.event_id,accepted.result.scores.map(s=>s.player_id));
    }
    if(child&&child.state==='PREPARED') {
      if(!recover)return {ok:true,state:'PREPARED'};
      v2RecoverOperation({operation_id:child.operation_id,data:child.data,payload:JSON.parse(child.data)});
    }
    if(child&&['PREPARED','COMMITTED'].includes(child.state))return {ok:true,state:'CANCELLED',resolution:{outcome:'replacement-accepted',operationId:intent.id,scores:JSON.parse(child.data).result.scores}};
    return {ok:true,state:'CANCELLED'};
  }
  return {ok:true,state:'COMMITTED',result:p.result};
}
function v2OperationStatus(data,actor) {
  // Committed journal results are immutable. No lock or whole-round recovery for a read.
  const result=v2StatusRead(data,actor);
  return result.state==='PREPARED'?withScriptLock(()=>v2StatusRead(data,actor,true)):result;
}
function v2ReviewOperation(data,actor) {
  return withScriptLock(()=>{
    const status=v2StatusRead(data,actor,true),event=getEventById(data.eventId);
    if(!event)throw Error('Old round is unavailable on this backend; retain/export its local records');
    v2Recover(String(data.eventId));
    const ids=(data.scores||[]).map(s=>String(s.playerId));
    return {...status,meta:v2Meta(data.eventId),scores:getScores(data.eventId).filter(s=>ids.includes(String(s.player_id))&&Number(s.hole)===Number(data.hole))};
  });
}
function v2ResolveOperation(data,actor) {
  return withScriptLock(()=>{
    const original=data.original;
    if(!original||!['server','local'].includes(data.choice)||!/^[a-zA-Z0-9_-]{16,100}$/.test(String(data.resolutionId||''))||data.resolutionId===original.operationId)throw Error('Invalid reviewed recovery request');
    const status=v2StatusRead(original,actor,true);
    if(status.state==='COMMITTED')return {ok:true,outcome:'original-accepted',scores:status.result.scores};
    const eventId=String(original.eventId),rows=v2Rows('ScoreOperations');
    const prior=rows.find(r=>r.operation_id===original.operationId),p=prior&&JSON.parse(prior.data);
    const hash=v2Hash(JSON.stringify({choice:data.choice,reviewed:data.reviewed,replacement:data.replacement}));
    const known=p?.resolutions?.find(r=>r.id===data.resolutionId);
    if(known&&known.hash!==hash)throw Error('Recovery ID reused with different request');
    if(known?.result)return {ok:true,...known.result};
    if(status.resolution)return {ok:true,...status.resolution};
    // Resume the durably recorded decision; current authentication/scope are rechecked.
    const decision=known||{id:data.resolutionId,hash,choice:data.choice,request:data.replacement,reviewed:data.reviewed,actor,reviewed_at:v2Now()};
    v2Writable(eventId);v2Scope(actor,eventId,original.scores.map(s=>s.playerId),original.groupNo);v2Recover(eventId);
    const ids=original.scores.map(s=>String(s.playerId)),current=getScores(eventId).filter(s=>ids.includes(String(s.player_id))&&Number(s.hole)===Number(original.hole));
    if(!known||decision.choice==='server') {
      const reviewed=known?decision.reviewed:data.reviewed;
      if(!Array.isArray(reviewed)||reviewed.length!==ids.length||new Set(reviewed.map(s=>String(s.playerId))).size!==ids.length)throw Error('Review every player before recovery');
      for(const item of reviewed) {
        const before=current.find(s=>String(s.player_id)===String(item.playerId));
        if(!ids.includes(String(item.playerId))||item.revision!==(before?.revision||0))throw Error('Score changed again. Review the latest server values before confirming.');
      }
    }
    if(decision.choice==='local') {
      const replacement=decision.request;
      if(!replacement||replacement.action!=='saveHoleScores'||replacement.eventId!==eventId||replacement.hole!==Number(original.hole)||replacement.scores.length!==ids.length||new Set(replacement.scores.map(s=>String(s.playerId))).size!==ids.length||replacement.scores.some(s=>!ids.includes(String(s.playerId))))throw Error('Recovery cannot change round, hole or players');
      // Validate before cancelling the original. Existing revision/reason checks remain mandatory.
      v2SaveLocked({...replacement,operationId:decision.id},actor,true);
    }
    if(!known) {
      if(rows.some(r=>r.operation_id===decision.id))throw Error('Recovery operation ID is already in use');
      const payload=p||{event_id:eventId,request_hash:v2Hash(JSON.stringify({eventId,hole:Number(original.hole),scores:original.scores})),player_ids:ids,resolutions:[]};
      payload.resolutions.push(decision);
      // A tombstone prevents a delayed original upload from undoing the reviewed decision.
      v2Put('ScoreOperations',original.operationId,[original.operationId,'CANCELLED',JSON.stringify(payload)]);SpreadsheetApp.flush();
    }
    let result;
    if(decision.choice==='local') {
      const saved=v2SaveLocked({...decision.request,operationId:decision.id},actor);
      result={outcome:'replacement-accepted',operationId:decision.id,scores:saved.scores};
    }else result={outcome:'kept-server',operationId:decision.id,scores:current};
    const record=v2Rows('ScoreOperations').find(r=>r.operation_id===original.operationId),payload=JSON.parse(record.data);
    payload.resolutions.find(r=>r.id===decision.id).result=result;
    v2Put('ScoreOperations',original.operationId,[original.operationId,'CANCELLED',JSON.stringify(payload)]);SpreadsheetApp.flush();
    return {ok:true,...result};
  });
}
function doGet(e) {
  try {
    const p=(e&&e.parameter)||{},action=p.action||'status',eventId=String(p.eventId||'');
    if(action==='status') return jsonResponse({ok:true,app:'The Real Flag Hunters',version:'2-phase2',api_generation:'v2-phase1',message:'V2 test backend'});
    if(action==='scorecard') return jsonResponse({ok:true,scorecard:v2Scorecard(eventId,String(p.playerId||''))});
    if(action==='scores') return jsonResponse({ok:true,scores:v2PublicScores(eventId)});
    if(action==='leaderboard') return jsonResponse({ok:true,leaderboard:getLeaderboard(eventId),revealed:v2ResultsRevealed(eventId)});
    if(action==='competitions') return jsonResponse({ok:true,...v2PublicCompetitions(eventId)});
    if(action==='roundCourse') {const meta=v2Meta(eventId);return jsonResponse({ok:true,course:meta?v2Course(meta):getCourse()});}
    // Explicit allowlist: no future legacy endpoint can bypass the reveal policy.
    if(!['currentEvent','groups','players','course','season'].includes(action)) throw new Error('Unknown action');
    return legacyDoGet(e);
  } catch(err) {return jsonResponse({ok:false,error:err.message});}
}
function doPost(e) {
  try {
    v2AssertEnabled();
    const data=JSON.parse((e&&e.postData&&e.postData.contents)||'{}'), action=data.action;
    if(action==='adminLogin') {
      return jsonResponse(withScriptLock(()=>{
        const cache=CacheService.getScriptCache(), failures=Number(cache.get('v2-admin-failures')||0);
        if(failures>=10) throw new Error('Too many admin attempts. Try again in one minute.');
        const secret=v2Props().getProperty('V2_ADMIN_SECRET');
        if(!secret || secret.length<32 || !v2Equal(v2Hash(String(data.pin||'')),v2Hash(secret))) {
          cache.put('v2-admin-failures',String(failures+1),60);throw new Error('Admin authentication failed');
        }
        cache.remove('v2-admin-failures');return {ok:true,...v2Issue('admin')};
      }));
    }
    if(action==='openGroup') return jsonResponse(v2OpenGroup(data));
    const actor=v2Auth(data.credential);
    if(action==='reviewOperation')return jsonResponse(v2ReviewOperation(data,actor));
    if(action==='resolveOperation')return jsonResponse(v2ResolveOperation(data,actor));
    if(action==='operationStatus')return jsonResponse(v2OperationStatus(data,actor));
    if(action==='revealResults') return jsonResponse(v2RevealResults(data,actor));
    if(action==='adminCompetitionData') {v2Admin(actor);return jsonResponse({ok:true,...getCompetitionData(data.eventId)});}

    if(action==='issueGroupCredential') return jsonResponse(withScriptLock(()=>{
      v2Admin(actor); v2Writable(data.eventId);
      const group=getGroups(data.eventId).filter(p=>p.group_no===Number(data.groupNo));
      if(!group.length || group.filter(p=>p.scorer).length!==1) throw new Error('Group must have one assigned scorer');
      const table=v2Table('ScoringCredentials'),values=table.getDataRange().getValues();
      const credentials=values.slice(1).map((r,i)=>({id:r[0],row:i+2,data:JSON.parse(r[1])}));
      const active=credentials.filter(r=>r.data.role==='scorer'&&r.data.event_id===String(data.eventId)&&r.data.group_no===Number(data.groupNo)&&!r.data.revoked);
      const pin=v2GroupPin(active.length?active[active.length-1].data.pin_hash:null);
      for(const row of active){row.data.revoked=true;table.getRange(row.row,1,1,2).setValues([[row.id,JSON.stringify(row.data)]]);}
      const issued=v2Issue('scorer',data.eventId,data.groupNo,{pin_hash:v2Hash(pin)});
      return {ok:true,pin,credential_id:issued.credential_id,expires_at:issued.expires_at};
    }));
    if(action==='verifyGroupCredential') { v2Scope(actor,data.eventId,[],data.groupNo); return jsonResponse({ok:true,actor}); }
    if(action==='scoreHistory') {
      v2Scope(actor,data.eventId,[data.playerId]);
      const committed=new Set(v2Operations(data.eventId).filter(o=>o.state==='COMMITTED').map(o=>o.operation_id));
      return jsonResponse({ok:true,history:v2Rows('ScoreHistory').filter(r=>committed.has(r.operation_id)).map(r=>JSON.parse(r.data))
        .filter(c=>c.after.player_id===String(data.playerId)&&(!data.hole||c.after.hole===Number(data.hole)))});
    }
    if(action==='roundBootstrap') {
      v2Scope(actor,data.eventId,[],data.groupNo);
      const meta=v2Meta(data.eventId),groups=getGroups(data.eventId);
      const ownPlayers=new Set(groups.filter(p=>p.group_no===actor.group_no).map(p=>String(p.player_id)));
      return jsonResponse({ok:true,meta,course:meta?v2Course(meta):getCourse(),groups,
        scores:getScores(data.eventId).filter(s=>actor.role==='admin'||ownPlayers.has(String(s.player_id)))});
    }
    if(action==='saveHoleScores' || action==='saveScore') {
      if(action==='saveScore') data.scores=[{playerId:data.playerId,gross:data.gross,status:data.status,reason:data.reason,expectedRevision:data.expectedRevision}];
      const result=v2Save(data,actor);
      return jsonResponse(action==='saveScore'?{...result,...result.scores[0]}:result);
    }
    if(action==='recoverScores') return jsonResponse(withScriptLock(()=>{v2Admin(actor);v2Writable(data.eventId);v2Recover(String(data.eventId));return {ok:true};}));
    const adminActions=['createEvent','saveGroups','saveCompetitionSetup','drawBlindPairs','correctPinWinner'];
    if(adminActions.includes(action)) v2Admin(actor);
    else if(['confirmGroupHandicaps','completeGroup','updatePinLeader'].includes(action)) {
      v2Scope(actor,data.eventId,action==='confirmGroupHandicaps'?(data.handicaps||[]).map(h=>h.player_id):[],data.groupNo);
    } else if(!['saveHoleScores','saveScore'].includes(action)) throw new Error('Unknown action');
    if(action==='createEvent') return jsonResponse(withScriptLock(()=>{
      // All creation now uses V2. Orphan setup after failure remains safely unscorable.
      v2Admin(actor);return v2CreateEvent(data);
    }));
    if(data.eventId) {
      v2Writable(data.eventId);
      if(v2Meta(data.eventId)) withScriptLock(()=>v2Recover(String(data.eventId)));
    }
    if(action==='confirmGroupHandicaps' && v2Meta(data.eventId)) return jsonResponse(withScriptLock(()=>{
      v2Scope(actor,data.eventId,(data.handicaps||[]).map(h=>h.player_id),data.groupNo);
      const meta=v2Writable(data.eventId),members=legacyGetGroups(data.eventId).filter(p=>p.group_no===Number(data.groupNo));
      v2Recover(String(data.eventId));
      if(!members.length || !Array.isArray(data.handicaps) || data.handicaps.length!==members.length || new Set(data.handicaps.map(h=>String(h.player_id))).size!==members.length) throw new Error('Confirm every group member exactly once');
      if(getScores(data.eventId).some(s=>members.some(p=>String(p.player_id)===String(s.player_id)))) throw new Error('Handicaps are locked after scoring starts');
      const tee=getTeeData(getEventById(data.eventId));
      const snapshots=members.map(p=>{
        const h=data.handicaps.find(h=>String(h.player_id)===String(p.player_id)); if(!h) throw new Error('Handicap missing');
        v2Rules(meta);
        const index=validateHandicapIndex(h.handicap_index),raw=index*tee.slope/113+tee.rating-tee.par;
        const ch=Math.sign(raw)*Math.floor(Math.abs(raw)+0.5);
        return {snapshot_id:v2Id(),group_version:meta.group_version,handicap_index:index,course_handicap:ch,playing_handicap:ch,
          allowance:meta.allowance,calculation_version:meta.calculation_version,rounding:meta.rounding,confirmed_at:v2Now()};
      });
      snapshots.forEach((snapshot,i)=>v2Append('RoundPlayers',[snapshot.snapshot_id,data.eventId,String(members[i].player_id),JSON.stringify(snapshot)]));
      SpreadsheetApp.flush();
      meta.confirmed_groups=meta.confirmed_groups||{};meta.confirmed_groups[String(data.groupNo)]=snapshots.map(p=>p.snapshot_id);
      v2Put('RoundEventsV2',data.eventId,[data.eventId,JSON.stringify(meta)]);
      return {ok:true,groups:getGroups(data.eventId)};
    }));
    // Authentication is complete; legacy internal PIN checks never receive the caller's admin secret.
    data._v2Actor=actor;
    data.pin=ADMIN_PIN;
    return legacyDoPost({postData:{contents:JSON.stringify(data)}});
  } catch(err) { return jsonResponse({ok:false,error:err.message}); }
}

function v2AfterGroupSave(eventId) {
  const meta=v2Meta(eventId); if(!meta) return;
  meta.group_version=v2Id();meta.confirmed_groups={};
  v2Put('RoundEventsV2',eventId,[eventId,JSON.stringify(meta)]);
  v2Rows('ScoringCredentials').forEach(r=>{const c=JSON.parse(r.data);if(c.role==='scorer'&&c.event_id===String(eventId)){c.revoked=true;v2Put('ScoringCredentials',r.credential_id,[r.credential_id,JSON.stringify(c)]);}});
}

function v2CreateEvent(data) {
  const tee=String(data.tee||'White');if(!['White','Yellow'].includes(tee)) throw new Error('Invalid tee');
  const eventId='event-'+v2Id(),date=data.date||Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd');
  // Setup is never a writable scoring state. Failure at any step leaves an unscorable setup round.
  sheetNamed('Events').appendRow([eventId,date,'Brickendon Grange',tee,'setup',false]);
  v2SnapshotEvent(eventId);SpreadsheetApp.flush();
  const values=sheetNamed('Events').getDataRange().getValues(),i=values.findIndex((r,j)=>j>0&&String(r[0])===eventId);
  sheetNamed('Events').getRange(i+1,5).setValue('active');
  return {ok:true,event_id:eventId,schema_version:2};
}
function v2EclecticCandidates(eventId) {
  // Eclectic presentation is a later phase. Never manufacture a candidate for a pickup.
  return getScores(eventId).filter(s=>s.score_status!=='pickup'&&s.gross!==null&&Number.isFinite(Number(s.gross)));
}
function v2Rules(meta,player) {
  if(meta.calculation_version!=='stableford-v1'||meta.allowance!==1||meta.rounding!=='nearest-ties-away-from-zero' ||
    (player && (player.calculation_version!==meta.calculation_version||player.allowance!==meta.allowance||player.rounding!==meta.rounding)))
    throw new Error('Unsupported immutable calculation rules');
}
function v2ScoreV1(player,hole,gross) {
  // Keep this version when adding future calculation rules; never silently change historical rounds.
  const h=Number(player.playing_handicap),si=Number(hole.stroke_index);
  if(!Number.isInteger(h)||!Number.isInteger(si)||si<1||si>18)throw new Error('Invalid snapshot handicap or stroke index');
  const strokes=Math.floor((h+18-si)/18),net=gross-strokes,points=Math.max(0,2+Number(hole.par)-net);
  return {net,stableford:points,strokes_received:strokes,blob:points===0,birdie:gross===Number(hole.par)-1,eagle:gross<=Number(hole.par)-2};
}

// Phase 2: only these projections may be returned by unauthenticated result routes.
function v2ResultsRevealed(eventId) {
  const meta=v2Meta(eventId);
  return !meta || Boolean(meta.revealed_at);
}
function v2PublicScores(eventId) {
  const revealed=v2ResultsRevealed(eventId);
  return getScores(eventId).filter(s=>revealed||Number(s.hole)<=15);
}
function v2PublicCompetitions(eventId) {
  const data=getCompetitionData(eventId);
  if(v2ResultsRevealed(eventId)) return data;
  const visible=object=>Object.fromEntries(Object.entries(object||{}).filter(([h])=>Number(h)<=15));
  return {...data,config:{...data.config,nearest_holes:(data.config.nearest_holes||[]).filter(h=>Number(h)<=15)},
    nearest_pins:visible(data.nearest_pins),pin_acknowledgements:visible(data.pin_acknowledgements),
    blind_pairs:[],group_status:[],all_groups_finished:false,results_partial:true};
}
function v2Split(scores,first,last) {
  const rows=scores.filter(s=>Number(s.hole)>=first&&Number(s.hole)<=last);
  const pickup=rows.some(s=>s.score_status==='pickup');
  return {gross:pickup?null:rows.reduce((n,s)=>n+Number(s.gross||0),0),gross_incomplete:pickup,
    stableford:rows.reduce((n,s)=>n+Number(s.stableford||0),0),holes:rows.length,
    expected_holes:last-first+1,partial:rows.length<last-first+1,through_hole:last};
}
function v2Leaderboard(eventId) {
  if(!eventId)return [];
  const revealed=v2ResultsRevealed(eventId),last=revealed?18:15,scores=v2PublicScores(eventId);
  return getGroups(eventId).map(p=>{
    const rows=scores.filter(s=>String(s.player_id)===String(p.player_id));
    const front9=v2Split(rows,1,9),back9=v2Split(rows,10,last),total=v2Split(rows,1,last);
    back9.partial=back9.partial||!revealed;total.partial=total.partial||!revealed;
    const pickup=total.gross_incomplete;
    return {player_id:p.player_id,name:p.player_name,playing_handicap:p.playing_handicap,
      front9,back9,total,revealed,gross:total.gross,gross_incomplete:pickup,
      net:pickup?null:rows.reduce((n,s)=>n+Number(s.net||0),0),net_incomplete:pickup,
      stableford:total.stableford,holes:total.holes,
      blobs:rows.filter(s=>isTrue(s.blob)).length,birdies:rows.filter(s=>isTrue(s.birdie)).length,eagles:rows.filter(s=>isTrue(s.eagle)).length};
  }).sort((a,b)=>b.stableford-a.stableford||String(a.player_id).localeCompare(String(b.player_id)));
}
function v2RevealResults(data,actor) {
  return withScriptLock(()=>{
    v2Admin(actor);
    const eventId=String(data.eventId||''),meta=v2Meta(eventId);
    if(!meta) throw new Error('A V2 round is required');
    if(meta.revealed_at) return {ok:true,revealed:true,leaderboard:getLeaderboard(eventId)};
    v2Writable(eventId);
    v2Recover(eventId);
    const groups=getGroups(eventId),scores=getScores(eventId);
    if(!groups.length||!allGroupsFinished(eventId)||groups.some(p=>
      !Array.from({length:18},(_,i)=>i+1).every(h=>scores.some(s=>String(s.player_id)===String(p.player_id)&&Number(s.hole)===h))))
      throw new Error('Every group must finish all 18 holes before reveal');
    const competition=competitionRecord(eventId);
    if(competition.blindEnabled&&!competition.pairs.length) throw new Error('Draw Blind Pairs before reveal');
    meta.revealed_at=v2Now();meta.locked=true;
    v2Put('RoundEventsV2',eventId,[eventId,JSON.stringify(meta)]);
    SpreadsheetApp.flush();
    return {ok:true,revealed:true,leaderboard:getLeaderboard(eventId)};
  });
}

// Public scorecards use the same filtered scores and summaries as the leaderboard.
function v2Scorecard(eventId,playerId) {
  if(!eventId||!playerId) throw new Error('Event and player are required');
  const player=v2Leaderboard(eventId).find(p=>String(p.player_id)===playerId);
  if(!player) throw new Error('Player not found in this round');
  const meta=v2Meta(eventId),event=getEventById(eventId);
  const course=meta?v2Course(meta):getCourse().filter(h=>String(h.course)===String(event.course)&&String(h.tee)===String(event.tee));
  const scores=v2PublicScores(eventId).filter(s=>String(s.player_id)===playerId);
  const last=player.revealed?18:15;
  const holes=Array.from({length:last},(_,i)=>{
    const hole=i+1,c=course.find(h=>Number(h.hole)===hole),score=scores.find(s=>Number(s.hole)===hole);
    return {hole,par:c?Number(c.par):null,stroke_index:c?Number(c.stroke_index):null,
      status:score?(score.score_status==='pickup'?'pickup':'scored'):'unplayed',
      gross:score&&score.score_status!=='pickup'?Number(score.gross):null,
      stableford:score?Number(score.stableford):null};
  });
  return {player_id:player.player_id,name:player.name,playing_handicap:player.playing_handicap,
    revealed:player.revealed,front9:player.front9,back9:player.back9,total:player.total,holes,
    hidden_holes:player.revealed?[]:[16,17,18]};
}
