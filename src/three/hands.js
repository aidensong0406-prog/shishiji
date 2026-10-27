import * as THREE from "three";
import { BufferGeometryUtils } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mkCanvas } from "./textures.js";
import { normalFromCanvas } from "../utils/surfaceMaps.js";
import { inject, skinLightsChunk } from "./skinShader.js";

/* ==========================================================================
   The visitor's own hands, for the close study of a stone.

   Both hands are held palm-up. The LEFT cradles the stone; the RIGHT carries
   a small oil-lamp dish (or a candle in a holder) on its open palm, the way a
   lamp is carried — so the flame sits just above the right fingers.

   Each hand is ONE rigidly-skinned mesh (palm, forearm, 15 finger/thumb
   segments and nails, each piece bound to its own bone): one draw call, and
   each joint still bends. Fingers curl until they meet the stone's actual
   surface (a support-function search over the stone's vertex sample), through
   a critically damped spring, so the grip follows the stone as it turns
   without pumping or sinking in. Each arm is a two-bone chain (wrist, elbow,
   shoulder) whose elbow drops toward the body, so the arms leave the frame
   at the bottom the way your own do, and never sweep across the stone; the
   robe sleeve rides on the forearm and the upper arm.

   Skin: MeshStandardMaterial with vertex colours (paler, pinker palms; nails),
   wrap lighting with a reddish terminator (light scattering under skin), and
   a near-field glow from the flame — no extra light, so no shader recompiles
   in the hall. Anything under the RIGHT hand casts no shadow (it sits at the
   lamp itself and would black out its own light).

   Frames (both hand groups): origin = the anchor the caller places,
   +Y up, -Z away from the viewer. left: origin = palm surface centre where the
   stone rests. right: origin = the flame (right.userData.lampAnchor).
   ========================================================================== */

const SKIN_BACK = new THREE.Color(0xa8573a);   // linear (r128 hex): warm skin, backs
const SKIN_PALM = new THREE.Color(0xc06c4f);   // paler, pinker palms
const NAIL = new THREE.Color(0xd8a698);
const SILK = new THREE.Color(0x020a10);        // deep indigo-teal robe (linear)
const CUFF = new THREE.Color(0x3a3324);        // narrow cuff, a muted tea brown (linear): edges the sleeve without a bright band

/* hand dimensions (metres) — a right hand, palm up, thumb on +X */
const DIGITS = [
  // name, knuckle [x, y, z], yaw, segment lengths, radii [base, mid1, mid2, tip]
  { name: "index", k: [0.0275, -0.011, -0.044], yaw: -0.07, len: [0.040, 0.025, 0.019], rad: [0.0094, 0.0087, 0.0079, 0.0068] },
  { name: "middle", k: [0.0090, -0.011, -0.048], yaw: -0.015, len: [0.045, 0.028, 0.021], rad: [0.0098, 0.0091, 0.0082, 0.0070] },
  { name: "ring", k: [-0.0095, -0.011, -0.046], yaw: 0.045, len: [0.042, 0.027, 0.020], rad: [0.0093, 0.0086, 0.0078, 0.0066] },
  { name: "little", k: [-0.0270, -0.012, -0.040], yaw: 0.11, len: [0.033, 0.020, 0.018], rad: [0.0082, 0.0076, 0.0069, 0.0060] },
];
const THUMB = { k: [0.024, -0.017, 0.018], dir: [0.62, 0.18, -0.76], up: [-0.55, 0.83, 0.0], len: [0.040, 0.030, 0.026], rad: [0.0118, 0.0102, 0.0092, 0.0078] };
const WRIST = new THREE.Vector3(0, -0.012, 0.047);
const FORE_LEN = 0.26, UPPER_LEN = 0.29;        // wrist→elbow, elbow→shoulder

/* ---------------- geometry ---------------- */

function setColor(g, fn) {
  const n = g.attributes.normal, c = new Float32Array(n.count * 3), tmp = new THREE.Color();
  for (let i = 0; i < n.count; i++) { fn(tmp, n.getX(i), n.getY(i), n.getZ(i), i); c[i * 3] = tmp.r; c[i * 3 + 1] = tmp.g; c[i * 3 + 2] = tmp.b; }
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return g;
}
const palmSide = (c, nx, ny) => c.copy(SKIN_BACK).lerp(SKIN_PALM, THREE.MathUtils.smoothstep(ny, -0.25, 0.65));

/** a tapered capsule along -Z from 0 to -len, slightly flattened palm-to-back */
function phalanx(len, r0, r1, tip) {
  const pts = [], N = 10;
  for (let i = 0; i <= N; i++) { const a = -Math.PI / 2 + (i / N) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.cos(a) * r0, Math.sin(a) * r0)); }  // base cap
  for (let i = 1; i < 8; i++) {
    const t = i / 8, r = THREE.MathUtils.lerp(r0, r1, t) * (1 + 0.06 * Math.sin(t * Math.PI));   // a soft swell mid-segment
    pts.push(new THREE.Vector2(r, t * len));
  }
  const capN = tip ? 12 : 8, capH = tip ? 1.15 : 1.0;
  for (let i = 0; i <= capN; i++) { const a = (i / capN) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * r1), len + Math.sin(a) * r1 * capH)); }
  const g = new THREE.LatheGeometry(pts, 16);
  g.rotateX(-Math.PI / 2);          // +Y → -Z
  g.scale(1.07, 0.88, 1);           // fingers are wider than deep
  if (tip) {                        // the fingertip pad bulges toward the palm side
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = -p.getZ(i), y = p.getY(i);
      if (y > 0) p.setY(i, y * (1 + 0.18 * THREE.MathUtils.smoothstep(z, len * 0.35, len * 0.9)));
    }
    g.computeVertexNormals();
  }
  return setColor(g, palmSide);
}

/** a nail on the back of a distal segment */
function nail(len, r) {
  const g = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);   // lower hemisphere (back = -Y)
  g.scale(r * 0.78, r * 0.32, len * 0.36);
  g.translate(0, -r * 0.62, -len * 0.66);
  return setColor(g, (c) => c.copy(NAIL));
}

/** the palm: a soft slab, flat (y ≤ 0) where the stone sits, padded at the thenar/hypothenar */
function palmGeometry() {
  const g = new THREE.SphereGeometry(1, 48, 32);
  const p = g.attributes.position, v = new THREE.Vector3();
  const pad = (x, z, cx, cz, s, a) => a * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * s * s));
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // superellipse-ish slab, wider at the knuckles than at the wrist
    const sx = Math.sign(v.x) * Math.pow(Math.abs(v.x), 0.78), sz = Math.sign(v.z) * Math.pow(Math.abs(v.z), 0.82);
    let z = sz * 0.049 - 0.0005;
    let x = sx * 0.041 * THREE.MathUtils.lerp(1.0, 0.82, THREE.MathUtils.smoothstep(z, -0.02, 0.05));
    let y;
    if (v.y > 0) {
      // palm surface: flat (≤ 0.001) where the stone sits, raised thenar (thumb side, +X) and
      // hypothenar pads and a soft ridge under the knuckles, all outside r ≈ 3 cm
      const r = Math.hypot(x, z);
      const h = (pad(x, z, 0.025, 0.022, 0.014, 0.0055) + pad(x, z, -0.027, 0.014, 0.013, 0.0038) + pad(x, z, 0.0, -0.041, 0.012, 0.0022))
        * THREE.MathUtils.smoothstep(r, 0.03, 0.042);
      const top = 0.001 + h;
      y = -0.0125 + (top + 0.0125) * Math.pow(v.y, 0.3);
    } else {
      y = v.y * 0.0135 - 0.0125 - 0.002 * Math.exp(-(x * x) / 0.0006);   // the back of the hand is slightly domed
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return setColor(g, (c, nx, ny) => palmSide(c, nx, ny));
}

function forearmGeometry() {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(THREE.MathUtils.lerp(0.0215, 0.033, Math.pow(t, 0.8)), t * 0.3)); }
  const g = new THREE.LatheGeometry(pts, 18);
  g.rotateX(Math.PI / 2);   // +Y → +Z (toward the elbow)
  g.scale(1.18, 0.84, 1);
  return setColor(g, (c, nx, ny) => palmSide(c, nx, ny * 0.7));
}

/* the sleeve: a wide silk tube with a cream cuff at the open end, folds in a normal map */
let silkNormal = null;
function silkNormalMap() {
  if (silkNormal) return silkNormal;
  const [c, g] = mkCanvas(256, 256);
  for (let x = 0; x < 256; x++) {
    const v = 128 + 70 * Math.sin(x * 0.07) * Math.sin(x * 0.021 + 1.3) + 30 * Math.sin(x * 0.19);
    g.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`; g.fillRect(x, 0, 1, 256);
  }
  for (let y = 0; y < 256; y += 2) { g.fillStyle = `rgba(0,0,0,${0.05 + 0.04 * Math.sin(y)})`; g.fillRect(0, y, 256, 1); }   // weave
  silkNormal = normalFromCanvas(c, { normalStrength: 2.2, size: 256 });
  silkNormal.wrapS = silkNormal.wrapT = THREE.RepeatWrapping;
  return silkNormal;
}
function sleeveGeometry() {
  // wrist cuff → just past the elbow (the upper sleeve and the elbow bulge take over there)
  const pts = [], L = FORE_LEN + 0.045 - 0.085;
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.036 + 0.015 * Math.pow(t, 0.7) + 0.003 * Math.sin(t * 7), t * L)); }
  const g = new THREE.LatheGeometry(pts, 28);
  g.rotateX(Math.PI / 2);
  g.scale(1.12, 0.92, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (z < 0.05) { const a = Math.atan2(p.getY(i), p.getX(i)); p.setZ(i, z + 0.012 * Math.sin(a * 2 + 0.6)); } }   // the open end isn't a perfect circle
  g.computeVertexNormals();
  return setColor(g, (c, nx, ny, nz, i) => c.copy(p.getZ(i) < 0.012 ? CUFF : SILK));
}
/* the upper sleeve: elbow (origin, with a rounded bulge) → shoulder (+Z) */
function upperSleeveGeometry() {
  const pts = [new THREE.Vector2(0.001, -0.05)];
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI * 0.5; pts.push(new THREE.Vector2(0.053 * Math.sin(a) + 0.001, -0.05 * Math.cos(a))); }
  for (let i = 1; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(0.054 + 0.008 * t + 0.002 * Math.sin(t * 8), t * (UPPER_LEN + 0.04))); }
  const g = new THREE.LatheGeometry(pts, 24);
  g.rotateX(Math.PI / 2);
  g.scale(1.08, 0.94, 1);
  g.computeVertexNormals();
  return setColor(g, (c) => c.copy(SILK));
}

/* ---------------- skin material ---------------- */
function makeSkin(flame) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.56, metalness: 0, envMapIntensity: 0.35 });
  m.skinning = true;
  const u = { uFlamePos: { value: new THREE.Vector3() }, uFlameI: { value: 0 }, uFlameCol: { value: new THREE.Color(1.0, 0.55, 0.22) } };
  m.userData.u = u;
  m.extensions = { derivatives: true };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    const V = (s, a, b) => inject(s, a, b, "hands"), F = V;
    sh.vertexShader = V(V(sh.vertexShader, "#include <common>", "#include <common>\nvarying vec3 vBind;"),
      "#include <begin_vertex>", "#include <begin_vertex>\nvBind = position;");
    let f = sh.fragmentShader;
    f = F(f, "#include <common>", `#include <common>
        uniform vec3 uFlamePos; uniform float uFlameI; uniform vec3 uFlameCol; varying vec3 vBind;
        float hh(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hh(i), hh(i + vec3(1,0,0)), f.x), mix(hh(i + vec3(0,1,0)), hh(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hh(i + vec3(0,0,1)), hh(i + vec3(1,0,1)), f.x), mix(hh(i + vec3(0,1,1)), hh(i + vec3(1,1,1)), f.x), f.y), f.z); }`);
    f = F(f, "#include <color_fragment>", `#include <color_fragment>
        float skinN = vn(vBind * 260.0);
        diffuseColor.rgb *= 0.96 + 0.06 * skinN;   // mottling
        // fine relief only (pores aren't resolvable at arm's length); fades out
        // before its finest octave reaches half a cycle per pixel
        float skinH = vn(vBind * 380.0) * 0.6 + vn(vBind * 120.0) * 0.4;`);
    f = F(f, "#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        {
          vec2 dH = vec2(dFdx(skinH), dFdy(skinH)) * 0.00025 * clamp(1.0 - length(fwidth(vBind)) * 760.0, 0.0, 1.0);
          vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition);
          vec3 R1 = cross(sY, normal), R2 = cross(normal, sX);
          float fDet = dot(sX, R1) * (gl_FrontFacing ? 1.0 : -1.0);
          normal = normalize(abs(fDet) * normal - sign(fDet) * (dH.x * R1 + dH.y * R2));
        }`);
    f = F(f, "#include <lights_physical_pars_fragment>", skinLightsChunk("hands"));   // wrap lighting, warm terminator
    f = F(f, "#include <lights_fragment_end>", `#include <lights_fragment_end>
        {
          vec3 toF = uFlamePos - geometry.position; float d = length( toF );
          float w = pow( max( dot( geometry.normal, toF / d ) * 0.5 + 0.5, 0.0 ), 2.0 );
          reflectedLight.directDiffuse += uFlameCol * uFlameI * w / ( 1.0 + 520.0 * d * d ) * material.diffuseColor;
        }`);
    sh.fragmentShader = f;
  };
  m.customProgramCacheKey = () => "skin-v2";
  return m;
}

/* ---------------- one hand ---------------- */
const tmpM = new THREE.Matrix4();
function buildHand({ skin, silk, mirror, castShadow }) {
  const body = new THREE.Group();           // animation lives here; the caller's root is left alone
  if (mirror) body.scale.x = -1;
  const bones = [], pieces = [];
  const root = new THREE.Bone(); bones.push(root);
  const addPiece = (geo, bone) => { pieces.push({ geo, bone }); };
  addPiece(palmGeometry(), root);

  const fore = new THREE.Bone(); fore.position.copy(WRIST); root.add(fore); bones.push(fore);
  addPiece(forearmGeometry(), fore);

  const digits = [];
  for (const D of DIGITS) {
    const b0 = new THREE.Bone(); b0.position.set(...D.k); b0.rotation.order = "YXZ"; b0.rotation.y = D.yaw; root.add(b0);
    const b1 = new THREE.Bone(); b1.position.set(0, 0, -D.len[0]); b0.add(b1);
    const b2 = new THREE.Bone(); b2.position.set(0, 0, -D.len[1]); b1.add(b2);
    bones.push(b0, b1, b2);
    addPiece(phalanx(D.len[0], D.rad[0], D.rad[1]), b0);
    addPiece(phalanx(D.len[1], D.rad[1], D.rad[2]), b1);
    addPiece(phalanx(D.len[2], D.rad[2], D.rad[3], true), b2);
    addPiece(nail(D.len[2], D.rad[3]), b2);
    digits.push({ D, bones: [b0, b1, b2], a: [0.4, 0.5, 0.3], v: [0, 0, 0], goal: [0.4, 0.5, 0.3], tgt: [0, 0, 0], touch: false });
  }
  // thumb: its own frame (flexion folds it across the palm, toward +Y and -X)
  const T = THUMB;
  const tdir = new THREE.Vector3(...T.dir).normalize(), tup = new THREE.Vector3(...T.up).normalize();
  const tx = new THREE.Vector3().crossVectors(tup, tdir.clone().negate()).normalize();
  const ty = new THREE.Vector3().crossVectors(tdir.clone().negate(), tx).normalize();
  const tBase = new THREE.Quaternion().setFromRotationMatrix(tmpM.makeBasis(tx, ty, tdir.clone().negate()));
  const t0 = new THREE.Bone(); t0.position.set(...T.k); t0.quaternion.copy(tBase); root.add(t0);
  const t1 = new THREE.Bone(); t1.position.set(0, 0, -T.len[0]); t0.add(t1);
  const t2 = new THREE.Bone(); t2.position.set(0, 0, -T.len[1]); t1.add(t2);
  bones.push(t0, t1, t2);
  addPiece(phalanx(T.len[0], T.rad[0], T.rad[1]), t0);
  addPiece(phalanx(T.len[1], T.rad[1], T.rad[2]), t1);
  addPiece(phalanx(T.len[2], T.rad[2], T.rad[3], true), t2);
  addPiece(nail(T.len[2], T.rad[3]), t2);
  // the thumb's bones point along +tdir (bone -Z maps to +tdir): the solver must use the same direction
  const thumb = { bones: [t0, t1, t2], base: tBase, a: [0.2, 0.3, 0.3], v: [0, 0, 0], goal: [0.2, 0.3, 0.3], tgt: [0, 0, 0], touch: false, x: tx, y: ty, f: tdir.clone() };

  // bind: bake every piece into mesh space at the rest pose, skin it rigidly to its bone
  root.updateMatrixWorld(true);
  const geos = pieces.map(({ geo, bone }) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(bone.matrixWorld);
    const n = g.attributes.position.count, bi = bones.indexOf(bone);
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "color", "skinIndex", "skinWeight"].includes(k)) g.deleteAttribute(k);
    return g;
  });
  const merged = BufferGeometryUtils.mergeBufferGeometries(geos, false);
  const mesh = new THREE.SkinnedMesh(merged, skin);
  mesh.add(root);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = castShadow; mesh.receiveShadow = true;
  mesh.frustumCulled = false;   // skinned bounds don't follow the bones
  body.add(mesh);

  // the sleeve rides on the forearm bone; the upper sleeve is placed each frame (elbow → shoulder)
  const sleeve = new THREE.Mesh(sleeveGeometry(), silk);
  sleeve.position.set(0, 0.002, 0.085);   // a few centimetres of wrist show above the cuff
  sleeve.castShadow = castShadow; sleeve.receiveShadow = true;
  fore.add(sleeve);
  const upper = new THREE.Mesh(upperSleeveGeometry(), silk);
  upper.castShadow = castShadow; upper.receiveShadow = true;
  upper.position.copy(WRIST).z += FORE_LEN;
  body.add(upper);

  return { body, mesh, root, fore, digits, thumb, sleeve, upper };
}

/* ---------------- grip: close each digit, joint by joint, until it meets the surface ----------------
   A target (the stone, or the lamp dish) is a point sample in the hand's own
   local frame. A digit closes knuckle first: the knuckle sweeps until any
   later segment touches, then the middle joint, then the tip — so fingers
   cup around a stone instead of hooking behind it. A digit that finds nothing
   within its range relaxes into a loose cup, never a fist. */
const JOINT_LIM = [1.45, 1.6, 1.0], THUMB_LIM = [0.95, 0.9, 0.9];
const PRE = [0, 0.7, 0.4];                   // joints not yet solved keep a hooked bend, so fingertips come down over a low stone
const RELAX = [0.75, 1.0, 0.55];             // a digit that touches nothing rests in a loose natural curl
const SEG_T = [[0.5, 1], [0.5, 1], [0.45, 0.8, 1]];
const P = new THREE.Vector3(), Q = new THREE.Vector3();
function makeTarget(n) {
  return { n: 0, m: 0, solid: true, cx: 0, cy: 0, cz: 0, p: new Float32Array(n * 3), d: new Float32Array(n * 3), r: new Float32Array(n), idx: new Int32Array(n) };
}
/** fill a target from points given in some frame, mapped into the hand's local frame by `toHand` */
function fillTarget(T, pts, center, toHand, solid) {
  if (T.p.length < pts.length * 3) Object.assign(T, makeTarget(pts.length));
  P.copy(center).applyMatrix4(toHand); T.cx = P.x; T.cy = P.y; T.cz = P.z; T.solid = solid; T.n = pts.length;
  for (let i = 0; i < pts.length; i++) {
    P.copy(pts[i]).add(center).applyMatrix4(toHand);
    T.p[i * 3] = P.x; T.p[i * 3 + 1] = P.y; T.p[i * 3 + 2] = P.z;
    const dx = P.x - T.cx, dy = P.y - T.cy, dz = P.z - T.cz, r = Math.hypot(dx, dy, dz) || 1e-6;
    T.r[i] = r; T.d[i * 3] = dx / r; T.d[i * 3 + 1] = dy / r; T.d[i * 3 + 2] = dz / r;
  }
}
/** keep only the target points near one digit's plane (the digit can't reach the rest) */
function selectNear(T, base, F, Y, reach, halfW) {
  Q.crossVectors(F, Y).normalize();
  let m = 0;
  for (let i = 0; i < T.n; i++) {
    const x = T.p[i * 3] - base.x, y = T.p[i * 3 + 1] - base.y, z = T.p[i * 3 + 2] - base.z;
    if (Math.abs(x * Q.x + y * Q.y + z * Q.z) < halfW && x * x + y * y + z * z < reach * reach) T.idx[m++] = i;
  }
  T.m = m;
}
/** is (x, y, z) within `margin` of the target's surface, or inside it? */
function touches(T, x, y, z, margin) {
  const cx = x - T.cx, cy = y - T.cy, cz = z - T.cz;
  let best = -Infinity, rb = 0, m2 = Infinity;
  for (let j = 0; j < T.m; j++) {
    const i = T.idx[j], i3 = i * 3;
    const dx = x - T.p[i3], dy = y - T.p[i3 + 1], dz = z - T.p[i3 + 2], d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < m2) m2 = d2;
    if (T.solid) { const k = cx * T.d[i3] + cy * T.d[i3 + 1] + cz * T.d[i3 + 2]; if (k > best) { best = k; rb = T.r[i]; } }
  }
  if (m2 < margin * margin) return true;
  return T.solid && T.m > 0 && cx * cx + cy * cy + cz * cz < rb * rb;   // inside, along the nearest sample direction
}
/** does any segment from `from` on touch, with joint angles a? (planar chain: F forward, Y the flex direction) */
function digitHits(T, base, F, Y, len, rad, a, from) {
  let px = base.x, py = base.y, pz = base.z, th = 0;
  for (let s = 0; s < 3; s++) {
    th += a[s];
    const c = Math.cos(th), n = Math.sin(th);
    const dx = F.x * c + Y.x * n, dy = F.y * c + Y.y * n, dz = F.z * c + Y.z * n;
    if (s >= from) for (const t of SEG_T[s]) {
      const L = len[s] * t;
      if (touches(T, px + dx * L, py + dy * L, pz + dz * L, rad[s] + (rad[s + 1] - rad[s]) * t + 0.0004)) return true;
    }
    px += dx * len[s]; py += dy * len[s]; pz += dz * len[s];
  }
  return false;
}
/** solve one digit's three joint angles into out[] (returns whether anything was touched) */
function solveDigit(T, base, F, Y, len, rad, lim, start0, relaxK, out) {
  out[0] = start0; out[1] = PRE[1]; out[2] = PRE[2];
  let touched = false;
  for (let j = 0; j < 3; j++) {
    const lo0 = j === 0 ? start0 : PRE[j];
    out[j] = lo0;
    if (digitHits(T, base, F, Y, len, rad, out, j)) { touched = true; continue; }
    let prev = lo0, hit = false;
    for (let k = 1; k <= 10 && !hit; k++) {
      const v = lo0 + (lim[j] - lo0) * (k / 10);
      out[j] = v;
      if (digitHits(T, base, F, Y, len, rad, out, j)) {
        hit = true;
        let l = prev, h = v;
        for (let b = 0; b < 4; b++) { const mid = (l + h) / 2; out[j] = mid; if (digitHits(T, base, F, Y, len, rad, out, j)) h = mid; else l = mid; }
        out[j] = l;
      }
      prev = v;
    }
    if (hit) touched = true; else out[j] = RELAX[j] * relaxK;
  }
  return touched;
}

export function createHands(opts = {}) {
  if (opts.skin != null) SKIN_BACK.setHex(opts.skin);
  if (opts.sleeve != null) SILK.setHex(opts.sleeve);
  if (opts.cuff != null) CUFF.setHex(opts.cuff);
  const skin = makeSkin();
  const silk = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.0, envMapIntensity: 0.35, normalMap: silkNormalMap(), normalScale: new THREE.Vector2(0.4, 0.4), side: THREE.DoubleSide });

  const left = new THREE.Group(); left.name = "hand-left";
  const right = new THREE.Group(); right.name = "hand-right";
  const L = buildHand({ skin, silk, mirror: true, castShadow: true });    // palm-up LEFT: thumb on the visitor's left
  const R = buildHand({ skin, silk, mirror: false, castShadow: false });  // palm-up RIGHT: it carries the lamp
  left.add(L.body); right.add(R.body);

  /* ---- the lamp the right hand carries: an oil-lamp dish, or a candle in a holder ---- */
  const brass = new THREE.MeshStandardMaterial({ color: 0x8a5a1c, metalness: 0.95, roughness: 0.32, envMapIntensity: 1.0 });
  const lampG = new THREE.Group(); R.body.add(lampG);
  brass.side = THREE.DoubleSide;
  const dish = new THREE.Mesh(new THREE.LatheGeometry([[0.0, 0.0], [0.03, 0.0], [0.04, 0.008], [0.044, 0.02], [0.042, 0.021], [0.036, 0.011], [0.0, 0.007]].map(([x, y]) => new THREE.Vector2(x, y)), 36), brass);
  const oil = new THREE.Mesh(new THREE.CircleGeometry(0.037, 32), new THREE.MeshStandardMaterial({ color: 0x0c0703, roughness: 0.08, metalness: 0, envMapIntensity: 1.2 }));
  oil.rotation.x = -Math.PI / 2; oil.position.y = 0.0145;
  const lip = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.026, 12, 1, true), brass);   // the pinched spout that holds the wick
  lip.rotation.x = Math.PI / 2.3; lip.position.set(0, 0.019, -0.042);
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0022, 0.012, 8), new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.9 }));
  wick.position.set(0, 0.026, -0.053); wick.rotation.x = -0.5;
  const dishG = new THREE.Group(); dishG.add(dish, oil, lip, wick); lampG.add(dishG);
  const candleG = new THREE.Group(); lampG.add(candleG);
  candleG.add(new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.032, 0], [0.036, 0.005], [0.034, 0.008], [0.012, 0.01], [0.012, 0.022], [0.0, 0.022]].map(([x, y]) => new THREE.Vector2(x, y)), 32), brass));
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.011, 0.07, 20), new THREE.MeshStandardMaterial({ color: 0xd8cbb0, roughness: 0.45, emissive: 0x3a2008, emissiveIntensity: 0.6 }));
  wax.position.y = 0.057; candleG.add(wax);
  const cw = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.008, 6), wick.material); cw.position.y = 0.096; candleG.add(cw);
  lampG.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });

  /* flame: a teardrop with a hot core (tone-mapping off so it stays white-hot), drawn after the focus veil */
  const flameMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uK: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY; uniform float uT;
      void main(){ vec3 p = position; float h = clamp(p.y / 0.03, 0.0, 1.0);
        p.x += sin(uT * 9.0 + p.y * 160.0) * 0.0012 * h; p.z += cos(uT * 7.0 + p.y * 140.0) * 0.0009 * h;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = h;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; varying float vY; uniform float uK;
      void main(){ float f = pow(abs(dot(vN, vV)), 1.6);
        vec3 core = vec3(4.0, 3.2, 2.0), mid = vec3(3.2, 1.4, 0.35), edge = vec3(1.6, 0.35, 0.05);
        vec3 c = mix(edge, mix(mid, core, smoothstep(0.55, 0.95, f) * (1.0 - vY * 0.6)), smoothstep(0.1, 0.7, f));
        c += vec3(0.05, 0.1, 0.6) * (1.0 - smoothstep(0.0, 0.18, vY)) * f;   // the blue root of a flame
        float a = smoothstep(0.0, 0.45, f) * (1.0 - smoothstep(0.85, 1.0, vY)) * uK;
        gl_FragColor = vec4(c * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const flamePts = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14; flamePts.push(new THREE.Vector2(Math.max(0.0002, 0.0055 * Math.sin(Math.PI * Math.pow(t, 0.62)) * (1 - t * 0.25)), t * 0.03 - 0.008)); }
  const flame = new THREE.Mesh(new THREE.LatheGeometry(flamePts, 18), flameMat);
  flame.renderOrder = 12; flame.castShadow = false;
  right.add(flame);
  // a soft halo (always faces the eye)
  const [hc, hg] = mkCanvas(128, 128);
  const grd = hg.createRadialGradient(64, 70, 0, 64, 70, 64);
  grd.addColorStop(0, "rgba(255,200,120,1)"); grd.addColorStop(0.18, "rgba(255,150,60,0.55)"); grd.addColorStop(0.5, "rgba(255,110,30,0.14)"); grd.addColorStop(1, "rgba(255,90,20,0)");
  hg.fillStyle = grd; hg.fillRect(0, 0, 128, 128);
  const haloTex = new THREE.CanvasTexture(hc);
  const haloMat = new THREE.SpriteMaterial({ map: haloTex, color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const halo = new THREE.Sprite(haloMat); halo.scale.set(0.07, 0.08, 1); halo.position.y = 0.006; halo.renderOrder = 12; right.add(halo);
  const lampAnchor = new THREE.Object3D(); right.add(lampAnchor);
  right.userData.lampAnchor = lampAnchor; right.userData.flame = flame;

  /* ---- grip state ---- */
  const stone = { sample: null, q: new THREE.Quaternion(), c: new THREE.Vector3(), radius: 0.062 };
  // what the right hand closes on: the dish (rim, wall, underside) or the candle holder's foot
  const dishSample = [], candleSample = [], ORIGIN = new THREE.Vector3();
  const ring = (out, r, y, n) => { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)); } };
  ring(dishSample, 0.044, 0.02, 64); ring(dishSample, 0.042, 0.014, 64); ring(dishSample, 0.04, 0.008, 56); ring(dishSample, 0.034, 0.003, 48);
  ring(candleSample, 0.032, 0.0, 56); ring(candleSample, 0.036, 0.005, 56); ring(candleSample, 0.034, 0.008, 56); ring(candleSample, 0.024, 0.009, 40);
  let rightMode = null, openK = 0;
  const rot = [];
  const pts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let light = "lamp";

  // contact targets in each hand's own frame (the left hand's frame is mirrored: handled by its matrix)
  const tgtL = makeTarget(1024), tgtR = makeTarget(256), toHand = new THREE.Matrix4();
  const bVec = new THREE.Vector3(), fVec = new THREE.Vector3(), yVec = new THREE.Vector3(0, 1, 0);
  function fingerFrame(d, spread) {
    const yaw = d.D.yaw * spread;
    bVec.set(...d.D.k); fVec.set(-Math.sin(yaw), 0, -Math.cos(yaw)); yVec.set(0, 1, 0);
  }
  function thumbFrame(H) { bVec.set(...THUMB.k); fVec.copy(H.thumb.f); yVec.copy(H.thumb.y); }
  // solve every digit of a hand against a target; results land in d.goal / thumb.goal
  function solveHand(H, T, spread, startThumb) {
    H.digits.forEach((d, i) => {
      fingerFrame(d, spread);
      selectNear(T, bVec, fVec, yVec, d.D.len[0] + d.D.len[1] + d.D.len[2] + 0.02, d.D.rad[0] + 0.014);
      d.touch = solveDigit(T, bVec, fVec, yVec, d.D.len, d.D.rad, JOINT_LIM, -0.2, 0.9 + 0.08 * i, d.goal);
    });
    const Tm = H.thumb;
    thumbFrame(H);
    selectNear(T, bVec, fVec, yVec, THUMB.len[0] + THUMB.len[1] + THUMB.len[2] + 0.02, THUMB.rad[0] + 0.016);
    Tm.touch = solveDigit(T, bVec, fVec, yVec, THUMB.len, THUMB.rad, THUMB_LIM, startThumb, 0.9, Tm.goal);
  }
  const spring3 = (a, v, target, dt, w) => {   // three critically damped joints
    for (let k = 0; k < 3; k++) {
      const x = a[k] - target[k], e = Math.exp(-w * dt);
      a[k] = target[k] + (x + (v[k] + w * x) * dt) * e;
      v[k] = (v[k] - w * (v[k] + w * x) * dt) * e;
    }
  };
  const qx = new THREE.Quaternion(), ax = new THREE.Vector3(1, 0, 0);
  function pose(d, spread) {
    for (let k = 0; k < 3; k++) d.bones[k].rotation.x = d.a[k];
    d.bones[0].rotation.y = d.D.yaw * spread;
  }
  function poseThumb(H) {
    const T = H.thumb;
    T.bones[0].quaternion.copy(T.base).multiply(qx.setFromAxisAngle(ax, T.a[0]));
    T.bones[1].rotation.x = T.a[1]; T.bones[2].rotation.x = T.a[2];
  }


  /* arm: a two-bone chain wrist → elbow → shoulder (shoulder and pole given in the
     parent's frame). The elbow bends toward the pole (down, out, a little back), so
     the forearm runs down out of the frame instead of up beside the eye. */
  const toLocal = new THREE.Matrix4(), aim = new THREE.Vector3(), restZ = new THREE.Vector3(0, 0, 1), natural = new THREE.Vector3(0, -0.45, 0.89).normalize();
  const Sb = new THREE.Vector3(), Pb = new THREE.Vector3(), armAx = new THREE.Vector3(), elbow = new THREE.Vector3();
  // the elbows drop and swing out to the sides (as when holding something up before your face),
// so the upper arms leave the frame at its lower corners instead of looming in front of the eye
const POLE_L = new THREE.Vector3(-1.1, -0.8, 0.25), POLE_R = new THREE.Vector3(1.1, -0.8, 0.25);
  function aimArm(H, group, shoulderParent, poleParent) {
    if (!group.parent) return;
    group.updateMatrixWorld(true);
    toLocal.copy(H.body.matrixWorld).invert();
    Sb.copy(shoulderParent).applyMatrix4(group.parent.matrixWorld).applyMatrix4(toLocal);
    Pb.copy(poleParent).transformDirection(group.parent.matrixWorld).transformDirection(toLocal);
    armAx.copy(Sb).sub(WRIST);
    const d = THREE.MathUtils.clamp(armAx.length(), 1e-3, FORE_LEN + UPPER_LEN - 1e-3);
    armAx.normalize();
    const a = THREE.MathUtils.clamp((FORE_LEN * FORE_LEN - UPPER_LEN * UPPER_LEN + d * d) / (2 * d), -FORE_LEN, FORE_LEN);
    const h = Math.sqrt(Math.max(0, FORE_LEN * FORE_LEN - a * a));
    Pb.addScaledVector(armAx, -Pb.dot(armAx));
    if (Pb.lengthSq() < 1e-8) Pb.set(0, -1, 0);
    aim.copy(armAx).multiplyScalar(a).addScaledVector(Pb.normalize(), h).normalize();   // wrist → elbow
    // keep it within 62° of a natural forearm line (no broken wrists)
    const ang = aim.angleTo(natural), lim = 1.08;
    if (ang > lim) aim.lerp(natural, 1 - lim / ang).normalize();
    H.fore.quaternion.setFromUnitVectors(restZ, aim);
    elbow.copy(WRIST).addScaledVector(aim, FORE_LEN);
    H.upper.position.copy(elbow);
    H.upper.quaternion.setFromUnitVectors(restZ, armAx.copy(Sb).sub(elbow).normalize());
  }

  const shoulderL = new THREE.Vector3(), shoulderR = new THREE.Vector3();
  const api = {
    left, right,
    /** the animated left-hand body: the stone should follow its position + quaternion (never its mirrored scale) */
    leftBody: L.body,
    /** cradle a sphere of this radius (fallback when no stone sample is given) */
    setGrip(r) { stone.radius = r; },
    /** the stone in the left palm: vertex sample (relative to its centre), its rotation and centre, in the left hand frame */
    setStone(sample, q, center) { stone.sample = sample; stone.q.copy(q); stone.c.copy(center); },
    update(dt, s = {}) {
      dt = Math.min(dt, 0.05);
      const t = s.time || 0;
      light = s.light || "lamp";
      // shoulders: from the eye position the caller gives (in the hands' parent frame)
      const eye = s.eye || new THREE.Vector3(0, 0.2, 0.42);
      shoulderL.set(eye.x - 0.19, eye.y - 0.25, eye.z + 0.06);
      shoulderR.set(eye.x + 0.19, eye.y - 0.25, eye.z + 0.06);

      /* ---- left: cradle the stone ---- */
      // rotate the stone sample once; the curl searches below test against it
      let sample = null;
      if (stone.sample) {
        for (let i = 0; i < stone.sample.length; i++) (rot[i] || (rot[i] = new THREE.Vector3())).copy(stone.sample[i]).applyQuaternion(stone.q);
        rot.length = stone.sample.length; sample = rot;
      }
      const flip = s.flip || 0, tap = s.tap || 0, drag = s.dragging ? 1 : 0;
      const flipOpen = Math.sin(Math.min(1, flip / 0.35) * Math.PI * 0.5) * (flip < 0.8 ? 1 : (1 - (flip - 0.8) / 0.2));   // fingers lift to let it roll
      openK += ((s.open || 0) - openK) * (1 - Math.exp(-9 * dt));
      const open = Math.max(flipOpen, openK);
      const rollX = THREE.MathUtils.clamp(s.rollX || 0, -6, 6), rollY = THREE.MathUtils.clamp(s.rollY || 0, -6, 6);
      // the whole left hand gives a little under the stone, breathes, and dips for water
      // (set first: the grip is solved in this pose; the stone follows it through hands.leftBody)
      L.body.position.set(0, -0.004 * drag - 0.012 * (s.dip || 0) + Math.sin(t * 1.1) * 0.0012, 0);
      // the hand works the stone: it leans into a vertical turn, rolls with a horizontal one and yaws with a twist
      const twist = THREE.MathUtils.clamp(s.twist || 0, -6, 6);
      L.body.rotation.set(
        Math.sin(t * 0.9) * 0.006 + 0.04 * open + THREE.MathUtils.clamp(rollY * 0.01, -0.07, 0.07),
        THREE.MathUtils.clamp(-twist * 0.014, -0.1, 0.1),
        Math.sin(t * 0.7) * 0.008 + THREE.MathUtils.clamp(-rollX * 0.008, -0.07, 0.07));
      L.body.updateMatrix();
      const spread = 1 + 0.25 * (stone.radius - 0.05) / 0.05;
      if (sample) {
        toHand.copy(L.body.matrix).invert();
        fillTarget(tgtL, sample, stone.c, toHand, true);
        solveHand(L, tgtL, spread, -0.35);
      } else {
        L.digits.forEach((d) => { d.goal[0] = 0.7; d.goal[1] = 0.8; d.goal[2] = 0.4; });
        L.thumb.goal[0] = 0.4; L.thumb.goal[1] = 0.4; L.thumb.goal[2] = 0.3;
      }
      L.digits.forEach((d, i) => {
        const g = d.goal, o = d.tgt;
        // alive: two incommensurate waves per finger, so no two fingers move together
        const n = 0.011 * Math.sin(t * 1.3 + i * 1.7) + 0.006 * Math.sin(t * 2.9 + i * 4.1);
        o[0] = g[0] + n + rollY * 0.012 * (i % 2 ? 1 : -1);    // fingers ripple as the stone rolls
        o[1] = g[1] + n * 0.6; o[2] = g[2] + n * 0.4;
        // open: straighten (fingers peel away from the stone)
        o[0] = THREE.MathUtils.lerp(o[0], -0.12, open * 0.85); o[1] = THREE.MathUtils.lerp(o[1], 0.08, open); o[2] = THREE.MathUtils.lerp(o[2], 0.05, open);
        if (i === 0 && tap > 0) {
          // the index finger lifts (u 0-0.45), swings down to touch at u = 0.6 exactly, rebounds, settles by 1
          const k = tap < 0.45 ? Math.sin((tap / 0.45) * Math.PI * 0.5) : tap < 0.6 ? 1 - Math.pow((tap - 0.45) / 0.15, 2) : 0.14 * Math.sin(((tap - 0.6) / 0.4) * Math.PI);
          o[0] -= 0.62 * k; o[1] -= 0.38 * k; o[2] -= 0.12 * k;
          for (let q = 0; q < 3; q++) { d.a[q] = o[q]; d.v[q] = 0; }   // driven directly: the strike lands on time
        } else spring3(d.a, d.v, o, dt, 13 + i);
        pose(d, spread);
      });
      {
        const T = L.thumb, g = T.goal, o = T.tgt;
        const push = flip > 0.3 && flip < 0.8 ? Math.sin(((flip - 0.3) / 0.5) * Math.PI) : 0;   // the thumb rolls the stone over
        // the thumb pushes the way the stone turns (and rides it round in a twist)
        o[0] = THREE.MathUtils.lerp(g[0], -0.35, openK) + 0.05 * drag + 0.3 * push + THREE.MathUtils.clamp(-rollX * 0.03 + twist * 0.025, -0.2, 0.2);
        o[1] = g[1] + 0.06 * drag + 0.25 * push; o[2] = g[2] + 0.04 * drag;
        spring3(T.a, T.v, o, dt, 14);
        poseThumb(L);
      }
      aimArm(L, left, shoulderL, POLE_L);

      /* ---- right: carry the lamp ---- */
      const candle = light === "candle";
      dishG.visible = !candle; candleG.visible = candle;
      // the palm sits under the dish / holder; the flame (origin) stays put
      R.body.position.set(0, candle ? -0.108 : -0.04, candle ? 0.0 : 0.056);
      lampG.position.set(0, 0, 0);
      if (rightMode !== (candle ? "candle" : "dish")) {
        rightMode = candle ? "candle" : "dish";
        fillTarget(tgtR, candle ? candleSample : dishSample, ORIGIN, toHand.identity(), false);
        solveHand(R, tgtR, 1, -0.3);
      }
      R.digits.forEach((d, i) => {
        const n = 0.01 * Math.sin(t * 1.2 + i * 1.9) + 0.004 * Math.sin(t * 3.1 + i);
        d.tgt[0] = d.goal[0] + n; d.tgt[1] = d.goal[1] + n * 0.5; d.tgt[2] = d.goal[2];
        spring3(d.a, d.v, d.tgt, dt, 10); pose(d, 1);
      });
      spring3(R.thumb.a, R.thumb.v, R.thumb.goal, dt, 10);
      poseThumb(R);
      R.body.rotation.set(Math.sin(t * 1.0) * 0.008, 0, Math.sin(t * 0.8) * 0.01);
      aimArm(R, right, shoulderR, POLE_R);
      // the dish sits on the right palm: the lamp group is in the hand body's frame
      lampG.position.set(0, 0.0005, 0);

      /* ---- flame ---- */
      const fl = s.flameFlicker === false ? 1 : 1 + 0.12 * Math.sin(t * 17) * Math.sin(t * 5.3) + (candle ? 0.1 * Math.sin(t * 29) : 0);
      flame.scale.set(1, fl * (candle ? 0.85 : 1), 1);
      flame.position.set(0, candle ? 0 : 0, 0);
      flameMat.uniforms.uT.value = t;
      // lean against the motion of the lamp
      const v = api._lastR ? right.position.clone().sub(api._lastR).divideScalar(Math.max(dt, 1e-3)) : new THREE.Vector3();
      api._lastR = right.position.clone();
      flame.rotation.set(THREE.MathUtils.clamp(v.z * 0.35, -0.5, 0.5), 0, THREE.MathUtils.clamp(-v.x * 0.35, -0.5, 0.5));
      haloMat.opacity = 0.22 + 0.06 * fl;
      const on = right.visible && light !== "daylight";
      skin.userData.u.uFlameI.value = on ? 0.9 * fl : 0;
    },
    /** call per frame with the active camera (flame glow is computed in view space) */
    setFlameView(camera) {
      flame.getWorldPosition(P);
      skin.userData.u.uFlamePos.value.copy(P).applyMatrix4(camera.matrixWorldInverse);
    },
    /** compile every hand material up front (the hands are hidden until the first study) */
    warm(renderer, scene, camera) {
      const lv = left.visible, rv = right.visible; left.visible = right.visible = true;
      const pv = []; for (let o = left.parent; o; o = o.parent) { pv.push([o, o.visible]); o.visible = true; }
      try { renderer.compile(scene, camera); } catch (e) { /* not fatal */ }
      pv.forEach(([o, v]) => (o.visible = v)); left.visible = lv; right.visible = rv;
    },
    dispose() {
      [L, R].forEach((H) => { H.mesh.geometry.dispose(); H.sleeve.geometry.dispose(); H.upper.geometry.dispose(); });
      skin.dispose(); silk.dispose(); brass.dispose(); flameMat.dispose(); haloMat.dispose();
      lampG.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    },
  };
  // the flame glow must track whichever camera renders (main view or the hand lens)
  [L.mesh, R.mesh].forEach((m) => { m.onBeforeRender = (r, sc, cam) => api.setFlameView(cam); });
  return api;
}
