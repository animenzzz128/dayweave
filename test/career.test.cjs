const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const K=require('../src/career.cjs'),{Store}=require('../src/store.cjs');
const withStore=fn=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-career-')),s=new Store(dir);try{return fn(s);}finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}};
const withStoreAsync=async fn=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-career-')),s=new Store(dir);try{return await fn(s);}finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}};
const snap=()=>{const d=structuredClone(require('../examples/snapshot.json'));d.career={...d.career,roles:[{id:'r1',title:'Acme · Product Operations Associate',market:'US',source:'https://jobs.example.com/r1',fit:'Fits ops track',evidence:'Posting page read'},{id:'r2',title:'Beta · Analyst',market:'HK',source:'https://jobs.example.com/r2'}],candidates:[{id:'p1',name:'Sam Example',source:'https://www.linkedin.com/in/sam-example',reason:'Alumnus'}]};return d;};
const job=(x={})=>({title:'AI Product Manager, New Grad',company:'Example Labs',url:'https://boards.example.com/jobs/1',market:'US',track:'ai-pm',...x});

test('jobs need a title and company, take known values only, and record stage changes on their timeline',()=>{
 const now=new Date('2026-10-28T15:00:00Z');
 for(const [bad,re] of [[{title:' '},/title/i],[{company:''},/company/i],[{stage:'hired'},/stage/],[{market:'Mars'},/market/],[{deadline:'10/30'},/deadline/],[{url:'javascript:alert(1)'},/https/],[{track:'finance'},/track/]])a.throws(()=>K.cleanJob(job(bad),{id:'j',now}),re,JSON.stringify(bad));
 const j=K.cleanJob(job(),{id:'j',now});a.equal(j.stage,'saved');a.equal(j.appliedAt,null);a.deepEqual(j.timeline.map(e=>e.kind),['added']);a.deepEqual(j.origin,{type:'manual'});
 const later=new Date('2026-10-29T15:00:00Z'),k=K.cleanJob({...j,stage:'applied',event:'Submitted on company site'},{existing:j,id:'j',now:later});
 a.equal(k.appliedAt,later.toISOString());a.deepEqual(k.timeline.map(e=>e.kind),['added','stage','note']);a.equal(k.version,2);a.equal(k.createdAt,j.createdAt);
 const m=K.cleanJob({...k,stage:'interview'},{existing:k,id:'j',now:new Date('2026-11-02T15:00:00Z')});a.equal(m.appliedAt,k.appliedAt,'the first application date is kept');
});

test('next actions: near deadlines, due next steps, quiet applications and contact follow-ups, earliest first',()=>{
 const now=new Date('2026-10-20T12:00:00Z'),jobs={
  a:K.cleanJob(job({deadline:'2026-10-30'}),{id:'a',now}),
  b:K.cleanJob(job({deadline:'2026-12-30',url:''}),{id:'b',now}),
  c:K.cleanJob(job({stage:'applied',url:''}),{id:'c',now}),
  d:K.cleanJob(job({stage:'interview',nextStep:'Send thank-you note',nextDate:'2026-10-27',url:''}),{id:'d',now}),
  e:K.cleanJob(job({stage:'rejected',deadline:'2026-10-28',url:''}),{id:'e',now})};
 const contacts={p:K.cleanContact({name:'Sam',nextFollowUp:'2026-10-25'},{id:'p',now})},acts=K.nextActions(jobs,contacts,'2026-10-28');
 a.deepEqual(acts.map(x=>x.kind+':'+x.id),['followup:p','next:d','deadline:a','stale:c']);a.equal(acts.find(x=>x.id==='c').days,8);
 a.deepEqual(K.stats(jobs,'2026-10-28'),{total:5,open:4,sent:3,week:0,replied:2,interviews:1});
});

test('store: only the dedicated methods write the tracker; duplicates by link are refused; removal unlinks contacts',()=>withStore(s=>{
 s.importSnapshot(snap());
 a.throws(()=>s.saveState('careerJob','x',job()),/Invalid progress field/);
 const {job:j}=s.saveCareer('job',job());a.match(j.id,/^job-[0-9a-f]{12}$/);
 a.throws(()=>s.saveCareer('job',job({url:'https://boards.example.com/jobs/1?utm=x#top'})),/already in your tracker/);
 const edited=s.saveCareer('job',{...j,stage:'applied'}).job;a.equal(edited.version,2);a.ok(edited.appliedAt);
 a.throws(()=>s.saveCareer('job',{...j,id:'job-missing'}),/Unknown job/);
 a.throws(()=>s.saveCareer('contact',{name:'X',jobId:'job-missing'}),/not in your tracker/);
 const {contact:c}=s.saveCareer('contact',{name:'Sam Example',jobId:j.id,relation:'alumni'});
 s.removeCareer('job',j.id);a.equal(s.state().careerJob[j.id],undefined);a.equal(s.state().careerContact[c.id].jobId,null);
 a.equal(s.history({query:''}).items.some(x=>x.kind==='career'&&x.status==='removed'),true,'the audit log keeps the removed record');
}));

test('research is copied into the tracker once; dismissed items stay out and owner marks carry over',()=>withStore(s=>{
 a.equal(s.migrateCareer(),null,'nothing to copy before the first snapshot');
 s.importSnapshot(snap());s.saveState('career','r2',{status:'dismissed',at:'2026-10-19T00:00:00Z'});s.saveState('career','r1',{status:'applied',at:'2026-10-18T00:00:00Z'});
 a.deepEqual(s.migrateCareer(new Date('2026-10-28T00:00:00Z')),{jobs:1,contacts:1});
 const jobs=Object.values(s.state().careerJob);a.equal(jobs.length,1);a.equal(jobs[0].company,'Acme');a.equal(jobs[0].title,'Product Operations Associate');a.equal(jobs[0].stage,'applied');a.equal(jobs[0].origin.type,'research');
 a.equal(Object.values(s.state().careerContact)[0].name,'Sam Example');
 s.removeCareer('job',jobs[0].id);a.equal(s.migrateCareer(),null,'a second run never re-adds what the owner removed');a.equal(Object.keys(s.state().careerJob||{}).length,0);
}));

test('source settings: known boards only, short board names, duplicates folded, written only by the settings route',()=>withStore(s=>{
 for(const [bad,re] of [[{watch:[{ats:'workday',slug:'acme'}]},/job board/],[{watch:[{ats:'greenhouse',slug:'https://boards.greenhouse.io/acme'}]},/short name/],[{watch:Array(61).fill({ats:'lever',slug:'x'})},/At most/]])a.throws(()=>s.saveCareerSettings(bad),re);
 const {settings}=s.saveCareerSettings({watch:[{ats:'greenhouse',slug:'acme',company:'Acme'},{ats:'greenhouse',slug:'ACME'},{ats:'lever',slug:'beta-co',market:'SG'}],keywords:[' product ','',' strategy'],sources:{linkedin:false,'bad key!':true}});
 a.deepEqual(settings.watch.map(w=>w.ats+':'+w.slug+':'+w.market),['greenhouse:acme:US','lever:beta-co:SG']);a.deepEqual(settings.keywords,['product','strategy']);a.deepEqual(settings.sources,{linkedin:false});
 a.throws(()=>s.saveState('careerSettings','main',settings),/Invalid progress field/);a.equal(s.state().careerSettings.main.watch.length,2);
}));

const CF=require('../src/career-fetch.cjs');
const BOARDS={
 'https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true':{jobs:[{id:1,title:'Product Manager, AI (New Grad 2027)',absolute_url:'https://boards.greenhouse.io/acme/jobs/1',location:{name:'San Francisco, CA'},updated_at:'2026-10-27T00:00:00Z',content:'&lt;p&gt;Build LLM features&lt;/p&gt;'},{id:2,title:'Senior Software Engineer',absolute_url:'https://boards.greenhouse.io/acme/jobs/2',location:{name:'Remote'}}]},
 'https://api.lever.co/v0/postings/beta?mode=json':[{id:'b1',text:'Strategy & Operations Associate',hostedUrl:'https://jobs.lever.co/beta/b1',categories:{location:'Shanghai'},createdAt:Date.parse('2026-10-20T00:00:00Z'),descriptionPlain:'Cross-market ops'}],
 'https://api.ashbyhq.com/posting-api/job-board/gamma':{jobs:[{id:'g1',title:'Business Operations Analyst',jobUrl:'https://jobs.ashbyhq.com/gamma/g1',location:'Hong Kong',isListed:true},{id:'g2',title:'Hidden',jobUrl:'https://jobs.ashbyhq.com/gamma/g2',isListed:false}]},
 'https://api.smartrecruiters.com/v1/companies/delta/postings?limit=100':{content:[{id:'d1',name:'Management Consultant, Graduate',location:{city:'Singapore',country:'sg'}}]}};
const fakeFetch=async(url,opts)=>{a.equal(opts.headers.Authorization,undefined,'never sends credentials');if(!BOARDS[url])return {ok:false,status:404,text:async()=>''};return {ok:true,status:200,text:async()=>JSON.stringify(BOARDS[url])};};
const watch=[{ats:'greenhouse',slug:'acme',company:'Acme',market:'US'},{ats:'lever',slug:'beta',company:'Beta',market:'CN'},{ats:'ashby',slug:'gamma',company:'Gamma',market:'HK'},{ats:'smartrecruiters',slug:'delta',company:'Delta',market:'SG'},{ats:'greenhouse',slug:'missing',company:'Gone',market:'US'}];

test('rules score: AI product, strategy and operations above consulting; senior and intern titles fall away',()=>{
 const places=K.placesFrom({primaryMarkets:['Shanghai','Hong Kong'],usCityOrder:['San Francisco','Other US cities considered']});a.deepEqual(places,['Shanghai','Hong Kong','San Francisco']);
 const sc=t=>K.scorePosting({title:t,location:'Shanghai'},{places}).score;
 a.ok(sc('AI Product Manager, Graduate')>sc('Strategy Analyst'));a.ok(sc('Strategy Analyst')>sc('Consultant, Graduate'));a.ok(sc('Consultant, Graduate')>=CF.MIN_SCORE);
 a.ok(sc('Senior Product Manager')<CF.MIN_SCORE);a.ok(sc('Product Manager Intern')<CF.MIN_SCORE);a.equal(sc('Software Engineer'),15);
 a.equal(K.marketOf('Remote - US'),'US');a.equal(K.marketOf('上海'),'CN');a.equal(K.marketOf('Somewhere','SG'),'SG');
});

test('board read: four public boards parsed, low scores and unlisted jobs left out, a missing board reported, no credentials',async()=>{
 const r=await CF.collect({settings:{watch,keywords:['LLM']},profile:{primaryMarkets:['Shanghai','Hong Kong'],usCityOrder:['San Francisco']},existing:{},now:new Date('2026-10-28T12:00:00Z'),fetch:fakeFetch});
 a.deepEqual(Object.keys(r.found).sort(),['ashby:gamma:g1','greenhouse:acme:1','lever:beta:b1','smartrecruiters:delta:d1']);
 const p=r.found['greenhouse:acme:1'];a.equal(p.track,'ai-pm');a.equal(p.market,'US');a.ok(p.reasons.includes('keyword:LLM'));a.equal(p.summary,'Build LLM features');a.equal(p.status,'new');
 a.equal(r.found['lever:beta:b1'].market,'CN');a.equal(r.found['smartrecruiters:delta:d1'].url,'https://jobs.smartrecruiters.com/delta/d1');
 a.deepEqual(r.boards.map(b=>b.status),['ok','ok','ok','ok','failed']);a.match(r.boards[4].error,/no public greenhouse board named "missing"/);
});

test('inbox: owner marks survive a re-read, tracking copies into the tracker once, stale untouched postings leave',()=>withStoreAsync(async s=>{
 s.importSnapshot(snap());const first=await CF.collect({settings:{watch},existing:{},now:new Date('2026-09-01T12:00:00Z'),fetch:fakeFetch});s.saveCareerFetch(first);
 a.throws(()=>s.saveState('careerPosting','x',{}),/Invalid progress field/);
 const {job}=s.actOnPosting('lever:beta:b1','track');a.equal(job.origin.type,'ats');a.equal(job.company,'Beta');a.equal(s.actOnPosting('lever:beta:b1','track').job.id,job.id,'tracking twice reuses the job');
 s.actOnPosting('ashby:gamma:g1','dismiss');
 const empty=async(url)=>({ok:true,status:200,text:async()=>JSON.stringify(url.includes('lever')?[]:url.includes('greenhouse')?{jobs:[]}:url.includes('ashby')?{jobs:[]}:{content:[]})});
 const second=await CF.collect({settings:{watch},existing:s.state().careerPosting,now:new Date('2026-10-28T12:00:00Z'),fetch:empty});const st=s.saveCareerFetch(second);
 const left=Object.keys(s.state().careerPosting).sort();a.deepEqual(left,['ashby:gamma:g1','lever:beta:b1'],'new ones not seen for 45 days left; tracked and dismissed stay');a.equal(st.removed,2);
 a.equal(s.state().careerFetch.last.boards.length,5);
}));

test('server: career routes need the session; refresh reads watched boards; ingest starts a board read without waiting for it',async()=>{
 const {createServer}=require('../src/server.cjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-career-api-'));let calls=0;
 const s=createServer(dir,{webDist:null,ingestSecret:'x'.repeat(32),careerFetch:async(u,o)=>{calls++;return fakeFetch(u,o);}});await new Promise(r=>s.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+s.address().port;
 try{s.store.importSnapshot(snap());a.equal((await fetch(base+'/api/career/save',{method:'POST',body:'{}'})).status,401);
  const session=await fetch(base+'/api/session'),cookie=session.headers.get('set-cookie').split(';')[0],token=(await session.json()).csrf,headers={Cookie:cookie,'Content-Type':'application/json','x-dayweave-token':token,Origin:base};
  const post=(p,b)=>fetch(base+'/api/'+p,{method:'POST',headers,body:JSON.stringify(b)});
  a.deepEqual(await (await post('career/refresh',{})).json(),{skipped:'No companies watched'});
  a.equal((await post('career/settings',{settings:{watch:watch.slice(0,2)}})).status,200);
  const r=await (await post('career/refresh',{})).json();a.equal(r.found,2);a.equal(calls,2);
  const snapRes=await (await fetch(base+'/api/snapshot',{headers})).json();a.equal(Object.keys(snapRes.progress.careerPosting).length,2);a.equal(snapRes.progress.careerFetch.last.boards.length,2);
  const t=await (await post('career/posting',{id:'greenhouse:acme:1',action:'track'})).json();a.equal(t.posting.status,'tracked');a.equal(t.job.origin.type,'ats');
  const ing=await fetch(base+'/api/ingest',{method:'POST',headers:{Authorization:'Bearer '+'x'.repeat(32),'Content-Type':'application/json'},body:JSON.stringify(snap())});a.equal(ing.status,200);a.equal((await ing.json()).career,'checking watched job boards');
  await s.careerRefresh;a.equal(calls,4,'the ingest read the two watched boards again');
 }finally{await new Promise(r=>s.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});

test('planner: a near deadline gets an application block before it; job-search habit blocks name the jobs and due contacts',()=>withStore(s=>{
 const C=require('../src/core.cjs'),PL=require('../src/planner.cjs'),TZ='America/New_York';C.configure(TZ);
 const real=Date.now(),today=C.dayKey(real),end=PL.addDays(today,8),d=structuredClone(require('../examples/google-snapshot.json'));
 d.generatedAt=new Date(real-60000).toISOString();d.calendarCoverage={...d.calendarCoverage,start:C.zonedISO(today,'00:00'),end:C.zonedISO(end,'00:00'),checkedAt:d.generatedAt};
 d.events=[];d.proposals=[];d.assignments=[];for(const x of d.sources)x.lastSuccess=d.generatedAt;d.email={...d.email,messages:[]};delete d.career;s.importSnapshot(d);
 const deadline=PL.addDays(today,3),{job:acme}=s.saveCareer('job',job({company:'Acme',deadline,url:'https://jobs.example.com/acme/1'}));
 s.saveCareer('job',job({company:'Later Co',deadline:PL.addDays(today,30),url:''}));s.saveCareer('contact',{name:'Sam Example',company:'Acme',nextFollowUp:today});
 s.generatePlans(today,7);let blocks=s.snapshot().proposals.filter(p=>p.origin==='planner');
 const apply=blocks.filter(p=>p.sourceRefs.some(r=>r.kind==='job'));a.equal(apply.length,1,'one 60-minute application block');a.match(apply[0].title,/^Apply: Acme · /);a.equal(apply[0].color,'3');
 a.ok(Date.parse(apply[0].end)<=Date.parse(C.zonedISO(deadline,'23:59')));a.match(apply[0].body,/Apply on the company's own site yourself/);
 a.equal(blocks.filter(p=>p.sourceRefs.some(r=>r.kind==='job'&&r.id!==acme.id)).length,0,'a deadline 30 days out waits for weekly job-search time');
 const habit=blocks.filter(p=>p.sourceRefs.some(r=>r.kind==='habit'&&r.id==='job-applications'));a.ok(habit.length);a.ok(habit.every(p=>/^Job applications · (Acme, )?Later Co$/.test(p.title)),habit.map(p=>p.title).join('|'));a.ok(habit.some(p=>p.planDate<=deadline&&/Acme/.test(p.title))||habit.every(p=>p.planDate>deadline),'Acme is named only up to its deadline');a.match(habit[0].body,/- (Acme|Later Co) · AI Product Manager/);
 const li=blocks.filter(p=>p.sourceRefs.some(r=>r.kind==='habit'&&r.id==='linkedin'));a.ok(li.length);a.ok(li.every(p=>/Sam Example/.test(p.title)));
 const {removedBlocks}=s.saveCareer('job',{...acme,stage:'applied'});a.deepEqual(removedBlocks,apply.map(p=>p.id),'applying removes the unstarted application block');
}));
