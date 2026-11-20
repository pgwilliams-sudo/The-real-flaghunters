// Focused Stage 7 integration: synthetic HTTP backend + real worker/IndexedDB; no Google calls.
const http=require('node:http'),fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{harness}=require('./harness.cjs');
(async()=>{
 const h=harness();delete h.properties.V2_SCORING_ACCESS_MODE;
 const events=h.sheets.get('Events').rows;events.push(events.splice(1,1)[0]);
 const files=['index.html','v2-app-sw.js','v2.css','v2.js','v2-local.js','v2-sync.js','v2-recovery.js','v2-offline.js','app-icon.PNG'];
 const server=http.createServer((req,res)=>{
  const file=req.url==='/'?'index.html':req.url.slice(1);
  if(!files.includes(file)){res.writeHead(404);return res.end();}
  res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.PNG')?'image/png':'text/html','Cache-Control':'no-store'});res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port+'/',endpoint='https://script.google.com/macros/s/stage7-fixture/exec',calls=[],errors=[];
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||chromium.executablePath(),headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:820,height:1180}});let offline=false,loseStart=true;
 await context.addInitScript(url=>localStorage.setItem('flaghunters.v2.api',url),endpoint);
 await context.route(endpoint+'**',async route=>{
  if(offline)return route.abort();
  const req=route.request(),data=req.method()==='POST'?JSON.parse(req.postData()):null;
  if(data)calls.push(data);
  const result=data?h.post(data):h.ctx.doGet({parameter:Object.fromEntries(new URL(req.url()).searchParams)});
  if(data?.action==='startRound'&&loseStart){loseStart=false;return route.abort();}
  await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(result)});
 });
 async function open(suffix=''){const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(origin+suffix);return p;}
 async function observe(p,fn,arg){const end=Date.now()+30000;while(!await p.evaluate(fn,arg)){if(Date.now()>end)throw Error('Stage 7 observation timed out');await new Promise(resolve=>setTimeout(resolve,20));}}
 async function pending(p,n){await observe(p,async count=>(await V2Local.pending()).length===count,n);}
 try{
  let p=await open();await p.getByRole('button',{name:/Enter Scores/}).click();await p.locator('.group-button').first().click();await p.locator('#scoreScreen.active').waitFor();
  assert.equal(await p.locator('#v2Code').count(),0);
  assert.equal(calls.find(c=>c.action==='openGroup').pin,undefined);
  await p.locator('#v2PrepareOffline').click();await p.locator('#v2OfflineStatus').filter({hasText:/App assets prepared/}).waitFor({timeout:40000});
  await p.reload();await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await p.getByRole('button',{name:/Reopen prepared round/}).click();await p.locator('#scoreScreen.active').waitFor();
  offline=true;await context.setOffline(true);
  for(const button of await p.locator('.v2-pickup').all())await button.click();
  await p.evaluate(()=>Promise.all([saveAndNext(),saveAndNext(),saveAndNext()]));
  await pending(p,1);assert.equal(await p.locator('#v2Hole').inputValue(),'1','duplicate Save & Next must advance once');const before=await p.evaluate(()=>V2Local.pending());
  assert.match(await p.locator('#scoreMessage').innerText(),/Saved on this device.*awaiting server acceptance/);
  await p.close();p=await open('#');await p.reload();
  await p.getByRole('button',{name:/Reopen prepared round/}).click();await p.locator('#scoreScreen.active').waitFor();
  assert.equal((await p.evaluate(()=>V2Local.pending()))[0].operationId,before[0].operationId);
  offline=false;await context.setOffline(false);await pending(p,0);
  assert.equal(h.ctx.v2Rows('ScoreHistory').length,4);
  await p.locator('#v2Hole').selectOption('0');
  await p.evaluate(()=>setScore('p1',5));await p.locator('.v2-reason[data-player-id="p1"]').fill('Stage 7 checked card');
  await p.getByRole('button',{name:'Save this hole',exact:true}).click();
  await observe(p,async()=>(await V2Local.recovery()).drafts.some(d=>d.request.hole===1&&d.request.scores.some(s=>s.playerId==='p1'&&s.gross===5)&&d.status==='accepted'));await pending(p,0);
  if(h.ctx.v2Rows('ScoreHistory').length!==5)console.log('CORRECTION_DIAGNOSTIC',JSON.stringify({
    scores:h.ctx.getScores('v2-event').map(s=>({player:s.player_id,hole:s.hole,status:s.score_status,gross:s.gross,revision:s.revision})),
    requests:calls.filter(c=>c.action==='saveHoleScores').map(c=>({operationId:c.operationId,hole:c.hole,scores:c.scores})),
    drafts:await p.evaluate(async()=>(await V2Local.recovery()).drafts.map(d=>({operationId:d.operationId,status:d.status,request:d.request})))
  }));
  assert.equal(h.ctx.v2Rows('ScoreHistory').length,5);
  assert.equal(h.ctx.getScores('v2-event').find(s=>s.player_id==='p1'&&s.hole===1).revision,2);
  const denied=await p.evaluate(async()=>{try{await apiPost({action:'revealResults',eventId:currentEvent.event_id});return '';}catch(e){return e.message;}});
  assert.match(denied,/Admin authentication required/);
  console.log('PASS Stage 7: no PIN, durable offline save/reopen/reload, duplicate save guard, reconnect, correction and admin-only reveal');
  h.properties.V2_SCORING_ACCESS_MODE='group-pin';
  await p.evaluate(()=>showScreen('homeScreen'));await p.getByRole('button',{name:/Enter Scores/}).click();await p.locator('.group-button').first().click();await p.locator('#v2Code').waitFor();
  await p.locator('#v2Close').click();delete h.properties.V2_SCORING_ACCESS_MODE;
  await p.evaluate(()=>showScreen('homeScreen'));await p.getByRole('button',{name:/Admin Setup/}).click();await p.locator('#adminPin').fill(h.properties.V2_ADMIN_SECRET);
  await p.getByRole('button',{name:'Login',exact:true}).click();await p.locator('#adminScreen.active').waitFor();
  assert.equal(await p.locator('#v2Issue').isVisible(),false);
  await p.locator('#eventDate').fill('2026-11-21');
  await p.evaluate(()=>Promise.all([createRound(),createRound()]));
  assert.equal(calls.filter(c=>c.action==='createEvent').length,1);
  await p.getByRole('button',{name:'Randomise Groups',exact:true}).click();
  await p.evaluate(()=>Promise.all([saveGroupSetup(),saveGroupSetup()]));
  assert.equal(calls.filter(c=>c.action==='saveGroups').length,1);
  await p.locator('#adminCompetitionsCard .sub-title').filter({hasText:'Select Comps & Start Round'}).waitFor();
  assert.equal(calls.filter(c=>c.action==='issueGroupCredential').length,0);
  await p.evaluate(()=>Promise.all([saveAdminCompetitions(),saveAdminCompetitions()]));
  await p.locator('#adminCompetitionMessage').filter({hasText:/Round start unconfirmed/}).waitFor();
  assert.equal(await p.locator('#adminScreen').evaluate(el=>el.classList.contains('active')),true);
  const requests=calls.filter(c=>c.action==='startRound');assert.equal(requests.length,1);
  const eventId=requests[0].eventId,started=h.ctx.v2Meta(eventId).started_at;assert.ok(started);
  const task=p.evaluate(()=>Promise.all([saveAdminCompetitions(),saveAdminCompetitions()]));
  await p.locator('#adminCompetitionsCard .primary-button').filter({hasText:'Saved ✓'}).waitFor();await task;
  await p.locator('#homeScreen.active').waitFor();
  const starts=calls.filter(c=>c.action==='startRound');assert.equal(starts.length,2);assert.deepEqual(starts[0],starts[1]);
  assert.equal(h.ctx.v2Meta(eventId).started_at,started);
  assert.equal(h.sheets.get('Competitions').rows.filter(r=>r[0]===eventId).length,1);
  assert.deepEqual(errors,[]);
  console.log('PASS Stage 7: configurable PIN mode, hidden dormant PIN controls, duplicate setup guards, lost-response retry, Saved confirmation and Home');
 }finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
