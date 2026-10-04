import {build} from 'esbuild';
import {cp,mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
// Google Calendar sync needs an OAuth client id: GOOGLE_CLIENT_ID in .env or the environment.
if(existsSync('.env'))process.loadEnvFile('.env');
const clientId=(process.env.GOOGLE_CLIENT_ID||'').trim();
const define={'process.env.NODE_ENV':'"production"','__GOOGLE_CLIENT_ID__':JSON.stringify(clientId)};
await mkdir('dist',{recursive:true});
await cp('public','dist',{recursive:true});
await Promise.all([
 build({entryPoints:['src/bootstrap.js'],outfile:'dist/bootstrap.js',bundle:true,format:'iife',target:'firefox128',minify:true,define}),
 build({entryPoints:['src/content.jsx'],outfile:'dist/content.js',bundle:true,format:'iife',target:'firefox128',jsx:'automatic',minify:true,legalComments:'eof',define}),
 build({entryPoints:['src/popup.jsx'],outfile:'dist/popup.js',bundle:true,format:'iife',target:'firefox128',jsx:'automatic',minify:true,legalComments:'eof',define}),
 build({entryPoints:['src/background.js'],outfile:'dist/background.js',bundle:true,format:'iife',target:'firefox128',minify:true,define}),
 (async()=>writeFile('dist/styles.css',(await Promise.all(['src/styles.css','src/pages.css','src/views.css'].map(f=>readFile(f,'utf8')))).join('\n')))(),copyFile('src/popup.css','dist/popup.css')
]);
console.log('Built Firefox extension in dist/');
if(!clientId)console.log('Google Calendar sync is off: set GOOGLE_CLIENT_ID in .env (see README).');
