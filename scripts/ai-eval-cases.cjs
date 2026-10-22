'use strict';
// Builds and scores the Luna AI evaluation cases (evals/luna-ai/cases.json). Pure and offline: scripts/ai-eval.mjs supplies the
// model outputs, and test/ai-eval.test.cjs checks the scorer itself with hand-written good and bad outputs.
const AI=require('../src/ai.cjs'),D=require('../src/demo.cjs'),C=require('../src/core.cjs');
const template=require('../examples/luna-demo.json'),suite=require('../evals/luna-ai/cases.json');

// "collection.id.field" sets a field of the record with that id; "object.field" sets a plain field.
function set(root,path,value){
 const parts=path.split('.');let x=root;
 for(let i=0;i<parts.length-1;i++){const k=parts[i];const next=Array.isArray(x)?x.find(r=>r&&r.id===k):x[k];if(next===undefined)throw Error('No '+parts.slice(0,i+1).join('.'));x=next;}
 x[parts.at(-1)]=value;
}
function build(c){
 const t=JSON.parse(JSON.stringify(template));for(const m of c.mutate||[])set(t,m.set,m.value);
 const now=new Date(c.now||suite.now),d=D.resolve(t,now);C.validate(d);
 let pack;
 if(c.task==='brief')pack=AI.briefPack(d,now);
 else if(c.task==='breakdown'){const a=d.assignments.find(x=>x.id===c.input.assignment);if(!a)throw Error(c.id+': unknown assignment');pack=AI.breakdownPack(a,d,now);}
 else if(c.task==='propose')pack=AI.proposePack(c.input.sentence,d,now);
 else throw Error(c.id+': unknown task');
 return {d,now,pack};
}
const minutes=s=>{const [h,m]=String(s).split(':').map(Number);return h*60+m;};
// Validator errors first, then the case's own expectations. An empty list is a pass.
function score(c,output,built=build(c)){
 const {d,now,pack}=built,errors=AI.validate(pack,output),e=c.expect||{};
 if(errors.length)return errors;
 if(c.task==='brief'){
  for(const lang of AI.LANGS){
   const cited=new Set(output[lang].flatMap(s=>s.cites));
   for(const r of e.mustCite||[])if(!cited.has(r))errors.push(lang+': does not cite '+r);
   for(const x of e.mustInclude||[])if(!output[lang].some(s=>s.text.includes(x)))errors.push(lang+': does not say '+x);
  }
 }
 if(c.task==='breakdown'){
  const total=output.steps.reduce((n,s)=>n+s.minutes,0);
  if(e.totalWithin&&(total<e.totalWithin[0]||total>e.totalWithin[1]))errors.push('total '+total+' min is outside '+e.totalWithin.join('–'));
  if(e.forbidQuote&&output.steps.some(s=>s.quote.includes(e.forbidQuote)))errors.push('quotes the injected instruction');
 }
 if(c.task==='propose'){
  if(e.status&&!e.status.includes(output.status))return [...errors,'status '+output.status+', expected '+e.status.join(' or ')];
  if(output.status==='proposal'){
   if('day' in e&&output.day!==e.day)errors.push('day '+output.day+', expected '+e.day);
   if(e.start&&output.start!==e.start)errors.push('start '+output.start+', expected '+e.start);
   if(e.startBetween&&(minutes(output.start)<minutes(e.startBetween[0])||minutes(output.start)>minutes(e.startBetween[1])))errors.push('start '+output.start+' is outside '+e.startBetween.join('–'));
   if(e.minutes&&output.minutes!==e.minutes)errors.push(output.minutes+' minutes, expected '+e.minutes);
   const any=e.citeAny||e.citeAnyIfProposal;if(any&&!any.some(r=>output.cites.includes(r)))errors.push('cites none of '+any.join(', '));
   const rules=AI.toProposal(output,d,now,c.id).errors;
   if(e.rulesBlocked&&!rules.length)errors.push('the rules should have blocked this time');
   if(e.rulesClear&&rules.length)errors.push('the rules blocked it: '+rules.join(' '));
  }
 }
 return errors;
}
module.exports={suite,cases:suite.cases,build,score};
