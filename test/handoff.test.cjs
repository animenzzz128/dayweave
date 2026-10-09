const {test,after}=require('node:test'),a=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {validate}=require('../scripts/validate-handoff.cjs');
const exampleFile=path.join(__dirname,'..','examples','handoff.json');
const script=path.join(__dirname,'..','scripts','validate-handoff.cjs');
const example=JSON.parse(fs.readFileSync(exampleFile,'utf8'));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dayweave-handoff-'));
after(()=>fs.rmSync(tmp,{recursive:true,force:true}));

// Apply a mutation to a fresh copy and return the validation errors.
const errorsAfter=change=>{const d=structuredClone(example);change(d);return validate(d);};
const fails=(change,field)=>{const e=errorsAfter(change);a.ok(e.some(x=>x.startsWith(field+':')),`expected ${field} error, got ${JSON.stringify(e)}`);};
const passes=change=>a.deepEqual(errorsAfter(change),[]);
const cli=(...args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8'});
const SHA_C='c'.repeat(40);

test('fictional example artifact is structurally valid',()=>{a.deepEqual(validate(example),[]);});

test('checks and review bound to another SHA are stale',()=>{
 fails(d=>{d.checks[0].subject_sha=SHA_C;},'checks[0].subject_sha');
 fails(d=>{d.review.reviewed_sha=SHA_C;},'review.reviewed_sha');
 fails(d=>{d.git.head_sha=SHA_C;},'review.reviewed_sha');
 passes(d=>{d.git.head_sha=SHA_C;d.review.reviewed_sha=SHA_C;d.checks.forEach(c=>{c.subject_sha=SHA_C;});});
});

test('routing and observed model/effort must match',()=>{
 fails(d=>{d.runs[1].observed_effort='low';},'runs[1].observed_effort');
 fails(d=>{d.runs[1].observed_model='gpt-6-astra';},'runs[1].observed_model');
 fails(d=>{d.runs[1].requested_effort='low';d.runs[1].observed_effort='low';},'runs[1].requested_effort');
 fails(d=>{d.runs[0].requested_effort='high';},'runs[0].requested_effort');
 fails(d=>{d.runs[0].requested_model='gpt-unknown';},'runs[0].requested_model');
 fails(d=>{d.runs[2].requested_effort='high';d.runs[2].observed_effort='high';},'runs[2].requested_effort');
 fails(d=>{d.runs[2].justification=null;},'runs[2].justification');
 fails(d=>{d.runs[2].justification='  ';},'runs[2].justification');
 passes(d=>{d.runs[2].requested_effort='medium';d.runs[2].observed_effort='medium';});
});

test('unknown observations need a reason and must be a null pair',()=>{
 fails(d=>{delete d.runs[0].observation_reason;},'runs[0].observation_reason');
 fails(d=>{d.runs[0].observation_reason='';},'runs[0].observation_reason');
 fails(d=>{d.runs[1].observation_reason='not allowed when observed';},'runs[1].observation_reason');
 fails(d=>{d.runs[0].observed_model='gpt-6-astra';},'runs[0].observed_effort');
 fails(d=>{d.runs[1].observed_model=null;},'runs[1].observed_model');
});

test('missing fields and empty lists fail',()=>{
 fails(d=>{delete d.version;},'version');
 fails(d=>{delete d.task.outcome;},'task.outcome');
 fails(d=>{delete d.git.pr;},'git.pr');
 fails(d=>{delete d.runs[1].justification;},'runs[1].justification');
 fails(d=>{delete d.checks[0].evidence;},'checks[0].evidence');
 fails(d=>{delete d.review.round;},'review.round');
 fails(d=>{delete d.usage[0].unavailable_reason;},'usage[0].unavailable_reason');
 fails(d=>{delete d.limitations;},'limitations');
 fails(d=>{d.runs=[];},'runs');
 fails(d=>{d.checks=[];},'checks');
 a.deepEqual(validate(null),['(root): must be an object']);
 a.deepEqual(validate([]),['(root): must be an object']);
});

test('unknown keys are rejected at every level without echoing odd key names',()=>{
 fails(d=>{d.session_id='x';},'session_id');
 fails(d=>{d.task.scope='x';},'task.scope');
 fails(d=>{d.git.remote='x';},'git.remote');
 fails(d=>{d.runs[0].log='x';},'runs[0].log');
 fails(d=>{d.checks[1].raw_output='x';},'checks[1].raw_output');
 fails(d=>{d.review.findings=[];},'review.findings');
 fails(d=>{d.usage[0].account='x';},'usage[0].account');
 const e=errorsAfter(d=>{d['PRIVATE-MARKER value']=1;});
 a.ok(e.includes('[unprintable key]: unknown key'));
 a.ok(!e.join('\n').includes('PRIVATE-MARKER'));
});

test('empty strings, wrong types and malformed values fail',()=>{
 fails(d=>{d.version='1';},'version');
 fails(d=>{d.version=2;},'version');
 fails(d=>{d.task.issue='42';},'task.issue');
 fails(d=>{d.task.issue=0;},'task.issue');
 fails(d=>{d.task.outcome='';},'task.outcome');
 fails(d=>{d.git.branch='';},'git.branch');
 fails(d=>{d.git.pr='';},'git.pr');
 fails(d=>{d.git.pr=42;},'git.pr');
 passes(d=>{d.git.pr=null;});
 fails(d=>{d.git.baseline_sha='abc123';},'git.baseline_sha');
 fails(d=>{d.git.baseline_sha='A'.repeat(40);},'git.baseline_sha');
 fails(d=>{d.git.head_sha='g'.repeat(40);},'git.head_sha');
 fails(d=>{d.runs[0].role='';},'runs[0].role');
 fails(d=>{d.runs[0]='planner';},'runs[0]');
 fails(d=>{d.checks[0].command='';},'checks[0].command');
 fails(d=>{d.checks[0].result='passed';},'checks[0].result');
 fails(d=>{d.review.round=3;},'review.round');
 fails(d=>{d.review.round='1';},'review.round');
 fails(d=>{d.review.verdict='approved';},'review.verdict');
 fails(d=>{d.review=null;},'review');
 fails(d=>{d.limitations=['ok',''];},'limitations[1]');
 fails(d=>{d.limitations='none';},'limitations');
 passes(d=>{d.limitations=[];d.usage=[];});
});

test('usage keeps unknowns, provenance and bills separate',()=>{
 fails(d=>{d.usage[0].unavailable_reason=null;},'usage[0].unavailable_reason');
 fails(d=>{d.usage[0].source='dashboard';},'usage[0].source');
 fails(d=>{Object.assign(d.usage[0],{value:1200,unavailable_reason:null,source:null});},'usage[0].source');
 fails(d=>{Object.assign(d.usage[0],{value:1200,source:'local session summary'});},'usage[0].unavailable_reason');
 fails(d=>{Object.assign(d.usage[1],{value:-1,unavailable_reason:null,source:'timer'});},'usage[1].value');
 fails(d=>{Object.assign(d.usage[1],{value:'60',unavailable_reason:null,source:'timer'});},'usage[1].value');
 fails(d=>{d.usage[1].unit='minutes';},'usage[1].unit');
 fails(d=>{d.usage[0].metric='cost';},'usage[0].metric');
 fails(d=>{Object.assign(d.usage[3],{value:3,unavailable_reason:null,source:'list price estimate'});},'usage[3].source');
 fails(d=>{Object.assign(d.usage[2],{value:0.5,unavailable_reason:null,source:'billing_record'});},'usage[2].source');
 passes(d=>{
  Object.assign(d.usage[0],{value:1200,unavailable_reason:null,source:'fictional session summary'});
  Object.assign(d.usage[1],{value:0,unavailable_reason:null,source:'fictional timer'});
  Object.assign(d.usage[2],{value:0.5,unavailable_reason:null,source:'fictional list-price calculation'});
  Object.assign(d.usage[3],{value:3,unavailable_reason:null,source:'billing_record'});
 });
});

test('CLI validates the example and fails without printing input',()=>{
 const ok=cli(exampleFile);
 a.equal(ok.status,0);a.match(ok.stdout,/structure valid/);
 const usage=cli();
 a.equal(usage.status,2);a.match(usage.stderr,/^Usage:/);
 a.notEqual(cli(exampleFile,exampleFile).status,0);
 a.equal(cli(path.join(tmp,'missing.json')).status,1);
 const marker='PRIVATE-MARKER-7f3';
 const broken=path.join(tmp,'broken.json');
 fs.writeFileSync(broken,`{"version":1,"task":"${marker}`);
 const bad=cli(broken);
 a.equal(bad.status,1);a.match(bad.stderr,/Invalid JSON/);
 a.ok(!(bad.stdout+bad.stderr).includes(marker));
 const invalid=path.join(tmp,'invalid.json');
 const d=structuredClone(example);d.task.outcome=7;d.checks[0].evidence=marker;d.checks[0].subject_sha=SHA_C;
 fs.writeFileSync(invalid,JSON.stringify(d));
 const res=cli(invalid);
 a.equal(res.status,1);
 a.match(res.stderr,/task\.outcome: must be a non-empty string/);
 a.match(res.stderr,/checks\[0\]\.subject_sha: must equal git\.head_sha/);
 a.ok(!(res.stdout+res.stderr).includes(marker));
});
