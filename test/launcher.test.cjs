'use strict';
// Supervising launcher: adversarial subprocess tests in synthetic environments (temporary git checkouts, synthetic
// data directories, free loopback ports that are never 8767/8768). Only ChildProcess handles created here are signalled.
const {test,after}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),cp=require('node:child_process'),crypto=require('node:crypto');
const L=require('../scripts/launcher.cjs');
const LAUNCHER=path.join(__dirname,'..','scripts','launcher.cjs'),FORBIDDEN_PORTS=new Set([8767,8768]);
const owned=new Set();
after(()=>{for(const c of owned)if(c.exitCode===null&&c.signalCode===null)c.kill();});

const SYNTH_APP=`'use strict';
// Synthetic application for launcher tests. "open" in the journal marks the moment the Store would open, and records
// whether the launcher's port was already held at that moment (a separate process tries to connect to it).
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
exports.build=dir=>{
  const planFile=process.env.DW_SYNTH_PLAN;let step='ok';
  if(planFile){const plan=JSON.parse(fs.readFileSync(planFile,'utf8')),counter=planFile+'.count';let n=0;try{n=Number(fs.readFileSync(counter,'utf8'))||0;}catch{}fs.writeFileSync(counter,String(n+1));step=plan[Math.min(n,plan.length-1)];}
  const held=cp.spawnSync(process.execPath,['-e',"require('node:net').connect(Number(process.env.PORT),'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"],{timeout:5000,windowsHide:true}).status===0;
  fs.mkdirSync(dir,{recursive:true});const journal=path.join(dir,'store-journal.log');
  fs.appendFileSync(journal,'open '+process.pid+' portHeld='+held+'\\n');
  if(step==='throw-on-build')throw new Error('synthetic store open failure');
  if(step==='hang-on-build'){const end=Date.now()+30000;while(Date.now()<end);}
  const s=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/plain'});r.end('synthetic '+process.pid);});
  const ms=Number(step.split(':')[1]||50);
  s.on('listening',()=>{
    if(step.startsWith('crash-after-listen'))setTimeout(()=>{throw new Error('synthetic runtime fault');},ms);
    if(step.startsWith('hang-after-listen'))setTimeout(()=>{const end=Date.now()+30000;while(Date.now()<end);},ms);
  });
  s.on('close',()=>fs.appendFileSync(journal,'close '+process.pid+'\\n'));
  return s;
};
`;
const LEGACY_SERVER=`'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
exports.createServer=dir=>{fs.mkdirSync(dir,{recursive:true});fs.appendFileSync(path.join(dir,'store-journal.log'),'open '+process.pid+'\\n');return http.createServer((q,r)=>r.end('legacy assembly'));};
`;
const LEGACY_APPROVALS=`'use strict';exports.attach=s=>{s.attached=true;return s;};\n`;

const git=(dir,...args)=>cp.execFileSync('git',['-C',dir,...args],{encoding:'utf8',windowsHide:true}).trim();
const commitAll=(dir,msg)=>{git(dir,'add','-A');git(dir,'-c','user.name=Synthetic','-c','user.email=synthetic@example.com','-c','commit.gpgsign=false','commit','-qm',msg);return git(dir,'rev-parse','HEAD');};
async function freePort(){
  for(;;){const s=net.createServer();await new Promise(r=>s.listen({host:'127.0.0.1',port:0},r));const p=s.address().port;await new Promise(r=>s.close(r));if(!FORBIDDEN_PORTS.has(p))return p;}
}
const baseEnv=()=>Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('DAYWEAVE_')&&!k.startsWith('DW_SYNTH')));

async function makeEnv(t,{plan=null,config={},app='synthetic'}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'dw-launcher-test-'));
  const env={root,code:path.join(root,'code'),data:path.join(root,'data'),state:path.join(root,'state'),logs:path.join(root,'logs'),configPath:path.join(root,'config.json'),manifestPath:path.join(root,'manifest.json')};
  fs.mkdirSync(path.join(env.code,'src'),{recursive:true});
  if(app==='synthetic')fs.writeFileSync(path.join(env.code,'src','app-server.cjs'),SYNTH_APP);
  else if(app==='legacy'){fs.writeFileSync(path.join(env.code,'src','server.cjs'),LEGACY_SERVER);fs.writeFileSync(path.join(env.code,'src','approvals.cjs'),LEGACY_APPROVALS);}
  else fs.cpSync(path.join(__dirname,'..','src'),path.join(env.code,'src'),{recursive:true});
  git(env.code,'init','-q');git(env.code,'config','core.autocrlf','false');env.revision=commitAll(env.code,'synthetic checkout');
  env.port=await freePort();a.ok(!FORBIDDEN_PORTS.has(env.port));
  env.manifest={schemaVersion:1,revision:env.revision,codePath:env.code,dataPath:env.data,port:env.port,previousRevision:'0'.repeat(40)};
  fs.writeFileSync(env.manifestPath,JSON.stringify(env.manifest));
  env.config={schemaVersion:1,manifestPath:'manifest.json',port:env.port,stateDir:'state',logPath:'logs/launcher.log',fallbackLogPath:'logs/fallback.log',identityTimeoutMs:5000,startupTimeoutMs:15000,shutdownGraceMs:3000,heartbeat:{intervalMs:200,missLimit:5},restart:{maxRestarts:2,windowMs:60000,backoffMs:[50,100]},...config};
  fs.writeFileSync(env.configPath,JSON.stringify(env.config));
  env.procEnv=baseEnv();
  if(plan){env.planFile=path.join(root,'plan.json');fs.writeFileSync(env.planFile,JSON.stringify(plan));env.procEnv.DW_SYNTH_PLAN=env.planFile;}
  env.tempSink=L.tempSinkPath(env.configPath);
  t.after(async()=>{
    await run(env,'stop').catch(()=>{});
    await Promise.all((env.procs||[]).map(r=>Promise.race([r.exited,sleep(15000)])));
    try{fs.rmSync(env.tempSink,{recursive:true,force:true});fs.rmSync(env.tempSink+'.1',{force:true});}catch{}
    for(let i=0;i<20;i++){try{fs.rmSync(root,{recursive:true,force:true});break;}catch{await sleep(100);}}
  });
  return env;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms).unref());
function launch(env,mode,extra=[],opts={}){
  const c=cp.spawn(process.execPath,[opts.launcher||LAUNCHER,mode,'--config',opts.config||env.configPath,...extra],{env:{...env.procEnv,...(opts.env||{})},stdio:['ignore','pipe','pipe'],windowsHide:true});
  owned.add(c);
  const r={proc:c,stdout:'',stderr:'',result:null};(env.procs||(env.procs=[])).push(r);c.stdout.setEncoding('utf8');c.stderr.setEncoding('utf8');
  c.stdout.on('data',d=>r.stdout+=d);c.stderr.on('data',d=>r.stderr+=d);
  r.exited=new Promise(res=>c.on('exit',(code,signal)=>{owned.delete(c);r.result={code,signal};res(r.result);}));
  return r;
}
async function run(env,mode,extra,opts){
  const r=launch(env,mode,extra,opts);
  const e=await Promise.race([r.exited,sleep(60000).then(()=>{throw new Error(`launcher ${mode} did not exit`);})]);
  return {...r,...e,json:mode==='start'?null:safeJson(r.stdout)};
}
// Simultaneous launches: wait until all but the supervising one have exited, then return those results.
const losers=async(all,n)=>{await waitFor(()=>all.filter(r=>r.result).length>=n,`${n} launchers to exit`);await sleep(300);return all.filter(r=>r.result).map(r=>r.result);};
const safeJson=s=>{try{return JSON.parse(s);}catch{return null;}};
async function waitFor(fn,label,timeoutMs=20000){
  const end=Date.now()+timeoutMs;
  for(;;){const v=await fn();if(v)return v;if(Date.now()>end)throw new Error('Timed out waiting for '+label);await sleep(50);}
}
const readJsonFile=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch{return null;}};
const stateOf=env=>readJsonFile(path.join(env.state,'state.json'));
const waitRunning=(env,attempt=1,notInstance=null)=>waitFor(()=>{const s=stateOf(env);return s&&s.instanceId!==notInstance&&s.child&&s.child.attempt===attempt&&s.child.state==='running'?s:null;},`child attempt ${attempt} running`);
const events=file=>{try{return fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map(l=>{const m=/^(\S+) (\S+) (\S+) (.*)$/.exec(l);return m?{level:m[2],event:m[3],fields:safeJson(m[4])}:{event:'(unparsed)',raw:l};});}catch{return [];}};
const logEvents=env=>events(path.join(env.logs,'launcher.log'));
const journal=env=>{try{return fs.readFileSync(path.join(env.data,'store-journal.log'),'utf8').split('\n').filter(Boolean);}catch{return [];}};
// Every Store open must happen while the launcher's port reservation is already held.
const opens=env=>{const o=journal(env).filter(l=>l.startsWith('open '));for(const l of o)a.match(l,/ portHeld=true$/,'Store opened before the port was reserved');return o.length;};
const lockPath=env=>path.join(env.state,'launcher.lock');
async function startOwner(env,notInstance=null){const owner=launch(env,'start');await waitRunning(env,1,notInstance);return owner;}
function deadPid(){const r=cp.spawnSync(process.execPath,['-e','console.log(process.pid)'],{encoding:'utf8',windowsHide:true});return Number(r.stdout.trim());}
function forgeLock(env,{pid=deadPid(),instanceId=crypto.randomBytes(8).toString('hex')}={}){
  fs.mkdirSync(env.state,{recursive:true});
  const lock={schemaVersion:1,instanceId,pid,createdAt:new Date().toISOString(),secret:crypto.randomBytes(32).toString('hex'),identity:{}};
  fs.writeFileSync(lockPath(env),JSON.stringify(lock));return lock;
}
// A separate synthetic process the launcher must never stop: an HTTP 200 listener, an idle process or a channel squatter.
function spawnForeign(code,extraEnv={}){
  const c=cp.spawn(process.execPath,['-e',code],{env:{...baseEnv(),...extraEnv},stdio:['ignore','pipe','ignore'],windowsHide:true});
  owned.add(c);c.on('exit',()=>owned.delete(c));c.stdout.setEncoding('utf8');
  const ready=new Promise((res,rej)=>{let b='';c.stdout.on('data',d=>{b+=d;if(b.includes('ready'))res();});c.on('exit',()=>rej(new Error('foreign process exited early')));});
  return {proc:c,ready,alive:()=>c.exitCode===null&&c.signalCode===null};
}
const foreignHttp=(port,host='127.0.0.1')=>spawnForeign(`require('node:http').createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html'});r.end('<title>Dayweave</title>');}).listen(${port},${JSON.stringify(host)},()=>console.log('ready'));`);
const squatter=(name,mode)=>spawnForeign(`require('node:net').createServer(s=>{s.on('error',()=>{});if(process.env.SQUAT_MODE==='reply')s.on('data',()=>s.write(JSON.stringify({type:'identity',instanceId:process.env.SQUAT_ID,pid:1,identity:{},child:null,serverNonce:'a'.repeat(64),mac:'b'.repeat(64)})+'\\n'));}).listen(process.env.SQUAT_NAME,()=>console.log('ready'));setInterval(()=>{},1e6);`,{SQUAT_NAME:name,SQUAT_MODE:mode,SQUAT_ID:path.basename(name).split('-').pop()});
const channelAbsent=async name=>{const r=await new Promise(res=>{const s=net.connect(name);s.once('connect',()=>{s.destroy();res('connected');});s.once('error',e=>res(e.code));});return process.platform==='win32'?r==='ENOENT':r==='ECONNREFUSED'||r==='ENOENT';};
const httpGet=async(port,p='/home')=>{const r=await fetch(`http://127.0.0.1:${port}${p}`);return {status:r.status,type:r.headers.get('content-type'),body:await r.text()};};

// ---------- Unit checks ----------
test('launcher config validation rejects unknown keys, bad types and unsafe paths before anything starts',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-launcher-unit-'));
  try{
    const write=(name,v)=>{const f=path.join(dir,name);fs.writeFileSync(f,typeof v==='string'?v:JSON.stringify(v));return f;};
    const base={schemaVersion:1,manifestPath:'m.json',port:40001,stateDir:'state',logPath:'logs/l.log'};
    write('m.json',{revision:'1'.repeat(40),codePath:'code',dataPath:'data',port:40001});
    const cfg=L.loadConfig(write('ok.json','﻿'+JSON.stringify(base)));
    a.equal(cfg.stateDir,path.join(dir,'state'));a.equal(cfg.restart.maxRestarts,3);a.equal(cfg.heartbeat.missLimit,4);
    const man=L.loadManifest(cfg);a.equal(man.codePath,path.join(dir,'code'));
    const code=(v,fn=L.loadConfig)=>{try{fn(v);return 'ok';}catch(e){return e.exit+':'+e.event;}};
    a.equal(code(write('typo.json',{...base,prot:1})),'10:launcher.config-invalid');
    a.equal(code(write('ver.json',{...base,schemaVersion:2})),'10:launcher.config-invalid');
    a.equal(code(write('str.json',{...base,port:'40001'})),'10:launcher.config-invalid');
    a.equal(code(write('rs.json',{...base,restart:{maxRestarts:99}})),'10:launcher.config-invalid');
    a.equal(code(write('bad.json','{')),'10:launcher.config-malformed');
    a.equal(code(path.join(dir,'missing.json')),'10:launcher.config-unreadable');
    const manErr=(m,c=base)=>{write('m2.json',m);return code(L.loadConfig(write('c2.json',{...c,manifestPath:'m2.json'})),L.loadManifest);};
    a.equal(manErr({revision:'1'.repeat(40),codePath:'code',dataPath:'data',port:40002}),'10:launcher.manifest-invalid');
    a.equal(manErr({revision:'abc',codePath:'code',dataPath:'data',port:40001}),'10:launcher.manifest-invalid');
    a.equal(manErr({revision:'1'.repeat(40),codePath:'code',dataPath:'data',port:40001},{...base,stateDir:'data/state'}),'10:launcher.manifest-invalid');
    a.equal(manErr({revision:'1'.repeat(40),codePath:'code',dataPath:'data',port:40001},{...base,logPath:'code/l.log'}),'10:launcher.manifest-invalid');
    a.equal(manErr({revision:'1'.repeat(40),codePath:'code',dataPath:'state/data',port:40001}),'10:launcher.manifest-invalid');
    a.equal(manErr({revision:'1'.repeat(40),codePath:'code',dataPath:'data',port:40001}),'ok');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('the fictional launcher examples pass the same validation (read only, nothing started)',()=>{
  const cfg=L.loadConfig(path.join(__dirname,'..','examples','launcher','launcher-config.json')),man=L.loadManifest(cfg);
  a.equal(man.port,cfg.port);a.ok(!L.isInside(cfg.stateDir,man.dataPath)&&!L.isInside(cfg.stateDir,man.codePath));
  a.deepEqual(cfg.restart,L.DEFAULTS.restart);a.deepEqual(cfg.heartbeat,L.DEFAULTS.heartbeat);
});
test('scripts/serve.cjs still serves through the shared app assembly',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-serve-test-')),port=await freePort();
  const c=cp.spawn(process.execPath,[path.join(__dirname,'..','scripts','serve.cjs')],{env:{...baseEnv(),DAYWEAVE_DATA_DIR:dir,PORT:String(port)},stdio:['ignore','pipe','ignore'],windowsHide:true});
  owned.add(c);const exited=new Promise(r=>c.on('exit',()=>{owned.delete(c);r();}));
  t.after(async()=>{if(c.exitCode===null)c.kill();await exited;fs.rmSync(dir,{recursive:true,force:true});});
  await new Promise(r=>{let b='';c.stdout.on('data',d=>{b+=d;if(b.includes('Dayweave: http://127.0.0.1:'+port))r();});});
  a.equal((await httpGet(port,'/home')).status,200);a.ok(fs.existsSync(path.join(dir,'dayweave.sqlite')));
});
test('launcher helpers: canonical JSON, MAC, argument parsing and deterministic channel names',()=>{
  a.equal(L.canon({b:1,a:{d:[1,{z:1,y:2}],c:null}}),L.canon({a:{c:null,d:[1,{y:2,z:1}]},b:1}));
  const s='0'.repeat(64);a.notEqual(L.mac(s,['identity','x']),L.mac(s,['identity','y']));
  a.equal(L.parseArgs(['start'],{}).error,'A config path is required (--config or DAYWEAVE_LAUNCHER_CONFIG)');
  a.equal(L.parseArgs(['restart','--config','c'],{}).error,'Mode must be start, status or stop');
  a.equal(L.parseArgs(['start','--config','c','--force'],{}).error,'Unknown or incomplete argument');
  a.equal(L.parseArgs(['status'],{DAYWEAVE_LAUNCHER_CONFIG:'c'}).config,'c');
  a.equal(L.channelPath('state','00112233aabbccdd','ctl'),L.channelPath('state','00112233aabbccdd','ctl'));
  a.notEqual(L.channelPath('state','00112233aabbccdd','ctl'),L.channelPath('other','00112233aabbccdd','ctl'));
  a.ok(L.isInside(path.join('x','y'),'x'));a.ok(!L.isInside('xy','x'));
});
test('diagnostics fall back past unwritable sinks, note the failure once and never throw',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dw-launcher-diag-'));
  try{
    const primary=path.join(dir,'primary.log'),fallback=path.join(dir,'fallback.log');fs.mkdirSync(primary);
    const d=L.createDiagnostics({stderr:false});d.add('primary',primary);d.add('fallback',fallback);
    a.equal(d.write('INFO','one',{n:1}),'fallback');a.equal(d.write('INFO','two',{n:2}),'fallback');
    const ev=events(fallback).map(e=>e.event);a.deepEqual(ev,['diagnostics.sink-unwritable','one','two']);
    fs.rmSync(fallback);fs.mkdirSync(fallback);
    a.equal(d.write('ERROR','lost',{}),null);a.equal(d.lost,1);
    const small=L.createDiagnostics({stderr:false}),f=path.join(dir,'small.log');small.add('primary',f,4096);
    for(let i=0;i<80;i++)small.write('INFO','fill',{pad:'x'.repeat(100)});
    a.ok(fs.statSync(f).size<4096+400);a.ok(fs.existsSync(f+'.1'));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

// ---------- DW-1002 source cases, reproduced against the new launcher ----------
test('source case 1 (config-missing): recorded in the fallback log and the temp sink, exit 10, nothing created',async t=>{
  const env=await makeEnv(t);fs.rmSync(env.configPath);
  const fb=path.join(env.root,'boot','fallback.log');
  const r=await run(env,'start',['--fallback-log',fb]);
  a.equal(r.code,10);
  a.ok(events(fb).some(e=>e.event==='launcher.config-unreadable'&&e.fields.exit===10&&e.fields.code==='ENOENT'));
  a.match(r.stderr,/launcher\.config-unreadable/);
  const r2=await run(env,'start');
  a.equal(r2.code,10);a.ok(events(env.tempSink).some(e=>e.event==='launcher.config-unreadable'),'temp sink records it without --fallback-log');
  a.ok(!fs.existsSync(env.state)&&!fs.existsSync(env.data));
});
test('source case 2 (config-malformed): recorded before any handler-dependent step, exit 10; a BOM config still starts',async t=>{
  const env=await makeEnv(t);const good=fs.readFileSync(env.configPath,'utf8');fs.writeFileSync(env.configPath,'{');
  const fb=path.join(env.root,'boot','fallback.log');
  const r=await run(env,'start',['--fallback-log',fb]);
  a.equal(r.code,10);a.ok(events(fb).some(e=>e.event==='launcher.config-malformed'&&e.fields.exit===10));
  a.ok(!fs.existsSync(env.state)&&!fs.existsSync(env.data));
  fs.writeFileSync(env.configPath,'﻿'+good);
  const owner=await startOwner(env);
  a.equal((await run(env,'stop')).code,0);a.equal((await owner.exited).code,0);
});
test('source case 3 (http200-foreign-process): an HTTP 200 listener is not identity; exit 22, Store never opened, listener untouched',async t=>{
  const env=await makeEnv(t);
  for(const host of ['127.0.0.1','::']){
    const f=foreignHttp(env.port,host);await f.ready;
    const r=await run(env,'start');
    a.equal(r.code,22,host);
    const ev=logEvents(env);a.ok(ev.some(e=>e.event==='launcher.port-occupied'&&e.fields.exit===22));a.ok(!ev.some(e=>e.event==='child.spawned'));
    a.ok(!fs.existsSync(env.data),'data directory never created');a.ok(!fs.existsSync(lockPath(env)),'lock released');
    a.ok(f.alive(),'foreign listener not terminated');a.equal((await httpGet(env.port)).body,'<title>Dayweave</title>');
    f.proc.kill();await new Promise(r=>f.proc.once('exit',r));
  }
});
test('source case 4 (log-unwritable-duplicate): unwritable primary and fallback logs still give a verified duplicate exit 0 with diagnostics',async t=>{
  const env=await makeEnv(t);const owner=await startOwner(env);
  for(const f of ['launcher.log','fallback.log']){fs.rmSync(path.join(env.logs,f),{force:true});fs.mkdirSync(path.join(env.logs,f));}
  const r=await run(env,'start');
  a.equal(r.code,0);a.match(r.stderr,/launcher\.duplicate-refused/);
  const temp=events(env.tempSink);
  a.ok(temp.some(e=>e.event==='diagnostics.sink-unwritable'&&e.fields.sink==='primary'));
  a.ok(temp.some(e=>e.event==='diagnostics.sink-unwritable'&&e.fields.sink==='config-fallback'));
  a.ok(temp.some(e=>e.event==='launcher.duplicate-refused'&&e.fields.exit===0&&e.fields.reason==='verified owner already running'));
  a.equal(opens(env),1);
  a.equal((await run(env,'stop')).code,0);a.equal((await owner.exited).code,0);
});
test('source case 4b: an uncaught fault with every log sink unwritable exits 1 (never 7), releases the lock and keeps history',async t=>{
  const env=await makeEnv(t);
  fs.mkdirSync(path.join(env.logs,'launcher.log'),{recursive:true});fs.mkdirSync(path.join(env.logs,'fallback.log'),{recursive:true});fs.mkdirSync(env.tempSink,{recursive:true});
  const r=await run(env,'start',[],{env:{DAYWEAVE_LAUNCHER_FAULT:'uncaught-after-owner'}});
  a.equal(r.code,1);a.match(r.stderr,/launcher\.internal-error/);a.match(r.stderr,/diagnostics\.sink-unwritable/);
  a.ok(!fs.existsSync(lockPath(env)));
  const h=stateOf(env).history;a.deepEqual(h.at(-1).event,'owner-exit');a.equal(h.at(-1).exit,1);
  a.ok(!fs.existsSync(env.data));
});
test('source case 5 (race-two-launchers): six simultaneous launches give exactly one owner and one Store open',async t=>{
  const env=await makeEnv(t);
  const all=Array.from({length:6},()=>launch(env,'start'));
  await waitRunning(env);
  const finished=await losers(all,5);
  a.equal(finished.length,5,'five launchers exited, one supervises');
  a.deepEqual(finished.map(e=>e.code),[0,0,0,0,0]);
  await sleep(500);
  const ev=logEvents(env);
  a.equal(ev.filter(e=>e.event==='launcher.owner-acquired').length,1);
  a.equal(ev.filter(e=>e.event==='launcher.duplicate-refused').length,5);
  a.equal(ev.filter(e=>e.event==='child.spawned').length,1);
  a.deepEqual(ev.filter(e=>/^child\.(beacon|reserved|loaded|listening)$/.test(e.event)).map(e=>e.event),['child.beacon','child.reserved','child.loaded','child.listening']);
  a.equal(opens(env),1,'exactly one Store open');
  a.equal((await run(env,'stop')).code,0);
  a.ok(journal(env).some(l=>l.startsWith('close ')));a.ok(!fs.existsSync(lockPath(env)));
});
test('source case 6 (no-internal-retry): a runtime crash of the owned child is restarted within budget, history kept',async t=>{
  const env=await makeEnv(t,{plan:['crash-after-listen:300','ok']});
  const owner=launch(env,'start');
  const s=await waitRunning(env,2);
  const f=s.history.find(h=>h.event==='child-failure');
  a.equal(f.phase,'runtime');a.equal(f.reason,'runtime-uncaught');a.equal(f.message,'synthetic runtime fault');a.equal(f.attempt,1);
  a.equal(opens(env),2);a.match((await httpGet(env.port)).body,/^synthetic /);
  a.ok(logEvents(env).some(e=>e.event==='child.restart-scheduled'));
  a.equal((await run(env,'stop')).code,0);a.equal((await owner.exited).code,0);
});

// ---------- Bounded recovery ----------
test('repeated runtime crashes exhaust the bounded budget: exit 31, every failure retained, lock released',async t=>{
  const env=await makeEnv(t,{plan:['crash-after-listen:100']});
  const r=await run(env,'start');
  a.equal(r.code,31);
  const h=stateOf(env).history,fails=h.filter(x=>x.event==='child-failure');
  a.equal(fails.length,3);a.ok(fails.every(x=>x.phase==='runtime'));
  a.deepEqual([h.at(-1).event,h.at(-1).exit],['owner-exit',31]);
  a.equal(opens(env),3);a.ok(!fs.existsSync(lockPath(env)));
  a.ok(logEvents(env).some(e=>e.event==='launcher.retry-exhausted'&&e.fields.exit===31));
  a.ok((await L.probePort(env.port)).free);
});
test('startup failures exhaust with exit 30; a startup failure followed by success recovers',async t=>{
  const env=await makeEnv(t,{plan:['throw-on-build']});
  const r=await run(env,'start');
  a.equal(r.code,30);
  const fails=stateOf(env).history.filter(x=>x.event==='child-failure');
  a.equal(fails.length,3);a.ok(fails.every(x=>x.phase==='startup'&&x.reason==='load-failed'&&x.message==='synthetic store open failure'));
  const env2=await makeEnv(t,{plan:['throw-on-build','ok']});
  const owner=launch(env2,'start');await waitRunning(env2,2);
  a.equal((await run(env2,'stop')).code,0);a.equal((await owner.exited).code,0);
});
test('an unresponsive or hung-at-startup child is terminated through its own handle and restarted',async t=>{
  const env=await makeEnv(t,{plan:['hang-after-listen:100','ok'],config:{heartbeat:{intervalMs:200,missLimit:3}}});
  const owner=launch(env,'start');const s=await waitRunning(env,2);
  a.equal(s.history.find(h=>h.event==='child-failure').reason,'unresponsive');
  a.ok(await channelAbsent(L.channelPath(env.state,s.instanceId,'child1')),'hung child is gone');
  a.ok(logEvents(env).some(e=>e.event==='child.terminate-owned'&&e.fields.reason==='unresponsive'));
  a.equal((await run(env,'stop')).code,0);await owner.exited;
  const env2=await makeEnv(t,{plan:['hang-on-build','ok'],config:{startupTimeoutMs:1500}});
  const owner2=launch(env2,'start');const s2=await waitRunning(env2,2);
  const f=s2.history.find(h=>h.event==='child-failure');a.equal(f.reason,'startup-timeout');a.equal(f.phase,'startup');
  a.equal((await run(env2,'stop')).code,0);await owner2.exited;
});
test('a restart is refused (exit 12) when the revision or the copied launcher file changed while running',async t=>{
  const env=await makeEnv(t,{plan:['crash-after-listen:1500']});
  const owner=launch(env,'start');await waitRunning(env);
  fs.writeFileSync(path.join(env.code,'NOTE.md'),'synthetic change\n');const next=commitAll(env.code,'next');
  fs.writeFileSync(env.manifestPath,JSON.stringify({...env.manifest,revision:next}));
  const e=await owner.exited;
  a.equal(e.code,12);
  a.ok(logEvents(env).some(x=>x.event==='launcher.restart-refused'&&x.fields.changed.includes('revision')));
  a.equal(opens(env),1);
  // A copied launcher file works on its own; replacing that file while running also refuses the restart.
  const env2=await makeEnv(t,{plan:['crash-after-listen:1500']});const copy=path.join(env2.root,'tools','launcher.cjs');
  fs.mkdirSync(path.dirname(copy));fs.copyFileSync(LAUNCHER,copy);
  const owner2=launch(env2,'start',[],{launcher:copy});await waitRunning(env2);
  fs.appendFileSync(copy,'\n// synthetic edit\n');
  a.equal((await owner2.exited).code,12);
  a.ok(logEvents(env2).some(x=>x.event==='launcher.restart-refused'&&x.fields.changed.includes('launcherSha256')));
});

// ---------- Identity, PID reuse and stale locks ----------
test('identity mismatch: another config or a newer revision is refused (exit 20) and the owner is untouched; stop then relaunch works',async t=>{
  const env=await makeEnv(t);const owner=await startOwner(env);
  const cfg2=path.join(env.root,'config2.json');fs.writeFileSync(cfg2,JSON.stringify({...env.config,logPath:'logs/other.log'}));
  const r=await run(env,'start',[],{config:cfg2});
  a.equal(r.code,20);a.ok(events(path.join(env.logs,'other.log')).some(e=>e.event==='launcher.owner-mismatch'&&e.fields.differs.includes('configSha256')));
  fs.writeFileSync(path.join(env.code,'NOTE.md'),'synthetic change\n');const next=commitAll(env.code,'next');
  fs.writeFileSync(env.manifestPath,JSON.stringify({...env.manifest,revision:next}));
  const r2=await run(env,'start');
  a.equal(r2.code,20);
  const mm=logEvents(env).find(e=>e.event==='launcher.owner-mismatch');a.ok(mm.fields.differs.includes('revision'));a.equal(mm.fields.ownerRevision,env.revision);a.equal(mm.fields.expectedRevision,next);
  const st=await run(env,'status');a.equal(st.code,20);a.equal(st.json.owner,'mismatch');
  a.equal(opens(env),1);a.equal(owner.proc.exitCode,null);
  a.equal((await run(env,'stop')).code,0);a.equal((await owner.exited).code,0);
  const owner2=await startOwner(env);a.equal(stateOf(env).identity.revision,next);
  a.equal((await run(env,'stop')).code,0);await owner2.exited;
});
test('a lock naming a live unrelated PID but no owner channel is stale: recovered, the unrelated process never touched',async t=>{
  const env=await makeEnv(t);
  const idle=spawnForeign(`console.log('ready');setInterval(()=>{},1e6);`);await idle.ready;
  const lock=forgeLock(env,{pid:idle.proc.pid});
  const owner=await startOwner(env);
  a.ok(idle.alive(),'process with the recorded PID not signalled');
  const s=stateOf(env);a.equal(s.history.find(h=>h.event==='owner-acquired'&&h.instanceId===s.instanceId).recoveredStaleLock,lock.instanceId);
  const archived=readJsonFile(path.join(env.state,'stale-locks',`launcher.lock.${lock.instanceId}.json`));
  a.equal(archived.instanceId,lock.instanceId);a.equal(archived.pid,idle.proc.pid);a.ok(!('secret' in archived));
  a.equal((await run(env,'stop')).code,0);await owner.exited;a.ok(idle.alive());
});
test('unverifiable holders fail closed (exit 21): squatter with a wrong proof, hung channel, malformed lock; nothing stolen or signalled',async t=>{
  for(const mode of ['reply','silent']){
    const env=await makeEnv(t,{config:{identityTimeoutMs:800}});const lock=forgeLock(env);const before=fs.readFileSync(lockPath(env));
    const sq=squatter(L.channelPath(env.state,lock.instanceId,'ctl'),mode);await sq.ready;
    const r=await run(env,'start');
    a.equal(r.code,21,mode);a.ok(logEvents(env).some(e=>e.event==='launcher.owner-unknown'));
    a.ok(fs.readFileSync(lockPath(env)).equals(before),'lock unchanged');a.ok(sq.alive(),'squatter not signalled');a.ok(!fs.existsSync(env.data));
    const stop=await run(env,'stop');a.equal(stop.code,21);a.equal(stop.json.owner,'unknown');a.ok(sq.alive());
    sq.proc.kill();await new Promise(r=>sq.proc.once('exit',r));
  }
  const env=await makeEnv(t);fs.mkdirSync(env.state,{recursive:true});fs.writeFileSync(lockPath(env),'{"instanceId":');
  a.equal((await run(env,'start')).code,21);a.equal(fs.readFileSync(lockPath(env),'utf8'),'{"instanceId":');
});
test('a stale owner whose recorded child may still live, or a leftover recovery marker, blocks recovery (exit 21)',async t=>{
  const env=await makeEnv(t,{config:{identityTimeoutMs:800}});const lock=forgeLock(env);
  fs.writeFileSync(path.join(env.state,'state.json'),JSON.stringify({schemaVersion:1,instanceId:lock.instanceId,child:{attempt:1,state:'running',pid:1},history:[]}));
  const sq=squatter(L.channelPath(env.state,lock.instanceId,'child1'),'silent');await sq.ready;
  const r=await run(env,'start');
  a.equal(r.code,21);a.match(logEvents(env).find(e=>e.event==='launcher.owner-unknown').fields.reason,/child of stale owner may be running/);
  a.ok(sq.alive());a.ok(!fs.existsSync(env.data));
  sq.proc.kill();await new Promise(r=>sq.proc.once('exit',r));
  const env2=await makeEnv(t,{config:{identityTimeoutMs:300}});forgeLock(env2);fs.writeFileSync(lockPath(env2)+'.steal','{}');
  const r2=await run(env2,'start');
  a.equal(r2.code,21);a.ok(logEvents(env2).some(e=>e.event==='launcher.steal-blocked'));a.ok(fs.existsSync(lockPath(env2)));
});
test('concurrent recovery of a stale lock: exactly one owner, archived once, one Store open',async t=>{
  const env=await makeEnv(t);const lock=forgeLock(env);
  const all=Array.from({length:5},()=>launch(env,'start'));
  await waitRunning(env);
  const exits=await losers(all,4);
  a.equal(exits.length,4);a.ok(exits.every(e=>e.code===0),JSON.stringify(exits));
  a.deepEqual(fs.readdirSync(path.join(env.state,'stale-locks')),[`launcher.lock.${lock.instanceId}.json`]);
  a.equal(logEvents(env).filter(e=>e.event==='launcher.stale-lock-recovered').length,1);
  a.equal(opens(env),1);
  a.equal((await run(env,'stop')).code,0);
});

// ---------- Shutdown, relaunch and checkout trust ----------
test('clean stop and relaunch; status is read-only',async t=>{
  const env=await makeEnv(t);
  const none=await run(env,'status');a.equal(none.code,3);a.equal(none.json.owner,'none');a.ok(!fs.existsSync(env.logs),'status wrote no files');
  const owner=await startOwner(env);
  const st=await run(env,'status');a.equal(st.code,0);a.equal(st.json.owner,'verified');a.equal(st.json.child.state,'running');
  const stop=await run(env,'stop');a.equal(stop.code,0);a.equal(stop.json.stopped,true);a.equal((await owner.exited).code,0);
  a.ok(!fs.existsSync(lockPath(env)));a.ok(journal(env).some(l=>l.startsWith('close ')));a.ok((await L.probePort(env.port)).free);
  a.equal((await run(env,'stop')).code,3);
  const owner2=await startOwner(env);a.equal(opens(env),2);
  a.equal((await run(env,'stop')).code,0);a.equal((await owner2.exited).code,0);
  a.ok(stateOf(env).history.filter(h=>h.event==='owner-exit').every(h=>h.exit===0));
});
test('a hard-killed supervisor: its child stops itself, the stale lock is recovered on relaunch',async t=>{
  const env=await makeEnv(t);const owner=await startOwner(env);const s=stateOf(env);
  owner.proc.kill();await owner.exited;
  await waitFor(async()=>await channelAbsent(L.channelPath(env.state,s.instanceId,'child1'))&&(await L.probePort(env.port)).free,'orphaned child to exit');
  a.ok(fs.existsSync(lockPath(env)),'lock left behind by the killed supervisor');
  const st=await run(env,'status');a.equal(st.code,3);a.equal(st.json.owner,'stale-lock');
  const owner2=await startOwner(env,s.instanceId);
  a.equal(stateOf(env).history.find(h=>h.event==='owner-acquired'&&h.instanceId!==s.instanceId).recoveredStaleLock,s.instanceId);
  a.equal((await run(env,'stop')).code,0);await owner2.exited;
});
test('checkout trust: dirty checkout or HEAD differing from the manifest exits 11 before any lock or data',async t=>{
  const env=await makeEnv(t);fs.writeFileSync(path.join(env.code,'stray.txt'),'x');
  const r=await run(env,'start');a.equal(r.code,11);a.ok(logEvents(env).some(e=>e.event==='launcher.checkout-dirty'));
  fs.rmSync(path.join(env.code,'stray.txt'));
  fs.writeFileSync(env.manifestPath,JSON.stringify({...env.manifest,revision:'f'.repeat(40)}));
  const r2=await run(env,'start');a.equal(r2.code,11);a.ok(logEvents(env).some(e=>e.event==='launcher.checkout-mismatch'));
  a.ok(!fs.existsSync(env.state)&&!fs.existsSync(env.data));
});
test('older revisions without src/app-server.cjs are assembled like their scripts/serve.cjs',async t=>{
  const env=await makeEnv(t,{app:'legacy'});const owner=await startOwner(env);
  a.equal((await httpGet(env.port)).body,'legacy assembly');
  a.ok(logEvents(env).some(e=>e.event==='child.loaded'&&e.fields.assembly==='legacy-serve'));
  a.equal((await run(env,'stop')).code,0);await owner.exited;
});
test('real application copy: concurrent launches open one Store, serve /home and /app.js; a foreign listener keeps data untouched',async t=>{
  const env=await makeEnv(t,{app:'real'});
  const all=Array.from({length:4},()=>launch(env,'start'));
  await waitRunning(env);
  const exits=await losers(all,3);
  a.equal(exits.length,3);a.ok(exits.every(e=>e.code===0));
  const home=await httpGet(env.port,'/home');a.equal(home.status,200);a.match(home.type,/text\/html/);
  a.equal((await httpGet(env.port,'/app.js')).status,200);
  a.ok(fs.existsSync(path.join(env.data,'dayweave.sqlite')));
  a.equal(logEvents(env).filter(e=>e.event==='child.spawned').length,1);
  a.ok(logEvents(env).some(e=>e.event==='child.loaded'&&e.fields.assembly==='app-server'));
  a.equal((await run(env,'stop')).code,0);
  const env2=await makeEnv(t,{app:'real'});const f=foreignHttp(env2.port);await f.ready;
  a.equal((await run(env2,'start')).code,22);a.ok(!fs.existsSync(env2.data));a.ok(f.alive());
  f.proc.kill();await new Promise(r=>f.proc.once('exit',r));
});
