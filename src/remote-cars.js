// Other players' cars in this phone's scene: the same dressed models (paint,
// awning, bouquet / van labels, petals), smoothed between network updates,
// with spinning/steering wheels, a name tag and a kinematic collider so local
// cars bump into them.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { MotriVehicle } from './vehicle.js';
import { CarVisual } from './visuals.js';
import { loadVehicleModel } from './models.js';
import { VEHICLES } from './choice.js';
import { FlowerEffects } from './flowers.js';
import { applyRosePaint } from './paint.js';
import { addCuteDecor, addVanLabels, addVanLights } from './decor.js';

export const PLAYER_COLORS=['#f25c9c','#9b6bf2','#22a98c','#ff9f43'];

function nameTag(name,color) {
  const c=document.createElement('canvas');c.width=512;c.height=128;const g=c.getContext('2d');
  g.font='800 64px "Baloo Bhaijaan 2", Tahoma, Arial, sans-serif';const w=Math.min(500,g.measureText(name).width+90);
  g.fillStyle='#ffffffee';g.beginPath();g.roundRect(256-w/2,14,w,100,50);g.fill();g.lineWidth=8;g.strokeStyle=color;g.stroke();
  g.fillStyle=color;g.textAlign='center';g.textBaseline='middle';g.fillText('♥ '+name,256,66);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:false,transparent:true}));s.scale.set(3.2,.8,1);s.renderOrder=5;return s;
}

// Cartoon speech bubble (canvas sprite) for chat lines, wrapped to two lines.
export function speechBubble(text,color='#f25c9c') {
  const c=document.createElement('canvas');c.width=640;c.height=240;const g=c.getContext('2d');
  g.font='800 52px "Baloo Bhaijaan 2", Tahoma, Arial, sans-serif';g.direction='rtl';
  const words=text.split(' '),lines=[''];
  for(const w of words){const t=(lines.at(-1)+' '+w).trim();if(g.measureText(t).width>540&&lines.at(-1)){if(lines.length===2){lines[1]+='…';break;}lines.push(w);}else lines[lines.length-1]=t;}
  const w=Math.min(620,Math.max(...lines.map(l=>g.measureText(l).width))+70),h=lines.length*62+44,x=320-w/2,y=8;
  g.fillStyle='#fffafc';g.strokeStyle=color;g.lineWidth=8;g.beginPath();g.roundRect(x,y,w,h,36);g.fill();g.stroke();
  g.beginPath();g.moveTo(296,y+h-4);g.lineTo(320,y+h+34);g.lineTo(344,y+h-4);g.closePath();g.fill();g.stroke();
  g.fillStyle='#fffafc';g.fillRect(300,y+h-10,40,8);
  g.fillStyle='#a8245f';g.textAlign='center';g.textBaseline='middle';lines.forEach((l,i)=>g.fillText(l,320,y+40+i*62));
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:false,transparent:true}));s.scale.set(6.4,2.4,1);s.renderOrder=6;
  s.center.set(.5,0);return s;
}
// Show a bubble above a car root for a few seconds, replacing any previous one.
export function sayAbove(root,text,color,height,seconds=5) {
  if(root.userData.bubble){root.remove(root.userData.bubble);root.userData.bubble.material.map.dispose();root.userData.bubble.material.dispose();}
  const b=speechBubble(text,color);b.position.y=height;root.add(b);root.userData.bubble=b;
  clearTimeout(root.userData.bubbleTimer);
  root.userData.bubbleTimer=setTimeout(()=>{if(root.userData.bubble===b){root.remove(b);b.material.map.dispose();b.material.dispose();root.userData.bubble=null;}},seconds*1000);
}

export class RemoteCars {
  constructor({parent,world,modelBase='../models/'}){this.parent=parent;this.world=world;this.modelBase=modelBase;this.cars=new Map();}
  get count(){return [...this.cars.values()].filter(c=>c.ready).length;}
  async add(peer) {
    if(this.cars.has(peer.id))return;
    const entry={peer,ready:false,target:null,spin:0,age:0};this.cars.set(peer.id,entry);
    // A throwaway physics rig lets the shared loaders size the model exactly as for the local car.
    const rig=new MotriVehicle(new CANNON.World()),visual=new CarVisual(this.parent);visual.root.visible=false;
    try{await loadVehicleModel(visual,this.modelBase+VEHICLES.van.config,rig);}catch(e){console.warn(e);}
    if(this.cars.get(peer.id)!==entry){visual.dispose();return;}
    visual.sync(rig);entry.wheelBase=visual.wheelMounts.map(m=>m.position.clone());
    let flowers=null;
    try{
      if(visual.modelEmit){flowers=new FlowerEffects({visual,emit:visual.modelEmit});addVanLabels(visual,visual.modelLabels);entry.lights=addVanLights(visual,visual.modelLights);}
      else{applyRosePaint(visual);flowers=new FlowerEffects({visual});flowers.setCanopy(addCuteDecor(visual,flowers.bed).canopy);}
    }catch(e){console.warn(e);}
    const top=new THREE.Box3().setFromObject(visual.root).max.y-visual.root.position.y;
    const tag=nameTag(peer.name||'لاعب',PLAYER_COLORS[peer.slot%PLAYER_COLORS.length]);tag.position.y=top+.9;visual.root.add(tag);
    const body=new CANNON.Body({mass:0,type:CANNON.Body.KINEMATIC});
    rig.body.shapes.forEach((s,i)=>body.addShape(new CANNON.Box(s.halfExtents.clone()),rig.body.shapeOffsets[i].clone()));
    body.position.set(0,-50,0);this.world.addBody(body);
    Object.assign(entry,{visual,flowers,body,tag,top,radius:rig.params.wheelRadius,ready:true});rig.dispose();
    if(entry.target)this.snap(entry);
  }
  say(id,text){const e=this.cars.get(id);if(e?.ready)sayAbove(e.visual.root,text,PLAYER_COLORS[e.peer.slot%PLAYER_COLORS.length],e.top+1.5);}
  remove(id) {
    const e=this.cars.get(id);if(!e)return;this.cars.delete(id);
    if(!e.ready)return;e.lights?.dispose();e.flowers?.dispose();e.visual.dispose();this.world.removeBody(e.body);e.tag.material.map.dispose();e.tag.material.dispose();
  }
  clear(){for(const id of [...this.cars.keys()])this.remove(id);}
  state(m) {
    const e=this.cars.get(m.id);if(!e)return;const first=!e.target;e.target=m;e.age=0;
    if(first&&e.ready)this.snap(e);
  }
  snap(e){const t=e.target;e.visual.root.position.set(...t.p);e.visual.root.quaternion.set(...t.q);e.visual.root.visible=true;}
  update(dt) {
    const q=new THREE.Quaternion(),yaw=new THREE.Quaternion(),spin=new THREE.Quaternion(),Y=new THREE.Vector3(0,1,0),X=new THREE.Vector3(1,0,0);
    const k=1-Math.exp(-12*dt);
    for(const e of this.cars.values()){
      if(!e.ready||!e.target)continue;
      const t=e.target,root=e.visual.root;e.age+=dt;
      // Extrapolate a little along the last velocity, then ease toward it.
      const ahead=Math.min(e.age,.25),goal=new THREE.Vector3(t.p[0]+t.v[0]*ahead,t.p[1]+t.v[1]*ahead,t.p[2]+t.v[2]*ahead);
      if(root.position.distanceTo(goal)>8)root.position.copy(goal);else root.position.lerp(goal,k);
      root.quaternion.slerp(q.set(...t.q),k);root.visible=true;
      e.spin-=t.s*dt/e.radius;
      e.visual.wheelMounts.forEach((m,i)=>{m.position.copy(e.wheelBase[i]);m.quaternion.copy(yaw.setFromAxisAngle(Y,i<2?t.st:0)).multiply(spin.setFromAxisAngle(X,e.spin));});
      e.body.position.copy(root.position);e.body.quaternion.copy(root.quaternion);e.body.velocity.set(...t.v);
      e.lights?.update(dt);
      if(e.flowers){e.flowers.enabled=t.f!==false;e.flowers.update(dt,{speed:t.s,maxSpeed:14,velocity:{x:t.v[0],y:t.v[1],z:t.v[2]}});}
    }
  }
}
