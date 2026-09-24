// Real Chromium + Three.js + cannon-es. CDN routes use identical pinned npm files,
// never fake modules. This is not a physical iPhone/Safari performance test.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const server=spawn(process.execPath,['scripts/serve.mjs'],{stdio:'inherit'});
let browser;
const reports=[];
await mkdir('artifacts',{recursive:true});
try {
  let up=false;
  for(let i=0;i<50;i++){
    try {if((await fetch('http://127.0.0.1:5173/')).ok){up=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,100));
  }
  assert.ok(up,'Local server must start');
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const [width,height] of [[390,844],[844,390]]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:1});
    await context.route('https://cdn.jsdelivr.net/npm/**',async route=>{
      const u=new URL(route.request().url());
      const match=u.pathname.match(/^\/npm\/(three@0\.185\.1|cannon-es@0\.20\.0)\/(.*)$/);
      if(!match){await route.abort();return;}
      const name=match[1].split('@')[0];
      const file=path.resolve('node_modules',name,match[2]);
      const base=path.resolve('node_modules',name)+path.sep;
      assert.ok(file.startsWith(base));
      await route.fulfill({status:200,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:await readFile(file)});
    });
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',msg=>{if(msg.type()==='error'&&/THREE|WebGL|Shader|TypeError|ReferenceError/.test(msg.text()))errors.push(msg.text());});
    await page.goto('http://127.0.0.1:5173/?debug',{waitUntil:'networkidle',timeout:60000});
    await page.waitForFunction(()=>window.__motri&&!document.querySelector('#start').disabled,{},{timeout:30000});
    assert.ok(await page.locator('#fatal').isHidden(),await page.locator('#fatalText').textContent());
    await page.screenshot({path:`artifacts/intro-${width}.png`});
    await page.locator('#start').click();
    await page.waitForFunction(()=>window.__motri.car.contacts===4,{},{timeout:15000});
    const before=await page.evaluate(()=>window.__motri.car.body.position.z);
    await page.keyboard.down('KeyW');
    await page.waitForFunction(z=>window.__motri.car.body.position.z>z+.5,before,{timeout:15000});
    await page.keyboard.up('KeyW');await page.keyboard.down('Space');
    await page.waitForFunction(()=>Math.abs(window.__motri.car.speed)<.5,{},{timeout:15000});
    await page.keyboard.up('Space');
    const moved=await page.evaluate(()=>window.__motri.car.body.position.z);
    await page.locator('#reset').click();
    await page.waitForFunction(()=>window.__motri.car.contacts===4);
    // Actual two-touch input: steering and brake must coexist and release cleanly.
    const a=await page.locator('#stick').boundingBox(),b=await page.locator('#brake').boundingBox();
    const finger={id:1,x:a.x+a.width/2,y:a.y+a.height*.25};
    const brake={id:2,x:b.x+b.width/2,y:b.y+b.height/2};
    const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger,brake]});
    const pressed=await page.evaluate(()=>window.__motri.input.read());
    assert.ok(pressed.throttle>.5&&pressed.brake,'Two fingers must drive and brake together');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const released=await page.evaluate(()=>window.__motri.input.read());
    assert.equal(released.throttle,0);assert.equal(released.brake,false);
    await page.locator('#precision').click();
    assert.equal(await page.locator('#precision').getAttribute('aria-pressed'),'true');
    const stats=await page.evaluate(()=>({triangles:window.__motri.renderer.info.render.triangles,contacts:window.__motri.car.contacts,finite:[...window.__motri.car.body.position.toArray(),window.__motri.car.speed].every(Number.isFinite),fatal:!document.querySelector('#fatal').hidden}));
    assert.ok(stats.triangles>0&&stats.finite&&!stats.fatal);
    await page.screenshot({path:`artifacts/drive-${width}.png`});
    await page.locator('#pause').click();assert.ok(await page.locator('#intro').isVisible());
    await page.locator('#start').click();assert.ok(await page.locator('#hud').isVisible());
    assert.deepEqual(errors,[]);
    reports.push({width,height,moveDistance:moved-before,twoTouch:true,...stats});
    await context.close();
  }
  console.log('MOTRI_BROWSER_RESULTS '+JSON.stringify(reports));
  await writeFile('artifacts/browser-results.json',JSON.stringify(reports,null,2));
} finally {await browser?.close();server.kill('SIGTERM');}
