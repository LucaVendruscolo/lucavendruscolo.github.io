# Revamp notes

The site was promoted to the repo root on 7 September 2026. The old site (`index.html`, `css/style.css`, `js/carousel.js`, `fonts/SourceSerif4-Semibold.woff2`) was deleted; it is still in git history if any of it is wanted back. The preview folder `a/` is gone.

| | |
|---|---|
| Folder | repo root: `index.html`, `site.css`, `page.js`, `smoke.js`, `downwash.js` |
| Ground | light (#F3F5F7), ink (#101619). The smoke is ink only; the accent (#B8340F) is left in the palette for the focus ring on videos |
| Type | Archivo (headings) + Literata (body), self-hosted from `fonts/` |
| Hero | a 2D smoke tunnel drawn on a canvas, after the wind-tunnel photographs of smoke lines over a car. The air is a real incompressible fluid on a staggered grid: semi-Lagrangian advection with a MacCormack correction, then a pressure projection. A padded hull around the name and the lede, faired to a blunt nose upstream, is a solid no-slip body, so the flow stays attached over the text and breaks up behind it. Every swirl is the body's own shear layer rolling up; nothing is injected. Smoke lines are released only at the left edge, drawn in ink, and fade with age. The canvas runs 110vh past the hero (40vh on phones, which have no pointer), so smoke pushed downward carries well into the page instead of stopping at an edge. A moving pointer pushes the air near it. Tunables are the constants at the top of `smoke.js`: `U0` speed, `CELLS` grid size, `LINE_GAP` line spacing, `NOSE_K` how far the nose is faired, `LIFE0`/`LIFE1` how long the smoke lasts, `PTR_K`/`PTR_R` the pointer |
| Below the hero | About; Research, which is two work blocks (the paper, then the marble labyrinth), each with text and a diagram beside it and a strip of photos and videos below at a shared height; a CV ledger; Fun side projects (a card grid, the arm for now); contact. The labyrinth diagram is a dashed placeholder in `index.html` until the real diagram exists. Content stops widening at `--max` (1280px). Nothing moves except the videos when they are in view and the CV smoke |
| CV | a second canvas beside the ledger, on layouts 1000px and wider. Smoke drifts in from the left edge of the screen as a soft density field; a drone hovers in the column and its rotors pull some of it down through the blades. The pointer stirs the smoke, and the drone follows a pointer that comes close, tilting into each move, then returns to its hover point. Same tier gate and Pause button as the hero |

It uses only the four page files at the root plus `assets/` and `fonts/`. No build step, no framework, no third-party script.

## Preview locally

```sh
cd lucavendruscolo.github.io
python -m http.server 8080
```

Then open http://localhost:8080/. Paths are absolute (`/assets/...`, `/fonts/...`), so a server at the repo root is required; opening the file directly will not load fonts or media.

After pushing, the page is at https://lucavendruscolo.github.io/.

## Things to try

- Move the pointer across the hero: the air follows it, folds and rolls up, then washes downstream. A still pointer does nothing.
- Press "Pause the smoke" (it persists across reloads).
- Turn on the OS "reduce motion" setting and reload: a pre-rendered still replaces the canvas and videos show native controls.
- Disable JavaScript: the page is complete and readable.
- Tab through the page: skip link, nav, pause button, every video button and link, in order.

## Editing copy

`content/content.json` holds the sentences and CV rows the page transcribes. Edit a sentence there, then mirror it in `index.html`. Keep the copy rules: first person, no em dashes, no buzzwords.

## Regenerating assets

- `tools/fonts.md`: how the font files were produced.
- `tools/render-still.md`: how the hero still images are captured (re-render after changing the hero or the smoke constants).
- `tools/slop-audit.py a`: checks visible copy and CSS for the tells the brief asked to avoid.

## Open items for Luca

- The three RMSE reductions and the paper summary are taken from the CV and the abstract; confirm the wording.
- FTC award: the text says team captain 2018 to 2020, UK National Champions, Judges' Award at Worlds in Detroit (dated 2020). Confirm.
- Rewrite any sentence you would not say yourself; the drafts are deliberately plain.
