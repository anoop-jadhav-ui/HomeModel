import * as THREE from 'three';
import {Reflector} from 'three/addons/objects/Reflector.js';

function visible(object){
 for(let node=object;node;node=node.parent)if(!node.visible)return false;
 return true;
}
export function createSceneMirrors(furnishing,{mobile=false}={}){
 const mirrors=[],resolution=mobile?256:512,ray=new THREE.Raycaster(),frustum=new THREE.Frustum();
 furnishing.root.traverse(backing=>{
  if(!backing.isMesh||backing.material!==furnishing.materials.mirror)return;
  backing.geometry.computeBoundingBox();
  const size=backing.geometry.boundingBox.getSize(new THREE.Vector3());
  const mirror=new Reflector(new THREE.PlaneGeometry(size.x-.012,size.y-.012),
   {textureWidth:resolution,textureHeight:resolution,color:0xbfc4c1,clipBias:.001,multisample:0});
  mirror.name='True bathroom mirror';mirror.position.z=size.z/2+.001;
  mirror.camera.layers.enable(1);mirror.visible=false;backing.add(mirror);
  mirror.userData={realReflection:true,resolution,reflectsAvatar:true};
  mirrors.push({mirror,backing});
 });
 const center=new THREE.Vector3(),normal=new THREE.Vector3(),to=new THREE.Vector3(),sample=new THREE.Vector3();
 const info={active:0,resolution,updates:0,mode:'matte inactive backing',maximumPassesPerFrame:1};
 for(const {mirror}of mirrors){
  const render=mirror.onBeforeRender;
  mirror.onBeforeRender=function(...args){info.updates++;return render.apply(this,args)};
 }
 function update(scene,camera,enabled){
  for(const {mirror}of mirrors)mirror.visible=false;
  info.active=0;info.mode='matte inactive backing';
  if(!enabled)return;
  camera.updateMatrixWorld();
  scene.updateMatrixWorld(true);
  frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  let best=null,score=0;
  for(const entry of mirrors){
   const {mirror,backing}=entry;
   if(!visible(backing)||!frustum.intersectsObject(backing))continue;
   mirror.getWorldPosition(center);normal.set(0,0,1).transformDirection(mirror.matrixWorld);
   to.copy(camera.position).sub(center);
   if(to.dot(normal)<=.01)continue;
   const distance=to.length();
   const {width,height}=mirror.geometry.parameters;
   const unobstructed=[[0,0],[-.4,-.4],[.4,-.4],[-.4,.4],[.4,.4]].some(([x,y])=>{
    sample.set(x*width,y*height,0).applyMatrix4(mirror.matrixWorld);
    to.copy(sample).sub(camera.position);
    ray.set(camera.position,to.normalize());ray.far=camera.position.distanceTo(sample)+.02;ray.layers.mask=camera.layers.mask;
    const hit=ray.intersectObjects(scene.children,true).find(hit=>hit.object.isMesh&&visible(hit.object)&&
     !(hit.object.material?.transparent&&hit.object.material.opacity<.4));
    return !hit||hit.object===backing||hit.distance>=ray.far-.035;
   });
   if(!unobstructed)continue;
   const weight=backing.geometry.parameters.width*backing.geometry.parameters.height/(distance*distance);
   if(weight>score){best=entry;score=weight}
  }
  if(best){best.mirror.visible=true;info.active=1;info.mode='view-dependent planar reflection'}
 }
 return {mirrors,info,update};
}
