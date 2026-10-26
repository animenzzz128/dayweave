const {test}=require('node:test'),a=require('node:assert/strict');
const S=require('../src/coursesite.cjs'),{buildSnapshot}=require('../src/collect.cjs');
const NOW=Date.parse('2026-10-07T12:00:00Z'),base=()=>structuredClone(require('../examples/google-snapshot.json'));
const jwt=exp=>'h.'+Buffer.from(JSON.stringify({exp:Math.floor(exp/1000)})).toString('base64url')+'.sig',TOKEN=jwt(NOW+90*86400000);
const meetings=[{slug:'intro',title:'Introduction',begins_at:'2026-10-05T17:00:00+00:00',meeting_type:'lecture',is_draft:false},{slug:'exam',title:'Exam-1',begins_at:'2026-10-14T17:00:00+00:00',meeting_type:'lecture',is_draft:false},{slug:'break',title:'Break',begins_at:'2026-10-19T17:00:00+00:00',meeting_type:'no-meeting',is_draft:false}];
const assignments=[{slug:'brief',title:'Research brief',points_possible:20,is_team:false,is_draft:false,closed_at:'2026-10-10T03:59:00+00:00',effective_closed_at:'2026-10-11T03:59:00+00:00'},
 {slug:'exam-1',title:'Exam-1',points_possible:240,is_team:false,is_draft:false,closed_at:'2026-10-14T20:00:00+00:00',effective_closed_at:'2026-10-14T20:00:00+00:00'},
 {slug:'sprint',title:'Sprint 1',points_possible:10,is_team:true,is_draft:false,closed_at:'2026-10-20T04:59:00+00:00',effective_closed_at:'2026-10-20T04:59:00+00:00'},
 {slug:'old',title:'Old warm-up',points_possible:5,is_team:false,is_draft:false,closed_at:'2026-09-05T03:59:00+00:00',effective_closed_at:'2026-09-05T03:59:00+00:00'},
 {slug:'draft',title:'Draft',points_possible:5,is_team:false,is_draft:true,closed_at:'2026-11-05T03:59:00+00:00',effective_closed_at:'2026-11-05T03:59:00+00:00'}];
const quizzes=[{id:7,meeting_slug:'intro',points_possible:3,is_draft:false,open_at:null,closed_at:'2026-10-09T18:20:00+00:00'}];
function fakeFetch(calls){return async(url,init)=>{calls.push({url,auth:init.headers.Authorization});const view=new URL(url).pathname.split('/').pop();
 if(view!=='meetings'&&init.headers.Authorization!=='Bearer '+TOKEN)return {ok:false,status:401,text:async()=>'{}'};
 return {ok:true,status:200,text:async()=>JSON.stringify({meetings,my_assignments:assignments,quizzes}[view])};};}

test('course sites come from the environment with a token per course code',()=>{
 const sites=S.sitesFromEnv({DAYWEAVE_COURSE_SITES:'COURSE A=https://www.course-a.example/x; COURSE Z=https://z.example',DAYWEAVE_COURSE_TOKEN_COURSE_A:' t1 '});
 a.deepEqual(sites,[{course:'COURSE A',url:'https://www.course-a.example',token:'t1'},{course:'COURSE Z',url:'https://z.example',token:''}]);
 a.deepEqual(S.sitesFromEnv({}),[]);a.throws(()=>S.sitesFromEnv({DAYWEAVE_COURSE_SITES:'A=http://a.example'}),/https/);a.throws(()=>S.sitesFromEnv({DAYWEAVE_COURSE_SITES:'https://a.example'}),/entries look like/);
 a.equal(S.tokenKey('MGT 656'),'DAYWEAVE_COURSE_TOKEN_MGT_656');a.equal(S.tokenExpiry(TOKEN),new Date(Math.floor((NOW+90*86400000)/1000)*1000).toISOString());a.equal(S.tokenExpiry('opaque'),null);});

test('a site read returns titles, due times and the schedule, sends the token only to private views and never echoes it',async()=>{
 const calls=[],r=await S.fetchSite({course:'COURSE A',url:'https://a.example',token:TOKEN},{fetch:fakeFetch(calls),now:NOW});
 a.equal(r.status,'ok');a.equal(r.assignments.length,5);a.equal(r.meetings.length,3);a.equal(r.quizzes.length,1);a.doesNotMatch(JSON.stringify(r),new RegExp(TOKEN.split('.')[1]));
 a.equal(calls.find(c=>c.url.includes('/rest/meetings')).auth,undefined);a.ok(calls.every(c=>c.url.startsWith('https://a.example/rest/')));a.ok(calls.every(c=>!/submissions|grades/.test(c.url)));
 const noToken=await S.fetchSite({course:'COURSE A',url:'https://a.example',token:''},{fetch:fakeFetch([]),now:NOW});a.equal(noToken.status,'partial');a.equal(noToken.assignments,undefined);a.equal(noToken.meetings.length,3);
 const bad=await S.fetchSite({course:'COURSE A',url:'https://a.example',token:'wrong-token'},{fetch:fakeFetch([]),now:NOW});a.equal(bad.status,'failed');a.match(bad.error,/HTTP 401/);a.doesNotMatch(bad.error,/wrong-token/);
 const down=await S.fetchSite({course:'COURSE A',url:'https://a.example',token:TOKEN},{fetch:async()=>{throw Error('getaddrinfo https://a.example?token=x');},now:NOW});a.equal(down.error,'COURSE A course API could not be read');});

test('site work updates matched assignments, adds new work, keeps reviewed details, and replaces manual upkeep',async()=>{
 const d=base();d.courses[0].collection={mode:'manual'};d.sources.push({id:'schedule-course-a',name:'COURSE A schedule',status:'ok'});
 d.assignments.push({...d.assignments[0],id:'exam-a',title:'Exam 1 · prepare for closed-book assessment',dueAt:'2026-10-14T16:00:00-04:00',sourceId:'old-site'});d.sources.push({id:'old-site',name:'COURSE A website',status:'failed'});
 const site=await S.fetchSite({course:'COURSE A',url:'https://a.example',token:TOKEN},{fetch:fakeFetch([]),now:NOW});
 const {snapshot:s,report}=buildSnapshot(d,{courseSites:[site]},{now:NOW}),by=Object.fromEntries(s.assignments.map(x=>[x.id,x]));
 a.deepEqual(report.courseSites[0].added,['coursea-sprint','coursea-quiz-7']);a.deepEqual(report.courseSites[0].updated,['brief-a'],'the exam time already matches');
 a.equal(by['brief-a'].dueAt,'2026-10-11T03:59:00+00:00','the extension-aware deadline wins');a.equal(by['brief-a'].description,d.assignments[0].description);a.equal(by['brief-a'].status,d.assignments[0].status);a.equal(by['brief-a'].siteSlug,'brief');
 a.equal(by['exam-a'].title,'Exam 1 · prepare for closed-book assessment','a curated title that extends the site title still matches');a.equal(by['exam-a'].sourceId,'site-coursea');
 a.equal(by['coursea-sprint'].status,'unknown');a.equal(by['coursea-sprint'].requirement,'required');a.match(by['coursea-sprint'].evidence,/team assignment/);a.equal(by['coursea-quiz-7'].title,'Quiz: Introduction');
 a.equal(by['coursea-old'],undefined,'long-past work is not added');a.equal(by['coursea-draft'],undefined);
 const course=s.courses.find(c=>c.id==='course-a');a.deepEqual(course.collection,{mode:'site',url:'https://a.example'});a.deepEqual(course.schedule.sessions.map(x=>x.title),['Introduction','Exam-1']);a.equal(course.schedule.sessions[0].date,'2026-10-05');
 a.equal(s.sources.some(x=>x.id==='old-site'),false,'a source whose work all moved is dropped');a.equal(s.sources.some(x=>x.id==='schedule-course-a'),false);a.equal(s.sources.find(x=>x.id==='site-coursea').status,'ok');
 // Next day: the site withdrew one item, and the stored copy is matched by slug even after the title changes.
 const later={...site,assignments:site.assignments.filter(x=>x.slug!=='sprint').map(x=>x.slug==='brief'?{...x,title:'Research brief (final)'}:x)};
 const next=buildSnapshot(s,{courseSites:[later]},{now:NOW}).snapshot;a.ok(next.assignments.some(x=>x.id==='brief-a'));a.equal(next.assignments.some(x=>x.id==='coursea-sprint'),false);
 // A failed read keeps everything and says so.
 const failed=buildSnapshot(s,{courseSites:[{course:'COURSE A',url:'https://a.example',status:'failed',error:'COURSE A course API timed out'}]},{now:NOW}).snapshot;a.deepEqual(failed.assignments,s.assignments);a.equal(failed.sources.find(x=>x.id==='site-coursea').status,'failed');});

test('a new or unpublished course becomes academic, the Canvas feed leaves site courses alone, and an expiring token is flagged',async()=>{
 const d=base(),site=await S.fetchSite({course:'COURSE C',url:'https://c.example',token:jwt(NOW+5*86400000)},{fetch:async(url,init)=>({ok:true,status:200,text:async()=>JSON.stringify(url.includes('meetings')?meetings:url.includes('quizzes')?[]:[{...assignments[2],slug:'paper',title:'Research brief'}])}),now:NOW});
 const canvas={status:'ok',window:{pastDays:14,futureDays:180},items:[{uid:'event-assignment-9',kind:'assignment',assignmentId:'9',courseId:'99',course:'COURSE C',title:'Canvas only',start:'2026-10-20T03:59:00Z',date:null,url:null}]};
 const s=buildSnapshot(d,{courseSites:[site],canvas},{now:NOW}).snapshot,c=s.courses.find(x=>x.code==='COURSE C');
 a.equal(c.category,'academic');a.equal(c.note,'');a.ok(s.assignments.some(x=>x.id==='coursec-paper'&&x.courseId==='course-c'));a.equal(s.assignments.some(x=>x.id==='canvas-9'),false);
 const src=s.sources.find(x=>x.id==='site-coursec');a.equal(src.status,'partial');a.match(src.note,/expires .*new course:read token/);
 const fresh=buildSnapshot(d,{courseSites:[{...site,course:'COURSE NEW'}]},{now:NOW}).snapshot;a.ok(fresh.courses.some(x=>x.id==='site-coursenew'&&x.category==='academic'));});
