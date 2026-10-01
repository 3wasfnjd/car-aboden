// Cute flower-truck decor, all procedural: a flat pink/white striped awning
// over the bed with a scalloped skirt, pearl posts, warm bulbs, rose bunches
// and a roof sign.
// Geometry is in the car's local frame (same as the bed from FlowerEffects).
import * as THREE from 'three';
import { roseHead, petalGeometry } from './flowers.js';
import { plateTexture } from './paint.js';

const PINK='#ff8fbf',WHITE='#fff7fb',ROSE='#e2457f';

function stripeTexture(stripes=10) {
  const c=document.createElement('canvas');c.width=512;c.height=8;const g=c.getContext('2d');
  for(let i=0;i<stripes;i++){g.fillStyle=i%2?WHITE:PINK;g.fillRect(i*c.width/stripes,0,c.width/stripes+1,c.height);}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function heart(g,x,y,r,color) {
  g.fillStyle=color;g.beginPath();g.moveTo(x,y+r*.9);
  g.bezierCurveTo(x-r*1.6,y-r*.1,x-r*.7,y-r*1.3,x,y-r*.45);
  g.bezierCurveTo(x+r*.7,y-r*1.3,x+r*1.6,y-r*.1,x,y+r*.9);g.fill();
}
function signTexture(text) {
  const c=document.createElement('canvas');c.width=512;c.height=192;const g=c.getContext('2d');
  const r=86;g.fillStyle='#fff8f0';g.beginPath();g.roundRect(8,8,496,176,r);g.fill();
  g.lineWidth=12;g.strokeStyle='#ff9fc6';g.stroke();
  g.setLineDash([4,14]);g.lineCap='round';g.lineWidth=6;g.strokeStyle='#ffd1e3';g.beginPath();g.roundRect(30,30,452,132,66);g.stroke();g.setLineDash([]);
  // Long names shrink to fit between the hearts.
  let size=92;const font=()=>`800 ${size}px "Baloo Bhaijaan 2", Tahoma, Arial, sans-serif`;g.font=font();
  while(g.measureText(text).width>320&&size>34){size-=4;g.font=font();}
  g.fillStyle=ROSE;g.textAlign='center';g.textBaseline='middle';g.fillText(text,256,104);
  heart(g,70,96,20,'#ff7cb1');heart(g,442,96,20,'#ff7cb1');heart(g,108,60,9,'#ffc1d9');heart(g,404,140,9,'#ffc1d9');
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
function roundedRect(w,h,r) {
  const s=new THREE.Shape(),x=-w/2,y=-h/2;
  s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;
}
// ShapeGeometry UVs are in shape units; map them to 0..1 for the texture.
function normalizeUV(g,w,h){const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/w+.5,uv.getY(i)/h+.5);return g;}

export function addCuteDecor(visual,bed,{signText='جود'}={}) {
  const group=new THREE.Group();group.name='CuteDecor';
  const mats={
    canopy:new THREE.MeshStandardMaterial({map:stripeTexture(),roughness:.6,side:THREE.DoubleSide}),
    pink:new THREE.MeshStandardMaterial({color:PINK,roughness:.5,side:THREE.DoubleSide}),
    white:new THREE.MeshStandardMaterial({color:WHITE,roughness:.5,side:THREE.DoubleSide}),
    pearl:new THREE.MeshStandardMaterial({color:'#fffafd',roughness:.22,metalness:.15}),
    sign:new THREE.MeshStandardMaterial({map:signTexture(signText),transparent:true,roughness:.45,side:THREE.FrontSide}),
  };
  const add=(geometry,material)=>{const m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;};
  const info={};
  // Little rose bunches (as on the reference truck's sign and awning corners).
  const roseGeo=roseHead(),leafGeo=petalGeometry(.55,1.3,1.6);
  const roseMats=['#ff9fc6','#ffc1d9','#ff7cb1'].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.5,side:THREE.DoubleSide}));
  const leafMat=new THREE.MeshStandardMaterial({color:'#5fae5a',roughness:.6,side:THREE.DoubleSide});
  Object.assign(mats,{leaf:leafMat,rose0:roseMats[0],rose1:roseMats[1],rose2:roseMats[2]});
  const bunch=(x,y,z,s=1)=>{
    const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(s);group.add(g);
    [[0,0,0,.95],[.13,-.03,.05,.75],[-.12,-.04,-.04,.7]].forEach(([dx,dy,dz,k],i)=>{
      const m=new THREE.Mesh(roseGeo,roseMats[i]);m.position.set(dx,dy,dz);m.scale.setScalar(k*.62);m.rotation.set(-.35+i*.2,i*1.3,.2*i);m.castShadow=true;g.add(m);});
    for(let i=0;i<3;i++){const a=i*2.1+.4,l=new THREE.Mesh(leafGeo,leafMat);l.scale.setScalar(.38);l.rotation.set(0,a,0);l.rotateX(1.25);l.position.set(Math.sin(a)*.1,-.07,Math.cos(a)*.1);g.add(l);}
    return g;
  };
  if(bed){
    // Flat rectangular awning sized to the bed, sloping gently to the back,
    // with a scalloped skirt whose tabs line up with the stripes (reference truck).
    const nb=10,W=bed.max.x-bed.min.x+.24,L=bed.max.z-bed.min.z+.1,cx=(bed.min.x+bed.max.x)/2,cz=(bed.min.z+bed.max.z)/2;
    const rail=bed.floor+.38,rearZ=cz-L/2,frontZ=cz+L/2,yRear=bed.floor+1.08,yFront=bed.floor+1.22;
    const roofY=z=>yRear+(z-rearZ)/L*(yFront-yRear);
    mats.canopy.map.dispose();mats.canopy.map=stripeTexture(nb);
    const roof=new THREE.PlaneGeometry(W,L,1,1),p=roof.attributes.position;
    for(let i=0;i<p.count;i++){const x=p.getX(i),z=cz+p.getY(i);p.setXYZ(i,cx+x,roofY(z),z);}
    roof.computeVertexNormals();add(roof,mats.canopy);
    const tw=W/nb,skirt=.09;
    const tab=new THREE.Shape();tab.moveTo(-tw/2,0);tab.lineTo(tw/2,0);tab.lineTo(tw/2,-skirt);tab.absarc(0,-skirt,tw/2,0,Math.PI,true);tab.lineTo(-tw/2,0);
    const tabGeo=new THREE.ShapeGeometry(tab,10);
    for(let i=0;i<nb;i++){const m=add(tabGeo,i%2?mats.white:mats.pink);m.position.set(cx-W/2+(i+.5)*tw,yRear+.002,rearZ);m.rotation.y=Math.PI;}
    const ns=Math.max(4,Math.round(L/tw)),ts=L/ns;
    const sideTab=new THREE.Shape();sideTab.moveTo(-ts/2,0);sideTab.lineTo(ts/2,0);sideTab.lineTo(ts/2,-skirt);sideTab.absarc(0,-skirt,ts/2,0,Math.PI,true);sideTab.lineTo(-ts/2,0);
    const sideGeo=new THREE.ShapeGeometry(sideTab,10);
    for(const side of [-1,1])for(let i=0;i<ns;i++){
      const z=rearZ+(i+.5)*ts,m=add(sideGeo,i%2?mats.white:mats.pink);
      m.position.set(cx+side*W/2,roofY(z)+.002,z);m.rotation.y=side*Math.PI/2;
    }
    // Pearl corner posts.
    for(const sx of [-1,1])for(const z of [rearZ+.05,frontZ-.05]){
      const h=roofY(z)-rail;add(new THREE.CylinderGeometry(.026,.026,h,8),mats.pearl).position.set(cx+sx*(W/2-.05),rail+h/2,z);
    }
    // Warm bulbs hanging under the back edge.
    const bulbMat=new THREE.MeshStandardMaterial({color:'#fff4d6',emissive:'#ffcc66',emissiveIntensity:1.6,roughness:.3});mats.bulb=bulbMat;
    const wire=new THREE.CylinderGeometry(.006,.006,.08,4),bulb=new THREE.SphereGeometry(.045,12,10),cap=new THREE.CylinderGeometry(.022,.022,.03,8);
    for(const t of [.2,.4,.6,.8]){
      const x=cx-W/2+W*t,z=rearZ+.12,top=roofY(z);
      add(wire,mats.pearl).position.set(x,top-.04,z);add(cap,mats.pearl).position.set(x,top-.09,z);
      const b=add(bulb,bulbMat);b.position.set(x,top-.13,z);b.castShadow=false;
    }
    bunch(cx-W/2+.02,yRear+.04,rearZ+.02,1);bunch(cx+W/2-.02,yRear+.04,rearZ+.02,1);
    info.canopy={top:yFront,eave:yRear,rearZ,frontZ,minX:cx-W/2,maxX:cx+W/2};
  }
  // Roof sign across the car's width, readable from the front and the back.
  const body=visual.bodyMount.getObjectByName('GMC_Body'),glass=visual.bodyMount.getObjectByName('GMC_Glass');
  if(body&&glass){
    const saved=[visual.root.position.clone(),visual.root.quaternion.clone()];
    visual.root.position.set(0,0,0);visual.root.quaternion.identity();visual.root.updateMatrixWorld(true);
    const cab=new THREE.Box3().setFromObject(glass),z=cab.getCenter(new THREE.Vector3()).z;
    const hit=new THREE.Raycaster(new THREE.Vector3(0,cab.max.y+3,z),new THREE.Vector3(0,-1,0)).intersectObject(body,true)[0];
    const roof=hit?hit.point.y:cab.max.y;
    visual.root.position.copy(saved[0]);visual.root.quaternion.copy(saved[1]);visual.root.updateMatrixWorld(true);
    const w=1.55,h=w*192/512,y=roof+.15+h/2;
    const face=normalizeUV(new THREE.ShapeGeometry(roundedRect(w,h,h*.45),8),w,h);
    for(const side of [1,-1]){const m=add(face,mats.sign);m.position.set(0,y,z+side*.012);m.rotation.y=side>0?0:Math.PI;}
    add(new THREE.ShapeGeometry(roundedRect(w+.04,h+.04,h*.47),8),mats.pink).position.set(0,y,z);
    for(const dx of [-w*.3,w*.3])add(new THREE.CylinderGeometry(.024,.024,.17,8),mats.pearl).position.set(dx,roof+.085,z);
    bunch(-w/2,y+h*.35,z,1.15);bunch(w/2,y+h*.35,z,1.15);
    info.sign={y,z};
  }
  visual.root.add(group);
  return {group,...info,dispose(){group.removeFromParent();group.traverse(o=>o.geometry?.dispose());Object.values(mats).forEach(m=>{m.map?.dispose();m.dispose();});}};
}

// The Tripo van has "Flower Truck" / "FLOWER" printed on its sign and plate:
// cover them with the Jood sign (pink rim) and the Jood plate.
export function addVanLabels(visual,labels,{signText='جود',plate='جود'}={}) {
  if(!labels)return null;
  const group=new THREE.Group();group.name='JoodLabels';
  const signMat=new THREE.MeshStandardMaterial({map:signTexture(signText),transparent:true,roughness:.45});
  const rimMat=new THREE.MeshStandardMaterial({color:PINK,roughness:.5});
  const plateMat=new THREE.MeshStandardMaterial({map:plateTexture(plate),transparent:true,roughness:.4});
  const {sign,plate:pl}=labels;
  if(sign){
    const w=sign.width*1.04,h=sign.height*1.08;
    const rim=new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(w+.06,h+.06,(h+.06)*.45),8),rimMat);rim.position.copy(sign.center).add(new THREE.Vector3(0,0,.012));
    const face=new THREE.Mesh(normalizeUV(new THREE.ShapeGeometry(roundedRect(w,h,h*.45),8),w,h),signMat);face.position.copy(sign.center).add(new THREE.Vector3(0,0,.02));
    group.add(rim,face);
  }
  if(pl){const m=new THREE.Mesh(new THREE.PlaneGeometry(pl.width*1.25,pl.height*1.3),plateMat);m.position.copy(pl.center).add(new THREE.Vector3(0,0,.015));group.add(m);}
  visual.root.add(group);
  return {group,sign:!!sign,plate:!!pl,
    // Rewrite the roof sign (the player's name).
    setSign(text){const old=signMat.map;signMat.map=signTexture(String(text||signText).slice(0,16));signMat.needsUpdate=true;old?.dispose();},
    dispose(){group.removeFromParent();group.traverse(o=>o.geometry?.dispose());for(const m of [signMat,rimMat,plateMat]){m.map?.dispose();m.dispose();}}};
}

// ---- Van lights: fairy-light strings, glowing headlights and a pink underglow.
function glowTexture(){
  const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);
  r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.25,'rgba(255,255,255,.55)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
}
const BULB_COLORS=['#fff1c9','#ff9ec7','#fff1c9','#ffc6e0'];
export function addVanLights(visual,lights){
  if(!lights)return null;
  const group=new THREE.Group();group.name='VanLights';const tex=glowTexture(),bulbs=[],disposables=[tex];
  const glowMat=color=>{const m=new THREE.SpriteMaterial({map:tex,color,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true});disposables.push(m);return m;};
  const bulbGeo=new THREE.SphereGeometry(.065,12,10),wireMat=new THREE.MeshStandardMaterial({color:'#e9c3cf',roughness:.7});disposables.push(bulbGeo,wireMat);
  // A sagging string between successive anchors with evenly spaced bulbs.
  const string=(points,spacing=.2,sag=.07)=>{
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1],len=a.distanceTo(b),n=Math.max(2,Math.round(len/spacing));
      const at=t=>new THREE.Vector3().lerpVectors(a,b,t).add(new THREE.Vector3(0,-Math.sin(Math.PI*t)*sag,0));
      const curve=new THREE.CatmullRomCurve3(Array.from({length:9},(_,k)=>at(k/8)));
      const wire=new THREE.Mesh(new THREE.TubeGeometry(curve,24,.012,4),wireMat);group.add(wire);disposables.push(wire.geometry);
      for(let k=i?1:0;k<=n;k++){
        const p=at(k/n),color=BULB_COLORS[bulbs.length%BULB_COLORS.length];
        const mat=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:2,roughness:.3});disposables.push(mat);
        const bulb=new THREE.Mesh(bulbGeo,mat);bulb.position.copy(p).add(new THREE.Vector3(0,-.07,0));
        const glow=new THREE.Sprite(glowMat(color));glow.scale.setScalar(.62);glow.position.copy(bulb.position);
        group.add(bulb,glow);bulbs.push({mat,glow,phase:Math.random()*Math.PI*2,speed:1.2+Math.random()*1.6});
      }
    }
  };
  for(const a of lights.awnings||[])string(a,.2,.06);
  if(lights.roof)string(lights.roof,.24,.04);
  const heads=(lights.headlights||[]).map(p=>{const g=new THREE.Sprite(glowMat('#fff3d6'));g.scale.setScalar(1.1);g.position.copy(p).add(new THREE.Vector3(0,0,.04));group.add(g);return g;});
  let floor=null;
  if(lights.floor){
    const m=new THREE.MeshBasicMaterial({map:tex,color:'#ff6fae',transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false});disposables.push(m);
    floor=new THREE.Mesh(new THREE.PlaneGeometry(lights.floor.width,lights.floor.length).rotateX(-Math.PI/2),m);disposables.push(floor.geometry);
    floor.position.y=lights.floor.y;floor.renderOrder=-1;group.add(floor);
  }
  visual.root.add(group);
  let time=0,on=true;
  return {group,bulbs:bulbs.length,
    get on(){return on;},set on(v){on=!!v;group.visible=on;},
    // Gentle twinkle on the bulbs and a slow breathing underglow.
    update(dt){if(!on)return;time+=dt;
      for(const b of bulbs){const k=.65+.35*Math.sin(time*b.speed+b.phase);b.mat.emissiveIntensity=1.2+k*1.6;b.glow.material.opacity=.6+.4*k;}
      for(const h of heads)h.material.opacity=.85+.1*Math.sin(time*2.1);
      if(floor)floor.material.opacity=.55+.18*Math.sin(time*1.3);},
    dispose(){group.removeFromParent();disposables.forEach(d=>d.dispose?.());}};
}
