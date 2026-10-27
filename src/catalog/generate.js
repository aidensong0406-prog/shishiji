// Catalog sampler + metadata writer.
// Run via `npm run catalog` (scripts/build-catalog.mjs) — the output JSON is
// committed so every specimen's recipe and text stay fixed under its ID even
// if the generator later changes.

import * as THREE from "three";
import { ANALOGS, FAMILIES, FAMILY_SHAPE, CLASSES, CULTURE } from "./knowledge.js";
import { stoneExtents } from "../stones/geometry.js";
import { mulberry } from "../utils/math.js";
import { PHOTO_STONES } from "./photo.js";

export const CATALOG_VERSION = 1;
export const GENERATOR = "stone-v2";

const rr = (r, a, b) => a + (b - a) * r();
const r3 = (x) => Math.round(x * 1000) / 1000;
const unit = (r) => { const u = r() * 2 - 1, t = r() * 6.2832, s = Math.sqrt(1 - u * u); return [r3(s * Math.cos(t)), r3(u), r3(s * Math.sin(t))]; };
const pickW = (r, weights) => {
  const ks = Object.keys(weights); const tot = ks.reduce((s, k) => s + weights[k], 0);
  let x = r() * tot; for (const k of ks) { x -= weights[k]; if (x <= 0) return k; } return ks[ks.length - 1];
};

/* ---------------- colour naming (CIE Lab nearest) ---------------- */
const NAMED = [
  ["ink black", "墨", "#16161a"], ["charcoal", "玄", "#333335"], ["slate grey", "苍", "#4d555e"], ["iron grey", "铁", "#5d5d5b"],
  ["ash grey", "烟", "#8f8d88"], ["dove grey", "灰", "#b6b3ad"], ["bone white", "雪", "#ece8df"], ["ivory", "玉", "#e4dcc8"],
  ["sand", "沙", "#d1bd98"], ["ochre", "赭", "#b98d4f"], ["amber", "琥", "#c9873f"], ["rust", "锈", "#9c4a2e"],
  ["cinnabar", "丹", "#b2372a"], ["oxblood", "绛", "#6e2a24"], ["umber", "褐", "#6b5444"], ["chestnut", "栗", "#7a4a33"],
  ["rose granite", "霞", "#c99d90"], ["moss green", "苔", "#5f6b4a"], ["jade green", "翠", "#4d6b4f"], ["sea green", "青", "#3e5550"],
  ["plum", "紫", "#4f4a52"], ["olive", "橄", "#7a8170"], ["tan", "驼", "#a88e76"], ["blue grey", "黛", "#5b6a74"],
];
function toLab(hex) {
  const c = new THREE.Color(hex).convertSRGBToLinear();
  const X = (0.4124 * c.r + 0.3576 * c.g + 0.1805 * c.b) / 0.95047;
  const Y = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const Z = (0.0193 * c.r + 0.1192 * c.g + 0.9505 * c.b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const NAMED_LAB = NAMED.map(([en, zh, hex]) => ({ en, zh, lab: toLab(hex) }));
export function nameColour(hex) {
  const l = toLab(hex); let best = NAMED_LAB[0], bd = 1e9;
  for (const n of NAMED_LAB) { const d = (n.lab[0] - l[0]) ** 2 + (n.lab[1] - l[1]) ** 2 + (n.lab[2] - l[2]) ** 2; if (d < bd) { bd = d; best = n; } }
  return best;
}
function jitterPalette(r, pal) {
  const dh = rr(r, -0.012, 0.012), ds = rr(r, -0.06, 0.06), dl = rr(r, -0.05, 0.05);
  return pal.map((h) => {
    const c = new THREE.Color(h);
    c.offsetHSL(dh + rr(r, -0.004, 0.004), ds, dl + rr(r, -0.015, 0.015));
    return "#" + c.getHexString();
  });
}

/* ---------------- recipe sampling ---------------- */
function sampleRecipe(analog, R) {
  const seed = Math.floor(R() * 2 ** 31) >>> 0;
  const r = mulberry(seed ^ 0x5bd1e995);
  const family = pickW(r, analog.families);
  const shape = { seed, ...FAMILY_SHAPE[family](r), ...analog.shape(r) };
  if (shape.facets == null && r() < 0.15 && family !== "scholar") { shape.facets = Math.round(rr(r, 1, 3)); shape.facetDepth = rr(r, 0.06, 0.14); shape.facetSoft = rr(r, 0.08, 0.2); }
  const [base, second, vein, accent, dark] = jitterPalette(r, analog.palettes[Math.floor(r() * analog.palettes.length)]);
  const look = {
    seed, palette: { base, second, vein, accent, dark },
    warp: rr(r, 0.2, 0.6), mottleFreq: rr(r, 1, 2.2), veinAxis: unit(r), veinAxis2: unit(r), veinOffset: r3(rr(r, -0.3, 0.3)),
    veinFreq: rr(r, 1.2, 2.4), bandAxis: unit(r), bandCenter: [r3(rr(r, -0.4, 0.4)), r3(rr(r, -0.3, 0.3)), r3(rr(r, -0.4, 0.4))],
    grainFreq: rr(r, 30, 55), bump: rr(r, 0.008, 0.016),
    ...analog.look(r),
  };
  // keep the recipe compact and stable: round every float
  const round = (o) => { for (const k in o) { const v = o[k]; if (typeof v === "number" && !Number.isInteger(v)) o[k] = r3(v); else if (Array.isArray(v)) o[k] = v.map((x) => (typeof x === "number" ? r3(x) : x)); } return o; };
  return { seed, family, shape: round(shape), look: round(look) };
}

/* a recipe for a stone modelled after a photograph (photo.js): the given silhouette and
   surface over the family's defaults, with a fixed seed of its own */
function photoRecipe(p, i) {
  const seed = 7000003 + i * 7919;
  const r = mulberry(seed ^ 0x2545f491);
  const shape = { seed, ...FAMILY_SHAPE[p.family](r), ...p.shape };
  const [base, second, vein, accent, dark] = p.palette;
  const look = {
    seed, palette: { base, second, vein, accent, dark },
    warp: 0.4, mottleFreq: 1.6, veinAxis: unit(r), veinAxis2: unit(r), veinOffset: 0, veinFreq: 1.8,
    bandAxis: [0.2, 1, 0.1], bandCenter: [0, 0, 0], grainFreq: 42, bump: 0.012,
    mottle: 0.4, rough: 0.6, polish: 0.25, ...p.look,
  };
  const round = (o) => { for (const k in o) { const v = o[k]; if (typeof v === "number" && !Number.isInteger(v)) o[k] = r3(v); else if (Array.isArray(v)) o[k] = v.map((x) => (typeof x === "number" ? r3(x) : x)); } return o; };
  return { seed, family: p.family, analog: p.analog, shape: round(shape), look: round(look), photo: { shelf: p.shelf, n: p.n } };
}

/* ---------------- features: differentiation + similarity ---------------- */
export function featureVector(rec) {
  const s = rec.shape, l = rec.look;
  const ax = s.axes || [1, 0.7, 0.8]; const m = Math.max(...ax); const so = [...ax].sort((a, b) => b - a);
  const lab0 = toLab(l.palette.base), lab1 = toLab(l.palette.second);
  const lab2 = toLab((l.vein || 0) > 0.3 ? l.palette.vein : l.band > 0.3 ? l.palette.accent : l.palette.dark);
  const f = [
    so[1] / m, so[2] / m, (s.square || 0), (s.facets || 0) / 9, s.wear ?? 0.5, (s.lump || 0) * 4, (s.pits || 0) * 10 + (s.holes || 0) * 0.5,
    (s.wrinkle || 0) * 7, s.terraces || 0, ax[1] === m ? 1 : 0,
    lab0[0] / 40, lab0[1] / 25, lab0[2] / 25, (lab1[0] - lab0[0]) / 30, lab2[0] / 60,
    (l.vein || 0) * 1.4, (l.veinMode || 0) * (l.vein || 0) * 0.5, (l.band || 0) * 1.4, (l.bandMode || 0) * (l.band || 0), (l.crystal || 0) * 1.2,
    (l.speck || 0), (l.clast || 0) * 1.4, (l.sparkle || 0) * 0.8, (l.polish || 0) * 1.2,
  ];
  return f.map(r3);
}
export { featureDistance } from "./similarity.js";
import { featureDistance } from "./similarity.js";

/* ---------------- text ---------------- */
const PATTERN_WORDS = {
  vein: { en: ["Snow Vein", "Silver Thread", "White Seam", "Lightning Path", "Mountain Stream"], zh: ["雪脉", "银线", "白缝", "电径", "山溪"] },
  band: { en: ["Strata", "Tide Lines", "Cloud Bands", "Terraces", "Ripple Rings"], zh: ["层岩", "潮痕", "云带", "梯田", "涟漪"] },
  rings: { en: ["Tree Rings", "Moon Halo", "Eye of the Pool", "Ripples", "Sunset Rings"], zh: ["年轮", "月晕", "潭眼", "涟纹", "霞环"] },
  crystal: { en: ["Frost Field", "Starfield", "Rice Grains", "Hoarfrost", "Salt and Pepper"], zh: ["霜野", "星野", "米粒", "雾凇", "椒盐"] },
  speck: { en: ["Night Rain", "Snowfall", "Scattered Stars", "Pepper Dust", "Fine Rain"], zh: ["夜雨", "飞雪", "散星", "胡椒", "细雨"] },
  clast: { en: ["Pebble Bed", "River Market", "Gathered Stones", "Old Riverbank", "Mosaic"], zh: ["卵滩", "河市", "聚石", "古岸", "百衲"] },
  pits: { en: ["Grotto", "Honeycomb", "Cave Heaven", "Moon Craters", "Wind Holes"], zh: ["洞天", "蜂巢", "仙洞", "月坑", "风穴"] },
  wrinkle: { en: ["Folded Peaks", "Wrinkled Cloud", "Dragon Skin", "Mountain Folds", "Crumpled Silk"], zh: ["叠峰", "皱云", "龙皮", "山褶", "皱绡"] },
  facet: { en: ["Broken Cliff", "Blade Ridge", "Split Peak", "Sheer Face", "Cut Edge"], zh: ["断崖", "刃岭", "裂峰", "绝壁", "削棱"] },
  sparkle: { en: ["Mica Shimmer", "Glinting Frost", "Fish Scale", "Starlit Shoal", "Sequins"], zh: ["云母光", "闪霜", "鱼鳞", "星滩", "碎金"] },
  plain: { en: ["Sleeping Cloud", "Lone Moon", "Quiet Water", "Round Calm", "Smooth Hill"], zh: ["卧云", "孤月", "静水", "圆融", "平丘"] },
};

function dominantPattern(rec) {
  const s = rec.shape, l = rec.look;
  const c = [
    ["vein", (l.vein || 0) * (l.veinMode ? 1.2 : 0.9)], ["band", (l.band || 0) * (l.bandMode ? 0 : 1)], ["rings", (l.band || 0) * (l.bandMode ? 1.1 : 0)],
    ["crystal", (l.crystal || 0) * 0.9], ["speck", (l.speck || 0) * 1.2], ["clast", (l.clast || 0) * 1.1],
    ["pits", (s.pits || 0) * 9 + (s.holes || 0) * 0.4], ["wrinkle", (s.wrinkle || 0) * 7], ["facet", (s.facets || 0) > 3 ? 0.55 + (s.conch || 0) * 20 : 0],
    ["sparkle", (l.sparkle || 0) * 0.85],
  ].sort((a, b) => b[1] - a[1]);
  return c[0][1] > 0.25 ? c[0][0] : "plain";
}

function traitsOf(rec) {
  const s = rec.shape, l = rec.look;
  const c = (x) => r3(Math.max(0, Math.min(1, x)));
  return {
    veining: c(l.vein || 0), banding: c(l.band || 0), concentric: c((l.band || 0) * (l.bandMode || 0)), crystalline: c(l.crystal || 0),
    speckle: c(l.speck || 0), clasts: c(l.clast || 0), sparkle: c(l.sparkle || 0), pitting: c((s.pits || 0) * 10 + (s.holes || 0) * 0.3),
    faceting: c((s.facets || 0) / 8), waterWear: c(s.wear ?? 0.5), gloss: c(l.polish || 0), wrinkling: c((s.wrinkle || 0) * 7), layering: c(s.terraces || 0),
  };
}

const SIZE_CM = { pebble: [4, 9], disc: [5, 11], egg: [4, 8], elongate: [7, 16], cobble: [8, 20], slab: [10, 32], angular: [6, 18], shard: [4, 12], scholar: [18, 65], nodule: [5, 14], boulder: [20, 48] };

function describe(rec, analog, dims, colours, traits) {
  const fam = FAMILIES[rec.family];
  const famWord = fam.en.toLowerCase();
  const art = /^[aeiou]/.test(famWord) ? "An" : "A";
  const parts = [];
  parts.push(`${art} ${famWord} form measuring ${dims[0]} × ${dims[1]} × ${dims[2]} cm.`);
  parts.push(`Ground colour ${colours.base.en}${colours.second.en !== colours.base.en ? ` shading to ${colours.second.en}` : ""}.`);
  const pat = [];
  if (traits.veining > 0.4) pat.push(rec.look.veinMode ? `${rec.look.veinMode === 2 ? "two crossing" : "a single"} ${colours.vein.en} vein${rec.look.veinMode === 2 ? "s" : ""}` : `a network of ${colours.vein.en} veins`);
  if (traits.banding > 0.4) pat.push(traits.concentric > 0.4 ? `concentric ${colours.accent.en} rings` : `parallel ${colours.accent.en} bands`);
  if (traits.crystalline > 0.4) pat.push("a mosaic of visible crystal grains");
  if (traits.speckle > 0.3) pat.push(`${colours.dark.en} and pale flecks`);
  if (traits.clasts > 0.4) pat.push("rounded inclusions of several colours");
  if (traits.pitting > 0.4) pat.push(traits.pitting > 0.8 ? "deep hollows and openings" : "scattered pits");
  if (traits.wrinkling > 0.4) pat.push("a sharply wrinkled skin");
  if (traits.layering > 0.4) pat.push("stepped layers");
  if (traits.sparkle > 0.4) pat.push("fine glinting points");
  if (pat.length) parts.push(`Pattern: ${pat.join(", ")}.`);
  const surf = [traits.waterWear > 0.7 ? "water-worn" : traits.faceting > 0.4 ? "broken and angular" : "lightly worn",
    traits.gloss > 0.6 ? "glossy" : traits.gloss > 0.25 ? "satin" : "matte"];
  parts.push(`Surface: ${surf.join(", ")}.`);
  return parts.join(" ");
}

function hypotheses(rec, analog, traits) {
  const h = [];
  const lead = `In a ${analog.en.toLowerCase().replace(/ \(.*\)/, "")}`;
  if (traits.veining > 0.4 && rec.look.veinMode) h.push(`${lead}, white veins of this kind would most likely be quartz or calcite that filled fractures before the stone was eroded.`);
  else if (traits.veining > 0.4) h.push(`${lead}, the vein network would most likely record fractures later filled by minerals carried in fluids.`);
  if (traits.banding > 0.4 && traits.concentric > 0.4) h.push(`${lead}, concentric banding would suggest material deposited in successive layers around a centre, as in agates and some jaspers.`);
  else if (traits.banding > 0.4) {
    const why = { sedimentary: "depositional bedding — changes in grain size or composition as sediment settled", metamorphic: "mineral segregation and alignment during metamorphism (foliation)", igneous: "flow banding in lava that moved as it cooled", silica: "successive layers of silica deposition", scholar: "bedding in the original limestone" }[analog.cls];
    h.push(`${lead}, the parallel bands would most plausibly record ${why}.`);
  }
  if (traits.pitting > 0.4) h.push(`${lead}, the pits could reflect dissolution (in carbonate rocks) or trapped gas bubbles (in lavas); the model alone cannot tell which.`);
  if (traits.waterWear > 0.75 && traits.faceting < 0.3) h.push(`${lead}, such rounding would be consistent with long transport in a river or on a beach, where abrasion removes corners.`);
  if (traits.faceting > 0.5) h.push(`${lead}, flat faces meeting at sharp edges would suggest a fairly recent break with little transport since.`);
  if ((rec.shape.conch || 0) > 0.006) h.push(`${lead}, the rippled, shell-like fracture surfaces would point to a glassy or very fine-grained silica rock.`);
  if (!h.length) h.push(`${lead}, its smooth, even surface would suggest a fine-grained, uniform rock; nothing in the form points to a particular history.`);
  return h;
}

function interpretation(rec, pat, traits) {
  const f = rec.family;
  const forms = {
    scholar: "Read as a scholar's rock, the upright form suggests a distant peak (峰), a whole mountain held at desk scale.",
    slab: "Stood on edge, the slab could serve as a landscape screen (山水屏), its surface read like a painting.",
    disc: "Its flatness invites holding: a palm stone (掌玩石) to be turned in the hand.",
    pebble: "A pebble of the kind picked up on a walk — the point of 拾石, 'picking up stones'.",
    egg: "The egg form reads as completeness, a stone that seems to hold something inside.",
    elongate: "The long form suggests a reclining figure or a ridge seen from afar.",
    cobble: "Squat and heavy, it reads as a seated mountain (坐山).",
    angular: "Its broken planes read as cliffs and ledges, a craggy landscape in miniature.",
    shard: "Thin and sharp, it suggests a blade of rock or a splintered peak.",
    nodule: "Lumpy and rounded, it can be read as clouds gathering (云头).",
    boulder: "Massive and rounded, it reads as a hill seen across water.",
  };
  const pats = {
    vein: "The pale line can be read as a waterfall or mountain path — the kind of image collectors prize in 'picture stones' (画面石).",
    band: "The bands read as strata, clouds or tide lines.",
    rings: "The rings read as ripples on a pond, or the halo around a moon.",
    crystal: "The grains read as frost, or a field of stars.",
    speck: "The flecks read as falling snow or night rain.",
    clast: "The inclusions read as a riverbed in cross-section, a gathering of smaller stones.",
    pits: "The hollows invite the eye to travel through the stone, as in a grotto (洞天).",
    wrinkle: "The folded skin reads as mountain ranges seen from the air.",
    facet: "Turning it under a moving light, each plane brightens in turn — a different face for every hour.",
    sparkle: "The glints read as sunlight on water.",
    plain: "Its plainness is its point: an unbroken surface for quiet looking.",
  };
  return `${forms[f]} ${pats[pat]}`;
}

function culturalNotes(analog, traits) {
  const out = [...CULTURE.general];
  if (analog.cls === "scholar") { out.push(CULTURE.famous); out.push(CULTURE.criteria); }
  if (analog.culture && CULTURE[analog.culture]) out.push(CULTURE[analog.culture]);
  if (traits.gloss < 0.3 && (traits.veining > 0.4 || traits.banding > 0.4)) out.push(CULTURE.wet);
  return out;
}

/* ---------------- catalog ---------------- */
export function generateCatalog({ seed = 20261026 } = {}) {
  const R = mulberry(seed);
  const all = [];
  const TH_ANALOG = 0.62, TH_ALL = 0.42;
  for (const analog of ANALOGS) {
    const mine = [];
    let tries = 0;
    while (mine.length < analog.quota && tries < analog.quota * 400) {
      tries++;
      const rec = sampleRecipe(analog, R);
      rec.fv = featureVector(rec);
      const relax = tries > analog.quota * 120 ? 0.75 : 1;
      if (mine.some((o) => featureDistance(o.fv, rec.fv) < TH_ANALOG * relax)) continue;
      if (all.some((o) => featureDistance(o.fv, rec.fv) < TH_ALL * relax)) continue;
      rec.analog = analog.key;
      mine.push(rec); all.push(rec);
    }
    if (mine.length < analog.quota) throw new Error(`analog ${analog.key}: only ${mine.length}/${analog.quota} distinct recipes`);
  }
  // interleave deterministically so neighbouring IDs differ in type
  const order = all.map((rec, i) => ({ rec, k: mulberry(rec.seed)() + (i % 7) * 1e-9 })).sort((a, b) => a.k - b.k).map((o) => o.rec);

  // stones modelled after photographs of real stones take the place of the generated
  // specimen each most resembles: the register keeps its size and its IDs
  const taken = new Set();
  PHOTO_STONES.forEach((p, pi) => {
    const rec = photoRecipe(p, pi);
    rec.fv = featureVector(rec);
    let bi = -1, bd = Infinity;
    order.forEach((o, i) => { if (taken.has(i)) return; const d = featureDistance(o.fv, rec.fv); if (d < bd) { bd = d; bi = i; } });
    taken.add(bi); order[bi] = rec;
  });

  const usedTitles = new Set();
  return order.map((rec, i) => {
    const analog = ANALOGS.find((a) => a.key === rec.analog);
    const id = "SSJ-" + String(i + 1).padStart(4, "0");
    const ext = stoneExtents(rec.shape);
    const [lo, hi] = SIZE_CM[rec.family];
    const longest = rr(mulberry(rec.seed ^ 77), lo, hi);
    const me = Math.max(...ext);
    const dims = ext.map((e) => Math.round((e / me) * longest * 10) / 10).sort((a, b) => b - a);
    const P = rec.look.palette;
    const colours = { base: nameColour(P.base), second: nameColour(P.second), vein: nameColour(P.vein), accent: nameColour(P.accent), dark: nameColour(P.dark) };
    const traits = traitsOf(rec);
    const pat = dominantPattern(rec);
    // title: pattern word · colour + form character (unique across the catalog)
    const fam = FAMILIES[rec.family];
    const words = PATTERN_WORDS[pat];
    let title = null;
    const rt = mulberry(rec.seed ^ 991);
    const start = Math.floor(rt() * words.en.length);
    const colourChar = pat === "vein" ? colours.base : colours.base;
    for (let k = 0; k < words.en.length * 2 && !title; k++) {
      const w = (start + k) % words.en.length;
      const second = k >= words.en.length ? colours.second : colourChar;
      const en = `${words.en[w]} · ${cap(second.en)} ${fam.short}`;
      const zh = `${words.zh[w]}·${second.zh}${fam.char}`;
      if (!usedTitles.has(en) && !usedTitles.has(zh)) { title = { en, zh }; usedTitles.add(en); usedTitles.add(zh); }
    }
    if (!title) {
      let n = 2; while (usedTitles.has(`${words.en[start]} · ${cap(colourChar.en)} ${fam.short} ${roman(n)}`)) n++;
      title = { en: `${words.en[start]} · ${cap(colourChar.en)} ${fam.short} ${roman(n)}`, zh: `${words.zh[start]}·${colourChar.zh}${fam.char}其${"二三四五六七八九"[n - 2]}` };
      usedTitles.add(title.en); usedTitles.add(title.zh);
    }
    const tags = [analog.key, analog.cls, rec.family, colours.base.en, pat];
    for (const [k, v] of Object.entries(traits)) if (v > 0.5) tags.push(k);
    return {
      id, title, analog: analog.key, analogName: { en: analog.en, zh: analog.zh }, class: analog.cls, className: CLASSES[analog.cls],
      family: rec.family, familyName: { en: fam.en, zh: fam.zh }, pattern: pat, dims_cm: dims,
      colours: Object.fromEntries(Object.entries(colours).map(([k, v]) => [k, { name: v.en, zh: v.zh, hex: P[k === "base" ? "base" : k] }])),
      traits, tags: [...new Set(tags)],
      notes: {
        observation: { kind: "observation", text: describe(rec, analog, dims, colours, traits) },
        geology: analog.facts.map((text) => ({ kind: "fact", text })),
        hypotheses: hypotheses(rec, analog, traits).map((text) => ({ kind: "hypothesis", text })),
        interpretation: { kind: "interpretation", text: interpretation(rec, pat, traits) },
        culture: culturalNotes(analog, traits),
      },
      fv: rec.fv, shape: rec.shape, look: rec.look,
    };
  });
}
const cap = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const roman = (n) => ["", "I", "II", "III", "IV", "V", "VI"][n] || String(n);
