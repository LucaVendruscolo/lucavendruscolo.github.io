// The labyrinth figure, stepped through one control step at a time and slowed down. (a) is the control loop:
// each block is outlined as its stage runs and a token carries the data along the arrows. (b) is the board from
// above, traced from the rig: the ball p is projected onto the printed route at q, progress rho is the distance
// along the route to q over its length, and the reward is 100 times the change in rho (MazeGame,
// sheeprl/envs/BallGame.py). After a few steps the ball rolls off the route into a hole, the episode ends and the
// re-loader returns it to the start.

const STEP = 4.4;                                         // seconds per control step on screen (1/45 s on the rig)
const STAGES = [0, 0.6, 1.3, 2.1, 2.7, 3.3, STEP];         // camera, YOLOv5s, state + reward, DreamerV3, Arduino, labyrinth
const OFF = [-4, 5, -5, 4, -3];                           // how far the ball sits off the route at each step

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = u => u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
const minus = s => s.replace(/-/g, '−');
const sgn = v => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(1);
const deg = a => Math.round(-30 + (a + 1) * 30);         // BallGame.step: an action in [-1, 1] becomes -30..30 degrees

export function createMazeDiagram(root) {
  const $ = id => root.querySelector('#' + id);
  // panel (a) exists twice, a wide layout and a narrow one for phones; both are kept in step
  const loops = [...root.querySelectorAll('.fg-a')].map(svg => ({
    blocks: [...svg.querySelectorAll('[data-b]')], arrows: [...svg.querySelectorAll('[data-w]')], token: svg.querySelector('.fg-token'),
    ends: [...svg.querySelectorAll('[data-w]')].map(a => a.querySelector('path').getAttribute('d').match(/-?[\d.]+/g).map(Number)),
  }));
  const done = $('mz-done'), proj = $('mz-proj'), q = $('mz-q'), ball = $('mz-ball');
  const marker = $('mz-marker'), board = root.querySelector('.fg-b');
  const live = { rho: [$('mz-rho')], r2: [$('mz-r2')] };
  for (const el of root.querySelectorAll('[data-v]')) (live[el.dataset.v] = live[el.dataset.v] || []).push(el);
  const route = board && board.querySelector('polyline.fg-route');
  if (!route || !loops.length || !board.dataset.hole) return null;
  const HOLE = board.dataset.hole.split(',').map(Number), FALL = +board.dataset.fall;
  const RHO = [0, 0.25, 0.5, 0.75, 1].map(v => v * FALL);
  const POLE = marker.getAttribute('transform').match(/-?[\d.]+/g).map(Number);

  // the route as the dense polyline it is drawn with
  const W = route.getAttribute('points').trim().split(/\s+/).map(pt => pt.split(',').map(Number));
  const cum = [0];
  for (let i = 1; i < W.length; i++) cum.push(cum[i - 1] + Math.hypot(W[i][0] - W[i - 1][0], W[i][1] - W[i - 1][1]));
  const S = cum[cum.length - 1];
  const along = rho => {   // point, unit normal and segment index at a fraction of the route
    const d = clamp(rho, 0, 1) * S;
    let i = 0; while (i < W.length - 2 && cum[i + 1] < d) i++;
    const len = cum[i + 1] - cum[i] || 1, t = (d - cum[i]) / len;
    const dx = (W[i + 1][0] - W[i][0]) / len, dy = (W[i + 1][1] - W[i][1]) / len;
    return { p: [W[i][0] + t * (W[i + 1][0] - W[i][0]), W[i][1] + t * (W[i + 1][1] - W[i][1])], n: [-dy, dx], i };
  };
  const ballPos = (rho, off) => { const a = along(rho); return [a.p[0] + off * a.n[0], a.p[1] + off * a.n[1]]; };

  // one episode: steady progress along the route, a roll into the hole, then the reset
  const steps = RHO.slice(0, -1).map((from, k) => {
    const to = RHO[k + 1], a = along((from + to) / 2), d = [a.n[1], -a.n[0]];
    return { kind: 'move', from, to, off: OFF[k], offTo: OFF[k + 1], a: [clamp(d[0] * 0.7 + 0.08 * Math.sin(k * 2.1), -1, 1), clamp(d[1] * 0.7 + 0.08 * Math.cos(k * 1.7), -1, 1)] };
  });
  const last = RHO.length - 1, lp = ballPos(RHO[last], OFF[last]), toH = [HOLE[0] - lp[0], HOLE[1] - lp[1]], th = Math.hypot(...toH);
  steps.push({ kind: 'fall', from: RHO[last], to: null, off: OFF[last], a: [toH[0] / th * 0.85, toH[1] / th * 0.85] });
  steps.push({ kind: 'reset', from: null, to: 0, off: 0, offTo: OFF[0], a: null });
  const TOTAL = steps.length * STEP;
  const prevOf = k => steps[(k - 1 + steps.length) % steps.length];
  const seenAt = st => st.kind === 'reset' ? null : ballPos(st.from, st.off);   // where this step's frame sees the ball
  const px = b => [Math.round((b[0] - 34) * 640 / 632), Math.round((b[1] - 59) * 480 / 425)];   // board units -> camera pixels
  const tilt = a => a ? [POLE[0] + a[0] * 9, POLE[1] + a[1] * 9] : POLE;

  // the values each stage reports for step k
  const values = k => {
    const st = steps[k], prev = prevOf(k), b = seenAt(st);
    if (!b) return { p: 'no ball', r: '+0.0', rho: '0.00', r2: '+0.0, episode over', a: '–', cmd: 'MotorON' };
    const r = (st.from - (prev.from ?? 0)) * 100, c = px(b);
    return {
      p: `(${c[0]}, ${c[1]})`, r: sgn(r), rho: st.from.toFixed(2), r2: sgn(r),
      a: minus(`(${st.a[0].toFixed(2)}, ${st.a[1].toFixed(2)})`), cmd: minus(`Move,${-deg(st.a[0])},${-deg(st.a[1])}`),
    };
  };
  const STAGE_OF = { p: 1, r: 2, rho: 2, r2: 2, a: 3, cmd: 4 };
  const shown = {};
  const set = (el, attrs) => { for (const k in attrs) el.setAttribute(k, attrs[k]); };

  function render(t) {
    t = ((t % TOTAL) + TOTAL) % TOTAL;
    const k = Math.floor(t / STEP), u = t - k * STEP, st = steps[k], prev = prevOf(k);
    let stage = 0; while (stage < 5 && u >= STAGES[stage + 1]) stage++;
    const sp = clamp((u - STAGES[stage]) / (STAGES[stage + 1] - STAGES[stage]), 0, 1);

    // (a) the running block, and the token travelling the arrow out of it in the second half of the stage
    const w = clamp((sp - 0.45) / 0.55, 0, 1);
    for (const L of loops) {
      L.blocks.forEach((b, i) => b.classList.toggle('on', i === stage));
      L.arrows.forEach((a, i) => a.classList.toggle('on', i === stage && w > 0));
      const e = L.ends[stage];
      set(L.token, { cx: (e[0] + (e[2] - e[0]) * ease(w)).toFixed(1), cy: (e[1] + (e[3] - e[1]) * ease(w)).toFixed(1) });
      L.token.style.opacity = w > 0 && w < 1 ? 1 : 0;
    }

    // readouts: this step's value once its stage has started, the last step's until then
    const now = values(k), before = values((k - 1 + steps.length) % steps.length);
    for (const key in live) {
      const v = stage >= STAGE_OF[key] ? now[key] : before[key];
      if (shown[key] !== v) { for (const el of live[key]) el.textContent = v; shown[key] = v; }
    }

    // (b) the ball stays where this frame saw it, then rolls in the labyrinth stage; the marker leans with the tilt
    const roll = stage === 5 ? ease(sp) : 0;
    let b, show = 1, r = 7.5;
    if (st.kind === 'move') b = ballPos(st.from + (st.to - st.from) * roll, st.off + (st.offTo - st.off) * roll);
    else if (st.kind === 'fall') { const s0 = seenAt(st); b = [s0[0] + (HOLE[0] - s0[0]) * roll, s0[1] + (HOLE[1] - s0[1]) * roll]; r = 7.5 * (1 - clamp((roll - 0.75) / 0.25, 0, 1)); }
    else { b = ballPos(0, st.offTo); show = stage === 5 ? clamp(roll * 1.6 - 0.3, 0, 1) : 0; }
    set(ball, { cx: b[0].toFixed(1), cy: b[1].toFixed(1), r: r.toFixed(2) });
    ball.style.opacity = show;
    const ta = stage === 5 ? roll : 0, a0 = prev.a || [1 / 3, 1], a1 = st.a || [1 / 3, 1];   // reset tilts to move_motors(10, 30)
    const m = tilt([a0[0] + (a1[0] - a0[0]) * ta, a0[1] + (a1[1] - a0[1]) * ta]);
    set(marker, { transform: `translate(${m[0].toFixed(1)} ${m[1].toFixed(1)})` });

    // the state stage projects the seen ball onto the route and extends the progress; it fades as the ball rolls on
    const fromRho = prev.from ?? 0;
    let rho = fromRho, qp = null;
    if (st.kind === 'reset') rho = stage >= 2 ? 0 : fromRho;
    else if (stage >= 2) rho = fromRho + (st.from - fromRho) * ease(clamp((u - STAGES[2]) / 0.5, 0, 1));
    if (prev.kind === 'reset' && stage < 2) rho = 0;
    qp = along(rho);
    const pts = rho > 0 ? W.slice(0, qp.i + 1).concat([qp.p]) : [W[0], W[0]];
    done.setAttribute('points', pts.map(pt => pt[0].toFixed(1) + ',' + pt[1].toFixed(1)).join(' '));
    const seen = seenAt(st);
    let projShow = 0;
    if (seen && stage >= 2) projShow = stage === 5 ? 1 - roll : 1;
    if (seen) {
      const qs = along(st.from);
      set(proj, { x1: seen[0].toFixed(1), y1: seen[1].toFixed(1), x2: qs.p[0].toFixed(1), y2: qs.p[1].toFixed(1) });
      set(q, { x: (qs.p[0] - 4).toFixed(1), y: (qs.p[1] - 4).toFixed(1) });
    }
    proj.style.opacity = q.style.opacity = projShow.toFixed(2);
  }

  // wanted: the page wants it running (the figure is near the screen); it also halts while the tab is hidden
  let raf = 0, t = STEP, last0 = 0, running = false, wanted = false;   // start one step in, after a normal step
  function frame(now) {
    if (!running) return;
    const dt = last0 ? Math.min(0.1, (now - last0) / 1000) : 0;
    last0 = now; t += dt;
    render(t);
    raf = requestAnimationFrame(frame);
  }
  function run() {
    if (running || !wanted || document.hidden) return;
    running = true; last0 = 0; root.classList.add('live');
    raf = requestAnimationFrame(frame);
  }
  function halt() { running = false; cancelAnimationFrame(raf); last0 = 0; }
  document.addEventListener('visibilitychange', () => { if (document.hidden) halt(); else run(); });
  render(t);
  return {
    start() { wanted = true; run(); },
    stop() { wanted = false; halt(); },
    seek(s) { t = s; root.classList.add('live'); render(t); },
    get running() { return running; },
    duration: TOTAL,
  };
}
