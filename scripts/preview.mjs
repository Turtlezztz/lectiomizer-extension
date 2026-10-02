import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fixture} from '../demo/fixtures.mjs';
const assets={'/content.js':['dist/content.js','text/javascript'],'/styles.css':['dist/styles.css','text/css'],'/popup.html':['dist/popup.html','text/html'],'/popup.js':['dist/popup.js','text/javascript'],'/popup.css':['dist/popup.css','text/css'],'/fonts/source-sans-3.woff2':['dist/fonts/source-sans-3.woff2','font/woff2'],'/demo.js':['demo/demo.js','text/javascript'],'/demo.css':['demo/demo.css','text/css'],'/native.css':['demo/native.css','text/css']};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 try{
  if(url.pathname==='/'||url.pathname.startsWith('/lectio/123/')){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixture(url.pathname==='/'?'/lectio/123/SkemaNy.aspx':url.pathname));return;}
  if(assets[url.pathname]){const[file,type]=assets[url.pathname];res.setHeader('Content-Type',type+'; charset=utf-8');res.end(await readFile(file));return;}
  res.writeHead(404);res.end('Not found');
 }catch{res.writeHead(500);res.end('Run npm run build before starting the preview.');}
});
const port=Number(process.env.PORT)||4173;
server.listen(port,'127.0.0.1',()=>console.log(`Local demo: http://127.0.0.1:${port}/lectio/123/SkemaNy.aspx (invented data only)`));
