'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const AI=require('../src/ai.cjs'),D=require('../src/demo.cjs'),C=require('../src/core.cjs');
const template=require('../examples/luna-demo.json');
const at=x=>{const now=new Date(x);return {now,d:D.resolve(template,now)};};
const REF='2026-10-22T12:00:00Z';

test('ai: evidence packs do not change with the day or time the demo is opened, across DST',()=>{
 const base=at(REF),keys=d=>[AI.briefPack(d.d,d.now),...d.d.assignments.filter(AI.breakable).map(x=>AI.breakdownPack(x,d.d,d.now)),AI.proposePack('x',d.d,d.now)].map(AI.fingerprint);
 for(const t of ['2026-10-22T13:30:00Z','2026-11-03T15:30:00Z','2027-03-15T14:00:00Z','2026-10-22T23:30:00Z'])a.deepEqual(keys(at(t)),keys(base),t);
});

test('ai: times reach the model as relative wall-clock times in the snapshot timezone',()=>{
 const {d,now}=at(REF),p=AI.briefPack(d,now),r=new Map(p.records.map(x=>[x.ref,x]));
 a.equal(r.get('assignment:stat610-ps4').due,'day+1 23:59');
 a.equal(r.get('assignment:prod540-peer').due,'day-1 23:59');
 a.equal(r.get('source:econ512-site').lastSuccess,'day-1 08:05');
 a.equal(r.get('source:gmail').lastSuccess,'within the last hour');
 a.deepEqual(p.lists.verification.sort(),['assignment:econ512-exercise','assignment:econ512-response','assignment:prod540-memo']);
});

test('ai: the rule fallback brief always passes its own validator',()=>{
 for(const t of [REF,'2027-01-05T03:00:00Z']){const {d,now}=at(t),p=AI.briefPack(d,now);a.deepEqual(AI.validate(p,AI.fallbackBrief(p)),[]);}
});

test('ai: the brief validator rejects invented sources, numbers, links, executed actions and hidden outages',()=>{
 const {d,now}=at(REF),p=AI.briefPack(d,now),ok={text:'The ECON 512 site failed, so check its items.',cites:['source:econ512-site']};
 const run=(en)=>AI.validate(p,{en:[...en,ok],zh:[{text:'ECON 512 网站读取失败，请先核实。',cites:['source:econ512-site']}]}).join('\n');
 a.equal(run([{text:'Problem Set 4 is due tomorrow at 23:59.',cites:['assignment:stat610-ps4']}]),'');
 a.match(run([{text:'Problem Set 4 is due tomorrow.',cites:['assignment:ps9']}]),/unknown records/);
 a.match(run([{text:'Problem Set 4 is due tomorrow.',cites:[]}]),/no citation/);
 a.match(run([{text:'Problem Set 4 is due tomorrow at 17:00.',cites:['assignment:stat610-ps4']}]),/"17:00" is not in the cited/);
 a.match(run([{text:'See example.com/ps4 for details.',cites:['assignment:stat610-ps4']}]),/link/);
 a.match(run([{text:'I have added a focus block to your calendar.',cites:['assignment:stat610-ps4']}]),/carried out/);
 a.match(run([{text:'Problem Set 4 was submitted.',cites:['assignment:stat610-ps4']}]),/unsubmitted work submitted/);
 a.equal(run([{text:'Problem Set 4 is not submitted yet.',cites:['assignment:stat610-ps4']}]),'');
 a.match(run([{text:'The platform pricing response is required.',cites:['assignment:econ512-response']}]),/optional work required/);
 a.equal(run([{text:'The platform pricing response is optional.',cites:['assignment:econ512-response']}]),'');
 a.match(AI.validate(p,{en:[{text:'Problem Set 4 is due tomorrow.',cites:['assignment:stat610-ps4']}],zh:[{text:'Problem Set 4 明天截止。',cites:['assignment:stat610-ps4']}]}).join('\n'),/failed source source:econ512-site/);
 a.match(AI.validate(p,{en:[{text:'我已为你添加到日历。',cites:['source:econ512-site']}],zh:[{text:'我已经为你安排好了。',cites:['source:econ512-site']}]}).join('\n'),/carried out/);
 a.match(AI.validate(p,null).join('\n'),/1 to 5 sentences/);
});

test('ai: breakdown steps must quote the assignment and respect its AI policy',()=>{
 const {d,now}=at(REF),p=AI.breakdownPack(d.assignments.find(x=>x.id==='stat610-ps4'),d,now);
 const step=(over={})=>({en:'Answer Q1–Q3',zh:'完成 Q1–Q3',minutes:30,quote:'Q1–Q3 short answers',...over});
 a.deepEqual(AI.validate(p,{steps:[step(),step({en:'Write the Q4 interpretation',zh:'写 Q4 解读',quote:'Questions 1–3 are short'})]}),[]);
 a.match(AI.validate(p,{steps:[step(),step({quote:'Use the instructor solutions'})]}).join('\n'),/not copied/);
 a.match(AI.validate(p,{steps:[step(),step({minutes:33})]}).join('\n'),/multiple of 5/);
 a.match(AI.validate(p,{steps:[step(),step({en:'Answer Q9',zh:'完成 Q9'})]}).join('\n'),/"9" is not in the assignment/);
 a.match(AI.validate(p,{steps:[step(),step({en:'Have ChatGPT write the Q5 interpretation'})]}).join('\n'),/hands submitted work to AI/);
 a.match(AI.validate(p,{steps:[step()]}).join('\n'),/2 to 8 steps/);
});

test('ai: a parsed sentence becomes a proposal only through the phase2 checks',()=>{
 const {d,now}=at(REF),p=AI.proposePack('Give Problem Set 4 two hours tomorrow afternoon',d,now);
 const out={status:'proposal',en:'Focus: Problem Set 4',zh:'专注：Problem Set 4',day:1,start:'14:30',minutes:120,cites:['assignment:stat610-ps4','coverage:calendar']};
 a.deepEqual(AI.validate(p,out),[]);
 const clash=AI.toProposal(out,d,now,'s1-en');
 a.equal(clash.proposal.origin,'ai');a.equal(clash.proposal.status,'proposed');a.deepEqual(clash.proposal.attendees,[]);
 a.ok(clash.errors.some(e=>/Overlaps a known calendar commitment/.test(e)),'the STAT 610 lab at 13:30 is caught by the rules, not the model');
 const free=AI.toProposal({...out,start:'15:15',minutes:90},d,now,'s1-en');a.deepEqual(free.errors,[]);
 C.configure(d.timezone);a.equal(C.dayKey(free.proposal.start),D.addDays(C.dayKey(now),1));
 a.match(AI.validate(p,{...out,cites:['assignment:stat610-ps4']}).join('\n'),/coverage/);
 a.match(AI.validate(p,{...out,start:'25:00'}).join('\n'),/HH:MM/);
 a.match(AI.validate(p,{...out,day:9}).join('\n'),/day/);
 a.deepEqual(AI.validate(p,{status:'clarify',en:'Which day?',zh:'哪一天？',day:0,start:'',minutes:0,cites:[]}),[]);
 a.match(AI.validate(p,{status:'go',en:'x',zh:'x',day:0,start:'',minutes:0,cites:[]}).join('\n'),/status/);
});

test('ai: a stored output is used only for the same evidence and only if it still validates',()=>{
 const {d,now}=at(REF),p=AI.briefPack(d,now),output=AI.fallbackBrief(p);
 const store={model:'m',generatedAt:REF,items:[{task:'brief',key:'today',fingerprint:AI.fingerprint(p),output}]};
 a.equal(AI.lookup(store,p,'today').ok,true);
 a.equal(AI.lookup(store,p,'other').reason,'missing');
 const down=JSON.parse(JSON.stringify(d));down.sources.find(s=>s.id==='gmail').status='failed';
 a.equal(AI.lookup(store,AI.briefPack(down,now),'today').reason,'evidence-changed','an outage invalidates the stored brief');
 const tampered={...store,items:[{...store.items[0],output:{...output,en:[{text:'All done.',cites:['source:made-up']}]}}]};
 a.equal(AI.lookup(tampered,p,'today').reason,'invalid');
});

const STORE=path.join(__dirname,'..','examples','luna-ai.json');
test('ai: the stored demo outputs match today\'s Luna evidence',{skip:!fs.existsSync(STORE)&&'examples/luna-ai.json not generated yet'},()=>{
 const store=JSON.parse(fs.readFileSync(STORE,'utf8')),{d,now}=at('2026-11-10T14:00:00Z');
 a.equal(store.synthetic,true);
 const ok=(r,what)=>a.equal(r.ok,true,what+': '+r.reason+' '+(r.errors||[]).join('; '));
 ok(AI.lookup(store,AI.briefPack(d,now),'today'),'brief');
 for(const x of d.assignments.filter(AI.breakable))ok(AI.lookup(store,AI.breakdownPack(x,d,now),x.id),x.id);
 for(const s of store.presets)for(const lang of AI.LANGS)ok(AI.lookup(store,AI.proposePack(s[lang],d,now),s.key+'-'+lang),s.key+'-'+lang);
});
