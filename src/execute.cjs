'use strict';
// Owner approval on the page and the cloud executor's API for approved Google Calendar writes. The signed-in owner approves an
// exact prepared Q version; the server records that approval itself (the executor never supplies it). The executor (a Claude
// cloud task with the Google Calendar connector, docs/cloud-execute.md) authenticates with its own bearer secret and runs the
// same bridge steps as scripts/google-calendar.cjs: verify, live recheck, pending, one create call, read-back or reconcile.
const C=require('./core.cjs'),A=require('./approvals.cjs'),G=require('./google.cjs');
const OPEN=['prepared','pending','partial','unverified'];
function ownerApproval(s,q){const row=s.db.prepare('SELECT value FROM owner_approvals WHERE id=?').get(q.id);return row?JSON.parse(row.value):null;}
// Records the owner's approval of exactly this version. Only a prepared, all-Google version whose request checks pass now.
function approve(s,ref,by){const q=A.read(s,ref);if(q.status!=='prepared')throw Error(q.reference+' is '+q.status+' and cannot be approved.');
 if(q.value.some(p=>C.calendarProvider(p)!=='google'))throw Error('Only Google Calendar versions can be approved here.');
 const errors=[...q.errors,...q.value.flatMap(p=>G.actionErrors(p,s.snapshot()))];if(errors.length)throw Error('Not approved: '+[...new Set(errors)].join('; '));
 if(ownerApproval(s,q))return ownerApproval(s,q);
 const value={channel:'web',text:'Approve '+q.reference,at:new Date().toISOString(),by:String(by||'owner')};
 s.transaction(()=>{s.db.prepare('INSERT INTO owner_approvals VALUES(?,?)').run(q.id,JSON.stringify(value));s.log('approval','approved',q.reference,value);});return value;}
// Withdraws an approval before any write started; a started version keeps its approval with its receipts.
function revoke(s,ref){const q=A.read(s,ref);if(q.status!=='prepared')throw Error(q.reference+' already started ('+q.status+'); it cannot be withdrawn.');
 s.transaction(()=>{s.db.prepare('DELETE FROM owner_approvals WHERE id=?').run(q.id);s.log('approval','withdrawn',q.reference,{});});return {ok:true};}
const need=(s,ref)=>{const q=A.read(s,ref),h=ownerApproval(s,q);if(!h)throw Error(q.reference+' has no owner approval.');return {q,h};};
// What the executor needs to plan its reads: approved versions still open, with each action's receipt state.
function context(s){const d=s.snapshot(),cov=d?.calendarCoverage||{},hist=d?.actionHistory||[];
 const versions=A.list(s).filter(q=>OPEN.includes(q.status)).map(q=>({q,h:ownerApproval(s,q)})).filter(x=>x.h).map(({q,h})=>({reference:q.reference,status:q.status,approvedAt:h.at,
  actions:q.value.map(p=>({id:p.id,title:p.title,start:p.start,end:p.end,calendarId:p.calendarId,account:p.account,receipt:hist.find(x=>x.id===p.id)?.status||null}))}));
 return {store:s.storeId(),timezone:d?.timezone||null,profile:G.PROFILE,coverage:{provider:cov.provider||null,account:cov.account||null,calendarId:cov.calendarId||null,calendars:cov.calendars||[],checkedAt:cov.checkedAt||null},versions};}
async function executorRoute(s,u,body,send){const p=u.pathname.slice('/api/execute'.length);
 if(p===''||p==='/')return send(200,context(s));
 const {reference:ref,id}=body||{};
 if(p==='/verify'){const {h}=need(s,ref);return send(200,G.verify(s,ref,h,body.declared));}
 if(p==='/recheck'){need(s,ref);return send(200,G.recheck(s,ref,id,body.read));}
 if(p==='/pending'){const {h}=need(s,ref);return send(200,G.pending(s,ref,id,h,body.declared,body.read));}
 if(p==='/readback'){need(s,ref);return send(200,G.readback(s,ref,id,body.readback));}
 if(p==='/reconcile'){need(s,ref);return send(200,G.reconcile(s,ref,id,body.search));}
 return send(404,{error:'Unknown executor route'});}
module.exports={approve,revoke,ownerApproval,context,executorRoute,OPEN};
