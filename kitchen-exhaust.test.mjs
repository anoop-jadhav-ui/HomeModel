import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createFurnishings,FT,point} from './output/furnishings.js';
import {kitchenExhaustRoute} from './output/kitchen-fixtures.js';
import {createStructuralConcept} from './output/structural-concept.js';
import {createSite} from './output/site.js';
import {createGroundDirections} from './output/ground-directions.js';

const text=readFileSync('output/review-data.js','utf8'),model=JSON.parse(text.slice(18,-1));
const spec=model.services.kitchen_exhaust,route=kitchenExhaustRoute(spec),assets=createFurnishings(model);
assets.root.updateMatrixWorld(true);
function nativeMesh(record){
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(record.vertices.flatMap(p=>point(...p).toArray()),3));
 geometry.setIndex(record.triangles.flat());
 const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
 mesh.updateMatrixWorld(true);return mesh;
}
test('continuous metal route crosses the actual round native hole and falls outwards, never towards the roof',()=>{
 const center=route.nativeAt(route.wallParameter);
 center.forEach((value,i)=>assert(Math.abs(value-spec.wall_center[i])<1e-8));
 const end=route.nativeAt(1);
 assert(end[0]<0&&end[2]<center[2]);
 const wall=nativeMesh(model.objects.find(o=>o.name===spec.host));
 const hits=(y,z)=>new THREE.Raycaster(point(-1,y,z),new THREE.Vector3(1,0,0)).intersectObject(wall);
 assert.equal(hits(center[1],center[2]).length,0,'Native exported wall still blocks the exhaust centreline');
 assert(hits(center[1]+.4,center[2]).length>0,'Round penetration removed neighboring masonry');
 const duct=assets.root.getObjectByName('Continuous hollow metal exhaust - two long-radius turns to SOUTH wall');
 const bounds=new THREE.Box3().setFromObject(duct);
 assert(bounds.max.y<(model.dimensions.floor_elevation+model.dimensions.wall_height)*FT);
 assert(route.lengths[2]*FT>.6,'The two bends must not be back-to-back');
 assert.equal(assets.root.getObjectByName('Illustrative suspended duct enclosure - no roof penetration'),undefined);
});
test('actual service vertices clear retained glazing, example columns/downstands and the roof envelope',()=>{
 const structure=createStructuralConcept(model);structure.root.updateMatrixWorld(true);
 const obstacles=[...structure.columns,...structure.beams,
  ...model.objects.filter(o=>o.group==='Openings'||o.group==='Roof').map(nativeMesh)];
 let minimum=Infinity,checked=0;
 assets.root.traverse(mesh=>{
  if(!mesh.isMesh||!mesh.userData.kitchenExhaust)return;
  const positions=mesh.geometry.attributes.position;
  for(const obstacle of obstacles){
   const box=new THREE.Box3().setFromObject(obstacle);
   for(let i=0;i<positions.count;i++){
    const vertex=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
    minimum=Math.min(minimum,box.distanceToPoint(vertex));
    assert(!box.containsPoint(vertex),mesh.name+' intersects '+obstacle.name);
   }
   if(box.intersectsBox(new THREE.Box3().setFromObject(mesh))){
    const index=mesh.geometry.index?.array??Array.from({length:positions.count},(_,i)=>i);
    for(let i=0;i<index.length;i+=3){
     const vertices=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(positions,index[i+j]).applyMatrix4(mesh.matrixWorld));
     assert(!box.intersectsTriangle(new THREE.Triangle(...vertices)),mesh.name+' crosses '+obstacle.name);
    }
   }
  }
  checked++;
 });
 assert.equal(checked,5);
 assert(minimum>.01,'Require measurable geometric separation, not coincident surfaces');
});
test('outside cowl is protected but genuinely downward-open, with a separate solid backdraft flap',()=>{
 const cowl=assets.root.getObjectByName('Protected downward-open wall exhaust cowl - no fine mesh');
 const [,y,z]=spec.wall_center,centerZ=z-spec.wall_center[0]*Math.tan(spec.fall_degrees*Math.PI/180);
 const origin=new THREE.Vector3(-.195,(centerZ*FT)-.3,-y*FT);
 const hits=new THREE.Raycaster(origin,new THREE.Vector3(0,1,0)).intersectObject(cowl);
 assert(hits.length&&hits[0].point.y>centerZ*FT+.05,'Cowl underside was closed by a plate or screen');
 const flap=assets.root.getObjectByName('Illustrative backdraft flap - shown partly open, appliance compatibility unverified');
 assert(flap&&flap.children[0].geometry.type==='CylinderGeometry');
});
test('cardinals lie flat above shared grade, outside their correct boundary sides and clear of the entrance',()=>{
 const site=createSite(model),directions=createGroundDirections(model,site.root.userData.site);
 directions.root.updateMatrixWorld(true);
 assert.equal(directions.root.children.length,4);
 for(const mesh of directions.root.children){
  const {letter,nativePosition:[x,y,z]}=mesh.userData.direction;
  assert(Math.abs(z-model.dimensions.ground_elevation-.015)<1e-9);
  const box=new THREE.Box3().setFromObject(mesh),normal=new THREE.Vector3(0,0,1).transformDirection(mesh.matrixWorld);
  assert(normal.y>.999999);
  assert(box.max.y-box.min.y<1e-6,'Letter is standing up rather than lying flat');
  if(letter==='N')assert(box.min.x/FT>site.bounds.maxX&&x>0);
  if(letter==='S')assert(box.max.x/FT<site.bounds.minX&&x<0);
  if(letter==='W')assert(-box.max.z/FT>site.bounds.maxY&&y>0);
  if(letter==='E'){
   assert(-box.min.z/FT<site.bounds.minY&&y<0);
   assert(box.min.x/FT>site.root.userData.site.reservedEntranceCorridor.maxX);
  }
 }
});
test('cutaway omits only upper exhaust/support components and restores the complete assembly in whole-building views',()=>{
 const upper=assets.root.getObjectByName('Upper kitchen exhaust and suspension - omitted in cutaway');
 const canopy=assets.root.getObjectByName('Extractor capture canopy'),fridge=assets.root.getObjectByName('Kitchen refrigerator');
 const geometry=upper.children.map(o=>o.geometry?.uuid),positions=upper.children.map(o=>o.position.toArray());
 for(const view of ['cutaway','interior','cutaway','exterior','structure','plan','exterior']){
  assets.setServiceView(view);
  assert.equal(upper.visible,['interior','exterior'].includes(view),view);
  assert(canopy.visible&&fridge.visible,'A presentation cut must not remove useful lower fixtures');
  assert.deepEqual(upper.children.map(o=>o.geometry?.uuid),geometry,'Presentation must not rebuild authoritative geometry');
  assert.deepEqual(upper.children.map(o=>o.position.toArray()),positions,'Presentation must not move services');
 }
});
