(function(){
'use strict';
// Descriptive, user-reported effort calibration. It never adjusts estimates, plans or submission status.
const MIN_SAMPLES=3;
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const own=(o,k)=>!!o&&typeof o==='object'&&Object.hasOwn(o,k);
function valid(sample){return !!sample&&typeof sample==='object'&&positive(sample.estimateMinutes)&&positive(sample.actualMinutes)&&Number.isFinite(Date.parse(sample.confirmedAt));}
// A frozen pair counts only while the current actual still equals its frozen actual (guards edits made by older code).
function state(sample,actual){if(sample===undefined||sample===null)return 'none';if(!valid(sample))return 'invalid';return actual===sample.actualMinutes?'confirmed':'invalidated';}
function median(values){const s=[...values].sort((a,b)=>a-b),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;}
function entries(samples){if(!Array.isArray(samples))return Object.entries(samples&&typeof samples==='object'?samples:{});const latest=new Map();for(const x of samples){if(!x||typeof x.id!=='string')continue;const old=latest.get(x.id);if(!old||!(Date.parse(old.confirmedAt)>Date.parse(x.confirmedAt)))latest.set(x.id,x);}return [...latest].map(([id,x])=>{const {id:_,...v}=x;return [id,v];});}
function summary(samples={},actual={},assignments=[]){
 const list=entries(samples).map(([id,v])=>{const s=state(v,own(actual,id)?actual[id]:undefined);return {id,estimateMinutes:v?.estimateMinutes,actualMinutes:v?.actualMinutes,requirement:v?.requirement,confirmedAt:v?.confirmedAt,state:s,ratio:s==='confirmed'?v.actualMinutes/v.estimateMinutes:null};}).sort((a,b)=>a.id.localeCompare(b.id));
 const confirmed=new Set(list.map(x=>x.id)),excluded={invalidated:list.filter(x=>x.state==='invalidated').length,invalid:list.filter(x=>x.state==='invalid').length,zeroActual:0,noEstimate:0,unconfirmed:0};
 for(const [id,n] of Object.entries(actual&&typeof actual==='object'?actual:{})){if(confirmed.has(id)||!Number.isFinite(n))continue;if(n===0)excluded.zeroActual++;else if(!positive((assignments||[]).find(a=>a&&a.id===id)?.estimateMinutes))excluded.noEstimate++;else excluded.unconfirmed++;}
 const ratios=list.filter(x=>x.state==='confirmed').map(x=>x.ratio),sufficient=ratios.length>=MIN_SAMPLES;
 return {threshold:MIN_SAMPLES,count:ratios.length,sufficient,ratio:sufficient?median(ratios):null,samples:list,excluded};
}
const api={MIN_SAMPLES,positive,valid,state,median,summary};
if(typeof module!=='undefined')module.exports=api;else window.PlannerEffort=api;
})();
