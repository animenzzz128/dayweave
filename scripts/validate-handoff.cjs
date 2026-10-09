'use strict';
// Structural check for a local agent handoff (see docs/handoff-contract.md).
// Passing does not prove the evidence is true, that privacy review happened, or that any action is approved.
const fs=require('node:fs');

const ROUTES=new Map([['gpt-6-astra',['low']],['claude-opus-5-5',['high']],['gpt-6.1-sol',['low','medium']]]);
const UNITS=new Map([['tokens','tokens'],['elapsed_seconds','seconds'],['list_price_estimate_usd','usd'],['billed_credits','credits']]);
const SHA=/^[0-9a-f]{40}$/;

const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const isText=v=>typeof v==='string'&&v.trim()!=='';
const has=(o,k)=>Object.hasOwn(o,k);
const at=(p,k)=>p?`${p}.${k}`:k;
// Key names come from the input; only echo short identifiers so diagnostics cannot carry a payload.
const keyName=k=>/^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(k)?k:'[unprintable key]';

function validate(doc){
  const errors=[],err=(p,m)=>errors.push(`${p||'(root)'}: ${m}`);
  // Exact key sets: missing and unknown keys both fail, so no extra runtime data rides along.
  const shape=(v,p,required,optional=[])=>{
    if(!isObj(v)){err(p,'must be an object');return false;}
    for(const k of required)if(!has(v,k))err(at(p,k),'is required');
    for(const k of Object.keys(v))if(!required.includes(k)&&!optional.includes(k))err(at(p,keyName(k)),'unknown key');
    return true;
  };
  const obj=(o,p,k,required)=>has(o,k)&&shape(o[k],at(p,k),required);
  const list=(o,p,k,min)=>{
    if(!has(o,k))return [];
    if(!Array.isArray(o[k])){err(at(p,k),'must be an array');return [];}
    if(o[k].length<min)err(at(p,k),'must not be empty');
    return o[k];
  };
  const text=(o,p,k)=>{if(has(o,k)&&!isText(o[k]))err(at(p,k),'must be a non-empty string');};
  const oneOf=(o,p,k,allowed)=>{if(has(o,k)&&!allowed.includes(o[k]))err(at(p,k),`must be one of: ${allowed.join(', ')}`);};
  const sha=(o,p,k)=>{
    if(!has(o,k))return false;
    if(typeof o[k]==='string'&&SHA.test(o[k]))return true;
    err(at(p,k),'must be a full 40-character lowercase hex SHA');return false;
  };
  let head=null;
  const bound=(o,p,k)=>{if(sha(o,p,k)&&head&&o[k]!==head)err(at(p,k),'must equal git.head_sha (stale or unbound evidence)');};

  if(!shape(doc,'',['version','task','git','runs','checks','review','usage','limitations']))return errors;
  if(has(doc,'version')&&doc.version!==1)err('version','must be the number 1');

  if(obj(doc,'','task',['issue','outcome'])){
    const t=doc.task;
    if(has(t,'issue')&&!(Number.isInteger(t.issue)&&t.issue>0))err('task.issue','must be a positive integer');
    text(t,'task','outcome');
  }

  if(obj(doc,'','git',['baseline_sha','head_sha','branch','pr'])){
    const g=doc.git;
    sha(g,'git','baseline_sha');
    if(sha(g,'git','head_sha'))head=g.head_sha;
    text(g,'git','branch');
    if(has(g,'pr')&&g.pr!==null&&!isText(g.pr))err('git.pr','must be null or a non-empty string');
  }

  list(doc,'','runs',1).forEach((r,i)=>{
    const p=`runs[${i}]`;
    if(!shape(r,p,['role','requested_model','requested_effort','observed_model','observed_effort','justification'],['observation_reason']))return;
    text(r,p,'role');
    oneOf(r,p,'requested_model',[...ROUTES.keys()]);
    const efforts=ROUTES.get(r.requested_model);
    if(efforts)oneOf(r,p,'requested_effort',efforts);
    else text(r,p,'requested_effort');
    if(r.observed_model===null&&r.observed_effort===null){
      if(!isText(r.observation_reason))err(at(p,'observation_reason'),'must be a non-empty string when observed_model and observed_effort are null');
    }else{
      if(has(r,'observation_reason'))err(at(p,'observation_reason'),'is allowed only when observed_model and observed_effort are both null');
      if(has(r,'observed_model')&&r.observed_model!==r.requested_model)err(at(p,'observed_model'),'must equal requested_model (or both observed values null)');
      if(has(r,'observed_effort')&&r.observed_effort!==r.requested_effort)err(at(p,'observed_effort'),'must equal requested_effort (or both observed values null)');
    }
    if(r.requested_model==='gpt-6.1-sol'&&!isText(r.justification))err(at(p,'justification'),'must be a non-empty string for gpt-6.1-sol');
    else if(has(r,'justification')&&r.justification!==null&&!isText(r.justification))err(at(p,'justification'),'must be null or a non-empty string');
  });

  list(doc,'','checks',1).forEach((c,i)=>{
    const p=`checks[${i}]`;
    if(!shape(c,p,['command','result','subject_sha','evidence']))return;
    text(c,p,'command');
    oneOf(c,p,'result',['pass','fail']);
    bound(c,p,'subject_sha');
    text(c,p,'evidence');
  });

  if(obj(doc,'','review',['reviewed_sha','round','verdict'])){
    bound(doc.review,'review','reviewed_sha');
    oneOf(doc.review,'review','round',[1,2]);
    oneOf(doc.review,'review','verdict',['pass','changes_requested']);
  }

  list(doc,'','usage',0).forEach((u,i)=>{
    const p=`usage[${i}]`;
    if(!shape(u,p,['metric','value','unit','source','unavailable_reason']))return;
    oneOf(u,p,'metric',[...UNITS.keys()]);
    const unit=UNITS.get(u.metric);
    if(unit&&has(u,'unit')&&u.unit!==unit)err(at(p,'unit'),`must be "${unit}" for this metric`);
    else if(!unit)text(u,p,'unit');
    if(u.value===null){
      if(!isText(u.unavailable_reason))err(at(p,'unavailable_reason'),'must be a non-empty string when value is null');
      if(has(u,'source')&&u.source!==null)err(at(p,'source'),'must be null when value is null');
    }else if(has(u,'value')){
      if(typeof u.value!=='number'||!Number.isFinite(u.value)||u.value<0)err(at(p,'value'),'must be null or a finite number >= 0');
      if(has(u,'unavailable_reason')&&u.unavailable_reason!==null)err(at(p,'unavailable_reason'),'must be null when value is measured');
      if(!isText(u.source))err(at(p,'source'),'must name the provenance of a measured value');
      else if(u.metric==='billed_credits'&&u.source!=='billing_record')err(at(p,'source'),'must be "billing_record"; estimates and quota deltas are not bills');
    }
    if(u.metric!=='billed_credits'&&u.source==='billing_record')err(at(p,'source'),'"billing_record" is reserved for billed_credits');
  });

  list(doc,'','limitations',0).forEach((l,i)=>{if(!isText(l))err(`limitations[${i}]`,'must be a non-empty string');});
  return errors;
}

// The CLI never prints file contents or parser messages, which can quote the input.
function main(args){
  if(args.length!==1||args[0].startsWith('-')){console.error('Usage: node scripts/validate-handoff.cjs <handoff.json>');return 2;}
  let source;
  try{source=fs.readFileSync(args[0],'utf8');}catch(e){console.error(`Cannot read handoff file (${e.code||'read error'}).`);return 1;}
  let doc;
  try{doc=JSON.parse(source.replace(/^﻿/,''));}catch{console.error('Invalid JSON: the handoff file could not be parsed.');return 1;}
  const errors=validate(doc);
  if(errors.length){console.error(`Handoff invalid (${errors.length} problem${errors.length===1?'':'s'}):\n${errors.map(e=>'- '+e).join('\n')}`);return 1;}
  console.log('Handoff structure valid. This does not verify that the evidence is true or approve any action.');
  return 0;
}

module.exports={validate};
if(require.main===module)process.exitCode=main(process.argv.slice(2));
