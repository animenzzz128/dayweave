'use strict';
const fs=require('node:fs'),path=require('node:path'),{dataDir}=require('./paths.cjs'),P=require('../src/phase3.cjs');
if(!process.argv[2])throw Error('Usage: node scripts/import-progress.cjs progress.json');
const target=path.join(dataDir,'data.json'),old=JSON.parse(fs.readFileSync(target,'utf8'));
const next=P.importProgress(old,JSON.parse(fs.readFileSync(path.resolve(process.argv[2]),'utf8')));
fs.writeFileSync(target+'.tmp',JSON.stringify(next,null,2));fs.renameSync(target+'.tmp',target);
console.log('Imported recognized career progress only. No approvals or remote actions imported. Rebuild dashboard.');
