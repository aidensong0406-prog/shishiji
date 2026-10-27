// Quality presets — the performance backbone (step 1).
// Each tier scales the expensive knobs together so the scene can grow
// without blowing the draw-call / fill-rate budget on weaker GPUs.

export const QUALITY = {
  low: {
    label: "低 · Low",
    pixelRatio: 1,
    shadowMap: 512,        // smaller shadow pass — the court grew a lot
    shadows: true,
    bloom: false,
    contactShadows: false, // skip the contact-shadow decals (draw-call heavy)
    dust: 30,
    volumetrics: false,
    stoneDetail: 2,
    anisotropy: 2,
    courtFx: false,        // no drifting petals / animated water ripples
    // post: keep the cheap hand-rolled bloom path
    effectComposer: false,
    ssao: false,
    dof: false,
    smaa: false,
  },
  eco: {
    label: "轻 · Eco — 低负担",
    // keeps the cinematic signature (bloom glow, colour grade, SMAA, light
    // shafts, contact shadows, all real textures/normal maps/HDRI) while
    // cutting the four big GPU costs: render at 1× pixel ratio, small shadow
    // map, no SSAO/DOF, lighter dust + tessellation. Looks close to Medium,
    // runs lighter than Low's fill-rate at retina sizes.
    pixelRatio: 1,
    shadowMap: 1024,
    shadows: true,
    bloom: true,
    contactShadows: true,
    dust: 70,
    volumetrics: true,
    stoneDetail: 3,
    anisotropy: 4,
    courtFx: true,
    effectComposer: true,
    ssao: false,
    dof: false,
    smaa: true,
  },
  medium: {
    label: "中 · Medium",
    pixelRatio: 1.5,
    shadowMap: 1536,
    shadows: true,
    bloom: true,
    contactShadows: true,
    dust: 130,
    volumetrics: true,
    stoneDetail: 4,
    anisotropy: 8,
    courtFx: true,
    // post: EffectComposer with UnrealBloom + SMAA (no SSAO/DOF)
    effectComposer: true,
    ssao: false,
    dof: false,
    smaa: true,
  },
  high: {
    label: "高 · High",
    pixelRatio: 2,
    shadowMap: 2048,
    shadows: true,
    bloom: true,
    contactShadows: true,
    dust: 200,
    volumetrics: true,
    stoneDetail: 5,
    anisotropy: 16,
    courtFx: true,
    // post: full cinematic chain
    effectComposer: true,
    ssao: true,
    dof: true,
    smaa: true,
  },
};

const QUALITY_KEY = "gallery:quality";

/** True when the visitor picked a tier themselves (adaptive quality leaves it alone). */
export function hasSavedQuality() {
  try { return !!localStorage.getItem("gallery:quality"); } catch { return false; }
}
/** Next tier down for adaptive quality (null at the bottom). */
export const LOWER_TIER = { high: "medium", medium: "eco", eco: "low", low: null };

// Persist the user's explicit choice so a "low burden" pick survives reloads.
export function saveQuality(q) {
  try { localStorage.setItem(QUALITY_KEY, q); } catch {}
}

// Pick a sensible default from the device before the user overrides it.
// A previously saved choice always wins.
export function autoQuality() {
  if (typeof window === "undefined") return "medium";
  try {
    const saved = localStorage.getItem(QUALITY_KEY);
    if (saved && QUALITY[saved]) return saved;
  } catch {}
  const dpr = window.devicePixelRatio || 1;
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "");
  const cores = navigator.hardwareConcurrency || 4;
  if (mobile || cores <= 4) return "low";
  if (dpr >= 2 && cores >= 8) return "high";
  return "medium";
}
