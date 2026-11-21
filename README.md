# Carrier Archive

[Read and listen to The dial-up handshake](https://ahknight.github.io/modems-astra-work-high/). Eight self-contained chapters follow home dial-up from the Pennywhistle and Hayes 80-103A to V.90. The epilogue follows the line into ISDN, DSL and cable.

## Run locally

Serve the repository with any static HTTP server, for example `python3 -m http.server 8000`. Open `http://localhost:8000/`. The checked-in HTML is ready to publish. GitHub Pages serves the root of the gh-pages branch. To release changes, fast-forward gh-pages to the reviewed main commit.

## Edit the guide

- Edit historical material and source lists in `tools/editorial.json`, then run `python3 tools/build.py` (Python 3.10 or later).
- Signal generators live in `js/*signal*.js`. After editing one, run `node tools/catalog.mjs` (Node 24), followed by `python3 tools/build.py`. This refreshes the static listening transcripts and small waveform previews.
- The player schedules both sender buffers on one Web Audio clock. The plots inspect the same PCM arrays. The silent teaching exercises are separate from the transmitter reconstructions.
- The site needs no runtime packages or external media requests. All pages include their narrative, transcript where applicable, and references as HTML.

[Development journal](DEVLOG.md) · [Rights and attribution](LICENSE.md)
