import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareGmcModel, installGmcModel } from './gmc.js';

// The red upload already has four straight, pivoted wheels. Do not run the
// original merged-mesh splitter on it or recolor its shared trim/tire material.
export function prepareRedGmcModel(source,{width=2.2,wheelLocalY=-.2}={}) {
  source.updateMatrixWorld(true);
  const bodyNode=source.getObjectByName('Body'),glassNode=source.getObjectByName('Glass');
  const wheelNames=['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR'];
  const nodes=wheelNames.map(name=>source.getObjectByName(name));
  if(!bodyNode||!glassNode||nodes.some(o=>!o?.isMesh))throw new Error('الموديل الأحمر لا يحتوي الهيكل والعجلات الأربع المطلوبة');
  const box=new THREE.Box3().setFromObject(bodyNode).union(new THREE.Box3().setFromObject(glassNode));
  for(const node of nodes)box.union(new THREE.Box3().setFromObject(node));
  const size=box.getSize(new THREE.Vector3());
  if(!Number.isFinite(width)||width<=0||!Number.isFinite(size.x)||size.x<=0||!Number.isFinite(wheelLocalY))throw new Error('Invalid red GMC dimensions');
  const scale=width/size.x;
  const centers=nodes.map(o=>o.getWorldPosition(new THREE.Vector3()));
  const average=centers.reduce((a,p)=>a.add(p),new THREE.Vector3()).multiplyScalar(.25);
  const offset=new THREE.Vector3(-average.x*scale,wheelLocalY-average.y*scale,-average.z*scale);
  // Clone each geometry before baking transforms: rear wheels share source
  // buffers with the front wheels. Materials and original GLB bytes stay intact.
  const bake=node=>{
    const geometry=node.geometry.clone().applyMatrix4(node.matrixWorld);
    geometry.scale(scale,scale,scale);geometry.translate(offset.x,offset.y,offset.z);
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,node.material);mesh.name=node.name;
    mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
  };
  const body=new THREE.Group();body.name='GMC_Body';
  const glass=new THREE.Group();glass.name='GMC_Glass';
  bodyNode.traverse(o=>{if(o.isMesh)body.add(bake(o));});
  glassNode.traverse(o=>{if(o.isMesh)glass.add(bake(o));});
  if(!body.children.length||!glass.children.length)throw new Error('Red GMC body/glass is empty');
  const bodyBox=new THREE.Box3().setFromObject(body),cabBox=new THREE.Box3().setFromObject(glass);
  body.add(glass);
  const wheels=nodes.map((node,i)=>{
    const mesh=bake(node),geometry=mesh.geometry,pivot=centers[i].clone().multiplyScalar(scale).add(offset);
    const radius=(geometry.boundingBox.max.y-geometry.boundingBox.min.y)/2;
    if(!Number.isFinite(radius)||radius<=0)throw new Error('Invalid red GMC wheel radius');
    geometry.translate(-pivot.x,-pivot.y,-pivot.z);geometry.computeBoundingBox();geometry.computeBoundingSphere();
    mesh.name=['GMC_FrontLeft','GMC_FrontRight','GMC_RearLeft','GMC_RearRight'][i];
    return {mesh,geometry,center:pivot,radius,neutralYaw:0};
  });
  const bodySize=bodyBox.getSize(new THREE.Vector3()),shellBottom=bodyBox.min.y+.06,shellHeight=Math.min(.52,bodySize.y*.38);
  const shell={half:[bodySize.x*.46,shellHeight/2,bodySize.z/2],offset:[(bodyBox.min.x+bodyBox.max.x)/2,shellBottom+shellHeight/2,(bodyBox.min.z+bodyBox.max.z)/2]};
  cabBox.max.y=Math.max(cabBox.max.y,bodyBox.max.y);cabBox.min.y-=.06;
  const cabSize=cabBox.getSize(new THREE.Vector3()),cabCenter=cabBox.getCenter(new THREE.Vector3());
  const cabin={half:[cabSize.x/2,cabSize.y/2,cabSize.z/2],offset:cabCenter.toArray()};
  let triangles=0;
  for(const object of [body,...wheels.map(w=>w.mesh)])object.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
  return {body,wheelMeshes:wheels.map(w=>w.mesh),wheels,shell,cabin,scale,info:{name:'GMC Sierra Red',variant:'red-light',width,scale,triangles,wheelCount:4,removedBackdrop:false,wheelCenters:wheels.map(w=>w.center.toArray()),wheelRadii:wheels.map(w=>w.radius)}};
}

export async function loadVehicleModel(visual, configURL='models/vehicle.json', car=null) {
  const response=await fetch(configURL,{cache:'no-cache'});
  if(!response.ok)throw new Error('ملف إعداد الموديل غير متاح');
  const cfg=await response.json();if(!cfg.enabled)return {loaded:false};
  const base=new URL(configURL,location.href),loader=new GLTFLoader();
  const resolve=path=>new URL(path,base).href;
  const load=async(path)=>{const {scene}=await loader.loadAsync(resolve(path));scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return scene;};
  if(cfg.profile==='gmc-sierra-work-truck'||cfg.profile==='gmc-sierra-red-light'){
    if(!cfg.model)throw new Error('حدد ملف GMC');
    const source=await load(cfg.model);
    const prepare=cfg.profile==='gmc-sierra-red-light'?prepareRedGmcModel:prepareGmcModel;
    const prepared=prepare(source,{width:Number(cfg.width)||2.2,wheelLocalY:car?car.params.wheelY-car.params.restLength:-.2});
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
