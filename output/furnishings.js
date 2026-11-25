import * as THREE from 'three';
import {RoundedBoxGeometry} from './vendor/RoundedBoxGeometry.js';
import {KITCHEN_SINK,kitchenCounterGeometry,kitchenSinkGeometry,kitchenExhaustRoute} from './kitchen-fixtures.js';
import {furnitureSurfaces,metricSurfaceUV} from './furniture-surfaces.js';

export const FT=.3048;
export const point=(x,y,z)=>new THREE.Vector3(x*FT,z*FT,-y*FT);
const material=(color,roughness=.65,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
export function furnishingBounds(mesh){
 return mesh.userData.partBounds?.map(box=>box.clone().applyMatrix4(mesh.matrixWorld))??
  [new THREE.Box3().setFromObject(mesh)];
}

export function createFurnishings(model){
 const root=new THREE.Group(),items=[],lamps=[],upperServices=[];
 const textile=color=>new THREE.MeshPhysicalMaterial({color,roughness:.92,sheen:.32,sheenColor:'#ede5d1',sheenRoughness:.85});
 const M={wood:material('#795036',.48),darkWood:material('#443125',.54),cream:material('#e8ddc8'),
  linen:textile('#dcd5c5'),green:material('#687561'),pillow:textile('#eee6d6'),black:material('#232b29'),
  brass:material('#ad8b54',.32,.82),ceramic:new THREE.MeshPhysicalMaterial({color:'#eeeae1',roughness:.16,clearcoat:.35,clearcoatRoughness:.12}),
  metal:material('#c6cccc',.18,1),mirror:material('#a8b2ad',.62,0),
  stone:material('#c9c2b1',.36),glass:new THREE.MeshPhysicalMaterial({color:'#d9edf0',transparent:true,opacity:.22,roughness:.08,depthWrite:false,side:THREE.DoubleSide}),
  water:material('#44767d',.13),leaf:material('#466747'),soil:material('#43382b')};
 const geometries=new Map();
 function cached(key,create){if(!geometries.has(key))geometries.set(key,create());return geometries.get(key)}
 const surfaces=furnitureSurfaces(),weave=surfaces.cloth.relief,grain=surfaces.wood.map;
 M.upholstery=textile('#aaa08b');M.cushion=textile('#72836b');M.accent=textile('#9c6852');
 M.paint=material('#667360',.56);M.rug=material('#a18a62',.98);M.steel=material('#b5bdba',.32,1);
 M.granite=material('#51534e',.32);
 const rugData=new Uint8Array(128*128*4);
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){
  const edge=Math.min(x,y,127-x,127-y),band=edge<5||edge>9&&edge<12;
  const value=(band?164:218)+((x%4<2)===(y%4<2)?12:0);
  const i=(y*128+x)*4;rugData[i]=rugData[i+1]=rugData[i+2]=value;rugData[i+3]=255;
 }
 const rugMap=new THREE.DataTexture(rugData,128,128);rugMap.colorSpace=THREE.SRGBColorSpace;
 rugMap.magFilter=THREE.LinearFilter;rugMap.minFilter=THREE.LinearMipmapLinearFilter;rugMap.generateMipmaps=true;rugMap.needsUpdate=true;
 M.rug.map=rugMap;M.rug.bumpMap=weave;M.rug.bumpScale=.0006;
 for(const mat of [M.linen,M.pillow,M.upholstery,M.cushion,M.accent]){
  mat.map=surfaces.cloth.map;mat.bumpMap=weave;mat.bumpScale=.00025;mat.roughnessMap=weave;
 }
 for(const mat of [M.wood,M.darkWood]){
  mat.map=grain;mat.bumpMap=surfaces.wood.relief;mat.bumpScale=.00012;mat.roughnessMap=surfaces.wood.relief;
 }
 for(const mat of [M.stone,M.granite]){
  mat.map=surfaces.stone.map;mat.bumpMap=surfaces.stone.relief;mat.bumpScale=.00008;mat.roughnessMap=surfaces.stone.relief;
 }
 const F=model.dimensions.floor_elevation;
 function box(g,w,d,h,x,y,z,mat,round=0){
  const soft=[M.linen,M.pillow,M.upholstery,M.cushion].includes(mat);
  const radius=Math.min(soft?.2:mat===M.ceramic?.065:.025,Math.min(w,d,h)*.42),segments=[M.linen,M.pillow].includes(mat)?3:soft?2:1;
  const key=['box',w,d,h,radius,segments].join(':');
  const geometry=cached(key,()=>new RoundedBoxGeometry(w*FT,h*FT,d*FT,segments,radius*FT));
  const mesh=new THREE.Mesh(geometry,mat);
  mesh.position.copy(point(x,y,z));if(round)mesh.rotation.y=round;
  mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);return mesh;
 }
 function joined(parts){
  const positions=[],normals=[],uv=[];
  for(const part of parts){
   const g=part.index?part.toNonIndexed():part;
   positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);
   uv.push(...g.attributes.uv.array);g.dispose();if(g!==part)part.dispose();
  }
  const g=new THREE.BufferGeometry();
  for(const [name,data,size]of [['position',positions,3],['normal',normals,3],['uv',uv,2]])
   g.setAttribute(name,new THREE.Float32BufferAttribute(data,size));
  g.userData.assetSolid=true;return g;
 }
 function panel(g,w,h,x,y,z,mat,rotation=0){
  const geometry=cached(['inset-panel',w,h].join(':'),()=>{
   const p=[],uv=[],index=[],rings=[[w,h,-.035],[w,h,.035],[w-.24,h-.24,.035],[w-.28,h-.28,-.005]];
   for(const [width,height,depth]of rings)for(const [sx,sy]of [[-1,-1],[1,-1],[1,1],[-1,1]]){
    p.push(sx*width/2*FT,sy*height/2*FT,depth*FT);uv.push((sx*width/w+1)/2,(sy*height/h+1)/2);
   }
   const quad=(a,b,c,d)=>index.push(a,b,d,b,c,d);
   quad(3,2,1,0);
   for(let i=0;i<4;i++){const j=(i+1)%4;quad(i,j,4+j,4+i);quad(4+i,4+j,8+j,8+i);quad(8+i,8+j,12+j,12+i)}
   quad(12,13,14,15);
   const shape=new THREE.BufferGeometry();shape.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
   shape.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));shape.setIndex(index);
   const flat=shape.toNonIndexed();shape.dispose();flat.computeVertexNormals();
   flat.name='Inset joinery panel';flat.userData.assetSolid=true;return flat;
  });
  const mesh=new THREE.Mesh(geometry,mat);mesh.position.copy(point(x,y,z));mesh.rotation.y=rotation;
  mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);return mesh;
 }
 function pull(g,x,y,z,rotation=0,vertical=false){
  const geometry=cached('mounted-pull',()=>{
   const bar=new THREE.CylinderGeometry(.024*FT,.024*FT,.46*FT,8);
   bar.rotateZ(Math.PI/2);bar.translate(0,0,.085*FT);
   const posts=[-.19,.19].map(x=>{
    const post=new THREE.CylinderGeometry(.022*FT,.022*FT,.07*FT,8);
    post.rotateX(Math.PI/2);post.translate(x*FT,0,.035*FT);return post;
   });
   const roses=[-.19,.19].map(x=>{
    const plate=new THREE.BoxGeometry(.072*FT,.072*FT,.012*FT);
    plate.translate(x*FT,0,.006*FT);return plate;
   });
   return joined([bar,...posts,...roses]);
  });
  const mesh=new THREE.Mesh(geometry,M.brass);mesh.position.copy(point(x,y,z));mesh.rotation.y=rotation;
  if(vertical)mesh.rotateZ(Math.PI/2);
  mesh.name='Mounted cabinet pull';mesh.userData.hardware=true;mesh.castShadow=true;g.add(mesh);return mesh;
 }
 function cushion(g,w,d,h,x,y,z,mat,variation=0){
  const geometry=cached(['tailored-cushion',w,d,h,variation].join(':'),()=>{
   const shape=new THREE.SphereGeometry(1,20,10),p=shape.attributes.position;
   for(let i=0;i<p.count;i++){
    const sx=p.getX(i),sy=p.getY(i),sz=p.getZ(i),power=v=>Math.sign(v)*Math.abs(v)**.38;
    const xx=power(sx),zz=power(sz),edge=1-Math.abs(sy)**2;
    const dent=.045*Math.max(sy,0)*Math.exp(-((xx-.18)**2+(zz+.12)**2)*5);
    const wrinkle=.012*Math.sin(xx*13+zz*9+variation)*edge;
    p.setXYZ(i,xx*w/2*FT,(Math.sign(sy)*Math.abs(sy)**.65-dent+wrinkle)*h/2*FT,zz*d/2*FT);
   }
   shape.computeVertexNormals();
   const n=shape.attributes.normal,sums=new Map(),keys=[];
   for(let i=0;i<p.count;i++){
    const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(':');keys.push(key);
    if(!sums.has(key))sums.set(key,new THREE.Vector3());
    sums.get(key).add(new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)));
   }
   for(let i=0;i<p.count;i++){const normal=sums.get(keys[i]).normalize();n.setXYZ(i,normal.x,normal.y,normal.z)}
   shape.name='Tailored cushion';return shape;
  });
  const mesh=new THREE.Mesh(geometry,mat);mesh.position.copy(point(x,y,z));
  mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);return mesh;
 }
 function welt(w,d){
  return cached(['welt',w,d].join(':'),()=>{
   const f=v=>Math.sign(v)*Math.abs(v)**.38;
   const points=Array.from({length:32},(_,i)=>{const a=i/32*Math.PI*2;return point(w/2*f(Math.cos(a)),d/2*f(Math.sin(a)),0)});
   return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true),32,.007*FT,3,true);
  });
 }
 function duvet(){
  return cached('tailored-duvet',()=>{
   const nx=24,nz=18,w=5.34,d=5.8,positions=[],uv=[],index=[];
   const height=(x,z)=>{
    const smooth=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t)};
    // Follow the rounded mattress edge before hanging outside it; corner drops do not add.
    const bend=distance=>.2-Math.sqrt(Math.max(0,.04-Math.min(.2,Math.max(0,distance))**2));
    const side=bend(Math.abs(x)-2.35)+.18*smooth((Math.abs(x)-2.55)/.12);
    const foot=bend(z-2.625)+.12*smooth((z-2.825)/.075);
    const fold=.045*Math.exp(-(((z+.6+x*.24)/.24)**2));
    return fold+.018*Math.sin(x*5+z*1.7)*Math.sin(z*.8)-Math.max(side,foot);
   };
   for(let skin=0;skin<2;skin++)for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
    const x=(i/nx-.5)*w,z=(j/nz-.5)*d;
    positions.push(x*FT,(height(x,z)+(skin?-.055:.055))*FT,z*FT);uv.push(i/nx,j/nz);
   }
   const layer=(nx+1)*(nz+1),quad=(a,b,c,d)=>index.push(a,b,d,b,c,d);
   for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const a=j*(nx+1)+i,b=a+1,c=b+nx+1,d=a+nx+1;
    quad(a,d,c,b);quad(a+layer,b+layer,c+layer,d+layer);
   }
   const edge=[];
   for(let i=0;i<=nx;i++)edge.push(i);
   for(let j=1;j<=nz;j++)edge.push(j*(nx+1)+nx);
   for(let i=nx-1;i>=0;i--)edge.push(nz*(nx+1)+i);
   for(let j=nz-1;j>0;j--)edge.push(j*(nx+1));
   for(let i=0;i<edge.length;i++){const a=edge[i],b=edge[(i+1)%edge.length];quad(a,b,b+layer,a+layer)}
   const shape=new THREE.BufferGeometry();shape.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
   shape.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));shape.setIndex(index);shape.computeVertexNormals();
   shape.name='Draped duvet';shape.userData.assetSolid=true;return shape;
  });
 }
 function cylinder(g,r,rt,h,x,y,z,mat,segments=24){
  const geometry=cached(['cylinder',r,rt,h,segments].join(':'),()=>new THREE.CylinderGeometry(rt*FT,r*FT,h*FT,segments));
  const mesh=new THREE.Mesh(geometry,mat);
  mesh.position.copy(point(x,y,z));mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);return mesh;
 }
 function between(g,a,b,mat){
  const start=point(...a),end=point(...b),direction=end.clone().sub(start),length=direction.length();
  const geometry=cached('splayed-leg:'+length,()=>new THREE.CylinderGeometry(.065*FT,.045*FT,length,12));
  const mesh=new THREE.Mesh(geometry,mat);mesh.position.copy(start.add(end).multiplyScalar(.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
  mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);
 }
 function ellipsoid(g,rx,ry,rz,x,y,z,mat){
  const small=Math.max(rx,ry,rz)<.2;
  const geometry=cached(mat===M.pillow?'pillow':small?'small-sphere':'sphere',()=>{
   const shape=new THREE.SphereGeometry(1,small?12:24,small?8:16);
   if(mat===M.pillow){
    const p=shape.attributes.position;
    for(let i=0;i<p.count;i++)p.setXYZ(i,...[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.sign(v)*Math.abs(v)**.62));
    shape.computeVertexNormals();
   }
   return shape;
  });
  const mesh=new THREE.Mesh(geometry,mat);mesh.scale.set(rx*FT,rz*FT,ry*FT);
  mesh.position.copy(point(x,y,z));mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);return mesh;
 }
 function bowl(g,rx,ry,h,x,y,z,mat){
  const geometry=cached('hollow-bowl',()=>new THREE.LatheGeometry(
   [[0,0],[.45,0],[.63,.06],[.81,.27],[.94,.62],[.99,.9],[1,.96],[.98,1],[.91,1],[.88,.95],[.86,.87],[.76,.6],[.57,.36],[.3,.3],[0,.3]]
    .map(p=>new THREE.Vector2(...p)),32));
  const mesh=new THREE.Mesh(geometry,mat);mesh.scale.set(rx*FT,h*FT,ry*FT);
  mesh.position.copy(point(x,y,z));mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);return mesh;
 }
 function tap(g,x,y,z,rotation=0){
  const geometry=cached('curved-tap',()=>{
   const curve=new THREE.CubicBezierCurve3(point(0,0,0),point(0,0,.9),point(0,-.55,.9),point(0,-.55,.55));
   const tube=new THREE.TubeGeometry(curve,16,.035*FT,8,false);
   // TubeGeometry has open ends; close both so even the spout is a solid asset.
   const p=Array.from(tube.attributes.position.array),indices=Array.from(tube.index.array),rings=[0,16*9];
   for(let end=0;end<2;end++){
    const center=curve.getPoint(end),index=p.length/3;p.push(center.x,center.y,center.z);
    for(let j=0;j<8;j++){
     const a=rings[end]+j,b=rings[end]+j+1;
     indices.push(index,end?a:b,end?b:a);
    }
   }
   const capped=new THREE.BufferGeometry();capped.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
   capped.setIndex(indices);capped.computeVertexNormals();capped.userData.assetSolid=true;return capped;
  });
  const mesh=new THREE.Mesh(geometry,M.metal);mesh.position.copy(point(x,y,z));mesh.rotation.y=rotation;mesh.castShadow=true;g.add(mesh);
  mesh.userData.outlet=point(0,-.55,.55).toArray();mesh.userData.outletDirection=[0,-1,0];
  const fittings=cached('tap-fittings',()=>{
   const base=new THREE.CylinderGeometry(.07*FT,.07*FT,.09*FT,16);base.translate(0,.045*FT,0);
   const lever=new RoundedBoxGeometry(.035*FT,.04*FT,.19*FT,1,.01*FT);lever.translate(.035*FT,.16*FT,.025*FT);
   return joined([base,lever]);
  });
  const detail=new THREE.Mesh(fittings,M.metal);detail.position.copy(mesh.position);detail.rotation.y=rotation;detail.castShadow=true;g.add(detail);
  return mesh;
 }
 function asset(room,name,kind,fn,{soft=false}={}){
  const group=new THREE.Group();group.name=name;root.add(group);fn(group);
  items.push({room:room.name,name,kind,soft,group});return group;
 }
 function nightstand(g,x,y,face,room){
  box(g,1.15,1.32,1.6,x,y-face*.04,F+.95,M.wood);box(g,1.2,1.45,.12,x,y,F+1.81,M.stone);
  for(const z of [.6,1.25]){
   panel(g,1.03,.55,x,y+face*.66,F+z,M.wood,face>0?Math.PI:0);
   pull(g,x,y+face*.655,F+z,face>0?Math.PI:0);
  }
  const group=new THREE.Group();group.name=room+' bedside lamp '+(x<model.rooms.find(r=>r.name===room).x+6?'left':'right');g.add(group);
  const baseGeometry=cached('lamp-base-and-neck',()=>{
   const base=new THREE.CylinderGeometry(.19*FT,.25*FT,.5*FT,24);
   const neck=new THREE.CylinderGeometry(.065*FT,.065*FT,.13*FT,12);neck.translate(0,.29*FT,0);
   return joined([base,neck]);
  });
  const base=new THREE.Mesh(baseGeometry,M.ceramic);base.position.copy(point(x,y,F+2.12));base.castShadow=true;group.add(base);
  const shade=cylinder(group,.38,.28,.5,x,y,F+2.6,M.cream.clone());
  const bulb=cylinder(group,.07,.07,.12,x,y,F+2.53,material('#f5e4c4'),12);
  const light=new THREE.PointLight('#ffd29b',0,1.3,2);light.position.copy(point(x,y,F+2.5));light.visible=false;group.add(light);
  const side=x<model.rooms.find(r=>r.name===room).x+6?'left':'right';
  const label=room.replace('Bedroom_front_right','Front bedroom').replace('Bedroom_rear_left','Rear-left bedroom').replace('Bedroom_rear_right','Rear-right bedroom')+' - '+side+' lamp';
  lamps.push({id:room+'-'+side,label,group,shade,bulb,light,on:false});
 }
 for(const r of model.rooms.filter(r=>r.name.startsWith('Bedroom'))){
  const front=r.name==='Bedroom_front_right',cx=r.x+(front?7:4.7),head=front?r.y+.55:r.y+r.depth-.55;
  const cy=head+(front?3.5:-3.5),sign=front?-1:1;
  asset(r,r.name+' bed suite','bed',g=>{
   for(const dx of [-2.6,2.6])box(g,.16,6.8,.55,cx+dx,cy,F+.96,M.wood);
   for(const dy of [-3.4,3.4])box(g,5.35,.16,.55,cx,cy+dy,F+.96,M.wood);
   box(g,5.2,6.8,.12,cx,cy,F+1.19,M.darkWood);
   box(g,5.1,6.65,.65,cx,cy,F+1.58,M.linen);
   box(g,5.6,.24,2.9,cx,head,F+1.55,M.cushion);
   for(const dx of [-1.8,0,1.8])box(g,1.76,.13,2.68,cx+dx,head-sign*.15,F+1.58,M.cushion);
   const quilt=new THREE.Mesh(duvet(),M.cushion);quilt.position.copy(point(cx,cy-sign*.5,F+2.005));
   if(front)quilt.rotation.y=Math.PI;quilt.castShadow=true;quilt.receiveShadow=true;g.add(quilt);
   const mattressSeam=new THREE.Mesh(welt(5.05,6.6),M.pillow);
   mattressSeam.position.copy(point(cx,cy,F+1.68));g.add(mattressSeam);
   for(const dx of [-2.4,2.4])for(const dy of [-3.1,3.1])
    cylinder(g,.09,.075,.7,cx+dx,cy+dy,F+.35,M.darkWood,8);
   for(const dx of [-1.25,1.25]){
    const p=cushion(g,2.1,1.3,.48,cx+dx,head-sign*.9,F+2.12,M.pillow,dx<0?0:1);
    p.rotation.y=.035*dx;p.rotation.x=sign*.12;
    const seam=new THREE.Mesh(welt(2.1,1.3),M.linen);seam.position.copy(p.position);seam.rotation.copy(p.rotation);g.add(seam);
   }
   for(const dx of [-3.6,3.6])nightstand(g,cx+dx,head-sign*.9,-sign,r.name);
  });
  asset(r,r.name+' wardrobe','wardrobe',g=>{
   const w=front?2:5.7,d=front?5.7:2,cx=front?r.x+1.3:r.x+r.width-(r.name.includes('rear_right')?3.1:8.6),cy=r.y+(front?3.3:1.3);
   box(g,w-(front?.12:0),d-(front?0:.12),7,cx-(front?.06:0),cy-(front?0:.06),F+3.5,M.wood);
   for(const offset of [-1.9,0,1.9]){
    if(front){
     panel(g,1.86,6.65,cx+w/2-.07,cy+offset,F+3.5,M.cream,Math.PI/2);
     pull(g,cx+w/2-.075,cy+offset+.6,F+3.5,Math.PI/2,true);
    }else{
     panel(g,1.86,6.65,cx+offset,cy+d/2-.07,F+3.5,M.cream,Math.PI);
     pull(g,cx+offset+.6,cy+d/2-.075,F+3.5,Math.PI,true);
    }
   }
  });
 }
 function toilet(g,x,y){
  box(g,1.22,.55,1.55,x,y+.8,F+1.45,M.ceramic);
  box(g,1.25,.58,.08,x,y+.8,F+2.25,M.ceramic);
  bowl(g,.48,.78,1.05,x,y-.08,F+.43,M.ceramic);
  const seatGeometry=cached('toilet-seat',()=>new THREE.LatheGeometry(
   [[.75,0],[.97,0],[1,.025],[1,.07],[.97,.1],[.77,.1],[.73,.07],[.73,.025],[.75,0]]
    .map(p=>new THREE.Vector2(...p)),32));
  const seat=new THREE.Mesh(seatGeometry,M.ceramic);
  seat.scale.set(.52*FT,FT,.72*FT);seat.position.copy(point(x,y-.22,F+1.5));seat.castShadow=true;g.add(seat);
  ellipsoid(g,.27,.39,.015,x,y-.13,F+.78,M.water);
  cylinder(g,.33,.31,.8,x,y+.05,F+.43,M.ceramic);
  cylinder(g,.1,.1,.025,x,y+.8,F+2.3075,M.metal,16);
 }
 function basin(g,x,y,w=1.7){
  box(g,w,1.21,1.95,x,y+.02,F+1.5,M.wood);box(g,w+.12,1.4,.15,x,y,F+2.55,M.stone);
  bowl(g,w*.35,.49,.24,x,y,F+2.625,M.ceramic);
  cylinder(g,.04,.04,.012,x,y,F+2.704,M.metal,12);
  tap(g,x,y+.45,F+2.65);
  for(const dz of [1,1.95]){
   panel(g,w-.13,.78,x,y-.6,F+dz,M.wood);
   pull(g,x,y-.595,F+dz+.2);
  }
  box(g,w, .035,1.7,x,y+.64,F+4.65,M.mirror);
 }
 function shower(g,x,y,size=2.6){
  box(g,size,size,.12,x,y,F+.1,M.ceramic);
  box(g,size,.03,6.6,x,y-size/2,F+3.45,M.glass);
  cylinder(g,.035,.035,3.4,x,y+size/2-.16,F+4.8,M.metal);
  box(g,.07,.7,.07,x,y+size/2-.45,F+6.5,M.metal);box(g,.55,.55,.05,x,y+size/2-.72,F+6.46,M.metal);
  box(g,.4,.08,.2,x,y+size/2-.2,F+3.5,M.metal);
 }
 for(const r of model.rooms){
  if(r.name==='WC')asset(r,'Common WC sanitary fixture','toilet',g=>toilet(g,r.x+r.width/2,r.y+r.depth-1.3));
  if(r.name==='Common_bath')asset(r,'Common bath shower','shower',g=>shower(g,r.x+r.width/2,r.y+r.depth-1.5,2.6));
  if(r.name==='Attached_bath'||r.name==='Bath_right'){
   asset(r,r.name+' toilet','toilet',g=>toilet(g,r.x+.95,r.y+r.depth-1.3));
   asset(r,r.name+' shower','shower',g=>shower(g,r.x+r.width-1.55,r.y+r.depth-1.5,2.6));
   asset(r,r.name+' vanity','basin',g=>basin(g,r.x+1.05,r.y+3.45,1.7));
  }
  if(r.name==='Wash_point')asset(r,'Rear common washbasin','basin',g=>basin(g,r.x+r.width/2,r.y+r.depth-.9,2.5));
 }
 const kitchen=model.rooms.find(r=>r.name==='Kitchen');
 asset(kitchen,'L-shaped kitchen cabinetry and appliances','kitchen',g=>{
  const x=kitchen.x,y=kitchen.y;
  box(g,2,11.4,2.3,x+1.12,y+5.9,F+1.575,M.paint);
  const carcass=box(g,9.3,2,2.3,x+6.77,y+1.12,F+1.575,M.paint);
  carcass.name='Kitchen sink cabinet carcass';
  carcass.geometry=cached('hollow-kitchen-carcass',()=>{
   const pieces=[];
   for(const [w,d,h,dx,dy,dz]of [[9.2,1.9,.12,0,0,-1.10],[9.3,.08,2.3,0,-.96,0],
    [.08,1.94,2.3,-4.60,.03,0],[.08,1.94,2.3,4.60,.03,0],[9.22,.08,.3,0,.92,1.0]]){
    const piece=new THREE.BoxGeometry(w*FT,h*FT,d*FT);piece.translate(dx*FT,dz*FT,-dy*FT);pieces.push(piece);
   }
   return joined(pieces);
  });
  box(g,1.7,11.1,.4,x+.99,y+5.9,F+.2,M.darkWood);
  box(g,9.1,1.7,.4,x+6.77,y+.99,F+.2,M.darkWood);
  box(g,2.12,11.5,.18,x+1.12,y+5.9,F+2.83,M.granite);
  const counter=new THREE.Mesh(cached('recessed-kitchen-counter',kitchenCounterGeometry),M.granite);
  counter.name='Kitchen cutout countertop';counter.position.copy(point(x,y,F+2.74));counter.castShadow=true;counter.receiveShadow=true;g.add(counter);
  for(let i=0;i<5;i++){
   panel(g,1.75,2.1,x+2.145,y+3.1+i*1.85,F+1.5,M.paint,Math.PI/2);
   panel(g,1.6,2.1,x+3.1+i*1.7,y+2.145,F+1.5,M.paint,Math.PI);
   pull(g,x+2.14,y+3.1+i*1.85,F+2.25,Math.PI/2);
   pull(g,x+3.1+i*1.7,y+2.14,F+2.25,Math.PI);
  }
  box(g,2.45,2.5,6.3,x+4.1,y+10.55,F+3.15,M.metal).name='Kitchen refrigerator';
  const fridgeHandle=box(g,.08,.1,1.7,x+5.05,y+9.25,F+3.9,M.black);
  fridgeHandle.geometry=cached('fridge-handle-and-freezer-reveal',()=>{
   const reveal=new THREE.BoxGeometry(2.35*FT,.012*FT,.008*FT);reveal.translate(-.95*FT,FT,-.052*FT);
   const freezerGrip=new THREE.BoxGeometry(.08*FT,.45*FT,.1*FT);freezerGrip.translate(0,1.5*FT,0);
   return joined([fridgeHandle.geometry.clone(),reveal,freezerGrip]);
  });
  box(g,2.8,.8,2.25,x+7,y+11.5,F+6.1,M.cream).name='Kitchen upper cabinet';
  for(const dx of [-.7,.7]){
   panel(g,1.34,2.15,x+7+dx,y+11.08,F+6.1,M.cream);
   pull(g,x+7+dx-Math.sign(dx)*.42,y+11.085,F+5.65,0,true);
  }
  const s=KITCHEN_SINK,sink=new THREE.Mesh(cached('inset-stainless-sink',kitchenSinkGeometry),M.steel);
  sink.name='Kitchen inset steel sink';sink.position.copy(point(x+s.x,y+s.y,F+2.92));sink.castShadow=true;sink.receiveShadow=true;g.add(sink);
  cylinder(g,.075,.075,.012,x+s.x,y+s.y,F+2.305,M.black,16).name='Kitchen sink waste';
  tap(g,x+s.tapX,y+s.tapY,F+2.95,s.tapRotation).name='Kitchen tap spout';
  box(g,1.7,2.35,.04,x+1.15,y+6.3,F+2.96,M.black).name='Kitchen hob';
  const burnerGeometry=cached('burner',()=>new THREE.TorusGeometry(.2*FT,.025*FT,6,20));
  for(const dx of [-.4,.4])for(const dy of [-.65,.65]){const burner=new THREE.Mesh(burnerGeometry,M.metal);burner.rotation.x=Math.PI/2;burner.position.copy(point(x+1.15+dx,y+6.3+dy,F+3));g.add(burner)}
  const hood=new THREE.Group();hood.name='Kitchen suspended extractor - provisional south-wall exhaust';g.add(hood);
  const spec=model.services.kitchen_exhaust;
  const clearance=spec.hood_clearance_mm/1000/FT,bottom=F+3.025+clearance,hx=x+1.15,hy=y+6.3;
  hood.userData={conceptOnly:true,mount:'ceiling-suspended',hobClearanceMM:spec.hood_clearance_mm,
   unresolved:spec.note};
  box(hood,spec.canopy_depth_mm/1000/FT,spec.canopy_width_mm/1000/FT,.055/FT,hx,hy,bottom+.03+.0275/FT,M.steel).name='Extractor capture canopy';
  box(hood,1.3,1.8,.025,hx,hy,bottom+.0125,M.black).name='Extractor underside filter';
  const baffleGeometry=cached('extractor-baffles',()=>{
   const parts=[];
   for(let i=0;i<9;i++){
    const p=new THREE.BoxGeometry(.012*FT,.012*FT,1.6*FT);p.translate((i-4)*.13*FT,0,0);parts.push(p);
   }
   return joined(parts);
  });
  const baffles=new THREE.Mesh(baffleGeometry,M.steel);baffles.position.copy(point(hx,hy,bottom+.008));hood.add(baffles);
  const roof=model.objects.find(record=>record.name==='Hip Roof Left');
  if(!roof)throw new Error('Suspended extractor needs the approved left roof envelope.');
  const minRoofX=Math.min(...roof.vertices.map(p=>p[0])),maxRoofX=Math.max(...roof.vertices.map(p=>p[0]));
  const wallTop=F+model.dimensions.wall_height,slope=(model.dimensions.monitor_base-wallTop)/(maxRoofX-minRoofX);
  const upper=new THREE.Group();upper.name='Upper kitchen exhaust and suspension - omitted in cutaway';
  hood.add(upper);upperServices.push(upper);
  hood.userData.roofInterface='Four illustrative suspension rods only; exhaust turns to SOUTH wall. No roof penetration; fixings/support unverified.';
  const rods=[];
  for(const dx of [-.75,.75])for(const dy of [-.95,.95]){
   const top=wallTop+(hx+dx-minRoofX)*slope-.06,low=spec.duct_start[2];
   const rod=new THREE.CylinderGeometry(.006,.006,(top-low)*FT,8);
   rod.translate((hx+dx)*FT,(top+low)/2*FT,-(hy+dy)*FT);rods.push(rod);
  }
  const support=new THREE.Mesh(joined(rods),M.metal);support.name='Illustrative ceiling suspension rods - not exhaust';upper.add(support);
  const route=kitchenExhaustRoute(spec),r=spec.duct_diameter_mm/2000;
  const outer=new THREE.TubeGeometry(route.curve,40,r,16,false),parts=[outer];
  const inner=new THREE.TubeGeometry(route.curve,40,r-.0015,16,false),indices=inner.index.array;
  for(let i=0;i<indices.length;i+=3)[indices[i],indices[i+2]]=[indices[i+2],indices[i]];
  inner.computeVertexNormals();parts.push(inner);
  for(const t of [0,1]){
   const positions=[],normal=route.curve.getTangent(t).multiplyScalar(t?1:-1);
   const at=(geometry,i)=>new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,(t?40*17:0)+i);
   for(let i=0;i<16;i++)for(const tri of [[at(outer,i),at(outer,i+1),at(inner,i)],
    [at(outer,i+1),at(inner,i+1),at(inner,i)]]){
    if(new THREE.Vector3().subVectors(tri[1],tri[0]).cross(new THREE.Vector3().subVectors(tri[2],tri[0])).dot(normal)<0)
     [tri[1],tri[2]]=[tri[2],tri[1]];
    for(const p of tri)positions.push(...p.toArray());
   }
   const ring=new THREE.BufferGeometry();ring.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
   ring.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));
   ring.computeVertexNormals();parts.push(ring);
  }
  const duct=new THREE.Mesh(joined(parts),M.steel);duct.name='Continuous hollow metal exhaust - two long-radius turns to SOUTH wall';
  duct.castShadow=duct.receiveShadow=true;duct.userData.exhaustRoute={...spec,centerlineLengthMM:route.total*FT*1000};
  upper.add(duct);
  const [,wy,wz]=spec.wall_center,centerZ=wz-spec.wall_center[0]*Math.tan(spec.fall_degrees*Math.PI/180);
  const plate=new THREE.Shape([[-.14,-.14],[.14,-.14],[.14,.14],[-.14,.14]].map(p=>new THREE.Vector2(...p)));
  const opening=new THREE.Path();opening.absarc(0,0,spec.wall_opening_diameter_mm/2000,0,2*Math.PI,false);plate.holes.push(opening);
  const plateMesh=new THREE.Mesh(new THREE.ExtrudeGeometry(plate,{depth:.002,bevelEnabled:false,curveSegments:16}),M.steel);
  plateMesh.rotation.y=-Math.PI/2;plateMesh.position.copy(point(-.005,wy,centerZ));
  plateMesh.name='South-wall terminal weathering plate - flashing and sealing provisional';upper.add(plateMesh);
  const sealShape=new THREE.Shape();sealShape.absarc(0,0,spec.wall_opening_diameter_mm/2000,0,2*Math.PI,false);
  const sealHole=new THREE.Path();sealHole.absarc(0,0,r,0,2*Math.PI,false);sealShape.holes.push(sealHole);
  const seal=new THREE.Mesh(new THREE.ExtrudeGeometry(sealShape,{depth:.003,bevelEnabled:false,curveSegments:16}),M.black);
  seal.rotation.y=-Math.PI/2;seal.position.copy(point(-.008,wy,centerZ));
  seal.name='Provisional annular weather seal - not a screen';upper.add(seal);
  const shellParts=[];
  const cheek=new THREE.Shape([[0,.14],[-.22,.08],[-.22,-.12],[0,-.14]].map(p=>new THREE.Vector2(...p)));
  for(const side of [-1,1]){
   const geometry=new THREE.ExtrudeGeometry(cheek,{depth:.002,bevelEnabled:false});
   geometry.translate(-.003,centerZ*FT,-wy*FT+side*.13-.001);shellParts.push(geometry);
  }
  const lid=new THREE.BoxGeometry(Math.hypot(.22,.06),.002,.26);lid.rotateZ(Math.atan2(.06,.22));
  lid.translate(-.113,centerZ*FT+.11,-wy*FT);shellParts.push(lid);
  const apron=new THREE.BoxGeometry(.002,.2,.26);apron.translate(-.223,centerZ*FT-.02,-wy*FT);shellParts.push(apron);
  const cowl=new THREE.Mesh(joined(shellParts),M.steel);
  cowl.name='Protected downward-open wall exhaust cowl - no fine mesh';cowl.castShadow=true;upper.add(cowl);
  const outlet=route.nativeAt(1),flapPivot=new THREE.Group();flapPivot.position.copy(point(outlet[0],wy,outlet[2]+(r-.003)/FT));
  const flap=new THREE.Mesh(new THREE.CylinderGeometry(r-.003,r-.003,.0015,16),M.metal);
  flap.rotation.z=Math.PI/2;flap.position.y=-(r-.003);
  flapPivot.rotation.z=-Math.PI/12;flapPivot.name='Illustrative backdraft flap - shown partly open, appliance compatibility unverified';
  flapPivot.add(flap);upper.add(flapPivot);
  for(const mesh of [duct,plateMesh,seal,cowl,flap])mesh.userData.kitchenExhaust=true;
  for(const dy of [-.92,.92])box(hood,.12,.19,.015,hx+.65,hy+dy,bottom+.0075,M.cream);
  box(hood,.018,.5,.08,hx+.6/FT/2+.003,hy,bottom+.075,M.black).name='Extractor front controls';
 });
 const dining=model.rooms.find(r=>r.name==='Dining_central_zone'),cx=dining.x+dining.width/2,cy=dining.y+5;
 asset(dining,'Dining table','table',g=>{
  box(g,6,3,.18,cx,cy,F+2.48,M.wood);
  for(const xx of [-2.4,2.4])for(const yy of [-1,1])cylinder(g,.065,.095,2.4,cx+xx,cy+yy,F+1.2,M.darkWood,12);
  for(const yy of [-1.1,1.1])box(g,5,.1,.35,cx,cy+yy,F+2.15,M.darkWood);
  cylinder(g,.33,.2,.65,cx,cy,F+2.9,M.ceramic);
  for(let i=0;i<5;i++)ellipsoid(g,.16,.12,.08,cx+Math.cos(i)*.35,cy+Math.sin(i)*.3,F+3.25,M.leaf);
 });
 function chair(x,y,rotation){
  asset(dining,'Dining chair '+items.length,'chair',g=>{
   const local=new THREE.Group();local.position.copy(point(x,y,F));local.rotation.y=rotation;g.add(local);
   box(local,1.5,1.55,.12,0,0,1.38,M.wood);
   box(local,1.44,1.48,.18,0,0,1.52,M.cushion);
   const geometry=cached('curved-chair-back',()=>{
    const shape=new THREE.Shape();shape.moveTo(-.7,.58);shape.quadraticCurveTo(0,.84,.7,.58);
    shape.lineTo(.7,.68);shape.quadraticCurveTo(0,.94,-.7,.68);shape.closePath();
    return new THREE.ExtrudeGeometry(shape,{depth:.62,bevelEnabled:true,bevelSegments:2,
     bevelSize:.025,bevelThickness:.025,steps:1,curveSegments:8});
   });
   const back=new THREE.Mesh(geometry,M.wood);back.scale.setScalar(FT);back.rotation.x=-Math.PI/2;
   back.position.y=2.14*FT;back.castShadow=true;back.receiveShadow=true;local.add(back);
   for(const xx of [-.57,.57])for(const yy of [-.58,.58]){
    const rear=yy>0,height=rear?2.75:1.42;
    between(local,[xx+Math.sign(xx)*.055,rear?.76:-.70,.012],
     [rear?Math.sign(xx)*.60:xx,rear?.70:yy,height],M.darkWood);
   }
   for(const xx of [-.56,.56]){
    const rail=cylinder(local,.035,.035,1.16,xx,0,.58,M.darkWood,12);rail.rotation.x=Math.PI/2;
   }
  });
 }
 for(const dx of [-2,0,2]){chair(cx+dx,cy-2.65,Math.PI);chair(cx+dx,cy+2.65,0)}
 chair(cx-4.1,cy,Math.PI/2);chair(cx+4.1,cy,-Math.PI/2);
 const hall=model.rooms.find(r=>r.name==='Hall');
 asset(hall,'Living sofa','sofa',g=>{
  const x=hall.x+1.7,y=hall.y+6.7;
  box(g,2.65,6.7,.62,x,y,F+.8,M.upholstery);box(g,.4,6.7,1.8,x-1.12,y,F+1.7,M.upholstery);
  for(const dy of [-2.9,2.9])box(g,2.5,.4,1.4,x,y+dy,F+1.4,M.upholstery);
  const seams=[];
  for(const [i,dy]of [-1.95,0,1.95].entries()){
   const seat=cushion(g,2.1,1.85,.37,x+.1,y+dy,F+1.3,M.linen,i%2);
   const back=cushion(g,.45,1.8,1.28,x-.72,y+dy,F+2.1,M.linen,i%2);back.rotation.z=.12;
   const seam=welt(2.1,1.85).clone();seam.applyMatrix4(seat.matrix.compose(seat.position,seat.quaternion,seat.scale));seams.push(seam);
  }
  const stitching=new THREE.Mesh(joined(seams),M.pillow);g.add(stitching);
  for(const dx of [-.95,.95])for(const dy of [-2.65,2.65])cylinder(g,.07,.06,.5,x+dx,y+dy,F+.25,M.darkWood,8);
  for(const dy of [-2.2,2.2]){
   const accent=cushion(g,.4,.95,.95,x-.48,y+dy,F+2.02,dy>0?M.accent:M.cushion,dy>0?1:0);
   accent.rotation.z=dy>0?.12:-.12;
  }
 });
 asset(hall,'Living coffee table','table',g=>{box(g,2.1,3.1,.12,hall.x+4.75,hall.y+6.7,F+1.35,M.wood);for(const dy of [-1.1,1.1])box(g,1.5,.12,1.3,hall.x+4.75,hall.y+6.7+dy,F+.67,M.black)});
 asset(hall,'Living rug','rug',g=>box(g,7,7,.025,hall.x+6.3,hall.y+6.7,F+.035,M.rug),{soft:true});
 asset(hall,'Media console and screen','media',g=>{
  box(g,.85,6.6,1.4,hall.x+hall.width-.575,hall.y+6.6,F+.8,M.wood);
  for(const dy of [-2.15,0,2.15]){
   panel(g,2.08,1.16,hall.x+hall.width-1.03,hall.y+6.6+dy,F+.8,M.wood,-Math.PI/2);
   pull(g,hall.x+hall.width-1.025,hall.y+6.6+dy,F+.95,-Math.PI/2);
  }
  box(g,.1,4.6,2.5,hall.x+hall.width-.25,hall.y+6.6,F+3.2,M.black);
 });
 const prayer=model.rooms.find(r=>r.name==='Prayer');
 asset(prayer,'Prayer alcove cabinet','cabinet',g=>{
  box(g,4.5,1.15,2.3,prayer.x+3,prayer.y+prayer.depth-.725,F+1.15,M.wood);
  for(const dx of [-1.12,1.12]){
   panel(g,2.17,2.1,prayer.x+3+dx,prayer.y+prayer.depth-1.33,F+1.15,M.wood);
   pull(g,prayer.x+3+dx-Math.sign(dx)*.78,prayer.y+prayer.depth-1.325,F+1.45,0,true);
  }
  box(g,4.6,.12,3,prayer.x+3,prayer.y+prayer.depth-.18,F+3.8,M.cream);
  for(const dx of [-1.4,1.4])cylinder(g,.15,.13,.45,prayer.x+3+dx,prayer.y+prayer.depth-.75,F+2.55,M.brass);
 });
 for(const item of items){
  const pulls=item.group.children.filter(child=>child.userData.hardware);
  if(pulls.length<2)continue;
  const mounts=pulls.map(mesh=>({position:mesh.position.toArray(),quaternion:mesh.quaternion.toArray()}));
  const partBounds=pulls.map(mesh=>{
   mesh.geometry.computeBoundingBox();mesh.updateMatrix();return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix);
  });
  const parts=pulls.map(mesh=>{mesh.updateMatrix();return mesh.geometry.clone().applyMatrix4(mesh.matrix)});
  const combined=new THREE.Mesh(joined(parts),M.brass);
  combined.name='Mounted cabinet pulls';combined.userData={hardware:true,mounts,partBounds};combined.castShadow=true;
  item.group.remove(...pulls);item.group.add(combined);
 }
 const mapped=new Set();
 root.traverse(mesh=>{
  if(mesh.isMesh&&mesh.material.map&&mesh.material!==M.rug&&!mapped.has(mesh.geometry)){
   metricSurfaceUV(mesh.geometry,mesh.scale);mapped.add(mesh.geometry);
  }
 });
 return {root,items,materials:M,lamps,setServiceView(view){
  for(const upper of upperServices)upper.visible=view==='exterior'||view==='interior';
 }};
}
