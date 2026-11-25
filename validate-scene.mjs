import fs from 'node:fs';
import * as THREE from 'three';
import {createFurnishings,furnishingBounds,FT} from './output/furnishings.js';
import {doorLeaves} from './output/door-presentation.js';
import {doorGeometry} from './output/walk-navigation.js';

const text=fs.readFileSync('output/review-data.js','utf8');
const model=JSON.parse(text.slice('window.HOME_MODEL='.length,-1));
const {root,items}=createFurnishings(model);root.updateMatrixWorld(true);
const failures=[],reports=[],solidTypes=new Set(['BoxGeometry','RoundedBoxGeometry','CylinderGeometry','SphereGeometry','TorusGeometry','LatheGeometry','ExtrudeGeometry','TubeGeometry']);
let assetMeshes=0,minExtent=Infinity;
root.traverse(mesh=>{
 if(!mesh.isMesh)return;
 assetMeshes++;
 const geometry=mesh.geometry;
 geometry.computeBoundingBox();
 const size=geometry.boundingBox.getSize(new THREE.Vector3()).multiply(mesh.scale).divideScalar(FT);
 minExtent=Math.min(minExtent,size.x,size.y,size.z);
 if(!geometry.attributes.position.array.every(Number.isFinite)||![size.x,size.y,size.z].every(Number.isFinite)||
  (!solidTypes.has(geometry.type)&&!geometry.userData.assetSolid)||geometry.parameters?.openEnded===true||
  (geometry.type==='TubeGeometry'&&!geometry.parameters.closed)||Math.min(size.x,size.y,size.z)<.001)
  failures.push('Non-solid, nonfinite or zero-thickness furnishing in '+mesh.parent.name);
});
for(const item of items){
 const room=model.rooms.find(r=>r.name===item.room),bounds=new THREE.Box3().setFromObject(item.group);
 const b={xmin:bounds.min.x/FT,xmax:bounds.max.x/FT,ymin:-bounds.max.z/FT,ymax:-bounds.min.z/FT};
 if(b.xmin<room.x-.03||b.xmax>room.x+room.width+.03||b.ymin<room.y-.03||b.ymax>room.y+room.depth+.03)failures.push(item.name+' outside its room');
 let sweepHits=0;
 if(!item.soft)item.group.traverse(mesh=>{
  if(!mesh.isMesh)return;
  for(const a of furnishingBounds(mesh)){
  const rect={xmin:a.min.x/FT,xmax:a.max.x/FT,ymin:-a.max.z/FT,ymax:-a.min.z/FT};
  for(const door of model.doorways.flatMap(doorLeaves)){
   const shape=doorGeometry(door,0),h=shape.pivot;
   const closed=shape.tip,open=doorGeometry(door,1).tip;
   const minx=Math.max(rect.xmin,Math.min(h[0],closed[0],open[0])),maxx=Math.min(rect.xmax,Math.max(h[0],closed[0],open[0]));
   const miny=Math.max(rect.ymin,Math.min(h[1],closed[1],open[1])),maxy=Math.min(rect.ymax,Math.max(h[1],closed[1],open[1]));
   if(maxx-minx<=.02||maxy-miny<=.02)continue;
   const dx=Math.max(minx-h[0],0,h[0]-maxx),dy=Math.max(miny-h[1],0,h[1]-maxy);
   if(dx*dx+dy*dy<(shape.length-.02)**2){sweepHits++;failures.push(item.name+' intersects conceptual door-leaf swing '+door.name);break}
  }
  }
 });
 reports.push({name:item.name,room:item.room,kind:item.kind,bounds_ft:b,assumed_door_sweep_hits:sweepHits});
}
const result={status:failures.length?'FAILED':'passed',furnishing_groups:items.length,failures,
 checks:['Actual mesh bounds remain within named clear-room rectangles','Hard furniture avoids all ten conceptual leaf sectors in nine door assemblies','Batched pull bounds retain real separate parts, not a blocking combined envelope'],
 solid_asset_meshes:assetMeshes,minimum_local_solid_extent_ft:minExtent,
 limitations:['Not a building-code, accessibility, egress or fixture-use-clearance assessment','Grounded Walk uses approximate avatar/furniture/door collision clearance; advanced Fly explicitly bypasses it'],items:reports};
let pairs=0;
for(let i=0;i<reports.length;i++)for(let j=i+1;j<reports.length;j++){
 if(items[i].soft||items[j].soft||reports[i].room!==reports[j].room)continue;
 pairs++;
 const a=reports[i].bounds_ft,b=reports[j].bounds_ft;
 if(Math.min(a.xmax,b.xmax)-Math.max(a.xmin,b.xmin)>.03&&Math.min(a.ymax,b.ymax)-Math.max(a.ymin,b.ymin)>.03)
  failures.push(reports[i].name+' overlaps '+reports[j].name);
}
result.same_room_hard_asset_pairs_checked=pairs;result.status=failures.length?'FAILED':'passed';
fs.writeFileSync('output/furnishing-validation.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({status:result.status,furnishing_groups:items.length,failures},null,2));
if(failures.length)process.exitCode=1;
