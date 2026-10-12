const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const C=require('../src/core.cjs'),P=require('../src/phase2.cjs'),A=require('../src/approvals.cjs'),{Store}=require('../src/store.cjs');
const google=()=>structuredClone(require('../examples/google-snapshot.json')),legacy=()=>structuredClone(require('../examples/snapshot.json'));
const now='2026-10-07T12:00:00Z';

test('Google coverage must name its source, account, destination calendar ID and a bounded list of read calendars',()=>{
 a.doesNotThrow(()=>C.validate(google()));
 const cases=[[d=>{d.calendarCoverage.provider='exchange';},/google or outlook/],[d=>{delete d.calendarCoverage.calendarId;},/calendar ID/],[d=>{d.calendarCoverage.sourceId='missing';},/sourceId must be listed/],
  [d=>{delete d.calendarCoverage.calendars;},/bounded list/],[d=>{d.calendarCoverage.calendars=[];},/bounded list/],[d=>{d.calendarCoverage.calendars=Array.from({length:26},(_,i)=>({id:'c'+i,name:'C'+i}));},/bounded list/],
  [d=>{d.calendarCoverage.calendars.push({...d.calendarCoverage.calendars[0]});},/bounded list/],[d=>{d.calendarCoverage.calendars=[{id:'other@example.com',name:'Other'}];},/destination calendar must be one of the read calendars/]];
 for(const [edit,re] of cases){const d=google();edit(d);a.throws(()=>C.validate(d),re);}
 a.doesNotThrow(()=>C.validate(legacy()),'legacy coverage without a provider stays valid');
});

test('the active calendar source decides coverage: a failed or unavailable Google Calendar invalidates it with no Outlook source present',()=>{
 for(const status of ['failed','unavailable']){const old=C.mergeSnapshot(null,google()),next=google();next.sources.find(s=>s.id==='google-calendar').status=status;next.events=[];
  a.equal(next.sources.some(s=>s.id==='outlook'),false);const r=C.mergeSnapshot(old,next);a.equal(r.calendarCoverage.complete,false,status);a.deepEqual(r.proposals,[]);a.equal(r.calendarCoverage.provider,'google');
  if(status==='failed')a.deepEqual(r.events.map(e=>e.id),['gcal-seminar','gcal-holiday'],'failed calendar keeps prior events');}
 const old=C.mergeSnapshot(null,google()),gmail=google();gmail.sources.find(s=>s.id==='gmail').status='failed';gmail.email.coverage={status:'failed'};gmail.email.messages=[];
 const r=C.mergeSnapshot(old,gmail);a.equal(r.calendarCoverage.complete,true,'Gmail failure leaves calendar coverage');a.equal(r.proposals.length,1);
 const l=legacy(),ln=legacy();ln.sources.find(s=>s.id==='outlook').status='failed';const lr=C.mergeSnapshot(C.mergeSnapshot(null,l),ln);a.equal(lr.calendarCoverage.complete,false,'legacy outlook failure still invalidates');a.deepEqual(lr.proposals,[]);
 const lg=legacy();lg.sources.find(s=>s.id==='course-a').status='failed';a.equal(C.mergeSnapshot(C.mergeSnapshot(null,legacy()),lg).calendarCoverage.complete,true);
});

test('provider identity is part of the spec and fingerprint; legacy fingerprints are unchanged',()=>{
 const g=google().proposals[0],l=legacy().proposals[0];
 a.equal(P.spec(g).provider,'google');a.equal('provider' in P.spec(l),false);
 a.equal(P.fingerprint(l),JSON.stringify(JSON.parse(P.fingerprint(l))),'canonical');a.doesNotMatch(P.fingerprint(l),/provider/);
 for(const edit of [{provider:'outlook'},{account:'other@example.com'},{calendarId:'other@example.com'},{calendar:'Other'}])a.notEqual(P.fingerprint(g),P.fingerprint({...g,...edit}),JSON.stringify(edit));
});

test('Google proposals need fresh complete coverage of the same provider, account, calendar ID and a healthy calendar source',()=>{
 const d=C.mergeSnapshot(null,google()),p=d.proposals[0];a.deepEqual(P.errors(p,d,now),[]);
 a.match(P.request([p],d,now),/exact personal Google Calendar actions/);a.match(P.request(legacy().proposals,legacy(),now),/exact personal Outlook actions/);
 const err=(edit,when=now)=>{const x=structuredClone(d);const q=edit(x)||x.proposals[0];return P.errors(q,x,when).join(' | ');};
 a.match(err(x=>({...x.proposals[0],provider:undefined})),/provider does not match/);
 a.match(err(x=>{x.calendarCoverage.provider='outlook';delete x.calendarCoverage.calendars;}),/provider does not match/);
 a.match(err(x=>({...x.proposals[0],calendarId:'course-schedule@example.com'})),/exact verified calendar ID/);
 a.match(err(x=>{x.calendarCoverage.calendars=[{id:'x',name:'x'}];}),/not among the read calendars/);
 a.match(err(x=>{x.sources=x.sources.filter(s=>s.id!=='google-calendar');}),/calendar source is not healthy/);
 a.match(err(x=>{x.sources.find(s=>s.id==='google-calendar').status='partial';}),/calendar source is not healthy/);
 a.match(err(x=>{x.calendarCoverage.complete=false;}),/incomplete/);
 a.match(err(()=>null,'2026-10-08T15:00:00Z'),/Refresh calendar evidence/,'older than 26 hours');
 a.match(err(x=>{x.events.push({id:'busy',title:'Busy',start:p.start,end:p.end,busy:true,sourceId:'google-calendar'});}),/Overlaps/);
 a.equal(err(x=>{x.sources.find(s=>s.id==='gmail').status='failed';}),'','an email failure does not block calendar actions');
 a.equal(err(x=>{x.sources.push({id:'outlook',name:'Retired',status:'failed'});}),'','an inactive Outlook source does not block Google actions');
});

test('a prepared version is invalidated when the verified account or provider changes, and legacy Outlook approvals still work',()=>{
 const real=Date.now(),iso=h=>new Date(real+h*3600000).toISOString(),day=C.dayKey(real+86400000);
 const fresh=d=>{C.configure(d.timezone);d.generatedAt=iso(0);d.calendarCoverage={...d.calendarCoverage,checkedAt:iso(0),start:iso(-1),end:iso(96)};d.events=[];d.proposals=d.proposals.map(p=>({...p,start:C.zonedISO(day,'14:00'),end:C.zonedISO(day,'15:00')}));d.email&&(d.email.checkedAt=iso(0),d.email.request={...d.email.request,from:iso(-168),to:iso(0)},d.email.messages=[]);return d;};
 for(const change of ['account','provider']){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-google-'+change+'-')),s=new Store(dir);try{
  const d=fresh(google());s.importSnapshot(d);const q=A.prepare(s,[d.proposals[0].id]);a.equal(q.status,'prepared');a.deepEqual(A.read(s,q.reference).errors,[]);
  const next=fresh(google());if(change==='account'){next.calendarCoverage.account='other@example.com';}else{next.calendarCoverage={...next.calendarCoverage,provider:'outlook',sourceId:'google-calendar'};delete next.calendarCoverage.calendars;}
  s.importSnapshot(next);a.equal(s.snapshot().proposals[0].title,d.proposals[0].title,'proposal itself unchanged');a.equal(A.read(s,q.reference).status,'invalidated',change);
  a.throws(()=>A.record(s,{reference:q.reference,id:d.proposals[0].id,status:'pending',recordedAt:iso(0),humanApproval:'synthetic'}),/no longer executable/);
 }finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-legacy-')),s=new Store(dir);try{const d=fresh(legacy());s.importSnapshot(d);const q=A.prepare(s,[d.proposals[0].id]);s.importSnapshot(d);a.equal(A.read(s,q.reference).status,'prepared','an unchanged legacy import keeps the version');a.deepEqual(A.read(s,q.reference).errors,[]);}finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
