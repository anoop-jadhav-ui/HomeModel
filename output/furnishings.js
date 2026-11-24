import * as THREE from 'three';

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
 const F=model.dimensions.floor_elevation;
 function box(g,w,d,h,x,y,z,mat,round=0){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w*FT,h*FT,d*FT),mat);
  mesh.position.copy(point(x,y,z));if(round)mesh.rotation.y=round;
  mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);return mesh;
 }
 function cylinder(g,r,rt,h,x,y,z,mat,segments=24){
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(rt*FT,r*FT,h*FT,segments),mat);
  mesh.position.copy(point(x,y,z));mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);return mesh;
 }
 function ellipsoid(g,rx,ry,rz,x,y,z,mat){
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),mat);mesh.scale.set(rx*FT,rz*FT,ry*FT);
  mesh.position.copy(point(x,y,z));mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);return mesh;
 }
 function asset(room,name,kind,fn,{soft=false}={}){
  const group=new THREE.Group();group.name=name;root.add(group);fn(group);
  items.push({room:room.name,name,kind,soft,group});return group;
 }
 function nightstand(g,x,y){
  box(g,1.15,1.4,1.6,x,y,F+.95,M.wood);box(g,1.2,1.45,.12,x,y,F+1.81,M.stone);
  cylinder(g,.25,.19,.5,x,y,F+2.12,M.ceramic);cylinder(g,.38,.28,.5,x,y,F+2.6,M.cream);
 }
 for(const r of model.rooms.filter(r=>r.name.startsWith('Bedroom'))){
  const front=r.name==='Bedroom_front_right',cx=r.x+(front?7:4.7),head=front?r.y+.55:r.y+r.depth-.55;
  const cy=head+(front?3.5:-3.5),sign=front?-1:1;
  asset(r,r.name+' bed suite','bed',g=>{
   box(g,5.4,7,1.15,cx,cy,F+.7,M.wood);box(g,5.1,6.65,.65,cx,cy,F+1.58,M.linen);
   box(g,5.6,.24,2.9,cx,head,F+1.55,M.green);
   box(g,5.13,3.8,.18,cx,cy-sign*.95,F+1.98,M.green);
   for(const dx of [-1.25,1.25]){const p=ellipsoid(g,1.05,.65,.23,cx+dx,head-sign*.9,F+2.1,M.pillow);p.rotation.y=.035*dx}
   for(const dx of [-3.6,3.6])nightstand(g,cx+dx,head-sign*.9);
  });
  asset(r,r.name+' wardrobe','wardrobe',g=>{
   const w=front?2:5.7,d=front?5.7:2,cx=front?r.x+1.3:r.x+r.width-(r.name.includes('rear_right')?3.1:8.6),cy=r.y+(front?3.3:1.3);
   box(g,w,d,7,cx,cy,F+3.5,M.cream);
   if(front){for(const yy of [-1.8,0,1.8])box(g,.05,.06,5.6,cx+w/2+.03,cy+yy,F+3.8,M.wood)}
   else{for(const xx of [-1.8,0,1.8])box(g,.06,.05,5.6,cx+xx,cy+d/2+.03,F+3.8,M.wood)}
  });
 }
 function toilet(g,x,y){
  box(g,1.22,.55,1.55,x,y+.8,F+1.45,M.ceramic);
  ellipsoid(g,.48,.78,.62,x,y-.08,F+.93,M.ceramic);
  const seat=new THREE.Mesh(new THREE.TorusGeometry(.45*FT,.085*FT,10,32),M.ceramic);
  seat.rotation.x=-Math.PI/2;seat.scale.y=1.35;seat.position.copy(point(x,y-.22,F+1.53));g.add(seat);
  ellipsoid(g,.32,.5,.035,x,y-.22,F+1.52,M.water);
  cylinder(g,.33,.31,.8,x,y+.05,F+.43,M.ceramic);
  box(g,.18,.08,.08,x+.32,y+.48,F+2.12,M.brass);
 }
 function basin(g,x,y,w=1.7){
  box(g,w,1.25,1.9,x,y,F+1.5,M.wood);box(g,w+.12,1.4,.15,x,y,F+2.55,M.stone);
  ellipsoid(g,w*.35,.49,.13,x,y,F+2.67,M.ceramic);ellipsoid(g,w*.27,.34,.025,x,y,F+2.75,M.water);
  cylinder(g,.035,.035,.7,x,y+.45,F+2.95,M.metal);box(g,.06,.4,.06,x,y+.28,F+3.29,M.metal);
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
  for(let i=0;i<5;i++){box(g,.04,1.65,2.1,x+2.15,y+1.3+i*2.15,F+1.5,M.cream);box(g,1.6,.04,2.1,x+3.1+i*1.7,y+2.15,F+1.5,M.cream)}
  box(g,2.45,2.5,6.3,x+4.1,y+10.55,F+3.15,M.metal);
  box(g,.08,.1,1.7,x+5.05,y+9.25,F+3.9,M.black);
  box(g,4.7,.8,2.25,x+6.1,y+11.5,F+6.1,M.cream);
  ellipsoid(g,1.0,.62,.045,x+6.2,y+1.15,F+2.95,M.metal);ellipsoid(g,.82,.46,.02,x+6.2,y+1.15,F+2.99,M.water);
  cylinder(g,.04,.04,.9,x+6.2,y+.6,F+3.4,M.metal);box(g,.07,.5,.07,x+6.2,y+.84,F+3.83,M.metal);
  box(g,1.7,2.35,.04,x+1.15,y+6.3,F+2.96,M.black);
  for(const dx of [-.4,.4])for(const dy of [-.65,.65]){const burner=new THREE.Mesh(new THREE.TorusGeometry(.2*FT,.025*FT,8,24),M.metal);burner.rotation.x=Math.PI/2;burner.position.copy(point(x+1.15+dx,y+6.3+dy,F+3));g.add(burner)}
 });
 const dining=model.rooms.find(r=>r.name==='Dining_central_zone'),cx=dining.x+dining.width/2,cy=dining.y+5;
 asset(dining,'Dining table','table',g=>{
  box(g,6,3,.18,cx,cy,F+2.48,M.wood);
  for(const xx of [-2.4,2.4])for(const yy of [-1,1])box(g,.18,.18,2.4,cx+xx,cy+yy,F+1.2,M.darkWood);
  cylinder(g,.33,.2,.65,cx,cy,F+2.9,M.ceramic);
  for(let i=0;i<5;i++)ellipsoid(g,.16,.12,.08,cx+Math.cos(i)*.35,cy+Math.sin(i)*.3,F+3.25,M.leaf);
 });
 function chair(x,y,rotation){
  asset(dining,'Dining chair '+items.length,'chair',g=>{
   const local=new THREE.Group();local.position.copy(point(x,y,F));local.rotation.y=rotation;g.add(local);
   box(local,1.5,1.55,.18,0,0,1.5,M.green);box(local,1.5,.17,1.55,0,.7,2.15,M.wood);
   for(const xx of [-.57,.57])for(const yy of [-.58,.58])box(local,.12,.12,1.5,xx,yy,.75,M.darkWood);
  });
 }
 for(const dx of [-2,0,2]){chair(cx+dx,cy-2.65,Math.PI);chair(cx+dx,cy+2.65,0)}
 chair(cx-4.1,cy,-Math.PI/2);chair(cx+4.1,cy,Math.PI/2);
 const hall=model.rooms.find(r=>r.name==='Hall');
 asset(hall,'Living sofa','sofa',g=>{
  const x=hall.x+1.7,y=hall.y+6.7;
  box(g,2.65,6.7,.65,x,y,F+.65,M.cream);box(g,.4,6.7,1.65,x-1.12,y,F+1.6,M.cream);
  for(const dy of [-2.9,2.9])box(g,2.5,.4,1.4,x,y+dy,F+1.2,M.cream);
  for(const dy of [-1.95,0,1.95])box(g,2.1,1.85,.33,x+.1,y+dy,F+1.17,M.linen);
  for(const dy of [-2,2])ellipsoid(g,.35,.6,.6,x-.65,y+dy,F+1.9,M.green);
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
