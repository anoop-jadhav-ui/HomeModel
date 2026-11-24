import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import {FT} from './output/furnishings.js';
import {createSite} from './output/site.js';
import {SITE_SETTINGS as S} from './output/site-settings.js';
import {entryApproach} from './output/walk-navigation.js';

const context={window:{}};
vm.runInNewContext(readFileSync(new URL('./output/review-data.js',import.meta.url),'utf8'),context);
const model=JSON.parse(JSON.stringify(context.window.HOME_MODEL));
const before=JSON.stringify(model),site=createSite(model),meta=site.root.userData.site;
const overlap=(a,b)=>a.minX<b.maxX-1e-6&&a.maxX>b.minX+1e-6&&a.minY<b.maxY-1e-6&&a.maxY>b.minY+1e-6;
const close=(a,b)=>assert(Math.abs(a-b)<1e-5,`${a} != ${b}`);
function nativeBounds(mesh,instance){
  const result=new THREE.Box3();
  mesh.geometry.computeBoundingBox();
  const matrix=mesh.matrixWorld.clone();
  if(instance!==undefined){
    const local=new THREE.Matrix4();mesh.getMatrixAt(instance,local);matrix.multiply(local);
  }
  result.copy(mesh.geometry.boundingBox).applyMatrix4(matrix);
  return {minX:result.min.x/FT,maxX:result.max.x/FT,minY:-result.max.z/FT,maxY:-result.min.z/FT,
    minZ:result.min.y/FT,maxZ:result.max.y/FT};
}
site.root.updateMatrixWorld(true);
test('detached site preserves the source and labels nonsurveyed limitations',()=>{
  assert.equal(JSON.stringify(model),before);
  assert.equal(site.root.parent,null);
  assert.equal(site.root.name,'Illustrative site - not surveyed');
  assert.equal(meta.surveyed,false);
  assert.match(meta.assumption,/legal boundary.*setback.*grading.*drainage.*engineered/);
});
test('regenerated real export supplies finite absolute grade in native feet',()=>{
    assert(Number.isFinite(context.window.HOME_MODEL.dimensions.ground_elevation));
    assert.equal(meta.groundElevation,context.window.HOME_MODEL.dimensions.ground_elevation);
    assert.equal(meta.groundElevationSource,'model.dimensions.ground_elevation');
  });
test('missing, nonnumeric or nonfinite grade is rejected rather than silently defaulted',()=>{
  for(const grade of [undefined,null,'0',NaN,Infinity,-Infinity]){
    const invalid=structuredClone(model);
    invalid.dimensions.ground_elevation=grade;
    assert.throws(()=>createSite(invalid),/finite model\.dimensions\.ground_elevation in feet/);
  }
});
test('all actual geometry stays inside native-feet site bounds and outside true roof/house envelope',()=>{
  assert.deepEqual(site.bounds,{minX:-8,maxX:50.25,minY:-18,maxY:42.25});
  const roof={minX:0,maxX:model.dimensions.width,minY:0,maxY:model.dimensions.depth};
  for(const object of model.objects.filter(o=>o.group==='Roof'))for(const [x,y] of object.vertices){
    roof.minX=Math.min(roof.minX,x);roof.maxX=Math.max(roof.maxX,x);
    roof.minY=Math.min(roof.minY,y);roof.maxY=Math.max(roof.maxY,y);
  }
  assert.deepEqual(meta.roofExclusion,roof);
  site.root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++){
      const b=nativeBounds(mesh,mesh.isInstancedMesh?i:undefined);
      assert(!overlap(b,roof),mesh.name+' enters roof/house footprint');
      assert(b.minX>=site.bounds.minX-1e-5&&b.maxX<=site.bounds.maxX+1e-5,mesh.name);
      assert(b.minY>=site.bounds.minY-1e-5&&b.maxY<=site.bounds.maxY+1e-5,mesh.name);
      const recorded=mesh.isInstancedMesh?mesh.userData.siteFeature.instances[i]:mesh.userData.siteFeature.bounds;
      // Foliage ellipsoids conservatively reserve their full authored radii.
      for(const axis of ['X','Y','Z']){
        assert(b['min'+axis]>=recorded['min'+axis]-1e-5,mesh.name);
        assert(b['max'+axis]<=recorded['max'+axis]+1e-5,mesh.name);
      }
    }
  });
});
test('low boundary solids have nonzero thickness including coping',()=>{
  const walls=site.root.children.filter(m=>m.userData.siteFeature.kind==='boundary-wall');
  assert.equal(walls.length,5);
  for(const wall of walls){
    const b=nativeBounds(wall);
    close(Math.min(b.maxX-b.minX,b.maxY-b.minY),S.wall.thickness);
    close(b.maxZ-b.minZ,S.wall.height);
    close(b.minZ,model.dimensions.ground_elevation);
  }
});
test('gateway follows source D_ center and leaves the entire approach corridor empty',()=>{
  const door=model.doorways.find(d=>d.name.startsWith('D_')),corridor=meta.reservedEntranceCorridor;
  assert.equal(meta.gateway.sourceDoor,door.name);
  assert.equal(meta.gateway.centerX,door.x);
  assert(meta.gateway.clearOpening>=8);
  assert.equal(meta.gateway.alwaysOpen,true);assert.equal(meta.gateway.leaves,0);
  assert(meta.gateway.y<-10);
  assert(corridor.minY<=meta.gateway.y&&corridor.maxY===0);
  assert(corridor.minX<=meta.existingStairs.minX&&corridor.maxX>=meta.existingStairs.maxX);
  assert(21>corridor.minX&&21<corridor.maxX&&-9>corridor.minY);
  site.root.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.userData.siteFeature.solid)return;
    for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++)
      assert(!overlap(nativeBounds(mesh,mesh.isInstancedMesh?i:undefined),corridor),mesh.name);
  });
  const path=meta.features.find(f=>f.kind==='path');
  assert.equal(path.bounds.maxY,meta.existingStairs.minY);
  assert.equal(path.bounds.maxZ,model.dimensions.ground_elevation);
});
test('gateway placement responds to changed source doorway rather than a hardcoded house midpoint',()=>{
  const moved=structuredClone(model);
  moved.doorways.find(d=>d.name.startsWith('D_')).x+=2;
  const next=createSite(moved).root.userData.site;
  assert.equal(next.gateway.centerX,meta.gateway.centerX+2);
  assert.equal(next.reservedEntranceCorridor.minX,meta.reservedEntranceCorridor.minX+2);
});
test('approach path meets the shared step foot as grade changes, including the shortened real approach',()=>{
  for(const grade of [0,1,2,model.dimensions.ground_elevation]){
    const input=structuredClone(model);
    input.dimensions.ground_elevation=grade;
    const entry=entryApproach(input),result=createSite(input),data=result.root.userData.site;
    result.root.updateMatrixWorld(true);
    const path=result.root.children.find(m=>m.userData.siteFeature.kind==='path'),b=nativeBounds(path);
    close(b.maxY,-entry.run);
    close(b.maxZ,grade);
    close((b.minX+b.maxX)/2,entry.x);
    assert.equal(data.existingStairs.minY,-entry.run);
    assert.equal(data.existingStairs.minX,entry.x-entry.width/2);
    assert.equal(data.existingStairs.maxX,entry.x+entry.width/2);
    assert.deepEqual(data.entryApproach,entry);
    assert(data.reservedEntranceCorridor.minY<=entry.y);
    assert(data.reservedEntranceCorridor.minY<=-entry.run);
    assert(data.reservedEntranceCorridor.minX<=entry.x-entry.width/2);
    assert(data.reservedEntranceCorridor.maxX>=entry.x+entry.width/2);
    if(grade===2){
      assert.equal(entry.run,4);
      close(b.maxY,-4);
    }
    assert.deepEqual(result.bounds,site.bounds);
    assert.deepEqual(result.stats,site.stats);
  }
});
test('actual rendered triangles and draw meshes meet the lightweight budget',()=>{
  let meshes=0,triangles=0,instances=0;
  site.root.traverse(m=>{
    if(!m.isMesh)return;
    const count=m.isInstancedMesh?m.count:1;
    meshes++;triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3*count;
    if(m.isInstancedMesh)instances+=count;
  });
  assert.deepEqual(site.stats,{meshes,triangles,instances});
  assert(meshes<=S.budget.meshes);assert(triangles<=S.budget.triangles);
  assert.equal(instances,S.garden.shrubsPerBed*2);
});
test('positive and negative absolute grades move every site part together without moving the house',()=>{
  function atGrade(grade){
    const input=structuredClone(model);
    input.dimensions.ground_elevation=grade;
    const original=JSON.stringify(input),result=createSite(input);
    result.root.updateMatrixWorld(true);
    assert.equal(JSON.stringify(input),original);
    return result;
  }
  const baseline=atGrade(0),surfaces=new Set(['path','lawn','planting-bed']);
  const gradeBasedSolids=new Set(['boundary-wall','gateway-post','plant']);
  for(const grade of [2.75,-1.25]){
    const shifted=atGrade(grade),data=shifted.root.userData.site;
    assert.deepEqual(shifted.bounds,baseline.bounds);
    assert.deepEqual(shifted.stats,baseline.stats);
    assert.deepEqual(data.reservedEntranceCorridor,baseline.root.userData.site.reservedEntranceCorridor);
    assert.equal(data.groundElevation,grade);
    for(let i=0;i<shifted.root.children.length;i++){
      const mesh=shifted.root.children[i],base=baseline.root.children[i],feature=mesh.userData.siteFeature;
      for(let j=0;j<(mesh.isInstancedMesh?mesh.count:1);j++){
        const index=mesh.isInstancedMesh?j:undefined,b=nativeBounds(mesh,index),a=nativeBounds(base,index);
        for(const key of ['minX','maxX','minY','maxY']){
          if(feature.kind==='path'&&key==='maxY')close(b[key],-data.entryApproach.run);
          else close(b[key],a[key]);
        }
        close(b.minZ,a.minZ+grade);close(b.maxZ,a.maxZ+grade);
        const recorded=mesh.isInstancedMesh?feature.instances[j]:feature.bounds;
        close(b.minZ,recorded.minZ);close(b.maxZ,recorded.maxZ);
        if(surfaces.has(feature.kind))close(b.maxZ,grade);
        if(gradeBasedSolids.has(feature.kind))close(b.minZ,grade);
        assert(!overlap(b,data.roofExclusion),mesh.name);
        if(feature.solid)assert(!overlap(b,data.reservedEntranceCorridor),mesh.name);
      }
      if(feature.kind==='coping')close(nativeBounds(mesh).minZ,grade+S.wall.height);
      if(feature.kind==='gateway-cap')close(nativeBounds(mesh).minZ,grade+S.gateway.postHeight);
    }
    // Visibility toggles and world-matrix refreshes do not change construction grade.
    const positions=shifted.root.children.map(m=>m.position.toArray()),rootPosition=shifted.root.position.toArray();
    shifted.root.visible=false;shifted.root.updateMatrixWorld(true);
    shifted.root.visible=true;shifted.root.updateMatrixWorld(true);
    assert.deepEqual(shifted.root.position.toArray(),rootPosition);
    assert.deepEqual(shifted.root.children.map(m=>m.position.toArray()),positions);
  }
});
