import './bench.js';
import {makeSignal} from './signals.js';
import {drawScope,drawCallMap} from './plot.js';

const playbackIcons = {
  play:'<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  pause:'<path d="M8 5v14m8-14v14" fill="none" stroke="currentColor" stroke-width="4"/>'
};
function instrument(panel) {
  const signal=makeSignal(panel.dataset.player);
  const mini=panel.hasAttribute('data-mini');
  const duration=signal.caller.length/signal.sampleRate;
  const get=q=>panel.querySelector(q);
  const play=get('[data-play]'), seek=get('[data-seek]'), canvas=get('[data-scope]');
  const selected={caller:true,answer:true};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let context, offsets=0, startedAt=0, active=false, starting=false, frame=0, stageIndex=-1;
  let buffers, nodes=[], gains={}, view='wave', lastDraw=-1, playEnd=duration;
  const now=()=>active?Math.min(duration,Math.max(0,context.currentTime-startedAt)):offsets;

  function paint(force=false) {
    const t=now();
    let index=0;
    for(let i=1;i<signal.stages.length;i++) if(signal.stages[i].time<=t+.000001) index=i;
    const changed=index!==stageIndex;
    if(changed || force) {
      const s=signal.stages[index];
      get('[data-current]').textContent=s.title;
      if(get('[data-detail]')) get('[data-detail]').textContent=s.text;
      panel.querySelectorAll('[data-stage]').forEach(b=>{
        const current=Number(b.dataset.stage)===index;
        b.parentElement.toggleAttribute('data-active',current);
        if(current) b.setAttribute('aria-current','step'); else b.removeAttribute('aria-current');
      });
      stageIndex=index;
    }
    const drawingTime=reduced.matches&&active?signal.stages[index].time:t;
    if(force||changed||(!reduced.matches && Math.abs(t-lastDraw)>.035)) {
      drawScope(canvas,signal,drawingTime,selected,view,mini);
      lastDraw=t;
    }
    if(!mini) get('[data-cursor]').style.left=Math.min(99.8,100*t/duration)+'%';
    seek.value=String(t);
    seek.setAttribute('aria-valuetext',t.toFixed(1)+' of '+duration.toFixed(1)+' seconds');
    get('[data-clock]').textContent=t.toFixed(1)+' / '+duration.toFixed(1)+' s';
  }

  function transportState() {
    panel.classList.toggle('playing',active);
    const label=active?'Pause signal':offsets>=duration?'Replay signal':'Play signal';
    play.querySelector('span').textContent=label;
    play.querySelector('svg').innerHTML=playbackIcons[active?'pause':'play'];
    play.setAttribute('aria-label',label);
  }
  function stopSources() {
    for(const n of nodes){try{n.stop();}catch{/* already ended */}n.disconnect();}
    for(const g of Object.values(gains)) g.disconnect();
    nodes=[]; gains={};
  }
  function halt(at=now()) {
    offsets=at; active=false;
    cancelAnimationFrame(frame); stopSources(); transportState(); paint(true);
  }
  function tick() {
    if(!active) return;
    if(now()>=playEnd) {
      halt(playEnd);
      get('[data-status]').textContent=playEnd===duration?'End of signal.':'Paused at the next stage. Press play to continue.';
      return;
    }
    paint();frame=requestAnimationFrame(tick);
  }
  function start(at) {
    stopSources(); cancelAnimationFrame(frame);
    offsets=at>=duration?0:at;
    playEnd=get('[data-step]')?.checked
      ? (signal.stages.find(s=>s.time>offsets+.00001)?.time ?? duration) : duration;
    const startTime=context.currentTime+.012;
    for(const key of ['caller','answer']) {
      const n=context.createBufferSource(), g=context.createGain();
      n.buffer=buffers[key];g.gain.value=selected[key] ? 0.63 : 0;
      n.connect(g);g.connect(context.destination);
      n.start(startTime,offsets,playEnd-offsets); nodes.push(n);gains[key]=g;
    }
    startedAt=startTime-offsets;active=true;transportState();paint(true);tick();
  }
  async function playFromGesture() {
    if(starting) return;
    if(active){halt();return;}
    starting=true;
    try {
      const AudioEngine=window.AudioContext||window.webkitAudioContext;
      if(!AudioEngine) throw new Error('Web Audio is unavailable');
      if(!context) context=new AudioEngine();
      await context.resume();
      if(!buffers){
        buffers={};
        for(const key of ['caller','answer']){
          const buf=context.createBuffer(1,signal[key].length,signal.sampleRate);
          buf.getChannelData(0).set(signal[key]);buffers[key]=buf;
        }
      }
      get('[data-status]').textContent='Playing signal.';
      start(offsets);
    } catch {
      get('[data-current]').textContent='Audio is unavailable in this browser.';
      get('[data-status]').textContent='Audio is unavailable. Read the listening transcript for the signal sequence.';
    } finally {starting=false;}
  }
  function jump(t) {
    t=Math.max(0,Math.min(duration,t));
    if(active && t<duration) start(t); else halt(t);
  }
  if(!mini) {
    const map=get('[data-map]');
    drawCallMap(map,signal,selected);
    get('[data-end]').textContent=duration.toFixed(1)+' s';
    map.addEventListener('click',e=>{
      const box=map.getBoundingClientRect();
      jump(duration*(e.clientX-box.left)/box.width);
    });
  }
  seek.max=String(duration);
  seek.addEventListener('input',()=>jump(Number(seek.value)));
  seek.addEventListener('keydown',e=>{
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
      e.preventDefault();jump(now()+(['ArrowLeft','ArrowDown'].includes(e.key)?-1:1)*(e.shiftKey?1:.1));
    }
  });
  get('[data-step]')?.addEventListener('change',()=>{if(active) start(now());});
  play.addEventListener('click',playFromGesture);
  get('[data-restart]').addEventListener('click',()=>jump(0));
  panel.querySelectorAll('[data-stage]').forEach(b=>b.addEventListener('click',()=>jump(signal.stages[Number(b.dataset.stage)].time)));
  panel.querySelectorAll('[data-track]').forEach(input=>input.addEventListener('change',()=>{
    const key=input.dataset.track;selected[key]=input.checked;
    if(!mini) drawCallMap(get('[data-map]'),signal,selected);
    if(gains[key]) gains[key].gain.setTargetAtTime(input.checked ? 0.63 : 0,context.currentTime,.003);
    paint(true);
  }));
  panel.querySelectorAll('[name=view]').forEach(input=>input.addEventListener('change',()=>{
    view=input.value;get('[data-axis]').textContent=view==='spectrum'?'FREQUENCY · 0, 1, 2, 3, 4 kHz FROM LEFT TO RIGHT':'TIME WINDOW · 24 ms';
    paint(true);
  }));
  window.addEventListener('resize',()=>paint(true));
  window.addEventListener('pagehide',()=>halt());
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)halt();});
  paint(true);
}
for(const panel of document.querySelectorAll('[data-player]')) instrument(panel);
