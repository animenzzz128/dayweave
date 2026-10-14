'use strict';
const {build}=require('../src/app-server.cjs'),{dataDir}=require('./paths.cjs');const server=build(dataDir);const port=Number(process.env.PORT||8767);server.listen(port,'127.0.0.1',()=>console.log('Dayweave: http://127.0.0.1:'+port));
