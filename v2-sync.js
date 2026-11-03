/* Foreground ordered outbox. No service worker or background execution required. */
((root)=>{
  'use strict';
  function retryable(error) {
    return error.name==='TypeError'||error.name==='SyntaxError'||error.name==='AbortError'||error.retryable===true||
      /timeout|timed out|try again|lock.*(busy|acquir)|service unavailable|too many times|HTTP (408|429|5\d\d)/i.test(error.message);
  }
  function create({local,transport,credential,onChange=async()=>{},now=()=>Date.now(),
    schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id),timeout=25000,owner,
    backend}) {
    const running=new Map(),timers=new Map(),requested=new Set();let stopped=false;
    owner ||= root.crypto.randomUUID?root.crypto.randomUUID():Array.from(root.crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join('');
    const stream=d=>JSON.stringify([d.identity.backend,d.identity.eventId,d.identity.groupNo]);
    function later(key,ms) {
      if(timers.has(key))cancel(timers.get(key));
      timers.set(key,schedule(()=>{timers.delete(key);void kick().catch(()=>{});},ms));
    }
    async function request(data) {
      const controller=new AbortController();
      let timer;
      try {
        // Timeout bounds the lease; a server may still commit after an interrupted upload.
        return await Promise.race([transport(data,{signal:controller.signal}),new Promise((_,reject)=>{
          timer=schedule(()=>{controller.abort();const e=Error('Upload timed out; acceptance unconfirmed');e.retryable=true;reject(e);},timeout);
        })]);
      }finally{if(timer!==undefined)cancel(timer);}
    }
    async function drain(first,force,review) {
      const who=first.identity,key=stream(first);
      if(!await local.lease(who,owner,now())){later(key,60000);return;}
      try {
        while(!stopped) {
          const d=(await local.pending({backend:who.backend,eventId:who.eventId,groupNo:who.groupNo}))[0];
          if(!d)return;
          // Stage 2 used needs-review for network failures too. Resume only known
          // transport failures, never legacy conflicts/locks/authentication errors.
          if(d.status==='needs-review'&&d.syncFailures===undefined&&/^(Load failed|Failed to fetch|NetworkError.*)$/i.test(d.lastError||'')) {
            await local.problem(d.operationId,d.lastError,{retryable:true});d.status='local';
          }
          const credentialBlocked=/^(Original scoring credential unavailable|Scoring credential invalid or expired)/i.test(d.lastError||'');
          if(d.status==='needs-review'&&!review&&!credentialBlocked)return;
          if(!force&&(d.syncFailures||0)>=5)return;
          if(!force&&d.nextAttemptAt>now()){later(key,d.nextAttemptAt-now());return;}
          if(force){await local.noteFailure(d.operationId,0);d.syncFailures=0;}
          force=false;review=false;
          if(!await local.lease(who,owner,now()))return;
          try {
            const auth=await credential(d.identity);
            if(!auth?.token)throw Error('Original scoring credential unavailable or expired; retain/export for review');
            if(d.attempts>0||auth.token.split('.')[0]!==d.identity.credentialId) {
              await local.markSending(d.operationId,false);await onChange(d);
              const status=await request({...d.request,action:'operationStatus',groupNo:who.groupNo,operationId:d.operationId,credential:auth.token});
              if(status.state==='COMMITTED') {
                await local.accept(d.operationId,status.result?.scores);await onChange(d);continue;
              }
              if(status.state!=='ABSENT')throw Error('Operation status is unconfirmed; retain for review');
            }
            if(auth.token.split('.')[0]!==d.identity.credentialId)throw Error('Original scoring credential unavailable; no submission under a different identity');
            if(!await local.lease(who,owner,now()))return;
            await local.markSending(d.operationId);await onChange(d);
            const result=await request({...d.request,operationId:d.operationId,credential:auth.token});
            await local.accept(d.operationId,result.scores);await onChange(d);
          }catch(error) {
            const fresh=await local.getDraft(d.operationId);
            if(fresh?.status==='accepted')continue;
            const transient=retryable(error),failures=(fresh?.syncFailures||0)+1;
            const delay=Math.min(30000,1000*2**Math.min(failures-1,5));
            // Bounded retry burst. Every record remains available to manual Retry/resume.
            await local.problem(d.operationId,error.message,{retryable:transient,nextAttemptAt:now()+delay});
            await local.noteFailure(d.operationId,failures);
            await onChange(d,error);
            if(transient&&failures<5)later(key,delay);
            return; // Never overtake an ambiguous or rejected earlier operation.
          }
        }
      }finally{await local.lease(who,owner,now(),true);}
    }
    async function kick({force=false,review=false}={}) {
      if(stopped)return;
      const pending=await local.pending({backend}),groups=new Map();
      for(const d of pending)if(!groups.has(stream(d)))groups.set(stream(d),d);
      await Promise.all([...groups].map(([key,first])=>{
        if(running.has(key)){requested.add(key);return running.get(key);}
        if(force&&timers.has(key)){cancel(timers.get(key));timers.delete(key);}
        const task=drain(first,force,review).finally(()=>{running.delete(key);if(requested.delete(key)&&!stopped)void kick().catch(()=>{});});running.set(key,task);return task;
      }));
    }
    return {kick,stop(){stopped=true;for(const timer of timers.values())cancel(timer);timers.clear();}};
  }
  root.V2Sync={create,retryable};
})(globalThis);
