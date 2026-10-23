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
