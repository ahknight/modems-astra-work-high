// Standalone, silent exercises. The stage players synthesize protocol signals;
// these diagrams freeze or simplify one decision so the visitor can inspect it.
const tau=2*Math.PI;
const ink='#334936', warm='#a65125', axis='#b6c0aa';
const scaleMu=u=>(132+8*(u%16))*2**Math.floor(u/16)-132;
function exercise(el) {
  const rate=Number(el.dataset.bench), select=el.querySelector('select'), canvas=el.querySelector('canvas'), result=el.querySelector('.bench-result');
  function paint() {
    const w=Math.max(180,canvas.clientWidth), h=canvas.clientHeight, d=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.scale(d,d);ctx.font='11px monospace';ctx.lineWidth=1.6;
    const choice=select.selectedIndex,value=select.value;
    const line=(x,y,u,v,color=axis)=>{ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(u,v);ctx.stroke();};
    const label=(str,x,y,color=ink)=>{ctx.fillStyle=color;ctx.fillText(str,x,y);};
    const dot=(x,y,r,color)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,tau);ctx.fill();};
    const graph=(fn,top,color,height=19)=>{ctx.strokeStyle=color;ctx.beginPath();for(let x=0;x<w;x++){const y=top-fn(x/(w-1))*height;if(x)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.stroke();};
    let message='';
    if(rate===300){
      const bits=[0,...Array.from({length:8},(_,i)=>(value.charCodeAt(0)>>i)&1),1];
      let phase=0;
      for(let k=0;k<10;k++){
        const x0=4+k*(w-8)/10, width=(w-8)/10, hz=bits[k]?1270:1070;
        line(x0,28,x0,h-18);label(String(bits[k]),x0+4,18);
        ctx.strokeStyle=k===0||k===9?warm:ink;ctx.beginPath();
        for(let j=0;j<=80;j++){
          const x=x0+j*width/80,y=h*.53-14*Math.sin(phase+tau*hz*j/24000);
          if(j)ctx.lineTo(x,y);else ctx.moveTo(x,y);
        }
        ctx.stroke();phase+=tau*hz/300;
      }
      label('start',3,h-3);label('8 data bits, least significant first',w*.14,h-3);label('stop',w-30,h-3);
      message='On the caller’s channel, “'+value+'” travels as '+bits.join(' ')+'. A low start bit opens the character. Eight data bits and a high stop bit follow. At 300 bit/s this frame takes about 33 ms.';
    } else if(rate===1200||rate===2400) {
      const cx=w*.5,cy=h*.5,step=(h-13)/7;
      const rotation=[1,0,2,3][parseInt(value.slice(0,2),2)],angle=rotation*Math.PI/2;
      line(cx,4,cx,h-4);line(4,cy,w-4,cy);label('Q',cx+4,12);label('I',w-12,cy-3);
      const sites=rate===1200?[[3,1]]:[[1,1],[3,1],[1,3],[3,3]];
      function position(pt,angle){return [cx+step*(pt[0]*Math.cos(angle)-pt[1]*Math.sin(angle)),cy-step*(pt[0]*Math.sin(angle)+pt[1]*Math.cos(angle))];}
      for(let q=0;q<4;q++)for(const pt of sites){const [x,y]=position(pt,q*Math.PI/2);dot(x,y,3,ink);}
      const point=rate===1200?sites[0]:sites[parseInt(value.slice(2),2)];
      const [x,y]=position(point,angle);line(cx,cy,x,y,warm);dot(x,y,6,warm);
      message='Starting in quadrant one, '+value.slice(0,2)+' selects '+['no turn','a quarter turn forward','a half turn','a quarter turn backward'][rotation]+'. '+(rate===1200?'The four possible turns carry two bits per symbol.':'The final pair '+value.slice(2)+' selects position ('+point.join(', ')+') within the rotated quadrant. Its distance from the center sets amplitude.');
    } else if(rate===9600){
      const factors=[0,.5,1,1.5],factor=factors[choice];
      const far=t=>.55*Math.sin(tau*(3*t+.18)),echo=t=>.69*Math.sin(tau*7*(t-.043));
      for(const [y,title,fn,c] of [[.22,'WANTED',far,ink],[.53,'ON THE WIRE',t=>far(t)+echo(t),warm],[.83,'AFTER SUBTRACTION',t=>far(t)+(1-factor)*echo(t),ink]]){
        line(0,h*y,w,h*y);graph(fn,h*y,c,10);label(title,3,h*y-11);
      }
      message='This teaching model uses two different pitches so you can recognize them. The estimate subtracts '+Math.round(factor*100)+'% of one delayed local echo. '+(factor===1?'The remaining wave now matches the wanted signal.':'The remaining ripple is the difference between the true echo and the estimate.')+' A real canceller estimates many delayed components.';
    } else if(rate===14400){
      const cx=w*.5,cy=h*.52,step=24;
      for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++)dot(cx+i*step,cy+j*step,3,ink);
      const displacement=[0,.23,.68][choice];
      const x=cx+step*displacement,y=cy-step*displacement*.24;
      line(cx+step*.5,4,cx+step*.5,h-4);line(cx,cy,x,y,warm);dot(x,y,6,warm);
      label('decision boundary',cx+step*.5+5,15);
      message='The highlighted point is a received symbol in a magnified, schematic patch of a constellation. '+(choice===2?'It has crossed the boundary. The closest individual point now gives the wrong answer.':'Its nearest point is still the one the transmitter selected.')+' A trellis receiver compares allowed sequences over time. This single-symbol model omits the sequence decoder.';
    } else if(rate===28800){
      // One period at 24 kHz, generated from the signed V.34 probe harmonics.
      const bins=[1,-2,3,4,5,7,9,10,-11,13,14,-15,17,-18,19,-20,-21,-22,-23,24,25];
      const cycle=Array.from({length:160},(_,i)=>{
        const a=bins.reduce((sum,k)=>sum+Math.sign(k)*Math.cos(tau*Math.abs(k)*i/160)*(choice===1?1/(1+(Math.abs(k)/12)**3):1),0);
        return choice===2?Math.max(-2,Math.min(2,a)):a;
      });
      for(let k=1;k<=25;k++){
        let re=0,im=0;for(let i=0;i<160;i++){re+=cycle[i]*Math.cos(tau*k*i/160);im+=cycle[i]*Math.sin(tau*k*i/160);}
        const amp=Math.hypot(re,im)/80, x=(k-.5)*w/25;
        const hole=!bins.some(v=>Math.abs(v)===k);
        if(hole){ctx.fillStyle='#d8d9bf';ctx.fillRect(x-w/50,3,w/25,h-18);}
        line(x,h-15,x,h-15-Math.min(1.1,amp)*(h-24)/1.1,hole?warm:ink);
      }
      label('150 Hz',2,h-1);label('3,750 Hz',w-58,h-1);
      message=['The 21 transmitted tones are equally strong. The four shaded slots at 900, 1,200, 1,800 and 2,400 Hz stay empty.','This illustrative filter weakens the high notes. The empty slots stay empty because a linear filter does not generate new pitches.','This illustrative amplifier clips the peaks. New components appear in the shaded slots, giving the receiver evidence of distortion.'][choice];
    } else if(rate===33600){
      const values=[[33600,33600,33600],[33600,28800,33600],[33600,33600,26400]][choice];
      const accepted=Math.min(...values);
      for(const [i,v] of [...values,accepted].entries()){
        const y=18+i*25;label(['Local','Peer','Line','Result'][i],2,y);
        ctx.fillStyle=i===3?warm:ink;ctx.fillRect(56,y-10,(w-125)*v/33600,9);label(v.toLocaleString('en-US'),w-61,y);
      }
      message='The simplified rate decision accepts '+accepted.toLocaleString('en-US')+' bit/s in this direction. Both capability sets must include that rate and the measured line must support it. This example assumes all lower rates are available. The standard signals individual capabilities and direction-specific maxima.';
    } else if(rate===56000){
      const u=16*(choice+1),current=scaleMu(u),next=scaleMu(u+1);
      for(let i=0;i<8;i++){const val=scaleMu(u+i),x=i*w/8;ctx.fillStyle=i===0?warm:ink;ctx.fillRect(x+2,h-17-(h-30)*val/scaleMu(103),w/8-4,(h-30)*val/scaleMu(103));label(String(u+i),x+3,h-3);}
      message='On the positive μ-law scale in V.90 Table 1, Ucode '+u+' reconstructs to '+current.toLocaleString('en-US')+' linear units and the next code to '+next.toLocaleString('en-US')+'. Their separation is '+(next-current)+' units. Compare low and high groups. The telephone decoder’s voltage steps grow farther apart.';
    }
    result.textContent=message;
  }
  select.addEventListener('change',paint);window.addEventListener('resize',paint);paint();
}
for(const el of document.querySelectorAll('[data-bench]')) exercise(el);
