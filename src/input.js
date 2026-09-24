import { axis, clamp } from './core.js';

export class InputController {
  constructor(onReset,onPause) {
    this.keys=new Set();this.pointers=new Map();this.steer=0;this.throttle=0;this.brake=false;this.precision=false;
    this.enabled=true;this.abort=new AbortController();
    this.wheel=document.querySelector('#steering');this.wheelGraphic=document.querySelector('#steeringWheel');
    this.lever=document.querySelector('#driveLever');this.leverKnob=document.querySelector('#leverKnob');
    this.brakeButton=document.querySelector('#brake');
    const on=(el,event,fn,opts={})=>el.addEventListener(event,fn,{...opts,signal:this.abort.signal});
    const valid=e=>this.enabled&&(e.pointerType!=='mouse'||e.button===0);
    const own=(name,el,e)=>{if(!valid(e)||this.pointers.has(name))return false;e.preventDefault();this.pointers.set(name,e.pointerId);el.setPointerCapture(e.pointerId);return true;};
    const releases=(name,el,clear)=>{const end=e=>{if(this.pointers.get(name)!==e.pointerId)return;this.pointers.delete(name);clear();if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);};['pointerup','pointercancel','lostpointercapture'].forEach(ev=>on(el,ev,end));};

    let steeringStart=0,steeringRange=1;
    on(this.wheel,'pointerdown',e=>{if(!own('steering',this.wheel,e))return;steeringStart=e.clientX;steeringRange=this.wheel.getBoundingClientRect().width*.34;this.setSteer(0);this.wheel.classList.add('active');},{passive:false});
    on(this.wheel,'pointermove',e=>{if(this.pointers.get('steering')!==e.pointerId)return;e.preventDefault();this.setSteer(axis((e.clientX-steeringStart)/steeringRange,.025));},{passive:false});
    releases('steering',this.wheel,()=>{this.wheel.classList.remove('active');this.setSteer(0);});

    const moveLever=e=>{
      const rect=this.lever.getBoundingClientRect(),center=rect.top+rect.height/2,range=rect.height*.36;
      this.throttle=axis((center-e.clientY)/range,.075);
      const travel=clamp((center-e.clientY)/range,-1,1)*range;
      this.leverKnob.style.transform=`translateY(${-travel}px)`;
      this.paintLever();
    };
    on(this.lever,'pointerdown',e=>{if(own('lever',this.lever,e)){moveLever(e);this.lever.classList.add('active');}},{passive:false});
    on(this.lever,'pointermove',e=>{if(this.pointers.get('lever')!==e.pointerId)return;e.preventDefault();moveLever(e);},{passive:false});
    releases('lever',this.lever,()=>{this.throttle=0;this.lever.classList.remove('active');this.leverKnob.style.transform='';this.paintLever();});

    on(this.brakeButton,'pointerdown',e=>{if(!own('brake',this.brakeButton,e))return;this.brake=true;this.paintBrake();},{passive:false});
    releases('brake',this.brakeButton,()=>{this.brake=false;this.paintBrake();});

    on(this.lever,'keydown',e=>{if(!this.enabled)return;if(['ArrowUp','ArrowDown'].includes(e.code)){e.preventDefault();e.stopPropagation();this.throttle=e.code==='ArrowUp'?1:-1;this.paintLever();}});
    on(this.lever,'keyup',e=>{if(['ArrowUp','ArrowDown'].includes(e.code)){e.preventDefault();e.stopPropagation();this.throttle=0;this.paintLever();}});
    on(this.brakeButton,'keydown',e=>{if(this.enabled&&['Enter','Space'].includes(e.code)){e.preventDefault();e.stopPropagation();this.brake=true;this.paintBrake();}});
    on(this.brakeButton,'keyup',e=>{if(['Enter','Space'].includes(e.code)){e.preventDefault();e.stopPropagation();this.brake=false;this.paintBrake();}});

    on(window,'keydown',e=>{
      if(e.target.matches?.('input,select,textarea'))return;
      if(e.code==='Escape'&&!e.repeat){e.preventDefault();onPause();return;}
      if(!this.enabled)return;
      if(e.target.closest?.('button,[role="slider"]')&&['Space','Enter','ArrowUp','ArrowDown'].includes(e.code))return;
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
      this.keys.add(e.code);if(!e.repeat&&e.code==='KeyR')onReset();if(!e.repeat&&e.code==='KeyP')document.querySelector('#precision').click();
    });
    on(window,'keyup',e=>this.keys.delete(e.code));on(window,'blur',()=>this.reset());on(window,'resize',()=>this.reset());
    on(document,'visibilitychange',()=>{if(document.hidden)this.reset();});on(document,'contextmenu',e=>{if(e.target.closest('.drive-controls'))e.preventDefault();});
    this.paintLever();this.paintBrake();
  }
  setSteer(value){this.steer=clamp(value,-1,1);this.wheelGraphic.style.transform=`rotate(${this.steer*112}deg)`;this.wheel.setAttribute('aria-valuenow',String(Math.round(this.steer*100)));}
  paintLever(){const v=clamp(this.throttle,-1,1),gear=v>.075?'D':v<-.075?'R':'N';this.lever.dataset.gear=gear;this.leverKnob.textContent=gear;this.lever.setAttribute('aria-valuenow',String(Math.round(v*100)));this.lever.setAttribute('aria-label',gear==='D'?'الدعسة والقير: تقدم':gear==='R'?'الدعسة والقير: رجوع للخلف':'الدعسة والقير: محايد');}
  paintBrake(){this.brakeButton.classList.toggle('active',this.brake);this.brakeButton.setAttribute('aria-pressed',String(this.brake));}
  setEnabled(enabled){this.reset();this.enabled=Boolean(enabled);}
  reset(){const owned=[...this.pointers];this.pointers.clear();this.keys.clear();this.throttle=0;this.brake=false;this.wheel.classList.remove('active');this.lever.classList.remove('active');this.setSteer(0);this.leverKnob.style.transform='';for(const [name,id] of owned){const el=name==='steering'?this.wheel:name==='lever'?this.lever:this.brakeButton;if(el.hasPointerCapture(id))el.releasePointerCapture(id);}this.paintLever();this.paintBrake();}
  read(){if(!this.enabled)return {throttle:0,steer:0,brake:true,precision:this.precision};const key=c=>this.keys.has(c);const keyboardThrottle=Number(key('KeyW')||key('ArrowUp'))-Number(key('KeyS')||key('ArrowDown'));const keyboardSteer=Number(key('KeyD')||key('ArrowRight'))-Number(key('KeyA')||key('ArrowLeft'));const throttle=this.pointers.has('lever')?this.throttle:keyboardThrottle;const brake=this.brake||key('Space');return {throttle:brake?0:throttle,steer:this.pointers.has('steering')?this.steer:keyboardSteer,brake,precision:this.precision};}
  dispose(){this.setEnabled(false);this.abort.abort();}
}
