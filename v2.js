/* V2 adapter: transactional local group drafts; admin credentials remain in memory. */
(() => {
  'use strict';
  const state={admin:'',group:'',meta:null,pending:null,dirty:false};
  const rawGet=apiGet,rawPost=apiPost,local=V2Local;
  const localState={identity:null,snapshot:null,competitions:null,saving:false,finishing:false};
  const escape=escapeHtml;
  function id() { return crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join(''); }
  function modal(title,body) {
    document.getElementById('v2Dialog')?.remove();
    const d=document.createElement('dialog'); d.id='v2Dialog';
    d.innerHTML=`<h2>${escape(title)}</h2>${body}<button type="button" id="v2Close">Close</button>`;
    document.body.append(d); d.querySelector('#v2Close').onclick=()=>d.close(); d.showModal(); return d;
  }
  function groupSessionKey(groupNo) { return 'flaghunters.v2.group:'+API_URL+':'+currentEvent.event_id+':'+Number(groupNo); }
  async function readGroupSession(groupNo) {
    let cached=await local.getSession(API_URL,currentEvent.event_id,groupNo);
    if(!cached) {
      // Migrate the old same-tab bearer session only after an IndexedDB commit.
      let old;try{old=JSON.parse(sessionStorage.getItem(groupSessionKey(groupNo))||'null');}catch(_){}
      if(old?.token) {
        cached={...old,credentialId:old.token.split('.')[0]};
        await local.putSession(API_URL,currentEvent.event_id,groupNo,cached);
        try{sessionStorage.removeItem(groupSessionKey(groupNo));}catch(_){}
      }
    }
    return cached;
  }
  function credentialInput(groupNo) {
    const eventId=currentEvent.event_id;
    return new Promise(resolve=>{
      const d=modal('Group scoring access','<form id="v2Access"><label for="v2Code">Enter your two-digit group PIN</label><input id="v2Code" type="password" inputmode="numeric" pattern="[0-9]{2}" minlength="2" maxlength="2" autocomplete="off" required><button class="primary-button">Open group</button><p id="v2AccessError" role="alert"></p></form>');
      d.addEventListener('close',()=>resolve(null),{once:true});
      d.querySelector('form').onsubmit=async event=>{
        event.preventDefault();const pin=d.querySelector('input').value;
        try {
          const result=await rawPost({action:'openGroup',pin,eventId,groupNo});
          await local.putSession(API_URL,eventId,groupNo,{token:result.token,credentialId:result.credential_id,expires_at:result.expires_at});
          resolve(result.token);d.close();
        }catch(err){d.querySelector('#v2AccessError').textContent=friendly(err);}
      };
    });
  }
  function scopeFilter(who=localState.identity) {return who?{backend:who.backend,eventId:who.eventId,groupNo:who.groupNo}:{};}
  async function projection(who) {
    const snapshot=await local.getSnapshot(who);if(!snapshot)throw Error('Prepare this group online first');
    const scores=snapshot.acceptedScores.map(s=>({...s}));
    for(const draft of await local.pending(who))for(const item of draft.request.scores) {
      const score={event_id:who.eventId,player_id:item.playerId,hole:draft.request.hole,score_status:item.status,gross:item.gross,
        revision:item.expectedRevision,reason:item.reason,local_pending:true};
      const index=scores.findIndex(s=>String(s.player_id)===String(item.playerId)&&Number(s.hole)===score.hole);
      if(index<0)scores.push(score);else scores[index]=score;
    }
    if(localState.identity&&local.key(localState.identity)===local.key(who))localState.snapshot=snapshot;
    return {meta:snapshot.meta,course:snapshot.course,groups:snapshot.group,scores};
  }
  const recoveryPanel=document.createElement('section');recoveryPanel.className='v2-local-status';
  recoveryPanel.innerHTML='<strong>Device saves</strong><p id="v2LocalSummary" role="status">Checking local storage…</p><button id="v2RetryLocal">Retry synchronization</button><button id="v2ReviewLocal">Review / export local scores</button><button id="v2ForgetLocal">Forget this prepared round</button>';
  document.body.prepend(recoveryPanel);
  function currentRound(d) {return d.identity.backend===API_URL&&d.identity.eventId===currentEvent?.event_id;}
  const friendly=error=>V2Recovery.message(error);
  async function refreshLocalStatus() {
    try {
      const pending=await local.pending(),current=pending.filter(currentRound),older=pending.length-current.length;
      const count=current.length?`${current.length} saved hole request(s) await server acceptance for this round. ${current.filter(d=>d.status==='syncing').length} syncing; ${current.filter(d=>d.status==='needs-review').length} need review.`:'No local scores are awaiting server acceptance for this round.';
      document.getElementById('v2LocalSummary').textContent=count+(older?` ${older} request(s) belong to other rounds/backends; retained for review/export and not automatically retried.`:'');
    }catch(error){document.getElementById('v2LocalSummary').textContent='Local storage unavailable. '+friendly(error);}
  }
  async function exportLocal() {
    const data=await local.recovery(),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='flaghunters-local-score-recovery.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  function recoveryDialog(message='') {
    return Promise.all([local.pending(),local.recovery()]).then(([pending,archive])=>{
      const entries=(rows,old)=>rows.map(d=>`<article class="v2-recovery-entry"><strong>Group ${d.identity.groupNo} · hole ${d.request.hole}</strong><p>${escape(old?'Other round/backend · '+d.identity.eventId:'Current round')} · ${escape(({local:'Saved on this device',recovering:'Confirmed recovery queued',syncing:'Syncing','awaiting-server':'Acceptance unconfirmed','needs-review':'Needs review'})[d.status]||d.status)}</p><p>${escape(d.lastError||'Awaiting server acceptance')}</p><details><summary>Stored local scores</summary>${d.request.scores.map(s=>`<p>${escape(s.playerId)}: ${s.status==='pickup'?'BLOB':s.gross}${s.reason?' · '+escape(s.reason):''}</p>`).join('')}</details>${!old?`${d.failureKind==='credential'?`<button data-reauth-group="${d.identity.groupNo}">Sign in to this group</button>`:''}<button data-review-operation="${escape(d.operationId)}">Review server and local scores</button>${d.recoveryIntent?`<button data-resume-operation="${escape(d.operationId)}">Resume confirmed recovery</button>`:''}`:'<p>Retained for export. Open its original round/backend to recover; this round’s Retry will not send it.</p>'}</article>`).join('');
      const d=modal('Local score recovery',`<p>${escape(message||'Saved requests stay on this device. Expired access and conflicts pause automatic retries. Review server values before changing a rejected request.')}</p><h3>Current round</h3>${entries(pending.filter(currentRound),false)||'<p>No pending requests for this round.</p>'}<h3>Other rounds and backends</h3>${entries(pending.filter(x=>!currentRound(x)),true)||'<p>No older pending requests.</p>'}<details><summary>Resolved decisions retained on this device (${archive.drafts.filter(x=>x.status==='resolved').length})</summary>${archive.drafts.filter(x=>x.status==='resolved').map(x=>`<article class="v2-recovery-entry"><strong>Group ${x.identity.groupNo} · hole ${x.request.hole}</strong><p>${escape(x.identity.eventId)} · ${escape(x.resolution.outcome)}</p><p>Original local request retained:</p>${x.request.scores.map(s=>`<p>${escape(s.playerId)}: ${s.status==='pickup'?'BLOB':s.gross}${s.reason?' · '+escape(s.reason):''}</p>`).join('')}</article>`).join('')}</details><p>Exports contain private scores and reasons, without bearer tokens, PINs or admin passwords.</p><button id="v2ExportLocal">Export recovery file</button>`);
      d.querySelector('#v2ExportLocal').onclick=()=>exportLocal().catch(error=>alert(friendly(error)));
      d.querySelectorAll('[data-reauth-group]').forEach(button=>button.onclick=()=>{d.close();state.admin='';adminPinValue='';selectGroup(Number(button.dataset.reauthGroup));});
      d.querySelectorAll('[data-review-operation]').forEach(button=>button.onclick=()=>reviewOperation(button.dataset.reviewOperation));
      d.querySelectorAll('[data-resume-operation]').forEach(button=>button.onclick=()=>synchronize({force:true,review:true,operationId:button.dataset.resumeOperation}));
    }).catch(error=>alert(friendly(error)));
  }
  async function reviewOperation(operationId) {
    try {
      const review=await recovery.review(operationId);
      if(review.done){await refreshProjection();return recoveryDialog('Server acceptance was reconciled. No duplicate score was submitted.');}
      if(review.externalResolution)throw Error('Recovery was completed in another session. Export this record for review; no new submission was made.');
      const locked=review.meta?.locked||review.meta?.revealed_at;
      const value=s=>!s?'Not scored':s.score_status==='pickup'||s.status==='pickup'?'BLOB':String(s.gross);
      const d=modal('Review score conflict',`<p>Group ${review.draft.identity.groupNo} · hole ${review.draft.request.hole}. Nothing is overwritten until you confirm.</p>${review.draft.request.scores.map(item=>{
        const accepted=review.serverScores.find(s=>String(s.player_id)===String(item.playerId));
        const name=localState.snapshot?.group.find(p=>String(p.player_id)===String(item.playerId))?.player_name||item.playerId;
        return `<article class="v2-recovery-entry"><strong>${escape(name)}</strong><p>Server accepted: <b>${escape(value(accepted))}</b> · revision ${accepted?.revision||0}</p><p>Your pending change: <b>${escape(value(item))}</b></p>${item.reason?`<p>Original reason: ${escape(item.reason)}</p>`:''}<label><input type="checkbox" class="v2-use-local" value="${escape(item.playerId)}" ${locked?'disabled':''}> Use my pending change</label></article>`;
      }).join('')}${locked?'<p role="alert">Final results are permanently locked. This request remains available for export; no resubmission is allowed.</p>':'<label for="v2RecoveryReason">Additional correction reason (original reasons are retained)</label><textarea id="v2RecoveryReason" maxlength="500" rows="2"></textarea><button id="v2KeepServer">Keep server values</button><button id="v2ResubmitLocal">Resubmit selected changes</button><section id="v2RecoveryConfirm" hidden aria-labelledby="v2RecoveryConfirmTitle"><h3 id="v2RecoveryConfirmTitle">Confirm recovery decision</h3><p id="v2RecoveryConfirmText"></p><button id="v2RecoveryConfirmSubmit">Confirm decision</button><button id="v2RecoveryConfirmCancel">Back to review</button></section>'}<p id="v2RecoveryMessage" role="alert"></p>`);
      if(locked)return;
      let decision=null,submitting=false;
      const confirmation=d.querySelector('#v2RecoveryConfirm');
      function editable(enabled) {
        d.querySelectorAll('.v2-use-local,#v2RecoveryReason,#v2KeepServer,#v2ResubmitLocal').forEach(el=>el.disabled=!enabled);
      }
      function choose(choice) {
        if(submitting)return;
        const selected=[...d.querySelectorAll('.v2-use-local:checked')].map(el=>el.value),reason=d.querySelector('#v2RecoveryReason').value;
        if(choice==='local'&&!selected.length){d.querySelector('#v2RecoveryMessage').textContent='Select the local changes you want to resubmit.';return;}
        // Freeze the reviewed choice before a separate explicit confirmation click.
        // Avoid synchronous browser dialogs inside the HTML modal on physical Safari.
        decision={choice,selected:[...selected],reason};editable(false);
        const summary=choice==='server'?'Keep the reviewed server values and archive this local change. The original request remains in your recovery export.':
          'Resubmit '+selected.length+' selected change(s) against the displayed server revisions. Original reasons/history are retained.';
        d.querySelector('#v2RecoveryConfirmText').textContent=summary;
        d.querySelector('#v2RecoveryConfirmSubmit').textContent=choice==='server'?'Confirm keep server values':'Confirm selected changes';
        d.querySelector('#v2RecoveryMessage').textContent='';confirmation.hidden=false;
        confirmation.scrollIntoView({block:'nearest'});d.querySelector('#v2RecoveryConfirmSubmit').focus({preventScroll:true});
      }
      d.querySelector('#v2RecoveryConfirmCancel').onclick=()=>{
        if(submitting)return;decision=null;confirmation.hidden=true;editable(true);d.querySelector('#v2ResubmitLocal').focus();
      };
      d.querySelector('#v2RecoveryConfirmSubmit').onclick=async()=>{
        if(!decision||submitting)return;
        submitting=true;const approved=decision;d.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=true);
        try {await recovery.decide(review,approved.choice,approved.selected,approved.reason,true);d.close();await synchronize({force:true,review:true,operationId});await refreshProjection();await recoveryDialog();}
        catch(error){submitting=false;decision=null;confirmation.hidden=true;d.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=false);d.querySelector('#v2RecoveryMessage').textContent=friendly(error);}
      };
      d.querySelector('#v2KeepServer').onclick=()=>choose('server');d.querySelector('#v2ResubmitLocal').onclick=()=>choose('local');
    }catch(error){await recoveryDialog(friendly(error));}
  }
  async function refreshProjection() {
    if(localState.identity){allScores=(await projection(localState.identity)).scores;if(!state.dirty&&document.getElementById('scoreScreen').classList.contains('active'))renderScoring();}
    await refreshLocalStatus();await finishGate();
  }
  document.getElementById('v2ReviewLocal').onclick=()=>recoveryDialog();
  document.getElementById('v2ForgetLocal').onclick=async()=>{
    try {
      if(!localState.identity)throw Error('Open the prepared group whose synced local data you want to forget');
      if((await local.pending(scopeFilter())).length)return recoveryDialog('Unaccepted local scores cannot be cleared. Export them and keep the stored requests for recovery.');
      if(!confirm('Remove this round/group’s synced local snapshot and stored group session from this device? Server scores and history remain unchanged.'))return;
      await local.forget(localState.identity,true);localState.identity=null;localState.snapshot=null;state.group='';allScores=[];selectedGroup=[];showScreen('homeScreen');await refreshLocalStatus();
    }catch(error){recoveryDialog(error.message);}
  };
  async function finishGate() {
    const button=document.getElementById('nextButton'),last=holeIndex===17;
    if(!localState.identity)return;
    const locked=state.meta?.locked||state.meta?.revealed_at||currentEvent?.locked;
    if(!last){button.disabled=!!locked||localState.saving;return;}
    button.textContent='Finish Group';button.disabled=true;
    const who=localState.identity,index=holeIndex;
    const pending=await local.pending({backend:who.backend,eventId:who.eventId});
    if(!localState.identity||local.key(localState.identity)!==local.key(who)||holeIndex!==index)return finishGate();
    const accepted=localState.snapshot?.acceptedScores||[];
    const complete=selectedGroup.length>0&&selectedGroup.every(p=>Array.from({length:18},(_,i)=>i+1).every(h=>accepted.some(s=>String(s.player_id)===String(p.player_id)&&Number(s.hole)===h)));
    button.disabled=!!locked||localState.saving||localState.finishing||state.dirty||pending.length>0||!complete;
    const hint=document.getElementById('v2FinishHint');if(hint)hint.textContent=pending.length?'Finish Group is unavailable until all local scores have server acceptance.':!complete||state.dirty?'Use Save this hole before finishing.':'';
  }
  apiGet=async function(action,params) {
    if(!API_URL)throw Error('Connect a separate V2 test backend first.');
    const result=action==='competitions'&&state.admin?{...await apiPost({action:'adminCompetitionData',eventId:params?.eventId}),admin_view:true}:
      action==='course'&&currentEvent?.event_id?await rawGet('roundCourse',{eventId:currentEvent.event_id}):await rawGet(action,params);
    if(action==='competitions'&&localState.identity?.eventId===(params?.eventId||currentEvent?.event_id)) {
      localState.competitions=result;
      if(localState.snapshot)await local.updateCompetition(localState.identity,result);
    }
    return result;
  };
  apiPost=async function(data) {
    if(!API_URL)throw Error('Connect a separate V2 test backend first.');
    if(data.action==='adminLogin') {
      const result=await rawPost(data);state.admin=result.token;document.getElementById('adminPin').value='';return result;
    }
    if(data.action==='completeGroup'&&(await local.pending({backend:API_URL,eventId:data.eventId})).length)throw Error('Finish Group waits for every local saved score to have server acceptance');
    if(data.action==='revealResults'&&(await local.pending({backend:API_URL,eventId:data.eventId})).length)throw Error('Local scores still await server acceptance; review/export them before reveal');
    const request={...data,credential:state.admin||state.group};delete request.pin;
    let result;
    try{result=await rawPost(request);}catch(error){
      if(data.action==='roundBootstrap'&&error.name==='TypeError'&&localState.identity) {
        const cached=await local.getSnapshot(localState.identity);
        if(cached){localState.competitions=cached.competitions;return projection(localState.identity);}
      }
      throw error;
    }
    if(data.action==='createEvent')course=(await rawGet('roundCourse',{eventId:result.event_id})).course;
    if(data.action==='roundBootstrap'&&localState.identity) {
      localState.snapshot=await local.prepare(localState.identity,{...result,competitions:localState.competitions||{}});
      return {...result,...await projection(localState.identity)};
    }
    if(data.action==='confirmGroupHandicaps'&&localState.identity&&result.groups) {
      const snapshot=localState.snapshot;
      localState.snapshot=await local.prepare(localState.identity,{meta:snapshot.meta,course:snapshot.course,groups:result.groups,scores:snapshot.acceptedScores,competitions:snapshot.competitions});
    }
    if(data.action==='updatePinLeader'&&localState.identity&&localState.competitions) {
      localState.competitions.pin_acknowledgements ||= {};
      localState.competitions.pin_acknowledgements[data.hole] ||= {};
      localState.competitions.pin_acknowledgements[data.hole][data.groupNo]=true;
      await local.updateCompetition(localState.identity,localState.competitions);
    }
    return result;
  };
  const originalSelect=selectGroup;
  selectGroup=async function(groupNo) {
    selectedGroupNumber=Number(groupNo);
    try {
      if(!state.admin) {
        const cached=await readGroupSession(Number(groupNo));let token=cached?.expires_at>Date.now()?cached.token:null;
        if(token) {
          try{await rawPost({action:'verifyGroupCredential',credential:token,eventId:currentEvent.event_id,groupNo:Number(groupNo)});}
          catch(error){
            if(/credential|expired|authorize/i.test(error.message)){await local.removeSession(API_URL,currentEvent.event_id,groupNo);token=null;}
            else if(error.name!=='TypeError')throw error;
          }
        }
        if(!token)token=await credentialInput(Number(groupNo));if(!token)return;state.group=token;
      }
      localState.identity=local.identity({backend:API_URL,eventId:currentEvent.event_id,groupNo:Number(groupNo),credentialId:(state.admin||state.group).split('.')[0]});
      localState.snapshot=await local.getSnapshot(localState.identity);localState.competitions=localState.snapshot?.competitions||null;
      try{localState.competitions=await apiGet('competitions',{eventId:currentEvent.event_id});}catch(error){if(!localState.snapshot||error.name!=='TypeError')throw error;}
      const boot=await apiPost({action:'roundBootstrap',eventId:currentEvent.event_id,groupNo:Number(groupNo)});
      state.meta=boot.meta;course=boot.course;allGroups=boot.groups;allScores=boot.scores;
      await originalSelect(groupNo);await refreshLocalStatus();void synchronize({force:true,review:true});
    }catch(error){alert(error.message);}
  };
  function resultSplits(p) {
    return '<div class="v2-splits">'+
      [['Front 9 · holes 1–9','front9'],[p.revealed?'Back 9 · holes 10–18':'Back 9 · partial through hole 15','back9'],[p.revealed?'18-hole total':'Partial total · holes 1–15','total']].map(([title,key])=>{
        const split=p[key],gross=split.gross_incomplete?'Incomplete (BLOB)':String(split.gross);
        return `<section class="v2-split"><strong>${title}</strong><div class="v2-split-values"><span>Gross <b>${gross}</b></span><span>Stableford <b>${split.stableford}</b></span></div><small>${split.holes}/${split.expected_holes} holes${split.partial?' · partial':''}</small></section>`;
      }).join('')+'</div>';
  }
  function splitMarkup(rows) {
    if(!rows.length)return '<p>No players yet.</p>';
    const revealed=rows[0].revealed;
    return `<p class="message info">${revealed?'Clubhouse reveal · final results. All scores are locked.':'Live partial results · holes 16–18 hidden until admin reveal. Rankings use visible holes only.'}</p>`+
      rows.map((p,i)=>`<article class="v2-result"><div class="v2-result-name"><strong>${i+1}. ${escape(p.name)}</strong><span>Playing Handicap ${Number(p.playing_handicap)}</span></div>${resultSplits(p)}</article>`).join('');
  }
  const leaderboard=document.getElementById('leaderboardTable');
  function leaderboardTable(rows) {
    if(!rows.length)return '<p>No players yet.</p>';
    const revealed=rows[0].revealed;
    const points=split=>`${split.stableford}${split.partial?'*':''}`;
    return `<p class="message info">${revealed?'Final results · scores locked.':'Partial results · holes 16–18 hidden. B9 is partial through hole 15; Gross and Stb use holes 1–15.'}</p><table class="v2-leaderboard"><caption>Tap a player row for their scorecard. F9/B9: Stableford for physical holes 1–9/10–18. * = partial; Gross — = incomplete (BLOB).</caption><colgroup><col class="v2-col-player"><col class="v2-col-gross"><col class="v2-col-stb"><col class="v2-col-nine"><col class="v2-col-nine"></colgroup><thead><tr><th scope="col">Player</th><th scope="col">Gross</th><th scope="col">Stb</th><th scope="col">F9</th><th scope="col">B9</th></tr></thead><tbody>`+
      rows.map(p=>`<tr tabindex="0" data-scorecard-player="${escape(p.player_id)}" aria-label="Open scorecard for ${escape(p.name)}; ${p.total.holes} recorded visible holes"><th scope="row"><span class="v2-table-name" title="${escape(p.name)}">${escape(p.name)}</span></th><td>${p.total.gross_incomplete?'<abbr title="Incomplete (BLOB)" aria-label="Gross incomplete due to BLOB">—</abbr>':p.total.gross}${p.total.partial?'*':''}</td><td class="v2-table-stb">${points(p.total)}</td><td>${points(p.front9)}</td><td>${points(p.back9)}</td></tr>`).join('')+'</tbody></table>';
  }
  renderLeaderboard=rows=>{leaderboard.innerHTML=leaderboardTable(rows);};
  let scorecardLoading=false;
  async function openPlayerScorecard(card) {
    if(scorecardLoading)return;
    scorecardLoading=true;
    const playerId=card.dataset.scorecardPlayer,eventId=currentEvent?.event_id;
    try {
      const {scorecard:p}=await rawGet('scorecard',{eventId,playerId});
      const d=modal('Player scorecard',`<div class="v2-scorecard-name">${escape(p.name)}</div><p>Playing Handicap ${Number(p.playing_handicap)}</p><p>${p.revealed?'Final scorecard · scores locked.':'Partial scorecard · holes 16–18 hidden until admin reveal.'}</p><table class="v2-scorecard-table"><caption>Physical hole scores</caption><thead><tr><th scope="col">Hole</th><th scope="col">Par</th><th scope="col"><abbr title="Stroke index">SI</abbr></th><th scope="col">Gross</th><th scope="col"><abbr title="Stableford points">Pts</abbr></th></tr></thead><tbody>${p.holes.map(h=>`<tr data-hole="${h.hole}"><th scope="row">${h.hole}</th><td>${h.par??'—'}</td><td>${h.stroke_index??'—'}</td><td>${h.status==='pickup'?'BLOB':h.gross??'—'}</td><td>${h.stableford??'—'}</td></tr>`).join('')}</tbody></table>${p.hidden_holes.length?'<p class="v2-note">Holes 16–18: hidden until admin reveal.</p>':''}${resultSplits(p)}`);
      d.classList.add('v2-scorecard-dialog');d.setAttribute('aria-label','Player scorecard');
      const back=document.createElement('button');back.type='button';back.className='v2-scorecard-back';back.textContent='Back to leaderboard';back.onclick=()=>d.close();d.prepend(back);back.focus();
      d.addEventListener('close',()=>{
        const target=[...leaderboard.querySelectorAll('[data-scorecard-player]')].find(el=>el.dataset.scorecardPlayer===playerId);
        target?.focus({preventScroll:true});
      },{once:true});
    }catch(err){modal('Scorecard unavailable',`<p role="alert">${escape(err.message)}</p>`);}
    finally{scorecardLoading=false;}
  }
  leaderboard.addEventListener('click',event=>{
    const card=event.target.closest('[data-scorecard-player]');if(card)openPlayerScorecard(card);
  });
  leaderboard.addEventListener('keydown',event=>{
    const card=event.target.closest('[data-scorecard-player]');
    if(card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openPlayerScorecard(card);}
  });
  renderFinishedGroupResults=async rows=>{
    document.getElementById('groupFinishResults').innerHTML=splitMarkup(rows);
  };
  const originalRender=renderScoring;
  renderScoring=function() {
    originalRender();
    document.getElementById('v2ScoreTools')?.remove();
    const tools=document.createElement('div');tools.id='v2ScoreTools';tools.className='v2-toolbar';
    const label=document.createElement('label');label.textContent='Edit hole ';const select=document.createElement('select');select.id='v2Hole';select.setAttribute('aria-label','Choose hole to edit');
    holeOrder.forEach((h,i)=>select.add(new Option('Hole '+h,i,false,i===holeIndex)));
    select.onchange=()=>{if(state.dirty&&!confirm('Discard unsaved changes on this hole?')){select.value=String(holeIndex);return;}holeIndex=Number(select.value);state.pending=null;state.dirty=false;renderScoring();};label.append(select);tools.append(label);
    const save=document.createElement('button');save.textContent='Save this hole';save.type='button';save.className='secondary-button';save.onclick=()=>persist(false);tools.append(save);
    const hint=document.createElement('p');hint.id='v2FinishHint';hint.className='v2-note';tools.append(hint);
    document.getElementById('scorePlayers').before(tools);
    selectedGroup.forEach(player=>{
      const saved=allScores.find(s=>String(s.player_id)===String(player.player_id)&&Number(s.hole)===Number(holeOrder[holeIndex]));
      const card=document.getElementById('score-'+player.player_id);
      if(state.meta) {
        if(saved?.score_status==='pickup') holeScores[player.player_id]='pickup';
        const button=document.createElement('button');button.type='button';button.className='v2-pickup';button.textContent='BLOB · Picked up';button.setAttribute('aria-label','BLOB for '+player.player_name);
        button.onclick=()=>{state.pending=null;setScore(player.player_id,'pickup');};card.append(button);
      }
      if(saved) {
        {
          const label=document.createElement('label');label.textContent='Reason if correcting this accepted score';
          const input=document.createElement('textarea');input.maxLength=500;input.rows=2;input.className='v2-reason';input.dataset.playerId=player.player_id;if(saved.local_pending)input.value=saved.reason||'';input.setAttribute('aria-label','Correction reason for '+player.player_name);input.oninput=()=>{state.pending=null;state.dirty=true;finishGate().catch(error=>showMessage('scoreMessage',error.message,'bad'));};label.append(input);card.append(label);
          const history=document.createElement('button');history.type='button';history.textContent='Revision history';history.onclick=()=>showHistory(player.player_id);card.append(history);
        }
        if(!state.meta) {
          const warning=document.createElement('p');warning.className='v2-note';warning.textContent='Legacy round: numeric scoring and audited corrections only. Historical course inputs are unknown; corrections use the legacy course lookup. New rounds use immutable snapshots.';card.append(warning);
        }
      }
      updateScoreDisplay(player,getCurrentCourseHole());
      if(saved?.local_pending)card.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=true);
    });
    finishGate().catch(error=>showMessage('scoreMessage',error.message,'bad'));
    if(state.meta?.locked || state.meta?.revealed_at || currentEvent.locked) {
      const note=document.createElement('p');note.className='v2-locked';note.textContent='Final results are permanently locked.';tools.before(note);
      document.querySelectorAll('#scoreScreen button,#scoreScreen textarea').forEach(el=>el.disabled=true);
    }
  };
  const originalSet=setScore,originalAdjust=adjustScore,originalDisplay=updateScoreDisplay;
  setScore=function(playerId,value) {
    state.pending=null;state.dirty=true;showMessage('scoreMessage','Unsaved selection · use Save this hole or Save & Next.','info');finishGate().catch(error=>showMessage('scoreMessage',error.message,'bad'));
    if(value==='pickup') {
      holeScores[playerId]='pickup';const player=selectedGroup.find(p=>String(p.player_id)===String(playerId));renderQuickScores(player,getCurrentCourseHole());updateScoreDisplay(player,getCurrentCourseHole());
    } else originalSet(playerId,value);
  };
  adjustScore=function(playerId,amount) {
    if(holeScores[playerId]==='pickup') holeScores[playerId]=null;
    originalAdjust(playerId,amount);
  };
  updateScoreDisplay=function(player,hole) {
    const pickup=holeScores[player.player_id]==='pickup';
    if(pickup) {document.getElementById('display-'+player.player_id).textContent='BLOB';document.getElementById('points-'+player.player_id).textContent='Picked up · 0 Stableford points';}
    else originalDisplay(player,hole);
    document.getElementById('score-'+player.player_id)?.querySelector('.v2-pickup')?.setAttribute('aria-pressed',String(pickup));
  };
  async function showHistory(playerId) {
    try {
      const result=await apiPost({action:'scoreHistory',eventId:currentEvent.event_id,playerId,hole:holeOrder[holeIndex]});
      if(!Array.isArray(result?.history)||result.history.some(row=>!row?.after||!row.actor))throw Error('Revision history response was incomplete. No scores were changed. Close this panel and try again.');
      const display=s=>s ? (s.score_status==='pickup'?'BLOB':String(s.gross)):'Not scored';
      modal('Immutable revision history',result.history.map(c=>`<article class="v2-history-entry"><strong>Revision ${Number(c.after.revision)}: ${escape(display(c.before))} → ${escape(display(c.after))}</strong><p>${escape(c.reason)}</p><p>${escape(c.actor.role)} · ${escape(c.actor.credential_id)}</p><time>${escape(c.after.updated_at)}</time></article>`).join('')||'<p>No revisions.</p>');
    }catch(err){modal('Revision history unavailable',`<p role="alert">${escape(friendly(err))}</p>`);}
  }
  async function recoveryCredential(who) {
      if(who.backend!==API_URL)return null;
      const tokens=[];
      if(localState.identity?.eventId===who.eventId&&localState.identity?.groupNo===who.groupNo)tokens.push(state.admin,state.group);
      const cached=await local.getSession(who.backend,who.eventId,who.groupNo);
      if(cached?.expires_at>Date.now())tokens.push(cached.token);
      const token=tokens.find(t=>t&&t.split('.')[0]===who.credentialId)||tokens.find(Boolean);
      return token?{token}:null;
  }
  const recovery=V2Recovery.create({local,backend:API_URL,transport:rawPost,credential:recoveryCredential});
  const sync=V2Sync.create({local,backend:API_URL,transport:rawPost,credential:recoveryCredential,activeEvent:()=>currentEvent?.event_id,
    onError:error=>{document.getElementById('v2LocalSummary').textContent=friendly(error);},
    onChange:async(draft,error)=>{
      if(localState.identity&&local.key(localState.identity)===draft.scope) {
        allScores=(await projection(draft.identity)).scores;
        if(error&&V2Sync.classify(error)==='credential'){
          const cached=await local.getSession(draft.identity.backend,draft.identity.eventId,draft.identity.groupNo);
          if(state.admin?.split('.')[0]===draft.identity.credentialId)state.admin='';
          if(cached?.credentialId===draft.identity.credentialId)await local.removeSession(draft.identity.backend,draft.identity.eventId,draft.identity.groupNo);
          state.group='';
        }
        if(error&&/permanently locked/i.test(error.message)) {
          state.meta.locked=true;
          const snapshot=await local.getSnapshot(draft.identity);
          localState.snapshot=await local.prepare(draft.identity,{meta:state.meta,course:snapshot.course,groups:snapshot.group,scores:snapshot.acceptedScores,competitions:snapshot.competitions});
          renderScoring();
        }
        // A response must not erase an unsaved selection on the next hole.
        if(!state.dirty) {
          const record=await local.getDraft(draft.operationId);
          if(Number(holeOrder[holeIndex])===draft.request.hole)renderScoring();
          showMessage('scoreMessage',error?'Saved on this device; server acceptance unconfirmed: '+friendly(error)+'. The stored request is retained.':
            ['accepted','resolved'].includes(record.status)?'Saved to server.':'Syncing saved scores; retained on this device.',error?'bad':['accepted','resolved'].includes(record.status)?'good':'info');
        }
      }
      await refreshLocalStatus();await finishGate();
    }
  });
  function synchronize(options) {
    return sync.kick(options).catch(error=>{
      document.getElementById('v2LocalSummary').textContent='Synchronization paused; stored requests are retained. '+friendly(error);
    });
  }
  document.getElementById('v2RetryLocal').onclick=()=>synchronize({force:true,review:true});
  window.addEventListener('online',()=>synchronize({force:true}));
  window.addEventListener('pageshow',()=>synchronize({force:true}));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')synchronize({force:true});});
  async function persist(advance) {
    if(localState.saving||!localState.identity)return;
    const who=localState.identity,hole=Number(holeOrder[holeIndex]);
    const controls=Array.from(document.querySelectorAll('#scoreScreen button,#scoreScreen select,#scoreScreen textarea')).map(el=>[el,el.disabled]);
    localState.saving=true;controls.forEach(([el])=>el.disabled=true);
    try {
      const incoming=selectedGroup.map(p=>{
        const value=holeScores[p.player_id];if(value===null||value===undefined)throw Error('Enter a score or BLOB for every player.');
        const saved=allScores.find(s=>String(s.player_id)===String(p.player_id)&&Number(s.hole)===hole);
        const input=Array.from(document.querySelectorAll('.v2-reason')).find(el=>el.dataset.playerId===String(p.player_id));
        const status=value==='pickup'?'pickup':'scored',gross=status==='pickup'?null:Number(value),reason=input?.value.trim()||'';
        if(saved&&!saved.local_pending&&(saved.score_status!==status||saved.gross!==gross)&&!reason)throw Error('Enter a correction reason for '+p.player_name+'.');
        return {playerId:p.player_id,status,gross,expectedRevision:saved?.revision||0,reason};
      });
      const draft=await local.saveDraft(who,{action:'saveHoleScores',eventId:who.eventId,hole,scores:incoming},id());
      // This point is reached only after transaction.oncomplete, never request.onsuccess.
      state.dirty=false;state.pending=null;allScores=(await projection(who)).scores;
      let note='Saved on this device; awaiting server acceptance.';
      if(advance&&holeIndex<17) {
        const comp=localState.competitions||{},config=comp.config||{};
        if(config.nearest_enabled&&(config.nearest_holes||[]).map(Number).includes(hole)&&!Object.prototype.hasOwnProperty.call(comp.pin_acknowledgements?.[hole]||{},String(selectedGroupNumber)))note+=' Record your Nearest the Pin decision before continuing.';
        else holeIndex++;
      }
      renderScoring();showMessage('scoreMessage',note,'info');await refreshLocalStatus();
      // Queue dispatch is detached from the confirmed local save and advancement.
      void synchronize({force:draft.attempts>0,review:draft.status==='needs-review'});
    }catch(error){showMessage('scoreMessage','Not saved on this device: '+friendly(error),'bad');}
    finally{localState.saving=false;controls.forEach(([el,disabled])=>{if(el.isConnected)el.disabled=disabled;});await finishGate();}
  }
  saveAndNext=async()=>{
    if(holeIndex<17)return persist(true);
    try {
      await finishGate();if(document.getElementById('nextButton').disabled||localState.finishing)return;
      localState.finishing=true;document.getElementById('nextButton').disabled=true;
      const finished=await apiPost({action:'completeGroup',eventId:currentEvent.event_id,groupNo:selectedGroupNumber});
      await renderFinishedGroupResults(finished.group_results||[]);showScreen('completeScreen');
    }catch(error){showMessage('scoreMessage',error.message,'bad');}
    finally{localState.finishing=false;await finishGate();}
  };
  const back=previousHole;previousHole=()=>{if(state.dirty&&!confirm('Discard unsaved changes on this hole?'))return;state.pending=null;state.dirty=false;back();};
  window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
  // Reload is explicit: never silently replace a pending correction after a revision conflict.
  const reload=document.createElement('button');reload.textContent='Reload scores';reload.className='secondary-button';reload.onclick=async()=>{
    if(state.dirty&&!confirm('Discard unsaved selections? Stored local requests will be kept.'))return;
    try{allScores=(await apiPost({action:'roundBootstrap',eventId:currentEvent.event_id,groupNo:selectedGroupNumber})).scores;state.pending=null;state.dirty=false;renderScoring();}catch(err){alert(err.message);}
  };document.getElementById('scoreScreen').append(reload);
  const access=document.createElement('section');access.className='card v2-credentials';access.innerHTML='<div class="sub-title">Group scoring PINs</div><p>Generate a two-digit PIN after saving the groups. Share it privately with the group scorer. Rotating it ends existing group sessions.</p><label for="v2IssueGroup">Group number</label><input id="v2IssueGroup" type="number" min="1" inputmode="numeric" value="1"><button id="v2Issue" class="secondary-button">Generate / rotate group PIN</button><p id="v2Issued" role="status"></p><button id="v2Recover" class="secondary-button">Recover pending score writes</button><button id="v2AdminLogout">Sign out of admin</button>';
  document.getElementById('adminScreen').append(access);
  access.querySelector('#v2Issue').onclick=async()=>{
    const button=access.querySelector('#v2Issue');if(button.disabled)return;button.disabled=true;
    document.getElementById('v2Issued').textContent='Generating PIN… Wait for this request before retrying.';
    try{const eventId=adminEventId||currentEvent?.event_id;if(!eventId)throw Error('Create a round and save groups first.');const r=await apiPost({action:'issueGroupCredential',eventId,groupNo:Number(document.getElementById('v2IssueGroup').value)});document.getElementById('v2Issued').textContent=r.pin;}
    catch(error){document.getElementById('v2Issued').textContent=/lock.*timeout/i.test(error.message)?'The test server is busy. Wait for other requests to finish, then retry once. Do not clear browser data.':friendly(error);}
    finally{button.disabled=false;}
  };
  access.querySelector('#v2Recover').onclick=async()=>{try{await apiPost({action:'recoverScores',eventId:adminEventId||currentEvent?.event_id});document.getElementById('v2Issued').textContent='Accepted score writes recovered. Reload scores before correcting.';}catch(err){document.getElementById('v2Issued').textContent=err.message;}};
  const reveal=document.createElement('button');reveal.id='v2Reveal';reveal.textContent='Reveal final clubhouse results';reveal.className='primary-button';
  access.append(reveal);
  reveal.onclick=async()=>{
    if(!confirm('Reveal final results and permanently lock this round? Scores cannot be corrected afterward.'))return;
    reveal.disabled=true;
    try {
      const eventId=adminEventId||currentEvent?.event_id;
      const result=await apiPost({action:'revealResults',eventId});
      currentEvent=(await rawGet('currentEvent')).event;
      renderLeaderboard(result.leaderboard);showScreen('leaderboardScreen');
    }catch(err){document.getElementById('v2Issued').textContent=err.message;}
    finally{reveal.disabled=false;}
  };
  access.querySelector('#v2AdminLogout').onclick=()=>{state.admin='';adminPinValue='';document.getElementById('v2Issued').textContent='';showScreen('homeScreen');};
  const connection=document.createElement('section');connection.className='v2-connection';connection.innerHTML='<strong>V2 development · separate test backend only</strong><form id="v2Connect"><label for="v2Endpoint">Test Apps Script web-app URL</label><input id="v2Endpoint" type="url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec" required><button>Connect test backend</button><p id="v2ConnectionStatus" role="status"></p></form>';
  document.body.prepend(connection);document.getElementById('v2Endpoint').value=API_URL;
  document.getElementById('v2Connect').onsubmit=async e=>{
    e.preventDefault();const value=document.getElementById('v2Endpoint').value.trim();
    try{if((await local.pending()).length&&!confirm('Some local scores lack server acceptance. Switching backends keeps them stored, but does not upload them. Review/export recovery data first if needed. Continue?'))return;const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)||url.search||url.hash)throw new Error('Enter a valid Apps Script test web-app URL.');
      const r=await fetch(value+'?action=status'),data=await r.json();if(!data.ok||data.api_generation!=='v2-phase1')throw new Error('This endpoint is not the V2 Phase 1 backend.');
      localStorage.setItem('flaghunters.v2.api',value);location.reload();
    }catch(err){document.getElementById('v2ConnectionStatus').textContent=err.message;}
  };
  refreshLocalStatus();
  void synchronize({force:true});
  if(API_URL) Promise.resolve(initialise()).then(()=>{refreshLocalStatus();void synchronize({force:true});});
})();
