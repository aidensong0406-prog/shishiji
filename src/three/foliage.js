import { buildStoneGeometry } from "../stones/geometry.js";
import { createStoneMaterial } from "../stones/material.js";

/* Organic foliage clumps for the courtyard, built with the stone generator:
   a lumpy, smooth-normal clump with a cavity attribute, shaded by the procedural
   shader where Voronoi cells read as leaf clusters and crevices darken. This
   replaces the faceted low-poly "puffs" that made the garden look cartoonish. */
const geoCache = new Map();
export function foliageGeometry(seed = 31, level = 3) {
  const k = seed + ":" + level;
  if (!geoCache.has(k)) {
    geoCache.set(k, buildStoneGeometry({ seed, axes: [1, 0.82, 1], lump: 0.26, lumpFreq: 3.2, ridge: 0.07, ridgeFreq: 7, wear: 0.15, base: 0, grain: 0 }, { level }));
  }
  return geoCache.get(k);
}

export const FOLIAGE_PALETTES = {
  green: { base: "#3d5a2b", second: "#2c4520", vein: "#7d9150", accent: "#58773a", dark: "#16220f" },
  greenWarm: { base: "#4a6230", second: "#374d23", vein: "#8a9a52", accent: "#6a8040", dark: "#1b2611" },
  greenDeep: { base: "#2f4a27", second: "#23391d", vein: "#5f7a44", accent: "#44633a", dark: "#101a0d" },
  greenOlive: { base: "#55613a", second: "#414c2c", vein: "#8d9762", accent: "#6d7a48", dark: "#1e2414" },
  pine: { base: "#2a4024", second: "#1f321b", vein: "#4e6a3e", accent: "#3a5631", dark: "#0e170c" },
  blossom: { base: "#dc9fb8", second: "#c98aa4", vein: "#f6e3ea", accent: "#efc3d4", dark: "#7b4357" },
  blossomPale: { base: "#ecd3dc", second: "#dcb6c5", vein: "#fbf3f6", accent: "#f5e2ea", dark: "#8f6b7a" },
};

const matCache = new Map();
export function foliageMaterial(name = "green", seed = 7) {
  const k = name + ":" + seed;
  if (!matCache.has(k)) {
    const blossom = name.startsWith("blossom");
    // blossom: fine petal-sized cells and soft relief; leaves: larger leaf clusters
    const m = createStoneMaterial({
      seed, palette: FOLIAGE_PALETTES[name], warp: 0.5, mottle: 0.75, mottleFreq: 2.2,
      crystal: 0.8, crystalFreq: blossom ? 22 : 15, speck: blossom ? 0.45 : 0.4, speckFreq: blossom ? 44 : 38, rough: 0.9, roughVar: 0.08, polish: 0,
      bump: blossom ? 0.02 : 0.04, grainFreq: 40, cavity: blossom ? 1.2 : 1.9,
    }, { quality: "lq" });
    m.envMapIntensity = 0.35;
    matCache.set(k, m);
  }
  return matCache.get(k);
}
