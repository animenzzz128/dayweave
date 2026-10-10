(function(){
'use strict';
// Advisory focus view only. A mode never schedules, infers capacity from blank calendar time or authorizes external actions.
const C=typeof module!=='undefined'?require('./core.cjs'):window.PlannerCore;
const MODES=['standard','reduced'],DEFAULT='standard',DONE=['submitted','graded','excused'],FAILED=['failed','unavailable'];
const valid=m=>typeof m==='string'&&MODES.includes(m);
// Unknown or malformed stored values read as the default; they are never written.
const mode=m=>valid(m)?m:DEFAULT;
const due=a=>{const t=Date.parse(a.dueAt);return Number.isFinite(t)?t:Infinity;};
const id=a=>String(a.id);
// Deterministic: earliest deadline first, undated last, then stable ID (code-unit order, not locale).
const byDue=(a,b)=>{const x=due(a),y=due(b);return x<y?-1:x>y?1:id(a)<id(b)?-1:id(a)>id(b)?1:0;};
function failedSource(a,sources){return (sources||[]).find(s=>s&&s.id===a.sourceId&&FAILED.includes(s.status));}
// Submitted/graded/excused wins over urgency and source failure; a failed source sends remaining work to verification.
function bucket(a,sources,now){if(DONE.includes(a.status))return 'submitted';if(failedSource(a,sources))return 'verify';return C.classify(a,now);}
function reason(a,sources){const s=failedSource(a,sources);if(s)return 'Source '+s.status+': retained record may be stale';if(a.requirement==='uncertain')return 'Requirement uncertain';if(a.status==='unknown')return 'Submission status unknown';return 'Requirement unknown';}
function focus(assignments,sources,now,m){
 const out={mode:mode(m),urgent:[],upcoming:[],selectable:[],verification:[]};
 for(const a of Array.isArray(assignments)?assignments:[]){
  if(!a||a.archivedFromSource)continue;const k=bucket(a,sources,now);
  if(k==='submitted')continue;
  if(k==='verify')out.verification.push({...a,verifyReason:reason(a,sources)});
  else if(k==='optional')out.selectable.push(a);
  else if(a.requirement!=='required')out.verification.push({...a,verifyReason:reason(a,sources)});
  else (k==='overdue'||k==='soon'?out.urgent:out.upcoming).push({...a,urgency:k});
 }
 for(const k of ['urgent','upcoming','selectable','verification'])out[k].sort(byDue);
 return out;
}
// Warnings shown in every mode: non-ok sources, stale snapshot and calendar coverage limits.
function health(d,now){const t=new Date(now).getTime(),g=Date.parse(d?.generatedAt);return {sources:(d?.sources||[]).filter(s=>s&&s.status!=='ok'),stale:!Number.isFinite(g)||t-g>26*3600000,coverageComplete:d?.calendarCoverage?.complete===true};}
const api={MODES,DEFAULT,valid,mode,byDue,bucket,reason,focus,health};
if(typeof module!=='undefined')module.exports=api;else window.PlannerWorkload=api;
})();
