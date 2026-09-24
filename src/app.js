import * as THREE from 'three';
import { CONFIG, fixedSteps, safeSpawn } from './core.js';
import { MotriVehicle } from './vehicle.js';
import { CarVisual } from './visuals.js';
import { TestWorld } from './world.js';
import { InputController } from './input.js';
import { loadVehicleModel } from './models.js';
export async function boot() {
  const $=id=>document.getElementById(id),canvas=$('view');
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xe2e4d7);scene.fog=new THREE.Fog(0xe2e4d7,34,75);
  const lab=new TestWorld(scene),car=new MotriVehicle(lab.world),visual=new CarVisual(scene);
  const camera=new THREE.PerspectiveCamera(43,1,.1,100);
  let running=false,everStarted=false,paused=false,accumulator=0,last=0,elapsed=0,camYaw=2.5,camTargetYaw=2.5;
  let toastTimer=0, frameCount=0,statsClock=0,autoResetAt=0,dead=false;
  const cameraTarget=new THREE.Vector3(),desired=new THREE.Vector3(),direction=new THREE.Vector3();
  const cameraRay=new THREE.Raycaster();
  const readStore=()=>{try{return JSON.parse(localStorage.getItem('motri-checkpoint-v1'));}catch{return null;}};
  const stored=readStore();car.checkpoint=safeSpawn(stored);car.reset();
  const notify=text=>{$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600);};
  function resetCar(){input.reset();car.reset();accumulator=0;cameraTarget.copy(car.body.position);notify('عادت السيارة إلى نقطة البداية');}
  function showMenu(){running=false;paused=true;input.setEnabled(false);$('intro').hidden=false;$('hud').hidden=true;$('settings').hidden=true;$('start').textContent='متابعة القيادة';}
  const input=new InputController(resetCar,()=>running?showMenu():start(),{
    getSpeed:()=>car.body.velocity.length(),
    onGearChange:gear=>notify(gear===1?'D · التقدم للأمام':'R · الرجوع للخلف'),
    onGearBlocked:()=>notify('توقف وارفع إصبعك عن البنزين قبل تغيير الاتجاه'),
  });
  input.setEnabled(false);
  function start(){if(dead)return;running=true;paused=false;everStarted=true;input.setEnabled(true);last=performance.now();accumulator=0;$('intro').hidden=true;$('hud').hidden=false;}
  $('start').disabled=false;$('start').textContent='ابدأ القيادة';$('loadState').textContent='جاهزة للتجربة • بدون كاميرا';
  $('start').addEventListener('click',start);$('pause').addEventListener('click',showMenu);$('reset').addEventListener('click',resetCar);
  $('precision').addEventListener('click',()=>{input.precision=!input.precision;$('precision').setAttribute('aria-pressed',String(input.precision));$('precision').textContent=input.precision?'قيادة دقيقة: مفعّلة':'قيادة دقيقة';notify(input.precision?'سرعة منخفضة للتحكم قرب العقبات':'القيادة العادية');});
  $('camera').addEventListener('click',()=>{camTargetYaw+=Math.PI/2;});
  $('help').addEventListener('click',()=>{$('settings').hidden=!$('settings').hidden;input.setEnabled($('settings').hidden&&running);});
  $('closeSettings').addEventListener('click',()=>{$('settings').hidden=true;input.setEnabled(running);});
  $('resetWorld').addEventListener('click',()=>{lab.reset();car.checkpoint=[...CONFIG.spawn];try{localStorage.removeItem('motri-checkpoint-v1');}catch{}resetCar();$('mission').textContent='ادفع الصندوق البرتقالي إلى المربع الأخضر';});
  $('savePoint').addEventListener('click',()=>{
    const p=car.body.position;
    // Only checkpoint the clear, central start area: never respawn inside an object.
    if(Math.abs(p.x)>3||p.z>-9||p.z< -22||p.y>1.5){notify('احفظ نقطة البداية في المساحة الخالية قبل المسارات');return;}
    car.checkpoint=safeSpawn([p.x,.72,p.z]);try{localStorage.setItem('motri-checkpoint-v1',JSON.stringify(car.checkpoint));notify('تم حفظ موضع البداية');}catch{notify('حُفظت النقطة لهذه الجلسة فقط');}
  });
  $('quality').addEventListener('change',()=>{const low=$('quality').value==='low';renderer.setPixelRatio(Math.min(devicePixelRatio||1,low?1:1.5));renderer.shadowMap.enabled=!low;resize();});
  $('speedLimit').addEventListener('input',()=>{car.params.maxSpeed=Number($('speedLimit').value);$('speedValue').textContent=car.params.maxSpeed.toFixed(1);});
  function resize(){const w=window.innerWidth,h=window.innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  window.addEventListener('resize',resize);resize();
  cameraTarget.copy(car.body.position);camera.position.set(12,14,-28);
  document.addEventListener('visibilitychange',()=>{last=performance.now();accumulator=0;if(document.hidden&&running)showMenu();});
  window.addEventListener('blur',()=>{if(running)showMenu();});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();running=false;input.reset();$('fatal').hidden=false;$('fatalText').textContent='توقف عرض الرسوم. أعد تحميل الصفحة لإعادة تهيئة المحرك.';});
  // Local GLB adapter is opt-in. Standalone build deliberately has no model request.
  if(!window.MOTRI_SINGLE_FILE)loadVehicleModel(visual).then(r=>{if(r.loaded)notify('تم تحميل موديل السيارة');}).catch(e=>{console.warn(e);notify('تعذر تحميل الموديل؛ بقيت السيارة المؤقتة');});
  renderer.setAnimationLoop(now=>{
    if(dead||document.hidden)return;
    const dt=last?Math.min(.08,Math.max(0,(now-last)/1000)):0;last=now;elapsed+=dt;
    try{
      // Initial menu simulates only settling (no controls); pause freezes all physics.
      if(running||!everStarted){
        car.input=running?input.read():{throttle:0,steer:0,brake:true,precision:false};
        const steps=fixedSteps(accumulator,dt);accumulator=steps.accumulator;
        for(let i=0;i<steps.count;i++){car.beforeStep(CONFIG.step);lab.world.step(CONFIG.step);car.afterStep(CONFIG.step);}
        if(lab.sync(dt)){$('mission').textContent='اكتمل اختبار الدفع • جرّب المنحدر والممر الآن';notify('وصل الصندوق إلى مكانه');}
        if(car.body.position.y< -5||Math.abs(car.body.position.x)>27||Math.abs(car.body.position.z)>27){resetCar();}
        const up=new THREE.Vector3(0,1,0).applyQuaternion(visual.root.quaternion);
        if(up.y<.12&&Math.abs(car.speed)<.2){autoResetAt+=dt;if(autoResetAt>3){resetCar();autoResetAt=0;}}else autoResetAt=0;
      }
      visual.sync(car);
      const smoothing=1-Math.exp(-5*dt);cameraTarget.lerp(new THREE.Vector3(car.body.position.x,car.body.position.y+.25,car.body.position.z),smoothing||1);
      camYaw+=(camTargetYaw-camYaw)*(1-Math.exp(-3*dt));
      desired.set(Math.sin(camYaw)*15,12.5,Math.cos(camYaw)*15).add(cameraTarget);
      direction.subVectors(desired,cameraTarget);const distance=direction.length();direction.normalize();cameraRay.set(cameraTarget,direction);cameraRay.far=distance;
      const hit=cameraRay.intersectObjects(lab.occluders,false)[0];
      if(hit&&hit.distance>2)desired.copy(cameraTarget).addScaledVector(direction,Math.max(2,hit.distance-.5));
      camera.position.lerp(desired,1-Math.exp(-6*dt));camera.lookAt(cameraTarget);
      renderer.render(scene,camera);frameCount++;statsClock+=dt;
      if(statsClock>.45){
        $('speed').textContent=Math.round(Math.min(100,Math.abs(car.speed)/(input.precision?CONFIG.precisionSpeed:car.params.maxSpeed)*100));
        $('gear').textContent=car.speed<-.15?'R':car.speed>.15?'D':'N';
        $('telemetry').textContent=`${Math.round(frameCount/statsClock)} FPS · ${car.contacts}/4 ملامسة · ${renderer.info.render.triangles.toLocaleString('en')} مثلث`;
        frameCount=0;statsClock=0;
      }
    }catch(e){console.error(e);renderer.setAnimationLoop(null);running=false;$('fatal').hidden=false;$('fatalText').textContent='تعذر استكمال التشغيل: '+e.message;}
  });
  // Test-only API is not enabled on ordinary visits.
  if(new URLSearchParams(location.search).has('debug'))window.__motri={car,lab,input,scene,renderer,start,resetCar};
  window.addEventListener('pagehide',e=>{if(e.persisted){running=false;input.reset();return;}dead=true;renderer.setAnimationLoop(null);input.dispose();visual.dispose();car.dispose();renderer.dispose();});
  window.addEventListener('pageshow',e=>{if(e.persisted)showMenu();});
}
