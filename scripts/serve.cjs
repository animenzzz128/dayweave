'use strict';
const {build}=require('../src/app-server.cjs'),{hostedConfig}=require('../src/hosted.cjs'),{dataDir}=require('./paths.cjs');const hosted=hostedConfig(),ingestSecret=process.env.DAYWEAVE_INGEST_SECRET||'',executeSecret=process.env.DAYWEAVE_EXECUTE_SECRET||'';
const canvasIcsUrl=require('../src/canvas.cjs').canvasUrl(process.env.DAYWEAVE_CANVAS_ICS_URL||''),courseSites=require('../src/coursesite.cjs').sitesFromEnv();
// DAYWEAVE_WEB_DIST names a built web/ front end to serve at / (the Docker image sets it); unset keeps the classic UI.
const canvasToken=String(process.env.DAYWEAVE_CANVAS_TOKEN||'').trim();
const server=build(dataDir,{hosted,ingestSecret,executeSecret,canvasIcsUrl,canvasToken,courseSites,webDist:process.env.DAYWEAVE_WEB_DIST||''});const port=Number(process.env.PORT||8767);
// Hosted mode listens on all interfaces for the platform proxy (which terminates HTTPS); local mode stays on loopback.
server.listen(port,hosted?'0.0.0.0':'127.0.0.1',()=>console.log(hosted?'Dayweave (hosted): '+hosted.origin+' on port '+port:'Dayweave: http://127.0.0.1:'+port));
