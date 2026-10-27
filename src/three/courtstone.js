import * as THREE from "three";
import { buildStoneGeometry } from "../stones/geometry.js";
import { createStoneMaterial } from "../stones/material.js";

/* Natural stone for the courtyard ground, made with the stone generator:
   flagstones, stepping stones and raked gravel instead of flat-coloured boxes. */

const LOOKS = {
  flag: { palette: { base: "#787166", second: "#696257", vein: "#958d80", accent: "#867f73", dark: "#36322d" }, mottle: 0.7, mottleFreq: 1.1, speck: 0.25, speckFreq: 40, crystal: 0.15, crystalFreq: 30, rough: 0.9, bump: 0.02, cavity: 1.4, grainFreq: 30 },
  step: { palette: { base: "#4b4842", second: "#3e3b36", vein: "#7d786e", accent: "#5c5850", dark: "#1f1d1a" }, mottle: 0.5, mottleFreq: 1.6, speck: 0.3, speckFreq: 45, rough: 0.7, polish: 0.08, bump: 0.018, cavity: 1.2 },
  gravel: { palette: { base: "#8a857a", second: "#6f6b62", vein: "#b0aa9d", accent: "#a29c90", dark: "#45423c" }, crystal: 1, crystalFreq: 42, speck: 0.3, speckFreq: 70, mottle: 0.3, rough: 0.95, bump: 0.05, cavity: 0.5, grainFreq: 60 },
  rake: { palette: { base: "#6c685f", second: "#5b5850", vein: "#8b867b", accent: "#7c776d", dark: "#34322d" }, crystal: 1, crystalFreq: 42, speck: 0.3, speckFreq: 70, mottle: 0.2, rough: 0.97, bump: 0.05, cavity: 0.5, grainFreq: 60 },
};
const mats = new Map();
export function courtStoneMaterial(kind, seed = 5) {
  const k = kind + seed;
  if (!mats.has(k)) { const m = createStoneMaterial({ seed, ...LOOKS[kind] }, { quality: "lq" }); m.envMapIntensity = 0.25; mats.set(k, m); }
  return mats.get(k);
}

/** A natural slab sized exactly sx × sy × sz (m), resting on y = 0. */
export function slabGeometry(seed, sx, sy, sz, { wear = 0.35, lump = 0.012, square = 0.85 } = {}) {
  const g = buildStoneGeometry({ seed, axes: [1, 0.12, sz / sx], square, wear, lump, lumpFreq: 1.6, base: 0, grain: 0.002 }, { level: 3 });
  g.computeBoundingBox();
  const b = g.boundingBox;
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.scale(sx / (b.max.x - b.min.x), sy / (b.max.y - b.min.y), sz / (b.max.z - b.min.z));
  g.computeVertexNormals();
  return g;
}

/* Garden rocks from the stone generator: a Taihu-style hero rock with holes,
   and water-worn accent rocks. Returns a mesh resting on y = 0, `height` tall. */
export function gardenRock(kind, seed, height) {
  const recipes = {
    taihu: { axes: [0.6, 1, 0.48], lump: 0.24, lumpFreq: 1.5, twist: 0.4, bend: 0.12, wrinkle: 0.05, wrinkleFreq: 2.2, pits: 0.085, pitFreq: 2.4, pitSize: 0.46, holes: 1, wear: 0.45, base: 1 },
    accent: { axes: [1, 0.62, 0.8], square: 0.12, lump: 0.1, lumpFreq: 1.3, wear: 0.7, base: 0.7, pits: 0.02, pitFreq: 4, pitSize: 0.3 },
  };
  const looks = {
    taihu: { palette: { base: "#8a8882", second: "#73716b", vein: "#b4b2aa", accent: "#9c9a93", dark: "#2c2b29" }, mottle: 0.6, mottleFreq: 1.8, rough: 0.82, cavity: 1.6, bump: 0.02 },
    accent: { palette: { base: "#77736a", second: "#625f57", vein: "#a8a397", accent: "#8a867c", dark: "#2c2a26" }, mottle: 0.5, speck: 0.2, speckFreq: 40, rough: 0.8, cavity: 1.2, bump: 0.018 },
  };
  const g = buildStoneGeometry({ seed, ...recipes[kind] }, { level: kind === "taihu" ? 5 : 4 });
  g.computeBoundingBox();
  const b = g.boundingBox, k = height / (b.max.y - b.min.y);
  const m = new THREE.Mesh(g, createStoneMaterial({ seed, ...looks[kind] }, { quality: "lq" }));
  m.material.envMapIntensity = 0.3;
  m.scale.setScalar(k); m.position.y = -b.min.y * k;
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
