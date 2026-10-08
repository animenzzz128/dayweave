'use strict';
// Local receipts only; a file or website click cannot grant human authorization.
const fs=require('node:fs'),{Store}=require('../src/store.cjs'),A=require('../src/approvals.cjs'),{dataDir}=require('./paths.cjs');const s=new Store(dataDir);try{const [cmd,arg]=process.argv.slice(2);if(cmd==='read')console.log(JSON.stringify(A.read(s,arg),null,2));else if(cmd==='record')A.record(s,JSON.parse(fs.readFileSync(arg,'utf8')));else throw Error('Use read Q-number or record receipt.json');}finally{s.close();}
