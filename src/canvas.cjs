'use strict';
// Canvas calendar feed (ICS), read by the hosted server. The feed URL carries a private token in its path, so it lives only in
// the host's secret store; results and errors never include it. The feed gives titles and due times, not submission state.
const MAX_BYTES=5e6,TIMEOUT_MS=15000,MAX_ITEMS=500,PAST_DAYS=14,FUTURE_DAYS=180;
const unescapeText=v=>v.replace(/\\n/gi,'\n').replace(/\\([,;\\])/g,'$1');
// Local wall time in an IANA zone to an instant (two passes settle DST offsets).
function zoned(local,tz){const m=local.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);if(!m)return null;
 const wall=Date.UTC(+m[1],m[2]-1,+m[3],+m[4],+m[5],+m[6]),fmt=new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
 const offset=t=>{const p=Object.fromEntries(fmt.formatToParts(new Date(t)).map(x=>[x.type,x.value]));return Date.UTC(+p.year,p.month-1,+p.day,+p.hour,+p.minute,+p.second)-t;};
 let t=wall-offset(wall);t=wall-offset(t);return new Date(t).toISOString();}
// {at} for a timed value, {date} for an all-day value, null for floating or invalid times (their zone is unknown).
function when(params,value){
 if(/^\d{8}$/.test(value))return {date:value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6,8)};
 const z=value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);if(z)return {at:`${z[1]}-${z[2]}-${z[3]}T${z[4]}:${z[5]}:${z[6]}Z`};
 if(params.TZID){try{const at=zoned(value,params.TZID.replace(/^"|"$/g,''));return at&&{at};}catch{return null;}}
 return null;}
function parseIcs(text){
 const lines=String(text).replace(/\r\n?/g,'\n').replace(/\n[ \t]/g,'').split('\n'),events=[];let cur=null;
 for(const line of lines){
  if(line==='BEGIN:VEVENT'){cur={};continue;}if(line==='END:VEVENT'){if(cur)events.push(cur);cur=null;continue;}if(!cur)continue;
  const m=line.match(/^([A-Za-z0-9-]+)((?:;[^:;=]+=(?:"[^"]*"|[^:;"]*))*):(.*)$/);if(!m)continue;
  const params=Object.fromEntries([...m[2].matchAll(/;([^:;=]+)=("[^"]*"|[^:;"]*)/g)].map(p=>[p[1].toUpperCase(),p[2]]));cur[m[1].toUpperCase()]={params,value:m[3]};}
 return events.map(e=>{
  const uid=e.UID?.value||'',summary=unescapeText(e.SUMMARY?.value||'').trim(),url=e.URL?.value||'',start=e.DTSTART&&when(e.DTSTART.params,e.DTSTART.value),end=e.DTEND&&when(e.DTEND.params,e.DTEND.value);
  const bracket=summary.match(/^(.*?)\s*\[([^\]]+)\]$/),assignmentId=(uid.match(/^event-assignment-(?:override-)?(\d+)$/)||url.match(/#assignment_(\d+)/)||[])[1]||null;
  return {uid,kind:/^event-assignment-/.test(uid)||assignmentId?'assignment':'event',assignmentId,courseId:(url.match(/include_contexts=course_(\d+)/)||[])[1]||null,
   course:bracket?bracket[2]:null,title:bracket?bracket[1]:summary,start:start?.at||null,end:end?.at||null,date:start?.date||null,url:/^https:\/\//.test(url)?url:null};
 }).filter(x=>x.uid&&x.title&&(x.start||x.date));}
// Keeps a bounded window around now, so a feed with years of history stays small.
function windowed(items,now=Date.now()){const from=now-PAST_DAYS*86400000,to=now+FUTURE_DAYS*86400000,t=x=>Date.parse(x.start||x.date+'T12:00:00Z');
 return items.filter(x=>t(x)>=from&&t(x)<=to).sort((a,b)=>t(a)-t(b)).slice(0,MAX_ITEMS);}
async function fetchCanvas(url,{fetch:doFetch=globalThis.fetch,now=Date.now()}={}){
 const fetchedAt=new Date(now).toISOString();if(!url)return {status:'unconfigured',fetchedAt,items:[]};
 const fail=error=>({status:'failed',fetchedAt,error,items:[]});
 try{const r=await doFetch(url,{redirect:'follow',signal:AbortSignal.timeout(TIMEOUT_MS)});if(!r.ok)return fail('Canvas feed returned HTTP '+r.status);
  if(Number(r.headers?.get?.('content-length'))>MAX_BYTES)return fail('Canvas feed is too large');const text=await r.text();if(text.length>MAX_BYTES)return fail('Canvas feed is too large');
  if(!/BEGIN:VCALENDAR/.test(text))return fail('Canvas feed is not a calendar');const all=parseIcs(text),items=windowed(all,now);
  return {status:'ok',fetchedAt,total:all.length,window:{pastDays:PAST_DAYS,futureDays:FUTURE_DAYS},items};}
 catch(e){return fail(e.name==='TimeoutError'?'Canvas feed timed out':'Canvas feed could not be read');}}
function canvasUrl(value){if(!value)return '';const u=new URL(value);if(u.protocol!=='https:')throw Error('DAYWEAVE_CANVAS_ICS_URL must be an https URL');return u.href;}
module.exports={parseIcs,fetchCanvas,canvasUrl,windowed};
