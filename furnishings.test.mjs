import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createFurnishings,FT} from './output/furnishings.js';
import {KITCHEN_SINK} from './output/kitchen-fixtures.js';

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
  assert(positions.array.every(Number.isFinite),'Nonfinite asset vertices in '+mesh.parent.name);
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
 assert.equal(textures.size,3);
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
test('duvet really hangs below the mattress top and inset joinery has measurable depth',()=>{
 const bed=assets.items.find(i=>i.kind==='bed'),quilt=bed.group.children.find(m=>m.geometry?.name==='Draped duvet');
 const p=quilt.geometry.attributes.position;
 let middle=-Infinity,edge=Infinity;
 for(let i=0;i<p.count;i++){
  if(Math.abs(p.getX(i))<.1*FT)middle=Math.max(middle,p.getY(i));
  if(Math.abs(p.getX(i))>2.6*FT)edge=Math.min(edge,p.getY(i));
 }
 assert(middle-edge>.35*FT,'Cover must drape, not just be a rounded slab');
 const front=assets.items.find(i=>i.kind==='wardrobe').group.children.find(m=>m.geometry?.name==='Inset joinery panel');
 const ray=new THREE.Raycaster(new THREE.Vector3(0,0,FT),new THREE.Vector3(0,0,-1));
 const plain=new THREE.Mesh(front.geometry,new THREE.MeshBasicMaterial());plain.updateMatrixWorld();
 const center=ray.intersectObject(plain)[0];
 assert(center);
 ray.ray.origin.x=front.geometry.attributes.position.getX(0)*.96;
 const rim=ray.intersectObject(plain)[0];
 assert(rim.point.z-center.point.z>.025*FT,'Cabinet frame must stand proud of its inset panel');
});
test('tailored cushions have no split normals at the UV seam or sphere poles',()=>{
 const checked=new Set();
 assets.root.traverse(m=>{
  if(m.geometry?.name!=='Tailored cushion'||checked.has(m.geometry))return;
  checked.add(m.geometry);
  const p=m.geometry.attributes.position,n=m.geometry.attributes.normal,seen=new Map();
  for(let i=0;i<p.count;i++){
   const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(':');
   const normal=new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i));
   assert(Math.abs(normal.length()-1)<1e-5);
   if(seen.has(key))assert(normal.dot(seen.get(key))>.999);
   else seen.set(key,normal);
  }
 });
 assert(checked.size>=4);
});
test('the cover does not expose mattress patches at the rounded foot and side corners',()=>{
 for(const bed of assets.items.filter(i=>i.kind==='bed')){
   const mattress=bed.group.children.find(m=>m.material===assets.materials.linen&&m.geometry.parameters.height>.5*FT);
   const quilt=bed.group.children.find(m=>m.geometry?.name==='Draped duvet'),bounds=new THREE.Box3().setFromObject(mattress);
   const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0));
   let sampled=0;
   for(const tx of [.01,.04,.08,.5,.92,.96,.99])for(const tz of [.01,.04,.08,.5,.92,.96,.99]){
    ray.ray.origin.set(THREE.MathUtils.lerp(bounds.min.x,bounds.max.x,tx),bounds.max.y+FT,
     THREE.MathUtils.lerp(bounds.min.z,bounds.max.z,tz));
    const cover=ray.intersectObject(quilt)[0],surface=ray.intersectObject(mattress)[0];
    if(cover&&surface){sampled++;assert(cover.point.y>surface.point.y+.002*FT,bed.name+' has a visible mattress intersection')}
   }
   assert(sampled>=20,'Actual mattress/cover overlap must be sampled in '+bed.name);
 }
});
test('sofa feet support its raised base and chair backs have a genuine lower opening',()=>{
 const sofa=assets.items.find(i=>i.kind==='sofa'),base=sofa.group.children.find(m=>m.material===assets.materials.upholstery);
 const bottom=new THREE.Box3().setFromObject(base).min.y;
 for(const foot of sofa.group.children.filter(m=>m.material===assets.materials.darkWood))
  assert(new THREE.Box3().setFromObject(foot).max.y>=bottom-.01*FT);
 const local=assets.items.find(i=>i.kind==='chair').group.children[0];
 const back=local.children.find(m=>m.geometry?.type==='ExtrudeGeometry');
 assert(new THREE.Box3().setFromObject(back).min.y>(model.dimensions.floor_elevation+2)*FT);
});
test('all eight dining chairs face the table and their outward backs clear its solid parts',()=>{
 const table=assets.items.find(i=>i.name==='Dining table'),top=new THREE.Box3().setFromObject(table.group.children[0]);
 for(const chair of assets.items.filter(i=>i.kind==='chair')){
  const local=chair.group.children[0],origin=local.getWorldPosition(new THREE.Vector3());
  const forward=new THREE.Vector3(0,0,1).transformDirection(local.matrixWorld);
  const inward=top.clampPoint(origin,new THREE.Vector3()).sub(origin);inward.y=0;inward.normalize();
  assert(forward.dot(inward)>.99,chair.name+' faces away from the table');
  chair.group.traverse(a=>{if(!a.isMesh)return;table.group.traverse(b=>{
   if(!b.isMesh)return;
   const overlap=new THREE.Box3().setFromObject(a).intersect(new THREE.Box3().setFromObject(b));
   const size=overlap.getSize(new THREE.Vector3());
   assert(!(size.x>.015*FT&&size.y>.015*FT&&size.z>.015*FT),chair.name+' penetrates table part');
  })});
 }
});
test('the kitchen appliance clears every cabinet part and worktop runs do not overlap at the L joint',()=>{
 const group=assets.items.find(i=>i.kind==='kitchen').group,fridge=group.getObjectByName('Kitchen refrigerator');
 assert(fridge);
 const bounds=new THREE.Box3().setFromObject(fridge);
 for(const mesh of group.children.filter(m=>m.isMesh&&m!==fridge)){
  const size=bounds.clone().intersect(new THREE.Box3().setFromObject(mesh)).getSize(new THREE.Vector3());
  assert(!(size.x>.01*FT&&size.y>.01*FT&&size.z>.01*FT),'Fridge intersects '+(mesh.name||mesh.geometry.type));
 }
 const counters=group.children.filter(m=>m.material===assets.materials.stone);
 assert.equal(counters.length,2);
 const overlap=new THREE.Box3().setFromObject(counters[0]).intersect(new THREE.Box3().setFromObject(counters[1])).getSize(new THREE.Vector3());
 assert(overlap.x<.001*FT||overlap.z<.001*FT,'L worktops have coplanar overlapping top surfaces');
 const crossRun=new THREE.Box3().setFromObject(group.children[1]);
 for(const mesh of group.children.filter(m=>m.geometry?.name==='Inset joinery panel'&&Math.abs(m.rotation.y-Math.PI/2)<.01)){
  const size=crossRun.clone().intersect(new THREE.Box3().setFromObject(mesh)).getSize(new THREE.Vector3());
  assert(size.y<.01*FT||size.x<.01*FT||size.z<.01*FT,'Blind-corner front penetrates perpendicular base unit');
 }
});
test('the living mat is a warm matte woven textile, not white architectural flooring',()=>{
 const rug=assets.items.find(i=>i.kind==='rug'),mesh=rug.group.children[0];
 assert.equal(mesh.material,assets.materials.rug);
 assert(mesh.material.roughness>.9&&mesh.material.map&&mesh.material.bumpMap);
 const color=mesh.material.color;
 assert(color.r>color.g&&color.g>color.b,'Jute should have an earthy warm tint');
 assert(color.r<.5,'The rug should not read as a near-white floor patch');
 assert.equal(mesh.material.map.image.width,128);
});
test('the kitchen tap reaches down into a genuinely recessed inset steel bowl, not through an uncut counter',()=>{
 const group=assets.items.find(i=>i.kind==='kitchen').group;
 const sink=group.getObjectByName('Kitchen inset steel sink'),tap=group.getObjectByName('Kitchen tap spout');
 const counter=group.getObjectByName('Kitchen cutout countertop'),carcass=group.getObjectByName('Kitchen sink cabinet carcass');
 const outlet=tap.localToWorld(new THREE.Vector3().fromArray(tap.userData.outlet));
 const direction=new THREE.Vector3().fromArray(tap.userData.outletDirection).transformDirection(tap.matrixWorld);
 assert(direction.y<-.999,'Outlet must discharge downwards');
 const relative=sink.worldToLocal(outlet.clone());
 assert(Math.abs(relative.x)<KITCHEN_SINK.innerWidth/2*FT);
 assert(Math.abs(relative.z)<KITCHEN_SINK.innerDepth/2*FT,'Spout must reach over the bowl');
 const ray=new THREE.Raycaster(outlet,direction),hits=ray.intersectObjects([sink,counter,carcass],false);
 assert.equal(hits[0]?.object,sink,'The first surface under the spout must be the sink bottom, not stone or solid cabinet');
 assert(sink.position.y-hits[0].point.y>.5*FT,'Sink must be deep enough for ordinary washing');
 assert.equal(ray.intersectObject(counter).length,0,'A real cutout must expose the bowl');
 assert(hits[0].face.normal.y>.5,'Bowl interior must face into its cavity');
 const rimRay=new THREE.Raycaster(sink.position.clone().add(new THREE.Vector3(1.09*FT,FT,0)),new THREE.Vector3(0,-1,0));
 assert(rimRay.intersectObject(sink).length,'Raised lip must be visible from above');
});
