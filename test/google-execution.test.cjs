const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const C=require('../src/core.cjs'),P=require('../src/phase2.cjs'),PL=require('../src/planner.cjs'),A=require('../src/approvals.cjs'),G=require('../src/google.cjs'),{Store}=require('../src/store.cjs'),{createServer}=require('../src/server.cjs');
const TZ='America/New_York';
// The connected create tool's declared argument names and a fictional event in its read shape (no account data).
const ARGS=require('./fixtures/google-connector-create-args.json').arguments,SAMPLE=require('./fixtures/google-connector-read-event.json').event;
// Fictional Google snapshot relative to the real clock, a todo and a generated plan; returns the todo's focus block.
function setup(s){C.configure(TZ);const real=Date.now(),today=C.dayKey(real),tomorrow=PL.nextDay(today),d=structuredClone(require('../examples/google-snapshot.json'));
 d.generatedAt=new Date(real-60000).toISOString();d.calendarCoverage={...d.calendarCoverage,start:C.zonedISO(today,'00:00'),end:C.zonedISO(PL.nextDay(PL.nextDay(tomorrow)),'00:00'),checkedAt:d.generatedAt};
 d.events=[];d.proposals=[];d.assignments=[];d.email={enabled:false};for(const x of d.sources)x.lastSuccess=d.generatedAt;s.importSnapshot(d);
 const t=s.saveTodo({title:'Synthetic essay plan',dueAt:null,durationMinutes:60}).todo;s.generatePlan(tomorrow);const p=s.snapshot().proposals.find(x=>x.sourceRefs?.[0]?.id===t.id);
 const q=A.prepare(s,[p.id]);return {d:s.snapshot(),p,q,t,tomorrow,k:G.key(s.storeId(),p)};}
const ok=q=>({channel:'chat',text:'Approve '+q.reference,at:new Date().toISOString()});
// Connector-style instants carry a local offset; only the instant matters.
const offset=x=>new Date(Date.parse(x)-4*3600000).toISOString().replace(/\.\d+Z$/,'-04:00');
// A live re-read: one complete read per queried calendar. `events` maps calendar ID to raw connector events.
const liveRead=(d,p,{events={},...extra}={})=>({checkedAt:new Date().toISOString(),provider:'google',account:p.account,start:new Date(Date.parse(p.start)-3600000).toISOString(),end:new Date(Date.parse(p.end)+3600000).toISOString(),
 reads:d.calendarCoverage.calendars.map(c=>({calendarId:c.id,complete:true,events:events[c.id]||[]})),...extra});
const saved=(p,k,extra={})=>({...structuredClone(SAMPLE),id:'evt'+k.slice(2,12),summary:p.title,description:G.description(p,k),start:offset(p.start),end:offset(p.end),location:'',reminders:{use_default:false,overrides:[{method:'popup',minutes:p.reminderMinutes}]},...extra});
const back=(p,ev,extra={})=>({calendarId:p.calendarId,account:p.account,event:ev,...extra});
const withStore=fn=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-gexec-')),s=new Store(dir);try{return fn(s,dir);}finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}};

test('connector profile: the exact create arguments use only declared tool arguments, with no attendees, meeting, recurrence or unsupported fields',()=>withStore(s=>{
 const {d,p,k}=setup(s),m=G.toConnector(p,k);
 a.deepEqual(m,{calendar_id:p.calendarId,title:p.title,description:p.body+'\n\nDayweave action: '+p.id+' · key '+k,start_time:p.start,end_time:p.end,timezone_str:TZ,attendees:[],add_google_meet:false,event_type:'default',transparency:'opaque',reminders:{use_default:false,overrides:[{method:'popup',minutes:10}]}});
 a.ok(Object.keys(m).every(x=>ARGS.includes(x)),'every argument is declared by the actual tool');
 for(const x of ['sendUpdates','send_updates','id','extendedProperties','recurrence','start_date','end_date','visibility','auto_decline_mode','color_id','guests_can_modify'])a.equal(x in m,false,x);
 a.deepEqual(G.PROFILE.unsupported,['sendUpdates','client event ID','extendedProperties']);a.deepEqual(G.PROFILE.sends.filter(x=>!ARGS.includes(x)),[],'the profile claims nothing the tool lacks');
 a.match(k,/^d0[0-9a-f]{30}$/);a.equal(G.key(s.storeId(),p),k,'deterministic');a.notEqual(G.key('another-store',p),k,'bound to the store');
 a.deepEqual(G.actionErrors(p,d),[]);a.deepEqual(G.toConnector({...p,location:'Library',busy:false},k).location,'Library');a.equal(G.toConnector({...p,busy:false},k).transparency,'transparent');
 for(const [edit,re] of [[{action:'update',remoteRef:'x',before:{}},/Only new personal events/],[{recurrence:{frequency:'daily',interval:1,count:3}},/Recurring/],[{attendees:['someone@example.com']},/Attendees/],[{calendarId:'course-schedule@example.com'},/owner access/],[{provider:undefined},/Not a Google/]])a.match(G.actionErrors({...p,...edit},d).join(' '),re);
 a.match(P.errors({...p,action:'update'},d).join(' '),/only create new personal events/);a.match(P.errors({...p,recurrence:{frequency:'daily',interval:1,count:2}},d).join(' '),/one-time events/);
 a.equal(P.spec(p).sourceRefs[0].kind,'todo');a.notEqual(P.fingerprint(p),P.fingerprint({...p,sourceRefs:[{kind:'todo',id:'other',version:1}]}),'source task refs are part of the fingerprint');
 a.deepEqual(G.required({...p,location:'Library'}).slice(-1),['location'],'a non-empty location must be settable');
}));

test('verify passes with the actual tool arguments and blocks a missing one; approval must be exactly "Approve Q-N" from chat, never a negation',()=>withStore(s=>{
 const {p,q}=setup(s),go=G.verify(s,q.reference,ok(q),ARGS);a.equal(go.go,true,JSON.stringify(go));a.equal(go.actions[0].request.title,p.title);a.deepEqual(go.actions[0].sourceRefs,p.sourceRefs);a.equal(go.actions[0].tool,'google_calendar_create_event');
 const n=Number(q.reference.slice(2)),R=q.reference;
 for(const text of ['Approve '+R,'approve '+R.toLowerCase(),'  APPROVE '+R+'. ','Approve '+R+'!'])a.equal(G.verify(s,R,{...ok(q),text},ARGS).go,true,text);
 for(const text of ['Do not approve '+R,'I don\'t approve '+R+' yet','approve '+R+'? no','Approve '+R+' and Q-'+(n+1),'Approve '+R+' but move it to 3pm','Approve Q-'+(n+10),'approve '+R+'0','Looks fine','Approve '+R+' later','Not now. Approve '+R]){
  const v=G.verify(s,R,{...ok(q),text},ARGS);a.equal(v.go,false,text);a.match(v.blockers.join(' '),/must be exactly/,text);}
 for(const [ap,re] of [[undefined,/Record the human chat approval/],['Approve '+R,/Record the human chat approval/],[{...ok(q),channel:'web'},/own chat message/],[{...ok(q),at:'2020-01-01T00:00:00Z'},/after the version was prepared/],[{...ok(q),at:new Date(Date.now()+3600000).toISOString()},/not in the future/]]){
  const v=G.verify(s,R,ap,ARGS);a.equal(v.go,false);a.match(v.blockers.join(' '),re);}
 a.match(G.verify(s,R,ok(q),undefined).blockers.join(' '),/declared argument names/);
 for(const drop of ['reminders','transparency','attendees','add_google_meet','event_type','timezone_str']){const v=G.verify(s,R,ok(q),ARGS.filter(f=>f!==drop));a.equal(v.go,false,drop);a.match(v.actions[0].errors.join(' '),new RegExp('cannot set approved fields \\('+drop+'\\)\\. Stop rather than drop them'));}
 a.deepEqual(G.verify(s,R,ok(q),[...ARGS,'sendUpdates','id']).actions[0].request,go.actions[0].request,'extra declared arguments are never used');
 A.edit(s,p.id,{title:'Changed after approval'});const v=G.verify(s,R,ok(q),ARGS);a.equal(v.go,false);a.match(v.blockers.join(' '),/invalidated/);a.match(v.actions[0].errors.join(' '),/changed since this version was prepared/);
}));

test('the live re-read is per queried calendar, fresh, complete and same identity; unreadable times and unexpanded series fail closed',()=>withStore(s=>{
 const {d,p,q,k}=setup(s),r=x=>G.recheck(s,q.reference,p.id,liveRead(d,p,x)),dest=p.calendarId,other='course-schedule@example.com';a.equal(r({}).go,true,JSON.stringify(r({})));
 const at=(h,m=0)=>offset(new Date(Date.parse(p.start)+h*3600000+m*60000).toISOString()),ev=(id,extra)=>({...structuredClone(SAMPLE),id,summary:id,description:'',start:at(0,30),end:at(2),...extra});
 const blocked=[[{checkedAt:new Date(Date.now()-16*60000).toISOString()},/15 minutes/],[{account:'other@example.com'},/different provider or account/],[{start:new Date(Date.parse(p.start)+600000).toISOString()},/does not cover/],
  [{reads:[{calendarId:dest,complete:true,events:[]}]},/every calendar/],[{reads:undefined},/needs reads/],[{reads:[{calendarId:dest,complete:true,events:[]},{calendarId:dest,complete:true,events:[]},{calendarId:other,complete:true,events:[]}]},/once/],
  [{reads:[{complete:true,events:[]},{calendarId:dest,complete:true,events:[]},{calendarId:other,complete:true,events:[]}]},/its own queried calendarId/],
  [{reads:[{calendarId:dest,complete:true,events:[]},{calendarId:other,complete:false,events:[]}]},/read of course-schedule@example\.com is incomplete/],
  [{events:{[other]:[ev('class')]}},/Conflicts with class \(course-schedule@example\.com\)/],
  [{events:{[other]:[ev('holiday',{start:C.dayKey(p.start),end:PL.nextDay(C.dayKey(p.start))})]}},/Conflicts with holiday/],
  [{events:{[other]:[ev('nooffset',{start:'2026-10-13T09:00:00',end:'2026-10-13T10:00:00'})]}},/nooffset .* cannot be read/],
  [{events:{[other]:[ev('rest',{start:{dateTime:p.start},end:{dateTime:p.end}})]}},/rest .* cannot be read/],
  [{events:{[other]:[ev('baddate',{start:'2026-10-13',end:at(1)})]}},/baddate .* cannot be read/],
  [{events:{[other]:[ev('backwards',{start:at(2),end:at(1)})]}},/backwards .* cannot be read/],
  [{events:{[other]:[ev('series',{recurrence:['RRULE:FREQ=WEEKLY'],start:at(-30),end:at(-29)})]}},/unexpanded recurring series/],
  [{events:{[other]:['junk']}},/not an object/],
  [{events:{[dest]:[ev('marked',{description:'Dayweave action: '+p.id+' · key '+k,start:at(5),end:at(6)})]}},/already exists on the destination \(marked\)/],
  [{events:{[dest]:[ev('same',{summary:p.title,start:offset(p.start),end:offset(p.end)})]}},/already exists on the destination \(same\)/],
  [{events:{[other]:[ev('elsewhere',{description:'Dayweave action: '+p.id+' · key '+k,start:at(5),end:at(6)})]}},/marker is on another calendar \(course-schedule@example\.com\/elsewhere\)/]];
 for(const [x,re] of blocked){const v=r(x);a.equal(v.go,false,JSON.stringify(x).slice(0,80));a.match(v.errors.join(' '),re);}
 const lookalike=r({events:{[other]:[ev('copy',{summary:p.title,start:offset(p.start),end:offset(p.end)})]}});a.deepEqual(lookalike.duplicates,[]);a.deepEqual(lookalike.conflicts,[other+'/copy'],'the same title and time on another busy calendar is a conflict, not a duplicate');
 a.equal(r({events:{[other]:[ev('free',{transparency:'transparent',start:offset(p.start),end:offset(p.end)}),ev('gone',{status:'cancelled',start:'garbage'}),ev('adj',{start:offset(p.end),end:at(3)}),ev('occurrence',{recurring_event_id:'series-1',start:at(4),end:at(5)})]}}).go,true,'free, cancelled, adjacent and expanded occurrences do not block');
 a.equal(r({events:{[dest]:[ev('similar',{description:'Dayweave action: '+p.id+'2 · key x',start:at(5),end:at(6)})]}}).go,true,'another action ID that merely starts the same is not this marker');
}));

test('pending is recorded only after verify and recheck pass; it freezes the target, source refs, store and key; no second attempt',()=>withStore(s=>{
 const {d,p,q,k}=setup(s);
 a.throws(()=>G.pending(s,q.reference,p.id,ok(q),ARGS,liveRead(d,p,{reads:[]})),/Do not write: .*every calendar/);a.equal(s.snapshot().actionHistory.length,0);
 a.throws(()=>A.record(s,{reference:q.reference,id:p.id,status:'pending',recordedAt:new Date().toISOString(),humanApproval:'Approve '+q.reference}),/human chat approval/,'a bare string is not enough for Google');
 a.throws(()=>A.record(s,{reference:q.reference,id:p.id,status:'pending',recordedAt:new Date().toISOString(),humanApproval:{...ok(q),text:'Do not approve '+q.reference}}),/must be exactly/);
 a.throws(()=>A.record(s,{reference:q.reference,id:p.id,status:'executed',recordedAt:new Date().toISOString(),verifiedAt:new Date().toISOString(),remoteRef:'x/y',evidence:'forged'}),/recorded only with scripts\/google-calendar\.cjs/,'outcomes come only from the bridge read-back or reconcile');
 const r=G.pending(s,q.reference,p.id,ok(q),ARGS,liveRead(d,p));a.equal(r.status,'pending');a.deepEqual(r.write,G.toConnector(p,k));a.equal(r.tool,'google_calendar_create_event');
 const h=s.snapshot().actionHistory.find(x=>x.id===p.id);
 a.deepEqual({status:h.status,reference:h.reference,provider:h.provider,account:h.account,calendarId:h.calendarId,sourceRefs:h.sourceRefs,minutes:h.minutes,key:h.idempotencyKey,store:h.store,fingerprint:h.fingerprint,connector:h.connector},{status:'pending',reference:q.reference,provider:'google',account:p.account,calendarId:p.calendarId,sourceRefs:p.sourceRefs,minutes:60,key:k,store:s.storeId(),fingerprint:P.fingerprint(p),connector:'google-calendar-connector'});
 a.equal('fieldsUsed' in h,false);a.equal(h.humanApproval.text,'Approve '+q.reference);a.equal(A.read(s,q.reference).status,'pending');
 a.throws(()=>G.pending(s,q.reference,p.id,ok(q),ARGS,liveRead(d,p)),/Do not write: .*already attempted/,'no blind retry');
 a.throws(()=>A.record(s,{reference:q.reference,id:p.id,status:'pending',recordedAt:new Date().toISOString(),humanApproval:ok(q)}),/no longer executable|Reconcile/,'a second claim is rejected');
}));

test('read-back compares the raw connector shape and the queried calendar; any difference is unverified and kept',()=>withStore(s=>{
 const {d,p,q,k}=setup(s);a.throws(()=>G.readback(s,q.reference,p.id,back(p,saved(p,k))),/Record pending before a read-back/);G.pending(s,q.reference,p.id,ok(q),ARGS,liveRead(d,p));
 const mism=(x,ctx={})=>[...G.compare(p,k,saved(p,k,x))].join(' ');a.equal(mism({}),'');
 for(const [x,re] of [[{reminders:{use_default:true,overrides:null}},/reminder/],[{reminders:{useDefault:false,overrides:[{method:'popup',minutes:10}]}},/reminder/],[{reminders:{use_default:false,overrides:[{method:'email',minutes:10}]}},/reminder/],
  [{attendees:['guest@example.com']},/attendees present/],[{hangout_link:'https://meet.example.com/x'},/online meeting/],[{recurring_event_id:'series'},/recurrence present/],[{recurrence:['RRULE:FREQ=DAILY']},/recurrence present/],
  [{event_type:'focusTime'},/event type focusTime/],[{organizer:{is_self:false,email:'someone@example.com'}},/organizer/],[{organizer:undefined},/organizer/],[{description:p.body},/description/],[{start:{dateTime:p.start}},/start time/],
  [{start:offset(new Date(Date.parse(p.start)+60000).toISOString())},/start time/],[{transparency:'transparent'},/busy state/],[{summary:'Other'},/summary/],[{status:'cancelled'},/cancelled/],[{id:''},/remote event ID/],[{location:'Elsewhere'},/location/]])
  a.match(mism(x),re,JSON.stringify(x));
 a.equal(mism({attendees:null,recurrence:null,hangout_link:null,transparency:undefined}),'','null attendees/recurrence/meeting and default transparency are fine');
 a.match(G.readback(s,q.reference,p.id,back(p,saved(p,k),{account:'other@example.com'})).mismatches.join(' '),/different or unknown account/);
 const bad=G.readback(s,q.reference,p.id,back(p,saved(p,k,{location:'Somewhere else'})));a.equal(bad.status,'unverified');a.match(s.snapshot().actionHistory[0].evidence,/location differs.*Human resolution required/);a.equal(A.read(s,q.reference).status,'unverified');
 const good=G.readback(s,q.reference,p.id,back(p,saved(p,k)));a.equal(good.status,'executed',JSON.stringify(good));const h=s.snapshot().actionHistory[0];
 a.equal(h.remoteRef,p.calendarId+'/'+saved(p,k).id);a.ok(h.verifiedAt);a.match(h.evidence,/the compared approved fields matched.*Other returned fields were not compared/);a.deepEqual(h.attempts.map(x=>x.status),['pending','unverified','unverified']);
 a.equal(h.humanApproval.text,'Approve '+q.reference,'approval evidence survives later states');a.equal(h.idempotencyKey,k);a.deepEqual(h.sourceRefs,p.sourceRefs);
 a.equal(A.read(s,q.reference).status,'executed');a.throws(()=>G.readback(s,q.reference,p.id,back(p,saved(p,k))),/current: executed/);
 // A marked event read from another calendar keeps that calendar in its reference and is a different event (calendar and ID)
 // from the destination copy with the same ID, so the destination copy can no longer be read back directly.
 withStore(s2=>{const {d,p,q,k}=setup(s2);G.pending(s2,q.reference,p.id,ok(q),ARGS,liveRead(d,p));
  const wrongCal=G.readback(s2,q.reference,p.id,back(p,saved(p,k),{calendarId:'course-schedule@example.com'}));a.equal(wrongCal.status,'unverified');a.match(wrongCal.mismatches.join(' '),/read from calendar course-schedule/);
  const h=s2.snapshot().actionHistory[0];a.equal(h.remoteRef,'course-schedule@example.com/'+saved(p,k).id,'the remote reference names the calendar actually read, never the target');a.deepEqual(h.holdScope.matches,['course-schedule@example.com/'+saved(p,k).id]);
  a.throws(()=>G.readback(s2,q.reference,p.id,back(p,saved(p,k))),/was seen earlier for this action/);a.equal(s2.snapshot().actionHistory[0].status,'unverified');});
}));

// A search wide enough to conclude absence: at least 24 hours on each side of the action.
const wide=(d,p,extra={})=>liveRead(d,p,{start:new Date(Date.parse(p.start)-25*3600000).toISOString(),end:new Date(Date.parse(p.end)+25*3600000).toISOString(),...extra});
test('reconciliation never invents provenance: unknown, other-calendar and unmarked outcomes stay unverified; absence needs a complete search 24 hours either side',()=>withStore(s=>{
 const {d,p,q,k}=setup(s),dest=p.calendarId,other='course-schedule@example.com';G.pending(s,q.reference,p.id,ok(q),ARGS,liveRead(d,p));
 let r=G.reconcile(s,q.reference,p.id,liveRead(d,p,{reads:[{calendarId:dest,complete:false,events:[]},{calendarId:other,complete:true,events:[]}]}));a.equal(r.conclusion,'unknown');a.equal(s.snapshot().actionHistory[0].status,'unverified');
 r=G.reconcile(s,q.reference,p.id,liveRead(d,p,{events:{[dest]:[saved(p,k,{id:'look',description:p.body})]}}));a.equal(r.conclusion,'unmarked');
 // A complete read of only the action interval says nothing about the rest of the day: no absence, no retry.
 r=G.reconcile(s,q.reference,p.id,liveRead(d,p));a.equal(r.status,'unverified');a.equal(r.conclusion,'unknown');a.match(s.snapshot().actionHistory[0].evidence,/at least 24 hours before to 24 hours after/);
 r=G.reconcile(s,q.reference,p.id,wide(d,p));a.equal(r.status,'not_created');a.match(r.conclusion,/absent in the searched window/);
 a.match(s.snapshot().actionHistory[0].evidence,/found no event with this action marker in that window/);a.equal(A.read(s,q.reference).status,'failed');
 a.throws(()=>G.pending(s,q.reference,p.id,ok(q),ARGS,liveRead(d,p)),/failed and cannot be executed/,'a retry needs a new approved version');
 const q2=A.prepare(s,[p.id]);a.notEqual(q2.reference,q.reference);G.pending(s,q2.reference,p.id,ok(q2),ARGS,liveRead(d,p));
 r=G.reconcile(s,q2.reference,p.id,liveRead(d,p,{events:{[other]:[saved(p,k,{id:'wrong'})]}}));a.equal(r.status,'unverified');a.equal(r.conclusion,'other-calendar');a.deepEqual(r.matches,[other+'/wrong']);
 a.equal(s.snapshot().actionHistory[0].remoteRef,undefined,'no target reference is invented for an event on another calendar');
 // The marker seen on another calendar exists: a later empty search, even 24 hours either side, is not absence.
 r=G.reconcile(s,q2.reference,p.id,wide(d,p));a.equal(r.status,'unverified');a.equal(r.conclusion,'unknown');a.match(s.snapshot().actionHistory[0].evidence,/course-schedule@example\.com\/wrong was seen earlier/);
 r=G.reconcile(s,q2.reference,p.id,liveRead(d,p,{events:{[dest]:[saved(p,k)]}}));a.equal(r.status,'unverified','a narrow single match does not clear the earlier other-calendar marker');a.equal(r.hold,'ambiguous');
 r=G.reconcile(s,q2.reference,p.id,wide(d,p,{events:{[dest]:[saved(p,k)]}}));a.equal(r.status,'executed');a.equal(r.conclusion,'one match read back');a.equal(s.snapshot().actionHistory[0].remoteRef,dest+'/'+saved(p,k).id);
}));

test('an ambiguous outcome stays held until a complete reconcile finds exactly one marked event; unknown, unmarked or empty reads never clear it',()=>withStore(s=>{
 const {d,p,q,k}=setup(s),dest=p.calendarId,other='course-schedule@example.com',h=()=>s.snapshot().actionHistory[0];G.pending(s,q.reference,p.id,ok(q),ARGS,liveRead(d,p));
 let r=G.reconcile(s,q.reference,p.id,liveRead(d,p,{events:{[dest]:[saved(p,k,{id:'a1'}),saved(p,k,{id:'a2'})]}}));a.equal(r.conclusion,'ambiguous');a.deepEqual(r.matches,['a1','a2']);
 a.throws(()=>G.readback(s,q.reference,p.id,back(p,saved(p,k,{id:'a1'}))),/Several matching events/,'an ambiguous outcome cannot be read back into executed');
 // Review repro: an incomplete (unknown) reconcile, then a direct read-back of a1, must not reach executed.
 r=G.reconcile(s,q.reference,p.id,liveRead(d,p,{reads:[{calendarId:dest,complete:false,events:[]},{calendarId:other,complete:true,events:[]}]}));a.equal(r.conclusion,'unknown');a.equal(r.hold,'ambiguous');a.equal(h().hold,'ambiguous');
 a.throws(()=>G.readback(s,q.reference,p.id,back(p,saved(p,k,{id:'a1'}))),/Several matching events/,'still held after an unknown reconcile');
 r=G.reconcile(s,q.reference,p.id,liveRead(d,p,{events:{[dest]:[saved(p,k,{id:'look',description:p.body})]}}));a.equal(r.conclusion,'unmarked');a.equal(h().hold,'ambiguous');
 r=G.reconcile(s,q.reference,p.id,wide(d,p));a.equal(r.status,'unverified','a later empty read does not turn earlier duplicates into not_created');a.equal(r.conclusion,'ambiguous');
 a.equal(A.read(s,q.reference).status,'unverified');a.throws(()=>G.readback(s,q.reference,p.id,back(p,saved(p,k,{id:'a1'}))),/Several matching events/);
 r=G.reconcile(s,q.reference,p.id,liveRead(d,p,{events:{[dest]:[saved(p,k,{id:'a1'})]}}));a.equal(r.status,'unverified','a narrow single match does not clear the hold');a.equal(h().hold,'ambiguous');
 r=G.reconcile(s,q.reference,p.id,wide(d,p,{events:{[dest]:[saved(p,k,{id:'a1'})]}}));a.equal(r.status,'executed');a.equal(r.conclusion,'one match read back');a.equal(h().remoteRef,dest+'/a1');a.equal(h().hold,undefined);
}));

test('a not-created action in a multi-action version needs a newly approved version, even while another action of it is pending',()=>withStore(s=>{
 const {tomorrow}=setup(s);s.saveTodo({title:'Second synthetic task',dueAt:null,durationMinutes:30});s.generatePlan(tomorrow);
 const d=s.snapshot(),[x,y]=d.proposals.filter(p=>p.origin==='planner'&&p.planDate===tomorrow);a.ok(x&&y);const q=A.prepare(s,[x.id,y.id]);
 G.pending(s,q.reference,x.id,ok(q),ARGS,liveRead(d,x));G.pending(s,q.reference,y.id,ok(q),ARGS,liveRead(d,y));
 a.equal(G.reconcile(s,q.reference,x.id,wide(d,x)).status,'not_created');a.equal(A.read(s,q.reference).status,'pending','the other action keeps the version pending');
 a.throws(()=>G.pending(s,q.reference,x.id,ok(q),ARGS,liveRead(d,x)),/newly prepared and approved version/,'no retry under the old version');
 a.throws(()=>A.record(s,{reference:q.reference,id:x.id,status:'pending',recordedAt:new Date().toISOString(),humanApproval:ok(q)}),/newly prepared and approved version/);
 a.match(G.verify(s,q.reference,ok(q),ARGS).actions.find(v=>v.id===x.id).errors.join(' '),/newly prepared and approved version/);
 const q2=A.prepare(s,[x.id]);G.pending(s,q2.reference,x.id,ok(q2),ARGS,liveRead(d,x));a.equal(s.snapshot().actionHistory.find(h=>h.id===x.id).reference,q2.reference,'a new exact version may retry');
}));

test('restore keeps the logical store identity and the frozen pending key; new prepared versions stay invalidated; another store is rejected',()=>withStore(s=>{
 const {d,p,q,k,t,tomorrow}=setup(s);const early=s.backups()[0];a.ok(early,'the import made a backup before any store ID existed');
 const before=s.storeId();G.pending(s,q.reference,p.id,ok(q),ARGS,liveRead(d,p));
 const t2=s.saveTodo({title:'Second synthetic task',dueAt:null,durationMinutes:30}).todo;s.generatePlan(tomorrow);const p2=s.snapshot().proposals.find(x=>x.sourceRefs?.[0]?.id===t2.id),q2=A.prepare(s,[p2.id]);a.equal(q2.status,'prepared');
 s.restore(early);a.equal(s.storeId(),before,'restore keeps the store ID');const h=s.snapshot().actionHistory.find(x=>x.id===p.id);a.equal(h.idempotencyKey,k);a.equal(h.store,before);
 a.equal(A.read(s,q2.reference).status,'invalidated','a prepared version stays invalidated after restore');
 const restored=s.snapshot().proposals.find(x=>x.id===p.id);a.ok(restored,'the started block is back from its approval copy');a.equal(P.fingerprint(restored),h.fingerprint);
 // A receipt recorded in another database cannot be completed here, and nothing is recomputed from the current store.
 s.db.prepare("UPDATE meta SET value='another-store' WHERE key='storeId'").run();a.throws(()=>G.readback(s,q.reference,p.id,back(p,saved(p,k))),/another database/);
 s.db.prepare("UPDATE meta SET value=? WHERE key='storeId'").run(before);
 const r=G.readback(s,q.reference,p.id,back(p,saved(p,k)));a.equal(r.status,'executed',JSON.stringify(r));a.equal(s.snapshot().actionHistory.find(x=>x.id===p.id).idempotencyKey,k);
 a.equal(t.status,'open','nothing marked the todo done');
}));

test('executed receipts keep covering their todo after the proposal leaves the snapshot; no web route can execute or record',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-gexec-web-')),srv=A.attach(createServer(dir));await new Promise(r=>srv.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+srv.address().port,s=srv.store;
 try{const {d,p,q,k,tomorrow,t}=setup(s);G.pending(s,q.reference,p.id,ok(q),ARGS,liveRead(d,p));G.readback(s,q.reference,p.id,back(p,saved(p,k)));
  const failed=structuredClone(s.snapshot());failed.sources.find(x=>x.id==='google-calendar').status='failed';s.importSnapshot(failed);
  a.deepEqual(s.snapshot().proposals.map(x=>x.id),[p.id],'only the executed block stays, as a non-actionable protection');a.ok(P.errors(s.snapshot().proposals[0],s.snapshot()).length);
  const raw=s.snapshot();raw.proposals=[];s.writeSnapshot(raw);
  const ok2=structuredClone(failed);ok2.sources.find(x=>x.id==='google-calendar').status='ok';ok2.calendarCoverage={...d.calendarCoverage,checkedAt:new Date().toISOString()};ok2.generatedAt=new Date().toISOString();for(const x of ok2.sources)x.lastSuccess=ok2.generatedAt;s.importSnapshot(ok2);
  const plan=s.generatePlan(tomorrow);a.equal(plan.blocks.some(b=>b.sourceRefs[0].id===t.id),false);a.match(plan.unscheduled.find(u=>u.id===t.id).reason,/Already covered by 60 minutes/);
  const session=await fetch(base+'/api/session'),cookie=session.headers.get('set-cookie').split(';')[0],csrf=(await session.json()).csrf,h={Cookie:cookie,'Content-Type':'application/json',Origin:base,'x-dayweave-token':csrf};
  for(const route of ['approvals/execute','approvals/record','receipts','google/write','calendar/events'])a.equal((await fetch(base+'/api/'+route,{method:'POST',headers:h,body:JSON.stringify({reference:q.reference,id:p.id,status:'executed'})})).status,404,route);
  a.equal((await fetch(base+'/api/progress',{method:'POST',headers:h,body:JSON.stringify({kind:'receipts',id:p.id,value:{}})})).status,400);
 }finally{await new Promise(r=>srv.close(r));fs.rmSync(dir,{recursive:true,force:true});}});

test('operator CLI shows the profile, verifies and reports without writing; usage errors exit non-zero',()=>withStore((s,dir)=>{
 const {q,p}=setup(s);s.close();const f=(n,v)=>{const x=path.join(dir,n);fs.writeFileSync(x,JSON.stringify(v));return x;},run=(...args)=>{try{return {code:0,out:execFileSync(process.execPath,['scripts/google-calendar.cjs',...args],{env:{...process.env,DAYWEAVE_DATA_DIR:dir},encoding:'utf8',stdio:'pipe'})};}catch(e){return {code:e.status,out:e.stdout,err:e.stderr};}};
 let r=run('profile');a.equal(r.code,0);a.deepEqual(JSON.parse(r.out).unsupported,['sendUpdates','client event ID','extendedProperties']);
 r=run('verify',q.reference,f('a.json',ok(q)),f('args.json',ARGS));a.equal(r.code,0,r.err);a.equal(JSON.parse(r.out).go,true);
 r=run('verify',q.reference,f('b.json',{...ok(q),text:'Do not approve '+q.reference}),f('args.json',ARGS));a.equal(r.code,1);a.equal(JSON.parse(r.out).go,false);
 r=run('status',q.reference);a.equal(r.code,0);a.equal(JSON.parse(r.out).receipts[0].status,'not attempted');
 r=run('launch');a.equal(r.code,1);a.match(r.err,/Usage/);
 const legacy=(script,...args)=>{try{execFileSync(process.execPath,[script,...args],{env:{...process.env,DAYWEAVE_DATA_DIR:dir},encoding:'utf8',stdio:'pipe'});return {code:0,err:''};}catch(e){return {code:e.status,err:e.stderr};}};
 for(const status of ['pending','executed']){r=legacy('scripts/approval.cjs','record',f('legacy-'+status+'.json',{reference:q.reference,id:p.id,status,recordedAt:new Date().toISOString(),verifiedAt:new Date().toISOString(),remoteRef:p.calendarId+'/x',evidence:'forged',humanApproval:ok(q)}));
  a.notEqual(r.code,0,status);a.match(r.err,/recorded only with scripts\/google-calendar\.cjs/,'the legacy approval CLI records no Google '+status);}
 fs.writeFileSync(path.join(dir,'data.json'),JSON.stringify({proposals:[{id:'g-1',provider:'google'}],actionHistory:[]}));
 r=legacy('scripts/record-action.cjs',f('legacy-json.json',{id:'g-1',status:'pending',fingerprint:'x',recordedAt:new Date().toISOString()}));a.notEqual(r.code,0);a.match(r.err,/recorded only with scripts\/google-calendar\.cjs/);
 a.equal(JSON.parse(fs.readFileSync(path.join(dir,'data.json'),'utf8')).actionHistory.length,0);
 const again=new Store(dir);try{a.equal(again.snapshot().actionHistory.length,0,'verify and status record nothing');}finally{again.close();}
 s.open();
}));
