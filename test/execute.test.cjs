const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const C=require('../src/core.cjs'),PL=require('../src/planner.cjs'),A=require('../src/approvals.cjs'),G=require('../src/google.cjs'),X=require('../src/execute.cjs'),{build}=require('../src/app-server.cjs'),{hostedConfig}=require('../src/hosted.cjs');
const TZ='America/New_York',EXEC='exec-0123456789ABCDEFGHIJKLMNOPQRSTUV',INGEST='ingest-0123456789ABCDEFGHIJKLMNOPQRSTU';
const ARGS=require('./fixtures/google-connector-create-args.json').arguments,SAMPLE=require('./fixtures/google-connector-read-event.json').event;
// Fictional Google snapshot relative to the real clock with one prepared focus block (as in google-execution.test.cjs).
function setup(s){C.configure(TZ);const real=Date.now(),today=C.dayKey(real),tomorrow=PL.nextDay(today),d=structuredClone(require('../examples/google-snapshot.json'));
 d.generatedAt=new Date(real-60000).toISOString();d.calendarCoverage={...d.calendarCoverage,start:C.zonedISO(today,'00:00'),end:C.zonedISO(PL.nextDay(PL.nextDay(tomorrow)),'00:00'),checkedAt:d.generatedAt};
 d.events=[];d.proposals=[];d.assignments=[];d.email={enabled:false};for(const x of d.sources)x.lastSuccess=d.generatedAt;s.importSnapshot(d);
 const t=s.saveTodo({title:'Synthetic essay plan',dueAt:null,durationMinutes:60}).todo;s.generatePlan(tomorrow);const p=s.snapshot().proposals.find(x=>x.sourceRefs?.[0]?.id===t.id);
 return {d:s.snapshot(),p,q:A.prepare(s,[p.id]),k:G.key(s.storeId(),p)};}
const offset=x=>new Date(Date.parse(x)-4*3600000).toISOString().replace(/\.\d+Z$/,'-04:00');
const liveRead=(d,p)=>({checkedAt:new Date().toISOString(),provider:'google',account:p.account,start:new Date(Date.parse(p.start)-3600000).toISOString(),end:new Date(Date.parse(p.end)+3600000).toISOString(),reads:d.calendarCoverage.calendars.map(c=>({calendarId:c.id,complete:true,events:[]}))});
const saved=(p,k)=>({...structuredClone(SAMPLE),id:'evt'+k.slice(2,12),summary:p.title,description:G.description(p,k),start:offset(p.start),end:offset(p.end),location:'',reminders:{use_default:false,overrides:[{method:'popup',minutes:p.reminderMinutes}]}});
async function withApp(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-exec-')),s=build(dir,{executeSecret:EXEC,ingestSecret:INGEST});await new Promise(r=>s.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+s.address().port,j=async r=>({status:r.status,body:await r.json()});
 const session=await fetch(base+'/api/session'),cookie=session.headers.get('set-cookie').split(';')[0],{csrf}=await session.json();
 const page=(route,body)=>fetch(base+'/api/'+route,{method:'POST',headers:{Cookie:cookie,Origin:base,'x-dayweave-token':csrf,'Content-Type':'application/json'},body:JSON.stringify(body)}).then(j);
 const exec=(route,body,secret=EXEC)=>fetch(base+'/api/execute'+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+secret,...(body?{'Content-Type':'application/json'}:{})},body:body&&JSON.stringify(body)}).then(j);
 try{await fn({s,store:s.store,page,exec});}finally{s.closeAllConnections();await new Promise(r=>s.close(r));fs.rmSync(dir,{recursive:true,force:true});}}

test('the owner approves an exact version on the page; the executor verifies, records pending, and reads back to executed',()=>withApp(async({store,page,exec})=>{
 const {d,p,q,k}=setup(store),R=q.reference;
 a.equal((await exec('')).body.versions.length,0,'a prepared but unapproved version is not offered');
 a.match((await exec('/verify',{reference:R,declared:ARGS})).body.error,/no owner approval/);
 const ok=await page('approvals/approve',{reference:R});a.equal(ok.status,200);a.deepEqual({...ok.body.approval,at:null},{channel:'web',text:'Approve '+R,at:null,by:'local owner'});
 a.equal((await page('approvals/approve',{reference:R})).body.approval.at,ok.body.approval.at,'approving twice keeps the first approval');
 a.equal(A.list(store)[0].approval.text,'Approve '+R,'the page sees the approval');
 const ctx=(await exec('')).body;a.equal(ctx.versions[0].reference,R);a.equal(ctx.versions[0].actions[0].id,p.id);a.equal(ctx.coverage.calendarId,d.calendarCoverage.calendarId);a.equal(ctx.profile.tool,'google_calendar_create_event');
 const v=(await exec('/verify',{reference:R,declared:ARGS})).body;a.equal(v.go,true,JSON.stringify(v));a.deepEqual(v.actions[0].request,G.toConnector(p,k));
 a.equal((await exec('/recheck',{reference:R,id:p.id,read:liveRead(d,p)})).body.go,true);
 const pend=(await exec('/pending',{reference:R,id:p.id,declared:ARGS,read:liveRead(d,p)})).body;a.equal(pend.status,'pending');a.deepEqual(pend.write,G.toConnector(p,k));
 const h=store.snapshot().actionHistory.find(x=>x.id===p.id);a.equal(h.humanApproval.channel,'web');a.equal(h.humanApproval.by,'local owner');
 a.match((await page('approvals/withdraw',{reference:R})).body.error,/already started/,'a started version cannot be withdrawn');
 const rb=(await exec('/readback',{reference:R,id:p.id,readback:{calendarId:p.calendarId,account:p.account,event:saved(p,k)}})).body;a.equal(rb.status,'executed',JSON.stringify(rb));
 a.equal(A.read(store,R).status,'executed');a.equal((await exec('')).body.versions.length,0,'an executed version is no longer offered');}));

test('the executor needs its own secret, and only owner-approved, unchanged versions are executable',()=>withApp(async({store,page,exec})=>{
 const {d,p,q}=setup(store),R=q.reference;
 for(const secret of ['',INGEST,EXEC+'x'])a.equal((await exec('',undefined,secret)).status,401,secret);
 a.equal((await exec('/pending',{reference:R,id:p.id,declared:ARGS,read:liveRead(d,p)})).status,400,'no approval, no pending');a.equal(store.snapshot().actionHistory.length,0);
 await page('approvals/approve',{reference:R});a.deepEqual((await page('approvals/withdraw',{reference:R})).body,{ok:true});a.equal((await exec('')).body.versions.length,0,'withdrawn');
 await page('approvals/approve',{reference:R});await page('proposals/edit',{id:p.id,changes:{title:'Changed title'}});
 a.equal(A.read(store,R).status,'invalidated');a.equal((await exec('')).body.versions.length,0,'an edit invalidates the approved version');
 a.match((await page('approvals/approve',{reference:R})).body.error,/invalidated/);
 a.match((await exec('/verify',{reference:R,declared:ARGS})).body.error||JSON.stringify((await exec('/verify',{reference:R,declared:ARGS})).body.blockers),/invalidated/);}));

test('web approval evidence needs the recorded owner; restore keeps owner approvals with their versions; secrets are checked',()=>{
 const q={reference:'Q-1',at:new Date(Date.now()-60000).toISOString()},at=new Date().toISOString();
 a.deepEqual(G.evidence({channel:'web',text:'Approve Q-1',at,by:'owner@example.com'},q.reference,q.at),[]);
 a.match(G.evidence({channel:'web',text:'Approve Q-1',at},q.reference,q.at).join(' '),/own chat message or the owner/);a.match(G.evidence({channel:'email',text:'Approve Q-1',at,by:'x'},q.reference,q.at).join(' '),/own chat message/);
 const env={DAYWEAVE_PUBLIC_ORIGIN:'https://dayweave.example.com',DAYWEAVE_GOOGLE_CLIENT_ID:'c',DAYWEAVE_GOOGLE_CLIENT_SECRET:'s',DAYWEAVE_ALLOWED_EMAIL:'o@example.com',DAYWEAVE_SESSION_SECRET:'session-0123456789abcdefghijklmnop'};
 a.throws(()=>hostedConfig({...env,DAYWEAVE_EXECUTE_SECRET:'short'}),/32/);a.throws(()=>hostedConfig({...env,DAYWEAVE_INGEST_SECRET:EXEC,DAYWEAVE_EXECUTE_SECRET:EXEC}),/differ/);a.ok(hostedConfig({...env,DAYWEAVE_INGEST_SECRET:INGEST,DAYWEAVE_EXECUTE_SECRET:EXEC}));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-exec-')),{Store}=require('../src/store.cjs'),s=new Store(dir);
 try{const {q}=setup(s),name=s.backup();X.approve(s,q.reference,'owner@example.com');s.restore(name);
  a.equal(A.list(s).find(x=>x.reference===q.reference).approval.by,'owner@example.com','the approval row survives a restore');a.equal(A.read(s,q.reference).status,'invalidated','but restore invalidates unstarted versions');}
 finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}});
