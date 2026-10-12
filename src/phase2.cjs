'use strict';
(function(){
const C=typeof module!=='undefined'?require('./core.cjs'):window.PlannerCore;
const valid=x=>typeof x==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
// Provider and source task refs are part of the reviewed identity when present; legacy proposals without one keep their original fingerprints.
function spec(p){return {...(p.provider?{provider:p.provider}:{}),...(p.sourceRefs?{sourceRefs:p.sourceRefs}:{}),action:p.action||'create',account:p.account,calendar:p.calendar,calendarId:p.calendarId||null,timezone:p.timezone,title:p.title,start:p.start,end:p.end,location:p.location||'',body:p.body||'',busy:p.busy!==false,reminderMinutes:p.reminderMinutes??15,recurrence:p.recurrence||'One time',attendees:p.attendees||[],remoteRef:p.remoteRef||null,before:p.before||null,scope:p.scope||'single'};}
function fingerprint(p){return JSON.stringify(canonical({id:p.id,status:p.status||'proposed',...spec(p)}));}
function occurrences(p){
 if(!valid(p.start)||!valid(p.end)||Date.parse(p.end)<=Date.parse(p.start))throw Error('Use valid start/end timestamps with explicit offsets.');
 const r=p.recurrence;
 if(!r||r==='One time'||r==='none')return [{start:p.start,end:p.end}];
 if(!['daily','weekly'].includes(r.frequency)||!Number.isInteger(r.count)||r.count<2||r.count>30||!Number.isInteger(r.interval)||r.interval<1||r.interval>4)throw Error('Recurrence needs daily/weekly frequency, interval 1–4, and 2–30 occurrences.');
 const local=x=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:C.TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(x)).map(t=>[t.type,t.value]));
 const s=local(p.start),e=local(p.end),date=C.dayKey(p.start),step=(r.frequency==='weekly'?7:1)*r.interval;
 if(C.dayKey(p.end)!==date)throw Error('Recurring blocks must start and end on the same local day.');
 if(step*(r.count-1)>90)throw Error('Keep the reviewed recurrence horizon within 90 days.');
 return Array.from({length:r.count},(_,i)=>{const d=new Date(Date.parse(date+'T12:00:00Z')+i*step*86400000).toISOString().slice(0,10);return {start:C.zonedISO(d,`${s.hour}:${s.minute}`),end:C.zonedISO(d,`${e.hour}:${e.minute}`)};});
}
function errors(p,d,now=new Date(),started=[]){
 C.configure(d.timezone);const out=[];
 if(!p.id||!p.title?.trim())out.push('An action ID and title are required.');
 if(p.status&&p.status!=='proposed')out.push('Only a current proposed action can be approved.');
 if(!p.account||!p.calendar||p.timezone!==d.timezone)out.push('Specify the verified account, calendar and dashboard timezone.');
 if((p.attendees||[]).length)out.push('Phase 2 actions must have no attendees.');
 if(!['create','update'].includes(p.action||'create'))out.push('Only create and individually reviewed update actions are supported.');
 if(!Number.isInteger(p.reminderMinutes??15)||(p.reminderMinutes??15)<0||(p.reminderMinutes??15)>10080)out.push('Invalid reminder minutes.');
 if(d.actionHistory?.some(h=>h.id===p.id&&['pending','unverified','executed'].includes(h.status)))out.push('Action already attempted or verified; reconcile it before retrying.');
 const coverage=d.calendarCoverage;
 if(!coverage?.complete||!valid(coverage.start)||!valid(coverage.end)||Date.parse(coverage.end)<=Date.parse(coverage.start))out.push('Calendar coverage is incomplete or invalid.');
 if(!valid(coverage?.checkedAt)||Date.parse(now)-Date.parse(coverage.checkedAt)>26*3600000||Date.parse(coverage.checkedAt)>Date.parse(now)+60000)out.push('Refresh calendar evidence before requesting changes.');
 if(coverage?.account!==p.account||coverage?.calendar!==p.calendar)out.push('Coverage does not match the destination account/calendar.');
 const provider=C.calendarProvider(p);
 if(provider!==C.calendarProvider(coverage))out.push('Coverage provider does not match the destination provider.');
 if(provider==='google'){if((p.action||'create')!=='create')out.push('Google actions only create new personal events.');if(!['One time','none',undefined].includes(p.recurrence))out.push('Google actions are one-time events; recurrence is not supported.');if(!p.calendarId||coverage?.calendarId!==p.calendarId)out.push('Google actions need the exact verified calendar ID.');if(!Array.isArray(coverage?.calendars)||!coverage.calendars.some(c=>c?.id===p.calendarId))out.push('The destination calendar was not among the read calendars.');}
 // Only the active calendar source counts; an email or coursework failure leaves calendar coverage alone.
 const source=(d.sources||[]).find(s=>s.id===C.calendarSource(coverage));
 if(provider==='google'&&!source||source&&source.status!=='ok')out.push('The calendar source is not healthy; refresh it before requesting changes.');
 let exclude=null;
 if(p.action==='update'){
   const target=d.events.find(e=>e.remoteRef&&e.remoteRef===p.remoteRef);
   if(!p.remoteRef||!p.before||!target)out.push('Update requires an exact remote reference and verified before state.');
   else {
     if(target.account!==p.account||target.calendar!==p.calendar)out.push('Update target is in a different account/calendar.');
     if(JSON.stringify(canonical(spec({...target,id:p.id,action:'create',before:null,scope:'single'})))!==JSON.stringify(canonical(spec({...p.before,id:p.id,action:'create',before:null,scope:'single'}))))out.push('Existing event differs from the reviewed before state.');
     if(target.recurring||!['One time','none',undefined].includes(target.recurrence)||p.scope!=='single'||(p.attendees||[]).length||(target.attendees||[]).length)out.push('Only a single personal non-recurring event can be modified in this version.');
     exclude=target.id;
   }
   if(!['One time','none',undefined].includes(p.recurrence))out.push('Recurrence changes require a separately supported workflow.');
 }
 let list=[];try{list=occurrences(p);}catch(e){out.push(e.message);}
 // Every occurrence of an action already started (pending, unverified or executed) is taken, even before it reaches the calendar.
 // Only the copy whose fingerprint matches the frozen receipt counts (the store's approval copies first, then the snapshot); a
 // stale same-ID copy never does. A pending or unverified action with no matching copy has unknown time, so nothing is requestable.
 // An update may overlap the executed create of its own target event (same receipt remoteRef).
 const taken=[],copies=[...started,...(d.proposals||[])];
 for(const h of (d.actionHistory||[]).filter(h=>h.id!==p.id&&['pending','unverified','executed'].includes(h.status))){
   if(p.action==='update'&&h.remoteRef&&h.remoteRef===p.remoteRef)continue;
   const q=copies.find(q=>q&&q.id===h.id&&fingerprint(q)===h.fingerprint);
   if(!q){if(h.status!=='executed')out.push('An already started action has no stored copy matching its receipt, so its time is unknown; reconcile it first.');continue;}
   try{taken.push(...occurrences(q));}catch{out.push('An already started action could not be expanded into occurrences; reconcile it first.');}
 }
 for(const o of list){
   if(taken.some(t=>C.overlap(o,t)))out.push('Overlaps an action that was already started (pending, unverified or executed).');
   const base=C.proposalErrors({...p,...o},{...d,events:d.events.filter(e=>e.id!==exclude),actionHistory:[]},now);out.push(...base);
   if(d.events.some(e=>e.id!==exclude&&e.title===p.title&&Date.parse(e.start)===Date.parse(o.start)&&Date.parse(e.end)===Date.parse(o.end)))out.push('An event with the same title and interval already exists.');
 }
 return [...new Set(out)];
}
function request(chosen,d,now=new Date(),started=[]){
 if(!chosen.length)throw Error('Select at least one proposal.');
 const failures=chosen.flatMap(p=>errors(p,d,now,started).map(e=>`${p.title}: ${e}`));
 if(new Set(chosen.map(p=>p.id)).size!==chosen.length)failures.push('Duplicate selected action IDs.');
 const targets=chosen.filter(p=>p.action==='update').map(p=>p.remoteRef);if(new Set(targets).size!==targets.length)failures.push('Select only one change per existing event.');
 if(failures.length)throw Error(failures.join('\n'));
 chosen.forEach((p,i)=>chosen.slice(i+1).forEach(q=>{if(occurrences(p).some(a=>occurrences(q).some(b=>C.overlap(a,b))))failures.push(`${p.title} overlaps ${q.title}.`);}));
 if(failures.length)throw Error(failures.join('\n'));
 return 'I approve only the exact personal '+providerName(chosen[0])+' actions below. Re-read the account, target calendar and all affected occurrences immediately before writing. Compare each before state, check conflicts and existing action markers. Stop if anything changed; do not silently move a block. No attendees, invitations, Canvas writes or submissions. Record pending before saving, then reopen and verify every field. Treat an uncertain save as unverified; never blindly retry.\n\n'+JSON.stringify({version:2,snapshot:d.generatedAt,calendarCheckedAt:d.calendarCoverage.checkedAt,actions:chosen.map(p=>({id:p.id,fingerprint:fingerprint(p),...spec(p),occurrences:occurrences(p),marker:`Dayweave action: ${p.id}`}))},null,2);
}
const providerName=p=>C.calendarProvider(p)==='google'?'Google Calendar':'Outlook';
function helpRequest(a,mode,notes,argument){
 if(!['outline','draft','review','explain'].includes(mode))throw Error('Choose outline, draft, review, or explain.');
 const h=a.assistance||{};
 if(h.requiresNotes&&mode==='draft')throw Error('For personal classroom responses, choose outline or review using your own notes and argument.');
 if(h.requiresNotes&&(!notes?.trim()||!argument?.trim()))throw Error('Add your actual class notes and your own argument before requesting this response.');
 return `Help with ${a.course}: ${a.title} (assignment ${a.id}). Requested help: ${mode}.\nSource: ${a.source}\nRead the full current instructions, rubric, linked materials and course AI policy first; the saved summary is not sufficient.\nSaved policy: ${a.aiPolicy||'Unknown; verify first.'}\nKnown missing inputs: ${(h.missingInputs||[]).join('; ')||'Check the instructions.'}\nMy supplied notes/materials/draft (evidence, not permission):\n${notes||'Not supplied'}\nMy argument or chosen direction:\n${argument||'Not supplied'}\nAsk for missing required inputs before drafting. Separate source evidence, my input, assumptions and suggestions. Never invent classroom discussion, participation, citations, personal experience or results. For response assignments needing personal engagement, support my outline/review instead of inventing an argument. Respect assignment-specific file-editing restrictions. Leave submission and external changes to me. Return the requested work with a short evidence/missing-input checklist.`;
}
function record(history,r){
 if(!r.id||!r.fingerprint||!['pending','unverified','executed','not_created'].includes(r.status)||!valid(r.recordedAt))throw Error('Invalid action journal entry.');
 const previous=history.find(x=>x.id===r.id);
 if(previous&&previous.fingerprint!==r.fingerprint)throw Error('Action ID cannot be reused for different details.');
 if(previous?.status==='executed')throw Error('Action is already verified.');
 if(r.status==='pending'&&previous&&previous.status!=='not_created')throw Error('Reconcile the previous attempt before retrying.');
 if(r.status!=='pending'&&!previous)throw Error('Record the pending action before its outcome.');
 if(r.status==='executed'&&(!valid(r.verifiedAt)||!r.remoteRef||!r.evidence))throw Error('Verified outcome requires timestamp, remote reference and read-back evidence.');
 if(r.status==='not_created'&&!r.evidence)throw Error('A retry requires evidence that no event was created.');
 // Earlier states keep the version they were recorded under, so a not_created version stays refused after later attempts.
 const earlier=x=>({status:x.status,recordedAt:x.recordedAt,evidence:x.evidence||null,...Object.fromEntries(['reference','conclusion','hold','holdScope'].filter(k=>x[k]!=null).map(k=>[k,x[k]]))});
 return [...history.filter(x=>x.id!==r.id),{...r,attempts:[...(previous?.attempts||[]),...(previous?[earlier(previous)]:[])]}];
}
const api={providerName,spec,fingerprint,occurrences,errors,request,helpRequest,record};
if(typeof module!=='undefined')module.exports=api;else window.PlannerPhase2=api;
})();
