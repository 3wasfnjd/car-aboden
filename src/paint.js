// Pink paint with hand-drawn (procedural canvas) roses on the body.
// The GLB stays unchanged: only the runtime paint material colour changes, and
// the roses are decals projected onto the painted body mesh.
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

export const ROSE_PINK='#f78fb3';

function drawRose(ctx,x,y,r,dark,light) {
  ctx.save();ctx.translate(x,y);
  const petal=(angle,dist,rx,ry,c0,c1)=>{
    ctx.save();ctx.rotate(angle);ctx.translate(0,-dist);
    const g=ctx.createRadialGradient(0,ry*.4,1,0,0,Math.max(rx,ry));g.addColorStop(0,c0);g.addColorStop(1,c1);
    ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(60,0,15,.25)';ctx.lineWidth=r*.03;ctx.stroke();ctx.restore();
  };
  for(let i=0;i<6;i++)petal(i/6*Math.PI*2+.3,r*.42,r*.5,r*.42,light,dark);
  for(let i=0;i<5;i++)petal(i/5*Math.PI*2,r*.26,r*.36,r*.3,light,dark);
  // Tight centre swirl.
  ctx.strokeStyle=dark;ctx.lineWidth=r*.07;ctx.lineCap='round';
  for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(r*.02*i,0,r*(.26-i*.075),.4+i*1.7,4.6+i*1.7);ctx.stroke();}
  ctx.restore();
}
function drawLeaf(ctx,x,y,len,angle) {
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);
  ctx.fillStyle='#2f7d3a';ctx.beginPath();ctx.moveTo(0,0);
  ctx.quadraticCurveTo(len*.5,-len*.38,len,0);ctx.quadraticCurveTo(len*.5,len*.38,0,0);ctx.fill();
  ctx.strokeStyle='#1d5426';ctx.lineWidth=len*.05;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(len*.9,0);ctx.stroke();
  ctx.restore();
}
// A trailing rose vine across the canvas: stems, leaves, then roses on top.
export function roseVineTexture(width=1024,height=512,roses=4,seed=1) {
  const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');
  let s=seed;const rnd=()=>((s=(s*16807)%2147483647)/2147483647);
  const palette=[['#8e0024','#e8344e'],['#b0003a','#ff6b8b'],['#c9a0ad','#fff7f9'],['#8e0024','#ff4d6d']];
  const points=[...Array(roses)].map((_,i)=>({x:width*(i+.5)/roses+(rnd()-.5)*width*.06,y:height*(.45+(rnd()-.5)*.3),r:height*(.17+rnd()*.07)}));
  ctx.strokeStyle='#2f6b32';ctx.lineWidth=height*.025;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(0,height*.6);
  for(const p of points)ctx.quadraticCurveTo(p.x-p.r*1.4,p.y+p.r*1.6,p.x,p.y);
  ctx.quadraticCurveTo(width*.98,height*.7,width,height*.55);ctx.stroke();
  for(const p of points){drawLeaf(ctx,p.x-p.r*.6,p.y+p.r*.9,p.r*1.1,2.6+rnd()*.6);drawLeaf(ctx,p.x+p.r*.5,p.y+p.r*.95,p.r*.95,.2+rnd()*.5);}
  points.forEach((p,i)=>{const [d,l]=palette[i%palette.length];drawRose(ctx,p.x,p.y,p.r,d,l);});
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}

// Paint the car pink and project rose vines onto doors, bed sides, hood and tailgate.
export function applyRosePaint(visual) {
  visual.materials.body.color.set(ROSE_PINK);
  const body=visual.bodyMount.getObjectByName('GMC_Body');if(!body)return {pink:true,decals:0};
  const painted=[];body.traverse(o=>{if(o.isMesh&&!Array.isArray(o.material)&&/^Body_/.test(o.material.name))painted.push(o);});
  if(!painted.length)return {pink:false,decals:0};
  for(const m of new Set(painted.map(o=>o.material)))m.color.set(ROSE_PINK);
  // Work in the car's local frame: decal vertices come out in world space.
  const saved=[visual.root.position.clone(),visual.root.quaternion.clone()];
  visual.root.position.set(0,0,0);visual.root.quaternion.identity();visual.root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(body),size=box.getSize(new THREE.Vector3());
  const glass=visual.bodyMount.getObjectByName('GMC_Glass');
  const cabZ=glass?new THREE.Box3().setFromObject(glass).getCenter(new THREE.Vector3()).z:box.min.z+size.z*.55;
  const bedZ=(box.min.z+(glass?new THREE.Box3().setFromObject(glass).min.z:cabZ))/2;
  const ray=new THREE.Raycaster(),decals=new THREE.Group();decals.name='RoseDecals';
  const vine=roseVineTexture(1024,512,4,7),small=roseVineTexture(1024,512,3,11);
  const material=map=>new THREE.MeshStandardMaterial({map,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,roughness:.35,metalness:.05});
  const mats=[material(vine),material(small)];
  const place=(origin,dir,euler,w,h,mat)=>{
    ray.set(origin,dir);const hit=ray.intersectObjects(painted,false)[0];if(!hit)return;
    const geometry=new DecalGeometry(hit.object,hit.point,euler,new THREE.Vector3(w,h,.3));
    if(geometry.attributes.position.count)decals.add(Object.assign(new THREE.Mesh(geometry,mat),{receiveShadow:true}));
  };
  const y=box.min.y+size.y*.4,far=size.x+2;
  for(const side of [1,-1]){
    const dir=new THREE.Vector3(-side,0,0),e=new THREE.Euler(0,side*Math.PI/2,0);
    place(new THREE.Vector3(side*far,y,cabZ),dir,e,size.z*.3,size.y*.38,mats[0]);
    place(new THREE.Vector3(side*far,y+size.y*.02,bedZ),dir,e,size.z*.36,size.y*.36,mats[1]);
  }
  place(new THREE.Vector3(0,box.max.y+2,box.max.z-size.z*.16),new THREE.Vector3(0,-1,0),new THREE.Euler(-Math.PI/2,0,0),size.x*.72,size.z*.22,mats[1]);
  place(new THREE.Vector3(0,y+size.y*.02,box.min.z-2),new THREE.Vector3(0,0,1),new THREE.Euler(0,Math.PI,0),size.x*.62,size.y*.22,mats[0]);
  body.add(decals);
  visual.root.position.copy(saved[0]);visual.root.quaternion.copy(saved[1]);visual.root.updateMatrixWorld(true);
  return {pink:true,decals:decals.children.length};
}
