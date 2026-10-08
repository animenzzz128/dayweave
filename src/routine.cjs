'use strict';
const C=require('./core.cjs');
function policy(at=new Date(),timezone='America/New_York'){
 C.configure(timezone);const day=new Intl.DateTimeFormat('en-US',{timeZone:timezone,weekday:'short'}).format(at);
 return {model:'gpt-6-luna',reasoningEffort:'high',speed:'standard',academicReadLimit:16,careerResearch:['Mon','Thu'].includes(day),candidateLimit:10,roleLimit:3,weeklyReview:day==='Sun',emailEnabled:false};
}
function runRecord(input){
 const out={id:input.id||require('node:crypto').randomUUID(),startedAt:input.startedAt,finishedAt:input.finishedAt,model:input.model||'unknown',status:input.status||'partial'};
 for(const k of ['toolCalls','pageReads','careerReads','cacheHits','inputTokens','outputTokens'])out[k]=Number.isFinite(input[k])&&input[k]>=0?input[k]:null;
 out.failures=Array.isArray(input.failures)?input.failures.map(String):[];out.durationMs=Date.parse(out.finishedAt)-Date.parse(out.startedAt);if(!Number.isFinite(out.durationMs)||out.durationMs<0)throw Error('Invalid run timestamps');return out;
}
function briefing(d,now=new Date()){const failed=new Set(d.sources.filter(s=>s.status==='failed'||s.status==='unavailable').map(s=>s.id));const categories={urgent_required:[],upcoming_required:[],optional:[],submitted:[],verification:[]};for(const a of d.assignments){if(a.archivedFromSource)continue;const k=failed.has(a.sourceId)?'verify':C.classify(a,now);const bucket=k==='optional'?'optional':k==='submitted'?'submitted':k==='verify'?'verification':['soon','overdue'].includes(k)?'urgent_required':'upcoming_required';categories[bucket].push(a.id);}return {asOf:now.toISOString(),categories,coverageNote:d.coverageNote,failures:[...failed],emailEnabled:false};}
module.exports={policy,runRecord,briefing};
