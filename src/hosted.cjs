'use strict';
// Hosted (private instance) mode: one allowlisted Google account, no sign-up. Off unless DAYWEAVE_PUBLIC_ORIGIN is set,
// and then every other variable must be present, so a half-configured deploy fails closed at startup instead of opening up.
const crypto=require('node:crypto');
const GOOGLE_AUTH='https://accounts.google.com/o/oauth2/v2/auth',GOOGLE_TOKEN='https://oauth2.googleapis.com/token',GOOGLE_ISSUERS=['accounts.google.com','https://accounts.google.com'];
const SESSION_MS=12*3600000,LOGIN_MS=10*60000,SESSION_COOKIE='__Host-dw',LOGIN_COOKIE='__Host-dwlogin';
const b64=s=>Buffer.from(s).toString('base64url'),same=(a,b)=>{a=Buffer.from(String(a));b=Buffer.from(String(b));return a.length===b.length&&crypto.timingSafeEqual(a,b);};
function hostedConfig(env=process.env){
 if(!env.DAYWEAVE_PUBLIC_ORIGIN)return null;
 const origin=new URL(env.DAYWEAVE_PUBLIC_ORIGIN);if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.username)throw Error('DAYWEAVE_PUBLIC_ORIGIN must be a bare https origin');
 const need=['DAYWEAVE_GOOGLE_CLIENT_ID','DAYWEAVE_GOOGLE_CLIENT_SECRET','DAYWEAVE_ALLOWED_EMAIL','DAYWEAVE_SESSION_SECRET'],missing=need.filter(k=>!env[k]);if(missing.length)throw Error('Hosted mode needs '+missing.join(', '));
 if(env.DAYWEAVE_SESSION_SECRET.length<32)throw Error('DAYWEAVE_SESSION_SECRET must be at least 32 characters');
 if(env.DAYWEAVE_INGEST_SECRET&&env.DAYWEAVE_INGEST_SECRET.length<32)throw Error('DAYWEAVE_INGEST_SECRET must be at least 32 characters');
 return {origin:origin.origin,host:origin.host,clientId:env.DAYWEAVE_GOOGLE_CLIENT_ID,clientSecret:env.DAYWEAVE_GOOGLE_CLIENT_SECRET,email:env.DAYWEAVE_ALLOWED_EMAIL.trim().toLowerCase(),sessionSecret:env.DAYWEAVE_SESSION_SECRET};}
// Stateless signed values, so a machine restart or Fly auto-stop does not sign the owner out.
function signer(secret){const mac=v=>crypto.createHmac('sha256',secret).update(v).digest('base64url');
 return {seal:value=>{const v=b64(JSON.stringify(value));return v+'.'+mac(v);},open:token=>{const [v,m]=String(token||'').split('.');if(!v||!m||!same(m,mac(v)))return null;try{const value=JSON.parse(Buffer.from(v,'base64url'));return value.exp>Date.now()?value:null;}catch{return null;}}};}
const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(/; */).filter(Boolean).map(c=>{const i=c.indexOf('=');return [c.slice(0,i),c.slice(i+1)];}));
const cookie=(name,value,maxAge,sameSite='Lax')=>`${name}=${value}; HttpOnly; Secure; SameSite=${sameSite}; Path=/; Max-Age=${maxAge}`;
// Fixed-window limits per client address. Fly-Client-IP is set by the Fly proxy; it is trusted only in hosted mode.
function limiter(){const hits=new Map();return (key,max,windowMs)=>{const now=Date.now(),h=hits.get(key);if(!h||now-h.at>windowMs){hits.set(key,{at:now,n:1});if(hits.size>10000)for(const [k,v] of hits)if(now-v.at>windowMs)hits.delete(k);return true;}return ++h.n<=max;};}
function createAuth(config,{fetch:doFetch=globalThis.fetch}={}){
 const s=signer(config.sessionSecret),redirectUri=config.origin+'/auth/callback';
 const session=req=>{const v=s.open(cookies(req)[SESSION_COOKIE]);return v&&v.email===config.email?v:null;};
 async function handle(req,res,u){
  const redirect=(to,setCookies=[])=>{res.writeHead(302,{Location:to,'Cache-Control':'no-store','Set-Cookie':setCookies});res.end();};
  if(req.method==='GET'&&u.pathname==='/auth/login'){const state=crypto.randomBytes(24).toString('base64url'),nonce=crypto.randomBytes(24).toString('base64url');
   const q=new URLSearchParams({client_id:config.clientId,redirect_uri:redirectUri,response_type:'code',scope:'openid email',state,nonce,login_hint:config.email,prompt:'select_account'});
   return redirect(GOOGLE_AUTH+'?'+q,[cookie(LOGIN_COOKIE,s.seal({state,nonce,exp:Date.now()+LOGIN_MS}),LOGIN_MS/1000)]),true;}
  if(req.method==='GET'&&u.pathname==='/auth/callback'){
   const pending=s.open(cookies(req)[LOGIN_COOKIE]),clear=cookie(LOGIN_COOKIE,'',0);
   if(!pending||!u.searchParams.get('code')||!same(u.searchParams.get('state')||'',pending.state))return deny(res,'Sign-in expired or was not started here',[clear]),true;
   const r=await doFetch(GOOGLE_TOKEN,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:u.searchParams.get('code'),client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:redirectUri,grant_type:'authorization_code'})});
   if(!r.ok)return deny(res,'Google sign-in failed',[clear]),true;
   // The ID token comes straight from Google's token endpoint over TLS, so its claims are checked without a signature
   // check (OpenID Connect Core 3.1.3.7); every claim that binds it to this client, this login and this account is verified.
   let claims;try{claims=JSON.parse(Buffer.from(String((await r.json()).id_token).split('.')[1],'base64url'));}catch{return deny(res,'Google sign-in failed',[clear]),true;}
   const ok=GOOGLE_ISSUERS.includes(claims.iss)&&claims.aud===config.clientId&&claims.exp*1000>Date.now()&&same(claims.nonce||'',pending.nonce)&&claims.email_verified===true&&String(claims.email).toLowerCase()===config.email;
   if(!ok)return deny(res,'This account cannot use this Dayweave instance',[clear]),true;
   return redirect('/',[clear,cookie(SESSION_COOKIE,s.seal({email:config.email,csrf:crypto.randomBytes(24).toString('hex'),exp:Date.now()+SESSION_MS}),SESSION_MS/1000)]),true;}
  if(req.method==='POST'&&u.pathname==='/auth/logout'){if(req.headers.origin!==config.origin)return deny(res,'Invalid origin'),true;return redirect('/auth/signed-out',[cookie(SESSION_COOKIE,'',0)]),true;}
  // Sign-out lands on a same-origin page: the app's CSP form-action 'self' also covers redirects after a form post, so
  // redirecting the sign-out form straight on to Google would be blocked and leave the old page in place.
  if(req.method==='GET'&&u.pathname==='/auth/signed-out'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"});res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Signed out · Dayweave</title></head><body><p>You are signed out of Dayweave.</p><p><a href="/auth/login">Sign in again</a></p></body></html>');return true;}
  return false;}
 return {handle,session};}
function deny(res,message,setCookies=[]){res.writeHead(403,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Set-Cookie':setCookies});res.end(message);}
const securityHeaders={'Strict-Transport-Security':'max-age=31536000; includeSubDomains','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Cross-Origin-Opener-Policy':'same-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
// The collector authenticates with a bearer secret kept only in the host's secret store; no browser session is involved.
const ingestAuthorized=(req,secret)=>!!secret&&same(req.headers.authorization||'','Bearer '+secret);
module.exports={hostedConfig,createAuth,limiter,signer,securityHeaders,ingestAuthorized,SESSION_COOKIE};
