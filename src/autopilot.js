// Small "drive by itself" mode: follow a circle or a heart on the floor with a
// pure-pursuit steering controller. Coordinates are simulation units in the
// car's parent frame, using only X/Z. Steering sign matches the controls:
// steer +1 turns toward -X when facing +Z (same as the right button).

// Unit shapes in a path frame (u: right of the viewer, v: away from the viewer),
// half-width 1. The heart's tip points back toward the viewer.
export function shapePoints(shape,n=180) {
  const raw=[];
  for(let i=0;i<n;i++){
    const t=i/n*Math.PI*2;
    if(shape==='heart')raw.push([16*Math.sin(t)**3,13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t)]);
    else raw.push([Math.cos(t),Math.sin(t)]);
  }
  const xs=raw.map(p=>p[0]),ys=raw.map(p=>p[1]);
  const cx=(Math.max(...xs)+Math.min(...xs))/2,cy=(Math.max(...ys)+Math.min(...ys))/2,half=(Math.max(...xs)-Math.min(...xs))/2;
  return raw.map(([x,y])=>[(x-cx)/half,(y-cy)/half]);
}
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));

export class Autopilot {
  constructor(){this.shape=null;this.points=[];}
  get active(){return !!this.shape;}
  // frame: {center:{x,z}, right:{x,z}, forward:{x,z}} unit axes; size: half-width.
  start(shape,{center,right,forward,size,heading}) {
    this.shape=shape;this.size=size;this.right={...right};this.forward={...forward};this.unit=shapePoints(shape);
    this.setCenter(center);
    // Travel along the path in whichever direction the car already faces.
    if(heading){
      const i=this.closest(center.x,center.z),a=this.points[i],b=this.points[(i+1)%this.points.length];
      if((b.x-a.x)*heading.x+(b.z-a.z)*heading.z<0){this.unit.reverse();this.setCenter(center);}
    }
  }
  stop(){this.shape=null;}
  setCenter(c) {
    this.center={x:c.x,z:c.z};const {right:r,forward:f,size:s}=this;
    this.points=this.unit.map(([u,v])=>({x:c.x+(r.x*u+f.x*v)*s,z:c.z+(r.z*u+f.z*v)*s}));
  }
  closest(x,z){let best=0,d=Infinity;this.points.forEach((p,i)=>{const e=(p.x-x)**2+(p.z-z)**2;if(e<d){d=e;best=i;}});return best;}
  distance(x,z){const p=this.points[this.closest(x,z)];return Math.hypot(p.x-x,p.z-z);}
  // pos: car position, fwd: car forward (x,z). Returns throttle/steer inputs.
  update(pos,fwd,{lookahead=5,cruise=.42}={}) {
    const n=this.points.length;let i=this.closest(pos.x,pos.z),walked=0;
    for(let k=0;k<n&&walked<lookahead;k++){const a=this.points[i],b=this.points[(i+1)%n];walked+=Math.hypot(b.x-a.x,b.z-a.z);i=(i+1)%n;}
    const t=this.points[i],err=wrap(Math.atan2(t.x-pos.x,t.z-pos.z)-Math.atan2(fwd.x,fwd.z));
    return {throttle:cruise*(1-.35*Math.min(1,Math.abs(err)/1.2)),steer:Math.max(-1,Math.min(1,-err*2.4)),brake:false,precision:false};
  }
}
