'use strict';
// Direct Google Calendar writes from the hosted site (owner decision 2026-10-27, docs/google-direct.md). The signed-in owner
// connects Google Calendar once (OAuth, scope calendar.events only); the refresh token is stored encrypted per Google account.
// After the owner approves an exact Q version, the server runs the same bridge steps as the cloud executor (src/google.cjs):
// verify, live re-read of every coverage calendar, recheck, pending, one insert, read-back, or reconcile when the insert's
// outcome is unclear. Create only: nothing is moved or deleted, and a create is never retried.
const crypto=require('node:crypto'),A=require('./approvals.cjs'),G=require('./google.cjs'),X=require('./execute.cjs');
const API='https://www.googleapis.com/calendar/v3',TOKEN='https://oauth2.googleapis.com/token',REVOKE='https://oauth2.googleapis.com/revoke';
const SCOPE='https://www.googleapis.com/auth/calendar.events',MAX_PAGES=20,LIVE_MARGIN_MS=3600000;
// Refresh tokens are sealed with AES-256-GCM under a key derived from the session secret, bound to the account they belong to.
// Rotating the session secret makes stored tokens unreadable; the owner then connects again.
function vault(s,secret){const key=Buffer.from(crypto.hkdfSync('sha256',secret,'dayweave-google-token','calendar.events',32));
 const seal=(account,value)=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(account));const body=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);return [iv,c.getAuthTag(),body].map(b=>b.toString('base64url')).join('.');};
 const open=(account,text)=>{try{const [iv,tag,body]=String(text).split('.').map(x=>Buffer.from(x,'base64url')),d=crypto.createDecipheriv('aes-256-gcm',key,iv);d.setAAD(Buffer.from(account));d.setAuthTag(tag);return JSON.parse(Buffer.concat([d.update(body),d.final()]));}catch{return null;}};
 return {
  save(account,{refreshToken,scope}){account=String(account).toLowerCase();s.db.prepare('INSERT OR REPLACE INTO google_tokens VALUES(?,?)').run(account,seal(account,{refreshToken,scope,at:new Date().toISOString()}));s.log('calendar','connected',account,{scope});},
  load(account){account=String(account||'').toLowerCase();const row=s.db.prepare('SELECT value FROM google_tokens WHERE account=?').get(account);return row?open(account,row.value):null;},
  remove(account){account=String(account||'').toLowerCase();s.db.prepare('DELETE FROM google_tokens WHERE account=?').run(account);s.log('calendar','disconnected',account,{});},
 };}
const hasScope=scope=>String(scope||'').split(/\s+/).includes(SCOPE);
// Google's REST event, reduced to the raw read shape the bridge checks (src/google.cjs `times`, `live`, `compare`).
function normalize(ev){if(!ev||typeof ev!=='object')return ev;const t=x=>x?.dateTime??x?.date;
 return {id:ev.id,status:ev.status,summary:ev.summary,description:ev.description,location:ev.location,start:t(ev.start),end:t(ev.end),transparency:ev.transparency,
  reminders:ev.reminders?{use_default:ev.reminders.useDefault,overrides:ev.reminders.overrides||[]}:undefined,attendees:ev.attendees,hangoutLink:ev.hangoutLink,conferenceData:ev.conferenceData,
  recurrence:ev.recurrence,recurring_event_id:ev.recurringEventId,event_type:ev.eventType,organizer:ev.organizer?{is_self:ev.organizer.self===true}:undefined};}
// The approved connector request (src/google.cjs `toConnector`) as a Calendar API insert body. Nothing else is sent.
const toRest=c=>({summary:c.title,description:c.description,start:{dateTime:c.start_time,timeZone:c.timezone_str},end:{dateTime:c.end_time,timeZone:c.timezone_str},
 transparency:c.transparency,reminders:{useDefault:false,overrides:c.reminders.overrides},eventType:'default',...(c.location?{location:c.location}:{})});
// A Calendar API client for one stored account. Access tokens live only in memory.
function client({account,refreshToken,clientId,clientSecret,fetch:doFetch=globalThis.fetch}){let access=null,until=0;
 async function token(){if(access&&Date.now()<until-60000)return access;
  const r=await doFetch(TOKEN,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'}),signal:AbortSignal.timeout(30000)});
  const v=await r.json().catch(()=>({}));if(!r.ok){const e=Error(v.error==='invalid_grant'?'Google Calendar access expired or was revoked; connect Google Calendar again.':'Google token refresh failed ('+r.status+').');e.reconnect=v.error==='invalid_grant';throw e;}
  if(v.scope&&!hasScope(v.scope)){const e=Error('Google Calendar access lacks the calendar.events permission; connect Google Calendar again.');e.reconnect=true;throw e;}
  access=v.access_token;until=Date.now()+(v.expires_in||3600)*1000;return access;}
 async function call(method,route,query={},body){const q=new URLSearchParams(query).toString();
  const r=await doFetch(API+route+(q?'?'+q:''),{method,headers:{Authorization:'Bearer '+await token(),...(body?{'Content-Type':'application/json'}:{})},body:body&&JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const v=await r.json().catch(()=>null);if(!r.ok){const e=Error('Google Calendar '+r.status+(v?.error?.message?': '+v.error.message:''));e.status=r.status;throw e;}return v;}
 const cal=id=>'/calendars/'+encodeURIComponent(id)+'/events';
 return {account,token,
  // Every page of one calendar, recurring events expanded. More than MAX_PAGES pages is reported as incomplete.
  async list(calendarId,start,end){const events=[];let pageToken;
   for(let i=0;i<MAX_PAGES;i++){const v=await call('GET',cal(calendarId),{timeMin:start,timeMax:end,singleEvents:'true',maxResults:'250',...(pageToken?{pageToken}:{})});
    events.push(...(v.items||[]).map(normalize));pageToken=v.nextPageToken;if(!pageToken)return {complete:true,events};}
   return {complete:false,events};},
  insert:(calendarId,body)=>call('POST',cal(calendarId),{sendUpdates:'none'},body),
  get:async(calendarId,id)=>normalize(await call('GET',cal(calendarId)+'/'+encodeURIComponent(id))),
 };}
// One complete re-read of the destination and every coverage calendar around an action, in the bridge's live-read shape.
async function readAround(c,p,calendars,margin,now){const start=new Date(Date.parse(p.start)-margin).toISOString(),end=new Date(Date.parse(p.end)+margin).toISOString(),checkedAt=now().toISOString(),reads=[];
 for(const id of calendars){const r=await c.list(id,start,end);reads.push({calendarId:id,complete:r.complete,events:r.events});}
 return {checkedAt,provider:'google',account:c.account,start,end,reads};}
const running=new Set();
// Writes one owner-approved version. Each action is reported as executed, unverified, not_created, skipped (with the reason)
// or already done; a lost or failed insert is reconciled, never retried.
async function writeApproved(s,ref,c,{now=()=>new Date()}={}){const q=A.read(s,ref),approval=X.ownerApproval(s,q);if(!approval)throw Error(q.reference+' has no owner approval.');
 const d=s.snapshot(),cov=d?.calendarCoverage||{};if(String(cov.account||'').toLowerCase()!==String(c.account).toLowerCase())throw Error('The connected Google account ('+c.account+') is not the dashboard calendar account ('+(cov.account||'none')+').');
 if(running.has(s.storeId()))throw Error('A calendar write is already running.');running.add(s.storeId());
 try{const hist=d.actionHistory||[],receipt=p=>hist.find(h=>h.id===p.id)?.status||null;
  // A version whose every action already has a final receipt is reported, not run again.
  if(q.value.every(p=>['executed','not_created'].includes(receipt(p))))return {reference:q.reference,stopped:[],actions:q.value.map(p=>({id:p.id,title:p.title,status:receipt(p),already:true}))};
  await c.token();
  const v=G.verify(s,q.reference,approval,G.required({location:'x'}),now());if(v.blockers.length)return {reference:q.reference,stopped:v.blockers,actions:[]};
  const calendars=[...new Set([q.value[0]?.calendarId,...(cov.calendars||[]).map(x=>x.id)].filter(Boolean))],results=[];
  for(const a of [...v.actions].sort((x,y)=>Date.parse(q.value.find(p=>p.id===x.id).start)-Date.parse(q.value.find(p=>p.id===y.id).start))){const p=q.value.find(x=>x.id===a.id);
   const done=r=>results.push({id:p.id,title:p.title,...r});
   if(a.receipt==='executed'){done({status:'executed',already:true});continue;}
   if(['pending','unverified'].includes(a.receipt)){done(G.reconcile(s,q.reference,p.id,await readAround(c,p,calendars,G.ABSENCE_MARGIN_MS,now),now()));continue;}
   if(a.receipt){done({status:a.receipt,already:true});continue;}
   if(a.errors.length){done({status:'skipped',errors:a.errors});continue;}
   const live=await readAround(c,p,calendars,LIVE_MARGIN_MS,now),check=G.recheck(s,q.reference,p.id,live,now());if(!check.go){done({status:'skipped',errors:check.errors});continue;}
   const {write}=G.pending(s,q.reference,p.id,approval,G.required({location:'x'}),live,now());
   let created=null;try{created=await c.insert(p.calendarId,toRest(write));}catch{created=null;}
   let event=null;if(created?.id){try{event=await c.get(p.calendarId,created.id);}catch{event=null;}}
   done(event?G.readback(s,q.reference,p.id,{calendarId:p.calendarId,account:c.account,event},now()):G.reconcile(s,q.reference,p.id,await readAround(c,p,calendars,G.ABSENCE_MARGIN_MS,now),now()));}
  return {reference:q.reference,stopped:[],actions:results};}
 finally{running.delete(s.storeId());}}
async function revoke(token,{fetch:doFetch=globalThis.fetch}={}){try{await doFetch(REVOKE,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token}),signal:AbortSignal.timeout(15000)});}catch{}}
module.exports={SCOPE,vault,hasScope,normalize,toRest,client,readAround,writeApproved,revoke};
