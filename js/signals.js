import {earlySignal} from './early-signals.js';
import {middleSignal} from './middle-signals.js';
import {lateSignal} from './late-signal.js';

export function makeSignal(rate) {
  rate = Number(rate);
  if (rate <= 2400) return earlySignal(rate);
  if (rate === 56000) return lateSignal();
  return middleSignal(rate);
}
