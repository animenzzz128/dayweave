const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {createServer}=require('../src/server.cjs'),{hostedConfig,signer,SESSION_COOKIE}=require('../src/hosted.cjs');
const env={DAYWEAVE_PUBLIC_ORIGIN:'https://dayweave.example.com',DAYWEAVE_GOOGLE_CLIENT_ID:'client-1',DAYWEAVE_GOOGLE_CLIENT_SECRET:'shh',DAYWEAVE_ALLOWED_EMAIL:'Owner@Example.com',DAYWEAVE_SESSION_SECRET:'s'.repeat(40)};
const INGEST='i'.repeat(40),origin=env.DAYWEAVE_PUBLIC_ORIGIN;
const idToken=claims=>'h.'+Buffer.from(JSON.stringify({iss:'https://accounts.google.com',aud:'client-1',exp:Date.now()/1000+600,email_verified:true,email:'owner@example.com',...claims})).toString('base64url')+'.sig';
// Raw requests so the test can send the public Host header the platform proxy forwards.
function request(port,p,{method='GET',headers={},body}={}){return new Promise((resolve,reject)=>{const r=http.request({port,path:p,method,headers:{Host:'dayweave.example.com',...headers}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text,json:()=>JSON.parse(text)}));});r.on('error',reject);r.end(body);});}
async function withServer(options,fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dayweave-hosted-')),s=createServer(dir,{hosted:hostedConfig(env),ingestSecret:INGEST,...options});await new Promise(r=>s.listen(0,'127.0.0.1',r));try{await fn(s,s.address().port);}finally{await new Promise(r=>s.close(r));fs.rmSync(dir,{recursive:true,force:true});}}
const jar=res=>[].concat(res.headers['set-cookie']||[]).map(c=>c.split(';')[0]).join('; ');
// Stands in for Google's token endpoint; it echoes the nonce flow() read from the authorization redirect.
let lastNonce='',lastClaims={};const fakeGoogle=async(url,init)=>{a.equal(url,'https://oauth2.googleapis.com/token');a.equal(new URLSearchParams(init.body).get('redirect_uri'),origin+'/auth/callback');return {ok:true,json:async()=>({id_token:idToken({nonce:lastNonce,...lastClaims})})};};
const flow=async(port,claims)=>{const login=await request(port,'/auth/login'),q=new URL(login.headers.location).searchParams;lastNonce=q.get('nonce');lastClaims=claims||{};return request(port,'/auth/callback?code=c1&state='+q.get('state'),{headers:{Cookie:jar(login)}});};

test('hosted config fails closed when partially configured and is off without a public origin',()=>{
 a.equal(hostedConfig({}),null);a.throws(()=>hostedConfig({...env,DAYWEAVE_GOOGLE_CLIENT_SECRET:''}),/DAYWEAVE_GOOGLE_CLIENT_SECRET/);
 a.throws(()=>hostedConfig({...env,DAYWEAVE_PUBLIC_ORIGIN:'http://dayweave.example.com'}),/https/);a.throws(()=>hostedConfig({...env,DAYWEAVE_SESSION_SECRET:'short'}),/32/);
 a.throws(()=>hostedConfig({...env,DAYWEAVE_INGEST_SECRET:'short'}),/32/);a.equal(hostedConfig(env).email,'owner@example.com');});

test('signed values reject tampering and expiry',()=>{const s=signer('k'.repeat(40)),t=s.seal({a:1,exp:Date.now()+1000});a.equal(s.open(t).a,1);a.equal(s.open(t.slice(0,-2)+'xx'),null);a.equal(s.open(s.seal({exp:Date.now()-1})),null);a.equal(signer('o'.repeat(40)).open(t),null);});

test('unauthenticated requests are redirected or refused, with security headers and an exact host',()=>withServer({fetch:fakeGoogle},async(s,port)=>{
 const page=await request(port,'/');a.equal(page.status,302);a.equal(page.headers.location,'/auth/login');a.match(page.headers['strict-transport-security'],/max-age=/);a.equal(page.headers['x-frame-options'],'DENY');
 const expired=await request(port,'/api/session');a.equal(expired.status,401);a.equal(expired.json().signIn,'/auth/login');a.equal((await request(port,'/api/snapshot')).status,401);
 a.equal((await request(port,'/',{headers:{Host:'127.0.0.1:'+port}})).status,403);a.equal((await request(port,'/',{headers:{Host:'evil.example'}})).status,403);
 const login=await request(port,'/auth/login'),to=new URL(login.headers.location);a.equal(to.origin+to.pathname,'https://accounts.google.com/o/oauth2/v2/auth');a.equal(to.searchParams.get('login_hint'),'owner@example.com');
 a.match(login.headers['set-cookie'][0],/^__Host-dwlogin=.*HttpOnly; Secure; SameSite=Lax; Path=\//);}));

test('only the allowlisted, verified Google account for this client and login gets a session',()=>withServer({fetch:fakeGoogle},async(s,port)=>{
 for(const claims of [{email:'other@example.com'},{email_verified:false},{aud:'client-2'},{iss:'https://evil.example'},{exp:Date.now()/1000-10},{nonce:'replayed'}]){const r=await flow(port,claims);a.equal(r.status,403,JSON.stringify(claims));a.ok(!jar(r).includes(SESSION_COOKIE+'=e'));}
 const login=await request(port,'/auth/login');a.equal((await request(port,'/auth/callback?code=c1&state=forged',{headers:{Cookie:jar(login)}})).status,403);
 a.equal((await request(port,'/auth/callback?code=c1&state=x')).status,403);
 const ok=await flow(port);a.equal(ok.status,302);a.equal(ok.headers.location,'/');a.match(String(ok.headers['set-cookie']),/__Host-dw=[^;]+; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=43200/);
 const cookie=jar(ok).split('; ').find(c=>c.startsWith(SESSION_COOKIE+'='));a.equal((await request(port,'/',{headers:{Cookie:cookie}})).status,200);
 const csrf=(await request(port,'/api/session',{headers:{Cookie:cookie}})).json().csrf;a.match(csrf,/^[a-f0-9]{48}$/);
 const write=(headers)=>request(port,'/api/progress',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json',...headers},body:JSON.stringify({kind:'actual',id:'task',value:15})});
 s.store.importSnapshot(require('../examples/snapshot.json'));
 a.equal((await write({Origin:origin})).status,403);a.equal((await write({Origin:'http://dayweave.example.com','x-dayweave-token':csrf})).status,403);a.equal((await write({Origin:origin,'x-dayweave-token':csrf})).status,200);a.equal(s.store.state().actual.task,15);
 a.equal((await request(port,'/auth/logout',{method:'POST',headers:{Cookie:cookie}})).status,403);const out=await request(port,'/auth/logout',{method:'POST',headers:{Cookie:cookie,Origin:origin}});a.equal(out.status,302);a.equal(out.headers.location,'/auth/signed-out');a.match(String(out.headers['set-cookie']),/__Host-dw=; .*Max-Age=0/);const done=await request(port,'/auth/signed-out');a.equal(done.status,200);a.match(done.text,/href="\/auth\/login"/);}));

test('ingest needs the bearer secret, imports a valid snapshot and keeps records on a bad one',()=>withServer({fetch:fakeGoogle},async(s,port)=>{
 const snap=JSON.stringify(require('../examples/snapshot.json')),post=(auth,body=snap)=>request(port,'/api/ingest',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:auth}:{})},body});
 a.equal((await post()).status,401);a.equal((await post('Bearer '+'x'.repeat(40))).status,401);a.equal(s.store.snapshot(),null);
 const ok=await post('Bearer '+INGEST);a.equal(ok.status,200);a.equal(ok.json().ok,true);const before=s.store.snapshot().assignments.length;a.ok(before>0);
 a.equal((await post('Bearer '+INGEST,JSON.stringify({assignments:'nope'}))).status,400);a.equal(s.store.snapshot().assignments.length,before);}));

test('ingest is disabled without a configured secret and sign-in attempts are rate limited',()=>withServer({fetch:fakeGoogle,ingestSecret:''},async(s,port)=>{
 a.equal((await request(port,'/api/ingest',{method:'POST',headers:{Authorization:'Bearer '},body:'{}'})).status,401);
 let last;for(let i=0;i<31;i++)last=await request(port,'/auth/login',{headers:{'Fly-Client-IP':'203.0.113.9'}});a.equal(last.status,429);
 a.equal((await request(port,'/auth/login',{headers:{'Fly-Client-IP':'203.0.113.10'}})).status,302);}));

test('Google redirects back cross-site, so hosted top-level GET navigations pass while other cross-site requests are refused',()=>withServer({fetch:fakeGoogle},async(s,port)=>{
 const nav={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate'};
 const login=await request(port,'/auth/login',{headers:nav}),q=new URL(login.headers.location).searchParams;a.equal(login.status,302);lastNonce=q.get('nonce');lastClaims={};
 const back=await request(port,'/auth/callback?code=c1&state='+q.get('state'),{headers:{...nav,Cookie:jar(login)}});a.equal(back.status,302);a.equal(back.headers.location,'/');
 const cookie=jar(back).split('; ').find(c=>c.startsWith(SESSION_COOKIE+'='));a.equal((await request(port,'/home',{headers:{...nav,Cookie:cookie}})).status,200);
 a.equal((await request(port,'/api/snapshot',{headers:{...nav,Cookie:cookie}})).status,403);a.equal((await request(port,'/api/snapshot',{headers:{'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'cors',Cookie:cookie}})).status,403);
 a.equal((await request(port,'/auth/logout',{method:'POST',headers:{'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate',Origin:origin,Cookie:cookie}})).status,403);}));
