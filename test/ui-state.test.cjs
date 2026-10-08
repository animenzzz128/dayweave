const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('visible proposal input immediately invalidates review and new requests use edited values',()=>{
 const d=structuredClone(require('../examples/snapshot.json')),now=new Date();
 d.generatedAt=now.toISOString();d.calendarCoverage.checkedAt=d.generatedAt;d.events=[];d.actionHistory=[];
 const tomorrow=new Date(now.getTime()+86400000).toISOString().slice(0,10);
 const p={...d.proposals[0],start:tomorrow+'T16:00:00Z',end:tomorrow+'T17:00:00Z',recurrence:'One time'};d.proposals=[p];
 d.calendarCoverage.start=now.toISOString();d.calendarCoverage.end=new Date(now.getTime()+4*86400000).toISOString();
 const nodes=new Map(),box={checked:true};const el=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',classList:{add(){},remove(){}},querySelector:()=>box});return nodes.get(id);};
 el('snapshot').textContent=JSON.stringify(d);const saved={};
 const context=vm.createContext({window:{},document:{getElementById:el},Intl,Date,URL,CSS:{escape:x=>x},setTimeout(){},setInterval(){},localStorage:{getItem:()=>null,setItem:(k,v)=>{saved[k]=v;}}});
 for(const f of ['core.cjs','phase2.cjs','app.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',f),'utf8'),context);
 el('proposals').onchange({target:{dataset:{select:p.id},checked:true}});el('makeApproval').onclick();assert.match(el('approvalText').value,/I approve/);
 el('proposals').oninput({target:{dataset:{edit:p.id,field:'title'},value:'Revised focus'}});
 assert.equal(box.checked,false);assert.equal(el('approvalText').value,'');
 el('makeApproval').onclick();assert.equal(el('approvalStatus').textContent,'Select at least one proposal.');
 el('proposals').onchange({target:{dataset:{select:p.id},checked:true}});el('makeApproval').onclick();assert.match(el('approvalText').value,/Revised focus/);
 assert.equal(JSON.parse(saved['dayweave-v1']).edits[p.id].value.title,'Revised focus');
});
