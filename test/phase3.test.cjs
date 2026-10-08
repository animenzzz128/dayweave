const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('../src/phase3.cjs'),C=require('../src/core.cjs');
const time='2026-10-08T12:00:00Z';
const person={id:'a',source:'https://example.com/a',evidence:'Verified synthetic source',checkedAt:time,scores:{role:4,shared:3,market:5,reason:4}};
test('candidate ranking deduplicates canonical URLs and excludes known relationships and dismissals',()=>{
 assert.equal(P.canonical('https://cn.linkedin.com/in/example/?x=1'),'https://www.linkedin.com/in/example');
 assert.equal(P.canonical('javascript:alert(1)'),'');
 assert.equal(P.candidates([person,{...person,id:'b',source:person.source+'?tracking=1'}]).length,1);
 assert.equal(P.candidates([person],[{id:person.source,status:'dismissed',updatedAt:time}]).length,0);
 assert.equal(P.candidates([{...person,relationship:'pending'}]).length,0);
});
test('eligibility distinguishes unknown sponsorship from explicit mismatch',()=>{
 const p={startYear:2027,usSponsorshipRequired:true};
 assert.deepEqual(P.eligibility({market:'US',startYear:2027},p),['US sponsorship unverified']);
 assert.deepEqual(P.eligibility({market:'US',startYear:2027,sponsorship:'no'},p),['Explicit sponsorship mismatch']);
 assert.ok(P.eligibility({market:'HK'},p).includes('Local work eligibility unknown'));
});
test('progress imports whitelist known IDs and statuses without importing approval authority',()=>{
 const d={career:{candidates:[person]},candidateHistory:[],actionHistory:[{id:'real',status:'pending'}]};
 const next=P.importProgress(d,{actionHistory:[{id:'real',status:'executed'}],localProgress:{selected:{real:true},career:{[person.source]:{status:'saved',updatedAt:time},evil:{status:'applied',updatedAt:time}}}});
 assert.equal(next.candidateHistory.length,1);assert.deepEqual(next.actionHistory,d.actionHistory);assert.equal(next.selected,undefined);
 assert.equal(P.weekly(next.candidateHistory,time).applied,0);
});
test('failed career refresh preserves earlier research',()=>{
 const d=structuredClone(require('../examples/snapshot.json'));const incoming=structuredClone(d);incoming.sources.push({id:'career',status:'failed'});incoming.career={candidates:[]};
 assert.deepEqual(C.mergeSnapshot(d,incoming).career.candidates,d.career.candidates);
});
