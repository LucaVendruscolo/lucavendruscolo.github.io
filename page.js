// Downstream: tier gate, nav state, videos.
const html = document.documentElement;
html.classList.add('js');

const hero = document.getElementById('top');
const h1 = document.getElementById('name');
const canvas = document.getElementById('smoke');
const bar = document.getElementById('bar');
const mark = bar.querySelector('.mark');
const cv = document.getElementById('cv');
const cvCanvas = document.getElementById('downwash');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const wide = matchMedia('(min-width: 1000px)');
const coarse = matchMedia('(pointer: coarse)').matches;
const capture = new URLSearchParams(location.search).has('capture');
const lowTier = () => reduced.matches || (navigator.connection && navigator.connection.saveData) || (navigator.deviceMemory && navigator.deviceMemory < 4);

// ---- the text boxes the smoke flows around: the name's lines and the lede, relative to the hero ----
function measure() {
  const hr = hero.getBoundingClientRect();
  const els = [...h1.querySelectorAll('span')];
  const lede = hero.querySelector('.lede');
  if (lede) els.push(lede);
  return els.map(el => {
    const r = el.getBoundingClientRect();
    return { x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height };
  });
}

// ---- smoke tier ----
let smoke = null;
let canRun = false;
try { canRun = !!document.createElement('canvas').getContext('2d'); } catch (e) { canRun = false; }

async function startSmoke() {
  if (smoke || !canRun) return;
  const mod = await import('./smoke.js');
  smoke = mod.createSmoke({ canvas, hero, coarse, measure, dpr: capture ? Math.min(devicePixelRatio || 1, 2) : 0, onWarm() {
    hero.classList.add('live');
    heroLive = true;
    if (wide.matches) startDownwash();   // warm the CV smoke in idle time now, so it is ready on arrival
  } });
  if (!smoke) { canRun = false; html.classList.remove('anim'); return; }
  window.__smoke = smoke;
  await document.fonts.ready;
  if (capture) {
    html.classList.add('capture');
    hero.classList.add('capture', 'live');
    smoke.capture(320);
    return;
  }
  smoke.start();
}
function stopSmoke() {
  if (!smoke) return;
  smoke.destroy(); smoke = null;
  heroLive = false;
  hero.classList.remove('live');
}
// ---- the CV smoke: only on wide layouts. Warmed in idle time once the hero is live, and in
// earnest once the section is within a viewport ----
let downwash = null, cvNear = false, heroLive = false;
async function startDownwash() {
  if (downwash || !canRun || !(cvNear || heroLive) || !wide.matches) return;
  const mod = await import('./downwash.js');
  if (downwash || lowTier() || !wide.matches) return;
  downwash = mod.createDownwash({ canvas: cvCanvas, coarse, background: !cvNear, onWarm() { cv.classList.add('live'); } });
  if (!downwash) return;
  window.__downwash = downwash;
  downwash.start();
}
function stopDownwash() {
  if (!downwash) return;
  downwash.destroy(); downwash = null;
  cv.classList.remove('live');
}
new IntersectionObserver(es => {
  cvNear = es[0].isIntersecting;
  if (cvNear && downwash) downwash.hurry();
  else if (cvNear && canRun && !lowTier()) startDownwash();
}, { rootMargin: '100%' }).observe(cv);

function applyTier() {
  // the still stands in for the smoke only when the smoke will not run; otherwise the hero opens on paper
  html.classList.toggle('anim', canRun && !lowTier());
  if (canRun && !lowTier()) { startSmoke(); if (wide.matches) startDownwash(); else stopDownwash(); }
  else { stopSmoke(); stopDownwash(); }
}
reduced.addEventListener('change', () => { applyTier(); applyVideoTier(); });
wide.addEventListener('change', applyTier);
document.fonts.ready.then(() => { if (smoke) smoke.setObstacles(measure()); });

// ---- bar: transparent over the hero, paper after; wordmark once the name has left ----
let barRaf = 0;
function barState() {
  barRaf = 0;
  const hb = hero.getBoundingClientRect().bottom;
  bar.classList.toggle('clear', hb > bar.offsetHeight);
}
addEventListener('scroll', () => { if (!barRaf) barRaf = requestAnimationFrame(barState); }, { passive: true });
barState();
new IntersectionObserver(es => {
  const gone = !es[0].isIntersecting;
  mark.classList.toggle('on', gone);
  mark.tabIndex = gone ? 0 : -1;
}).observe(h1);

// ---- current section ----
const navLinks = [...bar.querySelectorAll('nav a')];
const sections = navLinks.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
let current = null;
const secObs = new IntersectionObserver(es => {
  for (const e of es) if (e.isIntersecting) current = e.target;
  if (!current) return;
  const inHero = hero.getBoundingClientRect().bottom > innerHeight * 0.5;
  for (const a of navLinks) {
    if (!inHero && a.getAttribute('href') === '#' + current.id) a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
  }
}, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });
sections.forEach(s => secObs.observe(s));
let navRaf = 0;   // at most once a frame, like the bar
function navInHero() {
  navRaf = 0;
  if (hero.getBoundingClientRect().bottom > innerHeight * 0.5) navLinks.forEach(a => a.removeAttribute('aria-current'));
}
addEventListener('scroll', () => { if (!navRaf) navRaf = requestAnimationFrame(navInHero); }, { passive: true });

// ---- videos ----
const figures = [...document.querySelectorAll('figure')].filter(f => f.querySelector('video'));
const videos = figures.map(f => f.querySelector('video'));
const state = videos.map(() => ({ user: null, near: false, seen: false, playing: false }));
let anyPlaying = 0;

// with autoplay on there are no native controls: the video itself is the play/pause control
function setBtn(i, playing) {
  if (autoplay) videos[i].setAttribute('aria-label', playing ? 'Pause video' : 'Play video');
}
// every video that is in view plays; they are muted and short, and one starting no
// longer stops the others (which used to leave a video sitting paused in full view)
function playVideo(i) {
  const v = videos[i];
  if (v.preload === 'none') v.preload = 'metadata';
  const p = v.play();
  if (p && p.catch) p.catch(() => { state[i].playing = false; setBtn(i, false); updateHold(); });
}
function updateHold() {
  anyPlaying = videos.filter(v => !v.paused && !v.ended).length;
  if (smoke && coarse) smoke.hold(anyPlaying > 0);
  if (downwash && coarse) downwash.hold(anyPlaying > 0);
}
videos.forEach((v, i) => {
  v.addEventListener('play', () => { state[i].playing = true; setBtn(i, true); updateHold(); });
  v.addEventListener('pause', () => { state[i].playing = false; setBtn(i, false); updateHold(); });
});
function toggle(i) {
  const v = videos[i];
  if (v.paused) { state[i].user = 'play'; playVideo(i); }
  else { state[i].user = 'pause'; v.pause(); }
}
videos.forEach((v, i) => {
  v.addEventListener('click', () => { if (autoplay) toggle(i); });
  v.addEventListener('keydown', e => {
    if (autoplay && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); toggle(i); }
  });
});
let autoplay = false;
function applyVideoTier() {
  autoplay = !lowTier();
  videos.forEach((v, i) => {
    if (autoplay) { v.removeAttribute('controls'); v.tabIndex = 0; setBtn(i, !v.paused); }
    else { v.setAttribute('controls', ''); v.removeAttribute('tabindex'); v.removeAttribute('aria-label'); if (!v.paused) v.pause(); }
  });
}
applyVideoTier();
const nearIO = new IntersectionObserver(es => {
  for (const e of es) if (e.isIntersecting && e.target.preload === 'none') e.target.preload = 'metadata';
}, { rootMargin: '100%' });
videos.forEach(v => nearIO.observe(v));
const playIO = new IntersectionObserver(es => {
  for (const e of es) {
    const i = videos.indexOf(e.target);
    const v = e.target;
    if (e.intersectionRatio >= 0.5) {
      if (autoplay && state[i].user !== 'pause' && v.paused) playVideo(i);
    } else if (!v.paused) {
      v.pause();
      if (state[i].user === 'play') state[i].user = null;
    }
  }
}, { threshold: [0, 0.5, 1] });
videos.forEach(v => playIO.observe(v));

// ---- the labyrinth pipeline diagram: loaded when it comes near the screen, running only while it is
// near it, and left as a still drawing when motion is reduced or the device is low-tier ----
const mazeSvg = document.querySelector('.maze .pipeline');
let maze = null, mazeNear = false;
async function mazeState() {
  if (!mazeSvg) return;
  if (!mazeNear || lowTier()) { if (maze) maze.stop(); return; }
  if (!maze) {
    const mod = await import('./maze-diagram.js');
    maze = maze || mod.createMazeDiagram(mazeSvg);
    if (!maze) return;
    window.__maze = maze;
  }
  if (mazeNear && !lowTier()) maze.start();
}
if (mazeSvg) {
  new IntersectionObserver(es => { mazeNear = es[0].isIntersecting; mazeState(); }, { rootMargin: '25% 0px' }).observe(mazeSvg);
  reduced.addEventListener('change', mazeState);
}

// ---- side-project boxes: clicking one grows a pop-up panel out of it over the dimmed page. A click
// outside the panel, Esc or Close shrinks it back. The box's .full is moved into the panel and back,
// so its videos keep their play/pause handling. /#id opens that box's panel ----
const cards = [...document.querySelectorAll('details.card')];
const sheet = document.getElementById('sheet');
let openCard = null, closing = false, held = [];   // held: closing animations that hold their end state
const sheetMotion = () => !reduced.matches && sheet.animate;
// the transform that lays the panel exactly over the box's preview, for growing out of it and back
function fromBox(card) {
  const a = (card.querySelector('.peek') || card).getBoundingClientRect(), b = sheet.getBoundingClientRect();
  return `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`;
}
function openSheet(card, animate = true) {
  if (openCard || !sheet.showModal) return;
  openCard = card;
  document.getElementById('sheet-title').textContent = card.querySelector('h3').textContent;
  const spec = card.querySelector('.spec');
  document.getElementById('sheet-spec').textContent = spec ? spec.textContent : '';
  document.getElementById('sheet-body').append(card.querySelector('.full'));
  document.getElementById('sheet-in').scrollTop = 0;
  html.classList.add('sheet-open');
  sheet.showModal();
  history.replaceState(null, '', '#' + card.id);
  if (animate && sheetMotion()) {
    sheet.animate([{ transform: fromBox(card) }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.3,1)' });
    document.getElementById('sheet-in').animate([{ opacity: 0 }, { opacity: 0, offset: .35 }, { opacity: 1 }], { duration: 280 });
    try { sheet.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, pseudoElement: '::backdrop' }); } catch (e) { /* older browsers */ }
  }
}
function closeSheet() {
  if (!openCard || closing) return;
  if (!sheetMotion()) return sheet.close();
  closing = true;
  held.push(document.getElementById('sheet-in').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }));
  try { held.push(sheet.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, pseudoElement: '::backdrop', fill: 'forwards' })); } catch (e) { /* older browsers */ }
  const shrink = sheet.animate([{ transform: 'none' }, { transform: fromBox(openCard) }], { duration: 220, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
  held.push(shrink);
  shrink.finished.then(() => sheet.close(), () => sheet.close());
}
// everything that undoes opening, however the panel was closed
sheet.addEventListener('close', () => {
  const card = openCard;
  closing = false; openCard = null;
  if (!card) return;
  card.append(document.getElementById('sheet-body').querySelector('.full'));
  held.forEach(a => a.cancel()); held = [];
  html.classList.remove('sheet-open');
  history.replaceState(null, '', location.pathname + location.search);
  card.querySelector('summary').focus({ preventScroll: true });
});
sheet.addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });   // Esc: close with the animation
document.getElementById('sheet-x').addEventListener('click', closeSheet);
// a click that both starts and ends on the dimmed page closes it (a text selection dragged out of the panel does not)
let downOutside = false;
sheet.addEventListener('pointerdown', e => { downOutside = e.target === sheet; });
sheet.addEventListener('click', e => { if (e.target === sheet && downOutside) closeSheet(); });
cards.forEach(card => card.querySelector('summary').addEventListener('click', e => {
  if (!sheet.showModal) return;   // no <dialog> support: let the box open in place
  e.preventDefault();
  openSheet(card);
}));
function openFromHash() {
  const c = location.hash.length > 1 && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (!c || !cards.includes(c)) return;
  if (!sheet.showModal) { c.open = true; c.scrollIntoView({ block: 'start' }); return; }
  c.scrollIntoView({ block: 'center' });   // so the panel shrinks back into the right box when it closes
  openSheet(c, false);
}
addEventListener('hashchange', openFromHash);
openFromHash();

applyTier();
