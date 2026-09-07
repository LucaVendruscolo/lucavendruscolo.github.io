// Downstream: the smoke tunnel behind the name, drawn with Canvas 2D.
//
// The air is an incompressible fluid on a staggered (MAC) grid: velocities live
// on cell faces, advection is semi-Lagrangian with a MacCormack correction, and
// a pressure projection makes the field divergence-free (after Stam). A padded
// convex hull around the name and the lede is a solid, no-slip body, faired to a
// blunt nose upstream so the flow stays attached over the text and lets go at the
// square back, the way it does over a car. The shear layers it sheds roll up on
// their own, so every swirl in the picture is the body's doing. Nothing is injected but a faint
// unsteadiness at the inlet, the way a wind tunnel is never perfectly clean.
// The ink is streaklines released at the left edge, carried by the grid
// velocity and fading with age like real smoke, in ink only. A moving pointer pushes the
// air near it (a nudge, not a body). The first frame starts from a stream
// function that is exactly tangent to the hull, so the page opens on a
// developed flow. No dependencies. The 2D simplex noise is Gustavson's.

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
})(22472);

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

// ---- tunables ----
const U0 = 115;                // px/s, free-stream speed
const CELLS = 17000;           // grid cells at most (the cell size follows from the canvas area)
const ITER = 11;               // pressure sweeps per step, warm-started from the last step;
                               // a tall narrow domain (a phone) needs more of them to settle
const OMEGA = 1.75;            // over-relaxation
const INLET = 0.03;            // unsteadiness at the inlet, as a fraction of U0
const INLET_KY = 1 / 190;      // 1/px, its size across the inlet
const INLET_KT = 0.5;          // 1/s, how fast it changes
const PAD_K = 0.24;            // body padding as a fraction of the name's line box
const NOSE_K = 0.5;            // the faired nose reaches this many body half-heights upstream of the text
const L_K = 0.5;               // near-body scale of the starting field, times the body half-height
const D0 = 0.5;                // wake deficit of the starting field
const LINE_GAP = 12;           // px between released filaments (26 on coarse pointers)
const MARKERS = 30000;         // ink markers in total at most; past this the whole picture is drawn coarser
const LIFE0 = 11, LIFE1 = 20;  // s, the smoke holds until LIFE0 and has dissipated by LIFE1
const STALL_X = 3;             // smoke sitting in nearly still air ages at most this much faster
const PTR_R = 80;              // px, radius of the pointer's push
const PTR_K = 0.8;             // the air near the pointer is pulled toward this fraction of its speed
const PTR_VMAX = 420;          // px/s, cap on the pointer speed the air follows
const PTR_TAU = 0.06;          // s, how quickly the air near the pointer follows it
const ASSIST = 0.05;           // markers ahead of the body drift off the stagnation line at this fraction of U0
const SPLIT = 1.6, MERGE = 0.5, SPLIT_FADE = 0.85;   // marker spacing bounds (times s) and thinning per split
const KINK = 0.26, KINK_W = 0.55;   // a turn sharper than about 75 degrees is a fold in the line, not a curve in the flow
const ALPHA = [0.06, 0.12, 0.19, 0.26, 0.33, 0.4];   // ink, darkest where the smoke is thickest

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function rgb(hex, fallback) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
}
function hull(pts) {  // Andrew's monotone chain
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  const up = [];
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  lo.pop(); up.pop();
  return lo.concat(up);
}
function schedule(fn) {
  if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 80 }); else setTimeout(() => fn(null), 0);
}

export function createSmoke(opts) {
  const canvas = opts.canvas, hero = opts.hero;
  let ctx = null;
  try { ctx = canvas.getContext('2d', { alpha: true }); } catch (e) { ctx = null; }
  if (!ctx) return null;
  const coarse = !!opts.coarse;
  const dpr = opts.dpr || Math.min(window.devicePixelRatio || 1, 1.5);
  const css = getComputedStyle(document.documentElement);
  const INK = rgb(css.getPropertyValue('--ink'), '16,22,25');
  const PAPER = (css.getPropertyValue('--paper') || '').trim() || '#F3F5F7';

  // Staggered grid. Cells (i, j) with centres at ((i + 0.5)h, (j + 0.5)h).
  // u lives on vertical faces: (nx + 1) by ny, u[i, j] at (i h, (j + 0.5) h).
  // v lives on horizontal faces: nx by (ny + 1), v[i, j] at ((i + 0.5) h, j h).
  let W = 0, H = 0, Hh = 0, CELL = 8, nx = 0, ny = 0, NU = 0, NV = 0, NC = 0, NK = 0, sw = 0, iters = ITER;
  let u = null, uh, u2, v, vh, v2, P, dvg, sol, nnb, uf, vf;
  // body: padded convex hull of the text boxes
  let has = false, PAD = 18, ne = 0;
  const EX = new Float64Array(32), EY = new Float64Array(32), EDX = new Float64Array(32), EDY = new Float64Array(32);
  const EL = new Float64Array(32), ENX = new Float64Array(32), ENY = new Float64Array(32);
  let xl = 0, xr = 0, yt = 0, yb = 0, yc = 0, hb = 1, L = 40, Lb = 0, bx0 = 0, bx1 = -1, by0 = 0, by1 = -1;
  // filaments
  let lines = [], N = 0, s = 7, cap = 0, scap = 0, sx, sy, sd, sg, markers = 0;
  let simT = 0;
  const ptr = { x: 0, y: 0, vx: 0, vy: 0, t: -1e9, on: false };
  // loop
  let raf = 0, last = 0, held = false, hidden = false, visible = true, warmed = false;
  let stepMs = 0, fluidMs = 0, slowN = 0, degraded = 0, frameN = 0, acc = 0;
  let lastW = 0, lastH = 0, resizeT = 0, io = null;
  const out = { x: 0, y: 0 };

  // ---- body ----
  function setObstacles(rs) {
    const rects = (rs || []).filter(r => r && r.w > 0 && r.h > 0);
    has = rects.length > 0;
    if (!has) { bx1 = -1; if (u) setType(); return; }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const lh = rects[0].h, pts = [];
    for (const r of rects) {
      x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x + r.w); y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.y + r.h);
      pts.push([r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]);
    }
    PAD = clamp(PAD_K * lh, 12, 26);
    // an elliptical nose ahead of the text, meeting its top and bottom edges tangentially
    const cyN = 0.5 * (y0 + y1), byN = 0.5 * (y1 - y0), aN = NOSE_K * byN;
    for (const t of [0, 0.42, 0.82, 1.18, 1.42]) {
      const dx = aN * Math.cos(t), dy = byN * Math.sin(t);
      pts.push([x0 - dx, cyN - dy], [x0 - dx, cyN + dy]);
    }
    const Q = hull(pts);
    ne = Math.min(28, Q.length);
    let cxm = 0, cym = 0;
    for (let e = 0; e < ne; e++) { cxm += Q[e][0]; cym += Q[e][1]; }
    cxm /= ne; cym /= ne;
    for (let e = 0; e < ne; e++) {
      const a = Q[e], b = Q[(e + 1) % ne];
      EX[e] = a[0]; EY[e] = a[1]; EDX[e] = b[0] - a[0]; EDY[e] = b[1] - a[1]; EL[e] = Math.hypot(EDX[e], EDY[e]) || 1;
      let nX = EDY[e] / EL[e], nY = -EDX[e] / EL[e];
      if ((cxm - a[0]) * nX + (cym - a[1]) * nY > 0) { nX = -nX; nY = -nY; }
      ENX[e] = nX; ENY[e] = nY;
    }
    xl = x0 - aN - PAD; xr = x1 + PAD; yt = y0 - PAD; yb = y1 + PAD;   // xl is the nose tip, the body's upstream end
    yc = 0.5 * (yt + yb); hb = 0.5 * (yb - yt);
    L = clamp(L_K * hb, 24, 90);
    bx0 = xl - 2; bx1 = xr + 2; by0 = yt - 2; by1 = yb + 2;
    if (u && !warmed) { setType(); initField(); seedLines(); }
    else if (u) setType();
  }

  // signed distance to the padded hull (negative inside)
  function sdf(x, y) {
    let inside = true, dmin = Infinity, dmax = -Infinity;
    for (let e = 0; e < ne; e++) {
      const px = x - EX[e], py = y - EY[e];
      const sl = px * ENX[e] + py * ENY[e];
      if (sl > 0) inside = false;
      if (sl > dmax) dmax = sl;
      let t = (px * EDX[e] + py * EDY[e]) / (EL[e] * EL[e]);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = px - t * EDX[e], qy = py - t * EDY[e], dd = qx * qx + qy * qy;
      if (dd < dmin) dmin = dd;
    }
    return (inside ? dmax : Math.sqrt(dmin)) - PAD;
  }
  function grad(x, y) {
    const gx = sdf(x + 0.5, y) - sdf(x - 0.5, y), gy = sdf(x, y + 0.5) - sdf(x, y - 0.5);
    const l = Math.hypot(gx, gy) || 1;
    out.x = gx / l; out.y = gy / l;
  }

  // ---- interpolation ----
  function sampleU(A, x, y) {
    let fx = x / CELL, fy = y / CELL - 0.5;
    if (fx < 0) fx = 0; else if (fx > nx - 0.001) fx = nx - 0.001;
    if (fy < 0) fy = 0; else if (fy > ny - 1.001) fy = ny - 1.001;
    const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * sw + i;
    return (A[k] * (1 - tx) + A[k + 1] * tx) * (1 - ty) + (A[k + sw] * (1 - tx) + A[k + sw + 1] * tx) * ty;
  }
  function sampleV(A, x, y) {
    let fx = x / CELL - 0.5, fy = y / CELL;
    if (fx < 0) fx = 0; else if (fx > nx - 1.001) fx = nx - 1.001;
    if (fy < 0) fy = 0; else if (fy > ny - 0.001) fy = ny - 0.001;
    const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * nx + i;
    return (A[k] * (1 - tx) + A[k + 1] * tx) * (1 - ty) + (A[k + nx] * (1 - tx) + A[k + nx + 1] * tx) * ty;
  }
  function velAt(x, y) { out.x = sampleU(u, x, y); out.y = sampleV(v, x, y); }

  // ---- cell and face bookkeeping ----
  function setType() {
    for (let j = 0; j < ny; j++) {
      const cy = (j + 0.5) * CELL;
      for (let i = 0; i < nx; i++) sol[j * nx + i] = has && sdf((i + 0.5) * CELL, cy) < 0 ? 1 : 0;
    }
    // a face is free when the projection may change it: not the inlet, not a wall, not touching the body
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const k = j * sw + i;
        if (i === 0) uf[k] = 0;                                  // inlet, held at U0
        else if (i === nx) uf[k] = 1;                            // outlet, open
        else uf[k] = (sol[j * nx + i - 1] || sol[j * nx + i]) ? 0 : 1;
      }
    }
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (j === 0 || j === ny) vf[k] = 0;                      // free-slip top and bottom
        else vf[k] = (sol[(j - 1) * nx + i] || sol[j * nx + i]) ? 0 : 1;
      }
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const c = j * nx + i;
        nnb[c] = sol[c] ? 0 : uf[j * sw + i] + uf[j * sw + i + 1] + vf[c] + vf[c + nx];
      }
    }
    for (let k = 0; k < NC; k++) if (sol[k]) P[k] = 0;
  }
  function bc() {
    for (let j = 0; j < ny; j++) {
      const k = j * sw;
      u[k] = U0;                                                  // inlet
      u[k + nx] = u[k + nx - 1];                                  // outlet, zero gradient before the projection
      v[j * nx] = INLET * U0 * noise2((j + 0.5) * CELL * INLET_KY + 4.3, simT * INLET_KT);
    }
    for (let i = 0; i < nx; i++) { v[i] = 0; v[ny * nx + i] = 0; }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (!sol[j * nx + i]) continue;
        u[j * sw + i] = 0; u[j * sw + i + 1] = 0;
        v[j * nx + i] = 0; v[(j + 1) * nx + i] = 0;
      }
    }
  }
  function forces(dt, now) {
    if (!ptr.on || now - ptr.t > 120) return;
    const sp = Math.hypot(ptr.vx, ptr.vy);
    if (sp < 25) return;
    const sc = PTR_K * Math.min(1, PTR_VMAX / sp), tx = ptr.vx * sc, ty = ptr.vy * sc;
    const a = Math.min(1, dt / PTR_TAU), R = PTR_R, R2 = R * R;
    const i0 = Math.max(0, Math.floor((ptr.x - R) / CELL)), i1 = Math.min(nx, Math.ceil((ptr.x + R) / CELL));
    const j0 = Math.max(0, Math.floor((ptr.y - R) / CELL)), j1 = Math.min(ny, Math.ceil((ptr.y + R) / CELL));
    for (let j = j0; j < Math.min(ny, j1 + 1); j++) {
      const dy = (j + 0.5) * CELL - ptr.y;
      for (let i = i0; i <= i1; i++) {
        const k = j * sw + i;
        if (!uf[k]) continue;
        const dx = i * CELL - ptr.x, q2 = (dx * dx + dy * dy) / R2;
        if (q2 >= 1) continue;
        const g = a * (1 - q2) * (1 - q2);
        u[k] += g * (tx - u[k]);
      }
    }
    for (let j = j0; j <= j1; j++) {
      const dy = j * CELL - ptr.y;
      for (let i = i0; i < Math.min(nx, i1 + 1); i++) {
        const k = j * nx + i;
        if (!vf[k]) continue;
        const dx = (i + 0.5) * CELL - ptr.x, q2 = (dx * dx + dy * dy) / R2;
        if (q2 >= 1) continue;
        const g = a * (1 - q2) * (1 - q2);
        v[k] += g * (ty - v[k]);
      }
    }
  }
  // semi-Lagrangian with a MacCormack correction, clamped to the cell it came from
  function advect(dt) {
    for (let j = 0; j < ny; j++) {
      const y = (j + 0.5) * CELL;
      for (let i = 0; i <= nx; i++) {
        const k = j * sw + i;
        if (!uf[k]) { uh[k] = u[k]; continue; }
        const x = i * CELL;
        uh[k] = sampleU(u, x - dt * u[k], y - dt * sampleV(v, x, y));
      }
    }
    for (let j = 0; j <= ny; j++) {
      const y = j * CELL;
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!vf[k]) { vh[k] = v[k]; continue; }
        const x = (i + 0.5) * CELL;
        vh[k] = sampleV(v, x - dt * sampleU(u, x, y), y - dt * v[k]);
      }
    }
    for (let j = 0; j < ny; j++) {
      const y = (j + 0.5) * CELL;
      for (let i = 0; i <= nx; i++) {
        const k = j * sw + i;
        if (!uf[k]) { u2[k] = u[k]; continue; }
        const x = i * CELL, vx = u[k], vy = sampleV(v, x, y);
        const back = sampleU(uh, x + dt * vx, y + dt * vy);
        let n = uh[k] + 0.5 * (u[k] - back);
        let fx = (x - dt * vx) / CELL, fy = (y - dt * vy) / CELL - 0.5;
        if (fx < 0) fx = 0; else if (fx > nx - 0.001) fx = nx - 0.001;
        if (fy < 0) fy = 0; else if (fy > ny - 1.001) fy = ny - 1.001;
        const q = (fy | 0) * sw + (fx | 0);
        const a0 = u[q], a1 = u[q + 1], a2 = u[q + sw], a3 = u[q + sw + 1];
        const lo = Math.min(a0, a1, a2, a3), hi = Math.max(a0, a1, a2, a3);
        u2[k] = n < lo ? lo : n > hi ? hi : n;
      }
    }
    for (let j = 0; j <= ny; j++) {
      const y = j * CELL;
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!vf[k]) { v2[k] = v[k]; continue; }
        const x = (i + 0.5) * CELL, vy = v[k], vx = sampleU(u, x, y);
        const back = sampleV(vh, x + dt * vx, y + dt * vy);
        let n = vh[k] + 0.5 * (v[k] - back);
        let fx = (x - dt * vx) / CELL - 0.5, fy = (y - dt * vy) / CELL;
        if (fx < 0) fx = 0; else if (fx > nx - 1.001) fx = nx - 1.001;
        if (fy < 0) fy = 0; else if (fy > ny - 0.001) fy = ny - 0.001;
        const q = (fy | 0) * nx + (fx | 0);
        const b0 = v[q], b1 = v[q + 1], b2 = v[q + nx], b3 = v[q + nx + 1];
        const lo = Math.min(b0, b1, b2, b3), hi = Math.max(b0, b1, b2, b3);
        v2[k] = n < lo ? lo : n > hi ? hi : n;
      }
    }
    let t = u; u = u2; u2 = t; t = v; v = v2; v2 = t;
  }
  function project() {
    const h2 = CELL * CELL;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const c = j * nx + i, k = j * sw + i;
        dvg[c] = sol[c] ? 0 : (u[k + 1] - u[k] + v[c + nx] - v[c]) / CELL;
      }
    }
    for (let it = 0; it < iters; it++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const c = j * nx + i;
          const n = nnb[c];
          if (!n) continue;
          const k = j * sw + i;
          let sum = 0;
          if (uf[k]) sum += P[c - 1];
          if (uf[k + 1]) sum += i + 1 < nx ? P[c + 1] : 0;   // the outlet holds p = 0
          if (vf[c]) sum += P[c - nx];
          if (vf[c + nx]) sum += P[c + nx];
          P[c] += OMEGA * ((sum - h2 * dvg[c]) / n - P[c]);
        }
      }
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const k = j * sw + i;
        if (!uf[k]) continue;
        const c = j * nx + i;
        const pr = i < nx ? P[c] : 0, pl = P[c - 1];
        u[k] -= (pr - pl) / CELL;
      }
    }
    for (let j = 1; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!vf[k]) continue;
        v[k] -= (P[k] - P[k - nx]) / CELL;
      }
    }
  }
  function fluid(dt, now) {
    bc();
    forces(dt, now);
    advect(dt);
    bc();
    project();
  }

  // ---- the starting field ----
  function hOf(d, y) {
    const q = 1 + (d < 0 ? -d : d) / (2 * L), a = 1 - 1 / (q * q);
    let h = d < 0 ? -a : a;
    if (Lb > 0) {
      const wd = y < H - y ? y : H - y;
      if (wd < Lb) { const w = 1 - wd / Lb; h = 1 - (1 - h) * (1 - w * w); }
    }
    return h;
  }
  function Dw(x) {
    const r0 = xr - 0.2 * hb, r1 = xr + 0.6 * hb;
    let r = (x - r0) / (r1 - r0);
    if (r <= 0) return 0;
    if (r > 1) r = 1;
    r = r * r * (3 - 2 * r);
    return D0 * r * (x > r1 ? Math.exp(-(x - r1) / (3 * hb)) : 1);
  }
  function Sy(e) { const a = 0.55 * hb; return a * Math.tanh(e / a); }
  function initField() {
    // a stream function at the cell corners: differencing it gives a field that is
    // divergence-free to machine precision and tangent to the hull
    const psi = new Float32Array(NK);
    Lb = has ? Math.max(0, 0.8 * Math.min(yt, H - yb)) : 0;
    const ycc = has ? yc : 0.5 * H;
    for (let j = 0; j <= ny; j++) {
      const y = j * CELL;
      for (let i = 0; i <= nx; i++) {
        const x = i * CELL, e = y - ycc;
        psi[j * sw + i] = (has ? hOf(sdf(x, y), y) : 1) * U0 * (has ? e - Dw(x) * Sy(e) : e);
      }
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) u[j * sw + i] = (psi[(j + 1) * sw + i] - psi[j * sw + i]) / CELL;
    for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = -(psi[j * sw + i + 1] - psi[j * sw + i]) / CELL;
    P.fill(0);
    bc();
  }

  // ---- filaments ----
  function newLine(x0, y0) {
    return { x0, y0, s, n: 0, x: new Float32Array(cap), y: new Float32Array(cap), d: new Float32Array(cap), g: new Float32Array(cap) };
  }
  // seed along a streamline of the starting field; oldest marker first, the newest
  // (index n - 1) sits at the release point
  function trace(f) {
    let x = f.x0, y = f.y0, m = 0;
    const tx = [], ty = [];
    while (m < cap - 8 && x <= W + 8 && y > -CELL && y < H + CELL) {
      tx.push(x); ty.push(y); m++;
      velAt(x, y);
      let sp = Math.hypot(out.x, out.y);
      if (sp < 0.01 * U0) break;
      velAt(x + 0.5 * s * out.x / sp, y + 0.5 * s * out.y / sp);
      sp = Math.hypot(out.x, out.y);
      if (sp < 0.01 * U0) break;
      x += s * out.x / sp; y += s * out.y / sp;
      if (has && x > bx0 && x < bx1 && y > by0 && y < by1) { const d = sdf(x, y); if (d < CELL) { grad(x, y); x += (CELL - d) * out.x; y += (CELL - d) * out.y; } }
    }
    if (m < 2) { tx.push(f.x0 + 1); ty.push(f.y0); m = 2; tx.reverse(); ty.reverse(); }
    f.n = m;
    // age them as if they had been released in turn, so the tail is already fading
    for (let i = 0; i < m; i++) { f.x[i] = tx[m - 1 - i]; f.y[i] = ty[m - 1 - i]; f.d[i] = 1; f.g[i] = (m - 1 - i) * s / U0; }
  }
  function seedLines() {
    lines = [];
    const step = Hh / N;
    for (let i = 0; i < N; i++) {
      let y0 = (i + 0.5) * step + 0.2 * step * noise2(i * 2.3 + 0.1, 1.7);
      if (has && Math.abs(y0 - yc) < 6) y0 = yc + (y0 < yc ? -6 : 6);
      const f = newLine(0, y0);
      trace(f); lines.push(f);
    }
  }
  function moveLine(f, dt) {
    const X = f.x, Y = f.y, G = f.g, m = f.n - 1;
    const fz0 = xl - 2 * L, fz1 = xl, fzw = 1 / Math.max(1, fz1 - fz0);
    const slow = 0.12 * U0, kd = CELL;
    for (let i = 0; i < m; i++) {
      let x = X[i], y = Y[i];
      velAt(x, y);
      const kx = out.x, ky = out.y;
      velAt(x + 0.5 * dt * kx, y + 0.5 * dt * ky);
      const sp = Math.hypot(out.x, out.y);
      x += dt * out.x; y += dt * out.y;
      if (has) {
        if (x > fz0 && x < fz1) { const w = (x - fz0) * fzw; y += (y < yc ? -1 : 1) * ASSIST * U0 * w * w * dt; }
        if (x > bx0 && x < bx1 && y > by0 && y < by1) {
          const d = sdf(x, y);
          if (d < kd) { grad(x, y); x += (kd - d) * out.x; y += (kd - d) * out.y; }
        }
      }
      X[i] = x; Y[i] = y;
      // smoke sitting in nearly still air is spent, and disperses sooner
      G[i] += dt * (sp < slow ? 1 + STALL_X * (1 - sp / slow) : 1);
    }
  }
  // A streakline that doubles back on itself draws a tooth a marker or two wide, which
  // reads as a zig-zag rather than as smoke. Ease those out, and leave real curvature
  // (even a tight spiral turns gently from one marker to the next) untouched.
  function deKink(f) {
    const X = f.x, Y = f.y, n = f.n;
    if (n < 5) return;
    let ox = X[0], oy = Y[0];
    for (let i = 1; i < n - 1; i++) {
      const bx = X[i], by = Y[i], cx = X[i + 1], cy = Y[i + 1];
      const ux = bx - ox, uy = by - oy, wx = cx - bx, wy = cy - by;
      const lu = Math.sqrt(ux * ux + uy * uy), lw = Math.sqrt(wx * wx + wy * wy);
      let px = bx, py = by;
      if (lu > 1e-4 && lw > 1e-4) {
        const c = (ux * wx + uy * wy) / (lu * lw);
        if (c < KINK) {
          const k = KINK_W * Math.min(1, (KINK - c) / (KINK + 1));
          px = bx + k * (0.5 * (ox + cx) - bx);
          py = by + k * (0.5 * (oy + cy) - by);
        }
      }
      ox = bx; oy = by;
      X[i] = px; Y[i] = py;
    }
  }

  // keep markers about s apart: release new ones between the last free marker and the
  // release point, subdivide stretched segments (the ink thins), drop crowded ones and
  // trim the oldest once they have faded or left
  function resample(f) {
    const X = f.x, Y = f.y, D = f.d, G = f.g, n = f.n;
    if (n < 2) { X[1] = X[0] + 1; Y[1] = Y[0]; D[1] = 1; G[1] = 0; X[0] = f.x0; Y[0] = f.y0; f.n = 2; return; }
    const sf = f.s, smin = MERGE * sf, smax = SPLIT * sf;
    let o = 1, px = X[0], py = Y[0];
    sx[0] = px; sy[0] = py; sd[0] = D[0]; sg[0] = G[0];
    for (let i = 1; i < n; i++) {
      const x = X[i], y = Y[i], dd = D[i], gg = G[i], head = i === n - 1;
      const dx = x - px, dy = y - py, l = Math.sqrt(dx * dx + dy * dy);
      if (l < smin && !head) continue;
      if (l > smax && o < cap - 4) {
        if (head) {
          const k = Math.min(Math.floor(l / sf), scap - 4 - o);
          for (let j = 1; j <= k; j++) {
            if (l - j * sf < smin) break;
            const q = j * sf / l;
            sx[o] = px + dx * q; sy[o] = py + dy * q; sd[o] = 1; sg[o] = gg + (1 - q) * l / U0; o++;
          }
        } else {
          const k = Math.min(3, Math.floor(l / sf), scap - 4 - o), dm = 0.5 * (sd[o - 1] + dd) * SPLIT_FADE, gm = 0.5 * (sg[o - 1] + gg);
          for (let j = 1; j <= k; j++) { const q = j / (k + 1); sx[o] = px + dx * q; sy[o] = py + dy * q; sd[o] = dm; sg[o] = gm; o++; }
        }
      }
      if (o >= scap - 2) break;
      sx[o] = x; sy[o] = y; sd[o] = dd; sg[o] = gg; o++;
      px = x; py = y;
    }
    let j0 = 0;
    while (j0 < o - 2 && (sg[j0] > LIFE1 || sx[j0] > W + 12)) j0++;
    if (o - j0 > cap - 8) j0 = o - (cap - 8);
    const nn = o - j0;
    for (let i = 0; i < nn; i++) { X[i] = sx[i + j0]; Y[i] = sy[i + j0]; D[i] = sd[i + j0]; G[i] = sg[i + j0]; }
    f.n = nn;
  }
  function moveLines(dt) {
    // when the wake has folded the smoke into more ink than the budget allows, every
    // filament is carried at a coarser spacing rather than being eaten from the tail
    const gk = clamp(markers / MARKERS, 1, 3.5);
    let m = 0;
    for (const f of lines) {
      f.s = s * clamp(Math.max(gk, f.n / (0.7 * cap)), 1, 3.5);
      moveLine(f, dt); deKink(f); resample(f); m += f.n;
    }
    markers = m;
  }

  // ---- render ----
  function draw(opaque) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (opaque) { ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H); } else ctx.clearRect(0, 0, W, H);
    const NA = ALPHA.length, fadeH = Math.max(1, H - Hh);
    const iL = 1 / (LIFE1 - LIFE0);
    const paths = [];
    for (let i = 0; i < NA; i++) paths.push(new Path2D());
    for (const f of lines) {
      const X = f.x, Y = f.y, D = f.d, G = f.g, n = f.n, lmax2 = 9 * f.s * f.s;
      let cur = -1;
      for (let i = 1; i < n; i++) {
        const x0 = X[i - 1], y0 = Y[i - 1], x1 = X[i], y1 = Y[i], dx = x1 - x0, dy = y1 - y0;
        if (dx * dx + dy * dy > lmax2) { cur = -1; continue; }
        const g = 0.5 * (G[i - 1] + G[i]);
        let fg = g <= LIFE0 ? 1 : 1 - (g - LIFE0) * iL;
        if (fg <= 0.02) { cur = -1; continue; }
        if (fg < 1) fg = fg * fg * (3 - 2 * fg);
        const ym = 0.5 * (y0 + y1);
        const fy = ym <= Hh ? 1 : 1 - (ym - Hh) / fadeH;
        if (fy < 0.08) { cur = -1; continue; }
        const d = 0.5 * (D[i - 1] + D[i]);
        const a = (0.3 + 0.7 * d) * fg * fy;
        if (a < 0.05) { cur = -1; continue; }
        const b = Math.min(NA - 1, Math.floor(a * NA));
        if (b !== cur) { paths[b].moveTo(x0, y0); cur = b; }
        paths[b].lineTo(x1, y1);
      }
    }
    ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < NA; i++) { ctx.strokeStyle = 'rgba(' + INK + ',' + ALPHA[i] + ')'; ctx.stroke(paths[i]); }
  }

  // ---- sizing ----
  function rebuild() {
    W = canvas.clientWidth || hero.clientWidth; H = canvas.clientHeight || hero.clientHeight; Hh = Math.min(H, hero.clientHeight);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const q = degraded > 1 ? 1.5 : 1;
    const want = clamp(Math.sqrt(W * H / CELLS), 5, 14) * q;
    nx = Math.max(8, Math.round(W / want));
    CELL = W / nx;                      // the grid fits the canvas exactly across
    ny = Math.max(8, Math.ceil(H / CELL));
    sw = nx + 1;
    iters = Math.min(26, Math.round(ITER * Math.max(1, Math.max(nx, ny) / Math.min(nx, ny) / 1.8)));
    NU = sw * ny; NV = nx * (ny + 1); NC = nx * ny; NK = sw * (ny + 1);
    u = new Float32Array(NU); uh = new Float32Array(NU); u2 = new Float32Array(NU);
    v = new Float32Array(NV); vh = new Float32Array(NV); v2 = new Float32Array(NV);
    P = new Float32Array(NC); dvg = new Float32Array(NC); sol = new Uint8Array(NC); nnb = new Uint8Array(NC);
    uf = new Uint8Array(NU); vf = new Uint8Array(NV);
    s = clamp(W / 200, 5, 10) * q;
    N = Math.round(clamp(Math.round(Hh / (coarse ? 26 : LINE_GAP)), 20, 88) / q);
    cap = Math.ceil(2.6 * (W + 120) / s) + 64;
    scap = 3 * cap + 32;   // room to resample before trimming, so the newest ink is never the part that is dropped
    sx = new Float32Array(scap); sy = new Float32Array(scap); sd = new Float32Array(scap); sg = new Float32Array(scap);
    setType();
    initField();
    seedLines();
    acc = 0; markers = 0;
  }

  // ---- pointer ----
  function onMove(e) {
    if (e.pointerType === 'touch') return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top, t = e.timeStamp || performance.now();
    if (ptr.on) {
      const dt = (t - ptr.t) / 1000;
      if (dt >= 0.25) { ptr.vx = 0; ptr.vy = 0; }
      else if (dt > 0.002) {
        const a = Math.min(1, dt / 0.05);
        ptr.vx += ((x - ptr.x) / dt - ptr.vx) * a; ptr.vy += ((y - ptr.y) / dt - ptr.vy) * a;
      } else if (dt <= 0) return;
    }
    ptr.x = x; ptr.y = y; ptr.t = t; ptr.on = true;
  }
  function onLeave() { ptr.on = false; ptr.vx = 0; ptr.vy = 0; }
  function onResize() {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      const w = hero.clientWidth, h = hero.clientHeight;
      if (w === lastW && h === lastH) return;
      lastW = w; lastH = h;
      if (opts.measure) setObstacles(opts.measure());
      rebuild();
    }, 150);
  }

  // ---- loop ----
  function frame(now) {
    raf = 0;
    if (held || hidden || !visible) return;
    raf = requestAnimationFrame(frame);
    let dt = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    if (dt < 0.004) return;
    if (dt > 0.05) dt = 0.05;
    const t0 = performance.now();
    frameN++;
    simT += dt; acc += dt;
    // once degraded the air is stepped every other frame; the smoke still moves every frame
    if (degraded < 1 || (frameN & 1) === 0) { fluid(Math.min(acc, 0.1), now); acc = 0; fluidMs += (performance.now() - t0 - fluidMs) * 0.1; }
    moveLines(dt);
    draw(false);
    stepMs += (performance.now() - t0 - stepMs) * 0.1;
    if (stepMs > 14) { if (++slowN > 60) { slowN = 0; degrade(); } } else slowN = 0;
  }
  function degrade() {
    degraded++;
    if (degraded === 2) rebuild(); else if (degraded > 2) held = true;
  }
  function loop() { if (!raf && warmed && !held && !hidden && visible) { last = 0; raf = requestAnimationFrame(frame); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }
  function warm(done) {   // let the body start shedding before the canvas is shown
    let i = 0;
    const total = 320, wdt = 0.06;
    const slice = (dl) => {
      const budget = dl && dl.timeRemaining ? Math.max(4, dl.timeRemaining()) : 12;
      const t0 = performance.now();
      while (i < total && performance.now() - t0 < budget) { simT += wdt; fluid(wdt, -1e9); moveLines(wdt); i++; }
      if (i < total) schedule(slice); else { draw(false); warmed = true; done(); }
    };
    schedule(slice);
  }

  const onVis = () => { hidden = document.hidden; if (hidden) stop(); else loop(); };
  const api = {
    start() {
      lastW = hero.clientWidth; lastH = hero.clientHeight;
      if (opts.measure) setObstacles(opts.measure());
      rebuild();
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerleave', onLeave);
      document.addEventListener('pointerleave', onLeave);
      window.addEventListener('resize', onResize);
      document.addEventListener('visibilitychange', onVis);
      io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) loop(); else stop(); }, { threshold: 0 });
      io.observe(canvas);
      warm(() => { if (opts.onWarm) opts.onWarm(); loop(); });
    },
    hold(h) { held = h; if (h) stop(); else loop(); },
    stats() {
      let vmax = 0, dmax = 0;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const c = j * nx + i, k = j * sw + i;
          if (sol[c]) continue;
          const uu = 0.5 * (u[k] + u[k + 1]), vv = 0.5 * (v[c] + v[c + nx]);
          const sp = uu * uu + vv * vv; if (sp > vmax) vmax = sp;
          const d = Math.abs((u[k + 1] - u[k] + v[c + nx] - v[c]) / CELL); if (d > dmax) dmax = d;
        }
      }
      return { CELL: +CELL.toFixed(2), nx, ny, N, markers, stepMs: +stepMs.toFixed(2), fluidMs: +fluidMs.toFixed(2), vmax: Math.round(Math.sqrt(vmax)), divmax: +dmax.toFixed(3), iters, PAD: +PAD.toFixed(1), hb: Math.round(hb), degraded, simT: +simT.toFixed(1) };
    },
    setObstacles(r) { setObstacles(r); },
    destroy() {
      stop();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      if (io) io.disconnect();
    },
    // Static-tier still: no pointer, fixed steps at a fixed dt, one opaque frame. Deterministic.
    capture(steps) {
      if (opts.measure) setObstacles(opts.measure());
      rebuild();
      for (let i = 0; i < (steps || 320); i++) { simT += 0.06; fluid(0.06, -1e9); moveLines(0.06); }
      draw(true);
      warmed = true;
    }
  };
  return api;
}
