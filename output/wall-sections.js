import * as THREE from 'three';
import {FT} from './furnishings.js';

export function createWallSections(model){
 const positions=[],height=model.dimensions.floor_elevation+model.plan.cut_height;
 for(const face of model.plan.wall_faces){
  const loops=face.loops.map(loop=>{
   const points=loop.map(([x,y])=>new THREE.Vector2(x,y));
   if(points[0].distanceToSquared(points.at(-1))<1e-14)points.pop();
   if(points.length<3)throw new Error('Invalid native wall section: '+face.wall);
   return points;
  });
  const shape=new THREE.Shape(loops[0]);
  for(const hole of loops.slice(1))shape.holes.push(new THREE.Path(hole));
  const geometry=new THREE.ShapeGeometry(shape),vertices=geometry.attributes.position;
  for(const index of geometry.index.array)positions.push(vertices.getX(index)*FT,height*FT,-vertices.getY(index)*FT);
  geometry.dispose();
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.computeVertexNormals();
 const material=new THREE.MeshStandardMaterial({color:'#b8a58d',roughness:1,flatShading:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 const mesh=new THREE.Mesh(geometry,material);
 mesh.name='Native wall section caps';mesh.receiveShadow=true;mesh.visible=false;
 mesh.userData={cutHeight:model.plan.cut_height,sourceFaces:model.plan.wall_faces.length};
 return mesh;
}

export function nativeFrameProfile(model,opening){
 const source=model.objects.find(object=>object.name===opening.name);
 if(!source)throw new Error('Missing native opening geometry: '+opening.name);
 const angle=opening.angle_degrees*Math.PI/180;
 const offsets=source.vertices.map(([x,y])=>-Math.sin(angle)*x+Math.cos(angle)*y);
 const min=Math.min(...offsets),max=Math.max(...offsets),depth=max-min;
 if(!(depth>0))throw new Error('Invalid native frame depth: '+opening.name);
 return {depth,normalOffset:(min+max)/2-(-Math.sin(angle)*opening.x+Math.cos(angle)*opening.y)};
}

export function createBoxSection(mesh,height,material){
 const {width,depth,height:boxHeight}=mesh.geometry.parameters;
 if(height<=mesh.position.y-boxHeight/2||height>=mesh.position.y+boxHeight/2)return null;
 const geometry=new THREE.PlaneGeometry(width,depth);geometry.rotateX(-Math.PI/2);
 const cap=new THREE.Mesh(geometry,material);
 cap.position.set(mesh.position.x,height,mesh.position.z);cap.receiveShadow=true;cap.visible=false;
 cap.name='Cut face: '+mesh.name;
 return cap;
}
