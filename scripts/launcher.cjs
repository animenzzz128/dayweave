'use strict';
// Supervising launcher for the local web app. Zero dependencies; this single file may be copied next to a
// private config. Ownership is an exclusive lock file plus a challenge-response over the owner's local channel;
// a PID, an HTTP status or a page banner is never treated as identity. See docs/launcher.md.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),crypto=require('node:crypto'),cp=require('node:child_process');

const EXIT=Object.freeze({OK:0,INTERNAL:1,USAGE:2,NOT_RUNNING:3,CONFIG:10,CHECKOUT:11,CHANGED:12,MISMATCH:20,UNKNOWN_OWNER:21,PORT_OCCUPIED:22,STATE_DIR:23,STARTUP_EXHAUSTED:30,RUNTIME_EXHAUSTED:31});
const CHILD_EXIT=Object.freeze({PORT_OCCUPIED:22,LOAD_FAILED:24,LISTEN_FAILED:25,BEACON_FAILED:26});
const DEFAULTS=Object.freeze({gitExe:'git',requireCleanCheckout:true,logMaxBytes:1048576,startupTimeoutMs:120000,identityTimeoutMs:5000,shutdownGraceMs:10000,heartbeat:{intervalMs:30000,missLimit:4},restart:{maxRestarts:3,windowMs:3600000,backoffMs:[5000,30000,120000]}});
const HISTORY_LIMIT=200,STALE_ARCHIVE_LIMIT=50,LINE_LIMIT=65536,TEXT_LIMIT=2000;
const CONFIG_KEYS=['schemaVersion','manifestPath','port','stateDir','logPath','fallbackLogPath','gitExe','requireCleanCheckout','logMaxBytes','startupTimeoutMs','identityTimeoutMs','shutdownGraceMs','heartbeat','restart'];

const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const errCode=e=>e&&typeof e.code==='string'&&/^[A-Z0-9_]{1,32}$/.test(e.code)?e.code:'ERROR';
const clip=v=>{const s=String(v??'');return s.length>TEXT_LIMIT?s.slice(0,TEXT_LIMIT)+'...':s;};
const errText=e=>clip(e&&e.message||e);
const now=()=>new Date().toISOString();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const norm=p=>{const r=path.resolve(p);return process.platform==='win32'?r.toLowerCase():r;};
const isInside=(child,parent)=>{const r=path.relative(norm(parent),norm(child));return r===''||(!r.startsWith('..')&&!path.isAbsolute(r));};
// Stable JSON for MACs: key order must not change the proof.
const canon=v=>Array.isArray(v)?'['+v.map(canon).join(',')+']':isObj(v)?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}':JSON.stringify(v===undefined?null:v);
const mac=(secret,parts)=>crypto.createHmac('sha256',Buffer.from(secret,'hex')).update(parts.join('\n')).digest('hex');
const macEqual=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&/^[0-9a-f]+$/.test(a)&&crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
const sleepSync=ms=>{try{Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);}catch{}};
const launcherSha256=()=>sha256(fs.readFileSync(__filename));

class LauncherError extends Error{constructor(exit,event,message,fields={}){super(message);this.exit=exit;this.event=event;this.fields=fields;}}

// ---- Diagnostics: never throw, never recurse; first writable sink wins, stderr is always mirrored. ----
function createDiagnostics({stderr=true}={}){
  const sinks=[];let lost=0;
  const append=(s,text)=>{
    try{if(fs.statSync(s.file).size>=s.maxBytes)fs.renameSync(s.file,s.file+'.1');}catch(e){if(e.code!=='ENOENT')throw e;}
    try{fs.appendFileSync(s.file,text);}catch(e){if(e.code!=='ENOENT')throw e;fs.mkdirSync(path.dirname(s.file),{recursive:true});fs.appendFileSync(s.file,text);}
  };
  return {
    sinks,
    get lost(){return lost;},
    add(label,file,maxBytes,front=false){
      if(!file)return;const f=path.resolve(file),i=sinks.findIndex(s=>norm(s.file)===norm(f));if(i>=0)sinks.splice(i,1);
      // The per-user temp file is always the last file sink, whenever other sinks are added.
      const s={label,file:f,maxBytes:maxBytes||DEFAULTS.logMaxBytes,failed:null},t=sinks.findIndex(x=>x.label==='temp');
      if(front)sinks.unshift(s);else if(t>=0&&label!=='temp')sinks.splice(t,0,s);else sinks.push(s);
    },
    write(level,event,fields={}){
      let line;try{line=`${now()} ${level} ${event} ${JSON.stringify(fields)}\n`;}catch{line=`${now()} ${level} ${event} {"unserializable":true}\n`;}
      let prefix='',written=null;const newlyFailed=[];
      for(const s of sinks){
        try{append(s,prefix+line);s.failed=null;written=s.label;break;}
        catch(e){const code=errCode(e);if(s.failed!==code){s.failed=code;newlyFailed.push(s);prefix+=`${now()} WARN diagnostics.sink-unwritable ${JSON.stringify({sink:s.label,code})}\n`;}}
      }
      if(!written){lost++;for(const s of newlyFailed)s.failed=null;}
      if(stderr)try{fs.writeSync(2,prefix+line);}catch{}
      return written;
    }
  };
}
const tempSinkPath=configPath=>path.join(os.tmpdir(),`dayweave-launcher-${sha256(norm(configPath||'(none)')).slice(0,12)}.log`);

// ---- Configuration and manifest ----
function readJson(file,label){
  let buf;try{buf=fs.readFileSync(file);}catch(e){throw new LauncherError(EXIT.CONFIG,`launcher.${label}-unreadable`,`The ${label} file cannot be read`,{code:errCode(e)});}
  let value;try{value=JSON.parse(buf.toString('utf8').replace(/^\uFEFF/,''));}catch{throw new LauncherError(EXIT.CONFIG,`launcher.${label}-malformed`,`The ${label} file is not valid JSON`,{bytes:buf.length});}
  return {value,sha256:sha256(buf)};
}
function loadConfig(configPath){
  const file=path.resolve(configPath),{value:raw,sha256:sum}=readJson(file,'config');
  const bad=m=>{throw new LauncherError(EXIT.CONFIG,'launcher.config-invalid',m);};
  const int=(v,k,min,max)=>{if(!Number.isInteger(v)||v<min||v>max)bad(`${k} must be an integer from ${min} to ${max}`);return v;};
  const text=(v,k)=>{if(typeof v!=='string'||!v.trim())bad(`${k} must be a non-empty string`);return v;};
  const exact=(o,k,keys)=>{if(!isObj(o))bad(`${k} must be an object`);for(const x of Object.keys(o))if(!keys.includes(x))bad(`Unknown key in ${k}`);};
  exact(raw,'config',CONFIG_KEYS);
  if(raw.schemaVersion!==1)bad('schemaVersion must be 1');
  const base=path.dirname(file),abs=p=>path.resolve(base,p),opt=(k,d)=>raw[k]===undefined?d:raw[k];
  const cfg={file,sha256:sum,schemaVersion:1,manifestPath:abs(text(raw.manifestPath,'manifestPath')),port:int(raw.port,'port',1,65535),
    stateDir:abs(text(raw.stateDir,'stateDir')),logPath:abs(text(raw.logPath,'logPath')),
    fallbackLogPath:raw.fallbackLogPath===undefined?null:abs(text(raw.fallbackLogPath,'fallbackLogPath')),
    gitExe:raw.gitExe===undefined?DEFAULTS.gitExe:text(raw.gitExe,'gitExe'),
    requireCleanCheckout:opt('requireCleanCheckout',DEFAULTS.requireCleanCheckout),
    logMaxBytes:int(opt('logMaxBytes',DEFAULTS.logMaxBytes),'logMaxBytes',4096,1073741824),
    startupTimeoutMs:int(opt('startupTimeoutMs',DEFAULTS.startupTimeoutMs),'startupTimeoutMs',100,3600000),
    identityTimeoutMs:int(opt('identityTimeoutMs',DEFAULTS.identityTimeoutMs),'identityTimeoutMs',50,120000),
    shutdownGraceMs:int(opt('shutdownGraceMs',DEFAULTS.shutdownGraceMs),'shutdownGraceMs',50,600000)};
  if(typeof cfg.requireCleanCheckout!=='boolean')bad('requireCleanCheckout must be a boolean');
  if(/[\\/]/.test(cfg.gitExe))cfg.gitExe=abs(cfg.gitExe);
  const hb=opt('heartbeat',DEFAULTS.heartbeat);exact(hb,'heartbeat',['intervalMs','missLimit']);
  cfg.heartbeat={intervalMs:int(hb.intervalMs??DEFAULTS.heartbeat.intervalMs,'heartbeat.intervalMs',20,3600000),missLimit:int(hb.missLimit??DEFAULTS.heartbeat.missLimit,'heartbeat.missLimit',1,100)};
  const rs=opt('restart',DEFAULTS.restart);exact(rs,'restart',['maxRestarts','windowMs','backoffMs']);
  const backoff=rs.backoffMs??DEFAULTS.restart.backoffMs;
  if(!Array.isArray(backoff)||!backoff.length||backoff.length>10)bad('restart.backoffMs must list 1 to 10 delays');
  cfg.restart={maxRestarts:int(rs.maxRestarts??DEFAULTS.restart.maxRestarts,'restart.maxRestarts',0,20),windowMs:int(rs.windowMs??DEFAULTS.restart.windowMs,'restart.windowMs',10,604800000),backoffMs:backoff.map((v,i)=>int(v,`restart.backoffMs[${i}]`,0,3600000))};
  return cfg;
}
function loadManifest(cfg){
  const {value:m,sha256:sum}=readJson(cfg.manifestPath,'manifest');
  const bad=msg=>{throw new LauncherError(EXIT.CONFIG,'launcher.manifest-invalid',msg);};
  if(!isObj(m))bad('Manifest must be a JSON object');
  if(typeof m.revision!=='string'||!/^[0-9a-f]{40}$/.test(m.revision))bad('Manifest revision must be a full 40-character lowercase SHA');
  for(const k of ['codePath','dataPath'])if(typeof m[k]!=='string'||!m[k].trim())bad(`Manifest ${k} must be a non-empty string`);
  if(!Number.isInteger(m.port)||m.port!==cfg.port)bad('Manifest port differs from the configured port');
  const base=path.dirname(cfg.manifestPath),man={sha256:sum,revision:m.revision,codePath:path.resolve(base,m.codePath),dataPath:path.resolve(base,m.dataPath),port:m.port};
  // Launcher state and logs never live inside application data (no data writes) or the checkout (would make it dirty).
  for(const [k,p] of [['stateDir',cfg.stateDir],['logPath',cfg.logPath],['fallbackLogPath',cfg.fallbackLogPath]]){
    if(!p)continue;
    if(isInside(p,man.dataPath))bad(`${k} must not be inside the data directory`);
    if(isInside(p,man.codePath))bad(`${k} must not be inside the checkout`);
  }
  if(isInside(man.dataPath,cfg.stateDir))bad('The data directory must not be inside stateDir');
  return man;
}
function verifyCheckout(cfg,man){
  const git=args=>cp.execFileSync(cfg.gitExe,['--no-optional-locks','-C',man.codePath,...args],{encoding:'utf8',windowsHide:true,timeout:30000,stdio:['ignore','pipe','pipe']});
  let head;try{head=git(['rev-parse','HEAD']).trim();}catch(e){throw new LauncherError(EXIT.CHECKOUT,'launcher.checkout-unverifiable','git could not read the checkout HEAD',{code:errCode(e),status:e.status??null});}
  if(head!==man.revision)throw new LauncherError(EXIT.CHECKOUT,'launcher.checkout-mismatch','Checkout HEAD differs from the manifest revision',{head,revision:man.revision});
  if(cfg.requireCleanCheckout){
    let out;try{out=git(['status','--porcelain','--untracked-files=normal']);}catch(e){throw new LauncherError(EXIT.CHECKOUT,'launcher.checkout-unverifiable','git could not read the checkout status',{code:errCode(e),status:e.status??null});}
    const entries=out.split('\n').filter(Boolean).length;
    if(entries)throw new LauncherError(EXIT.CHECKOUT,'launcher.checkout-dirty','Checkout has tracked or untracked changes',{entries});
  }
  return head;
}
const expectedIdentity=(cfg,man)=>({launcherSha256:launcherSha256(),revision:man.revision,codePath:norm(man.codePath),dataPath:norm(man.dataPath),port:man.port,configSha256:cfg.sha256,manifestSha256:man.sha256});
const identityDiff=(a,b)=>Object.keys(a).filter(k=>!isObj(b)||a[k]!==b[k]);

// ---- Local channels: an owner channel answers identity challenges; a child beacon only exists while its process lives. ----
function channelPath(stateDir,instanceId,kind){
  const tag=sha256(norm(stateDir)).slice(0,16);
  if(process.platform==='win32')return `\\\\.\\pipe\\dayweave-launcher-${tag}-${kind}-${instanceId}`;
  const local=path.join(stateDir,`${kind}-${instanceId}.sock`);
  return Buffer.byteLength(local)<100?local:path.join(os.tmpdir(),`dwl-${tag}-${kind}-${instanceId}.sock`);
}
// "absent" is definitive: no listener can exist (Windows: no pipe; POSIX: socket file without listener).
function connectChannel(channel,timeoutMs){
  return new Promise(resolve=>{
    let done=false;const s=net.connect(channel);
    const fin=r=>{if(done)return;done=true;clearTimeout(t);resolve(r);};
    const t=setTimeout(()=>{s.destroy();fin({status:'timeout'});},timeoutMs);
    s.once('connect',()=>fin({status:'connected',socket:s}));
    s.once('error',e=>{const c=errCode(e),absent=process.platform==='win32'?c==='ENOENT':c==='ECONNREFUSED';fin({status:absent?'absent':'unreachable',code:c});});
  });
}
function exchange(socket,first,timeoutMs,onMessage){
  return new Promise(resolve=>{
    let buf='',n=0,done=false;
    const fin=r=>{if(done)return;done=true;clearTimeout(t);socket.destroy();resolve(r);};
    const t=setTimeout(()=>fin({status:'timeout'}),timeoutMs);
    socket.setEncoding('utf8');
    socket.on('data',d=>{
      buf+=d;if(buf.length>LINE_LIMIT)return fin({status:'garbled'});
      let i;while(!done&&(i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);let m;try{m=JSON.parse(line);}catch{return fin({status:'garbled'});}const r=onMessage(m,n++);if(r)fin(r);}
    });
    socket.on('error',e=>fin({status:'closed',code:errCode(e)}));socket.on('close',()=>fin({status:'closed'}));
    try{socket.write(JSON.stringify(first)+'\n');}catch{fin({status:'closed'});}
  });
}
async function challengeOwner(cfg,lock,{stop=false}={}){
  const c=await connectChannel(channelPath(cfg.stateDir,lock.instanceId,'ctl'),cfg.identityTimeoutMs);
  if(c.status!=='connected')return c;
  const nonce=crypto.randomBytes(32).toString('hex');let proof=null;
  const r=await exchange(c.socket,{type:'challenge',nonce},cfg.identityTimeoutMs,(m,n)=>{
    if(n===0){
      if(!isObj(m)||m.type!=='identity'||m.instanceId!==lock.instanceId||typeof m.serverNonce!=='string'||!/^[0-9a-f]{64}$/.test(m.serverNonce))return {status:'unverified',reason:'unexpected reply'};
      const body={instanceId:m.instanceId,pid:m.pid,identity:m.identity,child:m.child};
      if(!macEqual(m.mac,mac(lock.secret,['identity',nonce,m.serverNonce,canon(body)])))return {status:'unverified',reason:'identity proof failed'};
      proof={status:'verified',body};if(!stop)return proof;
      c.socket.write(JSON.stringify({type:'stop',mac:mac(lock.secret,['stop',m.serverNonce])})+'\n');return null;
    }
    return isObj(m)&&m.type==='stopping'?{...proof,stopping:true}:{status:'unverified',reason:'unexpected reply'};
  });
  return proof&&r.status!=='verified'&&r.status!=='unverified'?{...proof,stopping:false}:r;
}

// ---- Lock and state files (inside stateDir only) ----
const lockFile=dir=>path.join(dir,'launcher.lock');
const stateFile=dir=>path.join(dir,'state.json');
function readLock(dir){
  let buf;try{buf=fs.readFileSync(lockFile(dir));}catch(e){return e.code==='ENOENT'?{status:'none'}:{status:'unreadable',code:errCode(e)};}
  let v;try{v=JSON.parse(buf.toString('utf8'));}catch{return {status:'malformed',raw:buf};}
  if(!isObj(v)||typeof v.instanceId!=='string'||!/^[0-9a-f]{16}$/.test(v.instanceId)||typeof v.secret!=='string'||!/^[0-9a-f]{64}$/.test(v.secret))return {status:'malformed',raw:buf};
  return {status:'ok',lock:v,raw:buf};
}
function readState(dir){
  let text;try{text=fs.readFileSync(stateFile(dir),'utf8');}catch(e){return e.code==='ENOENT'?{status:'none'}:{status:'unreadable',code:errCode(e)};}
  try{const v=JSON.parse(text);return isObj(v)&&Array.isArray(v.history)?{status:'ok',state:v}:{status:'malformed'};}catch{return {status:'malformed'};}
}
// Atomic create: content is complete before the lock name exists, so readers never see a half-written lock.
function createLock(dir,content,instanceId){
  const tmp=path.join(dir,`launcher.lock.${instanceId}.tmp`);
  fs.writeFileSync(tmp,content,{flag:'wx'});
  try{fs.linkSync(tmp,lockFile(dir));return true;}
  catch(e){
    if(e.code==='EEXIST')return false;
    if(!['EPERM','ENOTSUP','ENOSYS','EXDEV','EINVAL'].includes(e.code))throw e;
    let fd;try{fd=fs.openSync(lockFile(dir),'wx');}catch(e2){if(e2.code==='EEXIST')return false;throw e2;}
    try{fs.writeSync(fd,content);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    return true;
  }finally{try{fs.unlinkSync(tmp);}catch{}}
}
function writeStateAtomic(dir,state,instanceId){
  const tmp=path.join(dir,`state.json.${instanceId}.tmp`),text=JSON.stringify(state,null,1);let last;
  for(let i=0;i<6;i++){
    try{fs.writeFileSync(tmp,text);fs.renameSync(tmp,stateFile(dir));return;}
    catch(e){last=e;if(!['EPERM','EBUSY','EACCES'].includes(e.code))break;sleepSync(50);}
  }
  try{fs.unlinkSync(tmp);}catch{}
  throw last;
}

// Holder classification. "dead" requires a definitively absent owner channel AND no possibly-live child.
async function inspectHolder(cfg,expected,read){
  if(read.status!=='ok')return {verdict:'unknown',reason:`lock ${read.status}`};
  const r=await challengeOwner(cfg,read.lock);
  if(r.status==='verified'){const diff=identityDiff(expected,r.body.identity);return diff.length?{verdict:'mismatch',diff,owner:r.body}:{verdict:'verified',owner:r.body};}
  if(r.status!=='absent')return {verdict:'unknown',reason:`owner channel ${r.reason||r.status}${r.code?' '+r.code:''}`};
  const st=readState(cfg.stateDir);
  if(st.status==='ok'&&st.state.instanceId===read.lock.instanceId&&isObj(st.state.child)&&st.state.child.state!=='exited'){
    if(!Number.isInteger(st.state.child.attempt))return {verdict:'unknown',reason:'state of stale owner unreadable'};
    const b=await connectChannel(channelPath(cfg.stateDir,read.lock.instanceId,'child'+st.state.child.attempt),cfg.identityTimeoutMs);
    if(b.socket)b.socket.destroy();
    if(b.status!=='absent')return {verdict:'unknown',reason:`child of stale owner may be running (${b.status})`};
  }else if(st.status!=='ok'&&st.status!=='none')return {verdict:'unknown',reason:`state file ${st.status}`};
  return {verdict:'dead'};
}
async function stealStale(cfg,expected,read,byId){
  const mutex=lockFile(cfg.stateDir)+'.steal';let fd;
  try{fd=fs.openSync(mutex,'wx');}catch(e){if(e.code==='EEXIST')return {ok:false,reason:'steal-busy'};throw e;}
  try{fs.writeSync(fd,JSON.stringify({by:byId,pid:process.pid,at:now()}));}finally{fs.closeSync(fd);}
  try{
    const again=readLock(cfg.stateDir);
    if(again.status!=='ok'||!again.raw.equals(read.raw))return {ok:false,reason:'lock-changed'};
    const v=await inspectHolder(cfg,expected,again);
    if(v.verdict!=='dead')return {ok:false,reason:'holder-not-dead',verdict:v};
    const dir=path.join(cfg.stateDir,'stale-locks');fs.mkdirSync(dir,{recursive:true});
    const dest=path.join(dir,`launcher.lock.${read.lock.instanceId}.json`);
    fs.renameSync(lockFile(cfg.stateDir),dest);
    try{const {secret,...kept}=read.lock;fs.writeFileSync(dest,JSON.stringify({...kept,archivedAt:now(),archivedBy:byId},null,1));}catch{}
    try{const old=fs.readdirSync(dir).map(f=>({f,t:fs.statSync(path.join(dir,f)).mtimeMs})).sort((a,b)=>b.t-a.t);for(const o of old.slice(STALE_ARCHIVE_LIMIT))fs.unlinkSync(path.join(dir,o.f));}catch{}
    return {ok:true,previous:read.lock.instanceId};
  }finally{try{fs.unlinkSync(mutex);}catch{}}
}

// ---- Port probe: refused on loopback is the only "free" answer; anything else is occupied or inconclusive. ----
function connectPort(host,port,timeoutMs){
  return new Promise(resolve=>{
    let done=false;const s=net.connect({host,port});
    const fin=r=>{if(done)return;done=true;clearTimeout(t);s.destroy();resolve(r);};
    const t=setTimeout(()=>fin('TIMEOUT'),timeoutMs);
    s.once('connect',()=>fin('CONNECTED'));s.once('error',e=>fin(errCode(e)));
  });
}
async function probePort(port,timeoutMs=1500){
  const v4=await connectPort('127.0.0.1',port,timeoutMs);
  if(v4!=='ECONNREFUSED')return {free:false,detail:`127.0.0.1 ${v4==='CONNECTED'?'accepted a connection':v4}`};
  const v6=await connectPort('::1',port,timeoutMs);
  if(v6==='ECONNREFUSED'||['EADDRNOTAVAIL','ENETUNREACH','EAFNOSUPPORT','EHOSTUNREACH','EPROTONOSUPPORT'].includes(v6))return {free:true};
  return {free:false,detail:`::1 ${v6==='CONNECTED'?'accepted a connection':v6}`};
}

// ---- Supervisor ----
function addHistory(ctx,entry){
  const h=ctx.state.history;h.push({at:now(),instanceId:ctx.instanceId,...entry});
  if(h.length>HISTORY_LIMIT){const n=h.length-HISTORY_LIMIT;h.splice(0,n);ctx.state.droppedHistory=(ctx.state.droppedHistory||0)+n;}
}
function saveState(ctx,strict=false){
  try{writeStateAtomic(ctx.cfg.stateDir,ctx.state,ctx.instanceId);return true;}
  catch(e){ctx.diag.write('WARN','launcher.state-unwritable',{code:errCode(e)});if(strict)throw new LauncherError(EXIT.STATE_DIR,'launcher.state-unwritable','The state file cannot be written',{code:errCode(e)});return false;}
}
function startControl(ctx){
  return new Promise((resolve,reject)=>{
    const server=net.createServer(sock=>{
      let buf='',n=0,serverNonce=null;sock.setEncoding('utf8');sock.setTimeout(ctx.cfg.identityTimeoutMs,()=>sock.destroy());sock.on('error',()=>{});
      sock.on('data',d=>{
        buf+=d;if(buf.length>LINE_LIMIT)return sock.destroy();
        let i;while((i=buf.indexOf('\n'))>=0){
          const line=buf.slice(0,i);buf=buf.slice(i+1);let m;try{m=JSON.parse(line);}catch{return sock.destroy();}
          if(n++===0&&isObj(m)&&m.type==='challenge'&&typeof m.nonce==='string'&&/^[0-9a-f]{64}$/.test(m.nonce)){
            serverNonce=crypto.randomBytes(32).toString('hex');
            const c=ctx.state&&ctx.state.child,body={instanceId:ctx.instanceId,pid:process.pid,identity:ctx.expected,child:c?{state:c.state,phase:c.phase||null,attempt:c.attempt,pid:c.pid}:null};
            sock.write(JSON.stringify({type:'identity',...body,serverNonce,mac:mac(ctx.secret,['identity',m.nonce,serverNonce,canon(body)])})+'\n');
          }else if(serverNonce&&isObj(m)&&m.type==='stop'&&macEqual(m.mac,mac(ctx.secret,['stop',serverNonce]))){
            serverNonce=null;sock.end(JSON.stringify({type:'stopping'})+'\n');requestStop(ctx,'stop-command');
          }else return sock.destroy();
        }
      });
    });
    server.once('error',reject);
    server.listen(channelPath(ctx.cfg.stateDir,ctx.instanceId,'ctl'),()=>{server.removeListener('error',reject);server.on('error',e=>ctx.diag.write('WARN','launcher.control-error',{code:errCode(e)}));resolve(server);});
  });
}
function requestStop(ctx,reason){
  if(ctx.stopping)return;ctx.stopping=reason;
  ctx.diag.write('INFO','launcher.stop-requested',{reason});
  const child=ctx.child;
  if(child&&child.exitCode===null&&child.signalCode===null){
    try{child.send({type:'shutdown'});}catch{}
    ctx.graceTimer=setTimeout(()=>ctx.killChild&&ctx.killChild('shutdown-grace-expired'),ctx.cfg.shutdownGraceMs);
  }
  if(ctx.wake)ctx.wake();
}
function pipeLines(stream,ctx,event){
  let buf='';stream.setEncoding('utf8');
  stream.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i).replace(/\r$/,'');buf=buf.slice(i+1);if(line)ctx.diag.write('INFO',event,{text:clip(line)});}if(buf.length>TEXT_LIMIT){ctx.diag.write('INFO',event,{text:clip(buf)});buf='';}});
  stream.on('end',()=>{if(buf)ctx.diag.write('INFO',event,{text:clip(buf)});});
}
function runChild(ctx){
  return new Promise(resolve=>{
    const {cfg,man}=ctx,attempt=ctx.attempt,beacon=channelPath(cfg.stateDir,ctx.instanceId,'child'+attempt);
    ctx.state.child={attempt,pid:null,state:'spawning',phase:'spawn',startedAt:now()};
    if(!saveState(ctx))return resolve({fatal:new LauncherError(EXIT.STATE_DIR,'launcher.state-unwritable','Child not started: its record could not be saved first')});
    let child;
    try{
      child=cp.fork(__filename,['child'],{cwd:man.codePath,execPath:process.execPath,execArgv:[],windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],
        env:{...process.env,DAYWEAVE_DATA_DIR:man.dataPath,PORT:String(man.port),DAYWEAVE_LAUNCHER_CHILD:JSON.stringify({codePath:man.codePath,dataPath:man.dataPath,port:man.port,beacon,graceMs:cfg.shutdownGraceMs})}});
    }catch(e){return resolve({phase:'startup',reason:'spawn-failed',message:errText(e)});}
    let phase='startup',reason=null,report=null,listeningAt=null,missed=0,hb=null,settled=false;const errors=new Map();
    // Only this ChildProcess handle is ever signalled, and only before its exit was observed (the PID cannot be reused yet).
    const kill=why=>{if(child.exitCode===null&&child.signalCode===null&&!child.killed){reason=reason||why;ctx.diag.write('WARN','child.terminate-owned',{pid:child.pid,attempt,reason:why});try{child.kill();}catch{}}};
    ctx.child=child;ctx.killChild=kill;
    const startupTimer=setTimeout(()=>kill('startup-timeout'),cfg.startupTimeoutMs);
    const done=r=>{
      if(settled)return;settled=true;clearTimeout(startupTimer);clearInterval(hb);clearTimeout(ctx.graceTimer);ctx.child=null;ctx.killChild=null;
      for(const [code,n] of errors)if(n>1)ctx.diag.write('INFO','child.error-repeats',{pid:child.pid,attempt,code,count:n-1});
      ctx.state.child={...ctx.state.child,state:'exited',exit:{code:r.code??null,signal:r.signal??null},endedAt:now()};saveState(ctx);resolve(r);
    };
    if(child.stdout)pipeLines(child.stdout,ctx,'child.stdout');
    if(child.stderr)pipeLines(child.stderr,ctx,'child.stderr');
    child.on('message',m=>{
      if(!isObj(m)||typeof m.type!=='string')return;
      if(m.type==='pong'){missed=0;return;}
      if(m.type==='fatal'){report={reason:clip(m.reason),message:clip(m.message),phase:clip(m.phase)};return;}
      if(m.type==='listening'){
        if(m.port!==man.port)return kill('listening-on-unexpected-port');
        phase='runtime';listeningAt=Date.now();clearTimeout(startupTimer);
        ctx.state.child={...ctx.state.child,state:'running',phase:'listening',listeningAt:now()};saveState(ctx);
        ctx.diag.write('INFO','child.listening',{pid:child.pid,attempt,port:m.port});
        hb=setInterval(()=>{if(missed>=cfg.heartbeat.missLimit)return kill('unresponsive');missed++;try{child.send({type:'ping',n:Date.now()});}catch{}},cfg.heartbeat.intervalMs);
        return;
      }
      if(['beacon','reserved','loaded'].includes(m.type)){ctx.state.child={...ctx.state.child,phase:m.type};ctx.diag.write('INFO','child.'+m.type,{pid:child.pid,attempt,...(m.assembly?{assembly:clip(m.assembly)}:{})});}
    });
    // Sends and kills on a closing channel can each emit an error later; every one is handled, each code logged once.
    child.on('error',e=>{
      if(child.pid===undefined)return done({phase:'startup',reason:'spawn-failed',message:errText(e)});
      const code=errCode(e),n=(errors.get(code)||0)+1;errors.set(code,n);
      if(n===1)ctx.diag.write('WARN','child.error',{pid:child.pid,attempt,code});
    });
    child.once('exit',(code,signal)=>done({phase,code,signal,reason:reason||(report&&report.reason)||(code===CHILD_EXIT.PORT_OCCUPIED?'port-occupied':'exited'),message:report&&report.message,uptimeMs:listeningAt?Date.now()-listeningAt:null}));
    if(child.pid!==undefined){ctx.state.child={...ctx.state.child,pid:child.pid,state:'starting'};saveState(ctx);ctx.diag.write('INFO','child.spawned',{pid:child.pid,attempt});}
  });
}
async function preSpawnChecks(ctx){
  if(ctx.attempt>0){
    // A restart must run exactly what was verified at startup: same config, manifest and checkout revision.
    let cfg2,man2;try{cfg2=loadConfig(ctx.cfg.file);man2=loadManifest(cfg2);}catch(e){throw new LauncherError(EXIT.CHANGED,'launcher.restart-refused','Config or manifest became unreadable; restart refused',{cause:e.event||errCode(e)});}
    const diff=identityDiff(ctx.expected,expectedIdentity(cfg2,man2));
    if(diff.length)throw new LauncherError(EXIT.CHANGED,'launcher.restart-refused','Config, manifest or launcher changed since start; restart refused',{changed:diff});
    verifyCheckout(ctx.cfg,ctx.man);
  }
  const p=await probePort(ctx.man.port);
  if(!p.free)throw new LauncherError(EXIT.PORT_OCCUPIED,'launcher.port-occupied','Port is occupied by an unverified listener or the probe was inconclusive; nothing started or terminated',{port:ctx.man.port,detail:p.detail});
}
async function supervise(ctx){
  const failures=[];
  for(;;){
    if(ctx.stopping)return {exit:EXIT.OK,level:'INFO',event:'launcher.stopped',fields:{reason:ctx.stopping}};
    await preSpawnChecks(ctx);
    if(ctx.stopping)continue;
    ctx.attempt++;
    const r=await runChild(ctx);
    if(r.fatal)throw r.fatal;
    if(ctx.stopping){addHistory(ctx,{event:'child-stopped',attempt:ctx.attempt,exitCode:r.code??null,signal:r.signal??null});saveState(ctx);continue;}
    const failure={event:'child-failure',attempt:ctx.attempt,phase:r.phase,reason:r.reason,exitCode:r.code??null,signal:r.signal??null,message:r.message||null,uptimeMs:r.uptimeMs??null};
    addHistory(ctx,failure);saveState(ctx);ctx.diag.write('WARN','child.failure-recorded',failure);
    if(r.reason==='port-occupied')throw new LauncherError(EXIT.PORT_OCCUPIED,'launcher.port-occupied','Child found the port occupied before opening application data; no retry',{port:ctx.man.port,detail:r.message||null});
    const t=Date.now();while(failures.length&&t-failures[0]>=ctx.cfg.restart.windowMs)failures.shift();failures.push(t);
    if(failures.length>ctx.cfg.restart.maxRestarts){
      const exit=r.phase==='runtime'?EXIT.RUNTIME_EXHAUSTED:EXIT.STARTUP_EXHAUSTED;
      return {exit,level:'ERROR',event:'launcher.retry-exhausted',fields:{failuresInWindow:failures.length,maxRestarts:ctx.cfg.restart.maxRestarts,windowMs:ctx.cfg.restart.windowMs,lastPhase:r.phase,lastReason:r.reason}};
    }
    const b=ctx.cfg.restart.backoffMs,delay=b[Math.min(failures.length-1,b.length-1)];
    ctx.diag.write('INFO','child.restart-scheduled',{nextAttempt:ctx.attempt+1,delayMs:delay,failuresInWindow:failures.length});
    await new Promise(r=>{const t=setTimeout(r,delay);ctx.wake=()=>{clearTimeout(t);r();};});ctx.wake=null;
  }
}
function releaseOwnership(ctx){
  if(!ctx.owned)return;
  try{const cur=readLock(ctx.cfg.stateDir);if(cur.status==='ok'&&cur.lock.instanceId===ctx.instanceId)fs.unlinkSync(lockFile(ctx.cfg.stateDir));else ctx.diag.write('WARN','launcher.lock-not-ours',{status:cur.status});}
  catch(e){ctx.diag.write('WARN','launcher.lock-release-failed',{code:errCode(e)});}
  ctx.owned=false;
  try{ctx.control&&ctx.control.close();}catch{}
}
async function startMain(ctx){
  const {cfg}=ctx;
  try{fs.mkdirSync(cfg.stateDir,{recursive:true});}catch(e){throw new LauncherError(EXIT.STATE_DIR,'launcher.state-dir-unusable','stateDir cannot be created',{code:errCode(e)});}
  let stolen=null;
  for(let round=0;round<4&&!ctx.owned;round++){
    ctx.instanceId=crypto.randomBytes(8).toString('hex');ctx.secret=crypto.randomBytes(32).toString('hex');
    // The channel exists before the lock does, so any lock a reader finds can already be challenged.
    try{ctx.control=await startControl(ctx);}catch(e){throw new LauncherError(EXIT.STATE_DIR,'launcher.control-unavailable','Local control channel could not be created',{code:errCode(e)});}
    const content=JSON.stringify({schemaVersion:1,instanceId:ctx.instanceId,pid:process.pid,createdAt:now(),secret:ctx.secret,identity:ctx.expected},null,1);
    let created;try{created=createLock(cfg.stateDir,content,ctx.instanceId);}catch(e){ctx.control.close();throw new LauncherError(EXIT.STATE_DIR,'launcher.lock-unwritable','Lock file cannot be created',{code:errCode(e)});}
    if(created){ctx.owned=true;break;}
    ctx.control.close();ctx.control=null;
    const read=readLock(cfg.stateDir);
    if(read.status==='none')continue;
    const v=await inspectHolder(cfg,ctx.expected,read);
    if(v.verdict==='verified')return {exit:EXIT.OK,level:'INFO',event:'launcher.duplicate-refused',fields:{reason:'verified owner already running',owner:v.owner.instanceId,ownerPid:v.owner.pid,child:v.owner.child}};
    if(v.verdict==='mismatch')throw new LauncherError(EXIT.MISMATCH,'launcher.owner-mismatch','A verified owner runs with a different identity; nothing started or stopped',{owner:v.owner.instanceId,ownerPid:v.owner.pid,differs:v.diff,ownerRevision:v.owner.identity&&v.owner.identity.revision,expectedRevision:ctx.expected.revision});
    if(v.verdict==='unknown')throw new LauncherError(EXIT.UNKNOWN_OWNER,'launcher.owner-unknown','Lock holder cannot be verified; nothing started, stolen or terminated',{reason:v.reason,lockFile:lockFile(cfg.stateDir)});
    const p=await probePort(ctx.man.port);
    if(!p.free)throw new LauncherError(EXIT.PORT_OCCUPIED,'launcher.port-occupied','Stale lock, but the port is occupied by an unverified listener; nothing started or terminated',{port:ctx.man.port,detail:p.detail});
    const s=await stealStale(cfg,ctx.expected,read,ctx.instanceId);
    if(s.ok){stolen=s.previous;ctx.diag.write('WARN','launcher.stale-lock-recovered',{previous:s.previous});continue;}
    if(s.reason==='steal-busy'){
      const until=Date.now()+cfg.identityTimeoutMs*2;
      while(Date.now()<until&&fs.existsSync(lockFile(cfg.stateDir)+'.steal'))await sleep(50);
      if(fs.existsSync(lockFile(cfg.stateDir)+'.steal'))throw new LauncherError(EXIT.UNKNOWN_OWNER,'launcher.steal-blocked','A stale-lock recovery marker remains; inspect it manually before removing it',{marker:lockFile(cfg.stateDir)+'.steal'});
    }
  }
  if(!ctx.owned)throw new LauncherError(EXIT.UNKNOWN_OWNER,'launcher.acquire-gave-up','Ownership could not be settled after repeated attempts; nothing started');
  const prev=readState(cfg.stateDir);
  if(prev.status!=='ok'&&prev.status!=='none'){try{fs.renameSync(stateFile(cfg.stateDir),stateFile(cfg.stateDir)+'.unreadable-'+Date.now());}catch{}ctx.diag.write('WARN','launcher.state-reset',{status:prev.status});}
  const old=prev.status==='ok'?prev.state:null;
  ctx.state={schemaVersion:1,instanceId:ctx.instanceId,pid:process.pid,startedAt:now(),identity:ctx.expected,child:null,history:old?old.history.slice(-HISTORY_LIMIT):[],droppedHistory:old&&Number.isInteger(old.droppedHistory)?old.droppedHistory:0};
  addHistory(ctx,{event:'owner-acquired',...(stolen?{recoveredStaleLock:stolen}:{}),...(old&&isObj(old.child)&&old.child.state!=='exited'?{previousChildUnclean:{attempt:old.child.attempt??null,state:clip(old.child.state)}}:{})});
  saveState(ctx,true);
  ctx.diag.write('INFO','launcher.owner-acquired',{instanceId:ctx.instanceId,pid:process.pid,revision:ctx.man.revision,port:ctx.man.port,...(stolen?{recoveredStaleLock:stolen}:{})});
  for(const sig of ['SIGINT','SIGTERM','SIGBREAK','SIGHUP'])try{process.on(sig,()=>requestStop(ctx,sig));}catch{}
  if(process.env.DAYWEAVE_LAUNCHER_FAULT==='uncaught-after-owner'){setImmediate(()=>{throw new Error('injected launcher fault');});await new Promise(()=>{});}
  return supervise(ctx);
}
async function statusOrStop(ctx,stop){
  const {cfg}=ctx,read=readLock(cfg.stateDir),st=readState(cfg.stateDir);
  const out={mode:stop?'stop':'status',lockFile:lockFile(cfg.stateDir),tempLog:tempSinkPath(cfg.file),history:st.status==='ok'?st.state.history.slice(-10):[],droppedHistory:st.status==='ok'?st.state.droppedHistory||0:0};
  if(read.status==='none')return {exit:EXIT.NOT_RUNNING,out:{...out,running:false,owner:'none'}};
  const v=await inspectHolder(cfg,ctx.expected,read);
  if(v.verdict==='dead')return {exit:EXIT.NOT_RUNNING,out:{...out,running:false,owner:'stale-lock',note:'Owner is gone; the next start recovers the lock'}};
  if(v.verdict==='unknown')return {exit:EXIT.UNKNOWN_OWNER,out:{...out,running:null,owner:'unknown',reason:v.reason,note:'Nothing was signalled'}};
  const info={...out,running:true,owner:v.verdict,instanceId:v.owner.instanceId,ownerPid:v.owner.pid,child:v.owner.child,...(v.diff?{differs:v.diff}:{})};
  if(!stop)return {exit:v.verdict==='verified'?EXIT.OK:EXIT.MISMATCH,out:info};
  const r=await challengeOwner(cfg,read.lock,{stop:true});
  if(r.status!=='verified'||!r.stopping)return {exit:EXIT.UNKNOWN_OWNER,out:{...info,stopped:false,reason:'stop not acknowledged'}};
  const until=Date.now()+cfg.shutdownGraceMs+cfg.identityTimeoutMs+5000;
  while(Date.now()<until){const cur=readLock(cfg.stateDir);if(cur.status==='none'||(cur.status==='ok'&&cur.lock.instanceId!==read.lock.instanceId))return {exit:EXIT.OK,out:{...info,running:false,stopped:true}};await sleep(100);}
  return {exit:EXIT.UNKNOWN_OWNER,out:{...info,stopped:false,reason:'owner acknowledged stop but still holds the lock'}};
}

function parseArgs(argv,env){
  const o={mode:argv[0],config:env.DAYWEAVE_LAUNCHER_CONFIG||null,fallbackLog:env.DAYWEAVE_LAUNCHER_FALLBACK_LOG||null,error:null};
  for(let i=1;i<argv.length;i++){
    const a=argv[i];
    if(a==='--config'&&argv[i+1]!==undefined)o.config=argv[++i];
    else if(a==='--fallback-log'&&argv[i+1]!==undefined)o.fallbackLog=argv[++i];
    else{o.error='Unknown or incomplete argument';break;}
  }
  if(!o.error&&!['start','status','stop'].includes(o.mode))o.error='Mode must be start, status or stop';
  if(!o.error&&!o.config)o.error='A config path is required (--config or DAYWEAVE_LAUNCHER_CONFIG)';
  return o;
}
async function cliMain(argv,env,diag,ctx){
  const args=parseArgs(argv,env),readOnly=args.mode==='status';
  // status writes no files at all; its diagnostics go to stderr only.
  if(!readOnly){diag.add('fallback',args.fallbackLog);diag.add('temp',tempSinkPath(args.config?path.resolve(args.config):''));}
  if(args.error){diag.write('ERROR','launcher.usage',{message:args.error,exit:EXIT.USAGE});return EXIT.USAGE;}
  try{
    ctx.cfg=loadConfig(args.config);
    if(!readOnly){diag.add('primary',ctx.cfg.logPath,ctx.cfg.logMaxBytes,true);diag.add('config-fallback',ctx.cfg.fallbackLogPath,ctx.cfg.logMaxBytes);for(const s of diag.sinks)s.maxBytes=ctx.cfg.logMaxBytes;}
    ctx.man=loadManifest(ctx.cfg);
    ctx.expected=expectedIdentity(ctx.cfg,ctx.man);
    if(args.mode==='start'){
      diag.write('INFO','launcher.start',{pid:process.pid,node:process.version,revision:ctx.man.revision,port:ctx.man.port});
      verifyCheckout(ctx.cfg,ctx.man);
      const r=await startMain(ctx);
      return finish(ctx,r.exit,r.level,r.event,r.fields);
    }
    const r=await statusOrStop(ctx,args.mode==='stop');
    try{fs.writeSync(1,JSON.stringify(r.out,null,1)+'\n');}catch{}
    if(!readOnly)diag.write(r.exit===EXIT.OK?'INFO':'WARN','launcher.stop-result',{exit:r.exit,stopped:!!r.out.stopped,owner:r.out.owner});
    return r.exit;
  }catch(e){
    if(e instanceof LauncherError)return finish(ctx,e.exit,'ERROR',e.event,{message:e.message,...e.fields});
    throw e;
  }
}
function finish(ctx,exit,level,event,fields={}){
  ctx.diag.write(level,event,{...fields,exit});
  if(ctx.owned&&ctx.state){addHistory(ctx,{event:'owner-exit',exit,reason:event});saveState(ctx);}
  releaseOwnership(ctx);
  return exit;
}

// ---- Child: beacon, then port reservation, and only then the application (which opens the Store). ----
function loadApp(codePath,dataPath){
  const assembly=path.join(codePath,'src','app-server.cjs');
  if(fs.existsSync(assembly))return {app:require(assembly).build(dataPath),assembly:'app-server'};
  const {createServer}=require(path.join(codePath,'src','server.cjs')),{attach}=require(path.join(codePath,'src','approvals.cjs'));
  return {app:attach(createServer(dataPath)),assembly:'legacy-serve'};
}
const listenAsync=(server,target)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(target,()=>{server.removeListener('error',reject);resolve();});});
function childMain(){
  let phase='init',app=null,beacon=null,closing=false,dying=false;
  const send=m=>{try{if(process.connected)process.send(m);}catch{}};
  const die=(code,reason,message)=>{
    if(dying)return process.exit(code);dying=true;
    if(!process.connected)return process.exit(code);
    const t=setTimeout(()=>process.exit(code),1000);
    try{process.send({type:'fatal',phase,reason,message:clip(message)},()=>{clearTimeout(t);process.exit(code);});}catch{clearTimeout(t);process.exit(code);}
  };
  const onFatal=e=>die(phase==='runtime'?EXIT.INTERNAL:CHILD_EXIT.LOAD_FAILED,phase==='runtime'?'runtime-uncaught':'startup-uncaught',errText(e));
  process.on('uncaughtException',onFatal);process.on('unhandledRejection',onFatal);
  if(typeof process.send!=='function'){try{fs.writeSync(2,'The child mode is internal; use start.\n');}catch{}return process.exit(EXIT.USAGE);}
  let spec;try{spec=JSON.parse(process.env.DAYWEAVE_LAUNCHER_CHILD||'');}catch{return die(CHILD_EXIT.LOAD_FAILED,'bad-spec','Missing child specification');}
  if(!isObj(spec)||!Number.isInteger(spec.port)||typeof spec.beacon!=='string'||typeof spec.codePath!=='string'||typeof spec.dataPath!=='string')return die(CHILD_EXIT.LOAD_FAILED,'bad-spec','Invalid child specification');
  // The beacon is never closed here: it must stay visible until the process (which may still hold the Store) has exited.
  const shutdown=()=>{
    if(closing)return;closing=true;
    setTimeout(()=>process.exit(0),Number(spec.graceMs)||5000).unref();
    if(!app)return process.exit(0);
    try{app.close(()=>process.exit(0));if(app.closeAllConnections)app.closeAllConnections();}catch{process.exit(0);}
  };
  // Losing the supervisor (crash, hard stop, sign-out) closes the IPC channel; the child then stops itself.
  process.on('disconnect',shutdown);
  process.on('message',m=>{if(isObj(m)&&m.type==='ping')send({type:'pong',n:m.n});else if(isObj(m)&&m.type==='shutdown')shutdown();});
  (async()=>{
    phase='beacon';beacon=net.createServer(s=>s.destroy());
    try{await listenAsync(beacon,spec.beacon);}catch(e){return die(CHILD_EXIT.BEACON_FAILED,'beacon-failed',errCode(e));}
    send({type:'beacon'});
    phase='reserve';
    const p=await probePort(spec.port);
    if(!p.free)return die(CHILD_EXIT.PORT_OCCUPIED,'port-occupied',p.detail);
    // Connections are handed to the app with the socket. One accepted before that (only possible while a failed start
    // is exiting) is closed, never left open without an owner.
    const reserve=net.createServer(s=>s.destroy());
    try{await listenAsync(reserve,{host:'127.0.0.1',port:spec.port,exclusive:true});}catch(e){return die(CHILD_EXIT.PORT_OCCUPIED,'port-occupied','reserve '+errCode(e));}
    send({type:'reserved',port:spec.port});
    if(closing)return;
    phase='load';
    let loaded;try{loaded=loadApp(spec.codePath,spec.dataPath);}catch(e){return die(CHILD_EXIT.LOAD_FAILED,'load-failed',errText(e));}
    app=loaded.app;send({type:'loaded',assembly:loaded.assembly});
    phase='listen';
    // Serve on the reserved socket itself: the port was never released between reservation and listening.
    try{await listenAsync(app,reserve._handle);}catch(e){return die(CHILD_EXIT.LISTEN_FAILED,'listen-failed',errCode(e));}
    phase='runtime';app.on('error',e=>die(EXIT.INTERNAL,'server-error',errCode(e)));
    const a=app.address();send({type:'listening',port:a&&a.port,address:a&&a.address});
    if(closing)shutdown();
  })().catch(onFatal);
}

if(require.main===module){
  if(process.argv[2]==='child')childMain();
  else{
    // Registered before any configuration is read, so missing or malformed input is still recorded.
    const diag=createDiagnostics(),ctx={diag,owned:false,stopping:null,attempt:0,child:null};
    let fatal=false;
    const onFatal=e=>{
      if(fatal)return process.exit(EXIT.INTERNAL);fatal=true;
      diag.write('ERROR','launcher.internal-error',{message:errText(e),exit:EXIT.INTERNAL});
      if(ctx.owned&&ctx.state)try{addHistory(ctx,{event:'owner-exit',exit:EXIT.INTERNAL,reason:'launcher.internal-error'});saveState(ctx);}catch{}
      try{releaseOwnership(ctx);}catch{}
      process.exit(EXIT.INTERNAL);
    };
    process.on('uncaughtException',onFatal);process.on('unhandledRejection',onFatal);
    cliMain(process.argv.slice(2),process.env,diag,ctx).then(code=>process.exit(code),onFatal);
  }
}

module.exports={EXIT,CHILD_EXIT,DEFAULTS,createDiagnostics,tempSinkPath,loadConfig,loadManifest,verifyCheckout,expectedIdentity,identityDiff,channelPath,readLock,readState,probePort,canon,mac,isInside,parseArgs};
