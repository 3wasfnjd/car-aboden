// Adapter for the user's original GMC GLB. Topology, UVs and textures are kept.
// Its four 284-triangle wheels are disconnected components of the main mesh.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

function components(geometry) {
  const p=geometry.getAttribute('position'),index=geometry.index;
  if(!p||!index)throw new Error('GMC geometry must be indexed');
  const parent=Array.from({length:p.count},(_,i)=>i),seen=new Map();
  const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const union=(a,b)=>{parent[root(a)]=root(b);};
  for(let i=0;i<p.count;i++){
    const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1000)).join(',');
    if(seen.has(key))union(i,seen.get(key));else seen.set(key,i);
  }
  for(let i=0;i<index.count;i+=3){union(index.getX(i),index.getX(i+1));union(index.getX(i),index.getX(i+2));}
  const groups=new Map();
  for(let i=0;i<index.count;i+=3){const r=root(index.getX(i));if(!groups.has(r))groups.set(r,[]);groups.get(r).push(index.getX(i),index.getX(i+1),index.getX(i+2));}
  return [...groups.values()];
}
function subset(source,indices) {
  // Compact every attribute so the bounds exclude unused body/wheel vertices.
  const remap=new Map(),vertices=[],outIndex=[];
  for(const old of indices){if(!remap.has(old)){remap.set(old,vertices.length);vertices.push(old);}outIndex.push(remap.get(old));}
  const g=new THREE.BufferGeometry(),get=['getX','getY','getZ','getW'];
  for(const [name,a] of Object.entries(source.attributes)){
    if(a.itemSize>4)throw new Error('Unsupported GMC attribute '+name);
    const values=new Float32Array(vertices.length*a.itemSize);
    vertices.forEach((old,i)=>{for(let c=0;c<a.itemSize;c++)values[i*a.itemSize+c]=a[get[c]](old);});
    g.setAttribute(name,new THREE.BufferAttribute(values,a.itemSize));
  }
  g.setIndex(outIndex);g.computeBoundingBox();g.computeBoundingSphere();return g;
}
function bounds(g){g.computeBoundingBox();return g.boundingBox.clone();}
function center(g){return bounds(g).getCenter(new THREE.Vector3());}

export function prepareGmcModel(source,{width=2.2,wheelLocalY=-.2}={}) {
  source.updateMatrixWorld(true);
  let main,glass;
  source.traverse(o=>{if(o.isMesh&&/^Object001_/.test(o.name))main=o;if(o.isMesh&&/^Object002_/.test(o.name))glass=o;});
  if(!main||!glass)throw new Error('الموديل لا يطابق ملف GMC المفحوص');
  const groups=components(main.geometry),wheelGroups=groups.filter(ids=>ids.length===852);
  if(wheelGroups.length!==4)throw new Error('تعذر فصل العجلات الأربع من GMC');
  const wheelSet=new Set(wheelGroups),bodyIds=groups.filter(g=>!wheelSet.has(g)).flat();
  const bodyGeo=subset(main.geometry,bodyIds).applyMatrix4(main.matrixWorld);
  const glassGeo=glass.geometry.clone().applyMatrix4(glass.matrixWorld);
  const wheelGeos=wheelGroups.map(ids=>subset(main.geometry,ids).applyMatrix4(main.matrixWorld));
  const box=bounds(bodyGeo).union(bounds(glassGeo));for(const g of wheelGeos)box.union(bounds(g));
  const size=box.getSize(new THREE.Vector3());
  if(!Number.isFinite(width)||width<=0||size.x<=0)throw new Error('Invalid model scale');
  const scale=width/size.x,originalCenters=wheelGeos.map(center);
  const average=originalCenters.reduce((a,v)=>a.add(v),new THREE.Vector3()).multiplyScalar(.25);
  // One uniform scale and common translation preserve the pickup's proportions.
  const offset=new THREE.Vector3(-average.x*scale,wheelLocalY-average.y*scale,-average.z*scale);
  for(const g of [bodyGeo,glassGeo,...wheelGeos]){g.scale(scale,scale,scale);g.translate(offset.x,offset.y,offset.z);}
  const entries=wheelGeos.map(g=>({geometry:g,center:center(g)}));
  // Source front is +Z, confirmed by cab/front-bumper extents.
  entries.sort((a,b)=>b.center.z-a.center.z);
  const wheels=[...entries.slice(0,2).sort((a,b)=>a.center.x-b.center.x),...entries.slice(2).sort((a,b)=>a.center.x-b.center.x)];
  for(const w of wheels){
    const b=bounds(w.geometry);w.radius=(b.max.y-b.min.y)/2;
    w.geometry.translate(-w.center.x,-w.center.y,-w.center.z);
    // Neutralize the source's baked front-wheel steering before physics rotation.
    const p=w.geometry.attributes.position;let xx=0,zz=0,xz=0;
    for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);xx+=x*x;zz+=z*z;xz+=x*z;}
    w.neutralYaw=-.5*Math.atan2(2*xz,zz-xx);
    if(Math.abs(w.neutralYaw)>Math.PI/4)throw new Error('GMC wheel axle orientation is invalid');
    w.geometry.rotateY(w.neutralYaw);w.geometry.computeBoundingBox();w.geometry.computeBoundingSphere();
  }
  const bodyBox=bounds(bodyGeo),cabBox=bounds(glassGeo),bodySize=bodyBox.getSize(new THREE.Vector3());
  const shellBottom=bodyBox.min.y+.06,shellHeight=Math.min(.52,bodySize.y*.38);
  const shell={half:[bodySize.x*.46,shellHeight/2,bodySize.z/2],offset:[(bodyBox.min.x+bodyBox.max.x)/2,shellBottom+shellHeight/2,(bodyBox.min.z+bodyBox.max.z)/2]};
  cabBox.max.y=Math.max(cabBox.max.y,bodyBox.max.y);cabBox.min.y-=.06;
  const cabSize=cabBox.getSize(new THREE.Vector3()),cabCenter=cabBox.getCenter(new THREE.Vector3());
  const cabin={half:[cabSize.x/2,cabSize.y/2,cabSize.z/2],offset:cabCenter.toArray()};
  const body=new THREE.Group();body.name='GMC_Body';body.add(new THREE.Mesh(bodyGeo,main.material),new THREE.Mesh(glassGeo,glass.material));
  const wheelMeshes=wheels.map((w,i)=>{const mesh=new THREE.Mesh(w.geometry,main.material);mesh.name=['GMC_FrontLeft','GMC_FrontRight','GMC_RearLeft','GMC_RearRight'][i];return mesh;});
  for(const obj of [body,...wheelMeshes])obj.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  const triangles=(bodyGeo.index.count+glassGeo.index.count+wheelGeos.reduce((n,g)=>n+g.index.count,0))/3;
  return {body,wheelMeshes,wheels,shell,cabin,scale,info:{name:'GMC Sierra Work Truck',width,scale,triangles,wheelCount:4,removedBackdrop:true,wheelCenters:wheels.map(w=>w.center.toArray()),wheelRadii:wheels.map(w=>w.radius)}};
}
export function installGmcModel(visual,car,prepared) {
  if(!car)throw new Error('GMC requires a vehicle physics rig');
  const {body,wheelMeshes,wheels,shell,cabin}=prepared;
  for(const shape of [...car.body.shapes])car.body.removeShape(shape);
  for(const s of [shell,cabin])car.body.addShape(new CANNON.Box(new CANNON.Vec3(...s.half)),new CANNON.Vec3(...s.offset));
  car.body.updateMassProperties();car.body.inertia.x*=2;car.body.inertia.z*=2;
  car.body.invInertia.set(1/car.body.inertia.x,1/car.body.inertia.y,1/car.body.inertia.z);car.body.updateInertiaWorld(true);
  car.body.updateBoundingRadius();car.body.aabbNeedsUpdate=true;
  const p=car.params;p.wheelRadius=wheels.reduce((s,w)=>s+w.radius,0)/4;
  p.wheelX=wheels.reduce((s,w)=>s+Math.abs(w.center.x),0)/4;p.wheelZ=wheels.reduce((s,w)=>s+Math.abs(w.center.z),0)/4;
  p.chassisHalf=shell.half.slice();p.chassisLift=shell.offset[1];
  wheels.forEach((w,i)=>{const info=car.rig.wheelInfos[i];info.radius=w.radius;info.chassisConnectionPointLocal.set(w.center.x,w.center.y+p.restLength,w.center.z);});
  body.position.y=-visual.bodyMount.position.y;visual.bodyMount.add(body);visual.placeholder.visible=false;
  wheelMeshes.forEach((w,i)=>{visual.wheelMounts[i].add(w);visual.wheelPlaceholders[i].visible=false;});
  visual.modelInfo={loaded:true,...prepared.info};car.reset();return visual.modelInfo;
}
