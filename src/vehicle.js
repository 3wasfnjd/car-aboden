/**
 * Adapted from icurtis1/raycast-vehicle, src/Vehicle.js (MIT, Ian Curtis 2026)
 * revision f9d2457e94c18f71a8eca5884c68d943b6f1e9e5; see NOTICE.md.
 * Retains the lifted box chassis, four raycast suspension contacts, rear drive,
 * inertia adjustment, and local-space wheel visual synchronization. No upstream
 * GLBs, jump/boost, postprocessing or race systems are included.
 */
import * as CANNON from 'cannon-es';
import { CONFIG, driveCommand, approach, safeSpawn, clamp } from './core.js';
export class MotriVehicle {
  constructor(world) {
    this.world = world;
    this.params = {...CONFIG};
    this.forward = new CANNON.Vec3();
    this.localPoint = new CANNON.Vec3();
    this.localQuat = new CANNON.Quaternion();
    this.inverseQuat = new CANNON.Quaternion();
    this.steer = 0; this.spin = [0,0,0,0]; this.groundedCount=0;
    this.input = {throttle:0, steer:0, brake:false, precision:false};
    const p = this.params;
    this.material = new CANNON.Material('motri-chassis');
    // Only the chassis shell slides at contacts. Tire grip is independently
    // handled by RaycastVehicle.frictionSlip; floor/crate friction stays .48.
    // A real-engine A/B test found shell friction .1 pinned the car against
    // a 35-unit crate and unloaded the front axle. Removing that tangential
    // grab restores pushing without increasing motor power or moving objects
    // by script. The contact normal still prevents penetration.
    this.contactMaterial = new CANNON.ContactMaterial(this.material, world.defaultMaterial, {friction:0,restitution:0});
    world.addContactMaterial(this.contactMaterial);
    this.body = new CANNON.Body({mass:p.mass,material:this.material,allowSleep:false});
    this.body.addShape(new CANNON.Box(new CANNON.Vec3(...p.chassisHalf)), new CANNON.Vec3(0,p.chassisLift,0));
    // Cabin collider: real ceiling clearance, not just a visual roof.
    this.body.addShape(new CANNON.Box(new CANNON.Vec3(.7,.24,.68)), new CANNON.Vec3(0,1.01,-.22));
    this.body.linearDamping=.05; this.body.angularDamping=.12;
    this.body.inertia.x *= 2; this.body.inertia.z *= 2;
    this.body.invInertia.set(1/this.body.inertia.x, 1/this.body.inertia.y, 1/this.body.inertia.z);
    this.body.updateInertiaWorld(true);
    this.rig = new CANNON.RaycastVehicle({chassisBody:this.body,indexRightAxis:0,indexUpAxis:1,indexForwardAxis:2});
    const wheels = [[-p.wheelX,p.wheelZ],[p.wheelX,p.wheelZ],[-p.wheelX,-p.wheelZ],[p.wheelX,-p.wheelZ]];
    wheels.forEach(([x,z],i) => this.rig.addWheel({
      radius:p.wheelRadius,directionLocal:new CANNON.Vec3(0,-1,0),axleLocal:new CANNON.Vec3(1,0,0),
      chassisConnectionPointLocal:new CANNON.Vec3(x,p.wheelY,z),isFrontWheel:i<2,
      suspensionStiffness:p.stiffness,suspensionRestLength:p.restLength,
      maxSuspensionTravel:p.travel,maxSuspensionForce:100000,
      dampingRelaxation:p.dampingRelaxation,dampingCompression:p.dampingCompression,
      frictionSlip:p.frictionSlip,rollInfluence:.025,
      customSlidingRotationalSpeed:-30,useCustomSlidingRotationalSpeed:true,
    }));
    this.rig.addToWorld(world);
    this.checkpoint = [...CONFIG.spawn];
    this.reset();
  }
  get speed() { this.body.quaternion.vmult(new CANNON.Vec3(0,0,1),this.forward); return this.body.velocity.dot(this.forward); }
  get contacts() {return this.groundedCount;}
  beforeStep(dt) {
    const cmd = driveCommand(this.input,this.speed,this.params);
    this.steer=approach(this.steer,cmd.steer,this.params.steerRate*dt);
    this.rig.setSteeringValue(this.steer,0);this.rig.setSteeringValue(this.steer,1);

    // Hajwala-like yaw response: ease the real chassis toward a speed-dependent
    // turn rate. Suspension, wheel contact, ramps and collision physics remain active.
    const signedSpeed=this.speed;
    const direction=Math.sign(Math.abs(signedSpeed)>.12?signedSpeed:(this.input.throttle||1));
    const speedNorm=clamp(Math.abs(signedSpeed)/Math.max(this.params.maxSpeed,.001),0,1);
    const authority=.28+.72*speedNorm;
    const yawRate=this.params.yawRateLow+(this.params.yawRateHigh-this.params.yawRateLow)*speedNorm;
    const targetYaw=-clamp(this.input.steer,-1,1)*direction*yawRate*authority;
    const yawBlend=1-Math.exp(-this.params.yawAssist*dt);
    this.body.angularVelocity.y += (targetYaw-this.body.angularVelocity.y)*yawBlend;

    const w=this.rig.wheelInfos;
    const load=w[0].suspensionForce+w[1].suspensionForce;
    const loadFactor=cmd.force<0 ? Math.max(.35,Math.min(1,load/(this.params.mass*9.82*.2))) : 1;
    for(let i=0;i<4;i++) {
      this.rig.applyEngineForce(i>=2 ? cmd.force*loadFactor : 0,i);
      this.rig.setBrake(cmd.brake,i);
    }
  }
  afterStep(dt) {
    this.groundedCount=this.rig.wheelInfos.filter(w=>w.isInContact).length;
    const speed=this.speed;
    for(let i=0;i<4;i++) this.spin[i] -= speed*dt/this.params.wheelRadius;
  }
  wheelLocal(index) {
    const w=this.rig.wheelInfos[index];
    w.rotation=this.spin[index];this.rig.updateWheelTransform(index);
    this.body.pointToLocalFrame(w.worldTransform.position,this.localPoint);
    this.body.quaternion.conjugate(this.inverseQuat);
    this.inverseQuat.mult(w.worldTransform.quaternion,this.localQuat);
    return {position:this.localPoint,quaternion:this.localQuat};
  }
  reset(point=this.checkpoint) {
    const spawn=safeSpawn(point);this.input.throttle=0;this.input.steer=0;this.input.brake=false;
    this.body.position.set(...spawn);this.body.quaternion.set(0,0,0,1);
    this.body.velocity.setZero();this.body.angularVelocity.setZero();this.body.force.setZero();this.body.torque.setZero();
    this.body.previousPosition.copy(this.body.position);this.body.interpolatedPosition.copy(this.body.position);
    this.body.previousQuaternion.copy(this.body.quaternion);this.body.interpolatedQuaternion.copy(this.body.quaternion);
    this.body.aabbNeedsUpdate=true;this.body.wakeUp();this.spin.fill(0);this.steer=0;
    for(const w of this.rig.wheelInfos) { w.engineForce=0;w.brake=0;w.steering=0;w.suspensionLength=this.params.restLength;w.rotation=0; }
    this.world.broadphase.dirty=true;
  }
  dispose() {this.rig.removeFromWorld(this.world);this.world.removeContactMaterial(this.contactMaterial);}
}
