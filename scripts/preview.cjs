'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{outputDir}=require('./paths.cjs');
const demo=process.argv.includes('--demo'),file=path.join(outputDir,demo?'demo.html':'dashboard.html');
if(!fs.existsSync(file))throw Error('Build the selected dashboard first: npm run '+(demo?'demo':'build'));
const port=Number(process.env.PORT||8766);
http.createServer((req,res)=>{
 if(req.method!=='GET'||!['/','/dashboard.html','/demo.html'].includes(req.url)){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(fs.readFileSync(file));
}).listen(port,'127.0.0.1',()=>console.log(`Local preview: http://127.0.0.1:${port} (${demo?'synthetic demo':'private local data'})`));
