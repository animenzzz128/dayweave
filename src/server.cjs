'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Store}=require('./store.cjs');
function createServer(dir){const store=new Store(dir),sessions=new Map();const server=http.createServer(async(req,res)=>{
 const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
 try{const host='127.0.0.1:'+server.address().port;if(req.headers.host!==host||['cross-site'].includes(req.headers['sec-fetch-site']))return send(403,{error:'Local requests only'});
 const u=new URL(req.url,'http://'+host),cookie=(req.headers.cookie||'').match(/(?:^|; )dw=([a-f0-9]+)/)?.[1];let session=sessions.get(cookie);
 if(req.method==='GET'&&u.pathname==='/api/session'){const id=crypto.randomBytes(24).toString('hex');session={csrf:crypto.randomBytes(24).toString('hex'),at:Date.now()};sessions.set(id,session);res.setHeader('Set-Cookie',`dw=${id}; HttpOnly; SameSite=Strict; Path=/`);return send(200,{csrf:session.csrf});}
 if(u.pathname.startsWith('/api/')){if(!session||Date.now()-session.at>12*3600000)return send(401,{error:'Reload to renew local session'});if(req.method==='POST'&&(req.headers.origin!=='http://'+host||req.headers['x-dayweave-token']!==session.csrf))return send(403,{error:'Invalid write origin or session'});
 let body={};if(req.method==='POST'){let raw='';for await(const part of req){raw+=part;if(raw.length>2e6)throw Error('Request too large');}body=JSON.parse(raw||'{}');}
 if(req.method==='GET'&&u.pathname==='/api/snapshot')return send(200,{snapshot:store.snapshot(),progress:store.state()});
 if(req.method==='GET'&&u.pathname==='/api/history')return send(200,store.history({...Object.fromEntries(u.searchParams),query:u.searchParams.get('q')||''}));
 if(req.method==='GET'&&u.pathname==='/api/health')return send(200,{runs:store.runs(),backups:store.backups()});
 if(req.method==='POST'&&u.pathname==='/api/progress')return send(200,{ok:true,...store.saveState(body.kind,body.id,body.value)});
 if(req.method==='POST'&&u.pathname==='/api/effort/confirm')return send(200,{sample:store.confirmEffort(body.id)});
 if(req.method==='POST'&&u.pathname==='/api/effort/clear')return send(200,store.clearEffort(body.id));
 if(req.method==='POST'&&u.pathname==='/api/migrate-progress')return send(200,{migrated:store.migrateProgress(body)});
 if(req.method==='POST'&&u.pathname==='/api/backup')return send(200,{name:store.backup()});
 if(req.method==='POST'&&u.pathname==='/api/restore'){store.restore(body.name);return send(200,{ok:true});}
 if(req.method==='GET'&&u.pathname==='/api/export'){res.setHeader('Content-Disposition','attachment; filename="dayweave-export.json"');return send(200,{snapshot:store.snapshot(),progress:store.state()});}
 if(server.actionRoute&&await server.actionRoute({req,res,u,body,store,send}))return;
 return send(404,{error:'Unknown API route'});}
 if(req.method!=='GET')return send(405,{error:'Method not allowed'});
 const routes=['/','/home','/coursework','/timetable','/review','/career','/email','/settings'];const assets={'/app.js':'web/app.js','/app.css':'web/app.css','/core.js':'core.cjs','/phase2.js':'phase2.cjs','/phase3.js':'phase3.cjs','/effort.js':'effort.cjs'};const asset=routes.includes(u.pathname)?'web/index.html':assets[u.pathname];if(!asset)return send(404,{error:'Page not found'});
 const mime=asset.endsWith('.html')?'text/html':asset.endsWith('.css')?'text/css':'text/javascript';res.writeHead(200,{'Content-Type':mime+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});res.end(fs.readFileSync(path.join(__dirname,asset)));
 }catch(e){send(400,{error:e.message});}
 });server.store=store;server.on('close',()=>store.close());return server;}
module.exports={createServer};
