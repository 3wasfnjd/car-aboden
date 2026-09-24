// Tests use the same explicit material pair as TestWorld and real cannon-es.
import test from 'node:test';import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { MotriVehicle } from '../src/vehicle.js';
import { driveCommand, approach } from '../src/core.js';
function setup(){
  const world=new CANNON.World({gravity:new CANNON.Vec3(0,-9.82,0),allowSleep:true});
  world.broadphase=new CANNON.SAPBroadphase(world);world.solver.iterations=14;
  world.defaultContactMaterial.friction=.48;world.defaultContactMaterial.restitution=.02;
  const floor=new CANNON.Body({mass:0,material:world.defaultMaterial,shape:new CANNON.Box(new CANNON.Vec3(60,.5,60))});
  floor.position.y=-.5;world.addBody(floor);
  const car=new MotriVehicle(world);car.reset([0,.72,0]);return {world,car};
}
function tick(s,n,input={throttle:0,steer:0,brake:false}){s.car.input=input;for(let i=0;i<n;i++){s.car.beforeStep(1/120);s.world.step(1/120);s.car.afterStep(1/120);}}
function addCrate(s,mass=35){const b=new CANNON.Body({mass,material:s.world.defaultMaterial,shape:new CANNON.Box(new CANNON.Vec3(.825,.65,.825))});b.position.set(0,.68,4);b.linearDamping=.18;b.angularDamping=.22;s.world.addBody(b);return b;}
test('real chassis settles on four suspension contacts',()=>{const s=setup();tick(s,240);assert.equal(s.car.contacts,4);assert.ok(s.car.body.position.y>0&&s.car.body.position.y<1.2);s.car.dispose();});
test('real drive, brake and reset are finite',()=>{const s=setup();tick(s,120);tick(s,360,{throttle:1,steer:0});assert.ok(s.car.body.position.z>1);tick(s,240,{throttle:0,steer:0,brake:true});assert.ok(Math.abs(s.car.speed)<1);s.car.reset();assert.ok(s.car.body.velocity.length()<1e-6);s.car.dispose();});
test('real reverse moves backward',()=>{const s=setup();tick(s,180);tick(s,300,{throttle:-1,steer:0});assert.ok(s.car.body.position.z<-.5);s.car.dispose();});
for(const mass of [25,35])test('precision drive pushes a '+mass+' unit crate',()=>{
  const s=setup(),box=addCrate(s,mass);tick(s,180);tick(s,720,{throttle:1,steer:0,precision:true});
  console.log('CRATE_RESULT '+JSON.stringify({mass,box:box.position.toArray(),car:s.car.body.position.toArray(),speed:s.car.speed,contacts:s.car.contacts}));
  assert.ok(box.position.z>4.3,'Crate must move at least .3 forward');
  assert.ok(s.car.body.position.y<1.2,'Car must push, not climb over the crate');s.car.dispose();
});
// Short diagnostic sweep; ordinary tests above retain the production assertions.
test('compare real chassis contact and traction alternatives',()=>{
  const report=[];
  for(const bumper of [false,true])for(const fullDrive of [false,true])for(const friction of [.1,0]){
    const s=setup(),v=s.car,box=addCrate(s);
    v.contactMaterial.friction=friction;
    if(bumper)v.body.addShape(new CANNON.Box(new CANNON.Vec3(.9,.25,.14)),new CANNON.Vec3(0,.14,1.83));
    if(fullDrive)v.beforeStep=function(dt){const cmd=driveCommand(this.input,this.speed,this.params);this.steer=approach(this.steer,cmd.steer,this.params.steerRate*dt);for(let i=0;i<4;i++){this.rig.setSteeringValue(i<2?this.steer:0,i);this.rig.applyEngineForce(i>=2?cmd.force:0,i);this.rig.setBrake(cmd.brake,i);}};
    tick(s,180);let maxCarY=0,maxBoxY=0;
    for(let i=0;i<720;i++){tick(s,1,{throttle:1,steer:0,precision:true});maxCarY=Math.max(maxCarY,v.body.position.y);maxBoxY=Math.max(maxBoxY,box.position.y);}
    report.push({bumper,fullDrive,friction,z:box.position.z,car:v.body.position.toArray(),maxCarY,maxBoxY,contacts:v.contacts});v.dispose();
  }
  console.log('CONTACT_SWEEP '+JSON.stringify(report));
});
