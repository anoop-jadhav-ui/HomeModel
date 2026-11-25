import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFurnishings,furnishingBounds,FT} from './output/furnishings.js';
import {createWalkMap,WalkController} from './output/walk-navigation.js';
import {createDoorProximity} from './output/door-proximity.js';

const source=readFileSync(new URL('./output/review-data.js',import.meta.url),'utf8');
const model=JSON.parse(source.slice(18,-1)),furniture=createFurnishings(model),obstacles=[];
furniture.root.updateMatrixWorld(true);
for(const item of furniture.items)if(!item.soft)item.group.traverse(mesh=>{
 if(!mesh.isMesh)return;
 for(const b of furnishingBounds(mesh)){
  if(b.max.y/FT<=model.dimensions.floor_elevation+.18||b.min.y/FT>=model.dimensions.floor_elevation+5.25)continue;
  obstacles.push({minX:b.min.x/FT,maxX:b.max.x/FT,minY:-b.max.z/FT,maxY:-b.min.z/FT});
 }
});
function setup(){
 const progress=new Map(model.doorways.map(door=>[door.name,0]));
 const map=createWalkMap(model,obstacles,name=>progress.get(name)),route=createWalkMap(model,obstacles);
 const walker=new WalkController(map,route);
 const control=createDoorProximity(model,{radius:map.radius,lineFree:route.lineFree,canMoveDoor:map.canMoveDoor});
 function tick(dt,input={}){
  for(const [name,value] of progress)progress.set(name,Number(control.isOpen(name))+(value-Number(control.isOpen(name)))*Math.exp(-9*dt));
  const request=control.approach(walker,input),state=walker.update(dt,input);
  assert(map.isFree(walker.position),'walking entered a door/sweep/fixture at '+walker.position);
  assert(!state.blocked,'route stalled while a door should have opened');
  return request;
 }
 return {progress,map,route,walker,control,tick};
}
test('paired entrance opens by walking from either side without a button, steering or distant doors',()=>{
 for(const [inside,bearing] of [[false,0],[true,Math.PI]])for(const hz of [10,60,120]){
  const s=setup(),start=inside?[21.125,4.6]:s.map.nearest([s.map.entry.x,s.map.entry.y]);s.walker.place(start,bearing,0);
  for(let i=0;i<hz*6;i++)s.tick(1/hz,{forward:1});
  assert(s.control.isOpen('D_01_Front_E'));
  assert(Math.abs(Math.atan2(Math.sin(s.walker.bearing-bearing),Math.cos(s.walker.bearing-bearing)))<1e-10);
  assert(start[1]<0?s.walker.position[1]>1:s.walker.position[1]<0,'main threshold was not crossed');
  assert(model.doorways.filter(door=>s.control.isOpen(door.name)).length===1,'unrelated doors opened');
 }
});
test('private doorway proximity works from both sides and stays open for a safe return',()=>{
 for(const [start,bearing] of [[[11,8],0],[[11,17.5],Math.PI]]){
  const s=setup();s.walker.place(start,bearing,0);
  for(let i=0;i<120;i++)s.tick(1/60,{forward:1});
  assert(s.control.isOpen('D1_01_Kitchen_Middle'));
  assert(start[1]<12.9375?s.walker.position[1]>13.5:s.walker.position[1]<12.3);
  const end=[...s.walker.position];s.walker.place(end,bearing+Math.PI,0);
  for(let i=0;i<120;i++)s.tick(1/60,{forward:1});
  assert(Math.hypot(s.walker.position[0]-start[0],s.walker.position[1]-start[1])<.001);
  for(let i=0;i<600;i++)s.tick(1/60);
  assert(s.control.isOpen('D1_01_Kitchen_Middle'),'automatic closing must not trap the walker');
 }
});
test('passing a doorway, moving away, Fly and an occluded approach do not open doors',()=>{
 const s=setup();s.walker.place([11,15],0,0);
 assert.equal(s.control.approach(s.walker,{forward:1}),null);
 s.walker.place([11,15],Math.PI/2,0);
 assert.equal(s.control.approach(s.walker,{forward:1}),null);
 s.walker.place([11,8],0,0);
 assert.equal(s.control.approach(s.walker,{forward:1,enabled:false}),null);
 const occluded=createDoorProximity(model,{radius:s.map.radius,lineFree:()=>false,canMoveDoor:s.map.canMoveDoor});
 assert.equal(occluded.approach(s.walker,{forward:1}),null);
 assert(model.doorways.every(door=>!s.control.isOpen(door.name)));
 const far=createDoorProximity(model,{radius:s.map.radius,lineFree:()=>true,canMoveDoor:s.map.canMoveDoor});
 s.walker.place([20,14],Math.atan2(9,-1.0625),0);
 assert.equal(far.approach(s.walker,{forward:1}),null,'a diagonal ray must not extend the five-foot proximity range');
});
test('opening is deferred with an explicit blocked result if the walker occupies the leaf sweep',()=>{
 const s=setup();s.walker.place([11,11.8],0,0);
 assert(s.map.isFree(s.walker.position));
 assert(!s.map.canMoveDoor('D1_01_Kitchen_Middle',s.walker.position));
 assert.deepEqual(s.control.approach(s.walker,{forward:1}),{blocked:'D1_01_Kitchen_Middle'});
 assert(!s.control.isOpen('D1_01_Kitchen_Middle'));
 assert.throws(()=>s.control.isOpen('missing'),/Unknown/);
 assert.throws(()=>s.map.canMoveDoor('missing',[11,8]),/Unknown/);
});
test('guided routes plan through closed doors but movement still respects their real animated collision',()=>{
 for(const name of ['Kitchen','Bath_right','Attached_bath']){
  const s=setup(),room=model.rooms.find(room=>room.name===name);
  s.walker.place([21.125,4.55],0,0);
  assert(s.walker.goTo([room.x+room.width/2,room.y+room.depth/2],name));
  let frames=0;
  while(s.walker.path.length&&frames++<7200)s.tick(1/60);
  assert(frames<7200,'never reached '+name);
  assert.equal(s.map.roomAt(s.walker.position),name);
  assert(model.doorways.filter(door=>s.control.isOpen(door.name)).length<model.doorways.length,'guided route opened the entire house');
 }
});
test('Enter home control and its obsolete runtime dependencies are removed',()=>{
 const html=readFileSync(new URL('./output/index.html',import.meta.url),'utf8');
 const scene=readFileSync(new URL('./output/scene.js',import.meta.url),'utf8');
 assert(!html.includes('enter-home'));
 assert(!scene.includes('enterButton')&&!scene.includes('pendingRequest'));
});
