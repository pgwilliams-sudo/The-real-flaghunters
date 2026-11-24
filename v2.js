/* V2 adapter: transactional local group drafts; admin credentials remain in memory. */
(() => {
  'use strict';
  const state={admin:'',group:'',meta:null,pending:null,dirty:false};
  const policy={mode:null,revision:null},setup={saving:false,starting:false,creating:false,groupVersion:null,attempt:null};
  function acceptPolicy(result) {
    if(!['pin-free','group-pin'].includes(result.scoring_access_mode))throw Error('This frontend requires the matching Stage 7 backend.');
    policy.mode=result.scoring_access_mode;policy.revision=String(result.scoring_access_revision||'1');
    const controls=document.getElementById('v2PinControls');
    if(controls){controls.hidden=policy.mode!=='group-pin';controls.querySelectorAll('button,input').forEach(el=>el.disabled=controls.hidden);}
    return result;
  }
  async function refreshPolicy(){return acceptPolicy(await rawGet('status'));}
  async function rememberSession(eventId,groupNo,result) {
    await local.putSession(API_URL,eventId,groupNo,{token:result.token,credentialId:result.credential_id,expires_at:result.expires_at,accessMode:policy.mode,accessRevision:policy.revision});
    return result.token;
  }
  const rawGet=apiGet,rawPost=apiPost,local=V2Local;
  const localState={identity:null,snapshot:null,competitions:null,saving:false,finishing:false};
  const escape=escapeHtml;
  let localBootstrap=false;
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
  async function credentialInput(groupNo) {
    const eventId=currentEvent.event_id;
    if(!navigator.onLine)throw Error('Open this group online first. Existing saved scores are retained.');
    if(policy.mode==='pin-free')return rememberSession(eventId,groupNo,await rawPost({action:'openGroup',eventId,groupNo}));
    if(policy.mode!=='group-pin')throw Error('Reconnect to verify scoring access settings.');
    return new Promise(resolve=>{
      const d=modal('Group scoring access','<form id="v2Access"><label for="v2Code">Enter your two-digit group PIN</label><input id="v2Code" type="password" inputmode="numeric" pattern="[0-9]{2}" minlength="2" maxlength="2" autocomplete="off" required><button class="primary-button">Open group</button><p id="v2AccessError" role="alert"></p></form>');
      d.addEventListener('close',()=>resolve(null),{once:true});
      d.querySelector('form').onsubmit=async event=>{
        event.preventDefault();const pin=d.querySelector('input').value;
        try {
          const result=await rawPost({action:'openGroup',pin,eventId,groupNo});
          await rememberSession(eventId,groupNo,result);
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
  const recoveryPanel=document.createElement('details');
  recoveryPanel.id='v2ScoreRecovery';recoveryPanel.className='v2-recovery-tools';
  recoveryPanel.innerHTML='<summary>Score Recovery</summary><p id="v2LocalSummary" role="status"></p><button id="v2RetryLocal">Retry synchronization</button><button id="v2ReviewLocal">Review / export scores</button><button id="v2ForgetLocal">Forget this prepared round</button>';
  recoveryPanel.append(V2OfflineAssets.panel);
  document.getElementById('homeScreen').append(recoveryPanel);
  const baseShowScreen=showScreen;
  showScreen=screen=>{
    if((screen==='homeScreen'||screen==='scoreScreen')&&recoveryPanel.parentElement.id!==screen) {
      recoveryPanel.open=false;
      document.getElementById(screen).append(recoveryPanel);
    }
    if(screen==='homeScreen'||screen==='scoreScreen')reload.hidden=screen!=='scoreScreen';
    baseShowScreen(screen);
  };
  const scoreStatus=document.getElementById('v2ScoreStatus');
  const recoveryLink=document.getElementById('v2ScoreRecoveryLink');
  recoveryLink.onclick=()=>recoveryDialog();
  function currentRound(d) {return d.identity.backend===API_URL&&d.identity.eventId===currentEvent?.event_id;}
  const friendly=error=>V2Recovery.message(error);
  async function refreshLocalStatus() {
    try {
      const pending=await local.pending(),current=pending.filter(currentRound),older=pending.length-current.length;
      const locked=state.meta?.locked||state.meta?.revealed_at||currentEvent?.locked;
      const attention=pending.some(d=>d.status==='needs-review')||Boolean(locked&&current.length);
      const count=locked?'Final results are permanently locked. '+current.length+' pending request(s) retained for review/export; no resubmission is allowed.':current.length?`${current.length} saved hole request(s) await server acceptance for this round.`:'All scores synced.';
      document.getElementById('v2LocalSummary').textContent=count+(older?` ${older} request(s) belong to other rounds/backends; retained for review/export and not automatically retried.`:'');
      scoreStatus.hidden=!localState.identity;
      scoreStatus.textContent=attention?'Scores need attention.':current.length?`Saved on this device · ${current.length} to sync.`:
        localState.saving?'Saving scores…':'All scores synced.';
      scoreStatus.classList.toggle('v2-attention',attention);
      recoveryLink.hidden=!attention;
      recoveryPanel.querySelector('summary').textContent=attention?'Score Recovery · scores need attention':older||current.length?
        `Score Recovery · ${pending.length} to sync`:'Score Recovery';
    }catch(error){
      scoreStatus.hidden=false;scoreStatus.textContent='Scores need attention.';recoveryLink.hidden=false;
      document.getElementById('v2LocalSummary').textContent='Local storage unavailable. '+friendly(error);
    }
  }
  async function exportLocal() {
    const data=await local.recovery(),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='flaghunters-local-score-recovery.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  function recoveryDialog(message='') {
    return Promise.all([local.pending(),local.recovery()]).then(([pending,archive])=>{
      const entries=(rows,old)=>rows.map(d=>`<article class="v2-recovery-entry"><strong>Group ${d.identity.groupNo} · hole ${d.request.hole}</strong><p>${escape(old?'Other round/backend · '+d.identity.eventId:'Current round')} · ${escape(({local:'Saved on this device',recovering:'Confirmed recovery queued',syncing:'Syncing','awaiting-server':'Acceptance unconfirmed','needs-review':'Needs review'})[d.status]||d.status)}</p><p>${escape(d.lastError||'Awaiting server acceptance')}</p><details><summary>Stored local scores</summary>${d.request.scores.map(s=>`<p>${escape(s.playerId)}: ${s.status==='pickup'?'BLOB':s.gross}${s.reason?' · '+escape(s.reason):''}</p>`).join('')}</details>${!old?`${d.failureKind==='credential'?`<button data-reauth-group="${d.identity.groupNo}">Reopen this group</button>`:''}<button data-review-operation="${escape(d.operationId)}">Review server and local scores</button>${d.recoveryIntent?`<button data-resume-operation="${escape(d.operationId)}">Resume confirmed recovery</button>`:''}`:'<p>Retained for export. Open its original round/backend to recover; this round’s Retry will not send it.</p>'}</article>`).join('');
      const d=modal('Local score recovery',`<p>${escape(message||'Saved requests stay on this device. Expired access and conflicts pause automatic retries. Review server values before changing a rejected request.')}</p><h3>Current round</h3>${entries(pending.filter(currentRound),false)||'<p>No pending requests for this round.</p>'}<h3>Other rounds and backends</h3>${entries(pending.filter(x=>!currentRound(x)),true)||'<p>No older pending requests.</p>'}<details><summary>Resolved decisions retained on this device (${archive.drafts.filter(x=>x.status==='resolved').length})</summary>${archive.drafts.filter(x=>x.status==='resolved').map(x=>`<article class="v2-recovery-entry"><strong>Group ${x.identity.groupNo} · hole ${x.request.hole}</strong><p>${escape(x.identity.eventId)} · ${escape(x.resolution.outcome)}</p><p>Original local request retained:</p>${x.request.scores.map(s=>`<p>${escape(s.playerId)}: ${s.status==='pickup'?'BLOB':s.gross}${s.reason?' · '+escape(s.reason):''}</p>`).join('')}</article>`).join('')}</details><p>Exports contain private scores and reasons, without bearer tokens, PINs or admin passwords.</p><button id="v2ExportLocal">Export recovery file</button>`);
      d.querySelector('#v2ExportLocal').onclick=()=>exportLocal().catch(error=>alert(friendly(error)));
      if(pending.length){
        const retry=document.createElement('button');retry.type='button';retry.textContent='Retry synchronization';
        retry.onclick=async()=>{retry.disabled=true;await synchronize({force:true,review:true});await recoveryDialog();};
        d.querySelector('#v2Close').before(retry);
      }
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
      await local.forget(localState.identity,true);localState.identity=null;localState.snapshot=null;state.group='';allScores=[];selectedGroup=[];showScreen('homeScreen');await preparedGroups();await refreshLocalStatus();
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
    const hint=document.getElementById('v2FinishHint');if(hint)hint.textContent=locked?'Final results are permanently locked. Pending requests remain available for export.':pending.length?'Finish Group is unavailable until all local scores have server acceptance.':!complete||state.dirty?'Use Save this hole before finishing.':'';
  }
  apiGet=async function(action,params) {
    if(!API_URL)throw Error('Scoring is unavailable. Check the app connection.');
    const result=action==='competitions'&&state.admin?{...await apiPost({action:'adminCompetitionData',eventId:params?.eventId}),admin_view:true}:
      action==='course'&&currentEvent?.event_id?await rawGet('roundCourse',{eventId:currentEvent.event_id}):await rawGet(action,params);
    if(action==='status')acceptPolicy(result);
    if(action==='competitions'&&localState.identity?.eventId===(params?.eventId||currentEvent?.event_id)) {
      localState.competitions=result;
      if(localState.snapshot)await local.updateCompetition(localState.identity,result);
    }
    return result;
  };
  apiPost=async function(data) {
    if(!API_URL)throw Error('Scoring is unavailable. Check the app connection.');
    if(data.action==='roundBootstrap'&&localState.identity&&(localBootstrap||!navigator.onLine))return projection(localState.identity);
    if(!navigator.onLine)throw Error('Offline. This action needs a server connection. Saved scores are retained.');
    if(data.action==='adminLogin') {
      const result=await rawPost(data);state.admin=result.token;document.getElementById('adminPin').value='';await refreshPolicy();return result;
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
    if(data.action==='saveGroups') {
      const boot=await rawPost({action:'roundBootstrap',credential:state.admin,eventId:data.eventId,groupNo:1});
      setup.groupVersion=boot.meta?.group_version;setup.attempt=null;
    }
    if(data.action==='createEvent')course=(await rawGet('roundCourse',{eventId:result.event_id})).course;
    if(data.action==='roundBootstrap'&&localState.identity) {
      localState.snapshot=await local.prepare(localState.identity,{...result,event:currentEvent,competitions:localState.competitions||{}});
      state.meta=localState.snapshot.meta;
      return {...result,...await projection(localState.identity)};
    }
    if(data.action==='confirmGroupHandicaps'&&localState.identity&&result.groups) {
      const snapshot=localState.snapshot;
      localState.snapshot=await local.prepare(localState.identity,{meta:snapshot.meta,course:snapshot.course,groups:result.groups,scores:snapshot.acceptedScores,competitions:snapshot.competitions});
      await preparedGroups();
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
      if(navigator.onLine)await refreshPolicy();
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
      await originalSelect(groupNo);await preparedGroups();await refreshLocalStatus();void synchronize({force:true,review:true});
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
    const playerId=card.dataset.scorecardPlayer,eventId=selectedResultRound?.event_id;
    try {
      const {scorecard:p}=await rawGet('scorecard',{eventId,playerId});
      if(selectedResultRound?.event_id!==eventId || !document.getElementById('leaderboardScreen').classList.contains('active'))return;
      const d=modal('Player scorecard',`
        <div class="v2-scorecard-name">${escape(p.name)}</div>
        <p>${escape(formatEvent(selectedResultRound))} · Playing Handicap ${Number(p.playing_handicap)}</p>
        <p>${p.revealed?'Final scorecard · scores locked.':'Partial scorecard · holes 16–18 hidden until admin reveal.'}</p>
        <dl class="v2-card-stats">
          <div><dt>Net total</dt><dd>${p.net??'—'}</dd></div>
          <div><dt>BLOBs</dt><dd>${p.blobs}</dd></div>
          <div><dt>Birdies</dt><dd>${p.birdies}</dd></div>
          <div><dt>Eagles</dt><dd>${p.eagles}</dd></div>
        </dl>
        <table class="v2-scorecard-table">
          <caption>Hole scores</caption>
          <thead><tr><th scope="col">Hole</th><th scope="col">Par</th><th scope="col"><abbr title="Stroke index">SI</abbr></th>
            <th scope="col">Gross</th><th scope="col">Net</th><th scope="col"><abbr title="Stableford points">Pts</abbr></th></tr></thead>
          <tbody>${p.holes.map(h=>`<tr data-hole="${h.hole}"><th scope="row">${h.hole}</th><td>${h.par??'—'}</td>
            <td>${h.stroke_index??'—'}</td><td>${h.status==='pickup'?'BLOB':h.gross??'—'}</td><td>${h.net??'—'}</td>
            <td>${h.stableford??'—'}</td></tr>`).join('')}</tbody>
        </table>${resultSplits(p)}`);
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

  const seasonYear=document.getElementById('v2SeasonYear'),seasonPanel=document.getElementById('v2SeasonPanel');
  const seasonViews=document.getElementById('v2SeasonViews');
  const season={view:'poty',year:null,currentYear:null,stats:null,eclectics:null,tee:0,nine:'front',sort:'appearances',request:0};
  const statistics=[
    ['appearances','Rounds','Appearances'],['stableford_total','Points','Total Stableford points'],
    ['stableford_average','Avg','Average Stableford points'],['blobs','BLOBs','BLOBs'],
    ['birdies','Birdies','Gross birdies'],['eagles','Eagles','Gross eagles']
  ];

  function seasonTable(label,head,rows,className='') {
    return `<div class="v2-table-scroll" role="region" aria-label="${label}" tabindex="0">
      <table class="v2-season-table ${className}"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
      </div>`;
  }
  function rankedRows(rows,value) {
    let previous,rank;
    return rows.map((row,i)=>{
      const points=value(row);
      if(i===0||previous!==points)rank=i+1;
      previous=points;
      return {...row,rank:points===null?'—':rank};
    });
  }
  function renderStats() {
    const rows=[...season.stats].sort((a,b)=>b[season.sort]-a[season.sort]||a.name.localeCompare(b.name));
    return `<h2>Player statistics</h2><label for="v2StatsSort">Sort by</label>
      <select id="v2StatsSort">${statistics.map(([key,_,label])=>`<option value="${key}"${season.sort===key?' selected':''}>${label}</option>`).join('')}</select>
      ${seasonTable('Player statistics','<th scope="col">Player</th>'+statistics.map(([key,label,title])=>
        `<th scope="col" aria-sort="${season.sort===key?'descending':'none'}"><abbr title="${title}">${label}</abbr></th>`).join(''),
        rows.map(p=>`<tr><th scope="row">${escape(p.name)}</th>${statistics.map(([key])=>
          `<td>${key==='stableford_average'?Number(p[key]).toFixed(1):p[key]}</td>`).join('')}</tr>`).join(''))}`;
  }
  function renderEclectics() {
    const gross=season.view==='gross',title=gross?'Gross Eclectic':'Net Eclectic';
    if(!season.eclectics.length)return `<h2>${title}</h2><p>No eligible rounds for this season.</p>`;
    const tee=season.eclectics[season.tee],start=season.nine==='front'?1:10;
    const headings=Array.from({length:9},(_,i)=>`<th scope="col">${start+i}</th>`).join('');
    const rows=rankedRows(tee[season.view][season.nine],p=>p.total).map(p=>`<tr><th scope="row">${escape(p.name)}</th>
      <td>${p.rank}</td>${p.holes.map(score=>`<td>${score??'—'}</td>`).join('')}
      <td>${p.total??'—'}</td><td>${p.complete?'Complete':p.holes_recorded+'/9 holes'}</td></tr>`).join('');
    return `<h2>${title}</h2>
      <label for="v2EclecticTee">Course and tee</label>
      <select id="v2EclecticTee">${season.eclectics.map((item,i)=>
        `<option value="${i}"${i===season.tee?' selected':''}>${escape(item.course)} · ${escape(item.tee)}</option>`).join('')}</select>
      <div class="v2-segments" role="group" aria-label="Eclectic nine">
        <button type="button" data-nine="front" aria-pressed="${season.nine==='front'}">Front nine</button>
        <button type="button" data-nine="back" aria-pressed="${season.nine==='back'}">Back nine</button>
      </div>
      ${rows?seasonTable(title,'<th scope="col">Player</th><th scope="col">Rank</th>'+headings+
        '<th scope="col">Total</th><th scope="col">Card</th>',rows,'v2-eclectic-table'):'<p>No players for these tees.</p>'}`;
  }
  async function showSeason(year) {
    const request=++season.request;
    seasonPanel.setAttribute('aria-busy','true');
    seasonPanel.textContent='Loading season…';
    try {
      if(!season.stats||season.year!==year) {
        const data=await rawGet('season',year?{year}:undefined);
        if(request!==season.request)return;
        season.year=data.year;
        if(!year)season.currentYear=data.year;
        season.stats=data.season;
        season.eclectics=null;
        season.tee=0;
        const years=[...new Set([season.currentYear,...data.years.filter(y=>y<season.currentYear)])].sort().reverse();
        seasonYear.replaceChildren(...years.map(y=>new Option(y,y)));
        seasonYear.value=data.year;
        document.getElementById('v2SeasonControls').hidden=false;
      }
      if(season.view==='gross'||season.view==='net') {
        if(!season.eclectics) {
          const {eclectics}=await rawGet('eclectics',{year:season.year});
          if(request!==season.request)return;
          season.eclectics=eclectics;
        }
        seasonPanel.innerHTML=renderEclectics();
      }else if(!season.stats.length) {
        seasonPanel.textContent='No completed player cards for this season.';
      }else if(season.view==='stats') {
        seasonPanel.innerHTML=renderStats();
      }else {
        const standings=season.stats.filter(p=>p.poty_points>0);
        seasonPanel.innerHTML='<h2>Player of the Year</h2>'+(standings.length?seasonTable('Player of the Year',
          '<th scope="col">Player</th><th scope="col">Rank</th><th scope="col">POTY points</th>',
          rankedRows(standings,p=>p.poty_points).map(p=>
            `<tr><th scope="row">${escape(p.name)}</th><td>${p.rank}</td><td>${p.poty_points}</td></tr>`).join('')
        ):'<p>No POTY points awarded this season.</p>');
      }
    }catch(error){
      if(request===season.request)seasonPanel.textContent=navigator.onLine
        ? 'Season results are unavailable. Try again shortly.' : 'Connect to view season results.';
    }finally{
      if(request===season.request)seasonPanel.setAttribute('aria-busy','false');
    }
  }
  openSeason=()=>{
    showScreen('seasonScreen');
    season.stats=null;
    return showSeason();
  };
  seasonYear.onchange=()=>showSeason(seasonYear.value);
  seasonViews.onclick=event=>{
    const view=event.target.dataset.view;
    if(!view)return;
    season.view=view;
    seasonViews.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));
    void showSeason(seasonYear.value);
  };
  seasonPanel.onchange=event=>{
    if(event.target.id==='v2StatsSort') {
      season.sort=event.target.value;
      seasonPanel.innerHTML=renderStats();
      document.getElementById('v2StatsSort').focus();
    }
    if(event.target.id==='v2EclecticTee') {
      season.tee=Number(event.target.value);
      seasonPanel.innerHTML=renderEclectics();
      document.getElementById('v2EclecticTee').focus();
    }
  };
  seasonPanel.onclick=event=>{
    if(!event.target.dataset.nine)return;
    season.nine=event.target.dataset.nine;
    seasonPanel.innerHTML=renderEclectics();
    seasonPanel.querySelector('[aria-pressed="true"]').focus();
  };
  renderFinishedGroupResults=async rows=>{
    document.getElementById('groupFinishResults').innerHTML=splitMarkup(rows);
  };
  const originalRender=renderScoring;
  renderScoring=function() {
    originalRender();
    document.getElementById('v2ScoreTools')?.remove();
    document.querySelectorAll('.v2-locked').forEach(el=>el.remove());
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
      document.querySelectorAll('#scorePlayers button,#scorePlayers textarea,#v2ScoreTools button,#v2ScoreTools select,#nextButton')
        .forEach(el=>el.disabled=true);
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
          state.group='';await preparedGroups();
        }
        if(error&&/permanently locked/i.test(error.message)) {
          state.meta={...state.meta,locked:true};
          const snapshot=await local.getSnapshot(draft.identity);
          localState.snapshot=await local.prepare(draft.identity,{meta:state.meta,course:snapshot.course,groups:snapshot.group,scores:snapshot.acceptedScores,competitions:snapshot.competitions});
          renderScoring();
          await preparedGroups();
        }
        // A response must not erase an unsaved selection on the next hole.
        if(!state.dirty) {
          if(Number(holeOrder[holeIndex])===draft.request.hole)renderScoring();
          if(error&&V2Sync.classify(error)==='locked')showMessage('scoreMessage',friendly(error),'bad');
        }
      }
      await refreshLocalStatus();await finishGate();
    }
  });
  function synchronize(options) {
    if(!navigator.onLine)return refreshLocalStatus();
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
    if(state.meta?.locked||state.meta?.revealed_at||currentEvent?.locked){showMessage('scoreMessage','Final results are permanently locked. Pending requests remain available for export.','bad');return;}
    const who=localState.identity,hole=Number(holeOrder[holeIndex]);
    // Reserve synchronously, before the first IndexedDB await, to prevent duplicate taps/advancement.
    localState.saving=true;
    if(scoreStatus.textContent==='All scores synced.')scoreStatus.textContent='Saving scores…';
    try{if(!state.admin){const session=await local.getSession(who.backend,who.eventId,who.groupNo);if(!session||session.expires_at<=Date.now()||session.credentialId!==who.credentialId)throw Error('Scoring access expired or changed. Reconnect and reopen this group. Pending scores are retained.');}}catch(error){localState.saving=false;showMessage('scoreMessage','Not saved on this device: '+friendly(error),'bad');await refreshLocalStatus();return;}
    const controls=Array.from(document.querySelectorAll('#scoreScreen button,#scoreScreen select,#scoreScreen textarea'))
      .filter(el=>!recoveryPanel.contains(el)&&el!==recoveryLink).map(el=>[el,el.disabled]);
    controls.forEach(([el])=>el.disabled=true);
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
      let note='';
      if(advance&&holeIndex<17) {
        const comp=localState.competitions||{},config=comp.config||{};
        if(config.nearest_enabled&&(config.nearest_holes||[]).map(Number).includes(hole)&&!Object.prototype.hasOwnProperty.call(comp.pin_acknowledgements?.[hole]||{},String(selectedGroupNumber)))note='Record your Nearest the Pin decision before continuing.';
        else holeIndex++;
      }
      renderScoring();if(note)showMessage('scoreMessage',note,'info');
      await refreshLocalStatus();
      // Queue dispatch is detached from the confirmed local save and advancement.
      void synchronize({force:draft.attempts>0,review:draft.status==='needs-review'});
    }catch(error){showMessage('scoreMessage','Not saved on this device: '+friendly(error),'bad');}
    finally{localState.saving=false;controls.forEach(([el,disabled])=>{if(el.isConnected)el.disabled=disabled;});await refreshLocalStatus();await finishGate();}
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
  const reload=document.createElement('button');reload.textContent='Reload scores';reload.hidden=true;reload.onclick=async()=>{
    if(state.dirty&&!confirm('Discard unsaved selections? Stored local requests will be kept.'))return;
    try{allScores=(await apiPost({action:'roundBootstrap',eventId:currentEvent.event_id,groupNo:selectedGroupNumber})).scores;state.pending=null;state.dirty=false;renderScoring();}catch(err){alert(err.message);}
  };recoveryPanel.querySelector('#v2ForgetLocal').before(reload);
  const access=document.createElement('section');access.className='card v2-credentials';access.innerHTML='<div id="v2PinControls" hidden><div class="sub-title">Group scoring PINs</div><p>Generate a two-digit PIN after saving the groups. Share it privately with the group scorer. Rotating it ends existing group sessions.</p><label for="v2IssueGroup">Group number</label><input id="v2IssueGroup" type="number" min="1" inputmode="numeric" value="1"><button id="v2Issue" class="secondary-button">Generate / rotate group PIN</button></div><p id="v2Issued" role="status"></p><button id="v2Recover" class="secondary-button">Recover pending score writes</button><button id="v2AdminLogout">Sign out of admin</button>';
  document.getElementById('adminScreen').append(access);
  access.querySelector('#v2Issue').onclick=async()=>{
    const button=access.querySelector('#v2Issue');if(button.disabled)return;button.disabled=true;
    document.getElementById('v2Issued').textContent='Generating PIN… Wait for this request before retrying.';
    try{await refreshPolicy();if(policy.mode!=='group-pin')throw Error('Group PINs are disabled in PIN-free mode');const eventId=adminEventId||currentEvent?.event_id;if(!eventId)throw Error('Create a round and save groups first.');const r=await apiPost({action:'issueGroupCredential',eventId,groupNo:Number(document.getElementById('v2IssueGroup').value)});document.getElementById('v2Issued').textContent=r.pin;}
    catch(error){document.getElementById('v2Issued').textContent=/lock.*timeout/i.test(error.message)?'The server is busy. Wait for other requests to finish, then try again.':friendly(error);}
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
      await apiPost({action:'revealResults',eventId});
      currentEvent=(await rawGet('currentEvent')).event;
      await openLeaderboard();
    }catch(err){document.getElementById('v2Issued').textContent=err.message;}
    finally{reveal.disabled=false;}
  };
  access.querySelector('#v2AdminLogout').onclick=()=>{state.admin='';adminPinValue='';document.getElementById('v2Issued').textContent='';showScreen('homeScreen');};
  // Keep setup controls within the existing V2 adapter; no V1 functions are edited.
  const saveGroupsOriginal=saveGroupSetup,createOriginal=createRound;
  createRound=async function(){if(setup.creating)return;setup.creating=true;try{await createOriginal();}finally{setup.creating=false;}};
  saveGroupSetup=async function(){
    if(setup.saving)return;setup.saving=true;
    try{await saveGroupsOriginal();
      if(setup.groupVersion){
        document.querySelector('#adminCompetitionsCard .sub-title').textContent='Select Comps & Start Round';
        document.querySelector('#adminCompetitionsCard .primary-button').textContent='Save Comps & Start Round';
        showMessage('drawMessage','Groups saved ✓. Select competitions, then start the round.','good');
      }
    }finally{setup.saving=false;}
  };
  saveAdminCompetitions=async function(){
    if(setup.starting)return;
    const button=document.querySelector('#adminCompetitionsCard .primary-button'),eventId=adminEventId;
    if(!eventId||!state.admin){showMessage('adminCompetitionMessage','Admin sign-in and saved groups are required.','bad');return;}
    setup.starting=true;button.disabled=true;button.textContent='Saving…';
    try{
      const boot=await rawPost({action:'roundBootstrap',credential:state.admin,eventId,groupNo:1});
      const groupVersion=setup.groupVersion||boot.meta?.group_version;
      const nearest=document.getElementById('adminNearestEnabled').checked;
      const choices={eventId,groupVersion,nearest_enabled:nearest,nearest_holes:nearest?[...document.querySelectorAll('.adminPinHole:checked')].map(el=>Number(el.value)):[],
        blind_enabled:document.getElementById('adminBlindEnabled').checked,team234_enabled:document.getElementById('admin234Enabled').checked};
      if(nearest&&!choices.nearest_holes.length)throw Error('Select at least one par-3 hole.');
      const fingerprint=JSON.stringify(choices);
      if(setup.attempt&&setup.attempt.fingerprint!==fingerprint)throw Error('Start choices changed after a submission. Retry the original choices or reload admin setup.');
      setup.attempt ||= {fingerprint,request:{action:'startRound',operationId:id(),...choices}};
      await apiPost(setup.attempt.request);
      button.textContent='Saved ✓';showMessage('adminCompetitionMessage','Saved ✓','good');
      // A completed start remains retryable if refreshing the menu fails.
      await new Promise(resolve=>setTimeout(resolve,650));
      const current=await rawGet('currentEvent');currentEvent=current.event;
      showScreen('homeScreen');
    }catch(error){showMessage('adminCompetitionMessage','Round start unconfirmed: '+friendly(error)+' Retry the same choices; saved data is retained.','bad');}
    finally{setup.starting=false;button.disabled=false;if(button.textContent!=='Saved ✓')button.textContent='Save Comps & Start Round';}
  };
  if(!document.documentElement.dataset.v2FixedTestApi) {
    const connection=document.createElement('section');
    connection.className='v2-connection';
    recoveryPanel.append(connection);
    connection.innerHTML='<strong>V2 development · separate test backend only</strong><form id="v2Connect"><label for="v2Endpoint">Test Apps Script web-app URL</label><input id="v2Endpoint" type="url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec" required><button>Connect test backend</button><p id="v2ConnectionStatus" role="status"></p></form>';
    document.getElementById('v2Endpoint').value=API_URL;
    document.getElementById('v2Connect').onsubmit=async e=>{
      e.preventDefault();const value=document.getElementById('v2Endpoint').value.trim();
      try{if((await local.pending()).length&&!confirm('Some local scores lack server acceptance. Switching backends keeps them stored, but does not upload them. Review/export recovery data first if needed. Continue?'))return;const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)||url.search||url.hash)throw new Error('Enter a valid Apps Script test web-app URL.');
        const r=await fetch(value+'?action=status'),data=await r.json();if(!data.ok||data.api_generation!=='v2-phase1')throw new Error('This endpoint is not the V2 Phase 1 backend.');
        localStorage.setItem('flaghunters.v2.api',value);location.reload();
      }catch(err){document.getElementById('v2ConnectionStatus').textContent=err.message;}
    };
  }
  function canResume(snapshot) {
    return !snapshot.meta?.locked&&!snapshot.meta?.revealed_at&&!snapshot.event?.locked&&
      new Set(snapshot.course.map(h=>Number(h.hole)).filter(h=>h>=1&&h<=18)).size===18&&
      snapshot.group.length>0&&(snapshot.group.every(player=>isConfirmed(player.handicap_confirmed))||snapshot.acceptedScores.length>0);
  }
  let preparationRequest=0;
  async function preparedGroups() {
    const request=++preparationRequest;
    const holder=document.getElementById('v2PreparedGroups');
    const groupReadiness=document.getElementById('v2GroupReadiness');
    const scoreReadiness=document.getElementById('v2ScoreReadiness');
    try {
      const snapshots=(await local.prepared(API_URL)).filter(canResume);
      if(request!==preparationRequest)return;
      const appReady=V2OfflineAssets.ready();
      const groupReady=snapshots.some(snapshot=>snapshot.identity.eventId===currentEvent?.event_id);
      const currentReady=snapshots.some(snapshot=>localState.identity&&snapshot.key===local.key(localState.identity));
      groupReadiness.hidden=!groupReady||!appReady;
      groupReadiness.textContent='Previously opened groups are ready to play offline.';
      scoreReadiness.hidden=!currentReady||!appReady;
      scoreReadiness.textContent='Ready to play offline';
      holder.replaceChildren();
      holder.hidden=!snapshots.length&&navigator.onLine;
      if(!snapshots.length){holder.textContent='Reconnect to open a group before playing offline.';return;}
      for(const snapshot of snapshots){
        const button=document.createElement('button');button.type='button';button.className='v2-text-button';
        const date=formatDate(snapshot.event?.date);
        button.textContent='Resume Group '+snapshot.identity.groupNo+(date?' · '+date:'');
        button.onclick=async()=>{
          try{
            const who=snapshot.identity,session=await local.getSession(who.backend,who.eventId,who.groupNo);
            if(!session||session.expires_at<=Date.now()||session.credentialId!==who.credentialId)throw Error('Prepared access expired. Reconnect and sign in again. Pending scores are retained.');
            state.admin='';adminPinValue='';state.group=session.token;state.dirty=false;
            currentEvent={...snapshot.event,event_id:who.eventId,locked:!!(snapshot.meta?.locked||snapshot.meta?.revealed_at)};
            localState.identity=who;localState.snapshot=snapshot;localState.competitions=snapshot.competitions;
            state.meta=snapshot.meta;course=snapshot.course;allGroups=snapshot.group;allPlayers=snapshot.group;allScores=(await projection(who)).scores;
            localBootstrap=true;await originalSelect(who.groupNo);
            if(!navigator.onLine)showMessage('scoreMessage','Playing offline. Finish Group needs a connection.','info');
            await refreshLocalStatus();void synchronize({force:true});
          }catch(error){modal('Prepared group unavailable','<p role="alert">'+escape(friendly(error))+'</p>');}
          finally{localBootstrap=false;}
        };holder.append(button);
      }
    }catch(error){
      if(request!==preparationRequest)return;
      groupReadiness.hidden=true;scoreReadiness.hidden=true;
      holder.hidden=navigator.onLine;
      holder.textContent='Local scores could not be opened. Use Score Recovery for details.';
    }
  }
  const chooseGroupOnline=openScoring;
  const returnToGroupList=returnToGroups;
  returnToGroups=()=>{
    if(state.dirty&&!confirm('Discard unsaved selections? Saved scores will be kept.'))return;
    state.dirty=false;
    if(navigator.onLine)returnToGroupList();
    else showScreen('homeScreen');
  };
  openScoring=()=>{
    if(navigator.onLine)return chooseGroupOnline();
    const holder=document.getElementById('v2PreparedGroups');
    const groups=holder.querySelectorAll('button');
    if(groups.length===1)groups[0].click();
    else if(groups.length)groups[0].focus();
    else showMessage('homeMessage','Reconnect to open a group before playing offline.','info');
  };
  window.addEventListener('pageshow',preparedGroups);
  window.addEventListener('online',preparedGroups);
  window.addEventListener('offline',preparedGroups);
  window.addEventListener('v2OfflineReadiness',preparedGroups);
  refreshLocalStatus();void preparedGroups();
  void synchronize({force:true});
  if(API_URL&&navigator.onLine) Promise.resolve(initialise()).then(()=>{refreshLocalStatus();void synchronize({force:true});});
  else if(API_URL)showMessage('homeMessage','You’re offline. You can resume a group you’ve already opened.','info');
})();
