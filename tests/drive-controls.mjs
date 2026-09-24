import assert from 'node:assert/strict';

export async function checkDriveControls(page,context){
  const boxes={},viewport=page.viewportSize();
  for(const id of ['steering','driveLever','brake','precision','reset','camera']){
    const b=await page.locator('#'+id).boundingBox();assert.ok(b,id+' visible');boxes[id]=b;
    assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=viewport.width+1&&b.y+b.height<=viewport.height+1,id+' inside viewport');
    assert.ok(b.width>=40&&b.height>=34,id+' touch target');
  }
  for(const [name,a] of Object.entries(boxes))for(const [other,b] of Object.entries(boxes)){
    if(name>=other)continue;
    const overlaps=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>1;
    assert.ok(!overlaps,name+' overlaps '+other);
  }
  assert.ok(boxes.steering.x+boxes.steering.width<boxes.brake.x,'wheel left, drive controls right');

  const a=boxes.steering,l=boxes.driveLever,b=boxes.brake;
  const finger={id:1,x:a.x+a.width/2,y:a.y+a.height/2};
  const lever={id:2,x:l.x+l.width/2,y:l.y+l.height*.18};
  const brake={id:3,x:b.x+b.width/2,y:b.y+b.height/2};
  const cdp=await context.newCDPSession(page);
  const touch=async(type,touchPoints)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints});await page.evaluate(()=>new Promise(requestAnimationFrame));};
  const read=()=>page.evaluate(()=>window.__motri.input.read());
  const stopped=()=>page.waitForFunction(()=>window.__motri.car.contacts===4&&window.__motri.car.body.velocity.length()<.18,{},{timeout:15000});

  await touch('touchStart',[finger]);finger.x+=a.width*.24;await touch('touchMove',[finger]);
  let rr=await read();assert.ok(rr.steer>.45);assert.equal(rr.throttle,0);
  await touch('touchStart',[finger,lever]);rr=await read();assert.ok(rr.steer>.45&&rr.throttle>.65);
  await touch('touchStart',[finger,lever,brake]);rr=await read();assert.ok(rr.brake);assert.equal(rr.throttle,0);
  await touch('touchEnd',[brake]);assert.ok((await read()).throttle>.65);
  await touch('touchEnd',[finger]);rr=await read();assert.equal(rr.steer,0);assert.ok(rr.throttle>.65);
  await touch('touchCancel',[]);

  await page.locator('#reset').click();await stopped();
  const before=await page.evaluate(()=>window.__motri.car.body.position.z);
  await touch('touchStart',[lever]);
  await page.waitForFunction(z=>window.__motri.car.body.position.z>z+.55,before,{timeout:15000});
  await touch('touchEnd',[]);

  await touch('touchStart',[brake]);await stopped();await touch('touchEnd',[]);
  const reverseStart=await page.evaluate(()=>window.__motri.car.body.position.z);
  lever.y=l.y+l.height*.82;
  await touch('touchStart',[lever]);assert.ok((await read()).throttle<-.65);
  await page.waitForFunction(z=>window.__motri.car.body.position.z<z-.35,reverseStart,{timeout:15000});
  await touch('touchEnd',[]);

  await page.locator('#reset').click();await stopped();
  lever.y=l.y+l.height*.18;await touch('touchStart',[lever]);
  await page.waitForFunction(()=>window.__motri.car.speed>.8,{},{timeout:15000});
  lever.y=l.y+l.height*.82;await touch('touchMove',[lever]);
  await page.waitForFunction(()=>Math.abs(window.__motri.car.speed)<.25,{},{timeout:15000});
  await touch('touchEnd',[]);

  lever.y=l.y+l.height*.18;await touch('touchStart',[lever]);
  await page.evaluate(()=>{const i=window.__motri.input;document.querySelector('#driveLever').releasePointerCapture(i.pointers.get('lever'));});
  assert.equal((await read()).throttle,0);await touch('touchCancel',[]);
  await touch('touchStart',[lever]);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  assert.ok(await page.locator('#intro').isVisible());assert.equal((await read()).throttle,0);await touch('touchEnd',[]);
  await page.locator('#start').click();

  await page.locator('#help').click();await page.keyboard.down('KeyW');
  assert.equal((await read()).throttle,0);await page.keyboard.up('KeyW');await page.locator('#closeSettings').click();
  await page.locator('#steering').focus();await page.keyboard.down('KeyW');await page.keyboard.down('KeyA');
  rr=await read();assert.equal(rr.throttle,1);assert.equal(rr.steer,-1);
  await page.keyboard.down('Space');rr=await read();assert.equal(rr.throttle,0);assert.ok(rr.brake);
  await page.keyboard.up('Space');await page.keyboard.up('KeyW');await page.keyboard.up('KeyA');

  await page.locator('#driveLever').focus();await page.keyboard.down('ArrowUp');assert.equal((await read()).throttle,1);
  await page.keyboard.up('ArrowUp');assert.equal((await read()).throttle,0);
  await page.keyboard.down('ArrowDown');assert.equal((await read()).throttle,-1);await page.keyboard.up('ArrowDown');

  await page.locator('#reset').click();await stopped();await cdp.detach();
  return {splitSteering:true,verticalDriveLever:true,forwardReverse:true,brakeOverride:true,multiTouch:true,cancelAndBlur:true,layout:true};
}
