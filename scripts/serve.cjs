'use strict';
const {createServer}=require('../src/server.cjs'),{dataDir}=require('./paths.cjs');const server=require('../src/approvals.cjs').attach(createServer(dataDir));const port=Number(process.env.PORT||8767);server.listen(port,'127.0.0.1',()=>console.log('Dayweave: http://127.0.0.1:'+port));
