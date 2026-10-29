'use strict';
// Daily read of the public job boards of the companies the owner watches (careerSettings.watch). Only official, unauthenticated
// JSON endpoints are used; nothing is posted, no account is used, and each board is read once per run. Results become inbox
// postings (progress kind careerPosting) scored by the rules in career.cjs; the owner decides what to track.
const K=require('./career.cjs');
const TIMEOUT_MS=15000,MAX_BYTES=5e6,PER_COMPANY=25,MIN_SCORE=30,KEEP_DAYS=45;
const strip=h=>String(h||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/gi,' ').replace(/\s+/g,' ').trim();
const ENDPOINT={
 greenhouse:s=>`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(s)}/jobs?content=true`,
 lever:s=>`https://api.lever.co/v0/postings/${encodeURIComponent(s)}?mode=json`,
 ashby:s=>`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(s)}`,
 smartrecruiters:s=>`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(s)}/postings?limit=100`};
// Each board's answer reduced to {id,title,url,location,postedAt,text}.
const PARSE={
 greenhouse:(v)=>(v?.jobs||[]).map(j=>({id:String(j.id),title:j.title,url:j.absolute_url,location:j.location?.name||'',postedAt:j.updated_at||null,text:strip(j.content)})),
 lever:(v)=>(Array.isArray(v)?v:[]).map(j=>({id:String(j.id),title:j.text,url:j.hostedUrl,location:j.categories?.location||'',postedAt:Number.isFinite(j.createdAt)?new Date(j.createdAt).toISOString():null,text:String(j.descriptionPlain||'')})),
 ashby:(v)=>(v?.jobs||[]).filter(j=>j.isListed!==false).map(j=>({id:String(j.id),title:j.title,url:j.jobUrl,location:j.location||'',postedAt:j.publishedAt||null,text:String(j.descriptionPlain||'')})),
 smartrecruiters:(v,slug)=>(v?.content||[]).map(j=>({id:String(j.id),title:j.name,url:`https://jobs.smartrecruiters.com/${encodeURIComponent(slug)}/${encodeURIComponent(j.id)}`,location:[j.location?.city,j.location?.region,j.location?.country].filter(Boolean).join(', '),postedAt:j.releasedDate||null,text:''}))};

async function readBoard(w,{fetch:doFetch=globalThis.fetch}={}){
 const r=await doFetch(ENDPOINT[w.ats](w.slug),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(TIMEOUT_MS)});
 if(r.status===404)throw Error(`${w.company}: no public ${w.ats} board named "${w.slug}"`);if(!r.ok)throw Error(`${w.company}: ${w.ats} returned HTTP ${r.status}`);
 const text=await r.text();if(text.length>MAX_BYTES)throw Error(`${w.company}: board answer is too large`);
 return PARSE[w.ats](JSON.parse(text),w.slug).filter(x=>x.id&&x.title&&/^https:\/\//.test(x.url||''));}

// Reads every watched board, scores what it finds and returns the inbox changes; the store writes them (Store.refreshCareer).
async function collect({settings,profile,existing={},now=new Date(),fetch}){
 const places=K.placesFrom(profile||{}),at=new Date(now).toISOString(),found={},boards=[];
 // Up to four boards at a time; each result lands in its own slot, so the order follows the watch list.
 const watch=settings?.watch||[],results=new Array(watch.length);let next=0;
 await Promise.all(Array.from({length:Math.min(4,watch.length)},async()=>{while(next<watch.length){const i=next++,w=watch[i];try{results[i]={w,list:await readBoard(w,{fetch})};}catch(e){results[i]={w,error:e};}}}));
 for(const {w,list,error} of results){
  try{if(error)throw error;let kept=0;
   const scored=list.map(x=>({x,...K.scorePosting(x,{places,keywords:settings.keywords||[]})})).filter(s=>s.score>=MIN_SCORE).sort((a,b)=>b.score-a.score).slice(0,PER_COMPANY);
   for(const {x,score,track,reasons} of scored){const id=`${w.ats}:${w.slug}:${x.id}`.slice(0,200),old=existing[id];kept++;
    found[id]={id,ats:w.ats,company:w.company,title:String(x.title).slice(0,200),url:x.url.slice(0,1000),location:String(x.location).slice(0,120),market:K.marketOf(x.location,w.market),track,score,reasons,
     postedAt:x.postedAt,summary:x.text.slice(0,600),firstSeenAt:old?.firstSeenAt||at,lastSeenAt:at,status:old?.status||'new'};}
   boards.push({company:w.company,ats:w.ats,slug:w.slug,status:'ok',postings:list.length,kept});}
  catch(e){boards.push({company:w.company,ats:w.ats,slug:w.slug,status:'failed',error:e.name==='TimeoutError'?`${w.company}: board timed out`:String(e.message).slice(0,200)});}}
 // Postings not seen for KEEP_DAYS leave the inbox unless the owner acted on them; a failed board keeps its old postings.
 const failed=new Set(boards.filter(b=>b.status==='failed').map(b=>b.ats+':'+b.slug)),cutoff=Date.parse(at)-KEEP_DAYS*86400000,removed=[];
 for(const [id,p] of Object.entries(existing))if(!found[id]){const board=id.split(':').slice(0,2).join(':');
  if(p.status!=='new'||failed.has(board)||Date.parse(p.lastSeenAt)>=cutoff)continue;removed.push(id);}
 return {at,found,removed,boards};}

module.exports={collect,readBoard,ENDPOINT,MIN_SCORE};
