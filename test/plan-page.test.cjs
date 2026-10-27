const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const C=require('../src/core.cjs'),PL=require('../src/planner.cjs'),A=require('../src/approvals.cjs'),X=require('../src/execute.cjs'),{Store}=require('../src/store.cjs');
const TZ='America/New_York';
// Fictional Google snapshot relative to the real clock, with one required assignment due in two days and no events.
function snap(real,edit=x=>x){C.configure(TZ);const today=C.dayKey(real),d=structuredClone(require('../examples/google-snapshot.json'));
 d.generatedAt=new Date(real-60000).toISOString();d.calendarCoverage={...d.calendarCoverage,complete:true,start:C.zonedISO(today,'00:00'),end:C.zonedISO(PL.nextDay(PL.nextDay(PL.nextDay(today))),'00:00'),checkedAt:d.generatedAt};
 d.events=[];d.proposals=[];d.email={enabled:false};d.assignments=[{...d.assignments[0],id:'case',title:'Case write-up',requirement:'required',status:'not_submitted',estimateMinutes:120,dueAt:C.zonedISO(PL.nextDay(PL.nextDay(today)),'23:00')}];
 for(const s of d.sources)s.lastSuccess=d.generatedAt;return edit(d);}
function withStore(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-page-')),s=new Store(dir);try{return fn(s);}finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}}
const tomorrowOf=real=>PL.nextDay(C.dayKey(real));
const planned=(s,date)=>s.snapshot().proposals.filter(p=>p.origin==='planner'&&p.planDate===date);

test('an edited planner block is locked: regeneration keeps it, and it can be unlocked again',()=>withStore(s=>{
 const real=Date.now();s.importSnapshot(snap(real));const date=tomorrowOf(real);s.generatePlan(date);
 const p=planned(s,date).find(x=>x.sourceRefs[0].kind==='assignment');a.ok(p);
 const start=new Date(Date.parse(p.start)+3600000).toISOString(),end=new Date(Date.parse(p.end)+3600000).toISOString();
 const e=A.edit(s,p.id,{start,end});a.equal(e.locked,true);
 s.generatePlan(date);const again=planned(s,date).find(x=>x.id===p.id);a.ok(again,'kept');a.equal(again.start,start);
 a.equal(planned(s,date).filter(x=>x.sourceRefs[0].id==='case').reduce((n,x)=>n+(Date.parse(x.end)-Date.parse(x.start))/60000,0),120,'the rest of the work is planned around it, not twice');
 a.equal(A.edit(s,p.id,{locked:false}).locked,undefined);a.equal(PL.replaceable(s.snapshot(),planned(s,date).find(x=>x.id===p.id),date),true,'unlocked blocks are replaced again');}));

test('blocks in a version the owner approved stay through regeneration and keep the approval valid',()=>withStore(s=>{
 const real=Date.now();s.importSnapshot(snap(real));const date=tomorrowOf(real);s.generatePlan(date);
 const ids=planned(s,date).map(p=>p.id),q=A.prepare(s,ids);X.approve(s,q.reference,'owner@example.com');
 const r=s.generatePlan(date);const now=planned(s,date),have=new Set(now.flatMap(p=>p.sourceRefs).filter(x=>x.kind==='habit').map(x=>x.id));
 a.ok(!r.unscheduled.some(u=>u.kind==='habit'&&have.has(u.id)),'a goal already met today is not reported as not fitting');a.ok(ids.every(id=>now.some(p=>p.id===id&&p.locked)),'approved blocks stay, locked');a.equal(A.read(s,q.reference).status,'prepared');}));

test('after a collection, drafts are made for today and tomorrow; a day that cannot be planned keeps its blocks',()=>withStore(s=>{
 const real=Date.now();s.importSnapshot(snap(real));const date=tomorrowOf(real),r=s.autoPlan(new Date(real));
 a.deepEqual(r.map(x=>x.date),[C.dayKey(real),date]);a.ok(r[1].ready);a.ok(planned(s,date).length>0);const before=planned(s,date).map(p=>p.id);
 s.importSnapshot(snap(real+1000,d=>{d.calendarCoverage.complete=false;return d;}));const r2=s.autoPlan(new Date(real+1000));
 a.equal(r2[1].ready,false);a.ok(before.every(id=>planned(s,date).some(p=>p.id===id)),'nothing cleared');}));
