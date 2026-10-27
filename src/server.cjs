'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Store}=require('./store.cjs'),H=require('./hosted.cjs'),Canvas=require('./canvas.cjs'),Sites=require('./coursesite.cjs');
// options.hosted (from hostedConfig) switches from the 127.0.0.1-only local session to Google sign-in for one account.
// options.webDist is a built web/ front end (`npm run build:server` in web/): it then serves / and its assets, and the classic
// UI stays reachable at its own routes (/classic leads there).
const MIME={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
function loadWeb(dist){if(!dist)return null;const root=path.resolve(dist),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 // The page's inline theme script (it avoids a light flash before the app loads) is allowed by its hash, not by 'unsafe-inline'.
 const hashes=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>"'sha256-"+crypto.createHash('sha256').update(m[1]).digest('base64')+"'");
 return {root,html,csp:`default-src 'self'; script-src 'self' ${hashes.join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`};}
function createServer(dir,{hosted=null,ingestSecret='',canvasIcsUrl='',canvasToken='',canvasFetch,courseSites=[],siteFetch,fetch,webDist=''}={}){const web=loadWeb(webDist),store=new Store(dir),sessions=new Map(),auth=hosted&&H.createAuth(hosted,{fetch}),allow=H.limiter();const server=http.createServer(async(req,res)=>{
 const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
 try{const host=hosted?hosted.host:'127.0.0.1:'+server.address().port,origin=hosted?hosted.origin:'http://'+host;if(hosted)for(const [k,v] of Object.entries(H.securityHeaders))res.setHeader(k,v);
 if(req.headers.host!==host)return send(403,{error:hosted?'Unknown host':'Local requests only'});
 // A hosted instance is reached by top-level links from other sites, including Google's sign-in redirect back to
 // /auth/callback, so cross-site GET page navigations are allowed there; any other cross-site request stays refused.
 if(req.headers['sec-fetch-site']==='cross-site'&&!(hosted&&req.method==='GET'&&req.headers['sec-fetch-mode']==='navigate'&&!req.url.startsWith('/api/')))return send(403,{error:hosted?'Cross-site request refused':'Local requests only'});
 const ip=hosted?String(req.headers['fly-client-ip']||req.socket.remoteAddress):'local';if(hosted&&!allow('all:'+ip,600,60000))return send(429,{error:'Too many requests'});
 const u=new URL(req.url,origin),cookie=(req.headers.cookie||'').match(/(?:^|; )dw=([a-f0-9]+)/)?.[1];let session=hosted?auth.session(req):sessions.get(cookie);
 // The cloud collector (#56) reads the current snapshot and the server-side Canvas feed, checks its snapshot with ?dryRun=1, then
 // posts it. All three use the bearer secret; the Canvas feed URL and course-site tokens stay on the server.
 if(u.pathname==='/api/ingest'&&['GET','POST'].includes(req.method)){if(!allow('ingest:'+ip,20,3600000))return send(429,{error:'Too many requests'});if(!H.ingestAuthorized(req,ingestSecret))return send(401,{error:'Invalid ingest credentials'});
  if(req.method==='GET')return send(200,{snapshot:store.snapshot(),canvas:await Canvas.fetchCanvas(canvasIcsUrl,{fetch:canvasFetch,token:canvasToken}),courseSites:await Sites.fetchCourseSites(courseSites,{fetch:siteFetch})});
  let raw='';for await(const part of req){raw+=part;if(raw.length>5e6)throw Error('Request too large');}const incoming=JSON.parse(raw||'null');
  if(u.searchParams.get('dryRun')==='1')return send(200,{ok:true,dryRun:true,...store.previewImport(incoming)});
  const archived=store.previewImport(incoming).archived,d=store.importSnapshot(incoming);return send(200,{ok:true,generatedAt:d.generatedAt,assignments:d.assignments.length,events:d.events.length,archived});}
 if(hosted){if(u.pathname.startsWith('/auth/')){if(!allow('auth:'+ip,30,600000))return send(429,{error:'Too many sign-in attempts'});if(await auth.handle(req,res,u))return;return send(404,{error:'Unknown sign-in route'});}
  if(!session){if(u.pathname.startsWith('/api/'))return send(401,{error:'Sign in again',signIn:'/auth/login'});if(req.method!=='GET')return send(405,{error:'Method not allowed'});res.writeHead(302,{Location:'/auth/login','Cache-Control':'no-store'});return res.end();}}
 if(req.method==='GET'&&u.pathname==='/api/session'){if(hosted)return send(200,{csrf:session.csrf,hosted:true});const id=crypto.randomBytes(24).toString('hex');session={csrf:crypto.randomBytes(24).toString('hex'),at:Date.now()};sessions.set(id,session);res.setHeader('Set-Cookie',`dw=${id}; HttpOnly; SameSite=Strict; Path=/`);return send(200,{csrf:session.csrf});}
 if(u.pathname.startsWith('/api/')){if(!session||!hosted&&Date.now()-session.at>12*3600000)return send(401,{error:'Reload to renew local session'});if(req.method==='POST'&&(req.headers.origin!==origin||req.headers['x-dayweave-token']!==session.csrf))return send(403,{error:'Invalid write origin or session'});
 let body={};if(req.method==='POST'){let raw='';for await(const part of req){raw+=part;if(raw.length>2e6)throw Error('Request too large');}body=JSON.parse(raw||'{}');}
 if(req.method==='GET'&&u.pathname==='/api/snapshot')return send(200,{snapshot:store.snapshot(),progress:store.state()});
 if(req.method==='GET'&&u.pathname==='/api/history')return send(200,store.history({...Object.fromEntries(u.searchParams),query:u.searchParams.get('q')||''}));
 if(req.method==='GET'&&u.pathname==='/api/health')return send(200,{runs:store.runs(),backups:store.backups()});
 if(req.method==='GET'&&u.pathname==='/api/trends')return send(200,store.weeklyTrends(u.searchParams));
 if(req.method==='POST'&&u.pathname==='/api/progress')return send(200,{ok:true,...store.saveState(body.kind,body.id,body.value)});
 if(req.method==='POST'&&u.pathname==='/api/effort/confirm')return send(200,{sample:store.confirmEffort(body.id)});
 if(req.method==='POST'&&u.pathname==='/api/effort/clear')return send(200,store.clearEffort(body.id));
 if(req.method==='POST'&&u.pathname==='/api/todos/save')return send(200,store.saveTodo(body?.todo));
 if(req.method==='POST'&&u.pathname==='/api/todos/complete')return send(200,store.completeTodo(body?.id,body?.done));
 if(req.method==='POST'&&u.pathname==='/api/plan/generate')return send(200,store.generatePlan(body?.date));
 if(req.method==='POST'&&u.pathname==='/api/workload-mode')return send(200,{mode:store.setWorkloadMode(body?.mode)});
 if(req.method==='POST'&&u.pathname==='/api/migrate-progress')return send(200,{migrated:store.migrateProgress(body)});
 if(req.method==='POST'&&u.pathname==='/api/backup')return send(200,{name:store.backup()});
 if(req.method==='POST'&&u.pathname==='/api/restore'){store.restore(body.name);return send(200,{ok:true});}
 if(req.method==='GET'&&u.pathname==='/api/export'){res.setHeader('Content-Disposition','attachment; filename="dayweave-export.json"');return send(200,{snapshot:store.snapshot(),progress:store.state()});}
 if(server.actionRoute&&await server.actionRoute({req,res,u,body,store,send}))return;
 return send(404,{error:'Unknown API route'});}
 if(req.method!=='GET')return send(405,{error:'Method not allowed'});
 if(web){if(u.pathname==='/'||u.pathname==='/index.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':web.csp});return res.end(web.html);}
  if(u.pathname==='/classic'){res.writeHead(302,{Location:'/home','Cache-Control':'no-store'});return res.end();}
  if(u.pathname.startsWith('/assets/')){const file=path.resolve(web.root,'.'+decodeURIComponent(u.pathname)),type=MIME[path.extname(file)];
   if(!type||!file.startsWith(web.root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return send(404,{error:'Page not found'});
   // Built asset names carry a content hash, so a cached copy is never stale.
   res.writeHead(200,{'Content-Type':type,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});return res.end(fs.readFileSync(file));}}
 const routes=['/','/home','/coursework','/timetable','/review','/career','/email','/settings'];const assets={'/app.js':'web/app.js','/app.css':'web/app.css','/core.js':'core.cjs','/phase2.js':'phase2.cjs','/phase3.js':'phase3.cjs','/effort.js':'effort.cjs','/workload.js':'workload.cjs','/email.js':'email.cjs'};const asset=routes.includes(u.pathname)?'web/index.html':assets[u.pathname];if(!asset)return send(404,{error:'Page not found'});
 const mime=asset.endsWith('.html')?'text/html':asset.endsWith('.css')?'text/css':'text/javascript';res.writeHead(200,{'Content-Type':mime+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});res.end(fs.readFileSync(path.join(__dirname,asset)));
 }catch(e){send(400,{error:e.message});}
 });server.store=store;server.on('close',()=>store.close());return server;}
module.exports={createServer};
