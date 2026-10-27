// Procedural stone material: MeshPhysicalMaterial + injected GLSL.
// Every pattern is evaluated in the stone's object space (no UVs → no seams or
// stretching), so each specimen's surface is unique and resolution-independent.
// GLSL simplex noise: after Ian McEwan / Ashima Arts (MIT licence).

import * as THREE from "three";

const GLSL_NOISE = /* glsl */ `
vec3 sn_m289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 sn_m289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 sn_perm(vec4 x){return sn_m289(((x*34.0)+1.0)*x);}
vec4 sn_tis(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=sn_m289(i);
  vec4 p=sn_perm(sn_perm(sn_perm(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 nm=sn_tis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=nm.x; p1*=nm.y; p2*=nm.z; p3*=nm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float sfbm(vec3 p){
  float s=0.0, a=0.5;
  #ifdef STONE_LQ
  for(int o=0;o<2;o++){ s+=a*snoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; }
  return s/0.75;
  #else
  for(int o=0;o<4;o++){ s+=a*snoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; }
  return s/0.9375;
  #endif
}
vec3 sHash3(vec3 p){
  p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));
  return fract(sin(p)*43758.5453123);
}
// F1 distance, F2-F1 (edge), and a per-cell id
vec3 sCell(vec3 p){
  vec3 ip=floor(p), fp=fract(p); float d1=8.0, d2=8.0, id=0.0;
  for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++){
    vec3 o=vec3(float(x),float(y),float(z)); vec3 h=sHash3(ip+o);
    vec3 r=o+h-fp; float d=dot(r,r);
    if(d<d1){ d2=d1; d1=d; id=h.x; } else if(d<d2){ d2=d; }
  }
  return vec3(sqrt(d1), sqrt(d2)-sqrt(d1), id);
}
`;

const GLSL_UNIFORMS = /* glsl */ `
uniform vec3 uOff; uniform float uWarp;
uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uC4;
uniform float uMottle; uniform float uMottleFreq;
uniform float uBand; uniform float uBandFreq; uniform vec3 uBandAxis; uniform float uBandWarp;
uniform float uBandSharp; uniform float uBandMode; uniform vec3 uBandCenter;
uniform float uVein; uniform float uVeinFreq; uniform float uVeinWidth; uniform float uVeinMode;
uniform vec3 uVeinAxis; uniform vec3 uVeinAxis2; uniform float uVeinOffset;
uniform float uCrystal; uniform float uCrystalFreq;
uniform float uSpeck; uniform float uSpeckFreq;
uniform float uClast; uniform float uClastFreq; uniform float uClastVar;
uniform float uSparkle;
uniform float uRough; uniform float uRoughVar; uniform float uBump; uniform float uGrainFreq;
uniform float uVeinRelief; uniform float uCavity;
uniform float uWet; uniform float uLens;
uniform mat3 normalMatrix;
varying vec3 vSPos; varying float vCav;
`;

const GLSL_PATTERN = /* glsl */ `
  vec3 sp = vSPos;
  vec3 p = sp + uOff;
  vec3 q = p + uWarp * vec3(snoise(p*0.9), snoise(p*0.9+vec3(5.2,1.3,7.1)), snoise(p*0.9+vec3(2.7,9.2,3.4)));
  // per-layer anti-aliasing: each layer fades as its own feature size nears a pixel
  // (one global fade let grain and sparkle alias into "sand" on small, close stones)
  float pxS = length(fwidth(sp));
  float sAA = clamp(1.0 - pxS * 18.0, 0.0, 1.0);
  float aaGrain = sAA * (1.0 - smoothstep(0.18, 0.55, pxS * uGrainFreq));
  float aaSpeck = 1.0 - smoothstep(0.25, 0.75, pxS * uSpeckFreq);
  float aaSpark = 1.0 - smoothstep(0.2, 0.6, pxS * 140.0);
  float aaCryst = 1.0 - smoothstep(0.35, 0.9, pxS * uCrystalFreq);
  // octaves finer than the naked eye resolves at arm's length: they exist only under the hand
  // lens (tiny pxS) and fade out through the same per-pixel rule everywhere else
  float aaMicro = 1.0 - smoothstep(0.18, 0.55, pxS * uGrainFreq * 4.0);
  float aaEdge = 1.0 - smoothstep(0.2, 0.6, pxS * uSpeckFreq * 4.3);
  float mot = sfbm(q * uMottleFreq);
  vec3 col = mix(uC0, uC1, smoothstep(-0.55, 0.55, mot) * uMottle);
  float hgt = mot * 0.15;
  float sGloss = 0.0;      // local gloss (veins, sparkle)
  float sPattern = 0.0;    // pattern intensity for the lens

  // crystalline grains (granite, diorite, sugary marble/quartzite)
  if (uCrystal > 0.0) {
    vec3 c = sCell(p * uCrystalFreq);
    float id = c.z;
    vec3 grain = id < 0.18 ? uC4 : (id < 0.55 ? uC1 : (id < 0.8 ? uC0 : uC3));
    grain *= 0.86 + 0.28 * fract(id * 17.31);
    float edge = smoothstep(0.0, 0.07, c.y);
    col = mix(col, grain * mix(0.82, 1.0, edge), uCrystal);
    hgt += (1.0 - edge) * -0.25 * uCrystal * sAA * aaCryst;
    sGloss += step(0.8, id) * 0.25 * uCrystal;
    sPattern += uCrystal * 0.5;
  }

  // banding: planar (sediment, gneiss) or concentric (agate, jasper orbs)
  if (uBand > 0.0) {
    float t = uBandMode < 0.5 ? dot(q, uBandAxis) : length(q - uBandCenter) * 1.4;
    t = t * uBandFreq + uBandWarp * snoise(q * 1.6 + 4.0);
    float b = 0.5 + 0.5 * sin(t * 6.2831853);
    b = pow(b, uBandSharp);
    // each band frequency fades toward its mean once it nears a pixel (no moiré on agate, schist, gneiss)
    float bpx = pxS * uBandFreq * (uBandMode < 0.5 ? 1.0 : 1.4);
    float b2 = mix(0.61, 0.5 + 0.5 * sin(t * 6.2831853 * 3.07 + 1.3), 1.0 - smoothstep(0.12, 0.3, bpx * 3.07));
    float band = clamp(b * 0.78 + b2 * b2 * 0.22, 0.0, 1.0);
    band = mix(0.42, band, 1.0 - smoothstep(0.25, 0.6, bpx));
    float idx = floor(t + 0.25);
    float alt = fract(sin(idx * 91.7 + uOff.x) * 437.5453);
    vec3 bc = alt < 0.45 ? uC1 : (alt < 0.8 ? uC3 : uC2);
    col = mix(col, bc, band * uBand);
    hgt += band * uBand * 0.18;
    sPattern += band * uBand;
  }

  // inclusions / clasts (conglomerate pebbles, porphyry crystals)
  if (uClast > 0.0) {
    vec3 c = sCell(q * uClastFreq);
    float r = 0.28 + 0.2 * fract(c.z * 7.13);
    float inside = 1.0 - smoothstep(r - 0.04, r + 0.02, c.x);
    float k = fract(c.z * 3.71);
    vec3 cc = k < 0.33 ? uC2 : (k < 0.66 ? uC3 : uC4);
    cc = mix(cc, cc * (0.7 + 0.6 * fract(c.z * 29.1)), uClastVar);
    float rim = smoothstep(r - 0.05, r, c.x) * inside;
    col = mix(col, cc, inside * uClast);
    col *= 1.0 - rim * 0.35 * uClast;
    hgt += inside * uClast * 0.35;
    sPattern += inside * uClast;
  }

  // speckles (dark mafic flecks + light feldspar flecks)
  if (uSpeck > 0.0) {
    // under the lens the flecks get ragged, grainy edges instead of smooth printed blobs
    float rag = snoise(p * uSpeckFreq * 4.3 + 17.0) * 0.16 * aaEdge;
    float s1 = snoise(p * uSpeckFreq + 3.1) + rag;
    float s2 = snoise(p * uSpeckFreq * 1.37 + 7.7) - rag;
    float dk = smoothstep(0.62 - uSpeck * 0.3, 0.7 - uSpeck * 0.3, s1);
    float lt = smoothstep(0.68 - uSpeck * 0.25, 0.75 - uSpeck * 0.25, s2);
    col = mix(col, uC4, dk * (0.4 + 0.5 * aaSpeck));
    col = mix(col, uC3, lt * (0.3 + 0.5 * aaSpeck));
    sPattern += (dk + lt) * 0.5;
  }

  // veins: noise network (marble, serpentine) or 1–2 planar quartz veins (river pebbles)
  float vein = 0.0;
  if (uVein > 0.0) {
    if (uVeinMode < 0.5) {
      float n1 = 1.0 - abs(snoise(q * uVeinFreq));
      float n2 = 1.0 - abs(snoise(q * uVeinFreq * 2.1 + 11.0));
      vein = smoothstep(1.0 - uVeinWidth, 1.0 - uVeinWidth * 0.25, n1);
      vein = max(vein, 0.55 * smoothstep(1.0 - uVeinWidth * 0.6, 1.0 - uVeinWidth * 0.1, n2));
      // marble-style soft halo
      vein = max(vein, 0.25 * smoothstep(1.0 - uVeinWidth * 3.0, 1.0, n1));
    } else {
      float w = uVeinWidth * (0.65 + 0.7 * (0.5 + 0.5 * snoise(p * 1.7 + 2.0)));
      float d1 = abs(dot(p - uOff, uVeinAxis) - uVeinOffset + 0.06 * snoise(p * 2.4));
      vein = 1.0 - smoothstep(w * 0.55, w, d1);
      if (uVeinMode > 1.5) {
        float d2 = abs(dot(p - uOff, uVeinAxis2) + uVeinOffset * 0.6 + 0.05 * snoise(p * 2.9 + 5.0));
        vein = max(vein, 0.9 * (1.0 - smoothstep(w * 0.35, w * 0.7, d2)));
      }
      // hairline satellites beside the main vein
      float hair = 1.0 - abs(snoise(q * uVeinFreq * 1.5 + 21.0));
      vein = max(vein, 0.45 * smoothstep(0.988, 0.998, hair) * sAA * (1.0 - smoothstep(w, w * 5.0, d1)));
    }
    vein *= uVein;
    col = mix(col, uC2, vein);
    hgt += vein * uVeinRelief;
    sGloss += vein * 0.2;
    sPattern += vein;
  }

  // mica sparkle (schist, quartzite): tiny facets that flash under a point light
  float spark = 0.0;
  if (uSparkle > 0.0) {
    float sn = snoise(p * 140.0);
    spark = smoothstep(0.82, 0.9, sn) * uSparkle * aaSpark;
    col = mix(col, col * 1.5 + 0.06, spark);
    sGloss += spark;
  }

  // crevice grime (cavity from the mesh) + fine grain value noise
  float grainN = snoise(p * uGrainFreq);
  col *= 0.94 + 0.12 * grainN * aaGrain;
  // micro-texture: individual grains and pits, seen only magnified
  float microN = snoise(p * uGrainFreq * 4.0 + 31.0);
  col *= 1.0 + 0.09 * microN * aaMicro;
  hgt += (microN * 0.05 - smoothstep(0.55, 0.85, microN) * 0.06) * aaMicro;
  col = mix(col, col * vec3(0.55, 0.5, 0.45), clamp(vCav * uCavity, 0.0, 0.85));
  hgt += grainN * 0.11 * aaGrain;

  // pattern lens — an explicitly labelled visual enhancement (not true colour)
  if (uLens > 0.0) {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 boosted = clamp(mix(vec3(lum), col, 1.6) * (0.75 + 0.6 * smoothstep(0.0, 1.0, sPattern)), 0.0, 1.0);
    col = mix(col, boosted, uLens);
  }

  // wet stone: darker, more saturated (the collector's old trick of wetting a stone)
  if (uWet > 0.0) {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, max(mix(vec3(lum), col, 1.35) * 0.72, 0.0), uWet);
  }
  diffuseColor.rgb = col;
`;

const GLSL_ROUGH = /* glsl */ `
  float roughnessFactor = clamp(uRough + uRoughVar * mot * 0.6 - sGloss * 0.25 + vCav * 0.12, 0.04, 1.0);
  roughnessFactor = mix(roughnessFactor, 0.1, uWet * 0.85);
  roughnessFactor = mix(roughnessFactor, 0.12, spark);
`;

const GLSL_BUMP = /* glsl */ `
  {
    // screen-space bump from the procedural height (same maths as three's perturbNormalArb)
    // smoother (polished, water-worn) stones carry less micro-relief
    float bumpK = uBump * (0.35 + uRough * 0.9) * (1.0 + uLens * 1.5) * (1.0 - uWet * 0.35);
    vec2 dH = vec2(dFdx(hgt), dFdy(hgt)) * bumpK;
    vec3 sPos = -vViewPosition;
    vec3 sX = dFdx(sPos), sY = dFdy(sPos);
    vec3 R1 = cross(sY, normal), R2 = cross(normal, sX);
    float fDet = dot(sX, R1) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 vGrad = sign(fDet) * (dH.x * R1 + dH.y * R2);
    normal = normalize(abs(fDet) * normal - vGrad);
  }
`;

const hexLin = (h) => new THREE.Color(h).convertSRGBToLinear();
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]).normalize();

export const DEFAULT_LOOK = {
  seed: 1,
  palette: { base: "#8a8174", second: "#6f675c", vein: "#e9e4da", accent: "#b9ad9a", dark: "#2a2622" },
  warp: 0.3, mottle: 0.6, mottleFreq: 1.4,
  band: 0, bandFreq: 3, bandAxis: [0, 1, 0.2], bandWarp: 0.4, bandSharp: 1, bandMode: 0, bandCenter: [0.2, 0.1, 0],
  vein: 0, veinFreq: 1.6, veinWidth: 0.06, veinMode: 0, veinAxis: [1, 0.3, 0.2], veinAxis2: [0.2, 1, -0.4], veinOffset: 0,
  crystal: 0, crystalFreq: 14, speck: 0, speckFreq: 30, clast: 0, clastFreq: 3.2, clastVar: 0.4, sparkle: 0,
  rough: 0.6, roughVar: 0.2, polish: 0.2, bump: 0.012, grainFreq: 38, veinRelief: 0.12, cavity: 0.8,
};

/** Build the uniform set for a look (shared by the live material and by thumbnails). */
export function lookUniforms(lookIn) {
  const L = { ...DEFAULT_LOOK, ...lookIn, palette: { ...DEFAULT_LOOK.palette, ...(lookIn && lookIn.palette) } };
  const s = L.seed;
  const off = new THREE.Vector3(((s * 13) % 97) * 0.37, ((s * 29) % 89) * 0.41, ((s * 7) % 83) * 0.43);
  return {
    uOff: { value: off }, uWarp: { value: L.warp },
    uC0: { value: hexLin(L.palette.base) }, uC1: { value: hexLin(L.palette.second) },
    uC2: { value: hexLin(L.palette.vein) }, uC3: { value: hexLin(L.palette.accent) }, uC4: { value: hexLin(L.palette.dark) },
    uMottle: { value: L.mottle }, uMottleFreq: { value: L.mottleFreq },
    uBand: { value: L.band }, uBandFreq: { value: L.bandFreq }, uBandAxis: { value: v3(L.bandAxis) },
    uBandWarp: { value: L.bandWarp }, uBandSharp: { value: L.bandSharp }, uBandMode: { value: L.bandMode },
    uBandCenter: { value: new THREE.Vector3(...L.bandCenter).add(off) },
    uVein: { value: L.vein }, uVeinFreq: { value: L.veinFreq }, uVeinWidth: { value: L.veinWidth },
    uVeinMode: { value: L.veinMode }, uVeinAxis: { value: v3(L.veinAxis) }, uVeinAxis2: { value: v3(L.veinAxis2) },
    uVeinOffset: { value: L.veinOffset },
    uCrystal: { value: L.crystal }, uCrystalFreq: { value: L.crystalFreq },
    uSpeck: { value: L.speck }, uSpeckFreq: { value: L.speckFreq },
    uClast: { value: L.clast }, uClastFreq: { value: L.clastFreq }, uClastVar: { value: L.clastVar },
    uSparkle: { value: L.sparkle },
    uRough: { value: L.rough }, uRoughVar: { value: L.roughVar }, uBump: { value: L.bump },
    uGrainFreq: { value: L.grainFreq }, uVeinRelief: { value: L.veinRelief }, uCavity: { value: L.cavity },
    uWet: { value: 0 }, uLens: { value: 0 },
  };
}

/**
 * Create the stone material for a look.
 * @param {object} look  surface recipe (see DEFAULT_LOOK)
 * @param {object} opt   { quality: "hq" | "lq" }
 */
export function createStoneMaterial(look, opt = {}) {
  const quality = opt.quality || "hq";
  const L = { ...DEFAULT_LOOK, ...look };
  const uniforms = lookUniforms(look);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 1, metalness: 0,
    clearcoat: L.polish, clearcoatRoughness: 0.32 - L.polish * 0.2,
    envMapIntensity: 1.0,
  });
  mat.extensions = { derivatives: true };
  if (quality === "lq") mat.defines = { STONE_LQ: "" };
  mat.userData.uniforms = uniforms;
  mat.userData.basePolish = L.polish;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aCavity;\nvarying vec3 vSPos;\nvarying float vCav;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSPos = position;\nvCav = aCavity;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\n" + GLSL_UNIFORMS + GLSL_NOISE)
      .replace("#include <color_fragment>", GLSL_PATTERN)
      .replace("#include <roughnessmap_fragment>", GLSL_ROUGH)
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + GLSL_BUMP);
  };
  mat.customProgramCacheKey = () => "stone-v2-" + quality;
  return mat;
}

/** Live toggles used by the viewer (wet surface, pattern lens). */
export function setStoneWet(mat, wet) {
  mat.userData.uniforms.uWet.value = wet;
  mat.clearcoat = Math.max(mat.userData.basePolish, wet * 0.9);
  mat.clearcoatRoughness = wet > 0.5 ? 0.06 : 0.32 - mat.userData.basePolish * 0.2;
}
export function setStoneLens(mat, k) { mat.userData.uniforms.uLens.value = k; }
