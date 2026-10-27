import * as THREE from 'three';
import { mulberry, shapeNum } from '../utils/math.js';

export function makeStoneGeometry(seed, shape, detail = 4) {
  // higher subdivision on capable tiers lets the fine octave + normal map read
  const g = new THREE.IcosahedronGeometry(0.42, Math.max(3, detail | 0));
  const p = g.attributes.position;
  const r = mulberry(seed);
  const sh = shape || {};
  const elong = shapeNum(sh.elongation, 0.25);
  const flat = shapeNum(sh.flatness, 0.3);
  const round = shapeNum(sh.roundness, 0.7);
  // angular stones carry more high-frequency relief; water-worn stones are calm
  const relief = 0.55 + (1 - round) * 0.85;
  // 6 octaves: the last is fine micro-relief (pits/grain) that only resolves
  // once the mesh is subdivided enough — the normal map fills in below that.
  const amps = [0.12, 0.09, 0.07, 0.045, 0.025, 0.014];
  const dirs = [];
  for (let o = 0; o < amps.length; o++) {
    dirs.push({
      x: r() * 6 - 3, y: r() * 6 - 3, z: r() * 6 - 3,
      f: 1.8 + o * 1.5 + r() * 0.8,
      ph: r() * Math.PI * 2,
      a: amps[o] * relief,
    });
  }
  // proportions from the Observer's reading of the photograph
  const squashY = Math.max(0.45, (0.92 + r() * 0.06) - flat * 0.42);
  const stretchX = 1 + elong * 0.55;
  const shrinkZ = 1 - elong * 0.18;
  let rMax = 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let k = 1;
    for (const d of dirs) {
      k += d.a * Math.sin(d.f * (x * d.x + y * d.y + z * d.z) * 0.45 + d.ph);
    }
    const nx = x * k * stretchX, ny = y * k * squashY, nz = z * k * shrinkZ;
    const rr = Math.sqrt(nx * nx + nz * nz);
    if (rr > rMax) rMax = rr;
    p.setXYZ(i, nx, ny, nz);
  }
  // fit the silhouette back inside the vitrine while keeping its proportions
  const fit = Math.min(1, 0.554 / Math.max(0.0001, rMax));
  for (let i = 0; i < p.count; i++) {
    let nx = p.getX(i) * fit, ny = p.getY(i), nz = p.getZ(i) * fit;
    if (ny > 0.55) ny = 0.55 + (ny - 0.55) * 0.3; // stay under the glass
    if (ny < -0.14) ny = -0.14 + (ny + 0.14) * 0.22; // resting base
    p.setXYZ(i, nx, ny, nz);
  }
  g.computeVertexNormals();
  return g;
}

/* ============================================================
   AMBIENT AUDIO — sparse literati room tone (built on first unmute)
   ============================================================ */
