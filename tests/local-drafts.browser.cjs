// Real browser IndexedDB; all golf/API requests fulfilled by the local harness.
const {chromium,webkit}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');
const endpoint='https://script.google.com/macros/s/local-draft-test/exec',origin='http://flaghunters.test/';
async function fixture(browser,{fillOtherHoles=false,processBeforeHold=false}={}) {
  const h=harness();const events=h.sheets.get('Events').rows;events.push(events.splice(1,1)[0]);
  if(fillOtherHoles)for(let hole=2;hole<=18;hole++)assert.equal(h.save({hole,scores:[1,2,3,4].map(i=>({playerId:'p'+i,status:'pickup',gross:null,expectedRevision:0}))}).ok,true);
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
  await context.addInitScript(url=>localStorage.setItem('flaghunters.v2.api',url),endpoint);
  const requests=[],errors=[];let hold=false,release,offline=false,loseRecovery=false,malformedHistory=false;
  const gate=new Promise(resolve=>release=resolve);
  await context.route('**/*',async route=>{
    const req=route.request(),url=req.url();
    if(url.startsWith(endpoint)) {
      if(offline&&req.method()==='POST'&&['saveHoleScores','operationStatus','resolveOperation','reviewOperation'].includes(JSON.parse(req.postData()).action))return route.abort('internetdisconnected');
      let data,result;if(req.method()==='POST'){data=JSON.parse(req.postData());requests.push(data);if(data.action==='saveHoleScores'&&hold){if(processBeforeHold)result=h.post(data);await gate;}}
      result ||= data?h.post(data):h.ctx.doGet({parameter:Object.fromEntries(new URL(url).searchParams)});
      if(malformedHistory&&data?.action==='scoreHistory')result={ok:true};
      if(loseRecovery&&data?.action==='resolveOperation'){loseRecovery=false,malformedHistory=false;offline=true;return route.abort('connectionclosed');}
      try{await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(result)});}catch(_){} // A reloaded tab may abandon its response.
      return;
    }
    const path=new URL(url).pathname;
    if(url.startsWith(origin)&&['/','/index.html','/v2-local.js','/v2-sync.js','/v2-recovery.js','/v2.js','/v2.css','/app-icon.PNG'].includes(path))return route.fulfill({status:200,contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.PNG')?'image/png':'text/html',body:fs.readFileSync(path==='/'?'index.html':path.slice(1))});
    if(path==='/favicon.ico')return route.fulfill({status:204,body:''});
    throw Error('Unexpected external request '+url);
  });
  async function page() {const p=await context.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(origin);return p;}
  async function openGroup(p) {
    await p.getByRole('button',{name:/Enter Scores/}).click();await p.locator('.group-button').first().click();
    if(!requests.some(r=>r.action==='openGroup')) {await p.locator('#v2Code').fill(h.groupPin);await p.getByRole('button',{name:'Open group',exact:true}).click();}
    await p.locator('#scoreScreen.active').waitFor();
  }
  return {h,context,requests,errors,page,openGroup,offline:value=>{offline=value;},loseRecovery:()=>{loseRecovery=true;},malformedHistory:value=>{malformedHistory=value;},hold:()=>{hold=true;},release:()=>{hold=false;release();}};
}
async function fillPickups(page){for(const button of await page.locator('.v2-pickup').all())await button.tap();}
async function browserWait(page,fn,arg){const end=Date.now()+15000;while(!await page.evaluate(fn,arg)){if(Date.now()>end)throw Error('Browser state observation timed out');await new Promise(r=>setTimeout(r,10));}}
async function waitPending(page,count){await browserWait(page,async n=>(await V2Local.pending()).length===n,count);}
async function observe(predicate) {const end=Date.now()+5000;while(!predicate()){if(Date.now()>end)throw Error('Fixture observation timed out');await new Promise(r=>setTimeout(r,10));}}
async function scenario(browser,label) {
  // Slow response proves durable-first advancement, reload recovery and Finish gating.
  let f=await fixture(browser,{fillOtherHoles:true});
  try {
    let page=await f.page();await f.openGroup(page);f.hold();await fillPickups(page);
    await page.locator('#nextButton').tap();await page.waitForFunction(()=>holeIndex===1);
    await waitPending(page,1);
    await observe(()=>f.requests.some(r=>r.action==='saveHoleScores'));
    assert.equal(f.h.ctx.getScores('v2-event').filter(s=>s.hole===1).length,0,'advance must occur while server has not accepted anything');
    const saved=await page.evaluate(async()=>{const d=(await V2Local.pending())[0];return {id:d.operationId,body:JSON.stringify(d.request)};});
    await page.locator('#v2Hole').selectOption('17');assert.equal(await page.locator('#nextButton').isDisabled(),true);
    const refused=await page.evaluate(()=>apiPost({action:'completeGroup',eventId:currentEvent.event_id,groupNo:1}).then(()=>null,error=>error.message));assert.match(refused,/server acceptance/);
    assert.equal(f.requests.some(r=>r.action==='completeGroup'),false);
    await page.close();await f.context.addInitScript(()=>{const now=Date.now;Date.now=()=>now()+61000;});page=await f.page();await f.openGroup(page);await waitPending(page,1);
    assert.equal(f.requests.filter(r=>r.action==='openGroup').length,1,'trusted session must survive tab closure without another PIN');
    await browserWait(page,async()=>(await V2Local.pending())[0]?.attempts>=2);
    await observe(()=>f.requests.filter(r=>r.action==='saveHoleScores').length>=2);
    assert.equal(f.requests.filter(r=>r.action==='saveHoleScores').length,2,'Stage 3 resumes the ordered queue after the expired tab lease');
    const restored=await page.evaluate(async()=>{const d=(await V2Local.pending())[0];return {id:d.operationId,body:JSON.stringify(d.request)};});assert.deepEqual(restored,saved);
    await page.locator('#v2ForgetLocal').click();await page.locator('#v2Dialog[open]').getByText(/cannot be cleared/).waitFor();
    const downloadPromise=page.waitForEvent('download');await page.locator('#v2ExportLocal').click();const download=await downloadPromise;
    const recovery=fs.readFileSync(await download.path(),'utf8');assert.ok(recovery.includes(saved.id));assert.equal(recovery.includes(f.h.group),false);assert.equal(recovery.includes(f.h.properties.V2_ADMIN_SECRET),false);
    await page.locator('#v2Close').click();await waitPending(page,1);
    await page.locator('#v2Hole').selectOption('0');await page.getByRole('button',{name:'Save this hole',exact:true}).click();
    await browserWait(page,async()=>{const d=(await V2Local.pending())[0];return d?.attempts>=2;});
    f.release();await waitPending(page,0);await page.locator('#scoreMessage').filter({hasText:'Saved to server.'}).waitFor();
    assert.equal(f.requests.filter(r=>r.action==='saveHoleScores').length,2);assert.ok(f.requests.filter(r=>r.action==='saveHoleScores').every(r=>r.operationId===saved.id));
    const history=f.h.ctx.v2Rows('ScoreHistory').map(r=>JSON.parse(r.data)).filter(c=>c.after.hole===1);assert.equal(history.length,4,'lost response/retry must not create duplicate history');
    await page.locator('#v2Hole').selectOption('17');await page.waitForFunction(()=>!document.getElementById('nextButton').disabled);
    await page.locator('#nextButton').tap();await page.locator('#completeScreen.active').waitFor();
    assert.deepEqual(f.errors,[]);
    console.log('PASS '+label+': advance before slow server, durable tab recovery, private export, no pending deletion, stable retry, Finish acceptance gate');
  }finally{f.release();await f.context.close();}
  // Acceptance may precede a lost response: replay must preserve the old ID/body after bootstrap sees revision 1.
  f=await fixture(browser,{processBeforeHold:true});
  try {
    let page=await f.page();await f.openGroup(page);f.hold();await fillPickups(page);await page.locator('#nextButton').tap();
    await page.waitForFunction(()=>holeIndex===1);await waitPending(page,1);
    await browserWait(page,async()=>(await V2Local.pending())[0]?.attempts===1);
    await observe(()=>f.h.ctx.getScores('v2-event').length===4);
    assert.equal(f.h.ctx.getScores('v2-event').length,4);
    await page.close();await f.context.addInitScript(()=>{const now=Date.now;Date.now=()=>now()+61000;});page=await f.page();await f.openGroup(page);
    await waitPending(page,0);f.release();
    assert.equal(f.requests.filter(r=>r.action==='saveHoleScores').length,1,'accepted lost response is reconciled without another write');
    assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,4);assert.equal(f.h.ctx.getScores('v2-event')[0].revision,1);
    assert.deepEqual(f.errors,[]);console.log('PASS '+label+': lost accepted response reconciles without another mutation after refreshed server revision');
  }finally{f.release();await f.context.close();}
  // Foreground reconnect/resume/manual Retry drains a synthetic interrupted connection.
  for(const trigger of ['online','resume','manual']) {
    f=await fixture(browser);
    try {
      const page=await f.page();await f.openGroup(page);f.offline(true);
      await fillPickups(page);await page.locator('#nextButton').tap();await page.waitForFunction(()=>holeIndex===1);
      await browserWait(page,async()=>(await V2Local.pending())[0]?.lastError);
      await fillPickups(page);await page.locator('#nextButton').tap();await page.waitForFunction(()=>holeIndex===2);
      await waitPending(page,2);
      // Start a next-hole selection: late acceptance must not clear it or advance again.
      await page.locator('.v2-pickup').first().tap();
      f.offline(false);
      if(trigger==='online')await page.evaluate(()=>window.dispatchEvent(new Event('online')));
      else if(trigger==='resume')await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));});
      else await page.locator('#v2RetryLocal').tap();
      await waitPending(page,0);
      const writes=f.requests.filter(r=>r.action==='saveHoleScores');
      assert.deepEqual(writes.map(d=>d.hole),[1,2]);
      assert.equal(await page.evaluate(()=>holeIndex),2);assert.equal(await page.locator('#display-p1').textContent(),'BLOB');
      assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,8);assert.deepEqual(f.errors,[]);
      console.log('PASS '+label+': '+trigger+' drains offline saves in order and preserves next-hole selection');
    }finally{await f.context.close();}
  }
  // Real phone UI: compare two-device values, explicitly confirm selected changes,
  // lose the accepted response, reopen, and resume the same durable recovery decision.
  f=await fixture(browser);
  try {
    let page=await f.page();await f.openGroup(page);f.offline(true);
    await fillPickups(page);await page.getByRole('button',{name:'Save this hole',exact:true}).tap();await waitPending(page,1);
    await browserWait(page,async()=>(await V2Local.pending())[0]?.lastError);
    assert.equal(f.h.save({scores:[1,2,3,4].map(i=>({playerId:'p'+i,status:'scored',gross:5,expectedRevision:0}))}).ok,true);
    f.offline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await browserWait(page,async()=>(await V2Local.pending())[0]?.failureKind==='conflict');
    await page.locator('#v2ReviewLocal').tap();await page.locator('[data-review-operation]').tap();
    await page.getByRole('heading',{name:'Review score conflict'}).waitFor();
    assert.equal(await page.locator('.v2-use-local:checked').count(),0,'never preselect an overwrite');
    await page.evaluate(()=>{window.confirm=()=>{throw Error('Recovery must not call native confirm');};});
    await page.locator('.v2-recovery-entry').first().getByText('Server accepted:',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'recovery has no horizontal page overflow');
    await page.locator('.v2-use-local').first().check();await page.locator('#v2RecoveryReason').fill('Reviewed phone BLOB correction');f.loseRecovery();
    await page.locator('#v2ResubmitLocal').tap();await page.locator('#v2RecoveryConfirmSubmit').tap();
    await browserWait(page,async()=>(await V2Local.pending())[0]?.lastError);
    const pending=await page.evaluate(()=>V2Local.pending()),savedId=pending[0].recoveryIntent.resolutionId;
    assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,5,'server accepted exactly one selected correction before response loss');
    await page.close();await f.context.addInitScript(()=>{const now=Date.now;Date.now=()=>now()+61000;});page=await f.page();await f.openGroup(page);f.offline(false);
    await page.locator('#v2RetryLocal').tap();await waitPending(page,0);
    const records=await page.evaluate(()=>V2Local.recovery()),resolved=records.drafts.find(d=>d.recoveryIntent?.resolutionId===savedId);
    assert.equal(resolved.status,'resolved');assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,5);
    const resolutions=f.requests.filter(r=>r.action==='resolveOperation');assert.ok(resolutions.length>=2);assert.ok(resolutions.every(r=>r.resolutionId===savedId));
    const score=f.h.ctx.getScores('v2-event').find(s=>s.player_id==='p1');assert.equal(score.score_status,'pickup');assert.equal(score.gross,null);
    assert.deepEqual(f.errors,[]);console.log('PASS '+label+': explicit conflict comparison, selected BLOB recovery, accepted-response loss and durable idempotent resume');
  }finally{await f.context.close();}
  // Expired credentials stop automatic attempts and reauthentication is explicit.
  f=await fixture(browser);
  try {
    const page=await f.page();await f.openGroup(page);
    const row=f.h.sheets.get('ScoringCredentials').rows.find(r=>r[0]===f.h.group.split('.')[0]),session=JSON.parse(row[1]);session.expires_at=0;row[1]=JSON.stringify(session);
    await fillPickups(page);await page.getByRole('button',{name:'Save this hole',exact:true}).tap();
    await browserWait(page,async()=>(await V2Local.pending())[0]?.failureKind==='credential');
    const writes=f.requests.filter(r=>['saveHoleScores','operationStatus'].includes(r.action)).length;
    await page.evaluate(()=>{for(let i=0;i<3;i++){window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'));}});
    await page.locator('#v2ReviewLocal').tap();await page.getByRole('heading',{name:'Local score recovery'}).waitFor();
    assert.equal(f.requests.filter(r=>['saveHoleScores','operationStatus'].includes(r.action)).length,writes);
    assert.equal((await page.evaluate(()=>V2Local.pending())).length,1);
    const fresh=f.h.post({action:'issueGroupCredential',credential:f.h.admin,eventId:'v2-event',groupNo:1});
    await page.locator('[data-reauth-group]').tap();await page.locator('#v2Code').fill(fresh.pin);await page.getByRole('button',{name:'Open group',exact:true}).tap();
    await page.locator('#scoreScreen.active').waitFor();
    await browserWait(page,async()=>(await V2Local.pending())[0]?.status==='needs-review');
    await page.locator('#v2ReviewLocal').tap();await page.locator('[data-review-operation]').tap();
    await page.getByRole('heading',{name:'Review score conflict'}).waitFor();
    for(const checkbox of await page.locator('.v2-use-local').all())await checkbox.check();
    await page.locator('#v2RecoveryReason').fill('Explicit renewed group session');await page.locator('#v2ResubmitLocal').tap();await page.locator('#v2RecoveryConfirmSubmit').tap();await waitPending(page,0);
    assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,4);assert.deepEqual(f.errors,[]);
    console.log('PASS '+label+': expired session pauses retries, reauthenticates and submits only after explicit review');
  }finally{await f.context.close();}
  // A stale comparison must stay safe without browser-native confirm/alert dialogs.
  f=await fixture(browser);
  try {
    const page=await f.page();await f.openGroup(page);f.offline(true);
    await fillPickups(page);await page.getByRole('button',{name:'Save this hole',exact:true}).tap();
    await browserWait(page,async()=>(await V2Local.pending())[0]?.lastError);
    f.h.save({scores:[1,2,3,4].map(i=>({playerId:'p'+i,status:'scored',gross:5,expectedRevision:0}))});
    f.offline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await browserWait(page,async()=>(await V2Local.pending())[0]?.failureKind==='conflict');
    await page.locator('#v2ReviewLocal').tap();await page.locator('[data-review-operation]').tap();
    await page.getByRole('heading',{name:'Review score conflict'}).waitFor();
    await page.evaluate(()=>{window.confirm=()=>{throw Error('Native confirmation forbidden in recovery');};window.alert=()=>{throw Error('Native alert forbidden in recovery');};});
    await page.locator('.v2-use-local').first().check();await page.locator('#v2RecoveryReason').fill('Reviewed BLOB confirmation');
    await page.locator('#v2KeepServer').tap();await page.locator('#v2RecoveryConfirm').waitFor();
    assert.equal(f.requests.filter(r=>r.action==='resolveOperation').length,0);
    assert.equal((await page.evaluate(()=>V2Local.pending()))[0].recoveryIntent,undefined);
    await page.locator('#v2RecoveryConfirmCancel').tap();assert.equal(await page.locator('.v2-use-local').first().isChecked(),true);
    assert.equal(await page.locator('#v2RecoveryReason').inputValue(),'Reviewed BLOB confirmation');
    assert.equal(f.h.save({scores:[{playerId:'p1',status:'scored',gross:6,expectedRevision:1,reason:'Other device changed after comparison'}]}).ok,true);
    await page.locator('#v2ResubmitLocal').tap();await page.locator('#v2RecoveryConfirm').waitFor();
    assert.equal(f.requests.filter(r=>r.action==='resolveOperation').length,0,'first click never commits a decision');
    await page.locator('#v2RecoveryConfirmSubmit').evaluate(el=>{el.click();el.click();});
    await browserWait(page,async()=>(await V2Local.pending())[0]?.lastError?.includes('changed again'));
    assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,5,'stale approval cannot overwrite the newer accepted score');
    assert.equal(f.h.ctx.getScores('v2-event').find(s=>s.player_id==='p1').gross,6);
    await page.locator('[data-review-operation]').tap();await page.getByRole('heading',{name:'Review score conflict'}).waitFor();
    await page.locator('.v2-use-local').first().check();await page.locator('#v2RecoveryReason').fill('Fresh BLOB approval');
    await page.locator('#v2ResubmitLocal').tap();await page.locator('#v2RecoveryConfirmSubmit').tap();await waitPending(page,0);
    assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,6);assert.equal(f.h.ctx.getScores('v2-event').find(s=>s.player_id==='p1').gross,null);
    assert.deepEqual(f.errors,[]);console.log('PASS '+label+': in-page confirmation, cancel preservation, double-click protection and stale-review rejection without native dialogs');
  }finally{await f.context.close();}
  // Unexpected successful response shapes must not crash history or pretend it is empty.
  f=await fixture(browser);
  try {
    f.h.save();const page=await f.page();await f.openGroup(page);await page.locator('#v2Hole').selectOption('0');
    await page.evaluate(()=>{window.alert=()=>{throw Error('History error must use an in-page message');};});
    f.malformedHistory(true);await page.locator('#score-p1').getByRole('button',{name:'Revision history',exact:true}).tap();
    await page.getByRole('heading',{name:'Revision history unavailable'}).waitFor();await page.getByText(/response was incomplete/).waitFor();
    assert.equal(f.h.ctx.v2Rows('ScoreHistory').length,1);assert.equal((await page.evaluate(()=>V2Local.pending())).length,0);
    await page.locator('#v2Close').tap();f.malformedHistory(false);
    await page.locator('#score-p1').getByRole('button',{name:'Revision history',exact:true}).tap();
    await page.getByRole('heading',{name:'Immutable revision history'}).waitFor();assert.equal(await page.locator('.v2-history-entry').count(),1);
    assert.deepEqual(f.errors,[]);console.log('PASS '+label+': malformed history response gives a safe in-page error and retry leaves scores/history intact');
  }finally{await f.context.close();}
  // Other rounds remain visible/exportable, receive no automatic traffic and do not
  // block completion of a fully server-accepted current round.
  f=await fixture(browser,{fillOtherHoles:true});
  try {
    assert.equal(f.h.save({hole:1,scores:[1,2,3,4].map(i=>({playerId:'p'+i,status:'pickup',gross:null,expectedRevision:0}))}).ok,true);
    let page=await f.page();await f.openGroup(page);
    const boot=f.h.post({action:'roundBootstrap',credential:f.h.group,eventId:'v2-event',groupNo:1});
    await page.evaluate(async({boot,backend})=>{
      const who={backend,eventId:'older-round',groupNo:1,credentialId:'old-credential'};
      await V2Local.prepare(who,boot);
      const d=await V2Local.saveDraft(who,{action:'saveHoleScores',eventId:who.eventId,hole:1,scores:[1,2,3,4].map(i=>({playerId:'p'+i,status:'scored',gross:4,expectedRevision:0,reason:''}))},'retained_older_round_operation');
      await V2Local.problem(d.operationId,'Scoring credential invalid or expired');
    },{boot,backend:endpoint});
    await page.reload();await f.openGroup(page);
    await page.locator('#v2LocalSummary').filter({hasText:'other rounds/backends'}).waitFor();
    await page.locator('#v2RetryLocal').tap();await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await page.locator('#v2Hole').selectOption('17');await browserWait(page,()=>!document.getElementById('nextButton').disabled);
    assert.equal(f.requests.some(r=>r.eventId==='older-round'),false);
    await page.locator('#v2ReviewLocal').tap();await page.getByRole('heading',{name:'Other rounds and backends'}).waitFor();
    await page.getByText('Other round/backend · older-round',{exact:false}).waitFor();
    assert.equal((await page.evaluate(()=>V2Local.pending()))[0].attempts,0);assert.deepEqual(f.errors,[]);
    console.log('PASS '+label+': older-round records stay visible and paused without blocking current-round completion');
  }finally{await f.context.close();}
  // Any local group/credential queue for the round blocks completion, not just the current scope.
  f=await fixture(browser,{fillOtherHoles:true});
  try {
    assert.equal(f.h.save({hole:1,scores:[1,2,3,4].map(i=>({playerId:'p'+i,status:'pickup',gross:null,expectedRevision:0}))}).ok,true);
    const page=await f.page();await f.openGroup(page);await page.locator('#v2Hole').selectOption('17');
    await page.waitForFunction(()=>!document.getElementById('nextButton').disabled);
    const boot=f.h.post({action:'roundBootstrap',credential:f.h.group2,eventId:'v2-event',groupNo:2});
    await page.evaluate(async({boot,backend,credentialId})=>{
      const who={backend,eventId:'v2-event',groupNo:2,credentialId};
      await V2Local.prepare(who,boot);
      await V2Local.saveDraft(who,{action:'saveHoleScores',eventId:'v2-event',hole:1,scores:[5,6,7,8].map(i=>({playerId:'p'+i,status:'pickup',gross:null,expectedRevision:0,reason:''}))},'another_group_local_save');
      renderScoring();
    },{boot,backend:endpoint,credentialId:f.h.group2.split('.')[0]});
    await page.waitForFunction(()=>document.getElementById('nextButton').disabled);
    const refused=await page.evaluate(()=>apiPost({action:'completeGroup',eventId:'v2-event',groupNo:1}).then(()=>null,e=>e.message));assert.match(refused,/server acceptance/);
    assert.equal(f.requests.some(r=>r.action==='completeGroup'),false);assert.deepEqual(f.errors,[]);
    console.log('PASS '+label+': Finish waits for other local group/credential queues in the same round');
  }finally{await f.context.close();}
  // Storage quota failure must not advance or contact the server.
  f=await fixture(browser);
  try {
    const page=await f.page();await f.openGroup(page);await fillPickups(page);
    await page.evaluate(()=>{const add=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){if(this.name==='drafts')throw new DOMException('Synthetic storage quota failure','QuotaExceededError');return add.apply(this,args);};});
    await page.locator('#nextButton').tap();await page.locator('#scoreMessage').filter({hasText:/Not saved on this device.*storage is full/}).waitFor();
    assert.equal(await page.evaluate(()=>holeIndex),0);assert.equal(f.requests.filter(r=>r.action==='saveHoleScores').length,0);await waitPending(page,0);
    assert.deepEqual(f.errors,[]);console.log('PASS '+label+': IndexedDB failure does not advance or falsely submit');
  }finally{await f.context.close();}
  // A reveal by another device must reject the save without deleting its local evidence.
  f=await fixture(browser);
  try {
    const page=await f.page();await f.openGroup(page);
    const row=f.h.sheets.get('RoundEventsV2').rows[1],meta=JSON.parse(row[1]);meta.locked=true;meta.revealed_at='external-test-reveal';row[1]=JSON.stringify(meta);
    await fillPickups(page);await page.getByRole('button',{name:'Save this hole',exact:true}).tap();
    await page.locator('#scoreMessage').filter({hasText:/acceptance unconfirmed.*permanently locked/}).waitFor();
    const pending=await page.evaluate(()=>V2Local.pending());assert.equal(pending.length,1);assert.equal(pending[0].status,'needs-review');
    assert.equal(f.h.ctx.getScores('v2-event').length,0);assert.ok(await page.locator('.v2-locked').count());
    await page.locator('#v2ReviewLocal').click();await page.locator('#v2ExportLocal').waitFor();
    assert.deepEqual(f.errors,[]);console.log('PASS '+label+': post-reveal rejection keeps pending recovery data and disables scoring');
  }finally{await f.context.close();}
}
(async()=>{
 const chrome=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),headless:true,args:['--no-sandbox']});try{await scenario(chrome,'Chromium phone');}finally{await chrome.close();}
 if(fs.existsSync(webkit.executablePath())){const safari=await webkit.launch({headless:true});try{await scenario(safari,'WebKit phone');}finally{await safari.close();}}
 else console.log('LIMITATION: WebKit unavailable locally; Stage 4 has no physical Safari validation yet.');
})().catch(error=>{console.error(error);process.exitCode=1;});
