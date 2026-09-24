import { axis, clamp } from './core.js';

// Wheel and pedals have independent pointer owners. No touch can become both
// steering and throttle, and cancelled/backgrounded touches never stay pressed.
export class InputController {
  constructor(onReset, onPause, {getSpeed=()=>0, onGearChange=()=>{}, onGearBlocked=()=>{}}={}) {
    this.keys=new Set(); this.pedalKeys=new Set(); this.pointers=new Map();
    this.steer=0; this.throttle=0; this.brake=false; this.precision=false;
    this.gear=1; this.enabled=true; this.abort=new AbortController();
    this.wheel=document.querySelector('#steering');
    this.wheelGraphic=document.querySelector('#steeringWheel');
    this.gas=document.querySelector('#accelerator');
    this.brakeButton=document.querySelector('#brake');
    this.gearButton=document.querySelector('#direction');
    const on=(el,event,fn,opts={})=>el.addEventListener(event,fn,{...opts,signal:this.abort.signal});
    const valid=e=>this.enabled&&(e.pointerType!=='mouse'||e.button===0);
    const own=(name,el,e)=>{
      if(!valid(e)||this.pointers.has(name))return false;
      e.preventDefault(); this.pointers.set(name,e.pointerId);
      el.setPointerCapture(e.pointerId); return true;
    };
    const releases=(name,el,clear)=>{
      const end=e=>{
        if(this.pointers.get(name)!==e.pointerId)return;
        this.pointers.delete(name); clear();
        if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);
      };
      ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>on(el,ev,end));
    };
    let steeringStart=0, steeringRange=1;
    on(this.wheel,'pointerdown',e=>{
      if(!own('steering',this.wheel,e))return;
      // Relative horizontal drag: touching the rim itself must not jerk the car.
      steeringStart=e.clientX; steeringRange=this.wheel.getBoundingClientRect().width*.36;
      this.setSteer(0); this.wheel.classList.add('active');
    },{passive:false});
    on(this.wheel,'pointermove',e=>{
      if(this.pointers.get('steering')!==e.pointerId)return;
      e.preventDefault();this.setSteer(axis((e.clientX-steeringStart)/steeringRange,.035));
    },{passive:false});
    releases('steering',this.wheel,()=>{this.wheel.classList.remove('active');this.setSteer(0);});

    const gasAmount=e=>{
      const rect=this.gas.getBoundingClientRect();
      // Bottom of pedal = light throttle; slide upward to request more speed.
      this.throttle=clamp((rect.bottom-e.clientY)/rect.height,.12,1);
      this.paintPedals();
    };
    on(this.gas,'pointerdown',e=>{if(own('gas',this.gas,e))gasAmount(e);},{passive:false});
    on(this.gas,'pointermove',e=>{
      if(this.pointers.get('gas')!==e.pointerId)return;
      e.preventDefault();gasAmount(e);
    },{passive:false});
    releases('gas',this.gas,()=>{this.throttle=0;this.paintPedals();});
    on(this.brakeButton,'pointerdown',e=>{
      if(!own('brake',this.brakeButton,e))return;
      this.brake=true;this.paintPedals();
    },{passive:false});
    releases('brake',this.brakeButton,()=>{this.brake=false;this.paintPedals();});

    // Native keyboard operation for the focused pedal buttons.
    for(const [name,el] of [['gas',this.gas],['brake',this.brakeButton]]) {
      on(el,'keydown',e=>{
        if(!this.enabled||!['Enter','Space'].includes(e.code))return;
        e.preventDefault();e.stopPropagation();this.pedalKeys.add(name);this.paintPedals();
      });
      on(el,'keyup',e=>{
        if(!['Enter','Space'].includes(e.code))return;
        e.preventDefault();e.stopPropagation();this.pedalKeys.delete(name);this.paintPedals();
      });
      on(el,'blur',()=>{this.pedalKeys.delete(name);this.paintPedals();});
    }
    on(this.gearButton,'click',()=>{
      if(!this.enabled)return;
      const speed=getSpeed();
      if(!Number.isFinite(speed)||Math.abs(speed)>.2||this.pointers.has('gas')||this.pedalKeys.has('gas')||
         ['KeyW','KeyS','ArrowUp','ArrowDown'].some(k=>this.keys.has(k))) {
        onGearBlocked();return;
      }
      this.gear*=-1;this.paintGear();onGearChange(this.gear);
    });
    on(window,'keydown',e=>{
      if(e.target.matches?.('input,select,textarea'))return;
      if(e.code==='Escape'&&!e.repeat){e.preventDefault();onPause();return;}
      if(!this.enabled)return;
      // Let focused buttons keep native keyboard activation.
      if(e.target.closest?.('button')&&e.target.getClientRects().length&&['Space','Enter'].includes(e.code))return;
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
      this.keys.add(e.code);
      if(!e.repeat&&e.code==='KeyR')onReset();
      if(!e.repeat&&e.code==='KeyP')document.querySelector('#precision').click();
      this.paintPedals();
    });
    on(window,'keyup',e=>{this.keys.delete(e.code);this.paintPedals();});
    on(window,'blur',()=>this.reset());
    on(window,'resize',()=>this.reset());
    on(document,'visibilitychange',()=>{if(document.hidden)this.reset();});
    on(document,'contextmenu',e=>{if(e.target.closest('.drive-controls'))e.preventDefault();});
    this.paintGear();this.paintPedals();
  }
  setSteer(value) {
    this.steer=clamp(value,-1,1);
    this.wheelGraphic.style.transform=`rotate(${this.steer*105}deg)`;
    this.wheel.setAttribute('aria-valuenow',String(Math.round(this.steer*100)));
  }
  paintPedals() {
    const gas=this.pointers.has('gas')||this.pedalKeys.has('gas');
    const brake=this.brake||this.pedalKeys.has('brake')||this.keys.has('Space');
    this.gas.classList.toggle('active',gas);this.brakeButton.classList.toggle('active',brake);
    this.gas.setAttribute('aria-pressed',String(gas));this.brakeButton.setAttribute('aria-pressed',String(brake));
    this.gas.style.setProperty('--pedal-fill',`${(this.pedalKeys.has('gas')?1:this.throttle)*100}%`);
  }
  paintGear() {
    this.gearButton.dataset.gear=this.gear===1?'D':'R';
    this.gearButton.setAttribute('aria-label',this.gear===1?'الاتجاه: تقدم. اضغط لاختيار الرجوع للخلف':'الاتجاه: رجوع. اضغط لاختيار التقدم');
    this.gearButton.setAttribute('aria-pressed',String(this.gear===-1));
  }
  setEnabled(enabled) {this.reset();this.enabled=Boolean(enabled);}
  reset() {
    // Clear owners BEFORE releasePointerCapture (it may emit lostpointercapture).
    const owned=[...this.pointers];this.pointers.clear();this.keys.clear();this.pedalKeys.clear();
    this.throttle=0;this.brake=false;this.wheel.classList.remove('active');this.setSteer(0);
    for(const [name,id] of owned) {
      const el=name==='steering'?this.wheel:name==='gas'?this.gas:this.brakeButton;
      if(el.hasPointerCapture(id))el.releasePointerCapture(id);
    }
    this.paintPedals();
  }
  read() {
    if(!this.enabled)return {throttle:0,steer:0,brake:true,precision:this.precision};
    const key=c=>this.keys.has(c);
    const keyboardThrottle=Number(key('KeyW')||key('ArrowUp'))-Number(key('KeyS')||key('ArrowDown'));
    const keyboardSteer=Number(key('KeyD')||key('ArrowRight'))-Number(key('KeyA')||key('ArrowLeft'));
    const pedal=this.pedalKeys.has('gas')?1:this.throttle;
    const throttle=this.pointers.has('gas')||this.pedalKeys.has('gas')?pedal*this.gear:keyboardThrottle;
    const brake=this.brake||this.pedalKeys.has('brake')||key('Space');
    return {throttle:brake?0:throttle,steer:this.pointers.has('steering')?this.steer:keyboardSteer,brake,precision:this.precision};
  }
  dispose() {this.setEnabled(false);this.abort.abort();}
}
