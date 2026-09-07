# Rendering the hero still

The static tier (reduced motion, Save-Data, low memory, JavaScript off, or the Pause button) shows a pre-rendered frame of the smoke instead of the live canvas. Two stills are shipped and chosen by a `<picture>` element in `a/index.html`:

| File | Viewport it was rendered at | Used when |
|---|---|---|
| `assets/img/a-hero-still.webp` | 1600 x 1000, DPR 1 | viewports 700px and wider |
| `assets/img/a-hero-still-m.webp` | 400 x 720, DPR 2 | viewports under 700px |

Both are captured from the page itself in capture mode: `/?capture` hides the text, runs the flow for 320 fixed steps (19 s) with no pointer, and draws one opaque frame. The run is deterministic, so the same layout always gives the same still. Re-render them whenever the hero layout, the name's typeface, or the smoke constants change.

Requirements: a local server at the repo root (`python -m http.server 8080`), Node with `puppeteer-core`, Chrome, and Pillow.

```sh
# from a folder with puppeteer-core installed (npm i puppeteer-core) and the shot.mjs harness
node shot.mjs --url "http://127.0.0.1:8080/?capture" --out still-desk.png --w 1600 --h 1000 --selector canvas --wait 9000 --fast
node shot.mjs --url "http://127.0.0.1:8080/?capture" --out still-mob.png  --w 400  --h 720  --dpr 2 --selector canvas --wait 9000 --fast
python -c "from PIL import Image; Image.open('still-desk.png').convert('RGB').save('assets/img/a-hero-still.webp', quality=80, method=6)"
python -c "from PIL import Image; Image.open('still-mob.png').convert('RGB').save('assets/img/a-hero-still-m.webp', quality=78, method=6)"
```

Without the harness: open `http://127.0.0.1:8080/?capture` in Chrome at the sizes above, right-click the canvas, "Save image as", then convert to WebP.

The OG image `assets/img/a-og.webp` is a plain 1200 x 630 screenshot of `/` taken about 4 s after load.
