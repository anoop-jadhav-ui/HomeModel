import * as THREE from 'three';

function texture(kind,relief=false){
 const size=128,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const noise=((x*73+y*137+x*y*19)%53)/53;
  const across=x*Math.PI/64,along=y*Math.PI/64;
  const warp=.6*Math.sin(along)+.25*Math.sin(along*2);
  const fibre=Math.sin(across*5+warp)+.4*Math.sin(across*13+warp*1.7);
  const pores=Math.max(0,Math.sin(across*37+warp))**24;
  const weave=((x%4<2)===(y%4<2)?1:0)*.55+noise*.45;
  const speck=((x*13+y*31)%29)/29;
  const value=kind==='wood'?(relief?190+fibre*6-pores*9:228+fibre*3-pores*4+noise*2):
   kind==='cloth'?(relief?155+weave*70:222+weave*24):
   relief?184+speck*30:186+speck*45+noise*14;
  const i=(y*size+x)*4;
  data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;
 }
 const t=new THREE.DataTexture(data,size,size);
 t.name=kind+(relief?' relief':' albedo');t.wrapS=t.wrapT=THREE.RepeatWrapping;
 t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;
 if(!relief)t.colorSpace=THREE.SRGBColorSpace;
 const period=kind==='wood'?[.36,1.8]:kind==='cloth'?[.055,.055]:[.22,.22];
 t.repeat.set(1/period[0],1/period[1]);t.needsUpdate=true;
 t.userData={authored:true,periodMetres:period};
 return t;
}

export function furnitureSurfaces(){
 return Object.fromEntries(['wood','cloth','stone'].map(kind=>[kind,{map:texture(kind),relief:texture(kind,true)}]));
}

// UVs are in metres, so a drawer and a full tabletop do not stretch the same grain.
export function metricSurfaceUV(geometry,scale=new THREE.Vector3(1,1,1)){
 const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
 if(!uv||!n)throw new Error('Textured asset needs positions, normals and UVs.');
 for(let i=0;i<p.count;i++){
  const x=p.getX(i)*scale.x,y=p.getY(i)*scale.y,z=p.getZ(i)*scale.z;
  const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
  if(ny>=nx&&ny>=nz)uv.setXY(i,z,x);
  else if(nx>=nz)uv.setXY(i,z,y);
  else uv.setXY(i,x,y);
 }
 uv.needsUpdate=true;geometry.userData.metricUV=true;
 return geometry;
}
