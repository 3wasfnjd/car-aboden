import assert from 'node:assert/strict';

// Run on the actual game: these checks use native Chromium multi-touch events,
// the real InputController and the real cannon-es car, not replacement modules.
export async function checkDriveControls(page,context) {
  const boxes={};const viewport=page.viewportSize();
  for(const id of ['steering','accelerator','brake','direction','precision','reset','camera']) {
    const b=await page.locator('#'+id).boundingBox();assert.ok(b,id+' visible');boxes[id]=b;
    assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=viewport.width+1&&b.y+b.height<=viewport.height+1,id+' inside viewport');
    assert.ok(b.width>=40&&b.height>=34,id+' touch target');
  }
  for(const [name,a] of Object.entries(boxes))for(const [other,b] of Object.entries(boxes)) {
    if(name>=other)continue;
    const overlaps=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>1;
    assert.ok(!overlaps,name+' overlaps '+other);
  }
  const a=boxes.steering,b=boxes.accelerator,c=boxes.brake;
  assert.ok(a.x+a.width<c.x&&c.x<b.x,'Wheel left, both pedals right, gas outermost');
  const finger={id:1,x:a.x+a.width/2,y:a.y+a.height/2};
  const gas={id:2,x:b.x+b.width/2,y:b.y+b.height*.8};
  const brake={id:3,x:c.x+c.width/2,y:c.y+c.height/2};
  const cdp=await context.newCDPSession(page);
  const touch=async(type,touchPoints)=>{
    await cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
    await page.evaluate(()=>new Promise(requestAnimationFrame));
  };
  const read=()=>page.evaluate(()=>window.__motri.input.read());
  const stopped=()=>page.waitForFunction(()=>window.__motri.car.contacts===4&&window.__motri.car.body.velocity.length()<.15,{},{timeout:15000});

  await touch('touchStart',[finger]);finger.x+=a.width*.25;await touch('touchMove',[finger]);
  let r=await read();assert.ok(r.steer>.5);assert.equal(r.throttle,0,'Steering must never accelerate');
  await touch('touchStart',[finger,gas]);r=await read();assert.ok(r.steer>.5&&r.throttle>.12&&r.throttle<.3);
  gas.y=b.y+b.height*.18;await touch('touchMove',[finger,gas]);r=await read();assert.ok(r.steer>.5&&r.throttle>.7,'Analog pedal is independent');
  await touch('touchStart',[finger,gas,brake]);r=await read();assert.ok(r.brake&&r.steer>.5);assert.equal(r.throttle,0,'Brake overrides held gas');
  // CDP touchEnd with named points releases those points, not the remaining ones.
  await touch('touchEnd',[brake]);assert.ok((await read()).throttle>.7);
  await touch('touchEnd',[finger]);r=await read();assert.equal(r.steer,0);assert.ok(r.throttle>.7,'Wheel release cannot cancel gas');
  await page.evaluate(()=>document.querySelector('#direction').click());
  assert.equal(await page.locator('#direction').getAttribute('data-gear'),'D','Cannot shift with pedal held');
  await touch('touchCancel',[]);r=await read();assert.equal(r.steer,0);assert.equal(r.throttle,0);assert.equal(r.brake,false);

  await page.locator('#reset').click();await stopped();
  const before=await page.evaluate(()=>window.__motri.car.body.position.z);
  await touch('touchStart',[gas]);
  await page.waitForFunction(z=>window.__motri.car.body.position.z>z+.35,before,{timeout:15000});
  await touch('touchEnd',[]);
  // Speed guard must work even after the pedal is released.
  await page.evaluate(()=>document.querySelector('#direction').click());
  assert.equal(await page.locator('#direction').getAttribute('data-gear'),'D');
  await touch('touchStart',[brake]);await stopped();await touch('touchEnd',[]);
  await page.locator('#direction').click();assert.equal(await page.locator('#direction').getAttribute('data-gear'),'R');
  const reverseStart=await page.evaluate(()=>window.__motri.car.body.position.z);
  await touch('touchStart',[gas]);assert.ok((await read()).throttle<-.7);
  await page.waitForFunction(z=>window.__motri.car.body.position.z<z-.25,reverseStart,{timeout:15000});
  await touch('touchStart',[gas,brake]);await touch('touchEnd',[gas]);await stopped();
  r=await read();assert.equal(r.throttle,0);assert.ok(r.brake,'Brake alone does not select reverse');
  await touch('touchEnd',[]);await page.locator('#direction').click();
  assert.equal(await page.locator('#direction').getAttribute('data-gear'),'D');

  await touch('touchStart',[gas]);
  await page.evaluate(()=>{const i=window.__motri.input;document.querySelector('#accelerator').releasePointerCapture(i.pointers.get('gas'));});
  gas.y+=2;await touch('touchMove',[gas]);assert.equal((await read()).throttle,0,'Lost capture clears pedal');await touch('touchCancel',[]);
  await touch('touchStart',[gas]);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  assert.ok(await page.locator('#intro').isVisible());assert.equal((await read()).throttle,0);await touch('touchEnd',[]);
  await page.locator('#start').click();
  await page.locator('#help').click();await page.keyboard.down('KeyW');
  assert.equal((await read()).throttle,0,'Settings disable driving');await page.keyboard.up('KeyW');
  await page.locator('#closeSettings').click();
  await page.locator('#steering').focus();await page.keyboard.down('KeyW');await page.keyboard.down('KeyA');
  r=await read();assert.equal(r.throttle,1);assert.equal(r.steer,-1);
  await page.keyboard.down('Space');r=await read();assert.equal(r.throttle,0);assert.ok(r.brake);
  await page.keyboard.up('Space');await page.keyboard.up('KeyW');await page.keyboard.up('KeyA');
  await page.locator('#accelerator').focus();await page.keyboard.down('Enter');assert.equal((await read()).throttle,1);
  await page.keyboard.up('Enter');assert.equal((await read()).throttle,0);
  await page.locator('#reset').click();await stopped();
  await cdp.detach();
  return {splitControls:true,analogPedal:true,threeTouch:true,gearInterlock:true,realForwardReverse:true,cancelAndBlur:true,layout:true};
}
