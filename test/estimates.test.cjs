const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {buildSnapshot,applyEstimates}=require('../src/collect.cjs'),{Store}=require('../src/store.cjs');
const base=()=>structuredClone(require('../examples/google-snapshot.json'));
const work=(id,extra={})=>({...base().assignments[0],id,title:'Work '+id,description:'Read the case and write two pages.',estimateMinutes:null,status:'not_submitted',...extra});

test('AI estimates fill only empty or AI estimates, stay stable until the instructions change, and skip finished work',()=>{
 const list=[work('a',{checklist:[]}),work('b',{estimateMinutes:90}),work('c',{status:'submitted'}),work('d',{archivedFromSource:true})];
 const r=applyEstimates(list,[{id:'a',estimateMinutes:150,checklist:['Read the case','Draft','Edit'],basis:'Two-page memo with a case reading'},{id:'b',estimateMinutes:30,basis:'x'},{id:'c',estimateMinutes:30,basis:'x'},{id:'d',estimateMinutes:30,basis:'x'},{id:'zz',estimateMinutes:30,basis:'x'},{id:'a',estimateMinutes:7,basis:'bad step'}]);
 a.deepEqual(r,{applied:1,kept:0,skipped:5});a.equal(list[0].estimateMinutes,150);a.equal(list[0].estimateSource,'ai');a.deepEqual(list[0].checklist,['Read the case','Draft','Edit']);
 a.equal(list[1].estimateMinutes,90,'an owner or curated estimate is never overwritten');a.equal(list[2].estimateMinutes,null);
 a.deepEqual(applyEstimates(list,[{id:'a',estimateMinutes:180,basis:'again'}]),{applied:0,kept:1,skipped:0});a.equal(list[0].estimateMinutes,150,'same instructions: kept, so plans do not churn');
 list[0].description='Read the case and write four pages.';a.deepEqual(applyEstimates(list,[{id:'a',estimateMinutes:240,basis:'Four pages now'}]),{applied:1,kept:0,skipped:0});a.equal(list[0].estimateMinutes,240);
 a.throws(()=>applyEstimates(list,{}),/list/);});

test('the build applies estimates after the merges and the store keeps them',()=>{
 const cur=base();cur.assignments=[work('a')];const {snapshot,report}=buildSnapshot(cur,{estimates:[{id:'a',estimateMinutes:120,basis:'Problem set with 5 questions'}]});
 a.deepEqual(report.estimates,{applied:1,kept:0,skipped:0});a.equal(snapshot.assignments[0].estimateMinutes,120);
 a.equal(buildSnapshot(cur,{}).report.estimates,undefined,'no file, no change');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-est-')),s=new Store(dir);
 try{s.importSnapshot(snapshot);const x=s.snapshot().assignments[0];a.equal(x.estimateSource,'ai');a.equal(x.estimateBasis,'Problem set with 5 questions');}finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}});
