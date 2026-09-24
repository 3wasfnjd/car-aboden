// Real cannon-es regressions. Use the same explicit contact materials as TestWorld;
// null-material fixtures bypass the game's low-friction chassis contact pair.
import test from 'node:test';import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { MotriVehicle } from '../src/vehicle.js';
function setup(){
  const world=new CANNON.World({gravity:new CANNON.Vec3(0,-9.82,0),allowSleep:true});
  world.broadphase=new CANNON.SAPBroadphase(world);world.solver.iterations=14;
  world.defaultContactMaterial.friction=.48;world.defaultContactMaterial.restitution=.02;
  const floor=new CANNON.Body({mass:0,material:world.defaultMaterial,shape:new CANNON.Box(new CANNON.Vec3(60,.5,60))});
  floor.position.y=-.5;world.addBody(floor);
  const car=new MotriVehicle(world);car.reset([0,.72,0]);return {world,car};
}
function tick(s,n,input={throttle:0,steer:0,brake:false}){s.car.input=input;for(let i=0;i<n;i++){s.car.beforeStep(1/120);s.world.step(1/120);s.car.afterStep(1/120);}}
test('real chassis settles on four suspension contacts',()=>{const s=setup();tick(s,240);assert.equal(s.car.contacts,4);assert.ok(s.car.body.position.y>0&&s.car.body.position.y<1.2);s.car.dispose();});
test('real drive, brake and reset are finite',()=>{const s=setup();tick(s,120);tick(s,360,{throttle:1,steer:0});assert.ok(s.car.body.position.z>1);tick(s,240,{throttle:0,steer:0,brake:true});assert.ok(Math.abs(s.car.speed)<1);s.car.reset();assert.ok(s.car.body.velocity.length()<1e-6);s.car.dispose();});
test('real reverse moves backward',()=>{const s=setup();tick(s,180);tick(s,300,{throttle:-1,steer:0});assert.ok(s.car.body.position.z<-.5);s.car.dispose();});
for(const mass of [25,35])test('precision drive pushes a '+mass+' unit crate',()=>{
  const s=setup();const box=new CANNON.Body({mass,material:s.world.defaultMaterial,shape:new CANNON.Box(new CANNON.Vec3(.825,.65,.825))});
  box.position.set(0,.68,4);box.linearDamping=.18;box.angularDamping=.22;s.world.addBody(box);
  tick(s,180);tick(s,720,{throttle:1,steer:0,precision:true});
  const result={mass,box:box.position.toArray(),car:s.car.body.position.toArray(),speed:s.car.speed,contacts:s.car.contacts};
  console.log('CRATE_RESULT '+JSON.stringify(result));
  assert.ok(box.position.z>4.3,'Crate must move at least .3 forward');
  assert.ok(s.car.body.position.y<1.2,'Car must push, not climb over the crate');
  assert.ok(Number.isFinite(s.car.body.position.y));s.car.dispose();
});
