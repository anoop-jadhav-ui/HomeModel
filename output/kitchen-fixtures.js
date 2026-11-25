import * as THREE from 'three';

const FT=.3048;
export function kitchenExhaustRoute(spec){
 const [x,y,z]=spec.duct_start,[wx,wy,wz]=spec.wall_center;
 const radius=spec.bend_centerline_radius_mm/1000/FT,slope=Math.tan(spec.fall_degrees*Math.PI/180);
 const straight=wy-y-2*radius,endX=-spec.outlet_projection_mm/1000/FT;
 const top=wz+slope*(straight+radius*Math.PI/2+x-radius-wx);
 const lengths=[top-radius+slope*radius-z,radius*Math.PI/2,straight,radius*Math.PI/2,x-radius-endX];
 if(lengths.some(length=>!Number.isFinite(length)||length<=0))
  throw new Error('Kitchen exhaust route needs positive upright, separated bends and an outward outlet.');
 const total=lengths.reduce((sum,length)=>sum+length,0);
 const nativeAt=t=>{
  let distance=THREE.MathUtils.clamp(t,0,1)*total,index=0;
  while(index<lengths.length-1&&distance>lengths[index])distance-=lengths[index++];
  const angle=distance/radius;
  if(index===0)return [x,y,z+distance];
  if(index===1)return [x,y+radius-radius*Math.cos(angle),top-radius+radius*Math.sin(angle)+slope*radius*Math.cos(angle)];
  if(index===2)return [x,y+radius+distance,top-slope*distance];
  if(index===3)return [x-radius+radius*Math.cos(angle),wy-radius+radius*Math.sin(angle),top-slope*(straight+distance)];
  return [x-radius-distance,wy,top-slope*(straight+radius*Math.PI/2+distance)];
 };
 class Route extends THREE.Curve{
  getPoint(t,target=new THREE.Vector3()){
   const [px,py,pz]=nativeAt(t);return target.set(px*FT,pz*FT,-py*FT);
  }
 }
 return {curve:new Route(),nativeAt,lengths,total,wallParameter:1-(wx-endX)/total};
}

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
