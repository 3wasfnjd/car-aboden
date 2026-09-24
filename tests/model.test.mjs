// Geometry and physics tests use the actual uploaded GLB bytes. Only texture
// decoding is omitted in Node; the browser suite loads the original textures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {prepareGmcModel,installGmcModel} from '../src/gmc.js';
import {MotriVehicle} from '../src/vehicle.js';
import {CarVisual} from '../src/visuals.js';
import {CONFIG} from '../src/core.js';
const b=await readFile(new URL('../models/gmc_sierra_work_truck.glb',import.meta.url));
assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(8),b.length);
const n=b.readUInt32LE(12),json=JSON.parse(b.subarray(20,20+n).toString()),bin=b.subarray(28+n,28+n+b.readUInt32LE(20+n));
json.buffers=[{byteLength:bin.length,uri:'data:application/octet-stream;base64,'+bin.toString('base64')}];
json.materials=json.materials.map(m=>({name:m.name,doubleSided:m.doubleSided,pbrMetallicRoughness:{}}));
delete json.images;delete json.textures;delete json.samplers;
// DOM progress events are not built into Node. No geometry/physics is mocked.
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,init={}){this.type=type;Object.assign(this,init);}};
const {scene:source}=await new GLTFLoader().parseAsync(JSON.stringify(json),'');
function setup(){
 const world=new CANNON.World({gravity:new CANNON.Vec3(0,-9.82,0)});world.solver.iterations=14;world.defaultContactMaterial.friction=.48;
 const floor=new CANNON.Body({mass:0,material:world.defaultMaterial,shape:new CANNON.Box(new CANNON.Vec3(100,.5,100))});floor.position.y=-.5;world.addBody(floor);
 const car=new MotriVehicle(world),visual=new CarVisual(new THREE.Scene()),prepared=prepareGmcModel(source);
 installGmcModel(visual,car,prepared);car.reset([0,.72,0]);return {world,car,visual,prepared};
}
function tick(s,n,input={throttle:0,steer:0,brake:false}){s.car.input=input;for(let i=0;i<n;i++){s.car.beforeStep(CONFIG.step);s.world.step(CONFIG.step);s.car.afterStep(CONFIG.step);}}
function dispose(s){s.car.dispose();s.visual.dispose();}
test('original GMC separates into four wheels without deleting vehicle triangles',()=>{
 const p=prepareGmcModel(source);assert.equal(p.info.triangles,3971);assert.equal(p.wheels.length,4);assert.equal(p.body.children.length,2);
 for(const w of p.wheels){assert.equal(w.geometry.index.count,852);assert.ok(w.geometry.attributes.uv);assert.ok(w.radius>.3&&w.radius<.45);}
 assert.ok(p.wheels[0].center.x<0&&p.wheels[1].center.x>0&&p.wheels[0].center.z>0&&p.wheels[2].center.z<0);
 console.log('GMC_GEOMETRY',JSON.stringify({...p.info,neutralYaw:p.wheels.map(w=>w.neutralYaw),shell:p.shell,cabin:p.cabin}));
});
test('GMC replaces all placeholder parts and settles with aligned wheel pivots',()=>{
 const s=setup();tick(s,360);s.visual.sync(s.car);assert.equal(s.visual.placeholder.visible,false);assert.ok(s.visual.wheelPlaceholders.every(o=>!o.visible));
 assert.equal(s.car.contacts,4);assert.equal(s.car.body.shapes.length,2);assert.ok(s.car.body.position.y>.2&&s.car.body.position.y<1);
 for(let i=0;i<4;i++){const w=s.car.wheelLocal(i);assert.ok(Math.abs(w.position.x-s.prepared.wheels[i].center.x)<.01);assert.ok(Math.abs(w.position.z-s.prepared.wheels[i].center.z)<.01);}
 dispose(s);
});
test('GMC reaches a higher actual speed and brakes without oscillating',()=>{
 const s=setup();tick(s,240);tick(s,600,{throttle:1,steer:0});const speed=s.car.speed;
 console.log('GMC_SPEED',speed);assert.ok(speed>12&&speed<CONFIG.maxSpeed+.5);tick(s,360,{brake:true});assert.ok(Math.abs(s.car.speed)<.05);dispose(s);
});
test('GMC reverses and the wheel visual pivots actually rotate',()=>{
 const s=setup();tick(s,240);s.visual.sync(s.car);const old=s.visual.wheelMounts[2].quaternion.clone();tick(s,90,{throttle:-1,steer:0});s.visual.sync(s.car);
 assert.ok(s.car.body.position.z<-.4);assert.ok(old.angleTo(s.visual.wheelMounts[2].quaternion)>.01);dispose(s);
});
test('GMC pushes the puzzle crate in precision mode without riding over it',()=>{
 const s=setup(),box=new CANNON.Body({mass:35,material:s.world.defaultMaterial,shape:new CANNON.Box(new CANNON.Vec3(.825,.65,.825))});box.position.set(0,.68,5);box.linearDamping=.18;box.angularDamping=.22;s.world.addBody(box);tick(s,240);
 let maxY=0;for(let i=0;i<900;i++){tick(s,1,{throttle:1,steer:0,precision:true});maxY=Math.max(maxY,s.car.body.position.y);}
 console.log('GMC_PUSH',JSON.stringify({box:box.position.toArray(),car:s.car.body.position.toArray(),maxY}));assert.ok(box.position.z>5.5);assert.ok(maxY<1.2);dispose(s);
});
test('GMC raycast suspension can climb a shallow ramp',()=>{
 const s=setup(),ramp=new CANNON.Body({mass:0,material:s.world.defaultMaterial,shape:new CANNON.Box(new CANNON.Vec3(4,.15,4))});ramp.position.set(0,.85,7);ramp.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0),-.25);s.world.addBody(ramp);tick(s,240);
 let maxY=0;for(let i=0;i<650;i++){tick(s,1,{throttle:.35,steer:0});maxY=Math.max(maxY,s.car.body.position.y);}
 console.log('GMC_RAMP',maxY);assert.ok(maxY>1.2&&maxY<4);assert.ok(Number.isFinite(s.car.speed));dispose(s);
});
