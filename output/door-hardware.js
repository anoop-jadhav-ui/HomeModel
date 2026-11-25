import * as THREE from 'three';
import {RoundedBoxGeometry} from './vendor/RoundedBoxGeometry.js';

const FT=.3048,cache=new Map();
function joined(parts){
 const positions=[],normals=[],uv=[];
 for(const part of parts){
  const shape=part.index?part.toNonIndexed():part;
  positions.push(...shape.attributes.position.array);normals.push(...shape.attributes.normal.array);uv.push(...shape.attributes.uv.array);
  shape.dispose();if(shape!==part)part.dispose();
 }
 const geometry=new THREE.BufferGeometry();
 for(const [name,data,size]of [['position',positions,3],['normal',normals,3],['uv',uv,2]])
  geometry.setAttribute(name,new THREE.Float32BufferAttribute(data,size));
 geometry.userData.assetSolid=true;return geometry;
}
function disc(radius,depth,x,y,z){
 const g=new THREE.CylinderGeometry(radius*FT,radius*FT,depth*FT,12);
 g.rotateX(Math.PI/2);g.translate(x*FT,y*FT,z*FT);return g;
}

export function createDoorHardware(fit,metal,dark){
 const key=[fit.sign,fit.width,fit.height,fit.bottom,fit.centerZ,fit.thickness].join(':');
 if(!cache.has(key)){
  const parts=[],keyholes=[],{sign}=fit,latch=-sign*(fit.width-.25),height=3.35;
  for(const side of [-1,1]){
   const face=fit.centerZ+side*fit.thickness/2;
   parts.push(disc(.082,.016,latch,height,face+side*.008));
   parts.push(disc(.027,.11,latch,height,face+side*.055));
   const lever=new RoundedBoxGeometry(.34*FT,.047*FT,.055*FT,2,.018*FT);
   lever.translate((latch+sign*.145)*FT,height*FT,(face+side*.11)*FT);parts.push(lever);
   parts.push(disc(.063,.012,latch,height-.25,face+side*.006));
   const hole=new THREE.BoxGeometry(.012*FT,.045*FT,.003*FT);
   hole.translate(latch*FT,(height-.25)*FT,(face+side*.013)*FT);keyholes.push(hole);
  }
  for(const y of [fit.bottom+.55,fit.bottom+fit.height/2,fit.bottom+fit.height-.55]){
   const pin=new THREE.CylinderGeometry(.023*FT,.023*FT,.27*FT,12);
   pin.translate(0,y*FT,0);parts.push(pin);
   const plate=new THREE.BoxGeometry(.17*FT,.28*FT,.009*FT);
   const face=fit.centerZ-(Math.sign(fit.centerZ)||1)*fit.thickness/2;
   plate.translate(-sign*.087*FT,y*FT,face*FT);parts.push(plate);
   for(const dy of [-.085,.085])parts.push(disc(.012,.012,-sign*.105,y+dy,face));
  }
  cache.set(key,[joined(parts),joined(keyholes)]);
 }
 const group=new THREE.Group();group.name='Leaf-mounted levers, roses, key escutcheons and three hinges';
 group.userData={hardware:true,leverHeightMM:3.35*304.8,rosetteDiameterMM:.164*304.8,leafMounted:true};
 cache.get(key).forEach((geometry,i)=>{
  const mesh=new THREE.Mesh(geometry,i?dark:metal);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
 });
 return group;
}
