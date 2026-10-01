// Procedural roses and flowers fixed in the truck bed, plus rose petals that
// scatter while driving. No model files: every shape is built in code.
// All sizes are simulation units; the trail lives beside the car root, so the
// AR anchor's toy scale applies to it too.
import * as THREE from 'three';

const rand=(a,b)=>a+Math.random()*(b-a);
const pick=list=>list[(Math.random()*list.length)|0];

// Concatenate geometries (position + normal only) without addon dependencies.
function merge(list) {
  const parts=list.map(g=>{const n=g.index?g.toNonIndexed():g;if(!n.attributes.normal)n.computeVertexNormals();return n;});
  const count=parts.reduce((s,g)=>s+g.attributes.position.count,0);
  const pos=new Float32Array(count*3),nor=new Float32Array(count*3);let o=0;
  for(const g of parts){pos.set(g.attributes.position.array,o*3);nor.set(g.attributes.normal.array,o*3);o+=g.attributes.position.count;}
  const out=new THREE.BufferGeometry();
  out.setAttribute('position',new THREE.BufferAttribute(pos,3));out.setAttribute('normal',new THREE.BufferAttribute(nor,3));
  out.computeBoundingSphere();return out;
}

// A cupped teardrop petal in XY (base at y=-.16, tip at y=.19), cup toward +Z.
export function petalGeometry(width=1,length=1,cup=2.2) {
  const s=new THREE.Shape();
  s.moveTo(0,-.16);
  s.bezierCurveTo(.13*width,-.12,.15*width,.07,.07*width,.15);
  s.quadraticCurveTo(0,.19,-.07*width,.15);
  s.bezierCurveTo(-.15*width,.07,-.13*width,-.12,0,-.16);
  const g=new THREE.ShapeGeometry(s,6),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);p.setZ(i,x*x*cup+Math.max(0,y)*y*.9);p.setY(i,y*length);}
  g.computeVertexNormals();return g;
}
// Petal standing on its base around the flower centre, cup facing inward.
function ringPetal(base,{angle,radius,tilt,scale,y=0}) {
  return base.clone().translate(0,.16,0).rotateY(Math.PI).scale(scale,scale,scale)
    .rotateX(tilt).translate(0,y,radius).rotateY(angle);
}

function roseHead() {
  const base=petalGeometry(1,1,2.6),parts=[];
  const rings=[[3,.42,.012,.12,.06],[5,.62,.04,.42,.03],[6,.82,.075,.8,.01],[8,1,.11,1.18,-.01]];
  rings.forEach(([n,scale,radius,tilt,y],r)=>{for(let i=0;i<n;i++)parts.push(ringPetal(base,{angle:(i+r*.5)/n*Math.PI*2,radius,tilt,scale,y}));});
  return merge(parts);
}
function tulipHead() {
  const base=petalGeometry(1.25,1.35,1.8),parts=[];
  for(let i=0;i<6;i++)parts.push(ringPetal(base,{angle:i/6*Math.PI*2+(i%2)*.3,radius:.05+(i%2)*.015,tilt:.12+(i%2)*.1,scale:.95}));
  return merge(parts);
}
function daisyHead() {
  const base=petalGeometry(.45,1.6,.4),parts=[];
  for(let i=0;i<14;i++)parts.push(base.clone().translate(0,.16,0).rotateX(-Math.PI/2+.25).translate(0,0,.04).rotateY(i/14*Math.PI*2));
  return merge(parts);
}
function greenery(height,leaves) {
  const parts=[new THREE.CylinderGeometry(.02,.026,height,5).translate(0,height/2,0)];
  const leaf=petalGeometry(.7,1.4,1.2);
  for(let i=0;i<leaves;i++)parts.push(leaf.clone().translate(0,.16,0).rotateX(.9).rotateY(i*2.4+.5).translate(0,height*(.3+.2*i),0));
  return merge(parts);
}

// Head scale and stem length keep the bouquet inside the bed, just above the rails.
const STEM=.52,HEAD=.62;
const KINDS=[
  // Roses dominate; colours are per instance.
  {weight:.6,head:()=>roseHead(),headY:STEM,stem:()=>greenery(STEM,2),colors:[0xc8102e,0xa0001c,0xe0245e,0xff6f9c,0xfff1f4,0xd81b60]},
  {weight:.2,head:()=>tulipHead(),headY:STEM*.95,stem:()=>greenery(STEM*.95,1),colors:[0xffd23f,0xff7aa2,0x9b5de5,0xff8c42,0xe63946]},
  {weight:.2,head:()=>daisyHead(),headY:STEM*.9,stem:()=>greenery(STEM*.9,1),colors:[0xffffff,0xffe3ef,0xe4d7ff],
    center:()=>new THREE.SphereGeometry(.055,10,6).scale(1,.45,1)},
];
const pickKind=()=>{let r=Math.random();for(let i=0;i<KINDS.length;i++){r-=KINDS[i].weight;if(r<=0)return i;}return 0;};

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
  const b=new THREE.Box3().setFromPoints(spots.filter(p=>Math.abs(p.y-floor)<.08));
  return {min:b.min,max:b.max,floor};
}

// A bouquet that fills the bed. Each kind is drawn with a few InstancedMeshes.
class BedBouquet {
  constructor(parent,bed,count=84) {
    this.group=new THREE.Group();this.group.name='BedBouquet';parent.add(this.group);
    const petal=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.5,metalness:0,side:THREE.DoubleSide});
    const green=new THREE.MeshStandardMaterial({color:0x3f8f3a,roughness:.7,metalness:0,side:THREE.DoubleSide});
    const yellow=new THREE.MeshStandardMaterial({color:0xffc533,roughness:.6,metalness:0});
    this.materials=[petal,green,yellow];
    const placed=KINDS.map(()=>[]);
    // Jittered grid over the bed so the flowers cover it evenly.
    const cols=7,rows=Math.max(4,Math.round(count/cols));
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      const x=bed.min.x+(bed.max.x-bed.min.x)*((c+.5+rand(-.35,.35))/cols);
      const z=bed.min.z+(bed.max.z-bed.min.z)*((r+.5+rand(-.35,.35))/rows);
      const m=new THREE.Matrix4().compose(new THREE.Vector3(x,bed.floor-.02,z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(-.28,.28),rand(0,Math.PI*2),rand(-.28,.28))),
        new THREE.Vector3().setScalar(rand(.85,1.25)));
      placed[pickKind()].push(m);
    }
    this.count=0;
    KINDS.forEach((kind,k)=>{
      const list=placed[k];if(!list.length)return;this.count+=list.length;
      const head=kind.head().scale(HEAD,HEAD,HEAD).translate(0,kind.headY,0);
      const add=(geometry,material,colors)=>{
        const mesh=new THREE.InstancedMesh(geometry,material,list.length);mesh.castShadow=true;mesh.receiveShadow=true;
        list.forEach((m,i)=>{mesh.setMatrixAt(i,m);if(colors)mesh.setColorAt(i,new THREE.Color(pick(colors)));});
        this.group.add(mesh);return mesh;
      };
      add(head,petal,kind.colors);add(kind.stem(),green);
      if(kind.center)add(kind.center().scale(HEAD,HEAD,HEAD).translate(0,kind.headY+.012,0),yellow);
    });
  }
  dispose(){this.group.removeFromParent();this.group.traverse(o=>{if(o.isInstancedMesh){o.geometry.dispose();o.dispose();}});this.materials.forEach(m=>m.dispose());}
}

// Rose petals: one InstancedMesh with per-petal colour. Petals inherit the
// car's motion, then air drag holds them back so they stream behind it,
// flutter (sway + tumble) and settle flat on the ground.
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
  constructor({visual,ground=()=>0}) {
    this.visual=visual;this.ground=ground;this.enabled=true;this.petalEmit=0;
    this.bed=findBed(visual);
    this.bouquet=this.bed?new BedBouquet(visual.root,this.bed):null;
    this.petals=new PetalStorm(visual.root.parent);
  }
  get hasBed(){return !!this.bed;}
  // speed: signed forward speed; velocity: chassis velocity in parent space.
  update(dt,{speed=0,maxSpeed=14,velocity=null}={}) {
    if(this.enabled&&this.bed&&Math.abs(speed)>.8){
      this.petalEmit+=dt*(14+70*Math.min(1,Math.abs(speed)/maxSpeed));
      while(this.petalEmit>=1){this.petalEmit-=1;this.spawnPetal(velocity);}
    }else this.petalEmit=0;
    this.petals.update(dt);
  }
  spawnPetal(velocity) {
    const root=this.visual.root,{min,max,floor}=this.bed,r=Math.random;
    // Lift off the top of the bouquet anywhere in the bed.
    const p=new THREE.Vector3(min.x+(max.x-min.x)*r(),floor+.6+r()*.25,min.z+(max.z-min.z)*r()).applyQuaternion(root.quaternion).add(root.position);
    const v=new THREE.Vector3((r()-.5)*2.2,1.6+r()*2.2,(r()-.5)*2.2);
    v.addScaledVector(new THREE.Vector3(0,0,-1).applyQuaternion(root.quaternion),.6+r()*.8);
    if(velocity)v.addScaledVector(velocity,.85);
    this.petals.emit(p.x,p.y,p.z,v.x,v.y,v.z,this.ground(p.x+v.x*.35,p.z+v.z*.35));
  }
  clearTrail(){this.petals.clear();this.petalEmit=0;}
  dispose(){this.bouquet?.dispose();this.petals.dispose();}
}
