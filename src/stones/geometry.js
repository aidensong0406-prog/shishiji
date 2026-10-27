// Stone geometry generator v2.
// Builds an indexed icosphere and sculpts it with a deterministic, parametric
// recipe: superellipsoid silhouette → taper/bend/twist → lumps → ridges and
// wrinkles → fracture facets (with conchoidal ripples) → bedding terraces →
// water-wear (Taubin smoothing) → pits → resting base. A per-vertex cavity
// attribute (concavity) lets the shader darken crevices like real grime/AO.

import * as THREE from "three";
import { makeNoise } from "./noise.js";
import { mulberry } from "../utils/math.js";

/* ---------- indexed icosphere (shared vertices → smooth normals + adjacency) ---------- */

const icoCache = new Map();
function icosphere(level) {
  if (icoCache.has(level)) return icoCache.get(level);
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; });
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let l = 0; l < level; l++) {
    const mid = new Map();
    const midpoint = (a, b) => {
      const key = a < b ? a * 1e6 + b : b * 1e6 + a;
      let m = mid.get(key);
      if (m === undefined) {
        const va = verts[a], vb = verts[b];
        const x = va[0] + vb[0], y = va[1] + vb[1], z = va[2] + vb[2];
        const len = Math.hypot(x, y, z);
        m = verts.length; verts.push([x / len, y / len, z / len]); mid.set(key, m);
      }
      return m;
    };
    const nf = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = nf;
  }
  const pos = new Float32Array(verts.length * 3);
  verts.forEach((v, i) => { pos[i * 3] = v[0]; pos[i * 3 + 1] = v[1]; pos[i * 3 + 2] = v[2]; });
  const idx = verts.length > 65535 ? new Uint32Array(faces.length * 3) : new Uint16Array(faces.length * 3);
  faces.forEach((f, i) => { idx[i * 3] = f[0]; idx[i * 3 + 1] = f[1]; idx[i * 3 + 2] = f[2]; });
  // adjacency (CSR) for smoothing + cavity
  const nbr = Array.from({ length: verts.length }, () => new Set());
  for (const [a, b, c] of faces) { nbr[a].add(b).add(c); nbr[b].add(a).add(c); nbr[c].add(a).add(b); }
  const off = new Uint32Array(verts.length + 1);
  for (let i = 0; i < verts.length; i++) off[i + 1] = off[i] + nbr[i].size;
  const adj = new Uint32Array(off[verts.length]);
  for (let i = 0; i < verts.length; i++) { let k = off[i]; for (const n of nbr[i]) adj[k++] = n; }
  const out = { pos, idx, off, adj, count: verts.length };
  icoCache.set(level, out);
  return out;
}

/* ---------- helpers ---------- */

const smin = (a, b, k) => {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k));
  return b + (a - b) * h - k * h * (1 - h);
};
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function randomUnit(r) {
  const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return [s * Math.cos(th), u, s * Math.sin(th)];
}

function taubin(P, off, adj, n, iters, lambda = 0.5, mu = -0.53) {
  const tmp = new Float32Array(P.length);
  const pass = (f) => {
    for (let i = 0; i < n; i++) {
      let sx = 0, sy = 0, sz = 0; const a = off[i], b = off[i + 1], c = b - a;
      for (let k = a; k < b; k++) { const j = adj[k] * 3; sx += P[j]; sy += P[j + 1]; sz += P[j + 2]; }
      const i3 = i * 3;
      tmp[i3] = P[i3] + f * (sx / c - P[i3]);
      tmp[i3 + 1] = P[i3 + 1] + f * (sy / c - P[i3 + 1]);
      tmp[i3 + 2] = P[i3 + 2] + f * (sz / c - P[i3 + 2]);
    }
    P.set(tmp);
  };
  for (let it = 0; it < iters; it++) { pass(lambda); pass(mu); }
}

/* ---------- the recipe ---------- */

export const DEFAULT_SHAPE = {
  seed: 1, axes: [1, 0.7, 0.8], square: 0, taper: 0, bend: 0, twist: 0,
  lump: 0.08, lumpFreq: 1.2, ridge: 0, ridgeFreq: 3, wrinkle: 0, wrinkleFreq: 3.5,
  facets: 0, facetDepth: 0.15, facetSoft: 0.12, conch: 0,
  terraces: 0, terraceCount: 6, terraceAxis: [0, 1, 0],
  pits: 0, pitFreq: 4, pitSize: 0.3, holes: 0,
  bore: null,   // one aimed hole: [dx, dy, dz, angular radius (rad), depth] — a deep, water-worn funnel
  wear: 0.5, base: 0.3, grain: 0.004,
};

/**
 * Build a stone geometry from a shape recipe.
 * @param {object} shapeIn  recipe (see DEFAULT_SHAPE)
 * @param {object} opt      { level: icosphere subdivision (3 hall … 6 close-up) }
 * @returns THREE.BufferGeometry with position, normal, aCavity; bounding sphere radius ≈ 1
 */
export function buildStoneGeometry(shapeIn, opt = {}) {
  const S = { ...DEFAULT_SHAPE, ...shapeIn };
  const level = opt.level ?? 5;
  const ico = icosphere(level);
  const n = ico.count;
  const P = new Float32Array(ico.pos);
  const N = makeNoise(S.seed);
  const r = mulberry((S.seed * 2654435761) >>> 0);
  const o1 = [r() * 50, r() * 50, r() * 50], o2 = [r() * 50, r() * 50, r() * 50];
  // detail that a coarse mesh cannot carry is faded out instead of aliasing
  const fine = smoothstep(2.5, 5, level);
  const [ax, ay, az] = S.axes;
  const pe = 2 + S.square * 7;  // superellipsoid exponent

  // 1) silhouette + low-frequency form
  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    const dx = P[i3], dy = P[i3 + 1], dz = P[i3 + 2];
    const rs = Math.pow(Math.abs(dx) ** pe + Math.abs(dy) ** pe + Math.abs(dz) ** pe, -1 / pe);
    let x = dx * rs * ax, y = dy * rs * ay, z = dz * rs * az;
    // egg taper along x; banana bend; twist about x
    const u = x / ax;
    const tp = 1 + S.taper * u;
    y *= tp; z *= tp;
    y += S.bend * (u * u - 0.33) * ax;
    if (S.twist) { const a = S.twist * u, c = Math.cos(a), s = Math.sin(a); const yy = y * c - z * s; z = y * s + z * c; y = yy; }
    // lumps (domain-warped fbm) displace along the radial direction
    const lf = S.lumpFreq;
    const w = 0.35 * N.simplex(x * 0.8 + o2[0], y * 0.8 + o2[1], z * 0.8 + o2[2]);
    const lump = N.fbm(x * lf + o1[0] + w, y * lf + o1[1], z * lf + o1[2], 3);
    let disp = S.lump * lump;
    if (S.ridge) disp += S.ridge * (N.ridged(x * S.ridgeFreq + o2[0], y * S.ridgeFreq, z * S.ridgeFreq + o1[2], 4) - 0.55) * (0.5 + 0.5 * fine);
    if (S.wrinkle) {
      const wf = S.wrinkleFreq;
      const qx = x + 0.4 * N.simplex(y * 1.7, z * 1.7, x * 1.7 + 9);
      const qy = y + 0.4 * N.simplex(z * 1.7 + 3, x * 1.7, y * 1.7);
      const rg = N.ridged(qx * wf + o1[1], qy * wf * 1.6, z * wf + o2[1], 3);
      disp += S.wrinkle * (rg - 0.5) * (0.6 + 0.4 * fine);
    }
    const len = Math.hypot(x, y, z) || 1;
    P[i3] = x + (x / len) * disp; P[i3 + 1] = y + (y / len) * disp; P[i3 + 2] = z + (z / len) * disp;
  }

  // 2) fracture facets: cut by planes with smooth (worn) edges + conchoidal ripples
  if (S.facets > 0) {
    for (let f = 0; f < S.facets; f++) {
      const nrm = randomUnit(r);
      let sup = -9;
      for (let i = 0; i < n; i++) { const d = P[i * 3] * nrm[0] + P[i * 3 + 1] * nrm[1] + P[i * 3 + 2] * nrm[2]; if (d > sup) sup = d; }
      const depth = S.facetDepth * (0.45 + r() * 0.75);
      const o = sup * (1 - depth);
      const k = S.facetSoft * (0.6 + r() * 0.8);
      const ip = [nrm[0] * o + (r() - 0.5) * 0.6, nrm[1] * o + (r() - 0.5) * 0.6, nrm[2] * o + (r() - 0.5) * 0.6];
      const cf = 18 + r() * 22;
      for (let i = 0; i < n; i++) {
        const i3 = i * 3;
        const s = P[i3] * nrm[0] + P[i3 + 1] * nrm[1] + P[i3 + 2] * nrm[2] - o;
        if (s < -k) continue;
        let cut = s - smin(s, 0, k);
        if (S.conch && s > 0) {
          const dd = Math.hypot(P[i3] - ip[0], P[i3 + 1] - ip[1], P[i3 + 2] - ip[2]);
          cut += S.conch * Math.sin(dd * cf) * smoothstep(0, k * 2 + 0.01, s) * Math.exp(-dd * 1.2);
        }
        P[i3] -= nrm[0] * cut; P[i3 + 1] -= nrm[1] * cut; P[i3 + 2] -= nrm[2] * cut;
      }
    }
  }

  // 3) bedding terraces (layered sedimentary erosion: soft layers recede)
  if (S.terraces > 0) {
    const ta = S.terraceAxis; const tl = Math.hypot(...ta) || 1;
    const tx = ta[0] / tl, ty = ta[1] / tl, tz = ta[2] / tl;
    const cnt = S.terraceCount;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const h = P[i3] * tx + P[i3 + 1] * ty + P[i3 + 2] * tz;
      const band = h * cnt + 0.3 * N.simplex(P[i3] * 1.3, P[i3 + 1] * 1.3, P[i3 + 2] * 1.3);
      const fr = band - Math.floor(band);
      const recess = S.terraces * 0.045 * smoothstep(0.55, 0.9, fr) * (1 - smoothstep(0.9, 1, fr));
      const len = Math.hypot(P[i3], P[i3 + 1], P[i3 + 2]) || 1;
      // recede perpendicular to the bedding axis only (ledges, not rings)
      const rx = P[i3] - tx * h, ry = P[i3 + 1] - ty * h, rz = P[i3 + 2] - tz * h;
      const rl = Math.hypot(rx, ry, rz) || len;
      P[i3] -= (rx / rl) * recess; P[i3 + 1] -= (ry / rl) * recess; P[i3 + 2] -= (rz / rl) * recess;
    }
  }

  // 4) water-wear: Taubin smoothing rounds edges without shrinking the stone
  const iters = Math.round(S.wear * (2 + level * 1.6));
  if (iters > 0) taubin(P, ico.off, ico.adj, n, iters);

  // 5) pits / solution holes (Worley craters) survive the wear (later weathering)
  if (S.pits > 0) {
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const x = P[i3], y = P[i3 + 1], z = P[i3 + 2];
      const d = N.worley(x * S.pitFreq + o1[0], y * S.pitFreq + o1[1], z * S.pitFreq + o1[2]);
      const mask = 0.5 + 0.5 * N.simplex(x * 1.1 + o2[0], y * 1.1, z * 1.1);
      const pit = (1 - smoothstep(0, S.pitSize, d)) * smoothstep(0.25, 0.6, mask);
      const len = Math.hypot(x, y, z) || 1;
      const depth = S.pits * pit * (0.5 + 0.5 * fine) * (1 + S.holes * 2.2 * pit);
      P[i3] -= (x / len) * depth; P[i3 + 1] -= (y / len) * depth; P[i3 + 2] -= (z / len) * depth;
    }
  }

  // 5b) one aimed hole (a stone with a hole in its face): a deep funnel with a rounded lip
  if (S.bore) {
    const [bx, by, bz, br, bd] = S.bore, bl = Math.hypot(bx, by, bz) || 1;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3, x = P[i3], y = P[i3 + 1], z = P[i3 + 2], len = Math.hypot(x, y, z) || 1;
      const ang = Math.acos(Math.max(-1, Math.min(1, (x * bx + y * by + z * bz) / (len * bl))));
      if (ang > br * 1.5) continue;
      const t = ang / br;
      // steep walls inside the radius, a soft rounded lip just outside it
      const depth = t < 1 ? bd * Math.pow(1 - t * t, 0.6) : -0.015 * Math.sin(Math.min(1, (t - 1) * 2) * Math.PI);
      P[i3] -= (x / len) * depth * len; P[i3 + 1] -= (y / len) * depth * len; P[i3 + 2] -= (z / len) * depth * len;
    }
  }

  // 6) fine grain (only meaningful on dense meshes)
  if (S.grain > 0 && fine > 0) {
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const x = P[i3], y = P[i3 + 1], z = P[i3 + 2];
      // polished / water-worn stones keep almost no geometric grain
      const g = S.grain * fine * (1 - S.wear * 0.85) * N.simplex(x * 22 + o2[2], y * 22, z * 22);
      const len = Math.hypot(x, y, z) || 1;
      P[i3] += (x / len) * g; P[i3 + 1] += (y / len) * g; P[i3 + 2] += (z / len) * g;
    }
  }

  // 7) centre, rest on a base, normalise to unit bounding sphere
  let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const hy = (maxY - minY) / 2;
  const floorY = -hy + S.base * 0.16 * hy;  // resting flat (scaled to the stone's height)
  const bk = 0.06 * hy + 0.0001;
  let rmax = 0;
  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    P[i3] -= cx; P[i3 + 1] -= cy; P[i3 + 2] -= cz;
    if (S.base > 0) P[i3 + 1] = -smin(-P[i3 + 1], -floorY, bk);
    const d = Math.hypot(P[i3], P[i3 + 1], P[i3 + 2]);
    if (d > rmax) rmax = d;
  }
  // re-centre vertically so the base sits at a known height after the flatten
  let minY2 = 1e9, maxY2 = -1e9;
  for (let i = 0; i < n; i++) { const y = P[i * 3 + 1]; if (y < minY2) minY2 = y; if (y > maxY2) maxY2 = y; }
  const shiftY = -(minY2 + maxY2) / 2;
  rmax = 0;
  for (let i = 0; i < n; i++) { P[i * 3 + 1] += shiftY; const d = Math.hypot(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); if (d > rmax) rmax = d; }
  const sc = 1 / rmax;
  for (let i = 0; i < P.length; i++) P[i] *= sc;

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(P, 3));
  g.setIndex(new THREE.BufferAttribute(ico.idx, 1));
  g.computeVertexNormals();

  // 8) cavity: Laplacian projected on the normal (concave > 0), normalised
  const nrm = g.attributes.normal.array;
  const cav = new Float32Array(n);
  let edge = 0;
  for (let i = 0; i < n; i++) {
    const a = ico.off[i], b = ico.off[i + 1], c = b - a, i3 = i * 3;
    let sx = 0, sy = 0, sz = 0;
    for (let k = a; k < b; k++) {
      const j = ico.adj[k] * 3; sx += P[j]; sy += P[j + 1]; sz += P[j + 2];
      if (i < 64) edge += Math.hypot(P[j] - P[i3], P[j + 1] - P[i3 + 1], P[j + 2] - P[i3 + 2]) / c;
    }
    const lx = sx / c - P[i3], ly = sy / c - P[i3 + 1], lz = sz / c - P[i3 + 2];
    cav[i] = lx * nrm[i3] + ly * nrm[i3 + 1] + lz * nrm[i3 + 2];
  }
  edge = edge / 64 || 0.01;
  for (let i = 0; i < n; i++) cav[i] = Math.max(0, Math.min(1, (cav[i] / edge) * 3.2));
  // one blur pass so crevice shading is soft
  const cb = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = cav[i] * 2, w = 2;
    for (let k = ico.off[i]; k < ico.off[i + 1]; k++) { s += cav[ico.adj[k]]; w++; }
    cb[i] = s / w;
  }
  g.setAttribute("aCavity", new THREE.BufferAttribute(cb, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  g.userData = { level, verts: n, tris: ico.idx.length / 3, extents: [maxX - minX, maxY - minY, maxZ - minZ].map((e) => e * sc) };
  return g;
}

/** Bounding-box extents of a recipe at low detail — used for model dimensions in metadata. */
export function stoneExtents(shape) {
  const g = buildStoneGeometry(shape, { level: 3 });
  const bb = g.boundingBox;
  const e = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
  g.dispose();
  return e;
}
