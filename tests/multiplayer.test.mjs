import test from 'node:test';
import assert from 'node:assert/strict';
import {newRoomCode,cleanRoomCode,carState,PUBLIC_ROOMS,RoomClient} from '../src/multiplayer.js';
test('room codes are short, readable and normalised',()=>{
  for(let i=0;i<50;i++)assert.match(newRoomCode(),/^[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(cleanRoomCode(' ab-c d1 '),'ABCD1');assert.equal(cleanRoomCode('x'.repeat(20)).length,8);
});
test('car state message is compact and finite',()=>{
  const car={speed:3.14159,steer:.123456,body:{position:{x:1.23456,y:.5,z:-2},quaternion:{x:0,y:.70710678,z:0,w:.70710678},velocity:{x:0,y:0,z:3.33333}}};
  const m=carState(car,false);
  assert.deepEqual(m,{t:'state',p:[1.235,.5,-2],q:[0,.7071,0,.7071],v:[0,0,3.333],s:3.142,st:.123,f:false});
  assert.ok(JSON.stringify(m).length<200);
});
test('public rooms are valid relay room codes in order',()=>{
  assert.equal(PUBLIC_ROOMS[0],'JOOD1');for(const r of PUBLIC_ROOMS)assert.match(r,/^[A-Z0-9]{4,8}$/);
});
test('chat lines are trimmed, capped and rate-limited like the relay',()=>{
  const sent=[];const c=new RoomClient({server:'',rooms:['JOOD1'],name:'x',car:'van'});
  Object.defineProperty(c,'connected',{get:()=>true});c.send=m=>sent.push(m);
  assert.equal(c.chat('  hello   there  '),'hello there');assert.equal(c.chat('again'),'','second line within 1.2 s is held back');
  c.lastChat=0;assert.equal(c.chat('x'.repeat(200)).length,80);assert.equal(c.chat('   '),'');
  assert.deepEqual(sent.map(m=>m.t),['chat','chat']);
});
