const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {render}=require('../scripts/render.cjs');
const sample=require('../examples/snapshot.json');
test('Build is self-contained and safe for script-closing source text',()=>{
 const html=render({...sample,summary:'</script><script>throw Error("injected")</script> $&'});
 assert.ok(!html.includes('/* DATA */'));assert.ok(!html.includes('/* APP */'));assert.ok(!html.includes('/* CORE */'));
 const data=html.match(/<script id="snapshot" type="application\/json">([\s\S]*?)<\/script>/)[1];
 assert.equal(JSON.parse(data).summary,'</script><script>throw Error("injected")</script> $&');
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.equal(scripts.length,2);
 for(const [,js] of scripts)new vm.Script(js);
});
test('Configured timezone changes display calculations without changing instants',()=>{
 const C=require('../src/core.cjs');C.configure('Asia/Tokyo');assert.equal(C.zonedISO('2026-10-07','08:00'),'2026-10-06T23:00:00.000Z');C.configure();
});
