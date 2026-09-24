import * as THREE from 'three';
import { CONFIG } from './core.js';
export class CarVisual {
  constructor(scene) {
    this.root=new THREE.Group();scene.add(this.root);
    this.bodyMount=new THREE.Group();this.bodyMount.position.y=CONFIG.chassisLift;this.root.add(this.bodyMount);
    this.placeholder=new THREE.Group();this.bodyMount.add(this.placeholder);
    this.materials={
      body:new THREE.MeshStandardMaterial({color:0x4bb7a5,roughness:.38,metalness:.08}),
      dark:new THREE.MeshStandardMaterial({color:0x263439,roughness:.75}),
      glass:new THREE.MeshStandardMaterial({color:0x263f49,roughness:.24,metalness:.15}),
      accent:new THREE.MeshStandardMaterial({color:0xffbb65,roughness:.6}),
      tire:new THREE.MeshStandardMaterial({color:0x1b252a,roughness:.92}),
      hub:new THREE.MeshStandardMaterial({color:0xe1e7dc,roughness:.4,metalness:.25}),
      front:new THREE.MeshStandardMaterial({color:0xfff5cf,emissive:0xffe7aa,emissiveIntensity:.6}),
      back:new THREE.MeshStandardMaterial({color:0xfa6751,emissive:0xee3422,emissiveIntensity:.2}),
    };
    const part=(w,h,d,x,y,z,mat)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;this.placeholder.add(m);return m;};
    const m=this.materials;
    part(1.8,.46,3.4,0,0,0,m.body);
    part(1.5,.49,1.38,0,.5,-.22,m.glass);
    part(1.62,.09,1.6,0,.79,-.22,m.body);
    part(1.5,.08,.52,0,.28,1.03,m.accent);
    part(1.85,.18,.18,0,-.09,1.77,m.dark);
    part(1.85,.18,.18,0,-.09,-1.77,m.dark);
    part(.11,.60,1.46,-.69,.46,-.22,m.body);part(.11,.60,1.46,.69,.46,-.22,m.body);
    for(const x of [-.61,.61]) {part(.32,.12,.06,x,.03,1.72,m.front);part(.23,.12,.06,x,.03,-1.72,m.back);}
    const antenna=new THREE.Mesh(new THREE.CylinderGeometry(.014,.024,.55,6),m.dark);antenna.position.set(.51,1,-.75);this.placeholder.add(antenna);
    const cap=new THREE.Mesh(new THREE.SphereGeometry(.06,8,6),m.accent);cap.position.set(.51,1.3,-.75);this.placeholder.add(cap);
    // Four independent visual pivots are driven by four suspension contacts.
    this.wheelMounts=[];this.wheelPlaceholders=[];
    const tireGeo=new THREE.CylinderGeometry(CONFIG.wheelRadius,CONFIG.wheelRadius,CONFIG.wheelWidth,16).rotateZ(Math.PI/2);
    const hubGeo=new THREE.CylinderGeometry(.24,.24,.35,12).rotateZ(Math.PI/2);
    for(let i=0;i<4;i++) {
      const pivot=new THREE.Group(),v=new THREE.Group();
      const tire=new THREE.Mesh(tireGeo,m.tire),hub=new THREE.Mesh(hubGeo,m.hub);tire.castShadow=hub.castShadow=true;
      v.add(tire,hub);
      const spoke=new THREE.Mesh(new THREE.BoxGeometry(.36,.07,.40),m.dark);v.add(spoke);
      pivot.add(v);this.root.add(pivot);this.wheelMounts.push(pivot);this.wheelPlaceholders.push(v);
    }
  }
  sync(vehicle) {
    this.root.position.copy(vehicle.body.position);this.root.quaternion.copy(vehicle.body.quaternion);
    for(let i=0;i<4;i++) {const w=vehicle.wheelLocal(i);this.wheelMounts[i].position.copy(w.position);this.wheelMounts[i].quaternion.copy(w.quaternion);}
    this.materials.back.emissiveIntensity=vehicle.input.brake ? 1.5 : .2;
  }
  dispose() {
    this.root.removeFromParent();const g=new Set(),m=new Set();
    this.root.traverse(o=>{if(o.geometry)g.add(o.geometry);for(const mat of (Array.isArray(o.material)?o.material:[o.material]))if(mat)m.add(mat);});
    g.forEach(x=>x.dispose());m.forEach(x=>x.dispose());
  }
}
