// Reference knowledge for the catalog.
// Statements in `facts` are general, well-established descriptions of a rock
// type (kind: "fact"). They describe the rock type a specimen is modelled on,
// never the specimen itself — every specimen is digitally generated.

export const CLASSES = {
  igneous: { en: "Igneous", zh: "火成岩" },
  sedimentary: { en: "Sedimentary", zh: "沉积岩" },
  metamorphic: { en: "Metamorphic", zh: "变质岩" },
  silica: { en: "Silica (chalcedony & quartz)", zh: "硅质" },
  scholar: { en: "Scholar's-rock style", zh: "供石风格" },
};

export const FAMILIES = {
  pebble: { en: "Pebble", short: "Pebble", zh: "卵石", char: "卵" },
  disc: { en: "Disc", short: "Disc", zh: "扁石", char: "饼" },
  egg: { en: "Egg", short: "Egg", zh: "蛋形", char: "丸" },
  elongate: { en: "Elongate", short: "Spindle", zh: "长条", char: "梭" },
  cobble: { en: "Cobble", short: "Cobble", zh: "砾块", char: "墩" },
  slab: { en: "Slab", short: "Slab", zh: "板石", char: "屏" },
  angular: { en: "Angular block", short: "Block", zh: "棱块", char: "岩" },
  shard: { en: "Shard", short: "Shard", zh: "石片", char: "片" },
  scholar: { en: "Upright peak", short: "Peak", zh: "立峰", char: "峰" },
  nodule: { en: "Nodule", short: "Nodule", zh: "结核", char: "团" },
  boulder: { en: "Rounded boulder", short: "Boulder", zh: "圆墩", char: "丘" },
};

/* silhouette families → base shape recipes (r: seeded random in [0,1)) */
const rr = (r, a, b) => a + (b - a) * r();
const unit = (r) => { const u = r() * 2 - 1, t = r() * 6.2832, s = Math.sqrt(1 - u * u); return [+(s * Math.cos(t)).toFixed(3), +u.toFixed(3), +(s * Math.sin(t)).toFixed(3)]; };
export const FAMILY_SHAPE = {
  pebble: (r) => ({ axes: [1, rr(r, 0.5, 0.72), rr(r, 0.68, 0.92)], square: rr(r, 0, 0.15), lump: rr(r, 0.03, 0.09), wear: rr(r, 0.7, 1), taper: rr(r, -0.12, 0.12), base: rr(r, 0.3, 0.7) }),
  disc: (r) => ({ axes: [1, rr(r, 0.24, 0.38), rr(r, 0.75, 0.95)], square: rr(r, 0, 0.2), lump: rr(r, 0.02, 0.06), wear: rr(r, 0.75, 1), taper: rr(r, -0.1, 0.1), base: rr(r, 0.5, 0.9) }),
  egg: (r) => ({ axes: [1, rr(r, 0.62, 0.78), rr(r, 0.66, 0.82)], taper: rr(r, 0.18, 0.34) * (r() < 0.5 ? -1 : 1), lump: rr(r, 0.02, 0.06), wear: rr(r, 0.8, 1), base: rr(r, 0.2, 0.5) }),
  elongate: (r) => ({ axes: [1, rr(r, 0.3, 0.45), rr(r, 0.36, 0.55)], bend: rr(r, -0.25, 0.25), twist: rr(r, 0, 0.5), lump: rr(r, 0.04, 0.1), wear: rr(r, 0.55, 0.95), taper: rr(r, -0.2, 0.2), base: rr(r, 0.3, 0.7) }),
  cobble: (r) => ({ axes: [1, rr(r, 0.6, 0.82), rr(r, 0.7, 0.92)], square: rr(r, 0.08, 0.3), lump: rr(r, 0.06, 0.12), lumpFreq: rr(r, 0.8, 1.4), wear: rr(r, 0.45, 0.8), base: rr(r, 0.4, 0.8) }),
  slab: (r) => ({ axes: [1, rr(r, 0.14, 0.24), rr(r, 0.6, 0.85)], square: rr(r, 0.45, 0.8), lump: rr(r, 0.02, 0.06), wear: rr(r, 0.15, 0.5), facets: Math.round(rr(r, 0, 3)), facetDepth: rr(r, 0.08, 0.2), facetSoft: rr(r, 0.02, 0.08), base: rr(r, 0.6, 1) }),
  angular: (r) => ({ axes: [1, rr(r, 0.6, 0.85), rr(r, 0.65, 0.9)], square: rr(r, 0, 0.22), lump: rr(r, 0.06, 0.14), facets: Math.round(rr(r, 4, 8)), facetDepth: rr(r, 0.12, 0.3), facetSoft: rr(r, 0.02, 0.08), wear: rr(r, 0.05, 0.35), ridge: rr(r, 0.01, 0.04), base: rr(r, 0.5, 0.9) }),
  shard: (r) => ({ axes: [1, rr(r, 0.3, 0.5), rr(r, 0.45, 0.7)], square: rr(r, 0, 0.2), lump: rr(r, 0.04, 0.1), facets: Math.round(rr(r, 5, 9)), facetDepth: rr(r, 0.18, 0.35), facetSoft: rr(r, 0.01, 0.04), wear: rr(r, 0, 0.15), taper: rr(r, -0.35, 0.35), base: rr(r, 0.4, 0.8) }),
  scholar: (r) => ({ axes: [rr(r, 0.45, 0.68), 1, rr(r, 0.36, 0.56)], lump: rr(r, 0.14, 0.24), lumpFreq: rr(r, 1.1, 1.9), twist: rr(r, 0, 0.6), bend: rr(r, -0.18, 0.18), wrinkle: rr(r, 0.02, 0.06), wrinkleFreq: rr(r, 1.8, 3), wear: rr(r, 0.35, 0.65), base: rr(r, 0.8, 1) }),
  nodule: (r) => ({ axes: [1, rr(r, 0.68, 0.88), rr(r, 0.74, 0.94)], lump: rr(r, 0.08, 0.15), lumpFreq: rr(r, 1.1, 1.9), wear: rr(r, 0.55, 0.85), base: rr(r, 0.3, 0.6) }),
  boulder: (r) => ({ axes: [1, rr(r, 0.72, 0.9), rr(r, 0.78, 0.96)], square: rr(r, 0.03, 0.22), lump: rr(r, 0.08, 0.15), wear: rr(r, 0.55, 0.9), base: rr(r, 0.5, 0.9) }),
};

/*
 * Analogs: the rock types specimens are modelled on.
 * palettes: [base, second, vein, accent, dark] in sRGB hex.
 * look(r): pattern recipe deltas; shape(r): silhouette deltas.
 */
export const ANALOGS = [
  {
    key: "greywacke", en: "Greywacke pebble", zh: "杂砂岩卵石", cls: "sedimentary", quota: 22,
    families: { pebble: 4, egg: 3, disc: 2, elongate: 1, cobble: 1 },
    palettes: [["#5d6166", "#4c5055", "#ece8df", "#8a8d8f", "#2b2d30"], ["#6a6560", "#57524c", "#f1ede4", "#97918a", "#2e2b28"], ["#4f5a5e", "#434c50", "#e6e4dc", "#7e898c", "#24292b"], ["#6e6a5e", "#5c584e", "#efe9d9", "#9b9585", "#2f2c26"]],
    look: (r) => ({ vein: rr(r, 0.85, 1), veinMode: r() < 0.55 ? 1 : 2, veinWidth: rr(r, 0.035, 0.11), mottle: rr(r, 0.3, 0.6), speck: rr(r, 0, 0.25), speckFreq: rr(r, 40, 70), rough: rr(r, 0.5, 0.7), polish: rr(r, 0.15, 0.4), veinRelief: rr(r, 0.1, 0.25) }),
    shape: () => ({}),
    facts: [
      "Greywacke is a hard, dark sandstone made of poorly sorted mineral and rock fragments set in a fine, clay-rich matrix.",
      "It is a common source of river and beach pebbles in many mountain regions.",
    ],
  },
  {
    key: "granite", en: "Granite", zh: "花岗岩", cls: "igneous", quota: 18,
    families: { cobble: 3, pebble: 2, boulder: 3, angular: 2, egg: 1 },
    palettes: [["#c9a9a0", "#b48f84", "#ece4dc", "#e2d6cf", "#2a2523"], ["#b8b4ae", "#9e9a94", "#efece6", "#d9d4cc", "#1f1d1c"], ["#d2a58c", "#c08a6f", "#f0e3d4", "#e6cdb9", "#2d2420"], ["#a8a39b", "#8c8880", "#e8e4dc", "#c9a493", "#191817"]],
    look: (r) => ({ crystal: rr(r, 0.75, 1), crystalFreq: rr(r, 12, 26), speck: rr(r, 0.1, 0.35), mottle: rr(r, 0.2, 0.5), rough: rr(r, 0.55, 0.8), polish: rr(r, 0.05, 0.25), sparkle: rr(r, 0, 0.3) }),
    shape: (r) => ({ lump: rr(r, 0.04, 0.1) }),
    facts: [
      "Granite is a coarse-grained intrusive igneous rock made mainly of quartz and feldspar, with smaller amounts of mica or amphibole.",
      "It crystallises slowly from magma deep underground, which lets individual mineral grains grow large enough to see.",
    ],
  },
  {
    key: "diorite", en: "Diorite", zh: "闪长岩", cls: "igneous", quota: 10,
    families: { cobble: 2, pebble: 2, boulder: 2, egg: 1 },
    palettes: [["#bdbab3", "#a3a09a", "#f2f0ea", "#e4e1da", "#151515"], ["#9fa29e", "#878a86", "#ecece6", "#d0d2cc", "#121313"], ["#c4bdb0", "#aaa395", "#f1ece2", "#ddd5c6", "#1b1a18"]],
    look: (r) => ({ crystal: rr(r, 0.85, 1), crystalFreq: rr(r, 16, 30), speck: rr(r, 0.3, 0.55), speckFreq: rr(r, 30, 55), mottle: rr(r, 0.1, 0.3), rough: rr(r, 0.5, 0.75), polish: rr(r, 0.1, 0.35) }),
    shape: () => ({}),
    facts: [
      "Diorite is an intermediate intrusive igneous rock dominated by plagioclase feldspar with dark minerals such as hornblende or biotite.",
      "The mix of light and dark grains gives it a characteristic 'salt-and-pepper' appearance.",
    ],
  },
  {
    key: "basalt", en: "Basalt", zh: "玄武岩", cls: "igneous", quota: 14,
    families: { cobble: 2, angular: 2, pebble: 2, nodule: 2, boulder: 1, disc: 1 },
    palettes: [["#3b3b3d", "#323234", "#6f6a64", "#55524e", "#18181a"], ["#45413d", "#3a3734", "#8b7d6e", "#5d564f", "#1c1a19"], ["#33363a", "#2b2e31", "#6b6f72", "#4b4f53", "#141618"]],
    look: (r) => ({ mottle: rr(r, 0.2, 0.5), speck: rr(r, 0.05, 0.25), speckFreq: rr(r, 50, 90), rough: rr(r, 0.65, 0.9), polish: rr(r, 0, 0.15), cavity: rr(r, 0.9, 1.2), vein: r() < 0.2 ? rr(r, 0.5, 0.8) : 0, veinMode: 1, veinWidth: rr(r, 0.02, 0.05) }),
    shape: (r) => (r() < 0.6 ? { pits: rr(r, 0.02, 0.06), pitFreq: rr(r, 4, 9), pitSize: rr(r, 0.25, 0.42) } : {}),
    facts: [
      "Basalt is a fine-grained, dark extrusive igneous rock formed from lava rich in iron and magnesium.",
      "Gas bubbles trapped as lava cools can leave rounded holes called vesicles.",
    ],
  },
  {
    key: "quartzite", en: "Quartzite", zh: "石英岩", cls: "metamorphic", quota: 14,
    families: { pebble: 3, cobble: 2, egg: 2, boulder: 1, disc: 1 },
    palettes: [["#e6ddd0", "#d6cabb", "#fbf8f2", "#efe7dc", "#8c8072"], ["#e3c9be", "#d4b1a3", "#f8efe9", "#ecd8cf", "#8a6b60"], ["#ddd6c3", "#cbc2aa", "#f7f4ea", "#e9e2cf", "#7d7564"], ["#cfc8c0", "#bab2a9", "#f4f1ec", "#e1dbd3", "#6a645d"]],
    look: (r) => ({ crystal: rr(r, 0.2, 0.5), crystalFreq: rr(r, 30, 55), mottle: rr(r, 0.4, 0.8), sparkle: rr(r, 0.3, 0.7), rough: rr(r, 0.45, 0.65), polish: rr(r, 0.2, 0.45), band: r() < 0.3 ? rr(r, 0.15, 0.35) : 0, bandFreq: rr(r, 2, 4), vein: r() < 0.3 ? rr(r, 0.4, 0.7) : 0, veinMode: 0, veinWidth: rr(r, 0.03, 0.06) }),
    shape: () => ({}),
    facts: [
      "Quartzite is a metamorphic rock formed when quartz-rich sandstone is recrystallised by heat and pressure.",
      "It is very hard; when broken, fractures pass through the quartz grains rather than around them.",
    ],
  },
  {
    key: "marble", en: "Marble", zh: "大理岩", cls: "metamorphic", quota: 13,
    families: { cobble: 2, pebble: 2, slab: 2, egg: 1, boulder: 1 },
    palettes: [["#ece9e3", "#dedad2", "#7d7a76", "#cfcac2", "#4a4845"], ["#e8e1d6", "#d9cfc0", "#a08b6c", "#c8b9a1", "#5c5040"], ["#d8d9d6", "#c4c6c3", "#4f5357", "#b2b5b2", "#2f3134"], ["#ecdcd6", "#dcc5bd", "#9a6c62", "#c9aaa0", "#4d3631"]],
    look: (r) => ({ vein: rr(r, 0.6, 0.95), veinMode: 0, veinFreq: rr(r, 0.9, 2), veinWidth: rr(r, 0.03, 0.08), warp: rr(r, 0.4, 0.9), crystal: rr(r, 0.1, 0.3), crystalFreq: rr(r, 35, 60), mottle: rr(r, 0.2, 0.5), rough: rr(r, 0.3, 0.5), polish: rr(r, 0.35, 0.7), veinRelief: 0.02 }),
    shape: () => ({}),
    facts: [
      "Marble is a metamorphic rock formed by the recrystallisation of limestone or dolostone, so it is made mostly of calcite or dolomite.",
      "Coloured veins and swirls in marble typically come from impurities such as clay, iron oxides or graphite.",
    ],
  },
  {
    key: "limestone", en: "Limestone", zh: "石灰岩", cls: "sedimentary", quota: 12,
    families: { cobble: 2, nodule: 2, pebble: 2, angular: 1, boulder: 1 },
    palettes: [["#c9bfae", "#b7ac99", "#e8e2d6", "#d6cdbd", "#5f574b"], ["#a9a59c", "#96928a", "#dad7cf", "#bfbbb2", "#4a4741"], ["#cdb894", "#bba37c", "#ece0c8", "#dccaa8", "#62553f"]],
    look: (r) => ({ mottle: rr(r, 0.4, 0.8), speck: rr(r, 0.05, 0.2), speckFreq: rr(r, 35, 60), band: r() < 0.35 ? rr(r, 0.15, 0.35) : 0, bandFreq: rr(r, 2.5, 5), rough: rr(r, 0.65, 0.9), polish: rr(r, 0, 0.12), cavity: rr(r, 0.9, 1.3) }),
    shape: (r) => ({ pits: rr(r, 0.01, 0.04), pitFreq: rr(r, 3, 7), pitSize: rr(r, 0.25, 0.4) }),
    facts: [
      "Limestone is a sedimentary rock composed mainly of calcium carbonate (calcite), often built from shells and skeletal fragments.",
      "Slightly acidic water slowly dissolves limestone, producing pits, channels and caves.",
    ],
  },
  {
    key: "taihu", en: "Taihu-style limestone", zh: "太湖石风格", cls: "scholar", quota: 14,
    families: { scholar: 6, nodule: 2, boulder: 1, elongate: 1 },
    palettes: [["#a7a59f", "#94928c", "#d8d6cf", "#bdbbb4", "#3d3c39"], ["#b3ada3", "#a0998e", "#e1dcd2", "#c6c0b5", "#46423c"], ["#9a9c9c", "#878989", "#cfd1d0", "#b1b3b3", "#353737"], ["#c2b49a", "#ad9f85", "#e6dcc8", "#8f8068", "#4a4234"], ["#7f8689", "#6c7376", "#c3c8c9", "#9aa1a3", "#2c3133"], ["#d3cfc6", "#c0bbb1", "#eeebe5", "#a9a39a", "#5a564f"]],
    look: (r) => ({ mottle: rr(r, 0.4, 0.75), mottleFreq: rr(r, 1.5, 2.5), rough: rr(r, 0.7, 0.9), polish: rr(r, 0, 0.1), cavity: rr(r, 1.1, 1.5), speck: rr(r, 0, 0.1) }),
    shape: (r) => ({ pits: rr(r, 0.05, 0.09), pitFreq: rr(r, 2, 3.2), pitSize: rr(r, 0.35, 0.5), holes: rr(r, 0.4, 1), wrinkle: rr(r, 0.015, 0.04), wrinkleFreq: rr(r, 1.6, 2.6) }),
    facts: [
      "Taihu stones are limestone associated with the Lake Tai region of Jiangsu, China; their holes and hollows are produced by dissolution and the action of water.",
    ],
    culture: "taihu",
  },
  {
    key: "lingbi", en: "Lingbi-style black limestone", zh: "灵璧石风格", cls: "scholar", quota: 12,
    families: { scholar: 5, cobble: 1, elongate: 1, angular: 1 },
    palettes: [["#2e2d2c", "#262524", "#d9d4ca", "#4a4744", "#121211"], ["#333436", "#2a2b2d", "#c9c6c0", "#4d4e51", "#141415"], ["#383430", "#2e2b28", "#b9ad9c", "#544e48", "#161412"]],
    look: (r) => ({ mottle: rr(r, 0.15, 0.4), vein: r() < 0.6 ? rr(r, 0.5, 0.9) : 0, veinMode: 0, veinFreq: rr(r, 1.2, 2.4), veinWidth: rr(r, 0.015, 0.035), rough: rr(r, 0.35, 0.55), polish: rr(r, 0.25, 0.55), cavity: rr(r, 0.6, 0.9) }),
    shape: (r) => ({ wrinkle: rr(r, 0.06, 0.12), wrinkleFreq: rr(r, 3, 5.5), ridge: rr(r, 0.02, 0.05) }),
    facts: [
      "Lingbi stones come from Lingbi County in Anhui, China; they are typically dark grey to black limestone, and some are prized for ringing when struck.",
    ],
    culture: "lingbi",
  },
  {
    key: "ying", en: "Ying-style wrinkled limestone", zh: "英石风格", cls: "scholar", quota: 11,
    families: { scholar: 4, angular: 2, elongate: 1 },
    palettes: [["#4f4e4c", "#43423f", "#e1ddd4", "#6a6865", "#1e1e1d"], ["#5b5550", "#4e4843", "#d8cfc2", "#77706a", "#221f1d"], ["#454a4b", "#3b4041", "#d6d8d4", "#626768", "#1a1c1d"]],
    look: (r) => ({ mottle: rr(r, 0.3, 0.6), vein: r() < 0.7 ? rr(r, 0.6, 1) : 0, veinMode: r() < 0.5 ? 0 : 1, veinFreq: rr(r, 1.5, 3), veinWidth: rr(r, 0.02, 0.05), rough: rr(r, 0.6, 0.85), polish: rr(r, 0, 0.15), cavity: rr(r, 1, 1.4) }),
    shape: (r) => ({ wrinkle: rr(r, 0.09, 0.15), wrinkleFreq: rr(r, 4, 7), ridge: rr(r, 0.03, 0.07), ridgeFreq: rr(r, 3, 6), facets: Math.round(rr(r, 0, 3)) }),
    facts: [
      "Ying stones come from Yingde in Guangdong, China; they are usually dark limestone with sharply wrinkled surfaces, sometimes with white calcite veins.",
    ],
    culture: "ying",
  },
  {
    key: "sandstone", en: "Sandstone", zh: "砂岩", cls: "sedimentary", quota: 16,
    families: { slab: 3, cobble: 2, angular: 2, pebble: 1, boulder: 1 },
    palettes: [["#c8a27c", "#b58e68", "#e8d3b8", "#a3714f", "#5b3e2b"], ["#b5654a", "#9f553d", "#d9a58a", "#c97f60", "#4e2a20"], ["#d6c39a", "#c4ae83", "#efe3c6", "#b99b6d", "#6a5737"], ["#a88e76", "#957b63", "#cdb8a2", "#7f6551", "#433427"]],
    look: (r) => ({ band: rr(r, 0.45, 0.85), bandMode: 0, bandFreq: rr(r, 3, 8), bandWarp: rr(r, 0.1, 0.6), bandSharp: rr(r, 0.8, 2.5), bandAxis: [rr(r, -0.3, 0.3), 1, rr(r, -0.3, 0.3)], speck: rr(r, 0.05, 0.25), speckFreq: rr(r, 45, 80), mottle: rr(r, 0.2, 0.5), rough: rr(r, 0.75, 0.95), polish: 0, sparkle: rr(r, 0, 0.25) }),
    shape: (r) => ({ terraces: r() < 0.6 ? rr(r, 0.4, 1) : 0, terraceCount: Math.round(rr(r, 4, 10)), terraceAxis: [0, 1, 0] }),
    facts: [
      "Sandstone is a sedimentary rock made of sand-sized grains, often quartz, cemented together.",
      "Layers (bedding) record changes in how the sand was deposited; red and yellow colours usually come from iron oxides.",
    ],
  },
  {
    key: "mudstone", en: "Mudstone & siltstone", zh: "泥岩与粉砂岩", cls: "sedimentary", quota: 11,
    families: { disc: 3, pebble: 2, slab: 2, egg: 1 },
    palettes: [["#7d6f61", "#6c5f52", "#a39383", "#8d7e6e", "#3c332b"], ["#6b6e6a", "#5b5e5a", "#959893", "#7d807b", "#2f312e"], ["#8b5e4b", "#784f3e", "#b48772", "#9b6c58", "#432a20"]],
    look: (r) => ({ band: rr(r, 0.15, 0.4), bandFreq: rr(r, 6, 14), bandSharp: rr(r, 0.6, 1.5), bandWarp: rr(r, 0.05, 0.3), mottle: rr(r, 0.3, 0.6), rough: rr(r, 0.55, 0.75), polish: rr(r, 0.05, 0.25) }),
    shape: () => ({}),
    facts: [
      "Mudstone and siltstone are fine-grained sedimentary rocks made of clay- and silt-sized particles.",
      "They often show thin laminations that record quiet, slow deposition.",
    ],
  },
  {
    key: "slate", en: "Slate", zh: "板岩", cls: "metamorphic", quota: 11,
    families: { slab: 5, disc: 2, shard: 1 },
    palettes: [["#454c55", "#3b414a", "#6a727c", "#545c66", "#1e2227"], ["#3c3e42", "#323438", "#646870", "#4b4e54", "#18191b"], ["#4f4a52", "#433f46", "#7a7380", "#5e5865", "#211e23"], ["#4a5048", "#40463e", "#717867", "#596052", "#1f221d"]],
    look: (r) => ({ band: rr(r, 0.15, 0.35), bandFreq: rr(r, 12, 24), bandSharp: rr(r, 1, 2.5), bandWarp: rr(r, 0.02, 0.1), bandAxis: [0, 1, 0], mottle: rr(r, 0.15, 0.35), rough: rr(r, 0.45, 0.65), polish: rr(r, 0.1, 0.3), sparkle: rr(r, 0, 0.15) }),
    shape: (r) => ({ terraces: rr(r, 0.2, 0.6), terraceCount: Math.round(rr(r, 8, 16)), terraceAxis: [0, 1, 0] }),
    facts: [
      "Slate is a fine-grained, low-grade metamorphic rock formed from shale or mudstone.",
      "It splits into thin, flat sheets along planes called cleavage.",
    ],
  },
  {
    key: "schist", en: "Mica schist", zh: "云母片岩", cls: "metamorphic", quota: 11,
    families: { slab: 2, elongate: 2, angular: 2, cobble: 1 },
    palettes: [["#8a8a84", "#76766f", "#c9c7bd", "#a9a79c", "#3a3a36"], ["#7a8170", "#686f5f", "#b8bea9", "#959c87", "#33372d"], ["#9a8f80", "#867b6d", "#d1c5b2", "#b3a693", "#40392f"]],
    look: (r) => ({ band: rr(r, 0.4, 0.75), bandFreq: rr(r, 5, 11), bandWarp: rr(r, 0.4, 1), bandSharp: rr(r, 0.8, 1.6), sparkle: rr(r, 0.6, 1), mottle: rr(r, 0.2, 0.4), rough: rr(r, 0.45, 0.65), polish: rr(r, 0.05, 0.2), crystal: rr(r, 0, 0.25), crystalFreq: rr(r, 40, 70) }),
    shape: (r) => ({ terraces: rr(r, 0.2, 0.6), terraceCount: Math.round(rr(r, 6, 12)), terraceAxis: [rr(r, -0.4, 0.4), 1, rr(r, -0.4, 0.4)] }),
    facts: [
      "Schist is a medium-grade metamorphic rock in which platy minerals such as mica are aligned in layers (foliation).",
      "The aligned mica gives schist its sheen and its tendency to split along layers.",
    ],
  },
  {
    key: "gneiss", en: "Banded gneiss", zh: "片麻岩", cls: "metamorphic", quota: 13,
    families: { cobble: 3, pebble: 2, boulder: 2, angular: 1, egg: 1 },
    palettes: [["#a9a6a0", "#e5e1d8", "#f2efe8", "#c99f8f", "#222120"], ["#8c8a86", "#dad6cd", "#f0ede6", "#b7b3a9", "#1b1a19"], ["#9e8f86", "#e2cfc3", "#f3ebe4", "#d1a28b", "#2a2320"]],
    look: (r) => ({ band: rr(r, 0.7, 1), bandFreq: rr(r, 2.5, 6), bandWarp: rr(r, 0.4, 1.1), bandSharp: rr(r, 0.7, 1.5), bandAxis: [rr(r, -0.5, 0.5), 1, rr(r, -0.5, 0.5)], crystal: rr(r, 0.3, 0.6), crystalFreq: rr(r, 22, 40), rough: rr(r, 0.5, 0.75), polish: rr(r, 0.1, 0.35) }),
    shape: () => ({}),
    facts: [
      "Gneiss is a high-grade metamorphic rock with distinct light and dark mineral bands, formed under high temperature and pressure.",
    ],
  },
  {
    key: "jasper", en: "Jasper", zh: "碧玉", cls: "silica", quota: 16,
    families: { pebble: 3, egg: 2, nodule: 2, cobble: 1, disc: 1 },
    palettes: [["#9b3b2b", "#7f2e22", "#d8b48a", "#c0623f", "#3e1611"], ["#a8743a", "#8e5f2c", "#e1c58e", "#c4904c", "#45301a"], ["#6f4a34", "#5b3b29", "#cfa77a", "#94603f", "#2c1c12"], ["#5f6b4a", "#4e593c", "#c9c09a", "#7d8a5c", "#25291c"]],
    look: (r) => ({ mottle: rr(r, 0.5, 0.9), mottleFreq: rr(r, 1.2, 2.6), band: r() < 0.5 ? rr(r, 0.35, 0.7) : 0, bandMode: 1, bandFreq: rr(r, 4, 9), bandWarp: rr(r, 0.3, 0.8), bandSharp: rr(r, 1, 2), bandCenter: [rr(r, -0.4, 0.4), rr(r, -0.3, 0.3), rr(r, -0.4, 0.4)], vein: r() < 0.5 ? rr(r, 0.5, 0.9) : 0, veinMode: 0, veinWidth: rr(r, 0.02, 0.05), rough: rr(r, 0.25, 0.45), polish: rr(r, 0.35, 0.7) }),
    shape: (r) => ({ lump: rr(r, 0.03, 0.08), wear: rr(r, 0.65, 1) }),
    facts: [
      "Jasper is an opaque, fine-grained variety of silica (microcrystalline quartz) coloured by impurities.",
      "Its red tones come mainly from iron oxide (hematite); yellows and browns from other iron minerals.",
    ],
  },
  {
    key: "agate", en: "Agate pebble (Yuhua-style)", zh: "玛瑙卵石（雨花石风格）", cls: "silica", quota: 18,
    families: { pebble: 4, egg: 3, disc: 2, nodule: 1 },
    palettes: [["#c9874e", "#b06e3b", "#f2e6d4", "#d24f3a", "#6b2e1d"], ["#d7b98f", "#c4a074", "#faf3e6", "#a65a3b", "#5b3a26"], ["#9aa3a6", "#87949a", "#eef1f0", "#c06c4e", "#3a4448"], ["#b2463a", "#93362c", "#f3e2cc", "#e2a066", "#4a1912"], ["#d3c7b5", "#c0b29c", "#fbf7f0", "#7f9aa3", "#4a4038"]],
    look: (r) => ({ band: rr(r, 0.75, 1), bandMode: 1, bandFreq: rr(r, 5, 12), bandWarp: rr(r, 0.2, 0.7), bandSharp: rr(r, 1.2, 3), bandCenter: [rr(r, -0.5, 0.5), rr(r, -0.3, 0.3), rr(r, -0.5, 0.5)], mottle: rr(r, 0.3, 0.6), rough: rr(r, 0.15, 0.3), polish: rr(r, 0.6, 0.9), bump: 0.006 }),
    shape: () => ({}),
    facts: [
      "Agate is a banded variety of chalcedony (microcrystalline quartz).",
      "It commonly forms in cavities in volcanic rock, as silica-rich fluids deposit layer after layer.",
    ],
    culture: "yuhua",
  },
  {
    key: "chert", en: "Chert & flint", zh: "燧石", cls: "silica", quota: 12,
    families: { nodule: 3, angular: 2, shard: 2, pebble: 2 },
    palettes: [["#6f6a63", "#5d5852", "#b8b1a6", "#8c857b", "#2c2926"], ["#4c4744", "#3f3b38", "#d6d0c4", "#6b645e", "#1d1b1a"], ["#8a7259", "#765f48", "#cdb9a0", "#a58668", "#3a2d21"]],
    look: (r) => ({ mottle: rr(r, 0.4, 0.8), mottleFreq: rr(r, 0.8, 1.6), warp: rr(r, 0.4, 0.8), rough: rr(r, 0.32, 0.5), polish: rr(r, 0.12, 0.32), bump: 0.008, vein: r() < 0.25 ? 0.6 : 0, veinMode: 0, veinWidth: 0.03 }),
    shape: (r) => ({ conch: rr(r, 0.004, 0.012), lump: rr(r, 0.05, 0.11) }),
    facts: [
      "Chert (including flint) is a hard, fine-grained sedimentary rock made of microcrystalline quartz.",
      "It breaks with a smooth, curved conchoidal fracture, which made it a favoured material for stone tools.",
    ],
  },
  {
    key: "obsidian", en: "Obsidian", zh: "黑曜岩", cls: "igneous", quota: 10,
    families: { shard: 5, angular: 3, nodule: 1 },
    palettes: [["#15151a", "#101014", "#3a3a44", "#262630", "#050506"], ["#1d1714", "#16110f", "#4a3328", "#2e221c", "#070505"], ["#141a1a", "#0f1414", "#2f3d3c", "#202a2a", "#040606"]],
    look: (r) => ({ mottle: rr(r, 0.1, 0.3), band: r() < 0.5 ? rr(r, 0.2, 0.45) : 0, bandFreq: rr(r, 6, 14), bandWarp: rr(r, 0.4, 1), rough: rr(r, 0.04, 0.12), roughVar: 0.05, polish: rr(r, 0.7, 1), bump: 0.004, cavity: 0.4 }),
    shape: (r) => ({ conch: rr(r, 0.008, 0.018), facets: Math.round(rr(r, 5, 9)), facetDepth: rr(r, 0.16, 0.32), facetSoft: rr(r, 0.008, 0.03), lump: rr(r, 0.015, 0.045), wear: rr(r, 0, 0.12), ridge: 0, wrinkle: 0 }),
    facts: [
      "Obsidian is natural volcanic glass, formed when lava cools too quickly for crystals to grow.",
      "It breaks with a conchoidal fracture that leaves extremely sharp edges.",
    ],
  },
  {
    key: "conglomerate", en: "Conglomerate", zh: "砾岩", cls: "sedimentary", quota: 12,
    families: { cobble: 3, boulder: 2, pebble: 2, angular: 1 },
    palettes: [["#9c8b77", "#8a7965", "#d7cdbd", "#6e6258", "#3b332b"], ["#8f857a", "#7d7369", "#e3ddd2", "#a35f45", "#2f2b27"], ["#a68d6e", "#937b5d", "#e2d4bd", "#5e6266", "#3e3326"]],
    look: (r) => ({ clast: rr(r, 0.75, 1), clastFreq: rr(r, 2.2, 4.5), clastVar: rr(r, 0.3, 0.7), mottle: rr(r, 0.3, 0.6), speck: rr(r, 0.1, 0.3), speckFreq: rr(r, 40, 70), rough: rr(r, 0.6, 0.85), polish: rr(r, 0.05, 0.25) }),
    shape: (r) => ({ lump: rr(r, 0.08, 0.14), lumpFreq: rr(r, 2, 3) }),
    facts: [
      "Conglomerate is a sedimentary rock made of rounded, gravel-sized clasts cemented in a finer matrix.",
      "The rounding of the clasts shows they were worn by transport in water before being buried.",
    ],
  },
  {
    key: "serpentinite", en: "Serpentinite", zh: "蛇纹岩", cls: "metamorphic", quota: 11,
    families: { pebble: 2, cobble: 2, egg: 1, nodule: 1, slab: 1 },
    palettes: [["#4d6b4f", "#3f5a41", "#d4dcc8", "#7e9a6a", "#1a241b"], ["#5f7a5a", "#4f684b", "#e1e4d2", "#91a275", "#1f2a1d"], ["#3e5550", "#334843", "#c9d6cc", "#6f8a7c", "#141e1b"]],
    look: (r) => ({ mottle: rr(r, 0.6, 0.95), mottleFreq: rr(r, 1.5, 3), warp: rr(r, 0.5, 1), vein: rr(r, 0.55, 0.9), veinMode: 0, veinFreq: rr(r, 1.4, 3), veinWidth: rr(r, 0.02, 0.05), rough: rr(r, 0.25, 0.45), polish: rr(r, 0.35, 0.65) }),
    shape: () => ({}),
    facts: [
      "Serpentinite is a metamorphic rock made mostly of serpentine minerals, formed when mantle-derived (ultramafic) rocks react with water.",
      "It is typically green and often veined.",
    ],
  },
  {
    key: "porphyry", en: "Porphyry", zh: "斑岩", cls: "igneous", quota: 10,
    families: { cobble: 2, pebble: 2, boulder: 1, angular: 1 },
    palettes: [["#5e3a34", "#4f302b", "#e0cfc0", "#c9b29e", "#24150f"], ["#46484a", "#3a3c3e", "#e7e2d6", "#c9c2b2", "#191a1b"], ["#4f5a46", "#434d3b", "#ddd6c2", "#bfb59a", "#1f2419"]],
    look: (r) => ({ clast: rr(r, 0.6, 0.9), clastFreq: rr(r, 7, 13), clastVar: rr(r, 0.1, 0.3), mottle: rr(r, 0.2, 0.4), rough: rr(r, 0.45, 0.7), polish: rr(r, 0.1, 0.35) }),
    shape: () => ({}),
    facts: [
      "Porphyry is an igneous rock with large crystals (phenocrysts) set in a fine-grained groundmass.",
      "The two crystal sizes reflect two stages of cooling: slow growth at depth, then faster cooling.",
    ],
  },
  {
    key: "rhyolite", en: "Flow-banded rhyolite", zh: "流纹岩", cls: "igneous", quota: 10,
    families: { cobble: 2, pebble: 2, angular: 2, elongate: 1 },
    palettes: [["#c9a59a", "#b58f84", "#ecdcd3", "#9a7065", "#4a332d"], ["#b9b0a6", "#a49b91", "#e6e0d8", "#8d7d70", "#3d3631"], ["#d2a98e", "#bf9377", "#f0dccb", "#a86f55", "#4f3426"]],
    look: (r) => ({ band: rr(r, 0.5, 0.85), bandFreq: rr(r, 6, 14), bandWarp: rr(r, 0.6, 1.4), bandSharp: rr(r, 0.8, 1.8), mottle: rr(r, 0.2, 0.4), speck: rr(r, 0, 0.2), rough: rr(r, 0.5, 0.75), polish: rr(r, 0.05, 0.3) }),
    shape: () => ({}),
    facts: [
      "Rhyolite is a fine-grained, silica-rich volcanic rock, often pale pink, grey or tan.",
      "Some rhyolites show flow banding, recording the movement of viscous lava before it solidified.",
    ],
  },
  {
    key: "kun", en: "Kun-style white stone", zh: "昆石风格", cls: "scholar", quota: 9,
    families: { scholar: 4, nodule: 2, boulder: 1, cobble: 1 },
    palettes: [["#ece8df", "#dcd6ca", "#fbfaf6", "#e5ddcf", "#8f877a"], ["#e6e2da", "#d3cec4", "#faf9f5", "#ddd6c9", "#7c766d"], ["#e9e1cf", "#d8ccb3", "#faf6ec", "#cdb98f", "#837559"], ["#dfe0dc", "#cacbc6", "#f7f8f6", "#b9c0c2", "#6c7173"]],
    look: (r) => ({ crystal: rr(r, 0.3, 0.6), crystalFreq: rr(r, 30, 55), sparkle: rr(r, 0.3, 0.6), mottle: rr(r, 0.3, 0.6), rough: rr(r, 0.45, 0.65), polish: rr(r, 0.05, 0.2), cavity: rr(r, 1.2, 1.6) }),
    shape: (r) => ({ pits: rr(r, 0.05, 0.08), pitFreq: rr(r, 2.6, 4.2), pitSize: rr(r, 0.3, 0.45), holes: rr(r, 0.3, 0.8), ridge: rr(r, 0.015, 0.035), ridgeFreq: rr(r, 2.5, 4), wrinkle: rr(r, 0.01, 0.03) }),
    facts: [
      "Kun stones are associated with Kunshan in Jiangsu, China, and are typically white and crystalline with many small hollows.",
    ],
    culture: "kun",
  },
  {
    key: "ironstone", en: "Banded ironstone", zh: "条带状铁岩", cls: "sedimentary", quota: 10,
    families: { slab: 2, cobble: 2, pebble: 2, angular: 1 },
    palettes: [["#5a3a33", "#7b2f25", "#b5b2ad", "#9c4a36", "#26201f"], ["#463a36", "#6e3a2c", "#c7c0b4", "#a85c3f", "#1d1817"], ["#4e4440", "#8a4630", "#d1a77a", "#6f6a66", "#221d1b"]],
    look: (r) => ({ band: rr(r, 0.7, 1), bandFreq: rr(r, 5, 11), bandWarp: rr(r, 0.2, 0.7), bandSharp: rr(r, 0.9, 1.8), bandAxis: [rr(r, -0.2, 0.2), 1, rr(r, -0.2, 0.2)], rough: rr(r, 0.35, 0.6), polish: rr(r, 0.15, 0.4), sparkle: rr(r, 0.1, 0.35) }),
    shape: () => ({}),
    facts: [
      "Banded iron formations are sedimentary rocks of alternating iron-oxide-rich and silica-rich (chert) layers.",
      "Most formed in ancient oceans, largely more than 1.8 billion years ago.",
    ],
  },
];

/* Cultural context (general facts about stone appreciation; never specimen claims) */
export const CULTURE = {
  general: [
    { kind: "fact", text: "Collecting and contemplating naturally shaped stones (赏石, 'stone appreciation') has a long history in China; scholars' rocks (供石) are traditionally displayed on fitted carved wooden stands (底座)." },
  ],
  famous: { kind: "fact", text: "Chinese stone appreciation commonly lists four famous stone types: Taihu (太湖石), Lingbi (灵璧石), Ying (英石) and Kun (昆石)." },
  criteria: { kind: "fact", text: "Scholars' rocks are traditionally judged by 瘦 (slenderness), 皱 (wrinkling), 漏 (channels) and 透 (openings) — criteria customarily associated with the Song-dynasty connoisseur Mi Fu (1051–1107)." },
  yuhua: { kind: "fact", text: "Yuhua stones (雨花石) are colourful agate and chalcedony pebbles from the Nanjing area; they are often shown in shallow water to bring out their colours." },
  lingbi: { kind: "fact", text: "Some Lingbi stones resonate when struck, a quality connoisseurs describe as 'sounding stones'." },
  wet: { kind: "fact", text: "Wetting a stone deepens its colour: a film of water reduces light scattering at the rough surface, so more light penetrates and returns coloured." },
};
