import * as THREE from "three";
import { Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { BufferGeometryUtils } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/* ============================================================
   LOUPE: a folding hand lens (2–12x), held up by a hand.

   OPTICS. A second camera renders the scene into a square target. It
   behaves like a lens, not a crop-zoom:
   - It sits on the ray from the eye through the glass centre and is
     dollied toward the surface under the lens until that surface plane is
     magnified m times. This gives true close-up perspective: relief, and
     parallax as the lens or the stone moves.
   - It renders only what a lens a few centimetres across can see: the
     objects within reach of the eye (the held stone, the hands, the veil,
     the vitrine) are put on a lens layer; the hall's room-sized merged
     batches, which no frustum test can cull, stay out of it. The shadow
     maps are refreshed for the frame first (with the main camera, every
     caster), so the magnified shadows never lag.
   - The target has a depth texture. The glass blurs each pixel by its
     circle of confusion around a focus distance (mip-chain gather), so
     depth of field is a few millimetres at 6–10x.
   - Focus hunts onto whatever is under the lens: BVH raycasts against the
     nearby meshes AND the skinned hands (a BVH per bone, posed by the
     live skeleton) feed a lagging, slightly underdamped spring. setFocus(d)
     fixes it instead. BVHs are cached per geometry object and built in
     small time slices (or taken from geometry.userData.bvh), never in one
     long main-thread task.
   The glass samples that view by screen position, so the image stays
   world-locked while the loupe rolls and leans in the hand. The sampling
   level is max(blur level, the target's own minification), so the
   supersampled view is filtered, not aliased. Toward the rim it adds mild
   pincushion, field-curvature softening and a 1–2 px lateral-colour fringe
   (taps are linearised before any averaging). Over the image it adds
   Fresnel reflections of scene.environment, the key lamp's glint, and a
   dark bevel with a thin bright edge (internal reflection at the rim).
   While the lens is lowered, or whenever its view was not rendered for the
   current frame, the image fades into a dim, featureless glass: it never
   shows a stale frame.

   BODY. A turned brass bezel engraved with the current power (it rolls as
   the magnification changes), a lug, a through-rivet with a washer, and a
   black-lacquered case leaf. A right hand holds the leaf in a key grip: the
   thumb pad on the front, the curled index finger behind. The hand is the
   visitor's own right hand: it takes the skin and silk-sleeve materials of
   the study hands (hands.js, "hand-right") when they exist, and otherwise
   rebuilds the same look (same linear skin colours, nail colour, wrap
   lighting, dark silk with a narrow cream cuff). Raising is the hand
   bringing the lens up from below the frame; lowering takes it back down.
   The loupe follows the pointer on a slightly underdamped spring, leans
   with its acceleration, rolls with its sideways speed, and sways a little
   (scaled by 1/m, since the glass amplifies it m times).

   COMPOSITING. In the default "scene" mode the loupe is drawn in the main
   frame. Its view depth (5 cm to 1.05 m) is remapped linearly onto the
   front quarter of the depth range, so it beats the scene but still sorts
   its own parts finely, even in 16-bit composer depth buffers. It is
   hidden from the lens view, from the SSAO normal pass, and from foreign
   cameras, but not from shadow maps. In "overlay" mode (PostFX.setLoupe,
   or createLoupePass) it is drawn after the scene passes into the
   composer's buffer, on top of a cleared depth. renderOverlay(null) does
   the same on a direct path.

   COLOUR. The view target uses the main frame's encoding: opts.encoding,
   or opts.frameTarget(), or renderer.outputEncoding. sRGB means 8-bit
   storage; Linear means half-float. Every scene material therefore runs
   its existing program, and nothing recompiles. The glass decodes the
   view to linear and writes it through linearToOutputTexel with
   toneMapped:false. The loupe's own programs are precompiled right after
   creation.

   MEMORY. When the lens has been down for 2 s (or on release()), the loupe
   drops every reference to the scene's meshes (focus targets, lens layer),
   so a put-back stone and its BVH can be collected.
   ============================================================ */

const OVERLAY_LAYER = 31;
const LENS_LAYER = 30;
// the loupe's own depth band: view depth 5 cm–1.05 m mapped linearly onto the front quarter of the
// depth range (the scene there is nearer than the camera near plane allows), ~0.06 mm per step at 16 bits
const SQUEEZE = "gl_Position.z = (-1.0 + 0.5 * clamp(-mvPosition.z - 0.05, 0.0, 1.0)) * gl_Position.w;";
const RO = 1.27, RI = 0.985, H = 0.15, GLASS_Z = 0.05;       // bezel, in glass radii
const BAND0 = 1.03, BAND1 = 1.225;                           // the engraved front band of the bezel
const HINGE = -0.8, OPEN = -0.25;                            // lug direction, leaf swung open (rad)
const LEAF_Z = -0.275, LEAF_MID = -0.225, LEAF_T = 0.15;     // leaf placement / thickness (glass radii)
const GRIP_X = 1.16;                                         // thumb pad position along the leaf (near its end)
export const MAG_MIN = 2, MAG_MAX = 12;

// the visitor's right hand (contract: identical to hands.js) — linear colours (r128 hex is linear)
const SKIN_BACK = new THREE.Color(0xa8573a), SKIN_PALM = new THREE.Color(0xc06c4f);
const NAIL = new THREE.Color(0xd8a698), SILK = new THREE.Color(0x020a10), CUFF = new THREE.Color(0x9c8a64);
const CUFF_LEN = 0.016;                                      // a narrow cream cuff at the sleeve's open end (m)

const GLASS_VERT = /* glsl */ `
uniform float uCurv;
varying vec2 vUv;
varying vec3 vViewPos, vNormalV;
void main(){
  vUv = uv;
  vNormalV = normalize(normalMatrix * normalize(vec3(position.xy * uCurv, 1.0)));   // convex front face
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  ${SQUEEZE}
}`;

const GLASS_FRAG = /* glsl */ `
#include <common>
#include <packing>
#include <envmap_common_pars_fragment>
#include <cube_uv_reflection_fragment>
varying vec2 vUv;
varying vec3 vViewPos, vNormalV;
uniform sampler2D tView, tDepth;
uniform float uSRGB, uK, uCA, uNear, uFar, uFocus, uDof, uTexels, uBaseLod, uMaxLod, uDefocus, uEnvI, uLightDir, uImage;
uniform vec2 uCenterPx;
uniform float uRadiusPx;
uniform vec3 uLightPos, uLightCol;
float lHash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float lNoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lHash(i), lHash(i + vec2(1, 0)), f.x), mix(lHash(i + vec2(0, 1)), lHash(i + vec2(1, 1)), f.x), f.y);
}
// every tap is linear before it is averaged (the Low tier's view is 8-bit sRGB)
vec3 tap(vec2 uv, float b){
  vec3 c = texture2D(tView, uv, b).rgb;
  return uSRGB > 0.5 ? sRGBToLinear(vec4(c, 1.0)).rgb : c;
}
void main(){
  vec2 qg = vUv * 2.0 - 1.0;                                  // on the glass (rim effects)
  float rg = length(qg);
  vec2 q = (gl_FragCoord.xy - uCenterPx) / uRadiusPx;         // world-locked image coordinate
  float r2 = dot(q, q);
  vec2 d = q * (1.0 + uK * r2);                               // mild pincushion
  vec2 uv = 0.5 + 0.5 * d;
  // depth of field: circle of confusion (in lens radii) from the depth under this pixel
  float z = max(-perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar), 1e-4);
  float coc = uDof * abs(1.0 / z - 1.0 / uFocus) + uDefocus;
  float lod = log2(max(coc * uTexels, 1e-3));
  lod = clamp(max(lod, 0.0) + 1.5 * r2 * r2, 0.0, uMaxLod);  // + field curvature toward the rim
  // uv follows gl_FragCoord, so the hardware level is already uBaseLod (the target's own
  // minification): the final level is max(lod, uBaseLod) - 0.25, filtered, never mip 0 when supersampled
  float b = max(lod - uBaseLod, 0.0) - 0.25;
  float ca = uCA * r2 * r2;                                   // lateral colour, outer zone only
  vec3 c0 = vec3(tap(0.5 + 0.5 * d * (1.0 + ca), b).r, tap(uv, b).g, tap(0.5 + 0.5 * d * (1.0 - ca), b).b);
  // blur: an 8-tap golden-angle disc of the CoC radius, each tap from a mip one step sharper
  float blur = smoothstep(0.4, 1.4, lod), rad = 0.5 * coc * blur;
  float bt = max(max(lod - 1.2, 0.0) - uBaseLod, 0.0) - 0.25;
  vec3 ring = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 2.39996 + 0.4;
    ring += tap(uv + vec2(cos(a), sin(a)) * rad * sqrt((float(i) + 0.5) / 8.0), bt);
  }
  vec3 c = mix(c0, (c0 + ring) / 9.0, blur);
  // lowered, or no view rendered for this frame: a dim, featureless glass (never a stale image)
  c = mix(tap(vec2(0.5), 16.0) * 0.5, c, uImage);
  // glass surfaces
  vec3 N = normalize(vNormalV), V = normalize(-vViewPos);
  float F = 0.01 + 0.09 * pow(rg, 4.0);                      // AR-coated glass: ~1% at the centre, 10% at the rim
  c *= (1.0 - F) * (1.0 - 0.14 * smoothstep(0.7, 1.0, rg));  // transmission + inner vignette
  vec3 env = vec3(0.012, 0.011, 0.01);
  #ifdef USE_ENVMAP
    vec3 Rw = inverseTransformDirection(reflect(-V, N), viewMatrix);
    #ifdef ENVMAP_TYPE_CUBE_UV
      env = textureCubeUV(envMap, Rw, 0.16).rgb * uEnvI;          // (decodes internally); soft, not a picture
    #elif defined(ENVMAP_TYPE_CUBE)
      env = envMapTexelToLinear(textureCube(envMap, vec3(flipEnvMap * Rw.x, Rw.yz), 3.0)).rgb * uEnvI;
    #endif
  #endif
  float smudge = 0.45 + 1.1 * lNoise(qg * 4.0 + 3.1) * lNoise(qg * 9.0 - 7.7);
  c += env * F * (0.8 + 0.4 * smudge);
  // the key lamp mirrored in the convex face: where N meets the half vector
  vec3 L = uLightDir > 0.5 ? normalize(uLightPos) : normalize(uLightPos - vViewPos);
  float NdH = max(dot(N, normalize(L + V)), 0.0);
  vec3 glint = uLightCol * (pow(NdH, 9000.0) * 2.5 + pow(NdH, 900.0) * 0.12 + pow(NdH, 120.0) * 0.025 * smudge) * step(0.0, dot(N, L));
  // rim: total internal reflection darkens a narrow band, with a thin bright edge
  float bev = smoothstep(0.95, 0.995, rg);
  c = (c + glint) * (1.0 - 0.88 * bev);
  c += (env * 0.7 + uLightCol * 0.012 + 0.004) * exp(-pow((rg - 0.983) / 0.007, 2.0));
  gl_FragColor = vec4(c, 1.0);
  #include <encodings_fragment>
}`;

/* ---------- small helpers ---------- */

// concentric turning marks (lathe uv.y runs along the profile) / straight brushing (case)
function brushTexture(seed) {
  const n = 1024, data = new Uint8Array(4 * n * 4);
  let s = seed, sm = 0.5;
  for (let j = 0; j < n; j++) {
    s = (s * 16807) % 2147483647;
    sm = sm * 0.55 + (s / 2147483647) * 0.45;
    const scratch = s % 97 === 0 ? -0.16 : 0;
    const v = Math.max(0, Math.min(1, 0.78 + (sm - 0.5) * 0.36 + scratch));
    for (let i = 0; i < 4; i++) data.set([255, v * 255, 0, 255], (j * 4 + i) * 4);
  }
  const t = new THREE.DataTexture(data, 4, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

const V2 = (a) => a.map(([x, y]) => new THREE.Vector2(x, y));

// turned bezel: duplicated profile points give hard edges, the outer band is knurled, and the
// front face is a flat band wide enough to carry the engraved power
function bezelGeometry() {
  const P = V2([
    [RI + 0.03, -H], [RO - 0.03, -H], [RO - 0.03, -H], [RO, -H + 0.03], [RO, -H + 0.03],
    [RO, H * 0.5], [RO, H * 0.5], [RO - 0.035, H], [RO - 0.035, H],
    [BAND1 + 0.004, H], [BAND1, H - 0.008], [BAND1 - 0.004, H],           // a fine turned line outside the band
    [BAND0, H], [BAND0, H], [RI, H - 0.045], [RI, H - 0.045], [RI, -H + 0.03], [RI, -H + 0.03], [RI + 0.03, -H],
  ]);
  const seg = 360, np = P.length;
  const g = new THREE.LatheGeometry(P, seg);
  const pos = g.attributes.position;
  for (let i = 0; i <= seg; i++) {
    const k = 1 + (i % 2 ? -0.0035 : 0.0035);
    for (let j = 0; j < np; j++) {
      if (Math.abs(P[j].x - RO) > 1e-6 || P[j].y < -H + 0.02) continue;
      const v = i * np + j;
      pos.setX(v, pos.getX(v) * k); pos.setZ(v, pos.getZ(v) * k);
    }
  }
  g.computeVertexNormals();
  const nr = g.attributes.normal, a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let j = 0; j < np; j++) {               // weld the seam normals
    a.fromBufferAttribute(nr, j); b.fromBufferAttribute(nr, seg * np + j);
    a.add(b).normalize(); nr.setXYZ(j, a.x, a.y, a.z); nr.setXYZ(seg * np + j, a.x, a.y, a.z);
  }
  g.rotateX(Math.PI / 2);                       // lathe axis → view axis (+z toward the eye)
  return g;
}

// an annular sector on the bezel's front band (u along the arc, left to right; v outward)
const READ_A = 0.52;                            // half-angle of the engraved sector (rad), centred at 12 o'clock
function readoutGeometry() {
  const n = 40, pos = [], uv = [], nor = [], ind = [], r0 = BAND0 + 0.008, r1 = BAND1 - 0.008;
  for (let i = 0; i <= n; i++) {
    const u = i / n, th = Math.PI / 2 + READ_A - u * 2 * READ_A;
    for (let j = 0; j <= 1; j++) {
      const r = j ? r1 : r0;
      pos.push(Math.cos(th) * r, Math.sin(th) * r, H + 0.006); uv.push(u, j); nor.push(0, 0, 1);
    }
  }
  for (let i = 0; i < n; i++) { const a = 2 * i; ind.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ind);
  return g;
}

// the engraving: enamel-filled numerals with a dark cut edge, drawn into a canvas (RGBA)
function readoutCanvas() {
  const c = typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (!c) return null;
  c.width = 1024; c.height = 176;
  return c;
}
function drawReadout(c, value) {
  const g = c.getContext("2d"), W = c.width, Hh = c.height;
  g.clearRect(0, 0, W, Hh);
  const txt = (Math.abs(value - Math.round(value)) < 0.01 ? String(Math.round(value)) : value.toFixed(1)) + "×";
  g.font = `600 ${Math.round(Hh * 0.74)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  // (the canvas is mapped with ~square texels onto the arc: glyphs come out upright)
  g.save(); g.translate(W / 2, Hh / 2 + 4);
  g.lineJoin = "round"; g.lineWidth = 12; g.strokeStyle = "rgba(34,20,6,0.92)"; g.strokeText(txt, 0, 3);
  g.fillStyle = "rgb(240,233,216)"; g.fillText(txt, 0, 0);
  g.restore();
  // a turned scale either side of the numerals
  g.fillStyle = "rgba(30,18,6,0.7)";
  for (let i = 1; i <= 5; i++) {
    const dx = 120 + i * 62;
    for (const s of [-1, 1]) g.fillRect(W / 2 + s * dx - 3, Hh * (i % 2 ? 0.36 : 0.26), 6, Hh * (i % 2 ? 0.28 : 0.48));
  }
}

// tapered capsule along +x from the origin (radii w0 → w1), extruded in z
function armGeometry(len, w0, w1, depth) {
  const s = new THREE.Shape();
  s.moveTo(0, -w0); s.lineTo(len, -w1);
  s.absarc(len, 0, w1, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(0, w0);
  s.absarc(0, 0, w0, Math.PI / 2, Math.PI * 1.5, false);
  return new THREE.ExtrudeGeometry(s, { depth, curveSegments: 24, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3 });
}

function latheZ(profile, seg) {                 // lathe about the view axis (profile y → z)
  const g = new THREE.LatheGeometry(V2(profile), seg);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Move a material's depth into the loupe's band at the front of the depth range (see SQUEEZE). */
export function squeezeMaterial(mat, extra) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    if (!sh.vertexShader.includes("#include <project_vertex>")) console.warn("[loupe] squeeze target missing");
    sh.vertexShader = sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n" + SQUEEZE);
    if (extra) extra(sh);
  };
  mat.customProgramCacheKey = () => prevKey() + "|loupe-squeeze" + (extra ? "-x" : "");
  mat.transparent = true;                       // drawn after the scene, sorted by renderOrder
  return mat;
}

/** A squeezed copy of another module's material that keeps its shader hooks (Material.clone drops them). */
function squeezedCopy(src, { skinning = false, extra = null } = {}) {
  const m = src.clone();
  m.skinning = skinning && !!src.skinning;
  if (src.extensions) m.extensions = { ...src.extensions };
  if (src.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) {
    const ob = src.onBeforeCompile, key = src.customProgramCacheKey.bind(src);
    m.onBeforeCompile = (sh, r) => ob.call(src, sh, r);
    m.customProgramCacheKey = () => key();
  }
  return squeezeMaterial(m, extra);
}

/* ---------- triangle BVHs for focus raycasts (one per geometry, built in time slices) ---------- */

// node layout: [min xyz, max xyz, a, k]; leaf: a = first index into ord, k = -count; inner: a = right child, k = axis
function* bvhBuilder(tri) {
  const n = (tri.length / 9) | 0;
  const cen = new Float32Array(n * 3), ord = new Uint32Array(n);
  for (let t = 0; t < n; t++) {
    for (let a = 0; a < 3; a++) cen[3 * t + a] = (tri[9 * t + a] + tri[9 * t + 3 + a] + tri[9 * t + 6 + a]) / 3;
    ord[t] = t;
    if ((t & 16383) === 16383) yield;
  }
  let cap = Math.ceil(n / 2) + 16, node = new Float32Array(cap * 8), count = 0, ops = 0;
  const stack = [0, Math.max(n, 0), -1];        // s, e, slot that receives this node's id (right children)
  while (stack.length) {
    const patch = stack.pop(), e = stack.pop(), s = stack.pop();
    if (count >= cap) { cap = Math.ceil(cap * 1.5) + 16; const nn = new Float32Array(cap * 8); nn.set(node); node = nn; }
    const id = count++, o = id * 8;
    if (patch >= 0) node[patch] = id;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    let cx0 = Infinity, cy0 = Infinity, cz0 = Infinity, cx1 = -Infinity, cy1 = -Infinity, cz1 = -Infinity;
    for (let i = s; i < e; i++) {
      const t = ord[i], p = 9 * t;
      for (let k = 0; k < 9; k += 3) {
        const x = tri[p + k], y = tri[p + k + 1], z = tri[p + k + 2];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
      const cx = cen[3 * t], cy = cen[3 * t + 1], cz = cen[3 * t + 2];
      if (cx < cx0) cx0 = cx; if (cx > cx1) cx1 = cx; if (cy < cy0) cy0 = cy; if (cy > cy1) cy1 = cy; if (cz < cz0) cz0 = cz; if (cz > cz1) cz1 = cz;
    }
    node[o] = x0; node[o + 1] = y0; node[o + 2] = z0; node[o + 3] = x1; node[o + 4] = y1; node[o + 5] = z1;
    const ex = cx1 - cx0, ey = cy1 - cy0, ez = cz1 - cz0;
    const ax = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2, ext = ax === 0 ? ex : ax === 1 ? ey : ez;
    ops += e - s;
    if (e - s <= 6 || !(ext > 1e-9)) { node[o + 6] = s; node[o + 7] = -(e - s); }
    else {
      const mid = ((ax === 0 ? cx0 : ax === 1 ? cy0 : cz0) + (ax === 0 ? cx1 : ax === 1 ? cy1 : cz1)) / 2;
      let m = s;
      for (let i = s; i < e; i++) if (cen[3 * ord[i] + ax] < mid) { const t = ord[i]; ord[i] = ord[m]; ord[m++] = t; }
      if (m === s || m === e) m = (s + e) >> 1;
      node[o + 7] = ax;
      stack.push(m, e, o + 6, s, m, -1);         // right waits for its id; left is next (id + 1)
    }
    if (ops > 40000) { ops = 0; yield; }
  }
  return { tri, ord, node: node.subarray(0, count * 8) };
}
// run a generator in ≤ 3 ms slices between tasks; cb(result)
function sliced(gen, cb, token) {
  const step = () => {
    if (token && token.cancelled) return;
    const t0 = performance.now();
    let r;
    do { r = gen.next(); } while (!r.done && performance.now() - t0 < 3);
    if (r.done) cb(r.value); else setTimeout(step, 0);
  };
  setTimeout(step, 0);
}
const STACK = new Int32Array(256);
// nearest hit t (in units of the given, unnormalised direction) or Infinity
function bvhRay(b, ox, oy, oz, dx, dy, dz, tmax) {
  const { tri, ord, node } = b, ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
  let best = tmax, sp = 0;
  STACK[sp++] = 0;
  while (sp) {
    const o = STACK[--sp] * 8;
    let t0 = (node[o] - ox) * ix, t1 = (node[o + 3] - ox) * ix;
    let tn = Math.min(t0, t1), tf = Math.max(t0, t1);
    t0 = (node[o + 1] - oy) * iy; t1 = (node[o + 4] - oy) * iy;
    tn = Math.max(tn, Math.min(t0, t1)); tf = Math.min(tf, Math.max(t0, t1));
    t0 = (node[o + 2] - oz) * iz; t1 = (node[o + 5] - oz) * iz;
    tn = Math.max(tn, Math.min(t0, t1)); tf = Math.min(tf, Math.max(t0, t1));
    if (tf < Math.max(tn, 0) || tn > best) continue;
    const a = node[o + 6], k = node[o + 7];
    if (k >= 0) { if (sp < 254) { STACK[sp++] = a; STACK[sp++] = o / 8 + 1; } continue; }
    for (let i = a, e = a - k; i < e; i++) {
      const p = 9 * ord[i];
      const e1x = tri[p + 3] - tri[p], e1y = tri[p + 4] - tri[p + 1], e1z = tri[p + 5] - tri[p + 2];
      const e2x = tri[p + 6] - tri[p], e2y = tri[p + 7] - tri[p + 1], e2z = tri[p + 8] - tri[p + 2];
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-14) continue;
      const inv = 1 / det, sx = ox - tri[p], sy = oy - tri[p + 1], sz = oz - tri[p + 2];
      const u = (sx * px + sy * py + sz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > 1e-6 && t < best) best = t;
    }
  }
  return best;
}
// triangle soup of a geometry (optionally only the triangles whose first vertex passes `keep`)
function triSoup(geo, keep) {
  const pos = geo.attributes.position, idx = geo.index, I = idx && idx.array;
  const n = ((idx ? idx.count : pos.count) / 3) | 0, out = [];
  for (let t = 0; t < n; t++) {
    const v0 = I ? I[3 * t] : 3 * t;
    if (keep && !keep(v0)) continue;
    for (let k = 0; k < 3; k++) { const v = I ? I[3 * t + k] : 3 * t + k; out.push(pos.getX(v), pos.getY(v), pos.getZ(v)); }
  }
  return new Float32Array(out);
}
function triSoupFast(geo) {
  const pos = geo.attributes.position;
  if (pos.isInterleavedBufferAttribute || pos.itemSize !== 3) return triSoup(geo);
  const P = pos.array, idx = geo.index, I = idx && idx.array, n = ((idx ? idx.count : pos.count) / 3) | 0;
  const tri = new Float32Array(n * 9);
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
    const v = I ? I[3 * t + k] : 3 * t + k, o = 9 * t + 3 * k;
    tri[o] = P[3 * v]; tri[o + 1] = P[3 * v + 1]; tri[o + 2] = P[3 * v + 2];
  }
  return tri;
}

// rigid meshes: geometry → { version, tri, ord, node } (also accepts a prebuilt geometry.userData.bvh)
const BVH = new WeakMap();
function bvhGet(geo) {
  const b = BVH.get(geo), v = geo.attributes.position.version;
  if (b && b.node && b.version === v) return b;
  const u = geo.userData && geo.userData.bvh;
  if (u && u.node && u.tri && u.ord) { const r = { version: v, tri: u.tri, ord: u.ord, node: u.node }; BVH.set(geo, r); return r; }
  return null;
}
function queueBvh(geo) {
  if (bvhGet(geo)) return;
  const b = BVH.get(geo), v = geo.attributes.position.version;
  if (b && b.building === v) return;
  BVH.set(geo, { building: v });
  sliced(bvhBuilder(triSoupFast(geo)), (r) => { if (geo.attributes.position && geo.attributes.position.version === v) BVH.set(geo, { version: v, ...r }); });
}
// skinned meshes: geometry → parts, one BVH per bone in bind space (posed by the live skeleton at cast time)
const SKIN = new WeakMap();
function queueSkinBvh(geo) {
  if (SKIN.has(geo)) return;
  SKIN.set(geo, { parts: null });
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  if (!si || !sw) return;
  const dom = (v) => {                           // the bone that moves this vertex most
    let bi = si.getX(v), w = sw.getX(v);
    if (sw.getY(v) > w) { w = sw.getY(v); bi = si.getY(v); }
    if (sw.getZ(v) > w) { w = sw.getZ(v); bi = si.getZ(v); }
    if (sw.getW(v) > w) { bi = si.getW(v); }
    return bi;
  };
  function* build() {
    const pos = geo.attributes.position, idx = geo.index, I = idx && idx.array;
    const n = ((idx ? idx.count : pos.count) / 3) | 0, byBone = new Map();
    for (let t = 0; t < n; t++) {
      const v0 = I ? I[3 * t] : 3 * t, b = dom(v0);
      let l = byBone.get(b); if (!l) byBone.set(b, (l = []));
      for (let k = 0; k < 3; k++) { const v = I ? I[3 * t + k] : 3 * t + k; l.push(pos.getX(v), pos.getY(v), pos.getZ(v)); }
      if ((t & 4095) === 4095) yield;
    }
    const parts = [];
    for (const [bi, list] of byBone) {
      const tri = new Float32Array(list), bvh = yield* bvhBuilder(tri);
      const c = new THREE.Vector3(), bb = new THREE.Box3();
      bb.min.set(bvh.node[0], bvh.node[1], bvh.node[2]); bb.max.set(bvh.node[3], bvh.node[4], bvh.node[5]);
      bb.getCenter(c);
      parts.push({ bi, bvh, c, r: bb.min.distanceTo(bb.max) / 2, M: new THREE.Matrix4(), Mi: new THREE.Matrix4(), wc: new THREE.Vector3(), wr: 0, frame: -1 });
    }
    return parts;
  }
  sliced(build(), (parts) => { SKIN.set(geo, { parts }); });
}

/* ---------- the hand (right hand, metres; X distal, Y dorsal, Z radial) ---------- */

const FINGERS = [   // MCP, abduction, phalanx lengths, half-widths at MCP/PIP/DIP/tip, flexion MCP/PIP/DIP
  { mcp: [0.093, 0.004, 0.023], abd: 0.05, len: [0.040, 0.024, 0.019], w: [0.0098, 0.0089, 0.0081, 0.0073], flex: [0.95, 1.5, 0.62] },
  { mcp: [0.097, 0.006, 0.004], abd: 0.0, len: [0.044, 0.027, 0.020], w: [0.0102, 0.0093, 0.0084, 0.0075], flex: [1.05, 1.58, 0.8] },
  { mcp: [0.092, 0.004, -0.0155], abd: -0.07, len: [0.041, 0.026, 0.019], w: [0.0096, 0.0088, 0.0079, 0.0071], flex: [1.15, 1.62, 0.8] },
  { mcp: [0.082, 0.0, -0.0325], abd: -0.18, len: [0.032, 0.020, 0.018], w: [0.0086, 0.0078, 0.007, 0.0063], flex: [1.25, 1.58, 0.74] },
];
const THUMB = { cmc: [0.028, -0.011, 0.024], len: [0.046, 0.032, 0.027], w: [0.0148, 0.0122, 0.0106, 0.0099, 0.0088], twist: 1.8 };
/** diffuse-only wrap lighting with a warm terminator (light scattered under skin); no specular leak past it */
export const SKIN_WRAP = /* glsl */ `
  float sNL = dot( geometry.normal, directLight.direction );
  vec3 sIrr = directLight.color * ( saturate( sNL ) + vec3( 0.5, 0.2, 0.11 ) * ( saturate( ( sNL + 0.55 ) / 1.55 ) - saturate( sNL ) ) );
  #ifndef PHYSICALLY_CORRECT_LIGHTS
    sIrr *= PI;
  #endif
  reflectedLight.directDiffuse += ( 1.0 - clearcoatDHR ) * sIrr * BRDF_Diffuse_Lambert( material.diffuseColor );`;
const WRAP_LINE = "reflectedLight.directDiffuse += ( 1.0 - clearcoatDHR ) * irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );";

const _c = new THREE.Color();
// skin albedo (linear): the hands.js palette, palm side paler and pinker; knuckles / tips a touch redder; creases darker
function skinAlbedo(t, k, cy) {
  const pal = THREE.MathUtils.smoothstep(-cy, -0.25, 0.65);
  _c.copy(SKIN_BACK).lerp(SKIN_PALM, pal);
  const red = t * 0.3, crease = 1 - k * (cy < 0 ? 0.3 * -cy : 0.1 * cy);
  return [_c.r * crease, _c.g * (1 - red * 0.2) * crease * (1 - k * 0.04), _c.b * (1 - red * 0.24) * crease * (1 - k * 0.05)];
}

// a tube swept through framed nodes {p, q (x along, y dorsal, z radial), w, h, t (tint), k (crease)}, optional
// rounded tip. Attributes: position, normal, uv (u around, v = length / 0.62 m, like hands.js's sleeve lathe),
// color = linear albedo from albedo(t, k, cy, s) (s: distance along the tube)
function sweep(nodes, { seg = 5, rad = 22, tip = 0, flat = 0.84, albedo = (t, k, cy) => skinAlbedo(t, k, cy) } = {}) {
  const curve = new THREE.CatmullRomCurve3(nodes.map((n) => n.p), false, "centripetal");
  const rings = [], N = (nodes.length - 1) * seg;
  for (let i = 0; i <= N; i++) {
    const s = (i / N) * (nodes.length - 1), k = Math.min(nodes.length - 2, Math.floor(s)), f = s - k, e = f * f * (3 - 2 * f);
    const A = nodes[k], B = nodes[k + 1];
    const ka = A.k || 0, kb = B.k || 0;
    rings.push({ p: curve.getPoint(i / N), q: A.q.clone().slerp(B.q, e), w: A.w + (B.w - A.w) * e, h: A.h + (B.h - A.h) * e, t: A.t + (B.t - A.t) * e, k: Math.pow(ka + (kb - ka) * f, 4) });
  }
  const last = rings[rings.length - 1], dir = new THREE.Vector3(1, 0, 0).applyQuaternion(last.q);
  for (let j = 1; tip && j <= 5; j++) {
    const a = (j / 6) * Math.PI / 2;
    rings.push({ p: last.p.clone().addScaledVector(dir, tip * Math.sin(a)), q: last.q, w: last.w * Math.cos(a), h: last.h * Math.cos(a), t: last.t, k: 0 });
  }
  let along = 0;
  rings.forEach((r, i) => { if (i) along += r.p.distanceTo(rings[i - 1].p); r.s = along; });
  const pos = [], col = [], uvs = [], ind = [], v = new THREE.Vector3();
  rings.forEach((r) => {
    for (let a = 0; a <= rad; a++) {
      const th = (a / rad) * Math.PI * 2, cy = Math.cos(th), sz = Math.sin(th);
      v.set(0, cy * r.h * (cy < 0 ? flat : 1), sz * r.w).applyQuaternion(r.q).add(r.p);
      pos.push(v.x, v.y, v.z);
      col.push(...albedo(r.t, r.k, cy, r.s));
      uvs.push(a / rad, r.s / 0.62);
    }
  });
  const R1 = rad + 1;
  for (let i = 0; i < rings.length - 1; i++)
    for (let a = 0; a < rad; a++) {
      const p0 = i * R1 + a, p1 = p0 + 1, p2 = p0 + R1, p3 = p1 + R1;
      ind.push(p0, p1, p2, p1, p3, p2);              // counter-clockwise seen from outside
    }
  if (tip) {
    const pole = pos.length / 3, base = (rings.length - 1) * R1;
    v.copy(last.p).addScaledVector(dir, tip);
    pos.push(v.x, v.y, v.z); col.push(...albedo(last.t, 0, 1, last.s)); uvs.push(0.5, last.s / 0.62);
    for (let a = 0; a < rad; a++) ind.push(base + a, base + a + 1, pole);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(ind);
  g.computeVertexNormals();
  // the seam column (a = 0 and a = rad) is split for the uv: average its normals so it stays smooth
  const nr = g.attributes.normal, n0 = new THREE.Vector3(), n1 = new THREE.Vector3();
  for (let i = 0; i < rings.length; i++) {
    n0.fromBufferAttribute(nr, i * R1); n1.fromBufferAttribute(nr, i * R1 + rad);
    n0.add(n1).normalize(); nr.setXYZ(i * R1, n0.x, n0.y, n0.z); nr.setXYZ(i * R1 + rad, n0.x, n0.y, n0.z);
  }
  return g;
}

// a fingernail that hugs the distal phalanx: a patch of the tube's own (elliptical, capped) surface,
// lifted 0.4 mm, with a rounded-rectangle outline. o: joint, q: segment frame, x0..x1 along it, cap from xc
function nailGeometry(o, q, w, h, x0, x1, xc, tip) {
  const pos = [], ind = [], nx = 10, ny = 8, v = new THREE.Vector3();
  for (let i = 0; i <= nx; i++) {
    const t = (2 * i) / nx - 1, x = x0 + ((x1 - x0) * i) / nx;
    const span = 0.95 * Math.pow(1 - Math.pow(Math.abs(t), 4), 0.25) + 0.05, sc = x > xc ? Math.sqrt(Math.max(0.04, 1 - ((x - xc) / tip) ** 2)) : 1;
    for (let j = 0; j <= ny; j++) {
      const th = span * 0.95 * ((2 * j) / ny - 1);
      v.set(x, Math.cos(th) * (h * sc + 0.0004), Math.sin(th) * (w * sc + 0.0004)).applyQuaternion(q).add(o);
      pos.push(v.x, v.y, v.z);
    }
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const a = i * (ny + 1) + j, b = a + ny + 1;
    ind.push(a, a + 1, b, b, a + 1, b + 1);
  }
  // nail colour toward the free edge; nearer the cuticle the nail bed's skin shows through the plate
  const n = pos.length / 3, col = [], uv = [], nc = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const f = Math.floor(i / (ny + 1)) / nx;
    nc.copy(SKIN_BACK).lerp(NAIL, 0.45 + 0.55 * Math.pow(f, 1.4));
    col.push(nc.r, nc.g, nc.b); uv.push(0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ind);
  g.computeVertexNormals();
  return g;
}

/**
 * The holding hand. Fingers come from forward kinematics. The thumb is solved
 * (two-bone IK) so its pad presses the leaf against the radial side of the
 * curled index finger's middle phalanx. Returns the skin mesh (nails merged in,
 * as hands.js does), the sleeve mesh, and the grip frame (leaf mid-plane at the
 * thumb pad, x along the leaf toward its free end, z the leaf face normal toward
 * the thumb) in hand space. Vertex colours are linear albedo (material colour white).
 */
function buildHand(T, materials) {
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  const qa = (axis, a) => new THREE.Quaternion().setFromAxisAngle(axis, a);
  const frame = (x, y) => {
    const xx = x.clone().normalize(), yy = y.clone().addScaledVector(xx, -y.dot(xx)).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xx, yy, new THREE.Vector3().crossVectors(xx, yy)));
  };
  const geos = [];
  const chains = FINGERS.map((f) => {
    let q = qa(Y, -f.abd), p = new THREE.Vector3(...f.mcp);
    const pts = [p.clone()], qs = [];
    for (let i = 0; i < 3; i++) {
      q = q.clone().multiply(qa(Z, -f.flex[i])); qs.push(q);
      p = p.clone().addScaledVector(X.clone().applyQuaternion(q), f.len[i]); pts.push(p);
    }
    return { f, pts, qs };
  });
  const node = (p, q, w, t, hr = 0.88, k = 0) => ({ p, q, w, h: w * hr, t, k });
  chains.forEach(({ f, pts, qs }) => {
    const ax = (i) => X.clone().applyQuaternion(qs[i]);
    const mid = (i, k) => pts[i].clone().lerp(pts[i + 1], k);
    const tipLen = f.w[3] * 0.95;
    geos.push(sweep([
      node(pts[0].clone().addScaledVector(ax(0), -0.024), qs[0], f.w[0] * 1.08, 0.0),
      node(pts[0], qs[0], f.w[0], 0.45, 0.88, 0.7),
      node(mid(0, 0.5), qs[0], (f.w[0] + f.w[1]) * 0.47, 0.08),
      node(pts[1], qs[0].clone().slerp(qs[1], 0.5), f.w[1] * 1.04, 0.5, 0.88, 1),
      node(mid(1, 0.5), qs[1], (f.w[1] + f.w[2]) * 0.475, 0.1),
      node(pts[2], qs[1].clone().slerp(qs[2], 0.5), f.w[2] * 1.03, 0.42, 0.88, 0.9),
      node(pts[2].clone().addScaledVector(ax(2), f.len[2] * 0.45), qs[2], f.w[2] * 0.98, 0.3),
      node(pts[3].clone().addScaledVector(ax(2), -tipLen), qs[2], f.w[3], 0.6),
    ], { tip: tipLen }));
    geos.push(nailGeometry(pts[2], qs[2], f.w[3], f.w[3] * 0.88, f.len[2] * 0.42, f.len[2] - tipLen * 0.25, f.len[2] - tipLen, tipLen));
  });

  // contact: the leaf's back face on the radial side of the index middle phalanx
  const ix = chains[0], n = Z.clone().applyQuaternion(ix.qs[1]), aMid = X.clone().applyQuaternion(ix.qs[1]);
  const C = ix.pts[1].clone().lerp(ix.pts[2], 0.5).addScaledVector(n, ix.f.w[1] * 0.95);
  const aT = aMid.clone().applyAxisAngle(n, THUMB.twist).normalize();
  const padH = THUMB.w[3] * 0.82 * 0.84;
  const pad = C.clone().addScaledVector(n, T + padH * 0.88);
  const ip = pad.clone().addScaledVector(aT, -0.55 * THUMB.len[2]);
  const A = new THREE.Vector3(...THUMB.cmc), u = ip.clone().sub(A), a = THUMB.len[0], b = THUMB.len[1];
  const reach = u.length(), d = Math.min(reach, a + b - 1e-4);
  u.normalize();
  const hint = n.clone().multiplyScalar(0.6).addScaledVector(Z, 0.4).addScaledVector(X, -0.3);
  const wv = hint.addScaledVector(u, -hint.dot(u)).normalize();
  const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const mcp = A.clone().addScaledVector(u, a * cosA).addScaledVector(wv, a * Math.sqrt(1 - cosA * cosA));
  const ipR = A.clone().addScaledVector(u, d);
  const qM = frame(mcp.clone().sub(A), n), qP = frame(ipR.clone().sub(mcp), n), qD = frame(aT, n);
  const tw = THUMB.w, tTip = tw[4] * 0.9, tEnd = ipR.clone().addScaledVector(aT, THUMB.len[2] - tTip);
  geos.push(sweep([
    node(A.clone().addScaledVector(mcp.clone().sub(A).normalize(), -0.012), qM, tw[0] * 1.02, 0.0, 0.8),
    node(A.clone().lerp(mcp, 0.45), qM, tw[0], 0.05, 0.8),
    node(mcp, qM.clone().slerp(qP, 0.5), tw[1], 0.4, 0.82, 0.8),
    node(mcp.clone().lerp(ipR, 0.5), qP, tw[2], 0.1, 0.82),
    node(ipR, qP.clone().slerp(qD, 0.5), tw[2] * 1.02, 0.4, 0.82, 1),
    node(ipR.clone().addScaledVector(aT, THUMB.len[2] * 0.5), qD, tw[3], 0.3, 0.82),
    node(tEnd, qD, tw[4], 0.55, 0.8),
  ], { tip: tTip, flat: 0.84 }));
  geos.push(nailGeometry(ipR, qD, tw[4], tw[4] * 0.8, THUMB.len[2] * 0.4, THUMB.len[2] - tTip * 0.25, THUMB.len[2] - tTip, tTip));

  // palm and wrist (one flattened tube along X), sleeve over the forearm
  const I = new THREE.Quaternion();
  const pn = (x, y, z, w, h, t) => ({ p: new THREE.Vector3(x, y, z), q: I, w, h, t });
  geos.push(sweep([
    pn(-0.17, -0.004, 0.0, 0.031, 0.026, 0), pn(-0.08, -0.002, 0.0, 0.028, 0.021, 0),
    pn(-0.012, 0.0, 0.0, 0.0285, 0.0168, 0), pn(0.028, 0.0, -0.002, 0.0355, 0.0165, 0.04),
    pn(0.062, 0.001, -0.004, 0.0412, 0.0158, 0.08), pn(0.086, 0.001, -0.005, 0.0405, 0.0138, 0.2),
  ], { tip: 0.011, rad: 32 }));
  // one draw for skin + nails (one material, nail colour in the vertex colours, as hands.js), one for the sleeve
  const merged = BufferGeometryUtils.mergeBufferGeometries(geos);
  geos.forEach((x) => x.dispose());
  const group = new THREE.Group();
  const skin = new THREE.Mesh(merged, materials.skin);
  // the silk sleeve, its open end at the wrist side with a narrow cream cuff; it runs out of the frame
  const sleeve = new THREE.Mesh(sweep([
    pn(-0.052, -0.002, 0, 0.0405, 0.035, 0), pn(-0.06, -0.002, 0, 0.0425, 0.0372, 0),
    pn(-0.11, -0.004, 0, 0.0435, 0.038, 0), pn(-0.26, -0.008, 0, 0.049, 0.043, 0), pn(-0.36, -0.01, 0, 0.051, 0.045, 0),
  ], { seg: 6, rad: 28, albedo: (t, k, cy, s) => { const c = s < CUFF_LEN ? CUFF : SILK; return [c.r, c.g, c.b]; } }), materials.sleeve);
  group.add(skin, sleeve);
  [skin.geometry, sleeve.geometry].forEach((g) => { g.userData.albedo = Float32Array.from(g.attributes.color.array); });

  // grip frame in hand space
  const zG = n.clone(), xG = aT.clone().negate();
  const yG = new THREE.Vector3().crossVectors(zG, xG).normalize();
  const gripInHand = new THREE.Matrix4().makeBasis(xG, yG, zG).setPosition(C.clone().addScaledVector(n, T / 2));
  return { group, skin, sleeve, gripInHand, reachError: reach - (a + b) };
}
// vertex colour = albedo / the material's own colour, so the result is the albedo whatever colour the material carries
function tintTo(geo, color) {
  const a = geo.userData.albedo, c = geo.attributes.color;
  if (!a) return;
  const k = [color.r, color.g, color.b];
  for (let i = 0; i < a.length; i++) c.array[i] = Math.min(a[i] / Math.max(k[i % 3], 1e-3), 8);
  c.needsUpdate = true;
}

/* ============================================================ */

/**
 * Create the loupe. Add `object` to the camera (the camera must be in the scene graph)
 * and call render() once per frame before the main render.
 * opts: radius (lens radius / shorter viewport side, 0.18), minRadiusPx (CSS px, 95),
 *       glassRadius (m, 0.034; the eye distance follows from it) or distance (fixed m from the eye),
 *       magnification (6, MAG_MIN..MAG_MAX), size ("auto", or a number: the view target's size cap in px,
 *       256–1024; the target follows the lens's size on screen up to it),
 *       follow (spring rad/s, 13), sway (1), finish ("brass" | "steel"), hand (true), handLook (true: borrow
 *       the study hands' materials when present), aperture (depth-of-field strength, 0.45),
 *       reflections (glass reflection strength, 0.8), light (key light; auto-picked if omitted),
 *       targets (meshes or () => meshes for focus; nearby meshes and skinned hands if omitted), reach (m, 1.2),
 *       encoding / frameTarget (the main frame's target encoding), layers (view layer mask; default: the
 *       loupe's own lens layer), maxFps (cap the view's update rate)
 */
export function createLoupe(renderer, scene, camera, opts = {}) {
  const glassR = opts.glassRadius ?? 0.034, reach = opts.reach ?? 1.2;
  let dist = opts.distance ?? 0.25;
  let radius = opts.radius ?? 0.18;
  const minRadiusPx = opts.minRadiusPx ?? 95;
  let magTarget = THREE.MathUtils.clamp(opts.magnification ?? 6, MAG_MIN, MAG_MAX), mag = magTarget;
  let sizeOpt = opts.size;
  const follow = opts.follow ?? 13, sway = opts.sway ?? 1, aperture = opts.aperture ?? 0.45;
  const K = -0.04;                                // pincushion (shader + view fov margin)
  const steel = opts.finish === "steel";
  let mode = "scene";

  const object = new THREE.Group();
  object.name = "loupe";
  object.visible = false;
  const holder = new THREE.Group();               // on the ray, facing the eye, scaled to the glass radius
  const body = new THREE.Group();                 // leans / raises inside the holder
  holder.add(body); object.add(holder);

  /* ---- glass ---- */
  const uniforms = {
    tView: { value: null }, tDepth: { value: null }, uSRGB: { value: 1 }, uK: { value: K }, uCA: { value: 0.012 },
    uCurv: { value: 0.38 }, uCenterPx: { value: new THREE.Vector2() }, uRadiusPx: { value: 100 },
    uNear: { value: 0.01 }, uFar: { value: 100 }, uFocus: { value: 0.05 }, uDof: { value: 0 }, uTexels: { value: 192 },
    uBaseLod: { value: 0 }, uMaxLod: { value: 6 }, uDefocus: { value: 0 }, uImage: { value: 0 },
    envMap: { value: null }, uEnvI: { value: opts.reflections ?? 0.8 }, flipEnvMap: { value: -1 }, envMapIntensity: { value: 1 }, maxMipLevel: { value: 0 },
    uLightPos: { value: new THREE.Vector3(0, 1, 0) }, uLightDir: { value: 1 }, uLightCol: { value: new THREE.Color(0, 0, 0) },
  };
  const glassMat = new THREE.ShaderMaterial({
    uniforms, vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG,
    toneMapped: false, transparent: true, depthWrite: true, fog: false,
  });
  const glass = new THREE.Mesh(new THREE.CircleGeometry(1, 128), glassMat);
  glass.position.z = GLASS_Z;

  /* ---- bezel (engraved with the power), lug, rivet + washer, lacquered case leaf ---- */
  const turned = brushTexture(9721), brushed = brushTexture(311);
  brushed.repeat.set(1, 0.35);
  const metal = squeezeMaterial(new THREE.MeshStandardMaterial({
    color: steel ? 0x9a9b9e : 0xb3853d, metalness: 1, roughness: steel ? 0.34 : 0.4, roughnessMap: turned,
  }));
  const leafMat = squeezeMaterial(new THREE.MeshPhysicalMaterial({
    color: 0x040302, metalness: 0, roughness: 0.42, roughnessMap: brushed, clearcoat: 1, clearcoatRoughness: 0.12,
  }));
  const pinMat = squeezeMaterial(new THREE.MeshStandardMaterial({ color: 0x8e8b86, metalness: 1, roughness: 0.28 }));

  const bezel = new THREE.Mesh(bezelGeometry(), metal);
  const rCanvas = readoutCanvas();
  const rTex = rCanvas ? new THREE.CanvasTexture(rCanvas) : null;
  if (rTex) { rTex.encoding = THREE.sRGBEncoding; rTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); }
  const readMat = squeezeMaterial(new THREE.MeshStandardMaterial({ map: rTex, transparent: true, roughness: 0.55, metalness: 0, depthWrite: false }));
  const readout = new THREE.Mesh(readoutGeometry(), readMat);
  readout.visible = !!rTex;
  let readVal = -1;
  const showMag = (m) => {
    const v = Math.round(m * 2) / 2;
    if (!rTex || v === readVal) return;
    readVal = v; drawReadout(rCanvas, v); rTex.needsUpdate = true;
  };
  showMag(mag);
  const rp = RO + 0.22;                           // hinge at the lower right
  const piv = new THREE.Vector3(Math.cos(HINGE) * rp, Math.sin(HINGE) * rp, 0);
  const lug = new THREE.Mesh(armGeometry(rp - RO + 0.12, 0.2, 0.17, 0.14), metal);   // z −0.125 … 0.065
  lug.position.set(Math.cos(HINGE) * (RO - 0.12), Math.sin(HINGE) * (RO - 0.12), -0.1);
  lug.rotation.z = HINGE;
  // a through-pin with domed heads on both faces, and a washer between lug and leaf
  const rivet = new THREE.Mesh(latheZ([[0, -0.34], [0.07, -0.336], [0.11, -0.324], [0.125, -0.31], [0.12, -0.3], [0.06, -0.3],
    [0.06, 0.065], [0.12, 0.065], [0.13, 0.077], [0.115, 0.095], [0.07, 0.107], [0, 0.111]], 40), pinMat);
  rivet.position.copy(piv);
  const washer = new THREE.Mesh(latheZ([[0.13, -0.15], [0.205, -0.15], [0.205, -0.15], [0.205, -0.125], [0.205, -0.125], [0.13, -0.125], [0.13, -0.125], [0.13, -0.15]], 48), metal);
  washer.position.copy(piv);
  const leafPivot = new THREE.Group();            // the case leaf, swung open about the rivet
  leafPivot.position.copy(piv);
  leafPivot.rotation.z = HINGE + OPEN;
  const leaf = new THREE.Mesh(armGeometry(1.2, 0.27, 0.21, 0.1), leafMat);   // z −0.3 … −0.15
  leaf.position.z = LEAF_Z;
  const grip = new THREE.Object3D();              // leaf mid-plane under the thumb pad
  grip.position.set(GRIP_X, 0, LEAF_MID);
  leafPivot.add(leaf, grip);
  body.add(glass, bezel, readout, lug, rivet, washer, leafPivot);

  /* ---- the hand: the visitor's right hand ---- */
  // fallback look (no study hands in the scene): hands.js's skin and silk rebuilt from the same values
  const ownSkin = squeezeMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.56, metalness: 0, envMapIntensity: 0.35 }),
    (sh) => {
      const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
      if (!chunk.includes(WRAP_LINE)) console.warn("[loupe] wrap-lighting target missing");
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vBind;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBind = position;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
          varying vec3 vBind;
          float hh(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
          float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(hh(i), hh(i + vec3(1,0,0)), f.x), mix(hh(i + vec3(0,1,0)), hh(i + vec3(1,1,0)), f.x), f.y),
                       mix(mix(hh(i + vec3(0,0,1)), hh(i + vec3(1,0,1)), f.x), mix(hh(i + vec3(0,1,1)), hh(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
        .replace("#include <color_fragment>", "#include <color_fragment>\n diffuseColor.rgb *= 0.96 + 0.06 * vn(vBind * 260.0);")
        .replace("#include <lights_physical_pars_fragment>", chunk.replace(WRAP_LINE, SKIN_WRAP));
    });
  ownSkin.extensions = { derivatives: true };
  const ownSilk = squeezeMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0, envMapIntensity: 0.35, side: THREE.DoubleSide }));
  const handScale = new THREE.Group(), handPose = new THREE.Group();
  let builtHand = null;
  if (opts.hand !== false) {
    builtHand = buildHand(LEAF_T * glassR, { skin: ownSkin, sleeve: ownSilk });
    handPose.matrixAutoUpdate = false;
    handPose.matrix.copy(builtHand.gripInHand).invert();
    handPose.add(builtHand.group);
    handScale.add(handPose); grip.add(handScale);
  }
  // borrow the study hands' own skin and silk (hands.js "hand-right"): then the two hands are one body
  let adopted = null;
  function adoptHandLook() {
    if (!builtHand || opts.handLook === false) return false;
    const rg = scene.getObjectByName("hand-right");
    let sk = null;
    if (rg) rg.traverse((o) => { if (!sk && o.isSkinnedMesh) sk = o; });
    const srcSkin = sk && (Array.isArray(sk.material) ? sk.material[0] : sk.material);
    let srcSilk = null;
    if (sk) sk.traverse((o) => {
      if (srcSilk || o === sk || !o.isMesh || o.isSkinnedMesh) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (m && m !== srcSkin && m.vertexColors && m.isMeshStandardMaterial) srcSilk = m;
    });
    if (!srcSkin || !srcSkin.isMeshStandardMaterial) return false;
    if (adopted && adopted.srcSkin === srcSkin && adopted.srcSilk === srcSilk) return true;
    if (adopted) { adopted.skin.dispose(); if (adopted.silk) adopted.silk.dispose(); }
    const skin = squeezedCopy(srcSkin), silk = srcSilk ? squeezedCopy(srcSilk) : null;
    adopted = { srcSkin, srcSilk, skin, silk };
    builtHand.skin.material = skin; tintTo(builtHand.skin.geometry, skin.color);
    if (silk) { builtHand.sleeve.material = silk; tintTo(builtHand.sleeve.geometry, silk.color); }
    return true;
  }

  const parts = [];
  object.traverse((o) => { if (o.isMesh) parts.push(o); });
  const shadowParts = new Set([bezel, lug, rivet, washer, leaf]);
  if (builtHand) { shadowParts.add(builtHand.skin); shadowParts.add(builtHand.sleeve); }
  const view = new THREE.PerspectiveCamera(10, 1, 0.05, 100);
  const overlayCam = new THREE.PerspectiveCamera();
  overlayCam.matrixAutoUpdate = false;
  overlayCam.layers.set(OVERLAY_LAYER);
  let held = null;                                // an external hand's meshes while they hold the leaf (setHeld)
  let advancing = false;
  const partHook = (m) => {
    m.userData.loupePart = true;
    m.layers.enable(OVERLAY_LAYER);
    m.onBeforeRender = (r, s, cam, geo, mat) => {
      let draw;
      if (cam === overlayCam) draw = true;
      else if (cam === camera || cam.userData.loupeDebug) {
        if (!advancing) advance(frameTime());     // keeps lowering even when render() is no longer called
        draw = mode === "scene" && !mat.isMeshNormalMaterial;
      } else draw = false;                        // the lens view, probes, reflections
      if (!draw) { geo.userData.loupeDr = geo.drawRange.count; geo.drawRange.count = 0; }
    };
    m.onAfterRender = (r, s, cam, geo) => {
      if (geo.userData.loupeDr !== undefined) { geo.drawRange.count = geo.userData.loupeDr; delete geo.userData.loupeDr; }
    };
  };
  parts.forEach((m, i) => {
    m.renderOrder = 1000 + i;
    m.castShadow = shadowParts.has(m);
    m.receiveShadow = m !== glass;
    partHook(m);
  });
  // the glass is never culled: its onBeforeRender keeps the pose moving while the loupe is lowered
  // (parts are culled normally, so they stay out of shadow maps whose frustum they are not in)
  glass.frustumCulled = false;
  glass.renderOrder = 1000 + parts.length;        // glass last: it reads nothing behind it, but sorts above the rim
  readout.renderOrder = 1000 + parts.length - 1;  // the engraving after the bezel it sits on
  // two empty-draw sentinels on the lens layer: the view's transparent list always has 2+ entries, so
  // r128 always calls the transparent sort (lensSort) between building the lists and the shadow pass
  const sentGeo = new THREE.BufferGeometry();
  sentGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  sentGeo.setDrawRange(0, 0);
  const sentMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false });
  for (let i = 0; i < 2; i++) {
    const s = new THREE.Mesh(sentGeo, sentMat);
    s.frustumCulled = false; s.layers.set(LENS_LAYER); s.name = "loupe-sentinel";
    object.add(s);
  }
  let widen = null;                               // the main camera's layers, for this view's shadow pass
  const lensSort = (a, b) => {
    if (widen !== null) { view.layers.mask = widen; widen = null; }
    if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
    if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
    if (a.z !== b.z) return b.z - a.z;
    return a.id - b.id;
  };

  /* ---- the view target ---- */
  let rt = null;
  const frameEncoding = () => opts.encoding ?? (opts.frameTarget ? (opts.frameTarget()?.texture.encoding ?? renderer.outputEncoding) : renderer.outputEncoding);
  const ensureTarget = (size, enc) => {
    if (rt && rt.width === size && rt.texture.encoding === enc) return;
    if (rt) { rt.depthTexture.dispose(); rt.dispose(); }
    const lin = enc !== THREE.sRGBEncoding;
    rt = new THREE.WebGLRenderTarget(size, size, {
      type: lin ? THREE.HalfFloatType : THREE.UnsignedByteType, format: THREE.RGBAFormat, encoding: enc,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true,
      depthBuffer: true, stencilBuffer: false,
    });
    rt.depthTexture = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
    uniforms.tView.value = rt.texture; uniforms.tDepth.value = rt.depthTexture;
    uniforms.uSRGB.value = lin ? 0 : 1;
  };

  /* ---- state ---- */
  let active = false, snapped = false, lastAdv = 0, t = 0, renders = 0, lastRender = -1e9, lastValid = -1e9, frameNo = 0;
  let manualFocus = null, keyLight = opts.light || null, lights = [], targets = [], skinTargets = [], lastScan = -1e9;
  let lensSet = new Set(), lensRoots = [], releaseTimer = 0;
  const p = { x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, tx: 0, ty: 0 };
  const lift = { x: 0, v: 0 }, focus = { x: 0.45, v: 0 };
  let R = 0.03, rPx = 100, nearest = Infinity;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), eye = new THREE.Vector3(), dir = new THREE.Vector3();
  const gpos = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), inv = new THREE.Matrix4();
  const vp = new THREE.Vector4(), sc = new THREE.Vector4(), cc = new THREE.Color(), dbs = new THREE.Vector2();
  const ORIGIN = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), sphere = new THREE.Sphere();
  const lo = new THREE.Vector3(), ld = new THREE.Vector3(), rd = new THREE.Vector3();
  const sig = [], sigPrev = [];

  function frameTime() { return (typeof document !== "undefined" && document.timeline && document.timeline.currentTime) || performance.now(); }
  // damped spring (substepped semi-implicit Euler, stable for any dt)
  function spring(s, target, w, z, dt) {
    const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
    for (let i = 0; i < n; i++) { s.v += (w * w * (target - s.x) - 2 * z * w * s.v) * h; s.x += s.v * h; }
  }

  const renderable = (o) => o.isMesh || o.isPoints || o.isLine || o.isSprite;
  const isHeld = (o) => held && held.set.has(o);
  // what the lens can see and focus on: everything within reach of the eye (not the room-sized hall batches)
  function scan() {
    lights = [];
    const list = [], skins = [], lens = [], counts = new Map();
    camera.getWorldPosition(eye);
    const count = (x) => { let c = counts.get(x); if (c === undefined) { c = 0; x.traverse(() => { c++; }); counts.set(x, c); } return c; };
    const roots = new Set();
    scene.traverseVisible((o) => {
      if (o.isLight) { lights.push(o); o.layers.enable(OVERLAY_LAYER); o.layers.enable(LENS_LAYER); return; }
      if (!renderable(o) || o.userData.loupePart || isHeld(o)) return;
      let near;
      if (o.isSkinnedMesh) near = o.getWorldPosition(tmp).distanceTo(eye) < reach + 0.5;
      else {
        const g = o.geometry;
        if (!g || !g.attributes || !g.attributes.position) return;
        if (!g.boundingSphere) g.computeBoundingSphere();
        sphere.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
        near = sphere.radius <= 1.5 && sphere.center.distanceTo(eye) - sphere.radius <= reach + 0.3;
        if (near && o.isMesh && !o.isInstancedMesh && sphere.center.distanceTo(eye) - sphere.radius <= reach) {
          const mat = Array.isArray(o.material) ? o.material[0] : o.material;
          if (mat && mat.depthWrite !== false && !mat.transparent) list.push(o);
        }
      }
      if (!near) return;
      lens.push(o);
      if (o.isSkinnedMesh) skins.push(o);
      // the highest small ancestor (≤ 400 objects): its subtree is re-tagged every frame, so things
      // that appear between scans (water drops, a swapped stone) are in the lens at once
      let a = o, top = o;
      while (a.parent && a.parent !== scene) { a = a.parent; if (count(a) <= 400) top = a; }
      roots.add(top);
    });
    if (!opts.targets) { targets = list; skinTargets = skins; }
    lensRoots = [...roots];
    setLensSet(lens);
    targetList().forEach((m) => m.geometry && m.geometry.attributes.position && queueBvh(m.geometry));
    skinTargets.forEach((m) => queueSkinBvh(m.geometry));
  }
  function setLensSet(list) {
    const next = new Set(list);
    for (const o of lensSet) if (!next.has(o)) o.layers.disable(LENS_LAYER);
    for (const o of next) o.layers.enable(LENS_LAYER);
    lensSet = next;
  }
  function tagRoots() {
    for (const r of lensRoots) r.traverse((o) => {
      if (renderable(o) && !o.userData.loupePart && !isHeld(o) && !lensSet.has(o)) { o.layers.enable(LENS_LAYER); lensSet.add(o); }
    });
  }
  const targetList = () => (typeof opts.targets === "function" ? opts.targets() : opts.targets || targets);

  // distance along the ray (unit dir) to the nearest target surface, or Infinity; a target whose
  // BVH is still being built only guards the dolly with its bounding sphere (guard)
  let guard = Infinity;
  function cast(o, d) {
    let best = Infinity;
    for (const m of targetList()) {
      if (!m.visible || !m.geometry) continue;
      if (m.isSkinnedMesh) { best = castSkinned(m, o, d, best); continue; }
      const g = m.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      sphere.copy(g.boundingSphere).applyMatrix4(m.matrixWorld);
      lo.subVectors(sphere.center, o);
      const tc = lo.dot(d), d2 = lo.lengthSq() - tc * tc;
      if (d2 > sphere.radius * sphere.radius || tc + sphere.radius < 0 || tc - sphere.radius > best) continue;
      const b = bvhGet(g);
      if (!b) { queueBvh(g); guard = Math.min(guard, Math.max(0, tc - Math.sqrt(sphere.radius * sphere.radius - d2))); continue; }
      inv.copy(m.matrixWorld).invert();
      lo.copy(o).applyMatrix4(inv);
      ld.copy(o).add(d).applyMatrix4(inv).sub(lo);       // local direction: same parameter t as in world space
      const hit = bvhRay(b, lo.x, lo.y, lo.z, ld.x, ld.y, ld.z, best);
      if (hit < best) best = hit;
    }
    if (!opts.targets) for (const m of skinTargets) if (m.visible && m.parent) best = castSkinned(m, o, d, best);
    return best;
  }
  // a skinned mesh: each bone's triangles (bind space) posed rigidly by that bone this frame
  function castSkinned(m, o, d, best) {
    const sk = SKIN.get(m.geometry);
    if (!sk) { queueSkinBvh(m.geometry); return best; }
    if (!sk.parts || !m.skeleton) return best;
    const bones = m.skeleton.bones, binv = m.skeleton.boneInverses;
    for (const P of sk.parts) {
      const bone = bones[P.bi];
      if (!bone) continue;
      if (P.frame !== frameNo) {
        P.M.multiplyMatrices(m.matrixWorld, m.bindMatrixInverse).multiply(bone.matrixWorld).multiply(binv[P.bi]).multiply(m.bindMatrix);
        P.Mi.copy(P.M).invert(); P.wc.copy(P.c).applyMatrix4(P.M); P.wr = P.r * P.M.getMaxScaleOnAxis(); P.frame = frameNo;
      }
      lo.subVectors(P.wc, o);
      const tc = lo.dot(d), d2 = lo.lengthSq() - tc * tc;
      if (d2 > P.wr * P.wr || tc + P.wr < 0 || tc - P.wr > best) continue;
      lo.copy(o).applyMatrix4(P.Mi);
      ld.copy(o).add(d).applyMatrix4(P.Mi).sub(lo);
      const hit = bvhRay(P.bvh, lo.x, lo.y, lo.z, ld.x, ld.y, ld.z, best);
      if (hit < best) best = hit;
    }
    return best;
  }

  function pickLight() {
    if (opts.light) return opts.light;
    let best = null, score = 0;
    for (const l of lights) {
      if (!l.visible || l.intensity <= 0 || !(l.isSpotLight || l.isPointLight || l.isDirectionalLight)) continue;
      const s = l.isDirectionalLight ? l.intensity * 0.6 : l.intensity / (0.3 + l.getWorldPosition(tmp).distanceTo(eye));
      if (s > score) { score = s; best = l; }
    }
    return best;
  }

  /** forget the scene: focus targets, the lens layer, lights (the lens has been down; a put-back stone can go) */
  function release() {
    clearTimeout(releaseTimer); releaseTimer = 0;
    setLensSet([]); lensRoots = [];
    targets = []; skinTargets = []; lights = []; lastScan = -1e9; nearest = Infinity; guard = Infinity;
    sig.length = 0; sigPrev.length = 0;
    if (!opts.light) keyLight = null;
  }
  function setActive(on) {
    on = !!on;
    if (on && !active) {
      clearTimeout(releaseTimer); releaseTimer = 0;
      adoptHandLook();
      if (lift.x < 0.03) { lift.x = 0; lift.v = 0; p.x = p.tx; p.y = p.ty; p.vx = p.vy = p.ax = p.ay = 0; focus.v = 0; nearest = Infinity; }
      lastScan = -1e9; renders = 0;
    }
    if (!on && active && typeof setTimeout !== "undefined") {
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => { releaseTimer = 0; if (!active) release(); }, 2000 + 400);
    }
    active = on;
    if (on) object.visible = true;
  }
  function setPointer(x, y) {
    p.tx = THREE.MathUtils.clamp(x, -1.2, 1.2); p.ty = THREE.MathUtils.clamp(y, -1.2, 1.2);
    if (!snapped) { p.x = p.tx; p.y = p.ty; snapped = true; }
  }
  function setMagnification(m) { if (isFinite(m)) magTarget = THREE.MathUtils.clamp(m, MAG_MIN, MAG_MAX); }
  function setRadius(r) { radius = THREE.MathUtils.clamp(r, 0.05, 0.45); }
  function setFocus(d) { manualFocus = d == null ? null : Math.max(0.02, d); }
  function setLight(l) { opts.light = l || null; keyLight = l || null; }
  function setTargetSize(s) { sizeOpt = s; }

  /* ---- pose: the hand carries the lens (once per frame, from render() or the main pass) ---- */
  function advance(now) {
    if (Math.abs(now - lastAdv) < 0.5) return;
    advancing = true;
    const dt = lastAdv ? THREE.MathUtils.clamp((now - lastAdv) / 1000, 1 / 240, 0.1) : 1 / 60;
    lastAdv = now; t += dt;
    const vx0 = p.vx, vy0 = p.vy;
    const sx = { x: p.x, v: p.vx }, sy = { x: p.y, v: p.vy };
    spring(sx, p.tx, follow, 0.75, dt); spring(sy, p.ty, follow, 0.75, dt);
    p.x = sx.x; p.vx = sx.v; p.y = sy.x; p.vy = sy.v;
    p.ax += ((p.vx - vx0) / dt - p.ax) * Math.min(1, 25 * dt);
    p.ay += ((p.vy - vy0) / dt - p.ay) * Math.min(1, 25 * dt);
    spring(lift, active ? 1 : 0, active ? 11 : 14, active ? 0.82 : 1, dt);
    if (!active && lift.x < 0.03) { object.visible = false; lift.x = 0; lift.v = 0; uniforms.uImage.value = 0; advancing = false; return; }
    mag += (magTarget - mag) * (1 - Math.exp(-10 * dt));
    showMag(mag);

    // lens size on screen: a fraction of the shorter side, never smaller than a fingertip
    renderer.getDrawingBufferSize(dbs);
    const minSide = Math.min(dbs.x, dbs.y);
    rPx = Math.min(Math.max(radius * minSide, minRadiusPx * renderer.getPixelRatio()), 0.42 * minSide);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / camera.zoom, frac = rPx / (dbs.y / 2);
    // raised from below the frame: lowered, the whole loupe (bezel, lug, the hand under it) is out of view
    const down = THREE.MathUtils.clamp(1 - lift.x, -0.2, 1.2), sw = sway * 0.0054 / mag;
    const yOut = -1 - frac * 1.45 - 0.08;
    const nx = p.x + down * 0.3 + sw * (Math.sin(t * 1.7) + 0.6 * Math.sin(t * 2.9 + 1.3));
    const ny = p.y + (yOut - p.y) * down + sw * (Math.sin(t * 1.3 + 2.1) + 0.6 * Math.sin(t * 3.4));
    const lean = THREE.MathUtils.clamp;
    body.rotation.set(lean(-p.ay * 0.004, -0.14, 0.14) - down * 0.5, lean(p.ax * 0.004, -0.14, 0.14) + down * 0.25,
      lean(-p.vx * 0.05, -0.1, 0.1) - down * 0.3);

    // a real-sized glass (3.4 cm radius) held where it covers rPx: nearer the eye for a bigger lens
    if (opts.distance == null) dist = THREE.MathUtils.clamp(glassR / (tanV * frac), 0.16, 0.42);
    R = dist * tanV * frac;
    dir.set(nx * tanV * camera.aspect, ny * tanV, -1).normalize().multiplyScalar(dist);
    holder.position.copy(dir);
    m4.lookAt(ORIGIN, dir, UP);
    holder.quaternion.setFromRotationMatrix(m4);
    holder.scale.setScalar(R);
    handScale.scale.setScalar(1 / R);
    camera.updateWorldMatrix(true, false);
    object.updateMatrixWorld(true);
    // the glass samples its view by screen position around its centre (world-locked image)
    glass.getWorldPosition(gpos);
    tmp.copy(gpos).project(camera);
    uniforms.uCenterPx.value.set((tmp.x * 0.5 + 0.5) * dbs.x, (tmp.y * 0.5 + 0.5) * dbs.y);
    uniforms.uRadiusPx.value = rPx;
    uniforms.uDefocus.value = Math.max(0, down) * 0.15;
    // the image: a view at most one frame old (render() refreshes it right after this), else none;
    // it fades with the lift, so a lowering lens shows a fresh image going dim, never a stale one
    const ageFrames = (now - lastValid) / Math.max(dt * 1000, 4);
    uniforms.uImage.value = (ageFrames <= 1.5 ? 1 : 0) * imageLift();
    advancing = false;
  }
  const imageLift = () => THREE.MathUtils.smoothstep(lift.x, 0.35, 0.85);

  function render() {
    const now = frameTime();
    advance(now);
    restoreShadows();
    if (!object.visible) return;                   // fully lowered: nothing to show
    if (opts.maxFps && now - lastRender < 1000 / opts.maxFps - 1) { lastValid = now; uniforms.uImage.value = imageLift(); return; }
    frameNo++;
    // one matrix update for this frame (the lens render below skips its own)
    scene.updateMatrixWorld();
    camera.getWorldPosition(eye);
    if (now - lastScan > 700) { scan(); lastScan = now; keyLight = pickLight(); }
    else tagRoots();

    // the ray through the glass centre, and what lies under the lens (stone, fingers, palm)
    glass.getWorldPosition(gpos);
    dir.subVectors(gpos, eye).normalize();
    const tanA = R / dist;
    guard = Infinity;
    let hitC = cast(eye, dir), dmin = hitC;
    camera.getWorldQuaternion(q);
    for (let i = 0; i < 4; i++) {                 // four rays at 70% of the lens radius guard the dolly
      const a = (i + 0.5) * Math.PI / 2;
      rd.set(Math.cos(a) * 0.7 * tanA, Math.sin(a) * 0.7 * tanA, 0).applyQuaternion(holder.quaternion).applyQuaternion(q);
      dmin = Math.min(dmin, cast(eye, rd.add(dir).normalize()));
    }
    nearest = Math.min(dmin, guard, reach);
    const want = manualFocus ?? (isFinite(hitC) ? hitC : isFinite(dmin) ? dmin : focus.x);
    if (renders === 0) { focus.x = want; focus.v = 0; } else spring(focus, want, 22, 0.55, Math.min(0.1, (now - lastRender) / 1000));
    const D = Math.max(focus.x, 0.03), s0 = D / mag;
    // dolly toward the focus plane (true close-up perspective), never into anything under the lens
    const c = THREE.MathUtils.clamp(Math.min(D - s0, nearest - 0.5 * s0), 0, D - s0);
    const s = D - c;
    view.position.copy(eye).addScaledVector(dir, c);
    view.quaternion.copy(q).multiply(holder.quaternion);
    view.fov = THREE.MathUtils.radToDeg(2 * Math.atan((D * tanA) / (mag * s)));
    view.near = THREE.MathUtils.clamp(0.5 * (nearest - c), 0.002, camera.near);
    view.far = camera.far;
    view.layers.mask = opts.layers ?? (1 << LENS_LAYER);
    view.updateProjectionMatrix();
    view.updateMatrixWorld();

    // target sized to the lens on screen, ~1.3 texels per pixel (mips feed the depth-of-field blur), up to the cap
    const cap = typeof sizeOpt === "number" ? THREE.MathUtils.clamp(sizeOpt | 0, 256, 1024) : 1024;
    const size = THREE.MathUtils.clamp(Math.ceil((2 * rPx * 1.3) / 32) * 32, 256, cap);
    ensureTarget(size, frameEncoding());
    uniforms.uNear.value = view.near; uniforms.uFar.value = view.far; uniforms.uFocus.value = s;
    uniforms.uDof.value = 0.13 * aperture * (s * mag) * (s * mag);
    uniforms.uTexels.value = size / 2;
    uniforms.uBaseLod.value = Math.log2(size / (2 * rPx));
    uniforms.uMaxLod.value = Math.log2(size) - 2.5;

    // the key lamp, mirrored in the glass
    keyLight = keyLight || pickLight();
    if (keyLight) {
      const L = keyLight;
      if (L.isDirectionalLight) {
        tmp.setFromMatrixPosition(L.matrixWorld).sub(tmp2.setFromMatrixPosition(L.target.matrixWorld)).transformDirection(camera.matrixWorldInverse);
        uniforms.uLightDir.value = 1;
      } else { tmp.setFromMatrixPosition(L.matrixWorld).applyMatrix4(camera.matrixWorldInverse); uniforms.uLightDir.value = 0; }
      uniforms.uLightPos.value.copy(tmp);
      let k = Math.min(L.intensity, 3) * 0.9;
      if (L.isSpotLight) {
        tmp.setFromMatrixPosition(L.target.matrixWorld).sub(tmp2.setFromMatrixPosition(L.matrixWorld)).normalize();
        const cosT = tmp.dot(tmp2.subVectors(gpos, tmp2).normalize());
        k *= 0.3 + 0.7 * THREE.MathUtils.smoothstep(cosT, Math.cos(L.angle), Math.cos(L.angle * (1 - L.penumbra * 0.5)));
      }
      uniforms.uLightCol.value.copy(L.color).multiplyScalar(k);
    } else uniforms.uLightCol.value.setRGB(0, 0, 0);
    const env = scene.environment || null;
    if (glassMat.envMap !== env) { glassMat.envMap = env; uniforms.envMap.value = env; glassMat.needsUpdate = true; }

    // nothing changed (explicit targets only: otherwise the scene may have moved)
    if (opts.targets) {
      sig.length = 0;
      sig.push(...view.matrixWorld.elements, view.fov, view.near, uniforms.uDof.value, s);
      if (keyLight) sig.push(...keyLight.matrixWorld.elements, keyLight.intensity);
      for (const m of targetList()) sig.push(...m.matrixWorld.elements);
      if (renders > 0 && sig.length === sigPrev.length && sig.every((v, i) => Math.abs(v - sigPrev[i]) < 1e-7)) { lastValid = now; uniforms.uImage.value = imageLift(); return; }
      sigPrev.length = 0; sigPrev.push(...sig);
    }

    // render without disturbing the caller's renderer state
    const prevRT = renderer.getRenderTarget();
    renderer.getViewport(vp); renderer.getScissor(sc);
    const scTest = renderer.getScissorTest(), autoClear = renderer.autoClear;
    renderer.getClearColor(cc); const ca = renderer.getClearAlpha();
    const sm = renderer.shadowMap, smAuto = sm.autoUpdate, smNeeds = sm.needsUpdate;
    // This view draws only the lens layer, but the shadow maps it refreshes (the first render of the
    // frame) must hold every caster the main frame needs. r128 tests shadow casters against the
    // rendering camera's layers after the draw lists are built and sorted, so the transparent sort
    // (always called: two empty-draw sentinels sit in the lens list) widens the view's layers to the
    // main camera's for the shadow pass. The main render then reuses the maps (restored after this task).
    const lensMask = opts.layers ?? (1 << LENS_LAYER), mainMask = camera.layers.mask;
    const wantShadows = sm.enabled && (smAuto || smNeeds);
    view.layers.mask = lensMask;
    widen = lensMask === mainMask ? null : mainMask;
    if (!wantShadows) { sm.autoUpdate = false; sm.needsUpdate = false; }
    const sceneAuto = scene.autoUpdate;
    scene.autoUpdate = false;                     // updated above, once
    renderer.autoClear = true;
    renderer.setTransparentSort(lensSort);
    renderer.setRenderTarget(rt);
    renderer.render(scene, view);
    renderer.setTransparentSort(null);
    const widened = widen === null;
    widen = null; view.layers.mask = lensMask;
    scene.autoUpdate = sceneAuto;
    renderer.setRenderTarget(prevRT);
    renderer.setViewport(vp); renderer.setScissor(sc); renderer.setScissorTest(scTest);
    renderer.setClearColor(cc, ca); renderer.autoClear = autoClear;
    if (wantShadows && widened) {
      // the maps are current for this frame: the main render reuses them
      sm.autoUpdate = false; sm.needsUpdate = false; shadowHold = smAuto;
      Promise.resolve().then(restoreShadows);
    } else if (wantShadows) { sm.autoUpdate = smAuto; sm.needsUpdate = true; }   // (never expected) let the main frame redo them
    else { sm.autoUpdate = smAuto; sm.needsUpdate = smNeeds; }
    renders++; lastRender = now; lastValid = now;
    uniforms.uImage.value = imageLift();
  }
  let shadowHold = null;
  function restoreShadows() { if (shadowHold !== null) { renderer.shadowMap.autoUpdate = shadowHold; shadowHold = null; } }

  /* ---- overlay compositing (PostFX.setLoupe / createLoupePass / direct path) ---- */
  let overlayLights = false;
  function setComposite(m) {                      // cheap: PostFX switches it every frame
    mode = m === "overlay" ? "overlay" : "scene";
    if (mode === "overlay" && !overlayLights) { overlayLights = true; scene.traverse((o) => { if (o.isLight) o.layers.enable(OVERLAY_LAYER); }); }
  }
  function renderOverlay(target = null) {
    if (mode !== "overlay" || !object.visible) return;
    advance(frameTime());
    if (!object.visible) return;
    overlayCam.projectionMatrix.copy(camera.projectionMatrix);
    overlayCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    overlayCam.matrix.copy(camera.matrixWorld); overlayCam.matrixWorld.copy(camera.matrixWorld);
    overlayCam.matrixWorldInverse.copy(camera.matrixWorldInverse);
    const prevRT = renderer.getRenderTarget(), autoClear = renderer.autoClear, bg = scene.background, ov = scene.overrideMaterial;
    const sm = renderer.shadowMap, smAuto = sm.autoUpdate, smNeeds = sm.needsUpdate;
    sm.autoUpdate = false; sm.needsUpdate = false;
    scene.background = null; scene.overrideMaterial = null; renderer.autoClear = false;
    renderer.setRenderTarget(target);
    renderer.clearDepth();
    renderer.render(scene, overlayCam);
    renderer.setRenderTarget(prevRT);
    scene.background = bg; scene.overrideMaterial = ov; renderer.autoClear = autoClear;
    sm.autoUpdate = smAuto; sm.needsUpdate = smNeeds;
  }

  /* ---- an external hand rig taking hold of the leaf ---- */
  function gripMatrix(target = new THREE.Matrix4()) {
    object.updateMatrixWorld(true);
    grip.matrixWorld.decompose(tmp, q, tmp2);
    return target.compose(tmp, q, tmp2.set(1, 1, 1));
  }
  function setHeld(meshes) {
    if (held) held.list.forEach((h) => {
      h.m.material = h.mat; h.m.layers.mask = h.layers; h.m.renderOrder = h.order;
      h.m.onBeforeRender = h.ob; h.m.onAfterRender = h.oa; delete h.m.userData.loupePart; h.cl.dispose();
    });
    held = null;
    handScale.visible = !(meshes && meshes.length);
    if (!meshes || !meshes.length) return;
    held = { list: [], set: new Set(meshes) };
    meshes.forEach((m) => {
      const cl = squeezedCopy(m.material, { skinning: true });   // keeps the source's shader hooks and uniforms
      held.list.push({ m, mat: m.material, cl, layers: m.layers.mask, order: m.renderOrder, ob: m.onBeforeRender, oa: m.onAfterRender });
      m.material = cl; m.renderOrder = 999;
      partHook(m);
    });
  }

  function dispose() {
    clearTimeout(releaseTimer);
    release();
    setHeld(null);
    if (object.parent) object.parent.remove(object);
    if (rt) { rt.depthTexture.dispose(); rt.dispose(); }
    parts.forEach((m) => m.geometry.dispose());
    [glassMat, metal, leafMat, pinMat, readMat, ownSkin, ownSilk, sentMat].forEach((m) => m.dispose());
    sentGeo.dispose();
    if (adopted) { adopted.skin.dispose(); if (adopted.silk) adopted.silk.dispose(); }
    turned.dispose(); brushed.dispose(); if (rTex) rTex.dispose();
  }

  // precompile the loupe's programs once the caller has attached it (no hitch on the first raise)
  Promise.resolve().then(() => {
    let o = object; while (o.parent) o = o.parent;
    if (o !== scene) return;
    adoptHandLook();
    const vis = object.visible; object.visible = true;
    glassMat.envMap = uniforms.envMap.value = scene.environment || null;
    try { renderer.compile(scene, camera); } catch (e) { /* compile is an optimisation only */ }
    object.visible = vis;
  });

  const api = {
    object, setActive, setPointer, setMagnification, render, dispose,
    // extras
    setRadius, setFocus, setLight, setComposite, renderOverlay, gripMatrix, setHeld, grip, release, setTargetSize,
    /** build the focus BVH for a geometry now, in idle time slices (e.g. a close-up mesh the visitor will inspect) */
    prewarm(geo) { if (geo && geo.attributes && geo.attributes.position) queueBvh(geo); },
    get magnification() { return mag; }, get magnificationTarget() { return magTarget; },
    get focusDistance() { return focus.x; }, get active() { return active; },
    /** 0 = lowered out of view … 1 = raised (the hand's lift; it springs, ~0.3 s) */
    get lift() { return lift.x; },
    get handReachError() { return builtHand ? builtHand.reachError : 0; },
    _debug: {
      uniforms, view, get rt() { return rt; }, get targets() { return targetList(); }, get skinTargets() { return skinTargets; },
      get nearest() { return nearest; }, get lensSet() { return lensSet; }, get adopted() { return !!adopted; }, get hand() { return builtHand; },
    },
  };
  Object.defineProperty(object, "loupe", { value: api });   // back-reference for hosts (not in userData: clone() JSON-copies that)
  return api;
}

/** EffectComposer pass that draws the loupe after the scene passes (insert after Bokeh/SSAO, before SMAA/grade). */
export function createLoupePass(loupe) {
  loupe.setComposite("overlay");
  const pass = new Pass();
  pass.needsSwap = false;
  pass.render = (renderer, writeBuffer, readBuffer) => loupe.renderOverlay(pass.renderToScreen ? null : readBuffer);
  return pass;
}
