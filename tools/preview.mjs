import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import worker from '../server/worker.mjs';
const root=resolve(import.meta.dirname,'../dist/client');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.jpeg':'image/jpeg','.jpg':'image/jpeg','.png':'image/png','.pdf':'application/pdf','.txt':'text/plain'};
const env={CHECKOUT_ENABLED:'false',BILLPLZ_MODE:'sandbox',ASSETS:{async fetch(request){let path=decodeURIComponent(new URL(request.url).pathname);if(path==='/')path='/index.html';if(!extname(path))path+='.html';const file=resolve(root,'.'+path);if(!file.startsWith(root+'/')&&!file.startsWith(root+'\\'))return new Response('Forbidden',{status:403});try{return new Response(await readFile(file),{headers:{'content-type':types[extname(file)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}}}};
const server=http.createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);const response=await worker.fetch(new Request('http://127.0.0.1:4173'+req.url,{method:req.method,headers:req.headers,...(body.length?{body}:{} )}),env,{waitUntil:promise=>promise.catch(()=>{})});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end('Preview error');}});
server.listen(4173,'127.0.0.1',()=>console.log('Closette preview: http://127.0.0.1:4173 — payments disabled'));
