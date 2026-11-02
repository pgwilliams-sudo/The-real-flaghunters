const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
function harness() {
  const sheets=new Map(),properties={V2_ENABLED:'true',V2_TEST_ONLY:'true',V2_SPREADSHEET_ID:'synthetic-test-only',V2_ADMIN_SECRET:'synthetic-test-admin-secret-not-real'};
  let lock=false, writes=0, fault=null;
  function write(name,fn){writes++;if(fault&&fault.n===writes&&fault.when==='before')throw Error('Injected failure before '+name);fn();if(fault&&fault.n===writes&&fault.when==='after')throw Error('Injected failure after '+name);}
  class Sheet {
    constructor(name){this.name=name;this.rows=[];this.maxCols=26;}
    appendRow(row){write(this.name,()=>this.rows.push([...row]));return this;}
    getDataRange(){return {getValues:()=>this.rows.map(r=>[...r])};}
    getRange(row,col,n=1,m=1){const sh=this;return {getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>sh.rows[row+i-1]?.[col+j-1]??'')),setValues:values=>{write(sh.name,()=>{values.forEach((r,i)=>r.forEach((v,j)=>{sh.rows[row+i-1] ||= [];sh.rows[row+i-1][col+j-1]=v;}));});return this;},setValue:value=>{write(sh.name,()=>{sh.rows[row-1] ||= [];sh.rows[row-1][col-1]=value;});return this;}};}
    getMaxColumns(){return this.maxCols;}
    getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length));}
    getLastRow(){return this.rows.length;}
    insertColumnsAfter(_,n){write(this.name,()=>{this.maxCols+=n;});}
    deleteRow(row){write(this.name,()=>this.rows.splice(row-1,1));}
  }
  const ss={getSheetByName:name=>sheets.get(name)||null,insertSheet:name=>{const sh=new Sheet(name);sheets.set(name,sh);return sh;}};
  function seed(name,rows){const sh=new Sheet(name);sh.rows=structuredClone(rows);sheets.set(name,sh);}
  seed('Players',[['player_id','name','active','handicap_index'],...Array.from({length:8},(_,i)=>['p'+(i+1),'Player '+(i+1),true,i+1])]);
  seed('Events',[['event_id','date','course','tee','status','completed'],['v2-event','2026-11-02','Brickendon Grange','White','active',false],['legacy-event','2025-01-01','Brickendon Grange','White','complete',true]]);
  seed('Groups',[['event_id','group_no','player_id','playing_handicap','scorer','start_hole','handicap_index','handicap_confirmed'],...Array.from({length:8},(_,i)=>['v2-event',i<4?1:2,'p'+(i+1),i+1,i%4===0,1,i+1,false])]);
  seed('Scores',[['event_id','player_id','hole','gross','net','stableford','blob','birdie','eagle','timestamp']]);
  seed('Course',[['course','tee','hole','par','stroke_index','yards','slope','course_rating'],...Array.from({length:18},(_,i)=>['Brickendon Grange','White',i+1,i===2?3:4,i+1,350,113,71])]);
  const cache=new Map();
  const context={console,CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]??null})},
    Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()],formatDate:date=>date.toISOString().slice(0,10)},
    Session:{getScriptTimeZone:()=> 'Europe/London'},
    SpreadsheetApp:{openById:id=>{if(id!=='synthetic-test-only')throw Error('No network / real spreadsheet permitted');return ss;},flush:()=>write('flush',()=>{})},
    LockService:{getScriptLock:()=>({waitLock:()=>{if(lock)throw Error('Nested lock');lock=true;},releaseLock:()=>{lock=false;}})},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})}};
  vm.createContext(context);
  for(const name of ['backend/Code.gs','backend/Phase1.gs'])vm.runInContext(fs.readFileSync(name,'utf8'),context,{filename:name});
  context.initializeV2TestSchema();context.v2SnapshotEvent('v2-event');context.v2AfterGroupSave('v2-event');
  function post(data){return context.doPost({postData:{contents:JSON.stringify(data)}});}
  const admin=post({action:'adminLogin',pin:properties.V2_ADMIN_SECRET});if(!admin.ok)throw Error(admin.error);
  const groupPin=post({action:'issueGroupCredential',credential:admin.token,eventId:'v2-event',groupNo:1});
  const group2Pin=post({action:'issueGroupCredential',credential:admin.token,eventId:'v2-event',groupNo:2});
  const group=post({action:'openGroup',eventId:'v2-event',groupNo:1,pin:groupPin.pin});
  const group2=post({action:'openGroup',eventId:'v2-event',groupNo:2,pin:group2Pin.pin});
  for(const [no,token] of [[1,group.token],[2,group2.token]]) {
    const confirmed=post({action:'confirmGroupHandicaps',credential:token,eventId:'v2-event',groupNo:no,handicaps:Array.from({length:4},(_,i)=>({player_id:'p'+((no-1)*4+i+1),handicap_index:i+1}))});if(!confirmed.ok)throw Error(confirmed.error);
  }
  writes=0;
  return {ctx:context,post,sheets,properties,admin:admin.token,groupPin:groupPin.pin,group2Pin:group2Pin.pin,cache,group:group.token,group2:group2.token,
    fault(n,when){writes=0;fault={n,when};},clearFault(){fault=null;writes=0;},get writes(){return writes;},
    save(overrides={}){return post({action:'saveHoleScores',credential:group.token,eventId:'v2-event',hole:1,operationId:crypto.randomUUID(),scores:[{playerId:'p1',status:'pickup',gross:null,expectedRevision:0}],...overrides});}};
}
module.exports={harness};
