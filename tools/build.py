"""Regenerate static pages after editing editorial.json or the instrument templates."""
import json
from html import escape as esc
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / 'tools/editorial.json').read_text())
EXPERIMENTS = json.loads((ROOT / 'tools/experiments.json').read_text())
CREDITS = json.loads((ROOT / 'assets/credits.json').read_text())
META = [
 ('300','Bell 103','1970s','Two pairs of pitches','01'),
 ('1200','V.22','1979–80','Turns of a wave','02'),
 ('2400','V.22bis','1984','Sixteen possible symbols','03'),
 ('9600','V.32','1984','Learning the echo','04'),
 ('14400','V.32bis','1991','A denser alphabet','05'),
 ('28800','V.34','1994','Sounding out the line','06'),
 ('33600','V.34 revised','1996','The analog ceiling','07'),
 ('56000','V.90','1998','The digital far end','08'),
]
SIGNALS = json.loads((ROOT / 'tools/signals.json').read_text()) if (ROOT / 'tools/signals.json').exists() else {}
ICONS = {
 'play':'<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
 'pause':'<path d="M8 5v14m8-14v14" stroke-width="4"/>',
 'restart':'<path d="M4 5v6h6"/><path d="M4.5 10a8 8 0 1 1 .7 6"/>',
 'book':'<path d="M3 5c3-1 6-.6 9 1 3-1.6 6-2 9-1v14c-3-1-6-.6-9 1-3-1.6-6-2-9-1zM12 6v14"/>',
 'headphones':'<path d="M4 14v-3a8 8 0 0 1 16 0v3M4 13h3v7H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 1-2zm16 0h-3v7h2a2 2 0 0 0 2-2v-3a2 2 0 0 0-1-2z"/>',
 'github':'<path fill="currentColor" stroke="none" d="M12 1a11 11 0 0 0-3.48 21.43c.55.1.75-.24.75-.53v-2.05c-3.07.67-3.72-1.3-3.72-1.3-.5-1.28-1.22-1.62-1.22-1.62-1-.68.08-.67.08-.67 1.1.08 1.69 1.14 1.69 1.14.98 1.69 2.58 1.2 3.21.92.1-.71.39-1.2.7-1.47-2.46-.28-5.04-1.23-5.04-5.47 0-1.21.43-2.2 1.14-2.97-.11-.28-.49-1.4.11-2.92 0 0 .93-.3 3.03 1.13a10.47 10.47 0 0 1 5.5 0c2.1-1.43 3.03-1.13 3.03-1.13.6 1.52.22 2.64.11 2.92.71.77 1.14 1.76 1.14 2.97 0 4.25-2.59 5.18-5.06 5.45.4.35.75 1.03.75 2.08v3.07c0 .3.2.64.76.53A11 11 0 0 0 12 1z"/>',
 'up':'<path d="m6 14 6-6 6 6"/>',
 'next':'<path d="m9 5 7 7-7 7"/>',
 'down':'<path d="m5 9 7 7 7-7"/>',
 'wave':'<path d="M1 12h4l2-8 3 16 3-18 3 15 2-8 2 3h3"/>',
 'dial':'<path d="M4 20a10 10 0 1 1 16 0M12 14l5-6"/><circle cx="12" cy="14" r="1.5"/>'
}
def icon(name):
 return f'<svg viewBox="0 0 24 24" class="icon" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICONS[name]}</svg>'

def pretty(r): return f'{int(r):,}'
def refs(items): return '<ul class="refs">'+''.join(f'<li><a href="{esc(s["url"],quote=True)}">{esc(s["label"])}</a></li>' for s in items)+'</ul>'
def nav(p,active):
 links=[('Story',p+'index.html#origins'),('Chapters',p+'index.html#chapters'),('Sources',p+'sources.html')]
 return f'''<a class="skip" href="#main">Skip to content</a><header class="mast"><div class="wrap mast-row"><a class="brand" href="{p}index.html"><span class="brandmark">{icon('wave')}</span> Carrier Archive</a><nav aria-label="Primary">{''.join(f'<a class="{("sel" if name==active else "")}" href="{url}">{name}</a>' for name,url in links)}<a class="repo" href="https://github.com/ahknight/modems-astra-work-high" aria-label="GitHub repository">{icon('github')}</a></nav></div></header>'''
def footer(p):
 return f'''<footer><div class="wrap footer-in"><div><a class="brand" href="{p}index.html">{icon('wave')} Carrier Archive</a><p>A listening guide to landline history.</p></div><div><a href="{p}sources.html#rights">Credits &amp; licenses</a><span>Original work · CC BY-NC 4.0</span></div></div></footer>'''
def page(title,body,p='',active='Story'):
 return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#1d201c"><meta name="description" content="Explore eight generations of dial-up modems through annotated synthesized signals, archival photographs and the engineering behind the handshake."><title>{esc(title)} · Carrier Archive</title><link rel="icon" href="{p}assets/mark.svg"><link rel="stylesheet" href="{p}style.css"><script type="module" src="{p}js/player.js"></script></head><body>{nav(p,active)}<main id="main">{body}</main>{footer(p)}</body></html>'''
def eyebrow(s): return f'<div class="eyebrow"><span class="rule"></span>{s}</div>'
def linkchapter(r,p=''): return f'{p}chapters/{r}.html'
def credit(i):
 c=CREDITS[i]
 return f'<a href="{esc(c["source"])}">{esc(c["credit"])}</a> · <a href="{esc(c["licenseURL"])}">{esc(c["license"])}</a>'

def transport():
 return f'''<div class="transport"><button type="button" class="play" data-play aria-label="Play signal">{icon('play')}<span>Play signal</span></button><button type="button" class="restart" data-restart aria-label="Restart signal" title="Restart signal">{icon('restart')}</button><label class="seek"><span class="sr">Signal position in seconds</span><input data-seek type="range" min="0" max="1" step=".001" value="0"></label><span class="clock" data-clock>0:00</span></div><span class="sr" data-status role="status"></span>'''
def hero():
 return f'''<section class="hero"><div class="wrap hero-grid"><div class="hero-copy">{eyebrow('AN INTERACTIVE FIELD GUIDE')}<h1>The dial-up<br><em>handshake.</em></h1><p>Have you ever wondered what those two modems were saying to each other? Inside that burst of whistles and static was a conversation. Here’s how to listen in.</p><div class="hero-actions"><a class="button paper" href="#origins">{icon('book')}Begin the story</a><a class="text-link" href="#chapters">Explore chapters {icon('down')}</a></div></div><figure class="hero-instrument" data-player="300" data-mini><div class="plate"><span><i class="lamp"></i> LINE MONITOR</span><span>RX / TX</span></div><div class="photo-well"><img src="assets/atari.webp" fetchpriority="high" alt="{CREDITS[0]['alt']}"><span class="photo-tag">ATARI 800XL &nbsp;/&nbsp; ACOUSTIC COUPLER</span></div><div class="hero-console"><div class="console-label"><span>{icon('headphones')} Bell 103 <b>/</b> 300 bps</span><small>SYNTHESIZED</small></div><canvas data-scope role="img" aria-label="Oscilloscope displaying the generated Bell 103 waveform"></canvas>{transport()}<div class="mini-info"><div data-current class="mini-stage">Answer mark</div><a href="chapters/300.html#laboratory">Signal notes</a></div></div><noscript><p>Enable JavaScript to play the generated signal.</p></noscript></figure></div></section>'''
def rail(p='',selected=None):
 return f'''<nav class="rate-nav" aria-label="Browse by line rate"><div class="wrap rate-inner"><span class="rail-label">LINE RATE <small>bits / second</small></span><div class="rates">{''.join(f'<a class="{("current" if r==selected else "")}" href="{linkchapter(r,p)}" aria-label="{pretty(r)} bits per second, {std}">{pretty(r)}</a>' for r,std,_,_,_ in META)}</div></div></nav>'''
def origins():
 return f'''<section class="origins wrap" id="origins"><div class="origin-copy">{eyebrow('PROLOGUE &nbsp;/&nbsp; THE TELEPHONE LINE')}<h2>Before the handshake.</h2>{''.join('<p>'+s+'</p>' for s in DATA['origin'])}<a class="sub-link" href="sources.html#origin">Sources for the prologue</a><div class="prologue-next"><a href="chapters/300.html">Continue to the Pennywhistle and Hayes 80-103A {icon('next')}</a></div></div><figure class="artifact"><div class="artifact-img"><img src="assets/sendata.webp" alt="{CREDITS[2]['alt']}" loading="lazy"></div><figcaption><strong>Sendata Series 700</strong><span>Electromed · c. 1975</span><small>{credit(2)}</small></figcaption></figure></section>'''
def index():
 cards=''.join(f'''<a class="chapter-row" href="{linkchapter(r)}"><span class="ch-num">{n}</span><span class="row-rate">{pretty(r)} <small>bps</small></span><span class="row-story"><b>{DATA[r]['title']}</b><small>{std} &nbsp;·&nbsp; {year}</small></span><img src="assets/trace-{r}.svg" alt="" loading="lazy"><span class="go">{icon('next')}</span></a>''' for r,std,year,_,n in META)
 return page('The dial-up handshake',hero()+rail()+origins()+f'''<section class="index-band" id="chapters"><div class="wrap">{eyebrow('CHAPTER INDEX')}<div class="index-head"><h2>Eight generations on the line.</h2><p>Pick a speed you remember, or follow the signal from the first carrier to a 56K connection.</p></div><div class="chapter-rows">{cards}</div><a class="end-link" href="epilogue.html"><span>EPILOGUE</span> The line stays open {icon('next')}</a></div></section>''')
def listening(r,std):
 m=SIGNALS.get(r,{'stages':[],'method':'','sources':[]})
 bounds={'300':'The two ends exchange marks, then carry an actual login prompt and reply.','1200':'The example begins at the answer mark and continues through scrambled training into terminal data.','2400':'Follow the two-way speed request through training and into a real, encoded login exchange.','9600':'Follow timing, training and rate agreement through to a decodable 9,600 bit/s greeting and reply.','14400':'An agreed 14,400 bit/s rate ends this reconstruction. The following data preamble and payload are omitted.','28800':'Follow V.8 menus through line probing, training and the final rate agreement. The payload is omitted.','33600':'The revised V.34 exchange reaches the 33,600 rate agreement. The following coded payload is omitted.','56000':'An edited reconstruction joins native-speed excerpts from answer tone to encoded downstream text. Some negotiation and training are skipped.'}
 transcript=''.join(f'''<li><button type="button" data-stage="{i}" aria-label="Seek to {esc(s['title'])}"><span>{float(s['time']):.2f} s</span>{esc(s['title'])}</button><p>{esc(s['text'])}</p></li>''' for i,s in enumerate(m['stages']))
 return f'''<section class="lab" id="laboratory" data-player="{r}" aria-label="{std} signal laboratory"><div class="lab-header"><div>{eyebrow('SIGNAL LABORATORY')}<h2>Listen to {std}.</h2></div><span class="mode-pill">Synthesized</span></div><p class="model-scope">{bounds[r]}</p><div class="scope-box"><div class="map-title"><b>SIGNAL TIMELINE</b><span>Time runs left to right</span></div><div class="map-window"><canvas data-map aria-label="Full-call map of signal energy by time and frequency. The stage transcript provides a text equivalent." role="img"></canvas><i data-cursor></i></div><div class="map-key"><span>0 s</span><span>Frequency rises upward · 0–4 kHz</span><span data-end></span></div><div class="scope-tools"><fieldset><legend class="sr">Display</legend><label><input type="radio" name="view" value="wave" checked> Waveform</label><label><input type="radio" name="view" value="spectrum"> Spectrum</label></fieldset><div class="scope-legend"><span class="swatch amber"></span>Caller <span class="swatch teal"></span>Answer</div></div><canvas data-scope role="img" aria-label="Synchronized signal plot. Each stage is described in the listening transcript below."></canvas><div class="scope-axis" data-axis>TIME WINDOW · 24 ms</div>{transport()}</div><div class="mix"><strong>Monitor</strong><label><input type="checkbox" checked data-track="caller"> Caller</label><label><input type="checkbox" checked data-track="answer"> Answer</label><label class="step-mode"><input type="checkbox" data-step> Pause at each stage</label></div><p class="plot-help">The call map shows when each pitch appears. A held note draws a horizontal stripe. Below it, <b>Waveform</b> shows the electrical signal rising and falling over a short interval. <b>Spectrum</b> spreads that same passage out by pitch, with stronger components reaching higher.</p><div class="now"><span class="eyebrow">AT THE PLAYHEAD</span><h3 data-current>Signal ready</h3><p data-detail>Read the stage descriptions below or play the signal.</p></div><noscript><p>Playback and plotting require JavaScript. The complete listening transcript follows.</p></noscript><h3 class="stage-heading">Listening transcript</h3><p class="tip">Select a stage to move the playhead. Every description stays here as the signal plays.</p><ol class="stages">{transcript}</ol><details class="method"><summary>How this signal was made</summary><p>{esc(m['method'])}</p>{refs(m['sources'])}</details></section>'''
def experiment(r):
 d=EXPERIMENTS[r]
 options=''.join(f'<option>{esc(v)}</option>' for v in d['choices'])
 return f'''<section class="bench" data-bench="{r}"><div class="small-label">TEACHING DEMONSTRATION</div><h3>{d['title']}</h3><label>{d['label']} <select>{options}</select></label><canvas aria-label="{d['title']}. The result is explained immediately below." role="img"></canvas><p class="bench-result" aria-live="polite"></p><noscript><p>The historical explanation above describes this mechanism. Enable JavaScript to try different inputs.</p></noscript></section>'''
def chapter(i):
 r,std,year,_,num=META[i];d=DATA[r];p='../';next_url=(META[i+1][0]+'.html' if i<7 else '../epilogue.html');next_txt=(pretty(META[i+1][0])+' bps · '+DATA[META[i+1][0]]['title'] if i<7 else 'Epilogue · The line stays open')
 prev=(META[i-1][0]+'.html' if i else '../index.html#origins')
 insight=d['insight']
 citations={'300':[[0,1],[1,2,3],[4],[5]],'1200':[[0],[0],[0],[0,1,2]],'2400':[[0,1],[0],[0],[0]],'9600':[[1],[1],[0,1,2,3],[5]],'14400':[[0,1],[0],[0]],'28800':[[0,1],[1],[2]],'33600':[[1,2],[0],[0]],'56000':[[0,4],[0],[0,4],[1,2,3],[5,6]]}
 def cited(text,ids):
  links=''.join(f'<a href="{esc(d["sources"][j]["url"])}" title="{esc(d["sources"][j]["label"],quote=True)}" aria-label="Source {j+1}: {esc(d["sources"][j]["label"],quote=True)}">{j+1}</a>' for j in ids)
  return '<p>'+text+' <sup class="citations">'+links+'</sup></p>'
 article=''.join(cited(text,ids) for text,ids in zip(d['paragraphs'],citations[r],strict=True))
 h=f'''<div class="chapter-head"><div class="wrap">{eyebrow(f'CHAPTER {num} OF 08 &nbsp;/&nbsp; {std.upper()}')}<div class="chapter-meta">{pretty(r)} <span>bits per second</span></div><h1>{d['title']}.</h1><p>{d['dek']}</p><a class="jump-lab" href="#laboratory">{icon('headphones')} Open the listening lab</a></div></div>'''
 body=f'''{h}{rail(p,r)}<div class="chapter-layout wrap"><article class="editorial"><div class="small-label">THE BREAKTHROUGH &nbsp;/&nbsp; {year}</div>{article}{experiment(r)}<aside><div class="small-label">FIELD NOTE</div><h3>{insight['title']}</h3><p>{insight['text']}</p></aside><details><summary>Chapter sources</summary>{refs(d['sources'])}</details></article>{listening(r,std)}</div><nav class="chapter-bottom wrap" aria-label="Reading sequence"><a href="{prev}">Previous section</a><a href="{next_url}"><small>UP NEXT</small>{next_txt} {icon('next')}</a></nav>'''
 return page(pretty(r)+' bps · '+d['title'],body,p,'Chapters')
def sources():
 groups=[('origin','Prologue',DATA['originSources'])]+[(r,pretty(r)+' bps · '+s,DATA[r]['sources']+SIGNALS.get(r,{}).get('sources',[])) for r,s,*_ in META]+[('epilogue','Epilogue',[s for d in DATA['epilogue'] for s in d['sources']])]
 links=''.join(f'<section id="{id}"><h2>{name}</h2>{refs(items)}</section>' for id,name,items in groups)
 figures=''.join(f'''<div class="credit-row"><img src="assets/{c['file']}" alt="" loading="lazy"><div><strong>{esc(c['title'])}</strong><p>{credit(i)}. Resized and converted to WebP. The cover image is cropped to fit its frame.</p></div></div>''' for i,c in enumerate(CREDITS))
 return page('Sources and credits',f'''<div class="page-intro wrap">{eyebrow('REFERENCE DESK')}<h1>Sources &amp; credits.</h1><p>Standards describe what a modem could say. Product notices and oral histories tell us who got to use it.</p></div><div class="reference wrap"><div class="ref-list">{links}</div><aside id="rights"><h2>Rights &amp; media</h2><p>Original editorial content, generated audio examples and original graphics are licensed under <a rel="license" href="https://creativecommons.org/licenses/by-nc/4.0/">CC BY-NC 4.0</a>. Credit Carrier Archive and link to this site and the license.</p><p>Historical quotations remain the work of their speakers and interview publishers. Short excerpts from the Felsenstein and Townshend oral histories accompany commentary on the design choices they describe. The linked standards and third-party photographs retain their own terms.</p>{figures}<p><a href="https://github.com/ahknight/modems-astra-work-high/blob/main/DEVLOG.md">Development journal</a></p></aside></div>''',active='Sources')
def epilogue():
 entries=''.join(f'''<section><h2>{d['title']}</h2><p>{d['text']}</p><details><summary>Sources</summary>{refs(d['sources'])}</details></section>''' for d in DATA['epilogue'])
 return page('The line stays open',f'''<div class="chapter-head"><div class="wrap">{eyebrow('EPILOGUE &nbsp;/&nbsp; AFTER THE SPEAKER')}<h1>The line stays open.</h1><p>The calls gave way to connections that could stay up all day. Listen for the old engineering ideas in the systems that followed.</p></div></div><article class="epilogue wrap">{entries}<a class="button ink" href="index.html#chapters">{icon('book')}Back to chapters</a></article>''')
(ROOT/'index.html').write_text(index())
(ROOT/'epilogue.html').write_text(epilogue())
(ROOT/'sources.html').write_text(sources())
for i,row in enumerate(META): (ROOT/'chapters'/f'{row[0]}.html').write_text(chapter(i))
