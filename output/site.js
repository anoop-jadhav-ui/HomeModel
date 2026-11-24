import * as THREE from 'three';
import {FT,point} from './furnishings.js';
import {SITE_SETTINGS as S} from './site-settings.js';
import {entryApproach} from './walk-navigation.js';

/**
 * Detached, visualization-only addition. Caller adds root to a scene; no model
 * mutation, navigation registration, DOM work, native export or scene wiring.
 * bounds and root.userData.site feature bounds use native feet (Z is up).
 * Absolute grade comes from dimensions.ground_elevation at construction only;
 * display modes must not reposition this root or its grade-relative geometry.
 * No gate leaves are created: the opening is permanently unobstructed.
 */
export function createSite(model){
  const {width,depth,ground_elevation:ground}=model.dimensions;
  if(!Number.isFinite(ground))
    throw new Error('Illustrative site requires finite model.dimensions.ground_elevation in feet.');
  const door=model.doorways.find(d=>d.name.startsWith('D_'));
  if(!door||!Number.isFinite(door.x)||!(door.width>0)||door.angle_degrees!==0)
    throw new Error('Illustrative site requires a front D_ doorway parallel to X.');
  const entry=entryApproach(model);
  const roofVertices=model.objects.filter(o=>o.group==='Roof').flatMap(o=>o.vertices);
  if(!roofVertices.length)throw new Error('Illustrative site requires source roof geometry.');
  const roof={minX:0,maxX:width,minY:0,maxY:depth};
  for(const [x,y] of roofVertices){
    roof.minX=Math.min(roof.minX,x);roof.maxX=Math.max(roof.maxX,x);
    roof.minY=Math.min(roof.minY,y);roof.maxY=Math.max(roof.maxY,y);
  }
  const bounds={minX:-S.margins.side,maxX:width+S.margins.side,minY:-S.margins.front,maxY:depth+S.margins.rear};
  const opening=Math.max(S.gateway.minimumOpening,entry.width,S.entrance.pathWidth);
  const corridor={minX:entry.x-opening/2,maxX:entry.x+opening/2,
    minY:Math.min(bounds.minY,entry.minY,-entry.run),maxY:0};
  const root=new THREE.Group();root.name='Illustrative site - not surveyed';
  const features=[];
  const material=color=>new THREE.MeshStandardMaterial({color,roughness:1});
  const M={plaster:material('#d9cdb5'),coping:material('#9a6047'),timber:material('#79563b'),
    grass:material('#87946a'),soil:material('#6d5b44'),leaf:material('#526c43'),path:material('#b5aa92')};
  function record(mesh,name,kind,solid,nativeBounds,instances){
    mesh.name=name;mesh.receiveShadow=true;mesh.castShadow=solid;
    const feature={name,kind,solid,bounds:nativeBounds};
    if(instances)feature.instances=instances;
    features.push(feature);mesh.userData.siteFeature=feature;root.add(mesh);return mesh;
  }
  function box(name,kind,solid,minX,maxX,minY,maxY,minZ,maxZ,mat){
    if(!(maxX>minX&&maxY>minY&&maxZ>minZ))throw new Error('Invalid illustrative site dimensions: '+name);
    const mesh=new THREE.Mesh(new THREE.BoxGeometry((maxX-minX)*FT,(maxZ-minZ)*FT,(maxY-minY)*FT),mat);
    mesh.position.copy(point((minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2));
    return record(mesh,name,kind,solid,{minX,maxX,minY,maxY,minZ,maxZ});
  }
  const t=S.wall.thickness,c=S.wall.copingWidth,post=S.gateway.postWidth,cap=S.gateway.capWidth;
  const gateY=bounds.minY+Math.max(c,cap)/2;
  const left=bounds.minX+c/2,right=bounds.maxX-c/2,rear=bounds.maxY-c/2;
  const postCenters=[corridor.minX-cap/2,corridor.maxX+cap/2];
  if(postCenters[0]-post/2<=bounds.minX+c||postCenters[1]+post/2>=bounds.maxX-c)
    throw new Error('D_ entrance is too close to the illustrative site edge.');
  function prism(name,kind,outline,minZ,maxZ,mat){
    const shape=new THREE.Shape(outline.map(([x,y])=>new THREE.Vector2(x*FT,y*FT)));
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:(maxZ-minZ)*FT,bevelEnabled:false,steps:1});
    const mesh=new THREE.Mesh(geometry,mat);
    mesh.rotation.x=-Math.PI/2;mesh.position.y=minZ*FT;
    const xs=outline.map(p=>p[0]),ys=outline.map(p=>p[1]);
    mesh.userData.footprint=outline;
    return record(mesh,name,kind,true,{minX:Math.min(...xs),maxX:Math.max(...xs),
      minY:Math.min(...ys),maxY:Math.max(...ys),minZ,maxZ});
  }
  const gateLeft=postCenters[0]-post/2,gateRight=postCenters[1]+post/2;
  // Matching 45-degree end planes close both the plaster and overhanging coping.
  const runs=[
    ['Front left wall',s=>[[left-s,gateY-s],[gateLeft,gateY-s],[gateLeft,gateY+s],[left+s,gateY+s]]],
    ['Front right wall',s=>[[gateRight,gateY-s],[right+s,gateY-s],[right-s,gateY+s],[gateRight,gateY+s]]],
    ['Rear wall',s=>[[left-s,rear+s],[left+s,rear-s],[right-s,rear-s],[right+s,rear+s]]],
    ['Left wall',s=>[[left-s,gateY-s],[left+s,gateY+s],[left+s,rear-s],[left-s,rear+s]]],
    ['Right wall',s=>[[right-s,gateY+s],[right+s,gateY-s],[right+s,rear+s],[right-s,rear-s]]],
  ];
  for(const [name,outline] of runs){
    prism(name,'boundary-wall',outline(t/2),ground,ground+S.wall.height,M.plaster);
    prism(name+' coping','coping',outline(c/2),ground+S.wall.height,
      ground+S.wall.height+S.wall.copingHeight,M.coping);
  }
  for(let i=0;i<S.gateway.postCount;i++){
    const x=postCenters[i];
    box('Open gateway timber post '+i,'gateway-post',true,x-post/2,x+post/2,gateY-post/2,gateY+post/2,ground,ground+S.gateway.postHeight,M.timber);
    box('Gateway post cap '+i,'gateway-cap',true,x-cap/2,x+cap/2,gateY-cap/2,gateY+cap/2,
      ground+S.gateway.postHeight,ground+S.gateway.postHeight+S.gateway.capHeight,M.coping);
  }
  box('Short stone approach','path',false,entry.x-S.entrance.pathWidth/2,entry.x+S.entrance.pathWidth/2,
    bounds.minY,-entry.run,ground-S.entrance.pathThickness,ground,M.path);
  const gardenFront=bounds.minY+S.garden.frontInset;
  const gardenRear=roof.minY-S.garden.houseRoofClearance;
  const beds=[];
  for(const [name,x1,x2] of [
    ['Left',Math.max(0,bounds.minX+S.garden.outerInset),corridor.minX-S.garden.corridorClearance],
    ['Right',corridor.maxX+S.garden.corridorClearance,Math.min(width,bounds.maxX-S.garden.outerInset)],
  ]){
    box(name+' modest lawn','lawn',false,x1,x2,gardenFront+S.garden.bedDepth,gardenRear,
      ground-S.garden.lawnThickness,ground,M.grass);
    box(name+' planting bed','planting-bed',false,x1,x2,gardenFront,gardenFront+S.garden.bedDepth,
      ground-S.garden.bedThickness,ground,M.soil);
    beds.push({minX:x1,maxX:x2,minY:gardenFront,maxY:gardenFront+S.garden.bedDepth});
  }
  const instances=[],geometry=new THREE.IcosahedronGeometry(1,S.garden.shrubDetail);
  const shrubs=new THREE.InstancedMesh(geometry,M.leaf,beds.length*S.garden.shrubsPerBed),dummy=new THREE.Object3D();
  for(const bed of beds)for(let i=0;i<S.garden.shrubsPerBed;i++){
    const x=THREE.MathUtils.lerp(bed.minX+S.garden.shrubEndInset,bed.maxX-S.garden.shrubEndInset,
      S.garden.shrubsPerBed===1?.5:i/(S.garden.shrubsPerBed-1));
    const y=(bed.minY+bed.maxY)/2,r=S.garden.shrubRadius,h=S.garden.shrubHeight;
    dummy.position.copy(point(x,y,ground+h/2));dummy.scale.set(r*FT,h/2*FT,r*FT);dummy.updateMatrix();
    shrubs.setMatrixAt(instances.length,dummy.matrix);
    instances.push({minX:x-r,maxX:x+r,minY:y-r,maxY:y+r,minZ:ground,maxZ:ground+h});
  }
  shrubs.instanceMatrix.needsUpdate=true;
  const shrubBounds=Object.fromEntries(['minX','maxX','minY','maxY','minZ','maxZ'].map(key=>
    [key,Math[key.startsWith('min')?'min':'max'](...instances.map(b=>b[key]))]));
  record(shrubs,'Low garden shrubs','plant',true,shrubBounds,instances);
  // Fail closed rather than overlap a changed source roof or an edited corridor.
  const overlaps=(a,b)=>a.minX<b.maxX&&a.maxX>b.minX&&a.minY<b.maxY&&a.maxY>b.minY;
  for(const f of features)for(const b of f.instances??[f.bounds]){
    if(overlaps(b,roof))throw new Error(f.name+' overlaps the source house/roof footprint.');
    if(f.solid&&overlaps(b,corridor))throw new Error(f.name+' obstructs the reserved entrance corridor.');
  }
  const stats={meshes:0,triangles:0,instances:0};
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const count=mesh.isInstancedMesh?mesh.count:1;
    stats.meshes++;stats.triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3*count;
    if(mesh.isInstancedMesh)stats.instances+=count;
  });
  root.userData.site={illustrative:true,surveyed:false,units:'feet',assumption:S.assumption,
    groundElevation:ground,groundElevationSource:'model.dimensions.ground_elevation',
    bounds,roofExclusion:roof,features,reservedEntranceCorridor:corridor,
    gateway:{sourceDoor:entry.door,centerX:entry.x,y:gateY,clearOpening:opening,alwaysOpen:true,leaves:0},
    entryApproach:entry,
    existingStairs:{minX:entry.x-entry.width/2,maxX:entry.x+entry.width/2,minY:-entry.run,maxY:0},
    settings:S,stats};
  return {root,bounds,stats};
}
