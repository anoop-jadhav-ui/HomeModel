import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createFurnishings,furnishingBounds,FT,PRAYER_MANDIR} from './output/furnishings.js';
import {KITCHEN_SINK} from './output/kitchen-fixtures.js';

const source=readFileSync(new URL('./output/review-data.js',import.meta.url),'utf8');
const model=JSON.parse(source.slice('window.HOME_MODEL='.length,-1));
const original=JSON.stringify(model),assets=createFurnishings(model);
assets.root.updateMatrixWorld(true);

test('dining uses measured750mm tabletop and460mm seats without shrinking footprints or floating supports',()=>{
 const floor=model.dimensions.floor_elevation*FT;
 const table=assets.items.find(item=>item.name==='Dining table'),top=new THREE.Box3().setFromObject(table.group.getObjectByName('Dining tabletop'));
 assert(Math.abs((top.max.y-floor)*1000-750)<.01);
 assert(Math.abs((top.max.x-top.min.x)/FT-6)<1e-6);
 assert(Math.abs((top.max.z-top.min.z)/FT-3)<1e-6);
 for(const apron of table.group.children.filter(mesh=>mesh.name==='Dining apron'))
  assert(new THREE.Box3().setFromObject(apron).max.y>=top.min.y,'apron floats below the tabletop');
 for(const item of assets.items.filter(item=>item.kind==='chair')){
  const seat=new THREE.Box3().setFromObject(item.group.getObjectByName('Dining seat cushion'));
  assert(Math.abs((seat.max.y-floor)*1000-460)<.01,item.name);
  const footprint=new THREE.Box3().setFromObject(item.group),size=footprint.getSize(new THREE.Vector3());
  assert(Math.abs(Math.min(size.x,size.z)/FT-1.5)<1e-6);
  assert(footprint.min.y-floor>=0&&footprint.min.y-floor<.002,item.name+' feet left the floor');
  for(const leg of item.group.children[0].children.filter(mesh=>mesh.geometry?.type==='CylinderGeometry')){
   const bounds=new THREE.Box3().setFromObject(leg);
   if(bounds.min.y-floor<.01)assert(bounds.max.y>=seat.min.y-.025,item.name+' leg no longer supports the seat');
  }
 }
});

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
 assert(triangles<=70000,`${triangles} triangles; detailed mandir allowance must remain bounded`);
 assert(geometries.size<meshes/2,'Repeated legs, drawers and cushions should share buffers');
 assert.equal(textures.size,7);
});
test('the mandir fits its existing room/window and keeps a supported610mm altar and1905mm overall height',()=>{
 const room=model.rooms.find(r=>r.name==='Prayer'),group=assets.items.find(item=>item.room==='Prayer').group;
 const bounds=new THREE.Box3().setFromObject(group),floor=model.dimensions.floor_elevation*FT;
 assert(Math.abs(bounds.min.y-floor)<1e-6,'Mandir plinth must sit on the actual finished floor');
 assert(Math.abs((bounds.max.y-floor)/FT-PRAYER_MANDIR.height)<1e-6);
 assert(Math.abs((bounds.max.x-bounds.min.x)/FT-PRAYER_MANDIR.width)<1e-6);
 assert(bounds.min.x>room.x*FT&&bounds.max.x<(room.x+room.width)*FT);
 assert(-bounds.min.z<(room.y+room.depth)*FT&&-bounds.max.z>room.y*FT);
 const parts=group.children.flatMap(mesh=>(mesh.userData.partNames??[mesh.name]).map((name,i)=>({
  name,bounds:mesh.userData.partBounds?furnishingBounds(mesh)[i]:new THREE.Box3().setFromObject(mesh)})));
 const named=name=>parts.filter(part=>part.name===name);
 const altar=named('Mandir stone altar')[0].bounds,body=group.getObjectByName('Prayer cabinet body');
 assert(Math.abs((altar.max.y-floor)*1000-609.6)<.01);
 assert(altar.min.y-new THREE.Box3().setFromObject(body).max.y<.03);
 for(const name of ['Mandir unlit samai lamp','Mandir offering thali'])
  for(const part of named(name))assert(Math.abs(part.bounds.min.y-altar.max.y)<1e-6,name+' floats above the altar');
 const pedestal=named('Mandir central offering pedestal')[0].bounds,kalash=named('Mandir kalash vessel')[0].bounds;
 assert(Math.abs(pedestal.min.y-altar.max.y)<1e-6&&Math.abs(kalash.min.y-pedestal.max.y)<1e-6);
 const separate=[...named('Mandir unlit samai lamp'),...named('Mandir offering thali'),...named('Mandir central offering pedestal')];
 for(let i=0;i<separate.length;i++)for(let j=i+1;j<separate.length;j++)
  assert(!separate[i].bounds.intersectsBox(separate[j].bounds),separate[i].name+' collides with '+separate[j].name);
 for(const item of separate)for(const frame of [...named('Mandir turned timber pillar'),...named('Mandir jaali vertical stile')])
  assert(!item.bounds.intersectsBox(frame.bounds),item.name+' clips the shrine frame');
 const backdrop=named('Mandir pale shrine backdrop')[0].bounds;
 for(const item of [...named('Mandir kalash vessel'),...named('Mandir coconut'),...named('Mandir kalash mango leaf')]){
  assert(!item.bounds.intersectsBox(backdrop),item.name+' clips the backdrop');
  for(const other of [...named('Mandir unlit samai lamp'),...named('Mandir offering thali')])
   assert(!item.bounds.intersectsBox(other.bounds),item.name+' collides with '+other.name);
 }
 for(const relief of [...named('Mandir floral brass relief'),...named('Mandir floral centre')])
  assert(Math.abs(relief.bounds.min.z-backdrop.max.z)<1e-6,'Floral applique must mount on the backdrop, not float');
 for(const name of ['Mandir hanging bell','Mandir bell clapper','Mandir bell suspension'])assert.equal(named(name).length,3,name);
 assert.equal(named('Mandir open diamond jaali').length,6);
 for(const diamond of named('Mandir open diamond jaali'))
  assert(named('Mandir jaali vertical stile').some(stile=>stile.bounds.intersectsBox(diamond.bounds)),'Jaali needs real side joinery support');
 for(const part of named('Mandir open diamond jaali')){
  const centre=part.bounds.getCenter(new THREE.Vector3());
  const ray=new THREE.Raycaster(new THREE.Vector3(part.bounds.max.x+.005*FT,centre.y,centre.z),new THREE.Vector3(-1,0,0),0,.08*FT);
  assert.equal(ray.intersectObjects(group.children,false).length,0,'Jaali diamond must have a real opening, not a painted grid');
 }
 assert.equal(group.userData.mandir.deitySelected,false);
 assert.equal(group.userData.mandir.unlit,true);
 const approach=room.y+room.depth-PRAYER_MANDIR.rearGap-PRAYER_MANDIR.depth-room.y;
 assert(approach>6,'Do not consume the existing clear floor approach');
 const window=model.plan.openings.find(item=>item.name==='W1_01_Left_S');
 assert(-bounds.max.z/FT>window.y+window.width/2,'Mandir must not spread across the adjacent glazing');
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
  for(const part of furnishingBounds(mesh)){
   const size=bounds.clone().intersect(part).getSize(new THREE.Vector3());
   assert(!(size.x>.01*FT&&size.y>.01*FT&&size.z>.01*FT),'Fridge intersects '+(mesh.name||mesh.geometry.type));
  }
 }
 const counters=group.children.filter(m=>m.material===assets.materials.granite);
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
test('pull feet actually contact recessed joinery faces, including formerly missing fronts',()=>{
 let mounts=0;
 for(const item of assets.items){
  const fronts=item.group.children.filter(mesh=>mesh.geometry?.name==='Inset joinery panel');
  for(const hardware of item.group.children.filter(mesh=>mesh.userData.hardware)){
   for(const mount of hardware.userData.mounts??[]){
    const position=new THREE.Vector3().fromArray(mount.position),q=new THREE.Quaternion().fromArray(mount.quaternion);
    const normal=new THREE.Vector3(0,0,1).applyQuaternion(q);
    const ray=new THREE.Raycaster(position.clone().addScaledVector(normal,.005),normal.clone().negate(),0,.012);
    const hit=ray.intersectObjects(fronts,false)[0];
    assert(hit,item.name+' has a floating or backwards pull');
    assert(Math.abs(hit.distance-.005)<.00015,item.name+' pull is not mounted to its actual inset surface');
    mounts++;
   }
  }
 }
 assert.equal(mounts,44);
 for(const name of ['Media console and screen','Prayer alcove cabinet']){
  const group=assets.items.find(item=>item.name===name).group;
  assert(group.getObjectByName('Mounted cabinet pulls'),name+' needs usable front hardware');
 }
});
test('suspended extractor covers the existing hob without touching window, cabinets or refrigerator',()=>{
 const group=assets.items.find(i=>i.kind==='kitchen').group,hood=group.getObjectByName('Kitchen suspended extractor - provisional south-wall exhaust');
 const hob=group.getObjectByName('Kitchen hob'),hb=new THREE.Box3().setFromObject(hood),cb=new THREE.Box3().setFromObject(hob);
 const canopy=new THREE.Box3().setFromObject(hood.getObjectByName('Extractor capture canopy'));
 assert(hood.userData.conceptOnly&&hood.userData.mount==='ceiling-suspended');
 assert(hb.min.x<cb.min.x&&hb.max.x>cb.max.x&&hb.min.z<cb.min.z&&hb.max.z>cb.max.z);
 const kitchen=model.rooms.find(r=>r.name==='Kitchen');
 const burnerTop=(model.dimensions.floor_elevation+3.025)*FT;
 assert(Math.abs((hb.min.y-burnerTop)*1000-750)<.5,'750mm is a measured illustrative gap, not an installation certification');
 assert((canopy.min.x-kitchen.x*FT)*1000>45,'Retained glazing/frame plane must have a physical gap');
 for(const mesh of group.children.filter(m=>m.isMesh&&!m.userData.hardware&&m!==hob)){
  const size=hb.clone().intersect(new THREE.Box3().setFromObject(mesh)).getSize(new THREE.Vector3());
  assert(!(size.x>.002&&size.y>.002&&size.z>.002),'Extractor intersects '+mesh.name);
 }
});
test('wood, fabric and stone maps use metric UVs and restrained distinct physical texture periods',()=>{
 for(const name of ['wood','linen','granite']){
  const mat=assets.materials[name];
  assert(mat.map&&mat.bumpMap&&mat.roughnessMap);
  assert(mat.bumpScale<.0004);
  assert(mat.map.userData.periodMetres.every(value=>value>0));
 }
 const table=assets.items.find(i=>i.name==='Dining table').group.children[0];
 assert(table.geometry.userData.metricUV);
 const p=table.geometry.attributes.position,uv=table.geometry.attributes.uv,n=table.geometry.attributes.normal;
 for(let i=0;i<p.count;i++)if(n.getY(i)>.99){
  assert(Math.abs(uv.getY(i)-p.getX(i))<1e-6);
 }
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
