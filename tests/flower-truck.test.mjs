// Tripo flower-truck van: wheel split + driving on the real (light) GLB geometry.
// Node skips texture decoding; the browser suite covers rendering.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {prepareFlowerTruckModel} from '../src/tripo.js';
import {installGmcModel} from '../src/gmc.js';
import {MotriVehicle} from '../src/vehicle.js';
import {CarVisual} from '../src/visuals.js';
import {CONFIG} from '../src/core.js';
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,init={}){this.type=type;Object.assign(this,init);}};
const cfg=JSON.parse(await readFile(new URL('../models/vehicle-flowertruck.json',import.meta.url),'utf8'));
const b=await readFile(new URL('../models/'+cfg.model,import.meta.url));
const n=b.readUInt32LE(12),json=JSON.parse(b.subarray(20,20+n).toString()),bin=b.subarray(28+n,28+n+b.readUInt32LE(20+n));
json.buffers=[{byteLength:bin.length,uri:'data:application/octet-stream;base64,'+bin.toString('base64')}];
for(const m of json.materials){for(const k of ['normalTexture','occlusionTexture','emissiveTexture'])delete m[k];if(m.pbrMetallicRoughness){delete m.pbrMetallicRoughness.baseColorTexture;delete m.pbrMetallicRoughness.metallicRoughnessTexture;}}
delete json.images;delete json.textures;delete json.samplers;
const {scene:source}=await new GLTFLoader().parseAsync(JSON.stringify(json),'');
function setup(){
  const world=new CANNON.World({gravity:new CANNON.Vec3(0,-9.82,0)});world.solver.iterations=14;world.defaultContactMaterial.friction=.48;
  const floor=new CANNON.Body({mass:0,material:world.defaultMaterial,shape:new CANNON.Box(new CANNON.Vec3(200,.5,200))});floor.position.y=-.5;world.addBody(floor);
  const car=new MotriVehicle(world),visual=new CarVisual(new THREE.Scene()),prepared=prepareFlowerTruckModel(source,{length:cfg.length});
  installGmcModel(visual,car,prepared);car.reset([0,.72,0]);return {world,car,visual,prepared};
}
const tick=(s,steps,input)=>{s.car.input=input;for(let i=0;i<steps;i++){s.car.beforeStep(CONFIG.step);s.world.step(CONFIG.step);s.car.afterStep(CONFIG.step);}};
test('four wheels are cut out of the fused mesh and the body keeps the rest',()=>{
  const {prepared}=setup();
  assert.equal(prepared.wheels.length,4);
  for(const t of prepared.info.wheelTriangles)assert.ok(t>500,'each wheel gets its tyre triangles');
  const body=prepared.body.children[0].geometry.index.count/3;
  assert.equal(body+prepared.info.wheelTriangles.reduce((a,c)=>a+c,0),prepared.info.triangles,'no triangle lost or duplicated');
  for(const w of prepared.wheels)assert.ok(Math.abs(w.center.y+.2)<1e-6&&w.radius>.4&&w.radius<.5);
  assert.ok(prepared.emit.push.x>0,'petals blow out of the right-side flower window');
});
test('van rests on four wheels, drives, coasts to a stop and reverses',()=>{
  const s=setup();tick(s,240,{throttle:0,steer:0,brake:false});
  assert.equal(s.car.contacts,4);
  tick(s,600,{throttle:1,steer:0,brake:false});assert.ok(s.car.speed>13,'reaches top speed');
  let t=0;while(s.car.speed>.1&&t<600){tick(s,1,{throttle:0,steer:0,brake:false});t++;}
  assert.ok(t<480,'coasts to a stop within 4 s');
  tick(s,240,{throttle:-1,steer:0,brake:false});assert.ok(s.car.speed< -7,'reverses');
  const up=new CANNON.Vec3(0,1,0);s.car.body.quaternion.vmult(up,up);assert.ok(up.y>.95,'stays upright');
});
