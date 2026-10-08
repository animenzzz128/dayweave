const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('routed views escape query text, handle invalid dates and keep home compact',async()=>{
 const D=structuredClone(require('../examples/snapshot.json')),nodes=new Map(),node=k=>{if(!nodes.has(k))nodes.set(k,{textContent:'',innerHTML:''});return nodes.get(k);};
 const ctx=vm.createContext({URLSearchParams,Date,Intl,console,window:{addEventListener(){}},document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}},location:{pathname:'/home',search:''},history:{pushState(){}},fetch:async url=>({ok:true,json:async()=>url.endsWith('session')?{csrf:'test'}:{snapshot:D,progress:{}}})});
 for(const file of ['src/core.cjs','src/phase2.cjs','src/phase3.cjs','src/web/app.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});await new Promise(r=>setImmediate(r));
 a.match(node('#page').innerHTML,/Next seven days/);a.doesNotMatch(node('#page').innerHTML,/Requirements, source and checklist/);
 const query=new URLSearchParams({tab:'"><script>evil()</script>'}).toString();ctx.query=query;
 const html=vm.runInContext('coursework(new URLSearchParams(query))',ctx);a.doesNotMatch(html,/<script>/);a.match(html,/&lt;script&gt;/);
 a.doesNotThrow(()=>vm.runInContext("timetable(new URLSearchParams('date=invalid'))",ctx));
 ctx.location.pathname='/email';await vm.runInContext('render()',ctx);a.match(node('#page').innerHTML,/No inbox is scanned/);
});
