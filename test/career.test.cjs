const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const K=require('../src/career.cjs'),{Store}=require('../src/store.cjs');
const withStore=fn=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-career-')),s=new Store(dir);try{return fn(s);}finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}};
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
