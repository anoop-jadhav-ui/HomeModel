import * as THREE from 'three';
import {RoundedBoxGeometry} from './vendor/RoundedBoxGeometry.js';

export const FT=.3048;
export const point=(x,y,z)=>new THREE.Vector3(x*FT,z*FT,-y*FT);
const material=(color,roughness=.65,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});

export function createFurnishings(model){
 const root=new THREE.Group(),items=[];
 const M={wood:material('#916344'),darkWood:material('#513d2d'),cream:material('#e8ddc8'),
  linen:material('#e7e5d9'),green:material('#748774'),pillow:material('#faf7ed'),black:material('#232b29'),
  brass:material('#af9972',.28,.75),ceramic:material('#f7f5eb',.22),metal:material('#aab7b9',.22,.85),
  stone:material('#ded8c9',.4),glass:new THREE.MeshPhysicalMaterial({color:'#d9edf0',transparent:true,opacity:.22,roughness:.08,depthWrite:false,side:THREE.DoubleSide}),
  water:material('#44767d',.13),leaf:material('#466747'),soil:material('#43382b')};
 const geometries=new Map();
 function cached(key,create){if(!geometries.has(key))geometries.set(key,create());return geometries.get(key)}
 function surface(kind){
  const size=64,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const noise=((x*73+y*137+x*y*19)%53)/53;
   const value=kind==='cloth'?220+((x%4<2)===(y%4<2)?15:0)+noise*12:
    233+Math.sin(x*.65+Math.sin(y*.08)*1.8)*8+noise*8;
   const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;
  }
  const t=new THREE.DataTexture(data,size,size);t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;
  return t;
 }
 const weave=surface('cloth'),grain=surface('wood');
 for(const mat of [M.linen,M.pillow,M.green,M.cream]){
  mat.bumpMap=weave;mat.bumpScale=.001*FT;mat.roughness=.88;
 }
 for(const mat of [M.wood,M.darkWood]){mat.map=grain;mat.roughness=.52}
 M.upholstery=M.cream.clone();M.cushion=M.green.clone();
 const F=model.dimensions.floor_elevation;
 function box(g,w,d,h,x,y,z,mat,round=0){
  const soft=[M.linen,M.pillow,M.upholstery,M.cushion].includes(mat);
  const radius=Math.min(soft?.2:.045,Math.min(w,d,h)*.42),segments=[M.linen,M.pillow].includes(mat)?3:soft?2:1;
  const key=['box',w,d,h,radius,segments].join(':');
  const geometry=cached(key,()=>new RoundedBoxGeometry(w*FT,h*FT,d*FT,segments,radius*FT));
  const mesh=new THREE.Mesh(geometry,mat);
  mesh.position.copy(point(x,y,z));if(round)mesh.rotation.y=round;
  mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);return mesh;
 }
 function cylinder(g,r,rt,h,x,y,z,mat,segments=24){
  const geometry=cached(['cylinder',r,rt,h,segments].join(':'),()=>new THREE.CylinderGeometry(rt*FT,r*FT,h*FT,segments));
  const mesh=new THREE.Mesh(geometry,mat);
  mesh.position.copy(point(x,y,z));mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);return mesh;
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
   [[0,0],[.45,0],[.65,.08],[.83,.3],[.96,.65],[1,.93],[.98,1],[.88,1],[.86,.9],[.77,.63],[.6,.4],[.35,.3],[0,.3]]
    .map(p=>new THREE.Vector2(...p)),32));
  const mesh=new THREE.Mesh(geometry,mat);mesh.scale.set(rx*FT,h*FT,ry*FT);
  mesh.position.copy(point(x,y,z));mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);return mesh;
 }
 function tap(g,x,y,z){
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
  const mesh=new THREE.Mesh(geometry,M.metal);mesh.position.copy(point(x,y,z));mesh.castShadow=true;g.add(mesh);
 }
 function asset(room,name,kind,fn,{soft=false}={}){
  const group=new THREE.Group();group.name=name;root.add(group);fn(group);
  items.push({room:room.name,name,kind,soft,group});return group;
 }
 function nightstand(g,x,y,face){
  box(g,1.15,1.32,1.6,x,y-face*.04,F+.95,M.wood);box(g,1.2,1.45,.12,x,y,F+1.81,M.stone);
  for(const z of [.6,1.25]){
   box(g,1.03,.04,.55,x,y+face*.66,F+z,M.wood);
   box(g,.4,.04,.035,x,y+face*.7,F+z,M.brass);
  }
  cylinder(g,.25,.19,.5,x,y,F+2.12,M.ceramic);cylinder(g,.38,.28,.5,x,y,F+2.6,M.cream);
  cylinder(g,.065,.065,.13,x,y,F+2.41,M.brass,12);
 }
 for(const r of model.rooms.filter(r=>r.name.startsWith('Bedroom'))){
  const front=r.name==='Bedroom_front_right',cx=r.x+(front?7:4.7),head=front?r.y+.55:r.y+r.depth-.55;
  const cy=head+(front?3.5:-3.5),sign=front?-1:1;
  asset(r,r.name+' bed suite','bed',g=>{
   box(g,5.4,7,1.15,cx,cy,F+.7,M.wood);box(g,5.1,6.65,.65,cx,cy,F+1.58,M.linen);
   box(g,5.6,.24,2.9,cx,head,F+1.55,M.cushion);
   const quilt=box(g,5.32,3.8,.18,cx,cy-sign*.95,F+1.98,M.cushion);
   quilt.geometry=cached('draped-duvet',()=>{
    const shape=quilt.geometry.clone(),p=shape.attributes.position,n=shape.attributes.normal;
    shape.name='Draped duvet';
    for(let i=0;i<p.count;i++){
     const x=p.getX(i)/FT,z=p.getZ(i)/FT;
     const drop=.22*Math.max(0,(Math.abs(x)-2.41)/.25);
     p.setY(i,p.getY(i)+(Math.sin(x*3+z*2)*.012-drop)*FT);
     // Transform the original smooth normals with the height-field deformation.
     const dx=.036*Math.cos(x*3+z*2)-(Math.abs(x)>2.41?.88*Math.sign(x):0);
     const dz=.024*Math.cos(x*3+z*2),normal=new THREE.Vector3(n.getX(i)-dx*n.getY(i),n.getY(i),n.getZ(i)-dz*n.getY(i)).normalize();
     n.setXYZ(i,normal.x,normal.y,normal.z);
    }
    return shape;
   });
   box(g,5.05,.34,.12,cx,cy+sign*.73,F+2.08,M.linen);
   for(const dx of [-1.8,0,1.8])for(const z of [1.25,2.25])
    ellipsoid(g,.035,.02,.035,cx+dx,head-sign*.125,F+z,M.green);
   for(const dx of [-2.4,2.4])for(const dy of [-3.1,3.1])
    cylinder(g,.09,.075,.2,cx+dx,cy+dy,F+.1,M.darkWood,8);
   for(const dx of [-1.25,1.25]){
    const p=ellipsoid(g,1.05,.65,.23,cx+dx,head-sign*.9,F+2.1,M.pillow);p.rotation.y=.035*dx;
    const geometry=cached('pillow-welting',()=>{
     const points=Array.from({length:48},(_,i)=>{
      const a=i/48*Math.PI*2,f=v=>Math.sign(v)*Math.abs(v)**.62;
      return point(1.05*f(Math.cos(a)),.65*f(Math.sin(a)),0);
     });
     return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true),48,.008*FT,3,true);
    });
    const seam=new THREE.Mesh(geometry,M.linen);seam.position.copy(p.position);seam.rotation.copy(p.rotation);g.add(seam);
   }
   for(const dx of [-3.6,3.6])nightstand(g,cx+dx,head-sign*.9,-sign);
  });
  asset(r,r.name+' wardrobe','wardrobe',g=>{
   const w=front?2:5.7,d=front?5.7:2,cx=front?r.x+1.3:r.x+r.width-(r.name.includes('rear_right')?3.1:8.6),cy=r.y+(front?3.3:1.3);
   box(g,w-(front?.12:0),d-(front?0:.12),7,cx-(front?.06:0),cy-(front?0:.06),F+3.5,M.wood);
   for(const offset of [-1.9,0,1.9]){
    if(front){
     box(g,.055,1.86,6.65,cx+w/2-.07,cy+offset,F+3.5,M.cream);
     cylinder(g,.025,.025,.65,cx+w/2+.015,cy+offset+.6,F+3.5,M.brass,12);
    }else{
     box(g,1.86,.055,6.65,cx+offset,cy+d/2-.07,F+3.5,M.cream);
     cylinder(g,.025,.025,.65,cx+offset+.6,cy+d/2+.015,F+3.5,M.brass,12);
    }
   }
  });
 }
 function toilet(g,x,y){
  box(g,1.22,.55,1.55,x,y+.8,F+1.45,M.ceramic);
  box(g,1.25,.58,.08,x,y+.8,F+2.25,M.ceramic);
  bowl(g,.48,.78,1.05,x,y-.08,F+.43,M.ceramic);
  const seatShape=new THREE.Shape();seatShape.absarc(0,0,1,0,Math.PI*2,false);
  const hole=new THREE.Path();hole.absarc(0,0,.73,0,Math.PI*2,true);seatShape.holes.push(hole);
  const seatGeometry=cached('toilet-seat',()=>new THREE.ExtrudeGeometry(seatShape,
   {depth:.1,bevelEnabled:true,bevelSegments:2,bevelSize:.02,bevelThickness:.02,steps:1,curveSegments:32}));
  const seat=new THREE.Mesh(seatGeometry,M.ceramic);
  seat.rotation.x=-Math.PI/2;seat.scale.set(.52*FT,.72*FT,FT);seat.position.copy(point(x,y-.22,F+1.5));g.add(seat);
  ellipsoid(g,.27,.39,.015,x,y-.13,F+.78,M.water);
  cylinder(g,.33,.31,.8,x,y+.05,F+.43,M.ceramic);
  box(g,.18,.08,.08,x+.32,y+.48,F+2.12,M.brass);
 }
 function basin(g,x,y,w=1.7){
  box(g,w,1.21,1.95,x,y+.02,F+1.5,M.wood);box(g,w+.12,1.4,.15,x,y,F+2.55,M.stone);
  bowl(g,w*.35,.49,.24,x,y,F+2.625,M.ceramic);
  cylinder(g,.04,.04,.012,x,y,F+2.704,M.metal,12);
  tap(g,x,y+.45,F+2.65);
  for(const dz of [1,1.95]){
   box(g,w-.13,.035,.78,x,y-.6,F+dz,M.wood);
   box(g,.45,.04,.04,x,y-.68,F+dz+.2,M.brass);
  }
  box(g,w, .035,1.7,x,y+.64,F+4.1,M.metal);
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
  box(g,2,11.4,2.65,x+1.12,y+5.9,F+1.4,M.green);
  box(g,9.3,2,2.65,x+6.77,y+1.12,F+1.4,M.green);
  box(g,2.12,11.5,.18,x+1.12,y+5.9,F+2.83,M.stone);
  box(g,9.4,2.12,.18,x+6.77,y+1.12,F+2.83,M.stone);
  for(let i=0;i<5;i++){
   box(g,.035,1.65,2.1,x+2.145,y+1.3+i*2.15,F+1.5,M.green);
   box(g,1.6,.035,2.1,x+3.1+i*1.7,y+2.145,F+1.5,M.green);
   box(g,.035,.5,.04,x+2.18,y+1.3+i*2.15,F+2.25,M.brass);
   box(g,.5,.035,.04,x+3.1+i*1.7,y+2.18,F+2.25,M.brass);
  }
  box(g,2.45,2.5,6.3,x+4.1,y+10.55,F+3.15,M.metal);
  box(g,.08,.1,1.7,x+5.05,y+9.25,F+3.9,M.black);
  box(g,4.7,.8,2.25,x+6.1,y+11.5,F+6.1,M.cream);
  bowl(g,.95,.6,.16,x+6.2,y+1.15,F+2.92,M.metal);
  cylinder(g,.045,.045,.012,x+6.2,y+1.15,F+2.975,M.metal,12);
  tap(g,x+6.2,y+1.72,F+2.95);
  box(g,1.7,2.35,.04,x+1.15,y+6.3,F+2.96,M.black);
  for(const dx of [-.4,.4])for(const dy of [-.65,.65]){const burner=new THREE.Mesh(new THREE.TorusGeometry(.2*FT,.025*FT,8,24),M.metal);burner.rotation.x=Math.PI/2;burner.position.copy(point(x+1.15+dx,y+6.3+dy,F+3));g.add(burner)}
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
   box(local,1.5,1.55,.18,0,0,1.5,M.cushion);
   const geometry=cached('curved-chair-back',()=>{
    const shape=new THREE.Shape();shape.moveTo(-.7,.58);shape.quadraticCurveTo(0,.84,.7,.58);
    shape.lineTo(.7,.68);shape.quadraticCurveTo(0,.94,-.7,.68);shape.closePath();
    return new THREE.ExtrudeGeometry(shape,{depth:1.5,bevelEnabled:true,bevelSegments:2,
     bevelSize:.025,bevelThickness:.025,steps:1,curveSegments:8});
   });
   const back=new THREE.Mesh(geometry,M.wood);back.scale.setScalar(FT);back.rotation.x=-Math.PI/2;
   back.position.y=1.4*FT;back.castShadow=true;back.receiveShadow=true;local.add(back);
   for(const xx of [-.57,.57])for(const yy of [-.58,.58])cylinder(local,.045,.065,1.5,xx,yy,.75,M.darkWood,12);
  });
 }
 for(const dx of [-2,0,2]){chair(cx+dx,cy-2.65,Math.PI);chair(cx+dx,cy+2.65,0)}
 chair(cx-4.1,cy,-Math.PI/2);chair(cx+4.1,cy,Math.PI/2);
 const hall=model.rooms.find(r=>r.name==='Hall');
 asset(hall,'Living sofa','sofa',g=>{
  const x=hall.x+1.7,y=hall.y+6.7;
  box(g,2.65,6.7,.65,x,y,F+.65,M.upholstery);box(g,.4,6.7,1.65,x-1.12,y,F+1.6,M.upholstery);
  for(const dy of [-2.9,2.9])box(g,2.5,.4,1.4,x,y+dy,F+1.2,M.upholstery);
  for(const dy of [-1.95,0,1.95])box(g,2.1,1.85,.33,x+.1,y+dy,F+1.14,M.linen);
  for(const dy of [-1.95,0,1.95])box(g,.45,1.8,1.1,x-.72,y+dy,F+1.85,M.linen);
  for(const dx of [-.95,.95])for(const dy of [-2.65,2.65])cylinder(g,.07,.06,.35,x+dx,y+dy,F+.175,M.darkWood,8);
  for(const dy of [-2.2,2.2]){
   const cushion=box(g,.45,.95,.95,x-.5,y+dy,F+1.85,M.cushion);
   cushion.rotation.z=dy>0?.12:-.12;
  }
 });
 asset(hall,'Living coffee table','table',g=>{box(g,2.1,3.1,.12,hall.x+4.75,hall.y+6.7,F+1.35,M.wood);for(const dy of [-1.1,1.1])box(g,1.5,.12,1.3,hall.x+4.75,hall.y+6.7+dy,F+.67,M.black)});
 asset(hall,'Living rug','rug',g=>box(g,7,7,.025,hall.x+6.3,hall.y+6.7,F+.035,M.cream),{soft:true});
 asset(hall,'Media console and screen','media',g=>{
  box(g,.9,6.6,1.4,hall.x+hall.width-.6,hall.y+6.6,F+.8,M.wood);
  box(g,.1,4.6,2.5,hall.x+hall.width-.25,hall.y+6.6,F+3.2,M.black);
 });
 const prayer=model.rooms.find(r=>r.name==='Prayer');
 asset(prayer,'Prayer alcove cabinet','cabinet',g=>{
  box(g,4.5,1.2,2.3,prayer.x+3,prayer.y+prayer.depth-.75,F+1.15,M.wood);
  box(g,4.6,.12,3,prayer.x+3,prayer.y+prayer.depth-.18,F+3.8,M.cream);
  for(const dx of [-1.4,1.4])cylinder(g,.15,.13,.45,prayer.x+3+dx,prayer.y+prayer.depth-.75,F+2.55,M.brass);
 });
 return {root,items,materials:M};
}
