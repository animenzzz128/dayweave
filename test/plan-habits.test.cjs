const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const C=require('../src/core.cjs'),PL=require('../src/planner.cjs'),{Store}=require('../src/store.cjs');
const TZ='America/New_York',local=x=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(x));
// 2026-10-14 is a Wednesday. Fictional Google snapshot with one class (13:00–14:00) and one required assignment due tomorrow.
function snap(date,now,edit=x=>x){C.configure(TZ);const d=C.mergeSnapshot(null,structuredClone(require('../examples/google-snapshot.json'))),at=t=>C.zonedISO(date,t);
 d.generatedAt=new Date(now).toISOString();d.calendarCoverage={...d.calendarCoverage,complete:true,start:C.zonedISO(date,'00:00'),end:C.zonedISO(PL.nextDay(PL.nextDay(PL.nextDay(date))),'00:00'),checkedAt:new Date(now).toISOString()};
 d.events=[{id:'class',title:'Class',start:at('13:00'),end:at('14:00'),busy:true,sourceId:'google-calendar'}];d.proposals=[];
 d.assignments=[{...d.assignments[0],id:'case',title:'Case write-up',source:'https://example.com/assignments/case',sourceId:'course-a',requirement:'required',status:'not_submitted',estimateMinutes:120,dueAt:C.zonedISO(PL.nextDay(date),'12:00')}];
 for(const s of d.sources)s.lastSuccess=d.generatedAt;return edit(d);}
const gym={id:'gym',title:'Gym',minutes:60,perWeek:3,days:[1,2,3,4,5],windows:[{start:'07:00',end:'09:00'},{start:'17:00',end:'19:00'}]};
const jobs={id:'jobs',title:'Job applications',minutes:60,perWeek:4,days:[1,2,3,4,5],windows:[{start:'14:00',end:'18:00'}]};
const settings={dayStart:'07:00',dayEnd:'23:00',breaks:[{start:'12:00',end:'13:00'},{start:'18:00',end:'19:00'}],habits:[gym,jobs]};

test('planning settings are validated: 07:00 floor, real spans, unique goals that fit their windows',()=>{
 a.deepEqual(PL.planSettings({}),{dayStart:'09:00',dayEnd:'24:00',breaks:[],habits:[]});
 const ok=PL.planSettings(settings);a.equal(ok.habits[0].enabled,true);a.deepEqual(ok.habits[1].days,[1,2,3,4,5]);
 for(const [bad,re] of [[{dayStart:'06:30'},/07:00/],[{dayStart:'10:00',dayEnd:'11:00'},/two hours/],[{breaks:[{start:'13:00',end:'12:00'}]},/end after/],
  [{habits:[gym,{...gym}]},/unique/],[{habits:[{...gym,minutes:7}]},/15–240/],[{habits:[{...gym,days:[]}]},/weekday/],[{habits:[{...gym,days:[8]}]},/weekday/],
  [{habits:[{...gym,windows:[{start:'07:00',end:'07:30'}]}]},/fit one 60-minute/],[{habits:[{...gym,title:''}]},/title/],[[],/object/]])a.throws(()=>PL.planSettings(bad),re,JSON.stringify(bad));});

test('a day plan puts urgent coursework first, then weekly goals in their windows, around classes and breaks',()=>{
 const date='2026-10-14',now=C.zonedISO(date,'06:00'),r=PL.plan({snapshot:snap(date,now),date,now,settings:PL.planSettings(settings)});
 a.equal(r.ready,true,JSON.stringify(r.gaps));const by=k=>r.blocks.filter(b=>b.sourceRefs[0].kind===k);
 a.deepEqual(by('assignment').map(b=>[local(b.start),local(b.end)]),[['07:00','08:00'],['08:15','09:15']],'urgent coursework takes the first slots');
 const g=by('habit').find(b=>b.sourceRefs[0].id==='gym'),j=by('habit').find(b=>b.sourceRefs[0].id==='jobs');
 a.equal(local(g.start),'17:00','the morning window is taken, so the gym goes to the evening window');a.equal(local(j.start),'14:15','after class plus the rest gap');
 a.equal(g.title,'Gym');a.match(g.reason,/session 1 of 3 this week/);a.equal(g.origin,'planner');a.equal(g.planDate,date);
 for(const b of r.blocks){a.ok(local(b.start)>='07:00');a.ok(!(local(b.start)<'13:00'&&local(b.end)>'12:00'),'lunch stays free');a.ok(!(local(b.start)<'19:00'&&local(b.end)>'18:00'),'dinner stays free');}
 a.match(r.assumptions.join(' '),/Breaks kept free: 12:00–13:00, 18:00–19:00/);a.match(r.assumptions.join(' '),/Weekly goals/);});

test('weekly goals count sessions already planned this week, skip disallowed days and say why when nothing fits',()=>{
 const date='2026-10-14',now=C.zonedISO(date,'06:00');
 const planned=d=>{for(const k of ['2026-10-12','2026-10-13','2026-10-16'])d.proposals.push({id:'g-'+k,title:'Gym',start:C.zonedISO(k,'07:00'),end:C.zonedISO(k,'08:00'),provider:'google',account:d.calendarCoverage.account,calendarId:d.calendarCoverage.calendarId,calendar:d.calendarCoverage.calendar,timezone:TZ,action:'create',recurrence:'One time',attendees:[],location:'',busy:true,origin:'planner',planDate:k,sourceRefs:[{kind:'habit',id:'gym'}]});return d;};
 const full=PL.plan({snapshot:snap(date,now,planned),date,now,settings:PL.planSettings({...settings,habits:[gym]})});
 a.equal(full.blocks.filter(b=>b.sourceRefs[0].kind==='habit').length,0,'three sessions this week already: none today');
 const weekend=PL.plan({snapshot:snap(date,now),date,now,settings:PL.planSettings({...settings,habits:[{...gym,days:[6,7]}]})});a.equal(weekend.blocks.filter(b=>b.sourceRefs[0].kind==='habit').length,0);
 const busy=PL.plan({snapshot:snap(date,now,d=>{d.assignments=[];d.events.push({id:'all',title:'Workshop',start:C.zonedISO(date,'07:00'),end:C.zonedISO(date,'20:00'),busy:true,sourceId:'google-calendar'});return d;}),date,now,settings:PL.planSettings({...settings,habits:[gym]})});
 a.match(busy.unscheduled.find(u=>u.id==='gym').reason,/No free 60-minute slot in its windows \(07:00–09:00, 17:00–19:00\)/);
 const off=PL.plan({snapshot:snap(date,now),date,now,settings:PL.planSettings({...settings,habits:[{...gym,enabled:false}]})});a.equal(off.blocks.filter(b=>b.sourceRefs[0].kind==='habit').length,0,'a paused goal is not planned');});

test('the store keeps planning settings apart from collection and uses them when generating',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-habits-')),s=new Store(dir);
 try{const real=Date.now();C.configure(TZ);let date=PL.nextDay(C.dayKey(real));while(PL.isoDay(date)>5)date=PL.nextDay(date);s.importSnapshot(snap(date,new Date(real-60000)));
  a.equal(s.planSettings(),null);const rec=s.generatePlan(date);a.ok(rec.blocks.some(b=>b.sourceRefs[0].kind==='habit'),'recommended goals apply until settings are saved');a.match(rec.assumptions.join(' '),/Breaks kept free: 12:00–13:00, 18:00–19:00/);a.throws(()=>s.savePlanSettings({dayStart:'05:00'}),/07:00/);a.equal(s.planSettings(),null,'nothing saved on error');
  s.savePlanSettings(settings);a.equal(s.planSettings().habits.length,2);
  const r=s.generatePlan(date);a.ok(r.blocks.some(b=>b.sourceRefs[0].kind==='habit'));
  s.importSnapshot(snap(date,new Date(real-30000)));a.equal(s.planSettings().habits.length,2,'a collection import leaves the settings alone');}
 finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}});

test('quizzes and exams get review time before them, spread over the days before, whatever their submission status',()=>{
 const date='2026-10-14',now=C.zonedISO(date,'06:00'),only=x=>PL.planSettings({...settings,dayStart:'09:00',habits:[]});
 const exam=(due,extra={})=>d=>{d.assignments=[{...d.assignments[0],id:'exam-1',title:'Exam 1',status:'unknown',estimateMinutes:90,dueAt:due,...extra}];return d;};
 const near=PL.plan({snapshot:snap(date,now,exam(C.zonedISO('2026-10-16','10:00'))),date,now,settings:only()});
 const rev=near.blocks.filter(b=>b.sourceRefs[0].id==='exam-1');a.deepEqual(rev.map(b=>b.title),['Review: Exam 1','Review: Exam 1']);
 a.equal(rev.reduce((n,b)=>n+(Date.parse(b.end)-Date.parse(b.start))/60000,0),120,'at most 120 review minutes on one day');a.match(rev[0].reason,/Review for the exam/);
 const far=PL.plan({snapshot:snap(date,now,exam(C.zonedISO('2026-10-25','10:00'))),date,now,settings:only()});
 a.equal(far.blocks.filter(b=>b.sourceRefs[0].id==='exam-1').length,0);a.match(far.unscheduled.find(u=>u.id==='exam-1').reason,/Review starts 5 days before/);
 const quiz=PL.plan({snapshot:snap(date,now,exam(C.zonedISO('2026-10-15','09:00'),{id:'quiz-7',title:'Quiz: Pricing',estimateMinutes:null,status:'not_submitted'})),date,now,settings:only()});
 a.deepEqual(quiz.blocks.filter(b=>b.sourceRefs[0].id==='quiz-7').map(b=>[b.title,local(b.start),local(b.end)]),[['Review: Quiz: Pricing','09:00','10:00']]);
 const done=PL.plan({snapshot:snap(date,now,exam(C.zonedISO('2026-10-16','10:00'),{status:'submitted'})),date,now,settings:only()});a.equal(done.blocks.length,0);});

test('interview email gets preparation first; handled or past interviews do not',()=>{
 const date='2026-10-14',now=C.zonedISO(date,'06:00'),only=PL.planSettings({...settings,dayStart:'09:00'});
 const mail=(triage)=>d=>{d.email={...d.email,enabled:true,messages:[{...d.email.messages[0],id:'m-int',subject:'Interview invitation',triage:{category:'interview',priority:'high',summary:'Final round with Example Co',action:'Prepare',dueAt:null,...triage}}]};return d;};
 const r=PL.plan({snapshot:snap(date,now,mail({dueAt:C.zonedISO('2026-10-15','15:00')})),date,now,settings:only});
 a.equal(r.blocks[0].title,'Interview prep: Final round with Example Co','interview preparation comes before urgent coursework');a.equal(local(r.blocks[0].start),'09:00');
 a.equal(r.blocks.filter(b=>b.sourceRefs[0].kind==='email').reduce((n,b)=>n+(Date.parse(b.end)-Date.parse(b.start))/60000,0),120);
 const undated=PL.plan({snapshot:snap(date,now,mail({})),date,now,settings:only});a.equal(undated.blocks.filter(b=>b.sourceRefs[0].kind==='email').length,1);
 a.equal(PL.plan({snapshot:snap(date,now,mail({})),date,now,settings:only,emailTriage:{'m-int':{handled:true}}}).blocks.filter(b=>b.sourceRefs[0].kind==='email').length,0,'handled');
 a.equal(PL.plan({snapshot:snap(date,now,mail({category:'info'})),date,now,settings:only,emailTriage:{'m-int':{category:'interview'}}}).blocks.filter(b=>b.sourceRefs[0].kind==='email').length,1,'the owner can mark mail as an interview');
 a.equal(PL.plan({snapshot:snap(date,now,mail({dueAt:C.zonedISO('2026-10-13','15:00')})),date,now,settings:only}).blocks.filter(b=>b.sourceRefs[0].kind==='email').length,0,'past interview');});
