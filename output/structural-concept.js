import * as THREE from 'three';
import {FT,point} from './furnishings.js';
import {STRUCTURE_SETTINGS} from './structure-settings.js';

const STATUS='CONCEPT_ONLY_NOT_ENGINEERED';
export function createStructuralConcept(model,settings=STRUCTURE_SETTINGS){
 const root=new THREE.Group();root.name='Conceptual framing study - NOT ENGINEERED';root.visible=false;
 root.userData={status:STATUS,architecturalMasterUnchanged:true,quantitiesApproved:false,
  sectionMeaning:'Graphic column markers and beam axes, not member sections or construction sizes.',
  issues:['Column positions and beam spans are not a structural layout.',
   'Monitor, hip-roof and open hall/dining support/load paths are unresolved.',
   'Slab support, foundations and lateral stability are unknown. No subgrade design is shown.']};
 const {floor_elevation:floor,wall_height:height,ground_elevation:grade,width,depth}=model.dimensions;
 if(![floor,height,grade,width,depth,settings.columnMarkerSide].every(Number.isFinite)||height<=0||settings.columnMarkerSide<=0)
  throw new Error('Conceptual framing requires valid architectural levels and positive diagram-marker dimensions.');
 const top=floor+height,columns=[],beams=[],questions=[],colors=settings.colors;
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
 const xs=settings.xWallAxes.map(name=>bounds(native(name)).getCenter(new THREE.Vector3()).x);
 const ys=settings.yWallAxes.map(name=>bounds(native(name)).getCenter(new THREE.Vector3()).y);
 const marker=new THREE.BoxGeometry(settings.columnMarkerSide*FT,height*FT,settings.columnMarkerSide*FT);
 const columnMat=new THREE.MeshBasicMaterial({color:colors.column,transparent:true,opacity:.8});
 const basePoints=[];
 for(const [index,[ix,iy]]of settings.perimeterStations.entries()){
  if(!Number.isInteger(ix)||!Number.isInteger(iy)||xs[ix]===undefined||ys[iy]===undefined)
   throw new Error('Invalid conceptual column station: '+index);
  const x=xs[ix],y=ys[iy],id='C-ref-'+String(index+1).padStart(2,'0');
  const mesh=new THREE.Mesh(marker,columnMat);mesh.name=id+' provisional column marker';
  mesh.position.copy(point(x,y,floor+height/2));
  mesh.userData={status:STATUS,role:'reference-column',id,plan:[x,y],bottom:floor,top,
   sectionIsGraphicOnly:true,foundation:'Unknown - marker stops at FFL, not at a footing.'};
  root.add(mesh);columns.push(mesh);basePoints.push([x,y,floor]);
 }
 function lines(segments,color,name,{dashed=false,opacity=1}={}){
  const geometry=new THREE.BufferGeometry().setFromPoints(segments.flat().map(p=>point(...p)));
  const material=dashed?new THREE.LineDashedMaterial({color,dashSize:.55*FT,gapSize:.3*FT,transparent:true,opacity}):
   new THREE.LineBasicMaterial({color,transparent:true,opacity});
  const mesh=new THREE.LineSegments(geometry,material);mesh.name=name;mesh.computeLineDistances();
  mesh.userData={status:STATUS};root.add(mesh);return mesh;
 }
 for(let i=0;i<columns.length;i++){
  const a=columns[i].userData.plan,b=columns[(i+1)%columns.length].userData.plan;
  beams.push([[...a,top],[...b,top]]);
 }
 const beamAxes=lines(beams,colors.beam,'Provisional perimeter beam axes - NOT SIZED',{dashed:true});
 beamAxes.userData.role='beam-reference-axes';
 function nativeGeometry(record){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(record.vertices.flatMap(([x,y,z])=>[x*FT,z*FT,-y*FT]),3));
  geometry.setIndex(record.triangles.flat());return geometry;
 }
 function nativeEdges(records,name,opacity){
  const positions=[];
  for(const record of records){
   const geometry=nativeGeometry(record),edges=new THREE.EdgesGeometry(geometry,8);
   positions.push(...edges.attributes.position.array);geometry.dispose();edges.dispose();
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const mesh=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:colors.envelope,transparent:true,opacity}));
  mesh.name=name;mesh.userData={status:'ARCHITECTURAL_ENVELOPE_ONLY',notStructuralMembers:true};root.add(mesh);return mesh;
 }
 const context=nativeEdges(model.objects.filter(o=>o.group==='Walls'),'Optional approved wall/opening outlines',.35);context.visible=false;
 const roof=nativeEdges(model.objects.filter(o=>o.name.startsWith('Hip Roof ')||o.name.startsWith('Monitor Cap ')),
  'Approved roof envelope - framing unknown',.65);
 const slabRecord=native('Ground Floor Slab'),slabGeometry=nativeGeometry(slabRecord);slabGeometry.computeVertexNormals();
 const slab=new THREE.Mesh(slabGeometry,new THREE.MeshBasicMaterial({color:colors.slab,transparent:true,opacity:.35,depthWrite:false}));
 slab.name='Existing architectural floor slab envelope - support unknown';
 slab.userData={status:'ARCHITECTURAL_ENVELOPE_ONLY',source:slabRecord.name,structuralDesign:false};root.add(slab);
 const corners=model.objects.filter(o=>o.name.startsWith('Monitor Corner '));
 if(corners.length!==4)throw new Error('Conceptual roof questions require the four existing monitor corner references.');
 const mb=new THREE.Box3();for(const corner of corners)mb.union(bounds(corner));
 // The endpoints track the actual curb centerlines; no imaginary truss/post is asserted.
 for(const corner of corners){
  const {x,y}=bounds(corner).getCenter(new THREE.Vector3());
  questions.push([[x,y,top],[x,y,mb.min.z]]);
 }
 const hall=model.rooms.find(r=>r.name==='Hall');
 if(!hall)throw new Error('Missing hall reference for unresolved open-span marker.');
 questions.push([[hall.x,hall.y+hall.depth,top],[hall.x+hall.width,hall.y+hall.depth,top]]);
 const unresolved=lines(questions,colors.question,'UNRESOLVED monitor transfer and open hall span',{dashed:true});
 unresolved.userData={status:STATUS,role:'unresolved-support-relationships',notPostsOrDesignedBeams:true};
 const nodes=new THREE.BufferGeometry().setFromPoints([...basePoints,...questions.flat()].map(p=>point(...p)));
 const questionNodes=new THREE.Points(nodes,new THREE.PointsMaterial({color:colors.question,size:.12,sizeAttenuation:true}));
 questionNodes.name='Unverified support endpoints - no foundation design';root.add(questionNodes);
 const datum=[];
 for(const z of [grade,floor])for(const [a,b]of [[[0,0],[width,0]],[[width,0],[width,depth]],[[width,depth],[0,depth]],[[0,depth],[0,0]]])
  datum.push([[...a,z],[...b,z]]);
 lines(datum,colors.datum,'Shared grade and finished-floor reference outlines',{dashed:true,opacity:.5});
 root.userData.levels={grade,floor,wallTop:top,monitorBase:mb.min.z};
 return {root,columns,beamAxes,context,roof,slab,unresolved,
  setContext(visible){context.visible=visible},
  setRoof(visible){roof.visible=visible}};
}
