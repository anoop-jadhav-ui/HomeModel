import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createFurnishings,FT,point} from './furnishings.js';

const model=window.HOME_MODEL,stage=document.getElementById('stage'),status=document.getElementById('status');
try{
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));renderer.shadowMap.enabled=true;
 renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;
 renderer.toneMappingExposure=1.15;stage.prepend(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#dce4e1');scene.fog=new THREE.Fog('#dce4e1',35,95);
 const camera=new THREE.PerspectiveCamera(48,1,.04,150);
 const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.dampingFactor=.075;
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
 const wall=makeMat('#eee9dd',.88),floor=makeMat('#e4dfd1',.5),roofMat=makeMat('#c38565',.84),stone=makeMat('#d4cbb8',.95);
 floor.map=texture('floor');roofMat.map=texture('roof');stone.map=texture('stone');
 const roofGroup=new THREE.Group(),structure=new THREE.Group();scene.add(structure,roofGroup);
 const clip=new THREE.Plane(new THREE.Vector3(0,-1,0),(model.dimensions.floor_elevation+4.5)*FT);
 renderer.localClippingEnabled=true;
 const clipMaterials=new Set([wall]);
 for(const ob of model.objects){
  if(ob.group==='Openings')continue;
  const positions=[],uv=[];
  for(const v of ob.vertices){positions.push(v[0]*FT,v[2]*FT,-v[1]*FT);uv.push(v[0]/3,(ob.group==='Walls'?v[2]:v[1])/3)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ob.triangles.flat());g.computeVertexNormals();
  let mat=ob.group==='Walls'?wall:ob.group==='Roof'?roofMat:ob.name.includes('Plinth')?stone:floor;
  if(ob.name.includes('Monitor Corner'))mat=makeMat('#6d5038');
  const mesh=new THREE.Mesh(g,mat);mesh.name=ob.name;mesh.castShadow=true;mesh.receiveShadow=true;
  (ob.group==='Roof'?roofGroup:structure).add(mesh);
 }
 const furnishing=createFurnishings(model);scene.add(furnishing.root);
 const frameMat=makeMat('#394b42',.45),wood=new THREE.MeshStandardMaterial({color:'#946747',roughness:.5});
 const handle=new THREE.MeshStandardMaterial({color:'#b8a078',roughness:.25,metalness:.8});
 const glass=new THREE.MeshPhysicalMaterial({color:'#d6e8ed',transparent:true,opacity:.18,roughness:.06,metalness:.05,depthWrite:false,side:THREE.DoubleSide});
 for(const mat of [frameMat,wood,handle,glass])clipMaterials.add(mat);
 const doors=[];
 function localBox(g,w,h,d,x,y,z,mat){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w*FT,h*FT,d*FT),mat);mesh.position.set(x*FT,y*FT,z*FT);mesh.castShadow=mat!==glass;mesh.receiveShadow=true;g.add(mesh);return mesh;
 }
 for(const item of model.plan.openings){
  const group=new THREE.Group();group.position.copy(point(item.x,item.y,model.dimensions.floor_elevation+item.sill));group.rotation.y=item.angle_degrees*Math.PI/180;
  structure.add(group);const w=item.width,h=item.height,t=.12,d=item.wall_thickness;
  const fm=item.kind==='door'?wood:frameMat;
  for(const side of [-1,1])localBox(group,t,h,d,side*(w-t)/2,h/2,0,fm);
  localBox(group,w,t,d,0,h-t/2,0,fm);
  if(item.kind==='door'){
   const assumption=model.doorways.find(x=>x.name===item.name),sign=assumption.hinge==='start'?-1:1;
   const pivot=new THREE.Group();pivot.position.x=sign*(w/2-t)*FT;group.add(pivot);
   const lw=w-2*t,lh=h-t-.03;
   localBox(pivot,lw,lh,.13,-sign*lw/2,lh/2+.015,0,wood);
   for(const z of [-.11,.11]){
    localBox(pivot,.38,.055,.06,-sign*(lw-.25),3.35,z,handle);
    localBox(pivot,.055,.26,.055,-sign*(lw-.25),3.25,z,handle);
   }
   if(item.mark==='D')for(let i=0;i<6;i++)localBox(pivot,.025,lh-.4,.025,-sign*(.35+i*.5),lh/2,.083,frameMat);
   const a=item.angle_degrees*Math.PI/180,normal=assumption.opens_to[0]*Math.sin(a)-assumption.opens_to[1]*Math.cos(a);
   doors.push({pivot,angle:Math.asin(Math.max(-1,Math.min(1,normal*sign))),name:item.name});
  }else{
   localBox(group,w,t,d,0,t/2,0,fm);
   localBox(group,w-2*t,h-2*t,.025,0,h/2,0,glass);
   if(w>3.5)localBox(group,.075,h-2*t,d*.75,0,h/2,0,fm);
   if(item.kind==='vent')for(let i=1;i<=4;i++){const slat=localBox(group,w-.15,.055,.18,0,i*h/5,0,fm);slat.rotation.x=.4}
  }
 }
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(150,150),makeMat('#b4bda8',.95));ground.rotation.x=-Math.PI/2;ground.position.y=-.018;ground.receiveShadow=true;scene.add(ground);
 // Surface finishes are visualization-only layers, not a second architectural layout.
 for(const r of model.rooms){
  const mat=makeMat(r.name.startsWith('Bedroom')?'#bca182':r.name.includes('bath')||r.name.includes('Bath')||r.name==='WC'?'#bcc5bd':'#dfdacd',.72);
  mat.map=floor.map;
  const finish=new THREE.Mesh(new THREE.PlaneGeometry((r.width-.04)*FT,(r.depth-.04)*FT),mat);
  const uv=finish.geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*r.width/4,uv.getY(i)*r.depth/4);
  finish.rotation.x=-Math.PI/2;finish.position.copy(point(r.x+r.width/2,r.y+r.depth/2,model.dimensions.floor_elevation+.018));finish.receiveShadow=true;structure.add(finish);
 }
 let mode='exterior',doorsOpen=false,walk=false,look=false,lastTime=0,keys=new Set(),pendingLook=[0,0],bearing=0,tilt=0;
 const planFrame=document.getElementById('plan'),help=document.getElementById('view-help'),title=document.getElementById('view-title');
 function setRoof(visible){roofGroup.visible=visible;document.getElementById('roof').textContent=visible?'Hide roof':'Show roof'}
 function setDoors(open){doorsOpen=open;document.getElementById('doors').textContent=open?'Close doors*':'Open doors*'}
 function clipping(enabled){for(const m of clipMaterials){m.clippingPlanes=enabled?[clip]:[];m.needsUpdate=true}}
 function focusRoom(name){
  const r=model.rooms.find(x=>x.name===name);if(!r)throw new Error('Unknown interior room '+name);
  let eye=[r.x+r.width*.5,r.y+Math.min(r.depth*.45,3.8)],aim=[r.x+r.width*.5,r.y+r.depth*.82,3.6];
  if(name.startsWith('Bedroom')){
   const front=name==='Bedroom_front_right';
   eye=front?[r.x+2.2,r.y+r.depth-2.2]:[r.x+r.width-1.6,r.y+3];
   aim=[r.x+(front?7:4.7),r.y+(front?4.05:r.depth-4.05),2.3];
  }else if(name==='Kitchen'){eye=[r.x+9,r.y+7];aim=[r.x+4,r.y+1.6,2.9]}
  else if(name==='Dining_central_zone'){eye=[r.x+2.2,r.y+1.2];aim=[r.x+r.width/2,r.y+5,2.8]}
  else if(name==='WC'){eye=[r.x+r.width/2,r.y-.7];aim=[r.x+r.width/2,r.y+r.depth-1.4,2]}
  camera.position.copy(point(...eye,model.dimensions.floor_elevation+5.3));
  const target=point(aim[0],aim[1],model.dimensions.floor_elevation+aim[2]);
  camera.lookAt(target);const e=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');bearing=e.y;tilt=e.x;
  title.textContent=r.name.replaceAll('_',' ')+' / eye-level view';
 }
 function view(next){
  mode=next;walk=next==='interior';look=false;keys.clear();planFrame.style.display=next==='plan'?'block':'none';
  document.getElementById('info').style.display=next==='plan'?'none':'block';
  document.getElementById('info').classList.toggle('compact',next!=='exterior');
  for(const id of ['exterior','cutaway','interior','plan-view'])document.getElementById(id).classList.toggle('active',id===(next==='plan'?'plan-view':next));
  orbit.enabled=!walk&&next!=='plan';document.getElementById('crosshair').style.display=walk?'block':'none';
  clipping(next==='cutaway');
  if(next==='exterior'){setRoof(true);camera.position.copy(point(55,-44,37));orbit.target.copy(point(21,17,11));title.textContent='A warmer view of the same home';help.textContent='Drag to orbit · Scroll to zoom · Right-drag to pan. Furnished cutaway reveals the room arrangement.'}
  if(next==='cutaway'){setRoof(false);setDoors(true);camera.position.copy(point(50,-24,52));orbit.target.copy(point(21,17,4));title.textContent='Furnished cutaway / layout review';help.textContent='Upper walls are visually clipped for review only. The underlying FreeCAD/IFC geometry is unchanged.'}
  if(walk){setRoof(true);setDoors(true);focusRoom(document.getElementById('room').value);help.textContent='Drag to look · W/A/S/D or arrow keys to walk · Shift for slower motion. Choose a room to jump. No collision/egress simulation.'}
  if(orbit.enabled)orbit.update();
 }
 for(const id of ['exterior','cutaway','interior'])document.getElementById(id).onclick=()=>view(id);
 document.getElementById('plan-view').onclick=()=>view('plan');
 document.getElementById('room').onchange=()=>{view('interior')};
 document.getElementById('roof').onclick=()=>{if(mode==='plan')view('cutaway');else setRoof(!roofGroup.visible)};
 document.getElementById('doors').onclick=()=>setDoors(!doorsOpen);
 document.getElementById('furniture').onclick=()=>{furnishing.root.visible=!furnishing.root.visible;document.getElementById('furniture').textContent=furnishing.root.visible?'Furniture on':'Furniture off'};
 renderer.domElement.addEventListener('pointerdown',e=>{if(walk){look=true;renderer.domElement.setPointerCapture(e.pointerId)}});
 renderer.domElement.addEventListener('pointerup',()=>look=false);
 renderer.domElement.addEventListener('pointermove',e=>{if(walk&&look){bearing-=e.movementX*.004;tilt=Math.max(-1.3,Math.min(1.3,tilt-e.movementY*.004))}});
 window.addEventListener('keydown',e=>{if(walk&&!['SELECT','INPUT','TEXTAREA'].includes(e.target.tagName)){keys.add(e.code);if(e.code.startsWith('Arrow')||e.code==='Space')e.preventDefault()}});
 window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
 function resize(){const r=stage.getBoundingClientRect();camera.aspect=r.width/r.height;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height)}
 window.addEventListener('resize',resize);resize();view('exterior');
 function animate(time){
  const dt=Math.min((time-lastTime)/1000,.05)||.016;lastTime=time;
  if(walk){
   camera.quaternion.setFromEuler(new THREE.Euler(tilt,bearing,0,'YXZ'));
   const forward=new THREE.Vector3(-Math.sin(bearing),0,-Math.cos(bearing)),right=new THREE.Vector3(Math.cos(bearing),0,-Math.sin(bearing));
   const speed=(keys.has('ShiftLeft')?.45:1.1)*dt;
   if(keys.has('KeyW')||keys.has('ArrowUp'))camera.position.addScaledVector(forward,speed);
   if(keys.has('KeyS')||keys.has('ArrowDown'))camera.position.addScaledVector(forward,-speed);
   if(keys.has('KeyD')||keys.has('ArrowRight'))camera.position.addScaledVector(right,speed);
   if(keys.has('KeyA')||keys.has('ArrowLeft'))camera.position.addScaledVector(right,-speed);
  }else if(mode!=='plan')orbit.update();
  for(const d of doors)d.pivot.rotation.y=THREE.MathUtils.damp(d.pivot.rotation.y,doorsOpen?d.angle:0,9,dt);
  if(mode!=='plan')renderer.render(scene,camera);
  requestAnimationFrame(animate);
 }
 requestAnimationFrame(animate);
 status.textContent='Three.js · '+furnishing.items.length+' authored furnishing groups · Door swings assumed';
 window.homeScene={view,focusRoom,setDoors,scene,camera,renderer,furnishing,
  state:()=>({mode,roof:roofGroup.visible,doors:doors.length,furnishingGroups:furnishing.items.length,renderCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,threeRevision:THREE.REVISION})};
 clearTimeout(window.sceneLoadTimer);document.getElementById('failure').style.display='none';
}catch(error){
 console.error(error);document.getElementById('failure').style.display='block';
 document.getElementById('failure').textContent='Visualization could not load: '+error.message;
 status.textContent='Load failed — see error above';throw error;
}
