'use strict';
// Explicit local todos. Every planning input is user-confirmed: the due date is an instant with an offset or explicitly
// none, and the duration is explicit whole minutes. A todo adopted from email only references the message; nothing is
// extracted from its text, and unsolicited email never becomes required work by itself.
const instant=x=>typeof x==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
function clean(input,{existing=null,email=null,id,now=new Date()}){
 if(!plain(input))throw Error('Invalid todo');
 const title=typeof input.title==='string'?input.title.trim():'';if(!title||title.length>200)throw Error('Enter a title (up to 200 characters).');
 if(!('dueAt' in input))throw Error('Confirm a due date or choose no due date.');
 if(input.dueAt!==null&&!instant(input.dueAt))throw Error('The due date needs a valid date and time.');
 if(!Number.isInteger(input.durationMinutes)||input.durationMinutes<5||input.durationMinutes>600)throw Error('Enter the duration in whole minutes (5–600).');
 if(input.notes!=null&&!(typeof input.notes==='string'&&input.notes.length<=2000))throw Error('Notes must be text up to 2000 characters.');
 let origin=existing?.origin||{type:'manual'};
 if(!existing&&input.origin!=null){
  if(!plain(input.origin)||!['manual','email'].includes(input.origin.type))throw Error('Unknown todo origin.');
  if(input.origin.type==='email'){const m=email?.enabled?(email.messages||[]).find(x=>x.id===input.origin.messageId):null;if(!m)throw Error('That email is not in the current snapshot.');
   origin={type:'email',messageId:m.id,threadId:m.threadId,account:email.account,subject:m.subject,receivedAt:m.receivedAt};}
 }
 const at=new Date(now).toISOString();
 return {id,title,dueAt:input.dueAt,durationMinutes:input.durationMinutes,notes:input.notes||'',status:existing?.status||'open',origin,createdAt:existing?.createdAt||at,updatedAt:at,completedAt:existing?.completedAt??null,version:(existing?.version||0)+1};
}
module.exports={clean};
