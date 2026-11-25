import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createStructuralConcept} from './output/structural-concept.js';
import {STRUCTURE_SETTINGS} from './output/structure-settings.js';
import {FT} from './output/furnishings.js';

const source=readFileSync(new URL('./output/review-data.js',import.meta.url),'utf8');
const model=JSON.parse(source.slice('window.HOME_MODEL='.length,-1));
test('provisional column markers remain inside the architectural footprint and clear every actual opening',()=>{
 const original=JSON.stringify(model),study=createStructuralConcept(model);
 study.root.updateMatrixWorld(true);
 for(const column of study.columns){
  const box=new THREE.Box3().setFromObject(column),center=box.getCenter(new THREE.Vector3());
  const x=center.x/FT,y=-center.z/FT,half=STRUCTURE_SETTINGS.columnMarkerSide/2;
  assert(box.min.x>=0&&box.max.x<=model.dimensions.width*FT);
  assert(-box.max.z>=0&&-box.min.z<=model.dimensions.depth*FT);
  assert(Math.abs(box.min.y/FT-model.dimensions.floor_elevation)<1e-6);
  for(const opening of model.plan.openings){
   const a=opening.angle_degrees*Math.PI/180,u=[Math.cos(a),Math.sin(a)],n=[-u[1],u[0]];
   const dx=x-opening.x,dy=y-opening.y,extent=half*(Math.abs(u[0])+Math.abs(u[1]));
   const overlap=Math.abs(dx*u[0]+dy*u[1])<opening.width/2+extent-1e-6&&
    Math.abs(dx*n[0]+dy*n[1])<opening.wall_thickness/2+extent-1e-6;
   assert(!overlap,`${column.name} obstructs ${opening.name}`);
  }
  assert(column.userData.sectionIsGraphicOnly&&!column.userData.structuralDesign);
 }
 assert.equal(JSON.stringify(model),original,'Structure mode may not revise the approved architectural export');
});
test('slab and optional wall/roof context come from the actual native export, not another floor/roof layout',()=>{
 const study=createStructuralConcept(model),record=model.objects.find(o=>o.name==='Ground Floor Slab');
 const p=study.slab.geometry.attributes.position;
 for(let i=0;i<p.count;i++){
  const [x,y,z]=record.vertices[i];
  assert(Math.hypot(p.getX(i)-x*FT,p.getY(i)-z*FT,p.getZ(i)+y*FT)<1e-6);
 }
 assert(!study.root.visible&&!study.context.visible);
 assert(study.roof.userData.notStructuralMembers);
 assert(!study.slab.userData.structuralDesign);
 assert(study.root.userData.issues.some(s=>s.includes('foundations')));
});
test('unresolved monitor transfers and hall span are dashed questions, not invented continuous roof posts or designed beams',()=>{
 const study=createStructuralConcept(model),g=study.unresolved.geometry,p=g.attributes.position;
 assert(study.unresolved.material.isLineDashedMaterial&&g.attributes.lineDistance);
 assert(study.unresolved.userData.notPostsOrDesignedBeams);
 const monitor=model.objects.filter(o=>o.name.startsWith('Monitor Corner '));
 for(let i=0;i<monitor.length;i++){
  const bottom=Math.min(...monitor[i].vertices.map(v=>v[2]));
  assert(Math.abs(p.getY(i*2+1)/FT-bottom)<1e-5);
  assert(Math.abs(p.getY(i*2)/FT-model.dimensions.floor_elevation-model.dimensions.wall_height)<1e-5);
 }
 const hall=model.rooms.find(r=>r.name==='Hall'),last=p.count-2;
 assert(Math.abs((p.getX(last+1)-p.getX(last))/FT-hall.width)<1e-5);
});
test('all diagram/reference geometry follows a changed shared datum without inventing subgrade structure',()=>{
 const delta=3,changed=structuredClone(model);
 for(const key of ['floor_elevation','ground_elevation','monitor_base','overall_height'])changed.dimensions[key]+=delta;
 for(const object of changed.objects)for(const p of object.vertices)p[2]+=delta;
 const a=createStructuralConcept(model),b=createStructuralConcept(changed);
 const ba=new THREE.Box3().setFromObject(a.root),bb=new THREE.Box3().setFromObject(b.root);
 assert(Math.abs(bb.min.y-ba.min.y-delta*FT)<1e-5);
 assert(Math.abs(bb.max.y-ba.max.y-delta*FT)<1e-5);
 assert.equal(b.root.userData.levels.floor-b.root.userData.levels.grade,model.dimensions.floor_above_grade);
 assert(b.columns.every(c=>c.userData.bottom===changed.dimensions.floor_elevation));
});
test('conceptual mode fails explicitly on missing architectural references and stays a lightweight reference layer',()=>{
 assert.throws(()=>createStructuralConcept(model,{...STRUCTURE_SETTINGS,columnMarkerSide:0}),/positive/);
 assert.throws(()=>createStructuralConcept(model,{...STRUCTURE_SETTINGS,xWallAxes:['Missing wall']}),/Missing architectural reference/);
 const study=createStructuralConcept(model);let drawObjects=0,triangles=0,vertices=0;
 study.root.traverse(object=>{
  if(!object.geometry)return;
  drawObjects++;const p=object.geometry.attributes.position;vertices+=p.count;
  assert(p.array.every(Number.isFinite),object.name);
  if(object.isMesh)triangles+=(object.geometry.index?.count??p.count)/3;
 });
 assert(drawObjects<=24&&triangles<1000&&vertices<12000,JSON.stringify({drawObjects,triangles,vertices}));
});
