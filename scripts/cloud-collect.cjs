'use strict';
// Cloud collection helper (#56, docs/cloud-collection.md). Needs DAYWEAVE_INGEST_URL (the instance origin) and
// DAYWEAVE_INGEST_SECRET. Files stay in the ignored work folder (default .local/collect) and are never printed in full.
//   context [dir]          read the current snapshot and the server-side Canvas feed
//   build [dir]            current.json + canvas.json + calendar.json/email.json/schedules.json/notes.json (each optional) -> snapshot.json
//   send [dir] [--dry-run] post snapshot.json; a dry run validates and reports archives without writing
const fs=require('node:fs'),path=require('node:path'),{buildSnapshot}=require('../src/collect.cjs'),{root}=require('./paths.cjs');
const [cmd,...rest]=process.argv.slice(2),dry=rest.includes('--dry-run'),dir=path.resolve(rest.find(x=>!x.startsWith('--'))||path.join(root,'.local','collect'));
const read=name=>{const f=path.join(dir,name);return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):undefined;},write=(name,v)=>{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name),JSON.stringify(v,null,1));};
async function call(method,query='',body){const origin=process.env.DAYWEAVE_INGEST_URL,secret=process.env.DAYWEAVE_INGEST_SECRET;if(!origin||!secret)throw Error('Set DAYWEAVE_INGEST_URL and DAYWEAVE_INGEST_SECRET');
 const r=await fetch(new URL('/api/ingest'+query,origin),{method,headers:{Authorization:'Bearer '+secret,...(body?{'Content-Type':'application/json'}:{})},body:body&&JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 const value=await r.json().catch(()=>({error:'HTTP '+r.status}));if(!r.ok)throw Error('Ingest '+method+' failed: '+(value.error||'HTTP '+r.status));return value;}
(async()=>{
 if(cmd==='context'){const v=await call('GET');write('current.json',v.snapshot);write('canvas.json',v.canvas);const s=v.snapshot,cov=s?.calendarCoverage;
  console.log(JSON.stringify({snapshot:s?{generatedAt:s.generatedAt,timezone:s.timezone,assignments:s.assignments.length,events:s.events.length,sources:s.sources.map(x=>x.id+':'+x.status)}:null,
   calendar:cov?{provider:cov.provider,account:cov.account,calendarId:cov.calendarId,calendars:cov.calendars}:null,email:s?.email?{account:s.email.account,query:s.email.request?.query}:null,
   canvas:{status:v.canvas.status,items:v.canvas.items.length,error:v.canvas.error},manualCourses:(s?.courses||[]).filter(c=>c.collection?.mode==='manual').map(c=>({id:c.id,code:c.code,scheduleUrl:c.collection.scheduleUrl||null}))},null,1));return;}
 if(cmd==='build'){const {snapshot,report}=buildSnapshot(read('current.json'),{canvas:read('canvas.json'),calendar:read('calendar.json'),email:read('email.json'),schedules:read('schedules.json'),notes:read('notes.json')});write('snapshot.json',snapshot);console.log(JSON.stringify(report,null,1));return;}
 if(cmd==='send'){const s=read('snapshot.json');if(!s)throw Error('Run build first');console.log(JSON.stringify(await call('POST',dry?'?dryRun=1':'',s),null,1));return;}
 throw Error('Usage: cloud-collect.cjs context|build|send [dir] [--dry-run]');
})().catch(e=>{console.error(e.message);process.exit(1);});
