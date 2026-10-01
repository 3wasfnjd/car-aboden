// Flowers in the truck bed and a trail of flowers dropped while driving.
// Assets: Kenney Nature Kit flowers (CC0), see models/flowers/CREDITS.md.
// Everything is in simulation units; the trail lives beside the car root, so
// the AR anchor's toy scale applies to both.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const FILES=['flower_redA.glb','flower_purpleA.glb','flower_yellowA.glb'];
// Red stands in for roses, so it appears twice as often.
const pickKind=()=>{const r=Math.random();return r<.5?0:r<.75?1:2;};

export async function loadFlowerKinds(base='models/flowers/') {
  const loader=new GLTFLoader();
  return Promise.all(FILES.map(async file=>{
    const {scene}=await loader.loadAsync(new URL(base+file,location.href).href);
    scene.updateMatrixWorld(true);const parts=[];
    // The files set metallicFactor 1 (fully metallic), which renders
    // near-black without an environment map. Use matte petals.
    scene.traverse(o=>{if(o.isMesh){const material=o.material.clone();material.metalness=0;material.roughness=.75;parts.push({geometry:o.geometry.clone().applyMatrix4(o.matrixWorld),material});}});
    if(!parts.length)throw new Error('Flower model is empty: '+file);
    return parts;
  }));
}

// One InstancedMesh per kind and material; slots are reused oldest-first.
class FlowerInstances {
  constructor(parent,kinds,capacity) {
    this.group=new THREE.Group();this.group.name='Flowers';parent.add(this.group);
    this.capacity=capacity;this.next=kinds.map(()=>0);this.used=kinds.map(()=>0);
    this.meshes=kinds.map(parts=>parts.map(({geometry,material})=>{
      const mesh=new THREE.InstancedMesh(geometry,material,capacity);
      mesh.count=0;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(mesh);return mesh;
    }));
  }
  add(kind,matrix) {
    const slot=this.next[kind];this.next[kind]=(slot+1)%this.capacity;
    this.used[kind]=Math.min(this.capacity,this.used[kind]+1);this.set(kind,slot,matrix);return slot;
  }
  set(kind,slot,matrix) {
    for(const mesh of this.meshes[kind]){mesh.setMatrixAt(slot,matrix);mesh.count=this.used[kind];mesh.instanceMatrix.needsUpdate=true;}
  }
  clear() {this.next.fill(0);this.used.fill(0);for(const list of this.meshes)for(const m of list)m.count=0;}
  dispose() {this.group.removeFromParent();for(const list of this.meshes)for(const m of list)m.dispose();}
}

// Find the open bed floor by casting down onto the loaded body, behind the cab.
function findBed(visual) {
  const body=visual.bodyMount.getObjectByName('GMC_Body');if(!body)return null;
  const glass=visual.bodyMount.getObjectByName('GMC_Glass');
  const saved=[visual.root.position.clone(),visual.root.quaternion.clone()];
  visual.root.position.set(0,0,0);visual.root.quaternion.identity();visual.root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(body),size=box.getSize(new THREE.Vector3());
  const front=glass?new THREE.Box3().setFromObject(glass).min.z-.15:box.min.z+size.z*.45;
  const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),spots=[];
  for(let ix=0;ix<=8;ix++)for(let iz=0;iz<=14;iz++){
    const x=box.min.x+size.x*(.2+.6*ix/8),z=box.min.z+.15+(front-box.min.z-.3)*iz/14;
    ray.set(new THREE.Vector3(x,box.max.y+1,z),down);
    const hit=ray.intersectObject(body,true)[0];
    if(hit&&hit.point.y<box.min.y+size.y*.62&&hit.point.y>box.min.y+size.y*.15)spots.push(hit.point.clone());
  }
  visual.root.position.copy(saved[0]);visual.root.quaternion.copy(saved[1]);visual.root.updateMatrixWorld(true);
  if(spots.length<12)return null;
  const floor=spots.map(p=>p.y).sort((a,b)=>a-b)[Math.floor(spots.length/2)];
  const bed=spots.filter(p=>Math.abs(p.y-floor)<.08);
  const b=new THREE.Box3().setFromPoints(bed);
  return {min:b.min,max:b.max,floor};
}

export class FlowerEffects {
  constructor({visual,kinds,ground=()=>0,trailCapacity=160}) {
    this.visual=visual;this.kinds=kinds;this.ground=ground;this.enabled=true;
    this.bed=findBed(visual);this.falling=[];this.emit=0;
    this.m=new THREE.Matrix4();this.q=new THREE.Quaternion();this.e=new THREE.Euler();this.s=new THREE.Vector3();this.p=new THREE.Vector3();
    this.bedFlowers=new FlowerInstances(visual.root,kinds,60);
    this.trail=new FlowerInstances(visual.root.parent,kinds,trailCapacity);
    if(this.bed)this.fillBed();
  }
  get hasBed(){return !!this.bed;}
  fillBed() {
    const {min,max,floor}=this.bed,cols=5,rows=9;
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      const x=min.x+(max.x-min.x)*((c+.5+(Math.random()-.5)*.6)/cols),z=min.z+(max.z-min.z)*((r+.5+(Math.random()-.5)*.6)/rows);
      this.e.set((Math.random()-.5)*.5,Math.random()*Math.PI*2,(Math.random()-.5)*.5);
      this.m.compose(this.p.set(x,floor-.02,z),this.q.setFromEuler(this.e),this.s.setScalar(1.9+Math.random()*.7));
      this.bedFlowers.add(pickKind(),this.m);
    }
  }
  // speed: signed forward speed; velocity: chassis velocity in parent space.
  update(dt,{speed=0,maxSpeed=14,velocity=null}={}) {
    const root=this.visual.root;
    if(this.enabled&&this.bed&&Math.abs(speed)>1.2){
      this.emit+=dt*(2+7*Math.min(1,Math.abs(speed)/maxSpeed));
      while(this.emit>=1){this.emit-=1;this.spawn(root,velocity);}
    }else this.emit=0;
    for(let i=this.falling.length-1;i>=0;i--){
      const f=this.falling[i];
      f.v.y-=9.82*dt;f.pos.addScaledVector(f.v,dt);f.rot.x+=f.spin.x*dt;f.rot.z+=f.spin.z*dt;
      let landed=false;
      if(f.pos.y<=f.groundY){f.pos.y=f.groundY;f.rot.x=(Math.random()-.5)*.35;f.rot.z=(Math.random()-.5)*.35;landed=true;}
      this.m.compose(f.pos,this.q.setFromEuler(f.rot),this.s.setScalar(f.scale));this.trail.set(f.kind,f.slot,this.m);
      if(landed)this.falling.splice(i,1);
    }
  }
  spawn(root,velocity) {
    const {min,max}=this.bed,kind=pickKind();
    const local=new THREE.Vector3(min.x+(max.x-min.x)*Math.random(),this.bed.floor+.5,min.z+.1);
    const pos=local.applyQuaternion(root.quaternion).add(root.position);
    const back=new THREE.Vector3(0,0,-1).applyQuaternion(root.quaternion),side=new THREE.Vector3(1,0,0).applyQuaternion(root.quaternion);
    const v=new THREE.Vector3().addScaledVector(back,1.2+Math.random()).addScaledVector(side,(Math.random()-.5)*2.4);v.y=2+Math.random()*1.5;
    if(velocity)v.addScaledVector(velocity,.55);
    const rot=new THREE.Euler(Math.random()*Math.PI,Math.random()*Math.PI*2,Math.random()*Math.PI);
    const f={kind,pos,v,rot,spin:new THREE.Vector3((Math.random()-.5)*9,0,(Math.random()-.5)*9),scale:2.3+Math.random()*.8,groundY:0};
    // Land where the flower will be after ~0.45 s of flight.
    f.groundY=this.ground(pos.x+v.x*.45,pos.z+v.z*.45);
    this.m.compose(pos,this.q.setFromEuler(rot),this.s.setScalar(f.scale));
    f.slot=this.trail.add(kind,this.m);
    // A reused slot may still be falling; drop the stale entry.
    this.falling=this.falling.filter(o=>o.kind!==kind||o.slot!==f.slot);this.falling.push(f);
  }
  clearTrail(){this.trail.clear();this.falling.length=0;this.emit=0;}
  dispose(){this.bedFlowers.dispose();this.trail.dispose();}
}
