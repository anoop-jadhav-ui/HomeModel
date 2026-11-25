import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {LampTapGesture,pickLamp,setLampOn} from './output/lamp-controls.js';
import {createFurnishings} from './output/furnishings.js';

const event=(id,x=10,y=10)=>({pointerId:id,clientX:x,clientY:y,button:0});
test('only a short single-pointer stationary release is a lamp tap',()=>{
 const gesture=new LampTapGesture();
 gesture.down(event(1),0);assert(gesture.up(event(1,12),120));
 gesture.down(event(1),0);gesture.move(event(1,30));gesture.move(event(1));
 assert(!gesture.up(event(1),200),'Dragging out and back is not a click');
 gesture.down(event(1),0);gesture.down(event(2),30);gesture.up(event(2),60);
 assert(!gesture.up(event(1),120),'Pinch must not leave a click candidate');
 gesture.down(event(1),0);assert(!gesture.up(event(1),800),'Long press is not a tap');
 gesture.down(event(1),0,false);assert(!gesture.up(event(1),120),'Walking/route motion blocks switching');
 gesture.down(event(1),0);gesture.cancel();assert(!gesture.up(event(1),120));
});
test('the first actually visible surface controls selection, including cutaway clipping and ancestor visibility',()=>{
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.1,100);
 camera.position.z=5;camera.lookAt(0,0,0);
 const group=new THREE.Group(),shade=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());
 group.add(shade);scene.add(group);const lamp={group},lamps=[lamp],ndc=new THREE.Vector2();
 assert.equal(pickLamp(scene,camera,ndc,lamps),lamp);
 const wall=new THREE.Mesh(new THREE.BoxGeometry(2,2,.2),new THREE.MeshBasicMaterial());wall.position.z=2;scene.add(wall);
 assert.equal(pickLamp(scene,camera,ndc,lamps),null,'No switching through walls');
 wall.material.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,1,0),-.1)];
 assert.equal(pickLamp(scene,camera,ndc,lamps),lamp,'Shader-clipped walls do not occlude');
 wall.visible=false;group.visible=false;
 assert.equal(pickLamp(scene,camera,ndc,lamps),null,'Hidden furniture cannot receive clicks');
 group.visible=true;wall.visible=true;wall.material.clippingPlanes=[];
 wall.material.transparent=true;wall.material.opacity=.2;
 assert.equal(pickLamp(scene,camera,ndc,lamps),null,'Visible glass is conservatively respected');
});
test('six real bedside lamps switch independently with emission and finite unshadowed local lighting',()=>{
 const source=readFileSync(new URL('./output/review-data.js',import.meta.url),'utf8');
 const model=JSON.parse(source.slice('window.HOME_MODEL='.length,-1)),assets=createFurnishings(model);
 assert.equal(assets.lamps.length,6);assert.equal(new Set(assets.lamps.map(l=>l.id)).size,6);
 const [a,b]=assets.lamps;setLampOn(a,true);
 assert(a.on);assert(a.shade.material.emissiveIntensity>0);assert(a.bulb.material.emissiveIntensity>0);
 assert(a.light.intensity>0&&a.light.distance<=1.5&&!a.light.castShadow);
 assert(!b.on);assert.equal(b.light.intensity,0);assert.notEqual(a.shade.material,b.shade.material);
 setLampOn(b,true);setLampOn(a,false);assert(b.on);assert(!a.on);assert.equal(a.light.intensity,0);
});
