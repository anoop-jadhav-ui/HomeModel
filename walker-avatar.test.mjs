import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createWalkerAvatar} from './output/walker-avatar.js';
import {createFurnishings,FT} from './output/furnishings.js';
import {createWalkMap,walkEyeHeight} from './output/walk-navigation.js';
import {createSceneMirrors} from './output/scene-mirrors.js';
const source=readFileSync(new URL('./output/review-data.js',import.meta.url),'utf8');
const model=JSON.parse(source.slice(18,-1));
test('one clothed figure has actual1625.6mm crown height and floor-supported feet on every local datum',()=>{
 const avatar=createWalkerAvatar(model.navigation,new THREE.MeshStandardMaterial()),map=createWalkMap(model);
 for(const y of [map.entry.y,-3.9,-2.9,-1.9,-.9,.2,6]){
  const floor=map.floorHeight([map.entry.x,y]);
  avatar.place([map.entry.x,y],floor,.8);
  const box=new THREE.Box3().setFromObject(avatar.root);
  assert(Math.abs((box.max.y-box.min.y)*1000-1625.6)<.01);
  assert(Math.abs(box.min.y-floor*FT)<1e-7);
  const eye=avatar.root.getObjectsByProperty('name','Eye')[0].getWorldPosition(new THREE.Vector3());
  assert(Math.abs(eye.y-(floor+walkEyeHeight(model.navigation))*FT)<1e-7);
 }
 assert.equal(avatar.root.getObjectsByProperty('name','Head').length,1);
 const firstPerson=new THREE.Camera();
 assert(!avatar.root.getObjectByName('Head').layers.test(firstPerson.layers));
 firstPerson.layers.enable(1);
 assert(avatar.root.getObjectByName('Head').layers.test(firstPerson.layers),'The same head must be visible to the reflection camera');
});
test('editing stature scales the complete assembled body while retaining the derived eye offset',()=>{
 const settings={...model.navigation,person_height:6},avatar=createWalkerAvatar(settings,new THREE.MeshStandardMaterial());
 avatar.place([20,5],4,0);
 const box=new THREE.Box3().setFromObject(avatar.root);
 assert(Math.abs((box.max.y-box.min.y)-6*FT)<1e-7);
 const head=avatar.root.getObjectByName('Head'),neck=avatar.root.getObjectByName('Neck');
 const headBox=new THREE.Box3().setFromObject(head),neckBox=new THREE.Box3().setFromObject(neck);
 assert(neckBox.intersectsBox(headBox),'Changing stature must not detach the head from the body');
 const eye=avatar.root.getObjectsByProperty('name','Eye')[0].getWorldPosition(new THREE.Vector3());
 assert(Math.abs(eye.y-(4+walkEyeHeight(settings))*FT)<1e-7);
});
test('bathroom mirrors face the room, use true reflectors and enable the complete avatar layer',()=>{
 const furnishing=createFurnishings(model),manager=createSceneMirrors(furnishing,{mobile:true});
 furnishing.root.updateMatrixWorld(true);
 assert.equal(manager.mirrors.length,3);
 assert.equal(manager.info.maximumPassesPerFrame,1);
 for(const {mirror,backing}of manager.mirrors){
  assert(mirror.isReflector&&mirror.camera.layers.isEnabled(1));
  assert.equal(mirror.getRenderTarget().width,256);
  assert(mirror.position.z>backing.geometry.parameters.depth/2);
  const normal=new THREE.Vector3(0,0,1).transformDirection(mirror.matrixWorld);
  assert(normal.z>.99,'Mirror normal should point away from rear vanity wall into the room');
  assert(mirror.material.isShaderMaterial);
 }
});
test('reflection selection respects facing, scene occlusion and the one-mirror budget',()=>{
 const furnishing=createFurnishings(model),manager=createSceneMirrors(furnishing),scene=new THREE.Scene();
 scene.add(furnishing.root);
 const {mirror}=manager.mirrors[0],center=new THREE.Vector3();
 scene.updateMatrixWorld(true);mirror.getWorldPosition(center);
 const camera=new THREE.PerspectiveCamera(60,1,.01,30);
 camera.position.copy(center).add(new THREE.Vector3(0,.1,1));camera.lookAt(center);camera.updateMatrixWorld();
 manager.update(scene,camera,true);
 assert.equal(manager.info.active,1);
 assert.equal(manager.mirrors.filter(p=>p.mirror.visible).length,1);
 const blocker=new THREE.Mesh(new THREE.BoxGeometry(1,1,.1),new THREE.MeshBasicMaterial());
 blocker.position.copy(center).add(new THREE.Vector3(0,0,.5));scene.add(blocker);
 manager.update(scene,camera,true);assert.equal(manager.info.active,0,'Cannot activate a mirror hidden behind another surface');
 blocker.scale.set(.08,.08,1);manager.update(scene,camera,true);
 assert.equal(manager.info.active,1,'A small central obstruction must not disable the still-visible mirror edges');
 blocker.visible=false;manager.update(scene,camera,false);
 assert.equal(manager.info.active,0);assert(manager.mirrors.every(p=>!p.mirror.visible));
});
