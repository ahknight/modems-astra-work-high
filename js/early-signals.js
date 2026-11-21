// Original reconstructed passband signals. One second has 24,000 samples.
// Stages are measurement points in these buffers, not timers in the UI.
const sampleRate = 24000;
const baud = 600;
const step = sampleRate / baud;
const tau = 2 * Math.PI;

function serial(text) {
  const bits = [];
  for (const character of text) {
    bits.push(0);
    for (let i = 0; i < 8; i++) bits.push((character.charCodeAt(0) >>> i) & 1);
    bits.push(1);
  }
  return bits;
}

function stage(time, title, text) {
  return { time, title, text };
}

// Continuous-phase FSK: each incoming bit changes only the phase increment.
function fsk(start, mark, space, messageAt, message, duration) {
  const samples = new Float32Array(duration * sampleRate);
  const first = Math.round(start * sampleRate);
  const dataStart = Math.round(messageAt * sampleRate);
  const bits = serial(message);
  let phase = 0;
  for (let i = first; i < samples.length; i++) {
    const bit = bits[Math.floor((i - dataStart) / 80)] ?? 1;
    samples[i] = 0.20 * Math.sin(phase);
    phase = (phase + tau * (bit ? mark : space) / sampleRate) % tau;
  }
  return samples;
}

function bell103() {
  const duration = 5;
  return {
    sampleRate,
    caller: fsk(1.650, 1270, 1070, 3.600, 'HELLO FROM HOME\r', duration),
    answer: fsk(0, 2225, 2025, 2.100, 'CARRIER ARCHIVE ONLINE\r\nLOGIN: ', duration),
    stages: [
      stage(0, 'Answer mark', 'The distant modem holds its high mark at 2,225 Hz. This excerpt starts at the first sound, after the telephone exchange has answered.'),
      stage(1.650, 'Caller returns mark', 'The caller adds a steady 1,270 Hz. Two pitches travel together, one in each direction. Both ends now have a carrier to detect.'),
      stage(2.100, 'The terminal speaks', 'The answering terminal sends “CARRIER ARCHIVE ONLINE” and a login prompt. Every zero pulls the high pitch down to 2,025 Hz. The caller still holds a steady mark.'),
      stage(3.600, 'Reply from home', 'The user sends “HELLO FROM HOME”. The lower voice now switches between 1,070 and 1,270 Hz. After the message both ends hold mark, ready for another character.')
    ],
    method: 'Reconstruction of a Bell 103A2 channel establishment, starting with the answer mark. The caller is already in data mode. The nominal 150 ms carrier-detection interval and additional 1.5 s wait come from Bell’s interface sequence. Payloads and typing delays are illustrative. Both messages are encoded at 300 bit/s, with one start bit, eight data bits and one stop bit. This is an ideal electrical signal with no acoustic-cup or line distortion.',
    sources: [
      {label:'Bell System Practices 591-014-100, Table A · tone assignments', url:'https://bitsavers.org/communications/westernElectric/modems/591-014-100_Data_Set_103A_Identification_and_Operation_Jan67.pdf'},
      {label:'Bell System 103A interface specification, §6.2 · channel establishment', url:'https://bitsavers.org/communications/westernElectric/modems/103A_Interface_Specification_Feb67.pdf'}
    ]
  };
}

function scrambler() {
  let history = 0;
  let ones = 0;
  return input => {
    if (ones === 64) { input ^= 1; ones = 0; }
    const output = input ^ ((history >>> 13) & 1) ^ ((history >>> 16) & 1);
    history = ((history << 1) | output) & 0x1ffff;
    ones = output ? ones + 1 : 0;
    return output;
  };
}

// Sample the analytic square-root raised-cosine impulse, ±6 symbol periods.
// The bounded filter accounts for slight deviations from the ideal mask.
const span = 6;
function rootRaisedCosine(t) {
  const a = 0.75;
  if (t === 0) return 1 + a * (4 / Math.PI - 1);
  if (Math.abs(Math.abs(t) - 1 / (4 * a)) < 1e-10) {
    const x = Math.PI / (4 * a);
    return a / Math.sqrt(2) * ((1 + 2 / Math.PI) * Math.sin(x) + (1 - 2 / Math.PI) * Math.cos(x));
  }
  return (Math.sin(Math.PI * t * (1 - a)) + 4 * a * t * Math.cos(Math.PI * t * (1 + a))) /
    (Math.PI * t * (1 - (4 * a * t) ** 2));
}
const pulse = Float64Array.from({length:2 * span * step + 1}, (_, n) => rootRaisedCosine(n / step - span));

function modulate(segments, carrier, count) {
  const inPhase = new Float32Array(count * step);
  const quadrature = new Float32Array(inPhase.length);
  const scramble = scrambler();
  const rotations = [1, 0, 2, 3];
  let quadrant = 0;
  for (let s = 0; s < segments.length; s++) {
    const {start, mode, message} = segments[s];
    const end = segments[s + 1]?.start ?? count;
    const bits = serial(message ?? '');
    let cursor = 0;
    const next = () => scramble(bits[cursor++] ?? 1);
    for (let k = start; k < end; k++) {
      let dibit;
      if (mode === 'plain') dibit = 3;
      else if (mode === 'request') dibit = (k - start) % 2 ? 3 : 0;
      else dibit = 2 * next() + next();
      quadrant = (quadrant + rotations[dibit]) % 4;
      // Coordinates in the first quadrant follow V.22bis Figure 2; the first
      // transmitted selector bit controls Q, and the second one controls I.
      let x = 3, y = 1;
      if (mode === 'qam') { y = 1 + 2 * next(); x = 1 + 2 * next(); }
      if (quadrant === 1) [x, y] = [-y, x];
      else if (quadrant === 2) [x, y] = [-x, -y];
      else if (quadrant === 3) [x, y] = [y, -x];
      const offset = (k - span) * step;
      const from = Math.max(0, -offset);
      const to = Math.min(pulse.length, inPhase.length - offset);
      for (let j = from; j < to; j++) {
        inPhase[offset + j] += x * pulse[j];
        quadrature[offset + j] += y * pulse[j];
      }
    }
  }
  // Fixed common gain preserves the mean power relationship between alphabets.
  for (let i = 0; i < inPhase.length; i++) {
    const theta = tau * carrier * i / sampleRate;
    inPhase[i] = 0.06 * (inPhase[i] * Math.cos(theta) - quadrature[i] * Math.sin(theta));
  }
  return inPhase;
}

function v22(rate) {
  const bis = rate === 2400;
  const call = 367;   // 611.67 ms, within the recommendation's tolerances
  const answer = call + (bis ? 60 : 162);
  const callFast = answer + 60 + 360;
  const answerFast = call + 60 + 360;
  const answerData = bis ? answerFast + 120 : answer + 459;
  const callReady = bis ? callFast + 120 : answer + 162 + 459;
  const callData = Math.max(callReady, answerData + 390);
  const count = callData + 780;
  const alphabet = bis ? 'qam' : 'psk';
  const caller = bis ? [
    {start:call,mode:'request'}, {start:call + 60,mode:'psk'}, {start:callFast,mode:'qam'}
  ] : [{start:call,mode:'psk'}];
  const remote = [{start:0,mode:'plain'}];
  if (bis) remote.push({start:answer,mode:'request'}, {start:answer + 60,mode:'psk'}, {start:answerFast,mode:'qam'});
  else remote.push({start:answer,mode:'psk'});
  remote.push({start:answerData,mode:alphabet,message:'CARRIER ARCHIVE ONLINE\r\nLOGIN: '});
  caller.push({start:callData,mode:alphabet,message:'HELLO FROM HOME\r'});
  const at = (k,title,text) => stage(k / baud,title,text);
  const stages = [at(0, 'Answer mark', 'The answering modem sends repeated pairs of ones, each turning the carrier back by a quarter turn. This produces the steady high whistle that the caller recognizes.')];
  if (bis) stages.push(
    at(call,'Request 2,400', 'The caller alternates two particular pairs of bits, 00 and 11, for a tenth of a second. This short signature says it can use the larger alphabet.'),
    at(answer,'Answer accepts', 'The answer modem returns the same signature in its own band. The caller has already switched to scrambled ones at 1,200 bit/s.'),
    at(answer + 60,'Train at 1,200', 'Both ends send scrambled ones. Each listens to the partner’s known pattern and prepares to distinguish points closer together.'),
    at(answerFast,'Sixteen signal points', 'The answer modem switches to four bits per symbol. The caller follows about one tenth of a second later. The clock still ticks 600 times a second.')
  );
  else stages.push(
    at(call,'Caller trains', 'The low band fills with scrambled ones. Although the underlying bit is always one, the scrambler supplies changing bit pairs so the receiver can find the symbol clock.'),
    at(answer,'Answer trains', 'The high band changes from a whistle to a rough texture as the answering modem also sends scrambled ones. Both voices now make four possible phase steps.')
  );
  stages.push(
    at(answerData,'Login prompt', 'The high band now carries an actual framed message, “CARRIER ARCHIVE ONLINE” followed by “LOGIN: ”. User data sounds much like scrambled training. The wire has no special connected chime.'),
    at(callData,'Reply from home', 'The caller sends “HELLO FROM HOME”. Both transmitters continue sending scrambled idle ones after the characters run out.')
  );
  const standard = bis ? 'V.22bis' : 'V.22';
  return {
    sampleRate, stages,
    caller:modulate(caller,1200,count), answer:modulate(remote,2400,count),
    method:'Transmitter reconstruction of the ' + standard + ' constant-carrier startup, beginning at the answer mark. The international V.25 preamble is omitted, as permitted on some national connections. The model follows nominal timing, differential quadrant changes, the 14/17-bit-tap scrambler and 75% roll-off pulse shaping at 600 baud. The guard tone is disabled. It assumes a clean line, no propagation delay and successful detection. Real equalizers, carrier offsets, speaker response and national compromise filters are outside the model. The 8N1 terminal messages and typing pauses are illustrative.',
    sources:[{label:'CCITT ' + standard + ' (1988), §§2, 5 and 6.3 · modulation and startup',
      url:'https://www.itu.int/rec/T-REC-' + standard + '-198811-I/en'}]
  };
}

export function earlySignal(rate) {
  const speed = Number(rate);
  if (speed === 300) return bell103();
  if (speed === 1200 || speed === 2400) return v22(speed);
  throw new RangeError('Unsupported early modem speed ' + rate);
}
