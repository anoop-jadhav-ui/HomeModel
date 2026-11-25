import * as THREE from 'three';
import {RoundedBoxGeometry} from './vendor/RoundedBoxGeometry.js';
import {walkEyeHeight} from './walk-navigation.js';

const FT=.3048;
export function setWalkerCameraLayers(camera,view,navigation){
 camera.layers.disable(1);camera.layers.disable(2);
 if(['exterior','cutaway','reflection'].includes(view)){
  camera.layers.enable(1);camera.layers.enable(2);
 }else if(view==='interior'&&navigation==='walk')camera.layers.enable(2);
}
export function createWalkerAvatar(settings,fabric){
 const height=settings.person_height*FT,eyeHeight=walkEyeHeight(settings)*FT,root=new THREE.Group();
 const bodyHeight=1.6256,scale=height/bodyHeight,localEyeHeight=eyeHeight/scale;
 root.scale.setScalar(scale);
 root.name='Single scale walker - '+(height*1000).toFixed(1)+'mm stature';
 root.userData={statureMM:height*1000,eyeHeightMM:eyeHeight*1000,authored:true};
 const shirt=fabric.clone();shirt.color.set('#637d86');
 const trousers=fabric.clone();trousers.color.set('#4d5552');
 const skin=new THREE.MeshStandardMaterial({color:'#b68b6f',roughness:.85});
 const hair=new THREE.MeshStandardMaterial({color:'#302c29',roughness:.95});
 const shoes=new THREE.MeshStandardMaterial({color:'#393b36',roughness:.9});
 const sphere=new THREE.SphereGeometry(1,16,12);
 function oval(name,scale,position,material,upper=false){
  const mesh=new THREE.Mesh(sphere,material);mesh.name=name;mesh.scale.set(...scale);mesh.position.set(...position);
  mesh.layers.set(upper?1:2);
  mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);return mesh;
 }
 function limb(name,a,b,radius,material,upper=false){
  const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from);
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius*.85,radius,delta.length(),10),material);
  mesh.name=name;mesh.position.copy(from.add(to).multiplyScalar(.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
  mesh.layers.set(upper?1:2);
  mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
 }
 oval('Trouser hips',[.155,.125,.11],[0,.855,0],trousers);
 const torsoGeometry=new RoundedBoxGeometry(.35,.43,.22,2,.05);
 const torsoPositions=torsoGeometry.attributes.position;
 for(let i=0;i<torsoPositions.count;i++){
  torsoPositions.setX(i,torsoPositions.getX(i)*(.86+.14*(torsoPositions.getY(i)+.215)/.43));
 }
 torsoGeometry.computeVertexNormals();
 const torso=new THREE.Mesh(torsoGeometry,shirt);
 torso.name='Shirt torso';torso.position.y=1.13;torso.layers.set(1);
 torso.castShadow=true;torso.receiveShadow=true;root.add(torso);
 limb('Neck',[0,bodyHeight-.29,0],[0,bodyHeight-.20,0],.038,skin,true);
 oval('Head',[.09,.125,.092],[0,bodyHeight-.125,0],skin,true);
 oval('Hair cap',[.091,.055,.093],[0,bodyHeight-.055,.003],hair,true);
 oval('Nose',[.018,.027,.02],[0,localEyeHeight-.034,-.088],skin,true);
 for(const side of [-1,1]){
  oval('Eye',[.009,.006,.003],[side*.031,localEyeHeight,-.085],hair,true);
  oval('Ear',[.013,.028,.018],[side*.09,bodyHeight-.13,0],skin,true);
  limb('Trouser upper leg',[side*.085,.87,0],[side*.09,.48,.012],.068,trousers);
  limb('Trouser lower leg',[side*.09,.48,.012],[side*.095,.10,0],.052,trousers);
  const shoe=new THREE.Mesh(new RoundedBoxGeometry(.115,.09,.235,2,.025),shoes);
  shoe.name='Shoe on walked surface';shoe.position.set(side*.095,.045,-.045);shoe.layers.set(2);shoe.castShadow=true;root.add(shoe);
  limb('Short sleeve',[side*.145,1.275,0],[side*.205,1.12,0],.058,shirt,true);
  limb('Forearm',[side*.205,1.14,0],[side*.23,.91,-.025],.035,skin,true);
  oval('Hand',[.029,.064,.023],[side*.23,.87,-.025],skin,true);
 }
 function place(position,floor,bearing){
  root.position.set(position[0]*FT,floor*FT,-position[1]*FT);root.rotation.y=bearing;
  root.updateMatrixWorld(true);
 }
 return {root,height,eyeHeight,place};
}
