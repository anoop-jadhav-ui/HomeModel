import * as THREE from 'three';

export class LampTapGesture{
 constructor(){this.pointers=new Set();this.candidate=null}
 down(event,time,allowed=true){
  this.pointers.add(event.pointerId);
  if(this.pointers.size!==1){this.candidate=null;return}
  this.candidate=allowed&&event.button===0?{id:event.pointerId,x:event.clientX,y:event.clientY,time}:null;
 }
 move(event){
  const c=this.candidate;
  if(c?.id===event.pointerId&&Math.hypot(event.clientX-c.x,event.clientY-c.y)>6)this.candidate=null;
 }
 up(event,time){
  this.move(event);const c=this.candidate;
  const tap=c?.id===event.pointerId&&this.pointers.size===1&&time-c.time<=600;
  this.pointers.delete(event.pointerId);this.candidate=null;return !!tap;
 }
 cancel(){this.pointers.clear();this.candidate=null}
}

function visible(object){
 for(let parent=object;parent;parent=parent.parent)if(!parent.visible)return false;
 return true;
}
export function pickLamp(scene,camera,ndc,lamps){
 scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
 const ray=new THREE.Raycaster();ray.setFromCamera(ndc,camera);
 for(const hit of ray.intersectObjects(scene.children,true)){
  if(!hit.object.isMesh||!visible(hit.object))continue;
  const material=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
  if(!material.visible||material.transparent&&material.opacity===0)continue;
  const clipped=(material.clippingPlanes??[]).map(plane=>plane.distanceToPoint(hit.point)<0);
  if(clipped.length&&(material.clipIntersection?clipped.every(Boolean):clipped.some(Boolean)))continue;
  // Use the nearest visible surface, not a second raycast that could pass through a wall.
  return lamps.find(lamp=>{for(let p=hit.object;p;p=p.parent)if(p===lamp.group)return true;return false})??null;
 }
 return null;
}

export function setLampOn(lamp,on){
 lamp.on=on;lamp.shade.material.emissive.set('#ffbf6b');lamp.shade.material.emissiveIntensity=on?.8:0;
 lamp.bulb.material.emissive.set('#ffd69a');lamp.bulb.material.emissiveIntensity=on?2:0;
 lamp.light.intensity=on?8:0;lamp.light.visible=on;
}

export function nearestVisibleLamp(scene,camera,lamps){
 scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
 const position=new THREE.Vector3(),ndc=new THREE.Vector3();let nearest=null,distance=Infinity;
 for(const lamp of lamps){
  if(!visible(lamp.shade))continue;
  lamp.shade.getWorldPosition(position);ndc.copy(position).project(camera);
  if(Math.abs(ndc.x)>1||Math.abs(ndc.y)>1||Math.abs(ndc.z)>1)continue;
  const d=camera.position.distanceToSquared(position);
  if(d<distance&&pickLamp(scene,camera,new THREE.Vector2(ndc.x,ndc.y),lamps)===lamp){nearest=lamp;distance=d}
 }
 return nearest;
}

export function createLampControls({scene,camera,canvas,furnishing,enabled,canTap}){
 const gesture=new LampTapGesture(),initialEye=new THREE.Vector3(),initialRotation=new THREE.Quaternion();
 const announcement=document.createElement('span');announcement.className='sr-only';
 announcement.setAttribute('role','status');canvas.parentElement.append(announcement);let wasActive;
 function toggle(lamp){setLampOn(lamp,!lamp.on);announcement.textContent=lamp.label+(lamp.on?' on.':' off.');sync()}
 function sync(){
  const active=enabled();
  if(active!==wasActive){
   if(active){
    canvas.setAttribute('aria-keyshortcuts','L');
    canvas.setAttribute('aria-description','Press L to switch the nearest visible bedside lamp.');
   }else{canvas.removeAttribute('aria-keyshortcuts');canvas.removeAttribute('aria-description')}
   wasActive=active;
  }
  for(const lamp of furnishing.lamps)lamp.light.visible=active&&lamp.on;
 }
 canvas.addEventListener('keydown',event=>{
  if(event.code!=='KeyL'||event.ctrlKey||event.metaKey||event.altKey||event.repeat||!enabled()||!canTap())return;
  event.preventDefault();event.stopPropagation();
  const lamp=nearestVisibleLamp(scene,camera,furnishing.lamps);
  if(lamp)toggle(lamp);else announcement.textContent='No bedside lamp is visible from this position.';
 });
 const cancel=()=>gesture.cancel();
 document.addEventListener('pointerdown',event=>{
  if(event.target!==canvas){cancel();return}
  if(gesture.pointers.size===0){initialEye.copy(camera.position);initialRotation.copy(camera.quaternion)}
  gesture.down(event,performance.now(),enabled()&&canTap());
 },true);
 window.addEventListener('pointermove',event=>gesture.move(event),true);
 window.addEventListener('pointerup',event=>{
  if(!gesture.up(event,performance.now())||!enabled()||!canTap()||
   initialEye.distanceTo(camera.position)>.005||initialRotation.angleTo(camera.quaternion)>.003)return;
  const rect=canvas.getBoundingClientRect();
  if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)return;
  if(event.target!==canvas||document.elementFromPoint(event.clientX,event.clientY)!==canvas)return;
  const ndc=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
  const lamp=pickLamp(scene,camera,ndc,furnishing.lamps);
  if(lamp)toggle(lamp);
 },true);
 window.addEventListener('pointercancel',cancel,true);window.addEventListener('blur',cancel);
 window.addEventListener('keydown',cancel,true);
 return {sync,cancel};
}
