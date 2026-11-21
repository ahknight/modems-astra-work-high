// The Hann window reduces leakage from the edges of this short observation.
// The display shows relative amplitude against frequency, with a fixed scale.
function spectrum(data, start, size = 1024) {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    re[i] = (data[start+i] || 0) * (.5 - .5*Math.cos(2*Math.PI*i/(size-1)));
  }
  for (let i=1,j=0; i<size; i++) {
    let bit=size>>1;
    while (j&bit) { j^=bit; bit>>=1; }
    j^=bit;
    if(i<j) [re[i],re[j]]=[re[j],re[i]];
  }
  for(let length=2; length<=size; length*=2) {
    const half=length/2;
    for(let k=0; k<half; k++) {
      const angle=-2*Math.PI*k/length, c=Math.cos(angle), s=Math.sin(angle);
      for(let i=k; i<size; i+=length) {
        const j=i+half, a=re[j]*c-im[j]*s, b=re[j]*s+im[j]*c;
        re[j]=re[i]-a; im[j]=im[i]-b; re[i]+=a; im[i]+=b;
      }
    }
  }
  return re.slice(0,size/2).map((v,i)=>Math.hypot(v,im[i])*4/size);
}

export function drawScope(canvas, signal, time, selected, mode, mini) {
  const ctx=canvas.getContext('2d');
  if(!ctx) return;
  const {width:w,height:h}=canvas.getBoundingClientRect();
  if(!w || !h) return;
  const scale=Math.min(window.devicePixelRatio || 1,2);
  if(canvas.width!==Math.round(w*scale) || canvas.height!==Math.round(h*scale)) {
    canvas.width=Math.round(w*scale); canvas.height=Math.round(h*scale);
  }
  ctx.setTransform(scale,0,0,scale,0,0);
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle='#3b4539'; ctx.lineWidth=.65;
  ctx.beginPath();
  for(let i=0;i<=16;i++){const x=i*w/16;ctx.moveTo(x,0);ctx.lineTo(x,h);}
  for(let i=0;i<=4;i++){const y=i*h/4;ctx.moveTo(0,y);ctx.lineTo(w,y);}
  ctx.stroke();
  const freq=mode==='spectrum';
  const windowSize=freq ? 1024 : Math.round(signal.sampleRate*(mini ? .012 : .024));
  const start=Math.max(0,Math.min(signal.answer.length-windowSize,Math.floor(time*signal.sampleRate)));
  for(const track of ['answer','caller']) {
    if(!selected[track]) continue;
    const samples=signal[track].subarray(start,start+windowSize);
    if(!samples.some(x=>x!==0)) continue;
    ctx.lineWidth=mini?1.15:1.45;
    ctx.strokeStyle=mini?'#f6aa69':(track==='caller'?'#ffad69':'#a8d8bf');
    ctx.beginPath();
    if(freq) {
      const bins=spectrum(signal[track],start);
      const last=Math.min(bins.length-1,Math.floor(4000*1024/signal.sampleRate));
      for(let k=0;k<=last;k++){
        const db=20*Math.log10(Math.max(1e-5,bins[k]));
        const x=w*(k*signal.sampleRate/1024)/4000, y=h-4-(h-10)*Math.max(0,Math.min(1,(db+66)/66));
        if(k===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
    } else {
      for(let i=0;i<samples.length;i++){
        const x=w*i/(samples.length-1), y=h*.5-samples[i]*h*(mini?1.65:1.06);
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
    }
    ctx.stroke();
  }
}

// Each x column is a windowed spectrum at one position in the actual call.
// A pixel records the stronger bin in its row. Color mixes the sender energies.
export function drawCallMap(canvas, signal, selected) {
  const ctx=canvas.getContext('2d');
  if(!ctx) return;
  const w=440,h=96,n=256, total=signal.answer.length;
  canvas.width=w;canvas.height=h;
  const pixels=ctx.createImageData(w,h);
  for(let x=0;x<w;x++) {
    const start=Math.floor(x*(total-n)/(w-1));
    const a=selected.answer?spectrum(signal.answer,start,n):null;
    const c=selected.caller?spectrum(signal.caller,start,n):null;
    for(let y=0;y<h;y++) {
      const low=Math.min(n/2-1,Math.floor(4000*(h-y-1)/h*n/signal.sampleRate));
      const high=Math.min(n/2-1,Math.max(low,Math.floor(4000*(h-y)/h*n/signal.sampleRate)));
      let answer=0,caller=0;
      for(let k=low;k<=high;k++){answer=Math.max(answer,a?.[k]||0);caller=Math.max(caller,c?.[k]||0);}
      const brightness=v=>Math.min(1,Math.max(0,(20*Math.log10(Math.max(v,1e-6))+58)/46));
      const ca=brightness(caller),an=brightness(answer),i=4*(y*w+x);
      pixels.data[i]=18+Math.min(230,ca*232+an*127);
      pixels.data[i+1]=23+Math.min(220,ca*141+an*185);
      pixels.data[i+2]=19+Math.min(210,ca*68+an*155);
      pixels.data[i+3]=255;
    }
  }
  ctx.putImageData(pixels,0,0);
}
