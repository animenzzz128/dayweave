(function(){
'use strict';
// Public demo only: turns a fictional snapshot template into a snapshot dated around "now", so the demo never looks stale.
// "@now" / "@now-30" is that instant (minus minutes); "@+1T23:59" is a wall-clock time N days from today in the template's
// timezone; "@-1" alone is that day at 00:00. Every other value is copied unchanged. It never reads or writes real data.
const C=typeof module!=='undefined'?require('./core.cjs'):window.PlannerCore;
const NOW=/^@now(?:-(\d+))?$/,DAY=/^@([+-]?\d+)(?:T(\d\d:\d\d))?$/;
function addDays(day,n){return new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
function resolve(template,now=new Date()){
 now=new Date(now);if(!template||typeof template.timezone!=='string')throw Error('Demo template needs a timezone');
 C.configure(template.timezone);const today=C.dayKey(now);
 const value=x=>{if(typeof x==='string'){let m=x.match(NOW);if(m)return new Date(+now-(Number(m[1])||0)*60000).toISOString();m=x.match(DAY);if(m)return C.zonedISO(addDays(today,Number(m[1])),m[2]||'00:00');return x;}
  if(Array.isArray(x))return x.map(value);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,value(v)]));return x;};
 return value(template);
}
const api={resolve,addDays};
if(typeof module!=='undefined')module.exports=api;else window.PlannerDemo=api;
})();
