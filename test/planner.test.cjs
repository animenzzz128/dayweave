const {test}=require('node:test'),a=require('node:assert/strict'),C=require('../src/core.cjs'),P=require('../src/phase2.cjs'),PL=require('../src/planner.cjs');
const TZ='America/New_York',MIN=60000;
const local=x=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(x));
// A fictional Google-only snapshot for `date`, checked at `now`, covering the date and the next two days.
function snap(date,now,edit=x=>x){C.configure(TZ);const d=C.mergeSnapshot(null,structuredClone(require('../examples/google-snapshot.json'))),at=t=>C.zonedISO(date,t),next=PL.nextDay(date);
 d.generatedAt=new Date(now).toISOString();d.calendarCoverage={...d.calendarCoverage,complete:true,start:C.zonedISO(date,'00:00'),end:C.zonedISO(PL.nextDay(PL.nextDay(next)),'00:00'),checkedAt:new Date(now).toISOString()};
 d.events=[{id:'busy',title:'Class',start:at('13:00'),end:at('14:00'),busy:true,sourceId:'google-calendar'},{id:'free',title:'Optional talk',start:at('15:00'),end:at('16:00'),busy:false,sourceId:'google-calendar'},
  {id:'allday',title:'Holiday',start:C.zonedISO(next,'00:00'),end:C.zonedISO(PL.nextDay(next),'00:00'),allDay:true,busy:true,sourceId:'google-calendar'}];
 d.proposals=[];const base=d.assignments[0],asg=(id,extra)=>({...base,id,title:'Task '+id,source:'https://example.com/assignments/'+id,sourceId:'course-a',requirement:'required',status:'not_submitted',estimateMinutes:60,dueAt:C.zonedISO(PL.nextDay(next),'12:00'),...extra});
 d.assignments=[asg('big',{estimateMinutes:150,dueAt:C.zonedISO(next,'18:00')}),asg('soon',{estimateMinutes:45,dueAt:at('20:00')}),asg('undated',{dueAt:null,estimateMinutes:30}),
  asg('choice',{requirement:'choice'}),asg('uncertain',{requirement:'uncertain'}),asg('unknown',{status:'unknown'}),asg('failed',{sourceId:'course-b'}),asg('noest',{estimateMinutes:undefined}),
  asg('done',{status:'submitted'}),asg('local',{}),asg('late',{dueAt:at('08:00')}),asg('removed',{archivedFromSource:true})];
 d.sources=d.sources.map(s=>({...(s.id==='course-b'?{...s,status:'failed'}:s),lastSuccess:new Date(now).toISOString()}));return edit(d);}
const todo=(id,minutes,dueAt=null,extra={})=>({id,title:'Todo '+id,dueAt,durationMinutes:minutes,status:'open',version:1,...extra});
const overlaps=(x,y)=>Date.parse(x.start)<Date.parse(y.end)&&Date.parse(y.start)<Date.parse(x.end);
const reasons=r=>Object.fromEntries(r.unscheduled.map(u=>[u.id,u.reason]));

test('only fresh, complete Google coverage of the whole day is planned; every gap is explicit and nothing is scheduled',()=>{
 const date='2026-10-14',now=C.zonedISO('2026-10-14','08:00'),ok=PL.plan({snapshot:snap(date,now),date,now});a.equal(ok.ready,true);a.deepEqual(ok.gaps,[]);
 const cases=[[d=>{d.calendarCoverage.provider='outlook';delete d.calendarCoverage.calendars;},/Google Calendar coverage/],[d=>{d.calendarCoverage.complete=false;},/incomplete/],[d=>{d.calendarCoverage.checkedAt=new Date(Date.parse(now)-27*3600000).toISOString();},/older than 26 hours/],
  [d=>{d.calendarCoverage.end=C.zonedISO(date,'18:00');},/does not cover the whole planning day/],[d=>{d.sources.find(s=>s.id==='google-calendar').status='partial';},/Calendar source is partial/],
  [d=>{d.events.push({id:'series',title:'Weekly',start:C.zonedISO(date,'10:00'),end:C.zonedISO(date,'11:00'),recurrence:{frequency:'weekly',interval:1,count:4}});},/not expanded/]];
 for(const [edit,re] of cases){const r=PL.plan({snapshot:snap(date,now,d=>{edit(d);return d;}),date,now,todos:{t:todo('t',30)}});a.equal(r.ready,false);a.deepEqual(r.blocks,[]);a.match(r.gaps.join(' '),re);a.match(reasons(r).t,/coverage is not verified/);}
 const past=PL.plan({snapshot:snap(date,now),date:'2026-10-13',now});a.deepEqual(past.blocks,[]);a.match(past.gaps[0],/already ended/);
 a.throws(()=>PL.plan({snapshot:snap(date,now),date:'2026-02-30',now}),/valid date/);
});

test('blocks respect busy time, rest gaps, 90-minute bounds, deadlines, the 20% reserve and never start in the past',()=>{
 const date='2026-10-14',now=C.zonedISO(date,'10:07'),d=snap(date,now),r=PL.plan({snapshot:d,date,now,todos:{t1:todo('t1',30),t2:todo('t2',200,C.zonedISO('2026-10-20','12:00'))},archive:{local:true}});
 a.equal(r.ready,true);a.ok(r.blocks.length>=4);
 for(const b of r.blocks){a.ok(Date.parse(b.start)>=Date.parse(now),'not in the past');a.ok(local(b.start)>='09:00');a.ok(Date.parse(b.end)<=Date.parse(C.zonedISO('2026-10-15','00:00')));
  const len=(Date.parse(b.end)-Date.parse(b.start))/MIN;a.ok(len<=90&&len>0);a.equal(Date.parse(b.start)%(5*MIN),0,'5-minute grid');
  a.ok(Date.parse(b.end)+15*MIN<=Date.parse(d.events[0].start)||Date.parse(b.start)>=Date.parse(d.events[0].end)+15*MIN,'15-minute gap around the busy class');
  a.deepEqual(P.errors(b,d,now),[],'each block passes the calendar checks');a.equal(b.provider,'google');a.equal(b.calendarId,d.calendarCoverage.calendarId);a.deepEqual(b.attendees,[]);a.equal(b.recurrence,'One time');}
 const sorted=[...r.blocks].sort((x,y)=>Date.parse(x.start)-Date.parse(y.start));for(let i=1;i<sorted.length;i++)a.ok(Date.parse(sorted[i].start)>=Date.parse(sorted[i-1].end)+15*MIN,'rest gap between blocks');
 a.ok(r.usable.allocated<=r.usable.budget);a.equal(r.usable.budget,Math.floor(r.usable.minutes*0.8));
 a.equal(r.usable.minutes,Math.floor((Date.parse(C.zonedISO('2026-10-15','00:00'))-Date.parse(now))/MIN)-60,'only the busy class is subtracted; the free event and the next-day all-day event are not');
 const soon=r.blocks.filter(b=>b.sourceRefs[0].id==='soon');a.equal(soon.length,1);a.ok(Date.parse(soon[0].end)<=Date.parse(C.zonedISO(date,'20:00')),'ends before the deadline');
 a.equal(r.blocks[0].sourceRefs[0].id,'soon','earliest deadline is placed first');
 a.deepEqual(r.blocks.filter(b=>b.sourceRefs[0].id==='big').map(b=>(Date.parse(b.end)-Date.parse(b.start))/MIN),[75,75],'150 minutes split into even blocks of at most 90');
 a.doesNotThrow(()=>P.request(r.blocks,d,now),'all blocks can be requested together (no overlaps)');
 const why=reasons(r);
 a.match(why.choice,/Selectable/);a.match(why.uncertain,/uncertain/);a.match(why.unknown,/Submission status unknown/);a.match(why.failed,/Source failed/);a.match(why.noest,/No duration estimate/);a.match(why.local,/Archived locally/);a.match(why.late,/Deadline has passed/);
 a.equal(why.done,undefined,'submitted work is not listed');a.equal(why.removed,undefined);a.equal(r.blocks.some(b=>['choice','uncertain','unknown','failed','noest','local','late','done','removed'].includes(b.sourceRefs[0].id)),false);
 a.ok(r.assumptions.some(x=>/Nothing is written to any calendar/.test(x)));
});

test('all-day events block the day, deadlines cut placement, the reserve stops allocation and partial plans say so',()=>{
 const date='2026-10-14',now=C.zonedISO(date,'08:00'),next='2026-10-15',r=PL.plan({snapshot:snap(date,now),date:next,now,todos:{t:todo('t',30)}});
 a.equal(r.ready,true);a.deepEqual(r.blocks,[]);a.equal(r.usable.minutes,0);a.match(reasons(r).t,/Keeping 20%|No free slot/);
 const tight=PL.plan({snapshot:snap(date,now,d=>{d.assignments=[d.assignments[1]];d.assignments[0].dueAt=C.zonedISO(date,'09:30');return d;}),date,now});a.match(reasons(tight).soon,/No free slot that ends before the deadline/);
 const many=Object.fromEntries(Array.from({length:12},(_,i)=>['m'+i,todo('m'+i,90)])),full=PL.plan({snapshot:snap(date,now,d=>{d.assignments=[];return d;}),date,now,todos:many});
 a.ok(full.usable.allocated<=full.usable.budget);a.ok(full.unscheduled.some(u=>/Keeping 20% of usable time unallocated|No free slot/.test(u.reason)));
 const part=PL.plan({snapshot:snap(date,now,d=>{d.assignments=[];return d;}),date,now:C.zonedISO(date,'21:00'),todos:{p:todo('p',180)}});a.match(reasons(part).p,/Partly planned: \d+ of 180 minutes/);
});

test('work already covered by kept blocks or collector proposals is not scheduled twice; output is deterministic',()=>{
 const date='2026-10-14',now=C.zonedISO(date,'08:00'),d=snap(date,now),todos={t:todo('t',60)};
 const first=PL.plan({snapshot:d,date,now,todos});a.deepEqual(PL.plan({snapshot:structuredClone(d),date,now,todos}),first,'same inputs, same plan');
 const tb=first.blocks.find(b=>b.sourceRefs[0].id==='t');a.ok(tb);
 const other={...tb,id:'plan-2026-10-16-x',planDate:'2026-10-16',start:C.zonedISO('2026-10-16','10:00'),end:C.zonedISO('2026-10-16','11:00')};
 a.match(reasons(PL.plan({snapshot:{...d,proposals:[other]},date,now,todos})).t,/Already covered by 60 minutes/);
 const half={...other,end:C.zonedISO('2026-10-16','10:30')},r=PL.plan({snapshot:{...d,proposals:[half]},date,now,todos});a.equal(r.blocks.find(b=>b.sourceRefs[0].id==='t').end,new Date(Date.parse(r.blocks.find(b=>b.sourceRefs[0].id==='t').start)+30*MIN).toISOString());
 const collector={id:'from-collector',title:'Brief block',start:C.zonedISO('2026-10-16','10:00'),end:C.zonedISO('2026-10-16','11:00'),source:'https://example.com/assignments/soon',status:'proposed'};
 a.match(reasons(PL.plan({snapshot:{...d,proposals:[collector]},date,now})).soon,/Already covered/);
 const replaced=PL.plan({snapshot:{...d,proposals:first.blocks},date,now,todos});a.deepEqual(replaced.blocks.map(b=>b.id),first.blocks.map(b=>b.id),'this date\'s unattempted blocks are replaced, not counted');
 const pending=PL.plan({snapshot:{...d,proposals:first.blocks,actionHistory:[{id:tb.id,status:'pending',fingerprint:P.fingerprint(tb),recordedAt:now}]},date,now,todos});a.equal(pending.blocks.some(b=>b.sourceRefs[0].id==='t'),false,'an attempted block is kept and covers its todo');
 a.notDeepEqual(PL.plan({snapshot:d,date,now,todos:{t:{...todos.t,version:2}}}).blocks.find(b=>b.sourceRefs[0].id==='t').id,tb.id,'an edited todo gets new block IDs');
});

test('DST days keep the 09:00–24:00 local window and blocks may end exactly at midnight',()=>{
 for(const [date,startZ,endZ] of [['2026-11-01','2026-11-01T14:00:00.000Z','2026-11-02T05:00:00.000Z'],['2026-03-08','2026-03-08T13:00:00.000Z','2026-03-09T04:00:00.000Z']]){
  const now=C.zonedISO(date,'07:00'),r=PL.plan({snapshot:snap(date,now,d=>{d.events=[];d.assignments=[];return d;}),date,now,todos:{t:todo('t',30)}});
  a.deepEqual(r.window,{start:startZ,end:endZ});a.equal(r.usable.minutes,900);a.equal(r.blocks[0].start,startZ);a.equal(local(r.blocks[0].start),'09:00');}
 C.configure(TZ);const cov={complete:true,start:'2026-10-14T04:00:00Z',end:'2026-10-16T04:00:00Z'},p={id:'x',title:'x',start:C.zonedISO('2026-10-14','23:00'),end:C.zonedISO('2026-10-15','00:00')};
 a.deepEqual(C.proposalErrors(p,{events:[],calendarCoverage:cov},'2026-10-14T12:00:00Z'),[]);
 a.match(C.proposalErrors({...p,end:C.zonedISO('2026-10-15','00:30')},{events:[],calendarCoverage:cov},'2026-10-14T12:00:00Z').join(),/sleep/);
 a.match(C.proposalErrors({...p,start:C.zonedISO('2026-10-14','08:30'),end:C.zonedISO('2026-10-14','09:30')},{events:[],calendarCoverage:cov},'2026-10-14T12:00:00Z').join(),/sleep/);
 // 75 usable minutes after a 21:30–22:45 event (budget 60); the 15-minute gap puts the hour at 23:00–24:00.
 const late=PL.plan({snapshot:snap('2026-10-14',C.zonedISO('2026-10-14','22:00'),d=>{d.events=[{id:'e',title:'Late class',start:C.zonedISO('2026-10-14','21:30'),end:C.zonedISO('2026-10-14','22:45'),busy:true}];d.assignments=[];return d;}),date:'2026-10-14',now:C.zonedISO('2026-10-14','22:00'),todos:{t:todo('t',60)}});a.equal(late.usable.minutes,75);
 const tooLate=PL.plan({snapshot:snap('2026-10-14',C.zonedISO('2026-10-14','22:58'),d=>{d.events=[];d.assignments=[];return d;}),date:'2026-10-14',now:C.zonedISO('2026-10-14','22:58'),todos:{t:todo('t',60)}});a.deepEqual(tooLate.blocks,[]);a.match(reasons(tooLate).t,/Keeping 20%/,'62 usable minutes cannot hold an hour and keep the reserve');
 a.equal(local(late.blocks[0].start),'23:00');a.equal(late.blocks[0].end,C.zonedISO('2026-10-15','00:00'),'ends at local midnight');
});

test('with the real clock, plans for today and tomorrow never place blocks in the past or outside the window',()=>{
 const real=new Date(),today=C.dayKey(real);for(const date of [today,PL.nextDay(today)]){const r=PL.plan({snapshot:snap(today,real,d=>{d.assignments=[];return d;}),date,now:real,todos:{t:todo('t',60)}});
  if(Date.parse(C.zonedISO(PL.nextDay(date),'00:00'))<=+real){a.equal(r.ready,false);continue;}
  for(const b of r.blocks){a.ok(Date.parse(b.start)>=+real);a.ok(Date.parse(b.start)>=Date.parse(r.window.start)&&Date.parse(b.end)<=Date.parse(r.window.end));}}
});
