// Stage 1 local fixture only. No Sites, Google or golf application requests.
const http=require('node:http'),fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const dir='dev/offline-feasibility/';
async function run(browser,label) {
  for(const blocked of [false,true]) {
    const server=http.createServer((req,res)=>{
      if(!(req.headers.cookie||'').includes('probe-owner=1')){res.writeHead(401,{'Content-Type':'text/html'});res.end('Sign in required');return;}
      if(req.url==='/offline-feasibility/index.html'){res.writeHead(308,{'Location':'/offline-feasibility/'});res.end();return;}
      const file=req.url==='/offline-probe-sw.js'?'offline-probe-sw.js':req.url==='/offline-feasibility/'?'index.html':req.url==='/offline-feasibility/probe.js'?'probe.js':null;
      if(blocked&&file!=='offline-probe-sw.js'&&(req.headers.referer||'').endsWith('/offline-probe-sw.js')){res.writeHead(403,{'Content-Type':'text/html'});res.end('Worker-context access denied');return;}
      if(req.url==='/golf-control.html'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<title>Main app control fixture</title>');return;}
      if(!file){res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':'text/html','Cache-Control':'public, max-age=0, must-revalidate'});res.end(fs.readFileSync(dir+file));
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin='http://127.0.0.1:'+server.address().port,url=origin+'/offline-feasibility/index.html';
    const context=await browser.newContext();
    try {
      let page=await context.newPage();const signedOut=await page.goto(url);assert.equal(signedOut.status(),401);
      await context.addCookies([{name:'probe-owner',value:'1',url:origin}]);
      await page.goto(url);
      assert.equal(await page.evaluate(async()=>{try{await fetch('/offline-feasibility/index.html',{redirect:'error'});return false;}catch(_){return true;}}),true,'canonical redirect must reproduce the original preflight rejection');
      await page.locator('#prepare').click();
      await page.waitForFunction(()=>/Prepared\.|Diagnostic failed/.test(document.getElementById('state').textContent),{},{timeout:35000});
      const report=JSON.parse(await page.locator('#report').innerText());
      if(blocked) {
        assert.ok((await page.locator('#state').innerText()).includes('failed'));
        assert.ok(report.checks.some(c=>c.phase==='install-failed'&&c.error.includes('403')),JSON.stringify(report));
        assert.ok(report.checks.some(c=>c.phase==='page-asset-preflight'&&c.status===200));
        console.log('PASS '+label+': worker-context access denial is reported, not labeled as an unexplained timeout');
      } else {
        assert.ok((await page.locator('#state').innerText()).startsWith('Prepared.'),JSON.stringify(report));
        await page.reload();await page.locator('#check').click();
        await page.waitForFunction(()=>document.getElementById('state').textContent.startsWith('PASS:'));
        const marker=JSON.parse(await page.locator('#report').innerText()).checks.at(-1).marker;
        await context.setOffline(true);await page.reload();await page.locator('#check').click();
        await page.waitForFunction(()=>document.getElementById('state').textContent.startsWith('PASS:'));
        await page.close();page=await context.newPage();await page.goto(url);await page.locator('#check').click();
        await page.waitForFunction(()=>document.getElementById('state').textContent.startsWith('PASS:'));
        const reopened=JSON.parse(await page.locator('#report').innerText()).checks.at(-1);
        assert.deepEqual(reopened.marker,marker);assert.equal(new URL(reopened.scope).pathname,'/offline-feasibility/');
        await context.setOffline(false);const control=await context.newPage();await control.goto(origin+'/golf-control.html');
        assert.equal(await control.evaluate(()=>navigator.serviceWorker.controller),null);
        await control.close();page.on('dialog',d=>d.accept());await page.locator('#cleanup').click();
        await page.waitForFunction(()=>document.getElementById('state').textContent.startsWith('Diagnostic removed.'));
        assert.equal(await page.evaluate(()=>caches.has('flaghunters-stage1-feasibility-v1')),false);
        console.log('PASS '+label+': protected fixture, narrow scope, install, offline reload, tab reopen, marker retention, cleanup');
      }
    }finally{await context.close();await new Promise(resolve=>server.close(resolve));}
  }
}
(async()=>{
  const chrome=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try{await run(chrome,'Chromium');}finally{await chrome.close();}
  if(fs.existsSync(webkit.executablePath())){const safari=await webkit.launch({headless:true});try{await run(safari,'WebKit');}finally{await safari.close();}}
  else console.log('LIMITATION: WebKit unavailable; this does not establish actual private-host or physical Safari feasibility.');
})().catch(error=>{console.error(error);process.exitCode=1;});
