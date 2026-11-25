import * as THREE from 'three';
import {FT,point} from './furnishings.js';

export function createGroundDirections(model,site){
 const {bounds,gateway}=site,grade=model.dimensions.ground_elevation;
 if(!Number.isFinite(grade))throw new Error('Ground directions require the shared illustrative grade.');
 const root=new THREE.Group();root.name='Ground compass - original sketch, not surveyed true north';
 const midX=(bounds.minX+bounds.maxX)/2,midY=(bounds.minY+bounds.maxY)/2;
 const definitions=[
  ['N',bounds.maxX+3,midY,[1,0]],
  ['S',bounds.minX-3,midY,[-1,0]],
  ['W',midX,bounds.maxY+3,[0,1]],
  ['E',gateway.centerX+gateway.clearOpening/2+2,bounds.minY-3,[0,-1]],
 ];
 const paths={
  N:[[[-.36,-.5],[-.36,.5],[.36,-.5],[.36,.5]]],
  S:[[[.34,.43],[-.22,.5],[-.36,.28],[-.28,.05],[.24,-.05],[.36,-.28],[.22,-.5],[-.34,-.43]]],
  W:[[[-.44,.5],[-.25,-.5],[0,.12],[.25,-.5],[.44,.5]]],
  E:[[[-.34,-.5],[-.34,.5],[.34,.5]],[[-.34,0],[.25,0]],[[-.34,-.5],[.34,-.5]]],
 };
 const material=new THREE.MeshBasicMaterial({color:'#4c6057'});
 for(const [letter,x,y,direction] of definitions){
  const strokes=[];
  for(const path of paths[letter])for(let i=1;i<path.length;i++){
   const a=new THREE.Vector2(...path[i-1]),b=new THREE.Vector2(...path[i]);
   const normal=b.clone().sub(a).normalize().rotateAround(new THREE.Vector2(),Math.PI/2).multiplyScalar(.055);
   strokes.push(new THREE.Shape([a.clone().add(normal),b.clone().add(normal),b.clone().sub(normal),a.clone().sub(normal)]));
  }
  const geometry=new THREE.ShapeGeometry(strokes);geometry.scale(2.2*FT,2.2*FT,1);
  const mesh=new THREE.Mesh(geometry,material);mesh.rotation.x=-Math.PI/2;
  mesh.position.copy(point(x,y,grade+.015));mesh.name='Ground direction '+letter;
  mesh.userData.direction={letter,nativePosition:[x,y,grade+.015],planDirection:direction,
   reference:'Original sketch orientation only; not surveyed or georeferenced true north.'};
  root.add(mesh);
 }
 return {root};
}
