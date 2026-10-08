// Downstream: tier gate, Pause button, nav state, videos.
const html = document.documentElement;
html.classList.add('js');

const hero = document.getElementById('top');
const h1 = document.getElementById('name');
const canvas = document.getElementById('smoke');
const bar = document.getElementById('bar');
const mark = bar.querySelector('.mark');
const pauseBtn = document.getElementById('pause');
const cv = document.getElementById('cv');
const cvCanvas = document.getElementById('downwash');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const wide = matchMedia('(min-width: 1000px)');
const coarse = matchMedia('(pointer: coarse)').matches;
const capture = new URLSearchParams(location.search).has('capture');
const lowTier = () => reduced.matches || (navigator.connection && navigator.connection.saveData) || (navigator.deviceMemory && navigator.deviceMemory < 4);
const KEY = 'a:smoke';
let store = null;
try { store = localStorage; } catch (e) { store = null; }
const userPaused = () => { try { return store && store.getItem(KEY) === 'paused'; } catch (e) { return false; } };

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
  if (downwash || userPaused() || lowTier() || !wide.matches) return;
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
  else if (cvNear && canRun && !lowTier() && !userPaused()) startDownwash();
}, { rootMargin: '100%' }).observe(cv);

function applyTier() {
  const paused = userPaused();
  // the still stands in for the smoke only when the smoke will not run; otherwise the hero opens on paper
  html.classList.toggle('anim', canRun && !lowTier() && !paused);
  if (canRun && !lowTier()) {
    pauseBtn.hidden = false;
    pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    pauseBtn.textContent = paused ? 'Resume the smoke' : 'Pause the smoke';
    if (paused) { stopSmoke(); stopDownwash(); }
    else { startSmoke(); if (wide.matches) startDownwash(); else stopDownwash(); }
  } else {
    pauseBtn.hidden = true;
    stopSmoke();
    stopDownwash();
  }
}
pauseBtn.addEventListener('click', () => {
  const now = userPaused();
  try { if (store) store.setItem(KEY, now ? 'live' : 'paused'); } catch (e) { /* private mode */ }
  applyTier();
});
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
addEventListener('scroll', () => {
  if (hero.getBoundingClientRect().bottom > innerHeight * 0.5) navLinks.forEach(a => a.removeAttribute('aria-current'));
}, { passive: true });

// ---- videos ----
const figures = [...document.querySelectorAll('figure')].filter(f => f.querySelector('video'));
const videos = figures.map(f => f.querySelector('video'));
const buttons = figures.map(f => f.querySelector('.vbtn'));
const state = videos.map(() => ({ user: null, near: false, seen: false, playing: false }));
let anyPlaying = 0;

function setBtn(i, playing) {
  if (buttons[i]) buttons[i].textContent = playing ? 'Pause video' : 'Play video';
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
buttons.forEach((b, i) => {
  if (!b) return;
  b.addEventListener('click', () => {
    const v = videos[i];
    if (v.paused) { state[i].user = 'play'; playVideo(i); }
    else { state[i].user = 'pause'; v.pause(); }
  });
});
let autoplay = false;
function applyVideoTier() {
  autoplay = !lowTier();
  videos.forEach((v, i) => {
    if (autoplay) { v.removeAttribute('controls'); if (buttons[i]) buttons[i].hidden = false; setBtn(i, !v.paused); }
    else { v.setAttribute('controls', ''); if (buttons[i]) buttons[i].hidden = true; if (!v.paused) v.pause(); }
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

applyTier();
