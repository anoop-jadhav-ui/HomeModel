export function createDoorProximity(model,{radius,range=5,lineFree,canMoveDoor}){
 if(!(Number.isFinite(radius)&&radius>0&&Number.isFinite(range)&&range>0)||
  typeof lineFree!=='function'||typeof canMoveDoor!=='function')
  throw new Error('Proximity doors need positive clearances and architectural collision checks.');
 const portals=model.doorways.map(door=>{
  const opening=model.plan.openings.find(item=>item.name===door.name&&item.kind==='door');
  if(!opening)throw new Error('Missing opening for proximity door '+door.name);
  const angle=door.angle_degrees*Math.PI/180;
  return {...door,u:[Math.cos(angle),Math.sin(angle)],n:[-Math.sin(angle),Math.cos(angle)],
   clearHalf:door.width/2-opening.frame_width-radius-.01,
   beyond:opening.wall_thickness/2+radius+.1};
 });
 const names=new Set(portals.map(door=>door.name)),opened=new Set();
 function isOpen(name){
  if(!names.has(name))throw new Error('Unknown proximity door '+name);
  return opened.has(name);
 }
 return {
  isOpen,
  setAll(open){opened.clear();if(open)for(const name of names)opened.add(name)},
  approach(walker,{forward=0,strafe=0,enabled=true}={}){
   if(!enabled)return null;
   const {position,bearing,path}=walker;
   if(![...position,bearing,forward,strafe].every(Number.isFinite))
    throw new Error('Proximity doors need a finite walking pose and movement input.');
   let direction;
   if(forward||strafe)direction=[-Math.sin(bearing)*forward+Math.cos(bearing)*strafe,
    Math.cos(bearing)*forward+Math.sin(bearing)*strafe];
   else{
    const target=path.find(point=>Math.hypot(point[0]-position[0],point[1]-position[1])>.22);
    if(target)direction=[target[0]-position[0],target[1]-position[1]];
   }
   if(!direction)return null;
   const candidates=[];
   for(const door of portals){
    if(opened.has(door.name))continue;
    const offset=[position[0]-door.x,position[1]-door.y];
    const distance=Math.hypot(...offset),side=offset[0]*door.n[0]+offset[1]*door.n[1];
    const normal=direction[0]*door.n[0]+direction[1]*door.n[1];
    if(distance>range||side*normal>=0||Math.abs(normal)<1e-8)continue;
    const time=-side/normal;
    const across=(offset[0]+direction[0]*time)*door.u[0]+(offset[1]+direction[1]*time)*door.u[1];
    if(Math.abs(across)>door.clearHalf)continue;
    const sign=Math.sign(normal),aim=[door.x+door.u[0]*across+door.n[0]*sign*door.beyond,
     door.y+door.u[1]*across+door.n[1]*sign*door.beyond];
    if(!lineFree(position,aim))continue;
    candidates.push({door,distance});
   }
   candidates.sort((a,b)=>a.distance-b.distance);
   const candidate=candidates[0]?.door;
   if(!candidate)return null;
   if(!canMoveDoor(candidate.name,position))return {blocked:candidate.name};
   opened.add(candidate.name);
   return {opened:candidate.name};
  }
 };
}
