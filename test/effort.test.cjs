const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),E=require('../src/effort.cjs'),{Store}=require('../src/store.cjs'),{createServer}=require('../src/server.cjs');
const at='2026-10-08T12:00:00.000Z',pair=(estimateMinutes,actualMinutes,confirmedAt=at)=>({estimateMinutes,actualMinutes,requirement:'required',confirmedAt});
const fixture=()=>{const d=structuredClone(require('../examples/snapshot.json'));d.assignments=[['task-1',60,'required'],['task-2',40,'choice'],['task-3',30,'uncertain'],['task-4',undefined,'required']].map(([id,estimateMinutes,requirement])=>({...d.assignments[0],id,title:'Synthetic '+id,estimateMinutes,requirement}));return d;};
const temp=fn=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-effort-'));let s=new Store(dir);try{return fn(s,dir,()=>{s.close();s=new Store(dir);return s;});}finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}};

test('calibration needs three confirmed samples and reports the median ratio',()=>{
 const samples={a:pair(60,60),b:pair(40,60),c:pair(30,60)},actual={a:60,b:60,c:60};
 for(const n of [0,1,2]){const s=E.summary(Object.fromEntries(Object.entries(samples).slice(0,n)),actual);a.equal(s.sufficient,false);a.equal(s.ratio,null);a.equal(s.count,n);a.equal(s.threshold,3);}
 const s=E.summary(samples,actual);a.equal(s.sufficient,true);a.equal(s.count,3);a.equal(s.ratio,1.5);
 a.equal(E.summary({...samples,d:pair(10,40)},{...actual,d:40}).ratio,1.75);
});
test('zero, missing, edited and malformed effort is excluded and inputs are not mutated',()=>{
 const samples={ok:pair(60,30),edited:pair(60,90),gone:pair(60,45),bad:{estimateMinutes:-1,actualMinutes:'5',confirmedAt:'nope'},nan:pair(NaN,5),zero:pair(30,0)};
 const actual={ok:30,edited:100,zero:0,bad:5,nan:5,free:0,plain:20,noest:15,['__proto__']:5},assignments=[{id:'plain',estimateMinutes:20},{id:'noest'},{id:'free',estimateMinutes:10}];
 const before=JSON.stringify([samples,actual,assignments]),s=E.summary(samples,actual,assignments);a.equal(JSON.stringify([samples,actual,assignments]),before);
 a.equal(s.count,1);a.equal(s.sufficient,false);
 a.deepEqual(Object.fromEntries(s.samples.map(x=>[x.id,x.state])),{bad:'invalid',edited:'invalidated',gone:'invalidated',nan:'invalid',ok:'confirmed',zero:'invalid'});
 a.deepEqual(s.excluded,{invalidated:2,invalid:3,zeroActual:1,noEstimate:2,unconfirmed:1});
 a.equal(E.state(undefined,5),'none');a.equal(E.state(pair(10,5),5),'confirmed');a.equal(E.state(pair(10,5),'5'),'invalidated');
});
test('samples deduplicate by stable ID keeping the latest confirmation',()=>{
 const s=E.summary([{id:'x',...pair(10,10,'2026-10-01T00:00:00Z')},{id:'x',...pair(10,30,'2026-10-02T00:00:00Z')},{id:'x',...pair(10,20,'2026-09-30T00:00:00Z')},{id:'y',...pair(10,20)},null,{id:7}],{x:30,y:20});
 a.equal(s.samples.length,2);a.equal(s.samples.find(x=>x.id==='x').actualMinutes,30);a.equal(s.count,2);
});

test('store confirms only server-held positive pairs and rejects unknown or invalid input',()=>temp(s=>{
 s.importSnapshot(fixture());
 a.throws(()=>s.confirmEffort('missing'),/Unknown assignment/);
 for(const id of [undefined,'',{},'__proto__','x'.repeat(1001)])a.throws(()=>s.confirmEffort(id),/Invalid assignment ID/);
 a.throws(()=>s.confirmEffort('task-1'),/positive actual/);
 s.saveState('actual','task-1',0);a.throws(()=>s.confirmEffort('task-1'),/positive actual/);
 s.saveState('actual','task-4',20);a.throws(()=>s.confirmEffort('task-4'),/positive source estimate/);
 a.throws(()=>s.saveState('effortCalibration','task-1',pair(1,99)),/Invalid progress field/);
 a.equal(s.state().effortCalibration,undefined);
 a.equal(s.migrateProgress({effortCalibration:{'task-1':pair(1,99)},actual:{'task-2':5}}),true);a.equal(s.state().effortCalibration,undefined);
 a.equal(s.db.prepare('PRAGMA user_version').get().user_version,1);
}));
test('confirmation freezes the pair through refresh, source removal, restart and backup restore',()=>temp((s0,dir,restart)=>{
 let s=s0;const d=fixture();s.importSnapshot(d);const before=JSON.stringify(s.snapshot().assignments);
 s.saveState('actual','task-1',90);const v=s.confirmEffort('task-1');a.deepEqual({...v,confirmedAt:undefined},{estimateMinutes:60,actualMinutes:90,requirement:'required',confirmedAt:undefined});a.ok(Number.isFinite(Date.parse(v.confirmedAt)));
 for(const [id,n] of [['task-2',60],['task-3',60]]){s.saveState('actual',id,n);s.confirmEffort(id);}
 a.equal(JSON.stringify(s.snapshot().assignments),before,'confirming does not change source estimates or status');
 a.equal(E.summary(s.state().effortCalibration,s.state().actual).ratio,1.5);
 const backup=s.backup();
 const next=fixture();next.assignments[0].estimateMinutes=600;next.assignments.splice(1,1);s.importSnapshot(next);
 a.equal(s.snapshot().assignments.find(x=>x.id==='task-2').archivedFromSource,true);
 s=restart();const state=s.state();a.deepEqual(state.effortCalibration['task-1'],v);a.ok(state.effortCalibration['task-2']);a.equal(E.summary(state.effortCalibration,state.actual).ratio,1.5);
 s.clearEffort('task-2');s.clearEffort('task-3');a.equal(E.summary(s.state().effortCalibration,s.state().actual).count,1);
 s.restore(backup);a.equal(E.summary(s.state().effortCalibration,s.state().actual).count,3);
 a.equal(s.confirmEffort('task-1').estimateMinutes,60,'reconfirm reads the current stored estimate');
}));
test('editing or clearing actual atomically invalidates; clear and reconfirm are explicit',()=>temp(s=>{
 s.importSnapshot(fixture());s.saveState('actual','task-1',30);s.confirmEffort('task-1');
 a.deepEqual(s.saveState('actual','task-1',30),{invalidated:false});a.ok(s.state().effortCalibration['task-1']);
 a.throws(()=>s.saveState('actual','task-1',-5),/Invalid effort/);a.ok(s.state().effortCalibration['task-1'],'a rejected edit keeps the confirmation');
 a.deepEqual(s.saveState('actual','task-1',45),{invalidated:true});a.equal(s.state().effortCalibration,undefined);a.equal(s.state().actual['task-1'],45);
 a.equal(s.history({status:'invalidated'}).total,1);
 s.confirmEffort('task-1');a.deepEqual(s.saveState('actual','task-1',null),{invalidated:true});a.equal(s.state().actual,undefined,'clearing removes the value instead of writing zero');a.equal(s.state().effortCalibration,undefined);
 a.throws(()=>s.confirmEffort('task-1'),/positive actual/);
 s.saveState('actual','task-1',50);s.confirmEffort('task-1');a.deepEqual(s.clearEffort('task-1'),{cleared:true});a.deepEqual(s.clearEffort('task-1'),{cleared:false});
 s.confirmEffort('task-1');a.equal(s.state().effortCalibration['task-1'].actualMinutes,50);
}));
test('confirmations left stale by older code are excluded on read',()=>temp(s=>{
 s.importSnapshot(fixture());for(const id of ['task-1','task-2','task-3']){s.saveState('actual',id,60);s.confirmEffort(id);}
 a.equal(E.summary(s.state().effortCalibration,s.state().actual).sufficient,true);
 s.db.prepare("UPDATE progress SET value='75' WHERE kind='actual' AND id='task-2'").run();
 const r=E.summary(s.state().effortCalibration,s.state().actual);a.equal(r.sufficient,false);a.equal(r.count,2);a.equal(r.excluded.invalidated,1);
}));

test('effort endpoints require session, Origin and CSRF and never accept client pairs',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-effort-api-')),srv=createServer(dir);await new Promise(r=>srv.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+srv.address().port;
 try{srv.store.importSnapshot(fixture());srv.store.saveState('actual','task-1',90);
  const post=(url,body,headers)=>fetch(base+url,{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)});
  a.equal((await post('/api/effort/confirm',{id:'task-1'},{'Content-Type':'application/json'})).status,401);
  const session=await fetch(base+'/api/session'),cookie=session.headers.get('set-cookie').split(';')[0],token=(await session.json()).csrf,ok={Cookie:cookie,'Content-Type':'application/json','x-dayweave-token':token,Origin:base};
  a.equal((await post('/api/effort/confirm',{id:'task-1'},{...ok,Origin:'https://example.com'})).status,403);
  a.equal((await post('/api/effort/confirm',{id:'task-1'},{...ok,'x-dayweave-token':'forged'})).status,403);
  a.equal((await post('/api/effort/clear',{id:'task-1'},{...ok,Origin:undefined})).status,403);
  a.equal(srv.store.state().effortCalibration,undefined);
  for(const body of [{id:'missing'},{id:{toString:'x'}},{id:'__proto__'},'not json','null',{}]){const r=await post('/api/effort/confirm',body,ok);a.equal(r.status,400);}
  a.equal((await post('/api/progress',{kind:'effortCalibration',id:'task-1',value:pair(1,999)},ok)).status,400);
  const r=await post('/api/effort/confirm',{id:'task-1',estimateMinutes:1,actualMinutes:999,confirmedAt:'2000-01-01T00:00:00Z'},ok);a.equal(r.status,200);const {sample}=await r.json();a.equal(sample.estimateMinutes,60);a.equal(sample.actualMinutes,90);a.notEqual(sample.confirmedAt,'2000-01-01T00:00:00Z');
  const exported=await (await fetch(base+'/api/export',{headers:{Cookie:cookie}})).json();a.deepEqual(exported.progress.effortCalibration['task-1'],sample);
  a.deepEqual(await (await post('/api/progress',{kind:'actual',id:'task-1',value:null},ok)).json(),{ok:true,invalidated:true});a.equal(srv.store.state().actual,undefined);
  a.deepEqual(await (await post('/api/effort/clear',{id:'task-1'},ok)).json(),{cleared:false});
  const asset=await fetch(base+'/effort.js');a.equal(asset.status,200);a.match(asset.headers.get('content-type'),/text\/javascript/);a.match(await asset.text(),/PlannerEffort/);
 }finally{await new Promise(r=>srv.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
