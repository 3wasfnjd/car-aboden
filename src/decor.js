// Cute flower-cart decor, all procedural: a pink/white striped canopy over the
// bed with a scalloped fringe, pearl-white arches with bows, and a roof sign.
// Geometry is in the car's local frame (same as the bed from FlowerEffects).
import * as THREE from 'three';

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
  const r=86;g.fillStyle='#ffffff';g.beginPath();g.roundRect(8,8,496,176,r);g.fill();
  g.lineWidth=12;g.strokeStyle='#ff9fc6';g.stroke();
  g.setLineDash([4,14]);g.lineCap='round';g.lineWidth=6;g.strokeStyle='#ffd1e3';g.beginPath();g.roundRect(30,30,452,132,66);g.stroke();g.setLineDash([]);
  g.fillStyle=ROSE;g.font='800 92px "Baloo Bhaijaan 2", Tahoma, Arial, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,256,104);
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

export function addCuteDecor(visual,bed,{signText='جوري'}={}) {
  const group=new THREE.Group();group.name='CuteDecor';
  const mats={
    canopy:new THREE.MeshStandardMaterial({map:stripeTexture(),roughness:.6,side:THREE.DoubleSide}),
    pink:new THREE.MeshStandardMaterial({color:PINK,roughness:.5,side:THREE.DoubleSide}),
    white:new THREE.MeshStandardMaterial({color:WHITE,roughness:.5,side:THREE.DoubleSide}),
    pearl:new THREE.MeshStandardMaterial({color:'#fffafd',roughness:.22,metalness:.15}),
    bow:new THREE.MeshStandardMaterial({color:'#ff5c9c',roughness:.45}),
    sign:new THREE.MeshStandardMaterial({map:signTexture(signText),transparent:true,roughness:.45,side:THREE.FrontSide}),
  };
  const add=(geometry,material)=>{const m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;};
  const info={};
  if(bed){
    const W=bed.max.x-bed.min.x+.3,L=bed.max.z-bed.min.z+.3,cx=(bed.min.x+bed.max.x)/2,cz=(bed.min.z+bed.max.z)/2;
    const rail=bed.floor+.38,eave=bed.floor+1.12,rise=.34;
    // Circular arch through both eaves and the ridge.
    const R=(W*W/4+rise*rise)/(2*rise),archY=x=>eave+Math.sqrt(Math.max(0,R*R-x*x))-(R-rise);
    const canopy=new THREE.PlaneGeometry(W,L,28,1),p=canopy.attributes.position;
    for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getY(i);p.setXYZ(i,cx+x,archY(x),cz+z);}
    canopy.computeVertexNormals();add(canopy,mats.canopy);
    // Scalloped fringe hanging from both long edges and the back edge.
    const sc=.075,scallop=new THREE.CircleGeometry(sc,12,Math.PI,Math.PI);
    const n=Math.max(4,Math.round(L/(sc*2)));
    for(const side of [-1,1])for(let i=0;i<n;i++){
      const m=add(scallop,i%2?mats.white:mats.pink);
      m.position.set(cx+side*W/2,eave+.005,cz-L/2+(i+.5)*L/n);m.rotation.y=Math.PI/2;
    }
    const nb=Math.max(4,Math.round(W/(sc*2)));
    for(let i=0;i<nb;i++){
      const x=-W/2+(i+.5)*W/nb,m=add(scallop,i%2?mats.pink:mats.white);
      m.position.set(cx+x,archY(x)+.005,cz-L/2);m.rotation.y=Math.PI;
    }
    // Three pearl arches (حنايا) from rail to rail, each with a bow on top.
    const bowGeo=new THREE.SphereGeometry(.07,12,8).scale(1.5,.8,.6),knot=new THREE.SphereGeometry(.04,10,8);
    for(const t of [.06,.5,.94]){
      const z=cz-L/2+L*t,pts=[new THREE.Vector3(cx-W/2+.04,rail,z)];
      for(let k=0;k<=12;k++){const x=-W/2+.04+(W-.08)*k/12;pts.push(new THREE.Vector3(cx+x,archY(x)-.03,z));}
      pts.push(new THREE.Vector3(cx+W/2-.04,rail,z));
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),60,.028,8),mats.pearl);
      for(const s of [-1,1]){const b=add(bowGeo,mats.bow);b.position.set(cx+s*.08,eave+rise+.05,z);b.rotation.z=s*.35;}
      add(knot,mats.bow).position.set(cx,eave+rise+.05,z);
    }
    info.canopy={top:eave+rise,eave,rearZ:cz-L/2,frontZ:cz+L/2,minX:cx-W/2,maxX:cx+W/2};
  }
  // Roof sign facing both sides of the car, on two pearl posts.
  const body=visual.bodyMount.getObjectByName('GMC_Body'),glass=visual.bodyMount.getObjectByName('GMC_Glass');
  if(body&&glass){
    const saved=[visual.root.position.clone(),visual.root.quaternion.clone()];
    visual.root.position.set(0,0,0);visual.root.quaternion.identity();visual.root.updateMatrixWorld(true);
    const cab=new THREE.Box3().setFromObject(glass),z=cab.getCenter(new THREE.Vector3()).z;
    const hit=new THREE.Raycaster(new THREE.Vector3(0,cab.max.y+3,z),new THREE.Vector3(0,-1,0)).intersectObject(body,true)[0];
    const roof=hit?hit.point.y:cab.max.y;
    visual.root.position.copy(saved[0]);visual.root.quaternion.copy(saved[1]);visual.root.updateMatrixWorld(true);
    const w=1.25,h=w*192/512,y=roof+.14+h/2;
    const face=normalizeUV(new THREE.ShapeGeometry(roundedRect(w,h,h*.45),8),w,h);
    for(const side of [1,-1]){const m=add(face,mats.sign);m.position.set(side*.012,y,z);m.rotation.y=side*Math.PI/2;}
    const back=add(new THREE.ShapeGeometry(roundedRect(w+.03,h+.03,h*.47),8),mats.pink);back.position.set(0,y,z);back.rotation.y=Math.PI/2;back.scale.z=1;
    for(const dz of [-w*.3,w*.3])add(new THREE.CylinderGeometry(.022,.022,.16,8),mats.pearl).position.set(0,roof+.08,z+dz);
    info.sign={y,z};
  }
  visual.root.add(group);
  return {group,...info,dispose(){group.removeFromParent();group.traverse(o=>o.geometry?.dispose());Object.values(mats).forEach(m=>{m.map?.dispose();m.dispose();});}};
}
