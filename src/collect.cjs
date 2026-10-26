'use strict';
// Cloud collection (#56): builds the next snapshot from the current one plus three reads. The assistant supplies the Google
// Calendar and Gmail reads (connector output in contract shape); the Canvas feed comes from the server. Everything the reads
// do not cover (courses, curated assignment details, career, proposals, receipts) is carried forward unchanged.
const C=require('./core.cjs'),{RENEW_DAYS}=require('./coursesite.cjs');
const DOWN=['failed','unavailable'],norm=s=>String(s||'').toLowerCase().replace(/\s+/g,' ').trim();
const canvasId=a=>a.canvasAssignmentId||(String(a.source||'').match(/(?:\/assignments\/|#assignment_)(\d+)/)||[])[1]||(String(a.id).match(/^canvas-(\d+)$/)||[])[1]||null;
function setSource(sources,id,patch){const i=sources.findIndex(s=>s.id===id),next=[...sources];next[i<0?next.length:i]={...(i<0?{id,name:patch.name||id}:sources[i]),...patch};return next;}
// A status read from a source wins over unknown or not-submitted work, and a submitted/graded/excused read always wins; a reviewed
// "submitted" is never turned back into "not submitted" (in-class work has no online submission). Returns whether it changed.
function applyStatus(a,status){if(!status||a.status===status)return false;if(['submitted','graded','excused'].includes(status)||['unknown','not_submitted'].includes(a.status)||!a.status){a.status=status;return true;}return false;}
// Instructions from a source fill an empty description; a reviewed description is kept.
const fillDescription=(a,text)=>{if(text&&!a.description){a.description=text;return true;}return false;};
// Canvas planner flags to a contract status (the token read in src/canvas.cjs); no read means no status.
const canvasStatus=x=>!x?null:x.excused?'excused':x.graded?'graded':x.submitted?'submitted':'not_submitted';
// Feed items update the due time of the matching assignment (by Canvas assignment ID, else one exact title match) and add new
// ones as unknown-status, uncertain-requirement records. The feed carries instructions, which fill an empty description; with a
// Canvas token, planner flags set submission status and work with points becomes required.
// A feed-linked assignment due inside the feed window that the feed no longer lists is left out, so the import archives it.
function mergeCanvas(assignments,courses,canvas,now){
 // Earlier collectors filed Canvas work under per-course sources; those sources are refreshed when the feed matches their work by ID.
 const refreshed=new Set();
 const window=canvas.window||{pastDays:14,futureDays:180},from=now-window.pastDays*86400000,to=now+window.futureDays*86400000;
 const out=assignments.map(a=>({...a})),seen=new Set(),added=[],updated=[],detailed=[],items=canvas.items.filter(x=>x.kind==='assignment'&&x.assignmentId);
 const flags=canvas.submissions?.status==='ok'?new Map(canvas.submissions.items.map(x=>[x.assignmentId,x])):null;
 const sourceFacts=(a,item,track=true)=>{const f=flags?.get(item.assignmentId);let changed=fillDescription(a,item.description);changed=applyStatus(a,canvasStatus(f))||changed;
  if(f&&a.requirement==='uncertain'&&f.points>0){a.requirement='required';changed=true;}if(changed&&track)detailed.push(a.id);};
 courses=courses.map(c=>({...c}));const byId=new Map(out.map(a=>[canvasId(a),a]).filter(([k])=>k));
 // A Canvas site (including a merged site whose name matches no course code) belongs to the course of the assignments already
 // matched to it; `canvasCourseIds` records that link. A site linked to two courses is ambiguous and not used for new work.
 const link=(course,id)=>{if(course&&id&&!(course.canvasCourseIds||[]).includes(id))course.canvasCourseIds=[...(course.canvasCourseIds||[]),id];};
 // Manual courses and courses read from their own site (mergeCourseSites) are not updated from the feed.
 const manual=new Set(courses.filter(c=>['manual','site'].includes(c.collection?.mode)).map(c=>c.id));
 const match=item=>{let a=byId.get(item.assignmentId);if(a&&manual.has(a.courseId))return null;if(!a){const same=out.filter(x=>!canvasId(x)&&!manual.has(x.courseId)&&!x.archivedFromSource&&norm(x.title)===norm(item.title));if(same.length===1)a=same[0];}return a;};
 for(const item of items){const a=match(item);if(a)link(courses.find(c=>c.id===a.courseId),item.courseId);}
 const courseFor=item=>{const linked=courses.filter(c=>item.courseId&&(c.canvasCourseIds||[]).includes(item.courseId));if(linked.length===1)return linked[0];if(linked.length>1)return null;
  return courses.find(c=>item.courseId&&c.id===item.courseId)||courses.find(c=>item.course&&c.code&&norm(item.course).startsWith(norm(c.code)));};
 for(const item of items){
  // An all-day feed item is due by the end of that local day; a known time on the same day is more precise and is kept.
  let a=match(item);const dueAt=item.start||(item.date?(a?.dueAt&&C.dayKey(a.dueAt)===item.date?a.dueAt:C.zonedISO(item.date,'23:59')):null);
  if(a){if(Date.parse(a.dueAt)!==Date.parse(dueAt)){updated.push(a.id);a.dueAt=dueAt;}if(canvasId(a)&&a.sourceId&&a.sourceId!=='canvas')refreshed.add(a.sourceId);a.canvasAssignmentId=item.assignmentId;delete a.archivedFromSource;sourceFacts(a,item);seen.add(a.id);byId.set(item.assignmentId,a);continue;}
  let course=courseFor(item);if(course&&manual.has(course.id))continue;
  if(!course&&item.course&&!courses.some(c=>item.courseId&&(c.canvasCourseIds||[]).includes(item.courseId))){course={id:'canvas-course-'+(item.courseId||norm(item.course).replace(/[^a-z0-9]+/g,'-')),code:item.course,name:item.course,category:'academic',note:'Added from the Canvas calendar feed.',...(item.courseId?{canvasCourseIds:[item.courseId]}:{})};if(item.url)course.source=new URL(item.url).origin;courses.push(course);}
  const record={id:'canvas-'+item.assignmentId,courseId:course?.id||null,course:course?.code||item.course||'',title:item.title,dueAt,status:'unknown',requirement:'uncertain',sourceId:'canvas',
   source:item.url||'',canvasAssignmentId:item.assignmentId,estimateMinutes:null,
   evidence:flags?.has(item.assignmentId)?`Canvas calendar feed (title, due time${item.description?', instructions':''}) and Canvas planner (submission status${flags.get(item.assignmentId).points!=null?`, ${flags.get(item.assignmentId).points} points`:''}).`:`Canvas calendar feed: title, due time${item.description?' and instructions':''}. Submission state and whether the work is required are not in the feed.`,
   description:'',materials:'',checklist:[],aiPolicy:'Unknown: check the course policy before asking for help.'};
  if(!record.source)delete record.source;sourceFacts(record,item,false);out.push(record);byId.set(item.assignmentId,record);seen.add(record.id);added.push(record.id);}
 const removed=out.filter(a=>canvasId(a)&&!seen.has(a.id)&&!a.archivedFromSource&&a.dueAt&&Date.parse(a.dueAt)>=from&&Date.parse(a.dueAt)<=to).map(a=>a.id);
 return {assignments:out.filter(a=>!removed.includes(a.id)),courses,added,updated,detailed,removed,refreshed:[...refreshed],statusRead:canvas.submissions?.status||'unconfigured',statusError:canvas.submissions?.error};}
// Courses run outside Canvas keep their reviewed assignments ("manual"); a public course schedule is read for date changes only.
// A change keeps the schedule source "partial" for a week, so Home lists it with the other source warnings.
const CHANGE_DAYS=7;
function scheduleChanges(prev,next){const group=list=>{const m=new Map();for(const x of list||[]){const k=norm(x.title);if(k)m.set(k,[...(m.get(k)||[]),x.date].sort());}return m;};
 const a=group(prev),b=group(next),out=[];for(const [k,dates] of b){const was=a.get(k);const label=next.find(x=>norm(x.title)===k).title;if(!was)out.push(`added ${label} (${dates.join(', ')})`);else if(was.join()!==dates.join())out.push(`${label} ${was.join(', ')} → ${dates.join(', ')}`);}
 for(const [k,dates] of a)if(!b.has(k))out.push(`removed ${prev.find(x=>norm(x.title)===k).title} (${dates.join(', ')})`);return out;}
function mergeSchedules(courses,sources,schedules,at,now){const report=[];courses=courses.map(c=>({...c}));
 for(const s of schedules){const course=courses.find(c=>c.id===s.courseId||s.course&&norm(c.code)===norm(s.course));if(!course){report.push({course:s.course||s.courseId,error:'No matching course'});continue;}
  const id='schedule-'+course.id,name=course.code+' schedule',manual='Assignments for this course are kept from your last review and are not updated automatically.';course.collection={mode:'manual',...(s.url?{scheduleUrl:s.url}:{})};
  if(DOWN.includes(s.status)||!Array.isArray(s.sessions)){sources=setSource(sources,id,{name,status:'failed',note:(s.note||'Course schedule could not be read.')+' '+manual,...(s.url?{source:s.url}:{})});report.push({course:course.code,status:'failed'});continue;}
  const sessions=s.sessions.filter(x=>x&&typeof x.title==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x.date)).map(x=>({date:x.date,title:x.title.slice(0,200)})),prev=course.schedule,changes=prev?scheduleChanges(prev.sessions,sessions):[];
  course.schedule={url:s.url||prev?.url||null,checkedAt:at,sessions,...(changes.length?{changedAt:at,changes}:prev?.changedAt?{changedAt:prev.changedAt,changes:prev.changes}:{})};
  const recent=course.schedule.changedAt&&now-Date.parse(course.schedule.changedAt)<CHANGE_DAYS*86400000;
  sources=setSource(sources,id,{name,status:recent?'partial':'ok',lastSuccess:at,note:recent?`Schedule changed ${course.schedule.changedAt.slice(0,10)}: ${course.schedule.changes.join('; ')}. Check the affected assignments. ${manual}`:`${sessions.length} sessions read${prev?'; no date changes':' (first read, used as the baseline)'}. ${manual}`,...(s.url?{source:s.url}:{})});
  report.push({course:course.code,status:'ok',sessions:sessions.length,changes});}
 return {courses,sources,report};}
// Course sites with their own API (src/coursesite.cjs) replace manual upkeep for their course: assignments are matched by site slug,
// else by one title in the same course (a curated title may extend the site's, e.g. "Exam 1 · prepare…" for "Exam-1"), so
// reviewed details and progress stay. New work gets ID <code>-<slug>, status unknown, and is added only if due within the last
// 14 days or later; work the site no longer lists is left out, so the import archives it. Grades are never read. When the
// connector read the owner's submissions, work with a filled-in submission (or a taken quiz) is submitted, work not yet due
// with none is not submitted, and past work with none stays unknown (an in-class exam has no online submission).
const SITE_PAST_DAYS=14,key=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''),slugCode=code=>String(code).toLowerCase().replace(/[^a-z0-9]+/g,'');
function mergeCourseSites(d,sources,sites,at,now){const report=[];let assignments=d.assignments.map(a=>({...a}));const courses=d.courses.map(c=>({...c}));
 for(const s of sites){let course=courses.find(c=>norm(c.code)===norm(s.course));
  if(!course){course={id:'site-'+slugCode(s.course),code:s.course,name:s.course,category:'academic',note:''};courses.push(course);}
  if(course.category!=='academic'){course.category='academic';course.note='';}
  course.collection={mode:'site',url:s.url};const sourceId='site-'+slugCode(s.course),name=s.course+' course site';
  if(s.status==='failed'&&!Array.isArray(s.assignments)||!Array.isArray(s.meetings)&&!Array.isArray(s.assignments)){sources=setSource(sources,sourceId,{name,status:'failed',source:s.url,note:(s.error||'Course site could not be read.')+' Earlier records are kept.'});report.push({course:s.course,status:'failed'});continue;}
  // Without a schedule read (the site was down but the connector answered) the last schedule is kept.
  const sessions=!s.meetings?course.schedule?.sessions||[]:s.meetings.filter(m=>m.meeting_type!=='no-meeting'&&typeof m.title==='string'&&Number.isFinite(Date.parse(m.begins_at))).map(m=>({date:C.dayKey(m.begins_at),title:m.title.slice(0,200),at:m.begins_at}));
  const prev=course.schedule,changes=prev&&s.meetings?scheduleChanges(prev.sessions,sessions):[];
  if(s.meetings)course.schedule={url:s.url,checkedAt:at,sessions,...(changes.length?{changedAt:at,changes}:prev?.changedAt&&now-Date.parse(prev.changedAt)<CHANGE_DAYS*86400000?{changedAt:prev.changedAt,changes:prev.changes}:{})};
  sources=sources.filter(x=>x.id!=='schedule-'+course.id);// the site's schedule replaces a public-page schedule read
  if(!Array.isArray(s.assignments)){sources=setSource(sources,sourceId,{name,status:'partial',lastSuccess:at,source:s.url,note:`${sessions.length} sessions read. ${s.error||'Assignments were not read.'}`});report.push({course:s.course,status:'partial',sessions:sessions.length});continue;}
  const prefix=slugCode(s.course)+'-',from=now-SITE_PAST_DAYS*86400000,seen=new Set(),added=[],updated=[],moved=new Set();
  const meeting=new Map((s.meetings||[]).map(m=>[m.slug,m.title]));
  const done=s.submitted||{},status=(list,id,dueAt)=>!Array.isArray(list)?null:list.includes(String(id))?'submitted':Date.parse(dueAt)>now?'not_submitted':null;
  const items=[...s.assignments.filter(x=>!x.is_draft&&x.slug&&x.title&&Date.parse(x.effective_closed_at||x.closed_at)).map(x=>({slug:x.slug,title:x.title,dueAt:x.effective_closed_at||x.closed_at,points:x.points_possible,team:!!x.is_team,body:x.body||'',status:status(done.assignments,x.slug,x.effective_closed_at||x.closed_at),read:Array.isArray(done.assignments)})),
   ...(s.quizzes||[]).filter(q=>!q.is_draft&&q.id!=null&&Date.parse(q.closed_at)).map(q=>({slug:'quiz-'+q.id,title:'Quiz: '+(meeting.get(q.meeting_slug)||q.meeting_slug||'class'),dueAt:q.closed_at,points:q.points_possible,team:false,body:'',status:status(done.quizzes,q.id,q.closed_at),read:Array.isArray(done.quizzes)}))];
  const detailed=[];
  for(const x of items){const mine=assignments.filter(a=>a.courseId===course.id);
   let a=mine.find(a=>a.siteSlug===x.slug);
   if(!a){const k=key(x.title),same=mine.filter(a=>!a.siteSlug&&!a.archivedFromSource&&(key(a.title)===k||k.length>=4&&key(a.title).startsWith(k)));if(same.length===1)a=same[0];}
   if(a){if(Date.parse(a.dueAt)!==Date.parse(x.dueAt)){updated.push(a.id);a.dueAt=x.dueAt;}if(a.sourceId!==sourceId){moved.add(a.sourceId);a.sourceId=sourceId;}a.siteSlug=x.slug;delete a.archivedFromSource;
    const filled=fillDescription(a,x.body);if(applyStatus(a,x.status)||filled)detailed.push(a.id);
    if(x.read&&/Submission state is not read\.$/.test(a.evidence||''))a.evidence=a.evidence.replace(/Submission state is not read\.$/,'Submission state read from your submissions.');seen.add(a.id);continue;}
   if(Date.parse(x.dueAt)<from)continue;
   const required=Number(x.points)>0,record={id:prefix+x.slug,courseId:course.id,course:course.code,title:x.title,dueAt:x.dueAt,status:x.status||'unknown',requirement:required?'required':'uncertain',sourceId,source:s.url,siteSlug:x.slug,estimateMinutes:null,
    evidence:`${course.code} course site API: title and due time (including any extension)${x.body?', instructions':''}${Number.isFinite(x.points)?`, ${x.points} points`:''}${x.team?', team assignment':''}. ${x.read?'Submission state read from your submissions.':'Submission state is not read.'}`,description:x.body,materials:'',checklist:[],aiPolicy:'Unknown: check the course policy before asking for help.'};
   assignments.push(record);seen.add(record.id);added.push(record.id);}
  const removed=assignments.filter(a=>a.sourceId===sourceId&&!seen.has(a.id)&&!a.archivedFromSource&&Date.parse(a.dueAt)>=from).map(a=>a.id);assignments=assignments.filter(a=>!removed.includes(a.id));
  // A source whose work all moved to the site (e.g. an earlier failed browser read) is dropped instead of warning every day.
  for(const id of moved)if(!assignments.some(a=>a.sourceId===id)&&!d.events.some(e=>e.sourceId===id))sources=sources.filter(x=>x.id!==id);
  const exp=s.tokenExpiresAt&&Date.parse(s.tokenExpiresAt),renew=exp&&exp-now<RENEW_DAYS*86400000;
  sources=setSource(sources,sourceId,{name,status:renew?'partial':'ok',lastSuccess:at,source:s.url,note:`${items.length} assignments and quizzes${s.via==='connector'?' (through the course connector)':''}${s.submitted?' with your submission status':''}, ${sessions.length} sessions read${changes.length?`; schedule changed: ${changes.join('; ')}`:''}.${renew?` The API token expires ${s.tokenExpiresAt.slice(0,10)}: create a new course:read token.`:''}`});
  report.push({course:s.course,status:'ok',added,updated,detailed,removed,sessions:sessions.length,changes,submissionsRead:!!s.submitted});}
 return {assignments,courses,sources,report};}
// Course-site meetings are class time: they join the timetable and block planning like calendar events. A meeting is skipped when
// a calendar event naming the course already overlaps it (the owner's calendar wins). A failed site read keeps its earlier events.
const SITE_EVENT_PAST_DAYS=7,SITE_EVENT_FUTURE_DAYS=120;
const minutes=v=>{const m=String(v||'').match(/^(\d+):(\d{2})(?::\d{2})?$/);return m?+m[1]*60+ +m[2]:80;};
function siteEvents(events,sites,now){const from=now-SITE_EVENT_PAST_DAYS*86400000,to=now+SITE_EVENT_FUTURE_DAYS*86400000;let out=events;const report={};
 for(const s of sites){if(!Array.isArray(s.meetings))continue;const sourceId='site-'+slugCode(s.course),code=norm(s.course);out=out.filter(e=>e.sourceId!==sourceId);let added=0;
  for(const m of s.meetings){const start=Date.parse(m.begins_at);if(m.meeting_type==='no-meeting'||!m.slug||typeof m.title!=='string'||!(start>=from&&start<=to))continue;const end=start+minutes(m.duration)*60000;
   if(out.some(e=>e.sourceId!==sourceId&&norm(e.title).includes(code)&&Date.parse(e.start)<end&&Date.parse(e.end)>start))continue;
   out.push({id:sourceId+'-meeting-'+m.slug,title:`${s.course} · ${m.title.slice(0,200)}`,start:new Date(start).toISOString(),end:new Date(end).toISOString(),busy:true,location:'',sourceId,source:s.url,calendar:s.course+' course site'});added++;}
  report[s.course]=added;}
 return {events:out,report};}
// Outlook (calendar and connector) and the old email module are retired sources (owner decision 2026-10-24). The source the
// calendar coverage or the email record names is never dropped, so a legacy Outlook snapshot still validates.
function retired(s,d){if(s.id===C.calendarSource(d.calendarCoverage)||s.id===d.email?.sourceId)return false;return /outlook/i.test(s.id+' '+(s.name||''))||/^e-?mail$/i.test(s.id)||/^e-?mail$/i.test(String(s.name||'').trim());}
// reads: {canvas, courseSites:[fetchSite results], calendar:{status,note,events,coverage}, email:{...contract email record} | {status:'failed',note}, notes}
function buildSnapshot(current,{canvas,courseSites,calendar,email,schedules,notes={}},{now=Date.now()}={}){
 if(!current)throw Error('No current snapshot: import or restore one before cloud collection');
 const at=new Date(now).toISOString(),d=structuredClone(current),report={};C.configure(d.timezone);let sources=d.sources;
 delete d.actionHistory;// receipts are recorded only in the database; the merge keeps them.
 d.generatedAt=at;
 // Schedules first: they mark courses manual, and the Canvas merge never matches a manual course's work.
 if(Array.isArray(schedules)){const r=mergeSchedules(d.courses,sources,schedules,at,now);d.courses=r.courses;sources=r.sources;report.schedules=r.report;}
 // Course sites next: they turn a manual course into a read one, after any public-page schedule read and before the Canvas feed.
 if(Array.isArray(courseSites)&&courseSites.length){const r=mergeCourseSites(d,sources,courseSites,at,now);d.assignments=r.assignments;d.courses=r.courses;sources=r.sources;report.courseSites=r.report;}
 if(canvas&&canvas.status!=='unconfigured'){
  if(canvas.status==='ok'){const r=mergeCanvas(d.assignments,d.courses,canvas,now);d.assignments=r.assignments;d.courses=r.courses;report.canvas={added:r.added,updated:r.updated,detailed:r.detailed,removed:r.removed,status:r.statusRead,...(r.statusError?{statusError:r.statusError}:{})};
   // A failed token read leaves the feed current but says that submission status was not refreshed.
   const statusNote=r.statusRead==='ok'?' Submission status read from the Canvas planner.':r.statusRead==='failed'?` Submission status not read: ${r.statusError}.`:' Submission status is not read (no Canvas access token).';
   sources=setSource(sources,'canvas',{name:'Canvas calendar feed',status:r.statusRead==='failed'?'partial':'ok',lastSuccess:at,note:`${canvas.items.length} feed items in the window; titles, due times and instructions.${statusNote}`});
   // A per-course source whose work the feed matched is current again; otherwise the import would keep its old copies and drop the new due dates.
   for(const id of r.refreshed)if(sources.some(s=>s.id===id))sources=setSource(sources,id,{status:'ok',lastSuccess:at,note:'Due dates refreshed from the Canvas calendar feed; submission status and details are from your last review.'});}
  else{report.canvas={status:'failed',error:canvas.error};sources=setSource(sources,'canvas',{name:'Canvas calendar feed',status:'failed',note:canvas.error||'Canvas feed could not be read.'});}}
 if(calendar){const old=d.calendarCoverage||{};
  if(DOWN.includes(calendar.status)){sources=setSource(sources,'google-calendar',{status:calendar.status,note:calendar.note||'Google Calendar could not be read.'});if(d.calendarCoverage)d.calendarCoverage={...old,complete:false,note:calendar.note||'Calendar read failed; earlier events retained.'};report.calendar={status:calendar.status};}
  else{const cov=calendar.coverage||{};if(old.provider==='google'&&(cov.account!==old.account||cov.calendarId!==old.calendarId))throw Error('Calendar identity changed ('+old.account+' → '+cov.account+'): stop and ask the owner; never switch accounts in a scheduled run');
   d.events=calendar.events;d.calendarCoverage={...cov,checkedAt:cov.checkedAt||at};
   sources=setSource(sources,'google-calendar',{name:'Google Calendar',status:calendar.status==='ok'&&cov.complete?'ok':'partial',lastSuccess:at,note:calendar.note||`${calendar.events.length} events read.`});report.calendar={status:calendar.status,events:calendar.events.length};}}
 if(email){const failed=email.status&&DOWN.includes(email.status)||email.coverage?.status==='failed';
  if(d.email?.account&&email.account&&email.account!==d.email.account)throw Error('Gmail account changed: stop and ask the owner; never switch accounts in a scheduled run');
  if(failed){sources=setSource(sources,'gmail',{status:'failed',note:email.note||email.coverage?.note||'Gmail could not be read.'});if(email.enabled)d.email=email;report.email={status:'failed'};}
  else{d.email=email;sources=setSource(sources,'gmail',{name:'Gmail (Yale label)',status:email.coverage?.status==='complete'?'ok':'partial',lastSuccess:at,note:`${email.messages.length} messages from ${email.request?.query}.`});report.email={status:email.coverage?.status,messages:email.messages.length};}}
 if(Array.isArray(courseSites)&&courseSites.length){const r=siteEvents(d.events,courseSites,now);d.events=r.events;report.siteEvents=r.report;}
 // A course outside Canvas is not read automatically: its own sources say so instead of warning as failed every day.
 const manualCourses=new Set(d.courses.filter(c=>c.collection?.mode==='manual').map(c=>c.id));
 for(const s of sources){const work=d.assignments.filter(a=>a.sourceId===s.id);if(s.status!=='ok'&&s.status!=='manual'&&work.length&&work.every(a=>manualCourses.has(a.courseId)))sources=setSource(sources,s.id,{status:'manual',note:'Kept from your last review; this course\'s site needs its own sign-in and is not read automatically.'});}
 // Retired sources are dropped instead of failing every day: Gmail label:Yale is the only mail source and Google Calendar the only calendar.
 d.sources=sources.filter(s=>!retired(s,d));
 // A summary and priorities describe the run that wrote them; without new notes the old ones would read as today's, so they are cleared.
 for(const k of ['summary','coverageNote'])if(typeof notes[k]==='string')d[k]=notes[k];else delete d[k];
 d.priorities=Array.isArray(notes.priorities)?notes.priorities:[];
 if(typeof notes.weeklyReview==='string')d.weeklyReview=notes.weeklyReview;if(Array.isArray(notes.questions))d.questions=notes.questions;
 C.validate(d);return {snapshot:d,report};}
module.exports={buildSnapshot,mergeCanvas,mergeCourseSites,siteEvents,mergeSchedules,scheduleChanges,canvasId};
