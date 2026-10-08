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
function safeJSON(x){return JSON.stringify(x).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}
function validate(data){
  if(data.schemaVersion!==1||!Number.isFinite(stamp(data.generatedAt)))throw Error('Invalid snapshot metadata');
  for(const key of ['courses','assignments','events','proposals','sources','priorities'])if(!Array.isArray(data[key]))throw Error('Missing '+key);
  for(const key of ['courses','assignments','events','proposals','sources']){
    const ids=new Set();for(const x of data[key]){if(!x.id||ids.has(x.id))throw Error('Duplicate/missing '+key+' id');ids.add(x.id);if(x.source&&safeURL(x.source)==='#')throw Error('Unsafe source URL');}
  }
  for(const a of data.assignments)if(a.dueAt&&!Number.isFinite(stamp(a.dueAt)))throw Error('Invalid deadline');
  for(const e of [...data.events,...data.proposals])if(!Number.isFinite(stamp(e.start))||!Number.isFinite(stamp(e.end))||stamp(e.end)<=stamp(e.start))throw Error('Invalid event interval');
  return data;
}
function proposalErrors(p,data,now=new Date()){
 const errors=[];if(!p.title?.trim())errors.push('Enter an event title.');
 if(!Number.isFinite(stamp(p.start))||!Number.isFinite(stamp(p.end))||stamp(p.end)<=stamp(p.start))errors.push('End must follow start.');
 if(stamp(p.start)<stamp(now))errors.push('This proposed time has passed.');
 const parts=t=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t)).map(x=>[x.type,x.value]));
 if(Number.isFinite(stamp(p.start))&&Number.isFinite(stamp(p.end))){const s=parts(p.start),e=parts(p.end);if(+s.hour<9||dayKey(p.start)!==dayKey(p.end)||(+e.hour===0))errors.push('Keep the midnight–9 AM sleep window free.');}
 if(data.events.some(e=>e.busy!==false&&overlap(p,e)))errors.push('Overlaps a known calendar commitment.');
 if(data.actionHistory?.some(e=>e.id===p.id&&e.status==='executed'))errors.push('This action is already recorded as executed.');
 if(!data.calendarCoverage?.complete)errors.push('Calendar coverage is incomplete; refresh it before requesting changes.');
 if(data.calendarCoverage&& (stamp(p.start)<stamp(data.calendarCoverage.start)||stamp(p.end)>stamp(data.calendarCoverage.end)))errors.push('Outside the checked calendar window.');
 return errors;
}
function mergeSnapshot(old,incoming){
  if(!old)return validate(incoming);
  const result={...old,...incoming};
  for(const key of ['actionHistory','candidateHistory'])result[key]=[...new Map([...(old[key]||[]),...(incoming[key]||[])].map(x=>[x.id,x])).values()];
  // Collection snapshots cannot rewind an existing local execution journal.
  result.actionHistory=[...new Map([...(incoming.actionHistory||[]),...(old.actionHistory||[])].map(x=>[x.id,x])).values()];
  const failed=new Set(incoming.sources.filter(s=>s.status==='failed').map(s=>s.id));
  for(const key of ['assignments','events']){
    result[key]=[...incoming[key].filter(x=>!failed.has(x.sourceId)),...old[key].filter(x=>failed.has(x.sourceId))];
  }
  result.sources=incoming.sources.map(s=>s.status==='failed'?{...s,lastSuccess:old.sources.find(x=>x.id===s.id)?.lastSuccess||null}:s);
  if(failed.has('outlook')){result.calendarCoverage={...old.calendarCoverage,complete:false};result.proposals=[];}
  return validate(result);
}
const api={get TZ(){return TZ;},configure,stamp,dayKey,classify,overlap,zonedISO,fingerprint,safeURL,safeJSON,validate,proposalErrors,mergeSnapshot};
if(typeof module!=='undefined')module.exports=api;else window.PlannerCore=api;
