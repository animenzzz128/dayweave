const path=require('node:path');
const root=path.resolve(__dirname,'..');
module.exports={root,dataDir:path.resolve(process.env.DAYWEAVE_DATA_DIR||path.join(root,'.local')),outputDir:path.join(root,'dist')};
