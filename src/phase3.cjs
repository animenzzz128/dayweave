(function(){
'use strict';
// Research is supplied by an authorized collector; this module never contacts services.
function canonical(url){try{const u=new URL(url);if(u.protocol!=='https:')return '';u.hash='';u.search='';if(/(^|\.)linkedin\.com$/.test(u.hostname))u.hostname='www.linkedin.com';return u.href.replace(/\/$/,'');}catch{return '';}}
function key(item){return canonical(item.source)||item.id;}
const states=['saved','dismissed','applied','pending','connected','contacted','reset'];
function history(records=[]){const map=new Map();for(const r of records){if(!r||!r.id||!states.includes(r.status)||!Number.isFinite(Date.parse(r.updatedAt)))continue;const old=map.get(r.id);if(!old||Date.parse(r.updatedAt)>=Date.parse(old.updatedAt))map.set(r.id,r);}return [...map.values()];}
function score(c){return ['role','shared','market','reason'].reduce((n,k)=>n+Math.max(0,Math.min(5,Number(c.scores?.[k])||0)),0);}
function candidates(items=[],records=[],limit=5){const blocked=new Set(history(records).filter(h=>['dismissed','connected','pending','contacted'].includes(h.status)).map(h=>h.id));const seen=new Set();return items.filter(c=>{const id=key(c);if(!canonical(c.source)||!c.evidence||!c.checkedAt||blocked.has(id)||['connected','pending'].includes(c.relationship)||seen.has(id))return false;seen.add(id);return true;}).sort((a,b)=>score(b)-score(a)||key(a).localeCompare(key(b))).slice(0,limit);}
function eligibility(role,profile={}){const issues=[];if(role.market==='US'&&profile.usSponsorshipRequired){if(role.sponsorship==='no')issues.push('Explicit sponsorship mismatch');else if(role.sponsorship!=='yes')issues.push('US sponsorship unverified');}if(role.market!=='US'&&profile.workEligibility?.[role.market]!=='confirmed')issues.push('Local work eligibility unknown');if(role.startYear!==profile.startYear)issues.push('Intended start year needs verification');if(role.degreeGap)issues.push(role.degreeGap);return issues;}
function importProgress(snapshot,exported){const allowed=new Set([...(snapshot.career?.candidates||[]),...(snapshot.career?.roles||[])].map(key).concat((snapshot.candidateHistory||[]).map(h=>h.id)));const incoming=exported.localProgress?.career||{};const records=Object.entries(incoming).filter(([id])=>allowed.has(id)).map(([id,r])=>({id,status:r?.status,updatedAt:r?.updatedAt}));return {...snapshot,candidateHistory:history([...(snapshot.candidateHistory||[]),...records])};}
function weekly(records,now){const cutoff=Date.parse(now)-7*86400000;const recent=history(records).filter(r=>Date.parse(r.updatedAt)>=cutoff&&Date.parse(r.updatedAt)<=Date.parse(now));return {applied:recent.filter(r=>r.status==='applied').length,contacted:recent.filter(r=>r.status==='contacted').length,saved:recent.filter(r=>r.status==='saved').length,pending:recent.filter(r=>r.status==='pending').length};}
const api={canonical,key,history,score,candidates,eligibility,importProgress,weekly,states};
if(typeof module!=='undefined')module.exports=api;else window.PlannerPhase3=api;

})();
