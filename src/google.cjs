'use strict';
// Approved Google Calendar execution bridge. The root assistant performs every remote read and write with its own
// connector; this module only verifies the exact approved version, maps it to Google event fields, checks a live
// re-read, compares a read-back and records local receipts. It holds no credentials and makes no network calls.
const crypto=require('node:crypto'),C=require('./core.cjs'),P=require('./phase2.cjs'),A=require('./approvals.cjs');
const LIVE_MAX_AGE_MS=15*60000,MIN=60000;
// Fields the connector must be able to set, or the approved intent would be silently lost. Location only when non-empty.
const REQUIRED=['calendarId','summary','description','start.dateTime','start.timeZone','end.dateTime','end.timeZone','transparency','reminders.useDefault','reminders.overrides','sendUpdates'];
// Optional duplicate guards used when supported: a client event ID and private extended properties.
const OPTIONAL=['id','extendedProperties.private'];
const instant=x=>typeof x==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
// Deterministic idempotency key (base32hex-safe, usable as a Google client event ID) bound to store, action and fingerprint.
function key(storeId,p){return 'd0'+crypto.createHash('sha256').update([storeId,p.id,P.fingerprint(p)].join('|')).digest('hex').slice(0,30);}
const marker=(p,k)=>`Dayweave action: ${p.id} · key ${k}`;
const description=(p,k)=>(p.body?p.body+'\n\n':'')+marker(p,k);
const required=p=>[...REQUIRED,...(p.location?['location']:[])];
function toGoogle(p,k,fields=[]){const event={summary:p.title,description:description(p,k),start:{dateTime:p.start,timeZone:p.timezone},end:{dateTime:p.end,timeZone:p.timezone},transparency:p.busy===false?'transparent':'opaque',reminders:{useDefault:false,overrides:[{method:'popup',minutes:p.reminderMinutes??15}]},...(p.location?{location:p.location}:{})};
 if(fields.includes('id'))event.id=k;if(fields.includes('extendedProperties.private'))event.extendedProperties={private:{dayweaveAction:p.id,dayweaveKey:k}};
 return {calendarId:p.calendarId,sendUpdates:'none',event};}
// Initial scope: one new personal event on an owned destination calendar. No updates, recurrence, attendees or invitations.
function actionErrors(p,d){const out=[],cal=(d.calendarCoverage?.calendars||[]).find(c=>c?.id===p.calendarId);
 if(C.calendarProvider(p)!=='google')out.push('Not a Google Calendar action.');
 if((p.action||'create')!=='create'||p.remoteRef||p.before)out.push('Only new personal events can be created; changing existing, course or shared events is not supported.');
 if(!['One time','none',undefined].includes(p.recurrence))out.push('Recurring events are not supported; recurrence must be One time.');
 if((p.attendees||[]).length)out.push('Attendees and invitations are not allowed.');
 if(!cal||cal.accessRole!=='owner')out.push('The destination must be a read calendar recorded with owner access.');
 return out;}
// Human approval evidence: the person's own chat message naming the exact Q-number, sent after the version was prepared.
function evidence(h,ref,preparedAt,now=new Date()){if(!plain(h))return ['Record the human chat approval as {channel:"chat", text, at}.'];const out=[];
 if(h.channel!=='chat')out.push('Approval must be the human\'s own chat message.');
 if(typeof h.text!=='string'||!new RegExp('\\bapprove\\s+'+ref.replace('-','\\-')+'\\b','i').test(h.text))out.push('The approval text must say "Approve '+ref+'".');
 if(!instant(h.at)||Date.parse(h.at)<Date.parse(preparedAt)||Date.parse(h.at)>+new Date(now)+60000)out.push('Approval time must be after the version was prepared and not in the future.');
 return out;}
// Event times from a connector: explicit instants, {dateTime} or all-day {date} (local midnight in the snapshot timezone).
function when(x,tz){if(instant(x))return Date.parse(x);if(plain(x)&&instant(x.dateTime))return Date.parse(x.dateTime);if(plain(x)&&/^\d{4}-\d{2}-\d{2}$/.test(x.date||'')){C.configure(tz);return Date.parse(C.zonedISO(x.date,'00:00'));}return NaN;}
function matches(p,k,events,tz){const s=Date.parse(p.start),e=Date.parse(p.end);return events.filter(x=>x&&x.status!=='cancelled'&&(String(x.description||'').includes('Dayweave action: '+p.id)||x.extendedProperties?.private?.dayweaveAction===p.id||x.id===k||x.summary===p.title&&when(x.start,tz)===s&&when(x.end,tz)===e));}
// Checks a live re-read made immediately before writing (or while reconciling): fresh, same identity, complete,
// covering the interval and every read calendar. Returns problems plus duplicate candidates and conflicts.
function live(p,k,read,d,now=new Date()){const out=[];if(!plain(read))return {errors:['Provide the live re-read.'],dup:[],conflicts:[]};
 if(!instant(read.checkedAt)||+new Date(now)-Date.parse(read.checkedAt)>LIVE_MAX_AGE_MS||Date.parse(read.checkedAt)>+new Date(now)+60000)out.push('The live re-read must be at most 15 minutes old.');
 if(read.provider!=='google'||read.account!==p.account)out.push('The live re-read is for a different provider or account.');
 const cals=Array.isArray(read.calendars)?read.calendars:[],need=(d.calendarCoverage?.calendars||[]).map(c=>c.id);
 if(!cals.includes(p.calendarId)||need.some(id=>!cals.includes(id)))out.push('The live re-read must include the destination and every calendar in the verified coverage.');
 if(read.complete!==true)out.push('The live re-read is incomplete, so blank time is unknown.');
 if(!(Date.parse(read.start)<=Date.parse(p.start)&&Date.parse(read.end)>=Date.parse(p.end)))out.push('The live re-read does not cover the action interval.');
 if(!Array.isArray(read.events))out.push('The live re-read has no event list.');
 const events=Array.isArray(read.events)?read.events:[],dup=matches(p,k,events,p.timezone),s=Date.parse(p.start),e=Date.parse(p.end);
 const conflicts=events.filter(x=>x&&!dup.includes(x)&&x.status!=='cancelled'&&x.transparency!=='transparent'&&x.busy!==false&&when(x.start,p.timezone)<e&&s<when(x.end,p.timezone));
 return {errors:out,dup,conflicts};}
const norm=x=>String(x??'').replace(/\r\n/g,'\n').trim();
// Compares a read-back event with every approved field. Any difference is a mismatch; nothing is fixed automatically.
function compare(p,k,ev,mapped){const m=[],e=mapped.event;if(!plain(ev))return ['No read-back event.'];
 if(!ev.id)m.push('id: missing remote event ID');if(ev.calendarId!==p.calendarId)m.push('calendarId: '+ev.calendarId+' ≠ approved '+p.calendarId);
 if(ev.status==='cancelled')m.push('status: cancelled');if(ev.summary!==e.summary)m.push('summary differs');
 for(const f of ['start','end']){if(when(ev[f],p.timezone)!==Date.parse(e[f].dateTime))m.push(f+' time differs');if(ev[f]?.timeZone&&ev[f].timeZone!==p.timezone)m.push(f+'.timeZone '+ev[f].timeZone+' ≠ '+p.timezone);}
 if(norm(ev.description)!==norm(e.description))m.push('description (including the action marker) differs');
 if(norm(ev.location)!==norm(p.location))m.push('location differs');
 if((ev.transparency||'opaque')!==e.transparency)m.push('busy state differs');
 const o=ev.reminders?.overrides||[];if(ev.reminders?.useDefault!==false||o.length!==1||o[0].method!=='popup'||o[0].minutes!==e.reminders.overrides[0].minutes)m.push('reminder differs');
 if((ev.attendees||[]).length)m.push('attendees present');if((ev.recurrence||[]).length||ev.recurringEventId)m.push('recurrence present');if(ev.conferenceData||ev.hangoutLink)m.push('online meeting present');
 if(e.id&&ev.id!==e.id)m.push('client event ID differs');
 if(e.extendedProperties&&(ev.extendedProperties?.private?.dayweaveAction!==p.id||ev.extendedProperties?.private?.dayweaveKey!==k))m.push('extended properties differ');
 return m;}
function action(s,ref,id){const q=A.read(s,ref),p=q.value.find(x=>x.id===id);if(!p)throw Error('Action is not part of this exact approval');const store=s.storeId();return {q,p,k:key(store,p),store,d:s.snapshot()};}
const statusOf=(d,p)=>d.actionHistory.find(h=>h.id===p.id)?.status||null;
// 1. Verify the exact approved version and print the mapped requests. Writes nothing.
function verify(s,ref,approval,fields,now=new Date()){const q=A.read(s,ref),d=s.snapshot(),store=s.storeId(),blockers=[];
 if(!['prepared','pending','partial'].includes(q.status))blockers.push('Version '+q.reference+' is '+q.status+' and cannot be executed.');
 blockers.push(...evidence(approval,q.reference,q.at,now));
 if(!Array.isArray(fields))blockers.push('Record which event fields the connector can set (fields list) before writing.');
 const actions=q.value.map(p=>{const k=key(store,p),current=d.proposals.find(x=>x.id===p.id),errors=[...P.errors(p,d,now),...actionErrors(p,d)];
  if(!current||P.fingerprint(current)!==P.fingerprint(p))errors.push('The saved proposal changed since this version was prepared.');
  const missing=required(p).filter(f=>!(fields||[]).includes(f));if(Array.isArray(fields)&&missing.length)errors.push('The connector cannot set approved fields ('+missing.join(', ')+'). Stop rather than drop them.');
  return {id:p.id,fingerprint:P.fingerprint(p),receipt:statusOf(d,p),idempotencyKey:k,marker:marker(p,k),sourceRefs:p.sourceRefs||[],duplicateGuards:OPTIONAL.filter(f=>(fields||[]).includes(f)),request:toGoogle(p,k,fields||[]),errors:[...new Set(errors)]};});
 return {reference:q.reference,store,status:q.status,go:!blockers.length&&actions.every(a=>!a.errors.length),blockers,actions};}
// 2. Check a fresh live re-read for one action. Writes nothing.
function recheck(s,ref,id,read,now=new Date()){const {p,k,d}=action(s,ref,id),r=live(p,k,read,d,now),errors=[...r.errors];
 if(r.dup.length)errors.push('A matching event already exists ('+r.dup.map(x=>x.id).join(', ')+'); reconcile instead of writing.');
 if(r.conflicts.length)errors.push('Conflicts with '+r.conflicts.map(x=>x.summary||x.id).join(', ')+'; do not move the block silently.');
 return {id,go:!errors.length,errors,duplicates:r.dup.map(x=>x.id),conflicts:r.conflicts.map(x=>x.id)};}
// 3. Record pending before the remote save, only after verify and the live recheck both pass for this action.
function pending(s,ref,id,approval,fields,read,now=new Date()){const v=verify(s,ref,approval,fields,now),a=v.actions.find(x=>x.id===id);if(!a)throw Error('Action is not part of this exact approval');
 const problems=[...v.blockers,...a.errors,...recheck(s,ref,id,read,now).errors];if(problems.length)throw Error('Do not write: '+[...new Set(problems)].join(' '));
 A.record(s,{reference:v.reference,id,status:'pending',recordedAt:new Date(now).toISOString(),humanApproval:approval,fieldsUsed:a.duplicateGuards,evidence:'Live re-read at '+read.checkedAt+' was complete for '+read.calendars.length+' calendars with no conflicts or duplicates.'});
 return {id,status:'pending',write:a.request,idempotencyKey:a.idempotencyKey,next:'Write exactly this request once, then run readback. If the response is lost or unclear, run reconcile; never retry blindly.'};}
// 4. Compare the read-back event and record executed (all fields match) or unverified (any difference).
function readback(s,ref,id,ev,now=new Date()){const {p,k,d}=action(s,ref,id),st=statusOf(d,p);if(!['pending','unverified'].includes(st))throw Error('Record pending before a read-back (current: '+(st||'none')+').');
 const mapped=toGoogle(p,k,d.actionHistory.find(h=>h.id===p.id).fieldsUsed||[]),mismatches=compare(p,k,ev,mapped),at=new Date(now).toISOString();
 if(!mismatches.length)A.record(s,{reference:ref,id,status:'executed',recordedAt:at,verifiedAt:at,remoteRef:p.calendarId+'/'+ev.id,evidence:'Read back event '+ev.id+'; every approved field matched (summary, times, time zone, description and marker, location, busy state, reminder, no attendees, recurrence or meeting).'});
 else A.record(s,{reference:ref,id,status:'unverified',recordedAt:at,...(ev?.id?{remoteRef:p.calendarId+'/'+ev.id}:{}),evidence:'Read-back mismatch: '+mismatches.join('; ')+'. Human resolution required; do not edit, delete or retry automatically.'});
 return {id,status:mismatches.length?'unverified':'executed',mismatches};}
// 5. Reconcile an unknown outcome from a fresh complete search. Absence needs positive evidence; ambiguity stays unverified.
function reconcile(s,ref,id,search,now=new Date()){const {p,k,d}=action(s,ref,id),st=statusOf(d,p);if(!['pending','unverified'].includes(st))throw Error('Nothing to reconcile (current: '+(st||'none')+').');
 const r=live(p,k,search,d,now),at=new Date(now).toISOString(),note=x=>({reference:ref,id,recordedAt:at,...x});
 if(r.errors.length){if(st==='pending')A.record(s,note({status:'unverified',evidence:'Outcome unknown; the search cannot decide: '+r.errors.join(' ')}));return {id,status:'unverified',conclusion:'unknown',errors:r.errors};}
 if(!r.dup.length){A.record(s,note({status:'not_created',evidence:'Complete live re-read at '+search.checkedAt+' of '+search.calendars.length+' calendars from '+search.start+' to '+search.end+' found no event with marker, key, extended property or matching title and times.'}));return {id,status:'not_created',conclusion:'absent; a retry needs a newly prepared and approved version'};}
 if(r.dup.length>1){A.record(s,note({status:'unverified',evidence:'Multiple matching events ('+r.dup.map(x=>x.id).join(', ')+'); human resolution required. Do not delete or retry automatically.'}));return {id,status:'unverified',conclusion:'ambiguous',matches:r.dup.map(x=>x.id)};}
 return {...readback(s,ref,id,{calendarId:p.calendarId,...r.dup[0]},now),conclusion:'one match read back'};}
module.exports={LIVE_MAX_AGE_MS,REQUIRED,OPTIONAL,key,marker,description,required,toGoogle,actionErrors,evidence,when,matches,live,compare,verify,recheck,pending,readback,reconcile};
