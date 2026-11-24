import fs from 'node:fs';
import * as THREE from 'three';
import {createFurnishings,FT} from './output/furnishings.js';

const text=fs.readFileSync('output/review-data.js','utf8');
const model=JSON.parse(text.slice('window.HOME_MODEL='.length,-1));
const {root,items}=createFurnishings(model);root.updateMatrixWorld(true);
const failures=[],reports=[],solidTypes=new Set(['BoxGeometry','CylinderGeometry','SphereGeometry','TorusGeometry']);
let assetMeshes=0,minExtent=Infinity;
root.traverse(mesh=>{
 if(!mesh.isMesh)return;
 assetMeshes++;
 const geometry=mesh.geometry;
 geometry.computeBoundingBox();
 const size=geometry.boundingBox.getSize(new THREE.Vector3()).multiply(mesh.scale).divideScalar(FT);
 minExtent=Math.min(minExtent,size.x,size.y,size.z);
 if(!solidTypes.has(geometry.type)||geometry.parameters.openEnded===true||Math.min(size.x,size.y,size.z)<.001)
  failures.push('Non-solid or zero-thickness furnishing in '+mesh.parent.name);
});
for(const item of items){
 const room=model.rooms.find(r=>r.name===item.room),bounds=new THREE.Box3().setFromObject(item.group);
 const b={xmin:bounds.min.x/FT,xmax:bounds.max.x/FT,ymin:-bounds.max.z/FT,ymax:-bounds.min.z/FT};
 if(b.xmin<room.x-.03||b.xmax>room.x+room.width+.03||b.ymin<room.y-.03||b.ymax>room.y+room.depth+.03)failures.push(item.name+' outside its room');
 let sweepHits=0;
 if(!item.soft)item.group.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const a=new THREE.Box3().setFromObject(mesh);
  const rect={xmin:a.min.x/FT,xmax:a.max.x/FT,ymin:-a.max.z/FT,ymax:-a.min.z/FT};
  for(const door of model.doorways){
   const angle=door.angle_degrees*Math.PI/180,s=door.hinge==='start'?-1:1;
   const h=[door.x+Math.cos(angle)*s*door.width/2,door.y+Math.sin(angle)*s*door.width/2];
   const closed=[h[0]-Math.cos(angle)*s*door.width,h[1]-Math.sin(angle)*s*door.width],open=[h[0]+door.opens_to[0]*door.width,h[1]+door.opens_to[1]*door.width];
   const minx=Math.max(rect.xmin,Math.min(h[0],closed[0],open[0])),maxx=Math.min(rect.xmax,Math.max(h[0],closed[0],open[0]));
   const miny=Math.max(rect.ymin,Math.min(h[1],closed[1],open[1])),maxy=Math.min(rect.ymax,Math.max(h[1],closed[1],open[1]));
   if(maxx-minx<=.02||maxy-miny<=.02)continue;
   const dx=Math.max(minx-h[0],0,h[0]-maxx),dy=Math.max(miny-h[1],0,h[1]-maxy);
   if(dx*dx+dy*dy<(door.width-.02)**2){sweepHits++;failures.push(item.name+' intersects assumed door swing '+door.name);break}
  }
 });
 reports.push({name:item.name,room:item.room,kind:item.kind,bounds_ft:b,assumed_door_sweep_hits:sweepHits});
}
const result={status:failures.length?'FAILED':'passed',furnishing_groups:items.length,failures,
 checks:['Actual mesh bounds remain within named clear-room rectangles','Hard furniture avoids all nine assumed door-sweep sectors'],
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
