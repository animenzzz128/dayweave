const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),W=require('../src/workload.cjs'),{Store}=require('../src/store.cjs'),{createServer}=require('../src/server.cjs'),Q=require('../src/approvals.cjs');
const now=new Date('2026-10-07T12:00:00Z'),at=h=>new Date(now.getTime()+h*3600000).toISOString();
const base=structuredClone(require('../examples/snapshot.json')).assignments[0];
const item=(id,dueAt,extra={})=>({...base,id,title:'Synthetic '+id,dueAt,requirement:'required',status:'not_submitted',sourceId:'course-a',...extra});
const sources=[{id:'course-a',name:'Course A',status:'ok'},{id:'course-b',name:'Course B',status:'failed'}];
const sample=()=>[
 item('later',at(100)),item('undated',null),item('soon-b',at(10)),item('soon-a',at(10)),item('boundary',at(72)),item('after-boundary',at(72+1/3600)),item('overdue',at(-1)),
 item('choice',at(5),{requirement:'choice'}),item('uncertain',at(5),{requirement:'uncertain'}),item('unknown-status',at(5),{status:'unknown'}),
 item('submitted',at(-5),{status:'submitted'}),item('graded',at(2),{status:'graded'}),item('excused',at(2),{status:'excused'}),
 item('failed-source',at(3),{sourceId:'course-b'}),item('failed-submitted',at(3),{sourceId:'course-b',status:'submitted'}),
 item('archived',at(1),{archivedFromSource:true}),item('no-requirement',at(4),{requirement:undefined}),
 item('choice-unknown',at(-2),{requirement:'choice',status:'unknown'}),item('failed-graded',at(1),{sourceId:'course-b',status:'graded'})];
const ids=list=>list.map(x=>x.id);

test('modes are explicit: Standard by default, unknown values read as Standard',()=>{
 a.deepEqual(W.MODES,['standard','reduced']);a.equal(W.DEFAULT,'standard');
 for(const x of [undefined,null,'',' reduced','Reduced','turbo',['reduced'],{mode:'reduced'},1,'__proto__'])a.equal(W.valid(x),false),a.equal(W.mode(x),'standard');
 a.equal(W.mode('reduced'),'reduced');a.equal(W.focus([],[],now).mode,'standard');a.equal(W.focus([],[],now,'reduced').mode,'reduced');
});
test('reduced focus foregrounds overdue and 72-hour required work in deterministic due order',()=>{
 const list=sample(),before=JSON.stringify(list),f=W.focus(list,sources,now,'reduced');a.equal(JSON.stringify(list),before,'input is not mutated');
 a.deepEqual(ids(f.urgent),['overdue','soon-a','soon-b','boundary']);a.deepEqual(f.urgent.map(x=>x.urgency),['overdue','soon','soon','soon']);
 a.deepEqual(ids(f.upcoming),['after-boundary','later','undated'],'later and undated required work stays visible');
 a.deepEqual(ids(f.selectable),['choice-unknown','choice'],'selectable work stays reachable and separate, even when overdue');
 a.deepEqual(f.selectable.map(x=>!!x.submissionUnknown),[true,false],'unknown submission status stays visible on selectable work');
 a.deepEqual(ids(f.verification),['choice-unknown','failed-source','no-requirement','uncertain','unknown-status'],'due order, then ID');
 a.deepEqual(Object.fromEntries(f.verification.map(x=>[x.id,x.verifyReason])),{'choice-unknown':'Selectable (choice): submission status unknown','failed-source':'Source failed: retained record may be stale','unknown-status':'Submission status unknown',uncertain:'Requirement uncertain','no-requirement':'Requirement unknown'});
 a.ok(![...f.urgent,...f.upcoming].some(x=>x.id==='choice-unknown'),'unknown status never makes choice work required or urgent');
 const all=[...f.urgent,...f.upcoming,...f.selectable,...f.verification].map(x=>x.id);
 for(const id of ['submitted','graded','excused','failed-submitted','failed-graded','archived'])a.ok(!all.includes(id),id+' never returns to focus');
 a.deepEqual(W.health({sources},now).sources.map(x=>x.id),['course-b'],'done work leaves focus but its failed source stays in health warnings');
 a.deepEqual(W.focus([...list].reverse(),sources,now,'reduced'),f,'input order does not change the result');
 const std=W.focus(list,sources,now,'standard');a.deepEqual({...std,mode:'reduced'},f,'mode changes presentation only, not classification');
 a.equal(W.focus(sample(),[{id:'course-b',status:'unavailable'}],now).verification.find(x=>x.id==='failed-source').verifyReason,'Source unavailable: retained record may be stale');
});
test('health keeps non-ok sources, staleness and coverage gaps for every mode',()=>{
 const d={generatedAt:at(-27),sources:[{id:'x',status:'ok'},{id:'y',status:'partial'},{id:'z',status:'failed'}],calendarCoverage:{complete:false}};
 a.deepEqual(W.health(d,now),{sources:[d.sources[1],d.sources[2]],stale:true,coverageComplete:false});
 a.deepEqual(W.health({...d,generatedAt:at(-1),calendarCoverage:{complete:true}},now).stale,false);a.equal(W.health({},now).coverageComplete,false);a.equal(W.health({},now).stale,true);
});

const temp=fn=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-mode-'));let s=new Store(dir);try{return fn(s,()=>{s.close();s=new Store(dir);return s;});}finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}};
// Valid, preparable proposals relative to the real clock (approval checks use the current time).
const fixture=()=>{const C=require('../src/core.cjs'),d=structuredClone(require('../examples/snapshot.json')),day=C.dayKey(Date.now()+2*86400000),t=x=>new Date(Date.now()+x*3600000).toISOString();for(const p of d.proposals){p.start=C.zonedISO(day,'14:00');p.end=C.zonedISO(day,'15:00');}d.calendarCoverage={...d.calendarCoverage,complete:true,start:t(-24),end:t(120),checkedAt:t(-1)};return d;};
const facts=s=>{const st=s.state();delete st.preferences;return JSON.stringify({snapshot:s.snapshot(),approvals:Q.list(s).map(({id,status,value,fingerprints})=>({id,status,value,fingerprints})),progress:st});};
test('store: old databases default to Standard; the preference survives restart, source refresh and changes nothing else',()=>temp((s0,restart)=>{
 let s=s0;const d=fixture();s.importSnapshot(d);a.equal(s.workloadMode(),'standard');a.equal(s.state().preferences,undefined);
 s.saveState('actual','brief-a',90);s.confirmEffort('brief-a');s.saveState('checks','brief-a:0',true);
 const q=Q.prepare(s,[d.proposals[0].id]);a.equal(q.status,'prepared');
 const before=facts(s);a.equal(s.setWorkloadMode('reduced'),'reduced');a.equal(s.workloadMode(),'reduced');a.equal(facts(s),before,'sources, proposals, approvals, Q-numbers and effort samples are unchanged');
 s.setWorkloadMode('standard');s.setWorkloadMode('reduced');a.equal(facts(s),before);
 s=restart();a.equal(s.workloadMode(),'reduced','restart keeps the preference');
 const refreshed=fixture();refreshed.generatedAt=at(1);refreshed.sources.find(x=>x.id==='course-b').status='failed';s.importSnapshot(refreshed);a.equal(s.workloadMode(),'reduced','source refresh keeps the preference');
 a.equal(s.state().preferences.workloadMode,'reduced');const kept=Q.list(s).find(r=>r.id===q.id);a.equal(kept.reference,q.reference);a.equal(kept.status,'prepared','an unchanged proposal keeps its prepared Q-number');a.deepEqual(Q.list(s).map(r=>r.reference),[q.reference],'no Q-number was created by switching modes');
 a.ok(s.history({kind:'preference'}).items.some(r=>r.status==='reduced'));
}));
test('store: invalid modes and generic preference writes are rejected without partial writes',()=>temp(s=>{
 s.importSnapshot(fixture());s.setWorkloadMode('reduced');
 const rows=()=>JSON.stringify({progress:s.db.prepare('SELECT kind,id,value,at FROM progress ORDER BY kind,id').all(),audit:s.db.prepare('SELECT count(*) AS n FROM audit').get().n});const before=rows();
 for(const x of [undefined,null,'','Reduced',' reduced','turbo',['reduced'],{mode:'reduced'},7])a.throws(()=>s.setWorkloadMode(x),/Invalid workload mode/);
 for(const v of ['turbo','standard',{mode:'standard'}])a.throws(()=>s.saveState('preferences','workloadMode',v),/Invalid progress field/);
 a.equal(rows(),before,'no progress or audit rows were written');a.equal(s.workloadMode(),'reduced');
 a.equal(s.migrateProgress({preferences:{workloadMode:'turbo'}}),true);a.equal(s.workloadMode(),'reduced','legacy import ignores preferences');
 s.db.prepare("UPDATE progress SET value=? WHERE kind='preferences' AND id='workloadMode'").run('"turbo"');a.equal(s.workloadMode(),'standard','a malformed stored value reads as Standard');
 s.db.prepare("UPDATE progress SET value=? WHERE kind='preferences' AND id='workloadMode'").run('{not json');a.equal(s.workloadMode(),'standard');
}));
test('workload-mode endpoint requires session, Origin and CSRF and rejects invalid modes',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-mode-api-')),s=Q.attach(createServer(dir));await new Promise(r=>s.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+s.address().port;
 try{s.store.importSnapshot(fixture());const post=(body,headers={})=>fetch(origin+'/api/workload-mode',{method:'POST',headers:{'Content-Type':'application/json',...headers},body});
  a.equal((await post('{"mode":"reduced"}')).status,401);
  const session=await fetch(origin+'/api/session'),cookie=session.headers.get('set-cookie').split(';')[0],token=(await session.json()).csrf,ok={Cookie:cookie,'x-dayweave-token':token,Origin:origin};
  a.equal((await post('{"mode":"reduced"}',{...ok,Origin:'https://example.com'})).status,403);a.equal((await post('{"mode":"reduced"}',{...ok,'x-dayweave-token':'wrong'})).status,403);
  a.equal(s.store.workloadMode(),'standard');const before=facts(s.store);
  for(const body of ['{"mode":"turbo"}','{"mode":["reduced"]}','{}','null','{bad']){const r=await post(body,ok);a.equal(r.status,400,body);}
  const generic=await fetch(origin+'/api/progress',{method:'POST',headers:{'Content-Type':'application/json',...ok},body:JSON.stringify({kind:'preferences',id:'workloadMode',value:'turbo'})});a.equal(generic.status,400);
  a.equal(s.store.workloadMode(),'standard');a.equal(s.store.state().preferences,undefined,'rejected requests wrote nothing');
  const r=await post('{"mode":"reduced"}',ok);a.equal(r.status,200);a.deepEqual(await r.json(),{mode:'reduced'});a.equal(facts(s.store),before);
  const snap=await (await fetch(origin+'/api/snapshot',{headers:{Cookie:cookie}})).json();a.equal(snap.progress.preferences.workloadMode,'reduced');
  a.equal((await fetch(origin+'/workload.js')).status,200);
 }finally{await new Promise(r=>s.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});

test('page-order scripts render Standard by default and Reduced with every warning kept',async()=>{
 const order=[...fs.readFileSync('src/web/index.html','utf8').matchAll(/<script src="\/([\w.]+)"><\/script>/g)].map(m=>m[1]),files={'core.js':'src/core.cjs','phase2.js':'src/phase2.cjs','phase3.js':'src/phase3.cjs','effort.js':'src/effort.cjs','workload.js':'src/workload.cjs','app.js':'src/web/app.js'};
 a.deepEqual(order,['core.js','phase2.js','phase3.js','effort.js','workload.js','app.js']);
 const real=new Date(),h=x=>new Date(real.getTime()+x*3600000).toISOString(),evil='<img src=x onerror=alert(1)>';
 const D=structuredClone(require('../examples/snapshot.json'));D.generatedAt=h(-1);D.sources=[...sources.map(x=>({...x,lastSuccess:h(-30)})),{id:'outlook',name:'Calendar',status:'ok'}];D.calendarCoverage={...D.calendarCoverage,complete:false,note:'Synthetic partial window.'};
 D.assignments=[item('u2',h(20),{title:'Urgent two'}),item('u1',h(-2),{title:evil}),item('later',h(200),{title:'Later required'}),item('pick',h(5),{requirement:'choice',title:'Pick one'}),item('unsure',h(5),{requirement:'uncertain',title:'Unsure task'}),item('fail',h(5),{sourceId:'course-b',title:'Failed source task'}),item('done',h(-3),{status:'graded',title:'Done task'}),item('done-fail',h(2),{sourceId:'course-b',status:'excused',title:'Done failed task'}),item('pick-unk',h(-1),{requirement:'choice',status:'unknown',title:'Pick unknown'})];
 const S={archive:{later:true}};const nodes=new Map(),node=k=>{if(!nodes.has(k))nodes.set(k,{textContent:'',innerHTML:''});return nodes.get(k);};
 const ctx=vm.createContext({URLSearchParams,Date,Intl,console,encodeURIComponent,window:{addEventListener(){}},document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}},location:{pathname:'/home',search:''},history:{pushState(){}},fetch:async url=>({ok:true,json:async()=>url.endsWith('session')?{csrf:'test'}:{snapshot:D,progress:S}})});
 for(const f of order)vm.runInContext(fs.readFileSync(files[f],'utf8'),ctx,{filename:files[f]});await new Promise(r=>setImmediate(r));
 const kept=html=>{a.match(html,/id="verification"/);a.match(html,/Unsure task<\/a> <span class="tag warn">Requirement uncertain/);a.match(html,/Failed source task<\/a> <span class="tag warn">Source failed/);a.match(html,/data-source="course-b"><span class="tag warn">failed/);a.match(html,/Calendar coverage is incomplete/);a.match(html,/never treated as available capacity/);a.match(html,/Synthetic partial window/);a.doesNotMatch(html,/<img/);a.doesNotMatch(html,/Done task|Done failed task/);a.match(html,/Pick unknown<\/a> <span class="tag warn">Selectable \(choice\): submission status unknown/);};
 let html=node('#page').innerHTML;a.match(html,/Focus mode: Standard/);a.match(html,/aria-pressed="true" class="primary">Standard/);
 for(const x of ['Urgent & overdue required items','Next seven days','Today’s time','Priority 1'])a.ok(html.includes(x),'Standard keeps '+x);a.doesNotMatch(html,/id="focus-urgent"/);kept(html);
 S.preferences={workloadMode:'reduced'};await vm.runInContext('render()',ctx);html=node('#page').innerHTML;
 a.match(html,/Focus mode: Reduced/);a.doesNotMatch(html,/Next seven days/);kept(html);
 const section=id=>html.split('id="'+id+'"')[1].split('</section>')[0];
 a.deepEqual([...section('focus-urgent').matchAll(/data-focus="([^"]+)"/g)].map(m=>m[1]),['u1','u2']);a.match(section('focus-urgent'),/Overdue/);
 a.ok(!/Pick unknown/.test(section('focus-urgent')+section('focus-upcoming')),'unknown-status choice work is never urgent or required');a.match(section('focus-selectable'),/Pick unknown<\/a> <span class="tag ">Selectable \(choice\)<\/span> <span class="tag warn">Submission status unknown/);
 a.match(section('focus-upcoming'),/href="\/coursework\?tab=history&amp;q=Later%20required">Later required<\/a> <span class="tag ">Required<\/span> <span class="tag">Archived locally/,'a locally archived item links to Coursework History');
 const target=vm.runInContext("[coursework(new URLSearchParams('tab=history&q=Later required')),coursework(new URLSearchParams('q=Later required'))]",ctx);a.match(target[0],/<h3>Later required<\/h3>[\s\S]*Unarchive locally/);a.doesNotMatch(target[1],/Later required<\/h3>/,'the Current tab hides it, so the link must not point there');a.deepEqual(S.archive,{later:true});a.match(section('focus-selectable'),/Pick one<\/a> <span class="tag ">Selectable \(choice\)/);a.match(html,/href="\/coursework\?q=Pick%20one"/);
 S.preferences={workloadMode:'turbo'};await vm.runInContext('render()',ctx);a.match(node('#page').innerHTML,/Focus mode: Standard/,'an unknown stored mode renders Standard');
});
