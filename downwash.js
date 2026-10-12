// Downstream: smoke and a hovering drone beside the CV, drawn with Canvas 2D.
// The flow is an incompressible fluid on a coarse staggered (MAC) grid, as in the hero: semi-Lagrangian
// advection, a little viscosity, vorticity confinement and a pressure projection whose divergence,
// Laplacian and gradient agree, so the air neither piles up nor thins out. The smoke is a density field
// on a finer grid, carried by the flow and drawn as a small image scaled up, so it stays soft.
// The drone's body is a solid that moves and turns through the air, and its two rotors are actuator
// discs: a thin slab just under each blade is pushed toward a fast jet along the drone's own down, and
// the projection supplies the intake above, so smoke that drifts over the drone is pulled down through
// the blades. The pointer pushes the fluid and the drone. No dependencies. The 2D simplex noise is
// Gustavson's.

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
const RCP = new Float64Array([0, 1, 1 / 2, 1 / 3, 1 / 4]);   // 1 / n for the pressure sweep, 0 for a boxed-in cell
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
  // Staggered (MAC) velocity grid, as in the hero: cells (i, j) centred at ((i + .5) h, (j + .5) h) hold the
  // pressure; u lives on the vertical faces, (nx + 1) by ny with u[i, j] at (i h, (j + .5) h), and v on the
  // horizontal ones, nx by (ny + 1) with v[i, j] at ((i + .5) h, j h). The flow through a face is exactly the
  // velocity stored on it, so the projection leaves every cell with zero net flow
  let CELL = 6, nx = 0, ny = 0, su = 0, NU = 0, NV = 0, NC = 0;
  let u = null, v = null, u2 = null, v2 = null, p = null, dv = null, sol = null, uf = null, vf = null, nnb = null;
  let wz = null, fcx = null, fcy = null;   // curl, and the confinement force, at the cell centres
  let iter = ITER;
  // smoke grid: dnx x dny cells of dcell px, no border; cell (i, j) is centred at ((i + .5) dcell, (j + .5) dcell)
  let dnx = 0, dny = 0, dcell = 3;
  let d = null, d2 = null, mask = null, img = null;
  // where each smoke cell's departure point lands this step: base index (-1 for none) and bilinear weights
  let dA = null, dFx = null, dFy = null;
  // each smoke cell's centre on the u and v grids (fixed): base index and bilinear weights
  let cUA = null, cUx = null, cUy = null, cVA = null, cVx = null, cVy = null;
  const alut = new Float32Array(1025);
  for (let n = 0; n <= 1024; n++) alut[n] = ALPHA_MAX * (1 - Math.exp(-ALPHA_K * n / 256));
  // the drone; w is its rate of tilt
  const D = { x: 0, y: 0, vx: 0, vy: 0, tilt: 0, w: 0, hx: 0, hy: 0, phase: 0 };
  // pointer
  const ptr = { on: false, x: 0, y: 0, vx: 0, vy: 0, t: 0 };
  let simT = 0;
  // loop
  let running = false, raf = 0, last = 0, frameN = 0, degraded = 0;
  const times = []; let monT = 0, stepMs = 0;
  let visible = false, hidden = document.hidden, held = false, frozen = false, warmed = false;

  // ---- geometry ----
  function rebuild() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    CELL = Math.max(CELL_MIN, Math.min(CELL_MAX, Math.round(Math.sqrt(W * H / CELLS))));
    nx = Math.ceil(W / CELL); ny = Math.ceil(H / CELL); su = nx + 1;
    NU = su * ny; NV = nx * (ny + 1); NC = nx * ny;
    u = new Float32Array(NU); u2 = new Float32Array(NU); uf = new Uint8Array(NU);
    v = new Float32Array(NV); v2 = new Float32Array(NV); vf = new Uint8Array(NV);
    p = new Float32Array(NC); dv = new Float32Array(NC); sol = new Uint8Array(NC); nnb = new Uint8Array(NC);
    wz = new Float32Array(NC); fcx = new Float32Array(NC); fcy = new Float32Array(NC);
    dcell = CELL / DYE; dnx = nx * DYE; dny = ny * DYE;
    const nd = dnx * dny;
    d = new Float32Array(nd); d2 = new Float32Array(nd); mask = new Float32Array(nd);
    dA = new Int32Array(nd); dFx = new Float64Array(nd); dFy = new Float64Array(nd);
    cUA = new Int32Array(nd); cUx = new Float64Array(nd); cUy = new Float64Array(nd);
    cVA = new Int32Array(nd); cVx = new Float64Array(nd); cVy = new Float64Array(nd);
    for (let j = 0; j < dny; j++) {
      const y = (j + 0.5) * dcell;
      for (let i = 0; i < dnx; i++) {
        const x = (i + 0.5) * dcell, k = j * dnx + i;   // placed as sampleU and sampleV would place them
        let fx = x / CELL, fy = y / CELL - 0.5;
        if (fx < 0) fx = 0; else if (fx > nx - 0.001) fx = nx - 0.001;
        if (fy < 0) fy = 0; else if (fy > ny - 1.001) fy = ny - 1.001;
        cUA[k] = (fy | 0) * su + (fx | 0); cUx[k] = fx - (fx | 0); cUy[k] = fy - (fy | 0);
        fx = x / CELL - 0.5; fy = y / CELL;
        if (fx < 0) fx = 0; else if (fx > nx - 1.001) fx = nx - 1.001;
        if (fy < 0) fy = 0; else if (fy > ny - 0.001) fy = ny - 0.001;
        cVA[k] = (fy | 0) * nx + (fx | 0); cVx[k] = fx - (fx | 0); cVy[k] = fy - (fy | 0);
        mask[k] = smooth((H - y) / (FADE_B * H)) * smooth(y / (FADE_T * H)) * smooth((W - x) / (FADE_R * W));
      }
    }
    off.width = dnx; off.height = dny;
    img = octx.createImageData(dnx, dny);
    const px = img.data;
    for (let k = 0; k < px.length; k += 4) { px[k] = INK_R; px[k + 1] = INK_G; px[k + 2] = INK_B; }
    D.hx = HOVER_X * W; D.hy = HOVER_Y * H;
    D.x = D.hx; D.y = D.hy; D.vx = 0; D.vy = 0; D.tilt = 0; D.w = 0;
    simT = 0;
    u.fill(U_IN * IN_LOW);
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
    const tilt0 = D.tilt;
    D.tilt += (target - D.tilt) * Math.min(1, dt / TILT_TAU);
    D.w = (D.tilt - tilt0) / dt;
    D.phase += 2 * Math.PI * RPS * dt;
  }
  // the velocity of the drone's body at (x, y): it moves and turns as one piece
  function bodyU(x, y) { return D.vx - D.w * (y - D.y); }
  function bodyV(x, y) { return D.vy + D.w * (x - D.x); }

  // The body is the only solid: the arm is thinner than a cell and the discs sit on it. A face is free when
  // the projection may change it; the others are given: the inflow on the left, the top edge except the
  // open stretch above the drone (so the intake draws from there and not down the emitter side), and every
  // face that touches the body, which moves with it. The right and bottom edges are open (pressure zero).
  function markDrone() {
    sol.fill(0);
    const c = Math.cos(D.tilt), s = Math.sin(D.tilt), r = 30;
    const i0 = Math.max(0, Math.floor((D.x - r) / CELL)), i1 = Math.min(nx - 1, Math.ceil((D.x + r) / CELL));
    const j0 = Math.max(0, Math.floor((D.y - r) / CELL)), j1 = Math.min(ny - 1, Math.ceil((D.y + r) / CELL));
    for (let j = j0; j <= j1; j++) {
      const dy = (j + 0.5) * CELL - D.y;
      for (let i = i0; i <= i1; i++) {
        const dx = (i + 0.5) * CELL - D.x;
        const lx = dx * c + dy * s, ly = -dx * s + dy * c;
        if (lx > -17 && lx < 17 && ly > 0 && ly < 14) sol[j * nx + i] = 1;
      }
    }
    for (let j = 0; j < ny; j++) {
      const row = j * nx;
      for (let i = 0; i <= nx; i++) {
        const k = j * su + i;
        if (i === 0) uf[k] = 0;
        else if (i === nx) uf[k] = sol[row + nx - 1] ? 0 : 1;
        else uf[k] = sol[row + i - 1] || sol[row + i] ? 0 : 1;
      }
    }
    const x0 = D.x - TOP_WIN, x1 = D.x + TOP_WIN;
    for (let i = 0; i < nx; i++) { const x = (i + 0.5) * CELL; vf[i] = x >= x0 && x <= x1 && !sol[i] ? 1 : 0; }
    for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) vf[j * nx + i] = sol[(j - 1) * nx + i] || sol[j * nx + i] ? 0 : 1;
    for (let i = 0; i < nx; i++) vf[ny * nx + i] = sol[(ny - 1) * nx + i] ? 0 : 1;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const c0 = j * nx + i, k = j * su + i;
        nnb[c0] = sol[c0] ? 0 : uf[k] + uf[k + 1] + vf[c0] + vf[c0 + nx];
      }
    }
  }
  function solidAt(x, y) {
    let i = Math.floor(x / CELL), j = Math.floor(y / CELL);
    if (i < 0) i = 0; else if (i > nx - 1) i = nx - 1;
    if (j < 0) j = 0; else if (j > ny - 1) j = ny - 1;
    return sol[j * nx + i] === 1;
  }

  // ---- fluid ----
  function sampleU(A, x, y) {
    let fx = x / CELL, fy = y / CELL - 0.5;
    if (fx < 0) fx = 0; else if (fx > nx - 0.001) fx = nx - 0.001;
    if (fy < 0) fy = 0; else if (fy > ny - 1.001) fy = ny - 1.001;
    const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * su + i;
    return (A[k] * (1 - tx) + A[k + 1] * tx) * (1 - ty) + (A[k + su] * (1 - tx) + A[k + su + 1] * tx) * ty;
  }
  function sampleV(A, x, y) {
    let fx = x / CELL - 0.5, fy = y / CELL;
    if (fx < 0) fx = 0; else if (fx > nx - 1.001) fx = nx - 1.001;
    if (fy < 0) fy = 0; else if (fy > ny - 0.001) fy = ny - 0.001;
    const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * nx + i;
    return (A[k] * (1 - tx) + A[k + 1] * tx) * (1 - ty) + (A[k + nx] * (1 - tx) + A[k + nx + 1] * tx) * ty;
  }

  // the drift: full inside the emitter band, less elsewhere
  function band(y) { const y0 = EMIT[0] * H, y1 = EMIT[1] * H, ramp = 0.35 * (y1 - y0); return smooth((y - y0 + ramp) / ramp) * smooth((y1 + ramp - y) / ramp); }
  function drift(y) { return U_IN * (IN_LOW + (1 - IN_LOW) * band(y)); }

  // the given faces: the inflow (with a wobble, and a sideways one carried in on the first column of v),
  // the closed stretches of the top edge, and the body's faces, which move with it
  function bc(t) {
    for (let j = 0; j < ny; j++) {
      const y = (j + 0.5) * CELL;
      u[j * su] = drift(y) * (1 + IN_NOISE * noise2(y * IN_KY, t * IN_KT));
    }
    for (let j = 1; j < ny; j++) {
      const y = j * CELL;
      v[j * nx] = U_IN * IN_NOISE * band(y) * noise2(y * IN_KY + 5.1, t * IN_KT * 1.3);
    }
    for (let i = 0; i < nx; i++) if (!vf[i]) v[i] = 0;
    const r = 30 + 2 * CELL;
    const i0 = Math.max(0, Math.floor((D.x - r) / CELL)), i1 = Math.min(nx - 1, Math.ceil((D.x + r) / CELL));
    const j0 = Math.max(0, Math.floor((D.y - r) / CELL)), j1 = Math.min(ny - 1, Math.ceil((D.y + r) / CELL));
    for (let j = j0; j <= j1; j++) {
      const y = (j + 0.5) * CELL;
      for (let i = Math.max(1, i0); i <= i1 + 1 && i <= nx; i++) {
        const c0 = j * nx + i;
        if ((i < nx && sol[c0]) || sol[c0 - 1]) u[j * su + i] = bodyU(i * CELL, y);
      }
    }
    for (let j = j0; j <= j1 + 1 && j <= ny; j++) {
      const y = j * CELL;
      for (let i = i0; i <= i1; i++) {
        const k = j * nx + i;
        if ((j < ny && sol[k]) || (j > 0 && sol[k - nx])) v[k] = bodyV((i + 0.5) * CELL, y);
      }
    }
  }

  function advect(dt) {
    for (let j = 0; j < ny; j++) {
      const y = (j + 0.5) * CELL;
      for (let i = 0; i <= nx; i++) {
        const k = j * su + i;
        if (!uf[k]) { u2[k] = u[k]; continue; }
        const x = i * CELL;
        u2[k] = sampleU(u, x - dt * u[k], y - dt * sampleV(v, x, y));
      }
    }
    for (let j = 0; j <= ny; j++) {
      const y = j * CELL;
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!vf[k]) { v2[k] = v[k]; continue; }
        const x = (i + 0.5) * CELL;
        v2[k] = sampleV(v, x - dt * sampleU(u, x, y), y - dt * v[k]);
      }
    }
    let t = u; u = u2; u2 = t; t = v; v = v2; v2 = t;
  }

  // explicit viscosity on the free faces; a given face (the body, a wall) takes part as a neighbour
  function diffuse(dt) {
    const kk = Math.min(0.2, VISC * dt / (CELL * CELL));
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const k = j * su + i;
        if (!uf[k]) { u2[k] = u[k]; continue; }
        const l = i > 0 ? k - 1 : k, r = i < nx ? k + 1 : k, a = j > 0 ? k - su : k, b = j < ny - 1 ? k + su : k;
        u2[k] = u[k] + kk * (u[l] + u[r] + u[a] + u[b] - 4 * u[k]);
      }
    }
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!vf[k]) { v2[k] = v[k]; continue; }
        const l = i > 0 ? k - 1 : k, r = i < nx - 1 ? k + 1 : k, a = j > 0 ? k - nx : k, b = j < ny ? k + nx : k;
        v2[k] = v[k] + kk * (v[l] + v[r] + v[a] + v[b] - 4 * v[k]);
      }
    }
    let t = u; u = u2; u2 = t; t = v; v = v2; v2 = t;
  }

  // blend the free faces inside a gaussian spot toward (tx, ty)
  function splat(cx, cy, r, tx, ty, k0) {
    const inv = 2 / (r * r), r2max = r * r;
    const i0 = Math.max(0, Math.floor((cx - r) / CELL)), i1 = Math.min(nx, Math.ceil((cx + r) / CELL));
    const j0 = Math.max(0, Math.floor((cy - r) / CELL)), j1 = Math.min(ny, Math.ceil((cy + r) / CELL));
    for (let j = j0; j <= Math.min(ny - 1, j1); j++) {
      const y = (j + 0.5) * CELL - cy;
      for (let i = i0; i <= i1; i++) {
        const k = j * su + i;
        if (!uf[k]) continue;
        const x = i * CELL - cx, r2 = x * x + y * y;
        if (r2 > r2max) continue;
        u[k] += (tx - u[k]) * k0 * Math.exp(-r2 * inv);
      }
    }
    for (let j = j0; j <= j1; j++) {
      const y = j * CELL - cy;
      for (let i = i0; i <= Math.min(nx - 1, i1); i++) {
        const k = j * nx + i;
        if (!vf[k]) continue;
        const x = (i + 0.5) * CELL - cx, r2 = x * x + y * y;
        if (r2 > r2max) continue;
        v[k] += (ty - v[k]) * k0 * Math.exp(-r2 * inv);
      }
    }
  }

  // each rotor is an actuator disc: a thin slab just under the blade whose faces are pushed toward the jet,
  // which leaves along the drone's own down
  function rotors(dt) {
    const c = Math.cos(D.tilt), s = Math.sin(D.tilt);
    const jx = -s * JET, jy = c * JET, k0 = Math.min(1, dt / JET_TAU);
    const half = Math.max(4, 0.8 * CELL), ly0 = BLADE_Y + 4, R = ROTOR_R + 3;
    for (let side = -1; side <= 1; side += 2) {
      // the hub, (side ARM, ly0) in the drone's frame, turned into the canvas as drawDrone turns it
      const hx = D.x + side * ARM * c - ly0 * s, hy = D.y + side * ARM * s + ly0 * c;
      const r = R + half + CELL;
      const i0 = Math.max(0, Math.floor((hx - r) / CELL)), i1 = Math.min(nx, Math.ceil((hx + r) / CELL));
      const j0 = Math.max(0, Math.floor((hy - r) / CELL)), j1 = Math.min(ny, Math.ceil((hy + r) / CELL));
      for (let j = j0; j <= Math.min(ny - 1, j1); j++) {
        const dy = (j + 0.5) * CELL - hy;
        for (let i = i0; i <= i1; i++) {
          const k = j * su + i;
          if (!uf[k]) continue;
          const dx = i * CELL - hx, lx = dx * c + dy * s, ly = -dx * s + dy * c;
          if (lx < -R || lx > R || ly < -half || ly > half) continue;
          u[k] += (jx - u[k]) * k0 * smooth((R - Math.abs(lx)) / 8);
        }
      }
      for (let j = j0; j <= j1; j++) {
        const dy = j * CELL - hy;
        for (let i = i0; i <= Math.min(nx - 1, i1); i++) {
          const k = j * nx + i;
          if (!vf[k]) continue;
          const dx = (i + 0.5) * CELL - hx, lx = dx * c + dy * s, ly = -dx * s + dy * c;
          if (lx < -R || lx > R || ly < -half || ly > half) continue;
          v[k] += (jy - v[k]) * k0 * smooth((R - Math.abs(lx)) / 8);
        }
      }
    }
  }

  function forces(dt) {
    // the curl at the cell centres, from the face velocities averaged to the centres
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const c0 = j * nx + i;
        if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1 || sol[c0] || sol[c0 - 1] || sol[c0 + 1] || sol[c0 - nx] || sol[c0 + nx]) { wz[c0] = 0; continue; }
        const k = j * su + i;
        const vr = v[c0 + 1] + v[c0 + 1 + nx], vl = v[c0 - 1] + v[c0 - 1 + nx];
        const ud = u[k + su] + u[k + su + 1], uu = u[k - su] + u[k - su + 1];
        wz[c0] = 0.25 * ((vr - vl) - (ud - uu)) / CELL;
      }
    }
    // vorticity confinement keeps the curls in the slow smoke; the jet is left alone
    const gate2 = CONF_GATE * CONF_GATE;
    fcx.fill(0); fcy.fill(0);
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const c0 = j * nx + i;
        if (sol[c0]) continue;
        const k = j * su + i;
        const uc = 0.5 * (u[k] + u[k + 1]), vc = 0.5 * (v[c0] + v[c0 + nx]), sp2 = uc * uc + vc * vc;
        if (sp2 >= gate2) continue;
        const cl = Math.abs(wz[c0 - 1]), cr = Math.abs(wz[c0 + 1]), cu = Math.abs(wz[c0 - nx]), cd = Math.abs(wz[c0 + nx]);
        if (cl > CURL_GATE || cr > CURL_GATE || cu > CURL_GATE || cd > CURL_GATE || Math.abs(wz[c0]) > CURL_GATE) continue;
        const gx = cr - cl, gy = cd - cu, len = Math.hypot(gx, gy);
        if (len < 1e-6) continue;
        let f = wz[c0] * CONFINE * CELL * (1 - sp2 / gate2);
        if (f > CONF_MAX) f = CONF_MAX; else if (f < -CONF_MAX) f = -CONF_MAX;
        fcx[c0] = gy * f / len; fcy[c0] = -gx * f / len;
      }
    }
    // everything relaxes toward the drift; the confinement acts on each face from the cells either side
    const kd = Math.min(1, dt / DAMP), bb = BUOY * dt;
    for (let j = 0; j < ny; j++) {
      const ua = drift((j + 0.5) * CELL), row = j * nx;
      for (let i = 1; i <= nx; i++) {
        const k = j * su + i;
        if (!uf[k]) continue;
        u[k] += (ua - u[k]) * kd + 0.5 * dt * (fcx[row + i - 1] + (i < nx ? fcx[row + i] : 0));
      }
    }
    // smoke is warm: it rises a little
    for (let j = 1; j < ny; j++) {
      const q0 = (2 * j - 1) * dnx;
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!vf[k]) continue;
        const q = q0 + 2 * i, rho = 0.25 * (d[q] + d[q + 1] + d[q + dnx] + d[q + dnx + 1]);
        v[k] += -bb * rho - v[k] * kd + 0.5 * dt * (fcy[k - nx] + fcy[k]);
      }
    }
    if (ptr.on) {
      const sp = Math.hypot(ptr.vx, ptr.vy);
      if (sp > 30) splat(ptr.x, ptr.y, NUDGE_R, PTR_GAIN * ptr.vx, PTR_GAIN * ptr.vy, Math.min(1, dt / 0.16) * Math.min(1, sp / 400));
    }
    rotors(dt);
  }

  // The pressure that makes the flow incompressible. Every free face links its two cells; a free face on the
  // open right, bottom or top edge links its cell to pressure zero; the inflow, the closed top and the body
  // pass no pressure gradient. Divergence, Laplacian and gradient are the same compact difference, so the
  // solve leaves no net flow into any cell (up to the sweeps)
  function project() {
    const h = CELL, h2 = h * h;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const c0 = j * nx + i, k = j * su + i;
        if (sol[c0]) { dv[c0] = 0; p[c0] = 0; continue; }
        dv[c0] = (u[k + 1] - u[k] + v[c0 + nx] - v[c0]) / h;
      }
    }
    for (let it = 0; it < iter; it++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const c0 = j * nx + i, n = nnb[c0];
          if (!n) continue;
          const k = j * su + i;
          let sum = 0;
          if (uf[k] && i > 0) sum += p[c0 - 1];
          if (uf[k + 1] && i + 1 < nx) sum += p[c0 + 1];
          if (vf[c0] && j > 0) sum += p[c0 - nx];
          if (vf[c0 + nx] && j + 1 < ny) sum += p[c0 + nx];
          p[c0] += OMEGA * ((sum - h2 * dv[c0]) * RCP[n] - p[c0]);
        }
      }
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const k = j * su + i;
        if (!uf[k]) continue;
        const c0 = j * nx + i;
        u[k] -= ((i < nx ? p[c0] : 0) - (i > 0 ? p[c0 - 1] : 0)) / h;
      }
    }
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!vf[k]) continue;
        v[k] -= ((j < ny ? p[k] : 0) - (j > 0 ? p[k - nx] : 0)) / h;
      }
    }
  }

  function fluid(dt, t) {
    markDrone();
    bc(t);
    advect(dt);
    bc(t);
    diffuse(dt);
    forces(dt);
    bc(t);
    project();
  }

  // ---- smoke ----
  // The flow is fixed for the length of a step, so every substep traces each smoke cell back to the
  // same point: find those points once (midpoint rule), then each substep only reads the smoke there
  function traceDye(dt) {
    const r = 30 + 2 * CELL, bx0 = D.x - r, bx1 = D.x + r, by0 = D.y - r, by1 = D.y + r;
    for (let j = 0; j < dny; j++) {
      const y = (j + 0.5) * dcell;
      for (let i = 0; i < dnx; i++) {
        const x = (i + 0.5) * dcell, k = j * dnx + i;
        if (x > bx0 && x < bx1 && y > by0 && y < by1 && solidAt(x, y)) { dA[k] = -1; continue; }
        let a = cUA[k], tx = cUx[k], ty = cUy[k];
        const ux = (u[a] * (1 - tx) + u[a + 1] * tx) * (1 - ty) + (u[a + su] * (1 - tx) + u[a + su + 1] * tx) * ty;
        a = cVA[k]; tx = cVx[k]; ty = cVy[k];
        const uy = (v[a] * (1 - tx) + v[a + 1] * tx) * (1 - ty) + (v[a + nx] * (1 - tx) + v[a + nx + 1] * tx) * ty;
        const mx = x - 0.5 * dt * ux, my = y - 0.5 * dt * uy;
        const gx = (x - dt * sampleU(u, mx, my)) / dcell - 0.5, gy = (y - dt * sampleV(v, mx, my)) / dcell - 0.5;
        if (gx < -1 || gx > dnx || gy < -1 || gy > dny) { dA[k] = -1; continue; }
        let ia = Math.floor(gx), ib = Math.floor(gy);
        let fx = gx - ia, fy = gy - ib;
        if (ia < 0) { ia = 0; fx = 0; } else if (ia >= dnx - 1) { ia = dnx - 2; fx = 1; }
        if (ib < 0) { ib = 0; fy = 0; } else if (ib >= dny - 1) { ib = dny - 2; fy = 1; }
        dA[k] = ib * dnx + ia; dFx[k] = fx; dFy[k] = fy;
      }
    }
  }

  function advectDye(dt) {
    const dec = Math.exp(-dt / DISS);
    for (let k = 0, n = dnx * dny; k < n; k++) {
      const a = dA[k];
      if (a < 0) { d2[k] = 0; continue; }
      const fx = dFx[k], fy = dFy[k], b = a + dnx;
      d2[k] = ((d[a] * (1 - fx) + d[a + 1] * fx) * (1 - fy) + (d[b] * (1 - fx) + d[b + 1] * fx) * fy) * dec;
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
    traceDye(dt / nsub);
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
  // Started early (opts.background) it runs in idle time only, so it never takes frames from the hero;
  // hurry() switches it to back-to-back slices once the section is close
  let urgent = !opts.background, gen = 0;
  function warm(steps, done) {
    let i = 0;
    const g = ++gen;
    const slice = (deadline) => {
      if (g !== gen) return;
      const budget = deadline && deadline.timeRemaining ? Math.max(4, deadline.timeRemaining()) : 12;
      const t0 = performance.now();
      while (i < steps && performance.now() - t0 < budget) { step(0.05, performance.now()); i++; }
      if (i < steps) schedule(slice);
      else { draw(); warmed = true; done(); }
    };
    schedule(slice);
  }
  const chan = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
  const tasks = [];
  if (chan) chan.port1.onmessage = () => { const fn = tasks.shift(); if (fn) fn(null); };
  function schedule(fn) {
    if (!urgent && window.requestIdleCallback) requestIdleCallback(fn, { timeout: 80 });
    else if (chan) { tasks.push(fn); chan.port2.postMessage(0); }
    else setTimeout(() => fn(null), 0);
  }

  // ---- public ----
  let sizeTimer = 0, lastW = 0, lastH = 0, ro = null, io = null;
  function onResize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 2)) return;
    clearTimeout(sizeTimer);
    sizeTimer = setTimeout(() => {
      lastW = w; lastH = h;
      const was = warmed;
      stop(); warmed = false;
      rebuild();
      draw();
      warm(was ? 60 : 140, () => { if (!was && opts.onWarm) opts.onWarm(); loop(); });
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
      warm(140, () => { if (opts.onWarm) opts.onWarm(); loop(); });
    },
    hurry() { urgent = true; },
    hold(h) { held = h; if (h) stop(); else loop(); },
    stats() {
      let vmax = 0, smoke = 0;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const c0 = j * nx + i, k = j * su + i; if (sol[c0]) continue;
        const sp = Math.hypot(0.5 * (u[k] + u[k + 1]), 0.5 * (v[c0] + v[c0 + nx])); if (sp > vmax) vmax = sp;
      }
      for (let k = 0; k < d.length; k++) smoke += d[k];
      return { CELL, nx, ny, dnx, dny, stepMs: +stepMs.toFixed(2), vmax: Math.round(vmax), smoke: Math.round(smoke), drone: { x: Math.round(D.x), y: Math.round(D.y), tilt: +D.tilt.toFixed(2) }, ptr: ptr.on, degraded, iter, running };
    },
    destroy() {
      stop();
      gen++;
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
