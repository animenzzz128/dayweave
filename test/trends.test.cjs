const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const T=require('../src/trends.cjs'),C=require('../src/core.cjs'),{Store}=require('../src/store.cjs'),{createServer}=require('../src/server.cjs');
const NY='America/New_York',NOW='2026-10-09T16:00:00Z';// Friday 12:00 EDT; current week starts Monday 2026-10-05.
const src=(id,status='ok',name='Source '+id)=>({id,name,status});
const rec=(id,extra={})=>({id,requirement:'required',status:'not_submitted',sourceId:'course-a',...extra});
const row=(generatedAt,importedAt,assignments,sources=[src('course-a'),src('course-b')],timezone=NY)=>({importedAt,generatedAt,timezone,sources,assignments});
function run(rows,{week,query,now=NOW,timezone=NY,truncated=false,latestImportedAt}={}){
 const calls=[],imports=rows.map(r=>r.importedAt).sort();
 const out=T.trends({query:query??(week?{week}:{}),timezone,now:new Date(now),retention:{count:rows.length,earliestImportedAt:imports[0]??null,latestImportedAt:latestImportedAt??imports.at(-1)??null,generatedAt:rows.map(r=>r.generatedAt)},
  read:o=>{calls.push(o);return {from:o.from,limit:o.limit,truncated,items:rows.filter(r=>r.importedAt>=o.from)};}});
 return {out,calls};}
const deepFreeze=x=>{if(x&&typeof x==='object'){Object.freeze(x);Object.values(x).forEach(deepFreeze);}return x;};
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'dw-trends-'));

test('weeks run Monday 00:00 to Sunday 24:00 in the snapshot timezone, DST-safe and independent of UTC dates',()=>{
 a.equal(T.monday('2026-10-11'),'2026-10-05');a.equal(T.monday('2026-10-05'),'2026-10-05');a.equal(T.monday('2027-01-01'),'2026-12-28');a.equal(T.addDays('2026-12-28',6),'2027-01-03');
 a.equal(T.weekOf('2026-10-05T03:59:59Z',NY),'2026-09-28','Sunday 23:59:59 EDT');a.equal(T.weekOf('2026-10-05T04:00:00Z',NY),'2026-10-05','Monday 00:00 EDT');
 // DST ends Sunday 2026-11-01 (25-hour day) and starts Sunday 2027-03-14 (23-hour day) in New York.
 a.equal(T.weekOf('2026-11-01T05:30:00Z',NY),'2026-10-26','repeated 01:30 hour');a.equal(T.weekOf('2026-11-01T06:30:00Z',NY),'2026-10-26');
 a.equal(T.weekOf('2026-11-02T04:59:59Z',NY),'2026-10-26','Sunday 23:59:59 EST');a.equal(T.weekOf('2026-11-02T05:00:00Z',NY),'2026-11-02','Monday 00:00 EST');
 a.equal(T.weekOf('2027-03-15T03:59:59Z',NY),'2027-03-08','Sunday 23:59:59 EDT after spring forward');a.equal(T.weekOf('2027-03-15T04:00:00Z',NY),'2027-03-15');
 // Auckland is UTC+13 in October: Monday local begins on Sunday UTC.
 a.equal(T.weekOf('2026-10-04T10:59:59Z','Pacific/Auckland'),'2026-09-28');a.equal(T.weekOf('2026-10-04T11:00:00Z','Pacific/Auckland'),'2026-10-05');a.equal(T.weekOf('2026-10-04T11:00:00Z','UTC'),'2026-09-28');
 a.equal(T.weekOf('2026-10-05T06:59:59Z','America/Los_Angeles'),'2026-09-28');a.equal(T.weekOf('2026-10-05T07:00:00Z','America/Los_Angeles'),'2026-10-05');
 for(const k of ['2026-02-30','2026-13-01','2026-1-05','','2026-10-05T00:00','x'])a.equal(T.validDay(k),false,k);a.equal(T.validDay('2028-02-29'),true);
 const {out}=run([row('2026-10-29T16:00:00Z','2026-11-03T12:00:00Z',[rec('a1')])],{week:'2026-11-02',now:'2026-11-04T12:00:00Z'});
 a.deepEqual(out.weeks.map(w=>[w.start,w.end]),[['2026-10-26','2026-11-01'],['2026-11-02','2026-11-08']],'the DST week still ends on its Sunday');
 a.equal(out.weeks[0].observations,1);
});

test('a week without observations reports none (never zero) and is not comparable; the current week is marked partial',()=>{
 const {out,calls}=run([row('2026-10-07T16:00:00Z','2026-10-07T17:00:00Z',[rec('a1'),rec('a2',{status:'submitted'})])]);
 a.equal(out.selected,'2026-10-05');a.equal(out.previous,'2026-09-28');a.equal(out.defaultWeek,true);a.equal(out.basis,'generatedAt');
 const [prev,sel]=out.weeks;a.equal(prev.observations,0);a.equal(prev.latest,null);a.deepEqual(prev.sources,[]);a.equal(prev.retentionLimited,false,'inside the retained window');
 a.equal(sel.current,true);a.equal(sel.through,'2026-10-09');a.equal(prev.current,false);a.equal(sel.latest.counts.not_submitted,1);
 a.equal(out.comparison.comparable,false);a.equal(out.comparison.changes,null);a.match(out.comparison.reasons.join('\n'),/No observations in the week of 2026-09-28 to 2026-10-04/);
 a.equal(calls.length,1);a.equal(calls[0].from,'2026-09-26T00:00:00.000Z');a.equal(calls[0].limit,T.QUERY_LIMIT);
});

test('failed or unavailable sources stay visible, their retained records are not fresh, and a drop is never comparable',()=>{
 const ok=row('2026-09-30T16:00:00Z','2026-09-30T17:00:00Z',[rec('a1'),rec('a2'),rec('a3'),rec('b1',{sourceId:'course-b'})]);
 for(const status of ['failed','unavailable']){
  const failed=row('2026-10-07T16:00:00Z','2026-10-07T17:00:00Z',[rec('b1',{sourceId:'course-b'}),rec('a1'),rec('a2'),rec('a3')],[src('course-a',status),src('course-b')]);
  const {out}=run([ok,failed]),[prev,sel]=out.weeks;
  a.equal(sel.latest.counts.not_submitted,1,'only the fresh course-b record counts');a.equal(sel.latest.counts.retained,3,'retained records are counted separately');a.equal(sel.latest.noFresh,false);
  a.equal(prev.latest.counts.not_submitted,4);a.deepEqual(sel.sources.find(s=>s.id==='course-a'),{id:'course-a',name:'Source course-a',ok:0,failed:1,other:0,notReported:0,latestStatus:status});
  a.deepEqual(sel.items[0].nonOk,[{id:'course-a',name:'Source course-a',status}]);
  a.equal(out.comparison.comparable,false,status);a.equal(out.comparison.changes,null,'no change (and no improvement) is reported');a.match(out.comparison.reasons.join('\n'),/Failed or unavailable source in the week of 2026-10-05 to 2026-10-11: Source course-a/);
 }
 // A failed source earlier in the week keeps the week non-comparable even when the latest observation is ok.
 const early=row('2026-10-05T16:00:00Z','2026-10-05T17:00:00Z',[],[src('course-a','failed'),src('course-b')]),late=row('2026-10-07T16:00:00Z','2026-10-07T17:00:00Z',[rec('a1')]);
 let {out}=run([ok,early,late]);a.equal(out.weeks[1].sources.find(s=>s.id==='course-a').failed,1);a.equal(out.weeks[1].sources.find(s=>s.id==='course-a').latestStatus,'ok');a.equal(out.comparison.comparable,false);
 // Any other non-ok status (partial) limits coverage too; when every record comes from a failed source the counts are missing, not zero.
 ({out}=run([ok,row('2026-10-07T16:00:00Z','2026-10-07T17:00:00Z',[rec('a1')],[src('course-a','partial')])]));a.match(out.comparison.reasons.join('\n'),/Source not fully ok/);
 ({out}=run([ok,row('2026-10-07T16:00:00Z','2026-10-07T17:00:00Z',[rec('a1'),rec('a2',{status:'submitted'})],[src('course-a','failed')])]));
 a.equal(out.weeks[1].latest.noFresh,true);a.equal(out.weeks[1].latest.counts.retained,2);a.match(out.comparison.reasons.join('\n'),/No fresh records in the latest observation/);
});

test('archived (removed-from-source) and unlisted-source records are not fresh; unknown status, choice and uncertain stay separate',()=>{
 const list=[rec('r1'),rec('r2',{status:'unknown'}),rec('r3',{status:'graded'}),rec('r4',{status:'excused'}),rec('r5',{status:'odd'}),rec('r6',{status:undefined}),rec('c1',{requirement:'choice'}),rec('c2',{requirement:'choice',status:'unknown'}),rec('u1',{requirement:'uncertain'}),rec('u2',{requirement:undefined}),rec('x1',{archivedFromSource:true}),rec('x2',{archivedFromSource:true,sourceId:'course-b',status:'submitted'}),rec('n1',{sourceId:'nowhere'})];
 const o=T.observe(row('2026-10-07T16:00:00Z','2026-10-07T17:00:00Z',list),NY);
 a.deepEqual(o.counts,{done:2,not_submitted:1,unknown:1,other:2,choice:2,uncertain:2,retained:0,archived:2,unlisted:1});
 const {out}=run([row('2026-09-30T16:00:00Z','2026-09-30T17:00:00Z',[rec('r1')]),row('2026-10-07T16:00:00Z','2026-10-07T17:00:00Z',list)]);a.equal(out.weeks[1].unlisted,true);a.match(out.comparison.reasons.join('\n'),/Records without a listed source/);
 // Only archived records with ok sources is a real observation of zero current work, not missing evidence.
 const z=T.observe(row('2026-10-07T16:00:00Z','2026-10-07T17:00:00Z',[rec('x1',{archivedFromSource:true})]),NY);a.equal(z.noFresh,false);a.equal(z.counts.archived,1);a.equal(z.counts.not_submitted,0);
});

test('comparable weeks report descriptive changes between their latest observations',()=>{
 const w1=[row('2026-09-29T16:00:00Z','2026-09-29T17:00:00Z',[rec('a1'),rec('a2'),rec('a3')]),row('2026-10-02T16:00:00Z','2026-10-02T17:00:00Z',[rec('a1'),rec('a2'),rec('a3',{status:'unknown'})])];
 const w2=row('2026-10-06T16:00:00Z','2026-10-06T17:00:00Z',[rec('a1',{status:'submitted'}),rec('a2'),rec('a3',{status:'unknown'}),rec('c1',{requirement:'choice'})]);
 const {out}=run([...w1,w2]);a.equal(out.weeks[0].observations,2);a.equal(out.weeks[0].latest.generatedAt,'2026-10-02T16:00:00Z','latest observation of the week');
 a.equal(out.comparison.comparable,true);a.deepEqual(out.comparison.reasons,[]);a.deepEqual(out.comparison.changes,{done:1,not_submitted:-1,unknown:0,other:0,choice:1,uncertain:0});
});

test('repeated imports of the same evidence count once; import time stays distinct from generatedAt',()=>{
 const list=[rec('a1'),rec('a2',{status:'unknown'})];
 const first=row('2026-10-02T16:00:00Z','2026-10-06T09:00:00Z',list),again={...first,importedAt:'2026-10-07T09:00:00Z',assignments:[...list].reverse()},changed=row('2026-10-02T16:00:00Z','2026-10-07T10:00:00Z',[rec('a1'),rec('a2')]),later=row('2026-10-03T16:00:00Z','2026-10-07T11:00:00Z',list);
 const {out}=run([first,again,changed,later],{week:'2026-09-28',now:NOW}),w=out.weeks[1];
 a.equal(w.start,'2026-09-28','bucketed by generatedAt, not by the later import time');
 a.equal(w.imports,4);a.equal(w.observations,3,'same generatedAt and content dedupes; different content or time does not');a.equal(w.duplicates,1);
 const dup=w.items.find(i=>i.imports===2);a.equal(dup.generatedAt,'2026-10-02T16:00:00Z');a.equal(dup.importedAt,'2026-10-06T09:00:00Z');a.equal(dup.lastImportedAt,'2026-10-07T09:00:00Z');
 a.notEqual(w.latest.importedAt,w.latest.generatedAt);a.equal(out.weeks[0].observations,0);
});

test('the 30-day retention horizon is a visible limit: earlier weeks are incomplete, never "nothing happened"',()=>{
 const rows=[row('2026-09-16T16:00:00Z','2026-09-16T17:00:00Z',[rec('a1')]),row('2026-10-07T16:00:00Z','2026-10-09T15:00:00Z',[rec('a1')])];
 let {out}=run(rows,{week:'2026-09-14'});a.equal(out.retention.horizon,'2026-09-09T15:00:00.000Z');a.equal(out.retention.horizonDay,'2026-09-09');a.equal(out.retention.days,30);
 a.equal(out.weeks[0].start,'2026-09-07');a.equal(out.weeks[0].retentionLimited,true);a.equal(out.weeks[0].observations,0);a.equal(out.weeks[1].retentionLimited,false);
 a.match(out.comparison.reasons.join('\n'),/The week of 2026-09-07 to 2026-09-13 starts on or before the retained window \(2026-09-09\); earlier evidence may have been pruned/);
 // Horizon on a Monday local date: that week is limited; the following week is not.
 ({out}=run(rows,{week:'2026-09-14',latestImportedAt:'2026-10-14T15:00:00Z',now:'2026-10-15T12:00:00Z'}));a.equal(out.retention.horizonDay,'2026-09-14');a.equal(out.weeks[1].retentionLimited,true);
 ({out}=run([],{week:'2026-09-28'}));a.equal(out.retention.count,0);a.equal(out.retention.horizon,null);a.ok(out.weeks.every(w=>w.retentionLimited&&w.observations===0));a.match(out.comparison.reasons.join('\n'),/No source snapshots are retained/);
});

test('week selection is strict and bounded; truncated reads are never comparable; inputs are not mutated',()=>{
 const rows=deepFreeze([row('2026-09-30T16:00:00Z','2026-09-30T17:00:00Z',[rec('a1')]),row('2026-10-07T16:00:00Z','2026-10-07T17:00:00Z',[rec('a1',{status:'submitted'})])]),before=JSON.stringify(rows);
 for(const [query,msg] of [[{foo:'1'},/Unknown trends parameter/],['week=2026-10-05&week=2026-09-28',/at most one week/],['week=2026-10-05&x=1',/Unknown/],[{week:'2026-10-06'},/Monday/],[{week:'2026-02-30'},/calendar date/],[{week:''},/calendar date/],[{week:'2026-10-05T00:00Z'},/calendar date/],[{week:'2026-10-12'},/between 2026-07-13 and 2026-10-05/],[{week:'2026-07-06'},/between/]]){
  let calls=0;a.throws(()=>T.trends({query,timezone:NY,now:new Date(NOW),retention:{},read:()=>{calls++;return {items:[]};}}),msg,JSON.stringify(query));a.equal(calls,0,'rejected before reading');}
 a.equal(run(rows,{week:'2026-07-13'}).out.selected,'2026-07-13');a.equal(run(rows,{week:'2026-07-13'}).out.nav.earlier,null,'no link below the lower bound');
 a.deepEqual(run(rows,{query:new URLSearchParams('week=2026-09-28')}).out.weeks.map(w=>w.start),['2026-09-21','2026-09-28']);
 let {out}=run(rows);a.equal(out.comparison.comparable,true);a.equal(out.nav.later,null);a.equal(out.nav.earlier,'2026-09-28');
 ({out}=run(rows,{truncated:true}));a.equal(out.comparison.comparable,false);a.equal(out.query.truncated,true);a.match(out.comparison.reasons[0],/stopped at 500 imports/);
 a.equal(JSON.stringify(rows),before);
 // Default week follows the latest observation, clamped to the allowed range; an invalid timezone is reported, not guessed.
 a.equal(run([row('2026-09-23T16:00:00Z','2026-09-23T17:00:00Z',[])]).out.selected,'2026-09-21');
 a.equal(run([row('2026-12-23T16:00:00Z','2026-10-01T17:00:00Z',[])]).out.selected,'2026-10-05');
 a.equal(run(rows,{timezone:'Mars/Olympus'}).out.available,false);a.equal(run(rows,{timezone:null}).out.available,false);
 // Without a valid timezone the range is undefined: an out-of-range week is reported unavailable, while malformed parameters are still rejected.
 a.equal(run(rows,{timezone:null,week:'2099-01-05'}).out.available,false);a.throws(()=>run(rows,{timezone:null,query:{foo:'1'}}),/Unknown trends parameter/);
});

test('retained evidence the bounded read did not return is labelled, never "No observations" (forward-skewed generatedAt)',()=>{
 const ok=row('2026-09-30T16:00:00Z','2026-09-30T17:00:00Z',[rec('a1')]);
 // Collected (by its own clock) on Wednesday of the current week but imported weeks earlier, before the read window.
 const skewed=row('2026-10-07T16:00:00Z','2026-09-20T17:00:00Z',[rec('a1',{status:'submitted'})]);
 let {out,calls}=run([ok,skewed]);const why=()=>out.comparison.reasons.join('\n');
 a.equal(out.selected,'2026-10-05','default week follows the latest generatedAt');a.equal(calls[0].from,'2026-09-26T00:00:00.000Z');
 a.equal(out.weeks[1].observations,0);a.equal(out.weeks[1].unread,1);a.equal(out.weeks[0].observations,1);a.equal(out.weeks[0].unread,0);
 a.equal(out.comparison.comparable,false);a.equal(out.comparison.changes,null);
 a.match(why(),/Some retained evidence for the week of 2026-10-05 to 2026-10-11 was not read \(1 import\)/);a.match(why(),/No observations read for the week of 2026-10-05/);a.doesNotMatch(why(),/No observations in the week of 2026-10-05/);
 // A partly read week is labelled too and the pair is not comparable, although both weeks have observations.
 ({out}=run([ok,skewed,row('2026-10-06T16:00:00Z','2026-10-06T17:00:00Z',[rec('a1')])]));a.equal(out.weeks[1].observations,1);a.equal(out.weeks[1].unread,1);a.equal(out.comparison.comparable,false);a.deepEqual(out.comparison.reasons,['Some retained evidence for the week of 2026-10-05 to 2026-10-11 was not read (1 import)']);
 // Without the skewed row the same pair is comparable, and a truly empty week has nothing unread.
 ({out}=run([ok,row('2026-10-06T16:00:00Z','2026-10-06T17:00:00Z',[rec('a1')])]));a.equal(out.comparison.comparable,true);a.ok(out.weeks.every(w=>w.unread===0));
 ({out}=run([ok],{week:'2026-10-05'}));a.equal(out.weeks[1].unread,0);a.match(out.comparison.reasons.join('\n'),/No observations in the week of 2026-10-05/);
});

test('a truncated read never presents a week as having no evidence',()=>{
 const rows=[row('2026-09-30T16:00:00Z','2026-09-30T17:00:00Z',[rec('a1')]),row('2026-10-07T16:00:00Z','2026-10-07T17:00:00Z',[rec('a1')])];
 const out=T.trends({query:{},timezone:NY,now:new Date(NOW),retention:{count:2,latestImportedAt:rows[1].importedAt,generatedAt:rows.map(r=>r.generatedAt)},read:o=>({from:o.from,limit:1,truncated:true,items:rows.slice(0,1)})});
 a.equal(out.query.truncated,true);a.equal(out.weeks[1].observations,0);a.equal(out.weeks[1].unread,1);a.equal(out.comparison.comparable,false);a.equal(out.comparison.changes,null);
 a.match(out.comparison.reasons[0],/stopped at 1 imports/);a.match(out.comparison.reasons.join('\n'),/No observations read for the week of 2026-10-05/);
});

test('a source missing from an observation limits coverage: its archived records and the lower count are not comparable',()=>{
 const both=[src('course-a'),src('course-b')],b=(id,extra)=>rec(id,{sourceId:'course-b',...extra});
 const w1=row('2026-09-30T16:00:00Z','2026-09-30T17:00:00Z',[rec('a1'),b('b1'),b('b2')],both);
 // course-b is absent from the next collection entirely; the import archives its records, so required counts drop.
 const w2=row('2026-10-07T16:00:00Z','2026-10-07T17:00:00Z',[rec('a1'),b('b1',{archivedFromSource:true}),b('b2',{archivedFromSource:true})],[src('course-a')]);
 let {out}=run([w1,w2]);a.equal(out.weeks[0].latest.counts.not_submitted,3);a.equal(out.weeks[1].latest.counts.not_submitted,1);a.equal(out.weeks[1].latest.counts.archived,2);
 a.equal(out.comparison.comparable,false);a.equal(out.comparison.changes,null);
 a.deepEqual(out.comparison.reasons,['The latest observations of the two weeks list different sources; only in the week of 2026-09-28: Source course-b']);
 // Reported earlier in the week but missing from a later observation of the same week.
 ({out}=run([w1,row('2026-10-06T16:00:00Z','2026-10-06T17:00:00Z',[rec('a1')],[src('course-a')]),row('2026-10-08T16:00:00Z','2026-10-08T17:00:00Z',[rec('a1'),b('b1'),b('b2')],both)]));
 a.equal(out.weeks[1].sources.find(s=>s.id==='course-b').notReported,1);a.deepEqual(out.comparison.reasons,['Source not reported in every observation of the week of 2026-10-05 to 2026-10-11: Source course-b']);
 // Through the real store: omitting course-b archives its records on import, and the pair is not comparable.
 const dir=tmp(),s=new Store(dir);try{
  const d=structuredClone(require('../examples/snapshot.json'));d.sources=d.sources.map(x=>({...x,status:'ok'}));d.generatedAt='2026-09-30T12:00:00Z';s.importSnapshot(structuredClone(d));
  d.generatedAt='2026-10-07T12:00:00Z';d.sources=d.sources.filter(x=>x.id!=='course-b');d.assignments=d.assignments.filter(x=>x.sourceId!=='course-b');s.importSnapshot(d);
  const t=s.weeklyTrends(new URLSearchParams(),new Date(NOW)),[p,w]=t.weeks;a.equal(w.latest.counts.archived,2);a.ok(w.latest.counts.not_submitted+w.latest.counts.unknown<p.latest.counts.not_submitted+p.latest.counts.unknown,'count drops');
  a.equal(t.comparison.comparable,false);a.equal(t.comparison.changes,null);a.match(t.comparison.reasons.join('\n'),/list different sources; only in the week of 2026-09-28: Example LMS · Course B$/);
 }finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('store: bounded read-only range query, prune boundary and retention summary',()=>{
 const dir=tmp(),s=new Store(dir);try{
  const d=structuredClone(require('../examples/snapshot.json'));d.generatedAt='2026-10-01T12:00:00Z';s.importSnapshot(d);
  const put=(at,generatedAt)=>s.db.prepare('INSERT INTO source_snapshots(at,value) VALUES(?,?)').run(at,JSON.stringify({...d,generatedAt}));
  const now=Date.now(),iso=ms=>new Date(ms).toISOString(),day=86400000;
  put(iso(now-30*day-60000),'2026-09-01T12:00:00Z');put(iso(now-29*day),'2026-09-02T12:00:00Z');
  // A failed source keeps its old records (retained) and a removed record is carried as archived; both are projected.
  const d2=structuredClone(d);d2.generatedAt='2026-10-02T12:00:00Z';d2.sources[0].status='failed';d2.assignments=d2.assignments.filter(x=>x.sourceId!=='course-a'&&x.id!=='receipt-b');s.importSnapshot(d2);
  const all=s.snapshotObservations({from:'2000-01-01T00:00:00Z'});a.equal(all.truncated,false);a.equal(all.items.length,3,'the row older than 30 days was pruned by the import; the 29-day row stayed');
  a.deepEqual(all.items.map(x=>x.generatedAt),['2026-09-02T12:00:00Z','2026-10-01T12:00:00Z','2026-10-02T12:00:00Z'],'oldest import first');
  const last=all.items[2];a.deepEqual(Object.keys(last).sort(),['assignments','generatedAt','id','importedAt','sources','timezone']);a.equal(last.timezone,'America/New_York');
  a.deepEqual(last.sources.map(x=>x.status),['failed','partial','ok']);a.ok(!('description' in last.assignments[0]),'only projected fields are read');
  a.deepEqual(last.assignments.map(x=>[x.id,x.archivedFromSource]),[['presentation-b',false],['brief-a',false],['reflection-a',false],['submitted-a',false],['receipt-b',true]]);
  const o=T.observe(last,'America/New_York');a.equal(o.counts.retained,3);a.equal(o.counts.archived,1);
  const r=s.snapshotRetention();a.equal(r.count,3);a.equal(r.latestImportedAt,last.importedAt);a.equal(r.earliestImportedAt,all.items[0].importedAt);a.equal(r.generatedAt.length,3);
  const two=s.snapshotObservations({from:'2000-01-01T00:00:00Z',limit:2});a.equal(two.truncated,true);a.equal(two.items.length,2);a.equal(two.limit,2);
  a.equal(s.snapshotObservations({from:'2000-01-01T00:00:00Z',to:all.items[1].importedAt}).items.length,1,'to is exclusive');
  a.equal(s.snapshotObservations({from:'2000-01-01T00:00:00+05:00'}).from,'1999-12-31T19:00:00.000Z');
  for(const q of [{},{from:'2026-10-01'},{from:'yesterday'},{from:'2026-10-01T00:00:00Z',to:'2026-10-01T00:00:00Z'},{from:'2026-10-01T00:00:00Z',to:'2026-09-01T00:00:00Z'},{from:'2026-10-01T00:00:00Z',limit:0},{from:'2026-10-01T00:00:00Z',limit:1001},{from:'2026-10-01T00:00:00Z',limit:1.5},{from:'2026-10-01T00:00:00Z',limit:'5'},{from:1}])a.throws(()=>s.snapshotObservations(q),/Invalid/,JSON.stringify(q));
  const counts=()=>JSON.stringify(['audit','progress','source_snapshots','records','meta','runs','approvals','receipts'].map(t=>s.db.prepare('SELECT count(*) AS n FROM '+t).get().n)),changes=()=>s.db.prepare('SELECT total_changes() AS n').get().n;
  const c0=counts(),t0=changes(),t=s.weeklyTrends(new URLSearchParams());a.equal(t.available,true);a.equal(t.basis,'generatedAt');a.equal(changes(),t0,'weeklyTrends writes nothing');a.equal(counts(),c0);
  a.throws(()=>s.weeklyTrends(new URLSearchParams('week=nope')),/calendar date/);a.equal(changes(),t0);
 }finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}
 const empty=tmp(),e=new Store(empty);try{a.equal(e.weeklyTrends({}).available,false);}finally{e.close();fs.rmSync(empty,{recursive:true,force:true});}
});

test('server: GET /api/trends uses the existing session and local-request checks, rejects bad parameters and never writes',async()=>{
 const dir=tmp(),s=createServer(dir);await new Promise(r=>s.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+s.address().port;
 try{s.store.importSnapshot(require('../examples/snapshot.json'));
  a.equal((await fetch(base+'/api/trends')).status,401,'no session');
  const session=await fetch(base+'/api/session'),cookie=session.headers.get('set-cookie').split(';')[0],token=(await session.json()).csrf,h={Cookie:cookie};
  a.equal((await fetch(base+'/api/trends',{headers:{...h,'Sec-Fetch-Site':'cross-site'}})).status,403);
  const health=await (await fetch(base+'/api/health',{headers:h})).json();a.deepEqual(Object.keys(health),['runs','backups'],'/api/health is unchanged');
  const changes=()=>s.store.db.prepare('SELECT total_changes() AS n').get().n,t0=changes();
  const ok=await fetch(base+'/api/trends',{headers:h});a.equal(ok.status,200);a.equal(ok.headers.get('cache-control'),'no-store');const body=await ok.json();a.equal(body.available,true);a.equal(body.weeks.length,2);
  for(const q of ['week=bad','week=2026-10-06','foo=1','week=2026-10-05&week=2026-09-28','week=2099-01-05']){const r=await fetch(base+'/api/trends?'+q,{headers:h});a.equal(r.status,400,q);a.ok((await r.json()).error,q);}
  const post=await fetch(base+'/api/trends',{method:'POST',headers:{...h,Origin:base,'x-dayweave-token':token,'Content-Type':'application/json'},body:'{}'});a.equal(post.status,404,'no write route exists');
  a.equal((await fetch(base+'/api/trends',{method:'POST',headers:{...h,'Content-Type':'application/json'},body:'{}'})).status,403);
  a.equal(changes(),t0,'trends requests changed nothing in the database');
 }finally{await new Promise(r=>s.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});

test('routed /settings?tab=trends renders dated weeks from the real API with index-order scripts',async()=>{
 const order=[...fs.readFileSync('src/web/index.html','utf8').matchAll(/<script src="\/([\w.]+)"><\/script>/g)].map(m=>m[1]),files={'core.js':'src/core.cjs','phase2.js':'src/phase2.cjs','phase3.js':'src/phase3.cjs','effort.js':'src/effort.cjs','workload.js':'src/workload.cjs','email.js':'src/email.cjs','app.js':'src/web/app.js'};
 a.deepEqual(order,['core.js','phase2.js','phase3.js','effort.js','workload.js','email.js','app.js']);
 const dir=tmp(),s=require('../src/approvals.cjs').attach(createServer(dir));await new Promise(r=>s.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+s.address().port;
 const EVIL='<img src=x onerror=alert(1)>';
 try{
  // Fictional evidence: W-3 and W-2 ok, W-1 has a failed course-a source (imported twice) and a removed course-b record.
  C.configure(NY);const now=new Date(),W0=T.weekOf(now,NY),wk=n=>T.addDays(W0,-7*n),at=(n,day=2)=>C.zonedISO(T.addDays(wk(n),day),'12:00');
  const d=structuredClone(require('../examples/snapshot.json'));d.timezone=NY;d.sources=[src('course-a','ok','Example course A'),src('course-b','ok',EVIL),src('outlook','ok','Example calendar')];
  d.assignments=[['a1','course-a','required','not_submitted'],['a2','course-a','required','not_submitted'],['a3','course-a','required','unknown'],['b1','course-b','required','not_submitted'],['b2','course-b','choice','not_submitted'],['gone','course-b','required','not_submitted']].map(([id,sourceId,requirement,status])=>({...d.assignments[0],id,title:'Synthetic '+id,sourceId,requirement,status,source:'https://example.com/a/'+id}));
  d.generatedAt=at(3);s.store.importSnapshot(structuredClone(d));
  d.generatedAt=at(2);d.assignments[0].status='submitted';s.store.importSnapshot(structuredClone(d));
  const f=structuredClone(d);f.generatedAt=at(1);f.sources[0].status='failed';f.assignments=f.assignments.filter(x=>x.sourceId!=='course-a'&&x.id!=='gone');s.store.importSnapshot(structuredClone(f));s.store.importSnapshot(structuredClone(f));
  const session=await fetch(base+'/api/session'),cookie=session.headers.get('set-cookie').split(';')[0];
  const nodes=new Map(),node=k=>{if(!nodes.has(k))nodes.set(k,{textContent:'',innerHTML:''});return nodes.get(k);};
  const ctx=vm.createContext({URLSearchParams,Date,Intl,console,window:{addEventListener(){}},document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}},location:{pathname:'/settings',search:'?tab=trends'},history:{pushState(){}},
   fetch:(url,o={})=>fetch(base+url,{...o,headers:{...o.headers,Cookie:cookie,Origin:base}})});
  for(const f of order)vm.runInContext(fs.readFileSync(files[f],'utf8'),ctx,{filename:files[f]});
  const page=async search=>{ctx.location.search=search;await vm.runInContext('render()',ctx);return node('#page').innerHTML;};
  const label=k=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric',year:'numeric'}).format(new Date(k+'T00:00:00Z'));
  const week=(html,start)=>html.match(new RegExp('<article class="panel trend-week" data-week="'+start+'"[\\s\\S]*?</article>'))?.[0];
  const cell=(w,k)=>w.match(new RegExp('<tr data-metric="'+k+'"><th>[^<]*</th><td>([^<]*)</td>'))[1];
  // Let the bootstrap render (session, then render) finish first so its revision cannot discard a later render.
  for(let i=0;i<200&&!node('#page').innerHTML;i++)await new Promise(r=>setTimeout(r,10));
  let html=await page('?tab=trends');
  a.match(html,/Weekly evidence trends/);a.match(html,/class="active" href="\/settings\?tab=trends"/);
  const prev=week(html,wk(2)),sel=week(html,wk(1));a.ok(prev&&sel,'both dated weeks render');
  a.ok(sel.includes(esc(label(wk(1)))+' – '+esc(label(T.addDays(wk(1),6)))),'exact start and end dates');a.match(sel,/Monday 00:00 to Sunday 24:00 · America\/New_York/);
  a.match(sel,/Failed or unavailable source: Example course A/);a.match(sel,/1 duplicate import counted once/);a.match(sel,/<strong>1<\/strong> observation from 2 imports/);
  a.equal(cell(sel,'not_submitted'),'1','only fresh course-b work');a.equal(cell(sel,'retained'),'3');a.equal(cell(sel,'archived'),'1');a.equal(cell(sel,'choice'),'1');
  a.match(sel,/collected [^<]*\(source generatedAt\), imported/);a.match(html,/<strong>Not comparable<\/strong> · coverage limited/);a.doesNotMatch(html,/data-change=/,'no change is shown for a failed-source week');
  a.match(html,/Retention limit:<\/strong> snapshots are kept for 30 days and pruned only when a new import runs\. 4 imports retained/);
  a.doesNotMatch(html,/<img/);a.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'),'source names are escaped');
  // Comparable older pair; then an empty week that says "No observations", never 0.
  html=await page('?tab=trends&week='+wk(2));a.match(html,/<span class="tag">Comparable<\/span>/);a.match(html,/<tr data-change="done"><th>[^<]*<\/th><td>0<\/td><td>1<\/td><td>\+1<\/td>/);a.match(html,/<tr data-change="not_submitted"><th>[^<]*<\/th><td>4<\/td><td>3<\/td><td>-1<\/td>/);
  html=await page('?tab=trends&week='+W0);const empty=week(html,W0);a.match(empty,/<strong>No observations<\/strong> in retained evidence/);a.match(empty,/In progress · partial week through/);
  for(const [k] of [['done'],['not_submitted'],['unknown'],['choice'],['retained']])a.equal(cell(empty,k),'No observations',k);a.doesNotMatch(empty,/<td>0<\/td>/);
  html=await page('?tab=trends&week='+wk(6));a.match(week(html,wk(7)),/This week starts on or before the retained window, so evidence may have been pruned\. This does not mean nothing happened\./);
  html=await page('?tab=trends&week=2026-02-30');a.match(html,/Week not available: week must be a calendar date/);a.match(html,/Show the latest observed week/);
  html=await page('?tab=trends&week=%3Cscript%3E');a.doesNotMatch(html,/<script>/);
  html=await page('');a.match(html,/Dated weekly evidence trends →/);
  html=await page('?tab=trends&week='+wk(1));a.match(week(html,wk(1)),/<th>Not fresh · source failed \(earlier records retained\) or unavailable<\/th><td>3<\/td>/);
  // A forward-skewed row (collected this week by its clock, imported before the read window) becomes the default week: labelled as not read, never "No observations".
  const put=(when,generatedAt)=>s.store.db.prepare('INSERT INTO source_snapshots(at,value) VALUES(?,?)').run(when,JSON.stringify({generatedAt,timezone:NY,sources:[src('course-a','ok','Example course A')],assignments:[]}));
  put(new Date(Date.parse(wk(3)+'T12:00:00Z')).toISOString(),at(0,0));
  html=await page('?tab=trends');let cur=week(html,W0);a.ok(cur&&week(html,wk(1)),'default pair is W-1 and the skewed week');
  a.match(cur,/<strong>No observations read<\/strong>\. 1 retained import collected this week was not read \(imported before the read window\), so this does not mean nothing happened\./);a.match(cur,/Coverage incomplete · 1 retained import collected this week was not read/);
  a.equal(cell(cur,'not_submitted'),'No observations read');a.doesNotMatch(cur,/<strong>No observations<\/strong>/);a.match(html,/Some retained evidence for the week of [\d-]+ to [\d-]+ was not read \(1 import\)/);
  // A truncated read: 500 earlier imports fill the limit, so neither week may claim it has no retained evidence.
  s.store.db.exec('BEGIN');for(let i=0;i<500;i++)put(new Date(Date.parse(wk(1)+'T00:00:00Z')-86400000+i*1000).toISOString(),at(3));s.store.db.exec('COMMIT');
  html=await page('?tab=trends');a.match(html,/Only the first 500 imports were read; later evidence is missing from this view\./);a.match(html,/The snapshot query stopped at 500 imports/);
  for(const k of [wk(1),W0]){cur=week(html,k);a.match(cur,/<strong>No observations read<\/strong> \(query truncated\)\. Later evidence was not read, so this does not mean nothing happened\./,k);a.doesNotMatch(cur,/in retained evidence|<strong>No observations<\/strong>/,k);a.equal(cell(cur,'done'),'No observations read',k);}
 }finally{await new Promise(r=>s.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
