(function(){
'use strict';
// Read-only Gmail snapshot contract. Dayweave never reads, sends, deletes or labels mail itself: an authorized assistant
// supplies a bounded snapshot (recent inbox window, at most MAX_LIMIT messages, metadata and snippets, no attachment content).
// The page shows that last collected snapshot; nothing here infers completeness, emptiness, todos or dates.
const PROVIDERS=['google'],STATUSES=['complete','partial','failed'],DOWN=['failed','unavailable'];
const MAX_DAYS=7,MAX_LIMIT=50,STALE_MS=26*3600000,LINK_HOSTS=['mail.google.com'],ACTIONS=['send','delete','labels','modify'];
const instant=x=>typeof x==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
const stableId=x=>typeof x==='string'&&x.length>0&&x.length<=200&&!['__proto__','constructor','prototype'].includes(x)&&!/[\u0000-\u001f]/.test(x);
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
// Display text is bounded; over-long source text is shortened visibly, never interpreted.
function text(x,max,name){if(x==null)return '';if(typeof x!=='string')throw Error('Email '+name+' must be text');return x.length>max?x.slice(0,max-1)+'…':x;}
function flag(x,name){if(x==null)return null;if(typeof x!=='boolean')throw Error('Email '+name+' must be true, false or absent');return x;}
// Outbound links are limited to https Gmail web URLs without credentials.
function link(x){if(x==null||x==='')return null;let u;try{u=new URL(x);}catch{throw Error('Unsafe email link');}if(u.protocol!=='https:'||!LINK_HOSTS.includes(u.hostname)||u.username||u.password)throw Error('Email links must be https://mail.google.com URLs');return u.href;}
// Projects a message to the allowed fields. Bodies and attachment content are never kept, whatever the input carries.
function message(m){
 if(!plain(m))throw Error('Invalid email message');
 if(!stableId(m.id)||!stableId(m.threadId))throw Error('Email messages need stable message and thread IDs');
 if(!instant(m.receivedAt))throw Error('Email receivedAt needs an explicit offset');
 if(m.labels!=null&&!(Array.isArray(m.labels)&&m.labels.length<=20&&m.labels.every(l=>typeof l==='string'&&l.length<=100)))throw Error('Invalid email labels');
 if(m.attachmentCount!=null&&!(Number.isInteger(m.attachmentCount)&&m.attachmentCount>=0&&m.attachmentCount<=1000))throw Error('Invalid attachment count');
 return {id:m.id,threadId:m.threadId,receivedAt:m.receivedAt,from:text(m.from,300,'sender'),subject:text(m.subject,500,'subject'),snippet:text(m.snippet,1000,'snippet'),labels:[...new Set(m.labels||[])],unread:flag(m.unread,'unread flag'),hasAttachments:flag(m.hasAttachments,'attachment flag'),attachmentCount:m.attachmentCount??null,link:link(m.link),...(m.retained===true?{retained:true}:{})};
}
const newest=(a,b)=>Date.parse(b.receivedAt)-Date.parse(a.receivedAt)||(a.id<b.id?-1:a.id>b.id?1:0);
const fresh=m=>{const {retained,...x}=m;return x;};
// Validates and normalizes an email record. Missing stays null (unknown); a disabled record stays disabled.
function normalize(e){
 if(e==null)return null;if(!plain(e))throw Error('Invalid email record');
 if(e.enabled!==true)return {enabled:false,...(e.note?{note:text(e.note,500,'note')}:{})};
 if(!PROVIDERS.includes(e.provider))throw Error('Email provider must be google');
 if(typeof e.account!=='string'||!e.account.trim()||e.account.length>320)throw Error('Email account is required');
 if(!stableId(e.sourceId))throw Error('Email sourceId is required');
 const cap=plain(e.capabilities)?e.capabilities:{};if(cap.read===false)throw Error('Enabled email needs read access');
 for(const k of ACTIONS)if(cap[k]!==undefined&&cap[k]!==false)throw Error('Mail is read-only: '+k+' must stay disabled');
 if(!instant(e.checkedAt))throw Error('Email checkedAt needs an explicit offset');
 if(e.lastSuccess!=null&&!instant(e.lastSuccess))throw Error('Invalid email lastSuccess');
 const r=plain(e.request)?e.request:{};
 if(!Number.isInteger(r.windowDays)||r.windowDays<1||r.windowDays>MAX_DAYS)throw Error('Email window must be 1–'+MAX_DAYS+' days');
 if(!Number.isInteger(r.limit)||r.limit<1||r.limit>MAX_LIMIT)throw Error('Email limit must be 1–'+MAX_LIMIT+' messages');
 if(typeof r.query!=='string'||!r.query.trim()||r.query.length>200)throw Error('Record the exact email query');
 if(!instant(r.from)||!instant(r.to)||Date.parse(r.to)<=Date.parse(r.from)||Date.parse(r.to)-Date.parse(r.from)>r.windowDays*86400000+3600000)throw Error('Email window needs from/to within the requested days');
 const c=plain(e.coverage)?e.coverage:{};
 if(!STATUSES.includes(c.status))throw Error('Email coverage status must be complete, partial or failed');
 if(c.morePages!=null&&typeof c.morePages!=='boolean')throw Error('Email morePages must be true, false or unknown');
 if(c.errors!=null&&!(Array.isArray(c.errors)&&c.errors.length<=20&&c.errors.every(x=>typeof x==='string')))throw Error('Invalid email errors');
 if(!Array.isArray(e.messages))throw Error('Email messages must be a list');
 const seen=new Map();for(const m of e.messages.map(message))if(!seen.has(m.id))seen.set(m.id,m);
 const messages=[...seen.values()].sort(newest),current=messages.filter(m=>!m.retained),from=Date.parse(r.from)-3600000,to=Date.parse(r.to)+300000;
 if(current.length>r.limit)throw Error('More messages than the requested limit');
 if(current.some(m=>Date.parse(m.receivedAt)<from||Date.parse(m.receivedAt)>to))throw Error('Email message is outside the requested window');
 if(c.status==='failed'&&current.length)throw Error('A failed email collection cannot carry new messages; record it as partial');
 const morePages=c.morePages??null,errors=(c.errors||[]).map(x=>text(x,500,'error'));
 // Completeness needs an explicit last page and no errors; one page at the limit is never assumed complete.
 const complete=c.status==='complete'&&morePages===false&&!errors.length,truncated=c.status!=='failed'&&(morePages===true||current.length>=r.limit&&morePages!==false);
 return {enabled:true,provider:e.provider,account:e.account,sourceId:e.sourceId,capabilities:{read:true,send:false,delete:false,labels:false,modify:false},checkedAt:e.checkedAt,lastSuccess:e.lastSuccess??null,
  request:{query:r.query,windowDays:r.windowDays,limit:r.limit,from:r.from,to:r.to},
  coverage:{status:c.status==='complete'&&!complete?'partial':c.status,complete,truncated,morePages,returned:current.length,errors,note:text(c.note,500,'coverage note')},
  retained:messages.some(m=>m.retained),retainedFrom:instant(e.retainedFrom)?e.retainedFrom:null,messages};
}
// Merges a newly collected record into the previous one. A failed read keeps prior messages (labelled retained) and the
// last complete read time; a partial read keeps prior in-window messages it did not return. Account/provider changes keep nothing.
function merge(old,incoming,sources){
 const next=normalize(incoming);let prior=null;try{prior=normalize(old);}catch{prior=null;}
 if(!next)return prior;if(!next.enabled)return next;
 const src=(sources||[]).find(s=>s&&s.id===next.sourceId),failed=next.coverage.status==='failed'||DOWN.includes(src?.status);
 const same=!!prior?.enabled&&prior.provider===next.provider&&prior.account===next.account,kept=same?prior.messages:[],since=kept.length?(prior.retainedFrom||prior.checkedAt):null;
 if(failed){const errors=next.coverage.errors.length?next.coverage.errors:[text(src?.note||'Collection failed',500,'error')];
  return {...next,coverage:{...next.coverage,status:'failed',complete:false,truncated:false,returned:0,errors},lastSuccess:same?prior.lastSuccess:null,retained:kept.length>0,retainedFrom:since,messages:kept.map(m=>({...m,retained:true}))};}
 if(next.coverage.complete)return {...next,lastSuccess:next.checkedAt,retained:false,retainedFrom:null,messages:next.messages.map(fresh)};
 const ids=new Set(next.messages.map(m=>m.id)),from=Date.parse(next.request.from),extra=kept.filter(m=>!ids.has(m.id)&&Date.parse(m.receivedAt)>=from).map(m=>({...m,retained:true}));
 return {...next,lastSuccess:same?prior.lastSuccess:null,retained:extra.length>0,retainedFrom:extra.length?since:null,messages:[...next.messages.map(fresh),...extra].sort(newest)};
}
// Display state. `unknown` (no record) and `disabled` are never shown as an empty inbox.
function health(e,now=new Date()){
 if(e==null)return {state:'unknown'};if(!e.enabled)return {state:'disabled'};
 const t=new Date(now).getTime(),messages=e.messages||[];
 return {state:e.coverage.status,complete:e.coverage.complete,truncated:e.coverage.truncated,stale:!Number.isFinite(Date.parse(e.checkedAt))||t-Date.parse(e.checkedAt)>STALE_MS,
  retained:messages.filter(m=>m.retained).length,returned:e.coverage.returned,shown:messages.length,unread:messages.filter(m=>m.unread===true).length,threads:new Set(messages.map(m=>m.threadId)).size};
}
const api={MAX_DAYS,MAX_LIMIT,STALE_MS,LINK_HOSTS,normalize,merge,health,link};
if(typeof module!=='undefined')module.exports=api;else window.PlannerEmail=api;
})();
