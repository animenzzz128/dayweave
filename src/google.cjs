'use strict';
// Approved Google Calendar execution bridge for the assistant's Google Calendar connector. The root assistant performs every
// remote read and write with its own connector tools; this module verifies the exact approved version, maps it to the
// connector's create arguments, checks a live re-read, compares the connector's read-back and records local receipts.
// It holds no credentials and makes no network calls.
const crypto=require('node:crypto'),C=require('./core.cjs'),P=require('./phase2.cjs'),A=require('./approvals.cjs');
const LIVE_MAX_AGE_MS=15*60000,ABSENCE_MARGIN_MS=24*3600000;
// Capability profile of the connected create tool, taken from its declaration. Only `sends` (plus `location` when the approved
// location is non-empty and `color_id` when the approved block has a colour) is sent, with `fixed` values; `notSent` arguments keep their defaults. The connector offers no
// invitation-update setting, client event ID or extended properties, so none is claimed: duplicate protection is the
// description marker, the serial pending receipt and reconciliation, never a provider guarantee.
const PROFILE=Object.freeze({
 name:'google-calendar-connector',
 tool:'google_calendar_create_event',
 sends:Object.freeze(['calendar_id','title','description','start_time','end_time','timezone_str','attendees','add_google_meet','event_type','transparency','reminders']),
 fixed:Object.freeze({attendees:[],add_google_meet:false,event_type:'default'}),
 notSent:Object.freeze(['recurrence','start_date','end_date','attendee_optionality','auto_decline_mode','chat_status','decline_message','guests_can_modify','self_attendance','visibility']),
 unsupported:Object.freeze(['sendUpdates','client event ID','extendedProperties']),
});
const instant=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
const dateOnly=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'));
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
// Deterministic idempotency key bound to store, action and fingerprint. It is written only into the description marker.
function key(storeId,p){return 'd0'+crypto.createHash('sha256').update([storeId,p.id,P.fingerprint(p)].join('|')).digest('hex').slice(0,30);}
const marker=(p,k)=>`Dayweave action: ${p.id} · key ${k}`;
const description=(p,k)=>(p.body?p.body+'\n\n':'')+marker(p,k);
const required=p=>[...PROFILE.sends,...(p.location?['location']:[]),...(p.color!=null?['color_id']:[])];
// The exact connector create arguments for one approved action.
function toConnector(p,k){return {calendar_id:p.calendarId,title:p.title,description:description(p,k),start_time:p.start,end_time:p.end,timezone_str:p.timezone,
 ...structuredClone(PROFILE.fixed),transparency:p.busy===false?'transparent':'opaque',reminders:{use_default:false,overrides:[{method:'popup',minutes:p.reminderMinutes??15}]},...(p.location?{location:p.location}:{}),...(p.color!=null?{color_id:p.color}:{})};}
// Initial scope: one new personal event on an owned destination calendar. No updates, recurrence, attendees or meetings.
// Removals (owner request 2026-10-27) delete one event Dayweave itself wrote; src/phase2.cjs checks which one.
function actionErrors(p,d){const out=[],cal=(d.calendarCoverage?.calendars||[]).find(c=>c?.id===p.calendarId),removal=p.action==='delete';
 if(C.calendarProvider(p)!=='google')out.push('Not a Google Calendar action.');
 if(removal){if(!p.replaces||typeof p.remoteRef!=='string'||!p.remoteRef.startsWith(p.calendarId+'/')||p.before)out.push('A removal names one event Dayweave wrote on the destination calendar.');}
 else if((p.action||'create')!=='create'||p.remoteRef||p.before)out.push('Only new personal events can be created; changing existing, course or shared events is not supported.');
 if(!['One time','none',undefined].includes(p.recurrence))out.push('Recurring events are not supported; recurrence must be One time.');
 if((p.attendees||[]).length)out.push('Attendees and invitations are not allowed.');
 if(!cal||cal.accessRole!=='owner')out.push('The destination must be a read calendar recorded with owner access.');
 if(!instant(p.start)||!instant(p.end))out.push('Timed start and end with explicit offsets are required.');
 return out;}
// Human approval evidence: the person's own chat message that is exactly "Approve Q-N" (case-insensitive, optional final
// period or exclamation mark), sent after the version was prepared. Anything else, including negations, goes back to the human.
// Two channels: the human's own chat message (operator CLI), or the owner's approval the server recorded from the signed-in page
// (src/execute.cjs; the executor API never accepts it from a caller).
function evidence(h,ref,preparedAt,now=new Date()){if(!plain(h))return ['Record the human chat approval as {channel:"chat", text, at}.'];const out=[];
 if(h.channel!=='chat'&&!(h.channel==='web'&&typeof h.by==='string'&&h.by))out.push('Approval must be the human\'s own chat message or the owner\'s approval on the page.');
 if(typeof h.text!=='string'||!new RegExp('^\\s*approve\\s+'+ref.replace('-','\\-')+'\\s*[.!]?\\s*$','i').test(h.text))out.push('The approval message must be exactly "Approve '+ref+'"; anything else needs the human to clarify.');
 if(!instant(h.at)||Date.parse(h.at)<Date.parse(preparedAt)||Date.parse(h.at)>+new Date(now)+60000)out.push('Approval time must be after the version was prepared and not in the future.');
 return out;}
// Connector event times: explicit-offset instants, or all-day date strings with an exclusive end (local midnight in `tz`).
// Anything else (no offset, mixed forms, REST-style objects, end not after start) is unreadable and returns null.
function times(ev,tz){const s=ev?.start,e=ev?.end;
 if(instant(s)&&instant(e))return Date.parse(e)>Date.parse(s)?{start:Date.parse(s),end:Date.parse(e),allDay:false}:null;
 if(dateOnly(s)&&dateOnly(e)&&e>s){C.configure(tz);return {start:Date.parse(C.zonedISO(s,'00:00')),end:Date.parse(C.zonedISO(e,'00:00')),allDay:true};}
 return null;}
const label=(ev,cal)=>String(ev?.summary||ev?.id||'event').slice(0,80)+' ('+cal+')';
// Whether an event's description carries this action's marker line (any key: another store or version is still this action).
const hasMarker=(p,ev)=>{const text=String(ev?.description??'');return (text+'\n').includes('Dayweave action: '+p.id+' ')||text.endsWith('Dayweave action: '+p.id);};
// Checks a live re-read made with the connector immediately before writing (or while reconciling). Calendar provenance comes
// from the query context: `reads[]` holds one complete read per calendar the operator queried, with that calendar's raw events.
// Returns problems plus target duplicates, possible (unmarked) duplicates, markers on other calendars and busy conflicts. A
// marked event whose times cannot be read is still returned as a match (it exists), besides making the read fail closed.
function live(p,k,read,d,now=new Date()){const out=[],res={errors:out,target:[],possible:[],foreign:[],conflicts:[]};if(!plain(read)){out.push('Provide the live re-read.');return res;}
 if(!instant(read.checkedAt)||+new Date(now)-Date.parse(read.checkedAt)>LIVE_MAX_AGE_MS||Date.parse(read.checkedAt)>+new Date(now)+60000)out.push('The live re-read must be at most 15 minutes old.');
 if(read.provider!=='google'||read.account!==p.account)out.push('The live re-read is for a different provider or account.');
 if(!(instant(read.start)&&instant(read.end)&&Date.parse(read.start)<=Date.parse(p.start)&&Date.parse(read.end)>=Date.parse(p.end)))out.push('The live re-read does not cover the action interval.');
 const reads=Array.isArray(read.reads)?read.reads:null;if(!reads){out.push('The live re-read needs reads[]: one {calendarId, complete, events} per queried calendar.');return res;}
 const ids=reads.map(r=>plain(r)&&typeof r.calendarId==='string'&&r.calendarId?r.calendarId:null),need=[p.calendarId,...(d.calendarCoverage?.calendars||[]).map(c=>c.id)];
 if(ids.includes(null)||new Set(ids).size!==ids.length)out.push('Each read needs its own queried calendarId, once.');
 if(need.some(id=>!ids.includes(id)))out.push('The live re-read must include the destination and every calendar in the verified coverage.');
 const s=Date.parse(p.start),e=Date.parse(p.end);
 for(const r of reads.filter(plain)){const cal=r.calendarId;
  if(r.complete!==true)out.push('The read of '+cal+' is incomplete, so blank time is unknown.');
  if(!Array.isArray(r.events)){out.push('The read of '+cal+' has no event list.');continue;}
  for(const ev of r.events){if(!plain(ev)){out.push('An event on '+cal+' is not an object.');continue;}if(ev.status==='cancelled')continue;
   const t=times(ev,p.timezone),item={calendarId:cal,event:ev};if(!t)out.push('Event '+label(ev,cal)+' has times that cannot be read; blank time is unknown.');
   if(Array.isArray(ev.recurrence)&&ev.recurrence.length)out.push('Event '+label(ev,cal)+' is an unexpanded recurring series; read its occurrences.');
   if(hasMarker(p,ev)){(cal===p.calendarId?res.target:res.foreign).push(item);continue;}
   if(!t)continue;
   if(cal===p.calendarId&&ev.summary===p.title&&t.start===s&&t.end===e)res.possible.push(item);
   else if(ev.transparency!=='transparent'&&t.start<e&&s<t.end)res.conflicts.push(item);}}
 return res;}
const norm=x=>String(x??'').replace(/\r\n/g,'\n').trim();
// Compares the connector's read-back event (raw read shape) with every approved field, including that it has no attendees,
// meeting or recurrence. Any difference is a mismatch; nothing is fixed automatically.
function compare(p,k,ev){const m=[],c=toConnector(p,k);if(!plain(ev))return ['No read-back event.'];
 if(typeof ev.id!=='string'||!ev.id)m.push('id: missing remote event ID');
 if(ev.status==='cancelled')m.push('status: cancelled');
 if(ev.summary!==c.title)m.push('summary differs');
 for(const f of ['start','end'])if(!instant(ev[f])||Date.parse(ev[f])!==Date.parse(c[f+'_time']))m.push(f+' time differs or is not a timed instant');
 if(norm(ev.description)!==norm(c.description))m.push('description (including the action marker) differs');
 if(norm(ev.location)!==norm(p.location))m.push('location differs');
 if((ev.transparency??'opaque')!==c.transparency)m.push('busy state differs');
 if(c.color_id!=null&&String(ev.color_id??'')!==c.color_id)m.push('colour differs');
 const o=ev.reminders?.overrides;if(ev.reminders?.use_default!==false||!Array.isArray(o)||o.length!==1||o[0]?.method!=='popup'||o[0]?.minutes!==c.reminders.overrides[0].minutes)m.push('reminder differs');
 if(ev.attendees!=null&&!(Array.isArray(ev.attendees)&&!ev.attendees.length))m.push('attendees present');
 if(ev.hangout_link!=null||ev.conference_data!=null||ev.conferenceData!=null||ev.hangoutLink!=null)m.push('online meeting present');
 if((ev.recurrence!=null&&!(Array.isArray(ev.recurrence)&&!ev.recurrence.length))||ev.recurring_event_id!=null)m.push('recurrence present');
 if((ev.event_type??'default')!=='default')m.push('event type '+ev.event_type+' is not default');
 if(ev.organizer?.is_self!==true)m.push('organizer is not the connected account');
 return m;}
const statusOf=(d,id)=>d.actionHistory.find(h=>h.id===id)||null;
// A started action keeps the store and key frozen in its receipt; only a new attempt computes them.
function action(s,ref,id){const q=A.read(s,ref),p=q.value.find(x=>x.id===id);if(!p)throw Error('Action is not part of this exact approval');const d=s.snapshot(),h=statusOf(d,p.id);
 const frozen=h&&['pending','unverified','executed'].includes(h.status)&&h.idempotencyKey;return {q,p,d,h,store:frozen?h.store:s.storeId(),k:frozen?h.idempotencyKey:key(s.storeId(),p)};}
// 1. Verify the exact approved version and print the connector requests. `declared` lists the create tool's declared
// argument names; a required argument it lacks blocks the action instead of being dropped. Writes nothing.
function verify(s,ref,approval,declared,now=new Date(),{direct=false}={}){const q=A.read(s,ref),d=s.snapshot(),store=s.storeId(),blockers=[];
 if(!['prepared','pending','partial'].includes(q.status))blockers.push('Version '+q.reference+' is '+q.status+' and cannot be executed.');
 blockers.push(...evidence(approval,q.reference,q.at,now));
 if(!Array.isArray(declared)||!declared.every(x=>typeof x==='string'))blockers.push('Record the create tool\'s declared argument names (a list) before writing.');
 const actions=q.value.map(p=>{const k=key(store,p),current=d.proposals.find(x=>x.id===p.id),errors=[...P.errors(p,d,now,s.startedCopies(d)),...actionErrors(p,d)],h=statusOf(d,p.id);
  if(A.notCreatedUnder(h,q))errors.push('This action was not created under '+q.reference+'; a retry needs a newly prepared and approved version.');
  if(!current||P.fingerprint(current)!==P.fingerprint(p))errors.push('The saved proposal changed since this version was prepared.');
  const removal=p.action==='delete';if(removal&&!direct)errors.push('Removals run only from the site\'s direct Google Calendar write; the connector has no delete tool.');
  const missing=Array.isArray(declared)&&!removal?required(p).filter(f=>!declared.includes(f)):[];if(missing.length)errors.push('The connector cannot set approved fields ('+missing.join(', ')+'). Stop rather than drop them.');
  return {id:p.id,fingerprint:P.fingerprint(p),receipt:statusOf(d,p.id)?.status||null,idempotencyKey:k,marker:marker(p,k),sourceRefs:p.sourceRefs||[],profile:PROFILE.name,tool:PROFILE.tool,request:removal?{remove:p.remoteRef}:toConnector(p,k),errors:[...new Set(errors)]};});
 return {reference:q.reference,store,status:q.status,go:!blockers.length&&actions.every(a=>!a.errors.length),blockers,actions,unsupported:PROFILE.unsupported};}
// 2. Check a fresh live re-read for one action. Writes nothing.
function recheck(s,ref,id,read,now=new Date()){const {p,k,d}=action(s,ref,id),r=live(p,k,read,d,now),errors=[...r.errors];
 if(r.target.length||r.possible.length)errors.push('A matching event already exists on the destination ('+[...r.target,...r.possible].map(x=>x.event.id).join(', ')+'); reconcile instead of writing.');
 if(r.foreign.length)errors.push('This action\'s marker is on another calendar ('+r.foreign.map(x=>x.calendarId+'/'+x.event.id).join(', ')+'); resolve it with the human.');
 if(r.conflicts.length)errors.push('Conflicts with '+r.conflicts.map(x=>label(x.event,x.calendarId)).join(', ')+'; do not move the block silently.');
 return {id,go:!errors.length,errors,duplicates:r.target.map(x=>x.event.id),possibleDuplicates:r.possible.map(x=>x.event.id),otherCalendars:r.foreign.map(x=>x.calendarId+'/'+x.event.id),conflicts:r.conflicts.map(x=>x.calendarId+'/'+x.event.id)};}
// 3. Record pending before the remote save, only after verify and the live recheck both pass for this action.
function pending(s,ref,id,approval,declared,read,now=new Date()){const v=verify(s,ref,approval,declared,now),a=v.actions.find(x=>x.id===id);if(!a)throw Error('Action is not part of this exact approval');
 const problems=[...v.blockers,...a.errors,...recheck(s,ref,id,read,now).errors];if(problems.length)throw Error('Do not write: '+[...new Set(problems)].join(' '));
 A.record(s,{reference:v.reference,id,status:'pending',recordedAt:new Date(now).toISOString(),humanApproval:approval,evidence:'Live re-read at '+read.checkedAt+' was complete for '+read.reads.length+' calendars with no conflicts or duplicates.'},{bridge:A.BRIDGE});
 return {id,status:'pending',tool:PROFILE.tool,write:a.request,idempotencyKey:a.idempotencyKey,next:'Call the create tool once with exactly these arguments, then read the event back. If the response is lost or unclear, run reconcile; never retry blindly.'};}
// 4. Compare the connector read-back and record executed (all fields match) or unverified (any difference). `rb` is
// {calendarId, account, event}: the calendar and account of the authenticated read, and the raw event it returned. Once this
// claim has seen a marked event, a direct read-back may only open that same event (calendar and ID); anything else, several
// events or an earlier event that could not be fully recorded needs a reconcile (and possibly the human).
function readback(s,ref,id,rb,now=new Date(),{fromReconcile=false}={}){const {p,k,d,h}=action(s,ref,id),st=h?.status;if(!['pending','unverified'].includes(st))throw Error('Record pending before a read-back (current: '+(st||'none')+').');
 const ev=plain(rb)?rb.event:null,m=[],ref2=plain(ev)&&typeof ev.id==='string'&&ev.id&&plain(rb)&&typeof rb.calendarId==='string'?rb.calendarId+'/'+ev.id:null,prior=seen(h);
 if(!fromReconcile){if(many(prior))throw Error('Several matching events were found; resolve them with the human and run a fresh reconcile that finds exactly one.');
  if(prior.unknown)throw Error('A marked event seen earlier for this action was not fully recorded ('+UNKNOWN+'); resolve it with the human.');
  if(prior.matches.some(x=>x!==ref2))throw Error('Marked event '+prior.matches.join(', ')+' was seen earlier for this action; read back only that event, or run a complete reconcile that covers where it was seen.');}
 if(!plain(rb)||rb.calendarId!==p.calendarId)m.push('read from calendar '+(plain(rb)?rb.calendarId:'unknown')+', not the approved '+p.calendarId);if(!plain(rb)||rb.account!==p.account)m.push('read with a different or unknown account');
 const mismatches=[...m,...compare(p,k,ev)],at=new Date(now).toISOString(),ok=!mismatches.length;
 if(ok)A.record(s,{reference:ref,id,status:'executed',recordedAt:at,verifiedAt:at,remoteRef:ref2,evidence:'Read back event '+ev.id+' from '+rb.calendarId+'; the compared approved fields matched (title, times, description and marker, location, busy state, popup reminder, default event type, organizer, no attendees, meeting or recurrence). Other returned fields were not compared.'},{bridge:A.BRIDGE});
 else{// The read event joins this claim's marked events when it carries the marker, so a mismatch never drops what was seen.
  const scope=join(prior,observe(hasMarker(p,ev)?[{calendarId:plain(rb)?rb.calendarId:null,event:ev}]:[],null,p.timezone));
  A.record(s,{reference:ref,id,status:'unverified',recordedAt:at,...(ref2?{remoteRef:ref2}:{}),...(many(scope)?{hold:'ambiguous'}:{}),holdScope:bare(scope),evidence:'Read-back mismatch: '+mismatches.join('; ')+'. Human resolution required; do not edit, delete or retry automatically.'},{bridge:A.BRIDGE});}
 return {id,status:ok?'executed':'unverified',mismatches};}
// Marked events a started claim has seen. Every outcome after its pending receipt keeps them in `holdScope`, whether or not the
// action is held: each marked event any reconcile or read-back saw (on the destination or another calendar, also in an
// incomplete or erroring read) as `calendarId/eventId` with its calendar and interval, plus the window and read calendars of a
// search that saw several at once. Within a claim they only grow. Two or more distinct events (calendar and ID) hold the action:
// a single match clears it only from complete reads covering all of that and 24 hours either side of the action, so a narrower
// search cannot leave a known marked event unseen. With one, only that same event is read back. `unknown` marks something that
// could not be recorded (see UNKNOWN); it stays set, the readable parts are kept, and nothing clears it automatically.
const held=h=>h?.hold==='ambiguous'||h?.conclusion==='ambiguous';
const UNKNOWN='a marked event with times that cannot be read or without an event or calendar ID, several seen by a search without valid bounds, an unreadable stored scope, or an outcome recorded before marked events were kept';
const names=x=>Array.isArray(x)?x.filter(v=>typeof v==='string'&&v):[],iso=x=>new Date(x).toISOString(),NONE=Object.freeze({start:null,end:null,calendars:[],matches:[]});
const many=x=>x.several||x.matches.length>1,bare=({several,...x})=>x;
// A recorded scope. An empty one (no marked event yet) is known; anything unreadable is unknown, keeping only its readable parts.
function scopeOf(raw){const x=plain(raw)?raw:{},all=v=>Array.isArray(v)&&v.every(i=>typeof i==='string'&&i),empty=all(x.matches)&&!x.matches.length&&x.start==null&&x.end==null;
 const known=plain(raw)&&x.unknown!==true&&all(x.calendars)&&all(x.matches)&&(empty||instant(x.start)&&instant(x.end)&&Date.parse(x.start)<=Date.parse(x.end));
 return {start:instant(x.start)?x.start:null,end:instant(x.end)?x.end:null,calendars:names(x.calendars),matches:names(x.matches),...(known?{}:{unknown:true})};}
function join(a,b){const lo=[a.start,b.start].filter(Boolean).map(Date.parse),hi=[a.end,b.end].filter(Boolean).map(Date.parse);
 return {start:lo.length?iso(Math.min(...lo)):null,end:hi.length?iso(Math.max(...hi)):null,calendars:[...new Set([...a.calendars,...b.calendars])].sort(),matches:[...new Set([...a.matches,...b.matches])],several:!!(a.several||b.several),...(a.unknown||b.unknown?{unknown:true}:{})};}
// The marked events one search (or read-back) saw: each match with its calendar and interval. A search that saw several also adds
// its window and read calendars. That window counts only when both bounds are valid instants; otherwise, or when a match has no
// calendar or event ID or its times cannot be read, the range becomes unknown rather than invented.
function observe(found,search,tz){const several=found.length>1,bounds=plain(search)&&instant(search.start)&&instant(search.end)&&Date.parse(search.start)<=Date.parse(search.end),wide=several&&bounds;
 const ids=found.map(x=>typeof x.calendarId==='string'&&x.calendarId&&typeof x.event?.id==='string'&&x.event.id?x.calendarId+'/'+x.event.id:null),spans=found.map(x=>times(x.event,tz)),ok=spans.filter(Boolean);
 const from=[...(wide?[Date.parse(search.start)]:[]),...ok.map(t=>t.start)],to=[...(wide?[Date.parse(search.end)]:[]),...ok.map(t=>t.end)],read=several&&Array.isArray(search?.reads)?search.reads.filter(plain).map(r=>r.calendarId):[];
 return {start:from.length?iso(Math.min(...from)):null,end:to.length?iso(Math.max(...to)):null,calendars:[...new Set([...names(read),...names(found.map(x=>x.calendarId))])].sort(),matches:[...new Set(ids.filter(Boolean))],several:false,
  ...(ids.includes(null)||spans.includes(null)||several&&!bounds?{unknown:true}:{})};}
// What the current claim has seen: the union over every outcome since its pending receipt (a hold, once recorded, stays). An
// outcome with no recorded scope is from before every outcome kept one: unless it is known to have seen no marked event (an
// unmarked look-alike, or an empty search too narrow for absence), what it saw is unknown. So is a hold with fewer than two matches.
function seen(h){const all=[...(Array.isArray(h?.attempts)?h.attempts:[]),h].filter(plain),i=all.map(x=>x.status).lastIndexOf('pending');let e={...NONE,several:false};
 for(const x of all.slice(Math.max(i,0)).filter(x=>x.status==='unverified')){
  const sc=x.holdScope!=null?scopeOf(x.holdScope):!held(x)&&(x.conclusion==='unmarked'||/^No marked event in /.test(String(x.evidence)))?{...NONE}:{...NONE,unknown:true};
  e=join(e,{...sc,several:held(x),...(held(x)&&sc.matches.length<2?{unknown:true}:{})});}
 return e;}
function uncovered(p,scope,search){if(scope.unknown||!scope.start||!scope.end)return ['resolve it with the human: the earlier hold scope is unknown ('+UNKNOWN+'), so no search can be shown to cover it'];
 const from=Math.min(Date.parse(p.start)-ABSENCE_MARGIN_MS,Date.parse(scope.start)),to=Math.max(Date.parse(p.end)+ABSENCE_MARGIN_MS,Date.parse(scope.end)),read=names(search.reads.map(r=>r.calendarId)),out=[];
 if(!(Date.parse(search.start)<=from&&Date.parse(search.end)>=to))out.push('read '+new Date(from).toISOString()+' to '+new Date(to).toISOString());
 const missing=scope.calendars.filter(c=>!read.includes(c));if(missing.length)out.push('read '+missing.join(', '));return out;}
// 5. Reconcile an unknown outcome from a fresh complete live re-read. Absence needs positive evidence: complete reads of every
// queried calendar from at least 24 hours before to 24 hours after the action, and it holds only for that window (never global
// absence); once this claim has seen a marked event it is never concluded. Ambiguity, unmarked look-alikes and markers on
// another calendar stay unverified. Calendar provenance always comes from the read, never the target.
function reconcile(s,ref,id,search,now=new Date()){const {p,k,d,h}=action(s,ref,id),st=h?.status;if(!['pending','unverified'].includes(st))throw Error('Nothing to reconcile (current: '+(st||'none')+').');
 const r=live(p,k,search,d,now),at=new Date(now).toISOString(),note=(x,extra={})=>({reference:ref,id,recordedAt:at,...x,...extra});
 // Marked events this search saw, on the destination or another calendar, even if it was incomplete or had errors: they exist.
 // They join every marked event this claim saw before; two or more distinct ones start or keep the hold.
 const found=[...r.target,...r.foreign],ids=found.map(x=>x.calendarId+'/'+x.event.id),prior=seen(h),scope=join(prior,observe(found,search,p.timezone)),hold=many(prior),keep=many(scope);
 const stay=(conclusion,evidenceText,extra={})=>{A.record(s,note({status:'unverified',conclusion,...(keep?{hold:'ambiguous'}:{}),holdScope:bare(scope),evidence:evidenceText+(keep&&!hold?' Several marked events have been seen for this action ('+scope.matches.join(', ')+'); the action is held until a complete reconcile covering where they were found finds exactly one.':'')+(hold&&conclusion!=='ambiguous'?' Several marked events were found earlier; only a complete reconcile that finds exactly one clears that.':'')}),{bridge:A.BRIDGE});return {id,status:'unverified',conclusion,...(keep?{hold:'ambiguous'}:{}),...extra};};
 if(r.errors.length)return stay('unknown','Outcome unknown; the search cannot decide: '+r.errors.join(' '),{errors:r.errors,...(ids.length?{matches:ids}:{})});
 if(r.foreign.length)return stay('other-calendar','This action\'s marker was found on another calendar ('+r.foreign.map(x=>x.calendarId+'/'+x.event.id).join(', ')+'); the write may have landed on the wrong calendar. Human resolution required; do not delete or retry automatically.',{matches:r.foreign.map(x=>x.calendarId+'/'+x.event.id)});
 if(r.target.length>1)return stay('ambiguous','Multiple matching events ('+r.target.map(x=>x.event.id).join(', ')+'); human resolution required. Do not delete or retry automatically.',{matches:r.target.map(x=>x.event.id)});
 if(!r.target.length&&r.possible.length)return stay('unmarked','An event with the same title and times but no action marker exists on the destination ('+r.possible.map(x=>x.event.id).join(', ')+'); human resolution required.',{matches:r.possible.map(x=>x.event.id)});
 if(!r.target.length){
  if(hold)return stay('ambiguous','A complete re-read now finds no marked event, but several were found earlier; human resolution required. Do not retry automatically.');
  if(prior.matches.length||prior.unknown)return stay('unknown','A complete re-read now finds no marked event, but '+(prior.matches.length?'marked event '+prior.matches.join(', ')+' was seen earlier':'an earlier outcome may have seen one it did not record')+', so the write may exist. Human resolution required; do not retry automatically.');
  if(!(Date.parse(search.start)<=Date.parse(p.start)-ABSENCE_MARGIN_MS&&Date.parse(search.end)>=Date.parse(p.end)+ABSENCE_MARGIN_MS))return stay('unknown','No marked event in '+search.start+' to '+search.end+', but absence needs complete reads from at least 24 hours before to 24 hours after the action; read the wider window.');
  A.record(s,note({status:'not_created',evidence:'Complete live re-read at '+search.checkedAt+' of '+search.reads.length+' calendars ('+search.reads.map(x=>x.calendarId).join(', ')+') from '+search.start+' to '+search.end+' found no event with this action marker in that window.'}),{bridge:A.BRIDGE});return {id,status:'not_created',conclusion:'absent in the searched window; a retry needs a newly prepared and approved version'};}
 // One marked event: read back as before, unless this claim also saw another one (a hold) or something it could not record.
 const one=r.target[0],gap=keep||scope.unknown?uncovered(p,scope.unknown?scope:prior,search):[];
 if(gap.length)return stay(keep?'ambiguous':'unknown','One marked event ('+one.event.id+') was found, but '+(scope.unknown?'a marked event seen for this action was not fully recorded':(hold?'several were':'another one was')+' found earlier between '+prior.start+' and '+prior.end+' on '+prior.calendars.join(', '))+'; this search does not rule out another one. To clear '+(keep?'the hold':'it')+', '+gap.join(' and ')+(scope.unknown?'.':' completely.'),{matches:[one.calendarId+'/'+one.event.id],needs:gap});
 return {...readback(s,ref,id,{calendarId:one.calendarId,account:search.account,event:one.event},now,{fromReconcile:true}),conclusion:'one match read back'};}
// Removals, direct write only. The event is read first: it must still be the block as Dayweave wrote it (its marker, title and
// times); one the owner changed in Google Calendar is kept and reported. Then pending, one delete, and a read that must find it
// gone (missing or cancelled) for executed; anything else is unverified and goes to the human. Nothing is retried.
function written(s,p){const d=s.snapshot(),h=statusOf(d,p.replaces),q=h&&[...s.startedCopies(d),...d.proposals].find(x=>x&&x.id===h.id&&P.fingerprint(x)===h.fingerprint);return {h,q};}
function removalCheck(s,p,ev){const {h,q}=written(s,p),out=[];if(!q||h?.status!=='executed')return ['The written block this removal names has no verified copy.'];
 if(!plain(ev)||ev.status==='cancelled')return out;
 if(!hasMarker(q,ev))out.push('The event no longer carries this block\'s Dayweave marker.');
 if(ev.summary!==q.title)out.push('The event title was changed in Google Calendar.');
 if(!instant(ev.start)||!instant(ev.end)||Date.parse(ev.start)!==Date.parse(q.start)||Date.parse(ev.end)!==Date.parse(q.end))out.push('The event was moved in Google Calendar.');
 return out;}
function removePending(s,ref,id,approval,ev,now=new Date()){const v=verify(s,ref,approval,[],now,{direct:true}),a=v.actions.find(x=>x.id===id);if(!a)throw Error('Action is not part of this exact approval');
 const {p}=action(s,ref,id),problems=[...v.blockers,...a.errors,...removalCheck(s,p,ev)];if(problems.length)throw Error('Do not remove: '+[...new Set(problems)].join(' '));
 A.record(s,{reference:v.reference,id,status:'pending',recordedAt:new Date(now).toISOString(),humanApproval:approval,evidence:'Event '+p.remoteRef+' read at '+new Date(now).toISOString()+(plain(ev)&&ev.status!=='cancelled'?' still matched the written block (marker, title, times).':' was already gone.')},{bridge:A.BRIDGE});
 return {id,status:'pending'};}
function removeOutcome(s,ref,id,after,now=new Date()){const {p,h}=action(s,ref,id);if(h?.status!=='pending')throw Error('Record pending before a removal outcome (current: '+(h?.status||'none')+').');
 const gone=after===null||plain(after)&&after.status==='cancelled',at=new Date(now).toISOString();
 A.record(s,{reference:ref,id,status:gone?'executed':'unverified',recordedAt:at,...(gone?{verifiedAt:at,remoteRef:p.remoteRef}:{}),evidence:gone?'Event '+p.remoteRef+' was read after the delete and is gone.':'Event '+p.remoteRef+' was still there after the delete, or the read failed. Human resolution required; do not retry automatically.'},{bridge:A.BRIDGE});
 return {id,status:gone?'executed':'unverified'};}
module.exports={written,removalCheck,removePending,removeOutcome,LIVE_MAX_AGE_MS,ABSENCE_MARGIN_MS,PROFILE,key,marker,description,required,toConnector,actionErrors,evidence,times,live,compare,verify,recheck,pending,readback,reconcile};
