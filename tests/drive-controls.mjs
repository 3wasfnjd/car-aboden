import assert from 'node:assert/strict';

// Native touch events on the actual game, not a replacement physics/controller.
export async function checkDriveControls(page,context){
  assert.equal(await page.locator('#direction').count(),0,'No separate gear button');
  const boxes={},viewport=page.viewportSize();
  for(const id of ['steering','accelerator','brake','precision','reset','camera']){
    const b=await page.locator('#'+id).boundingBox();assert.ok(b);boxes[id]=b;
    assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=viewport.width+1&&b.y+b.height<=viewport.height+1,id+' inside viewport');
  }
  for(const [n,a] of Object.entries(boxes))for(const [m,b] of Object.entries(boxes)){
    if(n>=m)continue;
    assert.ok(!(Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)+1&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y)+1),n+' overlaps '+m);
  }
  const a=boxes.steering,b=boxes.accelerator,c=boxes.brake;
  assert.ok(a.x+a.width<c.x&&c.x<b.x);
  const center=b.y+b.height/2,travel=await page.evaluate(()=>window.__motri.input.leverTravel());
  const steer={id:1,x:a.x+a.width/2,y:a.y+a.height/2};
  const gas={id:2,x:b.x+b.width/2,y:center};
  const brake={id:3,x:c.x+c.width/2,y:c.y+c.height/2};
  const cdp=await context.newCDPSession(page);
  const touch=async(type,touchPoints)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints});await page.evaluate(()=>new Promise(requestAnimationFrame));};
  const read=()=>page.evaluate(()=>window.__motri.input.read());
  const stopped=async()=>{
    try{await page.waitForFunction(()=>window.__motri.car.contacts===4&&window.__motri.car.body.velocity.length()<.05,{},{timeout:15000});}
    catch(e){console.log('STOP_STATE',await page.evaluate(()=>({input:window.__motri.input.read(),v:window.__motri.car.body.velocity.toArray(),p:window.__motri.car.body.position.toArray()})));throw e;}
  };
  await touch('touchStart',[steer]);steer.x+=a.width*.25;await touch('touchMove',[steer]);assert.equal((await read()).throttle,0);
  await touch('touchStart',[steer,gas]);assert.equal((await read()).throttle,0,'Touch alone starts neutral');
  gas.y=center-travel*.05;await touch('touchMove',[steer,gas]);assert.equal((await read()).throttle,0,'Neutral dead zone');
  gas.y=center-travel*.35;await touch('touchMove',[steer,gas]);let r=await read();assert.ok(r.throttle>.15&&r.throttle<.5&&r.steer>.5);
  gas.y=center-travel;await touch('touchMove',[steer,gas]);assert.ok((await read()).throttle>.98);
  gas.y=center+travel;await touch('touchMove',[steer,gas]);r=await read();assert.ok(r.throttle<-.98&&r.steer>.5);assert.equal(await page.locator('#accelerator').getAttribute('data-drive'),'R');
  await touch('touchStart',[steer,gas,brake]);r=await read();assert.ok(r.brake&&r.steer>.5);assert.equal(r.throttle,0);
  await touch('touchEnd',[brake]);assert.ok((await read()).throttle<-.98);
  await touch('touchEnd',[steer]);r=await read();assert.equal(r.steer,0);assert.ok(r.throttle<-.98);
  gas.y=center;await touch('touchMove',[gas]);assert.equal((await read()).throttle,0);
  await touch('touchCancel',[]);assert.equal(await page.locator('#accelerator').getAttribute('data-drive'),'N');
  await page.locator('#reset').click();await stopped();

  // Same held finger: drive forward, cross the centre, brake and reverse.
  const start=await page.evaluate(()=>window.__motri.car.body.position.z);
  gas.y=center;await touch('touchStart',[gas]);gas.y=center-travel;await touch('touchMove',[gas]);
  await page.waitForFunction(z=>window.__motri.car.body.position.z>z+.5,start,{timeout:15000});
  gas.y=center+travel;await touch('touchMove',[gas]);
  await page.waitForFunction(()=>window.__motri.car.speed< -1,{},{timeout:15000});
  await touch('touchStart',[gas,brake]);await stopped();r=await read();assert.ok(r.brake);assert.equal(r.throttle,0);
  const rest=await page.evaluate(()=>window.__motri.car.body.position.toArray());await page.waitForTimeout(600);
  assert.ok(await page.evaluate(p=>window.__motri.car.body.position.distanceTo({x:p[0],y:p[1],z:p[2]})<.025,rest),'Held brake must not creep');
  await touch('touchEnd',[]);assert.equal((await read()).throttle,0);
  assert.equal(await page.locator('#accelerator').getAttribute('data-drive'),'N');

  gas.y=center;await touch('touchStart',[gas]);gas.y=center-travel;await touch('touchMove',[gas]);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal((await read()).throttle,0);await touch('touchEnd',[]);
  await page.locator('#start').click();await page.locator('#help').click();await page.keyboard.down('KeyW');assert.equal((await read()).throttle,0);
  await page.keyboard.up('KeyW');await page.locator('#closeSettings').click();
  await page.locator('#accelerator').focus();await page.keyboard.down('ArrowUp');assert.equal((await read()).throttle,1);await page.keyboard.up('ArrowUp');
  await page.keyboard.down('ArrowDown');assert.equal((await read()).throttle,-1);await page.keyboard.down('Space');assert.equal((await read()).throttle,0);assert.ok((await read()).brake);
  await page.keyboard.up('Space');await page.keyboard.up('ArrowDown');await page.locator('#reset').click();await stopped();await cdp.detach();
  return {signedLever:true,threeTouch:true,neutralRelease:true,realForwardReverse:true,brakeHold:true,layout:true};
}
