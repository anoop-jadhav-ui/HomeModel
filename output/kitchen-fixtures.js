import * as THREE from 'three';

const FT=.3048;
export const KITCHEN_SINK=Object.freeze({
 x:6.2,y:1.15,cutWidth:2.08,cutDepth:1.38,width:2.3,depth:1.62,
 innerWidth:1.98,innerDepth:1.28,bowlDepth:.62,tapX:6.2,tapY:.35,tapRotation:Math.PI
});

function roundedLoop(width,depth,radius,segments=8){
 const result=[];
 for(const [x,y,start]of [[width/2-radius,depth/2-radius,0],[width/2-radius,-depth/2+radius,90],
  [-width/2+radius,-depth/2+radius,180],[-width/2+radius,depth/2-radius,270]])
  for(let i=0;i<segments;i++){
   const a=(start+i/segments*90)*Math.PI/180;
   result.push([x+radius*Math.sin(a),y+radius*Math.cos(a)]);
  }
 return result;
}

export function kitchenCounterGeometry(){
 const s=KITCHEN_SINK,shape=new THREE.Shape();
 shape.moveTo(2.18,.06);shape.lineTo(11.47,.06);shape.lineTo(11.47,2.18);shape.lineTo(2.18,2.18);shape.closePath();
 const hole=new THREE.Path(roundedLoop(s.cutWidth,s.cutDepth,.18).map(([x,y])=>new THREE.Vector2(s.x+x,s.y+y)));
 hole.closePath();shape.holes.push(hole);
 const geometry=new THREE.ExtrudeGeometry(shape,{depth:.18,bevelEnabled:false,steps:1,curveSegments:8});
 geometry.scale(FT,FT,FT);geometry.rotateX(-Math.PI/2);geometry.userData.assetSolid=true;
 return geometry;
}

export function kitchenSinkGeometry(){
 const s=KITCHEN_SINK,positions=[],uv=[],indices=[];
 const rings=[
  [s.width,s.depth,.15,.02],[s.innerWidth,s.innerDepth,.14,.02],
  [1.7,1,.16,-.58],[.18,.18,.09,-.60],[.18,.18,.09,-.62],
  [1.72,1.02,.16,-.60],[2,1.3,.14,0],[s.width,s.depth,.15,0]
 ];
 for(const [w,d,r,z]of rings)for(const [x,y]of roundedLoop(w,d,r)){
  positions.push(x*FT,z*FT,-y*FT);uv.push(x/s.width+.5,y/s.depth+.5);
 }
 const n=32;
 for(let ring=0;ring<rings.length;ring++)for(let i=0;i<n;i++){
  const a=ring*n+i,b=ring*n+(i+1)%n,c=(ring+1)%rings.length*n+(i+1)%n,d=(ring+1)%rings.length*n+i;
  indices.push(a,d,b,b,d,c);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
 geometry.name='Rounded inset stainless kitchen sink';geometry.userData.assetSolid=true;return geometry;
}
