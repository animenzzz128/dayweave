const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const C=require('../src/core.cjs'),PL=require('../src/planner.cjs'),A=require('../src/approvals.cjs'),G=require('../src/google.cjs'),X=require('../src/execute.cjs'),GC=require('../src/gcal.cjs'),{Store}=require('../src/store.cjs');
const {createServer}=require('../src/server.cjs'),{hostedConfig,SESSION_COOKIE}=require('../src/hosted.cjs');
const TZ='America/New_York',SECRET='session-0123456789abcdefghijklmnop';
// Fictional Google snapshot relative to the real clock with one prepared, owner-approved focus block (as in execute.test.cjs).
function setup(s){C.configure(TZ);const real=Date.now(),today=C.dayKey(real),tomorrow=PL.nextDay(today),d=structuredClone(require('../examples/google-snapshot.json'));
 d.generatedAt=new Date(real-60000).toISOString();d.calendarCoverage={...d.calendarCoverage,start:C.zonedISO(today,'00:00'),end:C.zonedISO(PL.nextDay(PL.nextDay(tomorrow)),'00:00'),checkedAt:d.generatedAt};
 d.events=[];d.proposals=[];d.assignments=[];d.email={enabled:false};for(const x of d.sources)x.lastSuccess=d.generatedAt;s.importSnapshot(d);
 const t=s.saveTodo({title:'Synthetic essay plan',dueAt:null,durationMinutes:60}).todo;s.generatePlan(tomorrow);const p=s.snapshot().proposals.find(x=>x.sourceRefs?.[0]?.id===t.id);
 const q=A.prepare(s,[p.id]);X.approve(s,q.reference,'student@example.com');return {d:s.snapshot(),p,q,k:G.key(s.storeId(),p)};}
// Stands in for Google's token endpoint and Calendar API: events per calendar, REST shapes, and a log of every call.
function fakeGoogle({failInsert=null,scope=GC.SCOPE,refresh='ok'}={}){const cals=new Map(),calls=[];let n=0;
 const json=(status,body)=>({ok:status<300,status,json:async()=>body});
 const f=async(url,init={})=>{const u=new URL(url),m=init.method||'GET';calls.push(m+' '+u.pathname);
  if(u.href.startsWith('https://oauth2.googleapis.com/token'))return refresh==='ok'?json(200,{access_token:'at-1',expires_in:3600,scope}):json(400,{error:'invalid_grant'});
  if(u.href.startsWith('https://oauth2.googleapis.com/revoke'))return json(200,{});
  a.equal(init.headers.Authorization,'Bearer at-1');const [,id,eid]=u.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/),cal=decodeURIComponent(id),list=cals.get(cal)||[];
  if(m==='GET'&&!eid){a.equal(u.searchParams.get('singleEvents'),'true');const lo=Date.parse(u.searchParams.get('timeMin')),hi=Date.parse(u.searchParams.get('timeMax'));return json(200,{items:list.filter(e=>Date.parse(e.start.dateTime)<hi&&Date.parse(e.end.dateTime)>lo)});}
  if(m==='GET')return list.find(e=>e.id===eid)?json(200,list.find(e=>e.id===eid)):json(404,{error:{message:'Not Found'}});
  if(m==='POST'){a.equal(u.searchParams.get('sendUpdates'),'none');const body=JSON.parse(init.body);f.inserted.push(body);
   const ev={id:'evt'+(++n),status:'confirmed',organizer:{email:cal,self:true},eventType:'default',...body,start:{dateTime:body.start.dateTime,timeZone:body.start.timeZone},end:{dateTime:body.end.dateTime,timeZone:body.end.timeZone}};
   if(failInsert!=='lost-before')cals.set(cal,[...list,ev]);if(failInsert)return json(503,{error:{message:'Backend Error'}});return json(200,ev);}
  if(m==='DELETE'){a.equal(u.searchParams.get('sendUpdates'),'none');f.deleted.push(eid);cals.set(cal,list.filter(e=>e.id!==eid));return json(204,null);}
  throw Error('unexpected '+m+' '+url);};
 f.inserted=[];f.deleted=[];f.calls=calls;f.add=(cal,ev)=>cals.set(cal,[...(cals.get(cal)||[]),ev]);f.events=cal=>cals.get(cal)||[];return f;}
const client=(f,account='student@example.com')=>GC.client({account,refreshToken:'rt-1',clientId:'client-1',clientSecret:'shh',fetch:f});
async function withStore(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-gcal-')),s=new Store(dir);try{await fn(s);}finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}}

test('an approved version is written once with the approved fields, read back to executed, and never written twice',()=>withStore(async s=>{
 const {p,q,k}=setup(s),f=fakeGoogle(),r=await GC.writeApproved(s,q.reference,client(f));
 a.deepEqual(r.stopped,[]);a.equal(r.actions[0].status,'executed',JSON.stringify(r));a.equal(f.inserted.length,1);
 a.deepEqual(f.inserted[0],GC.toRest(G.toConnector(p,k)));a.equal(f.inserted[0].reminders.useDefault,false);a.ok(f.inserted[0].description.endsWith(G.marker(p,k)));a.equal(f.inserted[0].attendees,undefined);
 a.equal(A.read(s,q.reference).status,'executed');const h=s.snapshot().actionHistory.find(x=>x.id===p.id);a.equal(h.humanApproval.channel,'web');a.match(h.remoteRef,/\/evt1$/);
 const again=await GC.writeApproved(s,q.reference,client(f));a.equal(again.actions[0].already,true);a.equal(f.inserted.length,1,'no second insert');}));

test('a conflict or an existing marked event in the live re-read stops the action before pending',()=>withStore(async s=>{
 const {d,p,q,k}=setup(s),f=fakeGoogle();f.add(p.calendarId,{id:'busy1',status:'confirmed',summary:'Fictional seminar',start:{dateTime:p.start},end:{dateTime:p.end}});
 const r=await GC.writeApproved(s,q.reference,client(f));a.equal(r.actions[0].status,'skipped');a.match(r.actions[0].errors.join(' '),/Conflicts with Fictional seminar/);
 a.equal(f.inserted.length,0);a.equal(s.snapshot().actionHistory.length,0,'no pending receipt');
 const g=fakeGoogle();g.add(p.calendarId,{id:'dup1',status:'confirmed',summary:p.title,description:G.description(p,k),start:{dateTime:p.start},end:{dateTime:p.end}});
 const r2=await GC.writeApproved(s,q.reference,client(g));a.equal(r2.actions[0].status,'skipped');a.match(r2.actions[0].errors.join(' '),/already exists/);a.equal(g.inserted.length,0);
 a.ok(d.calendarCoverage.calendars.length>=1);}));

test('an unclear insert is reconciled from a wide re-read, never retried',()=>withStore(async s=>{
 const {q}=setup(s),lost=fakeGoogle({failInsert:'lost-after'}),r=await GC.writeApproved(s,q.reference,client(lost));
 a.equal(r.actions[0].status,'executed',JSON.stringify(r));a.equal(lost.inserted.length,1,'the event that did land is found by its marker');
 await withStore(async s2=>{const {p,q:q2}=setup(s2),none=fakeGoogle({failInsert:'lost-before'}),r2=await GC.writeApproved(s2,q2.reference,client(none));
  a.equal(r2.actions[0].status,'not_created',JSON.stringify(r2));a.equal(none.inserted.length,1);
  const again=await GC.writeApproved(s2,q2.reference,client(none));a.equal(none.inserted.length,1,'not_created needs a new version');a.equal(again.actions[0].status,'not_created');a.equal(again.actions[0].already,true);
  a.ok(p.id);});}));

test('the connected account must be the dashboard calendar account, and an expired grant asks to reconnect',()=>withStore(async s=>{
 const {q}=setup(s);await a.rejects(GC.writeApproved(s,q.reference,client(fakeGoogle(),'other@example.com')),/not the dashboard calendar account/);
 await a.rejects(GC.writeApproved(s,q.reference,client(fakeGoogle({refresh:'expired'}))),e=>e.reconnect===true&&/connect Google Calendar again/.test(e.message));
 await a.rejects(GC.writeApproved(s,q.reference,client(fakeGoogle({scope:'openid email'}))),e=>e.reconnect===true);
 a.equal(s.snapshot().actionHistory.length,0);}));

test('refresh tokens are sealed per account with the session secret',()=>withStore(async s=>{
 const v=GC.vault(s,SECRET);v.save('Student@Example.com',{refreshToken:'rt-1',scope:GC.SCOPE});const row=s.db.prepare('SELECT * FROM google_tokens').get();
 a.equal(row.account,'student@example.com');a.ok(!row.value.includes('rt-1'),'not stored in the clear');a.equal(v.load('student@example.com').refreshToken,'rt-1');
 a.equal(GC.vault(s,SECRET+'x').load('student@example.com'),null,'another secret cannot open it');
 s.db.prepare('INSERT INTO google_tokens VALUES(?,?)').run('other@example.com',row.value);a.equal(v.load('other@example.com'),null,'bound to its account');
 v.remove('student@example.com');a.equal(v.load('student@example.com'),null);
 a.equal(GC.normalize({id:'e',start:{date:'2026-10-27'},end:{date:'2026-10-28'},organizer:{self:true},reminders:{useDefault:true}}).start,'2026-10-27');}));

// Hosted flow: the signed-in owner connects Google Calendar, then writes an approved version from the page.
const env={DAYWEAVE_PUBLIC_ORIGIN:'https://dayweave.example.com',DAYWEAVE_GOOGLE_CLIENT_ID:'client-1',DAYWEAVE_GOOGLE_CLIENT_SECRET:'shh',DAYWEAVE_ALLOWED_EMAIL:'student@example.com',DAYWEAVE_SESSION_SECRET:SECRET},origin=env.DAYWEAVE_PUBLIC_ORIGIN;
function request(port,p,{method='GET',headers={},body}={}){return new Promise((resolve,reject)=>{const r=http.request({port,path:p,method,headers:{Host:'dayweave.example.com',...headers}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text,json:()=>JSON.parse(text)}));});r.on('error',reject);r.end(body);});}
const jar=res=>[].concat(res.headers['set-cookie']||[]).map(c=>c.split(';')[0]).join('; ');
test('the owner connects Google Calendar separately from sign-in and writes an approved version from the page',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-gcal-hosted-')),api=fakeGoogle();let nonce='',grant={};
 const idToken=()=>'h.'+Buffer.from(JSON.stringify({iss:'https://accounts.google.com',aud:'client-1',exp:Date.now()/1000+600,email_verified:true,email:'student@example.com',nonce})).toString('base64url')+'.sig';
 const fetch=async(url,init)=>url==='https://oauth2.googleapis.com/token'&&new URLSearchParams(init.body).get('grant_type')==='authorization_code'?{ok:true,status:200,json:async()=>({id_token:idToken(),...grant})}:api(url,init);
 const s=createServer(dir,{hosted:hostedConfig(env),fetch});await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;
 try{const go=async(start,g)=>{const r=await request(port,start.path,{headers:start.headers});const q=new URL(r.headers.location).searchParams;nonce=q.get('nonce');grant=g;return {r,q,cb:await request(port,'/auth/callback?code=c1&state='+q.get('state'),{headers:{Cookie:[start.headers?.Cookie,jar(r)].filter(Boolean).join('; ')}})};};
  const signIn=await go({path:'/auth/login'},{});a.equal(signIn.q.get('scope'),'openid email','plain sign-in never asks for calendar access');
  const cookie=jar(signIn.cb).split('; ').find(c=>c.startsWith(SESSION_COOKIE+'='));
  a.equal((await request(port,'/auth/calendar/connect')).headers.location,'/auth/login','connecting needs a session');
  const denied=await go({path:'/auth/calendar/connect',headers:{Cookie:cookie}},{scope:'openid email'});a.equal(denied.cb.headers.location,'/#/plan?calendar=denied');
  const c=await go({path:'/auth/calendar/connect',headers:{Cookie:cookie}},{refresh_token:'rt-1',scope:'openid email '+GC.SCOPE});
  a.equal(c.q.get('access_type'),'offline');a.match(c.q.get('scope'),/calendar\.events/);a.equal(c.cb.headers.location,'/#/plan?calendar=connected');
  const csrf=(await request(port,'/api/session',{headers:{Cookie:cookie}})).json().csrf,post=(route,body)=>request(port,'/api/'+route,{method:'POST',headers:{Cookie:cookie,Origin:origin,'x-dayweave-token':csrf,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const {p,q}=setup(s.store);a.equal(GC.vault(s.store,SECRET).load('student@example.com').refreshToken,'rt-1');
  const snap=(await request(port,'/api/snapshot',{headers:{Cookie:cookie}})).json();a.equal(snap.calendarWrite.connected,true);
  const w=await post('calendar/write',{reference:q.reference});a.equal(w.status,200,w.text);a.equal(w.json().actions[0].status,'executed');a.equal(api.inserted.length,1);a.equal(api.inserted[0].summary,p.title);
  a.equal((await request(port,'/api/calendar/write',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:'{}'})).status,403,'CSRF checked');
  const off=await post('calendar/disconnect',{});a.equal(off.json().connected,false);a.ok(api.calls.includes('POST /revoke'));
  a.equal((await post('calendar/write',{reference:q.reference})).status,409);}
 finally{await new Promise(r=>s.close(r));fs.rmSync(dir,{recursive:true,force:true});}});

// After a write, the next calendar read shows the written event; a changed plan proposes its removal with the new block.
function rewritten(s,f,p,edit=ev=>ev){const d=s.snapshot(),h=d.actionHistory.find(x=>x.id===p.id),[cal,id]=[p.calendarId,h.remoteRef.slice(p.calendarId.length+1)];
 const ev=edit({id,title:p.title,start:p.start,end:p.end,busy:true,sourceId:'google-calendar',calendarId:cal,account:p.account});d.events=[ev];d.generatedAt=new Date().toISOString();d.calendarCoverage={...d.calendarCoverage,checkedAt:d.generatedAt};for(const x of d.sources)x.lastSuccess=d.generatedAt;s.importSnapshot(d);
 // The change: the essay is done, and a new todo due at 10:00 that day takes the 09:00 hour.
 const t=Object.values(s.state().todo).find(x=>x.status==='open');s.completeTodo(t.id,true);const date=p.planDate;
 s.saveTodo({title:'Synthetic reading notes',dueAt:C.zonedISO(date,'10:00'),durationMinutes:60});const r=s.generatePlan(date);
 return {r,create:r.blocks.find(b=>b.title==='Focus: Synthetic reading notes'),removal:r.blocks.find(b=>b.action==='delete')};}

test('a changed plan removes the block Dayweave wrote and writes the new one in one approved version',()=>withStore(async s=>{
 const {p,q}=setup(s),f=fakeGoogle();s.generatePlan(p.planDate);a.equal(s.snapshot().proposals.find(x=>x.id===p.id).lockedBy,'approval','approval lock');
 await GC.writeApproved(s,q.reference,client(f));
 const {create,removal}=rewritten(s,f,p);a.ok(create&&removal,'a new block and a removal');a.equal(removal.replaces,p.id);a.match(removal.remoteRef,/\/evt1$/);a.equal(create.start,p.start,'the new block takes the freed hour');
 a.throws(()=>A.prepare(s,[create.id]),/approve it together with the removal/);
 const q2=A.prepare(s,[create.id,removal.id]);X.approve(s,q2.reference,'student@example.com');const r=await GC.writeApproved(s,q2.reference,client(f));
 a.deepEqual(r.actions.map(x=>[x.id,x.status]),[[removal.id,'executed'],[create.id,'executed']],JSON.stringify(r));a.deepEqual(f.deleted,['evt1']);a.equal(f.inserted.length,2);
 const again=await GC.writeApproved(s,q2.reference,client(f));a.equal(f.deleted.length,1,'never deleted twice');a.ok(again.actions.every(x=>x.already));
 // The removed block no longer covers the todo or holds time; regenerating keeps the written new block.
 const d=s.snapshot();d.events=[];d.generatedAt=new Date().toISOString();d.calendarCoverage={...d.calendarCoverage,checkedAt:d.generatedAt};for(const x of d.sources)x.lastSuccess=d.generatedAt;s.importSnapshot(d);
 const later=s.generatePlan(p.planDate);a.deepEqual(later.blocks.filter(b=>b.title===p.title||b.title===create.title||b.action==='delete'),[],JSON.stringify(later.blocks.map(b=>b.title)));}));

test('an event the owner moved in Google Calendar is kept: its removal and the block over it are skipped',()=>withStore(async s=>{
 const {p,q}=setup(s),f=fakeGoogle();await GC.writeApproved(s,q.reference,client(f));const {create,removal}=rewritten(s,f,p);
 const q2=A.prepare(s,[create.id,removal.id]);X.approve(s,q2.reference,'student@example.com');
 const id=s.snapshot().actionHistory.find(x=>x.id===p.id).remoteRef.split('/').pop(),moved=f.events(p.calendarId).find(e=>e.id===id);moved.summary='Moved by me';
 const r=await GC.writeApproved(s,q2.reference,client(f)),by=x=>r.actions.find(a=>a.id===x);
 a.equal(by(removal.id).status,'skipped');a.match(by(removal.id).errors.join(' '),/title was changed/);a.deepEqual(f.deleted,[]);
 a.equal(by(create.id).status,'skipped',JSON.stringify(r));a.match(by(create.id).errors.join(' '),/Conflicts with/);}));

// Imports the next calendar read: the written event as Google shows it.
function readBack(s,p){const d=s.snapshot(),h=d.actionHistory.find(x=>x.id===p.id);d.events=[{id:h.remoteRef.slice(p.calendarId.length+1),title:p.title,start:p.start,end:p.end,busy:true,sourceId:'google-calendar',calendarId:p.calendarId,account:p.account}];
 d.generatedAt=new Date().toISOString();d.calendarCoverage={...d.calendarCoverage,checkedAt:d.generatedAt};for(const x of d.sources)x.lastSuccess=d.generatedAt;s.importSnapshot(d);}
test('a written block the new plan places again stays as it is: no removal and no second copy',()=>withStore(async s=>{
 const {p,q}=setup(s),f=fakeGoogle();await GC.writeApproved(s,q.reference,client(f));readBack(s,p);
 const r=s.generatePlan(p.planDate);a.deepEqual(r.blocks.filter(b=>b.title===p.title||b.action==='delete'),[],JSON.stringify(r.blocks.map(b=>[b.title,b.action])));a.equal(s.snapshot().proposals.filter(x=>x.id===p.id).length,1);}));

test('a block the owner edited before approving is never removed by a later plan',()=>withStore(async s=>{
 const {p,q}=setup(s);A.edit(s,p.id,{title:p.title+' (mine)'});const e=s.snapshot().proposals.find(x=>x.id===p.id);a.equal(e.locked,true);a.equal(e.lockedBy,undefined);
 const q2=A.prepare(s,[p.id]);X.approve(s,q2.reference,'student@example.com');const f=fakeGoogle();await GC.writeApproved(s,q2.reference,client(f));readBack(s,e);
 const t=Object.values(s.state().todo).find(x=>x.status==='open');s.completeTodo(t.id,true);const r=s.generatePlan(p.planDate);
 a.deepEqual(r.blocks.filter(b=>b.action==='delete'),[]);a.equal(s.snapshot().proposals.filter(x=>x.id===p.id).length,1);}));

test('a written block keeps its time while that time stays free, even when an earlier slot opens',()=>withStore(async s=>{
 const {p,q}=setup(s),f=fakeGoogle();await GC.writeApproved(s,q.reference,client(f));readBack(s,p);
 s.savePlanSettings({...PL.planSettings(PL.RECOMMENDED),dayStart:'07:00'});const r=s.generatePlan(p.planDate);
 a.deepEqual(r.blocks.filter(b=>b.title===p.title||b.action==='delete'),[],JSON.stringify(r.blocks.map(b=>[b.title,b.action,b.start])));}));

test('skipping a removal keeps that written block: later plans leave it and its time alone, and a removal cannot be edited',()=>withStore(async s=>{
 const {p,q}=setup(s),f=fakeGoogle();await GC.writeApproved(s,q.reference,client(f));const {removal}=rewritten(s,f,p);
 a.throws(()=>A.edit(s,removal.id,{title:'x'}),/cannot be edited/);s.saveState('dismissed',removal.id,true);
 const r=s.generatePlan(p.planDate);a.deepEqual(r.blocks.filter(b=>b.action==='delete'),[]);
 a.ok(!r.blocks.some(b=>b.action!=='delete'&&Date.parse(b.start)<Date.parse(p.end)&&Date.parse(p.start)<Date.parse(b.end)),'nothing over the kept block');
 a.ok(r.unscheduled.some(u=>u.title==='Synthetic reading notes'&&u.group==='action'),'the new todo, due at 10:00, is listed as not fitting');}));

test('a longer todo keeps its written block and adds the missing minutes; other work avoids written time while it can',()=>withStore(async s=>{
 const {p,q}=setup(s),f=fakeGoogle();await GC.writeApproved(s,q.reference,client(f));readBack(s,p);
 const t=Object.values(s.state().todo).find(x=>x.status==='open');s.saveTodo({...t,durationMinutes:90});
 s.saveTodo({title:'Synthetic reading notes',dueAt:C.zonedISO(p.planDate,'20:00'),durationMinutes:60});const r=s.generatePlan(p.planDate);
 a.deepEqual(r.blocks.filter(b=>b.action==='delete'),[],JSON.stringify(r.blocks.map(b=>[b.title,b.action,b.start])));
 const mine=r.blocks.filter(b=>b.sourceRefs?.some(x=>x.kind==='todo')),over=b=>Date.parse(b.start)<Date.parse(p.end)&&Date.parse(p.start)<Date.parse(b.end);
 a.ok(mine.length>=2&&mine.every(b=>!over(b)),'new blocks go around the written hour');}));

test('a removal is refused unless it names a written, unstarted block by its own event reference',()=>withStore(async s=>{
 const {p,q}=setup(s),P=require('../src/phase2.cjs'),f=fakeGoogle();
 const rm=(x)=>({...p,id:'plan-'+p.planDate+'-rm-test',action:'delete',replaces:p.id,remoteRef:p.calendarId+'/evt1',body:'',source:'',sourceRefs:undefined,...x});
 a.ok(P.errors(rm(),s.snapshot(),new Date(),[]).length,'not written yet');
 await GC.writeApproved(s,q.reference,client(f));const d=s.snapshot();
 a.deepEqual(P.errors(rm(),d,new Date(),[]),[]);
 a.ok(P.errors(rm({remoteRef:p.calendarId+'/evt9'}),d,new Date(),[]).length,'another event');
 a.ok(P.errors(rm({start:new Date(Date.parse(p.start)+60000).toISOString()}),d,new Date(),[]).length,'another time');
 a.ok(P.errors(rm(),d,new Date(Date.parse(p.start)+60000),[]).length,'already started');}));
