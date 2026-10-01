// Autopilot follows a circle and a heart with the real vehicle physics.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import {MotriVehicle} from '../src/vehicle.js';
import {CONFIG} from '../src/core.js';
import {Autopilot,shapePoints} from '../src/autopilot.js';
function setup(){
  const world=new CANNON.World({gravity:new CANNON.Vec3(0,-9.82,0)});world.solver.iterations=14;world.defaultContactMaterial.friction=.48;
  const floor=new CANNON.Body({mass:0,material:world.defaultMaterial,shape:new CANNON.Box(new CANNON.Vec3(200,.5,200))});floor.position.y=-.5;world.addBody(floor);
  const car=new MotriVehicle(world);Object.assign(car.params,{steerRate:7,steerReturnRate:9,yawAssist:3.2,maxSteer:.58});car.reset([0,.72,0]);return {world,car};
}
test('unit shapes are centred with half-width 1',()=>{
  for(const s of ['circle','heart']){const p=shapePoints(s),xs=p.map(q=>q[0]);
    assert.ok(Math.abs(Math.max(...xs)-1)<1e-9&&Math.abs(Math.min(...xs)+1)<1e-9);}
});
for(const [shape,size] of [['circle',6.5],['heart',9]])test(`car follows the ${shape} and stays near it`,()=>{
  const {world,car}=setup(),ap=new Autopilot(),fwd=new CANNON.Vec3();
  for(let i=0;i<120;i++){car.beforeStep(CONFIG.step);world.step(CONFIG.step);car.afterStep(CONFIG.step);}
  ap.start(shape,{center:{x:0,z:size+2},right:{x:-1,z:0},forward:{x:0,z:1},size,heading:{x:0,z:1}});
  let far=0,sum=0,samples=0;
  for(let i=0;i<120*30;i++){
    car.body.quaternion.vmult(new CANNON.Vec3(0,0,1),fwd);
    car.input=ap.update(car.body.position,fwd);
    car.beforeStep(CONFIG.step);world.step(CONFIG.step);car.afterStep(CONFIG.step);
    const p=car.body.position;far=Math.max(far,Math.hypot(p.x,p.z-(size+2)));
    if(i>120*12&&i%12===0){sum+=ap.distance(p.x,p.z);samples++;}
  }
  const mean=sum/samples;
  assert.ok(mean<1.6,`mean distance from the ${shape} path ${mean.toFixed(2)}`);
  assert.ok(far<size*1.6+2,`stays close to the path centre (max ${far.toFixed(1)})`);
  assert.ok(Math.abs(car.speed)>2,'keeps moving');
});
