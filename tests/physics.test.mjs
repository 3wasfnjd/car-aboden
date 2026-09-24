// Requires npm install. These run against the real cannon-es engine, never a mock.
import test from 'node:test';import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { MotriVehicle } from '../src/vehicle.js';
function setup(){const world=new CANNON.World({gravity:new CANNON.Vec3(0,-9.82,0)});world.solver.iterations=14;world.defaultContactMaterial.friction=.48;const floor=new CANNON.Body({mass:0,shape:new CANNON.Box(new CANNON.Vec3(60,.5,60))});floor.position.y=-.5;world.addBody(floor);const car=new MotriVehicle(world);car.reset([0,.72,0]);return {world,car};}
function tick(s,n,input={throttle:0,steer:0,brake:false}){s.car.input=input;for(let i=0;i<n;i++){s.car.beforeStep(1/120);s.world.step(1/120);s.car.afterStep(1/120);}}
test('real chassis settles on four suspension contacts',()=>{const s=setup();tick(s,240);assert.equal(s.car.contacts,4);assert.ok(s.car.body.position.y>0&&s.car.body.position.y<1.2);s.car.dispose();});
test('real drive, brake and reset are finite',()=>{const s=setup();tick(s,120);tick(s,360,{throttle:1,steer:0});assert.ok(s.car.body.position.z>1);tick(s,240,{throttle:0,steer:0,brake:true});assert.ok(Math.abs(s.car.speed)<1);s.car.reset();assert.ok(s.car.body.velocity.length()<1e-6);s.car.dispose();});
test('real reverse moves backward',()=>{const s=setup();tick(s,180);tick(s,300,{throttle:-1,steer:0});assert.ok(s.car.body.position.z<-.5);s.car.dispose();});
test('real physics can push a light crate',()=>{const s=setup();const box=new CANNON.Body({mass:25,shape:new CANNON.Box(new CANNON.Vec3(.7,.6,.7))});box.position.set(0,.62,4);s.world.addBody(box);tick(s,180);tick(s,720,{throttle:1,steer:0,precision:true});assert.ok(box.position.z>4.3);assert.ok(Number.isFinite(s.car.body.position.y));s.car.dispose();});
