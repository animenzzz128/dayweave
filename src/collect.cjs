'use strict';
// Cloud collection (#56): builds the next snapshot from the current one plus three reads. The assistant supplies the Google
// Calendar and Gmail reads (connector output in contract shape); the Canvas feed comes from the server. Everything the reads
// do not cover (courses, curated assignment details, career, proposals, receipts) is carried forward unchanged.
const C=require('./core.cjs');
const DOWN=['failed','unavailable'],norm=s=>String(s||'').toLowerCase().replace(/\s+/g,' ').trim();
const canvasId=a=>a.canvasAssignmentId||(String(a.source||'').match(/(?:\/assignments\/|#assignment_)(\d+)/)||[])[1]||(String(a.id).match(/^canvas-(\d+)$/)||[])[1]||null;
function setSource(sources,id,patch){const i=sources.findIndex(s=>s.id===id),next=[...sources];next[i<0?next.length:i]={...(i<0?{id,name:patch.name||id}:sources[i]),...patch};return next;}
// Feed items update the due time of the matching assignment (by Canvas assignment ID, else one exact title match) and add new
// ones as unknown-status, uncertain-requirement records: the feed says nothing about submission or whether work is required.
// A feed-linked assignment due inside the feed window that the feed no longer lists is left out, so the import archives it.
function mergeCanvas(assignments,courses,canvas,now){
 const window=canvas.window||{pastDays:14,futureDays:180},from=now-window.pastDays*86400000,to=now+window.futureDays*86400000;
 const out=assignments.map(a=>({...a})),seen=new Set(),added=[],updated=[],items=canvas.items.filter(x=>x.kind==='assignment'&&x.assignmentId);
 courses=courses.map(c=>({...c}));const byId=new Map(out.map(a=>[canvasId(a),a]).filter(([k])=>k));
 // A Canvas site (including a merged site whose name matches no course code) belongs to the course of the assignments already
 // matched to it; `canvasCourseIds` records that link. A site linked to two courses is ambiguous and not used for new work.
 const link=(course,id)=>{if(course&&id&&!(course.canvasCourseIds||[]).includes(id))course.canvasCourseIds=[...(course.canvasCourseIds||[]),id];};
 const match=item=>{let a=byId.get(item.assignmentId);if(!a){const same=out.filter(x=>!canvasId(x)&&!x.archivedFromSource&&norm(x.title)===norm(item.title));if(same.length===1)a=same[0];}return a;};
 for(const item of items){const a=match(item);if(a)link(courses.find(c=>c.id===a.courseId),item.courseId);}
 const courseFor=item=>{const linked=courses.filter(c=>item.courseId&&(c.canvasCourseIds||[]).includes(item.courseId));if(linked.length===1)return linked[0];if(linked.length>1)return null;
  return courses.find(c=>item.course&&c.code&&norm(item.course).startsWith(norm(c.code)));};
 for(const item of items){
  const dueAt=item.start||(item.date?item.date+'T23:59:00Z':null);let a=match(item);
  if(a){if(a.dueAt!==dueAt)updated.push(a.id);a.dueAt=dueAt;a.canvasAssignmentId=item.assignmentId;delete a.archivedFromSource;seen.add(a.id);byId.set(item.assignmentId,a);continue;}
  let course=courseFor(item);
  if(!course&&item.course&&!courses.some(c=>item.courseId&&(c.canvasCourseIds||[]).includes(item.courseId))){course={id:'canvas-course-'+(item.courseId||norm(item.course).replace(/[^a-z0-9]+/g,'-')),code:item.course,name:item.course,category:'academic',note:'Added from the Canvas calendar feed.',...(item.courseId?{canvasCourseIds:[item.courseId]}:{})};if(item.url)course.source=new URL(item.url).origin;courses.push(course);}
  const record={id:'canvas-'+item.assignmentId,courseId:course?.id||null,course:course?.code||item.course||'',title:item.title,dueAt,status:'unknown',requirement:'uncertain',sourceId:'canvas',
   source:item.url||'',canvasAssignmentId:item.assignmentId,estimateMinutes:null,evidence:'Canvas calendar feed: title and due time only. Submission state and whether the work is required are not in the feed.',
   description:'',materials:'',checklist:[],aiPolicy:'Unknown: check the course policy before asking for help.'};
  if(!record.source)delete record.source;out.push(record);byId.set(item.assignmentId,record);seen.add(record.id);added.push(record.id);}
 const removed=out.filter(a=>canvasId(a)&&!seen.has(a.id)&&!a.archivedFromSource&&a.dueAt&&Date.parse(a.dueAt)>=from&&Date.parse(a.dueAt)<=to).map(a=>a.id);
 return {assignments:out.filter(a=>!removed.includes(a.id)),courses,added,updated,removed};}
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
// reads: {canvas, calendar:{status,note,events,coverage}, email:{...contract email record} | {status:'failed',note}, notes}
function buildSnapshot(current,{canvas,calendar,email,schedules,notes={}},{now=Date.now()}={}){
 if(!current)throw Error('No current snapshot: import or restore one before cloud collection');
 const at=new Date(now).toISOString(),d=structuredClone(current),report={};let sources=d.sources;
 delete d.actionHistory;// receipts are recorded only in the database; the merge keeps them.
 d.generatedAt=at;
 if(canvas&&canvas.status!=='unconfigured'){
  if(canvas.status==='ok'){const r=mergeCanvas(d.assignments,d.courses,canvas,now);d.assignments=r.assignments;d.courses=r.courses;report.canvas={added:r.added,updated:r.updated,removed:r.removed};
   sources=setSource(sources,'canvas',{name:'Canvas calendar feed',status:'ok',lastSuccess:at,note:`${canvas.items.length} feed items in the window; titles and due times only.`});}
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
 if(Array.isArray(schedules)){const r=mergeSchedules(d.courses,sources,schedules,at,now);d.courses=r.courses;sources=r.sources;report.schedules=r.report;}
 d.sources=sources;for(const k of ['summary','coverageNote','weeklyReview'])if(typeof notes[k]==='string')d[k]=notes[k];for(const k of ['priorities','questions'])if(Array.isArray(notes[k]))d[k]=notes[k];
 C.validate(d);return {snapshot:d,report};}
module.exports={buildSnapshot,mergeCanvas,mergeSchedules,scheduleChanges,canvasId};
