// Dependency-free input / controller rules; also exercised by Node tests.
export const CONFIG = Object.freeze({
  step: 1 / 120, maxSteps: 8,
  mass: 250, engineForce: 1100, precisionEngineForce: 750, maxSpeed: 10, precisionSpeed: 1.5,
  reverseSpeed: 6, brakeForce: 26, coastBrake: 3.6,
  maxSteer: .65, steerRate: 12, steerReturnRate: 16, driveResponse: 10,
  yawAssist: 4.6, yawRateLow: .72, yawRateHigh: 1.85,
  stiffness: 70, restLength: .55, travel: .42,
  dampingRelaxation: 3.5, dampingCompression: 4.4, frictionSlip: 7.2,
  chassisHalf: Object.freeze([.9, .3, 1.55]), chassisLift: .5,
  wheelRadius: .42, wheelWidth: .32, wheelX: .95, wheelY: .35, wheelZ: 1.55,
  spawn: Object.freeze([0, .72, -15]),
});
export const clamp = (v, min, max) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : 0));
export const approach = (value, target, amount) => value + clamp(target-value, -amount, amount);
// Exponential response, independent of display frame rate (Hajwala-style feel).
export const damp = (value,target,rate,dt) => value+(target-value)*(1-Math.exp(-Math.max(0,rate)*clamp(dt,0,.1)));
export function brakeImpulse(requested,speed,mass,contacts,gravityAlongForward,dt) {
  // RaycastVehicle solves all wheels from the same pre-brake velocity. Capping
  // their combined impulse prevents four brakes overshooting through zero.
  const count=Math.max(1,contacts||4);
  const needed=mass*(Math.abs(speed)+Math.abs(gravityAlongForward)*dt)*.70/count;
  return Math.min(Math.max(0,requested),needed);
}
export function axis(value, deadzone = .09) {
  value = clamp(value, -1, 1);
  return Math.abs(value) <= deadzone ? 0 : Math.sign(value) * (Math.abs(value)-deadzone)/(1-deadzone);
}
export function driveCommand(input, signedSpeed, params = CONFIG) {
  const throttle = clamp(input.throttle, -1, 1), steer = clamp(input.steer, -1, 1);
  const speed = Number.isFinite(signedSpeed) ? signedSpeed : 0;
  const direction = Math.sign(throttle);
  const limit = (input.precision ? params.precisionSpeed : params.maxSpeed);
  const target = throttle * (direction < 0 ? Math.min(params.reverseSpeed, limit) : limit);
  const reversing = direction !== 0 && direction * speed < -.20;
  const stationary = Math.abs(throttle) < .015;
  let brake = stationary ? params.coastBrake : 0;
  let force = 0;
  if (input.brake || reversing) brake = params.brakeForce;
  else if (!stationary) {
    // Negative CANNON engine force moves this +Z-forward chassis forward.
    // Proportional target speed, not a fixed full-throttle joystick.
    const error = Math.abs(target) - speed * direction;
    const power=input.precision?(params.precisionEngineForce??params.engineForce):params.engineForce;
    if (error > .03) force = -direction * power * clamp(error / 1.2, 0, 1);
    else if(error<-.03) brake = Math.min(params.brakeForce * .45, -error * 5);
  }
  const steerScale = 1 / (1 + Math.max(0, Math.abs(speed)-4)*.10);
  return {force, brake, steer: -steer * params.maxSteer * steerScale, target, reversing};
}
export function fixedSteps(accumulator, dt, step = CONFIG.step, maxSteps = CONFIG.maxSteps) {
  let total = Math.max(0, accumulator) + clamp(dt, 0, .1);
  const count = Math.min(maxSteps, Math.floor((total + 1e-10) / step));
  total -= count * step;
  // Discard excess backlog rather than running a spiral of death after a tab switch.
  if (count === maxSteps && total >= step) total %= step;
  return {count, accumulator: Math.max(0, total)};
}
export function withinPad(position, speed) {
  return Math.abs(position.x + 8) < 1.8 && Math.abs(position.z - 7) < 1.8 && Math.abs(speed) < .35;
}
export function safeSpawn(value) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) return [...CONFIG.spawn];
  if (Math.abs(value[0]) > 23 || Math.abs(value[2]) > 23 || value[1] < .4 || value[1] > 8) return [...CONFIG.spawn];
  return [...value];
}
