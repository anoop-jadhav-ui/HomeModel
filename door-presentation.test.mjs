import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {doorPresentation,DOOR_DISPLAY_GAPS} from './output/door-presentation.js';
import {doorGeometry} from './output/walk-navigation.js';
const source=readFileSync(new URL('./output/review-data.js',import.meta.url),'utf8');
const model=JSON.parse(source.slice('window.HOME_MODEL='.length,-1));
test('all displayed D/D1/D2 leaves fit their unchanged rough openings with explicit fitting gaps',()=>{
 for(const door of model.doorways){
  const fit=doorPresentation(door),clear=door.width-2*door.frame_width;
  assert(Math.abs(clear-fit.width-2*DOOR_DISPLAY_GAPS.side)<1e-6);
  assert.equal(fit.thickness,door.leaf.thickness);
  assert(fit.bottom>0&&fit.bottom+fit.height<door.height-door.frame_width);
 }
 const main=model.doorways.find(d=>d.mark==='D'),fit=doorPresentation(main);
 assert.equal(main.width,4);assert.equal(main.height,7);
 assert(Math.abs(fit.width-3.68)<1e-6);
});
test('walk collision leaf centerlines match rendered hinge transforms in every door orientation and swing state',()=>{
 for(const door of model.doorways)for(const progress of [0,.5,1]){
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
 for(const door of model.doorways){
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
