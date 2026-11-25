import * as THREE from 'three';
import {FT,point} from './furnishings.js';
import {STRUCTURE_SETTINGS} from './structure-settings.js';

const STATUS='CONCEPT_ONLY_NOT_ENGINEERED',EXAMPLE='EXAMPLE_UNVERIFIED';
function surfaceUV(geometry){
 if(geometry.index){const expanded=geometry.toNonIndexed();geometry.dispose();geometry=expanded}
 geometry.computeVertexNormals();
 const p=geometry.attributes.position,n=geometry.attributes.normal,uv=[];
 for(let i=0;i<p.count;i++){
  if(Math.abs(n.getY(i))>.5)uv.push(p.getX(i),p.getZ(i));
  else uv.push(Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i),p.getY(i));
 }
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));return geometry;
}
function studyMaterials(colors){
 const rgb=hex=>{const c=new THREE.Color(hex).convertLinearToSRGB();return [c.r,c.g,c.b].map(n=>n*255)};
 const clay=rgb(colors.masonry),mortar=rgb(colors.mortar),concrete=rgb(colors.concrete);
 const noise=(x,y)=>((Math.imul(x,374761393)^Math.imul(y,668265263))>>>0)/4294967295;
 function maps(width,height,sample,repeat){
  const color=new Uint8Array(width*height*4),relief=new Uint8Array(color.length);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const [c,h]=sample(x,y),i=(y*width+x)*4;
   color.set([...c,255],i);relief.set([h,h,h,255],i);
  }
  const textures=[color,relief].map((data,index)=>{
   const t=new THREE.DataTexture(data,width,height);t.colorSpace=index===0?THREE.SRGBColorSpace:THREE.NoColorSpace;
   t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(...repeat);
   t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=4;t.needsUpdate=true;return t;
  });
  return {map:textures[0],bumpMap:textures[1]};
 }
 const brickMaps=maps(256,128,(x,y)=>{
  const row=Math.floor(y/64),localX=(x+row*64)%128,joint=localX<5.4||y%64<7.5;
  const grain=noise(x,y)-.5,tone=.9+.15*noise(Math.floor((x+row*64)/128)%2,row);
  return [joint?mortar.map(c=>c+grain*9):clay.map(c=>c*tone+grain*18),joint?40:170+grain*35];
 },[1/.48,1/.17]);
 const concreteMaps=maps(128,128,(x,y)=>{
  const grain=noise(x,y),pore=grain>.986,seam=y<1;
  const tone=1+.022*Math.sin(x*.15)+.025*Math.cos(y*.11)+(grain-.5)*.045;
  return [concrete.map(c=>c*tone-(pore?15:0)-(seam?4:0)),pore?65:seam?120:165];
 },[1/.6,1/.6]);
 return {
  concrete:new THREE.MeshStandardMaterial({color:'#ffffff',...concreteMaps,roughness:.92,bumpScale:.0007,flatShading:true}),
  masonry:new THREE.MeshStandardMaterial({color:'#ffffff',...brickMaps,roughness:.96,bumpScale:.0015,flatShading:true,
   polygonOffset:true,polygonOffsetFactor:2,polygonOffsetUnits:2}),
  textures:[...Object.values(brickMaps),...Object.values(concreteMaps)]
 };
}
export function createStructuralConcept(model,settings=STRUCTURE_SETTINGS){
 const {floor_elevation:floor,wall_height:height,ground_elevation:grade,width,depth}=model.dimensions;
 const sections=settings.exampleSectionsMM,sectionValues=[...(sections?.column??[]),...(sections?.beam??[])];
 if(![floor,height,grade,width,depth,...sectionValues].every(Number.isFinite)||height<=0||
  sections?.status!==EXAMPLE||sections.column.length!==2||sections.beam.length!==2||sectionValues.some(n=>n<=0))
  throw new Error('Conceptual framing requires valid levels and positive EXAMPLE_UNVERIFIED section dimensions.');
 const [columnX,columnY]=sections.column.map(n=>n/1000),[beamWidth,beamDepth]=sections.beam.map(n=>n/1000);
 if(beamDepth>=height*FT)throw new Error('Example beam depth must fit within the architectural wall height.');
 const top=floor+height,columns=[],beams=[],questions=[],colors=settings.colors,materials=studyMaterials(colors);
 const root=new THREE.Group();root.name='Illustrative RCC frame and masonry - NOT ENGINEERED';root.visible=false;
 root.userData={status:STATUS,systemAssumption:'RCC frame with masonry infill is an illustrative choice, not a confirmed structural system.',
  architecturalMasterUnchanged:true,quantitiesApproved:false,exampleSectionsMM:structuredClone(sections),
  sectionMeaning:'Solid EXAMPLE/UNVERIFIED sections only. Not a member-size schedule, safe layout or code-minimum prescription.',
  issues:['Column positions and beam spans are not a structural layout.',
   'Monitor, hip-roof and open hall/dining support/load paths are unresolved.',
   'Slab support, foundations and lateral stability are unknown. No subgrade design is shown.']};
 function native(name){
  const record=model.objects.find(o=>o.name===name);
  if(!record)throw new Error('Missing architectural reference for Structure mode: '+name);
  return record;
 }
 function bounds(record){
  const box=new THREE.Box3();
  for(const p of record.vertices)box.expandByPoint(new THREE.Vector3(...p));
  return box;
 }
 function nativeGeometry(record){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(record.vertices.flatMap(([x,y,z])=>[x*FT,z*FT,-y*FT]),3));
  g.setIndex(record.triangles.flat());g.computeVertexNormals();return g;
 }
 function lines(segments,color,name,{dashed=false,opacity=1}={}){
  const g=new THREE.BufferGeometry().setFromPoints(segments.flat().map(p=>point(...p)));
  const m=dashed?new THREE.LineDashedMaterial({color,dashSize:.55*FT,gapSize:.3*FT,transparent:true,opacity}):
   new THREE.LineBasicMaterial({color,transparent:true,opacity});
  const object=new THREE.LineSegments(g,m);object.name=name;object.computeLineDistances();
  object.userData={status:STATUS};root.add(object);return object;
 }
 const xs=settings.xWallAxes.map(name=>bounds(native(name)).getCenter(new THREE.Vector3()).x);
 const ys=settings.yWallAxes.map(name=>bounds(native(name)).getCenter(new THREE.Vector3()).y);
 const columnGeometry=surfaceUV(new THREE.BoxGeometry(columnX,height*FT,columnY)),basePoints=[];
 for(const [index,[ix,iy]]of settings.perimeterStations.entries()){
  if(!Number.isInteger(ix)||!Number.isInteger(iy)||xs[ix]===undefined||ys[iy]===undefined)
   throw new Error('Invalid example column station: '+index);
  const x=xs[ix],y=ys[iy],id='C-ref-'+String(index+1).padStart(2,'0');
  const mesh=new THREE.Mesh(columnGeometry,materials.concrete);mesh.name=`${id} EXAMPLE column ${sections.column.join(' x ')} mm`;
  mesh.position.copy(point(x,y,floor+height/2));mesh.castShadow=mesh.receiveShadow=true;
  mesh.userData={status:EXAMPLE,role:'example-column',id,plan:[x,y],bottom:floor,top,sectionMM:[...sections.column],
   structuralDesign:false,foundation:'Unknown - stops at FFL, not at a footing.'};
  root.add(mesh);columns.push(mesh);basePoints.push([x,y,floor]);
 }
 const beamGeometries=new Map();
 for(let i=0;i<columns.length;i++){
  const a=columns[i].userData.plan,b=columns[(i+1)%columns.length].userData.plan;
  const alongX=Math.abs(a[1]-b[1])<1e-6,alongY=Math.abs(a[0]-b[0])<1e-6;
  if(alongX===alongY)throw new Error('Example beam stations must be distinct and orthogonally aligned.');
  // Stop at column faces: coincident exterior joint faces must not overlap and flicker.
  const length=Math.hypot(a[0]-b[0],a[1]-b[1])*FT-(alongX?columnX:columnY);
  if(length<=0)throw new Error('Example sections overlap adjacent column stations.');
  const key=[alongX,length].join(':');
  if(!beamGeometries.has(key))beamGeometries.set(key,surfaceUV(new THREE.BoxGeometry(alongX?length:beamWidth,beamDepth,alongX?beamWidth:length)));
  const mesh=new THREE.Mesh(beamGeometries.get(key),materials.concrete),id='B-ref-'+String(i+1).padStart(2,'0');
  mesh.position.copy(point((a[0]+b[0])/2,(a[1]+b[1])/2,top-beamDepth/(2*FT)));mesh.castShadow=mesh.receiveShadow=true;
  mesh.name=`${id} EXAMPLE downstand beam ${sections.beam.join(' x ')} mm`;
  mesh.userData={status:EXAMPLE,role:'example-beam',id,sectionMM:[...sections.beam],ends:[columns[i].userData.id,columns[(i+1)%columns.length].userData.id],
   bottom:top-beamDepth/FT,top,structuralDesign:false};
  root.add(mesh);beams.push(mesh);
 }
 const context=new THREE.Group();context.name='Native masonry wall reference - original openings';root.add(context);
 const walls=[];
 for(const record of model.objects.filter(o=>o.group==='Walls')){
  const mesh=new THREE.Mesh(surfaceUV(nativeGeometry(record)),materials.masonry);mesh.name=record.name+' - native wall envelope';
  mesh.castShadow=mesh.receiveShadow=true;mesh.userData={status:'ARCHITECTURAL_ENVELOPE_ONLY',source:record.name,structuralDesign:false};
  context.add(mesh);walls.push(mesh);
 }
 if(!walls.length)throw new Error('Missing native masonry wall references.');
 context.userData={status:'ARCHITECTURAL_ENVELOPE_ONLY',source:'Unmodified full-height native wall solids',
  nominalWallInches:[...new Set(model.plan.openings.map(o=>o.wall_thickness*12))].sort((a,b)=>b-a),structuralDesign:false};
 const positions=[];
 for(const record of model.objects.filter(o=>o.name.startsWith('Hip Roof ')||o.name.startsWith('Monitor Cap '))){
  const g=nativeGeometry(record),edges=new THREE.EdgesGeometry(g,8);positions.push(...edges.attributes.position.array);g.dispose();edges.dispose();
 }
 const roofGeometry=new THREE.BufferGeometry();roofGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 const roof=new THREE.LineSegments(roofGeometry,new THREE.LineBasicMaterial({color:colors.envelope,transparent:true,opacity:.65}));
 roof.name='Approved hipped roof/monitor envelope - framing unknown';roof.userData={status:'ARCHITECTURAL_ENVELOPE_ONLY',notStructuralMembers:true};root.add(roof);
 const slabRecord=native('Ground Floor Slab'),slab=new THREE.Mesh(nativeGeometry(slabRecord),new THREE.MeshStandardMaterial({color:colors.slab,roughness:.94}));
 slab.name='Existing architectural FLOOR slab - support unknown';slab.receiveShadow=true;
 slab.userData={status:'ARCHITECTURAL_ENVELOPE_ONLY',source:slabRecord.name,structuralDesign:false};root.add(slab);
 const corners=model.objects.filter(o=>o.name.startsWith('Monitor Corner '));
 if(corners.length!==4)throw new Error('Conceptual roof questions require the four existing monitor corner references.');
 const mb=new THREE.Box3();for(const corner of corners)mb.union(bounds(corner));
 for(const corner of corners){
  const {x,y}=bounds(corner).getCenter(new THREE.Vector3());questions.push([[x,y,top],[x,y,mb.min.z]]);
 }
 const hall=model.rooms.find(r=>r.name==='Hall');
 if(!hall)throw new Error('Missing hall reference for unresolved open-span marker.');
 questions.push([[hall.x,hall.y+hall.depth,top],[hall.x+hall.width,hall.y+hall.depth,top]]);
 const unresolved=lines(questions,colors.question,'UNRESOLVED monitor transfer and open hall span',{dashed:true});
 unresolved.userData={status:STATUS,role:'unresolved-support-relationships',notPostsOrDesignedBeams:true};
 const nodes=new THREE.BufferGeometry().setFromPoints([...basePoints,...questions.flat()].map(p=>point(...p)));
 const questionNodes=new THREE.Points(nodes,new THREE.PointsMaterial({color:colors.question,size:.12,sizeAttenuation:true}));
 questionNodes.name='Unverified support endpoints - no foundation design';root.add(questionNodes);
 root.updateMatrixWorld(true);
 const openingClashes=[],clashMarkers=new THREE.Group();clashMarkers.name='EXAMPLE frame versus approved opening clashes';root.add(clashMarkers);
 for(const opening of model.plan.openings){
  const angle=opening.angle_degrees*Math.PI/180,aperture=new THREE.Box3();
  for(const u of [-opening.width/2,opening.width/2])for(const v of [-opening.wall_thickness/2,opening.wall_thickness/2])
   for(const z of [floor+opening.sill,floor+opening.sill+opening.height])
    aperture.expandByPoint(point(opening.x+u*Math.cos(angle)-v*Math.sin(angle),opening.y+u*Math.sin(angle)+v*Math.cos(angle),z));
  let outlined=false;
  for(const member of [...columns,...beams]){
   const overlap=new THREE.Box3().setFromObject(member).intersect(aperture),size=overlap.getSize(new THREE.Vector3());
   if(overlap.isEmpty()||Math.min(size.x,size.y,size.z)<1e-5)continue;
   const clash={member:member.userData.id,opening:opening.name,minMetres:overlap.min.toArray(),maxMetres:overlap.max.toArray()};
   openingClashes.push(clash);
   const marker=new THREE.Box3Helper(overlap,colors.clash);marker.name=`CLASH ${clash.member} / ${clash.opening}`;
   marker.material.depthTest=false;marker.renderOrder=5;marker.userData={status:EXAMPLE,clash};clashMarkers.add(marker);
   if(!outlined){
    const outline=new THREE.Box3Helper(aperture,colors.question);outline.name='Approved aperture: '+opening.name;
    outline.material.depthTest=false;outline.material.transparent=true;outline.material.opacity=.6;outline.renderOrder=4;clashMarkers.add(outline);outlined=true;
   }
  }
 }
 const columnBounds=new THREE.Box3();for(const c of columns)columnBounds.union(new THREE.Box3().setFromObject(c));
 root.userData.outerProjectionMM=Math.max(0,-columnBounds.min.x,columnBounds.max.x-width*FT,columnBounds.max.z,-depth*FT-columnBounds.min.z)*1000;
 root.userData.openingClashes=openingClashes;
 const datum=[];
 for(const z of [grade,floor])for(const [a,b]of [[[0,0],[width,0]],[[width,0],[width,depth]],[[width,depth],[0,depth]],[[0,depth],[0,0]]])
  datum.push([[...a,z],[...b,z]]);
 lines(datum,colors.datum,'Shared grade and finished-floor reference outlines',{dashed:true,opacity:.5});
 root.userData.levels={grade,floor,wallTop:top,monitorBase:mb.min.z};
 root.updateMatrixWorld(true);
 return {root,columns,beams,context,walls,roof,slab,unresolved,openingClashes,clashMarkers,materials,
  setContext(visible){context.visible=visible},setRoof(visible){roof.visible=visible}};
}
