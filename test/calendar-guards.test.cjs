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
const marked=(p,k,id,shiftH=0)=>({...structuredClone(SAMPLE),id,summary:p.title,description:G.description(p,k),start:offset(new Date(Date.parse(p.start)+shiftH*H).toISOString()),end:offset(new Date(Date.parse(p.end)+shiftH*H).toISOString()),location:'',reminders:{use_default:false,overrides:[{method:'popup',minutes:p.reminderMinutes}]}});
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
 for(const [search,re] of [[read(s,p,{before:31,after:31,extra:[EXTRA],complete:false,events:{[DEST]:[marked(p,k,'a1')]}}),/unknown/],[read(s,p,{before:31,after:31,extra:[EXTRA],events:{[OTHER]:[marked(p,k,'w1')],[DEST]:[marked(p,k,'a1')]}}),/other-calendar/],[read(s,p,{before:31,after:31,extra:[EXTRA]}),/ambiguous/]]){
  r=G.reconcile(s,R,p.id,search);a.equal(r.status,'unverified');a.match(r.conclusion,re);a.equal(receipt(s,p.id).hold,'ambiguous');a.deepEqual(receipt(s,p.id).holdScope,scope);}
 r=G.reconcile(s,R,p.id,read(s,p,{before:25,after:25,extra:[EXTRA],events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'unverified','25 hours does not cover the 30-hour round');
 r=G.reconcile(s,R,p.id,read(s,p,{before:31,after:31,events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'unverified','a calendar read in the ambiguous round must be read again');a.match(r.needs.join(' '),/extra-calendar@example\.com/);
 r=G.reconcile(s,R,p.id,read(s,p,{before:30,after:30,extra:[EXTRA],events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'executed',JSON.stringify(r));
}));

test('item1: several marked events also hold when a marker is on another calendar; holds without a recorded scope need 24 hours either side',()=>withStore(s=>{
 const {x,y}=setup(s),{q,p,k}=start(s,[x.id,y.id],x.id),R=q.reference;
 let r=G.reconcile(s,R,p.id,read(s,p,{events:{[OTHER]:[marked(p,k,'w1')],[DEST]:[marked(p,k,'a1'),marked(p,k,'a2')]}}));a.equal(r.conclusion,'other-calendar');a.equal(receipt(s,p.id).hold,'ambiguous','several on the destination hold even with a foreign marker');
 r=G.reconcile(s,R,p.id,read(s,p,{events:{[DEST]:[marked(p,k,'a1')]}}));a.equal(r.status,'unverified');
 // A hold recorded before scopes were kept: no range is known, so the documented 24-hour minimum applies.
 const t=start(s,[y.id],y.id),h=receipt(s,y.id);s.db.prepare('UPDATE receipts SET value=? WHERE id=?').run(JSON.stringify({...h,status:'unverified',conclusion:'ambiguous',hold:'ambiguous',recordedAt:new Date().toISOString(),evidence:'Multiple matching events (b1, b2).'}),y.id);
 r=G.reconcile(s,t.q.reference,y.id,read(s,t.p,{events:{[DEST]:[marked(t.p,t.k,'b1')]}}));a.equal(r.status,'unverified','legacy hold: narrow search refused');
 r=G.reconcile(s,t.q.reference,y.id,read(s,t.p,{before:24,after:24,events:{[DEST]:[marked(t.p,t.k,'b1')]}}));a.equal(r.status,'executed','legacy hold: 24 hours either side clears');
 // Without a hold, one marked event in a narrow complete search is still read back as before.
 withStore(s2=>{const {x:x2,y:y2}=setup(s2),u=start(s2,[x2.id],x2.id);a.equal(G.reconcile(s2,u.q.reference,x2.id,read(s2,u.p,{events:{[DEST]:[marked(u.p,u.k,'c1')]}})).status,'executed');
  // An unreadable stored scope fails closed instead of being treated as covered.
  const v=start(s2,[y2.id],y2.id),hv=receipt(s2,y2.id);s2.db.prepare('UPDATE receipts SET value=? WHERE id=?').run(JSON.stringify({...hv,status:'unverified',conclusion:'ambiguous',hold:'ambiguous',holdScope:{start:'garbage',end:null},recordedAt:new Date().toISOString(),evidence:'Multiple matching events.'}),y2.id);
  const w=G.reconcile(s2,v.q.reference,y2.id,read(s2,v.p,{before:48,after:48,events:{[DEST]:[marked(v.p,v.k,'d1')]}}));a.equal(w.status,'unverified');a.match(w.needs.join(' '),/hold scope cannot be read/);});
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

// Item 4: Review says a not_created action is absent only in the searched window.
test('item4: Review labels not_created as absent in the searched window, with each earlier state\'s version',async()=>{
 let D,S,V;withStore(s=>{const {x,y}=setup(s),q1=A.prepare(s,[x.id,y.id]);G.pending(s,q1.reference,x.id,ok(q1),ARGS,read(s,x));G.reconcile(s,q1.reference,x.id,read(s,x,{before:25,after:25}));
  const q2=A.prepare(s,[x.id]);G.pending(s,q2.reference,x.id,ok(q2),ARGS,read(s,x));G.reconcile(s,q2.reference,x.id,read(s,x,{before:25,after:25}));D=s.snapshot();S=s.state();V=A.list(s);});
 const order=[...fs.readFileSync('src/web/index.html','utf8').matchAll(/<script src="\/([\w.]+)"><\/script>/g)].map(m=>m[1]),files={'core.js':'src/core.cjs','phase2.js':'src/phase2.cjs','phase3.js':'src/phase3.cjs','effort.js':'src/effort.cjs','workload.js':'src/workload.cjs','email.js':'src/email.cjs','app.js':'src/web/app.js'};
 const nodes=new Map(),node=k=>{if(!nodes.has(k))nodes.set(k,{textContent:'',innerHTML:''});return nodes.get(k);};
 const ctx=vm.createContext({URL,URLSearchParams,Date,Intl,console,encodeURIComponent,window:{addEventListener(){}},document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}},location:{pathname:'/review',search:'?tab=history'},history:{pushState(){}},fetch:async url=>({ok:true,json:async()=>url.endsWith('session')?{csrf:'t'}:url.includes('approvals')?V:{snapshot:D,progress:S}})});
 for(const f of order)vm.runInContext(fs.readFileSync(files[f],'utf8'),ctx,{filename:files[f]});await new Promise(r=>setImmediate(r));
 const html=node('#page').innerHTML;a.match(html,/data-status="not_created"/);a.match(html,/Not created · absent in searched window/);a.doesNotMatch(html,/verified absent/i);
 a.match(html,/found no event with this action marker in that window/);a.match(html,new RegExp('not_created under '+V.at(-1).reference),'earlier not_created states name their version');
});
