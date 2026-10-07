const fs=require('node:fs'),path=require('node:path'),{root,dataDir}=require('./paths.cjs');
fs.mkdirSync(dataDir,{recursive:true});
const target=path.join(dataDir,'data.json');
if(fs.existsSync(target)){console.log('Existing local data preserved.');process.exit(0);}
fs.copyFileSync(path.join(root,'examples/snapshot.json'),target,fs.constants.COPYFILE_EXCL);
console.log('Created local data from synthetic examples. Replace with verified records before use.');
