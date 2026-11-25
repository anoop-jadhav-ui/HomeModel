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
test('eased motion preserves elapsed time from10 to120fps, including uneven frame intervals',()=>{
 function simulate(hz){
  const walker=new WalkController(map);walker.place(hall,0,0);
  for(let i=0;i<hz;i++)walker.update(1/hz,{forward:1});
  for(let i=0;i<hz;i++)walker.update(1/hz);
  return walker;
 }
 const fast=simulate(120);
 for(const hz of [10,15,20,30,60]){
  const slow=simulate(hz);
  assert(Math.hypot(slow.position[0]-fast.position[0],slow.position[1]-fast.position[1])<1e-6,'elapsed time lost at '+hz+'fps');
 }
 const uneven=new WalkController(map);uneven.place(hall,0,0);
 for(let i=0;i<10;i++)for(const dt of [.01,.025,.065])uneven.update(dt,{forward:1});
 for(let i=0;i<60;i++)uneven.update(1/60);
 assert(Math.hypot(uneven.position[0]-fast.position[0],uneven.position[1]-fast.position[1])<1e-6);
 assert(Math.hypot(...fast.velocity)<.001);
 assert(map.canClose(hall));
 assert.equal(map.canClose([11,11.8]),false);
});
test('free WASD preserves the chosen heading through actual doorways in both directions',()=>{
 const crossings=[
  {start:[11.1,10.5],bearing:.1,duration:1.2},
  {start:[31.4,10.5],bearing:.1,duration:1.2},
  {start:[11.15,19.5],bearing:.1,duration:1.2},
  {start:[31.4,19.5],bearing:.1,duration:1.2},
  {start:[18.7,25.5],bearing:.05,duration:1.1},
  {start:[22.2,25.5],bearing:.05,duration:1.1},
  {start:[30.8,27],bearing:Math.PI/2+.05,duration:1.1}
 ];
 for(const {start,bearing,duration} of crossings)for(const hz of [15,60,120]){
  assert(map.isFree(start),'invalid test start: '+start);
  const walker=new WalkController(map);walker.place(start,bearing,0);
  const simulate=()=>{
   for(let i=0;i<Math.round(duration*hz);i++){
    const previous=[...walker.position],state=walker.update(1/hz,{forward:1});
    assert(map.isFree(walker.position),'door/frame contact: '+start);
    assert(Math.abs(Math.atan2(Math.sin(state.bearing-walker.targetBearing),Math.cos(state.bearing-walker.targetBearing)))<1e-10);
    assert(Math.hypot(walker.position[0]-previous[0],walker.position[1]-previous[1])>0,'unexpected stop: '+start);
   }
  };
  simulate();
  assert(Math.abs(Math.atan2(Math.sin(walker.bearing-bearing),Math.cos(walker.bearing-bearing)))<1e-10,'manual heading was changed near '+start);
  assert(Math.hypot(walker.position[0]-start[0],walker.position[1]-start[1])>3,'doorway not traversed: '+start);
  walker.place(walker.position,bearing+Math.PI,0);simulate();
  assert(Math.hypot(walker.position[0]-start[0],walker.position[1]-start[1])<1e-8,'return traversal changed pace or hit a jamb: '+start);
 }
});
test('low-frame-rate angled wall contact slides continuously without entering the wall',()=>{
 for(const hz of [10,30,120]){
  const walker=new WalkController(map);walker.place([12,5],-.4,0);
  let previousSpeed=0;
  for(let i=0;i<hz*1.5;i++){
   const y=walker.position[1];walker.update(1/hz,{forward:1});
   const speed=(walker.position[1]-y)*hz;
   assert(map.isFree(walker.position));
   assert(speed>=previousSpeed-1e-8,'tangential movement stuttered at '+hz+'fps');
   previousSpeed=speed;
  }
  assert(walker.position[0]<=12.2&&walker.position[0]>12.18);
  assert(walker.position[1]>9);
 }
});
test('interrupting guided travel immediately releases its camera steering without resetting momentum',()=>{
 const walker=new WalkController(map);walker.place(hall,1,0);
 assert(walker.goTo([22,17],'Dining_central_zone'));
 walker.update(1/60);
 assert.notEqual(walker.bearing,walker.targetBearing);
 const bearing=walker.bearing,velocity=[...walker.velocity];
 walker.cancel();
 assert.deepEqual(walker.velocity,velocity);
 for(let i=0;i<60;i++)walker.update(1/60,{forward:1});
 assert(Math.abs(walker.bearing-bearing)<1e-10,'cancelled route retained a pending turn');
 walker.look(20,0);const target=walker.targetBearing;
 walker.cancel();walker.update(1/60,{forward:1,looking:true});
 assert.equal(walker.targetBearing,target,'key repeats must not cancel intentional mouse look');
});
test('all WASD axes and diagonals retain equal free-walk pace and user heading',()=>{
 for(const input of [{forward:1},{forward:-1},{strafe:1},{strafe:-1},{forward:1,strafe:1},{forward:1,strafe:-1}]){
  const walker=new WalkController(map);walker.place([23,7],.12,0);
  for(let i=0;i<60;i++)walker.update(1/60,input);
  assert(Math.abs(walker.bearing-.12)<1e-10);
  assert(Math.abs(Math.hypot(walker.position[0]-23,walker.position[1]-7)-3.00045594098)<1e-8);
  assert(map.isFree(walker.position));
 }
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
