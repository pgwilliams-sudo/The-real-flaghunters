// All HTTP requests are fulfilled locally. No production or Google requests leave this test.
const {chromium,webkit}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');
const endpoint='https://script.google.com/macros/s/synthetic-test/exec';
async function checkTableGeometry(page,count) {
  const table=page.locator('.v2-leaderboard');
  assert.deepEqual(await table.locator('thead th').allTextContents(),['Player','Gross','Stb','F9','B9']);
  assert.equal(await table.locator('tbody tr').count(),count);
  assert.equal(await page.locator('#leaderboardTable .v2-result').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'page horizontal overflow');
  const measurements=await table.locator('tbody tr').evaluateAll(rows=>rows.map(row=>({
    cells:row.children.length,height:row.getBoundingClientRect().height,
    nameWidth:row.querySelector('.v2-table-name').clientWidth,
    numbersFit:[...row.querySelectorAll('td')].every(cell=>{
      const range=document.createRange();range.selectNodeContents(cell);
      return range.getBoundingClientRect().width<=cell.clientWidth-4+1;
    })
  })));
  assert.ok(measurements.every(r=>r.cells===5&&r.height>=44&&r.height<=52&&r.nameWidth>=100&&r.numbersFit),JSON.stringify(measurements));
}
async function checkLeaderboard(page,h,revealed) {
  const rows=h.ctx.getLeaderboard('v2-event');await checkTableGeometry(page,rows.length);
  for(const p of rows) {
    const row=page.locator('[data-scorecard-player="'+p.player_id+'"]');
    const value=s=>String(s.stableford)+(s.partial?'*':'');
    assert.deepEqual(await row.locator('td').allTextContents(),[
      (p.total.gross_incomplete?'—':String(p.total.gross))+(p.total.partial?'*':''),value(p.total),value(p.front9),value(p.back9)
    ]);
  }
  assert.equal(rows[0].revealed,revealed);
}
async function scenario(browser,name,viewport){
  const h=harness(),context=await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:2});
  // Fixtures must follow creation order: the current V2 round is newer than the legacy round.
  const events=h.sheets.get('Events').rows;events.push(events.splice(1,1)[0]);
  await context.addInitScript(url=>localStorage.setItem('flaghunters.v2.api',url),endpoint);
  const metaRow=h.sheets.get('RoundEventsV2').rows[1],meta=JSON.parse(metaRow[1]);delete meta.confirmed_groups['1'];metaRow[1]=JSON.stringify(meta);
  let pinLogins=0;
  const errors=[];const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const req=route.request(),url=req.url();
    if(url.startsWith(endpoint)) {
      if(req.method()==='POST'&&JSON.parse(req.postData()).action==='openGroup')pinLogins++;
      const result=req.method()==='POST'?h.post(JSON.parse(req.postData())):h.ctx.doGet({parameter:Object.fromEntries(new URL(url).searchParams)});
      return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(result)});
    }
    const path=new URL(url).pathname;
    if(url.startsWith('http://flaghunters.test/')&&['/','/index.html','/v2.js','/v2-local.js','/v2.css','/app-icon.PNG'].includes(path))return route.fulfill({status:200,contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.PNG')?'image/png':'text/html',body:fs.readFileSync(path==='/'?'index.html':path.slice(1))});
    throw Error('Unexpected network request '+url);
  });
  page.on('dialog',d=>d.accept());
  await page.goto('http://flaghunters.test/');
  await page.getByRole('button',{name:/Enter Scores/}).click();
  await page.locator('.group-button').first().click();
  await page.locator('#v2Code').fill(h.groupPin==='00'?'01':'00');await page.getByRole('button',{name:'Open group',exact:true}).click();
  await page.locator('#v2AccessError').filter({hasText:/PIN/}).waitFor();
  await page.locator('#v2Code').fill(h.groupPin);await page.getByRole('button',{name:'Open group',exact:true}).click();
  await page.locator('#handicapScreen.active').waitFor();
  await page.locator('#confirmHandicapsButton').tap();
  await page.locator('#scoreScreen.active').waitFor();
  for(const button of await page.locator('.v2-pickup').all())await button.tap();
  assert.equal(await page.locator('.v2-pickup[aria-pressed=true]').count(),4);
  const bbox=await page.locator('.v2-pickup').first().boundingBox();assert.ok(bbox.height>=44);
  await page.getByRole('button',{name:'Save this hole',exact:true}).tap();await page.locator('#scoreMessage').filter({hasText:'Saved to server.'}).waitFor();
  // Same group and reload both retain the session without a second PIN prompt.
  const beforeReload=pinLogins;
  await page.reload();
  await page.getByRole('button',{name:/Enter Scores/}).click();
  await page.locator('.group-button').first().click();
  await page.locator('#scoreScreen.active').waitFor();
  assert.equal(await page.locator('#v2Code').count(),0);
  assert.equal(pinLogins,beforeReload);
  await page.evaluate(()=>showScreen('homeScreen'));
  await page.getByRole('button',{name:/Enter Scores/}).click();
  await page.locator('.group-button').first().click();
  await page.locator('#scoreScreen.active').waitFor();
  assert.equal(pinLogins,beforeReload);
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('flaghunters.v2.group:'))),false);
  assert.equal(h.ctx.getScores('v2-event').length,4);assert.equal(h.ctx.getScores('v2-event')[0].gross,null);
  // Reopening advances to the next unplayed hole; explicitly return to Hole 1.
  await page.locator('#v2Hole').selectOption('0');
  // Correct pickup to a real numeric zero-point score. Missing reason must block.
  await page.locator('#score-p1 .quick-score').first().tap();await page.getByRole('button',{name:'Save this hole',exact:true}).tap();
  await page.locator('#scoreMessage').filter({hasText:/correction reason/}).waitFor();assert.equal(h.ctx.getScores('v2-event')[0].revision,1);
  await page.getByRole('textbox',{name:'Correction reason for Player 1',exact:true}).fill('Corrected pickup entry');
  await page.getByRole('button',{name:'Save this hole',exact:true}).tap();await page.locator('#scoreMessage').filter({hasText:'Saved to server.'}).waitFor();
  assert.equal(h.ctx.getScores('v2-event').find(s=>s.player_id==='p1').revision,2);
  await page.locator('#score-p1').getByRole('button',{name:'Revision history'}).tap();await page.locator('#v2Dialog').getByText('Corrected pickup entry',{exact:true}).waitFor();assert.ok((await page.locator('#v2Dialog').innerText()).includes('scorer'));await page.locator('#v2Close').click();
  // Simulate other holes already accepted, then finish and edit using the real interface.
  for(let hole=2;hole<=17;hole++)assert.equal(h.save({hole,scores:[1,2,3,4].map(i=>({playerId:'p'+i,status:'pickup',gross:null,expectedRevision:0}))}).ok,true);
  // The fixture wrote those holes outside this tab; refresh the accepted local snapshot.
  await page.getByRole('button',{name:'Reload scores',exact:true}).tap();
  await page.locator('#v2Hole').selectOption('17');
  for(const button of await page.locator('.v2-pickup').all())await button.tap();
  await page.getByRole('button',{name:'Save this hole',exact:true}).tap();
  await page.locator('#scoreMessage').filter({hasText:'Saved to server.'}).waitFor();
  await page.getByRole('button',{name:'Finish Group',exact:true}).tap();await page.locator('#completeScreen.active').waitFor();
  assert.equal(h.ctx.getGroupStatus('v2-event').length,1);
  await page.getByRole('button',{name:'Edit Scores',exact:true}).tap();await page.locator('#scoreScreen.active').waitFor();
  await page.locator('#score-p1 .quick-score').first().tap();await page.getByRole('textbox',{name:'Correction reason for Player 1',exact:true}).fill('Correction after Finish Group');
  await page.getByRole('button',{name:'Save this hole',exact:true}).tap();await page.locator('#scoreMessage').filter({hasText:'Saved to server.'}).waitFor();
  assert.equal(h.ctx.getScores('v2-event').find(s=>s.player_id==='p1'&&s.hole===18).revision,2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'horizontal overflow');
  await page.evaluate(()=>showScreen('homeScreen'));await page.getByRole('button',{name:/Admin Setup/}).click();
  await page.locator('#adminPin').fill(h.properties.V2_ADMIN_SECRET);await page.getByRole('button',{name:'Login',exact:true}).click();await page.locator('#adminScreen.active').waitFor();
  await page.locator('#v2IssueGroup').fill('2');await page.locator('#v2Issue').tap();await page.waitForFunction(()=>/^[0-9]{2}$/.test(document.getElementById('v2Issued').textContent));
  assert.equal(h.post({action:'openGroup',pin:await page.locator('#v2Issued').innerText(),eventId:'v2-event',groupNo:2}).ok,true);
  // Read existing competition renderers using synthetic saved configuration and varied scores.
  h.ctx.saveCompetitionRecord('v2-event',{row:null,enabled:true,holes:[3],pins:{3:'p1'},pairs:[['p1','p2'],['p3','p4'],['p5','p6'],['p7','p8']],blindEnabled:true,team234Enabled:true});
  await page.evaluate(()=>showScreen('homeScreen'));await page.getByRole('button',{name:/Saturday Competitions/}).click();
  await page.locator('#competitionContent').getByText('Nearest the Pin',{exact:false}).first().waitFor();
  assert.ok((await page.locator('#competitionContent').innerText()).includes('Blind Pairs'));assert.ok((await page.locator('#competitionContent').innerText()).includes('2/3/4 Team Game'));
  const expected=h.ctx.getScores('v2-event').filter(s=>s.player_id==='p1'&&s.hole<=15).reduce((sum,s)=>sum+s.stableford,0);
  assert.ok((await page.locator('#competitionContent').innerText()).split(expected+' pts').length>=3,'Blind Pairs and 2/3/4 totals must both match the fixture');
  // Group 1's cached session must never silently open Group 2.
  await page.evaluate(()=>showScreen('adminScreen'));
  await page.locator('#v2AdminLogout').click();
  await page.getByRole('button',{name:/Enter Scores/}).click();
  await page.locator('.group-button').nth(1).click();
  await page.locator('#v2Code').waitFor();
  await page.locator('#v2Close').click();
  const rotated=h.post({action:'issueGroupCredential',credential:h.admin,eventId:'v2-event',groupNo:1});
  assert.equal(rotated.ok,true);
  // Revocation invalidates the cached session and prompts for the new PIN.
  await page.locator('.group-button').first().click();
  await page.locator('#v2Code').fill(rotated.pin);
  await page.getByRole('button',{name:'Open group',exact:true}).click();
  await page.locator('#scoreScreen.active').waitFor();
  // Public leaderboard uses partial splits and keeps long names on one line.
  h.sheets.get('Players').rows[1][1]='A Very Long Test Player Name For Narrow Screens';
  await page.evaluate(()=>showScreen('homeScreen'));
  await page.getByRole('button',{name:/Live Leaderboard/}).click();
  await page.locator('#leaderboardTable').getByText(/B9 is partial through hole 15/).waitFor();
  assert.equal(await page.locator('#leaderboardTable .v2-table-name').first().evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.equal(await page.locator('#leaderboardTable').getByText('18-hole total',{exact:true}).count(),0);
  await checkLeaderboard(page,h,false);
  // Tapping a player name opens only the backend's public physical-hole projection.
  await page.locator('[data-scorecard-player="p1"] .v2-table-name').tap();
  let scorecard=page.locator('.v2-scorecard-dialog[open]');
  await scorecard.waitFor();
  assert.equal(await scorecard.locator('tbody tr').count(),15);
  assert.equal(await scorecard.locator('[data-hole="18"]').count(),0);
  assert.ok((await scorecard.innerText()).includes('Playing Handicap 1'));
  assert.ok((await scorecard.innerText()).includes('BLOB'));
  assert.ok((await scorecard.innerText()).includes('partial through hole 15'));
  assert.equal(await scorecard.evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'scorecard overflow');
  assert.equal(await scorecard.locator('.v2-scorecard-name').evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');
  await scorecard.getByRole('button',{name:'Back to leaderboard',exact:true}).tap();
  assert.equal(await page.locator('.v2-scorecard-dialog[open]').count(),0);
  assert.equal(await page.locator('[data-scorecard-player="p1"]').evaluate(el=>document.activeElement===el),true);
  // Keyboard access is equivalent to tapping the card, and Escape returns to the board.
  await page.locator('[data-scorecard-player="p1"]').press('Enter');
  await page.locator('.v2-scorecard-dialog[open]').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.v2-scorecard-dialog[open]').count(),0);
  // Complete synthetic scores through the real backend, then reveal through admin UI.
  for(let hole=1;hole<=18;hole++) {
    const saved=h.ctx.getScores('v2-event');
    const missing=Array.from({length:8},(_,i)=>i+1).filter(i=>!saved.some(s=>s.player_id==='p'+i&&s.hole===hole));
    if(missing.length)assert.equal(h.save({credential:h.admin,hole,scores:missing.map(i=>({playerId:'p'+i,status:'scored',gross:4,expectedRevision:0}))}).ok,true);
  }
  for(const groupNo of [1,2]) {
    assert.equal(h.post({action:'updatePinLeader',credential:h.admin,eventId:'v2-event',groupNo,hole:3,pinAction:'keep',expectedLeader:'p1'}).ok,true);
    assert.equal(h.post({action:'completeGroup',credential:h.admin,eventId:'v2-event',groupNo}).ok,true);
  }
  await page.evaluate(()=>showScreen('homeScreen'));
  await page.getByRole('button',{name:/Admin Setup/}).click();
  await page.locator('#adminPin').fill(h.properties.V2_ADMIN_SECRET);
  await page.getByRole('button',{name:'Login',exact:true}).click();
  await page.locator('#adminScreen.active').waitFor();
  await page.locator('#v2Reveal').click();
  await page.locator('#leaderboardScreen.active').waitFor();
  await page.locator('#leaderboardTable').getByText(/Final results/).waitFor();
  assert.ok((await page.locator('#leaderboardTable').innerText()).includes('Final results'));
  assert.ok(await page.locator('#leaderboardTable abbr[title="Incomplete (BLOB)"]').count()>0);
  assert.equal(h.ctx.v2Meta('v2-event').locked,true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await checkLeaderboard(page,h,true);
  // Row cell taps open complete, immutable post-reveal scorecards.
  await page.locator('[data-scorecard-player="p1"] td').first().tap();
  scorecard=page.locator('.v2-scorecard-dialog[open]');await scorecard.waitFor();
  assert.equal(await scorecard.locator('tbody tr').count(),18);
  assert.ok((await scorecard.innerText()).includes('Final scorecard'));
  assert.ok((await scorecard.innerText()).includes('18-hole total'));
  assert.ok((await scorecard.innerText()).includes('Incomplete (BLOB)'));
  assert.equal(await scorecard.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await scorecard.getByRole('button',{name:'Back to leaderboard',exact:true}).tap();
  await page.locator('#leaderboardScreen.active').waitFor();
  // Stress long names and three-digit totals without clipping any numeric columns.
  await page.evaluate(()=>renderLeaderboard(Array.from({length:12},(_,i)=>({
    player_id:'stress-'+i,name:'An Exceptionally Long Player Name '+i,revealed:false,
    total:{gross:123,stableford:123,holes:15,expected_holes:15,partial:true},
    front9:{stableford:63,partial:false},back9:{stableford:60,partial:true}
  }))));
  await checkTableGeometry(page,12);
  assert.deepEqual(await page.locator('.v2-leaderboard tbody tr').first().locator('td').allTextContents(),['123*','123*','63','60*']);
  assert.deepEqual(errors,[]);console.log('PASS '+name+': credential rejection, touch BLOB, corrections/reason/history, Finish/edit, compact table and scorecard layout');
  await context.close();
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),headless:true,args:['--no-sandbox']});
  try{for(const [name,size] of [['Small phone Chromium',{width:320,height:740}],['iPhone-sized Chromium',{width:390,height:844}],['Android-sized Chromium',{width:360,height:800}],['iPad-sized Chromium',{width:820,height:1180}]])await scenario(browser,name,size);}finally{await browser.close();}
  if(fs.existsSync(webkit.executablePath())){const safari=await webkit.launch({headless:true});try{await scenario(safari,'WebKit iPhone',{width:390,height:844});await scenario(safari,'WebKit iPad',{width:820,height:1180});}finally{await safari.close();}}
  else console.log('LIMITATION: WebKit runtime unavailable; physical Safari testing required.');
})().catch(e=>{console.error(e);process.exitCode=1;});
