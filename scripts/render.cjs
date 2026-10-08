'use strict';
const fs=require('node:fs'),path=require('node:path');
const C=require('../src/core.cjs'),{root,dataDir,outputDir}=require('./paths.cjs');
function atomic(file,text){fs.writeFileSync(file+'.tmp',text);fs.renameSync(file+'.tmp',file);}
function render(data){
 C.validate(data);C.configure(data.timezone);
 return fs.readFileSync(path.join(root,'src/template.html'),'utf8')
 .replace('/* CORE */',()=>fs.readFileSync(path.join(root,'src/core.cjs'),'utf8'))
 .replace('/* PHASE2 */',()=>fs.readFileSync(path.join(root,'src/phase2.cjs'),'utf8'))
 .replace('/* PHASE3 */',()=>fs.readFileSync(path.join(root,'src/phase3.cjs'),'utf8'))
 .replace('/* APP */',()=>fs.readFileSync(path.join(root,'src/app.js'),'utf8'))
 .replace('/* DATA */',()=>C.safeJSON(data));
}
function main(){
 const demo=process.argv[2]==='--demo',current=path.join(dataDir,'data.json');
 if(!demo&&!fs.existsSync(current))throw Error('No local snapshot. Run npm run init:local or set DAYWEAVE_DATA_DIR.');
 let data=JSON.parse(fs.readFileSync(demo?path.join(root,'examples/snapshot.json'):current,'utf8'));
 if(!demo&&process.argv[2])data=C.mergeSnapshot(data,JSON.parse(fs.readFileSync(path.resolve(process.argv[2]),'utf8')));
 const html=render(data);fs.mkdirSync(outputDir,{recursive:true});
 const output=path.join(outputDir,demo?'demo.html':'dashboard.html');atomic(output,html);
 if(!demo){
   atomic(current,JSON.stringify(data,null,2));
   const dir=path.join(dataDir,'snapshots');fs.mkdirSync(dir,{recursive:true});
   atomic(path.join(dir,C.dayKey(data.generatedAt)+'.json'),JSON.stringify(data,null,2));
   const cutoff=Date.parse(data.generatedAt)-30*86400000;
   for(const f of fs.readdirSync(dir))if(/^\d{4}-\d{2}-\d{2}\.json$/.test(f)&&Date.parse(f.slice(0,10)+'T23:59:59Z')<cutoff)fs.unlinkSync(path.join(dir,f));
 }
 console.log('Rendered '+path.relative(root,output)+(demo?' (synthetic data only)':''));
}
if(require.main===module)main();
module.exports={render};
