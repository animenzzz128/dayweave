'use strict';
// Local operator tool for approved Google Calendar actions. It reads JSON files the authorized assistant produced with its
// own connector and writes only local receipts. It never contacts Google, holds no credentials and grants no approval.
const fs=require('node:fs'),{Store}=require('../src/store.cjs'),A=require('../src/approvals.cjs'),G=require('../src/google.cjs'),{dataDir}=require('./paths.cjs');
const usage=`Usage (exact Q-number and action ID; files are private JSON):
  verify    Q-N approval.json fields.json            check the approved version, print the exact Google requests
  recheck   Q-N ACTION_ID live.json                  check a fresh live re-read (conflicts, duplicates, coverage)
  pending   Q-N ACTION_ID approval.json fields.json live.json   record pending immediately before the single write
  readback  Q-N ACTION_ID event.json                 compare the saved event; record executed or unverified
  reconcile Q-N ACTION_ID search.json                resolve an unknown outcome; never retries
  status    Q-N                                      show the version and its receipts`;
const json=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const s=new Store(dataDir);let code=0;
try{const [cmd,ref,a,b,c,d]=process.argv.slice(2);let out;
 if(cmd==='verify')out=G.verify(s,ref,json(a),json(b));
 else if(cmd==='recheck')out=G.recheck(s,ref,a,json(b));
 else if(cmd==='pending')out=G.pending(s,ref,a,json(b),json(c),json(d));
 else if(cmd==='readback')out=G.readback(s,ref,a,json(b));
 else if(cmd==='reconcile')out=G.reconcile(s,ref,a,json(b));
 else if(cmd==='status'){const q=A.read(s,ref),h=s.snapshot().actionHistory;out={reference:q.reference,status:q.status,errors:q.errors,receipts:q.value.map(p=>h.find(x=>x.id===p.id)||{id:p.id,status:'not attempted'})};}
 else throw Error(usage);
 console.log(JSON.stringify(out,null,2));if(out.go===false||out.status==='unverified')code=1;
}catch(e){console.error(e.message);code=1;}finally{s.close();}
process.exitCode=code;
