import { axis, clamp } from './core.js';
export class InputController {
  constructor(onReset,onPause) {
    this.keys=new Set();this.pointer=null;this.throttle=0;this.steer=0;this.brake=false;this.precision=false;this.abort=new AbortController();
    this.pad=document.querySelector('#stick');this.knob=document.querySelector('#knob');
    const on=(el,event,fn,opts={})=>el.addEventListener(event,fn,{...opts,signal:this.abort.signal});
    const move=e=>{
      const rect=this.pad.getBoundingClientRect(),range=rect.width*.31;
      const x=(e.clientX-rect.left-rect.width/2)/range, y=(e.clientY-rect.top-rect.height/2)/range;
      const m=Math.max(1,Math.hypot(x,y));this.steer=axis(x/m);this.throttle=axis(-y/m);
      this.knob.style.transform=`translate(${clamp(x/m,-1,1)*range}px,${clamp(y/m,-1,1)*range}px)`;
    };
    on(this.pad,'pointerdown',e=>{if(this.pointer!==null)return;e.preventDefault();this.pointer=e.pointerId;this.pad.setPointerCapture(e.pointerId);move(e);this.pad.classList.add('active');},{passive:false});
    on(this.pad,'pointermove',e=>{if(this.pointer===e.pointerId){e.preventDefault();move(e);}},{passive:false});
    const end=e=>{if(e.pointerId===this.pointer)this.clearStick();};
    ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>on(this.pad,ev,end));
    const brake=document.querySelector('#brake');let brakePointer=null;
    on(brake,'pointerdown',e=>{e.preventDefault();brakePointer=e.pointerId;brake.setPointerCapture(e.pointerId);this.brake=true;brake.classList.add('active');},{passive:false});
    const endBrake=e=>{if(brakePointer===e.pointerId){brakePointer=null;this.brake=false;brake.classList.remove('active');}};
    ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>on(brake,ev,endBrake));
    on(window,'keydown',e=>{
      if(e.target.matches?.('input,select,textarea'))return;
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
      this.keys.add(e.code);
      if(!e.repeat&&e.code==='KeyR')onReset();
      if(!e.repeat&&e.code==='Escape')onPause();
      if(!e.repeat&&e.code==='KeyP')document.querySelector('#precision').click();
    });
    on(window,'keyup',e=>this.keys.delete(e.code));on(window,'blur',()=>this.reset());
    on(document,'visibilitychange',()=>{if(document.hidden)this.reset();});
    on(document,'contextmenu',e=>{if(e.target.closest('.drive-controls'))e.preventDefault();});
  }
  clearStick(){const id=this.pointer;this.pointer=null;this.steer=0;this.throttle=0;this.knob.style.transform='';this.pad.classList.remove('active');if(id!==null&&this.pad.hasPointerCapture(id))this.pad.releasePointerCapture(id);}
  reset(){this.keys.clear();this.clearStick();this.brake=false;document.querySelector('#brake').classList.remove('active');}
  read(){
    const key=c=>this.keys.has(c),keyboardThrottle=Number(key('KeyW')||key('ArrowUp'))-Number(key('KeyS')||key('ArrowDown'));
    const keyboardSteer=Number(key('KeyD')||key('ArrowRight'))-Number(key('KeyA')||key('ArrowLeft'));
    return {throttle:this.pointer!==null?this.throttle:keyboardThrottle,steer:this.pointer!==null?this.steer:keyboardSteer,brake:this.brake||key('Space'),precision:this.precision};
  }
  dispose(){this.reset();this.abort.abort();}
}
