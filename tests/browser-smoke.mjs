// Real Chromium + Three.js + cannon-es. Pinned CDN files are served from npm.
// This is not a physical iPhone/Safari performance test.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { checkDriveControls } from './drive-controls.mjs';
const server=spawn(process.execPath,['scripts/serve.mjs'],{stdio:'inherit'});
let browser;const reports=[];await mkdir('artifacts',{recursive:true});
try{
  let up=false;for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:5173/')).ok){up=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(up,'Local server must start');
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const [width,height] of [[320,568],[390,844],[844,390]]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:1});
    await context.route('https://cdn.jsdelivr.net/npm/**',async route=>{
      const u=new URL(route.request().url()),match=u.pathname.match(/^\/npm\/(three@0\.185\.1|cannon-es@0\.20\.0)\/(.*)$/);
      if(!match){await route.abort();return;}
      const name=match[1].split('@')[0],file=path.resolve('node_modules',name,match[2]);
      assert.ok(file.startsWith(path.resolve('node_modules',name)+path.sep));
      await route.fulfill({status:200,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:await readFile(file)});
    });
    const page=await context.newPage(),errors=[],modelRequests=[];
    page.on('request',request=>{if(new URL(request.url()).pathname.endsWith('.glb'))modelRequests.push(request.url());});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&/THREE|WebGL|Shader|TypeError|ReferenceError/.test(m.text()))errors.push(m.text());});
    await page.goto('http://127.0.0.1:5173/?debug',{waitUntil:'networkidle',timeout:60000});
    await page.waitForFunction(()=>window.__motri&&!document.querySelector('#start').disabled,{},{timeout:30000});
    const model=await page.evaluate(()=>{
      const m=window.__motri,materials=[];
      m.visual.bodyMount.getObjectByName('GMC_Body')?.traverse(o=>{if(o.isMesh)materials.push(...(Array.isArray(o.material)?o.material:[o.material]));});
      const paint=materials.find(x=>x.name==='Body_Red'),trim=materials.find(x=>x.name==='Trim_Tires_Lights');
      return {status:m.modelStatus,hidden:!m.visual.placeholder.visible&&m.visual.wheelPlaceholders.every(w=>!w.visible),textured:!!trim?.map,pink:!!paint&&paint.color.r>.8&&paint.color.g>.15&&paint.color.b>paint.color.g,paintNormal:!!paint?.normalMap,maxSpeed:m.car.params.maxSpeed};
    });
    assert.equal(model.status.loaded,true,JSON.stringify(model.status));assert.equal(model.status.variant,'red-light');assert.equal(model.status.wheelCount,4);assert.equal(model.status.triangles,3971);
    assert.ok(model.hidden&&model.textured&&model.pink&&model.paintNormal,'Pink-painted GMC with original detail maps must replace all five placeholders');assert.equal(model.maxSpeed,14);
    assert.equal(modelRequests.length,1,'Only the selected car model should be downloaded; flowers are procedural');assert.ok(modelRequests[0].endsWith('/models/gmc_sierra_red_light.glb'));
    assert.ok(await page.locator('#fatal').isHidden());await page.screenshot({path:`artifacts/intro-${width}.png`});
    await page.locator('#start').click();await page.waitForFunction(()=>window.__motri.car.contacts===4);
    const controls=await checkDriveControls(page,context);
    await page.locator('#precision').click();assert.equal(await page.locator('#precision').getAttribute('aria-pressed'),'true');
    const flowerStats=await page.evaluate(()=>({bed:!!window.__motri.flowers?.hasBed,bouquet:window.__motri.flowers?.bouquet?.count??0,decals:window.__motri.modelStatus.paint?.decals??0,canopy:!!window.__motri.modelStatus.decor?.canopy,sign:!!window.__motri.modelStatus.decor?.sign,petals:window.__motri.flowers?.petals.used??0}));
    assert.ok(flowerStats.bed&&flowerStats.bouquet>=40&&flowerStats.decals>=4&&flowerStats.canopy&&flowerStats.sign&&flowerStats.petals>0,'Flowers fill the bed and petals scatter while driving: '+JSON.stringify(flowerStats));
    const stats=await page.evaluate(()=>({triangles:window.__motri.renderer.info.render.triangles,contacts:window.__motri.car.contacts,finite:[...window.__motri.car.body.position.toArray(),window.__motri.car.speed].every(Number.isFinite),fatal:!document.querySelector('#fatal').hidden}));
    assert.ok(stats.triangles>0&&stats.finite&&!stats.fatal);await page.screenshot({path:`artifacts/drive-${width}.png`});
    await page.locator('#pause').click();assert.ok(await page.locator('#intro').isVisible());await page.locator('#start').click();assert.ok(await page.locator('#hud').isVisible());
    assert.deepEqual(errors,[]);reports.push({width,height,model,modelRequests,...controls,...stats});await context.close();
  }
  console.log('MOTRI_BROWSER_RESULTS '+JSON.stringify(reports));await writeFile('artifacts/browser-results.json',JSON.stringify(reports,null,2));
}finally{await browser?.close();server.kill('SIGTERM');}
