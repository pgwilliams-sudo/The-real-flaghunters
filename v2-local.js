/* Phase 3 Stage 2: local transactions/drafts only. No network or background sync. */
((root) => {
  'use strict';
  const NAME='flaghunters-v2-local',VERSION=1;
  let opening;
  const clone=value=>JSON.parse(JSON.stringify(value));
  function identity(value) {
    if(!value||typeof value.backend!=='string'||!value.backend||typeof value.eventId!=='string'||!value.eventId||
      !Number.isInteger(value.groupNo)||value.groupNo<1||typeof value.credentialId!=='string'||!value.credentialId)throw Error('Invalid local round/group identity');
    return {backend:value.backend,eventId:value.eventId,groupNo:value.groupNo,credentialId:value.credentialId};
  }
  const key=value=>JSON.stringify(Object.values(identity(value)));
  const sessionKey=(backend,eventId,groupNo)=>JSON.stringify([backend,eventId,Number(groupNo)]);
  const matches=(value,filter={})=>Object.entries(filter).every(([name,v])=>value[name]===v);
  const unaccepted=draft=>draft.status!=='accepted';
  function database() {
    if(!root.indexedDB)return Promise.reject(Error('IndexedDB unavailable; scores cannot be saved safely on this device'));
    if(!opening)opening=new Promise((resolve,reject)=>{
      let canceled=false;
      const request=root.indexedDB.open(NAME,VERSION);
      request.onupgradeneeded=()=>{
        const db=request.result;
        for(const store of ['sessions','snapshots','drafts'])if(!db.objectStoreNames.contains(store)) {
          const table=db.createObjectStore(store,{keyPath:store==='drafts'?'operationId':'key'});
          if(store==='drafts')table.createIndex('scope','scope');
        }
      };
      request.onerror=()=>{opening=null;reject(request.error||Error('Local storage could not be opened'));};
      request.onblocked=()=>{canceled=true;opening=null;reject(Error('Local storage upgrade blocked; close other V2 tabs without clearing their data'));};
      request.onsuccess=()=>{
        const db=request.result;if(canceled){db.close();return;}
        db.onversionchange=()=>{db.close();opening=null;};
        resolve(db);
      };
    });
    return opening;
  }
  async function transaction(stores,mode,work) {
    const db=await database();
    return new Promise((resolve,reject)=>{
      let tx,result,failure;
      try{tx=mode==='readwrite'?db.transaction(stores,mode,{durability:'strict'}):db.transaction(stores,mode);}
      catch(error){if(error.name!=='TypeError')return reject(error);tx=db.transaction(stores,mode);}
      const fail=error=>{failure=error;try{tx.abort();}catch(_){};};
      tx.oncomplete=()=>resolve(result);
      tx.onerror=()=>{failure ||= tx.error;};
      tx.onabort=()=>reject(failure||tx.error||Error('Local transaction aborted; score was not saved'));
      try{work(tx,value=>{result=value;},fail);}catch(error){fail(error);}
    });
  }
  async function read(store,id) {
    return transaction([store],'readonly',(tx,done)=>{const r=tx.objectStore(store).get(id);r.onsuccess=()=>done(r.result||null);});
  }
  async function all(store) {
    return transaction([store],'readonly',(tx,done)=>{const r=tx.objectStore(store).getAll();r.onsuccess=()=>done(r.result);});
  }
  async function putSession(backend,eventId,groupNo,value) {
    if(!value?.token||!value.credentialId||!Number.isFinite(value.expires_at))throw Error('Invalid group session');
    return transaction(['sessions'],'readwrite',(tx,done)=>{
      tx.objectStore('sessions').put({key:sessionKey(backend,eventId,groupNo),backend,eventId,groupNo:Number(groupNo),token:value.token,credentialId:value.credentialId,expires_at:value.expires_at});done(true);
    });
  }
  async function removeSession(backend,eventId,groupNo) {
    // Credential invalidation never deletes snapshots or pending scores.
    return transaction(['sessions'],'readwrite',(tx,done)=>{tx.objectStore('sessions').delete(sessionKey(backend,eventId,groupNo));done(true);});
  }
  async function prepare(value,data) {
    const who=identity(value),group=clone(data.groups.filter(p=>Number(p.group_no)===who.groupNo));
    if(!group.length)throw Error('Cannot prepare an empty group');
    const ids=new Set(group.map(p=>String(p.player_id)));
    const snapshot={key:key(who),identity:who,meta:clone(data.meta),course:clone(data.course),group,
      acceptedScores:clone(data.scores.filter(s=>String(s.event_id)===who.eventId&&ids.has(String(s.player_id)))),competitions:clone(data.competitions||{}),preparedAt:Date.now()};
    return transaction(['snapshots'],'readwrite',(tx,done)=>{tx.objectStore('snapshots').put(snapshot);done(snapshot);});
  }
  async function updateCompetition(value,competitions) {
    return transaction(['snapshots'],'readwrite',(tx,done,fail)=>{
      const table=tx.objectStore('snapshots'),r=table.get(key(value));r.onsuccess=()=>{try{if(!r.result)throw Error('Prepare this group online first');r.result.competitions=clone(competitions);table.put(r.result);done(true);}catch(e){fail(e);}};
    });
  }
  function validate(snapshot,request) {
    if(!snapshot)throw Error('Prepare this group online before saving local scores');
    if(snapshot.meta?.locked||snapshot.meta?.revealed_at)throw Error('Final results are permanently locked');
    if(snapshot.meta&&snapshot.group.some(p=>!p.snapshot_id))throw Error('Confirm handicaps online before saving scores');
    if(request.action!=='saveHoleScores'||request.eventId!==snapshot.identity.eventId||!Number.isInteger(request.hole)||request.hole<1||request.hole>18)throw Error('Invalid local score request');
    const ids=snapshot.group.map(p=>String(p.player_id));
    if(!Array.isArray(request.scores)||request.scores.length!==ids.length||new Set(request.scores.map(s=>String(s.playerId))).size!==ids.length)throw Error('Enter a score or BLOB for every group member exactly once');
    for(const item of request.scores) {
      if(!ids.includes(String(item.playerId)))throw Error('Local score is outside this group');
      if(!['pickup','scored'].includes(item.status)||(item.status==='pickup'&&item.gross!==null)||(item.status==='scored'&&(!Number.isInteger(item.gross)||item.gross<1||item.gross>20)))throw Error('Invalid score or BLOB');
      if(!snapshot.meta&&item.status==='pickup')throw Error('Legacy rounds require numeric Gross');
      const before=snapshot.acceptedScores.find(s=>String(s.player_id)===String(item.playerId)&&Number(s.hole)===request.hole);
      if(item.expectedRevision!==(before?.revision||0))throw Error('Local accepted revision changed; reload before correcting');
      if(before&&(before.score_status!==item.status||before.gross!==item.gross)&&(!item.reason||item.reason.length>500))throw Error('A correction reason of 1–500 characters is required');
    }
  }
  async function saveDraft(value,input,operationId) {
    const who=identity(value),scope=key(who);
    // Explicit whitelist: never persist the request's bearer token or admin secret.
    const request={action:'saveHoleScores',eventId:input.eventId,hole:Number(input.hole),scores:input.scores.map(s=>({playerId:s.playerId,status:s.status,gross:s.gross,expectedRevision:s.expectedRevision,reason:String(s.reason||'').trim()}))};
    const fingerprint=JSON.stringify(request);
    if(!/^[a-zA-Z0-9_-]{16,100}$/.test(operationId))throw Error('Stable operation ID required');
    return transaction(['snapshots','drafts'],'readwrite',(tx,done,fail)=>{
      const snapshots=tx.objectStore('snapshots'),drafts=tx.objectStore('drafts'),r=snapshots.get(scope);
      r.onsuccess=()=>{try{
        const snapshot=r.result;
        const query=drafts.index('scope').getAll(scope);
        query.onsuccess=()=>{try{
          const pending=query.result.find(d=>unaccepted(d)&&d.request.hole===request.hole);
          if(pending) {
            if(pending.fingerprint!==fingerprint)throw Error('This hole has an unaccepted local save. Keep/export it or retry that saved request before editing again');
            done(pending);return;
          }
          validate(snapshot,request);
          const draft={operationId,scope,identity:who,request,fingerprint,status:'local',createdAt:Date.now(),attempts:0};
          // add, not put: a duplicate ID must never overwrite another saved request.
          drafts.add(draft);done(draft);
        }catch(e){fail(e);}};
      }catch(e){fail(e);}};
    });
  }
  async function markSending(operationId) {
    return transaction(['drafts'],'readwrite',(tx,done,fail)=>{
      const table=tx.objectStore('drafts'),r=table.get(operationId);r.onsuccess=()=>{try{
        const d=r.result;if(!d||d.status==='accepted')throw Error('Local request not pending');
        d.status='awaiting-server';d.attempts++;d.lastAttemptAt=Date.now();table.put(d);done(d);
      }catch(e){fail(e);}};
    });
  }
  async function problem(operationId,message) {
    return transaction(['drafts'],'readwrite',(tx,done)=>{
      const table=tx.objectStore('drafts'),r=table.get(operationId);r.onsuccess=()=>{
        const d=r.result;if(d&&unaccepted(d)){d.status='needs-review';d.lastError=String(message);table.put(d);}done(d);
      };
    });
  }
  async function accept(operationId,scores) {
    return transaction(['snapshots','drafts'],'readwrite',(tx,done,fail)=>{
      const drafts=tx.objectStore('drafts'),r=drafts.get(operationId);r.onsuccess=()=>{try{
        const d=r.result;if(!d)throw Error('Saved local request is missing');
        if(d.status==='accepted'){done(d);return;}
        if(!Array.isArray(scores)||scores.length!==d.request.scores.length)throw Error('Incomplete server acknowledgement; local save retained');
        for(const item of d.request.scores) {
          const result=scores.find(s=>String(s.player_id)===String(item.playerId)&&s.event_id===d.identity.eventId&&Number(s.hole)===d.request.hole);
          if(!result||result.score_status!==item.status||result.gross!==item.gross||!Number.isInteger(result.revision)||result.revision<item.expectedRevision)throw Error('Server acknowledgement does not match this local save');
        }
        const table=tx.objectStore('snapshots'),read=table.get(d.scope);read.onsuccess=()=>{try{
          const snapshot=read.result;if(!snapshot)throw Error('Accepted snapshot missing; local save retained');
          for(const result of scores) {
            const index=snapshot.acceptedScores.findIndex(s=>String(s.player_id)===String(result.player_id)&&Number(s.hole)===Number(result.hole));
            if(index<0)snapshot.acceptedScores.push(clone(result));
            else if((snapshot.acceptedScores[index].revision||0)<=result.revision)snapshot.acceptedScores[index]=clone(result);
          }
          d.status='accepted';d.acceptedAt=Date.now();delete d.lastError;table.put(snapshot);drafts.put(d);done(d);
        }catch(e){fail(e);}};
      }catch(e){fail(e);}};
    });
  }
  async function pending(filter={}) {return (await all('drafts')).filter(d=>unaccepted(d)&&matches(d.identity,filter)).sort((a,b)=>a.createdAt-b.createdAt||a.operationId.localeCompare(b.operationId));}
  async function recovery(filter={}) {
    // Sessions/bearer tokens are deliberately excluded from recovery exports.
    return {format:'flaghunters-local-recovery',version:VERSION,exportedAt:new Date().toISOString(),
      snapshots:(await all('snapshots')).filter(s=>matches(s.identity,filter)),drafts:(await all('drafts')).filter(d=>matches(d.identity,filter))};
  }
  async function forget(value,confirmed) {
    if(confirmed!==true)throw Error('Explicit confirmation required before removing local data');
    const who=identity(value),scope=key(who);
    return transaction(['snapshots','drafts','sessions'],'readwrite',(tx,done,fail)=>{
      const drafts=tx.objectStore('drafts'),r=drafts.index('scope').getAll(scope);r.onsuccess=()=>{try{
        if(r.result.some(unaccepted))throw Error('Unaccepted scores cannot be cleared. Export recovery data and retain these records for review');
        r.result.forEach(d=>drafts.delete(d.operationId));tx.objectStore('snapshots').delete(scope);
        const sessions=tx.objectStore('sessions'),id=sessionKey(who.backend,who.eventId,who.groupNo),read=sessions.get(id);
        read.onsuccess=()=>{if(read.result?.credentialId===who.credentialId)sessions.delete(id);done(true);};
      }catch(e){fail(e);}};
    });
  }
  root.V2Local={identity,key,sessionKey,putSession,getSession:(b,e,g)=>read('sessions',sessionKey(b,e,g)),removeSession,
    prepare,updateCompetition,getSnapshot:value=>read('snapshots',key(value)),saveDraft,markSending,accept,problem,pending,recovery,forget};
})(globalThis);
