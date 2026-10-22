'use strict';
const {build}=require('../src/app-server.cjs'),{hostedConfig}=require('../src/hosted.cjs'),{dataDir}=require('./paths.cjs');const hosted=hostedConfig(),ingestSecret=process.env.DAYWEAVE_INGEST_SECRET||'';
const server=build(dataDir,{hosted,ingestSecret});const port=Number(process.env.PORT||8767);
// Hosted mode listens on all interfaces for the platform proxy (which terminates HTTPS); local mode stays on loopback.
server.listen(port,hosted?'0.0.0.0':'127.0.0.1',()=>console.log(hosted?'Dayweave (hosted): '+hosted.origin+' on port '+port:'Dayweave: http://127.0.0.1:'+port));
