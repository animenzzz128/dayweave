const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const C=require('../src/core.cjs'),P=require('../src/phase2.cjs'),PL=require('../src/planner.cjs'),A=require('../src/approvals.cjs'),G=require('../src/google.cjs'),{Store}=require('../src/store.cjs'),{createServer}=require('../src/server.cjs');
const TZ='America/New_York',FIELDS=[...G.REQUIRED,'location','id','extendedProperties.private'];
// Fictional Google snapshot relative to the real clock, a todo and a generated plan; returns the todo's focus block.
function setup(s){C.configure(TZ);const real=Date.now(),today=C.dayKey(real),tomorrow=PL.nextDay(today),d=structuredClone(require('../examples/google-snapshot.json'));
 d.generatedAt=new Date(real-60000).toISOString();d.calendarCoverage={...d.calendarCoverage,start:C.zonedISO(today,'00:00'),end:C.zonedISO(PL.nextDay(PL.nextDay(tomorrow)),'00:00'),checkedAt:d.generatedAt};
 d.events=[];d.proposals=[];d.assignments=[];d.email={enabled:false};s.importSnapshot(d);
 const t=s.saveTodo({title:'Synthetic essay plan',dueAt:null,durationMinutes:60}).todo;s.generatePlan(tomorrow);const p=s.snapshot().proposals.find(x=>x.sourceRefs?.[0]?.id===t.id);
 const q=A.prepare(s,[p.id]);return {d:s.snapshot(),p,q,t,tomorrow,k:G.key(s.storeId(),p)};}
const ok=q=>({channel:'chat',text:'Approve '+q.reference,at:new Date().toISOString()});
const liveRead=(d,p,extra={})=>({checkedAt:new Date().toISOString(),provider:'google',account:p.account,calendars:d.calendarCoverage.calendars.map(c=>c.id),complete:true,start:new Date(Date.parse(p.start)-3600000).toISOString(),end:new Date(Date.parse(p.end)+3600000).toISOString(),events:[],...extra});
const saved=(p,k,extra={})=>({id:k,calendarId:p.calendarId,status:'confirmed',summary:p.title,description:G.description(p,k),start:{dateTime:p.start,timeZone:p.timezone},end:{dateTime:p.end,timeZone:p.timezone},transparency:'opaque',reminders:{useDefault:false,overrides:[{method:'popup',minutes:p.reminderMinutes}]},extendedProperties:{private:{dayweaveAction:p.id,dayweaveKey:k}},...extra});
const withStore=fn=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-gexec-')),s=new Store(dir);try{return fn(s,dir);}finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}};

test('scope and mapping: one-time personal creates only, every approved field mapped, no attendees, invitations or meetings',()=>withStore(s=>{
 const {d,p,k}=setup(s),m=G.toGoogle(p,k,FIELDS);
 a.deepEqual(Object.keys(m).sort(),['calendarId','event','sendUpdates']);a.equal(m.sendUpdates,'none');a.equal(m.calendarId,p.calendarId);
 a.deepEqual(m.event,{summary:p.title,description:p.body+'\n\nDayweave action: '+p.id+' · key '+k,start:{dateTime:p.start,timeZone:TZ},end:{dateTime:p.end,timeZone:TZ},transparency:'opaque',reminders:{useDefault:false,overrides:[{method:'popup',minutes:10}]},id:k,extendedProperties:{private:{dayweaveAction:p.id,dayweaveKey:k}}});
 a.equal('id' in G.toGoogle(p,k,G.REQUIRED).event,false,'optional guards only when the connector supports them');
 a.match(k,/^d0[0-9a-f]{30}$/);a.equal(G.key(s.storeId(),p),k,'deterministic');a.notEqual(G.key('another-store',p),k,'bound to the store');
 a.deepEqual(G.actionErrors(p,d),[]);
 for(const [edit,re] of [[{action:'update',remoteRef:'x',before:{}},/Only new personal events/],[{recurrence:{frequency:'daily',interval:1,count:3}},/Recurring/],[{attendees:['someone@example.com']},/Attendees/],[{calendarId:'course-schedule@example.com'},/owner access/],[{provider:undefined},/Not a Google/]])a.match(G.actionErrors({...p,...edit},d).join(' '),re);
 a.match(P.errors({...p,action:'update'},d).join(' '),/only create new personal events/);a.match(P.errors({...p,recurrence:{frequency:'daily',interval:1,count:2}},d).join(' '),/one-time events/);
 a.equal(P.spec(p).sourceRefs[0].kind,'todo');a.notEqual(P.fingerprint(p),P.fingerprint({...p,sourceRefs:[{kind:'todo',id:'other',version:1}]}),'source task refs are part of the fingerprint');
 a.deepEqual(G.required({...p,location:'Library'}).slice(-1),['location'],'a non-empty location must be settable');
}));

test('verify needs the human chat approval of the exact Q-number, connector field support and an unchanged eligible version',()=>withStore(s=>{
 const {p,q}=setup(s),go=G.verify(s,q.reference,ok(q),FIELDS);a.equal(go.go,true,JSON.stringify(go));a.equal(go.actions[0].request.event.summary,p.title);a.deepEqual(go.actions[0].sourceRefs,p.sourceRefs);
 const n=Number(q.reference.slice(2));
 for(const [ap,re] of [[undefined,/Record the human chat approval/],['Approve '+q.reference,/Record the human chat approval/],[{...ok(q),channel:'web'},/own chat message/],[{...ok(q),text:'Approve Q-'+(n+10)},/must say/],[{...ok(q),text:'approve '+q.reference+'0'},/must say/],[{...ok(q),text:'Looks fine'},/must say/],[{...ok(q),at:'2020-01-01T00:00:00Z'},/after the version was prepared/],[{...ok(q),at:new Date(Date.now()+3600000).toISOString()},/not in the future/]]){
  const v=G.verify(s,q.reference,ap,FIELDS);a.equal(v.go,false);a.match(v.blockers.join(' '),re);}
 a.match(G.verify(s,q.reference,ok(q),undefined).blockers.join(' '),/fields the connector can set/);
 const missing=G.verify(s,q.reference,ok(q),FIELDS.filter(f=>f!=='reminders.overrides'));a.equal(missing.go,false);a.match(missing.actions[0].errors.join(' '),/cannot set approved fields \(reminders\.overrides\)\. Stop rather than drop them/);
 A.edit(s,p.id,{title:'Changed after approval'});const v=G.verify(s,q.reference,ok(q),FIELDS);a.equal(v.go,false);a.match(v.blockers.join(' '),/invalidated/);a.match(v.actions[0].errors.join(' '),/changed since this version was prepared/);
}));

test('the live re-read must be fresh, complete, same identity and conflict/duplicate free',()=>withStore(s=>{
 const {d,p,q,k}=setup(s),r=x=>G.recheck(s,q.reference,p.id,liveRead(d,p,x));a.equal(r({}).go,true);
 const at=(h,m=0)=>new Date(Date.parse(p.start)+h*3600000+m*60000).toISOString();
 for(const [x,re] of [[{checkedAt:new Date(Date.now()-16*60000).toISOString()},/15 minutes/],[{account:'other@example.com'},/different provider or account/],[{calendars:[p.calendarId]},/every calendar/],[{complete:false},/incomplete/],[{start:at(0,10)},/does not cover/],[{events:undefined},/no event list/],
  [{events:[{id:'class',summary:'Class',calendarId:'course-schedule@example.com',start:{dateTime:at(0,30)},end:{dateTime:at(2)}}]},/Conflicts with Class/],
  [{events:[{id:'holiday',summary:'Holiday',start:{date:C.dayKey(p.start)},end:{date:PL.nextDay(C.dayKey(p.start))}}]},/Conflicts with Holiday/],
  [{events:[{id:'old',summary:'x',description:'Dayweave action: '+p.id,start:at(5),end:at(6)}]},/matching event already exists \(old\)/],
  [{events:[{id:'old',summary:'x',extendedProperties:{private:{dayweaveAction:p.id}},start:at(5),end:at(6)}]},/reconcile instead of writing/],
  [{events:[{id:'same',summary:p.title,start:p.start,end:p.end}]},/matching event already exists \(same\)/]]){const v=r(x);a.equal(v.go,false,JSON.stringify(x).slice(0,60));a.match(v.errors.join(' '),re);}
 a.equal(r({events:[{id:'free',summary:'Free',transparency:'transparent',start:p.start,end:p.end},{id:'gone',summary:'Gone',status:'cancelled',start:p.start,end:p.end}]}).go,true,'free and cancelled events do not block');
 a.equal(r({events:[{id:'adj',summary:'Adjacent',start:p.end,end:at(3)}]}).go,true,'adjacent events do not conflict');
}));

test('pending is recorded only after verify and recheck pass; it binds the exact target, source refs and key; no second attempt',()=>withStore(s=>{
 const {d,p,q,k}=setup(s);
 a.throws(()=>G.pending(s,q.reference,p.id,ok(q),FIELDS,liveRead(d,p,{complete:false})),/Do not write: .*incomplete/);a.equal(s.snapshot().actionHistory.length,0);
 a.throws(()=>A.record(s,{reference:q.reference,id:p.id,status:'pending',recordedAt:new Date().toISOString(),humanApproval:'Approve '+q.reference}),/human chat approval/,'a bare string is not enough for Google');
 const r=G.pending(s,q.reference,p.id,ok(q),FIELDS,liveRead(d,p));a.equal(r.status,'pending');a.deepEqual(r.write,G.toGoogle(p,k,FIELDS));
 const h=s.snapshot().actionHistory.find(x=>x.id===p.id);
 a.deepEqual({status:h.status,reference:h.reference,provider:h.provider,account:h.account,calendarId:h.calendarId,sourceRefs:h.sourceRefs,minutes:h.minutes,key:h.idempotencyKey,store:h.store,fingerprint:h.fingerprint},{status:'pending',reference:q.reference,provider:'google',account:p.account,calendarId:p.calendarId,sourceRefs:p.sourceRefs,minutes:60,key:k,store:s.storeId(),fingerprint:P.fingerprint(p)});
 a.deepEqual(h.fieldsUsed,['id','extendedProperties.private']);a.equal(h.humanApproval.text,'Approve '+q.reference);a.equal(A.read(s,q.reference).status,'pending');
 a.throws(()=>G.pending(s,q.reference,p.id,ok(q),FIELDS,liveRead(d,p)),/Do not write: .*already attempted/,'no blind retry');
}));

test('read-back records executed only when every approved field matches; any difference is unverified and kept',()=>withStore(s=>{
 const {d,p,q,k}=setup(s);a.throws(()=>G.readback(s,q.reference,p.id,saved(p,k)),/Record pending before a read-back/);G.pending(s,q.reference,p.id,ok(q),FIELDS,liveRead(d,p));
 for(const [x,re] of [[{reminders:{useDefault:true}},/reminder/],[{attendees:[{email:'guest@example.com'}]},/attendees present/],[{description:p.body},/description/],[{start:{dateTime:new Date(Date.parse(p.start)+60000).toISOString()}},/start time/],[{transparency:'transparent'},/busy state/],[{calendarId:'other@example.com'},/calendarId/],[{hangoutLink:'https://meet.example.com/x'},/online meeting/],[{extendedProperties:{}},/extended properties/]])
  a.match(G.compare(p,k,saved(p,k,x),G.toGoogle(p,k,['id','extendedProperties.private'])).join(' '),re);
 const bad=G.readback(s,q.reference,p.id,saved(p,k,{location:'Somewhere else'}));a.equal(bad.status,'unverified');a.match(s.snapshot().actionHistory[0].evidence,/location differs.*Human resolution required/);a.equal(A.read(s,q.reference).status,'unverified');
 const good=G.readback(s,q.reference,p.id,saved(p,k));a.equal(good.status,'executed');const h=s.snapshot().actionHistory[0];
 a.equal(h.remoteRef,p.calendarId+'/'+k);a.ok(h.verifiedAt);a.match(h.evidence,/every approved field matched/);a.deepEqual(h.attempts.map(x=>x.status),['pending','unverified']);a.equal(h.humanApproval.text,'Approve '+q.reference,'approval evidence survives later states');
 a.equal(A.read(s,q.reference).status,'executed');a.throws(()=>G.readback(s,q.reference,p.id,saved(p,k)),/current: executed/);
 a.equal(remainingIds(s).includes(p.id),false);
}));
const remainingIds=s=>s.snapshot().proposals.filter(p=>!s.snapshot().actionHistory.some(h=>h.id===p.id&&['executed','pending','unverified'].includes(h.status))).map(p=>p.id);

test('reconciliation: unknown stays unverified, absence needs a complete fresh search and a new version, ambiguity needs a human',()=>withStore(s=>{
 const {d,p,q,k}=setup(s);G.pending(s,q.reference,p.id,ok(q),FIELDS,liveRead(d,p));
 let r=G.reconcile(s,q.reference,p.id,liveRead(d,p,{complete:false}));a.equal(r.conclusion,'unknown');a.equal(s.snapshot().actionHistory[0].status,'unverified');
 r=G.reconcile(s,q.reference,p.id,liveRead(d,p,{events:[saved(p,k,{id:'a1'}),saved(p,k,{id:'a2'})]}));a.equal(r.conclusion,'ambiguous');a.deepEqual(r.matches,['a1','a2']);a.equal(s.snapshot().actionHistory[0].status,'unverified');
 r=G.reconcile(s,q.reference,p.id,liveRead(d,p));a.equal(r.status,'not_created');a.match(s.snapshot().actionHistory[0].evidence,/found no event/);a.equal(A.read(s,q.reference).status,'failed');
 a.throws(()=>G.pending(s,q.reference,p.id,ok(q),FIELDS,liveRead(d,p)),/failed and cannot be executed/,'a retry needs a new approved version');
 const q2=A.prepare(s,[p.id]);a.notEqual(q2.reference,q.reference);G.pending(s,q2.reference,p.id,ok(q2),FIELDS,liveRead(d,p));
 r=G.reconcile(s,q2.reference,p.id,liveRead(d,p,{events:[saved(p,k)]}));a.equal(r.status,'executed');a.equal(r.conclusion,'one match read back');
}));

test('executed receipts keep covering their todo after the proposal leaves the snapshot; no web route can execute or record',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-gexec-web-')),srv=A.attach(createServer(dir));await new Promise(r=>srv.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+srv.address().port,s=srv.store;
 try{const {d,p,q,k,tomorrow,t}=setup(s);G.pending(s,q.reference,p.id,ok(q),FIELDS,liveRead(d,p));G.readback(s,q.reference,p.id,saved(p,k));
  const failed=structuredClone(s.snapshot());failed.sources.find(x=>x.id==='google-calendar').status='failed';s.importSnapshot(failed);a.equal(s.snapshot().proposals.length,0);
  const back=structuredClone(failed);back.sources.find(x=>x.id==='google-calendar').status='ok';back.calendarCoverage={...d.calendarCoverage,checkedAt:new Date().toISOString()};back.generatedAt=new Date().toISOString();s.importSnapshot(back);
  const plan=s.generatePlan(tomorrow);a.equal(plan.blocks.some(b=>b.sourceRefs[0].id===t.id),false);a.match(plan.unscheduled.find(u=>u.id===t.id).reason,/Already covered by 60 minutes/);
  const session=await fetch(base+'/api/session'),cookie=session.headers.get('set-cookie').split(';')[0],csrf=(await session.json()).csrf,h={Cookie:cookie,'Content-Type':'application/json',Origin:base,'x-dayweave-token':csrf};
  for(const route of ['approvals/execute','approvals/record','receipts','google/write','calendar/events'])a.equal((await fetch(base+'/api/'+route,{method:'POST',headers:h,body:JSON.stringify({reference:q.reference,id:p.id,status:'executed'})})).status,404,route);
  a.equal((await fetch(base+'/api/progress',{method:'POST',headers:h,body:JSON.stringify({kind:'receipts',id:p.id,value:{}})})).status,400);
 }finally{await new Promise(r=>srv.close(r));fs.rmSync(dir,{recursive:true,force:true});}});

test('operator CLI verifies and reports without writing; usage errors exit non-zero',()=>withStore((s,dir)=>{
 const {q}=setup(s);s.close();const f=(n,v)=>{const x=path.join(dir,n);fs.writeFileSync(x,JSON.stringify(v));return x;},run=(...args)=>{try{return {code:0,out:execFileSync(process.execPath,['scripts/google-calendar.cjs',...args],{env:{...process.env,DAYWEAVE_DATA_DIR:dir},encoding:'utf8',stdio:'pipe'})};}catch(e){return {code:e.status,out:e.stdout,err:e.stderr};}};
 let r=run('verify',q.reference,f('a.json',ok(q)),f('f.json',FIELDS));a.equal(r.code,0,r.err);a.equal(JSON.parse(r.out).go,true);
 r=run('verify',q.reference,f('b.json',{...ok(q),text:'ok'}),f('f.json',FIELDS));a.equal(r.code,1);a.equal(JSON.parse(r.out).go,false);
 r=run('status',q.reference);a.equal(r.code,0);a.equal(JSON.parse(r.out).receipts[0].status,'not attempted');
 r=run('launch');a.equal(r.code,1);a.match(r.err,/Usage/);
 const again=new Store(dir);try{a.equal(again.snapshot().actionHistory.length,0,'verify and status record nothing');}finally{again.close();}
 s.open();
}));

test('page-order scripts show prepared, pending, unverified and executed receipts with evidence and source IDs',async()=>{
 let D,S,V;withStore(s=>{const {d,p,q,k}=setup(s);G.pending(s,q.reference,p.id,{...ok(q),text:'Approve '+q.reference+' <b>now</b>'},FIELDS,liveRead(d,p));D=s.snapshot();S=s.state();V=A.list(s);
  D.__executed=(()=>{G.readback(s,q.reference,p.id,saved(p,k,{reminders:{useDefault:true}}));return {d:s.snapshot(),v:A.list(s)};})();G.readback(s,q.reference,p.id,saved(p,k));D.__final={d:s.snapshot(),v:A.list(s)};});
 const order=[...fs.readFileSync('src/web/index.html','utf8').matchAll(/<script src="\/([\w.]+)"><\/script>/g)].map(m=>m[1]),files={'core.js':'src/core.cjs','phase2.js':'src/phase2.cjs','phase3.js':'src/phase3.cjs','effort.js':'src/effort.cjs','workload.js':'src/workload.cjs','email.js':'src/email.cjs','app.js':'src/web/app.js'};
 const nodes=new Map(),node=k=>{if(!nodes.has(k))nodes.set(k,{textContent:'',innerHTML:''});return nodes.get(k);};let snap=D,versions=V;
 const ctx=vm.createContext({URL,URLSearchParams,Date,Intl,console,encodeURIComponent,window:{addEventListener(){}},document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}},location:{pathname:'/review',search:''},history:{pushState(){}},fetch:async url=>({ok:true,json:async()=>url.endsWith('session')?{csrf:'t'}:url.includes('approvals')?versions:{snapshot:snap,progress:S}})});
 for(const f of order)vm.runInContext(fs.readFileSync(files[f],'utf8'),ctx,{filename:files[f]});await new Promise(r=>setImmediate(r));
 let html=node('#page').innerHTML;a.match(html,/<h2>In progress<\/h2>/);a.match(html,/data-status="pending"/);a.match(html,/Pending · write started or outcome not yet read back/);a.match(html,/Source: todo todo-[0-9a-f]+ v1/);a.match(html,/Approve Q-\d+ &lt;b&gt;now&lt;\/b&gt;/);a.doesNotMatch(html,/<b>now/);a.match(html,/It never writes to a calendar/);
 snap=D.__executed.d;versions=D.__executed.v;await vm.runInContext('render()',ctx);html=node('#page').innerHTML;a.match(html,/data-status="unverified"/);a.match(html,/reminder differs/);
 snap=D.__final.d;versions=D.__final.v;ctx.location.search='?tab=history';await vm.runInContext('render()',ctx);html=node('#page').innerHTML;
 a.match(html,/data-status="executed"/);a.match(html,/Executed · read back and verified/);a.match(html,/remote event student@example\.com\/d0[0-9a-f]{30}/);a.match(html,/key d0[0-9a-f]{30}/);a.match(html,/Earlier states \(2\)/);a.match(html,/every approved field matched/);
});
