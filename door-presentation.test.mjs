import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {doorLeaves,doorPresentation,DOOR_DISPLAY_GAPS} from './output/door-presentation.js';
import {createDoorHardware} from './output/door-hardware.js';
import {doorGeometry} from './output/walk-navigation.js';
const source=readFileSync(new URL('./output/review-data.js',import.meta.url),'utf8');
const model=JSON.parse(source.slice('window.HOME_MODEL='.length,-1));
test('all displayed D/D1/D2 leaves fit their unchanged rough openings with explicit fitting gaps',()=>{
 for(const door of model.doorways.flatMap(doorLeaves)){
  const fit=doorPresentation(door),clear=door.width-2*door.frame_width;
  if(!door.nativeFitted)assert(Math.abs(clear-fit.width-2*DOOR_DISPLAY_GAPS.side)<1e-6);
  else assert(Math.abs(clear-2*fit.width-2*door.fitting_gaps.side_gap-door.fitting_gaps.meeting_gap)<1e-6);
  assert.equal(fit.thickness,door.leaf.thickness);
  assert(fit.bottom>0&&fit.bottom+fit.height<door.height-door.frame_width);
 }
 const main=model.doorways.find(d=>d.mark==='D'),fits=doorLeaves(main).map(doorPresentation);
 assert.equal(main.width,4);assert.equal(main.height,7);
 assert.equal(fits.length,2);
 assert(fits.every(fit=>Math.abs(fit.width-1.83)<1e-6));
});
test('walk collision leaf centerlines match rendered hinge transforms in every door orientation and swing state',()=>{
 for(const door of model.doorways.flatMap(doorLeaves))for(const progress of [0,.5,1]){
  const fit=doorPresentation(door),pivot=new THREE.Group(),frame=new THREE.Group();
  frame.position.set(door.x,0,-door.y);frame.rotation.y=door.angle_degrees*Math.PI/180;frame.add(pivot);
  pivot.position.set(fit.pivotX,0,fit.pivotZ);pivot.rotation.y=fit.angle*progress;frame.updateMatrixWorld(true);
  const segment=doorGeometry(door,progress);
  for(const [x,expected]of [[0,segment.hinge],[-fit.sign*fit.width,segment.tip]]){
   const actual=pivot.localToWorld(new THREE.Vector3(x,0,fit.centerZ));
   assert(Math.hypot(actual.x-expected[0],-actual.z-expected[1])<1e-8,door.name);
  }
 }
});
test('the hinge is on the swing-side leaf corner so thickness does not cut into the jamb during rotation',()=>{
 for(const door of model.doorways.flatMap(doorLeaves)){
  const fit=doorPresentation(door),jamb=door.width/2-door.frame_width;
  for(let step=0;step<=90;step++){
   const rotation=new THREE.Matrix4().makeRotationY(fit.angle*step/90);
   for(const along of [0,-fit.sign*fit.width])for(const z of [-fit.thickness/2,fit.thickness/2]){
    const vertex=new THREE.Vector3(along,0,fit.centerZ+z).applyMatrix4(rotation);
    vertex.x+=fit.pivotX;
    assert(vertex.x>=-jamb-1e-6&&vertex.x<=jamb+1e-6,door.name+' penetrates jamb at '+step);
   }
  }
 }
});
test('paired leaves match both native plan arcs, never cross, and halve the intrusion into the hall',()=>{
 const main=model.doorways[0],parts=doorLeaves(main);
 const widths=parts.map(door=>doorPresentation(door).width);
 for(let i=0;i<2;i++){
  const shape=doorGeometry(parts[i],0),plan=main.plan_leaves[i];
  assert(Math.hypot(shape.pivot[0]-plan.pivot[0],shape.pivot[1]-plan.pivot[1])<1e-7);
  assert(Math.abs(shape.length-plan.length)<1e-7);
 }
 const leaves=parts.map(door=>{
  const fit=doorPresentation(door),frame=new THREE.Group(),pivot=new THREE.Group();
  frame.position.set(main.x,0,-main.y);frame.add(pivot);
  pivot.position.set(fit.pivotX,0,fit.pivotZ);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(fit.width,fit.height,fit.thickness));
  mesh.position.set(-fit.sign*fit.width/2,fit.bottom+fit.height/2,fit.centerZ);pivot.add(mesh);
  return {frame,pivot,fit,mesh};
 });
 for(let step=0;step<=90;step++){
  for(const part of leaves){part.pivot.rotation.y=part.fit.angle*step/90;part.frame.updateMatrixWorld(true)}
  const [a,b]=leaves.map(p=>new THREE.Box3().setFromObject(p.mesh));
  assert(a.max.x<b.min.x,'Paired leaves collide during opening');
 }
 assert(Math.max(...parts.map(p=>doorGeometry(p,1).tip[1]))<2.36);
 assert(Math.PI*widths.reduce((sum,w)=>sum+w*w,0)/4<5.27,'Paired swept sectors should be about half the old10.64sqft');
 const ray=new THREE.Raycaster(),from=new THREE.Vector3(21.125,5,-1.3);
 for(const y of [5.5,7.45,9.4]){
  const to=new THREE.Vector3(15.15,3.5,-y);
  ray.set(from,to.clone().sub(from).normalize());ray.far=from.distanceTo(to);
  assert.equal(ray.intersectObjects(leaves.map(p=>p.mesh),false).length,0,'Open entry should clear sofa-occupant sightline');
 }
});
test('levers, escutcheons and hinges remain rigidly mounted to each animated leaf',()=>{
 for(const member of model.doorways.flatMap(doorLeaves)){
  const fit=doorPresentation(member),hardware=createDoorHardware(fit,new THREE.MeshStandardMaterial(),new THREE.MeshStandardMaterial());
  const pivot=new THREE.Group();pivot.add(hardware);
  assert.equal(hardware.userData.leafMounted,true);
  for(const progress of [0,.5,1]){
   pivot.rotation.y=fit.angle*progress;pivot.updateMatrixWorld(true);
   for(const side of [-1,1]){
    const face=fit.centerZ+side*fit.thickness/2;
    const start=new THREE.Vector3(-fit.sign*(fit.width-.25),3.35,face+side*.3).multiplyScalar(.3048);
    const direction=new THREE.Vector3(0,0,-side).transformDirection(pivot.matrixWorld);
    const ray=new THREE.Raycaster(pivot.localToWorld(start),direction);
    const hit=ray.intersectObject(hardware,true)[0];assert(hit,'Both animated faces need real projecting lever geometry');
    const point=pivot.worldToLocal(hit.point);
    assert(Math.abs(point.y/.3048-3.35)<1e-6,'Handle height must remain about1021mm above FFL');
    assert(Math.abs((point.z/.3048-face)*side-.1375)<.004,'Lever must stand about42mm proud including its thickness');
   }
  }
 }
});
