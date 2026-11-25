import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from './vendor/RoomEnvironment.js';
import {createFurnishings,furnishingBounds,FT,point} from './furnishings.js';
import {createWalkMap,WalkController,FlyController,walkEyeHeight} from './walk-navigation.js';
import {createWallSections,nativeFrameProfile,createBoxSection} from './wall-sections.js';
import {createSite} from './site.js';
import {createGroundDirections} from './ground-directions.js';
import {createLampControls} from './lamp-controls.js';
import {doorLeaves,doorPresentation} from './door-presentation.js';
import {createDoorHardware} from './door-hardware.js';
import {metricSurfaceUV} from './furniture-surfaces.js';
import {createWalkerAvatar,setWalkerCameraLayers} from './walker-avatar.js';
import {createSceneMirrors} from './scene-mirrors.js';
import {createStructuralConcept} from './structural-concept.js';

const model=window.HOME_MODEL,stage=document.getElementById('viewport'),status=document.getElementById('status');
const grade=model.dimensions.ground_elevation,eyeHeight=walkEyeHeight(model.navigation);
try{
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
 renderer.info.autoReset=false;
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));renderer.shadowMap.enabled=true;
 renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;
 renderer.toneMappingExposure=1.15;stage.prepend(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#dce4e1');scene.fog=new THREE.Fog('#dce4e1',35,95);
 const camera=new THREE.PerspectiveCamera(48,1,.04,150);
 const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.dampingFactor=.075;
 orbit.touches.ONE=THREE.TOUCH.ROTATE;orbit.touches.TWO=THREE.TOUCH.DOLLY_PAN;
 renderer.domElement.setAttribute('aria-label','3D home. Drag to orbit; pinch to zoom; use two fingers to pan.');
 renderer.domElement.tabIndex=0;
 orbit.minDistance=.5;orbit.maxDistance=65;orbit.maxPolarAngle=Math.PI/2-.035;
 const hemi=new THREE.HemisphereLight('#f0f7ff','#b8a78d',2.2);scene.add(hemi);
 const sun=new THREE.DirectionalLight('#fff0d6',3.3);sun.position.copy(point(-15,-22,65));sun.castShadow=true;
 sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-18;sun.shadow.camera.right=18;sun.shadow.camera.top=18;sun.shadow.camera.bottom=-18;
 sun.shadow.camera.near=.5;sun.shadow.camera.far=60;sun.shadow.bias=-.0002;sun.shadow.normalBias=.018;
 sun.target.position.copy(point(20,15,0));scene.add(sun,sun.target);
 const makeMat=(color,roughness=.7)=>new THREE.MeshStandardMaterial({color,roughness});
 function texture(kind){
  const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');
  x.fillStyle=kind==='roof'?'#9d573f':kind==='stone'?'#b4ad99':'#d9d4c7';x.fillRect(0,0,256,256);
  let seed=381;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  for(let i=0;i<3500;i++){const a=random();x.fillStyle=`rgba(${a>.5?'255,255,255':'35,26,17'},${random()*.08})`;x.fillRect(random()*256,random()*256,1+random()*3,1+random()*3)}
  x.strokeStyle=kind==='roof'?'#613d2d88':'#968e7c55';x.lineWidth=kind==='roof'?3:1.5;
  const step=kind==='roof'?32:128;
  for(let i=0;i<=256;i+=step){x.beginPath();x.moveTo(i,0);x.lineTo(i,256);x.stroke();x.beginPath();x.moveTo(0,i);x.lineTo(256,i);x.stroke()}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=renderer.capabilities.getMaxAnisotropy();return t;
 }
 const wall=makeMat('#eee9dd',.88),floor=makeMat('#e4dfd1',.5),roofMat=makeMat('#c38565',.84),stone=makeMat('#d4cbb8',.95),plinthMat=makeMat(model.finishes.base,.92);
 wall.flatShading=true;
 plinthMat.flatShading=true;
 floor.map=texture('floor');roofMat.map=texture('roof');stone.map=texture('stone');
 const roofGroup=new THREE.Group(),structure=new THREE.Group();scene.add(structure,roofGroup);
 const clip=new THREE.Plane(new THREE.Vector3(0,-1,0),(model.dimensions.floor_elevation+model.plan.cut_height)*FT);
 const wallSections=createWallSections(model);scene.add(wallSections);
 renderer.localClippingEnabled=true;
 const clipMaterials=new Set([wall]);
 for(const ob of model.objects){
  if(ob.group==='Openings')continue;
  const positions=[],uv=[];
  for(const v of ob.vertices){positions.push(v[0]*FT,v[2]*FT,-v[1]*FT);uv.push(v[0]/3,(ob.group==='Walls'?v[2]:v[1])/3)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ob.triangles.flat());g.computeVertexNormals();
  let mat=ob.group==='Walls'?wall:ob.group==='Roof'?roofMat:ob.name.includes('Plinth')?plinthMat:floor;
  if(ob.name==='Ground Floor Slab'){
   mat=[floor,plinthMat];
   ob.triangles.forEach((tri,index)=>{
    const z=tri.map(i=>ob.vertices[i][2]);
    g.addGroup(index*3,3,Math.max(...z)-Math.min(...z)>1e-6?1:0);
   });
  }
  if(ob.name.includes('Monitor Corner')||ob.name.includes('Monitor Timber Louvers'))mat=makeMat('#6d5038');
  if(ob.name.includes('Monitor Recessed Grille'))mat=new THREE.MeshStandardMaterial({color:'#39423e',roughness:.5,metalness:.65});
  const mesh=new THREE.Mesh(g,mat);mesh.name=ob.name;mesh.castShadow=true;mesh.receiveShadow=true;
  (ob.group==='Roof'?roofGroup:structure).add(mesh);
 }
 const structuralConcept=createStructuralConcept(model);scene.add(structuralConcept.root);
 const furnishing=createFurnishings(model);scene.add(furnishing.root);
 const environment=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);
 const furnitureEnvironment=pmrem.fromScene(environment,.04);
 furnishing.environmentTarget=furnitureEnvironment;
 environment.dispose();pmrem.dispose();
 for(const mat of Object.values(furnishing.materials)){
  mat.envMap=furnitureEnvironment.texture;mat.envMapIntensity=mat.metalness>.5?.85:.25;
  for(const map of [mat.map,mat.bumpMap,mat.roughnessMap])
   if(map)map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
 }
 const frameMat=makeMat('#394b42',.45),wood=furnishing.materials.wood.clone();wood.color.set('#946747');
 const handle=new THREE.MeshStandardMaterial({color:'#b8a078',roughness:.25,metalness:.8});
 handle.envMap=furnitureEnvironment.texture;handle.envMapIntensity=.85;
 const glass=new THREE.MeshPhysicalMaterial({color:'#d6e8ed',transparent:true,opacity:.18,roughness:.06,metalness:.05,depthWrite:false,side:THREE.DoubleSide});
 for(const mat of [frameMat,wood,handle,glass])clipMaterials.add(mat);
 const woodEdge=makeMat('#745038',.7),woodCap=makeMat('#745038',.9),frameCap=makeMat('#394b42',.9),glassCap=glass.clone();
 clipMaterials.add(woodEdge);
 const leafMaterials=[woodEdge,woodEdge,woodEdge,woodEdge,wood,wood],doors=[],openingCaps=[];
 function localBox(g,w,h,d,x,y,z,mat){
  const geometry=new THREE.BoxGeometry(w*FT,h*FT,d*FT);
  if(mat===wood||Array.isArray(mat))metricSurfaceUV(geometry);
  const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x*FT,y*FT,z*FT);mesh.castShadow=mat!==glass;mesh.receiveShadow=true;g.add(mesh);
  const height=clip.constant-g.getWorldPosition(new THREE.Vector3()).y;
  const cap=createBoxSection(mesh,height,mat===glass?glassCap:mat===frameMat?frameCap:woodCap);
  if(cap){g.add(cap);openingCaps.push(cap)}
  return mesh;
 }
 for(const item of model.plan.openings){
  const group=new THREE.Group();group.position.copy(point(item.x,item.y,model.dimensions.floor_elevation+item.sill));group.rotation.y=item.angle_degrees*Math.PI/180;
  structure.add(group);const w=item.width,h=item.height,t=item.frame_width,{depth:d,normalOffset}=nativeFrameProfile(model,item);
  const fm=item.kind==='door'?wood:frameMat;
  for(const side of [-1,1])localBox(group,t,h,d,side*(w-t)/2,h/2,-normalOffset,fm);
  localBox(group,w,t,d,0,h-t/2,-normalOffset,fm);
  if(item.kind==='door'){
   const assumption=model.doorways.find(x=>x.name===item.name);
   for(const member of doorLeaves(assumption)){
   const fit=doorPresentation(member),{sign}=fit;
   const pivot=new THREE.Group();pivot.name=item.name+' hinge'+(assumption.leaves?' '+member.hinge:'');pivot.position.set(fit.pivotX*FT,0,fit.pivotZ*FT);group.add(pivot);
   const lw=fit.width,lh=fit.height;
   const panel=localBox(pivot,lw,lh,fit.thickness,-sign*lw/2,fit.bottom+lh/2,fit.centerZ,leafMaterials);panel.name=item.name+' solid leaf';
   pivot.add(createDoorHardware(fit,handle,frameMat));
   if(item.mark==='D')for(let i=0;i<3;i++)localBox(pivot,.018,lh-.4,.014,-sign*(.3+i*(lw-.6)/2),fit.bottom+lh/2,fit.centerZ+fit.thickness/2+.007,frameMat);
   doors.push({pivot,angle:fit.angle,name:item.name});
   }
  }else{
   localBox(group,w,t,d,0,t/2,-normalOffset,fm);
   localBox(group,w-2*t,h-2*t,.025,0,h/2,-normalOffset,glass);
   if(w>3.5)localBox(group,.075,h-2*t,d*.75,0,h/2,-normalOffset,fm);
   if(item.kind==='vent')for(let i=1;i<=4;i++){const slat=localBox(group,w-.15,.055,.18,0,i*h/5,-normalOffset,fm);slat.rotation.x=.4}
  }
 }
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(150,150),makeMat('#b4bda8',.95));ground.rotation.x=-Math.PI/2;ground.position.y=grade*FT;ground.receiveShadow=true;scene.add(ground);
 // Keep flush lawn/path surfaces visible without changing the shared ground datum.
 Object.assign(ground.material,{polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
 // Surface finishes are visualization-only layers, not a second architectural layout.
 for(const r of model.rooms){
  const mat=makeMat(r.name.startsWith('Bedroom')?'#bca182':r.name.includes('bath')||r.name.includes('Bath')||r.name==='WC'?'#bcc5bd':'#dfdacd',.72);
  mat.map=floor.map;
  const finish=new THREE.Mesh(new THREE.PlaneGeometry((r.width-.04)*FT,(r.depth-.04)*FT),mat);
  const uv=finish.geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*r.width/4,uv.getY(i)*r.depth/4);
  finish.rotation.x=-Math.PI/2;finish.position.copy(point(r.x+r.width/2,r.y+r.depth/2,model.dimensions.floor_elevation+.018));finish.receiveShadow=true;structure.add(finish);
 }
 const walkObstacles=[];furnishing.root.updateMatrixWorld(true);
 for(const item of furnishing.items)if(!item.soft)item.group.traverse(mesh=>{
  if(!mesh.isMesh)return;
  for(const box of furnishingBounds(mesh)){
  const floor=model.dimensions.floor_elevation;
  if(box.max.y/FT<=floor+.18||box.min.y/FT>=floor+eyeHeight+.25)continue;
  walkObstacles.push({minX:box.min.x/FT,maxX:box.max.x/FT,minY:-box.max.z/FT,maxY:-box.min.z/FT});
  }
 });
 const progress=name=>{const leaves=doors.filter(d=>d.name===name);return leaves.length?Math.min(...leaves.map(d=>Math.abs(d.pivot.rotation.y/d.angle))):0};
 const walkMap=createWalkMap(model,walkObstacles,progress,()=>furnishing.root.visible),walker=new WalkController(walkMap);
 const avatar=createWalkerAvatar(model.navigation,furnishing.materials.upholstery);scene.add(avatar.root);
 const initialAvatar=walkMap.nearest([walkMap.entry.x,walkMap.entry.thresholdY+3]);
 if(!initialAvatar)throw new Error('No floor-supported initial walker position exists.');
 avatar.place(initialAvatar,walkMap.floorHeight(initialAvatar),0);
 const mirrors=createSceneMirrors(furnishing,{mobile:matchMedia('(max-width:640px)').matches});
 // View-only approach explains the raised entry; it is not an architectural access design.
 const approach=new THREE.Group(),entry=walkMap.entry;approach.name='Illustrative approach - not a designed stair';
 const rise=(model.dimensions.floor_elevation-grade)/entry.steps;
 for(let i=0;i<entry.steps;i++){
  const depth=entry.run*(entry.steps-i)/entry.steps;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(entry.width*FT,rise*FT,depth*FT),stone);
  mesh.position.copy(point(entry.x,-depth/2,grade+(i+.5)*rise));mesh.castShadow=true;mesh.receiveShadow=true;approach.add(mesh);
 }
 approach.userData.illustrativeOnly=true;scene.add(approach);
 const site=createSite(model);scene.add(site.root);
 const directions=createGroundDirections(model,site.root.userData.site);scene.add(directions.root);
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
 const flight=new FlyController(),preferences={exterior:{roof:true}};
 let mode='exterior',doorsOpen=false,walk=false,lastTime=0,lookPointer=null,lastLook=[0,0],fitScale=1;
 let navigation='walk',lastSafe=[entry.x,entry.y],furniturePreference=true,pendingRequest=null,destination=null,requestedHistoryIndex=null;
 let history=[],historyIndex=-1,nextExhausted=false,noticeMessage='',noticeUntil=0,pausedRequest=null;
 const visited=new Set(),roomNames=new Set(model.rooms.map(room=>room.name));
 const keys=new Set(),touchKeys=new Set(),touchPointers=new Map();
 const lampControls=createLampControls({scene,camera,canvas:renderer.domElement,furnishing,
  enabled:()=>mode!=='plan'&&furnishing.root.visible,
  canTap:()=>!keys.size&&!touchPointers.size&&!pendingRequest&&!walker.path.length});
 const planFrame=document.getElementById('plan'),walkControls=document.getElementById('walk-controls'),dock=document.getElementById('walk-dock');
 const structureNote=document.getElementById('structure-note'),structureControls=document.getElementById('structure-controls');
 const levels=structuralConcept.root.userData.levels,signed=n=>(n>=0?'+':'')+n;
 document.getElementById('structure-levels').textContent=`Local datum: grade ${signed(levels.grade)} ft / FFL ${signed(levels.floor)} ft / wall top ${signed(levels.wallTop)} ft`;
 const example=structuralConcept.root.userData.exampleSectionsMM;
 document.getElementById('structure-sizes').textContent=`EXAMPLE/UNVERIFIED: column ${example.column.join(' x ')} / beam ${example.beam.join(' x ')} mm. Native walls ${structuralConcept.context.userData.nominalWallInches.join(' / ')} in.`;
 document.getElementById('structure-clash-summary').textContent=`${structuralConcept.openingClashes.length} opening clashes (orange boxes).`;
 document.getElementById('structure-context').onclick=event=>{
  const visible=!structuralConcept.context.visible;structuralConcept.setContext(visible);event.currentTarget.setAttribute('aria-pressed',String(visible));
 };
 document.getElementById('structure-roof').onclick=event=>{
  const visible=!structuralConcept.roof.visible;structuralConcept.setRoof(visible);event.currentTarget.setAttribute('aria-pressed',String(visible));
 };
 const notice=document.getElementById('walk-notice'),location=document.getElementById('walk-location');
 const enterButton=document.getElementById('enter-home'),playButton=document.getElementById('play-walk');
 const previousButton=document.getElementById('previous-room'),nextButton=document.getElementById('next-room');
 const friendly=name=>name.replace('Bedroom_front_right','Front bedroom').replace('Bedroom_rear_left','Rear-left bedroom').replace('Bedroom_rear_right','Rear-right bedroom').replace('Dining_central_zone','Dining').replace('Bath_right','Right bath').replaceAll('_',' ');
 const activePosition=()=>navigation==='fly'?flight.position:walker.position;
 const insideHome=()=>{const p=activePosition();return p[0]>0&&p[0]<model.dimensions.width&&p[1]>=entry.thresholdY&&p[1]<model.dimensions.depth};
 function recordRoom(name,index=null){
  if(!roomNames.has(name))return;
  if(index!==null)historyIndex=index;
  else if(history[historyIndex]!==name){history=history.slice(0,historyIndex+1);history.push(name);historyIndex=history.length-1}
  visited.add(name);
 }
 function updateDock(){
  dock.hidden=!walk;if(!walk)return;
  const flying=navigation==='fly',active=!!pendingRequest||walker.path.length>0,inside=insideHome();
  const room=walkMap.roomAt(activePosition());
  if(!flying&&inside&&!active&&!destination&&!pausedRequest)recordRoom(room);
  let label=inside?friendly(room):'Front entrance';
  if(flying&&flight.position[2]>model.dimensions.overall_height)label='Above home';
  if(flying&&flight.position[2]<model.dimensions.floor_elevation)label='Below floor';
  if(location.textContent!==label)location.textContent=label;location.title=label;
  const message=performance.now()<noticeUntil?noticeMessage:flying?'Fly: collisions off. R / F moves vertically.':pendingRequest?'Opening doors before walking...':pausedRequest?'Paused. Play resumes room navigation.':destination?(active?'Walking to ':'Paused: ')+friendly(destination):inside?'Next visits the closest unvisited room.':'Illustrative approach. Enter home to begin.';
  if(notice.textContent!==message)notice.textContent=message;
  notice.title=message;
  enterButton.hidden=flying||inside||active||!!destination||!!pausedRequest;
  document.getElementById('room-carousel').hidden=flying||!inside&&!active&&!destination&&!pausedRequest;
  document.getElementById('fly-actions').hidden=!flying;
  for(const id of ['move-rise','move-lower'])document.getElementById(id).hidden=!flying;
  for(const value of ['walk','fly']){
   const button=document.getElementById(value+'-mode'),selected=navigation===value;
   button.setAttribute('aria-checked',String(selected));button.tabIndex=selected?0:-1;
  }
  previousButton.disabled=!(historyIndex>0||active&&historyIndex>=0||destination&&historyIndex>=0);
  nextButton.disabled=active||nextExhausted&&historyIndex>=history.length-1;
  playButton.disabled=!active&&!destination&&!pausedRequest;playButton.setAttribute('aria-pressed',String(active));
  playButton.setAttribute('aria-label',active?'Pause walking':pausedRequest?'Resume room navigation':destination?'Resume walking to '+friendly(destination):'No route selected');
 }
 function announce(message){noticeMessage=message;noticeUntil=performance.now()+5000;updateDock()}
 function stopTravel(keepDestination=false){pendingRequest=null;walker.cancel();if(!keepDestination){destination=null;pausedRequest=null;requestedHistoryIndex=null}noticeUntil=0}
 function clearMovement(){keys.clear();touchKeys.clear();touchPointers.clear();lookPointer=null;for(const button of walkControls.querySelectorAll('button'))button.setAttribute('aria-pressed','false')}
 function fitViewport(){
  if(walk||mode==='plan')return;
  const scale=Math.max(1,1.05/camera.aspect);
  camera.position.sub(orbit.target).multiplyScalar(scale/fitScale).add(orbit.target);fitScale=scale;
 }
 function setRoof(visible){roofGroup.visible=visible;document.getElementById('roof').setAttribute('aria-pressed',String(visible));if(!walk&&preferences[mode])preferences[mode].roof=visible}
 function setDoors(open){
  if(mode==='exterior'||mode==='cutaway')open=true;
  if(walk&&navigation==='walk'&&open!==doorsOpen&&!walkMap.canClose(walker.position)){announce('Move clear of the door swing before changing the doors.');return false}
  if(!open){stopTravel();walker.velocity=[0,0]}
  doorsOpen=open;return true;
 }
 function setFurniture(visible){furnishing.root.visible=visible;lampControls.sync();document.getElementById('furniture').setAttribute('aria-pressed',String(visible));if(!walk&&mode!=='structure')furniturePreference=visible}
 function clipping(enabled){wallSections.visible=enabled;for(const cap of openingCaps)cap.visible=enabled;for(const m of clipMaterials){m.clippingPlanes=enabled?[clip]:[];m.clipShadows=true;m.needsUpdate=true}}
 function roomView(name){
  const r=model.rooms.find(x=>x.name===name);if(!r)throw new Error('Unknown interior room '+name);
  let eye=[r.x+r.width*.5,r.y+Math.min(r.depth*.45,3.8)],aim=[r.x+r.width*.5,r.y+r.depth*.82,3.6];
  if(name.startsWith('Bedroom')){
   const front=name==='Bedroom_front_right';
   eye=front?[r.x+2.2,r.y+r.depth-2.2]:[r.x+r.width-1.6,r.y+3];
   aim=[r.x+(front?7:4.7),r.y+(front?4.05:r.depth-4.05),2.3];
  }else if(name==='Kitchen'){eye=[r.x+9,r.y+7];aim=[r.x+4,r.y+1.6,2.9]}
  else if(name==='Dining_central_zone'){eye=[r.x+2.2,r.y+1.2];aim=[r.x+r.width/2,r.y+5,2.8]}
  else if(name==='WC'){eye=[r.x+r.width/2,r.y-.7];aim=[r.x+r.width/2,r.y+r.depth-1.4,2]}
  return {eye,aim,room:r};
 }
 function startRequest(request){
  pendingRequest=null;
  let path=null,name=request.room;
  if(request.closest){
   const found=walkMap.closestRoom(walker.position,[...visited,walkMap.roomAt(walker.position)]);
   if(!found){destination=null;nextExhausted=true;announce('All reachable rooms have been visited. Use Previous to go back.');return}
   name=found.room;path=found.path;
  }
  const pose=roomView(name),goal=path?path.at(-1):pose.eye,length=Math.hypot(pose.aim[0]-goal[0],pose.aim[1]-goal[1]);
  const tilt=Math.atan2(pose.aim[2]-eyeHeight,length);
  const aim=[pose.aim[0],pose.aim[1],tilt];
  if(path)walker.followRoute(path,name,aim);
  else if(!walker.goTo(pose.eye,name,aim)){destination=null;announce('No clear route. Move clear, then try the room again.');return}
  destination=name;requestedHistoryIndex=request.index??null;
  announce('To '+friendly(name)+'. Pause or move manually to stop.');
 }
 function requestNavigation(request){
  if(!walk)view('interior');
  if(navigation==='fly'&&!setNavigationMode('walk'))return;
  stopTravel();clearMovement();destination=request.room||null;nextExhausted=false;
  if(!doorsOpen&&!setDoors(true)){destination=null;return}
  pendingRequest=request;
  if(doors.every(door=>progress(door.name)>=.98))startRequest(request);
  else announce('Opening doors before walking...');
 }
 function focusRoom(name){roomView(name);requestNavigation({room:name})}
 function nextRoom(){
  if(historyIndex<history.length-1)requestNavigation({room:history[historyIndex+1],index:historyIndex+1});
  else requestNavigation({closest:true});
 }
 function previousRoom(){
  const index=(destination||pendingRequest)?historyIndex:historyIndex-1;
  if(index>=0)requestNavigation({room:history[index],index});
 }
 function setNavigationMode(next){
  if(!['walk','fly'].includes(next))throw new Error('Unknown navigation mode: '+next);
  if(next===navigation)return true;
  stopTravel();clearMovement();
  if(next==='fly'){
   lastSafe=[...walker.position];flight.place([...walker.position,camera.position.y/FT],walker.bearing,walker.tilt);navigation='fly';
   announce('Fly: collisions off. R / F: up / down. Return restores your safe spot.');
  }else{
   const safe=walkMap.isFree(lastSafe)?lastSafe:walkMap.nearest(lastSafe);
   if(!safe){announce('No clear walking position is available. Remain in Fly and return later.');return false}
   navigation='walk';walker.place(safe,flight.bearing,THREE.MathUtils.clamp(flight.tilt,-.4,.4));walkCamera();
   announce('Returned to the last safe walking position.');
  }
  setWalkerCameraLayers(camera,mode,navigation);
  updateDock();return true;
 }
 function walkCamera(){
  const height=walkMap.floorHeight(walker.position)+eyeHeight;
  camera.position.copy(point(...walker.position,height));
  camera.quaternion.setFromEuler(new THREE.Euler(walker.tilt,walker.bearing,0,'YXZ'));
 }
 function view(next){
  const startingWalk=next==='interior'&&mode!=='interior';
  mode=next;walk=next==='interior';clearMovement();stopTravel();planFrame.style.display=next==='plan'?'block':'none';
  document.body.dataset.view=next;dock.hidden=!walk;document.getElementById('files').open=false;
  const viewId=next==='plan'?'plan-view':next==='structure'?'structure-view':next;
  for(const id of ['exterior','cutaway','interior','plan-view','structure-view']){
   const active=id===viewId,button=document.getElementById(id);
   button.classList.toggle('active',active);button.setAttribute('aria-checked',String(active));button.tabIndex=active?0:-1;
  }
  const focused=document.activeElement;
  if((focused.id==='roof'&&next!=='exterior')||(focused.id==='furniture'&&['interior','plan','structure'].includes(next))||
   (structureControls.contains(focused)&&next!=='structure'))
   document.getElementById(viewId).focus({preventScroll:true});
  orbit.enabled=!walk&&next!=='plan';document.getElementById('crosshair').style.display=walk?'block':'none';
  clipping(next==='cutaway');
  furnishing.setServiceView(next);
  site.root.visible=next==='exterior'||walk;approach.visible=next!=='plan'&&next!=='structure';
  directions.root.visible=next==='exterior';
  structuralConcept.root.visible=next==='structure';structure.visible=next!=='structure';ground.visible=next!=='structure';
  structureNote.hidden=structureControls.hidden=next!=='structure';
  if(next==='exterior'){setRoof(preferences.exterior.roof);setDoors(true);setFurniture(furniturePreference);const cx=(site.bounds.minX+site.bounds.maxX)/2,cy=(site.bounds.minY+site.bounds.maxY)/2;camera.position.copy(point(cx+44,cy-57,grade+41));orbit.target.copy(point(cx,cy,grade+3))}
  if(next==='cutaway'){setRoof(false);setDoors(true);setFurniture(furniturePreference);camera.position.copy(point(50,-24,52));orbit.target.copy(point(21,17,model.dimensions.floor_elevation))}
  if(next==='structure'){
   setRoof(false);setFurniture(false);
   camera.position.copy(point(model.dimensions.width+32,-38,levels.wallTop+32));orbit.target.copy(point(model.dimensions.width/2,model.dimensions.depth/2,levels.wallTop-2));
  }
  if(walk){
   setRoof(true);setFurniture(true);
   if(startingWalk){
    navigation='walk';history=[];historyIndex=-1;visited.clear();nextExhausted=false;
    const start=walkMap.nearest([entry.x,entry.y]);
    if(!start)throw new Error('No clear position exists on the illustrative entry approach.');
    walker.place(start,0,Math.atan2(entry.aimHeight-(walkMap.floorHeight(start)+eyeHeight),entry.doorY-start[1]));
    lastSafe=[...start];setDoors(false);announce('Illustrative approach. Enter home to begin.');
   }
   if(navigation==='walk')walkCamera();renderer.domElement.setAttribute('aria-label','Walk as a 5 foot 4 inch person; eyes 5 feet above the walked surface. Drag to look; arrows or W/A/S/D move. Advanced Fly bypasses collisions; R/F changes height.');
  }
  else renderer.domElement.setAttribute('aria-label','3D home. Drag to orbit; pinch to zoom; use two fingers to pan.');
  setWalkerCameraLayers(camera,mode,navigation);
  fitScale=1;fitViewport();
  if(orbit.enabled)orbit.update();updateDock();lampControls.sync();
 }
 for(const id of ['exterior','cutaway','interior'])document.getElementById(id).onclick=()=>view(id);
 document.getElementById('structure-view').onclick=()=>view('structure');
 function wireRadioKeyboard(group){
  const buttons=[...group.querySelectorAll('[role=radio]')];
  group.addEventListener('keydown',event=>{
   const index=buttons.indexOf(event.target);if(index<0)return;let next;
   if(event.key==='Home')next=0;else if(event.key==='End')next=buttons.length-1;
   else if(['ArrowRight','ArrowDown'].includes(event.key))next=(index+1)%buttons.length;
   else if(['ArrowLeft','ArrowUp'].includes(event.key))next=(index+buttons.length-1)%buttons.length;else return;
   event.preventDefault();event.stopPropagation();buttons[next].focus();buttons[next].click();
  });
 }
 wireRadioKeyboard(document.querySelector('.view-controls'));wireRadioKeyboard(document.querySelector('.travel-mode'));
 document.getElementById('plan-view').onclick=()=>view('plan');
 enterButton.onclick=()=>focusRoom('Hall');
 nextButton.onclick=nextRoom;previousButton.onclick=previousRoom;
 function pauseRoute(){const request=pendingRequest;stopTravel(true);pausedRequest=request;updateDock()}
 playButton.onclick=()=>{if(pendingRequest||walker.path.length){pauseRoute();announce('Paused. Play resumes the same destination.')}else if(pausedRequest||destination)requestNavigation(pausedRequest??{room:destination,index:requestedHistoryIndex})};
 document.getElementById('walk-mode').onclick=()=>setNavigationMode('walk');
 document.getElementById('fly-mode').onclick=()=>setNavigationMode('fly');
 document.getElementById('return-walk').onclick=()=>setNavigationMode('walk');
 document.getElementById('roof').onclick=()=>{if(mode==='plan')view('cutaway');else setRoof(!roofGroup.visible)};
 document.getElementById('furniture').onclick=()=>setFurniture(!furnishing.root.visible);
 renderer.domElement.addEventListener('pointerdown',e=>{renderer.domElement.focus({preventScroll:true});if(walk&&lookPointer===null){stopTravel();lookPointer=e.pointerId;lastLook=[e.clientX,e.clientY];renderer.domElement.setPointerCapture(e.pointerId)}});
 const stopLook=e=>{if(e.pointerId===lookPointer)lookPointer=null};
 for(const event of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(event,stopLook);
 renderer.domElement.addEventListener('pointermove',e=>{
  if(!walk||e.pointerId!==lookPointer)return;
  (navigation==='fly'?flight:walker).look(e.clientX-lastLook[0],e.clientY-lastLook[1]);lastLook=[e.clientX,e.clientY];
 });
 function updateTouchKeys(){
  touchKeys.clear();for(const key of touchPointers.values())touchKeys.add(key);
  for(const button of walkControls.querySelectorAll('button'))button.setAttribute('aria-pressed',String(touchKeys.has(button.dataset.key)));
 }
 for(const button of walkControls.querySelectorAll('button')){
  button.addEventListener('pointerdown',e=>{if(!walk)return;e.preventDefault();stopTravel();button.setPointerCapture(e.pointerId);touchPointers.set(e.pointerId,button.dataset.key);updateTouchKeys()});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>{touchPointers.delete(e.pointerId);updateTouchKeys()});
  button.addEventListener('contextmenu',e=>e.preventDefault());
  button.addEventListener('keydown',e=>{if(!walk||![' ','Enter'].includes(e.key))return;e.preventDefault();stopTravel();keys.add(button.dataset.key)});
  button.addEventListener('keyup',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();keys.delete(button.dataset.key)}});
  button.addEventListener('blur',()=>keys.delete(button.dataset.key));
 }
 window.addEventListener('keydown',e=>{
  if(!walk||e.ctrlKey||e.metaKey||e.altKey||e.target.closest('button,select,input,textarea,summary,a')||e.target.isContentEditable||document.getElementById('files').open)return;
  if(navigation==='walk'&&['KeyR','KeyF'].includes(e.code))return;
  if(/^(Key[WASDRF]|Arrow)/.test(e.code))stopTravel();keys.add(e.code);if(e.code.startsWith('Arrow'))e.preventDefault();
 });
 const pauseWalk=()=>{clearMovement();if(pendingRequest||walker.path.length)pauseRoute();walker.velocity=[0,0];flight.velocity=[0,0,0]};
 window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',pauseWalk);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseWalk()});
 function resize(){const r=stage.getBoundingClientRect();if(!r.width||!r.height)return;camera.aspect=r.width/r.height;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height,false);fitViewport();if(orbit.enabled)orbit.update()}
 new ResizeObserver(resize).observe(stage);resize();view('exterior');
 function animate(time){
  const dt=Math.min((time-lastTime)/1000,.05)||.016;lastTime=time;
  for(const d of doors)d.pivot.rotation.y=THREE.MathUtils.damp(d.pivot.rotation.y,doorsOpen?d.angle:0,9,dt);
  if(walk){
   if(pendingRequest&&doors.every(d=>progress(d.name)>=.98))startRequest(pendingRequest);
   const pressed=key=>keys.has(key)||touchKeys.has(key);
   const input={forward:Number(pressed('KeyW')||pressed('ArrowUp'))-Number(pressed('KeyS')||pressed('ArrowDown')),
    strafe:Number(pressed('KeyD')||pressed('ArrowRight'))-Number(pressed('KeyA')||pressed('ArrowLeft')),slow:keys.has('ShiftLeft')||keys.has('ShiftRight'),
    looking:lookPointer!==null,reducedMotion:reducedMotion.matches};
   if(navigation==='fly'){
    const state=flight.update(dt,{...input,vertical:Number(pressed('KeyR'))-Number(pressed('KeyF'))});
    camera.position.copy(point(...state.position));camera.quaternion.setFromEuler(new THREE.Euler(state.tilt,state.bearing,0,'YXZ'));
   }else{
    const state=walker.update(dt,input);if(walkMap.isFree(walker.position))lastSafe=[...walker.position];
    walkCamera();
    if(state.arrived){recordRoom(destination,requestedHistoryIndex);destination=null;announce('Arrived. Next visits the closest unvisited room.')}
    if(state.blocked){destination=null;announce('Route blocked. Move clear, then try Next again.')}
   }
   updateDock();
  }else if(mode!=='plan')orbit.update();
  if(walk&&navigation==='walk'){
   avatar.place(walker.position,walkMap.floorHeight(walker.position),walker.bearing);
  }
  setWalkerCameraLayers(camera,mode,navigation);
  avatar.root.visible=['interior','exterior','cutaway'].includes(mode);
  lampControls.sync();
  renderer.info.reset();
  mirrors.update(scene,camera,mode==='interior'&&furnishing.root.visible);
  if(mode!=='plan')renderer.render(scene,camera);
  requestAnimationFrame(animate);
 }
 requestAnimationFrame(animate);
 status.textContent='Ready';status.title='Three.js · '+furnishing.items.length+' authored furnishing groups · Door swings assumed';
 window.homeScene={view,focusRoom,nextRoom,previousRoom,setNavigationMode,setDoors,scene,camera,orbit,renderer,furnishing,walker,flight,walkMap,approach,wallSections,site,directions,structuralConcept,avatar,mirrors,architecture:structure,
  state:()=>({mode,roof:roofGroup.visible,doors:model.doorways.length,doorLeaves:doors.length,doorsOpen,furnitureVisible:furnishing.root.visible,furnishingGroups:furnishing.items.length,conceptualStructureVisible:structuralConcept.root.visible,renderCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,threeRevision:THREE.REVISION,
   walking:walk?{navigation,position:[...activePosition()],room:walkMap.roomAt(activePosition()),inside:insideHome(),destination,waypoints:walker.path.length,history:[...history],historyIndex}:undefined})};
 clearTimeout(window.sceneLoadTimer);document.getElementById('failure').style.display='none';
}catch(error){
 console.error(error);document.getElementById('failure').style.display='block';
 document.getElementById('failure').textContent='Visualization could not load: '+error.message;
 status.textContent='Load failed — see error above';throw error;
}
