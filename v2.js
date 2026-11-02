/* Phase 1 adapter: no production endpoint, no credentials persisted to browser storage. */
(() => {
  'use strict';
  const state={admin:'',group:'',meta:null,pending:null,dirty:false};
  const rawGet=apiGet,rawPost=apiPost;
  const escape=escapeHtml;
  function id() { return crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join(''); }
  function modal(title,body) {
    document.getElementById('v2Dialog')?.remove();
    const d=document.createElement('dialog'); d.id='v2Dialog';
    d.innerHTML=`<h2>${escape(title)}</h2>${body}<button type="button" id="v2Close">Close</button>`;
    document.body.append(d); d.querySelector('#v2Close').onclick=()=>d.close(); d.showModal(); return d;
  }
  function credentialInput() {
    return new Promise(resolve=>{
      const d=modal('Group scoring access','<form id="v2Access"><label for="v2Code">Enter the code provided to your assigned scorer</label><input id="v2Code" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" required><button class="primary-button">Open group</button><p id="v2AccessError" role="alert"></p></form>');
      d.addEventListener('close',()=>resolve(null),{once:true});
      d.querySelector('form').onsubmit=async event=>{
        event.preventDefault(); const token=d.querySelector('input').value.trim();
        try { await rawPost({action:'verifyGroupCredential',credential:token,eventId:currentEvent.event_id,groupNo:selectedGroupNumber}); resolve(token);d.close(); }
        catch(err) { d.querySelector('#v2AccessError').textContent=err.message; }
      };
    });
  }
  apiGet=async function(action,params) {
    if(!API_URL) throw new Error('Connect a separate V2 test backend first.');
    if(action==='course'&&currentEvent?.event_id)return rawGet('roundCourse',{eventId:currentEvent.event_id});
    return rawGet(action,params);
  };
  apiPost=async function(data) {
    if(!API_URL) throw new Error('Connect a separate V2 test backend first.');
    if(data.action==='adminLogin') {
      const result=await rawPost(data);state.admin=result.token;document.getElementById('adminPin').value='';return result;
    }
    const request={...data,credential:state.admin||state.group};delete request.pin;
    const result=await rawPost(request);
    if(data.action==='createEvent')course=(await rawGet('roundCourse',{eventId:result.event_id})).course;
    return result;
  };
  const originalSelect=selectGroup;
  selectGroup=async function(groupNo) {
    selectedGroupNumber=Number(groupNo);
    try {
      if(!state.admin) { const token=await credentialInput();if(!token)return;state.group=token; }
      const boot=await apiPost({action:'roundBootstrap',eventId:currentEvent.event_id,groupNo:Number(groupNo)});
      state.meta=boot.meta;course=boot.course;allGroups=boot.groups;allScores=boot.scores;
      await originalSelect(groupNo);
    } catch(err) { alert(err.message); }
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
          const input=document.createElement('textarea');input.maxLength=500;input.rows=2;input.className='v2-reason';input.dataset.playerId=player.player_id;input.setAttribute('aria-label','Correction reason for '+player.player_name);input.oninput=()=>{state.pending=null;state.dirty=true;};label.append(input);card.append(label);
          const history=document.createElement('button');history.type='button';history.textContent='Revision history';history.onclick=()=>showHistory(player.player_id);card.append(history);
        }
        if(!state.meta) {
          const warning=document.createElement('p');warning.className='v2-note';warning.textContent='Legacy round: numeric scoring and audited corrections only. Historical course inputs are unknown; corrections use the legacy course lookup. New rounds use immutable snapshots.';card.append(warning);
        }
      }
      updateScoreDisplay(player,getCurrentCourseHole());
    });
    if(state.meta?.locked || state.meta?.revealed_at || currentEvent.locked) {
      const note=document.createElement('p');note.className='v2-locked';note.textContent='Final results are permanently locked.';tools.before(note);
      document.querySelectorAll('#scoreScreen button,#scoreScreen textarea').forEach(el=>el.disabled=true);
    }
  };
  const originalSet=setScore,originalAdjust=adjustScore,originalDisplay=updateScoreDisplay;
  setScore=function(playerId,value) {
    state.pending=null;state.dirty=true;
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
      const display=s=>s ? (s.score_status==='pickup'?'BLOB':String(s.gross)):'Not scored';
      modal('Immutable revision history',result.history.map(c=>`<article class="v2-history-entry"><strong>Revision ${Number(c.after.revision)}: ${escape(display(c.before))} → ${escape(display(c.after))}</strong><p>${escape(c.reason)}</p><p>${escape(c.actor.role)} · ${escape(c.actor.credential_id)}</p><time>${escape(c.after.updated_at)}</time></article>`).join('')||'<p>No revisions.</p>');
    }catch(err){alert(err.message);}
  }
  async function persist(advance) {
    const button=document.getElementById('nextButton');
    if(button.disabled)return;
    const controls=Array.from(document.querySelectorAll('#scoreScreen button,#scoreScreen select,#scoreScreen textarea')).map(el=>[el,el.disabled]);
    const oldText=button.textContent;controls.forEach(([el])=>el.disabled=true);button.textContent='Saving…';
    try {
      const hole=Number(holeOrder[holeIndex]);
      const incoming=selectedGroup.map(p=>{
        const value=holeScores[p.player_id];if(value===null||value===undefined)throw new Error('Enter a score or BLOB for every player.');
        const saved=allScores.find(s=>String(s.player_id)===String(p.player_id)&&Number(s.hole)===hole);
        const input=Array.from(document.querySelectorAll('.v2-reason')).find(el=>el.dataset.playerId===String(p.player_id));
        const status=value==='pickup'?'pickup':'scored',gross=status==='pickup'?null:Number(value),reason=input?.value.trim()||'';
        if(saved&&(saved.score_status!==status||saved.gross!==gross)&&!reason)throw new Error('Enter a correction reason for '+p.player_name+'.');
        return {playerId:p.player_id,status,gross,expectedRevision:saved?.revision||0,reason};
      });
      const payload={action:'saveHoleScores',eventId:currentEvent.event_id,hole,scores:incoming};
      const fingerprint=JSON.stringify(payload);
      if(!state.pending||state.pending.fingerprint!==fingerprint)state.pending={fingerprint,operationId:id()};
      const result=await apiPost({...payload,operationId:state.pending.operationId});
      for(const saved of result.scores||[]) {
        const i=allScores.findIndex(s=>String(s.player_id)===String(saved.player_id)&&Number(s.hole)===hole);if(i<0)allScores.push(saved);else allScores[i]=saved;
      }
      state.pending=null;state.dirty=false;
      if(advance) {
        const comp=await apiGet('competitions',{eventId:currentEvent.event_id}),config=comp.config||{};
        if(config.nearest_enabled&&(config.nearest_holes||[]).map(Number).includes(hole)&&!Object.prototype.hasOwnProperty.call(comp.pin_acknowledgements?.[hole]||{},String(selectedGroupNumber)))throw new Error('Scores saved. Record your Nearest the Pin decision before continuing.');
        if(holeIndex===17) {
          const finished=await apiPost({action:'completeGroup',eventId:currentEvent.event_id,groupNo:selectedGroupNumber});
          await renderFinishedGroupResults(finished.group_results||[]);showScreen('completeScreen');return;
        }
        holeIndex++;
      }
      renderScoring();showMessage('scoreMessage','Saved to server.','good');
    }catch(err){showMessage('scoreMessage',err.message+' Use Reload scores if another device changed this hole.','bad');}
    finally {controls.forEach(([el,disabled])=>{if(el.isConnected)el.disabled=disabled;});if(button.textContent==='Saving…')button.textContent=oldText;}
  }
  saveAndNext=()=>persist(true);
  const back=previousHole;previousHole=()=>{if(state.dirty&&!confirm('Discard unsaved changes on this hole?'))return;state.pending=null;state.dirty=false;back();};
  window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
  // Reload is explicit: never silently replace a pending correction after a revision conflict.
  const reload=document.createElement('button');reload.textContent='Reload scores';reload.className='secondary-button';reload.onclick=async()=>{
    if(!confirm('Discard unsaved selections and reload accepted scores?'))return;
    try{allScores=(await apiGet('scores',{eventId:currentEvent.event_id})).scores;state.pending=null;state.dirty=false;renderScoring();}catch(err){alert(err.message);}
  };document.getElementById('scoreScreen').append(reload);
  const access=document.createElement('section');access.className='card v2-credentials';access.innerHTML='<div class="sub-title">Scorer access codes</div><p>Issue a code after saving the groups. Give it privately to the assigned scorer. Rotating a code revokes the previous code.</p><label for="v2IssueGroup">Group number</label><input id="v2IssueGroup" type="number" min="1" inputmode="numeric" value="1"><button id="v2Issue" class="secondary-button">Issue / rotate group code</button><p id="v2Issued" role="status"></p><button id="v2Recover" class="secondary-button">Recover pending score writes</button><button id="v2AdminLogout">Sign out of admin</button>';
  document.getElementById('adminScreen').append(access);
  access.querySelector('#v2Issue').onclick=async()=>{
    try{const eventId=adminEventId||currentEvent?.event_id;if(!eventId)throw new Error('Create a round and save groups first.');const r=await apiPost({action:'issueGroupCredential',eventId,groupNo:Number(document.getElementById('v2IssueGroup').value)});document.getElementById('v2Issued').textContent=r.token;}
    catch(err){document.getElementById('v2Issued').textContent=err.message;}
  };
  access.querySelector('#v2Recover').onclick=async()=>{try{await apiPost({action:'recoverScores',eventId:adminEventId||currentEvent?.event_id});document.getElementById('v2Issued').textContent='Accepted score writes recovered. Reload scores before correcting.';}catch(err){document.getElementById('v2Issued').textContent=err.message;}};
  access.querySelector('#v2AdminLogout').onclick=()=>{state.admin='';adminPinValue='';document.getElementById('v2Issued').textContent='';showScreen('homeScreen');};
  const connection=document.createElement('section');connection.className='v2-connection';connection.innerHTML='<strong>V2 development · separate test backend only</strong><form id="v2Connect"><label for="v2Endpoint">Test Apps Script web-app URL</label><input id="v2Endpoint" type="url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec" required><button>Connect test backend</button><p id="v2ConnectionStatus" role="status"></p></form>';
  document.body.prepend(connection);document.getElementById('v2Endpoint').value=API_URL;
  document.getElementById('v2Connect').onsubmit=async e=>{
    e.preventDefault();const value=document.getElementById('v2Endpoint').value.trim();
    try{const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)||url.search||url.hash)throw new Error('Enter a valid Apps Script test web-app URL.');
      const r=await fetch(value+'?action=status'),data=await r.json();if(!data.ok||data.api_generation!=='v2-phase1')throw new Error('This endpoint is not the V2 Phase 1 backend.');
      localStorage.setItem('flaghunters.v2.api',value);location.reload();
    }catch(err){document.getElementById('v2ConnectionStatus').textContent=err.message;}
  };
  if(API_URL) initialise();
})();
