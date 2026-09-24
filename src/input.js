import { axis, clamp } from './core.js';

// Independent pointer owners for the left wheel, signed right lever and brake.
export class InputController {
  constructor(onReset,onPause) {
    this.keys=new Set();this.pedalKeys=new Set();this.pointers=new Map();
    this.steer=0;this.throttle=0;this.brake=false;this.precision=false;
    this.enabled=true;this.abort=new AbortController();
    this.wheel=document.querySelector('#steering');
    this.wheelGraphic=document.querySelector('#steeringWheel');
    this.gas=document.querySelector('#accelerator');
    this.gasKnob=document.querySelector('#throttleKnob');
    this.gasMode=document.querySelector('#throttleMode');
    this.brakeButton=document.querySelector('#brake');
    const on=(el,event,fn,opts={})=>el.addEventListener(event,fn,{...opts,signal:this.abort.signal});
    const own=(name,el,e)=>{
      if(!this.enabled||(e.pointerType==='mouse'&&e.button!==0)||this.pointers.has(name))return false;
      e.preventDefault();this.pointers.set(name,e.pointerId);el.setPointerCapture(e.pointerId);return true;
    };
    const releases=(name,el,clear)=>{
      const end=e=>{
        if(this.pointers.get(name)!==e.pointerId)return;
        this.pointers.delete(name);clear();
        if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);
      };
      ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>on(el,ev,end));
    };
    let steeringStart=0,steeringRange=1;
    on(this.wheel,'pointerdown',e=>{
      if(!own('steering',this.wheel,e))return;
      steeringStart=e.clientX;steeringRange=this.wheel.getBoundingClientRect().width*.30;
      this.setSteer(0);this.wheel.classList.add('active');
    },{passive:false});
    on(this.wheel,'pointermove',e=>{
      if(this.pointers.get('steering')!==e.pointerId)return;
      e.preventDefault();this.setSteer(axis((e.clientX-steeringStart)/steeringRange,.035));
    },{passive:false});
    releases('steering',this.wheel,()=>{this.wheel.classList.remove('active');this.setSteer(0);});

    let throttleStart=0,throttleRange=1;
    on(this.gas,'pointerdown',e=>{
      if(!own('gas',this.gas,e))return;
      // Start neutral wherever the thumb lands. Only vertical movement drives.
      throttleStart=e.clientY;throttleRange=this.leverTravel();
      this.throttle=0;this.paintPedals();
    },{passive:false});
    on(this.gas,'pointermove',e=>{
      if(this.pointers.get('gas')!==e.pointerId)return;
      e.preventDefault();
      this.throttle=axis((throttleStart-e.clientY)/throttleRange,.10);
      this.paintPedals();
    },{passive:false});
    releases('gas',this.gas,()=>{this.throttle=0;this.paintPedals();});
    on(this.brakeButton,'pointerdown',e=>{
      if(!own('brake',this.brakeButton,e))return;
      this.brake=true;this.paintPedals();
    },{passive:false});
    releases('brake',this.brakeButton,()=>{this.brake=false;this.paintPedals();});
    on(this.brakeButton,'keydown',e=>{
      if(!this.enabled||!['Enter','Space'].includes(e.code))return;
      e.preventDefault();e.stopPropagation();this.pedalKeys.add(e.code);this.paintPedals();
    });
    on(this.brakeButton,'keyup',e=>{
      if(!['Enter','Space'].includes(e.code))return;
      e.preventDefault();e.stopPropagation();this.pedalKeys.delete(e.code);this.paintPedals();
    });
    on(this.brakeButton,'blur',()=>{this.pedalKeys.clear();this.paintPedals();});
    on(window,'keydown',e=>{
      if(e.target.matches?.('input,select,textarea'))return;
      if(e.code==='Escape'&&!e.repeat){e.preventDefault();onPause();return;}
      if(!this.enabled)return;
      if(e.target.closest?.('button')&&e.target.getClientRects().length&&['Space','Enter'].includes(e.code))return;
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
      this.keys.add(e.code);
      if(!e.repeat&&e.code==='KeyR')onReset();
      if(!e.repeat&&e.code==='KeyP')document.querySelector('#precision').click();
      this.paintPedals();
    });
    on(window,'keyup',e=>{this.keys.delete(e.code);this.paintPedals();});
    on(window,'blur',()=>this.reset());on(window,'resize',()=>this.reset());
    on(document,'visibilitychange',()=>{if(document.hidden)this.reset();});
    on(document,'contextmenu',e=>{if(e.target.closest('.drive-controls'))e.preventDefault();});
    this.paintPedals();
  }
  leverTravel(){return Math.max(24,(this.gas.getBoundingClientRect().height-this.gasKnob.offsetHeight)/2-8);}
  setSteer(value){
    this.steer=clamp(value,-1,1);this.wheelGraphic.style.transform=`rotate(${this.steer*105}deg)`;
    this.wheel.setAttribute('aria-valuenow',String(Math.round(this.steer*100)));
  }
  requestedThrottle(){
    if(!this.enabled)return 0;
    if(this.pointers.has('gas'))return this.throttle;
    const k=c=>this.keys.has(c);
    return Number(k('KeyW')||k('ArrowUp'))-Number(k('KeyS')||k('ArrowDown'));
  }
  paintPedals(){
    const value=this.requestedThrottle(),mode=value>0?'D':value<0?'R':'N';
    const brake=this.brake||this.pedalKeys.size>0||this.keys.has('Space');
    this.gas.classList.toggle('active',this.pointers.has('gas'));this.gas.dataset.drive=mode;
    this.gasKnob.style.transform=`translateY(${-value*this.leverTravel()}px)`;
    this.gasMode.textContent=mode;
    this.gas.setAttribute('aria-valuenow',String(Math.round(value*100)));
    this.gas.setAttribute('aria-valuetext',value===0?'محايد':`${value>0?'تقدم':'رجوع'} ${Math.round(Math.abs(value)*100)}%`);
    this.brakeButton.classList.toggle('active',brake);this.brakeButton.setAttribute('aria-pressed',String(brake));
  }
  setEnabled(enabled){this.enabled=Boolean(enabled);this.reset();}
  reset(){
    const owned=[...this.pointers];this.pointers.clear();this.keys.clear();this.pedalKeys.clear();
    this.throttle=0;this.brake=false;this.wheel.classList.remove('active');this.setSteer(0);
    for(const [name,id] of owned){
      const el=name==='steering'?this.wheel:name==='gas'?this.gas:this.brakeButton;
      if(el.hasPointerCapture(id))el.releasePointerCapture(id);
    }
    this.paintPedals();
  }
  read(){
    if(!this.enabled)return {throttle:0,steer:0,brake:true,precision:this.precision};
    const k=c=>this.keys.has(c),steer=Number(k('KeyD')||k('ArrowRight'))-Number(k('KeyA')||k('ArrowLeft'));
    const brake=this.brake||this.pedalKeys.size>0||k('Space');
    // The existing vehicle controller brakes before applying opposite drive.
    return {throttle:brake?0:this.requestedThrottle(),steer:this.pointers.has('steering')?this.steer:steer,brake,precision:this.precision};
  }
  dispose(){this.setEnabled(false);this.abort.abort();}
}
