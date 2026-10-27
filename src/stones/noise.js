// Seeded 3D noise for stone geometry (CPU side).
// Simplex noise after Stefan Gustavson's public-domain reference, plus a small
// Worley (cellular) function for pits and clasts. Deterministic per seed.

import { mulberry } from "../utils/math.js";

const G3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];
const F3 = 1 / 3, G3c = 1 / 6;

export function makeNoise(seed) {
  const rnd = mulberry(seed >>> 0 || 1);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512);
  const pm12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm12[i] = perm[i] % 12; }

  function simplex(x, y, z) {
    const s = (x + y + z) * F3;
    const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
    const t = (i + j + k) * G3c;
    const x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3c, y1 = y0 - j1 + G3c, z1 = z0 - k1 + G3c;
    const x2 = x0 - i2 + 2 * G3c, y2 = y0 - j2 + 2 * G3c, z2 = z0 - k2 + 2 * G3c;
    const x3 = x0 - 1 + 0.5, y3 = y0 - 1 + 0.5, z3 = z0 - 1 + 0.5;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let n = 0;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) { const g = G3[pm12[ii + perm[jj + perm[kk]]]]; t0 *= t0; n += t0 * t0 * (g[0] * x0 + g[1] * y0 + g[2] * z0); }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) { const g = G3[pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]]]; t1 *= t1; n += t1 * t1 * (g[0] * x1 + g[1] * y1 + g[2] * z1); }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) { const g = G3[pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]]]; t2 *= t2; n += t2 * t2 * (g[0] * x2 + g[1] * y2 + g[2] * z2); }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) { const g = G3[pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]]]; t3 *= t3; n += t3 * t3 * (g[0] * x3 + g[1] * y3 + g[2] * z3); }
    return 32 * n; // ≈ [-1, 1]
  }

  function fbm(x, y, z, oct = 4, lac = 2.03, gain = 0.5) {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let o = 0; o < oct; o++) {
      s += a * simplex(x * f, y * f, z * f);
      norm += a; a *= gain; f *= lac;
    }
    return s / norm;
  }

  // ridged multifractal in [0, 1]: sharp crests where the noise crosses zero
  function ridged(x, y, z, oct = 4, lac = 2.1, gain = 0.55) {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let o = 0; o < oct; o++) {
      const n = 1 - Math.abs(simplex(x * f, y * f, z * f));
      s += a * n * n;
      norm += a; a *= gain; f *= lac;
    }
    return s / norm;
  }

  // Worley F1 distance (0 at a feature point) with one jittered point per cell
  function worley(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let best = 9;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const cx = xi + dx, cy = yi + dy, cz = zi + dz;
      const h = perm[(cx & 255) + perm[(cy & 255) + perm[cz & 255]]];
      const h2 = perm[(h + 17) & 511], h3 = perm[(h + 101) & 511];
      const px = cx + h / 255, py = cy + h2 / 255, pz = cz + h3 / 255;
      const d = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  return { simplex, fbm, ridged, worley };
}
