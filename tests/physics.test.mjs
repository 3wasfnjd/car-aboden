// Real cannon-es regressions; fixtures match the game's material pair and crate.
import test from 'node:test';import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { MotriVehicle } from '../src/vehicle.js';
import { CONFIG } from '../src/core.js';
function setup(){
  const world=new CANNON.World({gravity:new CANNON.Vec3(0,-9.82,0),allowSleep:true});
  world.broadphase=new CANNON.SAPBroadphase(world);world.solver.iterations=14;
  world.defaultContactMaterial.friction=.48;world.defaultContactMaterial.restitution=.02;
  const floor=new CANNON.Body({mass:0,material:world.defaultMaterial,shape:new CANNON.Box(new CANNON.Vec3(100,.5,100))});
  floor.position.y=-.5;world.addBody(floor);
  const car=new MotriVehicle(world);car.reset([0,.72,0]);return {world,car};
}
function tick(s,n,input={throttle:0,steer:0,brake:false}){s.car.input=input;for(let i=0;i<n;i++){s.car.beforeStep(1/120);s.world.step(1/120);s.car.afterStep(1/120);}}
function addCrate(s,mass=35){const b=new CANNON.Body({mass,material:s.world.defaultMaterial,shape:new CANNON.Box(new CANNON.Vec3(.825,.65,.825))});b.position.set(0,.68,4);b.linearDamping=.18;b.angularDamping=.22;s.world.addBody(b);return b;}
test('real chassis settles on four suspension contacts',()=>{const s=setup();tick(s,240);assert.equal(s.car.contacts,4);assert.ok(s.car.body.position.y>0&&s.car.body.position.y<1.2);s.car.dispose();});
test('real drive, brake and reset are finite',()=>{const s=setup();tick(s,120);tick(s,360,{throttle:1,steer:0});assert.ok(s.car.body.position.z>1);tick(s,240,{throttle:0,steer:0,brake:true});assert.ok(Math.abs(s.car.speed)<.05);s.car.reset();assert.ok(s.car.body.velocity.length()<1e-6);assert.equal(s.car.driveForce,0);s.car.dispose();});
test('real reverse moves backward',()=>{const s=setup();tick(s,180);tick(s,300,{throttle:-1,steer:0});assert.ok(s.car.body.position.z<-.5);s.car.dispose();});
for(const mass of [25,35])test('precision drive pushes a '+mass+' unit crate without climbing',()=>{
  const s=setup(),box=addCrate(s,mass);tick(s,180);let maxY=0;
  for(let i=0;i<720;i++){tick(s,1,{throttle:1,steer:0,precision:true});maxY=Math.max(maxY,s.car.body.position.y);}
  console.log('CRATE_RESULT '+JSON.stringify({mass,box:box.position.toArray(),car:s.car.body.position.toArray(),maxY,contacts:s.car.contacts}));
  assert.ok(box.position.z>4.3,'Crate must move at least .3 forward');
  assert.ok(maxY<1.2,'Car must push, not climb over the crate');
  assert.ok(box.position.z>s.car.body.position.z,'Crate must stay ahead of chassis');s.car.dispose();
});
test('normal driving reaches the raised speed target without exceeding it',()=>{
  const s=setup();tick(s,180);tick(s,480,{throttle:1,steer:0});
  console.log('FAST_DRIVE',JSON.stringify({speed:s.car.speed,y:s.car.body.position.y,contacts:s.car.contacts}));
  assert.ok(s.car.speed>CONFIG.maxSpeed*.85&&s.car.speed<CONFIG.maxSpeed+.5);assert.ok(s.car.body.position.y<1.2);s.car.dispose();
});
for(const throttle of [1,-1])test('held brake stops and stays still from '+throttle,()=>{
  const s=setup();tick(s,180);tick(s,300,{throttle,steer:0});tick(s,240,{brake:true});
  const p=s.car.body.position.clone();let maxSpeed=0;
  for(let i=0;i<240;i++){tick(s,1,{brake:true});maxSpeed=Math.max(maxSpeed,Math.abs(s.car.speed));}
  console.log('BRAKE_HOLD',JSON.stringify({throttle,maxSpeed,drift:s.car.body.position.distanceTo(p)}));
  assert.ok(maxSpeed<.05);assert.ok(s.car.body.position.distanceTo(p)<.02);s.car.dispose();
});
test('changing the signed lever brakes first then reverses without resetting the body',()=>{
  const s=setup();tick(s,180);tick(s,240,{throttle:1,steer:0});
  s.car.input={throttle:-1,steer:0};s.car.beforeStep(1/120);
  assert.equal(s.car.driveForce,0);assert.ok(s.car.rig.wheelInfos.some(w=>w.brake>0));
  tick(s,480,{throttle:-1,steer:0});assert.ok(s.car.speed< -3);assert.ok(s.car.body.position.y<1.2);s.car.dispose();
});
test('smoothed steering turns the moving chassis while keeping it upright',()=>{
  const s=setup();tick(s,180);tick(s,180,{throttle:1,steer:0});tick(s,240,{throttle:.7,steer:1});
  const up=s.car.body.quaternion.vmult(new CANNON.Vec3(0,1,0));
  assert.ok(up.y>.5);assert.ok(Math.abs(s.car.body.position.x)>1);s.car.dispose();
});
