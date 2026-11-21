// Original reconstruction from ITU-T V.8 (02/98), V.34 (02/98), and V.90 (09/98).
// One PCM symbol per sample. Downstream parameters are explicit example choices.
const FS = 8000;
const TAU = 2 * Math.PI;

function muLaw(ucode) {
  const segment = ucode >> 4;
  const step = ucode & 15;
  return ((132 + 8 * step) * 2 ** segment - 132) / 10000;
}

function scrambler() {
  let history = 0;
  return input => {
    const bit = (input ^ (history >> 17) ^ (history >> 22)) & 1;
    history = ((history << 1) | bit) & 0x7fffff;
    return bit;
  };
}

function octet(value) {
  const bits = [0];
  for (let i = 0; i < 8; i++) bits.push((value >> i) & 1);
  return [...bits, 1];
}

function menu(digital) {
  // V.8 Table 1, 10 marks + CM/JM sync; Tables 3–5 and 7, LSB first.
  const bytes = [0xc1, 0x65, digital ? 0x47 : 0x27, digital ? 0x8d : 0x0d];
  return [...'11111111110000001111'].map(Number).concat(bytes.flatMap(octet));
}

function fsk(bits, mark, space) {
  let phase = 0;
  const data = new Float32Array(Math.round(bits.length * FS / 300));
  for (let i = 0; i < data.length; i++) {
    data[i] = 0.14 * Math.sin(phase);
    const bit = bits[Math.floor(i * 300 / FS)];
    phase = (phase + TAU * (bit ? mark : space) / FS) % TAU;
  }
  return data;
}

function probe() {
  // Signed harmonic indices encode each active frequency and its specified phase.
  const harmonics = [1,-2,3,4,5,7,9,10,-11,13,14,-15,17,-18,19,-20,-21,-22,-23,24,25];
  const cycle = new Float32Array(160); // exactly 3 cycles of the 150 Hz fundamental
  for (let i = 0; i < cycle.length; i++) {
    for (const k of harmonics) cycle[i] += Math.sign(k) * Math.cos(TAU * Math.abs(k) * 150 * i / FS);
  }
  const scale = 0.37 / Math.max(...cycle.map(Math.abs));
  const signal = new Float32Array(Math.round(0.56 * FS)); // L2 duration picked for this call
  for (let i = 0; i < signal.length; i++) {
    signal[i] = cycle[i % cycle.length] * scale * (i < FS * 0.16 ? 1 : 10 ** (-6 / 20));
  }
  return signal;
}

function train() {
  const signal = new Float32Array(384 + 48 + 14400);
  const pattern = [1, 0, 1, -1, 0, -1];
  for (let i = 0; i < 432; i++) signal[i] = pattern[i % 6] * (i < 384 ? 1 : -1) * muLaw(80);
  const scramble = scrambler();
  for (let i = 432; i < signal.length; i++) signal[i] = (scramble(1) ? 1 : -1) * muLaw(64);
  return signal;
}

function impairmentLearning() {
  // Selected valid descriptor: N=64, Ucodes 17..80, Hc=9, REFc=64 for all chords.
  // Sign and reference/test patterns below are in transmission order.
  const sign = [1,1,-1,-1,1,-1,-1,1,-1,1,1,-1];
  const test = [0,1,1,0,1,0,0,1];
  const perLevel = 60;
  const signal = new Float32Array(6 * 64 * perLevel);
  for (let i = 0; i < signal.length; i++) {
    const position = i % perLevel;
    const magnitude = 17 + Math.floor(i / perLevel) % 64;
    signal[i] = sign[position % sign.length] * muLaw(test[position % test.length] ? magnitude : 64);
  }
  return signal;
}

function connectedData() {
  // Six sign bits then 36 magnitude bits per six PCM samples. Six equal 64-level
  // maps make the mixed-radix operation in §5.4.3 a series of six-bit extractions.
  const scramble = scrambler();
  const text = 'CARRIER IS UP. HELLO FROM THE DIGITAL END.\r\n';
  let bitIndex = 0;
  let lastSign = 0;
  const signal = new Float32Array(6 * (48 + 4000));
  const signs = new Uint8Array(6);

  for (let offset = 0; offset < signal.length; offset += 6) {
    function readBit() {
      if (offset < 288) return scramble(1); // 48 B1d frames before data
      const byte = text.charCodeAt(Math.floor(bitIndex / 8) % text.length);
      const next = (byte >> (bitIndex % 8)) & 1;
      bitIndex++;
      return scramble(next);
    }
    for (let i = 0; i < 6; i++) {
      lastSign ^= readBit();
      signs[i] = lastSign;
    }
    for (let i = 0; i < 6; i++) {
      let label = 0;
      for (let k = 0; k < 6; k++) label |= readBit() << k;
      signal[offset + i] = (signs[i] ? 1 : -1) * muLaw(80 - label);
    }
  }
  return signal;
}

export function lateSignal() {
  const stages = [];
  const chunks = [];
  let cursor = 0;
  const stage = (title, text) => stages.push({time: cursor / FS, title, text});
  const add = (track, data, start = cursor) => chunks.push({track, data, start});
  const advance = (track, data) => { add(track, data); cursor += data.length; };

  stage('Answer tone', 'After a short silence the answering modem sends 2,100 Hz. Its strength ripples 15 times per second. Phase reversals ask network echo cancellers to stand aside.');
  cursor += 1600;
  const cm = menu(false);
  const jm = menu(true);
  const callerStart = cursor + 11200; // Te plus a chosen detection delay
  const menuLength = Math.round(cm.length * FS / 300);
  const answerMenuStart = callerStart + 2 * menuLength;
  const tone = new Float32Array(answerMenuStart - cursor);
  for (let i = 0; i < tone.length; i++) {
    const time = i / FS;
    const reversal = Math.floor(i / 3600) % 2 ? -1 : 1;
    tone[i] = reversal * 0.15 * (1 + 0.2 * Math.sin(TAU * 15 * time)) * Math.sin(TAU * 2100 * time);
  }
  add('answer', tone);
  cursor = callerStart;
  stage('The menus agree', 'Listen to the low caller and higher reply. At 300 bit/s they advertise data service, V.34 fallback and complementary V.90 roles. Three framed zero bytes acknowledge the agreement.');
  const terminator = [...octet(0), ...octet(0), ...octet(0)];
  const callBits = [...cm, ...cm, ...cm, ...cm, ...terminator];
  const answerBits = [...jm, ...jm, ...jm.slice(0, terminator.length)];
  add('caller', fsk(callBits, 980, 1180));
  add('answer', fsk(answerBits, 1650, 1850), answerMenuStart);
  cursor += Math.round(callBits.length * FS / 300) + 600;

  stage('Both ends probe', 'Each end sends the same 21 pitches, first loud and then 6 dB quieter. The far end compares what it receives. This edit moves directly between the two probe bursts.');
  advance('caller', probe());
  advance('answer', probe());

  stage('Train the receiver', 'A 48 ms repeating pattern briefly reverses, then opens into a steady hiss. A digital scrambler determines every sign in that hiss. The receiver knows what to expect and can correct the line’s smearing.');
  advance('answer', train());

  stage('Test the PCM levels', 'Which levels survive the route? This example alternates a known reference with test levels of increasing magnitude. The recurring swells are the same 64-level scan repeated six times.');
  advance('answer', impairmentLearning());

  stage('Carrier acquired', 'After final negotiation, 48 frames of known bits lead straight into a repeated text message, “CARRIER IS UP. HELLO FROM THE DIGITAL END.” Six samples now carry 42 bits. The remote speaker would usually be silent by this point.');
  advance('answer', connectedData());

  const caller = new Float32Array(cursor);
  const answer = new Float32Array(cursor);
  for (const chunk of chunks) (chunk.track === 'caller' ? caller : answer).set(chunk.data, chunk.start);
  return {
    sampleRate: FS, caller, answer, stages,
    method: 'Edited synthesis at native speed. V.8 menus, line probes, Sd/TRN1d, a chosen digital-impairment pattern, and B1d into 56,000 bit/s payload use documented signal rules. The timeline cuts out INFO/ranging, most upstream training and the final parameter exchange. The last two sections use example parameters, including an ideal 64-level magnitude set and no spectral shaping. PCM is decoded with North American μ-law. Listen levels are scaled for playback. No line distortion, telephone speaker, or recording is modeled.',
    sources: [
      {label:'V.8 (1998), §§3–8 · answer tone and menu coding', url:'https://www.itu.int/rec/T-REC-V.8-199802-S'},
      {label:'V.34 (1998), §§7 and 10.1.2.4 · scrambler and probe phases',url:'https://www.itu.int/rec/dologin_pub.asp?id=T-REC-V.34-199802-I%21%21PDF-E&lang=e&type=items'},
      {label:'V.90 (1998), §§5, 8 and 9 · PCM training and data mapping', url:'https://www.itu.int/rec/dologin_pub.asp?id=T-REC-V.90-199809-I%21%21PDF-E&lang=e&type=items'}
    ]
  };
}
