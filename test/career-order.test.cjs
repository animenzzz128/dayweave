const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),R=require('../src/phase3.cjs'),{createServer}=require('../src/server.cjs');
const at='2026-10-08T12:00:00Z',evil='<img src=x onerror=alert(1)>';
const role=(id,extra={})=>({id,title:'Synthetic role '+id,market:'US',source:'https://example.com/jobs/'+id,evidence:'Fictional posting '+id,checkedAt:at,startYear:2027,sponsorship:'unknown',fit:'Fictional fit '+id,...extra});
const person=(id,extra={})=>({id,name:'Synthetic person '+id,market:'HK',source:'https://example.com/people/'+id,evidence:'Fictional profile '+id,checkedAt:at,relationship:'unknown',reason:'Fictional reason '+id,...extra});
const snapshot=()=>{const d=structuredClone(require('../examples/snapshot.json'));d.career={...d.career,profile:{summary:'Fictional',startYear:2027,usSponsorshipRequired:true,workEligibility:{}},
 roles:[role('r1'),role('r2',{market:'HK'}),role('r3',{title:evil,startYear:2028}),role('r4',{sponsorship:'yes'}),role('r5',{market:undefined,startYear:undefined,sponsorship:undefined})],
 candidates:[person('p1'),person('p2',{name:evil}),person('p3'),person('p4',{relationship:'unknown'})]};return d;};
const without=(o,id)=>Object.fromEntries(Object.entries(o).filter(([k])=>k!==url(id)));
const url=id=>'https://example.com/'+(id[0]==='r'?'jobs/':'people/')+id;

test('feedbackOrder: saved first, dismissed last, everything else keeps supplied order without mutating input',()=>{
 const items=['a','b','c','d','e','f'].map(id=>({id})),before=JSON.stringify(items),order=st=>R.feedbackOrder(items,x=>st[x.id]).map(x=>x.id);
 const none=R.feedbackOrder(items,()=>undefined);a.deepEqual(none.map(x=>x.id),['a','b','c','d','e','f']);a.notEqual(none,items,'returns a new array');a.equal(none[0],items[0],'items themselves are not copied or changed');
 a.deepEqual(R.feedbackOrder(items).map(x=>x.id),['a','b','c','d','e','f'],'no status function keeps order');a.deepEqual(R.feedbackOrder(undefined),[]);
 a.deepEqual(order({d:'saved'}),['d','a','b','c','e','f']);a.deepEqual(order({a:'dismissed'}),['b','c','d','e','f','a']);
 a.deepEqual(order({a:'applied',b:'pending',c:'connected',d:'contacted',e:'reset',f:'unreviewed'}),['a','b','c','d','e','f'],'other statuses never move items');
 a.deepEqual(order({f:'saved',b:'saved',e:'dismissed',a:'dismissed',c:'reset',d:'garbage'}),['b','f','c','d','a','e'],'ties keep supplied order inside each group');
 a.deepEqual(order({c:'Saved',d:' dismissed',e:'__proto__'}),['a','b','c','d','e','f'],'only the exact explicit statuses count');
 a.equal(JSON.stringify(items),before,'input is not mutated');
 const reversed=[...items].reverse();a.deepEqual(R.feedbackOrder(reversed,x=>({b:'saved'})[x.id]).map(x=>x.id),['b','f','e','d','c','a'],'baseline comes from the supplied list, not IDs');
 a.equal(R.feedbackReason('saved'),'Saved by you');a.equal(R.feedbackReason('dismissed'),'Dismissed by you');for(const s of ['reset','applied','unreviewed',undefined])a.equal(R.feedbackReason(s),'');
});

// Load the real browser scripts in index.html order into a minimal DOM stub.
function load(fetchImpl,pathname='/career'){
 const order=[...fs.readFileSync('src/web/index.html','utf8').matchAll(/<script src="\/([\w.]+)"><\/script>/g)].map(m=>m[1]),files={'core.js':'src/core.cjs','phase2.js':'src/phase2.cjs','phase3.js':'src/phase3.cjs','effort.js':'src/effort.cjs','workload.js':'src/workload.cjs','app.js':'src/web/app.js'};
 a.deepEqual(order,['core.js','phase2.js','phase3.js','effort.js','workload.js','app.js']);
 const nodes=new Map(),node=k=>{if(!nodes.has(k))nodes.set(k,{textContent:'',innerHTML:''});return nodes.get(k);},listeners={};
 // Boot readiness: app.js runs session -> render() once. Resolve on that render's #page write; reject on its error notice.
 let ready,fail;const boot=new Promise((y,n)=>{ready=y;fail=n;});boot.catch(()=>{});
 const watch=(k,prop,on)=>{let v='';Object.defineProperty(node(k),prop,{get:()=>v,set:x=>{v=x;on(x);},enumerable:true});};
 watch('#page','innerHTML',()=>ready());watch('#notice','textContent',x=>{if(x)fail(Error('app bootstrap failed before first render: '+x));});
 const booted=(ms=5000)=>{let t;return Promise.race([boot,new Promise((_,n)=>{t=setTimeout(()=>n(Error('app bootstrap (session + first render) did not finish within '+ms+'ms')),ms);})]).finally(()=>clearTimeout(t));};
 const ctx=vm.createContext({URL,URLSearchParams,Date,Intl,console,window:{addEventListener(){}},document:{querySelector:node,querySelectorAll:()=>[],addEventListener:(t,f)=>{listeners[t]=f;}},location:{pathname,search:'',origin:'http://127.0.0.1'},history:{pushState(){}},fetch:fetchImpl,confirm:()=>false});
 for(const f of order)vm.runInContext(fs.readFileSync(files[f],'utf8'),ctx,{filename:files[f]});
 const view=async search=>{ctx.location.search=search;await vm.runInContext('render()',ctx);return node('#page').innerHTML;};
 const click=(action,id,value)=>listeners.click({target:{closest:s=>s==='a'?null:{dataset:{action,id,value}}},preventDefault(){}});
 return {ctx,node,view,click,booted};
}
const keys=html=>[...html.matchAll(/<article class="panel" data-career="([^"]*)"/g)].map(m=>m[1]);
// Eligibility/relationship line per card: the first <p> after the evidence paragraph inside the details.
const facts=html=>Object.fromEntries([...html.matchAll(/<article class="panel" data-career="([^"]*)"[\s\S]*?<summary>Evidence & eligibility<\/summary><p>[^<]*<\/p><p>([^<]*)<\/p>/g)].map(m=>[m[1],m[2]]));

test('routed Career page orders Roles and People separately from explicit feedback only',async()=>{
 const D=snapshot(),S={},frozen=JSON.stringify(D);
 const {view}=load(async u=>({ok:true,json:async()=>u.endsWith('session')?{csrf:'t'}:{snapshot:D,progress:S}}));await new Promise(r=>setImmediate(r));
 const roles=['r1','r2','r3','r4','r5'].map(url),people=['p1','p2','p3','p4'].map(url);
 let html=await view('?tab=roles');a.deepEqual(keys(html),roles,'no feedback: roles keep source order');a.doesNotMatch(html,/feedback-reason/);a.match(html,/id="career-order"/);
 const baseRoles=facts(html);a.deepEqual(baseRoles[url('r1')],'US sponsorship unverified');a.match(baseRoles[url('r2')],/Local work eligibility unknown/);a.match(baseRoles[url('r3')],/Intended start year needs verification/);a.match(baseRoles[url('r5')],/Local work eligibility unknown/);
 html=await view('?tab=people');a.deepEqual(keys(html),people,'no feedback: people keep source order');const basePeople=facts(html);a.equal(basePeople[url('p1')],'Relationship: unknown');
 a.doesNotMatch(html,/<img/);a.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 const set=(id,status)=>{S.career??={};S.career[url(id)]={status,updatedAt:new Date(Date.parse(at)+Object.keys(S.career).length*1000).toISOString()};};
 const check=async(tab,expected,base)=>{const h=await view('?tab='+tab);a.deepEqual(keys(h),expected.map(url),tab+' order');a.deepEqual(facts(h),base,'eligibility/relationship text never changes with feedback');a.doesNotMatch(h,/<img|<script/);return h;};
 set('r3','saved');html=await check('roles',['r3','r1','r2','r4','r5'],baseRoles);
 a.match(html,/data-feedback="saved"><span class="tag">Saved by you<\/span> Listed first because you saved it\./);a.equal((html.match(/Saved by you/g)||[]).length,1,'saving one role says nothing about others');
 await check('people',['p1','p2','p3','p4'],basePeople);
 set('r1','dismissed');html=await check('roles',['r3','r2','r4','r5','r1'],baseRoles);a.match(html,/Dismissed by you<\/span> Listed last because you dismissed it\. Restore returns it to source order\./);
 a.match(html.slice(html.lastIndexOf('data-career=')),/data-career="https:\/\/example\.com\/jobs\/r1"[\s\S]*data-value="reset">Restore</,'a dismissed role stays reachable with Restore');
 set('r4','pending');set('r2','reset');await check('roles',['r3','r2','r4','r5','r1'],baseRoles);
 set('r5','saved');set('r2','dismissed');await check('roles',['r3','r5','r4','r1','r2'],baseRoles);
 set('r4','applied');await check('roles',['r3','r5','r1','r2'],without(baseRoles,'r4'));
 set('p3','saved');set('p1','dismissed');set('p2','contacted');html=await check('people',['p3','p4','p1'],without(basePeople,'p2'));a.match(html,/Saved by you/);a.match(html,/Dismissed by you/);
 await check('roles',['r3','r5','r1','r2'],without(baseRoles,'r4'));
 for(const id of ['r1','r2','r3','r4','r5','p1','p2','p3'])set(id,'reset');await check('roles',['r1','r2','r3','r4','r5'],baseRoles);await check('people',['p1','p2','p3','p4'],basePeople);
 html=await view('?tab=followups');a.doesNotMatch(html,/id="career-order"|feedback-reason/,'follow-ups and history are not reordered');
 set('r3','saved');a.deepEqual(keys(await view('?tab=roles&q=r5')),[url('r5')],'search still filters after ordering');
 a.equal(JSON.stringify(D),frozen,'rendering never mutates source roles, people, profile or eligibility facts');
 // Complete profile: eligibility lines are exactly the pre-#28 output and nothing is labelled not assessed.
 a.deepEqual(baseRoles,{[url('r1')]:'US sponsorship unverified',[url('r2')]:'Local work eligibility unknown',[url('r3')]:'US sponsorship unverified; Intended start year needs verification',[url('r4')]:'',[url('r5')]:'Local work eligibility unknown; Intended start year needs verification'});
 a.doesNotMatch(await view('?tab=roles'),/career-not-assessed|not assessed|Not assessed/);
 // Missing profile facts: R.eligibility() stays silent, so the page must say "not assessed" instead of showing an empty line.
 // r6 is a US role with unknown sponsorship and no start year; with a complete profile its gaps are visible as before.
 delete S.career;D.career.roles.push(role('r6',{startYear:undefined}));
 html=await view('?tab=roles');a.equal(facts(html)[url('r6')],'US sponsorship unverified; Intended start year needs verification');a.doesNotMatch(html,/career-not-assessed|not assessed/);
 const sp='US sponsorship not assessed: the profile does not say whether sponsorship is required',sy='Start year not assessed: neither the role nor the profile states one',sv='Intended start year needs verification';
 const none='no profile supplied (usSponsorshipRequired, startYear, workEligibility)';
 const variants=[['undefined',()=>{delete D.career.profile;},none],['null',()=>{D.career.profile=null;},none],['missing fields',()=>{D.career.profile={summary:'Fictional',workEligibility:{}};},'usSponsorshipRequired, startYear']];
 const notice=h=>(h.match(/<p class="banner" id="career-not-assessed">([\s\S]*?)<\/p>/)||[])[1];
 for(const [name,apply,missing] of variants){
  apply();delete S.career;html=await view('?tab=roles');const base=facts(html),baseNotice=notice(html);
  a.equal(baseNotice,'<span class="tag warn">Not assessed</span> Profile facts missing: '+missing+' — eligibility for these is not assessed and is not shown as eligible.',name+': page-level notice');
  a.deepEqual(base,{[url('r1')]:sv+'; '+sp,[url('r2')]:'Local work eligibility unknown; '+sv,[url('r3')]:sv+'; '+sp,[url('r4')]:sv,[url('r5')]:'Local work eligibility unknown; '+sy,[url('r6')]:sp+'; '+sy},name+': missing profile keeps gaps visible and labels unassessed facts; r6 is never an empty line');
  const tagged=[...html.matchAll(/data-career="([^"]*)"><span class="tag">[^<]*<\/span><span class="tag">[^<]*<\/span><span class="tag warn">Eligibility not fully assessed<\/span>/g)].map(m=>m[1]);
  a.deepEqual(tagged,['r1','r3','r5','r6'].map(url),name+': affected cards are tagged outside the collapsed details');
  for(const [status,order] of [['saved',['r6','r1','r2','r3','r4','r5']],['dismissed',['r1','r2','r3','r4','r5','r6']],['reset',['r1','r2','r3','r4','r5','r6']]]){
   set('r6',status);html=await view('?tab=roles');a.deepEqual(keys(html),order.map(url),name+' '+status+': order');
   a.deepEqual(facts(html),base,name+' '+status+': not-assessed text never changes with feedback');a.equal(notice(html),baseNotice,name+' '+status+': notice unchanged');
  }
  a.doesNotMatch(await view('?tab=people'),/career-not-assessed/,name+': People has no eligibility notice');
 }
 D.career.profile={summary:'Fictional',startYear:2027,usSponsorshipRequired:false,workEligibility:{}};html=await view('?tab=roles');a.doesNotMatch(html,/career-not-assessed|not assessed/,'a stated "no sponsorship required" is an assessed fact');a.equal(facts(html)[url('r6')],sv);
});

test('routed Career page through the real server: save/dismiss/reset, source refresh and failed career source keep per-item state',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-career-')),server=createServer(dir);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;let cookie='';
 try{
  const store=server.store,d=snapshot();d.career.roles[2].title='Synthetic role r3';d.career.candidates[1].name='Synthetic person p2';store.importSnapshot(d);
  store.saveState('actual','brief-a',30);const other=()=>{const st=store.state();delete st.career;return JSON.stringify({st,snapshot:{...store.snapshot(),career:undefined,candidateHistory:undefined}});},otherBefore=other();
  const bridge=async(u,o={})=>{const r=await fetch(origin+u,{...o,headers:{...(o.headers||{}),Origin:origin,...(cookie?{Cookie:cookie}:{})}});const c=r.headers.get('set-cookie');if(c)cookie=c.split(';')[0];return r;};
  // Wait for the app's own session + first render instead of a fixed delay, so no test render races the bootstrap.
  const {view,click,node,booted}=load(bridge);await booted();
  const roles=async()=>keys(await view('?tab=roles')),people=async()=>keys(await view('?tab=people'));
  a.deepEqual(await roles(),['r1','r2','r3','r4','r5'].map(url));a.deepEqual(await people(),['p1','p2','p3','p4'].map(url));
  await click('career',url('r4'),'saved');a.equal(node('#notice').textContent,'');a.deepEqual(await roles(),['r4','r1','r2','r3','r5'].map(url));
  await click('career',url('r1'),'dismissed');a.deepEqual(await roles(),['r4','r2','r3','r5','r1'].map(url));
  await click('career',url('p4'),'saved');a.deepEqual(await people(),['p4','p1','p2','p3'].map(url));a.deepEqual(await roles(),['r4','r2','r3','r5','r1'].map(url),'People feedback does not move Roles');
  a.equal(store.state().career[url('r4')].status,'saved');a.equal(other(),otherBefore,'feedback writes only career progress');
  // Refresh: new source order, tracking query on a saved URL, a removed dismissed role and a removed saved person.
  const next=snapshot();next.generatedAt='2026-10-09T12:00:00Z';next.career.roles=[role('r5'),role('r3'),role('r4',{source:url('r4')+'?utm_source=x'}),role('r2'),role('r6')];next.career.candidates=[person('p3'),person('p2'),person('p1')];store.importSnapshot(next);
  a.deepEqual(await roles(),['r4','r5','r3','r2','r6'].map(url),'state follows canonical URLs; baseline is the refreshed source order; removed dismissed role leaves Roles');
  let html=await view('?tab=history');a.ok(keys(html).includes(url('r1')),'removed dismissed role stays in History');
  a.deepEqual(await people(),['p3','p2','p1'].map(url),'a removed person leaves People even if saved');
  html=await view('?tab=followups');a.ok(keys(html).includes(url('p4')),'removed saved person stays in Follow-ups');
  // A saved role that disappears from source stays first and is labelled retained.
  const third=structuredClone(next);third.career.roles=third.career.roles.filter(x=>x.id!=='r4');store.importSnapshot(third);
  html=await view('?tab=roles');a.deepEqual(keys(html),['r4','r5','r3','r2','r6'].map(url));a.match(html,/data-career="https:\/\/example\.com\/jobs\/r4"><span class="tag">US<\/span><span class="tag">saved<\/span><span class="tag warn">Removed from latest source; retained<\/span>/);
  // Failed career source keeps prior research and every per-item state.
  const failed=structuredClone(third);failed.sources.push({id:'career',name:'Career research',status:'failed',lastSuccess:null,note:'Synthetic failure'});failed.career={...failed.career,roles:[],candidates:[]};store.importSnapshot(failed);
  html=await view('?tab=roles');a.deepEqual(keys(html),['r4','r5','r3','r2','r6'].map(url),'failed career refresh keeps research and order');a.match(html,/Research refresh failed; retained recommendations may be stale/);
  await click('career',url('r4'),'reset');await click('career',url('p4'),'reset');a.deepEqual(await roles(),['r5','r3','r2','r6'].map(url),'reset of a removed role returns it to History only');
  a.equal(store.state().career[url('r4')].status,'reset');a.equal(store.snapshot().career.roles.length,6,'source records are never removed by feedback');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
