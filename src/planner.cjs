(function(){
'use strict';
// Deterministic, advisory daily planner. It proposes personal focus blocks only inside fresh, complete Google Calendar
// coverage of the chosen day. It never writes anywhere, never invents durations or deadlines, never schedules uncertain
// evidence and never treats unknown time as free. Its output is ordinary proposals that still need an approved Q version.
const C=typeof module!=='undefined'?require('./core.cjs'):window.PlannerCore;
const P=typeof module!=='undefined'?require('./phase2.cjs'):window.PlannerPhase2;
const SETTINGS=Object.freeze({dayStart:'09:00',maxBlock:90,gap:15,reserve:0.2,step:5,staleHours:26,reminderMinutes:10,maxListed:100});
const MIN=60000,DONE=['submitted','graded','excused'],ATTEMPTED=['pending','unverified','executed'];
const validDate=k=>typeof k==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(k)&&Number.isFinite(Date.parse(k+'T00:00:00Z'))&&new Date(Date.parse(k+'T00:00:00Z')).toISOString().slice(0,10)===k;
const nextDay=k=>new Date(Date.parse(k+'T12:00:00Z')+86400000).toISOString().slice(0,10);
// FNV-1a: a short deterministic content hash so changed blocks get new action IDs and identical blocks keep theirs.
function hash(s){let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h.toString(16).padStart(8,'0');}
const attempted=(d,id)=>(d.actionHistory||[]).some(h=>h.id===id&&ATTEMPTED.includes(h.status));
// A planner block for this date that was never attempted is replaced by regeneration; everything else stays and blocks time.
const replaceable=(d,p,date)=>p.origin==='planner'&&p.planDate===date&&!attempted(d,p.id);
const refKey=r=>r.kind+':'+r.id;
// Splits explicit minutes into focus blocks of at most maxBlock minutes, as even as the 5-minute grid allows.
function chunks(minutes,max=SETTINGS.maxBlock){if(minutes<=max)return [minutes];const n=Math.ceil(minutes/max),size=Math.ceil(minutes/n/5)*5;return Array.from({length:n},(_,i)=>i<n-1?size:minutes-size*(n-1)).filter(x=>x>0);}
function merge(list){const out=[];for(const [s,e] of [...list].sort((a,b)=>a[0]-b[0]||a[1]-b[1])){const last=out[out.length-1];if(last&&s<=last[1])last[1]=Math.max(last[1],e);else out.push([s,e]);}return out;}
function minutesFree(from,to,busy){let free=0,t=from;for(const [s,e] of merge(busy)){if(e<=t)continue;if(s>=to)break;if(s>t)free+=s-t;t=Math.max(t,e);}if(t<to)free+=to-t;return Math.max(0,Math.floor(free/MIN));}
// Earliest grid-aligned start where [start, start+len) avoids every blocked interval and ends by `to`.
function slot(len,from,to,blocked,step){const up=x=>Math.ceil(x/(step*MIN))*step*MIN;let t=up(from);for(const [s,e] of blocked){if(e<=t)continue;if(t+len<=s)break;t=up(e);}return t+len<=to?t:null;}
// Coursework evidence is plannable only from a listed source with status ok, in a snapshot the health view does not call stale
// (collected within staleHours) and whose own last success is not older than that. Anything else is a reason, never a block.
function sourceProblem(d,id,now,settings=SETTINGS){
 const src=(d.sources||[]).find(s=>s&&s.id===id),limit=settings.staleHours*3600000,g=Date.parse(d.generatedAt);
 if(!src)return 'Source not listed in this snapshot. Verify it first.';
 if(src.status!=='ok')return 'Source '+src.status+': the record may be stale or incomplete. Verify it first.';
 if(!Number.isFinite(g)||+now-g>limit)return 'Source snapshot is older than '+settings.staleHours+' hours. Refresh it first.';
 if(src.lastSuccess!=null&&!(Date.parse(src.lastSuccess)>=+now-limit))return 'Source last succeeded over '+settings.staleHours+' hours ago. Refresh it first.';
 return null;
}
// Coursework that is required, not submitted, from an eligible source and has a positive estimate; everything else is listed with a reason.
function candidates(d,todos,archive,now=new Date(),settings=SETTINGS){
 const tasks=[],skipped=[];
 for(const a of d.assignments||[]){
  if(a.archivedFromSource||DONE.includes(a.status))continue;
  const ref={kind:'assignment',id:a.id,title:a.title},skip=reason=>skipped.push({...ref,reason});
  if(archive?.[a.id]){skip('Archived locally; not planned.');continue;}
  if(a.requirement==='choice'){skip('Selectable (choice) work is never scheduled automatically.');continue;}
  const problem=sourceProblem(d,a.sourceId,now,settings);if(problem){skip(problem);continue;}
  if(a.requirement!=='required'){skip('Requirement uncertain. Verify it first.');continue;}
  if(a.status!=='not_submitted'){skip('Submission status unknown. Verify it first.');continue;}
  if(!(Number.isFinite(a.estimateMinutes)&&a.estimateMinutes>0)){skip('No duration estimate. Add one before planning.');continue;}
  if(a.dueAt&&!Number.isFinite(Date.parse(a.dueAt))){skip('Deadline is invalid. Verify it first.');continue;}
  tasks.push({...ref,dueAt:a.dueAt||null,minutes:Math.round(a.estimateMinutes),estimateMinutes:a.estimateMinutes,source:a.source||'',course:a.course||''});
 }
 for(const t of Object.values(todos||{}))if(t&&t.status==='open')tasks.push({kind:'todo',id:t.id,title:t.title,dueAt:t.dueAt||null,minutes:t.durationMinutes,version:t.version});
 const due=x=>x.dueAt?Date.parse(x.dueAt):Infinity;
 tasks.sort((x,y)=>due(x)-due(y)||(x.kind<y.kind?-1:x.kind>y.kind?1:0)||(x.id<y.id?-1:x.id>y.id?1:0));
 return {tasks,skipped};
}
// Coverage must be Google, complete, fresh, cover the whole planning window and come from a healthy source.
function gaps(d,from,to,now,settings){
 const cov=d.calendarCoverage||{},out=[],src=(d.sources||[]).find(s=>s.id===C.calendarSource(cov)),checked=Date.parse(cov.checkedAt);
 if(C.calendarProvider(cov)!=='google')out.push('Daily plans need Google Calendar coverage; this snapshot has '+C.calendarProvider(cov)+' coverage.');
 if(cov.complete!==true)out.push('Calendar coverage is incomplete, so blank time is unknown, not free.');
 if(!Number.isFinite(checked)||+now-checked>settings.staleHours*3600000||checked>+now+60000)out.push('Calendar evidence is older than '+settings.staleHours+' hours or has no valid check time. Refresh it first.');
 if(!(Date.parse(cov.start)<=from&&Date.parse(cov.end)>=to))out.push('Checked calendar window does not cover the whole planning day.');
 if(!src||src.status!=='ok')out.push('Calendar source is '+(src?src.status:'not listed')+'.');
 if(!cov.calendarId||!cov.account)out.push('Destination account or calendar ID is missing.');
 if((d.events||[]).some(e=>(e.recurrence&&e.recurrence!=='One time'&&e.recurrence!=='none')||e.recurringSeries===true))out.push('A recurring series was not expanded into occurrences, so some busy time may be missing.');
 return out;
}
const local=x=>new Intl.DateTimeFormat('en-US',{timeZone:C.TZ,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(x));
const plural=(n,w)=>n+' '+w+(n===1?'':'s');
function plan({snapshot:d,date,now=new Date(),todos={},archive={},dismissed={},started=[],settings={}}){
 const s={...SETTINGS,...settings};now=new Date(now);
 if(!validDate(date))throw Error('Choose a valid date (YYYY-MM-DD).');
 if(!d)throw Error('No snapshot');C.configure(d.timezone);
 const from=Date.parse(C.zonedISO(date,s.dayStart)),to=Date.parse(C.zonedISO(nextDay(date),'00:00')),start=Math.max(from,+now);
 const cov=d.calendarCoverage||{},result={date,timezone:d.timezone,generatedAt:now.toISOString(),window:{start:new Date(from).toISOString(),end:new Date(to).toISOString()},ready:false,blocks:[],unscheduled:[],gaps:[],
  assumptions:[`Planning window ${s.dayStart}–24:00 ${d.timezone}; 00:00–${s.dayStart} stays free.`,`Focus blocks are at most ${s.maxBlock} minutes with ${s.gap}-minute rest gaps around blocks and busy events.`,`At least ${Math.round(s.reserve*100)}% of usable time stays unallocated.`,'Durations come only from your todo durations and source estimates; recorded actual minutes are not subtracted.','Busy calendar events, including all-day events and expanded recurring occurrences, block time; events marked free do not.','Work is ordered by deadline (undated last). Blocks must end before the deadline.','Nothing is written to any calendar. Blocks are proposals; only an exact Q version approved in chat can be executed.'],
  usable:{minutes:0,budget:0,allocated:0}};
 const {tasks,skipped}=candidates(d,todos,archive,now,s);result.unscheduled.push(...skipped);
 if(to<=+now){result.gaps.push('This day has already ended.');result.unscheduled.push(...tasks.map(t=>({kind:t.kind,id:t.id,title:t.title,reason:'Not planned: the day has ended.'})));return result;}
 result.gaps.push(...gaps(d,from,to,now,s));
 if(result.gaps.length){result.unscheduled.push(...tasks.map(t=>({kind:t.kind,id:t.id,title:t.title,reason:'Not planned: calendar coverage is not verified for this day.'})));return result;}
 // Started actions (pending, unverified or executed) are canonical protections: their frozen approval copy (`started`, supplied by
 // the store) or snapshot copy keeps occupying time and covering work even after a source failure or a restore dropped the proposal.
 const startedCopies=new Map();for(const p of [...(started||[]),...(d.proposals||[])])if(p&&attempted(d,p.id)&&!startedCopies.has(p.id))startedCopies.set(p.id,p);
 const orphan=(d.actionHistory||[]).filter(h=>['pending','unverified'].includes(h.status)&&!startedCopies.has(h.id));
 if(orphan.length)result.gaps.push(plural(orphan.length,'pending or unverified action')+' without a stored copy: its time is unknown. Reconcile it first.');
 // Kept proposals (anything this run does not replace) occupy every occurrence and cover part of some work.
 const kept=[...(d.proposals||[]).filter(p=>!startedCopies.has(p.id)&&!replaceable(d,p,date)&&!(dismissed?.[p.id]&&!attempted(d,p.id))),...startedCopies.values()],occ=new Map();
 for(const p of kept){try{occ.set(p.id,P.occurrences(p).map(o=>[Date.parse(o.start),Date.parse(o.end)]));}catch(e){result.gaps.push('Proposal "'+String(p.title||p.id).slice(0,80)+'" could not be expanded into occurrences, so its time is unknown: '+e.message);}}
 if(result.gaps.length){result.unscheduled.push(...tasks.map(t=>({kind:t.kind,id:t.id,title:t.title,reason:'Not planned: existing proposals or actions could not be placed in time.'})));return result;}
 const covered=new Map(),counted=new Set();
 const add=(id,refs,minutes)=>{if(counted.has(id)||!(minutes>0))return;counted.add(id);for(const r of refs||[])covered.set(refKey(r),(covered.get(refKey(r))||0)+minutes);};
 // Proposals from the collector carry no sourceRefs; an exact assignment source URL links them to that assignment.
 const bySource=new Map((d.assignments||[]).filter(a=>a.source).map(a=>[a.source,a.id]));
 // Unstarted blocks cover work only with occurrences still ahead; started ones cover their full length. Nothing marks work done.
 for(const p of kept){const live=attempted(d,p.id)?occ.get(p.id):occ.get(p.id).filter(([,b])=>b>+now);add(p.id,p.sourceRefs||(bySource.has(p.source)?[{kind:'assignment',id:bySource.get(p.source)}]:[]),live.reduce((n,[a,b])=>n+Math.round((b-a)/MIN),0));}
 for(const h of d.actionHistory||[])if(ATTEMPTED.includes(h.status)&&h.sourceRefs&&Number.isFinite(h.minutes))add(h.id,h.sourceRefs,h.minutes);
 const valid=([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b>a;
 const events=(d.events||[]).filter(e=>e.busy!==false).map(e=>[Date.parse(e.start),Date.parse(e.end)]).filter(valid),held=[...occ.values()].flat().filter(valid),busy=[...events,...held];
 // Usable time comes from calendar events only. Kept and started blocks already allocate part of it, so the reserve holds across
 // repeated generation: budget = (1 - reserve) x usable - already allocated.
 const usable=minutesFree(start,to,events),already=usable-minutesFree(start,to,busy),budget=Math.max(0,Math.floor(usable*(1-s.reserve))-already);
 result.usable={minutes:usable,budget,allocated:0,alreadyAllocated:already};result.ready=true;
 const blocked=busy.map(([a,b])=>[a-s.gap*MIN,b+s.gap*MIN]);let allocated=0;
 for(const t of tasks){
  const ref={kind:t.kind,id:t.id,title:t.title},already=covered.get(refKey(t))||0,need=t.minutes-already,deadline=t.dueAt?Date.parse(t.dueAt):Infinity,until=Math.min(to,deadline);
  if(need<=0){result.unscheduled.push({...ref,reason:`Already covered by ${already} minutes of proposed or approved blocks.`});continue;}
  if(deadline<=+now){result.unscheduled.push({...ref,reason:'Deadline has passed. Decide whether it still matters.'});continue;}
  if(deadline<=start){result.unscheduled.push({...ref,reason:'Deadline ('+local(deadline)+') falls before the '+s.dayStart+' start of '+date+'. Plan it on an earlier day.'});continue;}
  const parts=chunks(need,s.maxBlock);let placed=0,why='';
  for(const [i,len] of parts.entries()){
   if(allocated+len>budget){why=`Keeping ${Math.round(s.reserve*100)}% of usable time unallocated${already?` (${already} minutes already allocated to existing blocks)`:''}.`;break;}
   const at=slot(len*MIN,start,until,merge(blocked),s.step);if(at===null){why=until<to?'No free slot that ends before the deadline.':'No free slot of '+len+' minutes left today.';break;}
   const b={start:new Date(at).toISOString(),end:new Date(at+len*MIN).toISOString()};
   const title=('Focus: '+t.title).slice(0,200),id='plan-'+date+'-'+hash([t.kind,t.id,t.version??'',b.start,b.end,title,cov.account,cov.calendarId].join('|'));
   const p={id,title,start:b.start,end:b.end,status:'proposed',action:'create',provider:'google',account:cov.account,calendar:cov.calendar,calendarId:cov.calendarId,timezone:d.timezone,recurrence:'One time',attendees:[],location:'',busy:true,reminderMinutes:s.reminderMinutes,
    body:`Dayweave focus block for ${t.kind==='todo'?'todo':'assignment'} "${t.title}".`,source:t.kind==='assignment'?t.source:'',origin:'planner',planDate:date,
    sourceRefs:[{kind:t.kind,id:t.id,...(t.kind==='todo'?{version:t.version}:{dueAt:t.dueAt,estimateMinutes:t.estimateMinutes})}],
    reason:`${t.kind==='todo'?'Todo':'Required coursework'}${t.dueAt?' due '+local(t.dueAt):' with no deadline'} · block ${i+1} of ${parts.length} · ${len} of ${need} remaining minutes${already?` (${already} already planned)`:''}.`};
   const errs=P.errors(p,{...d,proposals:[]},now);if(errs.length){why='Rejected by calendar checks: '+errs.join(' ');break;}
   result.blocks.push(p);blocked.push([at-s.gap*MIN,at+(len+s.gap)*MIN]);allocated+=len;placed+=len;
  }
  if(placed<need)result.unscheduled.push({...ref,reason:(placed?`Partly planned: ${placed} of ${need} minutes. `:'')+why});
 }
 result.usable.allocated=allocated;return result;
}
// Bounded plan explanation for storage: at most maxListed unscheduled items, with the full count kept.
function summary(result,settings=SETTINGS){return {...result,unscheduled:result.unscheduled.slice(0,settings.maxListed),unscheduledTotal:result.unscheduled.length,blocks:result.blocks.map(b=>b.id)};}
// On a source import, keep unstarted planner blocks only while their identity and evidence still hold (the planning source
// eligibility, the same deadline and the same estimate). Started blocks are always kept.
function keep(old,result){
 const cov=result.calendarCoverage||{},ids=new Set(result.proposals.map(p=>p.id)),gen=Date.parse(result.generatedAt),assignments=new Map(result.assignments.map(a=>[a.id,a]));
 const fine=p=>p.provider===C.calendarProvider(cov)&&p.account===cov.account&&p.calendarId===cov.calendarId&&(p.sourceRefs||[]).every(r=>{if(r.kind!=='assignment')return true;const a=assignments.get(r.id);return a&&!a.archivedFromSource&&!sourceProblem(result,a.sourceId,gen)&&a.requirement==='required'&&a.status==='not_submitted'&&(a.dueAt||null)===(r.dueAt||null)&&(!('estimateMinutes' in r)||a.estimateMinutes===r.estimateMinutes);});
 return (old.proposals||[]).filter(p=>p.origin==='planner'&&!ids.has(p.id)&&(attempted(old,p.id)||(Date.parse(p.end)>gen&&fine(p))));
}
const api={SETTINGS,validDate,nextDay,hash,chunks,merge,minutesFree,slot,sourceProblem,candidates,gaps,plan,summary,keep,replaceable,attempted,ATTEMPTED};
if(typeof module!=='undefined')module.exports=api;else window.PlannerPlanner=api;
})();
