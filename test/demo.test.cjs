'use strict';
const test=require('node:test'),a=require('node:assert/strict');
const C=require('../src/core.cjs'),D=require('../src/demo.cjs'),W=require('../src/workload.cjs'),PL=require('../src/planner.cjs'),M=require('../src/email.cjs');
const template=require('../examples/luna-demo.json');
const at=x=>new Date(x);

test('demo: the Luna template resolves to a valid snapshot dated around now, in any season',()=>{
 for(const now of ['2026-10-21T13:00:00Z','2026-11-01T15:30:00Z','2027-03-14T02:00:00Z','2027-06-30T23:00:00Z']){
  const d=D.resolve(template,at(now));C.validate(d);
  a.equal(d.generatedAt,new Date(Date.parse(now)-20*60000).toISOString());
  a.equal(JSON.stringify(d).includes('"@'),false,'every relative value is resolved');
  C.configure(d.timezone);const lecture=d.events.find(e=>e.id==='ev-econ-0');
  a.equal(C.dayKey(lecture.start),C.dayKey(now));
  a.equal(new Intl.DateTimeFormat('en-GB',{timeZone:d.timezone,hour:'2-digit',minute:'2-digit'}).format(new Date(lecture.start)),'09:00','wall-clock time survives DST');
 }
});

test('demo: Luna exercises the trust features (overdue, verification, failed source, selectable work)',()=>{
 const now=at('2026-10-21T13:00:00Z'),d=D.resolve(template,now),f=W.focus(d.assignments,d.sources,now,'reduced');
 a.ok(f.urgent.some(x=>x.id==='prod540-peer'&&x.urgency==='overdue'));
 a.ok(f.urgent.some(x=>x.id==='stat610-ps4'));
 a.ok(f.verification.some(x=>x.id==='prod540-memo'),'unknown group receipt needs verification');
 a.ok(d.sources.some(s=>s.status==='failed'));
 a.equal(M.health(d.email,now).state,'complete');
});

test('demo: the deterministic planner can place blocks on a Luna day without touching anything external',()=>{
 const now=at('2026-10-21T13:00:00Z'),d=D.resolve(template,now);C.configure(d.timezone);
 const date=D.addDays(C.dayKey(now),2),r=PL.plan({snapshot:d,date,now});
 a.equal(r.gaps.length,0,r.gaps.join('; '));a.ok(r.blocks.length>0);
 for(const b of r.blocks)a.deepEqual(C.proposalErrors(b,d,now),[]);
});

test('demo: the template only links to example.com and carries no real-looking accounts',()=>{
 const walk=x=>typeof x==='string'?[x]:x&&typeof x==='object'?Object.values(x).flatMap(walk):[];
 for(const s of walk(template)){
  if(/^https?:/.test(s))a.equal(new URL(s).hostname,'example.com',s);
  for(const m of s.match(/[\w.+-]+@[\w.-]+\.\w+/g)||[])a.match(m,/@example\.com$/,m);
 }
});
