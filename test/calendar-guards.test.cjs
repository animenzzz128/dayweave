const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const C=require('../src/core.cjs'),P=require('../src/phase2.cjs'),PL=require('../src/planner.cjs'),A=require('../src/approvals.cjs'),G=require('../src/google.cjs'),{Store}=require('../src/store.cjs');
// Issue #46 regressions: ambiguous-hold scope, not_created version history, imported Google receipts and the Review absence label.
const TZ='America/New_York',H=3600000,ARGS=require('./fixtures/google-connector-create-args.json').arguments,SAMPLE=require('./fixtures/google-connector-read-event.json').event;
const DEST='student@example.com',OTHER='course-schedule@example.com';
// Fictional Google snapshot relative to the real clock with two todo blocks for tomorrow; nothing is prepared yet.
function setup(s){C.configure(TZ);const real=Date.now(),today=C.dayKey(real),tomorrow=PL.nextDay(today),d=structuredClone(require('../examples/google-snapshot.json'));
 d.generatedAt=new Date(real-60000).toISOString();d.calendarCoverage={...d.calendarCoverage,start:C.zonedISO(today,'00:00'),end:C.zonedISO(PL.nextDay(PL.nextDay(tomorrow)),'00:00'),checkedAt:d.generatedAt};
 d.events=[];d.proposals=[];d.assignments=[];d.email={enabled:false};for(const x of d.sources)x.lastSuccess=d.generatedAt;s.importSnapshot(d);
 s.saveTodo({title:'Synthetic reading',dueAt:null,durationMinutes:60});s.saveTodo({title:'Synthetic problem set',dueAt:null,durationMinutes:30});s.generatePlan(tomorrow);
 const [x,y]=s.snapshot().proposals.filter(p=>p.origin==='planner');return {x,y,tomorrow};}
const ok=q=>({channel:'chat',text:'Approve '+q.reference,at:new Date().toISOString()});
const offset=x=>new Date(Date.parse(x)-4*H).toISOString().replace(/\.\d+Z$/,'-04:00');
// A live re-read `before`/`after` hours around the action, one complete read per coverage calendar (plus `extra` calendars).
const read=(s,p,{before=1,after=1,events={},extra=[],complete=true}={})=>({checkedAt:new Date().toISOString(),provider:'google',account:p.account,start:new Date(Date.parse(p.start)-before*H).toISOString(),end:new Date(Date.parse(p.end)+after*H).toISOString(),
 reads:[...s.snapshot().calendarCoverage.calendars.map(c=>c.id),...extra].map(id=>({calendarId:id,complete:id===DEST?complete:true,events:events[id]||[]}))});
const marked=(p,k,id,shiftH=0)=>({...structuredClone(SAMPLE),id,summary:p.title,description:G.description(p,k),start:offset(new Date(Date.parse(p.start)+shiftH*H).toISOString()),end:offset(new Date(Date.parse(p.end)+shiftH*H).toISOString()),location:'',color_id:p.color??null,reminders:{use_default:false,overrides:[{method:'popup',minutes:p.reminderMinutes}]}});
const withStore=fn=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-guards-')),s=new Store(dir);try{return fn(s,dir);}finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}};
const receipt=(s,id)=>s.snapshot().actionHistory.find(h=>h.id===id);
// Started one action under a fresh exact version.
function start(s,ids,id){const q=A.prepare(s,ids),p=q.value.find(v=>v.id===id);G.pending(s,q.reference,id,ok(q),ARGS,read(s,p));return {q,p,k:receipt(s,id).idempotencyKey};}

// Item 1: an ambiguous hold is cleared only by a complete single-match reconcile covering the earlier ambiguous range.
test('item1: a narrow complete single-match search cannot clear an ambiguous hold; a covering one can',()=>withStore(s=>{
 const {x}=setup(s),{q,p,k}=start(s,[x.id],x.id),R=q.reference;
 // A second marked event 20 hours later was found by a wide search; a search of only the action interval misses it.
 let r=G.reconcile(s,R,p.id,read(s,p,{before:25,after:25,events:{[DEST]:[marked(p,k,'a1'),marked(p,k,'a2',20)]}}));a.equal(r.conclusion,'ambiguous');
 const scope=receipt(s,p.id).holdScope;a.ok(scope,'the hold records where duplicates were found');a.deepEqual(scope.matches,[DEST+'/a1',DEST+'/a2']);a.deepEqual(scope.calendars,[OTHER,DEST].sort());
 r=G.reconcile(s,R,p.id,read(s,p,{events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'unverified','a narrow complete search hides the second match');a.equal(r.conclusion,'ambiguous');
 a.equal(receipt(s,p.id).hold,'ambiguous');a.deepEqual(receipt(s,p.id).holdScope,scope,'the scope survives');a.match(receipt(s,p.id).evidence,/does not rule out another one/);
 a.throws(()=>G.readback(s,R,p.id,{calendarId:DEST,account:p.account,event:marked(p,k,'a1')}),/Several matching events/,'no direct read-back');
 r=G.reconcile(s,R,p.id,read(s,p,{before:24,after:24,events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'unverified','24 hours misses the earlier 25-hour window');
 r=G.reconcile(s,R,p.id,read(s,p,{before:25,after:25,events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'executed','a complete search covering the earlier window clears it');a.equal(receipt(s,p.id).hold,undefined);a.equal(receipt(s,p.id).remoteRef,DEST+'/a1');
 a.ok(receipt(s,p.id).attempts.some(x=>x.hold==='ambiguous'&&x.holdScope?.matches.length===2),'the earlier hold and its matches stay in history');
}));

test('item1: the hold scope widens across rounds and names every calendar read; unknown, partial, empty and other-calendar results keep it',()=>withStore(s=>{
 const {x}=setup(s),{q,p,k}=start(s,[x.id],x.id),R=q.reference,EXTRA='extra-calendar@example.com';
 let r=G.reconcile(s,R,p.id,read(s,p,{events:{[DEST]:[marked(p,k,'a1'),marked(p,k,'a2')]}}));a.equal(r.conclusion,'ambiguous');
 r=G.reconcile(s,R,p.id,read(s,p,{before:30,after:30,extra:[EXTRA],events:{[DEST]:[marked(p,k,'a1'),marked(p,k,'a3',27)]}}));a.equal(r.conclusion,'ambiguous');
 const scope=receipt(s,p.id).holdScope;a.equal(Date.parse(scope.start),Date.parse(p.start)-30*H);a.equal(Date.parse(scope.end),Date.parse(p.end)+30*H);a.ok(scope.calendars.includes(EXTRA));a.deepEqual(scope.matches,[DEST+'/a1',DEST+'/a2',DEST+'/a3']);
 // A single marked event seen while held joins the matches (with its calendar); it does not add the search's window.
 for(const [search,re,more] of [[read(s,p,{before:31,after:31,extra:[EXTRA],complete:false,events:{[DEST]:[marked(p,k,'a1')]}}),/unknown/,[]],[read(s,p,{before:31,after:31,extra:[EXTRA],events:{[OTHER]:[marked(p,k,'w1')]}}),/other-calendar/,[OTHER+'/w1']],[read(s,p,{before:31,after:31,extra:[EXTRA]}),/ambiguous/,[]]]){
  r=G.reconcile(s,R,p.id,search);a.equal(r.status,'unverified');a.match(r.conclusion,re);a.equal(receipt(s,p.id).hold,'ambiguous');scope.matches.push(...more);a.deepEqual(receipt(s,p.id).holdScope,scope);}
 r=G.reconcile(s,R,p.id,read(s,p,{before:25,after:25,extra:[EXTRA],events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'unverified','25 hours does not cover the 30-hour round');
 r=G.reconcile(s,R,p.id,read(s,p,{before:31,after:31,events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'unverified','a calendar read in the ambiguous round must be read again');a.match(r.needs.join(' '),/extra-calendar@example\.com/);
 r=G.reconcile(s,R,p.id,read(s,p,{before:30,after:30,extra:[EXTRA],events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'executed',JSON.stringify(r));
}));

test('item1: several marked events also hold when a marker is on another calendar; holds without a recorded scope never clear by themselves',()=>withStore(s=>{
 const {x,y}=setup(s),{q,p,k}=start(s,[x.id,y.id],x.id),R=q.reference;
 let r=G.reconcile(s,R,p.id,read(s,p,{events:{[OTHER]:[marked(p,k,'w1')],[DEST]:[marked(p,k,'a1'),marked(p,k,'a2')]}}));a.equal(r.conclusion,'other-calendar');a.equal(receipt(s,p.id).hold,'ambiguous','several on the destination hold even with a foreign marker');
 r=G.reconcile(s,R,p.id,read(s,p,{events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'unverified');
 // A hold recorded before scopes were kept: its range is unknown, so even 24 hours either side cannot be shown to cover it.
 const t=start(s,[y.id],y.id),h=receipt(s,y.id);s.db.prepare('UPDATE receipts SET value=? WHERE id=?').run(JSON.stringify({...h,status:'unverified',conclusion:'ambiguous',hold:'ambiguous',recordedAt:new Date().toISOString(),evidence:'Multiple matching events (b1, b2).'}),y.id);
 r=G.reconcile(s,t.q.reference,y.id,read(s,t.p,{events:{[DEST]:[marked(t.p,t.k,'b1')]}}));a.equal(r.status,'unverified','legacy hold: narrow search refused');
 r=G.reconcile(s,t.q.reference,y.id,read(s,t.p,{before:24,after:24,events:{[DEST]:[marked(t.p,t.k,'b1')]}}));a.equal(r.status,'unverified','legacy hold: the range is unknown');a.match(r.needs.join(' '),/hold scope is unknown/);
 // With no marked event seen earlier, one marked event in a narrow complete search is still read back as before.
 withStore(s2=>{const {x:x2,y:y2}=setup(s2),u=start(s2,[x2.id],x2.id);a.equal(G.reconcile(s2,u.q.reference,x2.id,read(s2,u.p,{events:{[DEST]:[marked(u.p,u.k,'c1')]}})).status,'executed');
  // An unreadable stored scope fails closed instead of being treated as covered.
  const v=start(s2,[y2.id],y2.id),hv=receipt(s2,y2.id);s2.db.prepare('UPDATE receipts SET value=? WHERE id=?').run(JSON.stringify({...hv,status:'unverified',conclusion:'ambiguous',hold:'ambiguous',holdScope:{start:'garbage',end:null},recordedAt:new Date().toISOString(),evidence:'Multiple matching events.'}),y2.id);
  const w=G.reconcile(s2,v.q.reference,y2.id,read(s2,v.p,{before:48,after:48,events:{[DEST]:[marked(v.p,v.k,'d1')]}}));a.equal(w.status,'unverified');a.match(w.needs.join(' '),/hold scope is unknown/);});
}));

// Item 2: every not_created version stays refused, through later versions, restore and import.
test('item2: Q1 [x,y] -> x not_created; Q2 [x] -> not_created; Q1 still pending for y cannot reopen x; a new version can',()=>withStore(s=>{
 const {x,y}=setup(s),q1=A.prepare(s,[x.id,y.id]);G.pending(s,q1.reference,x.id,ok(q1),ARGS,read(s,x));G.pending(s,q1.reference,y.id,ok(q1),ARGS,read(s,y));
 a.equal(G.reconcile(s,q1.reference,x.id,read(s,x,{before:25,after:25})).status,'not_created');
 const q2=A.prepare(s,[x.id]);G.pending(s,q2.reference,x.id,ok(q2),ARGS,read(s,x));a.equal(G.reconcile(s,q2.reference,x.id,read(s,x,{before:25,after:25})).status,'not_created');
 a.equal(A.read(s,q1.reference).status,'pending','y keeps Q1 pending');a.equal(receipt(s,x.id).reference,q2.reference);
 a.deepEqual(receipt(s,x.id).attempts.filter(h=>h.status==='not_created').map(h=>h.reference),[q1.reference],'Q1 not_created stays in history');
 a.match(G.verify(s,q1.reference,ok(q1),ARGS).actions.find(v=>v.id===x.id).errors.join(' '),/newly prepared and approved version/);
 a.throws(()=>G.pending(s,q1.reference,x.id,ok(q1),ARGS,read(s,x)),/newly prepared and approved version/,'the old Approve Q1 cannot reopen x');
 a.throws(()=>A.record(s,{reference:q1.reference,id:x.id,status:'pending',recordedAt:new Date().toISOString(),humanApproval:ok(q1)}),/newly prepared and approved version/);
 a.throws(()=>G.pending(s,q2.reference,x.id,ok(q2),ARGS,read(s,x)),/failed and cannot be executed|newly prepared/);
 const before=receipt(s,x.id);a.deepEqual({sourceRefs:before.sourceRefs,account:before.account,calendarId:before.calendarId,provider:before.provider},{sourceRefs:x.sourceRefs,account:x.account,calendarId:x.calendarId,provider:'google'},'identity and source IDs survive');
 // More rounds: Q3 also not created; Q1 and Q2 stay refused; a genuinely new Q4 may still be approved explicitly.
 const q3=A.prepare(s,[x.id]);G.pending(s,q3.reference,x.id,ok(q3),ARGS,read(s,x));G.reconcile(s,q3.reference,x.id,read(s,x,{before:25,after:25}));
 for(const q of [q1,q2,q3])a.throws(()=>A.record(s,{reference:q.reference,id:x.id,status:'pending',recordedAt:new Date().toISOString(),humanApproval:ok(q)}),/newly prepared|no longer executable/,q.reference);
 a.deepEqual(receipt(s,x.id).attempts.filter(h=>h.status==='not_created').map(h=>h.reference),[q1.reference,q2.reference]);
 const q4=A.prepare(s,[x.id]);G.pending(s,q4.reference,x.id,ok(q4),ARGS,read(s,x));a.equal(receipt(s,x.id).status,'pending');a.equal(receipt(s,x.id).reference,q4.reference);
 a.equal(receipt(s,y.id).status,'pending','y is untouched');
}));

test('item2: restore and snapshot import keep the full not_created history; earlier states without a version refuse older versions only',()=>withStore(s=>{
 const {x,y}=setup(s),q1=A.prepare(s,[x.id,y.id]);G.pending(s,q1.reference,x.id,ok(q1),ARGS,read(s,x));G.pending(s,q1.reference,y.id,ok(q1),ARGS,read(s,y));
 G.reconcile(s,q1.reference,x.id,read(s,x,{before:25,after:25}));const early=s.backup();
 const q2=A.prepare(s,[x.id]);G.pending(s,q2.reference,x.id,ok(q2),ARGS,read(s,x));G.reconcile(s,q2.reference,x.id,read(s,x,{before:25,after:25}));
 s.restore(early);a.equal(receipt(s,x.id).reference,q2.reference,'restore keeps the current receipts');a.throws(()=>G.pending(s,q1.reference,x.id,ok(q1),ARGS,read(s,x)),/newly prepared and approved version/,'after restore');
 // An import carrying a shortened copy of the receipt cannot rewind the journal.
 const inc=structuredClone(s.snapshot());inc.generatedAt=new Date().toISOString();inc.calendarCoverage.checkedAt=inc.generatedAt;for(const v of inc.sources)v.lastSuccess=inc.generatedAt;
 inc.actionHistory=inc.actionHistory.map(h=>h.id===x.id?{...h,attempts:[]}:h);s.importSnapshot(inc);
 a.equal(receipt(s,x.id).attempts.length>0,true);a.throws(()=>G.pending(s,q1.reference,x.id,ok(q1),ARGS,read(s,x)),/newly prepared and approved version/,'after import');
 // History recorded before versions were kept: an unreferenced not_created refuses versions prepared at or before it.
 const h=receipt(s,x.id),bare={...h,attempts:h.attempts.map(({reference,...rest})=>rest)};s.db.prepare('UPDATE receipts SET value=? WHERE id=?').run(JSON.stringify(bare),x.id);
 a.match(G.verify(s,q1.reference,ok(q1),ARGS).actions.find(v=>v.id===x.id).errors.join(' '),/newly prepared and approved version/,'legacy history still refuses Q1');
 const q3=A.prepare(s,[x.id]);a.deepEqual(G.verify(s,q3.reference,ok(q3),ARGS).actions[0].errors,[],'a version prepared afterwards is new');
}));

// Item 3: snapshot import never adds Google receipts the local bridge did not record.
const refreshed=s=>{const d=structuredClone(s.snapshot());d.generatedAt=new Date().toISOString();d.calendarCoverage.checkedAt=d.generatedAt;for(const v of d.sources)v.lastSuccess=d.generatedAt;return d;};
const forged=(p,extra={})=>({id:p.id,status:'executed',fingerprint:P.fingerprint(p),recordedAt:new Date().toISOString(),verifiedAt:new Date().toISOString(),remoteRef:DEST+'/forged',evidence:'Imported, not read back.',...extra});
test('item3: imports reject Google receipts without a local pending journal, however they are labelled',()=>withStore(s=>{
 const {x,y}=setup(s),q=A.prepare(s,[x.id]);
 for(const [label,h] of [['provider google',forged(x,{provider:'google',reference:q.reference})],['provider omitted, Google proposal',forged(x)],['pending claim',{...forged(x),status:'pending',humanApproval:ok(q)}],
  ['bridge fields only',{...forged({id:'unknown-1'}),idempotencyKey:'d0'+'0'.repeat(30),store:'another-store'}],['unknown ID under Google coverage',forged({id:'unknown-2'},{provider:'outlook'})]]){
  const inc=refreshed(s);inc.actionHistory.push(h);a.throws(()=>s.importSnapshot(inc),/Snapshot imports cannot add Google calendar receipts/,label);
  a.deepEqual(s.snapshot().actionHistory,[],'nothing written: '+label);}
 // An approval copy alone identifies a Google action whose proposal has left the snapshot.
 const raw=s.snapshot();raw.proposals=raw.proposals.filter(p=>p.id!==x.id);s.writeSnapshot(raw);const inc=refreshed(s);inc.actionHistory.push(forged(x));
 a.throws(()=>s.importSnapshot(inc),/cannot add Google calendar receipts/);a.deepEqual(s.snapshot().actionHistory,[]);
 a.equal(C.importedGoogleReceipts(s.snapshot(),{...refreshed(s),calendarCoverage:{provider:undefined},actionHistory:[forged(x)]},[x.id]).length,1,'approval IDs alone identify it');
 a.throws(()=>C.mergeSnapshot(null,{...refreshed(s),actionHistory:[forged(y,{provider:'google'})]}),/cannot add Google calendar receipts/,'a first import (and the legacy render merge) refuses too');
}));

test('item3: local receipts win over imported copies; legacy Outlook receipts and restore keep working',()=>withStore(s=>{
 const {x}=setup(s),{q}=start(s,[x.id],x.id),pending=receipt(s,x.id);
 const inc=refreshed(s);inc.actionHistory=[forged(x,{provider:'google',reference:q.reference})];s.importSnapshot(inc);
 a.deepEqual(receipt(s,x.id),pending,'an imported executed copy never replaces the local pending receipt');a.equal(A.read(s,q.reference).status,'pending');
 const same=refreshed(s);s.importSnapshot(same);a.deepEqual(receipt(s,x.id),pending,'re-importing an export of this database is a no-op');
 const b=s.backup();s.restore(b);a.deepEqual(receipt(s,x.id),pending,'restore keeps the trusted receipt');
 withStore(o=>{const d=structuredClone(require('../examples/snapshot.json'));d.actionHistory=[{id:'proposal-a',status:'executed',fingerprint:'legacy',recordedAt:'2026-10-07T12:00:00Z',verifiedAt:'2026-10-07T12:00:00Z',remoteRef:'legacy-1',evidence:'Legacy Outlook receipt.'}];
  o.importSnapshot(d);a.equal(o.snapshot().actionHistory.length,1,'legacy Outlook receipts still import');
  const d2=structuredClone(d);d2.actionHistory=[...d.actionHistory,{id:'other-legacy',status:'not_created',fingerprint:'f',recordedAt:'2026-10-07T12:00:00Z',evidence:'Legacy.'}];o.importSnapshot(d2);a.equal(o.snapshot().actionHistory.length,2,'provider-less receipts under Outlook coverage stay legacy');
  const d3=structuredClone(d);d3.actionHistory=[{id:'g-x',status:'executed',fingerprint:'f',recordedAt:'2026-10-07T12:00:00Z',verifiedAt:'2026-10-07T12:00:00Z',remoteRef:'r',evidence:'e',connector:'google-calendar-connector'}];a.throws(()=>o.importSnapshot(d3),/cannot add Google calendar receipts/);});
}));

// Review round 1 of #46: unknown hold ranges, holds from incomplete or cross-calendar searches, imported receipts that vouch
// for themselves, and outcomes of claims that already started.
const put=(s,id,h)=>s.db.prepare('UPDATE receipts SET value=? WHERE id=?').run(JSON.stringify(h),id);
const legacyHold=(s,id,extra={})=>put(s,id,{...receipt(s,id),status:'unverified',conclusion:'ambiguous',hold:'ambiguous',recordedAt:new Date().toISOString(),evidence:'Multiple matching events.',...extra});
test('B1: a hold recorded without a scope stays held, since an earlier wider search may have seen a match 40 hours away',()=>withStore(s=>{
 const {x}=setup(s),{q,p,k}=start(s,[x.id],x.id),R=q.reference;
 // Before scopes were kept, a ±48h search found a1 at the action time and a2 40 hours later and recorded only the hold.
 legacyHold(s,x.id);
 for(const w of [24,48,100]){const r=G.reconcile(s,R,x.id,read(s,p,{before:w,after:w,events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'unverified','±'+w+'h cannot be shown to cover an unknown range');a.match(r.needs.join(' '),/hold scope is unknown/);}
 a.equal(receipt(s,x.id).hold,'ambiguous');a.equal(receipt(s,x.id).holdScope.unknown,true,'the unknown range is recorded');a.deepEqual(receipt(s,x.id).holdScope.matches,[DEST+'/a1']);
 // A later ambiguous narrow search cannot replace the unknown range with its own window.
 let r=G.reconcile(s,R,x.id,read(s,p,{events:{[DEST]:[marked(p,k,'a1'),marked(p,k,'a3')]}}));a.equal(r.conclusion,'ambiguous');
 a.equal(receipt(s,x.id).holdScope.unknown,true,'unknown stays set');a.deepEqual(receipt(s,x.id).holdScope.matches,[DEST+'/a1',DEST+'/a3']);
 r=G.reconcile(s,R,x.id,read(s,p,{before:24,after:24,events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'unverified');a.equal(receipt(s,x.id).hold,'ambiguous');
 a.throws(()=>G.readback(s,R,x.id,{calendarId:DEST,account:p.account,event:marked(p,k,'a1')}),/Several matching events/);
}));

test('B1: an unreadable scope stays unknown after a later ambiguous narrow search',()=>withStore(s=>{
 const {x}=setup(s),{q,p,k}=start(s,[x.id],x.id),R=q.reference;
 legacyHold(s,x.id,{holdScope:{start:'garbage',end:null}});
 let r=G.reconcile(s,R,x.id,read(s,p,{events:{[DEST]:[marked(p,k,'a1'),marked(p,k,'a2')]}}));a.equal(r.conclusion,'ambiguous');
 r=G.reconcile(s,R,x.id,read(s,p,{before:24,after:24,events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'unverified','the narrow ambiguous search did not reset the range to ±1 hour');
 a.equal(receipt(s,x.id).holdScope.unknown,true,'unknown stays set');a.match(r.needs.join(' '),/hold scope is unknown/);
}));

test('B1: non-array scope calendars and matches are neither spread into characters nor thrown on',()=>withStore(s=>{
 const {x}=setup(s),{q,p,k}=start(s,[x.id],x.id),R=q.reference,from=new Date(Date.parse(p.start)-30*H).toISOString(),to=new Date(Date.parse(p.end)+30*H).toISOString();
 legacyHold(s,x.id,{holdScope:{start:from,end:to,calendars:'abc',matches:7}});
 let r=G.reconcile(s,R,x.id,read(s,p,{before:30,after:30,events:{[DEST]:[marked(p,k,'b1'),marked(p,k,'b2')]}}));a.equal(r.conclusion,'ambiguous');
 const sc=receipt(s,x.id).holdScope;a.ok(!sc.calendars.some(c=>c.length===1),'no characters spread into calendars');a.deepEqual(sc.matches,[DEST+'/b1',DEST+'/b2']);a.equal(sc.unknown,true);a.equal(sc.start,from,'readable parts are kept');a.equal(sc.end,to);
 r=G.reconcile(s,R,x.id,read(s,p,{before:48,after:48,events:{[DEST]:[marked(p,k,'b1')]}}));a.equal(r.status,'unverified');a.match(r.needs.join(' '),/hold scope is unknown/);
}));

test('B2: an incomplete search that sees several marked events starts the hold with its matches and valid window',()=>withStore(s=>{
 const {x,y}=setup(s),{q,p,k}=start(s,[x.id],x.id),R=q.reference;
 let r=G.reconcile(s,R,x.id,read(s,p,{before:25,after:25,complete:false,events:{[DEST]:[marked(p,k,'a1'),marked(p,k,'a2',20)]}}));
 a.equal(r.conclusion,'unknown');a.equal(r.hold,'ambiguous','the events it did see exist');a.deepEqual(r.matches,[DEST+'/a1',DEST+'/a2']);
 const sc=receipt(s,x.id).holdScope;a.deepEqual(sc.matches,[DEST+'/a1',DEST+'/a2']);a.equal(Date.parse(sc.start),Date.parse(p.start)-25*H);a.equal(Date.parse(sc.end),Date.parse(p.end)+25*H);a.equal(sc.unknown,undefined);
 r=G.reconcile(s,R,x.id,read(s,p,{events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'unverified','a narrow complete search cannot hide a2');
 a.throws(()=>G.readback(s,R,x.id,{calendarId:DEST,account:p.account,event:marked(p,k,'a1')}),/Several matching events/,'no direct read-back');
 r=G.reconcile(s,R,x.id,read(s,p,{before:25,after:25,events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'executed','a complete covering search clears it');
 // Invalid search bounds: the hold starts, but no range is invented from them.
 const t=start(s,[y.id],y.id),bad={...read(s,t.p,{events:{[DEST]:[marked(t.p,t.k,'b1'),marked(t.p,t.k,'b2')]}}),start:'not a time'};
 r=G.reconcile(s,t.q.reference,y.id,bad);a.equal(r.conclusion,'unknown');a.equal(r.hold,'ambiguous');a.equal(receipt(s,y.id).holdScope.unknown,true);a.notEqual(receipt(s,y.id).holdScope.start,'not a time');
 r=G.reconcile(s,t.q.reference,y.id,read(s,t.p,{before:48,after:48,events:{[DEST]:[marked(t.p,t.k,'b1')]}}));a.equal(r.status,'unverified');a.match(r.needs.join(' '),/hold scope is unknown/);
}));

test('N2: one destination marker and one on another calendar hold too, keeping that calendar and window',()=>withStore(s=>{
 const {x,y}=setup(s),{q,p,k}=start(s,[x.id],x.id),R=q.reference;
 // A narrower window: the other-calendar marker is 20 hours away.
 let r=G.reconcile(s,R,x.id,read(s,p,{before:25,after:25,events:{[DEST]:[marked(p,k,'a1')],[OTHER]:[marked(p,k,'w1',20)]}}));a.equal(r.conclusion,'other-calendar');a.equal(r.hold,'ambiguous');
 a.deepEqual(receipt(s,x.id).holdScope.matches,[DEST+'/a1',OTHER+'/w1']);
 r=G.reconcile(s,R,x.id,read(s,p,{events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'unverified','a narrower window cannot skip w1');
 r=G.reconcile(s,R,x.id,read(s,p,{before:25,after:25,events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'executed','w1 is gone from a complete covering read');
 // Changed coverage calendars: the other marker was on a calendar that later coverage no longer lists.
 const t=start(s,[y.id],y.id);
 r=G.reconcile(s,t.q.reference,y.id,read(s,t.p,{events:{[DEST]:[marked(t.p,t.k,'b1')],[OTHER]:[marked(t.p,t.k,'e1')]}}));a.equal(r.hold,'ambiguous');a.ok(receipt(s,y.id).holdScope.calendars.includes(OTHER));
 const inc=refreshed(s);inc.calendarCoverage.calendars=inc.calendarCoverage.calendars.filter(c=>c.id!==OTHER);s.importSnapshot(inc);
 r=G.reconcile(s,t.q.reference,y.id,read(s,t.p,{before:24,after:24,events:{[DEST]:[marked(t.p,t.k,'b1')]}}));a.equal(r.status,'unverified','a search without that calendar cannot clear it');a.ok(r.needs.join(' ').includes(OTHER));
 r=G.reconcile(s,t.q.reference,y.id,read(s,t.p,{before:24,after:24,extra:[OTHER],events:{[DEST]:[marked(t.p,t.k,'b1')]}}));a.equal(r.status,'executed');
}));

test('N1: a claim that already started under a version older history would refuse can still record its outcome',()=>withStore(s=>{
 // Q2 [x] is prepared before x is recorded not_created under Q1.
 const {x,y}=setup(s),q1=A.prepare(s,[x.id,y.id]),q2=A.prepare(s,[x.id]);
 G.pending(s,q1.reference,x.id,ok(q1),ARGS,read(s,x));a.equal(G.reconcile(s,q1.reference,x.id,read(s,x,{before:25,after:25})).status,'not_created');
 G.pending(s,q2.reference,x.id,ok(q2),ARGS,read(s,x));
 // As recorded before attempts kept their version: the earlier not_created state has no reference and is newer than Q2.
 const h=receipt(s,x.id);put(s,x.id,{...h,attempts:h.attempts.map(({reference,...rest})=>rest)});
 a.match(G.verify(s,q2.reference,ok(q2),ARGS).actions[0].errors.join(' '),/newly prepared and approved version/,'a new claim under Q2 is refused');
 const k=receipt(s,x.id).idempotencyKey;
 let r=G.reconcile(s,q2.reference,x.id,read(s,x,{complete:false}));a.equal(r.status,'unverified','reconcile records the outcome of the started claim');
 r=G.readback(s,q2.reference,x.id,{calendarId:DEST,account:x.account,event:marked(x,k,'n1')});a.equal(r.status,'executed','read-back records it');
 a.equal(receipt(s,x.id).reference,q2.reference);a.ok(receipt(s,x.id).attempts.some(v=>v.status==='not_created'),'history kept');
}));

test('N4: an unreferenced earlier not_created state with an unreadable time refuses every version; no time is invented',()=>withStore(s=>{
 const {x}=setup(s),q1=A.prepare(s,[x.id]);G.pending(s,q1.reference,x.id,ok(q1),ARGS,read(s,x));G.reconcile(s,q1.reference,x.id,read(s,x,{before:25,after:25}));
 const h=receipt(s,x.id);put(s,x.id,{...h,attempts:[...h.attempts,{status:'not_created',recordedAt:'unknown',evidence:'Legacy.'}]});
 const q2=A.prepare(s,[x.id]);a.match(G.verify(s,q2.reference,ok(q2),ARGS).actions[0].errors.join(' '),/newly prepared and approved version/,'fails closed for a genuinely new version');
 a.equal(receipt(s,x.id).attempts.at(-1).recordedAt,'unknown');
}));

test('B3: under Google coverage an incoming proposal cannot vouch for its own receipt; Google-only fields are refused everywhere',()=>withStore(s=>{
 const {x}=setup(s),before=JSON.stringify(s.snapshot().actionHistory);
 const z={id:'collector-z',title:'Collector block',start:x.start,end:x.end,calendar:x.calendar,account:x.account,timezone:x.timezone,status:'proposed'};
 const forgedZ=(extra={})=>({id:z.id,status:'executed',fingerprint:P.fingerprint(z),recordedAt:new Date().toISOString(),verifiedAt:new Date().toISOString(),remoteRef:DEST+'/evt',evidence:'Imported, not read back.',...extra});
 for(const [label,h] of [['allocation fields',forgedZ({sourceRefs:[{kind:'todo',id:'todo-forged'}],minutes:600})],['no Google fields',forgedZ()]]){
  const inc=refreshed(s);inc.proposals.push(z);inc.actionHistory.push(h);a.throws(()=>s.importSnapshot(inc),/cannot add Google calendar receipts/,label);a.equal(JSON.stringify(s.snapshot().actionHistory),before,'nothing written: '+label);}
 // Switching the incoming coverage to Outlook does not lift the guard while the local coverage is Google.
 let inc=refreshed(s);const cov=inc.calendarCoverage;inc.calendarCoverage={start:cov.start,end:cov.end,complete:true,checkedAt:cov.checkedAt,account:cov.account,calendar:cov.calendar,note:'Outlook-shaped'};inc.sources.push({id:'outlook',name:'Outlook',status:'ok',lastSuccess:inc.generatedAt});
 inc.actionHistory.push(forgedZ({id:'switch-1'}));a.throws(()=>s.importSnapshot(inc),/cannot add Google calendar receipts/,'Outlook-shaped incoming coverage');a.equal(JSON.stringify(s.snapshot().actionHistory),before);
 // Only an Outlook proposal already in the local snapshot keeps the legacy exception, and never with Google-only fields.
 inc=refreshed(s);inc.proposals.push(z);s.importSnapshot(inc);
 inc=refreshed(s);inc.actionHistory.push(forgedZ({minutes:600}));a.throws(()=>s.importSnapshot(inc),/cannot add Google calendar receipts/,'local Outlook proposal, Google fields');
 inc=refreshed(s);inc.actionHistory.push(forgedZ());s.importSnapshot(inc);a.equal(receipt(s,z.id).status,'executed','legacy receipt for a local Outlook proposal');
 withStore(o=>{const d=structuredClone(require('../examples/snapshot.json')),base={status:'executed',fingerprint:'f',recordedAt:'2026-10-07T12:00:00Z',verifiedAt:'2026-10-07T12:00:00Z',remoteRef:'r',evidence:'e'};
  for(const [label,extra] of [['sourceRefs',{sourceRefs:[{kind:'assignment',id:'a'}]}],['minutes',{minutes:600}],['account',{account:'student@example.com'}],['structured approval',{humanApproval:{channel:'chat',text:'Approve Q-1',at:'2026-10-07T12:00:00Z'}}],['other provider',{provider:'caldav'}]])
   a.throws(()=>o.importSnapshot({...structuredClone(d),actionHistory:[{id:'o-'+label,...base,...extra}]}),/cannot add Google calendar receipts/,'Outlook coverage, '+label);
  o.importSnapshot({...structuredClone(d),actionHistory:[{id:'o-legacy',...base,humanApproval:'Approved in chat.'}]});a.equal(o.snapshot().actionHistory.length,1,'the Phase 4 receipt shape still imports');});
}));

// Review round 2 of #46 (R2-B1): every marked event a started claim sees is kept across outcomes, so two distinct ones seen by
// different searches hold the action too, and a narrower search or a direct read-back cannot hide the earlier one.
const backOf=(p,ev,calendarId=DEST)=>({calendarId,account:p.account,event:ev});
test('R2-B1: a marker on another calendar, then a narrow single match on the destination, holds; a covering search clears it',()=>withStore(s=>{
 const {x}=setup(s),{q,p,k}=start(s,[x.id],x.id),R=q.reference;
 let r=G.reconcile(s,R,x.id,read(s,p,{before:25,after:25,events:{[OTHER]:[marked(p,k,'w1',20)]}}));a.equal(r.conclusion,'other-calendar');a.equal(r.hold,undefined,'one marked event is not yet a hold');
 a.deepEqual(receipt(s,x.id).holdScope.matches,[OTHER+'/w1'],'the other-calendar marker is kept on the receipt');a.deepEqual(receipt(s,x.id).holdScope.calendars,[OTHER]);
 r=G.reconcile(s,R,x.id,read(s,p,{events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'unverified','w1 was seen earlier; a ±1h search cannot rule it out');a.equal(r.hold,'ambiguous');a.equal(r.conclusion,'ambiguous');
 a.deepEqual(receipt(s,x.id).holdScope.matches,[OTHER+'/w1',DEST+'/a1']);a.match(r.needs.join(' '),/read .* to /);a.equal(receipt(s,x.id).status,'unverified');
 a.throws(()=>G.readback(s,R,x.id,backOf(p,marked(p,k,'a1'))),/Several matching events/);
 r=G.reconcile(s,R,x.id,read(s,p,{before:25,after:25,events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'executed','a complete search covering w1, its calendar and ±24h finds only a1');a.equal(receipt(s,x.id).remoteRef,DEST+'/a1');
}));

test('R2-B1: a marker on another calendar blocks a direct read-back of a different event',()=>withStore(s=>{
 const {x}=setup(s),{q,p,k}=start(s,[x.id],x.id),R=q.reference;
 G.reconcile(s,R,x.id,read(s,p,{before:25,after:25,events:{[OTHER]:[marked(p,k,'w1',20)]}}));
 a.throws(()=>G.readback(s,R,x.id,backOf(p,marked(p,k,'a1'))),/Marked event course-schedule@example\.com\/w1 was seen earlier/);a.equal(receipt(s,x.id).status,'unverified','nothing recorded');
 // Reading w1 itself is allowed: it is the event seen, and it is on the wrong calendar, so it stays unverified with w1 kept.
 const r=G.readback(s,R,x.id,backOf(p,marked(p,k,'w1',20),OTHER));a.equal(r.status,'unverified');a.deepEqual(receipt(s,x.id).holdScope.matches,[OTHER+'/w1']);
 a.throws(()=>G.readback(s,R,x.id,backOf(p,marked(p,k,'a1'))),/was seen earlier/,'still refused after that read-back');
}));

test('R2-B1: an incomplete search that saw one marker 20 hours away keeps it; a narrow match of another event holds',()=>withStore(s=>{
 const {x}=setup(s),{q,p,k}=start(s,[x.id],x.id),R=q.reference;
 let r=G.reconcile(s,R,x.id,read(s,p,{before:25,after:25,complete:false,events:{[DEST]:[marked(p,k,'a1p',20)]}}));a.equal(r.conclusion,'unknown');a.equal(r.hold,undefined);
 const sc=receipt(s,x.id).holdScope;a.deepEqual(sc.matches,[DEST+'/a1p']);a.equal(Date.parse(sc.start),Date.parse(p.start)+20*H,'its interval, not the search window');a.equal(sc.unknown,undefined);
 r=G.reconcile(s,R,x.id,read(s,p,{events:{[DEST]:[marked(p,k,'a2')]}}));a.equal(r.status,'unverified');a.equal(r.hold,'ambiguous');a.deepEqual(receipt(s,x.id).holdScope.matches,[DEST+'/a1p',DEST+'/a2']);
 a.throws(()=>G.readback(s,R,x.id,backOf(p,marked(p,k,'a2'))),/Several matching events/);
 r=G.reconcile(s,R,x.id,read(s,p,{before:24,after:24,events:{[DEST]:[marked(p,k,'a2')]}}));a.equal(r.status,'executed','±24h covers a1p at +20h');
}));

test('R2-B1: identity is calendar and event ID: the same ID on another calendar is a second event, the same event seen again is not',()=>withStore(s=>{
 const {x,y}=setup(s),{q,p,k}=start(s,[x.id],x.id),R=q.reference;
 let r=G.reconcile(s,R,x.id,read(s,p,{events:{[OTHER]:[marked(p,k,'e1')]}}));a.equal(r.conclusion,'other-calendar');
 r=G.reconcile(s,R,x.id,read(s,p,{events:{[DEST]:[marked(p,k,'e1')]}}));a.equal(r.status,'unverified');a.equal(r.hold,'ambiguous');a.deepEqual(receipt(s,x.id).holdScope.matches,[OTHER+'/e1',DEST+'/e1']);
 a.throws(()=>G.readback(s,R,x.id,backOf(p,marked(p,k,'e1'))),/Several matching events/);
 // The same destination event seen by several incomplete searches stays one event and can still be read back or reconciled.
 const t=start(s,[y.id],y.id);
 for(let i=0;i<3;i++){r=G.reconcile(s,t.q.reference,y.id,read(s,t.p,{complete:false,events:{[DEST]:[marked(t.p,t.k,'b1')]}}));a.equal(r.hold,undefined);}
 a.deepEqual(receipt(s,y.id).holdScope.matches,[DEST+'/b1']);a.equal(receipt(s,y.id).hold,undefined);
 r=G.reconcile(s,t.q.reference,y.id,read(s,t.p,{events:{[DEST]:[marked(t.p,t.k,'b1')]}}));a.equal(r.status,'executed','one complete narrow match of the same event');
 withStore(s2=>{const {x:x2}=setup(s2),u=start(s2,[x2.id],x2.id);G.reconcile(s2,u.q.reference,x2.id,read(s2,u.p,{complete:false,events:{[DEST]:[marked(u.p,u.k,'c1')]}}));
  a.throws(()=>G.readback(s2,u.q.reference,x2.id,backOf(u.p,marked(u.p,u.k,'c2'))),/was seen earlier/,'another event is refused');
  a.equal(G.readback(s2,u.q.reference,x2.id,backOf(u.p,marked(u.p,u.k,'c1'))).status,'executed','the event seen earlier can be read back');});
}));

test('R2-B1: a marker whose times cannot be read, or that has no ID, is kept with an unknown range and never lets another event execute',()=>withStore(s=>{
 const {x,y}=setup(s),{q,p,k}=start(s,[x.id],x.id),R=q.reference;
 let r=G.reconcile(s,R,x.id,read(s,p,{before:25,after:25,events:{[DEST]:[{...marked(p,k,'m1'),start:'garbage'}]}}));a.equal(r.conclusion,'unknown');a.deepEqual(r.matches,[DEST+'/m1'],'the marker is detected although its times cannot be read');
 a.match(r.errors.join(' '),/cannot be read/);const sc=receipt(s,x.id).holdScope;a.deepEqual(sc.matches,[DEST+'/m1']);a.equal(sc.unknown,true);
 r=G.reconcile(s,R,x.id,read(s,p,{events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'unverified');a.equal(r.hold,'ambiguous');a.match(r.needs.join(' '),/hold scope is unknown/);
 for(const w of [24,48])a.equal(G.reconcile(s,R,x.id,read(s,p,{before:w,after:w,events:{[DEST]:[marked(p,k,'a1')]}})).status,'unverified','±'+w+'h cannot cover an unknown range');
 a.throws(()=>G.readback(s,R,x.id,backOf(p,marked(p,k,'a1'))),/Several matching events/);a.equal(receipt(s,x.id).holdScope.unknown,true,'unknown stays set');
 // One marker without an event ID: its identity is unknown, so no event can be read back or reconciled into executed, and absence is never concluded.
 const t=start(s,[y.id],y.id),{id:_,...noId}=marked(t.p,t.k,'gone');
 r=G.reconcile(s,t.q.reference,y.id,read(s,t.p,{complete:false,events:{[DEST]:[noId]}}));a.equal(r.conclusion,'unknown');a.equal(receipt(s,y.id).holdScope.unknown,true);
 a.throws(()=>G.readback(s,t.q.reference,y.id,backOf(t.p,marked(t.p,t.k,'b1'))),/not fully recorded/);
 r=G.reconcile(s,t.q.reference,y.id,read(s,t.p,{events:{[DEST]:[marked(t.p,t.k,'b1')]}}));a.equal(r.status,'unverified');a.match(r.needs.join(' '),/hold scope is unknown/);
 r=G.reconcile(s,t.q.reference,y.id,read(s,t.p,{before:25,after:25}));a.equal(r.status,'unverified','no not_created after a marked event was seen');
}));

test('R2-B1: successive partial and other-calendar outcomes add up to a hold; only a search covering both clears it',()=>withStore(s=>{
 const {x}=setup(s),{q,p,k}=start(s,[x.id],x.id),R=q.reference;
 let r=G.reconcile(s,R,x.id,read(s,p,{before:31,after:31,complete:false,events:{[DEST]:[marked(p,k,'a1',30)]}}));a.equal(r.hold,undefined);
 r=G.reconcile(s,R,x.id,read(s,p,{events:{[OTHER]:[marked(p,k,'w1')]}}));a.equal(r.conclusion,'other-calendar');a.equal(r.hold,'ambiguous','two distinct markers across two searches');
 a.match(receipt(s,x.id).evidence,/Several marked events have been seen for this action \(student@example\.com\/a1, course-schedule@example\.com\/w1\)/);
 r=G.reconcile(s,R,x.id,read(s,p,{before:25,after:25,events:{[DEST]:[marked(p,k,'a3')]}}));a.equal(r.status,'unverified','±25h misses a1 at +30h');a.match(r.needs.join(' '),new RegExp(new Date(Date.parse(p.end)+30*H).toISOString()));
 r=G.reconcile(s,R,x.id,read(s,p,{before:31,after:31,events:{[DEST]:[marked(p,k,'a3')]}}));a.equal(r.status,'executed');
 a.ok(receipt(s,x.id).attempts.some(v=>v.conclusion==='other-calendar'&&v.holdScope?.matches.length===2),'each earlier state keeps the matches it saw');
}));

test('R2-B1: a not_created conclusion needs a claim that saw no marked event; a read-back mismatch of a marked event is kept',()=>withStore(s=>{
 const {x,y}=setup(s),{q,p,k}=start(s,[x.id],x.id),R=q.reference;
 const r=G.readback(s,R,x.id,backOf(p,{...marked(p,k,'a1'),location:'Elsewhere'}));a.equal(r.status,'unverified');a.deepEqual(receipt(s,x.id).holdScope.matches,[DEST+'/a1']);
 a.equal(G.reconcile(s,R,x.id,read(s,p,{before:25,after:25})).status,'unverified','a1 was seen, so an empty search is not absence');
 a.equal(G.reconcile(s,R,x.id,read(s,p,{events:{[DEST]:[marked(p,k,'a2')]}})).hold,'ambiguous','a1 and a2 are two events');
 // A claim that saw nothing may still conclude absence, and the next claim starts with nothing seen.
 const t=start(s,[y.id],y.id);a.equal(G.reconcile(s,t.q.reference,y.id,read(s,t.p,{before:25,after:25})).status,'not_created');
 const q2=A.prepare(s,[y.id]);G.pending(s,q2.reference,y.id,ok(q2),ARGS,read(s,t.p));a.equal(receipt(s,y.id).holdScope,undefined);
 a.equal(G.readback(s,q2.reference,y.id,backOf(t.p,marked(t.p,t.k,'b1'))).status,'executed');
}));

test('R2-B1: the marked events seen survive restore and snapshot import',()=>withStore(s=>{
 const {x}=setup(s),{q,p,k}=start(s,[x.id],x.id),R=q.reference,early=s.backup();
 G.reconcile(s,R,x.id,read(s,p,{before:25,after:25,events:{[OTHER]:[marked(p,k,'w1',20)]}}));const kept=receipt(s,x.id);
 s.restore(early);a.deepEqual(receipt(s,x.id),kept,'restore of an older backup keeps the current receipt');
 const inc=refreshed(s);inc.actionHistory=inc.actionHistory.map(h=>h.id===x.id?{...h,holdScope:{start:null,end:null,calendars:[],matches:[]},attempts:[]}:h);s.importSnapshot(inc);
 a.deepEqual(receipt(s,x.id),kept,'an imported copy cannot erase what was seen');
 a.throws(()=>G.readback(s,R,x.id,backOf(p,marked(p,k,'a1'))),/was seen earlier/);
 a.equal(G.reconcile(s,R,x.id,read(s,p,{events:{[DEST]:[marked(p,k,'a1')]}})).hold,'ambiguous');
}));

test('R2-B1: outcomes recorded before marked events were kept fail closed unless they show none was seen',()=>withStore(s=>{
 const {x,y}=setup(s),{q,p,k}=start(s,[x.id],x.id),R=q.reference;
 // An other-calendar outcome recorded without a scope: its marker is known to exist but not which one.
 put(s,x.id,{...receipt(s,x.id),status:'unverified',conclusion:'other-calendar',recordedAt:new Date().toISOString(),evidence:'This action\'s marker was found on another calendar (course-schedule@example.com/w1).'});
 a.throws(()=>G.readback(s,R,x.id,backOf(p,marked(p,k,'a1'))),/not fully recorded/);
 let r=G.reconcile(s,R,x.id,read(s,p,{before:48,after:48,events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'unverified');a.match(r.needs.join(' '),/hold scope is unknown/);a.equal(receipt(s,x.id).holdScope.unknown,true);
 // Unmarked look-alike and too-narrow empty outcomes saw no marked event, so the old flow still works.
 const t=start(s,[y.id],y.id);
 for(const [conclusion,evidence] of [['unmarked','An event with the same title and times but no action marker exists on the destination (look).'],['unknown','No marked event in a to b, but absence needs complete reads from at least 24 hours before to 24 hours after the action; read the wider window.']])
  {const h=receipt(s,y.id);put(s,y.id,{...h,status:'unverified',conclusion,recordedAt:new Date().toISOString(),evidence,attempts:[...(h.attempts||[]),{status:h.status,recordedAt:h.recordedAt,evidence:h.evidence||null,...(h.conclusion?{conclusion:h.conclusion}:{})}]});}
 a.equal(G.reconcile(s,t.q.reference,y.id,read(s,t.p,{events:{[DEST]:[marked(t.p,t.k,'b1')]}})).status,'executed');
}));
