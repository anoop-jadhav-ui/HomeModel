import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createFurnishings,FT} from './output/furnishings.js';

const source=readFileSync(new URL('./output/review-data.js',import.meta.url),'utf8');
const model=JSON.parse(source.slice('window.HOME_MODEL='.length,-1));
const original=JSON.stringify(model),assets=createFurnishings(model);
assets.root.updateMatrixWorld(true);

test('authored furniture is closed after welding seams, including curved spouts and hollow ceramics',()=>{
 const checked=new Set();
 assets.root.traverse(mesh=>{
  if(!mesh.isMesh||checked.has(mesh.geometry))return;
  const g=mesh.geometry;checked.add(g);
  const positions=g.attributes.position,vertices=[],ids=new Map(),edges=new Map();
  for(let i=0;i<positions.count;i++){
   const key=[positions.getX(i),positions.getY(i),positions.getZ(i)].map(v=>Math.round(v*1e6)).join(':');
   if(!ids.has(key))ids.set(key,ids.size);
   vertices.push(ids.get(key));
  }
  const index=g.index?.array??Array.from({length:positions.count},(_,i)=>i);
  for(let i=0;i<index.length;i+=3){
   const tri=[vertices[index[i]],vertices[index[i+1]],vertices[index[i+2]]];
   if(new Set(tri).size<3)continue;
   for(let j=0;j<3;j++){
    const a=tri[j],b=tri[(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');
    edges.set(key,(edges.get(key)??0)+1);
   }
  }
  for(const count of edges.values())assert.equal(count,2,'Nonmanifold/open '+g.type+' in '+mesh.parent.name);
 });
 assert(checked.size>20);
});
test('basins and WC bowls have a real recessed interior rather than a solid oval on top',()=>{
 for(const item of assets.items.filter(i=>['basin','toilet'].includes(i.kind))){
  const bowl=item.group.children.find(m=>m.geometry?.type==='LatheGeometry');
  assert(bowl,item.name);
  const b=new THREE.Box3().setFromObject(bowl),c=b.getCenter(new THREE.Vector3());
  const ray=new THREE.Raycaster(new THREE.Vector3(c.x,b.max.y+FT,c.z),new THREE.Vector3(0,-1,0));
  const [hit]=ray.intersectObject(bowl);
  assert(hit,item.name);
  assert(b.max.y-hit.point.y>(item.kind==='basin'?.12:.5)*FT,item.name+' lacks bowl depth');
 }
});
test('soft mattress corners are actually rounded without expanding the approved bed envelope',()=>{
 const bed=assets.items.find(i=>i.kind==='bed'),mattress=bed.group.children.find(m=>
  m.material===assets.materials.linen&&m.geometry.parameters.height>.5*FT);
 const g=mattress.geometry,b=new THREE.Box3().setFromObject(mattress),r=g.parameters.radius;
 assert(r>.1*FT);
 const ray=new THREE.Raycaster(new THREE.Vector3(b.max.x-r*.05,b.max.y+FT,b.max.z-r*.05),
  new THREE.Vector3(0,-1,0));
 assert.equal(ray.intersectObject(mattress).length,0);
});
test('refinement keeps the source immutable, shares geometry and stays within the mobile asset budget',()=>{
 let meshes=0,triangles=0;const geometries=new Set(),textures=new Set();
 assets.root.traverse(m=>{
  if(!m.isMesh)return;
  meshes++;geometries.add(m.geometry);
  triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;
  for(const t of [m.material.map,m.material.bumpMap])if(t)textures.add(t);
 });
 assert.equal(JSON.stringify(model),original);
 assert.equal(assets.items.length,30);
 assert(meshes<=360,`${meshes} meshes`);
 assert(triangles<=60000,`${triangles} triangles`);
 assert(geometries.size<meshes/2,'Repeated legs, drawers and cushions should share buffers');
 assert.equal(textures.size,2);
});
test('draped bedding retains continuous smooth normals across duplicate bevel vertices',()=>{
 const quilt=assets.items.find(i=>i.kind==='bed').group.children.find(m=>m.geometry?.name==='Draped duvet');
 assert(quilt);
 const p=quilt.geometry.attributes.position,n=quilt.geometry.attributes.normal,seen=new Map();
 for(let i=0;i<p.count;i++){
  const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(':');
  const normal=new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i));
  assert(Math.abs(normal.length()-1)<1e-5);
  if(seen.has(key))assert(normal.dot(seen.get(key))>.999,'Visible normal seam in draped fabric');
  else seen.set(key,normal);
 }
});
