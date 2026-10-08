'use strict';
// Local journal only. This command never contacts Outlook or grants approval.
const fs=require('node:fs'),path=require('node:path');
const {dataDir}=require('./paths.cjs'),P=require('../src/phase2.cjs');
const file=path.join(dataDir,'data.json'),lock=file+'.lock';
if(!process.argv[2])throw Error('Usage: node scripts/record-action.cjs /private/action-receipt.json');
const receipt=JSON.parse(fs.readFileSync(path.resolve(process.argv[2]),'utf8'));
const fd=fs.openSync(lock,'wx');
try{
 const d=JSON.parse(fs.readFileSync(file,'utf8'));
 const proposal=d.proposals.find(p=>p.id===receipt.id);
 if(receipt.status==='pending'&&(!proposal||P.fingerprint(proposal)!==receipt.fingerprint))throw Error('Receipt must match the exact saved proposal. Save approved edits to private data first.');
 d.actionHistory=P.record(d.actionHistory||[],receipt);
 fs.writeFileSync(file+'.tmp',JSON.stringify(d,null,2));fs.renameSync(file+'.tmp',file);
 console.log('Local action journal updated. Render the dashboard to show it.');
}finally{fs.closeSync(fd);fs.unlinkSync(lock);}
