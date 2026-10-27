// Stones modelled by eye after two photographs of a collector's display shelves
// (shelf A: about thirty stones; shelf B: sixteen). Each recipe approximates one
// stone's silhouette, colour and pattern with the generator's own vocabulary; the
// photographs themselves are not used in the app. The rock type of each is a best
// guess from the image, recorded as such in the specimen's notes.
//
// palette: [base, second, vein/line colour, accent (bands, patches), dark] — sRGB.
// Upright stones on stands are modelled standing (their y axis longest).
// generate.js substitutes each for the generated specimen it most resembles,
// so the register keeps its size and its IDs.

const UP = (x, z) => ({ axes: [x, 1, z] });                 // standing on its stand
const lines = (w, f = 2.4, k = 0.9) => ({ vein: k, veinMode: 0, veinWidth: w, veinFreq: f });   // a fine line network (dendrites, crackle)
const streak = (k, f, warp, sharp = 2) => ({ band: k, bandMode: 0, bandFreq: f, bandWarp: warp, bandSharp: sharp });

export const PHOTO_STONES = [
  /* ---------------- shelf A (top row → bottom, left → right) ---------------- */
  { shelf: "A", n: 1, analog: "mudstone", family: "egg", shape: { axes: [1, 0.78, 0.74], wear: 0.95 }, palette: ["#7d7b62", "#6a6853", "#b7b29a", "#8f8a6e", "#3b392c"], look: { mottle: 0.5 } },
  { shelf: "A", n: 2, analog: "mudstone", family: "boulder", shape: { axes: [1, 0.86, 0.82], base: 0.7 }, palette: ["#5f5d4c", "#504e40", "#8d8a76", "#6e6b58", "#2c2a22"], look: { mottle: 0.35, polish: 0.15 } },
  { shelf: "A", n: 3, analog: "quartzite", family: "egg", shape: { axes: [1, 0.86, 0.78], wear: 0.95 }, palette: ["#dcd5c7", "#c8bdab", "#7b4a32", "#a5714f", "#4a3326"], look: { ...lines(0.09, 1.6, 0.85), ...streak(0.35, 2.2, 1.0, 2.2), mottle: 0.45 } },
  { shelf: "A", n: 4, analog: "sandstone", family: "egg", shape: { axes: [1, 0.82, 0.8], wear: 1 }, palette: ["#c6ae8b", "#b39a77", "#e2d4ba", "#a58a68", "#5a4836"], look: { ...streak(0.2, 3, 0.6, 1), mottle: 0.35 } },
  { shelf: "A", n: 5, analog: "sandstone", family: "cobble", shape: { axes: [1, 0.74, 0.8] }, palette: ["#bba98a", "#8e8678", "#e1d6c2", "#7b7468", "#3e3a33"], look: { mottle: 0.75, mottleFreq: 1.2 } },
  { shelf: "A", n: 6, analog: "ironstone", family: "boulder", shape: { axes: [1, 0.8, 0.85], square: 0.2 }, palette: ["#8a5a41", "#704634", "#a87e63", "#5b3b2b", "#2e1f18"], look: { ...streak(0.3, 2.5, 0.8, 1.4), mottle: 0.5, rough: 0.75 } },
  { shelf: "A", n: 7, analog: "mudstone", family: "egg", shape: { ...UP(0.76, 0.66), taper: 0.18, base: 0.6 }, palette: ["#5c4232", "#4a3528", "#8a6a52", "#6d5240", "#241912"], look: { ...streak(0.18, 4, 0.5, 1.2), mottle: 0.4, polish: 0.35 } },
  { shelf: "A", n: 8, analog: "chert", family: "scholar", shape: { axes: [0.72, 1, 0.6], lump: 0.24, lumpFreq: 1.8, wrinkle: 0.05, wrinkleFreq: 2.6, pits: 0.025, pitFreq: 3, base: 1 }, palette: ["#cba96b", "#b18f53", "#e6d3a4", "#d9be82", "#5e4a2e"], look: { mottle: 0.55, polish: 0.4, rough: 0.45, cavity: 1.2 } },
  { shelf: "A", n: 9, analog: "serpentinite", family: "scholar", shape: { axes: [0.44, 1, 0.4], lump: 0.18, lumpFreq: 1.3, bend: 0.22, twist: 0.45, wrinkle: 0, wear: 0.9, base: 1 }, palette: ["#abb09c", "#979c88", "#d3d6c8", "#bfc3b2", "#4c5146"], look: { mottle: 0.3, polish: 0.35, rough: 0.45 } },
  { shelf: "A", n: 10, analog: "mudstone", family: "disc", shape: { axes: [1, 0.96, 0.3], base: 0.7 }, palette: ["#8b8a70", "#77765f", "#b4b29b", "#9a987e", "#3d3c30"], look: { mottle: 0.4, ...streak(0.15, 5, 0.4, 1) } },
  { shelf: "A", n: 11, analog: "greywacke", family: "cobble", shape: { axes: [1, 0.78, 0.8] }, palette: ["#7f8574", "#6c7262", "#c9c7b6", "#a3a593", "#33372f"], look: { speck: 0.45, speckFreq: 34, mottle: 0.45 } },
  { shelf: "A", n: 12, analog: "serpentinite", family: "elongate", shape: { axes: [1, 0.42, 0.5], lump: 0.12, lumpFreq: 1.6, bend: 0.12, base: 0.6 }, palette: ["#8f8d5a", "#7b7949", "#aeab7e", "#9a9766", "#45441f"], look: { mottle: 0.55, polish: 0.3 } },
  { shelf: "A", n: 13, analog: "limestone", family: "egg", shape: { ...UP(0.62, 0.55), taper: -0.12, base: 0.9, wear: 0.9 }, palette: ["#dad1ba", "#c9bea4", "#6e5a44", "#a39176", "#3a2f24"], look: { ...lines(0.03, 2.8, 0.95), mottle: 0.3 } },
  { shelf: "A", n: 14, analog: "sandstone", family: "egg", shape: { ...UP(0.8, 0.62), base: 0.6 }, palette: ["#8a6a48", "#77593c", "#b0916c", "#9a7a56", "#3a2a1c"], look: { mottle: 0.4 } },
  { shelf: "A", n: 15, analog: "marble", family: "egg", shape: { ...UP(0.66, 0.58), base: 0.8 }, palette: ["#d8d4c8", "#c8c3b6", "#7d7a72", "#a8a49a", "#3f3d38"], look: { ...lines(0.05, 1.8, 0.8), mottle: 0.35, polish: 0.3 } },
  { shelf: "A", n: 16, analog: "greywacke", family: "pebble", shape: { axes: [1, 0.66, 0.84] }, palette: ["#4f5a52", "#434d46", "#c9cfc2", "#6c7a70", "#232a25"], look: { ...lines(0.035, 2.2, 0.85), mottle: 0.4 } },
  { shelf: "A", n: 17, analog: "sandstone", family: "cobble", shape: { axes: [1, 0.68, 0.78] }, palette: ["#a27a52", "#8c6744", "#c8ab88", "#b08a62", "#4a3018"], look: { ...lines(0.025, 3.2, 0.6), ...streak(0.3, 3, 0.9, 1.4), mottle: 0.4 } },
  { shelf: "A", n: 18, analog: "mudstone", family: "egg", shape: { ...UP(0.72, 0.62), base: 0.7 }, palette: ["#90957f", "#7c816c", "#b9bca8", "#a4a892", "#3c4034"], look: { mottle: 0.45, mottleFreq: 1.1 } },
  { shelf: "A", n: 19, analog: "marble", family: "pebble", shape: { axes: [1, 0.62, 0.44], wear: 1 }, palette: ["#bbaea8", "#a59792", "#4e4440", "#8a7d78", "#2a2422"], look: { ...lines(0.025, 2.6, 0.95), mottle: 0.25, polish: 0.4 } },
  { shelf: "A", n: 20, analog: "mudstone", family: "egg", shape: { ...UP(0.82, 0.74), base: 0.6 }, palette: ["#5a6045", "#4b5039", "#878d6c", "#6c7255", "#26291c"], look: { mottle: 0.5 } },
  { shelf: "A", n: 21, analog: "sandstone", family: "boulder", shape: { axes: [1, 0.78, 0.86] }, palette: ["#8b6a4c", "#77583d", "#b38f6c", "#9c7a58", "#3a2a1c"], look: { mottle: 0.45, ...streak(0.15, 4, 0.7, 1) } },
  { shelf: "A", n: 22, analog: "greywacke", family: "pebble", shape: { ...UP(0.7, 0.55), base: 0.6 }, palette: ["#4b5560", "#3e4750", "#e6e4dc", "#6c7680", "#1f2328"], look: { vein: 0.95, veinMode: 1, veinWidth: 0.08, mottle: 0.35, polish: 0.3 } },
  { shelf: "A", n: 23, analog: "quartzite", family: "egg", shape: { axes: [1, 0.76, 0.84] }, palette: ["#d9d7d1", "#c8c6c0", "#f1efea", "#b0aea8", "#55534e"], look: { mottle: 0.4, mottleFreq: 1.8, polish: 0.3 } },
  { shelf: "A", n: 24, analog: "sandstone", family: "cobble", shape: { axes: [1, 0.48, 0.62], base: 0.7 }, palette: ["#d8c4a1", "#c4ae88", "#6e4a30", "#b29673", "#3e2a1c"], look: { vein: 0.9, veinMode: 1, veinWidth: 0.07, ...streak(0.25, 2.6, 1.1, 1.6), mottle: 0.3 } },
  { shelf: "A", n: 25, analog: "mudstone", family: "egg", shape: { ...UP(0.78, 0.7), base: 0.6 }, palette: ["#6f6248", "#5e523b", "#978a6c", "#7f7155", "#2c2619"], look: { mottle: 0.4 } },
  { shelf: "A", n: 26, analog: "sandstone", family: "disc", shape: { axes: [1, 0.42, 0.8], wear: 1 }, palette: ["#8b6a4c", "#7a5b3f", "#a98a68", "#94734f", "#3a2a1c"], look: { ...lines(0.03, 2, 0.5), mottle: 0.35 } },
  { shelf: "A", n: 27, analog: "limestone", family: "egg", shape: { ...UP(0.74, 0.62), base: 0.8 }, palette: ["#cfcbc2", "#bdb8ad", "#55524c", "#9d988d", "#33312d"], look: { ...lines(0.024, 3.6, 0.95), speck: 0.2, speckFreq: 40, mottle: 0.25 } },   // a finer, denser grey crackle
  { shelf: "A", n: 28, analog: "quartzite", family: "egg", shape: { axes: [1, 0.84, 0.8], base: 0.6 }, palette: ["#b4906a", "#9e7c58", "#d4bd9c", "#c09f7a", "#5a3a20"], look: { mottle: 0.5, polish: 0.3 } },
  { shelf: "A", n: 29, analog: "greywacke", family: "pebble", shape: { ...UP(0.82, 0.5) }, palette: ["#6f7277", "#5e6166", "#eceae4", "#8d9095", "#2b2d30"], look: { vein: 1, veinMode: 1, veinWidth: 0.14, mottle: 0.3 } },
  { shelf: "A", n: 30, analog: "mudstone", family: "pebble", shape: { axes: [1, 0.74, 0.82] }, palette: ["#7c7a5a", "#696748", "#a8a585", "#8e8c6b", "#33321f"], look: { mottle: 0.45, ...streak(0.12, 5, 0.6, 1) } },

  /* ---------------- shelf B ---------------- */
  { shelf: "B", n: 1, analog: "mudstone", family: "cobble", shape: { axes: [1, 0.66, 0.72], base: 0.7 }, palette: ["#a8ae99", "#96a088", "#c9cdbb", "#3e3328", "#2a2219"], look: { ...streak(0.7, 2.2, 1.2, 2.8), bandAxis: [0.35, 1, 0.2], mottle: 0.3 } },
  { shelf: "B", n: 2, analog: "sandstone", family: "egg", shape: { ...UP(0.8, 0.7), base: 0.7 }, palette: ["#a68558", "#93744a", "#c8ab80", "#4b3a2a", "#2e2318"], look: { ...streak(0.45, 2, 1.1, 2), mottle: 0.35 } },
  { shelf: "B", n: 3, analog: "mudstone", family: "egg", shape: { ...UP(0.72, 0.6), base: 0.7 }, palette: ["#9ba08e", "#878c7a", "#6b4e3a", "#7d6a56", "#33291f"], look: { ...lines(0.05, 1.6, 0.8), mottle: 0.35 } },
  { shelf: "B", n: 4, analog: "diorite", family: "boulder", shape: { axes: [1, 0.86, 0.8], base: 0.6 }, palette: ["#8f9a7c", "#7d8a6b", "#c7c9b0", "#a46a46", "#4d5e36"], look: { speck: 0.85, speckFreq: 16, mottle: 0.3, rough: 0.7 } },
  { shelf: "B", n: 5, analog: "mudstone", family: "egg", shape: { axes: [1, 0.86, 0.8], base: 0.6 }, palette: ["#bac0af", "#a8ae9c", "#dfe1d6", "#7a5a40", "#3b2c20"], look: { ...streak(0.55, 3.4, 1.4, 1.6), mottle: 0.25 } },
  { shelf: "B", n: 6, analog: "mudstone", family: "cobble", shape: { axes: [1, 0.56, 0.62], base: 0.8, square: 0.12 }, palette: ["#a3a791", "#90937e", "#5d4632", "#6b5240", "#2f2419"], look: { ...lines(0.045, 1.8, 0.7), ...streak(0.5, 1.1, 0.35, 3), bandAxis: [0.05, 1, 0.1], mottle: 0.35 } },
  { shelf: "B", n: 7, analog: "slate", family: "slab", shape: { axes: [0.82, 1, 0.16], square: 0.55, facets: 0, base: 1 }, palette: ["#3a3226", "#2e2820", "#a8873f", "#6b5a38", "#15110c"], look: { ...lines(0.06, 2, 0.85), band: 0, mottle: 0.3, polish: 0.25 } },
  // the stone with the hole: one deep, water-worn solution hole through its face
  { shelf: "B", n: 8, analog: "serpentinite", family: "nodule", shape: { axes: [0.86, 1, 0.62], lump: 0.12, lumpFreq: 1.1, pits: 0.02, pitFreq: 3, bore: [0.18, 0.08, 1, 0.2, 0.62], wear: 0.9, base: 0.9 }, palette: ["#9dab89", "#8a9a78", "#c4cfb2", "#b0bd9c", "#3d4a32"], look: { mottle: 0.35, polish: 0.2 } },
  { shelf: "B", n: 9, analog: "jasper", family: "cobble", shape: { axes: [1, 0.74, 0.7], base: 0.7 }, palette: ["#a2604c", "#8c4e3e", "#d3c0a0", "#cbb592", "#5a2a1e"], look: { ...streak(0.55, 1.8, 1.3, 1.4), mottle: 0.5, polish: 0.35 } },
  { shelf: "B", n: 10, analog: "obsidian", family: "disc", shape: { axes: [0.78, 1, 0.22], square: 0, lump: 0.01, wear: 1, base: 0.9 }, palette: ["#1e1d1f", "#171618", "#3a383c", "#2a292c", "#0b0b0c"], look: { mottle: 0.15, polish: 0.7, rough: 0.2 } },
  { shelf: "B", n: 11, analog: "jasper", family: "egg", shape: { ...UP(0.78, 0.6), base: 0.8 }, palette: ["#4f4a36", "#423e2d", "#a37c40", "#8a6a3a", "#1f1c14"], look: { ...lines(0.05, 1.7, 0.85), mottle: 0.35, polish: 0.35 } },
  { shelf: "B", n: 12, analog: "sandstone", family: "pebble", shape: { axes: [1, 0.86, 0.8] }, palette: ["#b9a17f", "#a68e6c", "#d8c6a8", "#6e5038", "#3a2a1c"], look: { ...streak(0.4, 1.6, 1.0, 2), mottle: 0.3 } },
  { shelf: "B", n: 13, analog: "serpentinite", family: "disc", shape: { axes: [0.86, 1, 0.26], base: 0.8 }, palette: ["#3f5640", "#344833", "#9fb08a", "#5c7556", "#18221a"], look: { speck: 0.6, speckFreq: 28, mottle: 0.35, polish: 0.3 } },
  { shelf: "B", n: 14, analog: "serpentinite", family: "elongate", shape: { axes: [1, 0.62, 0.5], bend: 0.55, twist: 0.7, taper: 0.38, lump: 0.1, lumpFreq: 1.2, wear: 0.9, base: 0.7 }, palette: ["#aab590", "#96a17d", "#cfd6b9", "#b8c29f", "#44503a"], look: { mottle: 0.4, polish: 0.3 } },
  { shelf: "B", n: 15, analog: "sandstone", family: "egg", shape: { ...UP(0.64, 0.52), lump: 0.1, lumpFreq: 1.5, wrinkle: 0.03, wrinkleFreq: 2.4, base: 1 }, palette: ["#7b5543", "#674636", "#a07a63", "#8a6350", "#2e1d15"], look: { mottle: 0.45, rough: 0.75, cavity: 1.1 } },
  { shelf: "B", n: 16, analog: "quartzite", family: "boulder", shape: { axes: [1, 0.8, 0.84] }, palette: ["#d2c6ae", "#bfb29a", "#ebe4d6", "#7e786c", "#45423c"], look: { mottle: 0.85, mottleFreq: 1.3 } },   // cream with grey patches
];
