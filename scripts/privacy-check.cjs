// Basic tracked-file guard, not a guarantee that arbitrary prose is anonymous.
const fs=require('node:fs'),{execFileSync}=require('node:child_process'),path=require('node:path');
const {root}=require('./paths.cjs');
// --dir <path>: scan a build output (the public web demo) for secrets, personal paths and non-example email addresses.
const dirArg=process.argv.indexOf('--dir');
if(dirArg>0){
 const dir=path.resolve(process.argv[dirArg+1]||'');if(!fs.existsSync(dir))throw Error('No build output at '+dir);
 const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
 const bad=[];let n=0;
 for(const f of walk(dir).filter(f=>/\.(html|js|css|json|txt|map)$/.test(f))){n++;const text=fs.readFileSync(f,'utf8'),rel=path.relative(dir,f);
  if(/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(text))bad.push(rel+': possible secret');
  if(/[A-Za-z]:[\\/]Users[\\/][^\s"']+|\/Users\/[^\s"']+|\/home\/[^\s"']+/.test(text))bad.push(rel+': personal absolute path');
  for(const m of text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)||[])if(!/@(?:example\.com|calendar\.example|users\.noreply\.github\.com)$/i.test(m))bad.push(rel+': email address '+m);
 }
 if(bad.length){console.error([...new Set(bad)].join('\n'));process.exit(1);}
 console.log(`Build privacy guard passed for ${n} files in ${path.relative(root,dir)||dir}.`);process.exit(0);
}
const files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
if(!files.length)throw Error('No tracked files: stage the intended source files before running this check.');
const failures=[];
for(const f of files){
 if(/(^|\/)(\.local|dist|snapshots|node_modules)\//.test(f)||/(^|\/)(data|incoming|action-history|candidate-history)\.json$/.test(f)||/\.(docx|xlsx|pdf|pem|pfx|p12|key|zip)$/i.test(f)||/(^|\/)\.env(?:\.|$)/.test(f))failures.push(f+': private/runtime file');
 const text=fs.readFileSync(path.join(root,f),'utf8');
 if(/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(text))failures.push(f+': possible secret');
 if(/[A-Za-z]:[\\/]Users[\\/][^\s]+|\/Users\/[^\s]+|\/home\/[^\s]+/.test(text))failures.push(f+': personal absolute path');
 if(f.startsWith('examples/')){
   const data=JSON.parse(text);const check=x=>{if(typeof x==='string'&&/^https?:/.test(x)&&new URL(x).hostname!=='example.com')failures.push(f+': non-example URL');else if(x&&typeof x==='object')Object.values(x).forEach(check);};check(data);
 }
}
if(failures.length){console.error(failures.join('\n'));process.exit(1);}console.log(`Privacy guard passed for ${files.length} tracked files. Manual review is still required before publishing.`);
