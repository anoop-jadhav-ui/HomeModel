import {readFileSync,readdirSync,statSync} from 'node:fs';
import {dirname,join,posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root=dirname(fileURLToPath(import.meta.url));
const config=JSON.parse(readFileSync(join(root,'vercel.json'),'utf8'));
const output=join(root,config.outputDirectory);
function list(directory,prefix=''){
 return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>
  entry.isDirectory()?list(join(directory,entry.name),prefix+entry.name+'/'):[prefix+entry.name]);
}
const files=new Set(list(output));
let references=0;
function requireFile(file,from){
 assert(files.has(file),`${from}: missing or incorrectly cased static asset "${file}"`);
 assert(statSync(join(output,file)).size>0,`${from}: empty static asset "${file}"`);
 references++;
}
function localReference(value,from){
 if(/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value))return;
 const path=decodeURIComponent(value.split(/[?#]/,1)[0]);
 if(!path)return;
 requireFile(posix.normalize(path.startsWith('/')?path.slice(1):posix.join(posix.dirname(from),path)),from);
}
for(const file of ['index.html','scene.js','furnishings.js','review-data.js','plan.html',
 'Home.FCStd','Home.ifc','Preliminary-coordination.html','architectural-plan.svg',
 'opening-schedule.csv','Guide.md','vendor/THREE-LICENSE.txt'])requireFile(file,'deployment');
const index=readFileSync(join(output,'index.html'),'utf8');
const importMap=JSON.parse(index.match(/<script\s+type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
for(const target of Object.values(importMap))localReference(target,'index.html');
for(const file of files){
 if(!/\.(?:html|js)$/.test(file))continue;
 const source=readFileSync(join(output,file),'utf8');
 if(file.endsWith('.html')){
  for(const match of source.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g))localReference(match[1],file);
 }
 for(const match of source.matchAll(/\b(?:from\s*|import\s*\(\s*|import\s*)(["'])([^"']+)\1/g)){
  const specifier=match[2];
  if(specifier.startsWith('.')||specifier.startsWith('/'))localReference(specifier,file);
  else{
   assert(Object.hasOwn(importMap,specifier),`${file}: unmapped module "${specifier}"`);
   localReference(importMap[specifier],'index.html');
  }
 }
}
console.log(`Static deployment ready: ${files.size} files, ${references} asset/module checks. No install or CAD regeneration required.`);
