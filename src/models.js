import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareGmcModel, installGmcModel } from './gmc.js';

export async function loadVehicleModel(visual, configURL='models/vehicle.json', car=null) {
  const response=await fetch(configURL,{cache:'no-cache'});
  if(!response.ok)throw new Error('ملف إعداد الموديل غير متاح');
  const cfg=await response.json();if(!cfg.enabled)return {loaded:false};
  const base=new URL(configURL,location.href),loader=new GLTFLoader();
  const resolve=path=>new URL(path,base).href;
  const load=async(path)=>{const {scene}=await loader.loadAsync(resolve(path));scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return scene;};
  if(cfg.profile==='gmc-sierra-work-truck'){
    if(!cfg.model)throw new Error('حدد ملف GMC');
    const source=await load(cfg.model);
    const prepared=prepareGmcModel(source,{width:Number(cfg.width)||2.2,wheelLocalY:car?car.params.wheelY-car.params.restLength:-.2});
    return installGmcModel(visual,car,prepared);
  }
  // Preserve support for separately supplied body/wheel GLBs.
  if(!cfg.body)throw new Error('حدد مسار body في vehicle.json');
  const wheelFiles=['frontLeft','frontRight','rearLeft','rearRight'].map(key=>cfg.wheels?.[key]||cfg.wheel||null);
  const models=await Promise.all([load(cfg.body),...wheelFiles.map(p=>p?load(p):Promise.resolve(null))]);
  const fit=(object,desired,dimension,rotation=[0,0,0])=>{
    const pivot=new THREE.Group();object.rotation.set(...rotation.map(v=>v*Math.PI/180));pivot.add(object);pivot.updateMatrixWorld(true);
    const b=new THREE.Box3().setFromObject(pivot),size=b.getSize(new THREE.Vector3()),center=b.getCenter(new THREE.Vector3());
    if(!Number.isFinite(size[dimension])||size[dimension]<1e-5)throw new Error('الموديل بلا حجم صالح');
    object.position.sub(center);pivot.scale.setScalar(desired/size[dimension]);return pivot;
  };
  const body=fit(models[0],Number(cfg.bodyWidth)||1.8,'x',cfg.rotation||[0,0,0]);
  body.position.set(...(cfg.offset||[0,.2,0]));visual.bodyMount.add(body);visual.placeholder.visible=false;
  for(let i=0;i<4;i++)if(models[i+1]){
    const w=fit(models[i+1],.84,'y',cfg.wheelRotation||[0,0,0]);visual.wheelMounts[i].add(w);visual.wheelPlaceholders[i].visible=false;
  }
  return {loaded:true};
}
