const TAU=Math.PI*2;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const angleDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const heading=(x,y)=>Math.atan2(-x,y);
function segmentDistance(p,a,b){
 const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
 const t=length?clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length,0,1):0;
 return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function inside(point,loop){
 let result=false;
 for(let i=0,j=loop.length-1;i<loop.length;j=i++){
  const a=loop[i],b=loop[j];
  if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])result=!result;
 }
 return result;
}
function polygon(loops){
 const vertices=loops.flat();
 return {loops,minX:Math.min(...vertices.map(p=>p[0])),maxX:Math.max(...vertices.map(p=>p[0])),
  minY:Math.min(...vertices.map(p=>p[1])),maxY:Math.max(...vertices.map(p=>p[1]))};
}
function rectangle(x,y,width,depth,angle=0){
 const c=Math.cos(angle),s=Math.sin(angle);
 return polygon([[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>
  [x+c*u*width/2-s*v*depth/2,y+s*u*width/2+c*v*depth/2])]);
}
function intersects(point,shape,radius){
 if(point[0]<shape.minX-radius||point[0]>shape.maxX+radius||point[1]<shape.minY-radius||point[1]>shape.maxY+radius)return false;
 let filled=false;
 for(const loop of shape.loops){
  if(inside(point,loop))filled=!filled;
  for(let i=0;i<loop.length;i++)if(segmentDistance(point,loop[i],loop[(i+1)%loop.length])<radius)return true;
 }
 return filled;
}
function doorGeometry(door,progress){
 const a=door.angle_degrees*Math.PI/180,s=door.hinge==='start'?-1:1,u=[Math.cos(a),Math.sin(a)];
 const n=[-u[1],u[0]];
 const hinge=[door.x+s*(door.width/2-door.frame_width)*u[0]+door.leaf.normal_offset*n[0],door.y+s*(door.width/2-door.frame_width)*u[1]+door.leaf.normal_offset*n[1]];
 const start=Math.atan2(-s*u[1],-s*u[0]),end=Math.atan2(door.opens_to[1],door.opens_to[0]);
 const angle=start+angleDifference(end,start)*clamp(progress,0,1),length=door.leaf.width;
 return {hinge,start,end,length,tip:[hinge[0]+Math.cos(angle)*length,hinge[1]+Math.sin(angle)*length]};
}
function doorSweep(door){
 const d=doorGeometry(door,0),arc=[d.hinge];
 for(let i=0;i<=20;i++){const a=d.start+angleDifference(d.end,d.start)*i/20;arc.push([d.hinge[0]+Math.cos(a)*d.length,d.hinge[1]+Math.sin(a)*d.length])}
 return polygon([arc]);
}

export function entryApproach(model){
 const {ground_elevation:grade,floor_elevation:floor}=model.dimensions,settings=model.navigation;
 const entrance=model.doorways.find(door=>door.name.startsWith('D_'));
 if(!entrance||entrance.angle_degrees!==0)throw new Error('Walk entry requires the scheduled front D doorway.');
 const opening=model.plan.openings.find(item=>item.name===entrance.name);
 const steps=Math.ceil((floor-grade)/settings.maximum_step_rise),run=steps*settings.step_depth,offset=Math.max(settings.entry_offset,run+1);
 return {x:entrance.x,y:-offset,width:entrance.width+2.25,run,steps,minY:-offset-1,door:entrance.name,thresholdY:entrance.y+opening.wall_thickness/2,aimHeight:floor+entrance.height/2,doorY:entrance.y};
}

export function createWalkMap(model,furniture=[],doorProgress=()=>1,furnitureVisible=()=>true){
 const radius=.55,step=.4,width=model.dimensions.width,depth=model.dimensions.depth;
 const {ground_elevation:grade,floor_elevation:floor}=model.dimensions,entry=entryApproach(model);
 const walls=model.plan.wall_faces.map(face=>polygon(face.loops)),obstacles=[...walls];
 for(const item of model.plan.openings){
  const angle=item.angle_degrees*Math.PI/180;
  if(item.kind!=='door')obstacles.push(rectangle(item.x,item.y,item.width,item.wall_thickness,angle));
  else for(const sign of [-1,1])obstacles.push(rectangle(
   item.x+Math.cos(angle)*sign*(item.width/2-item.frame_width/2),item.y+Math.sin(angle)*sign*(item.width/2-item.frame_width/2),item.frame_width,item.wall_thickness,angle));
 }
 const furnitureShapes=furniture.map(box=>rectangle((box.minX+box.maxX)/2,(box.minY+box.maxY)/2,box.maxX-box.minX,box.maxY-box.minY));
 const doors=model.doorways,portals=[...doors,...model.passages],sweeps=new Map(doors.map(door=>[door.name,doorSweep(door)]));
 function staticFree(point){
  const onFloor=point[0]>=radius&&point[0]<=width-radius&&point[1]>=radius&&point[1]<=depth-radius;
  const onApproach=Math.abs(point[0]-entry.x)<=entry.width/2-radius&&point[1]>=entry.minY+radius&&point[1]<=radius;
  return (onFloor||onApproach)&&
   !obstacles.some(shape=>intersects(point,shape,radius));
 }
 function doorFree(point){
  return !doors.some(door=>{
   const progress=doorProgress(door.name);
   if(progress>.02&&progress<.98)return intersects(point,sweeps.get(door.name),radius+.08);
   const shape=doorGeometry(door,progress);
   return segmentDistance(point,shape.hinge,shape.tip)<radius+door.leaf.thickness/2;
  });
 }
 const furnitureClear=point=>!furnitureShapes.some(shape=>intersects(point,shape,radius));
 const isFree=point=>staticFree(point)&&(!furnitureVisible()||furnitureClear(point))&&doorFree(point);
 function lineFree(from,to){
  const steps=Math.max(1,Math.ceil(distance(from,to)/.15));
  for(let i=0;i<=steps;i++)if(!isFree([from[0]+(to[0]-from[0])*i/steps,from[1]+(to[1]-from[1])*i/steps]))return false;
  return true;
 }
 function move(from,delta){
  const result=[...from],steps=Math.max(1,Math.ceil(Math.hypot(...delta)/.15));
  for(let i=0;i<steps;i++){
   const dx=delta[0]/steps,dy=delta[1]/steps,next=[result[0]+dx,result[1]+dy];
   if(isFree(next)){result[0]=next[0];result[1]=next[1]}
   else{
    if(isFree([result[0]+dx,result[1]]))result[0]+=dx;
    if(isFree([result[0],result[1]+dy]))result[1]+=dy;
   }
  }
  return result;
 }
 const columns=Math.ceil(width/step),rows=Math.ceil((depth-entry.minY)/step),count=columns*rows;
 const point=id=>[(id%columns+.5)*step,entry.minY+(Math.floor(id/columns)+.5)*step];
 const staticGrid=Uint8Array.from({length:count},(_,id)=>Number(staticFree(point(id))));
 function allowedGrid(){return Uint8Array.from(staticGrid,(free,id)=>Number(free&&(!furnitureVisible()||furnitureClear(point(id)))&&doorFree(point(id))))}
 function roomContains(name,p){
  const room=model.rooms.find(r=>r.name===name);
  return room&&p[0]>room.x&&p[0]<room.x+room.width&&p[1]>room.y&&p[1]<room.y+room.depth;
 }
 function closest(preferred,allowed,predicate=()=>true,visibleFrom=null){
  let best=-1,bestDistance=Infinity;
  for(let id=0;id<count;id++){
   if(!allowed[id])continue;
   const p=point(id),d=distance(p,preferred);
   if(d<bestDistance&&predicate(p)&&(!visibleFrom||lineFree(visibleFrom,p))){best=id;bestDistance=d}
  }
  return best;
 }
 function nearest(preferred,room){
  const id=closest(preferred,allowedGrid(),p=>!room||roomContains(room,p));
  return id<0?null:point(id);
 }
 function search(from,allowed,start,goals,target=null){
  if(start<0||!goals.size)return null;
  const costs=new Float64Array(count).fill(Infinity),parent=new Int32Array(count).fill(-1),closed=new Uint8Array(count),heap=[];
  const score=id=>costs[id]+(target?distance(point(id),target):0);
  function push(id){
   const entry={id,score:score(id)};heap.push(entry);let i=heap.length-1;
   while(i){const p=(i-1)>>1;if(heap[p].score<=entry.score)break;heap[i]=heap[p];i=p}heap[i]=entry;
  }
  function pop(){
   const first=heap[0],last=heap.pop();if(!heap.length)return first.id;
   let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].score<heap[child].score)child++;if(heap[child].score>=last.score)break;heap[i]=heap[child];i=child}heap[i]=last;return first.id;
  }
  let goal=-1;costs[start]=0;push(start);
  while(heap.length){
   const current=pop();if(closed[current])continue;closed[current]=1;
   if(goals.has(current)){goal=current;break}
   const x=current%columns,y=Math.floor(current/columns);
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
    const nx=x+dx,ny=y+dy;if(nx<0||nx>=columns||ny<0||ny>=rows)continue;
    const next=ny*columns+nx;
    if(!allowed[next]||closed[next]||dx&&dy&&(!allowed[y*columns+nx]||!allowed[ny*columns+x]))continue;
    const cost=costs[current]+Math.hypot(dx,dy)*step;
    if(cost>=costs[next]||!lineFree(point(current),point(next)))continue;
    costs[next]=cost;parent[next]=current;push(next);
   }
  }
  if(goal<0)return null;
  const path=[];for(let id=goal;id!==-1;id=parent[id])path.push(point(id));path.reverse();path.unshift([...from]);
  const smooth=[path[0]];let i=0;
  while(i<path.length-1){let next=path.length-1;while(next>i+1&&!lineFree(path[i],path[next]))next--;smooth.push(path[next]);i=next}
  return {path:smooth,goal};
 }
 function route(from,preferred,room){
  const allowed=allowedGrid(),start=closest(from,allowed,()=>true,from),goal=closest(preferred,allowed,p=>roomContains(room,p));
  if(goal<0)return null;
  return search(from,allowed,start,new Set([goal]),point(goal))?.path||null;
 }
 function closestRoom(from,excluded=[]){
  const allowed=allowedGrid(),start=closest(from,allowed,()=>true,from),goals=new Map(),skip=new Set(excluded);
  for(const room of model.rooms){
   if(skip.has(room.name))continue;
   const goal=closest([room.x+room.width/2,room.y+room.depth/2],allowed,p=>roomContains(room.name,p));
   if(goal>=0)goals.set(goal,room.name);
  }
  const found=search(from,allowed,start,new Set(goals.keys()));
  return found?{room:goals.get(found.goal),path:found.path}:null;
 }
 function canClose(point){
  return !doors.some(door=>{
   return intersects(point,sweeps.get(door.name),radius+.08);
  });
 }
 function snapHeading(position,bearing){
  let best=null,bestDistance=3.1;
  for(const portal of portals){
   const d=distance(position,[portal.x,portal.y]);if(d>.2&&d<bestDistance){
    const a=portal.angle_degrees*Math.PI/180,n=[-Math.sin(a),Math.cos(a)];
    const side=(position[0]-portal.x)*n[0]+(position[1]-portal.y)*n[1],sign=side>0?-1:1;
    const aim=[portal.x+n[0]*sign*.8,portal.y+n[1]*sign*.8],angle=heading(aim[0]-position[0],aim[1]-position[1]);
    if(Math.abs(angleDifference(angle,bearing))<.55&&lineFree(position,aim)){best=angle;bestDistance=d}
   }
  }
  if(best===null&&model.rooms.some(room=>roomContains(room.name,position))){
   const cardinal=Math.round(bearing/(Math.PI/2))*Math.PI/2;
   if(Math.abs(angleDifference(cardinal,bearing))<.18&&lineFree(position,[position[0]-Math.sin(cardinal),position[1]+Math.cos(cardinal)]))return cardinal;
  }
  return best;
 }
 function floorHeight(p){
  if(p[1]>=0)return model.dimensions.floor_elevation;
  const tread=entry.run/entry.steps,index=clamp(Math.floor((p[1]+entry.run)/tread)+1,0,entry.steps);
  return grade+(floor-grade)*index/entry.steps;
 }
 return {radius,entry,floorHeight,isFree,lineFree,move,nearest,route,closestRoom,canClose,snapHeading,furnitureClear,
  roomAt:p=>p[1]<0?'Outside / illustrative approach':model.rooms.find(r=>roomContains(r.name,p))?.name||'Circulation'};
}

export class WalkController{
 constructor(map){this.map=map;this.position=[0,0];this.velocity=[0,0];this.bearing=0;this.targetBearing=0;this.tilt=0;this.targetTilt=0;this.path=[];this.room=null;this.overrideUntil=0;this.time=0;this.arrived=false;this.stalled=0}
 place(position,bearing,tilt){this.position=[...position];this.velocity=[0,0];this.bearing=this.targetBearing=bearing;this.tilt=this.targetTilt=tilt;this.path=[]}
 goTo(preferred,room,aim){
  const path=this.map.route(this.position,preferred,room);
  if(!path)return false;
  this.followRoute(path,room,aim);return true;
 }
 followRoute(path,room,aim){
  this.path=path.slice(1);this.room=room;this.aim=aim;this.arrived=false;this.stalled=0;return true;
 }

 cancel(){this.path=[];this.room=null}
 look(dx,dy){this.cancel();this.targetBearing-=dx*.004;this.targetTilt=clamp(this.targetTilt-dy*.004,-1.3,1.3);this.overrideUntil=this.time+1.4}
 update(dt,{forward=0,strafe=0,slow=false,looking=false,reducedMotion=false}={}){
  dt=clamp(dt,0,.05);this.time+=dt;this.arrived=false;let blocked=false;
  const manual=forward!==0||strafe!==0;if(manual)this.cancel();
  let desired=[0,0],speed=slow?1.45:reducedMotion?2.45:3.5;
  if(this.position[1]<0&&this.position[1]>-this.map.entry.run-.5)speed*=.65;
  if(this.path.length){
   while(this.path.length&&distance(this.position,this.path[0])<.22&&
    (this.path.length===1||this.map.lineFree(this.position,this.path[1])))this.path.shift();
   if(this.path.length){
    const target=this.path[0],dx=target[0]-this.position[0],dy=target[1]-this.position[1],length=Math.hypot(dx,dy);
    this.targetBearing=heading(dx,dy);this.targetTilt=-.04;
    speed=Math.min(speed,Math.max(.35,length*3));
    desired=[dx/length*speed,dy/length*speed];
   }else{
    this.arrived=true;this.room=null;
    if(this.aim){this.targetBearing=heading(this.aim[0]-this.position[0],this.aim[1]-this.position[1]);this.targetTilt=this.aim[2]??-.1}
   }
  }
  if(manual){
   if(forward>0&&!strafe&&!looking&&this.time>this.overrideUntil){
    const snap=this.map.snapHeading(this.position,this.targetBearing);if(snap!==null)this.targetBearing=snap;
   }
   const magnitude=Math.max(1,Math.hypot(forward,strafe));
   desired=[(-Math.sin(this.bearing)*forward+Math.cos(this.bearing)*strafe)*speed/magnitude,
    (Math.cos(this.bearing)*forward+Math.sin(this.bearing)*strafe)*speed/magnitude];
  }
  const rate=manual||this.path.length?7:11,decay=reducedMotion?0:Math.exp(-rate*dt),delta=[0,0];
  for(let i=0;i<2;i++){
   delta[i]=reducedMotion?desired[i]*dt:desired[i]*dt+(this.velocity[i]-desired[i])*(1-decay)/rate;
   this.velocity[i]=desired[i]+(this.velocity[i]-desired[i])*decay;
  }
  const previous=this.position,moved=this.map.move(previous,delta);this.position=moved;
  for(let i=0;i<2;i++)if(Math.abs(moved[i]-previous[i])<Math.abs(delta[i])*.1)this.velocity[i]=0;
  this.stalled=this.path.length&&distance(previous,moved)<.001?this.stalled+dt:0;
  if(this.stalled>1.2){this.cancel();this.velocity=[0,0];blocked=true}
  const turn=reducedMotion?1:1-Math.exp(-(looking?20:8)*dt);
  this.bearing+=angleDifference(this.targetBearing,this.bearing)*turn;this.bearing=((this.bearing+Math.PI)%TAU+TAU)%TAU-Math.PI;
  this.targetBearing=this.bearing+angleDifference(this.targetBearing,this.bearing);
  this.tilt+=(this.targetTilt-this.tilt)*turn;
  return {position:this.position,bearing:this.bearing,tilt:this.tilt,travelling:this.path.length>0,arrived:this.arrived,blocked};
 }
}

export class FlyController{
 constructor(){this.position=[0,0,0];this.velocity=[0,0,0];this.bearing=0;this.targetBearing=0;this.tilt=0;this.targetTilt=0}
 place(position,bearing,tilt){this.position=[...position];this.velocity=[0,0,0];this.bearing=this.targetBearing=bearing;this.tilt=this.targetTilt=tilt}
 look(dx,dy){this.targetBearing-=dx*.004;this.targetTilt=clamp(this.targetTilt-dy*.004,-1.3,1.3)}
 update(dt,{forward=0,strafe=0,vertical=0,slow=false,looking=false,reducedMotion=false}={}){
  dt=clamp(dt,0,.05);
  const speed=slow?2.8:reducedMotion?5:7,c=Math.cos(this.tilt);
  const vector=[-Math.sin(this.bearing)*c*forward+Math.cos(this.bearing)*strafe,
   Math.cos(this.bearing)*c*forward+Math.sin(this.bearing)*strafe,Math.sin(this.tilt)*forward+vertical];
  const magnitude=Math.max(1,Math.hypot(...vector)),rate=forward||strafe||vertical?7:11,decay=reducedMotion?0:Math.exp(-rate*dt);
  for(let i=0;i<3;i++){
   const desired=vector[i]*speed/magnitude;
   this.position[i]+=reducedMotion?desired*dt:desired*dt+(this.velocity[i]-desired)*(1-decay)/rate;
   this.velocity[i]=desired+(this.velocity[i]-desired)*decay;
  }
  const turn=reducedMotion?1:1-Math.exp(-(looking?20:8)*dt);
  this.bearing+=angleDifference(this.targetBearing,this.bearing)*turn;
  this.bearing=((this.bearing+Math.PI)%TAU+TAU)%TAU-Math.PI;
  this.targetBearing=this.bearing+angleDifference(this.targetBearing,this.bearing);
  this.tilt+=(this.targetTilt-this.tilt)*turn;
  return {position:this.position,bearing:this.bearing,tilt:this.tilt};
 }
}
