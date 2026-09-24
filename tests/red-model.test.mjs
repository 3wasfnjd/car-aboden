// Actual red upload geometry + cannon-es. Node skips image decoding only;
// the browser suite separately verifies the red paint and textured tires.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {prepareRedGmcModel} from '../src/models.js';
import {installGmcModel} from '../src/gmc.js';
import {MotriVehicle} from '../src/vehicle.js';
import {CarVisual} from '../src/visuals.js';
import {CONFIG} from '../src/core.js';
const b=await readFile(new URL('../models/gmc_sierra_red_light.glb',import.meta.url));
assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(8),b.length);
const n=b.readUInt32LE(12),json=JSON.parse(b.subarray(20,20+n).toString()),bin=b.subarray(28+n,28+n+b.readUInt32LE(20+n));
json.buffers=[{byteLength:bin.length,uri:'data:application/octet-stream;base64,'+bin.toString('base64')}];
for(const m of json.materials){
  for(const key of ['normalTexture','occlusionTexture','emissiveTexture'])delete m[key];
  if(m.pbrMetallicRoughness){delete m.pbrMetallicRoughness.baseColorTexture;delete m.pbrMetallicRoughness.metallicRoughnessTexture;}
}
delete json.images;delete json.textures;delete json.samplers;
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,init={}){this.type=type;Object.assign(this,init);}};
const {scene:source}=await new GLTFLoader().parseAsync(JSON.stringify(json),'');
const blobSha=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
function setup(){
 const world=new CANNON.World({gravity:new CANNON.Vec3(0,-9.82,0)});world.solver.iterations=14;world.defaultContactMaterial.friction=.48;
 const floor=new CANNON.Body({mass:0,material:world.defaultMaterial,shape:new CANNON.Box(new CANNON.Vec3(100,.5,100))});floor.position.y=-.5;world.addBody(floor);
 const car=new MotriVehicle(world),visual=new CarVisual(new THREE.Scene()),prepared=prepareRedGmcModel(source);
 installGmcModel(visual,car,prepared);car.reset([0,.72,0]);return {world,car,visual,prepared};
}
function tick(s,n,input={throttle:0,steer:0,brake:false}){s.car.input=input;for(let i=0;i<n;i++){s.car.beforeStep(CONFIG.step);s.world.step(CONFIG.step);s.car.afterStep(CONFIG.step);}}
function dispose(s){s.car.dispose();s.visual.dispose();}
test('both uploaded GLBs remain byte-identical and original configuration is retained',async()=>{
 assert.equal(blobSha(b),'42358562a505db03ecab76c68bb82d2662cb0229');
 const original=await readFile(new URL('../models/gmc_sierra_work_truck.glb',import.meta.url));
 assert.equal(blobSha(original),'4c977297e661de47f2622ee96f4db3849c53fcf6');
 const cfg=JSON.parse(await readFile(new URL('../models/vehicle.json',import.meta.url),'utf8'));
 const old=JSON.parse(await readFile(new URL('../models/vehicle-original.json',import.meta.url),'utf8'));
 assert.equal(cfg.model,'gmc_sierra_red_light.glb');assert.equal(cfg.profile,'gmc-sierra-red-light');
 assert.equal(old.model,'gmc_sierra_work_truck.glb');assert.equal(old.profile,'gmc-sierra-work-truck');
});
test('red GMC keeps all triangles, red paint, separate tire material and four straight wheel pivots',()=>{
 const wheel=source.getObjectByName('Wheel_FL'),before=Array.from(wheel.geometry.attributes.position.array),position=wheel.position.clone();
 const p=prepareRedGmcModel(source);assert.equal(p.info.triangles,3971);assert.equal(p.wheels.length,4);assert.equal(p.info.variant,'red-light');
 assert.deepEqual(Array.from(wheel.geometry.attributes.position.array),before);assert.deepEqual(wheel.position,position);
 const materials=[];p.body.traverse(o=>{if(o.isMesh)materials.push(o.material);});
 const paint=materials.find(m=>m.name==='Body_Red');assert.ok(paint&&paint.color.r>paint.color.g*10&&paint.color.r>paint.color.b*10);
 for(const w of p.wheels){assert.equal(w.geometry.index.count,852);assert.equal(w.mesh.material.name,'Trim_Tires_Lights');assert.notEqual(w.mesh.material,paint);assert.equal(w.neutralYaw,0);assert.ok(w.radius>.3&&w.radius<.45);assert.ok(Math.abs(w.center.y+.2)<1e-6);}
 assert.ok(p.wheels[0].center.x<0&&p.wheels[1].center.x>0&&p.wheels[0].center.z>0&&p.wheels[2].center.z<0);
 const all=new THREE.Group();all.add(p.body);for(const w of p.wheels){const pivot=new THREE.Group();pivot.position.copy(w.center);pivot.add(w.mesh);all.add(pivot);}
 assert.ok(Math.abs(new THREE.Box3().setFromObject(all).getSize(new THREE.Vector3()).x-2.2)<1e-5);
 console.log('RED_GMC_GEOMETRY',JSON.stringify({...p.info,shell:p.shell,cabin:p.cabin}));
});
test('red GMC replaces placeholders, settles and has aligned suspension without changing driving tune',()=>{
 const s=setup();tick(s,360);s.visual.sync(s.car);
 assert.equal(s.car.contacts,4);assert.equal(s.visual.placeholder.visible,false);assert.ok(s.visual.wheelPlaceholders.every(o=>!o.visible));
 assert.equal(s.car.body.shapes.length,2);assert.ok(s.car.body.position.y>.2&&s.car.body.position.y<1);
 for(const key of ['maxSpeed','reverseSpeed','engineForce','precisionSpeed','frictionSlip','stiffness'])assert.equal(s.car.params[key],CONFIG[key]);
 for(let i=0;i<4;i++){const w=s.car.wheelLocal(i);assert.ok(Math.abs(w.position.x-s.prepared.wheels[i].center.x)<.01);assert.ok(Math.abs(w.position.z-s.prepared.wheels[i].center.z)<.01);}
 dispose(s);
});
test('red GMC retains forward speed and brakes to rest without oscillation',()=>{
 const s=setup();tick(s,240);tick(s,600,{throttle:1,steer:0});
 console.log('RED_GMC_SPEED',s.car.speed);assert.ok(s.car.speed>12&&s.car.speed<CONFIG.maxSpeed+.5);
 tick(s,360,{brake:true});assert.ok(Math.abs(s.car.speed)<.05);dispose(s);
});
test('red GMC reverses and wheel pivots rotate',()=>{
 const s=setup();tick(s,240);s.visual.sync(s.car);const old=s.visual.wheelMounts[2].quaternion.clone();
 tick(s,90,{throttle:-1,steer:0});s.visual.sync(s.car);assert.ok(s.car.body.position.z<-.4);assert.ok(old.angleTo(s.visual.wheelMounts[2].quaternion)>.01);dispose(s);
});
test('red GMC pushes a puzzle crate without climbing over it',()=>{
 const s=setup(),box=new CANNON.Body({mass:35,material:s.world.defaultMaterial,shape:new CANNON.Box(new CANNON.Vec3(.825,.65,.825))});
 box.position.set(0,.68,5);box.linearDamping=.18;box.angularDamping=.22;s.world.addBody(box);tick(s,240);
 let maxY=0;for(let i=0;i<900;i++){tick(s,1,{throttle:1,steer:0,precision:true});maxY=Math.max(maxY,s.car.body.position.y);}
 console.log('RED_GMC_PUSH',JSON.stringify({box:box.position.toArray(),car:s.car.body.position.toArray(),maxY}));
 assert.ok(box.position.z>5.5);assert.ok(maxY<1.2);dispose(s);
});
test('red GMC can climb a shallow ramp with four-ray suspension',()=>{
 const s=setup(),ramp=new CANNON.Body({mass:0,material:s.world.defaultMaterial,shape:new CANNON.Box(new CANNON.Vec3(4,.15,4))});
 ramp.position.set(0,.85,7);ramp.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0),-.25);s.world.addBody(ramp);tick(s,240);
 let maxY=0;for(let i=0;i<650;i++){tick(s,1,{throttle:.35,steer:0});maxY=Math.max(maxY,s.car.body.position.y);}
 console.log('RED_GMC_RAMP',maxY);assert.ok(maxY>1.2&&maxY<4);assert.ok(Number.isFinite(s.car.speed));dispose(s);
});
