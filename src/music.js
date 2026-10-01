// Soft romantic background music, synthesised live with Web Audio (no audio
// files): a music-box melody over arpeggios, warm string pads and a gentle
// bass in F major, with a generated reverb. Starts only from a user gesture.

const BPM=72,BEAT=60/BPM,BAR=4*BEAT,VOLUME=.85;
const mtof=m=>440*2**((m-69)/12);
// Eight-bar loop: Fmaj7 | Am7 | Bbmaj7 | C | Dm7 | Am7 | Gm7 | Csus4→C
const CHORDS=[[53,57,60,64],[57,60,64,67],[58,62,65,69],[48,55,60,64],[50,57,60,65],[57,60,64,67],[55,58,62,65],[48,53,55,60]];
const BASS=[41,45,46,36,38,45,43,36];
// Melody: [bar, beat, midi, beats]
const MELODY=[
  [0,0,69,1.5],[0,1.5,72,.5],[0,2,76,1],[0,3,74,1],
  [1,0,72,3],[1,3,69,1],
  [2,0,74,1.5],[2,1.5,72,.5],[2,2,70,1],[2,3,69,1],
  [3,0,67,3],
  [4,0,77,1.5],[4,1.5,76,.5],[4,2,74,1],[4,3,72,1],
  [5,0,76,2],[5,2,72,1],[5,3,69,1],
  [6,0,70,1.5],[6,1.5,69,.5],[6,2,67,1],[6,3,70,1],
  [7,0,69,3],
];

export const MUSIC_VOLUME=VOLUME;
export class RomanticMusic {
  constructor(){this.ctx=null;this.playing=false;this.bar=0;this.next=0;this.timer=0;}
  get enabled(){try{return localStorage.getItem('jood-music')!=='off';}catch{return true;}}
  set enabled(v){try{v?localStorage.removeItem('jood-music'):localStorage.setItem('jood-music','off');}catch{}}
  setup() {
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;
    // iOS: play even with the ring/silent switch on (Safari 16.4+).
    try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch{}
    const ctx=this.ctx=new AC();
    this.master=ctx.createGain();this.master.gain.value=0;
    const comp=ctx.createDynamicsCompressor();comp.threshold.value=-18;comp.ratio.value=3;
    this.master.connect(comp).connect(ctx.destination);
    // Generated hall reverb: two seconds of decaying stereo noise.
    const len=ctx.sampleRate*2.6,ir=ctx.createBuffer(2,len,ctx.sampleRate);
    for(let c=0;c<2;c++){const d=ir.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3.2);}
    this.reverb=ctx.createConvolver();this.reverb.buffer=ir;
    const wet=ctx.createGain();wet.gain.value=.42;this.reverb.connect(wet).connect(this.master);
    this.dry=ctx.createGain();this.dry.gain.value=.8;this.dry.connect(this.master);this.dry.connect(this.reverb);
    document.addEventListener('visibilitychange',()=>{if(!this.ctx)return;document.hidden?this.ctx.suspend():this.wake();});
    // iOS Safari suspends/interrupts page audio when the camera starts (AR) or
    // after a call; it may only resume inside a user gesture, so retry on every touch.
    for(const ev of ['touchend','click','pointerup','keydown'])document.addEventListener(ev,()=>this.wake(),true);
    ctx.addEventListener?.('statechange',()=>{if(this.playing&&!document.hidden&&ctx.state!=='running')ctx.resume().catch(()=>{});});
    return true;
  }
  // Resume after an interruption (camera start, phone call, background tab).
  wake(){if(this.playing&&this.ctx&&!document.hidden&&this.ctx.state!=='running'){this.ctx.resume().catch(()=>{});this.unlock();}}
  // A one-sample silent buffer played inside a gesture unlocks audio on iOS.
  unlock(){try{const b=this.ctx.createBuffer(1,1,this.ctx.sampleRate),s=this.ctx.createBufferSource();s.buffer=b;s.connect(this.ctx.destination);s.start(0);}catch{}}
  get running(){return !!this.ctx&&this.playing&&this.ctx.state==='running';}
  // Call from a tap/click handler (browsers only start audio after a gesture).
  start() {
    if(this.playing){this.wake();return;}if(!this.ctx&&!this.setup())return;
    this.unlock();this.ctx.resume().catch(()=>{});this.playing=true;
    const t=this.ctx.currentTime;this.master.gain.cancelScheduledValues(t);this.master.gain.setValueAtTime(this.master.gain.value,t);this.master.gain.linearRampToValueAtTime(VOLUME,t+2.5);
    this.next=t+.1;this.bar=0;this.cycle=0;clearInterval(this.timer);this.timer=setInterval(()=>this.schedule(),100);this.schedule();
  }
  stop() {
    if(!this.playing)return;this.playing=false;clearInterval(this.timer);
    const t=this.ctx.currentTime;this.master.gain.cancelScheduledValues(t);this.master.gain.setValueAtTime(this.master.gain.value,t);this.master.gain.linearRampToValueAtTime(0,t+.8);
  }
  toggle(){if(this.playing){this.stop();this.enabled=false;}else{this.enabled=true;this.start();}return this.playing;}
  schedule() {
    while(this.next<this.ctx.currentTime+.6){this.playBar(this.bar,this.next);this.next+=BAR;this.bar=(this.bar+1)%8;if(this.bar===0)this.cycle++;}
  }
  playBar(bar,t) {
    const chord=CHORDS[bar];
    for(const m of chord)this.pad(mtof(m),t,BAR*1.05);
    this.bass(mtof(BASS[bar]),t,BEAT*1.8);this.bass(mtof(BASS[bar]+(bar===3||bar===7?7:12)),t+2*BEAT,BEAT*1.6,.6);
    // Rising and falling eighth-note arpeggio, an octave up, softly.
    const up=[...chord,...chord.slice(1).map(m=>m+12)];
    for(let i=0;i<8;i++)this.bell(mtof(up[i<5?i:8-i]+12),t+i*BEAT/2,.045+(i%2?0:.015),1.4);
    // Melody every other loop, so the music breathes.
    if(this.cycle%2===0)for(const [b,beat,m,len] of MELODY)if(b===bar)this.bell(mtof(m+12),t+beat*BEAT,.13,Math.max(1.6,len*BEAT*1.3),true);
  }
  bell(f,t,vol,dur,lead=false) {
    const ctx=this.ctx,g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.008);g.gain.exponentialRampToValueAtTime(.0005,t+dur);
    g.connect(this.dry);
    // Music-box timbre: sine fundamental plus a quiet inharmonic partial.
    for(const [ratio,amp,type] of [[1,1,'sine'],[2.76,lead?.18:.12,'sine'],[2,lead?.25:.15,'triangle']]){
      const o=ctx.createOscillator(),a=ctx.createGain();o.type=type;o.frequency.value=f*ratio;a.gain.value=amp;
      o.connect(a).connect(g);o.start(t);o.stop(t+dur+.05);
    }
  }
  pad(f,t,dur) {
    const ctx=this.ctx,g=ctx.createGain(),lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=950;lp.Q.value=.4;
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.022,t+dur*.35);g.gain.linearRampToValueAtTime(0,t+dur);
    lp.connect(g).connect(this.dry);
    for(const det of [-7,6]){const o=ctx.createOscillator();o.type='sawtooth';o.frequency.value=f;o.detune.value=det;o.connect(lp);o.start(t);o.stop(t+dur+.05);}
  }
  bass(f,t,dur,vol=1) {
    const ctx=this.ctx,o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=f;
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.09*vol,t+.04);g.gain.exponentialRampToValueAtTime(.001,t+dur);
    o.connect(g).connect(this.dry);o.start(t);o.stop(t+dur+.05);
  }
}
