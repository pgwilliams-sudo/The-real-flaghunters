const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root='dev/offline-feasibility/';
function worker({scope='/offline-feasibility/',badType=false,login=false}={}) {
  const handlers={},stored=new Map(),requests=[];let skipped=false,claimed=false;
  const cache={put:async(k,v)=>stored.set(k,v),match:async k=>stored.get(k)};
  const self={location:{origin:'https://probe.test'},registration:{scope:'https://probe.test'+scope},
    addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{skipped=true;},clients:{claim:async()=>{claimed=true;}}};
  const context={self,URL,Error,Request:class{constructor(path,options){this.url='https://probe.test'+path;this.options=options;}},
    caches:{open:async name=>{assert.equal(name,'flaghunters-stage1-feasibility-v1');return cache;}},
    fetch:async req=>{requests.push(req);return new Response(login?'<html>Sign in</html>':req.url.endsWith('.js')?'/* diagnostic only */':'<meta name="v2-stage1-probe" content="1">',
      {headers:{'content-type':badType?'text/html':req.url.endsWith('.js')?'text/javascript':'text/html'}});}};
  vm.runInNewContext(fs.readFileSync(root+'offline-probe-sw.js','utf8'),context);
  return {handlers,stored,requests,get skipped(){return skipped;},get claimed(){return claimed;}};
}
async function install(w){let promise;w.handlers.install({waitUntil:p=>promise=p});await promise;}
test('Stage 1 diagnostic scripts parse without changing the golf application',()=>{
  for(const name of ['probe.js','offline-probe-sw.js'])new vm.Script(fs.readFileSync(root+name,'utf8'));
  const source=fs.readFileSync(root+'probe.js','utf8');assert.doesNotMatch(source,/apiPost|apiGet|script\.google|localStorage|V2_ADMIN_SECRET|ScoringCredentials|saveHoleScores/);
});
test('probe installs only its own two assets with redirect rejection and a narrow scope',async()=>{
  const w=worker();await install(w);assert.equal(w.skipped,true);
  assert.deepEqual([...w.stored.keys()],['/offline-feasibility/index.html','/offline-feasibility/probe.js']);
  assert.ok(w.requests.every(r=>r.options.redirect==='error'&&r.options.cache==='no-store'&&r.options.credentials==='same-origin'));
  let activation;w.handlers.activate({waitUntil:p=>activation=p});await activation;assert.equal(w.claimed,true);
});
test('probe rejects application-wide scope, wrong worker assets and login fallback pages',async()=>{
  const broad=worker({scope:'/'});await assert.rejects(install(broad),/Refusing scope/);assert.equal(broad.requests.length,0);
  await assert.rejects(install(worker({badType:true})),/incorrect content type/);
  await assert.rejects(install(worker({login:true})),/authentication or fallback/);
});
test('worker serves cached diagnostic assets offline and never intercepts scores, sign-in or the app',async()=>{
  const w=worker();await install(w);
  let answer;w.handlers.fetch({request:{url:'https://probe.test/offline-feasibility/index.html',method:'GET'},respondWith:p=>answer=p});
  assert.ok((await (await answer).text()).includes('v2-stage1-probe'));
  for(const [url,method] of [['https://probe.test/','GET'],['https://probe.test/v2.js','GET'],['https://probe.test/signin-with-chatgpt','GET'],['https://script.google.com/macros/s/test/exec','POST'],['https://probe.test/offline-feasibility/index.html?secret=x','GET']]) {
    let intercepted=false;w.handlers.fetch({request:{url,method},respondWith:()=>intercepted=true});assert.equal(intercepted,false,url);
  }
});
