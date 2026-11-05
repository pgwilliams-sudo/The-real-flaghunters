/* Explicit review of private queued scores; no public results or automatic rebasing. */
((root)=>{
  'use strict';
  const id=()=>root.crypto.randomUUID?root.crypto.randomUUID():Array.from(root.crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join('');
  function message(error) {
    if(/permanently locked/i.test(error.message))return 'Final results are permanently locked. Pending requests remain available for export; no resubmission is allowed.';
    if(error.name==='QuotaExceededError')return 'Device storage is full. This action was not completed. Keep existing scores and export a recovery copy.';
    if(error.name==='AbortError')return 'Recovery was interrupted. Saved requests are retained. Use Retry synchronization when ready.';
    if(/credential|session.*expired/i.test(error.message))return 'Scoring access expired or changed. Open this group and sign in with its current PIN, then review or retry. Saved scores remain on this device.';
    if(error.name==='TypeError'||error.name==='SyntaxError')return 'Connection interrupted. Server acceptance is unconfirmed. Keep the saved request and use Retry when online.';
    return error.message;
  }
  function create({local,transport,credential,backend}) {
    async function request(data) {
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
      try{return await transport(data,{signal:controller.signal});}finally{clearTimeout(timer);}
    }
    async function review(operationId) {
      const draft=await local.getDraft(operationId);
      if(!draft||['accepted','resolved'].includes(draft.status))throw Error('This request is already accepted or resolved. Refresh the recovery list.');
      if(draft.identity.backend!==backend)throw Error('This request belongs to another backend. Keep/export it; reconnect to its original test backend to review it.');
      const owner=id();
      if(!await local.lease(draft.identity,owner,Date.now()))throw Error('An upload is in progress. Wait for it to finish, then open review again.');
      try {
        const auth=await credential(draft.identity);
        if(!auth?.token)throw Error('Original scoring credential unavailable or expired');
        const data=await request({...draft.request,action:'reviewOperation',groupNo:draft.identity.groupNo,operationId,credential:auth.token});
        if(data.state==='COMMITTED'){await local.accept(operationId,data.result.scores);return {done:true};}
        if(data.state==='CANCELLED'&&data.resolution&&draft.recoveryIntent){await local.finishRecovery(operationId,data.resolution);return {done:true};}
        const snapshot=await local.getSnapshot(draft.identity);
        await local.prepare(draft.identity,{meta:data.meta,course:snapshot.course,groups:snapshot.group,
          scores:[...snapshot.acceptedScores.filter(s=>Number(s.hole)!==draft.request.hole),...data.scores],competitions:snapshot.competitions});
        await local.problem(operationId,'Review server values and confirm a choice before resubmission',{kind:'conflict'});
        return {draft,serverScores:data.scores,meta:data.meta,externalResolution:data.resolution||null,
          reviewed:draft.request.scores.map(s=>({playerId:s.playerId,revision:data.scores.find(a=>String(a.player_id)===String(s.playerId))?.revision||0}))};
      }catch(error){
        await local.problem(operationId,message(error),{kind:root.V2Sync.classify(error)});
        throw error;
      }finally{await local.lease(draft.identity,owner,Date.now(),true);}
    }
    async function decide(review,choice,selected=[],reason='',confirmed=false) {
      if(confirmed!==true)throw Error('Confirm your reviewed choice before recovery');
      if(review.meta?.locked||review.meta?.revealed_at)throw Error('Final results are permanently locked. Keep/export the pending request.');
      let replacement=null;
      if(choice==='local') {
        if(!selected.length)throw Error('Select at least one local change to resubmit');
        const ids=new Set(selected.map(String));
        const scores=review.draft.request.scores.map(item=>{
          const before=review.serverScores.find(s=>String(s.player_id)===String(item.playerId));
          if(!ids.has(String(item.playerId))&&!before)throw Error('No server score exists for this player. Select the local score or keep the whole server state.');
          const value=ids.has(String(item.playerId))?item:{status:before.score_status,gross:before.gross};
          const changed=before&&(before.score_status!==value.status||before.gross!==value.gross);
          const why=ids.has(String(item.playerId))?[item.reason,reason.trim()].filter(Boolean).join(' | '):'';
          if(changed&&(!why||why.length>500))throw Error('Enter a correction reason of 1–500 characters for selected changes');
          return {playerId:item.playerId,status:value.status,gross:value.gross,expectedRevision:before?.revision||0,reason:why};
        });
        replacement={...review.draft.request,scores};
      }
      return local.beginRecovery(review.draft.operationId,{resolutionId:id(),choice,reviewed:review.reviewed,replacement},true,review.draft.recoveryIntent?.resolutionId||null);
    }
    return {review,decide};
  }
  root.V2Recovery={create,message};
})(globalThis);
