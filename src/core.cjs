(function(){
'use strict';
let TZ='America/New_York';
function configure(timezone='America/New_York'){new Intl.DateTimeFormat('en',{timeZone:timezone}).format();TZ=timezone;}
const stamp=x=>new Date(x).getTime();
function dayKey(x){return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x));}
function classify(a,now){
  if(['submitted','graded','excused'].includes(a.status))return 'submitted';
  if(a.requirement==='choice')return 'optional';
  if(a.requirement==='uncertain'||a.status==='unknown')return 'verify';
  if(!a.dueAt)return 'undated';
  const h=(stamp(a.dueAt)-stamp(now))/3600000;
  return h<0?'overdue':h<=72?'soon':h<=168?'week':'later';
}
function overlap(a,b){return stamp(a.start)<stamp(b.end)&&stamp(b.start)<stamp(a.end);}
function zonedISO(date,time){
  const target=Date.parse(date+'T'+time+':00Z');let utc=target;
  for(let i=0;i<3;i++){
    const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(utc)).map(x=>[x.type,x.value]));
    const local=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);utc+=target-local;
  }
  return new Date(utc).toISOString();
}
function fingerprint(a){return JSON.stringify([a.id,a.title,a.start,a.end,a.recurrence,a.calendar,a.source,a.status]);}
function safeURL(s){try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)?u.href:'#';}catch{return '#';}}
// Calendar coverage identity. Legacy coverage without a provider is the Outlook source; Google coverage names its source,
// account, destination calendar ID and the bounded list of calendars actually read.
const CAL_DOWN=['failed','unavailable'];
function calendarSource(cov){return typeof cov?.sourceId==='string'&&cov.sourceId?cov.sourceId:'outlook';}
function calendarProvider(x){return x?.provider||'outlook';}
function sameCalendar(a,b){const p=calendarProvider(a);return p===calendarProvider(b)&&calendarSource(a)===calendarSource(b)&&(a?.account??null)===(b?.account??null)&&(p!=='google'||a?.calendarId===b?.calendarId);}
const startedIds=d=>new Set((d.actionHistory||[]).filter(h=>['pending','unverified','executed'].includes(h.status)).map(h=>h.id));
// The active calendar source of a snapshot is failed or unavailable.
function calendarDown(d){const id=calendarSource(d.calendarCoverage);return d.sources.some(s=>s.id===id&&CAL_DOWN.includes(s.status));}
function validateCoverage(cov,sources){
  // Legacy-shaped coverage (no provider) means Outlook: it cannot describe a Google-only snapshot that lists no Outlook source.
  if(cov&&cov.provider===undefined&&sources.some(s=>s.id==='google-calendar')&&!sources.some(s=>s.id==='outlook'))throw Error('Coverage without a provider is Outlook coverage; Google calendar coverage needs provider "google"');
  if(!cov||cov.provider===undefined)return;
  if(!['google','outlook'].includes(cov.provider))throw Error('Calendar provider must be google or outlook');
  if(cov.provider!=='google')return;
  if(typeof cov.account!=='string'||!cov.account||typeof cov.calendarId!=='string'||!cov.calendarId)throw Error('Google coverage needs the verified account and destination calendar ID');
  if(!sources.some(s=>s.id===cov.sourceId))throw Error('Google coverage sourceId must be listed in sources');
  const ids=Array.isArray(cov.calendars)&&cov.calendars.length<=25?cov.calendars.map(c=>c&&typeof c.id==='string'&&c.id&&typeof c.name==='string'?c.id:null):[null];
  if(!ids.length||ids.includes(null)||new Set(ids).size!==ids.length)throw Error('Google coverage needs a bounded list (1–25) of read calendars with id and name');
  if(!ids.includes(cov.calendarId))throw Error('The destination calendar must be one of the read calendars');
}
const emailModule=()=>typeof module!=='undefined'?require('./email.cjs'):(typeof window!=='undefined'?window.PlannerEmail:null);
function safeJSON(x){return JSON.stringify(x).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}
function validate(data){
  if(data.schemaVersion!==1||!Number.isFinite(stamp(data.generatedAt)))throw Error('Invalid snapshot metadata');
  for(const key of ['courses','assignments','events','proposals','sources','priorities'])if(!Array.isArray(data[key]))throw Error('Missing '+key);
  for(const key of ['courses','assignments','events','proposals','sources']){
    const ids=new Set();for(const x of data[key]){if(!x.id||ids.has(x.id))throw Error('Duplicate/missing '+key+' id');ids.add(x.id);if(x.source&&safeURL(x.source)==='#')throw Error('Unsafe source URL');}
  }
  for(const a of data.assignments)if(a.dueAt&&!Number.isFinite(stamp(a.dueAt)))throw Error('Invalid deadline');
  for(const e of [...data.events,...data.proposals])if(!Number.isFinite(stamp(e.start))||!Number.isFinite(stamp(e.end))||stamp(e.end)<=stamp(e.start))throw Error('Invalid event interval');
  validateCoverage(data.calendarCoverage,data.sources);
  const M=emailModule();if(M&&data.email!=null){const e=M.normalize(data.email);if(e.enabled&&!data.sources.some(s=>s.id===e.sourceId))throw Error('Email sourceId must be listed in sources');}
  return data;
}
function proposalErrors(p,data,now=new Date()){
 const errors=[];if(!p.title?.trim())errors.push('Enter an event title.');
 if(!Number.isFinite(stamp(p.start))||!Number.isFinite(stamp(p.end))||stamp(p.end)<=stamp(p.start))errors.push('End must follow start.');
 if(stamp(p.start)<stamp(now))errors.push('This proposed time has passed.');
 const parts=t=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t)).map(x=>[x.type,x.value]));
 // A block may end exactly at local midnight (the 09:00–24:00 day) but never start before 09:00 or run past midnight.
 if(Number.isFinite(stamp(p.start))&&Number.isFinite(stamp(p.end))){const s=parts(p.start),e=parts(p.end),midnight=e.hour==='00'&&e.minute==='00'&&dayKey(p.end)===new Date(Date.parse(dayKey(p.start)+'T12:00:00Z')+86400000).toISOString().slice(0,10);if(+s.hour<9||dayKey(p.start)!==dayKey(p.end)&&!midnight||(+e.hour===0&&!midnight))errors.push('Keep the midnight–9 AM sleep window free.');}
 if(data.events.some(e=>e.busy!==false&&overlap(p,e)))errors.push('Overlaps a known calendar commitment.');
 if(data.actionHistory?.some(e=>e.id===p.id&&e.status==='executed'))errors.push('This action is already recorded as executed.');
 if(!data.calendarCoverage?.complete)errors.push('Calendar coverage is incomplete; refresh it before requesting changes.');
 if(data.calendarCoverage&& (stamp(p.start)<stamp(data.calendarCoverage.start)||stamp(p.end)>stamp(data.calendarCoverage.end)))errors.push('Outside the checked calendar window.');
 return errors;
}
// Google execution receipts start only as a pending receipt the local bridge records in this database, so a snapshot import
// never adds one. An incoming receipt the local journal lacks is rejected when it names a provider other than Outlook, carries
// a field only Google receipts have (GOOGLE_FIELDS or a structured humanApproval, including the planner's sourceRefs/minutes),
// or belongs to a Google proposal or receipt (`googleIds` adds the store's approval copies). While the local or incoming
// coverage is Google, every other new receipt is rejected too unless it belongs to an Outlook proposal already in the local
// snapshot: an incoming proposal never vouches for its own receipt. Receipts the local journal already holds are ignored
// (local wins). A consistency guard, not authentication.
const GOOGLE_FIELDS=['idempotencyKey','store','connector','account','calendarId','sourceRefs','minutes','hold','holdScope','conclusion'];
function importedGoogleReceipts(old,incoming,googleIds=[]){
  const google=new Set(googleIds),local=new Set((old?.actionHistory||[]).map(h=>h?.id));
  for(const p of [...(old?.proposals||[]),...(incoming.proposals||[])])if(calendarProvider(p)==='google')google.add(p.id);
  for(const h of old?.actionHistory||[])if(h?.provider==='google')google.add(h.id);
  const outlook=new Set((old?.proposals||[]).filter(p=>!google.has(p.id)).map(p=>p.id)),googleCoverage=[old?.calendarCoverage,incoming.calendarCoverage].some(c=>c&&calendarProvider(c)==='google');
  const googleShaped=h=>calendarProvider(h)!=='outlook'||GOOGLE_FIELDS.some(k=>h?.[k]!=null)||(!!h?.humanApproval&&typeof h.humanApproval==='object');
  return (Array.isArray(incoming.actionHistory)?incoming.actionHistory:[]).filter(h=>!local.has(h?.id)&&(googleShaped(h)||google.has(h?.id)||googleCoverage&&!outlook.has(h?.id))).map(h=>String(h?.id));
}
function mergeSnapshot(old,incoming,{googleIds=[]}={}){
  const M=emailModule(),forged=importedGoogleReceipts(old,incoming,googleIds);
  if(forged.length)throw Error('Snapshot imports cannot add Google calendar receipts ('+forged.slice(0,5).map(x=>x.slice(0,80)).join(', ')+(forged.length>5?', …':'')+'). They are recorded only in this database by scripts/google-calendar.cjs; remove actionHistory from the snapshot.');
  // A first import gets the same active-calendar failure invalidation as later ones.
  if(!old){let d=validate(incoming);if(calendarDown(d))d={...d,...(d.calendarCoverage?{calendarCoverage:{...d.calendarCoverage,complete:false}}:{}),proposals:d.proposals.filter(p=>startedIds(d).has(p.id))};return M&&d.email!=null?validate({...d,email:M.merge(null,d.email,d.sources,d.generatedAt)}):d;}
  const result={...old,...incoming};
  for(const key of ['actionHistory','candidateHistory'])result[key]=[...new Map([...(old[key]||[]),...(incoming[key]||[])].map(x=>[x.id,x])).values()];
  // Preserve the newer user-reported career state when merging an older snapshot.
  const careerStates=new Map();for(const h of [...(old.candidateHistory||[]),...(incoming.candidateHistory||[])]){const previous=careerStates.get(h.id);if(!previous||Date.parse(h.updatedAt)>Date.parse(previous.updatedAt))careerStates.set(h.id,h);}result.candidateHistory=[...careerStates.values()];
  // Collection snapshots cannot rewind an existing local execution journal.
  result.actionHistory=[...new Map([...(incoming.actionHistory||[]),...(old.actionHistory||[])].map(x=>[x.id,x])).values()];
  // A failed or unavailable source keeps its earlier records and last success time.
  const down=new Set(incoming.sources.filter(s=>CAL_DOWN.includes(s.status)).map(s=>s.id));
  if(down.has('career'))result.career={...old.career,note:'Research refresh failed; retained recommendations may be stale.'};
  // When the calendar identity changed, the previous account's events and success time are not evidence for the new one.
  const cov=incoming.calendarCoverage||old.calendarCoverage,moved=!!old.calendarCoverage&&!sameCalendar(cov,old.calendarCoverage),oldCal=calendarSource(old.calendarCoverage);
  const keep=(x,key)=>down.has(x.sourceId)&&!(key==='events'&&moved&&x.sourceId===oldCal);
  for(const key of ['assignments','events']){
    result[key]=[...incoming[key].filter(x=>!down.has(x.sourceId)),...old[key].filter(x=>keep(x,key))];
  }
  result.sources=incoming.sources.map(s=>down.has(s.id)?{...s,lastSuccess:moved&&s.id===oldCal?null:old.sources.find(x=>x.id===s.id)?.lastSuccess||null}:s);
  // Only the active calendar source (legacy: outlook) invalidates coverage; an email or other source failure does not.
  // After an identity change the incomplete coverage shows the identity this import reported, never the previous one.
  // Started actions (pending, unverified, executed) are not actionable and stay as protections: a calendar failure keeps them, and a
  // collector copy with the same ID never replaces their reviewed fields.
  const started=startedIds(result);
  if(down.has(calendarSource(cov))){result.calendarCoverage={...(moved?cov:old.calendarCoverage),complete:false};result.proposals=old.proposals.filter(p=>started.has(p.id));}
  // Local planner blocks are not part of a source snapshot; keep those whose identity and evidence still hold.
  else if(typeof module!=='undefined')result.proposals=[...incoming.proposals,...require('./planner.cjs').keep(old,result)];
  // Of the old and incoming copies of a started action, the one matching the frozen receipt fingerprint wins, else the old one.
  const P2=typeof module!=='undefined'?require('./phase2.cjs'):window.PlannerPhase2,receipt=new Map(result.actionHistory.map(h=>[h.id,h.fingerprint]));
  result.proposals=result.proposals.map(p=>{if(!started.has(p.id))return p;const o=old.proposals.find(o=>o.id===p.id);return [o,p].find(x=>x&&P2&&P2.fingerprint(x)===receipt.get(p.id))||o||p;});
  if(M&&(old.email!=null||incoming.email!=null))result.email=M.merge(old.email,incoming.email,incoming.sources,incoming.generatedAt);
  return validate(result);
}
const api={get TZ(){return TZ;},configure,stamp,dayKey,classify,overlap,zonedISO,fingerprint,safeURL,safeJSON,calendarSource,calendarProvider,sameCalendar,calendarDown,validateCoverage,validate,proposalErrors,importedGoogleReceipts,mergeSnapshot};
if(typeof module!=='undefined')module.exports=api;else window.PlannerCore=api;

})();
