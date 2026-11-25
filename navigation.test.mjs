import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createFurnishings,furnishingBounds,FT} from './output/furnishings.js';
import {createWalkMap,WalkController,FlyController,walkEyeHeight} from './output/walk-navigation.js';

const source=readFileSync('output/review-data.js','utf8');
const model=JSON.parse(source.slice('window.HOME_MODEL='.length,-1));
const furnishing=createFurnishings(model);furnishing.root.updateMatrixWorld(true);
const obstacles=[];
for(const item of furnishing.items)if(!item.soft)item.group.traverse(mesh=>{
 if(!mesh.isMesh)return;
 for(const box of furnishingBounds(mesh)){
 const floor=model.dimensions.floor_elevation;
 if(box.max.y/FT<=floor+.18||box.min.y/FT>=floor+model.navigation.eye_height+.25)continue;
 obstacles.push({minX:box.min.x/FT,maxX:box.max.x/FT,minY:-box.max.z/FT,maxY:-box.min.z/FT});
 }
});
const map=createWalkMap(model,obstacles),hall=[21.125,4.55];
test('Walk eyes are60in above each local surface for a64in person, not at crown height',()=>{
 assert.equal(walkEyeHeight(model.navigation),5);
 assert(Math.abs(model.navigation.person_height*12-64)<1e-8);
 assert.equal(model.navigation.eye_height,walkEyeHeight(model.navigation));
 for(const y of [map.entry.y,-3.9,-2.9,-1.9,-.9,.2,5,16]){
  const height=map.floorHeight([map.entry.x,y])+walkEyeHeight(model.navigation);
  assert.equal(height-map.floorHeight([map.entry.x,y]),5);
 }
 assert.throws(()=>walkEyeHeight({person_height:5,eye_below_crown:0}));
});
function crossedDoors(path){
 return model.doorways.filter(door=>path.some((p,i)=>{
  if(!i)return false;
  const q=path[i-1],a=door.angle_degrees*Math.PI/180,n=[-Math.sin(a),Math.cos(a)],u=[Math.cos(a),Math.sin(a)];
  const before=(q[0]-door.x)*n[0]+(q[1]-door.y)*n[1],after=(p[0]-door.x)*n[0]+(p[1]-door.y)*n[1];
  if(before*after>0||Math.abs(before-after)<1e-8)return false;
  const t=before/(before-after),x=q[0]+(p[0]-q[0])*t-door.x,y=q[1]+(p[1]-q[1])*t-door.y;
  return Math.abs(x*u[0]+y*u[1])<door.width/2;
 })).map(door=>door.name);
}
test('all named rooms have continuous furniture- and wall-clear routes',()=>{
 for(const room of model.rooms){
  const route=map.route(hall,[room.x+room.width/2,room.y+room.depth/2],room.name);
  assert(route,room.name+' has no route');
  assert.equal(map.roomAt(route.at(-1)),room.name);
  for(let i=1;i<route.length;i++)assert(map.lineFree(route[i-1],route[i]),room.name+' cuts a corner');
 }
});
test('right bath route uses the front bedroom doors, not the dining partition',()=>{
 const room=model.rooms.find(r=>r.name==='Bath_right');
 const route=map.route(hall,[room.x+3,room.y+3],room.name);
 assert(route);
 const doors=crossedDoors(route);
 assert(doors.includes('D1_02_FrontBedroom_Middle'));
 assert(doors.includes('D2_01_FrontBedroom_Middle'));
});
test('closed doors block private rooms while the OPEN hall portal remains usable',()=>{
 const closed=createWalkMap(model,obstacles,()=>0);
 assert.equal(closed.route(hall,[35.5,6.75],'Bedroom_front_right'),null);
 assert(closed.route(hall,[25,16],'Dining_central_zone'));
});
test('large movement steps cannot cross walls, windows or the raised-floor boundary',()=>{
 const stopped=map.move(hall,[100,0]);
 assert(map.isFree(stopped));
 assert(stopped[0]<29.125-map.radius+.01);
 const window=model.plan.openings.find(o=>o.kind==='window'&&o.host==='Right N');
 assert(window);
 assert.equal(map.isFree([window.x-.6,window.y]),false);
 assert.equal(map.isFree([10,-1]),false);
 assert.equal(map.isFree([21,-12]),false);
});
test('entry starts outside and a closed main door blocks the continuous route into the hall',()=>{
 const closed=createWalkMap(model,obstacles,()=>0),entry=closed.entry;
 const start=closed.nearest([entry.x,entry.y]);
 assert(start[1]<-entry.run);
 assert.equal(closed.floorHeight(start),model.dimensions.ground_elevation);
 assert.equal(closed.floorHeight([entry.x,0]),model.dimensions.floor_elevation);
 assert.equal(closed.route(start,hall,'Hall'),null);
 const route=map.route(start,hall,'Hall');
 assert(route);
 assert.deepEqual(crossedDoors(route),['D_01_Front_E']);
 for(let i=1;i<route.length;i++)assert(map.lineFree(route[i-1],route[i]));
});
test('raised grade and the full-width hall connection share the authoritative model levels',()=>{
 assert.equal(model.dimensions.ground_elevation,2);
 assert.equal(model.dimensions.floor_elevation-map.floorHeight([map.entry.x,map.entry.y]),2);
 assert.equal(map.entry.steps,4);
 assert.equal(map.entry.run,4);
 assert.equal(model.passages.find(p=>p.name==='Hall OPEN').width,16);
 const architectural=createWalkMap(model);
 for(const x of [14,16,21,26,28])assert(architectural.isFree([x,12.9375]),'former return still obstructs '+x);
 const changed=structuredClone(model);changed.dimensions.ground_elevation=3;
 const raised=createWalkMap(changed);
 assert.equal(raised.entry.steps,2);
 assert.equal(raised.floorHeight([raised.entry.x,raised.entry.y]),3);
 assert.equal(raised.floorHeight([raised.entry.x,0]),model.dimensions.floor_elevation);
});
test('controller actually follows clear room and entrance routes without stalling or teleporting',()=>{
 for(const [from,name] of [[[map.entry.x,map.entry.y],'Hall'],[hall,'Kitchen'],[hall,'Bath_right'],[[31.25,24.5],'WC']]){
  const room=model.rooms.find(r=>r.name===name),walker=new WalkController(map);
  walker.place(map.nearest(from),0,0);
  assert(walker.goTo([room.x+room.width/2,room.y+room.depth/2],name));
  let frames=0;
  while(walker.path.length&&frames++<7200){
   const previous=[...walker.position],state=walker.update(1/60);
   assert.equal(state.blocked,false,name+' stalled');
   assert(Math.hypot(walker.position[0]-previous[0],walker.position[1]-previous[1])<.061,'teleported');
   assert(map.isFree(walker.position),name+' crossed an obstacle');
  }
  assert(frames<7200,name+' never arrived');
  assert.equal(map.roomAt(walker.position),name);
 }
});
test('moving door sweeps are reserved and manual look overrides a guided route smoothly',()=>{
 let opening=.5;
 const dynamic=createWalkMap(model,obstacles,()=>opening);
 assert.equal(dynamic.isFree([11.5,12]),false);
 opening=1;
 assert.equal(dynamic.isFree([11.5,12]),true);
 const walker=new WalkController(map);walker.place(hall,0,0);
 assert(walker.goTo([22,17],'Dining_central_zone'));
 walker.look(60,0);
 assert.equal(walker.path.length,0);
 assert.equal(walker.bearing,0);
 walker.update(1/60,{looking:true});
 assert(walker.bearing<0&&walker.bearing>walker.targetBearing);
});
test('eased motion and stopping are frame-rate independent',()=>{
 function simulate(hz){
  const walker=new WalkController(map);walker.place(hall,0,0);
  for(let i=0;i<hz;i++)walker.update(1/hz,{forward:1});
  for(let i=0;i<hz;i++)walker.update(1/hz);
  return walker;
 }
 const slow=simulate(30),fast=simulate(120);
 assert(Math.hypot(slow.position[0]-fast.position[0],slow.position[1]-fast.position[1])<1e-6);
 assert(Math.hypot(...fast.velocity)<.001);
 assert(map.canClose(hall));
 assert.equal(map.canClose([11,11.8]),false);
});
test('carousel finds reachable unvisited rooms through real door paths until all rooms are visited',()=>{
 let position=hall;const visited=['Hall'];
 while(visited.length<model.rooms.length){
  const next=map.closestRoom(position,visited);
  assert(next,'no next room after '+visited.join(', '));
  assert(!visited.includes(next.room));
  for(let i=1;i<next.path.length;i++)assert(map.lineFree(next.path[i-1],next.path[i]));
  position=next.path.at(-1);assert.equal(map.roomAt(position),next.room);visited.push(next.room);
 }
 assert.equal(map.closestRoom(position,visited),null);
 const closed=createWalkMap(model,obstacles,()=>0),available=['Hall','Dining_central_zone','Prayer','Wash_point'];
 const next=closed.closestRoom(hall,['Hall']);
 assert(next&&available.includes(next.room),'closed doors were bypassed');
});
test('advanced flight ascends independently while normal Walk stays grounded and recoverable',()=>{
 const walker=new WalkController(map),start=map.nearest(hall);
 walker.place(start,0,0);
 const fly=new FlyController();fly.place([...start,model.dimensions.floor_elevation+5.3],0,0);
 for(let i=0;i<120;i++)fly.update(1/60,{vertical:1});
 assert(fly.position[2]>model.dimensions.floor_elevation+12);
 assert.deepEqual(walker.position,start);
 const safe=map.isFree(start)?start:map.nearest(start);
 walker.place(safe,fly.bearing,0);
 assert(map.isFree(walker.position));
 assert.equal(map.floorHeight(walker.position),model.dimensions.floor_elevation);
});
