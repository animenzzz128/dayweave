const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {buildSnapshot}=require('../src/collect.cjs'),{Store}=require('../src/store.cjs');
const NOW=Date.parse('2026-10-07T12:00:00Z'),base=()=>structuredClone(require('../examples/google-snapshot.json'));
const item=(id,title,course,start,extra={})=>({uid:'event-assignment-'+id,kind:'assignment',assignmentId:id,courseId:'55',course,title,start,end:start,date:null,url:'https://lms.example.edu/calendar?include_contexts=course_55#assignment_'+id,...extra});
const feed=items=>({status:'ok',fetchedAt:new Date(NOW).toISOString(),window:{pastDays:14,futureDays:180},items});
const calendar=(d,events)=>({status:'ok',events,coverage:{...d.calendarCoverage,checkedAt:new Date(NOW).toISOString()}});

test('Canvas feed items update matching assignments, add new ones as unknown and uncertain, and drop withdrawn feed work',()=>{
 const d=base(),first=buildSnapshot(d,{canvas:feed([item('501','Research brief','COURSE A 01','2026-10-10T03:59:00Z'),item('502','Lab report','COURSE A 01 (FA26)','2026-10-15T03:59:00Z'),item('503','Quiz','COURSE Z','2026-10-16T03:59:00Z',{courseId:'77'})])},{now:NOW});
 const s=first.snapshot,by=Object.fromEntries(s.assignments.map(x=>[x.id,x]));a.deepEqual(first.report.canvas,{added:['canvas-502','canvas-503'],updated:['brief-a'],removed:[]});
 a.equal(by['brief-a'].dueAt,'2026-10-10T03:59:00Z');a.equal(by['brief-a'].description,d.assignments[0].description,'curated details are kept');a.equal(by['brief-a'].status,d.assignments[0].status);
 a.equal(by['canvas-502'].courseId,'course-a');a.equal(by['canvas-502'].status,'unknown');a.equal(by['canvas-502'].requirement,'uncertain');a.equal(by['canvas-502'].estimateMinutes,null);
 a.equal(by['canvas-503'].courseId,'canvas-course-77');a.ok(s.courses.some(c=>c.id==='canvas-course-77'&&c.source==='https://lms.example.edu'));
 a.equal(s.sources.find(x=>x.id==='canvas').status,'ok');a.equal(s.generatedAt,'2026-10-07T12:00:00.000Z');a.equal(s.actionHistory,undefined);a.equal(s.assignments.length,d.assignments.length+2);
 const second=buildSnapshot(s,{canvas:feed([item('501','Research brief (renamed)','COURSE A 01','2026-10-10T03:59:00Z'),item('503','Quiz','COURSE Z','2026-10-16T03:59:00Z',{courseId:'77'})])},{now:NOW});
 a.deepEqual(second.report.canvas.removed,['canvas-502']);a.ok(second.snapshot.assignments.some(x=>x.id==='brief-a'),'matched by its Canvas ID after a rename');a.equal(second.snapshot.courses.filter(c=>c.id==='canvas-course-77').length,1);
 const failed=buildSnapshot(s,{canvas:{status:'failed',error:'Canvas feed returned HTTP 401',items:[]}},{now:NOW});a.equal(failed.snapshot.sources.find(x=>x.id==='canvas').status,'failed');a.deepEqual(failed.snapshot.assignments,s.assignments);
 a.equal(buildSnapshot(d,{canvas:{status:'unconfigured',items:[]}},{now:NOW}).snapshot.sources.some(x=>x.id==='canvas'),false);});

test('calendar and Gmail reads replace their parts, failures keep records, and a changed account stops the run',()=>{
 const d=base(),ev={id:'gcal-new',title:'Office hours',start:'2026-10-08T15:00:00Z',end:'2026-10-08T16:00:00Z',busy:true,sourceId:'google-calendar',provider:'google',account:d.calendarCoverage.account,calendarId:d.calendarCoverage.calendarId,calendar:'Student'};
 const ok=buildSnapshot(d,{calendar:calendar(d,[ev])},{now:NOW}).snapshot;a.deepEqual(ok.events.map(e=>e.id),['gcal-new']);a.equal(ok.sources.find(x=>x.id==='google-calendar').status,'ok');
 a.throws(()=>buildSnapshot(d,{calendar:{...calendar(d,[]),coverage:{...d.calendarCoverage,account:'other@example.com'}}},{now:NOW}),/identity changed/);
 const down=buildSnapshot(d,{calendar:{status:'failed',note:'Connector sign-in expired.'}},{now:NOW}).snapshot;a.equal(down.calendarCoverage.complete,false);a.equal(down.sources.find(x=>x.id==='google-calendar').status,'failed');a.deepEqual(down.events,d.events);
 const mail=buildSnapshot(d,{email:{status:'failed',note:'Label missing.'}},{now:NOW}).snapshot;a.equal(mail.sources.find(x=>x.id==='gmail').status,'failed');a.deepEqual(mail.email,d.email);
 a.throws(()=>buildSnapshot(d,{email:{...d.email,account:'other@example.com'}},{now:NOW}),/Gmail account changed/);a.throws(()=>buildSnapshot(null,{},{now:NOW}),/No current snapshot/);
 const notes=buildSnapshot(d,{notes:{summary:'New summary',priorities:[{title:'P',detail:'D',source:'canvas'}]}},{now:NOW}).snapshot;a.equal(notes.summary,'New summary');a.equal(notes.priorities.length,1);});

test('a built snapshot imports through the store: failed sources keep records and withdrawn feed work is archived',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dayweave-collect-')),store=new Store(dir);try{store.importSnapshot(base());
  const first=buildSnapshot(store.snapshot(),{canvas:feed([item('502','Lab report','COURSE A 01','2026-10-15T03:59:00Z')]),calendar:{status:'failed',note:'x'},email:{status:'failed',note:'y'}},{now:NOW}).snapshot;
  a.deepEqual(store.previewImport(first).archived,[]);store.importSnapshot(first);const s=store.snapshot();a.ok(s.assignments.some(x=>x.id==='canvas-502'));a.deepEqual(s.events.map(e=>e.id),base().events.map(e=>e.id),'failed calendar keeps events');a.equal(s.calendarCoverage.complete,false);
  const second=buildSnapshot(store.snapshot(),{canvas:feed([])},{now:NOW}).snapshot;a.deepEqual(store.previewImport(second).archived,['canvas-502']);store.importSnapshot(second);a.equal(store.snapshot().assignments.find(x=>x.id==='canvas-502').archivedFromSource,true);
 }finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}});

test('a merged Canvas site is linked to its course through matched work, and an ambiguous site adds no course',()=>{
 const d=base(),site=(id,title,extra)=>item(id,title,'Merged site FA26','2026-10-20T03:59:00Z',{courseId:'88',...extra});
 const first=buildSnapshot(d,{canvas:feed([site('601','Group presentation'),site('602','Peer review')])},{now:NOW}).snapshot,by=Object.fromEntries(first.assignments.map(x=>[x.id,x]));
 a.equal(by['canvas-602'].courseId,'course-b');a.deepEqual(first.courses.find(c=>c.id==='course-b').canvasCourseIds,['88']);a.equal(first.courses.some(c=>c.id==='canvas-course-88'),false);
 a.equal(buildSnapshot(first,{canvas:feed([site('603','Final memo')])},{now:NOW}).snapshot.assignments.find(x=>x.id==='canvas-603').courseId,'course-b','the link persists in the snapshot');
 const both=buildSnapshot(d,{canvas:feed([site('604','Research brief'),site('601','Group presentation'),site('605','Lab')])},{now:NOW}).snapshot;
 a.equal(both.assignments.find(x=>x.id==='canvas-605').courseId,null);a.equal(both.courses.length,d.courses.length);});

test('a manual course keeps its assignments, a public schedule is a baseline first and a date change warns for a week',()=>{
 const d=base(),url='https://course-b.example.edu/meetings',sessions=[{date:'2026-10-14',title:'Exam 1'},{date:'2026-12-09',title:'Exam 2'},{date:'2026-10-21',title:'Class'},{date:'2026-10-28',title:'Class'}];
 const first=buildSnapshot(d,{schedules:[{course:'COURSE B',url,status:'ok',sessions}]},{now:NOW}),src=s=>s.sources.find(x=>x.id==='schedule-course-b');
 a.deepEqual(first.report.schedules,[{course:'COURSE B',status:'ok',sessions:4,changes:[]}]);a.equal(src(first.snapshot).status,'ok');a.match(src(first.snapshot).note,/baseline.*not updated automatically/);
 const b=first.snapshot.courses.find(c=>c.id==='course-b');a.deepEqual(b.collection,{mode:'manual',scheduleUrl:url});a.deepEqual(first.snapshot.assignments,d.assignments.map(x=>x),'assignments untouched');
 const moved=[{date:'2026-10-14',title:'Exam 1'},{date:'2026-12-10',title:'Exam 2'},{date:'2026-10-21',title:'Class'},{date:'2026-11-04',title:'Guest talk'}];
 const second=buildSnapshot(first.snapshot,{schedules:[{course:'COURSE B',url,status:'ok',sessions:moved}]},{now:NOW});
 a.deepEqual(second.report.schedules[0].changes,['Exam 2 2026-12-09 → 2026-12-10','Class 2026-10-21, 2026-10-28 → 2026-10-21','added Guest talk (2026-11-04)']);a.equal(src(second.snapshot).status,'partial');a.match(src(second.snapshot).note,/Exam 2 2026-12-09 → 2026-12-10/);
 const later=buildSnapshot(second.snapshot,{schedules:[{course:'COURSE B',url,status:'ok',sessions:moved}]},{now:NOW+3*86400000});a.equal(src(later.snapshot).status,'partial','still warning within a week');
 const week=buildSnapshot(later.snapshot,{schedules:[{course:'COURSE B',url,status:'ok',sessions:moved}]},{now:NOW+8*86400000});a.equal(src(week.snapshot).status,'ok');
 const failed=buildSnapshot(week.snapshot,{schedules:[{course:'COURSE B',url,status:'failed',note:'Site timed out.'}]},{now:NOW});a.equal(src(failed.snapshot).status,'failed');a.deepEqual(failed.snapshot.courses.find(c=>c.id==='course-b').schedule.sessions,moved,'a failed read keeps the last schedule');
 a.deepEqual(buildSnapshot(d,{schedules:[{course:'NOPE 1',status:'ok',sessions:[]}]},{now:NOW}).report.schedules,[{course:'NOPE 1',error:'No matching course'}]);});

test('feed matches refresh legacy per-course Canvas sources, a course ID equal to the site ID files new work, and manual courses stop warning',()=>{
 const d=base();d.sources.push({id:'legacy-55',name:'Old Canvas collector',status:'failed',note:'Site unreadable.'},{id:'legacy-b',name:'Course B site',status:'failed',note:'Needs sign-in.'});
 d.courses.push({id:'55',code:'COURSE C',name:'Course C',category:'academic'});
 d.assignments.push({id:'701',courseId:'55',course:'COURSE C',title:'Memo',dueAt:'2026-10-12T03:59:00Z',status:'not_submitted',requirement:'required',sourceId:'legacy-55',source:'https://lms.example.edu/courses/55/assignments/701',estimateMinutes:60},
  {id:'b-legacy',courseId:'course-b',course:'COURSE B',title:'Case write-up',dueAt:'2026-10-20T03:59:00Z',status:'not_submitted',requirement:'required',sourceId:'legacy-b',estimateMinutes:60});
 for(const a of d.assignments)if(a.courseId==='course-b'&&a.id!=='b-legacy')a.sourceId='legacy-b';
 const r=buildSnapshot(d,{canvas:feed([item('701','Memo','Odd site name','2026-10-13T03:59:00Z'),item('702','Reflection','Odd site name','2026-10-14T03:59:00Z'),item('703','Case write-up','COURSE B','2026-10-21T03:59:00Z',{courseId:'99'})]),
  schedules:[{course:'COURSE B',url:'https://course-b.example.edu/meetings',status:'ok',sessions:[{date:'2026-10-14',title:'Exam 1'}]}]},{now:NOW}),s=r.snapshot,src=id=>s.sources.find(x=>x.id===id);
 a.deepEqual(r.report.canvas.updated,['701']);a.equal(src('legacy-55').status,'ok');a.equal(src('legacy-55').lastSuccess,'2026-10-07T12:00:00.000Z');
 a.equal(s.assignments.find(x=>x.id==='canvas-702').courseId,'55','course ID equal to the Canvas site ID');
 a.equal(s.assignments.find(x=>x.id==='b-legacy').dueAt,'2026-10-20T03:59:00Z','a manual course is never matched by title');a.equal(src('legacy-b').status,'manual');
 const {health}=require('../src/workload.cjs');a.equal(health(s,NOW).sources.some(x=>x.id==='legacy-b'),false);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dayweave-collect-')),store=new Store(dir);try{store.importSnapshot(d);store.importSnapshot(s);const after=store.snapshot();
  a.equal(after.assignments.find(x=>x.id==='701').dueAt,'2026-10-13T03:59:00Z','the import keeps the refreshed due date');a.equal(after.assignments.find(x=>x.id==='b-legacy').status,'not_submitted');
 }finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}});

test('an all-day feed item keeps a known time on that day, otherwise is due 23:59 local, and an equal instant is not an update',()=>{
 const d=base();d.timezone='America/New_York';d.assignments.push({id:'801',courseId:'course-a',course:'COURSE A',title:'Essay',dueAt:'2026-10-11T23:59:00-04:00',status:'not_submitted',requirement:'required',sourceId:'canvas',source:'https://lms.example.edu/courses/55/assignments/801',estimateMinutes:60},
  {id:'802',courseId:'course-a',course:'COURSE A',title:'Memo',dueAt:'2026-10-09T17:00:00-04:00',status:'not_submitted',requirement:'required',sourceId:'canvas',source:'https://lms.example.edu/courses/55/assignments/802',estimateMinutes:60});
 const r=buildSnapshot(d,{canvas:feed([item('801','Essay','COURSE A',null,{date:'2026-10-11'}),item('802','Memo','COURSE A','2026-10-09T21:00:00Z'),item('803','Poll','COURSE A',null,{date:'2026-10-12'})])},{now:NOW}),by=Object.fromEntries(r.snapshot.assignments.map(x=>[x.id,x]));
 a.deepEqual(r.report.canvas.updated,[]);a.equal(by['801'].dueAt,'2026-10-11T23:59:00-04:00');a.equal(by['802'].dueAt,'2026-10-09T17:00:00-04:00');a.equal(by['canvas-803'].dueAt,'2026-10-13T03:59:00.000Z');});
