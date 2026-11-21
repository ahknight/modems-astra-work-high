// Bake the readable transcript and a tiny signal fingerprint for each static page.
// The browser regenerates PCM on demand. No audio files ship with the site.
import {writeFileSync} from 'node:fs';
import {makeSignal} from '../js/signals.js';
const catalog = {};
for (const rate of [300,1200,2400,9600,14400,28800,33600,56000]) {
  const {stages,method,sources,caller,answer,sampleRate} = makeSignal(rate);
  catalog[rate] = {stages,method,sources};
  const anchor = stages[Math.floor(stages.length/2)].time;
  const start = Math.min(caller.length-700,Math.floor((anchor+.022)*sampleRate));
  const points = Array.from({length:300}, (_,i) => {
    const index = start + i*2;
    return (i*.5).toFixed(1)+','+(19-31*(caller[index]+answer[index])).toFixed(1);
  }).join(' ');
  writeFileSync(new URL('../assets/trace-'+rate+'.svg',import.meta.url),'<svg xmlns="http://www.w3.org/2000/svg" width="150" height="38" viewBox="0 0 150 38"><polyline points="'+points+'" fill="none" stroke="#768268" stroke-width="1"/></svg>\n');
}
writeFileSync(new URL('signals.json',import.meta.url), JSON.stringify(catalog,null,2)+'\n');
