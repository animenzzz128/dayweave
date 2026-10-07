const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.cjs');
const now='2026-10-07T12:00:00Z';
test('72h boundaries, overdue, unknown, optional and submitted',()=>{
 const a={requirement:'required',status:'not_submitted',dueAt:'2026-10-10T12:00:00Z'};
 assert.equal(C.classify(a,now),'soon');assert.equal(C.classify({...a,dueAt:'2026-10-10T12:00:01Z'},now),'week');
 assert.equal(C.classify({...a,dueAt:'2026-10-07T11:59:00Z'},now),'overdue');
 assert.equal(C.classify({...a,status:'submitted'},now),'submitted');
 assert.equal(C.classify({...a,requirement:'choice'},now),'optional');assert.equal(C.classify({...a,status:'unknown'},now),'verify');
 assert.equal(C.classify({...a,dueAt:null},now),'undated');
});
test('Eastern time conversion respects DST',()=>{
 assert.equal(C.zonedISO('2026-10-07','08:00'),'2026-10-07T12:00:00.000Z');
 assert.equal(C.zonedISO('2026-11-02','08:00'),'2026-11-02T13:00:00.000Z');
 assert.equal(C.dayKey('2026-10-08T02:00:00Z'),'2026-10-07');
});
test('No interval overlap at adjacent boundaries; detect genuine overlap',()=>{
 const a={start:'2026-10-07T13:00:00Z',end:'2026-10-07T14:00:00Z'};
 assert.equal(C.overlap(a,{start:a.end,end:'2026-10-07T15:00:00Z'}),false);
 assert.equal(C.overlap(a,{start:'2026-10-07T13:30:00Z',end:'2026-10-07T15:00:00Z'}),true);
});
test('Reject conflicts, executed actions, sleep time and incomplete reads',()=>{
 const p={id:'p',title:'Study',start:'2026-10-07T23:00:00Z',end:'2026-10-08T00:00:00Z'};
 const d={events:[],calendarCoverage:{complete:true,start:now,end:'2026-10-08T04:00:00Z'},actionHistory:[]};
 assert.deepEqual(C.proposalErrors(p,d,now),[]);
 assert.match(C.proposalErrors(p,{...d,events:[p]},now).join(),/Overlaps/);
 assert.match(C.proposalErrors(p,{...d,actionHistory:[{id:'p',status:'executed'}]},now).join(),/already/);
 assert.match(C.proposalErrors(p,{...d,calendarCoverage:{complete:false}},now).join(),/incomplete/);
 assert.match(C.proposalErrors({...p,start:'2026-10-07T10:00:00Z',end:'2026-10-07T11:00:00Z'},d,now).join(),/sleep/);
});
test('Updated dates invalidate approval fingerprints',()=>{
 const p={id:'p',title:'Study',start:now,end:'2026-10-07T13:00:00Z'};
 assert.notEqual(C.fingerprint(p),C.fingerprint({...p,start:'2026-10-08T12:00:00Z'}));
});
test('Source content cannot break JSON script boundaries or form executable URLs',()=>{
 const encoded=C.safeJSON({title:'</script><script>alert(1)</script>'});
 assert.equal(encoded.includes('<'),false);assert.equal(JSON.parse(encoded).title,'</script><script>alert(1)</script>');
 assert.equal(C.safeURL('javascript:alert(1)'),'#');assert.equal(C.safeURL('https://example.com/'),'https://example.com/');
});
test('Failed source retains prior records and last success',()=>{
 const old={schemaVersion:1,generatedAt:now,courses:[],priorities:[],assignments:[{id:'a',sourceId:'canvas',dueAt:now}],events:[],proposals:[],sources:[{id:'canvas',status:'ok',lastSuccess:now}]};
 const next={...old,generatedAt:'2026-10-08T12:00:00Z',assignments:[],sources:[{id:'canvas',status:'failed'}]};
 const merged=C.mergeSnapshot(old,next);assert.equal(merged.assignments.length,1);assert.equal(merged.sources[0].lastSuccess,now);
});
test('Duplicate source identifiers rejected',()=>{const d=require('../examples/snapshot.json');assert.throws(()=>C.validate({...d,assignments:[d.assignments[0],d.assignments[0]]}),/Duplicate/);});
