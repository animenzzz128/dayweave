'use strict';
// Single assembly point for the local web app. scripts/serve.cjs and the supervising launcher both build it here,
// so the launcher can reserve the port before the Store opens without duplicating startup steps.
const {createServer}=require('./server.cjs'),{attach}=require('./approvals.cjs');
module.exports={build:dataDir=>attach(createServer(dataDir))};
