import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createWallSections,nativeFrameProfile,createBoxSection} from './output/wall-sections.js';
import {FT} from './output/furnishings.js';

const source=readFileSync('output/review-data.js','utf8');
const model=JSON.parse(source.slice('window.HOME_MODEL='.length,-1));
test('cutaway caps fill the native wall section without bridging doors or windows',()=>{
 const mesh=createWallSections(model);mesh.visible=true;mesh.updateMatrixWorld(true);
 const z=(model.dimensions.floor_elevation+model.plan.cut_height)*FT;
 const vertices=mesh.geometry.attributes.position;
 for(let i=0;i<vertices.count;i++)assert(Math.abs(vertices.getY(i)-z)<1e-6);
 const ray=(x,y)=>new THREE.Raycaster(new THREE.Vector3(x*FT,z+FT,-y*FT),new THREE.Vector3(0,-1,0)).intersectObject(mesh).length>0;
 assert(ray(1.5,.375),'front wall has no cap');
 assert(ray(12.9375,5),'partition has no cap');
 for(const opening of model.plan.openings){
  if(opening.kind==='vent')assert(ray(opening.x,opening.y),opening.name);
  else assert.equal(ray(opening.x,opening.y),false,opening.name+' was bridged');
 }
 for(const [name,axis] of [['Front E',1],['Kitchen Hall',0]]){
  const native=model.objects.find(object=>object.name===name).vertices.map(p=>p[axis]);
  const section=model.plan.wall_faces.filter(face=>face.wall===name).flatMap(face=>face.loops.flat()).map(p=>p[axis]);
  assert(Math.abs((Math.max(...native)-Math.min(...native))-(Math.max(...section)-Math.min(...section)))<1e-7,name+' was thickened');
 }
});
test('frame depth comes from actual native geometry and leaves the full wall reveal visible',()=>{
 for(const opening of model.plan.openings){
  const {depth,normalOffset}=nativeFrameProfile(model,opening);
  assert(depth>0&&depth<opening.wall_thickness,opening.name);
  const outside=opening.wall_thickness>.5;
  if(outside)assert(opening.wall_thickness-depth>.4,'exterior plaster reveal is hidden');
  if(outside)assert(Math.abs(normalOffset)+depth/2<=opening.wall_thickness/2+1e-6,'exterior frame protrudes beyond its host');
 }
});
test('all four architectural exterior corners retain a filled native wall section',()=>{
 const mesh=createWallSections(model);mesh.visible=true;mesh.updateMatrixWorld(true);
 const z=(model.dimensions.floor_elevation+model.plan.cut_height)*FT;
 for(const x of [.1,model.dimensions.width-.1])for(const y of [.1,model.dimensions.depth-.1]){
  const ray=new THREE.Raycaster(new THREE.Vector3(x*FT,z+FT,-y*FT),new THREE.Vector3(0,-1,0));
  assert(ray.intersectObject(mesh).length>0,`Architectural corner ${x},${y} has a gap`);
 }
});
test('animated solid leaves keep native thickness and their cut faces follow the hinge',()=>{
 for(const door of model.doorways){
  const {leaf}=door;
  assert(Math.abs(leaf.thickness-.15)<1e-6);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(leaf.width*FT,leaf.height*FT,leaf.thickness*FT));
  mesh.position.set(leaf.width*FT/2,leaf.height*FT/2,0);
  const cap=createBoxSection(mesh,4*FT,new THREE.MeshBasicMaterial());
  assert(cap);
  const pivot=new THREE.Group();pivot.add(mesh,cap);pivot.rotation.y=Math.PI/2;pivot.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(cap);
  assert(Math.abs((box.max.x-box.min.x)/FT-leaf.thickness)<1e-6,door.name+' lost edge thickness while open');
  assert.equal(createBoxSection(mesh,8*FT,cap.material),null);
 }
});
