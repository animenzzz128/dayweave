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

const keys=html=>[...html.matchAll(/<article class="panel" data-career="([^"]*)"/g)].map(m=>m[1]);
// Eligibility/relationship line per card: the first <p> after the evidence paragraph inside the details.
const facts=html=>Object.fromEntries([...html.matchAll(/<article class="panel" data-career="([^"]*)"[\s\S]*?<summary>Evidence & eligibility<\/summary><p>[^<]*<\/p><p>([^<]*)<\/p>/g)].map(m=>[m[1],m[2]]));
