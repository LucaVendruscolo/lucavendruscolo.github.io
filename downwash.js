// Downstream: smoke and a hovering drone beside the CV, drawn with Canvas 2D.
// The flow is an incompressible fluid solved on a coarse grid (semi-Lagrangian advection,
// vorticity confinement and a pressure projection, after Stam). The smoke is a density field on
// a finer grid, carried by the flow and drawn as a small image scaled up, so it stays soft.
// The drone's body is a solid in the flow and its two rotors are actuator discs: the cells under
// each blade are pushed toward a fast downward jet and the projection supplies the intake above,
// so smoke that drifts over the drone is pulled down through the blades. The pointer pushes the
// fluid and the drone. No dependencies. The 2D simplex noise is Gustavson's.

const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
const GX = new Float32Array([1, -1, 1, -1, 1, -1, 0, 0]);
const GY = new Float32Array([1, 1, -1, -1, 0, 0, 1, -1]);
const perm = new Uint8Array(512);
(function seedPerm(s) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const j = ((t ^ (t >>> 14)) >>> 0) % (i + 1);
    const k = p[i]; p[i] = p[j]; p[j] = k;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
})(2026);

function noise2(x, y) {
  const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s);
  const t = (i + j) * G2, x0 = x - (i - t), y0 = y - (j - t);
  const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  const ii = i & 255, jj = j & 255;
  let n = 0, t0 = 0.5 - x0 * x0 - y0 * y0, t1 = 0.5 - x1 * x1 - y1 * y1, t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t0 > 0) { const g = perm[ii + perm[jj]] & 7; t0 *= t0; n += t0 * t0 * (GX[g] * x0 + GY[g] * y0); }
  if (t1 > 0) { const g = perm[ii + i1 + perm[jj + j1]] & 7; t1 *= t1; n += t1 * t1 * (GX[g] * x1 + GY[g] * y1); }
  if (t2 > 0) { const g = perm[ii + 1 + perm[jj + 1]] & 7; t2 *= t2; n += t2 * t2 * (GX[g] * x2 + GY[g] * y2); }
  return 70 * n;
}
function smooth(t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }

// ---- tunables ----
const CELLS = 11000;        // velocity cells to aim for
const CELL_MIN = 5, CELL_MAX = 9;
const DYE = 2;              // smoke cells per velocity cell, per axis
const ITER = 30;            // pressure iterations per step (SOR)
const OMEGA = 1.5;
const VISC = 60;            // px^2/s
const CONFINE = 4;          // vorticity confinement
const CONF_MAX = 350;       // px/s^2, cap on the confinement force
const CONF_GATE = 240;      // px/s, no confinement where the flow is faster than this (the jet), so its shear layers do not run away
const CURL_GATE = 30;       // 1/s, nor next to curl this strong (the jet's edges), which it would sharpen into a grid-scale zigzag
const DAMP = 4;             // s, the flow relaxes toward the drift on this time scale
const BUOY = 4;             // px/s^2 per unit density, upward
const DISS = 16;            // s, smoke decay
const U_IN = 52;            // px/s, drift in from the left edge
const IN_LOW = 0.5;         // inflow outside the emitter band, fraction of U_IN
const IN_NOISE = 0.9;       // inflow wobble, fraction of U_IN
const IN_KY = 1 / 90, IN_KT = 0.35;
const EMIT = [0.14, 0.38];  // emitter band, fraction of the height
const EMIT_RATE = 7;        // density per second at the source
const EMIT_COLS = 3;        // smoke cells wide
const JET = 950;            // px/s, rotor jet
const JET_TAU = 0.03;       // s, blend time at the disc
const TOP_WIN = 120;        // px, half-width of the open stretch of the top edge above the drone
const ROTOR_R = 22;         // px, blade half-span
const ARM = 60;             // px, hub distance from the centre
const BLADE_Y = -9;         // px, blade line above the arm
const HOVER_X = 0.56, HOVER_Y = 0.38;
const WN = 2.2, ZETA = 0.45; // drone spring, rad/s and damping ratio
const BOB = 6;              // px, idle wander
const TILT_MAX = 0.35, TILT_GAIN = 0.0025, TILT_TAU = 0.18;
const RPS = 9;              // blade revolutions per second
const NUDGE_R = 48;         // px, radius of the pointer's push on the fluid
const VP_MAX = 700;         // px/s, clamp on the pointer velocity
const PTR_GAIN = 0.6;
const FOLLOW_R = 150;       // px, the drone starts following a pointer this close
const LOSE_R = 300;         // px, and gives up once it is this far away
const FOLLOW_DY = -28;      // px, it hovers this far above the pointer
const WN_FOLLOW = 3.2;      // rad/s, stiffer spring while following
const ALPHA_MAX = 0.62, ALPHA_K = 2.2;
const FADE_R = 0.18, FADE_B = 0.1, FADE_T = 0.06; // fractions of the size
const INK_R = 16, INK_G = 22, INK_B = 25;

export function createDownwash(opts) {
  const canvas = opts.canvas, coarse = !!opts.coarse;
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  const off = document.createElement('canvas');
  const octx = off.getContext('2d');
  if (!ctx || !octx) return null;

  let W = 0, H = 0, dpr = Math.min(devicePixelRatio || 1, 2);
  // velocity grid: interior cells 1..nx, 1..ny with a one-cell border; cell (i, j) is centred at ((i - .5) CELL, (j - .5) CELL)
  let CELL = 6, nx = 0, ny = 0, st = 0;
  let u = null, v = null, u2 = null, v2 = null, p = null, dv = null, curl = null, sol = null, solBase = null;
  let iter = ITER;
  // smoke grid: dnx x dny cells of dcell px, no border; cell (i, j) is centred at ((i + .5) dcell, (j + .5) dcell)
  let dnx = 0, dny = 0, dcell = 3;
  let d = null, d2 = null, mask = null, img = null;
  const alut = new Float32Array(1025);
  for (let n = 0; n <= 1024; n++) alut[n] = ALPHA_MAX * (1 - Math.exp(-ALPHA_K * n / 256));
  // the drone
  const D = { x: 0, y: 0, vx: 0, vy: 0, tilt: 0, hx: 0, hy: 0, phase: 0 };
  // pointer
  const ptr = { on: false, x: 0, y: 0, vx: 0, vy: 0, t: 0 };
  let simT = 0;
  // loop
  let running = false, raf = 0, last = 0, frameN = 0, degraded = 0;
  const times = []; let monT = 0, stepMs = 0;
  let visible = false, hidden = document.hidden, held = false, frozen = false, warmed = false;
  let sx = 0, sy = 0;

  // ---- geometry ----
  function rebuild() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    CELL = Math.max(CELL_MIN, Math.min(CELL_MAX, Math.round(Math.sqrt(W * H / CELLS))));
    nx = Math.ceil(W / CELL); ny = Math.ceil(H / CELL); st = nx + 2;
    const size = st * (ny + 2);
    u = new Float32Array(size); v = new Float32Array(size);
    u2 = new Float32Array(size); v2 = new Float32Array(size);
    p = new Float32Array(size); dv = new Float32Array(size); curl = new Float32Array(size);
    sol = new Uint8Array(size); solBase = new Uint8Array(size);
    // border codes: 3 = inflow (no pressure gradient through it), 4 = open (pressure zero); 1 = the drone
    for (let j = 0; j <= ny + 1; j++) { solBase[j * st] = 3; solBase[j * st + nx + 1] = 4; }
    for (let i = 1; i <= nx; i++) { solBase[i] = 4; solBase[(ny + 1) * st + i] = 4; }
    dcell = CELL / DYE; dnx = nx * DYE; dny = ny * DYE;
    d = new Float32Array(dnx * dny); d2 = new Float32Array(dnx * dny); mask = new Float32Array(dnx * dny);
    for (let j = 0; j < dny; j++) {
      const y = (j + 0.5) * dcell;
      const fy = smooth((H - y) / (FADE_B * H)) * smooth(y / (FADE_T * H));
      for (let i = 0; i < dnx; i++) {
        const x = (i + 0.5) * dcell;
        mask[j * dnx + i] = fy * smooth((W - x) / (FADE_R * W));
      }
    }
    off.width = dnx; off.height = dny;
    img = octx.createImageData(dnx, dny);
    const px = img.data;
    for (let k = 0; k < px.length; k += 4) { px[k] = INK_R; px[k + 1] = INK_G; px[k + 2] = INK_B; }
    D.hx = HOVER_X * W; D.hy = HOVER_Y * H;
    D.x = D.hx; D.y = D.hy; D.vx = 0; D.vy = 0; D.tilt = 0;
    simT = 0;
    for (let k = 0; k < size; k++) u[k] = U_IN * IN_LOW;
  }

  // ---- pointer ----
  function onMove(e) {
    if (coarse) return;
    const rc = canvas.getBoundingClientRect();
    const x = e.clientX - rc.left, y = e.clientY - rc.top, t = performance.now();
    const on = x >= 0 && x <= W && y >= 0 && y <= H;
    if (on && ptr.on) {
      const dt = Math.max(4, t - ptr.t) / 1000;
      ptr.vx += ((x - ptr.x) / dt - ptr.vx) * 0.45;
      ptr.vy += ((y - ptr.y) / dt - ptr.vy) * 0.45;
      const sp = Math.hypot(ptr.vx, ptr.vy);
      if (sp > VP_MAX) { ptr.vx *= VP_MAX / sp; ptr.vy *= VP_MAX / sp; }
    } else { ptr.vx = 0; ptr.vy = 0; }
    ptr.on = on; ptr.x = x; ptr.y = y; ptr.t = t;

  }
  function onLeave() { ptr.on = false; ptr.vx = 0; ptr.vy = 0; }

  // ---- the drone ----
  // a spring to a target with a little damping, so a move overshoots and settles. The target is the
  // hover point, or the pointer once it comes close, until it gets away again. The tilt follows the
  // correcting acceleration, the way a quad leans into a move
  let following = false;
  function drone(dt, t) {
    let tx = D.hx + BOB * noise2(t * 0.35, 3.3), ty = D.hy + BOB * noise2(7.7, t * 0.4);
    if (ptr.on) {
      const dist = Math.hypot(D.x - ptr.x, D.y - ptr.y - FOLLOW_DY);
      if (dist < FOLLOW_R) following = true; else if (dist > LOSE_R) following = false;
    } else following = false;
    if (following) { tx = ptr.x; ty = ptr.y + FOLLOW_DY; }
    const wn = following ? WN_FOLLOW : WN;
    const cx = -wn * wn * (D.x - tx) - 2 * ZETA * wn * D.vx;
    const cy = -wn * wn * (D.y - ty) - 2 * ZETA * wn * D.vy;
    D.vx += cx * dt; D.vy += cy * dt;
    D.x += D.vx * dt; D.y += D.vy * dt;
    const mx = ARM + ROTOR_R + 8, my0 = 24, my1 = H - 60;
    if (D.x < mx) { D.x = mx; D.vx = 0; } else if (D.x > W - mx) { D.x = W - mx; D.vx = 0; }
    if (D.y < my0) { D.y = my0; D.vy = 0; } else if (D.y > my1) { D.y = my1; D.vy = 0; }
    const target = Math.max(-TILT_MAX, Math.min(TILT_MAX, TILT_GAIN * cx));
    D.tilt += (target - D.tilt) * Math.min(1, dt / TILT_TAU);
    D.phase += 2 * Math.PI * RPS * dt;
  }

  // the body is the only solid: the arm is thinner than a cell and the discs sit on it.
  // The top edge is open only above the drone, so the intake draws from there and not down the emitter side.
  function markDrone() {
    sol.set(solBase);
    const x0 = D.x - TOP_WIN, x1 = D.x + TOP_WIN;
    for (let i = 1; i <= nx; i++) { const x = (i - 0.5) * CELL; sol[i] = x >= x0 && x <= x1 ? 4 : 3; }
    const c = Math.cos(D.tilt), s = Math.sin(D.tilt), r = 30;
    const i0 = Math.max(1, Math.floor((D.x - r) / CELL + 0.5)), i1 = Math.min(nx, Math.ceil((D.x + r) / CELL + 0.5));
    const j0 = Math.max(1, Math.floor((D.y - r) / CELL + 0.5)), j1 = Math.min(ny, Math.ceil((D.y + r) / CELL + 0.5));
    for (let j = j0; j <= j1; j++) {
      const dy = (j - 0.5) * CELL - D.y;
      for (let i = i0; i <= i1; i++) {
        const dx = (i - 0.5) * CELL - D.x;
        const lx = dx * c + dy * s, ly = -dx * s + dy * c;
        if (lx > -17 && lx < 17 && ly > 0 && ly < 14) sol[j * st + i] = 1;
      }
    }
  }
  function solidAt(x, y) {
    let i = Math.floor(x / CELL) + 1, j = Math.floor(y / CELL) + 1;
    if (i < 1) i = 1; else if (i > nx) i = nx;
    if (j < 1) j = 1; else if (j > ny) j = ny;
    return sol[j * st + i] === 1;
  }

  // ---- fluid ----
  function sampleGrid(x, y) {
    let gx = x / CELL + 0.5, gy = y / CELL + 0.5;
    if (gx < 0) gx = 0; else if (gx > nx + 1) gx = nx + 1;
    if (gy < 0) gy = 0; else if (gy > ny + 1) gy = ny + 1;
    let i = Math.floor(gx), j = Math.floor(gy);
    if (i > nx) i = nx;
    if (j > ny) j = ny;
    const fx = gx - i, fy = gy - j;
    const a = j * st + i, b = a + st;
    sx = (u[a] * (1 - fx) + u[a + 1] * fx) * (1 - fy) + (u[b] * (1 - fx) + u[b + 1] * fx) * fy;
    sy = (v[a] * (1 - fx) + v[a + 1] * fx) * (1 - fy) + (v[b] * (1 - fx) + v[b + 1] * fx) * fy;
  }

  // inflow on the left with a wobble, the top open above the drone and a free-slip wall elsewhere, outflow right and bottom; every solid cell mirrors its
  // fluid neighbours about the shared face around the body's velocity (free slip)
  // the drift: full inside the emitter band, less elsewhere
  function band(y) { const y0 = EMIT[0] * H, y1 = EMIT[1] * H, ramp = 0.35 * (y1 - y0); return smooth((y - y0 + ramp) / ramp) * smooth((y1 + ramp - y) / ramp); }
  function drift(y) { return U_IN * (IN_LOW + (1 - IN_LOW) * band(y)); }

  function boundaries(t) {
    for (let j = 1; j <= ny; j++) {
      const y = (j - 0.5) * CELL, l = j * st, r = l + nx + 1;
      const band_ = band(y);
      u[l] = drift(y) * (1 + IN_NOISE * noise2(y * IN_KY, t * IN_KT));
      v[l] = U_IN * IN_NOISE * band_ * noise2(y * IN_KY + 5.1, t * IN_KT * 1.3);
      u[r] = Math.max(0, u[r - 1]); v[r] = v[r - 1];
    }
    for (let i = 0; i <= nx + 1; i++) {
      const b = (ny + 1) * st + i;
      u[i] = u[i + st]; v[i] = sol[i] === 4 ? v[i + st] : -v[i + st];
      u[b] = u[b - st]; v[b] = Math.max(0, v[b - st]);
    }
    const bu = D.vx, bv = D.vy;
    for (let j = 1; j <= ny; j++) {
      for (let i = 1; i <= nx; i++) {
        const k = j * st + i;
        if (sol[k] !== 1) continue;
        let su = 0, sv = 0, n = 0;
        if (!sol[k - 1]) { su -= u[k - 1] - bu; sv += v[k - 1] - bv; n++; }
        if (!sol[k + 1]) { su -= u[k + 1] - bu; sv += v[k + 1] - bv; n++; }
        if (!sol[k - st]) { su += u[k - st] - bu; sv -= v[k - st] - bv; n++; }
        if (!sol[k + st]) { su += u[k + st] - bu; sv -= v[k + st] - bv; n++; }
        if (n) { u[k] = bu + su / n; v[k] = bv + sv / n; } else { u[k] = bu; v[k] = bv; }
      }
    }
  }

  // blend the velocity inside a gaussian spot toward (tx, ty)
  function splat(cx, cy, r, tx, ty, k0) {
    const i0 = Math.max(1, Math.floor((cx - r) / CELL + 0.5)), i1 = Math.min(nx, Math.ceil((cx + r) / CELL + 0.5));
    const j0 = Math.max(1, Math.floor((cy - r) / CELL + 0.5)), j1 = Math.min(ny, Math.ceil((cy + r) / CELL + 0.5));
    const inv = 2 / (r * r), r2max = r * r;
    for (let j = j0; j <= j1; j++) {
      const y = (j - 0.5) * CELL - cy;
      for (let i = i0; i <= i1; i++) {
        const k = j * st + i;
        if (sol[k]) continue;
        const x = (i - 0.5) * CELL - cx, r2 = x * x + y * y;
        if (r2 > r2max) continue;
        const w = k0 * Math.exp(-r2 * inv);
        u[k] += (tx - u[k]) * w; v[k] += (ty - v[k]) * w;
      }
    }
  }

  // each rotor is an actuator disc: a thin slab under the blade whose cells are pushed toward the jet
  function rotors(dt) {
    const c = Math.cos(D.tilt), s = Math.sin(D.tilt);
    const jx = -s * JET, jy = c * JET, k0 = Math.min(1, dt / JET_TAU);
    const half = Math.max(4, 0.8 * CELL), ly0 = BLADE_Y + 4;
    for (let side = -1; side <= 1; side += 2) {
      const hx = D.x + side * ARM * c + ly0 * s, hy = D.y + side * ARM * s - ly0 * c;
      const r = ROTOR_R + 3 + half;
      const i0 = Math.max(1, Math.floor((hx - r) / CELL + 0.5)), i1 = Math.min(nx, Math.ceil((hx + r) / CELL + 0.5));
      const j0 = Math.max(1, Math.floor((hy - r) / CELL + 0.5)), j1 = Math.min(ny, Math.ceil((hy + r) / CELL + 0.5));
      for (let j = j0; j <= j1; j++) {
        const dy = (j - 0.5) * CELL - hy;
        for (let i = i0; i <= i1; i++) {
          const k = j * st + i;
          if (sol[k]) continue;
          const dx = (i - 0.5) * CELL - hx;
          const lx = dx * c + dy * s, ly = -dx * s + dy * c;
          if (lx < -ROTOR_R - 3 || lx > ROTOR_R + 3 || ly < -half || ly > half) continue;
          const kk = k0 * smooth((ROTOR_R + 3 - Math.abs(lx)) / 8);
          u[k] += (jx - u[k]) * kk; v[k] += (jy - v[k]) * kk;
        }
      }
    }
  }

  function computeCurl() {
    for (let j = 1; j <= ny; j++) {
      for (let i = 1; i <= nx; i++) {
        const k = j * st + i;
        if (sol[k] || sol[k - 1] || sol[k + 1] || sol[k - st] || sol[k + st]) { curl[k] = 0; continue; }
        curl[k] = 0.5 * ((v[k + 1] - v[k - 1]) - (u[k + st] - u[k - st])) / CELL;
      }
    }
  }

  function forces(dt) {
    computeCurl();
    const bb = BUOY * dt, kd = Math.min(1, dt / DAMP), gate2 = CONF_GATE * CONF_GATE;
    for (let j = 2; j < ny; j++) {
      const dj = (j - 1) * DYE * dnx, ua = drift((j - 0.5) * CELL);
      for (let i = 2; i < nx; i++) {
        const k = j * st + i;
        if (sol[k]) continue;
        // smoke is warm: it rises a little
        const q = dj + (i - 1) * DYE;
        v[k] -= bb * 0.25 * (d[q] + d[q + 1] + d[q + dnx] + d[q + dnx + 1]);
        // everything relaxes toward the drift
        u[k] += (ua - u[k]) * kd; v[k] -= v[k] * kd;
        // vorticity confinement keeps the curls in the slow smoke; the jet is left alone
        const sp2 = u[k] * u[k] + v[k] * v[k];
        if (sp2 >= gate2) continue;
        const cl = Math.abs(curl[k - 1]), cr = Math.abs(curl[k + 1]), cu = Math.abs(curl[k - st]), cd = Math.abs(curl[k + st]);
        if (cl > CURL_GATE || cr > CURL_GATE || cu > CURL_GATE || cd > CURL_GATE || Math.abs(curl[k]) > CURL_GATE) continue;
        const gx = cr - cl, gy = cd - cu;
        const len = Math.hypot(gx, gy);
        if (len < 1e-6) continue;
        let f = curl[k] * CONFINE * CELL * (1 - sp2 / gate2);
        if (f > CONF_MAX) f = CONF_MAX; else if (f < -CONF_MAX) f = -CONF_MAX;
        const w = f * dt / len;
        u[k] += gy * w; v[k] -= gx * w;
      }
    }
    if (ptr.on) {
      const sp = Math.hypot(ptr.vx, ptr.vy);
      if (sp > 30) splat(ptr.x, ptr.y, NUDGE_R, PTR_GAIN * ptr.vx, PTR_GAIN * ptr.vy, Math.min(1, dt / 0.16) * Math.min(1, sp / 400));
    }
    rotors(dt);
  }

  function advectField(dt) {
    for (let j = 1; j <= ny; j++) {
      const y0 = (j - 0.5) * CELL;
      for (let i = 1; i <= nx; i++) {
        const k = j * st + i;
        if (sol[k]) { u2[k] = u[k]; v2[k] = v[k]; continue; }
        sampleGrid((i - 0.5) * CELL - u[k] * dt, y0 - v[k] * dt);
        u2[k] = sx; v2[k] = sy;
      }
    }
    let t = u; u = u2; u2 = t; t = v; v = v2; v2 = t;
  }

  function diffuse(dt) {
    const kk = Math.min(0.2, VISC * dt / (CELL * CELL));
    for (let j = 1; j <= ny; j++) {
      for (let i = 1; i <= nx; i++) {
        const k = j * st + i;
        if (sol[k]) { u2[k] = u[k]; v2[k] = v[k]; continue; }
        u2[k] = u[k] + kk * (u[k - 1] + u[k + 1] + u[k - st] + u[k + st] - 4 * u[k]);
        v2[k] = v[k] + kk * (v[k - 1] + v[k + 1] + v[k - st] + v[k + st] - 4 * v[k]);
      }
    }
    let t = u; u = u2; u2 = t; t = v; v = v2; v2 = t;
  }

  // open borders (code 4) hold pressure zero; the inflow and the body take no pressure gradient
  function project() {
    const h = CELL, h2 = h * h;
    for (let j = 1; j <= ny; j++) {
      for (let i = 1; i <= nx; i++) {
        const k = j * st + i;
        if (sol[k]) { dv[k] = 0; p[k] = 0; continue; }
        dv[k] = 0.5 * (u[k + 1] - u[k - 1] + v[k + st] - v[k - st]) / h;
      }
    }
    for (let it = 0; it < iter; it++) {
      for (let j = 1; j <= ny; j++) {
        for (let i = 1; i <= nx; i++) {
          const k = j * st + i;
          if (sol[k]) continue;
          let sum = 0, n = 0, t;
          t = sol[k - 1]; if (t === 0) { sum += p[k - 1]; n++; } else if (t === 4) n++;
          t = sol[k + 1]; if (t === 0) { sum += p[k + 1]; n++; } else if (t === 4) n++;
          t = sol[k - st]; if (t === 0) { sum += p[k - st]; n++; } else if (t === 4) n++;
          t = sol[k + st]; if (t === 0) { sum += p[k + st]; n++; } else if (t === 4) n++;
          const gs = n ? (sum - dv[k] * h2) / n : 0;
          p[k] += OMEGA * (gs - p[k]);
        }
      }
    }
    for (let j = 1; j <= ny; j++) {
      for (let i = 1; i <= nx; i++) {
        const k = j * st + i;
        if (sol[k]) continue;
        const pk = p[k];
        let t;
        t = sol[k - 1]; const pl = t === 0 ? p[k - 1] : t === 4 ? 0 : pk;
        t = sol[k + 1]; const pr = t === 0 ? p[k + 1] : t === 4 ? 0 : pk;
        t = sol[k - st]; const pu = t === 0 ? p[k - st] : t === 4 ? 0 : pk;
        t = sol[k + st]; const pd = t === 0 ? p[k + st] : t === 4 ? 0 : pk;
        u[k] -= 0.5 * (pr - pl) / h; v[k] -= 0.5 * (pd - pu) / h;
      }
    }
  }

  function fluid(dt, t) {
    markDrone();
    boundaries(t);
    advectField(dt);
    boundaries(t);
    diffuse(dt);
    forces(dt);
    boundaries(t);
    project();
    boundaries(t);
  }

  // ---- smoke ----
  function sampleDye(x, y) {
    const gx = x / dcell - 0.5, gy = y / dcell - 0.5;
    if (gx < -1 || gx > dnx || gy < -1 || gy > dny) return 0;
    let i = Math.floor(gx), j = Math.floor(gy);
    let fx = gx - i, fy = gy - j;
    if (i < 0) { i = 0; fx = 0; } else if (i >= dnx - 1) { i = dnx - 2; fx = 1; }
    if (j < 0) { j = 0; fy = 0; } else if (j >= dny - 1) { j = dny - 2; fy = 1; }
    const a = j * dnx + i, b = a + dnx;
    return (d[a] * (1 - fx) + d[a + 1] * fx) * (1 - fy) + (d[b] * (1 - fx) + d[b + 1] * fx) * fy;
  }

  function advectDye(dt) {
    const dec = Math.exp(-dt / DISS);
    for (let j = 0; j < dny; j++) {
      const y = (j + 0.5) * dcell;
      for (let i = 0; i < dnx; i++) {
        const x = (i + 0.5) * dcell, k = j * dnx + i;
        sampleGrid(x, y);
        sampleGrid(x - 0.5 * dt * sx, y - 0.5 * dt * sy);
        d2[k] = solidAt(x, y) ? 0 : sampleDye(x - dt * sx, y - dt * sy) * dec;
      }
    }
    const t = d; d = d2; d2 = t;
  }

  // smoke leaves the left edge in puffs
  function emit(dt, t) {
    const y0 = EMIT[0] * H, y1 = EMIT[1] * H, ramp = 0.12 * (y1 - y0);
    const j0 = Math.max(0, Math.floor(y0 / dcell)), j1 = Math.min(dny - 1, Math.ceil(y1 / dcell));
    const gate = 0.55 + 0.45 * noise2(t * 0.25, 9.1);
    for (let j = j0; j <= j1; j++) {
      const y = (j + 0.5) * dcell;
      const env = smooth((y - y0) / ramp) * smooth((y1 - y) / ramp);
      const puff = smooth((0.5 + 0.5 * noise2(y * 0.015 + 1.3, t * 0.7) - 0.15) / 0.6);
      const add = EMIT_RATE * dt * env * puff * gate;
      if (add <= 0) continue;
      for (let i = 0; i < EMIT_COLS; i++) {
        const k = j * dnx + i, w = 1 - i / EMIT_COLS;
        d[k] = Math.min(2, d[k] + add * w);
      }
    }
  }

  // ---- draw ----
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const px = img.data;
    for (let k = 0, q = 3; k < d.length; k++, q += 4) {
      let n = d[k] * 256;
      if (n > 1024) n = 1024;
      px[q] = (255 * alut[n | 0] * mask[k] + 0.5) | 0;
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, 0, 0, dnx, dny, 0, 0, dnx * dcell, dny * dcell);
    drawDrone();
  }

  function drawDrone() {
    ctx.save();
    ctx.translate(D.x, D.y); ctx.rotate(D.tilt);
    ctx.strokeStyle = 'rgb(16,22,25)'; ctx.fillStyle = 'rgb(16,22,25)';
    ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // arm, pods, body, legs
    ctx.beginPath();
    ctx.moveTo(-ARM - 4, 0); ctx.lineTo(ARM + 4, 0);
    ctx.moveTo(-ARM - 4, -7); ctx.lineTo(-ARM + 4, -7); ctx.moveTo(-ARM - 4, -7); ctx.lineTo(-ARM - 4, 0); ctx.moveTo(-ARM + 4, -7); ctx.lineTo(-ARM + 4, 0);
    ctx.moveTo(ARM - 4, -7); ctx.lineTo(ARM + 4, -7); ctx.moveTo(ARM - 4, -7); ctx.lineTo(ARM - 4, 0); ctx.moveTo(ARM + 4, -7); ctx.lineTo(ARM + 4, 0);
    ctx.moveTo(-15, 0); ctx.lineTo(-17, 2); ctx.lineTo(-17, 12); ctx.lineTo(-15, 14); ctx.lineTo(15, 14); ctx.lineTo(17, 12); ctx.lineTo(17, 2); ctx.lineTo(15, 0);
    ctx.moveTo(-10, 14); ctx.lineTo(-13, 22); ctx.moveTo(10, 14); ctx.lineTo(13, 22);
    ctx.stroke();
    // blades: a faint line for the disc the blur makes, a darker one for where the blade is now
    for (let side = -1; side <= 1; side += 2) {
      const hx = side * ARM;
      ctx.globalAlpha = 0.22; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(hx - ROTOR_R, BLADE_Y); ctx.lineTo(hx + ROTOR_R, BLADE_Y); ctx.stroke();
      const len = ROTOR_R * Math.abs(Math.cos(D.phase + (side > 0 ? 0 : 1.1)));
      ctx.globalAlpha = 0.9; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(hx - len, BLADE_Y); ctx.lineTo(hx + len, BLADE_Y); ctx.stroke();
      ctx.beginPath(); ctx.arc(hx, BLADE_Y, 1.6, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.restore();
  }

  // ---- stepping ----
  function step(dt, now) {
    simT += dt;
    if (ptr.on && now - ptr.t > 80) { ptr.vx *= 0.7; ptr.vy *= 0.7; }
    drone(dt, simT);
    fluid(dt, simT);
    // long steps (half rate, warm-up) carry the smoke too far through the discs in one go and bead its edges
    const nsub = Math.min(3, Math.ceil(dt / 0.02));
    for (let i = 0; i < nsub; i++) advectDye(dt / nsub);
    emit(dt, simT);
  }

  function frame(t) {
    raf = 0;
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (!last) { last = t; return; }
    let dt = t - last;
    if (dt < 12) return;
    if (degraded >= 1 && (frameN++ & 1)) return;
    if (warmed && dt < 200) {
      times.push(dt);
      if (t - monT > 2000) {
        monT = t;
        if (times.length > 20) {
          const sorted = times.slice().sort((a, b) => a - b);
          const p90 = sorted[Math.floor(sorted.length * 0.9)];
          if (p90 > 24) { degraded++; iter = Math.max(12, ITER >> 1); if (degraded >= 2) { freeze(); return; } }
          else if (degraded === 1 && p90 < 18) { degraded = 0; iter = ITER; }
        }
        times.length = 0;
      }
    }
    last = t;
    dt = Math.min(33, dt) / 1000;
    const t0 = performance.now();
    // a long frame is taken in two steps: one step of it carries the jet through the discs in one jump and beads its edges
    const n = degraded ? 1 : Math.min(2, Math.ceil(dt / 0.02));
    for (let i = 0; i < n; i++) step(dt / n, t);
    draw();
    stepMs += (performance.now() - t0 - stepMs) * 0.1;
  }

  function freeze() { frozen = true; stop(); }
  function loop() {
    if (running || frozen || held || hidden || !visible || !warmed) return;
    running = true; last = 0; raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  // ---- arrival: let the smoke cross before the canvas is shown ----
  function warm(done) {
    let i = 0;
    const slice = (deadline) => {
      const budget = deadline && deadline.timeRemaining ? Math.max(4, deadline.timeRemaining()) : 12;
      const t0 = performance.now();
      while (i < 140 && performance.now() - t0 < budget) { step(0.05, performance.now()); i++; }
      if (i < 140) schedule(slice);
      else { draw(); warmed = true; done(); }
    };
    schedule(slice);
  }
  function schedule(fn) {
    if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 80 }); else setTimeout(() => fn(null), 0);
  }

  // ---- public ----
  let sizeTimer = 0, lastW = 0, lastH = 0, ro = null, io = null;
  function onResize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 2)) return;
    clearTimeout(sizeTimer);
    sizeTimer = setTimeout(() => {
      lastW = w; lastH = h;
      rebuild();
      for (let i = 0; i < 60; i++) step(0.05, performance.now());
      if (warmed) draw();
    }, 150);
  }
  function onVisibility() { hidden = document.hidden; if (hidden) stop(); else loop(); }

  const api = {
    start() {
      lastW = canvas.clientWidth; lastH = canvas.clientHeight;
      if (!lastW || !lastH) return;
      rebuild();
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerleave', onLeave);
      document.addEventListener('pointerleave', onLeave);
      document.addEventListener('visibilitychange', onVisibility);
      if (window.ResizeObserver) { ro = new ResizeObserver(onResize); ro.observe(canvas); } else window.addEventListener('resize', onResize);
      io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) loop(); else stop(); }, { threshold: [0, 0.05] });
      io.observe(canvas);
      warm(() => { if (opts.onWarm) opts.onWarm(); loop(); });
    },
    hold(h) { held = h; if (h) stop(); else loop(); },
    stats() {
      let vmax = 0, smoke = 0;
      for (let j = 1; j <= ny; j++) for (let i = 1; i <= nx; i++) {
        const k = j * st + i; if (sol[k]) continue;
        const sp = Math.hypot(u[k], v[k]); if (sp > vmax) vmax = sp;
      }
      for (let k = 0; k < d.length; k++) smoke += d[k];
      return { CELL, nx, ny, dnx, dny, stepMs: +stepMs.toFixed(2), vmax: Math.round(vmax), smoke: Math.round(smoke), drone: { x: Math.round(D.x), y: Math.round(D.y), tilt: +D.tilt.toFixed(2) }, ptr: ptr.on, degraded, iter, running };
    },
    destroy() {
      stop();
      clearTimeout(sizeTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      ctx.clearRect(0, 0, W, H);
    }
  };
  return api;
}
