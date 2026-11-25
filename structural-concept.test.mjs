import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createStructuralConcept} from './output/structural-concept.js';
import {STRUCTURE_SETTINGS} from './output/structure-settings.js';
import {FT} from './output/furnishings.js';

const source=readFileSync(new URL('./output/review-data.js',import.meta.url),'utf8');
const model=JSON.parse(source.slice('window.HOME_MODEL='.length,-1));
test('solid example column sections are correctly scaled, clear approved openings, and disclose their unfitted exterior projections',()=>{
 const original=JSON.stringify(model),study=createStructuralConcept(model);
 study.root.updateMatrixWorld(true);
 for(const column of study.columns){
  const box=new THREE.Box3().setFromObject(column),center=box.getCenter(new THREE.Vector3());
  const x=center.x/FT,y=-center.z/FT,halfX=(box.max.x-box.min.x)/(2*FT),halfY=(box.max.z-box.min.z)/(2*FT);
  assert(Math.abs((box.max.x-box.min.x)*1000-300)<1e-3);
  assert(Math.abs((box.max.z-box.min.z)*1000-300)<1e-3);
  assert(Math.abs(box.min.y/FT-model.dimensions.floor_elevation)<1e-6);
  for(const opening of model.plan.openings){
   const a=opening.angle_degrees*Math.PI/180,u=[Math.cos(a),Math.sin(a)],n=[-u[1],u[0]];
   const dx=x-opening.x,dy=y-opening.y,extent=halfX*Math.abs(u[0])+halfY*Math.abs(u[1]),normalExtent=halfX*Math.abs(n[0])+halfY*Math.abs(n[1]);
   const overlap=Math.abs(dx*u[0]+dy*u[1])<opening.width/2+extent-1e-6&&
    Math.abs(dx*n[0]+dy*n[1])<opening.wall_thickness/2+normalExtent-1e-6;
   assert(!overlap,`${column.name} obstructs ${opening.name}`);
  }
  assert.equal(column.userData.status,'EXAMPLE_UNVERIFIED');assert(!column.userData.structuralDesign);
 }
 assert(Math.abs(study.root.userData.outerProjectionMM-35.7)<1e-3,'Example columns must not silently enlarge approved walls');
 assert.equal(JSON.stringify(model),original,'Structure mode may not revise the approved architectural export');
});
test('full-height masonry ignores cut-plan data and preserves original openings, slab and roof envelopes',()=>{
 const withoutCutPlan=structuredClone(model);delete withoutCutPlan.plan.wall_faces;delete withoutCutPlan.plan.cut_height;
 const study=createStructuralConcept(withoutCutPlan),record=model.objects.find(o=>o.name==='Ground Floor Slab');
 const p=study.slab.geometry.attributes.position;
 for(let i=0;i<p.count;i++){
  const [x,y,z]=record.vertices[i];
  assert(Math.hypot(p.getX(i)-x*FT,p.getY(i)-z*FT,p.getZ(i)+y*FT)<1e-6);
 }
 for(const wall of study.walls){
  const native=model.objects.find(o=>o.name===wall.userData.source),positions=wall.geometry.attributes.position;
  assert.equal(positions.count,native.triangles.length*3);
  native.triangles.flat().forEach((index,i)=>{
   const [x,y,z]=native.vertices[index];
   assert(Math.hypot(positions.getX(i)-x*FT,positions.getY(i)-z*FT,positions.getZ(i)+y*FT)<1e-6);
  });
  assert.equal(wall.material.clippingPlanes?.length??0,0,'Structure walls must not use a cut plane');
  const box=new THREE.Box3().setFromObject(wall);
  assert(Math.abs(box.min.y-model.dimensions.floor_elevation*FT)<1e-6);
  assert(Math.abs(box.max.y-(model.dimensions.floor_elevation+model.dimensions.wall_height)*FT)<1e-6);
 }
 assert(!study.root.visible&&study.context.visible);
 assert.deepEqual(study.context.userData.nominalWallInches,[9,4.5]);
 assert(study.roof.userData.notStructuralMembers);
 assert(!study.slab.userData.structuralDesign);
 assert(study.root.userData.issues.some(s=>s.includes('foundations')));
});
test('example downstand beams meet column faces without coplanar volume overlap and leave the full hall/dining opening unsupported, not blocked',()=>{
 const study=createStructuralConcept(model);study.root.updateMatrixWorld(true);
 const hall=model.rooms.find(r=>r.name==='Hall'),opening=new THREE.Box3(
  new THREE.Vector3(hall.x*FT,model.dimensions.floor_elevation*FT,-(hall.y+hall.depth+.375)*FT),
  new THREE.Vector3((hall.x+hall.width)*FT,(model.dimensions.floor_elevation+model.dimensions.wall_height)*FT,-(hall.y+hall.depth)*FT));
 for(const beam of study.beams){
  const box=new THREE.Box3().setFromObject(beam),size=box.getSize(new THREE.Vector3());
  assert(Math.abs(size.y-.45)<1e-6);
  assert(Math.abs(Math.min(size.x,size.z)-.23)<1e-6);
  assert(Math.abs(box.max.y-(model.dimensions.floor_elevation+model.dimensions.wall_height)*FT)<1e-6);
  for(const column of study.columns){
   const intersection=box.clone().intersect(new THREE.Box3().setFromObject(column)),s=intersection.getSize(new THREE.Vector3());
   assert(intersection.isEmpty()||Math.min(s.x,s.y,s.z)<1e-6,'Beam ends must stop at column faces');
  }
 }
 for(const member of [...study.columns,...study.beams])assert(!new THREE.Box3().setFromObject(member).intersectsBox(opening),'No guessed support may obstruct the approved full-width passage');
});
test('actual beam/vent intersections are reported at their real locations and recompute when example sections change',()=>{
 const study=createStructuralConcept(model);
 assert.deepEqual(study.openingClashes.map(c=>c.opening),['V_01_Rear_W','V1_01_Rear_W','V1_02_Rear_W','V1_03_Rear_W','V_02_Right_N','V_03_Right_N']);
 for(const clash of study.openingClashes){
  assert(clash.member.startsWith('B-'));
  assert(Math.abs((clash.maxMetres[1]-clash.minMetres[1])*1000-145.2)<1e-3);
  const marker=study.clashMarkers.children.find(o=>o.userData.clash===clash);
  assert(marker&&!marker.material.depthTest,'Diagnostic clash must not disappear behind the very member that obstructs the vent');
 }
 const shallower=createStructuralConcept(model,{...STRUCTURE_SETTINGS,exampleSectionsMM:{status:'EXAMPLE_UNVERIFIED',column:[300,300],beam:[230,250]}});
 assert.equal(shallower.openingClashes.length,0,'Clashes are geometric findings, not hardcoded vent decorations');
 const larger=createStructuralConcept(model,{...STRUCTURE_SETTINGS,exampleSectionsMM:{status:'EXAMPLE_UNVERIFIED',column:[1500,1500],beam:[230,450]}});
 assert(larger.openingClashes.some(c=>c.member.startsWith('C-')&&c.opening.startsWith('W')));
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
 assert.throws(()=>createStructuralConcept(model,{...STRUCTURE_SETTINGS,exampleSectionsMM:{status:'EXAMPLE_UNVERIFIED',column:[0,300],beam:[230,450]}}),/positive/);
 assert.throws(()=>createStructuralConcept(model,{...STRUCTURE_SETTINGS,xWallAxes:['Missing wall']}),/Missing architectural reference/);
 const study=createStructuralConcept(model);let drawObjects=0,triangles=0,vertices=0;
 study.root.traverse(object=>{
  if(!object.geometry)return;
  drawObjects++;const p=object.geometry.attributes.position;vertices+=p.count;
  assert(p.array.every(Number.isFinite),object.name);
  if(object.isMesh)triangles+=(object.geometry.index?.count??p.count)/3;
 });
 assert(drawObjects<=70&&triangles<2500&&vertices<12000,JSON.stringify({drawObjects,triangles,vertices}));
 assert(study.walls.every(w=>w.geometry.attributes.uv.count===w.geometry.attributes.position.count));
});
