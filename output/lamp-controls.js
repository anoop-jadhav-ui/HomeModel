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

export function createLampControls({scene,camera,canvas,furnishing,panel,enabled,canTap}){
 const gesture=new LampTapGesture(),buttons=new Map(),initialEye=new THREE.Vector3(),initialRotation=new THREE.Quaternion();
 const list=panel.querySelector('[data-lamp-list]');
 for(const lamp of furnishing.lamps){
  const button=document.createElement('button');button.type='button';
  button.textContent=lamp.label;button.setAttribute('aria-pressed',String(lamp.on));
  button.addEventListener('click',()=>{setLampOn(lamp,!lamp.on);sync()});
  buttons.set(lamp,button);list.append(button);
 }
 function sync(){
  const active=enabled();
  if(!active&&panel.contains(document.activeElement))canvas.focus({preventScroll:true});
  panel.hidden=!active;
  for(const lamp of furnishing.lamps){
   lamp.light.visible=active&&lamp.on;
   const button=buttons.get(lamp),pressed=String(lamp.on);
   if(button.getAttribute('aria-pressed')!==pressed)button.setAttribute('aria-pressed',pressed);
  }
 }
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
  if(lamp){setLampOn(lamp,!lamp.on);sync()}
 },true);
 window.addEventListener('pointercancel',cancel,true);window.addEventListener('blur',cancel);
 window.addEventListener('keydown',cancel,true);
 return {sync,cancel};
}
