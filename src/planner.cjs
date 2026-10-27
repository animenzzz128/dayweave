(function(){
'use strict';
// Deterministic, advisory daily planner. It proposes personal focus blocks only inside fresh, complete Google Calendar
// coverage of the chosen day. It never writes anywhere, never invents durations or deadlines, never schedules uncertain
// evidence and never treats unknown time as free. Its output is ordinary proposals that still need an approved Q version.
const C=typeof module!=='undefined'?require('./core.cjs'):window.PlannerCore;
const P=typeof module!=='undefined'?require('./phase2.cjs'):window.PlannerPhase2;
const SETTINGS=Object.freeze({dayStart:'09:00',dayEnd:'24:00',breaks:[],habits:[],maxBlock:90,gap:15,reserve:0.2,step:5,staleHours:26,reminderMinutes:10,maxListed:100,urgentHours:72});
// The owner's planning rules (stored by the server, edited on Week): planning hours, fixed breaks such as meals, and weekly goals
// ("habits": job search, LinkedIn, gym…) with sessions per week, minutes per session, allowed weekdays (1 = Monday) and time
// windows. Days never start before 07:00, the sleep window every proposal is checked against.
// Quizzes and exams get review time before them (an exam's own estimate is its sitting, not the preparation); interview
// mail the owner or the collector marks `interview` gets preparation time ahead of everything else.
const REVIEW=Object.freeze([{kind:'exam',re:/\b(exam|midterm)s?\b|\bfinal exam/i,minutes:240,perDay:120,days:5},{kind:'quiz',re:/\bquiz/i,minutes:60,perDay:60,days:2}]);
const INTERVIEW=Object.freeze({minutes:120,undated:60,perDay:120});
// Suggested rules used until the owner saves their own (docs/data-contract.md, planning settings).
const RECOMMENDED=Object.freeze({dayStart:'09:00',dayEnd:'24:00',breaks:[{start:'12:00',end:'13:00'},{start:'18:00',end:'19:00'}],habits:[
 {id:'gym',title:'Gym',minutes:60,perWeek:3,days:[1,2,3,4,5],windows:[{start:'07:00',end:'09:00'},{start:'17:00',end:'19:00'}]},
 {id:'job-applications',title:'Job applications',minutes:60,perWeek:4,days:[1,2,3,4,5],windows:[{start:'13:00',end:'18:00'}]},
 {id:'linkedin',title:'LinkedIn connect',minutes:30,perWeek:5,days:[1,2,3,4,5],windows:[{start:'14:00',end:'18:00'}]}]});
const HM=/^([01]\d|2[0-3]):[0-5]\d$/,hmMin=x=>x==='24:00'?1440:+x.slice(0,2)*60+ +x.slice(3);
function planSettings(v){if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Planning settings must be an object.');
 const time=(x,name,end=false)=>{if(typeof x!=='string'||!(HM.test(x)||end&&x==='24:00'))throw Error(name+' must be a time like 08:00.');return x;};
 const span=(x,name)=>{if(!x||typeof x!=='object')throw Error(name+' needs a start and an end.');const a=time(x.start,name+' start'),b=time(x.end,name+' end',true);if(hmMin(b)<=hmMin(a))throw Error(name+' must end after it starts.');return {start:a,end:b};};
 const dayStart=time(v.dayStart??'09:00','Day start'),dayEnd=time(v.dayEnd??'24:00','Day end',true);
 if(hmMin(dayStart)<420)throw Error('Day start cannot be before 07:00 (sleep window).');if(hmMin(dayEnd)-hmMin(dayStart)<120)throw Error('The planning day must be at least two hours long.');
 const breaks=v.breaks??[];if(!Array.isArray(breaks)||breaks.length>6)throw Error('Use at most 6 breaks.');
 const habits=v.habits??[];if(!Array.isArray(habits)||habits.length>12)throw Error('Use at most 12 weekly goals.');const ids=new Set();
 return {dayStart,dayEnd,breaks:breaks.map((b,i)=>span(b,'Break '+(i+1))),habits:habits.map((h,i)=>{const name='Weekly goal '+(i+1);if(!h||typeof h!=='object')throw Error(name+' is invalid.');
  const id=String(h.id||'');if(!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id)||ids.has(id))throw Error(name+' needs a unique short ID.');ids.add(id);
  const title=String(h.title||'').trim();if(!title||title.length>80)throw Error(name+' needs a title of at most 80 characters.');
  const minutes=Number(h.minutes),perWeek=Number(h.perWeek);if(!Number.isInteger(minutes)||minutes<15||minutes>240||minutes%5)throw Error(title+': minutes per session must be 15–240 in steps of 5.');
  if(!Number.isInteger(perWeek)||perWeek<1||perWeek>14)throw Error(title+': sessions per week must be 1–14.');
  const days=[...new Set(h.days||[])].map(Number).sort();if(!days.length||days.some(x=>!Number.isInteger(x)||x<1||x>7))throw Error(title+': choose at least one weekday.');
  const windows=(h.windows||[]).map((w,j)=>span(w,title+' window '+(j+1)));if(!windows.length||windows.length>3)throw Error(title+': use one to three time windows.');
  if(windows.some(w=>hmMin(w.start)<420))throw Error(title+': windows cannot start before 07:00 (sleep window).');
  if(windows.every(w=>hmMin(w.end)-hmMin(w.start)<minutes))throw Error(title+': a window must fit one '+minutes+'-minute session.');
  return {id,title,minutes,perWeek,days,windows,enabled:h.enabled!==false};})};}
const isoDay=k=>new Date(Date.parse(k+'T12:00:00Z')).getUTCDay()||7;
const addDays=(k,n)=>new Date(Date.parse(k+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const MIN=60000,DONE=['submitted','graded','excused'],ATTEMPTED=['pending','unverified','executed'];
const validDate=k=>typeof k==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(k)&&Number.isFinite(Date.parse(k+'T00:00:00Z'))&&new Date(Date.parse(k+'T00:00:00Z')).toISOString().slice(0,10)===k;
const nextDay=k=>new Date(Date.parse(k+'T12:00:00Z')+86400000).toISOString().slice(0,10);
// FNV-1a: a short deterministic content hash so changed blocks get new action IDs and identical blocks keep theirs.
function hash(s){let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h.toString(16).padStart(8,'0');}
const attempted=(d,id)=>(d.actionHistory||[]).some(h=>h.id===id&&ATTEMPTED.includes(h.status));
// A planner block for this date that was never attempted is replaced by regeneration; everything else stays and blocks time.
// A block the owner edited, or one in a version the owner approved, is locked and stays too.
const replaceable=(d,p,date)=>p.origin==='planner'&&p.planDate===date&&!p.locked&&!attempted(d,p.id);
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
function candidates(d,todos,archive,now=new Date(),settings=SETTINGS,emailTriage={}){
 const tasks=[],skipped=[];
 for(const a of d.assignments||[]){
  if(a.archivedFromSource||DONE.includes(a.status))continue;
  const ref={kind:'assignment',id:a.id,title:a.title},skip=reason=>skipped.push({...ref,reason}),review=REVIEW.find(r=>r.re.test(a.title||''));
  if(archive?.[a.id]){skip('Archived locally; not planned.');continue;}
  if(a.requirement==='choice'){skip('Selectable (choice) work is never scheduled automatically.');continue;}
  const problem=sourceProblem(d,a.sourceId,now,settings);if(problem){skip(problem);continue;}
  if(a.requirement!=='required'){skip('Requirement uncertain. Verify it first.');continue;}
  // Review needs only the date: an in-class exam has no online submission, so its status can stay unknown.
  if(review){if(!a.dueAt||!Number.isFinite(Date.parse(a.dueAt))){skip('No valid '+review.kind+' date, so review time cannot be placed.');continue;}
   tasks.push({...ref,dueAt:a.dueAt,minutes:review.minutes,estimateMinutes:a.estimateMinutes,source:a.source||'',course:a.course||'',review:review.kind,perDay:review.perDay,earliest:Date.parse(a.dueAt)-review.days*86400000});continue;}
  if(a.status!=='not_submitted'){skip('Submission status unknown. Verify it first.');continue;}
  if(!(Number.isFinite(a.estimateMinutes)&&a.estimateMinutes>0)){skip('No duration estimate. Add one before planning.');continue;}
  if(a.dueAt&&!Number.isFinite(Date.parse(a.dueAt))){skip('Deadline is invalid. Verify it first.');continue;}
  tasks.push({...ref,dueAt:a.dueAt||null,minutes:Math.round(a.estimateMinutes),estimateMinutes:a.estimateMinutes,source:a.source||'',course:a.course||''});
 }
 for(const t of Object.values(todos||{}))if(t&&t.status==='open')tasks.push({kind:'todo',id:t.id,title:t.title,dueAt:t.dueAt||null,minutes:t.durationMinutes,version:t.version});
 // Interview mail (collector triage or the owner's override), not handled: preparation before the stated time, or an hour today.
 if(d.email?.enabled)for(const m of d.email.messages||[]){const o=emailTriage?.[m.id]||{};if((o.category||m.triage?.category)!=='interview'||o.handled)continue;
  const at=m.triage?.dueAt?Date.parse(m.triage.dueAt):NaN;if(Number.isFinite(at)&&at<=+now)continue;
  tasks.push({kind:'email',id:m.id,title:String(m.triage?.summary||m.subject||'Interview').slice(0,120),dueAt:Number.isFinite(at)?m.triage.dueAt:null,minutes:Number.isFinite(at)?INTERVIEW.minutes:INTERVIEW.undated,perDay:INTERVIEW.perDay,interview:true});}
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
// Calendar events that are this app's own started actions: an executed receipt's remoteRef, as the event's remoteRef, its ID or
// its calendarId/ID (in the same account and calendar as the approved copy, or the destination when no copy survives), or the exact approved copy (same calendar, title and occurrence
// interval; one event per occurrence). They are allocations, not lost capacity. Every other busy event reduces usable time.
function ownEvents(d,copies,occ){
 const own=new Set(),events=d.events||[],refs=new Map(),cov=d.calendarCoverage||{};
 for(const h of d.actionHistory||[])if(h.status==='executed'&&typeof h.remoteRef==='string'&&h.remoteRef)refs.set(h.remoteRef,h.id);
 const same=(e,p)=>(e.calendarId==null||e.calendarId===p.calendarId)&&(e.account==null||e.account===p.account);
 for(const e of events){const id=refs.get(e.remoteRef)??refs.get(e.id)??(e.calendarId&&e.id?refs.get(e.calendarId+'/'+e.id):undefined);if(id!==undefined&&same(e,copies.get(id)||cov))own.add(e);}
 for(const [id,p] of copies)for(const [a,b] of occ.get(id)||[]){const e=events.find(e=>!own.has(e)&&e.busy!==false&&e.title===p.title&&same(e,p)&&Date.parse(e.start)===a&&Date.parse(e.end)===b);if(e)own.add(e);}
 return own;
}
const local=x=>new Intl.DateTimeFormat('en-US',{timeZone:C.TZ,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(x));
const plural=(n,w)=>n+' '+w+(n===1?'':'s');
function plan({snapshot:d,date,now=new Date(),todos={},archive={},dismissed={},started=[],settings={},emailTriage={}}){
 const s={...SETTINGS,...settings};now=new Date(now);
 if(!validDate(date))throw Error('Choose a valid date (YYYY-MM-DD).');
 if(!d)throw Error('No snapshot');C.configure(d.timezone);
 const at=(k,x)=>Date.parse(x==='24:00'?C.zonedISO(nextDay(k),'00:00'):C.zonedISO(k,x));
 const from=at(date,s.dayStart),to=at(date,s.dayEnd),start=Math.max(from,+now);
 const cov=d.calendarCoverage||{},result={date,timezone:d.timezone,generatedAt:now.toISOString(),window:{start:new Date(from).toISOString(),end:new Date(to).toISOString()},ready:false,blocks:[],unscheduled:[],gaps:[],
  assumptions:[`Planning window ${s.dayStart}–${s.dayEnd} ${d.timezone}; the rest of the day stays free except weekly-goal windows you set earlier.`,...(s.breaks.length?['Breaks kept free: '+s.breaks.map(b=>b.start+'–'+b.end).join(', ')+'.']:[]),...(s.habits.some(h=>h.enabled)?[`Weekly goals are placed in their own windows after coursework due within ${s.urgentHours} hours, spread over the allowed days left this week (Monday–Sunday).`]:[]),`Focus blocks are at most ${s.maxBlock} minutes with ${s.gap}-minute rest gaps around blocks and busy events.`,`At least ${Math.round(s.reserve*100)}% of usable time stays unallocated.`,'Durations come only from your todo durations and source estimates; recorded actual minutes are not subtracted.',`Quizzes get ${REVIEW[1].minutes} minutes of review in the ${REVIEW[1].days} days before; exams get ${REVIEW[0].minutes} minutes over the ${REVIEW[0].days} days before, at most ${REVIEW[0].perDay} a day.`,`Interview emails come first: ${INTERVIEW.minutes} minutes of preparation before the stated time (${INTERVIEW.undated} today when no time is stated), at most ${INTERVIEW.perDay} a day.`,'Busy calendar events, including all-day events and expanded recurring occurrences, block time; events marked free do not.','Work is ordered by deadline (undated last). Blocks must end before the deadline.','Nothing is written to any calendar. Blocks are proposals; only an exact Q version you approve can be written.'],
  usable:{minutes:0,budget:0,allocated:0}};
 const {tasks,skipped}=candidates(d,todos,archive,now,s,emailTriage);result.unscheduled.push(...skipped);
 if(to<=+now){result.gaps.push('This day has already ended.');result.unscheduled.push(...tasks.map(t=>({kind:t.kind,id:t.id,title:t.title,reason:'Not planned: the day has ended.'})));return result;}
 result.gaps.push(...gaps(d,from,to,now,s));
 if(result.gaps.length){result.unscheduled.push(...tasks.map(t=>({kind:t.kind,id:t.id,title:t.title,reason:'Not planned: calendar coverage is not verified for this day.'})));return result;}
 // Started actions (pending, unverified or executed) are canonical protections: their frozen approval copy (`started`, supplied by
 // the store) or snapshot copy keeps occupying time and covering work even after a source failure or a restore dropped the proposal.
 // Only a copy whose fingerprint matches the frozen receipt counts; a stale same-ID copy (an older restore or collector version) never does.
 const receipt=new Map((d.actionHistory||[]).filter(h=>ATTEMPTED.includes(h.status)).map(h=>[h.id,h.fingerprint])),startedCopies=new Map();
 for(const p of [...(started||[]),...(d.proposals||[])])if(p&&receipt.has(p.id)&&P.fingerprint(p)===receipt.get(p.id)&&!startedCopies.has(p.id))startedCopies.set(p.id,p);
 const orphan=(d.actionHistory||[]).filter(h=>['pending','unverified'].includes(h.status)&&!startedCopies.has(h.id));
 if(orphan.length)result.gaps.push(plural(orphan.length,'pending or unverified action')+' without a stored copy matching its receipt: its time is unknown. Reconcile it first.');
 // Kept proposals (anything this run does not replace) occupy every occurrence and cover part of some work.
 const kept=[...(d.proposals||[]).filter(p=>!attempted(d,p.id)&&!replaceable(d,p,date)&&!dismissed?.[p.id]),...startedCopies.values()],occ=new Map();
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
 const own=ownEvents(d,startedCopies,occ),span=e=>[Date.parse(e.start),Date.parse(e.end)];
 const events=(d.events||[]).filter(e=>e.busy!==false&&!own.has(e)).map(span).filter(valid),held=[...[...occ.values()].flat(),...[...own].map(span)].filter(valid),busy=[...events,...held];
 // Usable time comes from other calendar events only. Kept and started blocks, including started blocks that have since been
 // imported as events, already allocate part of it, so the reserve holds across repeated generation and refreshes:
 // budget = (1 - reserve) x usable - already allocated.
 const breaks=s.breaks.map(b=>[at(date,b.start),at(date,b.end)]);
 const usable=minutesFree(start,to,[...events,...breaks]),already=usable-minutesFree(start,to,[...busy,...breaks]),budget=Math.max(0,Math.floor(usable*(1-s.reserve))-already);
 result.usable={minutes:usable,budget,allocated:0,alreadyAllocated:already};result.ready=true;
 const blocked=[...busy.map(([a,b])=>[a-s.gap*MIN,b+s.gap*MIN]),...breaks];let allocated=0;
 const reserveNote=()=>`Keeping ${Math.round(s.reserve*100)}% of usable time unallocated${already?` (${already} minutes already allocated to existing blocks)`:''}.`;
 // Weekly goals: sessions already planned or written this week (other days, kept blocks, started copies) count toward the goal.
 const monday=addDays(date,1-isoDay(date)),week=new Set(Array.from({length:7},(_,i)=>addDays(monday,i)));
 const placeHabit=h=>{if(!h.enabled||!h.days.includes(isoDay(date)))return;const ref={kind:'habit',id:h.id,title:h.title};
  const mine=kept.filter(p=>p.sourceRefs?.some(r=>r.kind==='habit'&&r.id===h.id)&&week.has(C.dayKey(p.start))),had=mine.filter(p=>C.dayKey(p.start)===date).length,done=mine.length,left=h.perWeek-(done-had);if(left<=0)return;
  // Today's share of what the other days have not covered, minus the sessions already kept on this day.
  const daysLeft=[...week].filter(k=>k>=date&&h.days.includes(isoDay(k))).length,today=Math.min(2,Math.ceil(left/Math.max(1,daysLeft)))-had;if(today<=0)return;let placed=0,why='';
  for(let i=0;i<today;i++){if(allocated+h.minutes>budget){why=reserveNote();break;}let t0=null;
   for(const w of h.windows){const ws=Math.max(+now,at(date,w.start)),we=Math.min(to,at(date,w.end));if(we-ws<h.minutes*MIN)continue;t0=slot(h.minutes*MIN,ws,we,merge(blocked),s.step);if(t0!==null)break;}
   if(t0===null){why='No free '+h.minutes+'-minute slot in its windows ('+h.windows.map(w=>w.start+'–'+w.end).join(', ')+') today.';break;}
   const b={start:new Date(t0).toISOString(),end:new Date(t0+h.minutes*MIN).toISOString()},title=h.title.slice(0,200),id='plan-'+date+'-'+hash(['habit',h.id,b.start,b.end,title,cov.account,cov.calendarId].join('|'));
   const p={id,title,start:b.start,end:b.end,status:'proposed',action:'create',provider:'google',account:cov.account,calendar:cov.calendar,calendarId:cov.calendarId,timezone:d.timezone,recurrence:'One time',attendees:[],location:'',busy:true,reminderMinutes:s.reminderMinutes,
    body:`Dayweave block for the weekly goal "${h.title}".`,source:'',origin:'planner',planDate:date,sourceRefs:[{kind:'habit',id:h.id}],
    reason:`Weekly goal: session ${done+placed+1} of ${h.perWeek} this week · ${h.minutes} minutes.`};
   const errs=P.errors(p,{...d,proposals:[]},now,[...startedCopies.values()]);if(errs.length){why='Rejected by calendar checks: '+errs.join(' ');break;}
   result.blocks.push(p);blocked.push([t0-s.gap*MIN,t0+(h.minutes+s.gap)*MIN]);allocated+=h.minutes;placed++;}
  if(placed<today)result.unscheduled.push({...ref,reason:(placed?`Placed ${placed} of ${today} sessions today. `:'')+why});};
 // Order: interview preparation, then work due within urgentHours, then weekly goals, then everything else by deadline.
 const urgent=t=>!t.interview&&t.dueAt&&Date.parse(t.dueAt)<=+now+s.urgentHours*3600000;
 for(const t of [...tasks.filter(t=>t.interview),...tasks.filter(urgent),null,...tasks.filter(t=>!t.interview&&!urgent(t))]){
  if(t===null){for(const h of s.habits)placeHabit(h);continue;}
  const ref={kind:t.kind,id:t.id,title:t.title},have=covered.get(refKey(t))||0,need=t.minutes-have,deadline=t.dueAt?Date.parse(t.dueAt):Infinity,until=Math.min(to,deadline);
  if(need<=0){result.unscheduled.push({...ref,reason:`Already covered by ${have} minutes of proposed or approved blocks.`});continue;}
  if(deadline<=+now){result.unscheduled.push({...ref,reason:'Deadline has passed. Decide whether it still matters.'});continue;}
  if(deadline<=start){result.unscheduled.push({...ref,reason:'Deadline ('+local(deadline)+') falls before the '+s.dayStart+' start of '+date+'. Plan it on an earlier day.'});continue;}
  if(t.earliest>to){result.unscheduled.push({...ref,reason:`Review starts ${REVIEW.find(r=>r.kind===t.review).days} days before the ${t.review} (${local(deadline)}).`});continue;}
  // Review and interview preparation are spread: at most perDay minutes on one day, counting this day's kept blocks.
  const today=t.perDay?t.perDay-kept.filter(p=>p.sourceRefs?.some(r=>refKey(r)===refKey(t))&&C.dayKey(p.start)===date).reduce((n,p)=>n+Math.round((Date.parse(p.end)-Date.parse(p.start))/MIN),0):need;
  if(today<=0){result.unscheduled.push({...ref,reason:`Today already has ${t.perDay} minutes for it; the rest goes on other days.`});continue;}
  const want=Math.min(need,today),parts=chunks(want,s.maxBlock);let placed=0,why='';
  for(const [i,len] of parts.entries()){
   if(allocated+len>budget){why=reserveNote();break;}
   const at=slot(len*MIN,start,until,merge(blocked),s.step);if(at===null){why=until<to?'No free slot that ends before the deadline.':'No free slot of '+len+' minutes left today.';break;}
   const b={start:new Date(at).toISOString(),end:new Date(at+len*MIN).toISOString()};
   const title=((t.interview?'Interview prep: ':t.review?'Review: ':'Focus: ')+t.title).slice(0,200),id='plan-'+date+'-'+hash([t.kind,t.id,t.version??'',b.start,b.end,title,cov.account,cov.calendarId].join('|'));
   const p={id,title,start:b.start,end:b.end,status:'proposed',action:'create',provider:'google',account:cov.account,calendar:cov.calendar,calendarId:cov.calendarId,timezone:d.timezone,recurrence:'One time',attendees:[],location:'',busy:true,reminderMinutes:s.reminderMinutes,
    body:t.interview?'Dayweave preparation block for an interview email.':`Dayweave ${t.review?'review':'focus'} block for ${t.kind==='todo'?'todo':'assignment'} "${t.title}".`,source:t.kind==='assignment'?t.source:'',origin:'planner',planDate:date,
    sourceRefs:[{kind:t.kind,id:t.id,...(t.kind==='todo'?{version:t.version}:t.kind==='email'?{}:{dueAt:t.dueAt,estimateMinutes:t.estimateMinutes})}],
    reason:`${t.interview?'Interview preparation'+(t.dueAt?' before '+local(t.dueAt):' (interview time not stated)'):t.review?'Review for the '+t.review+' on '+local(t.dueAt):(t.kind==='todo'?'Todo':'Required coursework')+(t.dueAt?' due '+local(t.dueAt):' with no deadline')} · block ${i+1} of ${parts.length} · ${len} of ${need} remaining minutes${have?` (${have} already planned)`:''}.`};
   const errs=P.errors(p,{...d,proposals:[]},now,[...startedCopies.values()]);if(errs.length){why='Rejected by calendar checks: '+errs.join(' ');break;}
   result.blocks.push(p);blocked.push([at-s.gap*MIN,at+(len+s.gap)*MIN]);allocated+=len;placed+=len;
  }
  if(placed<want)result.unscheduled.push({...ref,reason:(placed?`Partly planned: ${placed} of ${want} minutes. `:'')+why});
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
// Calendar events that are Dayweave's own written blocks, by the ownEvents rule above. A read after a write imports each block
// as an ordinary event; views draw the approved block once instead of twice.
function ownEventIds(d){const receipt=new Map((d.actionHistory||[]).filter(h=>ATTEMPTED.includes(h.status)).map(h=>[h.id,h.fingerprint])),copies=new Map(),occ=new Map();
 for(const p of d.proposals||[])if(receipt.has(p.id)&&P.fingerprint(p)===receipt.get(p.id)&&!copies.has(p.id))copies.set(p.id,p);
 for(const [id,p] of copies){try{occ.set(id,P.occurrences(p).map(o=>[Date.parse(o.start),Date.parse(o.end)]));}catch{/* time unknown: not matched */}}
 // An event found only by its receipt, with no copy left to draw in its place, stays visible.
 const refs=new Map((d.actionHistory||[]).filter(h=>h.status==='executed'&&h.remoteRef).map(h=>[h.remoteRef,h.id])),ref=e=>refs.get(e.remoteRef)??refs.get(e.id)??(e.calendarId&&e.id?refs.get(e.calendarId+'/'+e.id):undefined);
 return new Set([...ownEvents(d,copies,occ)].filter(e=>{const id=ref(e);return id===undefined||copies.has(id);}).map(e=>e.id));}
const api={SETTINGS,RECOMMENDED,REVIEW,INTERVIEW,validDate,nextDay,hash,chunks,merge,minutesFree,slot,sourceProblem,candidates,gaps,plan,summary,keep,replaceable,attempted,ATTEMPTED,planSettings,isoDay,ownEventIds};
if(typeof module!=='undefined')module.exports=api;else window.PlannerPlanner=api;
})();
