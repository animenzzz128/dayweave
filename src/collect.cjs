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
 const out=assignments.map(a=>({...a})),seen=new Set(),added=[],updated=[];let addedCourses=[];
 const byId=new Map(out.map(a=>[canvasId(a),a]).filter(([k])=>k));
 for(const item of canvas.items.filter(x=>x.kind==='assignment'&&x.assignmentId)){
  const dueAt=item.start||(item.date?item.date+'T23:59:00Z':null);
  let a=byId.get(item.assignmentId);if(!a){const same=out.filter(x=>!canvasId(x)&&!x.archivedFromSource&&norm(x.title)===norm(item.title));if(same.length===1)a=same[0];}
  if(a){if(a.dueAt!==dueAt)updated.push(a.id);a.dueAt=dueAt;a.canvasAssignmentId=item.assignmentId;delete a.archivedFromSource;seen.add(a.id);byId.set(item.assignmentId,a);continue;}
  let course=courses.concat(addedCourses).find(c=>item.course&&c.code&&norm(item.course).startsWith(norm(c.code)));
  if(!course&&item.course){course={id:'canvas-course-'+(item.courseId||norm(item.course).replace(/[^a-z0-9]+/g,'-')),code:item.course,name:item.course,category:'academic',note:'Added from the Canvas calendar feed.'};if(item.url)course.source=new URL(item.url).origin;addedCourses.push(course);}
  const record={id:'canvas-'+item.assignmentId,courseId:course?.id||null,course:course?.code||item.course||'',title:item.title,dueAt,status:'unknown',requirement:'uncertain',sourceId:'canvas',
   source:item.url||'',canvasAssignmentId:item.assignmentId,estimateMinutes:null,evidence:'Canvas calendar feed: title and due time only. Submission state and whether the work is required are not in the feed.',
   description:'',materials:'',checklist:[],aiPolicy:'Unknown: check the course policy before asking for help.'};
  if(!record.source)delete record.source;out.push(record);byId.set(item.assignmentId,record);seen.add(record.id);added.push(record.id);}
 const removed=out.filter(a=>canvasId(a)&&!seen.has(a.id)&&!a.archivedFromSource&&a.dueAt&&Date.parse(a.dueAt)>=from&&Date.parse(a.dueAt)<=to).map(a=>a.id);
 addedCourses=addedCourses.filter((c,i,all)=>all.findIndex(x=>x.id===c.id)===i&&!courses.some(x=>x.id===c.id));
 return {assignments:out.filter(a=>!removed.includes(a.id)),courses:[...courses,...addedCourses],added,updated,removed};}
// reads: {canvas, calendar:{status,note,events,coverage}, email:{...contract email record} | {status:'failed',note}, notes}
function buildSnapshot(current,{canvas,calendar,email,notes={}},{now=Date.now()}={}){
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
 d.sources=sources;for(const k of ['summary','coverageNote','weeklyReview'])if(typeof notes[k]==='string')d[k]=notes[k];for(const k of ['priorities','questions'])if(Array.isArray(notes[k]))d[k]=notes[k];
 C.validate(d);return {snapshot:d,report};}
module.exports={buildSnapshot,mergeCanvas,canvasId};
