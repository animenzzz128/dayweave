const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const C=require('../src/core.cjs'),PL=require('../src/planner.cjs'),A=require('../src/approvals.cjs'),{Store}=require('../src/store.cjs');
// Every planning rule, saved through the store and applied by "plan the next 7 days" (owner audit 2026-10-27). A fixed fictional
// week: Monday 2026-11-09 to Sunday 2026-11-15, generated on Sunday evening, with 08:30–10:00 classes on Monday and Wednesday.
const TZ='America/New_York',MON='2026-11-09',NOW=new Date('2026-11-09T01:00:00Z'),WEEK=Array.from({length:7},(_,i)=>PL.addDays(MON,i));
const hm=x=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(x));
const mins=p=>(Date.parse(p.end)-Date.parse(p.start))/60000;
function snap(edit=x=>x){C.configure(TZ);const d=structuredClone(require('../examples/google-snapshot.json')),at=(k,t)=>C.zonedISO(k,t);
 d.generatedAt=new Date(+NOW-60000).toISOString();d.calendarCoverage={...d.calendarCoverage,complete:true,start:at(MON,'00:00'),end:at(PL.addDays(MON,8),'00:00'),checkedAt:d.generatedAt};
 d.events=[0,2].map(i=>({id:'class-'+i,title:'Class',start:at(WEEK[i],'08:30'),end:at(WEEK[i],'10:00'),busy:true,sourceId:'google-calendar'}));d.proposals=[];d.email={enabled:false};
 d.assignments=[{...d.assignments[0],id:'case',title:'Case write-up',source:'https://example.com/assignments/case',sourceId:'course-a',requirement:'required',status:'not_submitted',estimateMinutes:600,dueAt:at(WEEK[4],'23:00')}];
 for(const s of d.sources)s.lastSuccess=d.generatedAt;return edit(d);}
function withStore(fn,dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-rules-'))){const s=new Store(dir);try{return fn(s,dir);}finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}}
const gym={id:'gym',title:'Gym',minutes:60,perWeek:3,perDay:1,days:[1,2,3,4,5],windows:[{start:'07:00',end:'09:00'},{start:'17:00',end:'19:00'}]};
const base={dayStart:'09:00',dayEnd:'24:00',breaks:[{start:'12:00',end:'13:00'}],habits:[gym]};
const week=s=>{s.generatePlans(MON,7,NOW);return s.snapshot().proposals.filter(p=>p.origin==='planner'&&p.action!=='delete');};
const kind=(list,k)=>list.filter(p=>p.sourceRefs?.[0]?.kind===k);

test('saved rules survive a reload, and a rule that cannot hold is refused with the reason while the saved rules stay',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-rules-'));
 try{let s=new Store(dir);s.savePlanSettings({...base,dayStart:'08:30'});s.close();
  s=new Store(dir);a.equal(s.planSettings().dayStart,'08:30','a new store on the same data (a page refresh) reads the saved rules');
  // The screenshot case: 7 gym sessions a week, Monday–Friday only, at most 1 a day. Five weekdays, not the seven planned days.
  a.throws(()=>s.savePlanSettings({...base,dayStart:'07:30',habits:[{...gym,perWeek:7}]}),/Gym: 7 sessions a week need more room\. Only 5 weekdays are ticked \(Mon, Tue, Wed, Thu, Fri\) at most 1 a day, so at most 5 fit\./);
  a.equal(s.planSettings().dayStart,'08:30','nothing of a refused save is stored');
  s.savePlanSettings({...base,habits:[{...gym,perWeek:7,days:[1,2,3,4,5,6,7]}]});a.equal(s.planSettings().habits[0].perWeek,7,'seven ticked days fit seven sessions');s.close();}
 finally{fs.rmSync(dir,{recursive:true,force:true});}});

test('day start and end bound every block; changing them and planning again moves the blocks',()=>withStore(s=>{
 s.importSnapshot(snap());s.savePlanSettings({...base,dayStart:'07:00',dayEnd:'22:00'});let list=week(s);
 a.ok(list.length>0);a.ok(list.every(p=>hm(p.start)>='07:00'&&(hm(p.end)<='22:00'&&hm(p.end)!=='00:00')),list.map(p=>hm(p.start)+'-'+hm(p.end)).join(' '));
 a.ok(kind(list,'habit').some(p=>hm(p.start)==='07:00'),'with a 07:00 start the morning gym window is used');
 s.savePlanSettings({...base,dayStart:'10:30',dayEnd:'21:00'});list=week(s);
 a.ok(list.every(p=>hm(p.start)>='10:30'&&hm(p.end)<='21:00'),list.map(p=>hm(p.start)+'-'+hm(p.end)).join(' '));
 a.ok(kind(list,'habit').every(p=>hm(p.start)==='17:00'),'the morning window now lies before the day, so only the evening one is used');
 // Classes stay busy whatever the window: nothing overlaps 08:30–10:00 (plus the rest gap) on class days.
 s.savePlanSettings({...base,dayStart:'08:30'});list=week(s);
 for(const c of s.snapshot().events)a.ok(list.every(p=>Date.parse(p.end)+15*60000<=Date.parse(c.start)||Date.parse(p.start)>=Date.parse(c.end)+15*60000),'kept clear of '+c.start);}));

test('breaks stay free and the daily coursework limit holds on every day of the week',()=>withStore(s=>{
 s.importSnapshot(snap());s.savePlanSettings({...base,breaks:[{start:'12:00',end:'13:00'},{start:'15:00',end:'16:00'}],maxDailyWork:120});const list=week(s);
 for(const p of list)for(const [b,e] of [['12:00','13:00'],['15:00','16:00']])a.ok(hm(p.end)<=b||hm(p.start)>=e||hm(p.end)==='00:00'&&hm(p.start)>=e,p.title+' '+hm(p.start)+' overlaps break '+b);
 for(const k of WEEK){const n=kind(list,'assignment').filter(p=>C.dayKey(p.start)===k).reduce((x,p)=>x+mins(p),0);a.ok(n<=120,k+' has '+n+' minutes of coursework');}
 a.ok(kind(list,'assignment').length>0,'coursework is still planned under the limit');}));

test('weekly goals: sessions per week, at most per day, only on ticked weekdays, inside their windows, in their colour, and off when disabled',()=>withStore(s=>{
 s.importSnapshot(snap());const jobs={id:'jobs',title:'Job applications',minutes:60,perWeek:4,perDay:2,days:[2,4],windows:[{start:'13:00',end:'18:00'}],color:'3'};
 s.savePlanSettings({...base,habits:[{...gym,perWeek:5},jobs]});let list=week(s);
 const g=kind(list,'habit').filter(p=>p.sourceRefs[0].id==='gym'),j=kind(list,'habit').filter(p=>p.sourceRefs[0].id==='jobs');
 a.equal(g.length,5,'five gym sessions in a Monday–Friday week');a.deepEqual(g.map(p=>PL.isoDay(C.dayKey(p.start))),[1,2,3,4,5]);
 a.equal(j.length,4,'four job sessions on two ticked days');a.ok(j.every(p=>[2,4].includes(PL.isoDay(C.dayKey(p.start)))));
 for(const k of [WEEK[1],WEEK[3]])a.equal(j.filter(p=>C.dayKey(p.start)===k).length,2,'at most (and here exactly) 2 a day');
 a.ok(j.every(p=>hm(p.start)>='13:00'&&hm(p.end)<='18:00'&&p.color==='3'));a.ok(g.every(p=>p.color==='10'),'gym keeps its default colour');
 s.savePlanSettings({...base,habits:[{...gym,enabled:false},jobs]});list=week(s);a.equal(kind(list,'habit').filter(p=>p.sourceRefs[0].id==='gym').length,0,'a disabled goal is not planned');}));

test('blocks the owner edited stay through new rules, and the plan names them and says when they now fall outside the day',()=>withStore(s=>{
 s.importSnapshot(snap());s.savePlanSettings({...base,dayStart:'07:00'});week(s);
 const p=s.snapshot().proposals.find(x=>x.sourceRefs?.[0]?.id==='gym'&&C.dayKey(x.start)===WEEK[0]&&hm(x.start)==='07:00');a.ok(p,'a 07:00 gym block on Monday');
 A.edit(s,p.id,{start:p.start,end:new Date(Date.parse(p.end)+15*60000).toISOString()});
 s.savePlanSettings({...base,dayStart:'09:00'});const r=s.generatePlan(WEEK[0],NOW);
 a.ok(s.snapshot().proposals.some(x=>x.id===p.id),'the edited block stays');a.deepEqual(r.held.map(h=>[h.id,h.why,h.outside]),[[p.id,'edited',true]]);
 a.equal(r.blocks.filter(b=>b.sourceRefs?.[0]?.id==='gym').length,0,'and it still counts as that day\'s gym session');
 const stored=s.state().plan[WEEK[0]];a.equal(stored.held.length,1,'the stored summary keeps it for the page');}));
