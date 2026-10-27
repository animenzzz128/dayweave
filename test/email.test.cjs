const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const M=require('../src/email.cjs'),C=require('../src/core.cjs'),P=require('../src/phase2.cjs'),{Store}=require('../src/store.cjs');
const google=()=>structuredClone(require('../examples/google-snapshot.json'));
const at='2026-10-07T12:00:00Z',ago=h=>new Date(Date.parse(at)-h*3600000).toISOString();
const msg=(id,h,extra={})=>({id,threadId:'t-'+id,receivedAt:ago(h),from:'Fictional <someone@example.com>',subject:'Subject '+id,snippet:'Snippet '+id,...extra});
const record=(extra={})=>({enabled:true,provider:'google',account:'student@example.com',sourceId:'gmail',capabilities:{read:true,send:false},checkedAt:at,
 request:{query:'in:inbox newer_than:7d',windowDays:7,limit:50,from:ago(168),to:at},coverage:{status:'complete',morePages:false,errors:[]},messages:[msg('m1',1),msg('m2',5)],...extra});

test('legacy snapshots: a missing email record is unknown and enabled:false stays disabled',()=>{
 a.equal(M.normalize(undefined),null);a.equal(M.health(undefined).state,'unknown');
 a.deepEqual(M.normalize({enabled:false}),{enabled:false});a.equal(M.health({enabled:false}).state,'disabled');
 const legacy=structuredClone(require('../examples/snapshot.json'));a.equal(C.mergeSnapshot(null,legacy).email.enabled,false);
 delete legacy.email;a.equal(C.mergeSnapshot(null,legacy).email,undefined,'no email record stays unknown, never an empty inbox');
});

test('the read scope is bounded to seven days, 50 messages, explicit offsets and stable IDs',()=>{
 a.doesNotThrow(()=>M.normalize(record()));
 const bad=[[{request:{...record().request,windowDays:8}},/1–7 days/],[{request:{...record().request,limit:51}},/1–50/],[{request:{...record().request,query:''}},/query/],
  [{request:{...record().request,from:ago(24*9)}},/within the requested days/],[{request:{...record().request,limit:1}},/limit/],
  [{messages:[msg('m1',1,{receivedAt:'2026-10-07T11:00:00'})]},/explicit offset/],[{messages:[msg('m1',200)]},/outside the requested window/],
  [{messages:[{...msg('m1',1),id:''}]},/stable message and thread IDs/],[{messages:[{...msg('m1',1),threadId:undefined}]},/stable/],[{messages:[{...msg('m1',1),id:'__proto__'}]},/stable/],
  [{checkedAt:'yesterday'},/checkedAt/],[{provider:'microsoft'},/google/],[{account:''},/account/],[{sourceId:undefined},/sourceId/],
  [{coverage:{status:'done'}},/coverage status/],[{coverage:{status:'complete',morePages:'no'}},/morePages/],[{messages:'none'},/list/]];
 for(const [extra,re] of bad)a.throws(()=>M.normalize(record(extra)),re,JSON.stringify(extra).slice(0,80));
 a.throws(()=>M.normalize(record({coverage:{status:'failed'}})),/failed email collection cannot carry new messages/);
});

test('mail stays read-only: send, delete, labels and modify capabilities are rejected; read is never send',()=>{
 for(const k of ['send','delete','labels','modify'])for(const v of [true,'yes',1])a.throws(()=>M.normalize(record({capabilities:{read:true,[k]:v}})),/read-only/);
 a.throws(()=>M.normalize(record({capabilities:{read:false}})),/read access/);
 a.deepEqual(M.normalize(record({capabilities:undefined})).capabilities,{read:true,send:false,delete:false,labels:false,modify:false});
});

test('schema injection: unknown fields, bodies and attachment content are dropped; links are https Gmail only',()=>{
 const raw=JSON.parse(JSON.stringify(record({messages:[{...msg('m1',1),body:'<html>full body</html>',attachments:[{filename:'a.pdf',data:'QUJD'}],constructor:'x',labels:['INBOX','INBOX','<b>x</b>'],link:'https://mail.google.com/mail/#inbox/fictional-1'}]})).replace('"constructor":"x"','"constructor":"x","__proto__":{"polluted":true}'));
 const m=M.normalize(raw).messages[0];a.deepEqual(Object.keys(m).sort(),['attachmentCount','from','hasAttachments','id','labels','link','receivedAt','snippet','subject','threadId','unread']);
 a.deepEqual(m.labels,['INBOX','<b>x</b>']);a.equal(({}).polluted,undefined);a.equal(m.link,'https://mail.google.com/mail/#inbox/fictional-1');
 for(const link of ['javascript:alert(1)','http://mail.google.com/x','https://evil.example.com/','https://user:pw@mail.google.com/','data:text/html,x','not a url'])a.throws(()=>M.normalize(record({messages:[msg('m1',1,{link})]})),/link/i,link);
 for(const field of ['subject','snippet','from'])a.throws(()=>M.normalize(record({messages:[msg('m1',1,{[field]:{html:'x'}})]})),/must be text/);
 a.throws(()=>M.normalize(record({messages:[msg('m1',1,{unread:'yes'})]})),/unread/);a.throws(()=>M.normalize(record({messages:[msg('m1',1,{labels:'INBOX'})]})),/labels/);
 const long=M.normalize(record({messages:[msg('m1',1,{snippet:'x'.repeat(5000)})]})).messages[0].snippet;a.equal(long.length,1000);a.ok(long.endsWith('…'));
});

test('completeness needs an explicit last page and no errors; one page at the limit is never complete',()=>{
 const cov=extra=>M.normalize(record(extra)).coverage;
 a.equal(cov({}).complete,true);
 a.deepEqual([cov({coverage:{status:'complete'}}).status,cov({coverage:{status:'complete'}}).complete,cov({coverage:{status:'complete'}}).morePages],['partial',false,null],'unknown page state is partial');
 a.equal(cov({coverage:{status:'complete',morePages:true}}).truncated,true);
 a.equal(cov({coverage:{status:'complete',morePages:false,errors:['one label failed']}}).complete,false);
 const full=Array.from({length:2},(_,i)=>msg('n'+i,i+1));a.equal(cov({request:{...record().request,limit:2},coverage:{status:'complete'},messages:full}).truncated,true);
 a.equal(cov({request:{...record().request,limit:2},coverage:{status:'complete',morePages:false},messages:full}).complete,true);
});

test('merge: failures retain prior messages and last complete read; first failure is not an empty inbox; partial keeps unreturned messages',()=>{
 const first=M.merge(null,record(),[]);a.equal(first.lastSuccess,at);a.equal(first.messages.length,2);a.equal(first.retained,false);
 const failedAt='2026-10-08T12:00:00Z',failed=M.merge(first,record({checkedAt:failedAt,coverage:{status:'failed',errors:['Connector timed out']},messages:[]}),[]);
 a.equal(failed.coverage.status,'failed');a.equal(failed.lastSuccess,at);a.equal(failed.checkedAt,failedAt);a.equal(failed.retainedFrom,at);a.ok(failed.messages.every(m=>m.retained));a.deepEqual(failed.coverage.errors,['Connector timed out']);
 a.equal(M.merge(failed,record({checkedAt:'2026-10-09T12:00:00Z',coverage:{status:'failed'},messages:[]}),[]).retainedFrom,at,'retained age does not reset on repeated failures');
 const h=M.health(failed,failedAt);a.equal(h.state,'failed');a.equal(h.retained,2);
 const none=M.merge(null,record({coverage:{status:'failed'},messages:[]}),[{id:'gmail',status:'failed',note:'Sign-in expired'}]);
 a.deepEqual([none.messages.length,none.lastSuccess,none.coverage.errors[0],M.health(none,at).state],[0,null,'Sign-in expired','failed']);
 const viaSource=M.merge(first,record({checkedAt:failedAt,messages:[msg('m9',1)]}),[{id:'gmail',status:'failed'}]);a.equal(viaSource.coverage.status,'failed','a failed gmail source wins over a complete-looking record');a.deepEqual(viaSource.messages.map(m=>m.id),['m1','m2']);
 const partial=M.merge(first,record({checkedAt:at,coverage:{status:'partial',morePages:null},messages:[msg('m1',1),msg('m3',2)]}),[]);
 a.deepEqual(partial.messages.map(m=>[m.id,!!m.retained]),[['m1',false],['m3',false],['m2',true]]);a.equal(partial.lastSuccess,at);a.equal(partial.retained,true);
 const done=M.merge(partial,record({messages:[msg('m3',2)]}),[]);a.deepEqual(done.messages.map(m=>m.id),['m3'],'a complete read replaces the window');a.equal(done.retained,false);
 const other=M.merge(first,record({account:'other@example.com',coverage:{status:'failed'},messages:[]}),[]);a.equal(other.messages.length,0,'another account keeps nothing');a.equal(other.lastSuccess,null);
});

test('repeated imports and duplicate IDs dedupe; nothing turns email into coursework, todos or dates',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-email-')),s=new Store(dir);try{
  const d=google(),dup=google();dup.email.messages.push({...dup.email.messages[0]});
  s.importSnapshot(dup);s.importSnapshot(d);s.importSnapshot(d);const e=s.snapshot().email;
  a.deepEqual(e.messages.map(m=>m.id),['msg-001','msg-002','msg-003']);a.equal(new Set(e.messages.map(m=>m.id)).size,3);
  a.deepEqual(s.snapshot().assignments.map(x=>x.id),d.assignments.map(x=>x.id));a.deepEqual(s.snapshot().proposals.map(x=>x.id),d.proposals.map(x=>x.id));a.deepEqual(s.state(),{});
 }finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('a Gmail failure keeps prior mail, labels it, and leaves verified Google Calendar coverage and proposals alone',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-email-fail-')),s=new Store(dir);try{
  const d=google();s.importSnapshot(d);const next=google();next.generatedAt='2026-10-07T13:00:00Z';next.email.checkedAt='2026-10-07T13:00:00Z';next.email.request.to='2026-10-07T13:00:00Z';next.email.coverage={status:'failed',errors:['Fictional connector error']};next.email.messages=[];next.sources.find(x=>x.id==='gmail').status='failed';
  s.importSnapshot(next);const r=s.snapshot();
  a.equal(r.email.coverage.status,'failed');a.equal(r.email.messages.length,3);a.ok(r.email.messages.every(m=>m.retained));a.equal(r.email.lastSuccess,d.email.checkedAt);
  a.equal(r.sources.find(x=>x.id==='gmail').lastSuccess,'2026-10-07T12:00:00Z');
  a.equal(r.calendarCoverage.complete,true);a.equal(r.proposals.length,1);a.deepEqual(P.errors(r.proposals[0],r,'2026-10-07T13:00:00Z'),[]);
 }finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}
 const d=google();d.sources.push({id:'outlook',name:'Retired Outlook',status:'failed'});a.equal(C.mergeSnapshot(C.mergeSnapshot(null,google()),d).calendarCoverage.complete,true,'an inactive legacy Outlook failure does not touch Google coverage');
 const bad=google();delete bad.sources.find(x=>x.id==='gmail').id;bad.sources=bad.sources.filter(x=>x.id);a.throws(()=>C.validate(bad),/Email sourceId must be listed/);
});

const page=async(D,pathname)=>{const order=[...fs.readFileSync('src/web/index.html','utf8').matchAll(/<script src="\/([\w.]+)"><\/script>/g)].map(m=>m[1]),files={'core.js':'src/core.cjs','phase2.js':'src/phase2.cjs','phase3.js':'src/phase3.cjs','effort.js':'src/effort.cjs','workload.js':'src/workload.cjs','email.js':'src/email.cjs','app.js':'src/web/app.js'};
 a.deepEqual(order,['core.js','phase2.js','phase3.js','effort.js','workload.js','email.js','app.js']);const nodes=new Map(),node=k=>{if(!nodes.has(k))nodes.set(k,{textContent:'',innerHTML:''});return nodes.get(k);};
 const ctx=vm.createContext({URL,URLSearchParams,Date,Intl,console,encodeURIComponent,window:{addEventListener(){}},document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}},location:{pathname,search:''},history:{pushState(){}},fetch:async url=>({ok:true,json:async()=>url.endsWith('session')?{csrf:'test'}:{snapshot:D,progress:{}}})});
 for(const f of order)vm.runInContext(fs.readFileSync(files[f],'utf8'),ctx,{filename:files[f]});await new Promise(r=>setImmediate(r));return {html:()=>node('#page').innerHTML,ctx};};

test('page-order scripts render the Gmail snapshot with escaped content, health, access limits and honest empty states',async()=>{
 const evil='<img src=x onerror=alert(1)>',D=C.mergeSnapshot(null,google());D.email.messages[0]={...D.email.messages[0],subject:evil,snippet:evil,from:evil,labels:[evil],link:'https://mail.google.com/mail/#inbox/fictional-1'};
 let p=await page(D,'/email'),html=p.html();
 a.doesNotMatch(html,/<img/);a.match(html,/&lt;img src=x/);a.match(html,/Last collected/);a.match(html,/a snapshot, not live access/);a.match(html,/Stale · over 26 hours old/,'fixed demo dates are stale');
 a.match(html,/Complete for the requested window: 3 messages/);a.match(html,/3 messages in 2 threads/);a.match(html,/Send: disabled/);a.match(html,/Delete: disabled/);a.match(html,/Labels and archive: disabled/);a.match(html,/does not create todos, deadlines or calendar changes from email/);
 a.match(html,/href="https:\/\/mail\.google\.com\/mail\/#inbox\/fictional-1" target="_blank" rel="noopener noreferrer"/);a.match(html,/Attachments \(1\) · not downloaded/);
 D.email.messages[0].link='https://evil.example.com/';await p.ctx.render();a.doesNotMatch(p.html(),/evil\.example/,'a stored non-Gmail link is not rendered');D.email.messages[0].link=null;a.match(html,/query <code>in:inbox newer_than:7d<\/code>/);
 const failed=M.merge(D.email,{...google().email,checkedAt:'2026-10-07T13:00:00Z',request:{...google().email.request,to:'2026-10-07T13:00:00Z'},coverage:{status:'failed',errors:['Fictional <b>error</b>']},messages:[]},[]);D.email=failed;
 await p.ctx.render();html=p.html();a.match(html,/Collection failed/);a.match(html,/Showing 3 messages retained from the collection/);a.match(html,/Retained from an earlier collection/);a.match(html,/Fictional &lt;b&gt;error&lt;\/b&gt;/);
 D.email=M.merge(null,{...google().email,coverage:{status:'failed'},messages:[]},[]);await p.ctx.render();html=p.html();a.match(html,/No messages could be read\. This is not an empty inbox/);a.doesNotMatch(html,/No inbox messages in the requested window/);
 D.email=M.merge(null,{...google().email,coverage:{status:'partial',morePages:null},messages:[]},[]);await p.ctx.render();html=p.html();a.match(html,/whether more pages exist is unknown/);a.match(html,/coverage is partial, so the inbox may not be empty/);
 D.email={enabled:false};await p.ctx.render();a.match(p.html(),/Email is disabled in this snapshot\. No inbox is scanned/);
 delete D.email;await p.ctx.render();a.match(p.html(),/Status unknown/);a.match(p.html(),/This is not an empty inbox/);
 p=await page(C.mergeSnapshot(null,google()),'/home');html=p.html();a.match(html,/id="home-email"/);a.match(html,/3 messages<\/strong> in the last collected snapshot \(1 unread\)/);a.match(html,/not live access/);
});

test('review fixes: an omitted email record with a down source is failed/retained; enabled must be boolean',()=>{
 const old=C.mergeSnapshot(null,google());
 for(const status of ['failed','unavailable','partial']){const next=google();next.generatedAt='2026-10-08T12:00:00Z';next.sources.find(s=>s.id==='gmail').status=status;delete next.email;
  const e=C.mergeSnapshot(old,next).email,h=M.health(e,'2026-10-08T13:00:00Z');
  a.equal(e.coverage.status,'failed',status);a.equal(e.coverage.complete,false);a.equal(h.state,'failed');a.equal(h.retained,3);a.ok(e.messages.every(m=>m.retained));
  a.equal(e.checkedAt,'2026-10-08T12:00:00Z','attempt time');a.equal(e.retainedFrom,'2026-10-07T12:00:00Z');a.equal(e.lastSuccess,'2026-10-07T12:00:00Z');a.match(e.coverage.errors[0],new RegExp('Gmail source '+status));}
 const ok=google();ok.generatedAt='2026-10-08T12:00:00Z';delete ok.email;const kept=C.mergeSnapshot(old,ok).email;a.equal(kept.coverage.status,'complete','an ok source without a record keeps the earlier record');a.equal(kept.checkedAt,'2026-10-07T12:00:00Z','with its own time, so it ages to stale');
 const gone=google();delete gone.email;gone.sources=gone.sources.filter(s=>s.id!=='gmail');a.throws(()=>C.mergeSnapshot(old,gone),/Email sourceId must be listed/,'an enabled record never loses its source silently');
 const first=google();first.sources.find(s=>s.id==='gmail').status='unavailable';const f=C.mergeSnapshot(null,first).email;a.equal(f.coverage.status,'failed');a.deepEqual(f.messages,[],'a first failure carries no messages');
 for(const v of ['true',1,'false',0,null,undefined])a.throws(()=>M.normalize({...record(),enabled:v}),/enabled must be true or false/,String(v));
 a.deepEqual(M.normalize({enabled:false,note:'Legacy'}),{enabled:false,note:'Legacy'});
});

test('message triage is validated and kept through a merge, bodies are still dropped, and owner overrides are checked',()=>{
 const d=google(),m=d.email.messages[0];m.body='full text that must never be stored';
 m.triage={category:'reply',priority:'high',summary:'Team asks who presents the recommendation.',action:'Reply before Friday.',dueAt:'2026-10-09T21:00:00Z'};
 const e=M.normalize(d.email);a.deepEqual(e.messages.find(x=>x.id===m.id).triage,{category:'reply',priority:'high',summary:'Team asks who presents the recommendation.',action:'Reply before Friday.',dueAt:'2026-10-09T21:00:00Z'});
 a.equal('body' in e.messages.find(x=>x.id===m.id),false);a.equal(e.messages.find(x=>x.id!==m.id).triage,undefined,'triage is optional');
 a.equal(M.normalize({...d.email,messages:[{...m,triage:{...m.triage,summary:'x'.repeat(400)}}]}).messages[0].triage.summary.length,300);
 for(const bad of [{...m.triage,category:'spam'},{...m.triage,priority:'urgent'},{...m.triage,dueAt:'2026-10-09'},'reply'])a.throws(()=>M.normalize({...d.email,messages:[{...m,triage:bad}]}),/triage/);
 a.equal(M.merge(null,d.email,d.sources,d.generatedAt).messages.find(x=>x.id===m.id).triage.category,'reply');
 // The Chinese version keeps only summary and action, with the same limits; anything else in it is dropped.
 const zh={summary:'团队在问由谁做推荐汇报。',action:'周五前回复。',body:'never kept'};
 a.deepEqual(M.normalize({...d.email,messages:[{...m,triage:{...m.triage,zh}}]}).messages[0].triage.zh,{summary:zh.summary,action:zh.action});
 a.equal(M.normalize({...d.email,messages:[{...m,triage:{...m.triage,zh:{summary:'长'.repeat(400)}}}]}).messages[0].triage.zh.summary.length,300);
 for(const bad of ['中文',{summary:3}])a.throws(()=>M.normalize({...d.email,messages:[{...m,triage:{...m.triage,zh:bad}}]}),/triage/);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-triage-')),s=new Store(dir);try{
  s.saveState('emailTriage',m.id,{category:'info',handled:true,at});a.equal(s.state().emailTriage[m.id].handled,true);s.saveState('emailTriage',m.id,null);
  for(const bad of [{category:'spam'},{handled:'yes'},{note:'x'},'info'])a.throws(()=>s.saveState('emailTriage',m.id,bad),/triage override/);
 }finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}});
