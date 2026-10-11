'use strict';
// Dated weekly evidence trends: read-only and descriptive. Observations are retained source snapshots bucketed by
// source collection time (generatedAt) into Monday 00:00 – Sunday 24:00 local weeks of the current snapshot timezone.
// Import time is reported separately. Nothing here estimates effort, completion times or work sessions.
const RETENTION_DAYS=30,MAX_WEEKS_BACK=12,QUERY_LIMIT=500,DAY=86400000;
const FAILED=['failed','unavailable'],DONE=['submitted','graded','excused'];
const METRICS=['done','not_submitted','unknown','other','choice','uncertain'],EXCLUDED=['retained','archived','unlisted'];
function zone(tz){if(typeof tz!=='string'||!tz)throw Error('Snapshot timezone is missing');new Intl.DateTimeFormat('en-CA',{timeZone:tz});return tz;}
// Local calendar date of an instant; week arithmetic below works on dates only, so DST shifts cannot move a boundary.
function localDay(instant,tz){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(instant)).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;}
const utc=key=>Date.parse(key+'T00:00:00Z');
const validDay=k=>typeof k==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(k)&&Number.isFinite(utc(k))&&new Date(utc(k)).toISOString().slice(0,10)===k;
const addDays=(key,n)=>new Date(utc(key)+n*DAY).toISOString().slice(0,10);
const monday=key=>addDays(key,-((new Date(utc(key)).getUTCDay()+6)%7));
const weekOf=(instant,tz)=>monday(localDay(instant,tz));
// Only `week` (the Monday that starts a week, YYYY-MM-DD) is accepted, at most once. Range bounds need the timezone and are checked in trends().
function parseQuery(params){const entries=[...(params instanceof URLSearchParams?params:new URLSearchParams(params||{}))];if(entries.some(([k])=>k!=='week'))throw Error('Unknown trends parameter');if(entries.length>1)throw Error('Give at most one week');if(!entries.length)return {};const w=entries[0][1];if(!validDay(w))throw Error('week must be a calendar date (YYYY-MM-DD)');if(monday(w)!==w)throw Error('week must be the Monday that starts a week');return {week:w};}
// One retained snapshot row -> one observation. Only records from a listed source that is not failed/unavailable count as fresh;
// archived (removed by their source), failed/unavailable-source (`retained`: kept from before for failed) and unlisted-source records are counted separately.
function observe(row,tz){
 const t=Date.parse(row?.generatedAt);if(!Number.isFinite(t))return null;
 const sources=(Array.isArray(row.sources)?row.sources:[]).filter(s=>s&&typeof s.id==='string'),status=new Map(sources.map(s=>[s.id,s.status]));
 const counts=Object.fromEntries([...METRICS,...EXCLUDED].map(k=>[k,0])),seen=[];
 for(const a of Array.isArray(row.assignments)?row.assignments:[]){if(!a)continue;const archived=a.archivedFromSource===true||a.archivedFromSource===1;seen.push([String(a.id),a.requirement??null,a.status??null,a.sourceId??null,archived]);
  if(archived)counts.archived++;else if(!status.has(a.sourceId))counts.unlisted++;else if(FAILED.includes(status.get(a.sourceId)))counts.retained++;
  else if(a.requirement==='choice')counts.choice++;else if(a.requirement!=='required')counts.uncertain++;
  else if(DONE.includes(a.status))counts.done++;else if(a.status==='not_submitted')counts.not_submitted++;else if(a.status==='unknown')counts.unknown++;else counts.other++;}
 const fresh=METRICS.reduce((n,k)=>n+counts[k],0),nonOk=sources.filter(s=>s.status!=='ok').map(s=>({id:s.id,name:s.name??s.id,status:s.status??null}));
 const cmp=(x,y)=>x[0]<y[0]?-1:x[0]>y[0]?1:0;
 return {at:t,generatedAt:row.generatedAt,importedAt:row.importedAt,timezone:row.timezone??null,week:weekOf(t,tz),counts,
  // Zero fresh records with a failed, unavailable or otherwise non-ok source (or unattributable records) is missing evidence, not zero.
  noFresh:fresh===0&&(nonOk.length>0||counts.retained>0||counts.unlisted>0),
  sources:sources.map(s=>({id:s.id,name:s.name??s.id,status:s.status??null})),nonOk,
  key:t+'|'+JSON.stringify([sources.map(s=>[s.id,s.status??null]).sort(cmp),seen.sort(cmp)])};
}
function summarize(start,list,ctx){
 const obs=list.filter(o=>o.week===start).sort((x,y)=>x.at-y.at||(x.importedAt<y.importedAt?-1:1)),latest=obs.at(-1)||null,ids=new Map();
 for(const o of obs)for(const s of o.sources)ids.set(s.id,s.name);
 const sources=[...ids].sort(([x],[y])=>x<y?-1:x>y?1:0).map(([id,name])=>{const r={id,name,ok:0,failed:0,other:0,notReported:0,latestStatus:null};
  for(const o of obs){const s=o.sources.find(s=>s.id===id);if(!s)r.notReported++;else if(s.status==='ok')r.ok++;else if(FAILED.includes(s.status))r.failed++;else r.other++;}
  const last=latest.sources.find(s=>s.id===id);r.latestStatus=last?last.status:'not reported';r.name=last?.name??name;return r;});
 const imports=obs.reduce((n,o)=>n+o.imports,0);
 return {start,end:addDays(start,6),current:start===ctx.currentWeek,through:start===ctx.currentWeek?ctx.today:null,
  // The week may have lost evidence to pruning when it starts on or before the local date of the retention horizon.
  retentionLimited:ctx.horizonDay===null||start<=ctx.horizonDay,observations:obs.length,imports,duplicates:imports-obs.length,
  // Retained imports collected this week that the bounded read did not return (imported before the read window, or cut by truncation).
  unread:Math.max(0,(ctx.retainedByWeek.get(start)||0)-imports),
  unlisted:obs.some(o=>o.counts.unlisted>0),otherTimezone:obs.filter(o=>o.timezone!==null&&o.timezone!==ctx.timezone).length,
  items:obs.map(o=>({generatedAt:o.generatedAt,importedAt:o.importedAt,lastImportedAt:o.lastImportedAt,imports:o.imports,nonOk:o.nonOk,noFresh:o.noFresh})),
  latest:latest&&{generatedAt:latest.generatedAt,importedAt:latest.importedAt,counts:latest.counts,noFresh:latest.noFresh,sourceIds:latest.sources.map(s=>s.id).sort()},sources};
}
function compare(weeks,ctx){
 const reasons=[];if(ctx.truncated)reasons.push(`The snapshot query stopped at ${ctx.limit} imports, so later evidence was not read`);
 for(const w of weeks){const label='the week of '+w.start+' to '+w.end;
  if(w.unread)reasons.push(`Some retained evidence for ${label} was not read (${w.unread} import${w.unread===1?'':'s'})`);
  if(!w.observations)reasons.push((ctx.truncated||w.unread?'No observations read for ':'No observations in ')+label);
  if(w.retentionLimited)reasons.push(ctx.horizon?`${label[0].toUpperCase()+label.slice(1)} starts on or before the retained window (${ctx.horizonDay}); earlier evidence may have been pruned`:'No source snapshots are retained, so coverage of '+label+' is unknown');
  const failed=w.sources.filter(s=>s.failed),other=w.sources.filter(s=>s.other);
  if(failed.length)reasons.push('Failed or unavailable source in '+label+': '+failed.map(s=>s.name).join(', '));
  const missing=w.sources.filter(s=>s.notReported);if(missing.length)reasons.push('Source not reported in every observation of '+label+': '+missing.map(s=>s.name).join(', '));
  if(other.length)reasons.push('Source not fully ok in '+label+': '+other.map(s=>s.name).join(', '));
  if(w.unlisted)reasons.push('Records without a listed source in '+label);
  if(w.latest?.noFresh)reasons.push('No fresh records in the latest observation of '+label);}
 const [p,s]=weeks;
 // A source missing from one latest observation archives its records there, so counts would differ for coverage reasons alone.
 if(p.latest&&s.latest&&JSON.stringify(p.latest.sourceIds)!==JSON.stringify(s.latest.sourceIds)){const names=new Map([...p.sources,...s.sources].map(x=>[x.id,x.name])),only=(x,y)=>x.latest.sourceIds.filter(id=>!y.latest.sourceIds.includes(id)).map(id=>names.get(id)??id);
  reasons.push('The latest observations of the two weeks list different sources'+[[p,only(p,s)],[s,only(s,p)]].filter(([,l])=>l.length).map(([w,l])=>`; only in the week of ${w.start}: ${l.join(', ')}`).join(''));}
 const comparable=!reasons.length;
 return {comparable,reasons,changes:comparable?Object.fromEntries(METRICS.map(k=>[k,s.latest.counts[k]-p.latest.counts[k]])):null};
}
// read({from,limit}) returns {items,truncated,limit} from the bounded store query; inputs are never mutated.
function trends({query,timezone,now=new Date(),retention={},read}){
 const q=parseQuery(query);let tz;try{tz=zone(timezone);}catch{return {available:false,reason:'Weekly trends need a database snapshot with a valid IANA timezone.'};}
 const today=localDay(now,tz),currentWeek=monday(today),earliest=addDays(currentWeek,-7*MAX_WEEKS_BACK);
 if(q.week&&(q.week>currentWeek||q.week<earliest))throw Error('week must be between '+earliest+' and '+currentWeek);
 const generated=(retention.generatedAt||[]).map(Date.parse).filter(Number.isFinite),latestObserved=generated.length?weekOf(Math.max(...generated),tz):null;
 const latestWeek=latestObserved===null?currentWeek:latestObserved>currentWeek?currentWeek:latestObserved<earliest?earliest:latestObserved;
 const selected=q.week||latestWeek,previous=addDays(selected,-7),latestImport=Date.parse(retention.latestImportedAt);
 const horizon=Number.isFinite(latestImport)?new Date(latestImport-RETENTION_DAYS*DAY).toISOString():null;
 // Imports normally follow collection, so reading from two days before the earlier week covers both weeks for any UTC offset.
 const result=read({from:new Date(utc(previous)-2*DAY).toISOString(),limit:QUERY_LIMIT}),items=result.items||[];
 const groups=new Map();let unusable=0;
 for(const row of items){const o=observe(row,tz);if(!o){unusable++;continue;}const g=groups.get(o.key);
  if(g){g.imports++;if(o.importedAt<g.importedAt)g.importedAt=o.importedAt;if(o.importedAt>g.lastImportedAt)g.lastImportedAt=o.importedAt;}else groups.set(o.key,{...o,imports:1,lastImportedAt:o.importedAt});}
 // Retained imports per week (from the generatedAt summary) for the two weeks, to detect evidence the read did not return.
 const retainedByWeek=new Map(),lo=utc(previous)-2*DAY,hi=utc(selected)+9*DAY;
 for(const g of generated)if(g>=lo&&g<hi){const k=weekOf(g,tz);retainedByWeek.set(k,(retainedByWeek.get(k)||0)+1);}
 const ctx={timezone:tz,today,currentWeek,horizon,horizonDay:horizon?localDay(horizon,tz):null,truncated:!!result.truncated,limit:result.limit,retainedByWeek};
 const list=[...groups.values()],weeks=[summarize(previous,list,ctx),summarize(selected,list,ctx)];
 return {available:true,timezone:tz,basis:'generatedAt',now:new Date(now).toISOString(),today,selected,previous,defaultWeek:!q.week,latestObservedWeek:latestObserved,
  nav:{earlier:previous>=earliest?previous:null,later:selected<currentWeek?addDays(selected,7):null,latest:latestWeek,earliest,current:currentWeek},
  retention:{days:RETENTION_DAYS,count:retention.count??0,earliestImportedAt:retention.earliestImportedAt??null,latestImportedAt:retention.latestImportedAt??null,horizon,horizonDay:ctx.horizonDay},
  query:{from:result.from??null,limit:result.limit??null,read:items.length,truncated:ctx.truncated,unusable},weeks,comparison:compare(weeks,ctx)};
}
module.exports={RETENTION_DAYS,MAX_WEEKS_BACK,QUERY_LIMIT,METRICS,EXCLUDED,localDay,validDay,addDays,monday,weekOf,parseQuery,observe,trends};
