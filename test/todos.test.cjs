const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const C=require('../src/core.cjs'),P=require('../src/phase2.cjs'),PL=require('../src/planner.cjs'),A=require('../src/approvals.cjs'),{Store}=require('../src/store.cjs'),{createServer}=require('../src/server.cjs');
const TZ='America/New_York';
// Fresh fictional Google snapshot relative to the real clock: complete coverage from today through three days ahead.
function fresh(){C.configure(TZ);const real=Date.now(),today=C.dayKey(real),tomorrow=PL.nextDay(today),d=structuredClone(require('../examples/google-snapshot.json'));
 d.generatedAt=new Date(real-60000).toISOString();d.calendarCoverage={...d.calendarCoverage,start:C.zonedISO(today,'00:00'),end:C.zonedISO(PL.nextDay(PL.nextDay(PL.nextDay(tomorrow))),'00:00'),checkedAt:d.generatedAt};
 d.events=[{...d.events[0],start:C.zonedISO(tomorrow,'13:00'),end:C.zonedISO(tomorrow,'14:00')}];d.proposals=[];
 d.assignments=d.assignments.map(x=>({...x,dueAt:x.dueAt?C.zonedISO(PL.nextDay(PL.nextDay(tomorrow)),'17:00'):null}));
 d.email={...d.email,checkedAt:d.generatedAt,request:{...d.email.request,from:new Date(real-7*86400000).toISOString(),to:d.generatedAt},messages:d.email.messages.map((m,i)=>({...m,receivedAt:new Date(real-(i+1)*3600000).toISOString()}))};
 return {d,today,tomorrow};}
const withStore=fn=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-todo-')),s=new Store(dir);try{return fn(s);}finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}};
const input=(extra={})=>({title:'Read chapter 3',dueAt:null,durationMinutes:45,notes:'',...extra});

test('todos need an explicit title, due decision and whole-minute duration; only the dedicated methods write them',()=>withStore(s=>{
 s.importSnapshot(fresh().d);
 for(const [bad,re] of [[{title:' '},/title/],[{dueAt:undefined},/Confirm a due date/],[{dueAt:'2026-10-20T10:00'},/valid date/],[{durationMinutes:0},/5–600/],[{durationMinutes:30.5},/5–600/],[{durationMinutes:601},/5–600/],[{durationMinutes:'45'},/5–600/],[{notes:{x:1}},/Notes/],[{origin:{type:'imported'}},/origin/]]){
  const x=input(bad);if('dueAt' in bad&&bad.dueAt===undefined)delete x.dueAt;a.throws(()=>s.saveTodo(x),re,JSON.stringify(bad));}
 a.throws(()=>s.saveState('todo','x',input()),/Invalid progress field/);a.throws(()=>s.saveState('plan','2026-10-14',{}),/Invalid progress field/);
 const {todo}=s.saveTodo(input({dueAt:'2026-10-20T14:00:00Z'}));a.match(todo.id,/^todo-[0-9a-f]{12}$/);a.equal(todo.version,1);a.equal(todo.status,'open');a.deepEqual(todo.origin,{type:'manual'});
 const edited=s.saveTodo({...input({title:'Read chapter 4',dueAt:null,durationMinutes:60}),id:todo.id}).todo;a.equal(edited.version,2);a.equal(edited.createdAt,todo.createdAt);a.equal(edited.dueAt,null);
 a.throws(()=>s.saveTodo({...input(),id:'todo-missing'}),/Unknown todo/);
 s.completeTodo(todo.id,true);a.throws(()=>s.saveTodo({...input(),id:todo.id}),/Reopen/);a.equal(s.state().todo[todo.id].status,'done');s.completeTodo(todo.id,false);a.equal(s.state().todo[todo.id].completedAt,null);
 a.equal(s.migrateProgress({todo:{x:input()}}),true);a.equal(Object.keys(s.state().todo).length,1,'legacy progress import never writes todos');
}));

test('email adoption is explicit: the message must exist, the user supplies title/due/duration, and one open todo per message',()=>withStore(s=>{
 const {d}=fresh();s.importSnapshot(d);const m=d.email.messages[0];
 a.throws(()=>s.saveTodo(input({origin:{type:'email',messageId:'not-there'}})),/not in the current snapshot/);
 const {todo}=s.saveTodo(input({title:'Agree presentation roles',dueAt:null,durationMinutes:20,origin:{type:'email',messageId:m.id,subject:'forged',threadId:'forged'}}));
 a.deepEqual(todo.origin,{type:'email',messageId:m.id,threadId:m.threadId,account:d.email.account,subject:m.subject,receivedAt:m.receivedAt},'origin comes from the stored message, not the request');
 a.equal(todo.title,'Agree presentation roles');a.equal(todo.dueAt,null,'no deadline is inferred from "before Friday"');
 a.throws(()=>s.saveTodo(input({origin:{type:'email',messageId:m.id}})),/already adopted/);
 a.deepEqual(s.snapshot().assignments.map(x=>x.id),d.assignments.map(x=>x.id),'an email never becomes coursework');
 const off={...d,email:{enabled:false}};s.importSnapshot(off);a.throws(()=>s.saveTodo(input({origin:{type:'email',messageId:d.email.messages[1].id}})),/not in the current snapshot/,'disabled email cannot be adopted');
}));

test('generating a plan is explicit and local; regeneration and todo edits invalidate exact versions; attempted blocks stay',()=>withStore(s=>{
 const {d,tomorrow}=fresh();s.importSnapshot(d);a.equal(s.snapshot().proposals.length,0,'nothing is planned on import');
 const t=s.saveTodo(input({durationMinutes:60})).todo,r=s.generatePlan(tomorrow);a.equal(r.ready,true,JSON.stringify(r.gaps));
 const blocks=s.snapshot().proposals.filter(p=>p.origin==='planner');a.deepEqual(blocks.map(b=>b.id),r.blocks.map(b=>b.id));a.ok(blocks.some(b=>b.sourceRefs[0].id===t.id));
 a.equal(s.state().plan[tomorrow].blocks.length,r.blocks.length);a.ok(s.state().plan[tomorrow].assumptions.length>3);
 const tb=blocks.find(b=>b.sourceRefs[0].id===t.id),other=blocks.find(b=>b.sourceRefs[0].kind==='assignment');
 const q1=A.prepare(s,[tb.id]),q2=A.prepare(s,[other.id]);a.deepEqual(A.read(s,q1.reference).errors,[]);
 s.generatePlan(tomorrow);a.equal(A.read(s,q1.reference).status,'prepared','identical regeneration keeps identical versions');
 s.saveTodo({...input({durationMinutes:90}),id:t.id});a.equal(A.read(s,q1.reference).status,'invalidated','editing the todo removes its blocks');a.equal(s.snapshot().proposals.some(p=>p.id===tb.id),false);
 a.equal(A.read(s,q2.reference).status,'prepared','other blocks are untouched');
 const r2=s.generatePlan(tomorrow),nb=r2.blocks.find(b=>b.sourceRefs[0].id===t.id);a.notEqual(nb.id,tb.id);a.equal(nb.sourceRefs[0].version,2);
 A.record(s,{reference:q2.reference,id:other.id,status:'pending',recordedAt:new Date().toISOString(),humanApproval:'Synthetic test approval'});
 const r3=s.generatePlan(tomorrow);a.ok(s.snapshot().proposals.some(p=>p.id===other.id),'a pending block survives regeneration');a.equal(r3.blocks.some(b=>b.id===other.id),false);
 a.equal(r3.blocks.filter(b=>b.sourceRefs[0].id===other.sourceRefs[0].id).reduce((n,b)=>n+(Date.parse(b.end)-Date.parse(b.start))/60000,0)+(Date.parse(other.end)-Date.parse(other.start))/60000<=d.assignments.find(x=>x.id===other.sourceRefs[0].id).estimateMinutes,true,'no double scheduling');
 const done=s.completeTodo(t.id,true);a.ok(done.removedBlocks.length>=1);a.equal(s.snapshot().proposals.some(p=>p.sourceRefs?.[0]?.id===t.id),false);
 a.throws(()=>s.generatePlan('tomorrow'),/valid date/);
}));

test('imports keep planner blocks only while identity and evidence hold; a calendar failure removes them',()=>withStore(s=>{
 const {d,tomorrow}=fresh();s.importSnapshot(d);s.saveTodo(input());s.generatePlan(tomorrow);const n=s.snapshot().proposals.length;a.ok(n>=2);
 s.importSnapshot(d);a.equal(s.snapshot().proposals.length,n,'a routine re-import keeps local plans');
 const submitted=structuredClone(d);submitted.assignments.find(x=>x.id==='brief-a').status='submitted';s.importSnapshot(submitted);
 a.equal(s.snapshot().proposals.some(p=>p.sourceRefs?.[0]?.id==='brief-a'),false,'submitted work loses its blocks');a.ok(s.snapshot().proposals.some(p=>p.sourceRefs?.[0]?.kind==='todo'));
 const moved=structuredClone(d);moved.calendarCoverage.account='other@example.com';s.importSnapshot(moved);a.equal(s.snapshot().proposals.filter(p=>p.origin==='planner').length,0,'an account change drops plans');
 s.importSnapshot(d);s.generatePlan(tomorrow);const failed=structuredClone(d);failed.sources.find(x=>x.id==='google-calendar').status='failed';s.importSnapshot(failed);a.equal(s.snapshot().proposals.length,0);
 const r=s.generatePlan(tomorrow);a.equal(r.ready,false);a.deepEqual(r.blocks,[]);a.match(r.gaps.join(' '),/incomplete/);
}));

test('plan and todo endpoints require session, Origin and CSRF',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-plan-api-')),srv=createServer(dir);await new Promise(r=>srv.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+srv.address().port;
 try{const {d,tomorrow}=fresh();srv.store.importSnapshot(d);const session=await fetch(base+'/api/session'),cookie=session.headers.get('set-cookie').split(';')[0],csrf=(await session.json()).csrf,h={Cookie:cookie,'Content-Type':'application/json',Origin:base,'x-dayweave-token':csrf};
  for(const route of ['todos/save','todos/complete','plan/generate']){a.equal((await fetch(base+'/api/'+route,{method:'POST',headers:{...h,'x-dayweave-token':'wrong'},body:'{}'})).status,403);a.equal((await fetch(base+'/api/'+route,{method:'POST',headers:{...h,Origin:'https://example.com'},body:'{}'})).status,403);}
  const saved=await (await fetch(base+'/api/todos/save',{method:'POST',headers:h,body:JSON.stringify({todo:input()})})).json();a.match(saved.todo.id,/^todo-/);
  const plan=await (await fetch(base+'/api/plan/generate',{method:'POST',headers:h,body:JSON.stringify({date:tomorrow})})).json();a.equal(plan.ready,true);
  a.equal((await fetch(base+'/api/todos/complete',{method:'POST',headers:h,body:JSON.stringify({id:saved.todo.id,done:'yes'})})).status,400);
 }finally{await new Promise(r=>srv.close(r));fs.rmSync(dir,{recursive:true,force:true});}});

test('page-order scripts render todos, email adoption and the daily plan panel with escaped content',async()=>{
 const order=[...fs.readFileSync('src/web/index.html','utf8').matchAll(/<script src="\/([\w.]+)"><\/script>/g)].map(m=>m[1]),files={'core.js':'src/core.cjs','phase2.js':'src/phase2.cjs','phase3.js':'src/phase3.cjs','effort.js':'src/effort.cjs','workload.js':'src/workload.cjs','email.js':'src/email.cjs','app.js':'src/web/app.js'};
 const evil='<img src=x onerror=alert(1)>',{d,tomorrow}=fresh();let D,S;withStore(s=>{s.importSnapshot(d);s.saveTodo(input({title:evil,notes:evil}));s.saveTodo(input({title:'From mail',origin:{type:'email',messageId:d.email.messages[0].id}}));s.generatePlan(tomorrow);D=s.snapshot();S=s.state();});
 const nodes=new Map(),node=k=>{if(!nodes.has(k))nodes.set(k,{textContent:'',innerHTML:''});return nodes.get(k);};
 const ctx=vm.createContext({URL,URLSearchParams,Date,Intl,console,encodeURIComponent,window:{addEventListener(){}},document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}},location:{pathname:'/coursework',search:'?tab=todos'},history:{pushState(){}},fetch:async url=>({ok:true,json:async()=>url.endsWith('session')?{csrf:'t'}:url.includes('approvals')?[]:{snapshot:D,progress:S}})});
 for(const f of order)vm.runInContext(fs.readFileSync(files[f],'utf8'),ctx,{filename:files[f]});await new Promise(r=>setImmediate(r));
 let html=node('#page').innerHTML;a.match(html,/id="todoForm"/);a.match(html,/No due date/);a.match(html,/&lt;img src=x/);a.doesNotMatch(html,/<img/);a.match(html,/Adopted from email “Presentation roles”/);a.match(html,/class="active" href="\/coursework\?tab=todos"/);
 ctx.location.pathname='/email';ctx.location.search='';await vm.runInContext('render()',ctx);html=node('#page').innerHTML;a.match(html,/Adopted as todo/);a.match(html,/class="todoAdopt" data-message="msg-002"/);a.match(html,/does not read deadlines or tasks from the email/);
 ctx.location.pathname='/timetable';ctx.location.search='?date='+tomorrow;await vm.runInContext('render()',ctx);html=node('#page').innerHTML;
 a.match(html,/id="daily-plan"/);a.match(html,/nothing is written to your calendar/);a.match(html,/id="plan-blocks"/);a.match(html,/id="plan-unscheduled"/);a.match(html,/Selectable \(choice\) work is never scheduled automatically/);a.match(html,/At least 20% of usable time stays unallocated/);a.match(html,/Regenerate for /);a.doesNotMatch(html,/<img/);
 ctx.location.search='?date='+tomorrow+'&view=week';await vm.runInContext('render()',ctx);a.doesNotMatch(node('#page').innerHTML,/id="daily-plan"/,'week view has no plan panel');
});
