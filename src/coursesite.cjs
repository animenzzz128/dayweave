'use strict';
// Course sites with their own REST API (Yelukerest: PostgREST under /rest/), read by the hosted server like the Canvas feed.
// DAYWEAVE_COURSE_SITES lists them ("MGT 656=https://www.656.mba;MGT 802=https://www.802.mba"); each site's personal API token
// (scope course:read) is DAYWEAVE_COURSE_TOKEN_<code> ("DAYWEAVE_COURSE_TOKEN_MGT_656") in the host's secret store. Results and
// errors never include a token. Only titles, due times, points and the meeting schedule are read: never grades or submissions.
const TIMEOUT_MS=15000,MAX_BYTES=2e6,MAX_ROWS=300,RENEW_DAYS=14;
const tokenKey=code=>'DAYWEAVE_COURSE_TOKEN_'+String(code).toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');
function sitesFromEnv(env=process.env){const raw=String(env.DAYWEAVE_COURSE_SITES||'').trim();if(!raw)return [];
 return raw.split(';').map(x=>x.trim()).filter(Boolean).map(entry=>{const i=entry.indexOf('=');if(i<1)throw Error('DAYWEAVE_COURSE_SITES entries look like "MGT 656=https://www.656.mba"');
  const course=entry.slice(0,i).trim(),u=new URL(entry.slice(i+1).trim());if(u.protocol!=='https:')throw Error('DAYWEAVE_COURSE_SITES URLs must be https');
  return {course,url:u.origin,token:String(env[tokenKey(course)]||'').trim()};});}
// The token is a JWT; its expiry is read (not verified) so Home can ask for a new one before it lapses.
function tokenExpiry(token){try{const exp=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).exp;return Number.isFinite(exp)?new Date(exp*1000).toISOString():null;}catch{return null;}}
const rows=(list,keys)=>list.slice(0,MAX_ROWS).map(x=>Object.fromEntries(keys.map(k=>[k,x[k]??null])));
async function fetchSite(site,{fetch:doFetch=globalThis.fetch,now=Date.now()}={}){
 const fetchedAt=new Date(now).toISOString(),base={course:site.course,url:site.url,fetchedAt};
 const get=async(view,query,auth)=>{const r=await doFetch(`${site.url}/rest/${view}?${new URLSearchParams(query)}`,{headers:{Accept:'application/json',...(auth?{Authorization:'Bearer '+site.token}:{})},signal:AbortSignal.timeout(TIMEOUT_MS)});
  // PostgREST says why it refused (e.g. "JWT expired"); that reason is kept, the token never is.
  if(r.status===401||r.status===403){const why=await r.text().then(t=>String(JSON.parse(t).message||'')).catch(()=>'');
   throw Object.assign(Error(`${site.course} course API refused the token for ${view} (HTTP ${r.status}${why?': '+why.split(site.token||'\0').join('[token]').slice(0,120):''}): check or renew the token`),{refused:true});}
  if(!r.ok)throw Error(`${site.course} course API returned HTTP ${r.status} for ${view}`);
  const text=await r.text();if(text.length>MAX_BYTES)throw Error(`${site.course} course API answer is too large`);const v=JSON.parse(text);if(!Array.isArray(v))throw Error(`${site.course} course API answer for ${view} is not a list`);return v;};
 let meetings;
 try{meetings=rows(await get('meetings',{select:'slug,title,begins_at,duration,meeting_type,is_draft',order:'begins_at.asc'}),['slug','title','begins_at','duration','meeting_type','is_draft']);
  if(!site.token)return {...base,status:'partial',error:'No API token: only the public schedule was read',meetings};
  const assignments=rows(await get('my_assignments',{select:'slug,title,points_possible,is_team,is_draft,closed_at,effective_closed_at',order:'closed_at.asc'},true),['slug','title','points_possible','is_team','is_draft','closed_at','effective_closed_at']);
  const quizzes=rows(await get('quizzes',{select:'id,meeting_slug,points_possible,is_draft,open_at,closed_at',order:'closed_at.asc'},true),['id','meeting_slug','points_possible','is_draft','open_at','closed_at']);
  return {...base,status:'ok',tokenExpiresAt:tokenExpiry(site.token),meetings,assignments,quizzes};}
 // A refused token still leaves the public schedule.
 catch(e){if(e.refused&&meetings)return {...base,status:'partial',error:e.message,meetings};
  return {...base,status:'failed',error:e.name==='TimeoutError'?`${site.course} course API timed out`:/course API/.test(e.message)?e.message:`${site.course} course API could not be read`};}}
// The daily cloud task reads assignments and quizzes through each course's claude.ai connector (the site's API accepts personal
// tokens only from the Yale network). Those reads are laid over the server's schedule read for the same course; the connector
// rows have the same fields as the API's plus each assignment's instructions (`body`). Never grades or write tools.
// Submission reads (`submissions` from get_my_submissions, `quizSubmissions` from a GET of quiz_submissions) are reduced here to
// which assignment slugs have a filled-in field and which quiz IDs were taken: submitted values themselves are not kept.
const MAX_BODY=4000,clip=t=>t.length>MAX_BODY?t.slice(0,MAX_BODY-1).trimEnd()+'…':t;
function submittedFrom(r){const out={};
 if(Array.isArray(r.submissions))out.assignments=[...new Set(r.submissions.filter(x=>x&&x.assignment_slug&&(x.fields||[]).some(f=>String(f?.body??'').trim())).map(x=>String(x.assignment_slug)))];
 if(Array.isArray(r.quizSubmissions))out.quizzes=[...new Set(r.quizSubmissions.filter(x=>x&&x.quiz_id!=null).map(x=>String(x.quiz_id)))];
 return Object.keys(out).length?out:null;}
function withConnectorReads(sites,reads){if(!Array.isArray(reads)||!reads.length)return sites;const key=c=>String(c||'').toLowerCase().replace(/\s+/g,' ').trim(),out=(sites||[]).map(s=>({...s}));
 for(const r of reads){if(!r||!r.course)continue;let s=out.find(x=>key(x.course)===key(r.course));if(!s){s={course:r.course,url:r.url||null,status:'failed',error:'No schedule read for this course'};out.push(s);}
  if(r.status!=='ok'||!Array.isArray(r.assignments)){s.error=[s.error,`${r.course} connector: ${r.note||'not read'}`].filter(Boolean).join('; ');continue;}
  // Instructions come on the rows or as `bodies` (the rows of a GET of assignments with select=slug,body), joined by slug.
  const bodies=new Map((Array.isArray(r.bodies)?r.bodies:[]).filter(x=>x&&x.slug&&typeof x.body==='string').map(x=>[String(x.slug),x.body]));
  const assignments=rows(r.assignments,['slug','title','points_possible','is_team','is_draft','closed_at','effective_closed_at','body']).map(x=>{const body=typeof x.body==='string'?x.body:bodies.get(String(x.slug));return {...x,body:typeof body==='string'&&body.trim()?clip(body.trim()):null};});
  Object.assign(s,{assignments,quizzes:rows(r.quizzes||[],['id','meeting_slug','points_possible','is_draft','open_at','closed_at']),via:'connector',status:'ok'});const done=submittedFrom(r);if(done)s.submitted=done;
  if(!Array.isArray(s.meetings))s.error=`${s.error||'Schedule not read'}; assignments read through the connector`;else delete s.error;}
 return out;}
const fetchCourseSites=(sites,options)=>Promise.all((sites||[]).map(s=>fetchSite(s,options)));
module.exports={withConnectorReads,sitesFromEnv,tokenKey,tokenExpiry,fetchSite,fetchCourseSites,RENEW_DAYS};
