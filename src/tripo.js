// Adapter for the Tripo-generated "Flower Truck" van (one fused textured mesh,
// front +Z, Y up, ground at Y=0). The four wheels are cut out of the mesh by
// position so they can spin and steer; everything else stays one body mesh.
import * as THREE from 'three';

// Measured on the uploaded GLB (model units): tyre contact patches centre at
// z≈±0.30, wheel centres at |x|≈0.205, tyre radius ≈ 0.105.
export const FLOWER_TRUCK_WHEELS={centers:[[-.205,.3],[.205,.3],[-.205,-.29],[.205,-.29]],radius:.105,inner:.14};

function subset(source,triangles) {
  const index=source.index,remap=new Map(),vertices=[],out=[];
  for(const t of triangles)for(let k=0;k<3;k++){const old=index?index.getX(t*3+k):t*3+k;if(!remap.has(old)){remap.set(old,vertices.length);vertices.push(old);}out.push(remap.get(old));}
  const g=new THREE.BufferGeometry();
  // getComponent handles interleaved and normalized (optimized) attributes.
  for(const [name,a] of Object.entries(source.attributes)){
    const values=new Float32Array(vertices.length*a.itemSize);
    vertices.forEach((old,i)=>{for(let c=0;c<a.itemSize;c++)values[i*a.itemSize+c]=a.getComponent(old,c);});
    g.setAttribute(name,new THREE.BufferAttribute(values,a.itemSize));
  }
  g.setIndex(out);g.computeBoundingBox();g.computeBoundingSphere();return g;
}

export function prepareFlowerTruckModel(source,{length=4.4,wheelLocalY=-.2,spec=FLOWER_TRUCK_WHEELS}={}) {
  source.updateMatrixWorld(true);
  let mesh=null;source.traverse(o=>{if(o.isMesh&&!mesh)mesh=o;});
  if(!mesh)throw new Error('موديل شاحنة الورد بلا مجسم');
  const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  const p=geometry.attributes.position,index=geometry.index,count=index?index.count/3:p.count/3;
  const R=spec.radius,R2=(R*1.04)**2,groups=[[],[],[],[]],body=[];
  const v=k=>index?index.getX(k):k;
  for(let t=0;t<count;t++){
    let wheel=-1;
    for(let w=0;w<4&&wheel<0;w++){
      const [cx,cz]=spec.centers[w];let inside=true;
      for(let k=0;k<3&&inside;k++){const i=v(t*3+k),x=p.getX(i),y=p.getY(i),z=p.getZ(i);
        inside=Math.sign(x)===Math.sign(cx)&&Math.abs(x)>spec.inner&&(y-R)**2+(z-cz)**2<R2;}
      if(inside)wheel=w;
    }
    (wheel<0?body:groups[wheel]).push(t);
  }
  if(groups.some(g=>g.length<50))throw new Error('تعذر فصل عجلات شاحنة الورد');
  const box=new THREE.Box3().setFromBufferAttribute(p),size=box.getSize(new THREE.Vector3());
  const scale=length/size.z;
  // Same convention as the GMC adapters: wheel centres at wheelLocalY.
  const offset=new THREE.Vector3(0,wheelLocalY-R*scale,0);
  const place=g=>{g.scale(scale,scale,scale);g.translate(offset.x,offset.y,offset.z);g.computeBoundingBox();g.computeBoundingSphere();return g;};
  const bodyGeo=place(subset(geometry,body));
  const material=mesh.material;
  const bodyMesh=new THREE.Mesh(bodyGeo,material);bodyMesh.name='FlowerTruck_Body';bodyMesh.castShadow=bodyMesh.receiveShadow=true;
  const bodyGroup=new THREE.Group();bodyGroup.name='FlowerTruck';bodyGroup.add(bodyMesh);
  const names=['FT_FrontLeft','FT_FrontRight','FT_RearLeft','FT_RearRight'];
  const wheels=groups.map((tris,i)=>{
    const g=place(subset(geometry,tris)),[cx,cz]=spec.centers[i];
    const center=new THREE.Vector3(cx*scale,R*scale+offset.y,cz*scale);
    g.translate(-center.x,-center.y,-center.z);g.computeBoundingBox();g.computeBoundingSphere();
    const m=new THREE.Mesh(g,material);m.name=names[i];m.castShadow=true;
    return {mesh:m,geometry:g,center,radius:R*scale,neutralYaw:0};
  });
  // Low chassis shell (keeps the tall van stable) plus a box for the cabin/roof.
  const b=new THREE.Box3().setFromObject(bodyMesh),bs=b.getSize(new THREE.Vector3());
  // The fused skirt hangs almost to the ground; keep the frictionless shell
  // well above it so all the load stays on the tyres (grip and braking).
  const shellBottom=Math.max(b.min.y+.06,wheelLocalY-R*scale*.35),shellHeight=Math.min(.52,bs.y*.3);
  const shell={half:[bs.x*.34,shellHeight/2,bs.z*.47],offset:[0,shellBottom+shellHeight/2,(b.min.z+b.max.z)/2]};
  const cabTop=b.max.y-.05,cabBottom=shellBottom+shellHeight;
  const cabin={half:[bs.x*.34,(cabTop-cabBottom)/2,bs.z*.45],offset:[0,(cabTop+cabBottom)/2,(b.min.z+b.max.z)/2]};
  // Petals blow out of the open flower window on the right (+X) side.
  const emit={min:new THREE.Vector3(bs.x*.26,b.min.y+bs.y*.42,b.min.z+bs.z*.3),max:new THREE.Vector3(bs.x*.34,b.min.y+bs.y*.58,b.min.z+bs.z*.72),push:new THREE.Vector3(1,0,0),roofY:b.max.y};
  const triangles=(index?index.count:p.count)/3;
  return {body:bodyGroup,wheelMeshes:wheels.map(w=>w.mesh),wheels,shell,cabin,scale,emit,
    info:{name:'Flower Truck',variant:'tripo-flower-truck',length,scale,triangles,wheelCount:4,wheelTriangles:groups.map(g=>g.length),wheelCenters:wheels.map(w=>w.center.toArray()),wheelRadii:wheels.map(w=>w.radius)}};
}
