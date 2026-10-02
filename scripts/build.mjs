import {build} from 'esbuild';
import {cp,mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await cp('public','dist',{recursive:true});
await Promise.all([
 build({entryPoints:['src/bootstrap.js'],outfile:'dist/bootstrap.js',bundle:true,format:'iife',target:'firefox128',minify:true}),
 build({entryPoints:['src/content.jsx'],outfile:'dist/content.js',bundle:true,format:'iife',target:'firefox128',jsx:'automatic',minify:true,legalComments:'eof',define:{'process.env.NODE_ENV':'"production"'}}),
 build({entryPoints:['src/popup.jsx'],outfile:'dist/popup.js',bundle:true,format:'iife',target:'firefox128',jsx:'automatic',minify:true,legalComments:'eof',define:{'process.env.NODE_ENV':'"production"'}}),
 (async()=>writeFile('dist/styles.css',(await readFile('src/styles.css','utf8'))+'\n'+(await readFile('src/pages.css','utf8'))))(),copyFile('src/popup.css','dist/popup.css')
]);
console.log('Built Firefox extension in dist/');
