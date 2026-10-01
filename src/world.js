import * as THREE from 'three';
import * as CANNON from 'cannon-es';
export class TestWorld {
  constructor(scene) {
    this.scene=scene;this.world=new CANNON.World({gravity:new CANNON.Vec3(0,-9.82,0),allowSleep:true});
    this.world.broadphase=new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations=14;this.world.defaultContactMaterial.friction=.48;this.world.defaultContactMaterial.restitution=.02;
    this.dynamic=[];this.meshes=[];this.bodies=[];this.occluders=[];this.materials=new Map();this.padTime=0;this.complete=false;
    this.box([50,1,50],[0,-.5,0],0xe2ded0);
    this.box([50,1, .3],[0,.5,25],0xbac8bd);this.box([50,1,.3],[0,.5,-25],0xbac8bd);
    this.box([.3,1,50],[25,.5,0],0xbac8bd);this.box([.3,1,50],[-25,.5,0],0xbac8bd);
    // Ramp is a true tilted collision box. No mismatch between visible and physics transforms.
    const angle=Math.atan2(1.8,8);
    this.box([4.6,.16,Math.hypot(8,1.8)],[8,1.06,1],0xc58b57,0,[-angle,0,0]);
    this.box([4.6,1.9,4],[8,.95,7],0xd9c7a6);
    this.box([.16,.24,4],[5.65,2.02,7],0xc58b57);this.box([.16,.24,4],[10.35,2.02,7],0xc58b57);
    // Pushable box + pressure pad: one very small, visible physics task.
    this.crate=this.box([1.65,1.3,1.65],[-8,.68,1.6],0xe7a857,35);
    this.box([1.4,.9,1.4],[-14,.5,-3],0x75a795,23);
    this.box([1,.9,1],[-11,.5,-4.5],0xd68c74,16);
    this.pad=this.decoration([3.6,.04,3.6],[-8,.025,7],0x78b2a7);
    // Narrow passage with full roof and side colliders.
    for(const x of [-1.9,1.9])this.box([.5,3,5],[x,1.5,7],0xb6c7c2);
    this.box([4.3,.3,5],[0,3.15,7],0x9cafaa);
    this.box([7,.18,1.6],[-8,.12,-7],0xcab584);
    this.box([.6,.6,.6],[13,.3,-9],0xe7b160);this.box([.6,.6,.6],[14,.3,-9.7],0xd1a65b);
    // Ground markings carry no physics; they sit slightly above the ground.
    for(let i=0;i<5;i++)this.decoration([.08,.012,.68],[0,.012,-12+i*1.6],0xadb6a8);
    for(let x=-24;x<=24;x+=4) for(let z=-24;z<=24;z+=4) {
      if((x+z)%8===0)this.decoration([.055,.006,.055],[x,.008,z],0xb8bdb1);
    }
    this.label('01  منحدر',[8,.022,-5.5],4.5);
    this.label('02  ادفع الصندوق',[-8,.023,-1.5],5.3);
    this.label('03  ممر ضيّق',[0,.024,2.8],4.8);
    this.label('JOOD · TEST LAB',[0,.023,-18.5],7.8);
    const hemi=new THREE.HemisphereLight(0xeaf5f2,0x928366,2.0);scene.add(hemi);
    this.sun=new THREE.DirectionalLight(0xfff2d9,2.6);this.sun.position.set(-12,20,-9);this.sun.castShadow=true;
    this.sun.shadow.mapSize.set(1024,1024);Object.assign(this.sun.shadow.camera,{left:-26,right:26,top:26,bottom:-26,near:.1,far:65});
    this.sun.shadow.normalBias=.025;this.sun.shadow.bias=-.00015;scene.add(this.sun);
  }
  material(color) {if(!this.materials.has(color))this.materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.85}));return this.materials.get(color);}
  decoration(size,pos,color) {const m=new THREE.Mesh(new THREE.BoxGeometry(...size),this.material(color));m.position.set(...pos);this.scene.add(m);this.meshes.push(m);return m;}
  box(size,pos,color,mass=0,rotation=[0,0,0]) {
    const mesh=this.decoration(size,pos,color);mesh.rotation.set(...rotation);mesh.castShadow=size[1]<5;mesh.receiveShadow=true;
    const body=new CANNON.Body({mass,material:this.world.defaultMaterial,shape:new CANNON.Box(new CANNON.Vec3(...size.map(v=>v/2)))});
    body.position.set(...pos);body.quaternion.setFromEuler(...rotation,'XYZ');body.linearDamping=.18;body.angularDamping=.22;
    this.world.addBody(body);this.bodies.push(body);
    const pair={body,mesh,start:[...pos],rotation:[...rotation]};if(mass)this.dynamic.push(pair);else if(pos[1]>1.3)this.occluders.push(mesh);
    return pair;
  }
  label(text,pos,width) {
    const c=document.createElement('canvas');c.width=768;c.height=160;const ctx=c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#49615b';ctx.font='bold 58px Tahoma, Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,384,80);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(width,width*160/768),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
    m.rotation.x=-Math.PI/2;m.position.set(...pos);this.scene.add(m);this.meshes.push(m);
  }
  sync(dt) {
    for(const {body,mesh} of this.dynamic) {mesh.position.copy(body.position);mesh.quaternion.copy(body.quaternion);}
    const p=this.crate.body.position;
    const on=Math.abs(p.x+8)<1.4&&Math.abs(p.z-7)<1.4&&p.y<1.8;
    this.padTime=on?this.padTime+dt:0;
    if(this.padTime>1 && !this.complete) {this.complete=true;this.pad.material=new THREE.MeshStandardMaterial({color:0x46b788,emissive:0x184d31,roughness:.8});return true;}
    return false;
  }
  reset() {
    for(const pair of this.dynamic) {const b=pair.body;b.position.set(...pair.start);b.quaternion.setFromEuler(...pair.rotation);b.velocity.setZero();b.angularVelocity.setZero();b.force.setZero();b.torque.setZero();b.aabbNeedsUpdate=true;b.wakeUp();}
    this.padTime=0;this.complete=false;
    if(this.pad.material!==this.material(0x78b2a7)){this.pad.material.dispose();this.pad.material=this.material(0x78b2a7);}
    this.world.broadphase.dirty=true;
  }
}
