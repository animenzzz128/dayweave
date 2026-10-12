const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const C=require('../src/core.cjs'),P=require('../src/phase2.cjs'),PL=require('../src/planner.cjs'),A=require('../src/approvals.cjs'),{Store}=require('../src/store.cjs');
const TZ='America/New_York',MIN=60000;
// Fictional Google snapshot for `date` checked at `now`: complete coverage of the date and the next three days, no events.
function snap(date,now,edit=x=>x){C.configure(TZ);const d=C.mergeSnapshot(null,structuredClone(require('../examples/google-snapshot.json'))),at=new Date(now).toISOString();
 let end=date;for(let i=0;i<4;i++)end=PL.nextDay(end);
 d.generatedAt=at;d.calendarCoverage={...d.calendarCoverage,complete:true,start:C.zonedISO(date,'00:00'),end:C.zonedISO(end,'00:00'),checkedAt:at};d.events=[];d.proposals=[];
 for(const s of d.sources)s.lastSuccess=at;return edit(d);}
const todo=(id,minutes,dueAt=null)=>({id,title:'Todo '+id,dueAt,durationMinutes:minutes,status:'open',version:1});
const reasons=r=>Object.fromEntries(r.unscheduled.map(u=>[u.id,u.reason]));
const overlaps=(x,y)=>Date.parse(x.start)<Date.parse(y.end)&&Date.parse(y.start)<Date.parse(x.end);
const len=b=>(Date.parse(b.end)-Date.parse(b.start))/MIN;

test('B1: only listed sources with status ok, in a fresh snapshot, give plannable coursework; kept blocks follow the same rule',()=>{
 const date='2026-10-14',now=C.zonedISO(date,'08:00'),d=snap(date,now,x=>{Object.assign(x.assignments.find(y=>y.id==='brief-a'),{estimateMinutes:150,dueAt:C.zonedISO('2026-10-16','17:00')});x.assignments.find(y=>y.id==='presentation-b').dueAt=C.zonedISO('2026-10-16','17:00');return x;});
 const r=PL.plan({snapshot:d,date,now});a.equal(r.ready,true);
 a.equal(r.blocks.some(b=>b.sourceRefs[0].id==='presentation-b'),false,'partial course-b work is not planned');a.match(reasons(r)['presentation-b'],/Source partial/);
 const unlisted=snap(date,now,x=>{x.assignments.find(y=>y.id==='presentation-b').sourceId='nowhere';return x;});a.match(reasons(PL.plan({snapshot:unlisted,date,now}))['presentation-b'],/not listed/);
 const staleSnap=snap(date,now,x=>{x.generatedAt=new Date(Date.parse(now)-27*3600000).toISOString();return x;}),rs=PL.plan({snapshot:staleSnap,date,now,todos:{t:todo('t',30)}});
 a.equal(rs.blocks.some(b=>b.sourceRefs[0].kind==='assignment'),false,'a stale snapshot plans no coursework');a.ok(rs.blocks.some(b=>b.sourceRefs[0].id==='t'),'local todos stay plannable');
 a.ok(Object.values(reasons(rs)).some(x=>/older than 26 hours/.test(x)));
 const staleSrc=snap(date,now,x=>{x.sources.find(s=>s.id==='course-a').lastSuccess=new Date(Date.parse(now)-30*3600000).toISOString();return x;});
 a.ok(Object.values(reasons(PL.plan({snapshot:staleSrc,date,now}))).some(x=>/last succeeded over 26 hours/.test(x)));
 // keep(): a later import where course-a turns partial drops its unstarted blocks but never a started one.
 const blocks=r.blocks.filter(b=>b.sourceRefs[0].kind==='assignment');a.ok(blocks.length>=2);
 const old={...d,proposals:blocks,actionHistory:[{id:blocks[0].id,status:'pending',fingerprint:P.fingerprint(blocks[0]),recordedAt:now}]};
 const next={...structuredClone(d),proposals:[],actionHistory:old.actionHistory};next.sources.find(s=>s.id==='course-a').status='partial';
 const kept=PL.keep(old,next).map(p=>p.id);a.deepEqual(kept,[blocks[0].id],'only the started block is kept');
});

test('B2: kept recurring proposals block every occurrence, cover their full length, and unexpandable ones fail closed',()=>{
 const date='2026-10-12',now=C.zonedISO(date,'07:00'),week=PL.nextDay(PL.nextDay(PL.nextDay(PL.nextDay(PL.nextDay(PL.nextDay(PL.nextDay(date)))))));
 const series={id:'collector-weekly',title:'Weekly study',start:C.zonedISO(date,'09:00'),end:C.zonedISO(date,'10:30'),recurrence:{frequency:'weekly',interval:1,count:4},status:'proposed'};
 const d=snap(date,now,x=>{x.calendarCoverage.end=C.zonedISO('2026-10-24','00:00');x.assignments=[];x.proposals=[series];return x;});
 const r=PL.plan({snapshot:d,date:week,now,todos:{t:todo('t',60)}});a.equal(r.ready,true,r.gaps.join());
 const second={start:C.zonedISO(week,'09:00'),end:C.zonedISO(week,'10:30')};a.ok(r.blocks.length);a.equal(r.blocks.some(b=>overlaps(b,second)),false,'the second occurrence is busy');
 a.ok(r.blocks.every(b=>Date.parse(b.start)>=Date.parse(second.end)+15*MIN),'rest gap after the occurrence');
 const bad=snap(date,now,x=>{x.assignments=[];x.proposals=[{...series,recurrence:{frequency:'monthly',interval:1,count:3}}];return x;}),rb=PL.plan({snapshot:bad,date,now,todos:{t:todo('t',60)}});
 a.equal(rb.ready,false);a.deepEqual(rb.blocks,[]);a.match(rb.gaps.join(' '),/could not be expanded/);
 // Covered minutes count all future occurrences: 3 daily 30-minute occurrences cover 90 minutes of a linked assignment.
 const linked=snap(date,now,x=>{const asg=x.assignments.find(y=>y.id==='brief-a');x.assignments=[{...asg,estimateMinutes:90,dueAt:C.zonedISO('2026-10-15','20:00')}];
  x.proposals=[{id:'collector-daily',title:'Brief',start:C.zonedISO('2026-10-13','10:00'),end:C.zonedISO('2026-10-13','10:30'),source:asg.source,recurrence:{frequency:'daily',interval:1,count:3},status:'proposed'}];return x;});
 a.match(reasons(PL.plan({snapshot:linked,date,now}))['brief-a'],/Already covered by 90 minutes/);
 // Downstream: a proposal overlapping a later occurrence of a started action cannot be requested.
 const st=snap(date,now,x=>{x.assignments=[];x.proposals=[series];x.actionHistory=[{id:series.id,status:'pending',fingerprint:P.fingerprint(series),recordedAt:now}];return x;});
 const clash={...st.proposals[0],id:'clash',title:'Clash',recurrence:'One time',start:C.zonedISO(week,'09:30'),end:C.zonedISO(week,'10:00'),provider:'google',account:st.calendarCoverage.account,calendar:st.calendarCoverage.calendar,calendarId:st.calendarCoverage.calendarId,timezone:st.timezone};
 a.match(P.errors(clash,st,now).join(' '),/already started/);
});

test('B3: started blocks stay canonical through a calendar failure, a restore and a refresh: no duplicate work, no overlapping time',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-protect-')),s=new Store(dir);try{
  C.configure(TZ);const real=Date.now(),today=C.dayKey(real),tomorrow=PL.nextDay(today),d=snap(today,real,x=>{x.assignments=[];return x;});
  const t=s.saveTodo({title:'Write report',dueAt:null,durationMinutes:60,notes:''}).todo;s.importSnapshot(d);const backup=s.backups()[0];a.ok(backup,'the import made a daily backup with the todo and no plan');
  s.generatePlan(tomorrow);
  const block=s.snapshot().proposals.find(p=>p.sourceRefs?.[0]?.id===t.id),q=A.prepare(s,[block.id]);
  A.record(s,{reference:q.reference,id:block.id,status:'pending',recordedAt:new Date().toISOString(),humanApproval:{channel:'chat',text:'Approve '+q.reference,at:new Date().toISOString()}});
  const check=label=>{const r=s.generatePlan(tomorrow);a.equal(r.ready,true,label+': '+r.gaps.join());a.equal(r.blocks.some(b=>b.sourceRefs[0].id===t.id),false,label+': the todo is not planned twice');
   a.match(reasons(r)[t.id],/Already covered by 60 minutes/,label);a.equal(r.blocks.some(b=>overlaps(b,block)),false,label+': nothing overlaps the started block');};
  const failed=structuredClone(d);failed.sources.find(x=>x.id==='google-calendar').status='failed';s.importSnapshot(failed);
  const kept=s.snapshot().proposals.find(p=>p.id===block.id);a.ok(kept,'a calendar failure keeps the started block');a.equal(P.fingerprint(kept),P.fingerprint(block));
  a.ok(P.errors(kept,s.snapshot()).some(e=>/already attempted/.test(e)),'and it stays non-actionable');
  s.importSnapshot(d);check('after failure and recovery');
  const forged=structuredClone(d);forged.proposals=[{...block,title:'Changed by collector'}];s.importSnapshot(forged);a.equal(s.snapshot().proposals.find(p=>p.id===block.id).title,block.title,'a collector copy never replaces a started block');
  s.restore(backup);const back=s.snapshot().proposals.find(p=>p.id===block.id);a.ok(back,'restore puts the started block back from its frozen approval copy');
  a.equal(P.fingerprint(back),s.snapshot().actionHistory.find(h=>h.id===block.id).fingerprint,'exact reviewed fields');a.deepEqual(back.sourceRefs,block.sourceRefs);
  check('after restore');
  // Even with the snapshot copy gone entirely, the approval copy protects the time and the work.
  const raw=s.snapshot();raw.proposals=raw.proposals.filter(p=>p.id!==block.id);s.writeSnapshot(raw);check('approval copy only');
  // A pending action with no stored copy at all makes the time unknown: planning fails closed.
  const orphan=s.snapshot();orphan.actionHistory=[...orphan.actionHistory,{id:'orphan',status:'pending',fingerprint:'x',recordedAt:new Date().toISOString()}];
  const ro=PL.plan({snapshot:orphan,date:tomorrow,now:new Date(),todos:s.state().todo,started:s.startedCopies(orphan)});a.equal(ro.ready,false);a.match(ro.gaps.join(),/without a stored copy/);
  a.equal(s.state().todo[t.id].status,'open','a created or started block never marks the todo done');
 }finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('B4: the 20% reserve holds across repeated generation after blocks are started',()=>{
 const date='2026-10-14',now=C.zonedISO(date,'07:00'),d=snap(date,now,x=>{x.assignments=[];return x;});
 const todos=Object.fromEntries(Array.from({length:12},(_,i)=>['m'+i,todo('m'+i,90)]));
 const first=PL.plan({snapshot:d,date,now,todos});a.equal(first.usable.minutes,900);a.ok(first.usable.allocated<=720);
 const history=first.blocks.map(b=>({id:b.id,status:'pending',fingerprint:P.fingerprint(b),recordedAt:now}));
 const second=PL.plan({snapshot:{...d,proposals:first.blocks,actionHistory:history},date,now,todos});
 a.equal(second.usable.minutes,900,'usable time comes from events only');a.equal(second.usable.alreadyAllocated,first.usable.allocated);
 a.ok(second.usable.alreadyAllocated+second.usable.allocated<=Math.floor(900*0.8),'started plus new stays within 80%');
 const third=PL.plan({snapshot:{...d,proposals:[...first.blocks,...second.blocks],actionHistory:[...history,...second.blocks.map(b=>({id:b.id,status:'executed',fingerprint:P.fingerprint(b),recordedAt:now}))]},date,now,todos});
 a.ok(third.usable.alreadyAllocated+third.usable.allocated<=720);a.ok(third.unscheduled.some(u=>/Keeping 20%/.test(u.reason)));
});

test('R2-B1: executed blocks imported as calendar events stay allocations; the reserve holds against the original day capacity',()=>{
 const date='2026-10-14',now=C.zonedISO(date,'07:00'),d=snap(date,now,x=>{x.assignments=[];return x;}),cov=d.calendarCoverage;
 const todos={...Object.fromEntries(Array.from({length:8},(_,i)=>['a'+(i+1),todo('a'+(i+1),90)])),z:todo('z',60)};
 const first=PL.plan({snapshot:d,date,now,todos});a.equal(first.usable.minutes,900);a.equal(first.usable.allocated,720);a.match(reasons(first).z,/Keeping 20%/);
 const executed=first.blocks.map((b,i)=>({id:b.id,status:'executed',fingerprint:P.fingerprint(b),recordedAt:now,verifiedAt:now,remoteRef:'g-'+i,evidence:'read back'}));
 const ev=(b,i,extra={})=>({id:'g-'+i,remoteRef:'g-'+i,title:b.title,start:b.start,end:b.end,busy:true,sourceId:'google-calendar',provider:'google',account:cov.account,calendarId:cov.calendarId,...extra});
 const total=r=>r.usable.alreadyAllocated+r.usable.allocated;
 const check=(label,snapshot,started=first.blocks)=>{const r=PL.plan({snapshot,date,now,todos,started});a.equal(r.ready,true,label+': '+r.gaps.join());
  a.equal(r.usable.minutes,900,label+': own events do not shrink usable time');a.equal(r.usable.alreadyAllocated,720,label+': they count as allocated once');
  a.ok(total(r)<=720,label+': started plus new stays within 80% of 900');a.equal(r.blocks.length,0,label+': z is not placed');a.match(reasons(r).z,/Keeping 20%.*720 minutes already allocated/,label);return r;};
 // Matched by the executed receipt's remoteRef (the event title was edited in the calendar), with and without the approval copy.
 check('remoteRef',{...d,events:first.blocks.map((b,i)=>ev(b,i,{title:'Renamed in calendar'})),proposals:first.blocks,actionHistory:executed});
 // A collected event carries only its own ID and calendar; the receipt names calendarId/eventId.
 const calRef=executed.map((h,i)=>({...h,remoteRef:cov.calendarId+'/g-'+i}));
 check('calendarId/eventId receipt',{...d,events:first.blocks.map((b,i)=>ev(b,i,{remoteRef:undefined,title:'Renamed in calendar'})),proposals:first.blocks,actionHistory:calRef});
 check('remoteRef, no copy',{...d,events:first.blocks.map((b,i)=>ev(b,i,{title:'Renamed in calendar'})),proposals:[],actionHistory:executed},[]);
 // Matched conservatively by exact approved-copy identity while still pending (no remoteRef yet), through regenerate/refresh loops.
 const pending=first.blocks.map(b=>({id:b.id,status:'pending',fingerprint:P.fingerprint(b),recordedAt:now})),asEvents={...d,events:first.blocks.map((b,i)=>ev(b,i,{id:'other-'+i,remoteRef:undefined})),proposals:first.blocks,actionHistory:pending};
 for(let loop=0;loop<3;loop++)check('exact copy, loop '+loop,{...structuredClone(asEvents),actionHistory:loop?executed:pending});
 // Unrelated busy events are not own: another calendar's identical event, or a same-time event with another title, still cost capacity.
 const other=PL.plan({snapshot:{...d,events:[ev(first.blocks[0],90,{remoteRef:'x',id:'x',calendarId:'other@calendar.example'})],proposals:first.blocks,actionHistory:pending},date,now,todos,started:first.blocks});
 a.equal(other.usable.minutes,810,'an identical event on another calendar is busy time');a.ok(total(other)<=Math.floor(810*0.8));
 const meeting=PL.plan({snapshot:{...d,events:[ev(first.blocks[0],91,{remoteRef:'y',id:'y',title:'Team sync'})],proposals:first.blocks,actionHistory:pending},date,now,todos,started:first.blocks});
 a.equal(meeting.usable.minutes,810);a.ok(total(meeting)<=648,'a same-time unrelated event never adds back capacity');
 // A receipt remoteRef seen on another calendar (a shared event ID) is not own either.
 const shared=PL.plan({snapshot:{...d,events:[ev(first.blocks[0],0,{calendarId:'other@calendar.example',title:'Shared'})],proposals:first.blocks,actionHistory:executed},date,now,todos,started:first.blocks});
 a.equal(shared.usable.minutes,810);
 // Mid-day: the base is the remaining day after now, minus only unrelated events; own events after now stay allocated.
 const noon=C.zonedISO(date,'12:00'),mid=PL.plan({snapshot:{...d,events:first.blocks.map((b,i)=>ev(b,i)),proposals:first.blocks,actionHistory:executed},date,now:noon,todos,started:first.blocks});
 a.equal(mid.usable.minutes,720);a.ok(total(mid)<=576,'mid-day total stays within 80% of the remaining day');
 // Recurrence: each expanded occurrence of a started weekly copy imported as an event is own, never lost capacity.
 const week=PL.nextDay(PL.nextDay(PL.nextDay(PL.nextDay(PL.nextDay(PL.nextDay(PL.nextDay(date)))))));
 const series={id:'collector-weekly',title:'Weekly study',start:C.zonedISO(date,'09:00'),end:C.zonedISO(date,'10:30'),recurrence:{frequency:'weekly',interval:1,count:2},status:'proposed',provider:'google',account:cov.account,calendarId:cov.calendarId};
 const rec=snap(date,now,x=>{x.assignments=[];x.calendarCoverage.end=C.zonedISO('2026-10-24','00:00');x.proposals=[series];x.actionHistory=[{id:series.id,status:'pending',fingerprint:P.fingerprint(series),recordedAt:now}];
  x.events=P.occurrences(series).map((o,i)=>({id:'occ-'+i,title:series.title,...o,busy:true,sourceId:'google-calendar',account:cov.account,calendarId:cov.calendarId}));return x;});
 const rw=PL.plan({snapshot:rec,date:week,now,todos:{t:todo('t',900)}});a.equal(rw.usable.minutes,900);a.equal(rw.usable.alreadyAllocated,90);a.ok(total(rw)<=720);
});

test('nonblockers: past unstarted blocks do not cover work; estimate changes and local archive drop unstarted blocks; truthful deadlines; bounded lists',()=>{
 const date='2026-10-14',now=C.zonedISO(date,'12:00'),d=snap(date,now,x=>{x.assignments=[];return x;}),todos={t:todo('t',60)};
 const old={id:'plan-2026-10-13-old',title:'Focus: Todo t',start:C.zonedISO('2026-10-13','10:00'),end:C.zonedISO('2026-10-13','11:00'),origin:'planner',planDate:'2026-10-13',sourceRefs:[{kind:'todo',id:'t',version:1}],status:'proposed'};
 const r=PL.plan({snapshot:{...d,proposals:[old]},date,now,todos});a.ok(r.blocks.some(b=>b.sourceRefs[0].id==='t'),'yesterday\'s unstarted block does not cover today');
 const started=PL.plan({snapshot:{...d,proposals:[old],actionHistory:[{id:old.id,status:'executed',fingerprint:P.fingerprint(old),recordedAt:now}]},date,now,todos});a.match(reasons(started).t,/Already covered/);
 const future=PL.plan({snapshot:d,date:'2026-10-16',now,todos:{late:todo('late',30,C.zonedISO('2026-10-15','20:00')),gone:todo('gone',30,C.zonedISO('2026-10-14','08:00'))}});
 a.match(reasons(future).late,/falls before the 09:00 start of 2026-10-16/);a.match(reasons(future).gone,/^Deadline has passed/);
 const many=Object.fromEntries(Array.from({length:150},(_,i)=>['x'+i,todo('x'+i,600)])),big=PL.plan({snapshot:snap(date,now,x=>{x.calendarCoverage.complete=false;return x;}),date,now,todos:many});
 const sum=PL.summary(big);a.equal(sum.unscheduled.length,100);a.equal(sum.unscheduledTotal,big.unscheduled.length);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-nb-')),s=new Store(dir);try{
  const real=Date.now(),today=C.dayKey(real),tomorrow=PL.nextDay(today),base=snap(today,real,x=>{x.assignments.find(y=>y.id==='brief-a').dueAt=new Date(real+5*86400000).toISOString();return x;});s.importSnapshot(base);s.generatePlan(tomorrow);
  const ids=()=>s.snapshot().proposals.filter(p=>p.origin==='planner').map(p=>p.sourceRefs[0].id);a.ok(ids().includes('brief-a'));
  const est=structuredClone(base);est.assignments.find(x=>x.id==='brief-a').estimateMinutes-=15;s.importSnapshot(est);a.equal(ids().includes('brief-a'),false,'an estimate change drops unstarted blocks');
  s.generatePlan(tomorrow);a.ok(ids().includes('brief-a'));const block=s.snapshot().proposals.find(p=>p.sourceRefs?.[0]?.id==='brief-a'),q=A.prepare(s,[block.id]);
  s.saveState('archive','brief-a',true);a.equal(ids().includes('brief-a'),false,'local archive drops unstarted blocks');a.equal(A.read(s,q.reference).status,'invalidated');
  s.importSnapshot(est);a.equal(ids().includes('brief-a'),false,'and a later import does not bring them back');
  for(let i=0;i<200;i++)s.saveTodo({title:'T'+i,dueAt:null,durationMinutes:5,notes:''});a.throws(()=>s.saveTodo({title:'one more',dueAt:null,durationMinutes:5,notes:''}),/At most 200 open todos/);
 }finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}
});

// R2-B2: a restore or import that brings back an older same-ID copy of a started action never replaces the copy matching its receipt.
const withStore=fn=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-pin-')),s=new Store(dir);try{return fn(s);}finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}};
const at=(day,from,to,base)=>({...base,start:C.zonedISO(day,from),end:C.zonedISO(day,to)});
const collector=(d,id,day,from,to,title='Study session')=>({id,title,status:'proposed',action:'create',provider:'google',account:d.calendarCoverage.account,calendar:d.calendarCoverage.calendar,calendarId:d.calendarCoverage.calendarId,timezone:d.timezone,recurrence:'One time',attendees:[],start:C.zonedISO(day,from),end:C.zonedISO(day,to)});
const approve=(s,id)=>{const q=A.prepare(s,[id]);A.record(s,{reference:q.reference,id,status:'pending',recordedAt:new Date().toISOString(),humanApproval:{channel:'chat',text:'Approve '+q.reference,at:new Date().toISOString()}});return q;};

test('R2-B2 A: a planner block edited 09:00 -> 14:00 before pending stays at 14:00 after restoring a 09:00 backup; a new 14:00 proposal fails before any write',()=>withStore(s=>{
 C.configure(TZ);const real=Date.now(),today=C.dayKey(real),tomorrow=PL.nextDay(today),d=snap(today,real,x=>{x.assignments=[];return x;});
 const t=s.saveTodo({title:'Write report',dueAt:null,durationMinutes:60,notes:''}).todo;s.importSnapshot(d);s.generatePlan(tomorrow);
 const block=s.snapshot().proposals.find(p=>p.sourceRefs?.[0]?.id===t.id);a.equal(block.start,C.zonedISO(tomorrow,'09:00'));const K=s.backup();
 const edited=at(tomorrow,'14:00','15:00',block),raw=s.snapshot();raw.proposals=raw.proposals.map(p=>p.id===block.id?edited:p);s.writeSnapshot(raw);approve(s,block.id);
 const receipt=()=>s.snapshot().actionHistory.find(h=>h.id===block.id).fingerprint;a.equal(receipt(),P.fingerprint(edited));
 s.restore(K);const back=s.snapshot().proposals.find(p=>p.id===block.id);a.equal(back.start,edited.start,'the receipt-matching approval copy replaces the stale 09:00 copy');a.equal(P.fingerprint(back),receipt());
 const raw2=s.snapshot();raw2.proposals.push(collector(raw2,'y-1400',tomorrow,'14:00','15:00','Other block'));s.writeSnapshot(raw2);
 a.throws(()=>A.prepare(s,['y-1400']),/already started/,'Y overlapping the real pending time cannot be prepared');
 // Even if the snapshot copy is stale, the guard uses the authoritative copy, or fails closed without one.
 const stale=s.snapshot();stale.proposals=stale.proposals.map(p=>p.id===block.id?block:p);const y=stale.proposals.find(p=>p.id==='y-1400');
 a.match(P.errors(y,stale,new Date(),s.startedCopies(stale)).join(' '),/Overlaps an action that was already started/);
 a.match(P.errors(y,stale,new Date()).join(' '),/no stored copy matching its receipt/);
 const ps=PL.plan({snapshot:stale,date:tomorrow,now:new Date(),todos:s.state().todo});a.equal(ps.ready,false,'planning on a stale copy without the approval copy fails closed');a.match(ps.gaps.join(),/matching its receipt/);
 const r=s.generatePlan(tomorrow);a.equal(r.ready,true,r.gaps.join());a.equal(r.blocks.some(b=>overlaps(b,edited)),false);a.match(reasons(r)[t.id],/Already covered by 60/);
 s.importSnapshot(d);a.equal(s.snapshot().proposals.find(p=>p.id===block.id).start,edited.start,'a later import keeps the receipt copy');
}));

test('R2-B2 B: a collector proposal moved 10:00 -> 14:00 and started survives restore of the 10:00 daily backup, healthy refreshes and stale collector copies',()=>withStore(s=>{
 C.configure(TZ);const real=Date.now(),today=C.dayKey(real),tomorrow=PL.nextDay(today),base=snap(today,real,x=>{x.assignments=[];return x;});
 const first={...structuredClone(base),proposals:[collector(base,'x',tomorrow,'10:00','11:00')]};s.importSnapshot(first);const daily=s.backups()[0];a.ok(daily);
 const moved={...structuredClone(base),proposals:[collector(base,'x',tomorrow,'14:00','15:00')]};s.importSnapshot(moved);approve(s,'x');
 const at14=()=>s.snapshot().proposals.find(p=>p.id==='x')?.start===C.zonedISO(tomorrow,'14:00');
 s.restore(daily);a.ok(at14(),'restore replaces the stale 10:00 copy');
 s.importSnapshot(structuredClone(base));a.ok(at14(),'a healthy refresh that drops the started collector proposal keeps its approval copy');
 s.importSnapshot(first);a.ok(at14(),'a stale collector copy never replaces it');
 const y={...structuredClone(base),proposals:[collector(base,'y',tomorrow,'14:30','15:30')]};s.importSnapshot(y);
 a.throws(()=>A.prepare(s,['y']),/already started/,'Y fails at prepare, before any approval text or remote write');
 a.ok(P.errors(s.snapshot().proposals.find(p=>p.id==='y'),s.snapshot()).some(e=>/already started/.test(e)),'the browser guard sees the same protection');
}));

test('restore is transactional; reopen respects the open cap; an update may overlap the executed create of its own target',()=>withStore(s=>{
 C.configure(TZ);const real=Date.now(),today=C.dayKey(real),tomorrow=PL.nextDay(today),base=snap(today,real,x=>{x.assignments=[];return x;});
 s.importSnapshot({...structuredClone(base),proposals:[collector(base,'x',tomorrow,'10:00','11:00')]});const K=s.backups()[0];
 s.importSnapshot({...structuredClone(base),proposals:[collector(base,'x',tomorrow,'14:00','15:00')]});approve(s,'x');const before=JSON.stringify(s.snapshot());
 const pin=s.pinStarted;s.pinStarted=()=>{throw Error('synthetic failure');};try{a.throws(()=>s.restore(K),/synthetic failure/);}finally{s.pinStarted=pin;}
 a.equal(JSON.stringify(s.snapshot()),before,'a failed restore leaves the pre-restore database, receipts and copies in place');
 const done=s.saveTodo({title:'Done one',dueAt:null,durationMinutes:5,notes:''}).todo;s.completeTodo(done.id,true);
 for(let i=0;i<200;i++)s.saveTodo({title:'T'+i,dueAt:null,durationMinutes:5,notes:''});a.throws(()=>s.completeTodo(done.id,false),/At most 200 open todos/);
 // Legacy update: excluded from the started-overlap guard only for the executed create whose receipt remoteRef is the target.
 const now='2026-10-07T12:00:00Z',p={id:'remote',title:'Focus',action:'create',account:'student@example.com',calendar:'Personal',timezone:TZ,start:'2026-10-08T14:00:00Z',end:'2026-10-08T15:00:00Z',recurrence:'One time',attendees:[]};
 const ev={...p,remoteRef:'event-1',scope:'single'},q={...p,id:'change-1',action:'update',remoteRef:'event-1',scope:'single',before:ev,title:'New focus'};
 const d={timezone:TZ,generatedAt:now,events:[ev],proposals:[p],actionHistory:[{id:'remote',status:'executed',fingerprint:P.fingerprint(p),remoteRef:'event-1',recordedAt:now}],calendarCoverage:{complete:true,start:now,end:'2026-12-01T00:00:00Z',checkedAt:now,account:p.account,calendar:p.calendar}};
 a.deepEqual(P.errors(q,d,now),[]);a.match(P.errors({...q,remoteRef:'event-2',before:{...ev,remoteRef:'event-2'}},{...d,events:[ev,{...ev,id:'e2',remoteRef:'event-2',start:'2026-10-08T16:00:00Z',end:'2026-10-08T17:00:00Z'}]},now).join(' '),/already started/);
}));
