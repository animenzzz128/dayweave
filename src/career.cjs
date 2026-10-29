'use strict';
// Career tracker: postings the owner is considering or has applied to, and the people around them. Every record is the
// owner's own entry (or the one-time copy of the assistant's earlier research). Nothing here applies, sends or signs in
// anywhere: a stage change records what the owner did themselves.
const STAGES=['saved','preparing','applied','assessment','interview','offer','rejected','withdrawn'];
const SENT=['applied','assessment','interview','offer','rejected'],OPEN=['saved','preparing','applied','assessment','interview'];
const CHANNELS=['website','referral','recruiter','linkedin','boss','campus','other'];
const MARKETS=['US','CN','HK','SG','Other'];
const RELATIONS=['alumni','referrer','recruiter','hr','peer','other'];
// Owner-confirmed order (2026-10-28): AI product, strategy and operations roles (or a mix) first; consulting second.
const TRACKS=['ai-pm','strategy','operations','consulting','other'];
const STALE_DAYS=7,DAY=86400000;
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const text=(v,max,label,required=false)=>{if(v==null||v==='')v='';if(typeof v!=='string')throw Error(label+' must be text.');v=v.trim();if(required&&!v)throw Error('Enter '+label.toLowerCase()+'.');if(v.length>max)throw Error(label+' is too long (up to '+max+' characters).');return v;};
const date=(v,label)=>{if(v==null||v==='')return null;if(typeof v!=='string'||!/^\d{4}-\d\d-\d\d$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z')))throw Error(label+' needs a valid date.');return v;};
function url(v){if(v==null||v==='')return '';if(typeof v!=='string'||v.length>1000)throw Error('The link is not valid.');try{const u=new URL(v.trim());if(u.protocol!=='https:'&&u.protocol!=='http:')throw 0;return u.href;}catch{throw Error('The link must start with https://');}}
const pick=(v,list,label,fallback)=>{if(v==null||v==='')return fallback;if(!list.includes(v))throw Error('Unknown '+label+'.');return v;};
// Same canonical form as the research links, so a posting saved twice is caught.
function canonical(v){try{const u=new URL(v);u.hash='';u.search='';if(/(^|\.)linkedin\.com$/.test(u.hostname))u.hostname='www.linkedin.com';return u.href.replace(/\/$/,'').toLowerCase();}catch{return '';}}

function cleanJob(input,{existing=null,id,now=new Date()}){
 if(!plain(input))throw Error('Invalid job');
 const at=new Date(now).toISOString(),stage=pick(input.stage,STAGES,'stage',existing?.stage||'saved');
 const job={id,title:text(input.title,200,'Title',true),company:text(input.company,120,'Company',true),url:url(input.url),
  location:text(input.location,120,'Location'),market:pick(input.market,MARKETS,'market','Other'),track:pick(input.track,TRACKS,'track','other'),
  deadline:date(input.deadline,'The deadline'),channel:pick(input.channel,CHANNELS,'channel','website'),notes:text(input.notes,4000,'Notes'),
  nextStep:text(input.nextStep,200,'Next step'),nextDate:date(input.nextDate,'The next-step date'),stage,
  origin:existing?.origin||(plain(input.origin)&&['manual','research','ats','clip'].includes(input.origin.type)?{type:input.origin.type,...(typeof input.origin.ref==='string'?{ref:input.origin.ref.slice(0,300)}:{})}:{type:'manual'}),
  appliedAt:existing?.appliedAt??null,timeline:[...(existing?.timeline||[])],createdAt:existing?.createdAt||at,updatedAt:at,version:(existing?.version||0)+1};
 if(!existing)job.timeline.push({at,kind:'added',stage});
 else if(existing.stage!==stage)job.timeline.push({at,kind:'stage',from:existing.stage,stage});
 const note=text(input.event,300,'Update');if(note)job.timeline.push({at,kind:'note',note});
 if(SENT.includes(stage)&&!job.appliedAt)job.appliedAt=at;
 if(job.timeline.length>100)job.timeline=job.timeline.slice(-100);
 return job;
}

function cleanContact(input,{existing=null,id,now=new Date(),jobs={}}){
 if(!plain(input))throw Error('Invalid contact');
 const at=new Date(now).toISOString(),jobId=input.jobId==null||input.jobId===''?null:input.jobId;
 if(jobId!==null&&!jobs[jobId])throw Error('That job is not in your tracker.');
 return {id,name:text(input.name,120,'Name',true),company:text(input.company,120,'Company'),role:text(input.role,120,'Role'),
  relation:pick(input.relation,RELATIONS,'relation','other'),url:url(input.url),jobId,notes:text(input.notes,2000,'Notes'),
  lastContactAt:date(input.lastContactAt,'The last-contact date'),nextFollowUp:date(input.nextFollowUp,'The follow-up date'),
  origin:existing?.origin||{type:'manual'},createdAt:existing?.createdAt||at,updatedAt:at,version:(existing?.version||0)+1};
}

// One-time copy of the assistant's research (snapshot.career) into the tracker. Dismissed items stay out; the owner's
// saved/applied/contacted marks carry over. Returns the records to add, keyed by stable ids derived from the research ids.
function fromResearch(career,marks={},now=new Date()){
 const at=new Date(now).toISOString(),jobs={},contacts={};if(!career)return {jobs,contacts};
 const status=x=>marks[x.id]?.status;
 for(const r of career.roles||[]){if(!r?.id||!r.title||status(r)==='dismissed')continue;
  const [company,...rest]=String(r.title).split(' · '),title=rest.length?rest.join(' · '):company,s=status(r),stage=s==='applied'?'applied':'saved';
  const market=MARKETS.includes(r.market)?r.market:'Other',id='job-r-'+String(r.id).replace(/[^a-z0-9-]/gi,'').slice(0,60);
  jobs[id]={id,title:title.slice(0,200),company:(rest.length?company:'').slice(0,120)||'—',url:/^https?:\/\//.test(r.source||'')?r.source:'',location:'',market,track:'other',deadline:null,channel:'website',
   notes:[r.fit,r.evidence].filter(Boolean).join('\n\n').slice(0,4000),nextStep:'',nextDate:null,stage,origin:{type:'research',ref:String(r.id).slice(0,300)},
   appliedAt:stage==='applied'?(marks[r.id]?.at||at):null,timeline:[{at,kind:'added',stage,note:'From assistant research'}],createdAt:at,updatedAt:at,version:1};}
 for(const p of career.candidates||[]){if(!p?.id||!p.name||status(p)==='dismissed')continue;const id='contact-r-'+String(p.id).replace(/[^a-z0-9-]/gi,'').slice(0,60),s=status(p);
  contacts[id]={id,name:String(p.name).slice(0,120),company:'',role:'',relation:'other',url:/^https?:\/\//.test(p.source||'')?p.source:'',jobId:null,notes:[p.reason,p.evidence].filter(Boolean).join('\n\n').slice(0,2000),
   lastContactAt:['contacted','connected','pending'].includes(s)?(marks[p.id]?.at||at).slice(0,10):null,nextFollowUp:null,origin:{type:'research',ref:String(p.id).slice(0,300)},createdAt:at,updatedAt:at,version:1};}
 return {jobs,contacts};
}

const day=x=>Math.floor(Date.parse(x)/DAY);
// What needs the owner next, most urgent first. Dates are calendar days (YYYY-MM-DD) in the owner's zone, `today` included.
function nextActions(jobs={},contacts={},today){
 const t=day(today+'T00:00:00Z'),out=[];
 for(const j of Object.values(jobs)){if(!OPEN.includes(j.stage))continue;
  if(j.nextDate&&day(j.nextDate+'T00:00:00Z')<=t)out.push({kind:'next',id:j.id,due:j.nextDate,text:j.nextStep||'',job:j});
  else if(['saved','preparing'].includes(j.stage)&&j.deadline&&day(j.deadline+'T00:00:00Z')-t<=7)out.push({kind:'deadline',id:j.id,due:j.deadline,days:day(j.deadline+'T00:00:00Z')-t,job:j});
  else if(j.stage==='applied'){const last=[...j.timeline].reverse().find(e=>e.kind!=='added')?.at||j.appliedAt;const quiet=last?t-day(last.slice(0,10)+'T00:00:00Z'):0;if(quiet>=STALE_DAYS)out.push({kind:'stale',id:j.id,days:quiet,job:j});}}
 for(const c of Object.values(contacts))if(c.nextFollowUp&&day(c.nextFollowUp+'T00:00:00Z')<=t)out.push({kind:'followup',id:c.id,due:c.nextFollowUp,contact:c});
 const rank={deadline:0,next:1,followup:2,stale:3};
 return out.sort((a,b)=>(a.due||'9')<(b.due||'9')?-1:(a.due||'9')>(b.due||'9')?1:rank[a.kind]-rank[b.kind]||a.id.localeCompare(b.id));
}

function stats(jobs={},today){const list=Object.values(jobs),t=day(today+'T00:00:00Z'),sent=list.filter(j=>j.appliedAt);
 return {total:list.length,open:list.filter(j=>OPEN.includes(j.stage)).length,sent:sent.length,week:sent.filter(j=>t-day(j.appliedAt.slice(0,10)+'T00:00:00Z')<7).length,
  replied:sent.filter(j=>['assessment','interview','offer','rejected'].includes(j.stage)).length,interviews:list.filter(j=>['interview','offer'].includes(j.stage)).length};}

module.exports={STAGES,SENT,OPEN,CHANNELS,MARKETS,RELATIONS,TRACKS,STALE_DAYS,canonical,cleanJob,cleanContact,fromResearch,nextActions,stats};
