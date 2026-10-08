const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('../src/phase2.cjs'),C=require('../src/core.cjs');
const now='2026-10-07T12:00:00Z';
const p={id:'focus-1',title:'Focus',action:'create',account:'student@example.com',calendar:'Personal',timezone:'America/New_York',start:'2026-10-08T14:00:00Z',end:'2026-10-08T15:00:00Z',recurrence:'One time',attendees:[]};
const d=()=>({timezone:p.timezone,generatedAt:now,events:[],actionHistory:[],calendarCoverage:{complete:true,start:now,end:'2026-12-01T00:00:00Z',checkedAt:now,account:p.account,calendar:p.calendar}});
test('approval includes exact destination and before/after and refuses wrong account/stale evidence',()=>{
 assert.deepEqual(P.errors(p,d(),now),[]);assert.match(P.request([p],d(),now),/Dayweave action: focus-1/);
 assert.match(P.errors({...p,account:'other@example.com'},d(),now).join(),/Coverage/);
 assert.match(P.errors(p,d(),'2026-10-09T12:00:00Z').join(),/Refresh/);
 assert.match(P.errors({...p,end:'bad'},d(),now).join(),/timestamps/);
 assert.match(P.errors(p,{...d(),calendarCoverage:{...d().calendarCoverage,end:'bad'}},now).join(),/coverage/);
});
test('weekly recurrence preserves wall time across DST and checks every occurrence',()=>{
 C.configure(p.timezone);const r={...p,start:'2026-10-28T14:00:00Z',end:'2026-10-28T15:00:00Z',recurrence:{frequency:'weekly',interval:1,count:2}};
 const os=P.occurrences(r);assert.equal(os[1].start,'2026-11-04T15:00:00.000Z');
 assert.match(P.errors(r,{...d(),events:[{id:'busy',...os[1]}]},now).join(),/Overlaps/);
 assert.match(P.errors(r,{...d(),calendarCoverage:{...d().calendarCoverage,end:'2026-11-01T00:00:00Z'}},now).join(),/Outside/);
 assert.throws(()=>P.occurrences({...r,recurrence:{frequency:'weekly',interval:1,count:99}}),/2–30/);
});
test('update excludes only its verified target and rejects changes to before state',()=>{
 const before={...p,id:'remote',remoteRef:'event-1',action:'create',scope:'single'};
 const q={...p,id:'change-1',action:'update',remoteRef:'event-1',scope:'single',before,title:'New focus'};
 assert.deepEqual(P.errors(q,{...d(),events:[before]},now),[]);
 assert.match(P.errors(q,{...d(),events:[{...before,title:'Changed remotely'}]},now).join(),/before state/);
 assert.match(P.errors(q,{...d(),events:[{...before,attendees:['person@example.com']}]},now).join(),/personal/);
 assert.match(P.errors(q,{...d(),events:[before,{...before,id:'another',remoteRef:'event-2'}]},now).join(),/Overlaps/);
 assert.throws(()=>P.request([q,{...q,id:'change-2'}],{...d(),events:[before]},now),/one change/);
});
test('fingerprints include body, account, before, recurrence and reminders',()=>{
 for(const edit of [{body:'changed'},{account:'other@example.com'},{before:{title:'old'}},{reminderMinutes:30},{recurrence:{frequency:'daily',count:2,interval:1}}])assert.notEqual(P.fingerprint(p),P.fingerprint({...p,...edit}));
});
test('duplicate and uncertain saves are blocked until reconciled',()=>{
 const pending={id:p.id,fingerprint:P.fingerprint(p),status:'pending',recordedAt:now};let h=P.record([],pending);
 assert.match(P.errors(p,{...d(),actionHistory:h},now).join(),/already attempted/);
 assert.throws(()=>P.record(h,pending),/Reconcile/);
 h=P.record(h,{...pending,status:'unverified'});assert.match(P.errors(p,{...d(),actionHistory:h},now).join(),/already attempted/);
 assert.throws(()=>P.record(h,{...pending,status:'executed'}),/read-back/);
 h=P.record(h,{...pending,status:'executed',verifiedAt:now,remoteRef:'event-1',evidence:'Reopened and compared all approved fields.'});assert.equal(h[0].attempts.length,2);
 assert.throws(()=>P.record(h,pending),/already verified/);
});
test('response help requires real notes and user argument; request never submits',()=>{
 const a={id:'response',course:'COURSE 101',title:'Response',source:'https://example.com/response',assistance:{requiresNotes:true}};
 assert.throws(()=>P.helpRequest(a,'outline','',''),/actual class notes/);
 assert.throws(()=>P.helpRequest(a,'draft','Real notes','My argument'),/outline or review/);
 const text=P.helpRequest(a,'outline','My notes','My argument');assert.match(text,/full current instructions/);assert.match(text,/Leave submission/);
});
test('routine refresh cannot erase an execution journal outcome',()=>{
 const sample=require('../examples/snapshot.json'),old={...sample,actionHistory:[{id:'a',status:'executed'}]};
 assert.equal(C.mergeSnapshot(old,{...sample,actionHistory:[{id:'a',status:'pending'}]}).actionHistory[0].status,'executed');
});
