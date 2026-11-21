// Original signal synthesis. Detailed provenance is returned with each example.
// Every time is measured in seconds on the same clock as the two PCM stems.
const SR = 24000;
const TAU = 2 * Math.PI;
const quarter = Math.PI / 2;
const unit = 0.13;
const rec = (id, label) => ({
  label, url: 'https://www.itu.int/rec/dologin_pub.asp?id=T-REC-' + id + '%21%21PDF-E&lang=e&type=items'
});
const v8 = rec('V.8-199409-S', 'V.8 (1994), Tables 1–4 and call procedures');
const v25 = rec('V.25-199610-I', 'V.25, answer tone and echo control');

function session() {
  return {sampleRate: SR, caller: new Float32Array(12 * SR), answer: new Float32Array(12 * SR), stages: []};
}
function mark(s, time, title, text) { s.stages.push({time, title, text}); }
function finish(s, end) {
  const length = Math.round(end * SR);
  let peak = 0;
  for (let n = 0; n < length; n++) peak = Math.max(peak, Math.abs(s.caller[n]), Math.abs(s.answer[n]));
  for (const side of ['caller','answer']) {
    const samples = s[side].slice(0,length);
    for (let n = 0; n < length; n++) {
      const gate = Math.min(1, n / 48, (length - n - 1) / 48);
      samples[n] *= Math.min(1, 0.43 / peak) * gate;
    }
    s[side] = samples;
  }
  return s;
}
function render(stem, start, duration, sample) {
  const at = Math.round(start * SR);
  const length = Math.round((start + duration) * SR) - at;
  for (let n = 0; n < length; n++) stem[at+n] += sample(n / SR, n);
}
function tone(stem,start,end,hz,amplitude=unit,reverse=[]) {
  render(stem,start,end-start,(t) => {
    let sign = 1;
    for (const event of reverse) if (t >= event - start) sign = -sign;
    return amplitude * sign * Math.sin(TAU * hz * (start + t));
  });
}
function answerTone(stem,duration,am) {
  render(stem,0,duration,t => {
    const reversal = Math.floor(t / 0.45) % 2 ? -1 : 1;
    return unit * reversal * (am ? 1 + 0.2 * Math.sin(TAU * 15 * t) : 1) * Math.sin(TAU * 2100 * t);
  });
}

// A short root-raised-cosine transmitter filter. The protocol bits/symbol
// counts are exact; this specific, finite pulse shape is our implementation.
const tables = new Map();
function pulseTable(beta) {
  if (tables.has(beta)) return tables.get(beta);
  const bank = Array.from({length: 120}, (_, phase) =>
    Array.from({length: 13}, (_, tap) => {
      const x = phase/120 + 6 - tap;
      if (Math.abs(x) < 1e-10) return 1+beta*(4/Math.PI-1);
      if (Math.abs(Math.abs(4*beta*x)-1) < 1e-9) {
        return beta / Math.SQRT2 * ((1+2/Math.PI)*Math.sin(Math.PI/(4*beta)) +
          (1-2/Math.PI)*Math.cos(Math.PI/(4*beta)));
      }
      return (Math.sin(Math.PI*x*(1-beta)) + 4*beta*x*Math.cos(Math.PI*x*(1+beta))) /
        (Math.PI*x*(1-16*beta*beta*x*x));
    }));
  tables.set(beta,bank);
  return bank;
}
function modulate(stem,start,angles,baud,carrier,level=unit,beta=0.2,magnitudes=null) {
  const bank = pulseTable(beta);
  const real = Float32Array.from(angles, Math.cos);
  const imaginary = Float32Array.from(angles, Math.sin);
  if (magnitudes) {
    for (let k = 0; k < magnitudes.length; k++) {
      real[k] *= magnitudes[k];
      imaginary[k] *= magnitudes[k];
    }
  }
  render(stem,start,angles.length/baud,(t,n) => {
    const position = n * baud / SR;
    const phase = Math.round(position * 120);
    const base = Math.floor(phase/120);
    const weights = bank[phase % 120];
    let i = 0, q = 0;
    for (let k = Math.max(0,6-base); k < Math.min(13,angles.length-base+6); k++) {
      const idx = base + k - 6;
      i += weights[k] * real[idx]; q += weights[k] * imaginary[idx];
    }
    const omega = TAU * carrier * (start+t);
    return level * (i * Math.cos(omega) - q * Math.sin(omega));
  });
  return start + angles.length / baud;
}
function scrambler(side) {
  let state = 0;
  const tap = side === 'caller' ? 17 : 4;
  return bit => {
    const output = bit ^ ((state >>> tap) & 1) ^ ((state >>> 22) & 1);
    state = ((state << 1) | output) & 0x7fffff;
    return output;
  };
}
const alternating = (count,a,b) => Array.from({length:count},(_,i) => i%2 ? b : a);

// V.32 (1988) §2.4.1.1, Tables 1 and 3. In reference quadrant 00,
// the last two bits select one of four points. The first two bits control
// relative quadrant movement using the same rule as the rate words.
function v32UncodedSymbols(scramble,quadrant,b1Count,payloadCount,message) {
  const angles = [], magnitudes = [];
  const trainingAngle = Math.atan2(-1,-3);
  const steps = [1,0,2,3];
  let bitNumber = 0;
  function nextDataBit() {
    const octet = message.charCodeAt(Math.floor(bitNumber/8) % message.length);
    const bit = (octet >>> (bitNumber % 8)) & 1;
    bitNumber++;
    return bit;
  }
  for (let symbol = 0; symbol < b1Count+payloadCount; symbol++) {
    const bits = Array.from({length:4}, () => scramble(symbol < b1Count ? 1 : nextDataBit()));
    quadrant = (quadrant + steps[2*bits[0]+bits[1]]) % 4;
    const re = -1-2*bits[3], im = -1-2*bits[2];
    angles.push(Math.atan2(im,re) + quadrant*quarter - trainingAngle);
    magnitudes.push(Math.hypot(re,im)/Math.sqrt(10));
  }
  return {angles,magnitudes};
}

function v32Burst(s,side,start,sCount,trnCount,words,data) {
  const scramble = scrambler(side);
  const symbols = alternating(sCount,0,quarter).concat(alternating(16,2*quarter,3*quarter));
  let quadrant = 0;
  for (let i = 0; i < trnCount; i++) {
    const first = scramble(1), second = scramble(1);
    quadrant = i < 256 ? 2*first : [0,1,3,2][2*first + second];
    symbols.push(quarter * quadrant);
  }
  for (const bits of words) {
    for (let i = 0; i < 16; i += 2) {
      const pair = 2*scramble(+bits[i]) + scramble(+bits[i+1]);
      quadrant = (quadrant + [1,0,2,3][pair]) % 4;
      symbols.push(quarter * quadrant);
    }
  }
  let magnitudes;
  if (data) {
    const block = v32UncodedSymbols(scramble,quadrant,data.b1Count,data.payloadCount,data.message);
    magnitudes = Array(symbols.length).fill(1).concat(block.magnitudes);
    symbols.push(...block.angles);
  }
  return modulate(s[side], start, symbols, 2400, 1800, unit, 0.2, magnitudes);
}
function v32(rate) {
  const bis = rate === 14400, s = session(), T = 1 / 2400;
  const transit = 24*T; // selected 10 ms one-way propagation
  const ac = 1.275, ca = ac + 160*T, cc = ca + transit + 64*T;
  const acAgain = cc + transit + 64*T, callerOff = acAgain + transit;
  const acOff = callerOff + transit, training = acOff + 16*T;
  answerTone(s.answer,1.2,false);
  tone(s.caller,1.02,callerOff,1800,unit,[cc]);
  for (const hz of [600,3000]) tone(s.answer,ac,acOff,hz,unit/Math.SQRT2,[ca,acAgain]);

  mark(s,0,'Answer tone','The answering modem sends 2,100 Hz with half-turn phase reversals, a request to disable network echo cancellation.');
  mark(s,1.02,'Caller on the line','The caller adds a steady 1,800 Hz. Its tone will overlap the answering modem’s signals.');
  mark(s,ac,'Time the round trip','The answerer sends 600 and 3,000 Hz together. The ends take turns reversing phase, timing the replies to estimate delay.');
  mark(s,training,'Train the receiver','A regular S pattern and its brief reversal set the timing. The signal then opens into a reproducible stream of scrambled ones for echo and equalizer training.');

  const trn = bis ? 3840 : 3200;
  const r1 = training + (256+16+trn)*T;
  // R1 advertises 4800, 9600 & trellis (V.32), or the five bis rates.
  const offer = bis ? '0000111111111001' : '0000011110010001';
  const candidate = bis ? offer : '0000011100010001'; // caller declines trellis
  const selected = bis ? '0000100110011001' : '0000001100010001';
  const eWord = '1111' + selected.slice(4);
  v32Burst(s,'answer',training,256,trn,Array(8).fill(offer));
  mark(s,r1,'Advertise the rates',bis ?
    'The answering modem repeats a 16-bit rate word offering all five V.32bis speeds, including 14,400.' :
    'The answering modem repeats a 16-bit R1 word offering 4,800 and 9,600 bit/s and trellis coding.');
  const callerTraining = r1 + 5*8*T; // two received words plus propagation
  const measuredDelay = 64 + 2*24;
  const callerTrn = 3072, answerFinalTrn = 2048;
  const r2 = callerTraining + (measuredDelay+256+16+callerTrn)*T;
  const finalTraining = r2 + 40*T;
  const r3 = finalTraining + (256+16+answerFinalTrn)*T;
  const eachR2 = Math.ceil(((r3-r2)/T + 40)/8);
  const callerB1 = r2 + (eachR2+1)*8*T;
  const eachR3 = Math.ceil(((callerB1+transit-r3)/T)/8);
  const answerB1 = r3 + (eachR3+1)*8*T;
  const answerData = answerB1 + 128*T;
  const callerData = answerData + transit;
  const payloadLength = 2400;
  const greeting = 'Welcome to the signal archive!\r\n';
  const command = 'LIST\r\n';
  v32Burst(s,'caller',callerTraining,measuredDelay+256,callerTrn,[...Array(eachR2).fill(candidate),eWord],
    bis ? null : {b1Count:Math.round((callerData-callerB1)/T),payloadCount:payloadLength,message:command});
  const end = v32Burst(s,'answer',finalTraining,256,answerFinalTrn,[...Array(eachR3).fill(selected),eWord],
    bis ? null : {b1Count:128,payloadCount:payloadLength+24,message:greeting});
  mark(s,callerTraining,'Return the training','The caller supplies its own known sequence. Each direction uses a different scrambler so the two signals can be distinguished.');
  mark(s,finalTraining,bis?'Settle on 14,400':'Choose the common mode',bis ?
    'While the caller repeats its rate offer, the answerer trains again and selects 14,400. Both transmit an end word. The short data-mode preamble that follows is outside this excerpt.' :
    'The caller offers the simpler 16-point mode. The answerer trains again, selects 9,600, and both ends mark agreement with an E word.');
  if (!bis) {
    mark(s,callerB1,'Enter data mode','The caller switches to four information bits per symbol and sends scrambled ones. The answerer follows. The receivers open their data outputs after the final preamble.');
    mark(s,answerData,'Connected · 9,600 bit/s','The answerer now encodes the text “Welcome to the signal archive!” The caller sends “LIST”. Both messages repeat. The equal-looking fuzz now carries recoverable bytes in both directions.');
  }
  s.method = 'Synthesis begins at V.25 answer tone, after dialing and the initial off-hook silence. The caller answers after 1.02 s. V.25 permits early termination after detecting its response for 100 ms, so the 1.2 s tone is a permitted example. One-way delay is 10 ms. Training lengths and finite root-raised-cosine transmit filters are example choices. No channel or receiver is simulated. ' + (bis ? 'Ends at the E words, before trellis-coded B1 and user data.' : 'Includes reciprocal training, R1/R2/R3, E, scrambled B1 and synchronous 16-QAM data. The chosen payload repeats plain ASCII bytes least-significant bit first, with no link-layer framing.');
  s.sources = [rec(bis?'V.32bis-199102-I':'V.32-198811-S',bis?'V.32bis, §§4–6, Tables 2 and 4–6':'V.32, §§2, 4–5, Tables 1, 3 and 5–7'),v25];
  return finish(s,end);
}

function field(bits,at,count,value) {
  for (let bit=0; bit<count; bit++) bits[at+bit] = (value >>> bit) & 1;
}
function crc(bits) {
  let state = 0xffff;
  for (const bit of bits) {
    const feedback = (state ^ bit) & 1;
    state = (state >>> 1) ^ (feedback ? 0x8408 : 0);
  }
  return state;
}
function frameByte(value) {
  const bits = [0];
  field(bits,1,8,value);
  bits.push(1);
  return bits;
}
function fsk(stem,start,bits,answer) {
  let phase = 0;
  render(stem,start,bits.length/300,(t,n) => {
    const bit = bits[Math.floor(n/80)];
    const value = unit * Math.sin(phase);
    phase = (phase + TAU*(bit ? (answer ? 1650 : 980) : (answer ? 1850 : 1180))/SR) % TAU;
    return value;
  });
}
function v8Menu(s) {
  // Table 1 sync; Table 3 unspecified data; Table 4 V.34, V.32/bis,
  // V.22/bis and V.21 available. Both sides have the same menu.
  const menu = [...'11111111110000001111'].map(Number);
  for (const value of [0xc1,0x45,0x13,0x90]) menu.push(...frameByte(value));
  const messages = Array(4).fill(menu).flat();
  const cj = Array(3).fill(frameByte(0)).flat();
  const cm = 1.16, jm = cm + 2*menu.length/300, cjt = cm + messages.length/300;
  const stop = cjt + cj.length/300;
  answerTone(s.answer,jm,true);
  fsk(s.caller,cm,messages.concat(cj),false);
  fsk(s.answer,jm,messages.slice(0,Math.round((stop-jm)*300)),true);
  mark(s,0,'A pulsing answer','At 2,100 Hz the answer tone swells and shrinks 15 times a second. This V.8 variant also reverses phase at 450 ms intervals.');
  mark(s,cm,'Find a common language','The caller sends its menu in the low V.21 band. The answerer repeats their common modes in the high band. Three framed zero bytes close the exchange.');
  return stop + 0.075;
}

function v34Info(kind,fast) {
  const crcStart = {capabilities:29, report:89, selection:50}[kind];
  const bits = new Uint8Array(crcStart+20);
  bits.set(Array.from('111101110010',Number));
  if (kind === 'capabilities') {
    for (let i=12;i<=20;i++) bits[i] = 1;
    bits[25] = Number(fast);
    // Zero difference allowed between directions, internal reference clock.
  } else if (kind === 'report') {
    // Chosen ideal-line projection at each possible symbol clock. Power
    // reduction, frequency offset, pre-emphasis and MD duration all zero.
    const projected = [8,9,10,11,12,fast?14:12];
    projected.forEach((r,i) => {
      bits[25+9*i] = 1;
      field(bits,30+9*i,4,r);
    });
  } else {
    bits[25] = 1;
    field(bits,30,4,fast?14:12);
    field(bits,34,3,fast?5:4);
    field(bits,37,3,fast?5:4);
  }
  field(bits,crcStart,16,crc(bits.slice(12,crcStart)));
  bits.fill(1,crcStart+16);
  return bits;
}
function infoSignal(s,side,at,bits) {
  const answer = side === 'answer';
  let angle = 0;
  const phases = [angle];
  for (const bit of bits) {
    if (bit) angle = Math.PI - angle;
    phases.push(angle);
  }
  const end = modulate(s[side],at,phases,600,answer?2400:1200,unit*(answer?10**(-1/20):1),0.75);
  if (answer) tone(s.answer,at,end,1800,unit*10**(-7/20));
  return end;
}
const probeTable = Float32Array.from({length:160},(_,n) => {
  const missing = [6,8,12,16], inverse = [2,11,15,18,20,21,22,23];
  let sum = 0;
  for (let h=1;h<=25;h++) if (!missing.includes(h)) {
    sum += (inverse.includes(h)?-1:1)*Math.cos(TAU*h*n/160);
  }
  return unit * sum / Math.sqrt(21);
});
function probe(stem,at) {
  render(stem,at,0.6,(_,n) => probeTable[n%160] * (n<3840 ? 10**(6/20) : 1));
}
function aTone(s,start,end,flips,fast) {
  tone(s.answer,start,end,2400,unit*10**(-1/20),flips);
  // §10.1.2.1 specifies different guard levels in the two editions.
  tone(s.answer,start,end,1800,unit*(fast?1:10**(-7/20)));
}
function v34Ranging(s,at,fast) {
  const both = v34Info('capabilities',fast);
  let t = infoSignal(s,'answer',at,both);
  infoSignal(s,'caller',at,both);
  mark(s,at,'Exchange capabilities',fast ?
    'INFO0 identifies the optional fast clock and the larger signal alphabet needed at 33,600. A dedicated bit advertises the larger constellation.' :
    'Each end sends a checked INFO0 message with its clock and carrier options. These brief words ride on different carriers.');
  // Nominal 40 ms turnarounds, an example with negligible transit time.
  const flip = t + 0.09, first = flip + 0.09;
  tone(s.caller,t,flip+0.05,1200,unit,[flip+0.04]);
  aTone(s,t,first,[flip,flip+0.08],fast);
  probe(s.answer,first);
  mark(s,first,'Measure the downlink','The answering modem plays a 21-note chord for 160 ms, then the same chord 6 dB quieter. The four empty frequencies help reveal distortion.');
  t = first + 0.6;
  tone(s.caller,t-0.03,t+0.1,1200,unit,[t+0.09]);
  aTone(s,t,t+0.06,[t+0.05],fast);
  const second = t+0.1;
  probe(s.caller,second);
  mark(s,second,'Measure the return path','The calling modem sends the same two-level probe. The two ends can now compare estimates for each direction.');
  const report = second+0.6;
  const selection = infoSignal(s,'caller',report,v34Info('report',fast));
  aTone(s,report-0.03,selection,[],fast);
  const end = infoSignal(s,'answer',selection,v34Info('selection',fast));
  mark(s,report,'Choose the symbol clock',fast ?
    'The example reports a clean path. INFO1 selects about 3,429 symbols per second and a carrier near 1,959 Hz for both ends.' :
    'The example reports a clean path. The receiver’s results lead to a 3,200-symbol/s clock and 1,920 Hz carrier in both directions.');
  return end + 0.070;
}
function v34Preamble() {
  const zero = Math.PI/4;
  const symbols = alternating(128,zero,zero+quarter).concat(alternating(16,zero+2*quarter,zero+3*quarter));
  // Table-independent analytic definition in V.34 §10.1.3.6.
  for (let i=0;i<288;i++) {
    const k = Math.floor(i/4);
    symbols.push(Math.PI*(k*(i%4)+(k%3===1?4:0))/6);
  }
  return symbols;
}
function v34Training(side,count) {
  const scramble = scrambler(side);
  let quadrant = 0;
  const symbol = (first,second,differential) => {
    const delta = scramble(first) + 2*scramble(second);
    quadrant = ((differential?quadrant:0) + delta) % 4;
    return Math.PI/4 - quadrant*quarter;
  };
  const phases = Array.from({length:count},() => symbol(1,1,false));
  function append(bits) {
    for (let i=0;i<bits.length;i+=2) phases.push(symbol(+bits[i],+bits[i+1],true));
  }
  return {phases,append};
}
function parameters(fast,ack) {
  const bits = new Uint8Array(88);
  bits.fill(1,0,17);
  const max = fast?14:12;
  field(bits,20,4,max); field(bits,24,4,max);
  bits[32] = 1; // expanded shaping
  bits[33] = Number(ack);
  bits.fill(1,35,35+max);
  const data = [...bits.slice(18,34),...bits.slice(35,51),...bits.slice(52,68)];
  field(bits,69,16,crc(data));
  return bits;
}
function v34(rate) {
  const s = session(), fast = rate === 33600;
  const baud = fast ? 24000/7 : 3200, carrier = fast ? baud*4/7 : 1920;
  const at = v34Ranging(s,v8Menu(s),fast);
  const trnCount = 3072, j = '0000100110010001';
  // Fixed training/run-up decisions for an example pair of modems.
  const half = 432 + trnCount + 20*8;
  const peerAt = at + half/baud;
  const finalAt = peerAt + half/baud;
  function train(side,start,final) {
    const state = v34Training(side,trnCount);
    // Keep J on air while the peer begins its 128-symbol S pattern.
    for(let repeat=0;repeat<20+16;repeat++) state.append(j);
    if(final) state.append('1111100110010001');
    return modulate(s[side],start,v34Preamble().concat(state.phases),baud,carrier);
  }
  train('answer',at,false);
  mark(s,at,'Align the receiver','An alternating pair marks the start of training. Six turns through a known 48-symbol pattern give the receiver a reference. Scrambled ones follow it.');
  const callerFineStart = train('caller',peerAt,true);
  mark(s,peerAt,'Train the other direction','The caller sends S, the periodic PP sequence and four-point training on the selected carrier. Both modems learn their own echo while the far receiver learns its equalizer.');
  const fine = 3072;
  const finalSync = v34Preamble().slice(0,144);
  modulate(s.answer,finalAt,finalSync,baud,carrier);
  const answerFineStart = finalAt+144/baud;
  mark(s,finalAt,'Fine-tune both ends','The answering modem marks the move to final training. Both directions now train at once using separate scrambled sequences.');
  // Finish at a common sample time for the first MP on both stems; within
  // each transmitter, the scrambler & differential phase span MP, MP′ and E.
  const mpTime = answerFineStart + fine/baud;
  function finalTraining(side,start) {
    const count = Math.round((mpTime-start)*baud);
    const state = v34Training(side,count);
    for (const ack of [false,false,true,true]) state.append(parameters(fast,ack));
    state.append('11111111111111111111');
    return modulate(s[side],start,state.phases,baud,carrier);
  }
  const end = finalTraining('answer',answerFineStart);
  finalTraining('caller',callerFineStart);
  mark(s,mpTime,'Agree on a rate',fast ?
    'Both MP messages enable 33,600 and request it in both directions. Their acknowledgments and end markers conclude this excerpt.' :
    'The MP messages specify a maximum of 28,800 in each direction. Their acknowledgments and end markers conclude this excerpt.');
  s.method = 'Synthesized V.8 menus, V.34 INFO messages with CRC, phase-reversal ranging, L1/L2, S, PP, four-point TRN, J, MP acknowledgments and E. This fixed clean-line scenario selects symmetric rates, zero frequency offset and no vendor-specific training. Pulse shaping, levels, receiver timing and training lengths are illustrative. Stops before the trellis-coded B1 preamble and payload. No recording or added noise.';
  s.sources = [v8,rec(fast?'V.34-199610-S':'V.34-199409-S',fast?'V.34 (1996), §§5, 7, 10–11 and Tables 14–20':'V.34 (1994), §§5, 7, 10–11 and Tables 14–20')];
  return finish(s,end);
}

export function middleSignal(rate) {
  rate = Number(rate);
  if (rate===9600 || rate===14400) return v32(rate);
  if (rate===28800 || rate===33600) return v34(rate);
  throw new RangeError('Unsupported V.32/V.34 chapter rate');
}
