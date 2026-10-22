'use strict';
// Single assembly point for the local web app. scripts/serve.cjs and the supervising launcher both build it here,
// so the launcher can reserve the port before the Store opens without duplicating startup steps.
// Only scripts/serve.cjs passes hosted options; the launcher always builds the local 127.0.0.1 app.
const {createServer}=require('./server.cjs'),{attach}=require('./approvals.cjs');
module.exports={build:(dataDir,options={})=>attach(createServer(dataDir,options))};
