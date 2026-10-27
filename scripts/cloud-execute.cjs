'use strict';
// Calendar executor helper (docs/cloud-execute.md). Needs DAYWEAVE_INGEST_URL (the instance origin) and DAYWEAVE_EXECUTE_SECRET.
// It only talks to the instance; the Google Calendar reads and the single create call are the cloud task's connector calls.
// Files stay in the ignored work folder (default .local/execute).
//   context                          approved versions still open, the coverage calendars and the connector profile
//   verify    Q-N                    args.json -> the exact create arguments per action (go: false means stop)
//   recheck   Q-N ACTION_ID          live-<ACTION_ID>.json -> conflicts and duplicates (writes nothing)
//   pending   Q-N ACTION_ID          args.json + live-<ACTION_ID>.json -> records pending, prints the one create call to make
//   readback  Q-N ACTION_ID          readback-<ACTION_ID>.json -> executed, or unverified with the differences
//   reconcile Q-N ACTION_ID          search-<ACTION_ID>.json -> resolves a lost or unclear create response; never retries
const fs=require('node:fs'),path=require('node:path'),{root}=require('./paths.cjs');
const [cmd,ref,id]=process.argv.slice(2),dir=path.resolve(process.env.DAYWEAVE_EXECUTE_DIR||path.join(root,'.local','execute'));
const read=name=>{const f=path.join(dir,name);if(!fs.existsSync(f))throw Error('Missing '+f);return JSON.parse(fs.readFileSync(f,'utf8'));};
async function call(route,body){const origin=process.env.DAYWEAVE_INGEST_URL,secret=process.env.DAYWEAVE_EXECUTE_SECRET;if(!origin||!secret)throw Error('Set DAYWEAVE_INGEST_URL and DAYWEAVE_EXECUTE_SECRET');
 const r=await fetch(new URL('/api/execute'+route,origin),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+secret,...(body?{'Content-Type':'application/json'}:{})},body:body&&JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 const value=await r.json().catch(()=>({error:'HTTP '+r.status}));if(!r.ok)throw Error('Executor '+(route||'context')+' failed: '+(value.error||'HTTP '+r.status));return value;}
const args=()=>read('args.json').arguments;
(async()=>{let out;
 if(cmd==='context'){out=await call('');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'context.json'),JSON.stringify(out,null,1));}
 else if(cmd==='verify')out=await call('/verify',{reference:ref,declared:args()});
 else if(cmd==='recheck')out=await call('/recheck',{reference:ref,id,read:read('live-'+id+'.json')});
 else if(cmd==='pending')out=await call('/pending',{reference:ref,id,declared:args(),read:read('live-'+id+'.json')});
 else if(cmd==='readback')out=await call('/readback',{reference:ref,id,readback:read('readback-'+id+'.json')});
 else if(cmd==='reconcile')out=await call('/reconcile',{reference:ref,id,search:read('search-'+id+'.json')});
 else throw Error('Usage: cloud-execute.cjs context | verify Q-N | recheck|pending|readback|reconcile Q-N ACTION_ID');
 console.log(JSON.stringify(out,null,1));if(out.go===false||out.status==='unverified')process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exit(1);});
