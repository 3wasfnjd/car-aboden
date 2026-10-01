// Flower-truck look (after the reference "Flower Truck" picture), all runtime:
// two-tone pastel pink over cream, tulip/heart/daisy vines as decals, a 3D
// heart on the nose, heart hubcaps and name plates. The GLB stays unchanged.
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

export const ROSE_PINK='#f7a3c0';
export const CREAM='#fff1e4';
const STRIPE='#e2457f',HEART='#f47aa6';

function canvasHeart(ctx,x,y,r,color) {
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x,y+r*.9);
  ctx.bezierCurveTo(x-r*1.6,y-r*.1,x-r*.7,y-r*1.3,x,y-r*.45);
  ctx.bezierCurveTo(x+r*.7,y-r*1.3,x+r*1.6,y-r*.1,x,y+r*.9);ctx.fill();
}
function drawLeaf(ctx,x,y,len,angle) {
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);
  ctx.fillStyle='#5fa858';ctx.beginPath();ctx.moveTo(0,0);
  ctx.quadraticCurveTo(len*.5,-len*.36,len,0);ctx.quadraticCurveTo(len*.5,len*.36,0,0);ctx.fill();
  ctx.strokeStyle='#3f8040';ctx.lineWidth=len*.05;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(len*.9,0);ctx.stroke();
  ctx.restore();
}
function drawTulip(ctx,x,y,r,light,dark) {
  ctx.save();ctx.translate(x,y);
  const g=ctx.createLinearGradient(0,-r,0,r*.8);g.addColorStop(0,light);g.addColorStop(1,dark);ctx.fillStyle=g;
  ctx.beginPath();ctx.moveTo(-r*.62,-r*.5);ctx.quadraticCurveTo(-r*.75,r*.75,0,r*.8);ctx.quadraticCurveTo(r*.75,r*.75,r*.62,-r*.5);
  ctx.lineTo(r*.32,-r*.05);ctx.lineTo(0,-r*.7);ctx.lineTo(-r*.32,-r*.05);ctx.closePath();ctx.fill();
  ctx.strokeStyle='rgba(160,30,80,.35)';ctx.lineWidth=r*.06;ctx.beginPath();ctx.moveTo(0,-r*.6);ctx.lineTo(0,r*.6);ctx.stroke();
  ctx.restore();
}
function drawDaisy(ctx,x,y,r) {
  ctx.save();ctx.translate(x,y);ctx.fillStyle='#ffffff';
  for(let i=0;i<8;i++){ctx.save();ctx.rotate(i*Math.PI/4);ctx.beginPath();ctx.ellipse(0,-r*.55,r*.24,r*.5,0,0,Math.PI*2);ctx.fill();ctx.restore();}
  ctx.fillStyle='#ffc93c';ctx.beginPath();ctx.arc(0,0,r*.3,0,Math.PI*2);ctx.fill();ctx.restore();
}
// A trailing vine (as on the reference truck): tulips, hearts and daisies.
export function flowerVineTexture(width=1024,height=512,tulips=3,seed=1) {
  const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');
  let s=seed;const rnd=()=>((s=(s*16807)%2147483647)/2147483647);
  const tips=[...Array(tulips)].map((_,i)=>({x:width*(i+.5)/tulips+(rnd()-.5)*width*.06,y:height*(.3+rnd()*.12),r:height*(.17+rnd()*.05)}));
  ctx.strokeStyle='#5a9e52';ctx.lineWidth=height*.022;ctx.lineCap='round';
  // A low wavy vine with a stem rising to each tulip.
  ctx.beginPath();ctx.moveTo(0,height*.82);
  for(let i=0;i<=8;i++)ctx.quadraticCurveTo(width*(i-.5)/8,height*(i%2?.92:.7),width*i/8,height*.82);ctx.stroke();
  for(const t of tips){ctx.beginPath();ctx.moveTo(t.x-t.r*.4,height*.84);ctx.quadraticCurveTo(t.x-t.r*.8,t.y+t.r*1.6,t.x,t.y+t.r*.7);ctx.stroke();
    drawLeaf(ctx,t.x-t.r*.3,height*.7,t.r*1.1,3.6+rnd()*.4);drawLeaf(ctx,t.x+t.r*.1,height*.62,t.r*.9,-.6+rnd()*.3);}
  tips.forEach((t,i)=>drawTulip(ctx,t.x,t.y,t.r,i%2?'#ffc1d6':'#ffadc9',i%2?'#f06d9c':'#e2457f'));
  for(let i=0;i<tulips;i++){
    const x=width*(i+1)/tulips-width/tulips*.05;canvasHeart(ctx,x-width*.06,height*(.45+rnd()*.15),height*.07,HEART);
    drawDaisy(ctx,x-width*.15+rnd()*20,height*(.66+rnd()*.12),height*.075);drawDaisy(ctx,width*(i+.15)/tulips,height*.86,height*.06);
  }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
function plateTexture(text) {
  const c=document.createElement('canvas');c.width=512;c.height=170;const g=c.getContext('2d');
  g.fillStyle='#fff8f0';g.beginPath();g.roundRect(6,6,500,158,26);g.fill();
  g.lineWidth=10;g.strokeStyle='#f3a9c4';g.stroke();
  g.fillStyle='#c2265a';g.font='800 96px "Baloo Bhaijaan 2", Tahoma, Arial, sans-serif';g.textAlign='center';g.textBaseline='middle';
  g.fillText(text,226,92);canvasHeart(g,398,88,30,'#e2457f');
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
function heartShape(size) {
  const s=new THREE.Shape(),r=size/2;
  s.moveTo(0,-r*.9);s.bezierCurveTo(-r*1.6,r*.1,-r*.7,r*1.3,0,r*.45);s.bezierCurveTo(r*.7,r*1.3,r*1.6,r*.1,0,-r*.9);return s;
}
// Two tones on the paint material: cream below the belt line, pink above,
// with a thin rose pinstripe between them (object-space height in the shader).
function twoTone(material,split) {
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{uSplit:{value:split},uCream:{value:new THREE.Color(CREAM)},uStripe:{value:new THREE.Color(STRIPE)}});
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float vToneY;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvToneY=position.y;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vToneY;uniform float uSplit;uniform vec3 uCream;uniform vec3 uStripe;')
      .replace('#include <color_fragment>',`#include <color_fragment>
        {float t=smoothstep(uSplit-.006,uSplit+.006,vToneY);diffuseColor.rgb=mix(uCream,diffuseColor.rgb,t);
         float band=1.-smoothstep(.01,.016,abs(vToneY-uSplit-.025));diffuseColor.rgb=mix(diffuseColor.rgb,uStripe,band);}`);
  };
  material.customProgramCacheKey=()=>'jood-two-tone-'+split.toFixed(3);material.needsUpdate=true;
}

export function applyRosePaint(visual,{plate='جود'}={}) {
  visual.materials.body.color.set(ROSE_PINK);
  const body=visual.bodyMount.getObjectByName('GMC_Body');if(!body)return {pink:true,decals:0};
  const painted=[];body.traverse(o=>{if(o.isMesh&&!Array.isArray(o.material)&&/^Body_/.test(o.material.name))painted.push(o);});
  if(!painted.length)return {pink:false,decals:0};
  // Work in the car's local frame: decal vertices come out in world space.
  const saved=[visual.root.position.clone(),visual.root.quaternion.clone()];
  visual.root.position.set(0,0,0);visual.root.quaternion.identity();visual.root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(body),size=box.getSize(new THREE.Vector3());
  const split=box.min.y+size.y*.45;
  for(const m of new Set(painted.map(o=>o.material))){m.color.set(ROSE_PINK);m.roughness=.38;twoTone(m,split);}
  const glass=visual.bodyMount.getObjectByName('GMC_Glass');
  const glassBox=glass?new THREE.Box3().setFromObject(glass):null;
  const cabZ=glassBox?glassBox.getCenter(new THREE.Vector3()).z:box.min.z+size.z*.55;
  const bedZ=(box.min.z+(glassBox?glassBox.min.z:cabZ))/2;
  const ray=new THREE.Raycaster(),decals=new THREE.Group();decals.name='FlowerDecals';
  const decalMat=map=>new THREE.MeshStandardMaterial({map,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,roughness:.35});
  const mats=[decalMat(flowerVineTexture(1024,512,3,7)),decalMat(flowerVineTexture(1024,512,3,13))];
  const hitAt=(origin,dir,all=false)=>{ray.set(origin,dir);return (all?ray.intersectObject(body,true):ray.intersectObjects(painted,false))[0]||null;};
  const place=(origin,dir,euler,w,h,mat)=>{
    const hit=hitAt(origin,dir);if(!hit)return;
    const geometry=new DecalGeometry(hit.object,hit.point,euler,new THREE.Vector3(w,h,.3));
    if(geometry.attributes.position.count)decals.add(Object.assign(new THREE.Mesh(geometry,mat),{receiveShadow:true}));
  };
  // Vines on the cream lower panels: doors, bed sides and tailgate.
  const y=box.min.y+size.y*.3,far=size.x+2;
  for(const side of [1,-1]){
    const dir=new THREE.Vector3(-side,0,0),e=new THREE.Euler(0,side*Math.PI/2,0);
    place(new THREE.Vector3(side*far,y,cabZ),dir,e,size.z*.32,size.y*.36,mats[0]);
    // The bed's middle sits over the rear wheel arch: decorate either side of it.
    place(new THREE.Vector3(side*far,y,bedZ+size.z*.15),dir,e,size.z*.14,size.y*.36,mats[1]);
    place(new THREE.Vector3(side*far,y,box.min.z+size.z*.07),dir,e,size.z*.13,size.y*.36,mats[1]);
  }
  place(new THREE.Vector3(0,y+size.y*.05,box.min.z-2),new THREE.Vector3(0,0,1),new THREE.Euler(0,Math.PI,0),size.x*.62,size.y*.22,mats[0]);
  body.add(decals);

  const extras=new THREE.Group();extras.name='FlowerTruckDetails';body.add(extras);
  const heartMat=new THREE.MeshStandardMaterial({color:HEART,roughness:.3,metalness:.05});
  // Puffy heart on the nose, above the grille.
  const nose=hitAt(new THREE.Vector3(0,box.min.y+size.y*.47,box.max.z+2),new THREE.Vector3(0,0,-1),true);
  if(nose){
    const g=new THREE.ExtrudeGeometry(heartShape(.32),{depth:.03,bevelEnabled:true,bevelThickness:.025,bevelSize:.02,bevelSegments:4,curveSegments:16});
    const m=new THREE.Mesh(g,heartMat);m.position.copy(nose.point).add(new THREE.Vector3(0,0,.01));m.castShadow=true;extras.add(m);
  }
  // Name plates front and back.
  const plateMat=new THREE.MeshStandardMaterial({map:plateTexture(plate),transparent:true,roughness:.4});
  const plateGeo=new THREE.PlaneGeometry(.62,.21);let plates=0;
  for(const [z,dir,rot,h] of [[box.max.z+2,-1,0,.2],[box.min.z-2,1,Math.PI,.24]]){
    const hit=hitAt(new THREE.Vector3(0,box.min.y+size.y*h,z),new THREE.Vector3(0,0,dir),true);if(!hit)continue;
    const m=new THREE.Mesh(plateGeo,plateMat);m.position.copy(hit.point).add(new THREE.Vector3(0,0,-dir*.02));m.rotation.y=rot;extras.add(m);plates++;
  }
  visual.root.position.copy(saved[0]);visual.root.quaternion.copy(saved[1]);visual.root.updateMatrixWorld(true);

  // Cream hubcaps with a pink heart on the outside of every wheel.
  const capMat=new THREE.MeshStandardMaterial({color:CREAM,roughness:.3,metalness:.1,side:THREE.DoubleSide});
  let hubcaps=0;
  visual.wheelMounts.forEach(mount=>{
    const wheel=mount.children.find(o=>o.isMesh&&o.visible);if(!wheel)return;
    wheel.geometry.computeBoundingBox();const b=wheel.geometry.boundingBox,r=(b.max.y-b.min.y)/2;
    const out=wheel.name.includes('Left')?-1:1,x=out<0?b.min.x:b.max.x;
    const cap=new THREE.Group();cap.position.x=x+out*.008;cap.rotation.y=out*Math.PI/2;
    cap.add(new THREE.Mesh(new THREE.CircleGeometry(r*.5,28),capMat));
    const h=new THREE.Mesh(new THREE.ShapeGeometry(heartShape(r*.5),12),heartMat);h.position.z=.004;cap.add(h);
    mount.add(cap);hubcaps++;
  });
  return {pink:true,twoTone:true,decals:decals.children.length,noseHeart:!!nose,plates,hubcaps};
}
