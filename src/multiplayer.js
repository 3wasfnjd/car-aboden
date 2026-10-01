// Room connection for the Jood multiplayer relay (tools/jood-multiplayer).
// Each phone sends its car pose ~12 times a second; poses are relative to the
// player's own placed stage, so every player sees all cars on their own floor.

const CODE_CHARS='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newRoomCode=()=>Array.from({length:4},()=>CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]).join('');
export const cleanRoomCode=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);

// Server URL: ?server= in the page URL, else multiplayer.json next to the site root.
export async function multiplayerServer(base='../') {
  const q=new URLSearchParams(location.search).get('server');if(q)return q.replace(/\/$/,'');
  try{const r=await fetch(new URL(base+'multiplayer.json',location.href),{cache:'no-cache'});if(r.ok){const j=await r.json();return (j.server||'').replace(/\/$/,'');}}catch{}
  return '';
}

const round=(a,k=1000)=>a.map(v=>Math.round(v*k)/k);
export function carState(car,flowersOn=true) {
  const b=car.body;
  return {t:'state',p:round([b.position.x,b.position.y,b.position.z]),q:round([b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w],10000),
    v:round([b.velocity.x,b.velocity.y,b.velocity.z]),s:Math.round(car.speed*1000)/1000,st:Math.round((car.steer||0)*1000)/1000,f:!!flowersOn};
}

export class RoomClient {
  constructor({server,room,name,car,on={}}) {
    Object.assign(this,{server,room,name,car,on});this.ws=null;this.closed=false;this.retry=0;this.id=null;this.slot=0;this.peers=new Map();
  }
  get connected(){return this.ws?.readyState===1;}
  connect() {
    const url=this.server.replace(/^http/,'ws')+'/room/'+this.room+'?name='+encodeURIComponent(this.name)+'&car='+this.car;
    const ws=new WebSocket(url);this.ws=ws;this.on.status?.('connecting');
    ws.onopen=()=>{this.retry=0;this.on.status?.('open');};
    ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}
      if(m.t==='welcome'){this.id=m.id;this.slot=m.slot;this.peers.clear();for(const p of m.peers)this.peers.set(p.id,p);this.on.welcome?.(m);}
      else if(m.t==='join'){this.peers.set(m.id,m);this.on.join?.(m);}
      else if(m.t==='leave'){this.peers.delete(m.id);this.on.leave?.(m);}
      else if(m.t==='state'){const p=this.peers.get(m.id);if(p)p.state=m;this.on.state?.(m);}
    };
    ws.onclose=e=>{
      for(const id of [...this.peers.keys()])this.on.leave?.({id});this.peers.clear();
      if(this.closed)return;
      if(e.code===1006&&this.retry===0)this.on.status?.('lost');
      // Back off and rejoin (a full room or a dropped network both land here).
      const wait=Math.min(8000,700*2**this.retry++);this.on.status?.('retry');this.timer=setTimeout(()=>this.connect(),wait);
    };
    ws.onerror=()=>{};
  }
  send(msg){if(this.connected)this.ws.send(JSON.stringify(msg));}
  close(){this.closed=true;clearTimeout(this.timer);for(const id of [...this.peers.keys()])this.on.leave?.({id});this.peers.clear();try{this.ws?.close(1000);}catch{}}
}
