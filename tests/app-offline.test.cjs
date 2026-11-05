const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {IDBFactory}=require('fake-indexeddb');
test('offline prepared listing requires matching backend/event/group/credential and unexpired session; never loses pending scores',async()=>{
  const ctx={indexedDB:new IDBFactory()};vm.createContext(ctx);vm.runInContext(fs.readFileSync('v2-local.js','utf8'),ctx);const local=ctx.V2Local;
  const who={backend:'test',eventId:'round',groupNo:1,credentialId:'g1'};
  await local.prepare(who,{meta:{locked:false},event:{event_id:'round',tee:'White'},groups:[{player_id:'p1',group_no:1,snapshot_id:'h1'}],course:[],scores:[]});
  await local.saveDraft(who,{action:'saveHoleScores',eventId:'round',hole:18,scores:[{playerId:'p1',status:'pickup',gross:null,expectedRevision:0}]},'offline-operation-0001');
  assert.equal((await local.prepared('test',10)).length,0);
  await local.putSession('test','round',1,{token:'g2.token',credentialId:'g2',expires_at:100});assert.equal((await local.prepared('test',10)).length,0);
  await local.putSession('test','round',1,{token:'g1.token',credentialId:'g1',expires_at:100});assert.equal((await local.prepared('other',10)).length,0);
  assert.equal((await local.prepared('test',100)).length,0);const prepared=await local.prepared('test',99);assert.equal(prepared.length,1);assert.equal(prepared[0].event.tee,'White');
  await local.removeSession('test','round',1);assert.equal((await local.prepared('test',99)).length,0);assert.equal((await local.pending())[0].operationId,'offline-operation-0001');
});
function worker({login=false,badJs=false}={}){
  const handlers={},requests=[],deleted=[],stored=new Map();
  const cache={put:async(k,v)=>stored.set(k,v),match:async k=>stored.get(k)};
  const ctx={URL,Response:class {constructor(body,options){this.body=body;this.options=options;}},self:{location:{href:'https://private.test/v2-app-sw.js'},addEventListener:(name,handler)=>handlers[name]=handler},caches:{open:async()=>cache,keys:async()=>['diagnostic-cache','unrelated-cache','flaghunters-app:/:stage5-old'],delete:async name=>deleted.push(name)},fetch:async(url)=>{requests.push(url);return {ok:true,type:'basic',url,headers:{get:()=>url.endsWith('.js')?(badJs?'text/html':'text/javascript'):url.endsWith('.css')?'text/css':url.endsWith('.PNG')?'image/png':'text/html'},arrayBuffer:async()=>new ArrayBuffer(0),clone:()=>({text:async()=>login?'<h1>Sign in</h1>':'<script src="v2-offline.js"></script>'})};}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync('v2-app-sw.js','utf8'),ctx);return {handlers,requests,deleted,stored};
}
test('app worker intercepts only exact clean static GET URLs; diagnostic/auth/backend/private query requests pass through',async()=>{
  const w=worker();let install;w.handlers.install({waitUntil:p=>install=p});await install;assert.equal(w.stored.size,8);
  for(const [url,method,headers] of [['https://private.test/?credential=secret','GET',[]],['https://private.test/admin','GET',[]],['https://private.test/offline-feasibility/','GET',[]],['https://script.google.com/macros/s/test/exec','GET',[]],['https://private.test/','POST',[]],['https://private.test/v2.js','GET',['authorization']],['https://private.test/v2.js','GET',['range']]]){
    let intercepted=false;w.handlers.fetch({request:{url,method,headers:{has:k=>headers.includes(k)}},respondWith:()=>intercepted=true});assert.equal(intercepted,false,url);
  }
  let response;w.handlers.fetch({request:{url:'https://private.test/index.html',method:'GET',headers:{has:()=>false}},respondWith:p=>response=p});assert.ok(await response);
  let activation;w.handlers.activate({waitUntil:p=>activation=p});await activation;assert.deepEqual(w.deleted,['flaghunters-app:/:stage5-old']);
});
test('locked local message is consistent across server wording and interrupted uploads remain explicitly unconfirmed',()=>{
  const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('v2-recovery.js','utf8'),ctx);
  assert.equal(ctx.V2Recovery.message(Error('Results are permanently locked')),ctx.V2Recovery.message(Error('Final results are permanently locked')));
  assert.match(ctx.V2Recovery.message(Error('Results are permanently locked')),/no resubmission/);
  assert.match(ctx.V2Recovery.message(new TypeError('Load failed')),/acceptance is unconfirmed/);
});

test('authentication HTML and mislabeled script responses fail installation before any cache publication',async()=>{
  for(const options of [{login:true},{badJs:true}]){const w=worker(options);let promise;w.handlers.install({waitUntil:p=>promise=p});await assert.rejects(promise,/Not the golf app shell|Unexpected asset type/);assert.equal(w.stored.size,0);}
});
