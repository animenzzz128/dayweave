const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('routed views escape query text, handle invalid dates and keep home compact',async()=>{
 const D=structuredClone(require('../examples/snapshot.json')),nodes=new Map(),node=k=>{if(!nodes.has(k))nodes.set(k,{textContent:'',innerHTML:''});return nodes.get(k);};
 const ctx=vm.createContext({URLSearchParams,Date,Intl,console,window:{addEventListener(){}},document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}},location:{pathname:'/home',search:''},history:{pushState(){}},fetch:async url=>({ok:true,json:async()=>url.endsWith('session')?{csrf:'test'}:{snapshot:D,progress:{}}})});
 for(const file of ['src/core.cjs','src/phase2.cjs','src/phase3.cjs','src/effort.cjs','src/workload.cjs','src/web/app.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});await new Promise(r=>setImmediate(r));
 a.match(node('#page').innerHTML,/Next seven days/);a.doesNotMatch(node('#page').innerHTML,/Requirements, source and checklist/);
 const query=new URLSearchParams({tab:'"><script>evil()</script>'}).toString();ctx.query=query;
 const html=vm.runInContext('coursework(new URLSearchParams(query))',ctx);a.doesNotMatch(html,/<script>/);a.match(html,/&lt;script&gt;/);
 a.doesNotThrow(()=>vm.runInContext("timetable(new URLSearchParams('date=invalid'))",ctx));
 ctx.location.pathname='/email';await vm.runInContext('render()',ctx);a.match(node('#page').innerHTML,/No inbox is scanned/);
});
test('page-order scripts render effort controls and the Settings calibration summary',async()=>{
 const order=[...fs.readFileSync('src/web/index.html','utf8').matchAll(/<script src="\/([\w.]+)"><\/script>/g)].map(m=>m[1]),files={'core.js':'src/core.cjs','phase2.js':'src/phase2.cjs','phase3.js':'src/phase3.cjs','effort.js':'src/effort.cjs','workload.js':'src/workload.cjs','app.js':'src/web/app.js'};
 a.deepEqual(order,['core.js','phase2.js','phase3.js','effort.js','workload.js','app.js']);
 const D=structuredClone(require('../examples/snapshot.json')),evil='<img src=x onerror=alert(1)>';D.assignments=[['t1',60,'required'],['t2',40,'choice'],['t3',30,'uncertain'],['t4',20,'required']].map(([id,estimateMinutes,requirement])=>({...D.assignments[0],id,title:id==='t4'?evil:'Task '+id,estimateMinutes,requirement}));
 const at='2026-10-08T12:00:00Z',S={actual:{t1:60,t2:60,t4:0},effortCalibration:{t1:{estimateMinutes:60,actualMinutes:60,requirement:'required',confirmedAt:at},t2:{estimateMinutes:40,actualMinutes:60,requirement:'choice',confirmedAt:at},[evil]:{estimateMinutes:10,actualMinutes:5,requirement:evil,confirmedAt:'bad'}}};
 const nodes=new Map(),node=k=>{if(!nodes.has(k))nodes.set(k,{textContent:'',innerHTML:''});return nodes.get(k);};
 const ctx=vm.createContext({URLSearchParams,Date,Intl,console,window:{addEventListener(){}},document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}},location:{pathname:'/settings',search:''},history:{pushState(){}},fetch:async url=>({ok:true,json:async()=>url.endsWith('session')?{csrf:'test'}:url.endsWith('health')?{runs:[],backups:[]}:{snapshot:D,progress:S}})});
 for(const f of order)vm.runInContext(fs.readFileSync(files[f],'utf8'),ctx,{filename:files[f]});await new Promise(r=>setImmediate(r));
 let html=node('#page').innerHTML;a.match(html,/Insufficient data<\/strong> · 2 of 3 confirmed samples needed/);a.match(html,/zero actual minutes/);a.match(html,/malformed sample/);a.match(html,/source record removed; sample retained/);a.doesNotMatch(html,/<img/);a.match(html,/not a submission record/);
 D.assignments[0].archivedFromSource=true;await vm.runInContext('render()',ctx);html=node('#page').innerHTML;a.match(html,/Task t1 \(source record removed; sample retained\)/,'an archived source record is labelled retained');a.doesNotMatch(html,/Task t2 \(source record removed/);delete D.assignments[0].archivedFromSource;
 S.actual.t3=60;S.effortCalibration.t3={estimateMinutes:30,actualMinutes:60,requirement:'uncertain',confirmedAt:at};await vm.runInContext('render()',ctx);html=node('#page').innerHTML;a.match(html,/<strong class="metric">1\.5×<\/strong> median actual\/estimate across 3 confirmed samples/);
 S.actual.t3=61;await vm.runInContext('render()',ctx);html=node('#page').innerHTML;a.match(html,/Insufficient data/);a.match(html,/1 confirmation no longer matches actual minutes/);
 html=vm.runInContext("coursework(new URLSearchParams(''))",ctx);
 const input=id=>html.match(new RegExp('data-progress="actual" data-id="'+id+'" value="([^"]*)"'))[1];
 a.equal(input('t1'),'60');a.equal(input('t4'),'0');D.assignments.push({...D.assignments[0],id:'t5',title:'Missing',estimateMinutes:10});html=vm.runInContext("coursework(new URLSearchParams(''))",ctx);a.equal(input('t5'),'','missing actual is not shown as zero');
 a.match(html,/Selectable \(choice\)/);a.match(html,/Requirement uncertain/);a.match(html,/Reconfirm effort/);a.match(html,/no longer matches actual minutes/);a.match(html,/Zero actual minutes are saved/);a.doesNotMatch(html,/<img/);
});
