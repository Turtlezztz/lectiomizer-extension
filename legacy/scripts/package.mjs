import {mkdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
await mkdir('artifacts',{recursive:true});
const manifest=JSON.parse(await readFile('dist/manifest.json','utf8'));
const filename=`lectiomizer-${manifest.version}.zip`;
const result=spawnSync(process.execPath,['node_modules/web-ext/bin/web-ext.js','build','--source-dir','dist','--artifacts-dir','artifacts','--filename',filename,'--overwrite-dest'],{stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status;
