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

// Procedural rose petals: a cupped teardrop shape, one InstancedMesh with
// per-petal colour. Petals inherit the car's motion, then air drag holds them
// back so they stream behind it, flutter (sway + tumble) and settle flat.
function petalGeometry() {
  const s=new THREE.Shape();
  s.moveTo(0,-.16);
  s.bezierCurveTo(.13,-.12,.15,.07,.07,.15);
  s.quadraticCurveTo(0,.19,-.07,.15);
  s.bezierCurveTo(-.15,.07,-.13,-.12,0,-.16);
  const g=new THREE.ShapeGeometry(s,6),p=g.attributes.position;
  // Cup the petal and curl its tip, like a real rose petal.
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);p.setZ(i,x*x*2.2+Math.max(0,y)*y*.9);}
  g.computeVertexNormals();return g;
}
const PETAL_COLORS=[0xb3001b,0xc8102e,0xd7263d,0xe23b4e,0xff5c7a,0xff8fa3,0x9e0b25].map(c=>new THREE.Color(c));

class PetalStorm {
  constructor(parent,capacity=900) {
    this.capacity=capacity;this.next=0;this.used=0;this.time=0;
    this.material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.55,metalness:0,side:THREE.DoubleSide});
    this.mesh=new THREE.InstancedMesh(petalGeometry(),this.material,capacity);
    this.mesh.name='RosePetals';this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.castShadow=true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);parent.add(this.mesh);
    const n=capacity;
    this.pos=new Float32Array(n*3);this.vel=new Float32Array(n*3);this.rot=new Float32Array(n*3);this.spin=new Float32Array(n*3);
    this.sway=new Float32Array(n*3);this.size=new Float32Array(n);this.ground=new Float32Array(n);this.age=new Float32Array(n);this.landed=new Uint8Array(n);
    this.m=new THREE.Matrix4();this.q=new THREE.Quaternion();this.e=new THREE.Euler();this.v=new THREE.Vector3();this.sc=new THREE.Vector3();
  }
  emit(x,y,z,vx,vy,vz,ground) {
    const i=this.next;this.next=(i+1)%this.capacity;this.used=Math.min(this.capacity,this.used+1);
    const i3=i*3,r=Math.random;
    this.pos.set([x,y,z],i3);this.vel.set([vx,vy,vz],i3);
    this.rot.set([r()*6.28,r()*6.28,r()*6.28],i3);this.spin.set([(r()-.5)*14,(r()-.5)*10,(r()-.5)*14],i3);
    // Sway: direction angle, frequency, phase.
    this.sway.set([r()*6.28,2.5+r()*3,r()*6.28],i3);
    this.size[i]=.75+r()*.6;this.ground[i]=ground+.01+r()*.02;this.age[i]=0;this.landed[i]=0;
    this.mesh.setColorAt(i,PETAL_COLORS[(r()*PETAL_COLORS.length)|0]);
    if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
    this.mesh.count=this.used;
  }
  update(dt) {
    this.time+=dt;const drag=Math.exp(-2.6*dt),g=9.82*.42;
    for(let i=0;i<this.used;i++){
      const i3=i*3;this.age[i]+=dt;
      let scale=this.size[i];
      if(!this.landed[i]){
        const a=this.sway[i3],f=this.sway[i3+1],ph=this.sway[i3+2],push=Math.sin(this.time*f+ph)*5.5;
        this.vel[i3]=(this.vel[i3]+Math.cos(a)*push*dt)*drag;
        this.vel[i3+2]=(this.vel[i3+2]+Math.sin(a)*push*dt)*drag;
        this.vel[i3+1]=(this.vel[i3+1]-g*dt)*drag;
        for(let k=0;k<3;k++){this.pos[i3+k]+=this.vel[i3+k]*dt;this.rot[i3+k]+=this.spin[i3+k]*dt;}
        if(this.pos[i3+1]<=this.ground[i]){
          // Settle flat: the petal shape lies in XY, so tip it onto the ground.
          this.pos[i3+1]=this.ground[i];this.landed[i]=1;this.age[i]=0;
          this.rot[i3]=-Math.PI/2+(Math.random()-.5)*.3;this.rot[i3+2]=(Math.random()-.5)*.3;
        }
      }else if(this.age[i]>14){scale*=Math.max(0,1-(this.age[i]-14)/2);}
      this.e.set(this.rot[i3],this.rot[i3+1],this.rot[i3+2]);
      this.m.compose(this.v.set(this.pos[i3],this.pos[i3+1],this.pos[i3+2]),this.q.setFromEuler(this.e),this.sc.setScalar(scale));
      this.mesh.setMatrixAt(i,this.m);
    }
    if(this.used)this.mesh.instanceMatrix.needsUpdate=true;
  }
  clear(){this.next=0;this.used=0;this.mesh.count=0;}
  dispose(){this.mesh.removeFromParent();this.mesh.geometry.dispose();this.material.dispose();this.mesh.dispose();}
}

export class FlowerEffects {
  constructor({visual,kinds,ground=()=>0,trailCapacity=160}) {
    this.visual=visual;this.kinds=kinds;this.ground=ground;this.enabled=true;
    this.bed=findBed(visual);this.falling=[];this.emit=0;this.petalEmit=0;
    this.m=new THREE.Matrix4();this.q=new THREE.Quaternion();this.e=new THREE.Euler();this.s=new THREE.Vector3();this.p=new THREE.Vector3();
    this.bedFlowers=new FlowerInstances(visual.root,kinds,60);
    this.trail=new FlowerInstances(visual.root.parent,kinds,trailCapacity);
    this.petals=new PetalStorm(visual.root.parent);
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
    const pace=Math.min(1,Math.abs(speed)/maxSpeed);
    if(this.enabled&&this.bed&&Math.abs(speed)>.8){
      // Mostly petals; a whole flower now and then.
      this.petalEmit+=dt*(14+70*pace);
      while(this.petalEmit>=1){this.petalEmit-=1;this.spawnPetal(root,velocity);}
      if(Math.abs(speed)>1.2){
        this.emit+=dt*(.8+2.5*pace);
        while(this.emit>=1){this.emit-=1;this.spawn(root,velocity);}
      }
    }else{this.emit=0;this.petalEmit=0;}
    this.petals.update(dt);
    for(let i=this.falling.length-1;i>=0;i--){
      const f=this.falling[i];
      f.v.y-=9.82*dt;f.pos.addScaledVector(f.v,dt);f.rot.x+=f.spin.x*dt;f.rot.z+=f.spin.z*dt;
      let landed=false;
      if(f.pos.y<=f.groundY){f.pos.y=f.groundY;f.rot.x=(Math.random()-.5)*.35;f.rot.z=(Math.random()-.5)*.35;landed=true;}
      this.m.compose(f.pos,this.q.setFromEuler(f.rot),this.s.setScalar(f.scale));this.trail.set(f.kind,f.slot,this.m);
      if(landed)this.falling.splice(i,1);
    }
  }
  spawnPetal(root,velocity) {
    const {min,max,floor}=this.bed,r=Math.random;
    // Lift off the top of the flower pile anywhere in the bed.
    const p=new THREE.Vector3(min.x+(max.x-min.x)*r(),floor+.55+r()*.25,min.z+(max.z-min.z)*r()).applyQuaternion(root.quaternion).add(root.position);
    const v=new THREE.Vector3((r()-.5)*2.2,1.6+r()*2.2,(r()-.5)*2.2);
    v.addScaledVector(new THREE.Vector3(0,0,-1).applyQuaternion(root.quaternion),.6+r()*.8);
    if(velocity)v.addScaledVector(velocity,.85);
    this.petals.emit(p.x,p.y,p.z,v.x,v.y,v.z,this.ground(p.x+v.x*.35,p.z+v.z*.35));
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
  clearTrail(){this.trail.clear();this.petals.clear();this.falling.length=0;this.emit=0;this.petalEmit=0;}
  dispose(){this.bedFlowers.dispose();this.trail.dispose();this.petals.dispose();}
}
