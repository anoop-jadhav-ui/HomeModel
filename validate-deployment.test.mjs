import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,existsSync,mkdtempSync,renameSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=dirname(fileURLToPath(import.meta.url));
function fixture(t){
 const directory=mkdtempSync(join(tmpdir(),'home-vercel-'));
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 for(const name of ['vercel.json','package.json','validate-deployment.mjs','output'])
  cpSync(join(root,name),join(directory,name),{recursive:true});
 return directory;
}
function build(directory){
 return spawnSync(process.execPath,['validate-deployment.mjs'],{cwd:directory,encoding:'utf8'});
}
test('fresh static build needs neither node_modules nor FreeCAD',t=>{
 const directory=fixture(t);
 assert(!existsSync(join(directory,'node_modules')));
 assert(!existsSync(join(directory,'tools')));
 const result=build(directory);
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/Static deployment ready/);
});
test('Linux case-sensitive module paths are checked even on Windows',t=>{
 const directory=fixture(t);
 renameSync(join(directory,'output','vendor','three.core.js'),join(directory,'output','vendor','Three.core.js'));
 const result=build(directory);
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/missing or incorrectly cased static asset "vendor\/three.core.js"/);
});
test('a missing downloadable model fails the deployment build',t=>{
 const directory=fixture(t);
 rmSync(join(directory,'output','Home.ifc'));
 const result=build(directory);
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/missing or incorrectly cased static asset "Home.ifc"/);
});
