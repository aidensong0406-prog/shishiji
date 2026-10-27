import * as THREE from "three";
import {
  HW, HD, HH, UF_Y, UF2_Y, SLAB_T, FLOOR_Y, ATRIUM, STAIR, STAIR2, STAIRWELLS, EAST_WINDOWS, PILASTER_XS,
} from "./constants.js";
import { BufferGeometryUtils } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mkCanvas } from "./textures.js";
import { normalFromCanvas } from "../utils/surfaceMaps.js";
import { mulberry } from "../utils/math.js";
import { buildStoneGeometry } from "../stones/geometry.js";
import { CLASSES, ANALOGS } from "../catalog/knowledge.js";

/* ==========================================================================
   The hall interior: three storeys around a three-storey atrium.

   Structure reads as built, not stacked: continuous lacquered columns rise
   from stone bases at the atrium corners to the roof; each floor slab sits on
   deep painted edge beams carried by those columns and on a grid of coffer
   beams that land on the wall pilasters. Every storey gets the same finish —
   moulded skirting, raised-and-fielded dado panels, silk wall-covering in each
   bay, framed by the timber order of a Chinese hall: lacquered posts on carved
   stone drum bases (柱础) with 雀替 brackets, a painted architrave (额枋), a
   row of 斗拱 bracket sets carrying the ceiling, and a 天花 painted coffer
   ceiling — with its own silk colour and its own wall content.

   Everything is built in the "N frame" (u along +x, projection p along +z,
   y up) and placed onto a wall with put(); static meshes are later batched by
   mergeStatic, so the many small parts cost little at draw time.
   ========================================================================== */

const STOREYS = [0, 1, 2].map((s) => ({ s, y0: FLOOR_Y[s], y1: s < 2 ? FLOOR_Y[s + 1] - SLAB_T : HH }));
const EAST_FACE = HW + 0.15;   // the east wall's interior face (its own construction)
const SIDE = {
  N: { ry: 0, at: (u, y) => [u, y, -HD], len: HW * 2 },
  S: { ry: Math.PI, at: (u, y) => [u, y, HD], len: HW * 2 },
  W: { ry: Math.PI / 2, at: (u, y) => [-HW, y, u], len: HD * 2 },
  E: { ry: -Math.PI / 2, at: (u, y) => [EAST_FACE, y, u], len: HD * 2 },
};
const END_PILASTERS = [-9.9, -6.2, 6.2, 9.9];

/* ---------------- procedural textures ---------------- */

function fabricMaps(base, motif, seed) {
  const [c, g] = mkCanvas(512, 512);
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  const r = mulberry(seed);
  // weave: fine warp + weft
  for (let i = 0; i < 512; i += 2) {
    g.fillStyle = `rgba(255,255,255,${0.025 + r() * 0.02})`; g.fillRect(0, i, 512, 1);
    g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.02})`; g.fillRect(i, 0, 1, 512);
  }
  // damask: ruyi-cloud medallions on a half-drop repeat
  const med = (cx, cy, s) => {
    g.save(); g.translate(cx, cy); g.fillStyle = motif; g.strokeStyle = motif; g.lineWidth = 3;
    for (let k = 0; k < 4; k++) {
      g.rotate(Math.PI / 2);
      g.beginPath(); g.arc(0, -s * 0.55, s * 0.28, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(-s * 0.18, -s * 0.36, s * 0.14, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(s * 0.18, -s * 0.36, s * 0.14, 0, Math.PI * 2); g.fill();
    }
    g.beginPath(); g.arc(0, 0, s * 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = base; g.beginPath(); g.arc(0, 0, s * 0.16, 0, Math.PI * 2); g.fill();   // the medallion's eye
    g.beginPath(); g.arc(0, 0, s * 0.82, 0, Math.PI * 2); g.lineWidth = 2; g.stroke();
    g.restore();
  };
  for (const [x, y] of [[128, 128], [384, 384], [384, -128], [-128, 384], [640, 128], [128, 640], [384, 128 + 512]]) med(x, y, 70);
  for (const [x, y] of [[384, 128], [128, 384], [-128, 128], [640, 384], [384, -128 + 512 - 512], [128, -128 + 512 + 256]]) {
    g.save(); g.translate(x, y); g.fillStyle = motif; g.globalAlpha = 0.7;
    g.beginPath(); g.moveTo(0, -18); g.lineTo(14, 0); g.lineTo(0, 18); g.lineTo(-14, 0); g.closePath(); g.fill(); g.restore();
  }
  const map = new THREE.CanvasTexture(c);
  map.encoding = THREE.sRGBEncoding; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8;
  const normalMap = normalFromCanvas(c, { normalStrength: 1.4, size: 512 });
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  return { map, normalMap };
}

// 天花: one painted coffer per tile, in the Qing manner — mineral-green 支条 ribs with
// gilt 燕尾 crossings, a blue-bordered panel, 岔角 cloud corners, and a blue 圆光
// roundel holding a gilt-edged lotus (团花)
function caissonTexture() {
  const [c, g] = mkCanvas(512, 512);
  const ring = (r, col) => { g.fillStyle = col; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); };
  g.fillStyle = "#2f5e4f"; g.fillRect(0, 0, 512, 512);                                   // 支条 rib colour fills the tile edge
  // gilt 燕尾 swallowtails where the ribs cross (the tile corners) and gilt rib edge lines
  g.strokeStyle = "#d1a85a"; g.lineWidth = 2; g.strokeRect(30, 30, 452, 452);
  for (const [x, y] of [[0, 0], [512, 0], [0, 512], [512, 512]]) {
    g.save(); g.translate(x, y); g.fillStyle = "#d9b062";
    g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#2a4d78"; g.beginPath(); g.arc(0, 0, 15, 0, Math.PI * 2); g.fill(); g.restore();
  }
  // the panel: a blue border band, then the green field
  g.fillStyle = "#28507f"; g.fillRect(34, 34, 444, 444);
  g.strokeStyle = "#e3c27a"; g.lineWidth = 2.5; g.strokeRect(52, 52, 408, 408);
  g.fillStyle = "#3d7a64"; g.fillRect(56, 56, 400, 400);
  // 岔角: cloud scrolls in the four corners, blue shading to white
  for (const a of [0, 1, 2, 3]) {
    g.save(); g.translate(256, 256); g.rotate((a * Math.PI) / 2); g.translate(-200, -200);
    for (const [r, col] of [[78, "#2a5486"], [62, "#3f6fa3"], [46, "#6e9cc7"], [30, "#c7dbe9"]]) {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, 0, Math.PI / 2); g.closePath(); g.fill();
    }
    g.strokeStyle = "#e3c27a"; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 80, 0, Math.PI / 2); g.stroke();
    g.restore();
  }
  // 圆光: the roundel
  g.save(); g.translate(256, 256);
  ring(132, "#e3c27a"); ring(127, "#1f467a"); ring(112, "#e3c27a"); ring(109, "#24508c");
  for (let k = 0; k < 8; k++) {                       // eight lotus petals: red shading to pale at the tips
    g.save(); g.rotate((k * Math.PI) / 4);
    g.fillStyle = "#e3c27a"; g.beginPath(); g.ellipse(0, -58, 25, 44, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = k % 2 ? "#a33a2c" : "#b84a36"; g.beginPath(); g.ellipse(0, -58, 22, 41, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#e9a07c"; g.beginPath(); g.ellipse(0, -70, 12, 24, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#f6e3c8"; g.beginPath(); g.ellipse(0, -78, 5, 11, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  for (let k = 0; k < 8; k++) {                       // inner ring of green leaves between the petals
    g.save(); g.rotate((k * Math.PI) / 4 + Math.PI / 8); g.fillStyle = "#3d7a64";
    g.beginPath(); g.ellipse(0, -40, 9, 20, 0, 0, Math.PI * 2); g.fill(); g.restore();
  }
  ring(26, "#e3c27a"); ring(21, "#2e5e86"); ring(11, "#e8c67e");
  for (let k = 0; k < 12; k++) { g.save(); g.rotate((k * Math.PI) / 6); g.fillStyle = "#f2d999"; g.beginPath(); g.arc(0, -16, 2.6, 0, Math.PI * 2); g.fill(); g.restore(); }   // seed pod
  g.restore();
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// 彩画 band for the atrium edge beams: blue-green whorl medallions between gold lines
function paintBandTexture() {
  const [c, g] = mkCanvas(1024, 128);
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, "#173f45"); grd.addColorStop(0.5, "#24564f"); grd.addColorStop(1, "#173f45");
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 128);
  g.fillStyle = "#c9a35c"; g.fillRect(0, 8, 1024, 4); g.fillRect(0, 116, 1024, 4);
  g.fillStyle = "#7d2a1f"; g.fillRect(0, 0, 1024, 8); g.fillRect(0, 120, 1024, 8);
  for (let i = 0; i < 4; i++) {
    const cx = 128 + i * 256;
    g.save(); g.translate(cx, 64);
    for (const [r, col] of [[46, "#cfc6b2"], [42, "#22496a"], [32, "#cfc6b2"], [28, "#24564f"], [14, "#a88a55"]]) { g.fillStyle = col; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); }
    for (let k = 0; k < 8; k++) { g.rotate(Math.PI / 4); g.fillStyle = "#e9e1cf"; g.beginPath(); g.ellipse(0, -36, 5, 9, 0.6, 0, Math.PI * 2); g.fill(); }
    g.restore();
    g.strokeStyle = "#c9a35c"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx + 60, 20); g.lineTo(cx + 96, 64); g.lineTo(cx + 60, 108); g.stroke();
    g.beginPath(); g.moveTo(cx - 60, 20); g.lineTo(cx - 96, 64); g.lineTo(cx - 60, 108); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

/* lacquer: a near-uniform field with faint vertical brush streaks and wear (multiplies the colour) */
function lacquerTexture() {
  const [c, g] = mkCanvas(128, 512);
  g.fillStyle = "#f2f2f2"; g.fillRect(0, 0, 128, 512);
  const r = mulberry(31);
  for (let i = 0; i < 260; i++) {
    const x = r() * 128, w = 0.5 + r() * 2.5, a = 0.03 + r() * 0.06;
    g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.8})`;
    g.fillRect(x, 0, w, 512);
  }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`; g.fillRect(r() * 128, r() * 512, 2 + r() * 10, 6 + r() * 60); }   // wear and old repairs
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
/* 雀替 carving: a mineral-green ground with gilt scrolls and a red-and-blue border, mapped in
   shape units (the bracket's own metres) */
function queTiTexture() {
  const [c, g] = mkCanvas(512, 256);
  g.fillStyle = "#1f5446"; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = "#e0b45e"; g.lineCap = "round";
  // rolling 卷草 scrolls along the bracket: spirals joined by a stem
  for (let i = 0; i < 5; i++) {
    const cx = 60 + i * 95, cy = 70 + (i % 2) * 70, r0 = 34 - i * 3;
    g.lineWidth = 7; g.beginPath();
    for (let t = 0; t < 5.2; t += 0.1) { const r = r0 * (1 - t / 6.5), x = cx + Math.cos(t * 1.25 + i) * r, y = cy + Math.sin(t * 1.25 + i) * r; t ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    g.lineWidth = 5; g.beginPath(); g.moveTo(cx + r0 * 0.8, cy); g.quadraticCurveTo(cx + 48, cy + (i % 2 ? -60 : 60), cx + 95 - r0, 70 + ((i + 1) % 2) * 70); g.stroke();
    g.fillStyle = "#b83a2a"; g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = "#2a4f8a"; g.fillRect(0, 0, 512, 14); g.fillStyle = "#e0b45e"; g.fillRect(0, 14, 512, 4);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

/* a fine-grained grey granite for the column bases */
function graniteMaps() {
  const [c, g] = mkCanvas(256, 256);
  g.fillStyle = "#8b857b"; g.fillRect(0, 0, 256, 256);
  const r = mulberry(47);
  for (let i = 0; i < 5200; i++) {
    const v = r(), s = 0.6 + r() * 1.8;
    g.fillStyle = v < 0.42 ? `rgba(40,38,35,${0.35 + r() * 0.4})` : v < 0.8 ? `rgba(225,218,205,${0.25 + r() * 0.35})` : `rgba(120,96,84,${0.3 + r() * 0.3})`;
    g.fillRect(r() * 256, r() * 256, s, s);
  }
  const map = new THREE.CanvasTexture(c); map.encoding = THREE.sRGBEncoding; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8;
  const normalMap = normalFromCanvas(c, { normalStrength: 0.8, size: 256 }); normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  return { map, normalMap };
}

/* 石谱 plate: an ink-wash drawing of a catalog specimen, in the manner of the
   illustrated stone catalogues — the stone drawn from its own 3D model. */
function plateTexture(spec) {
  const W = 420, H = 600;
  const [c, g] = mkCanvas(W, H);
  g.fillStyle = "#ebe3cf"; g.fillRect(0, 0, W, H);
  const r = mulberry(spec.look.seed);
  for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(120,100,70,${r() * 0.05})`; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
  g.strokeStyle = "#8a7a5e"; g.lineWidth = 2; g.strokeRect(18, 18, W - 36, H - 36);
  g.lineWidth = 1; g.strokeRect(26, 26, W - 52, H - 52);
  // the stone: project the model, painter-sort, shade like ink wash
  const geo = buildStoneGeometry(spec.shape, { level: 4 });   // fine enough that the wash reads as brushwork, not facets
  geo.rotateY(0.6); geo.computeVertexNormals();
  const P = geo.attributes.position, N = geo.attributes.normal, C = geo.attributes.aCavity, I = geo.index.array;
  const box = new THREE.Box3().setFromBufferAttribute(P);
  const sx = (W - 150) / (box.max.x - box.min.x), sy = (H - 200) / (box.max.y - box.min.y), sc = Math.min(sx, sy);
  const ox = 30 + (W - 120) / 2, oy = H / 2 + 20;
  const L = new THREE.Vector3(-0.5, 0.65, 0.55).normalize();
  const tris = [];
  for (let i = 0; i < I.length; i += 3) {
    const a = I[i], b = I[i + 1], d = I[i + 2];
    const zc = P.getZ(a) + P.getZ(b) + P.getZ(d);
    const nz = N.getZ(a) + N.getZ(b) + N.getZ(d);
    if (nz < -0.3) continue;
    const nl = (N.getX(a) + N.getX(b) + N.getX(d)) * L.x + (N.getY(a) + N.getY(b) + N.getY(d)) * L.y + nz * L.z;
    const cav = (C.getX(a) + C.getX(b) + C.getX(d)) / 3;
    tris.push([zc, a, b, d, Math.max(0, nl / 3), cav]);
  }
  tris.sort((p, q) => p[0] - q[0]);
  const X = (i) => ox + (P.getX(i) - (box.min.x + box.max.x) / 2) * sc, Y = (i) => oy - (P.getY(i) - (box.min.y + box.max.y) / 2) * sc;
  for (const [, a, b, d, l, cav] of tris) {
    const ink = Math.min(1, 0.1 + (1 - l) * 0.55 + cav * 0.9);
    const v = Math.round(235 - ink * 205);
    g.fillStyle = `rgb(${v},${v - 4},${v - 10})`; g.strokeStyle = g.fillStyle; g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(X(a), Y(a)); g.lineTo(X(b), Y(b)); g.lineTo(X(d), Y(d)); g.closePath(); g.fill(); g.stroke();
  }
  geo.dispose();
  // inscription: vertical title at the right, seal, catalogue number
  g.fillStyle = "#2a241c"; g.font = "600 26px 'Songti SC','Noto Serif SC',serif"; g.textAlign = "center";
  const zh = spec.title.zh.replace("·", "");
  [...zh].forEach((ch, i) => g.fillText(ch, W - 52, 76 + i * 30));
  g.fillStyle = "#a8322a"; g.fillRect(W - 66, 80 + zh.length * 30, 28, 28);
  g.fillStyle = "#f2e6d6"; g.font = "600 16px serif"; g.fillText("石", W - 52, 100 + zh.length * 30);
  g.fillStyle = "#5c5142"; g.font = "15px Georgia,serif"; g.textAlign = "left";
  g.fillText(`${spec.id}  ·  ${spec.analogName.en}`, 40, H - 44);
  g.font = "italic 14px Georgia,serif"; g.fillText(spec.title.en, 40, H - 26 - 0);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
  return t;
}

/* interpretive panel for a rock class: title, counts from the register, facts */
function classPanelTexture(cls, specimens) {
  const W = 600, H = 820;
  const [c, g] = mkCanvas(W, H);
  g.fillStyle = "#1c1915"; g.fillRect(0, 0, W, H);
  g.strokeStyle = "#8c7146"; g.lineWidth = 2; g.strokeRect(14, 14, W - 28, H - 28);
  const name = CLASSES[cls];
  g.fillStyle = "#c9a35c"; g.font = "600 15px system-ui,sans-serif"; g.fillText("ROCK CLASS · 岩类", 44, 66);
  g.fillStyle = "#ece6da"; g.font = "500 44px Georgia,'Songti SC',serif"; g.fillText(name.en.replace(/ \(.*/, ""), 44, 120);
  g.font = "34px 'Songti SC','Noto Serif SC',serif"; g.fillStyle = "#c4bbab"; g.fillText(name.zh, 44, 166);
  const types = ANALOGS.filter((a) => a.cls === cls);
  const n = specimens.filter((s) => s.class === cls).length;
  g.font = "18px system-ui,sans-serif"; g.fillStyle = "#9a9081";
  g.fillText(`${n} specimens in the register · ${types.length} rock types`, 44, 206);
  g.fillStyle = "#3a342d"; g.fillRect(44, 226, W - 88, 1);
  // facts (labelled as facts about the rock types, never about specimens)
  const wrap = (text, x, y, maxW, lh) => {
    const words = text.split(" "); let line = "";
    for (const w of words) { const tl = line ? line + " " + w : w; if (g.measureText(tl).width > maxW) { g.fillText(line, x, y); y += lh; line = w; } else line = tl; }
    if (line) { g.fillText(line, x, y); y += lh; } return y;
  };
  let y = 270;
  for (const a of types.slice(0, 4)) {
    g.fillStyle = "#e0c48a"; g.font = "600 21px Georgia,serif"; g.fillText(`${a.en}  ${a.zh}`, 44, y); y += 30;
    g.fillStyle = "#c4bbab"; g.font = "17px Georgia,serif"; y = wrap(a.facts[0], 44, y, W - 88, 24) + 16;
    if (y > H - 110) break;
  }
  g.strokeStyle = "#7fae8a"; g.lineWidth = 1.5; g.strokeRect(44, H - 76, 132, 28);
  g.fillStyle = "#7fae8a"; g.font = "600 12px system-ui,sans-serif"; g.fillText("FACT · ROCK TYPE", 56, H - 57);
  g.fillStyle = "#9a9081"; g.font = "13px system-ui,sans-serif"; g.fillText("General statements about each rock type — not about any specimen.", 190, H - 57);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
  return t;
}

/* ---------------- millwork primitives (N frame) ---------------- */

// a moulding: profile [p, y] points (closed), extruded along u, centred
function mouldGeo(profile, len) {
  const sh = new THREE.Shape(profile.map(([p, y]) => new THREE.Vector2(p, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -len / 2); g.rotateY(-Math.PI / 2);
  return g;
}
const cove = (p0, y0, p1, y1, n = 6) => Array.from({ length: n + 1 }, (_, i) => {
  const a = (i / n) * Math.PI / 2;
  return [p0 + (p1 - p0) * (1 - Math.cos(a)), y0 + (y1 - y0) * Math.sin(a)];
});
const PROFILE = {
  base: [[0, 0], [0.032, 0], [0.032, 0.15], [0.042, 0.165], [0.042, 0.185], [0.026, 0.205], [0.016, 0.22], [0, 0.22]],
  chair: [[0, 0], [0.018, 0], [0.034, 0.012], [0.046, 0.032], [0.046, 0.05], [0.03, 0.066], [0.04, 0.078], [0.04, 0.09], [0, 0.09]],
  picture: [[0, 0], [0.02, 0], [0.034, 0.014], [0.034, 0.03], [0.02, 0.045], [0, 0.045]],
  cornice: [[0, 0], [0.03, 0], [0.03, 0.05], [0.055, 0.07], ...cove(0.055, 0.07, 0.24, 0.25), [0.29, 0.27], [0.29, 0.31], [0.32, 0.33], [0.32, 0.36], [0, 0.36]],
  rail: null,
};
const boxN = (w, h, d, p0 = 0) => new THREE.BoxGeometry(w, h, d).translate(0, 0, p0 + d / 2);
// half-round pieces standing against a wall (the half toward +p), centred p0 off the wall
const halfCyl = (r0, r1, h, p0 = 0.02, seg = 20) => new THREE.CylinderGeometry(r1, r0, h, seg, 1, true, -Math.PI / 2, Math.PI).translate(0, h / 2, p0);
const halfLathe = (pts, p0 = 0.02, seg = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, -Math.PI / 2, Math.PI).translate(0, 0, p0);
// 柱础 drum base profile (radius, height): a low bulging drum (鼓镜) with a lip
const DRUM = [[0.001, 0], [0.3, 0], [0.31, 0.02], [0.325, 0.06], [0.322, 0.1], [0.305, 0.14], [0.272, 0.172], [0.25, 0.186], [0.235, 0.2], [0.001, 0.2]];
// 雀替: the carved bracket under a beam where it meets a post (u > 0 side; mirror for the other)
function queTi(len = 0.78, drop = 0.36, depth = 0.11) {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.lineTo(len, 0);
  sh.bezierCurveTo(len * 0.86, -drop * 0.12, len * 0.62, -drop * 0.2, len * 0.5, -drop * 0.42);   // the scrolled tip
  sh.bezierCurveTo(len * 0.42, -drop * 0.62, len * 0.2, -drop * 0.6, len * 0.12, -drop * 0.86);
  sh.quadraticCurveTo(len * 0.05, -drop, 0, -drop); sh.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 10 });
  return g.translate(0, 0, 0.02);
}
/* one 斗拱 bracket set against a wall, in two parts: the painted arms, and the
   blocks (坐斗 below, 升 on the arms) — each merged into one geometry */
function bracketSet() {
  const B = (w, h, d, u, y, p) => new THREE.BoxGeometry(w, h, d).translate(u, y, p);
  // an arm whose lower ends are cut back in a curve (卷杀), softly bevelled
  const ext = (sh, depth) => new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 3 });
  const curved = (L, h, both) => {
    const k = h * 1.1, sh = new THREE.Shape();
    sh.moveTo(both ? -L / 2 : 0, h); sh.lineTo(both ? L / 2 : L, h);
    const x1 = both ? L / 2 : L;
    sh.lineTo(x1, h * 0.5); sh.quadraticCurveTo(x1 - k * 0.15, 0, x1 - k, 0);
    if (both) { sh.lineTo(-L / 2 + k, 0); sh.quadraticCurveTo(-L / 2 + k * 0.15, 0, -L / 2, h * 0.5); }
    else sh.lineTo(0, 0);
    sh.closePath();
    return sh;
  };
  // along the wall (u): shape in (u, y), extruded toward the room (p)
  const armU = (L, h, d, y0, p0) => ext(curved(L, h, true), d).translate(0, y0, p0 - d / 2);
  // out from the wall (p): shape in (p, y), extruded across (u), turned so shape-x runs along p
  const armP = (L, h, w, y0, p0) => { const g = ext(curved(L, h, false), w); g.translate(0, 0, -w / 2); g.rotateY(-Math.PI / 2); return g.translate(0, y0, p0); };
  const arms = BufferGeometryUtils.mergeBufferGeometries([
    armU(0.62, 0.075, 0.1, 0.09, 0.13),     // 瓜拱: the lower arm along the wall
    armU(0.42, 0.065, 0.09, 0.183, 0.2),    // the upper, shorter arm
    armP(0.34, 0.075, 0.1, 0.09, 0.02),     // 翘: the arm reaching out from the wall
    armP(0.37, 0.065, 0.09, 0.183, 0.02),
  ].map((g) => g.toNonIndexed()));
  const blocks = BufferGeometryUtils.mergeBufferGeometries([
    B(0.2, 0.09, 0.2, 0, 0.045, 0.12),      // 坐斗
    ...[-0.26, 0, 0.26].map((u) => B(0.11, 0.05, 0.11, u, 0.19, 0.13)),   // 升 on the lower arm
    ...[-0.17, 0.17].map((u) => B(0.1, 0.045, 0.1, u, 0.272, 0.2)),
    B(0.12, 0.05, 0.12, 0, 0.19, 0.33),
  ]);
  return { arms, blocks };
}
function raisedPanel(w, h) {
  const sh = new THREE.Shape(); sh.moveTo(-w / 2, -h / 2); sh.lineTo(w / 2, -h / 2); sh.lineTo(w / 2, h / 2); sh.lineTo(-w / 2, h / 2);
  return new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.035, bevelSegments: 2 });
}

/* ==========================================================================
   buildInterior
   ========================================================================== */
export function buildInterior(ctx) {
  const { arch, M, stairMat, ARTS, loadArtTexture, specimens = [], preset } = ctx;
  const out = { colliders: [], lanterns: [], sconces: [], shafts: [], pointLights: [] };
  const put = (geo, mat, side, u, y, { cast = false, recv = true } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.y = SIDE[side].ry; m.position.set(...SIDE[side].at(u, y));
    m.castShadow = cast; m.receiveShadow = recv; arch.add(m); return m;
  };
  const add = (geo, mat, x, y, z, { cast = false, recv = true, ry = 0 } = {}) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = cast; m.receiveShadow = recv; arch.add(m); return m;
  };

  /* materials */
  const FAB = [
    fabricMaps("#3b4e4a", "#4a605b", 11),   // storey 1: celadon-slate
    fabricMaps("#5a2622", "#6c302a", 12),   // storey 2: madder
    fabricMaps("#262c3d", "#323a50", 13),   // storey 3: ink indigo
  ].map((f) => new THREE.MeshStandardMaterial({ map: f.map, normalMap: f.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.82, envMapIntensity: 0.25 }));
  const caisson = new THREE.MeshStandardMaterial({ map: caissonTexture(), roughness: 0.75, envMapIntensity: 0.2 });
  caisson.map.repeat.set(0.8, 0.8);
  const paint = new THREE.MeshStandardMaterial({ map: paintBandTexture(), roughness: 0.6, envMapIntensity: 0.3 });
  const lacquerRed = new THREE.MeshStandardMaterial({ color: 0x3e0f0a, roughness: 0.3, metalness: 0.04, envMapIntensity: 0.6 });
  const lacquerBlack = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.32, metalness: 0.05, envMapIntensity: 0.55 });
  const gr = graniteMaps();
  gr.map.repeat.set(3, 3); gr.normalMap.repeat.set(3, 3);
  const stoneBase = new THREE.MeshStandardMaterial({ map: gr.map, normalMap: gr.normalMap, normalScale: new THREE.Vector2(0.25, 0.25), color: 0xc4bdb0, roughness: 0.5, envMapIntensity: 0.4 });
  const lacq = lacquerTexture();
  lacquerRed.map = lacq; lacquerRed.color.setHex(0x5a140c);
  const lacquerPost = new THREE.MeshStandardMaterial({ map: lacq, color: 0x5a140c, roughness: 0.32, metalness: 0.04, envMapIntensity: 0.6 });
  const bracketPaint = new THREE.MeshStandardMaterial({ color: 0x0f3a33, roughness: 0.55, envMapIntensity: 0.4 });   // 斗拱 arms, 箍头: mineral green
  // 雀替: the shape's own metres → uv: x 0…0.78, y -0.34…0 (the carving fills the face)
  const qtTex = queTiTexture(); qtTex.repeat.set(1 / 0.78, 1 / 0.34); qtTex.offset.set(0, 1);
  const queTiPaint = new THREE.MeshStandardMaterial({ map: qtTex, roughness: 0.5, metalness: 0.05, envMapIntensity: 0.5 });
  const bracketBlue = new THREE.MeshStandardMaterial({ color: 0x0c1f3a, roughness: 0.55, envMapIntensity: 0.4 });    // the blocks: azurite blue
  const gilt = new THREE.MeshStandardMaterial({ color: 0xb07a2c, roughness: 0.35, metalness: 0.85, envMapIntensity: 0.9 });
  const silkGlow = new THREE.MeshBasicMaterial({ color: 0xffe0b0 });
  const daylight = new THREE.MeshStandardMaterial({ color: 0xf1e9d8, emissive: 0xf4ead6, emissiveIntensity: 0.85, roughness: 0.9 });
  const paperOut = new THREE.MeshStandardMaterial({ color: 0xe6d9bd, emissive: 0x3a2e1c, emissiveIntensity: 0.6, roughness: 0.95 });

  /* ---------------- walls, storey by storey ---------------- */
  const geoCache = new Map();
  const cached = (k, f) => { if (!geoCache.has(k)) geoCache.set(k, f()); return geoCache.get(k); };
  const plates = specimens.length ? [...specimens].sort((a, b) => (b.class === "scholar") - (a.class === "scholar") || b.traits.pitting + b.traits.wrinkling - a.traits.pitting - a.traits.wrinkling) : [];
  let plateIdx = 0;
  const nextPlate = () => plates[(plateIdx++ * 7) % Math.max(1, plates.length)];

  const hang = (side, u, cy, tex, aw, ah, { frame = M.woodDark, glow = 0 } = {}) => {
    const archY = STOREYS[FLOOR_Y.filter((f) => f <= cy).length - 1].y1 - 0.86;   // the architrave over this wall
    put(boxN(aw + 0.3, ah + 0.3, 0.07, 0.02), frame, side, u, cy, { cast: true });
    put(boxN(aw + 0.11, ah + 0.11, 0.03, 0.06), M.brass, side, u, cy);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, emissive: glow ? 0xffe6bf : 0x000000, emissiveMap: glow ? tex : null, emissiveIntensity: glow });
    put(new THREE.PlaneGeometry(aw, ah).translate(0, 0, 0.095), mat, side, u, cy);
    // a slim brass picture light above
    // a slim brass picture light above, always below the architrave
    const ly = Math.min(cy + ah / 2 + 0.3, archY - 0.08);
    put(new THREE.CylinderGeometry(0.025, 0.025, Math.min(aw, 1.8), 10).rotateZ(Math.PI / 2).translate(0, 0, 0.32), M.brass, side, u, ly);
    put(boxN(0.03, 0.26, 0.02, 0.1).rotateX(-0.9), M.brassDark, side, u, ly - 0.1);
  };

  for (const { s, y0, y1 } of STOREYS) {
    const h = y1 - y0;
    for (const side of ["N", "S", "W", "E"]) {
      const len = SIDE[side].len, half = len / 2;
      const piers = side === "N" || side === "S" ? PILASTER_XS : END_PILASTERS;
      const bounds = [-half, ...piers, half];
      const gate = side === "E" && s === 0 ? [-2.62, 2.62] : null;
      const runs = gate ? [[-half, gate[0]], [gate[1], half]] : [[-half, half]];
      // skirting, dado backing, chair rail
      for (const [a, b] of runs) {
        const L = b - a, c = (a + b) / 2;
        put(mouldGeo(PROFILE.base, L), M.woodDark, side, c, y0);
        put(boxN(L, 0.86, 0.02), M.wood, side, c, y0 + 0.22 + 0.43);
        put(mouldGeo(PROFILE.chair, L), M.woodDark, side, c, y0 + 1.06);
      }
      // the timber order under the ceiling: 额枋 painted architrave (y1-0.86 … -0.44),
      // 平板枋 plate, a row of 斗拱 bracket sets, and the top beam meeting the ceiling
      const archY = y1 - 0.86;
      put(cached(`arch${len}`, () => boxN(len, 0.42, 0.13)), M.woodDark, side, 0, archY + 0.21, { cast: true });
      put(cached(`archP${len}`, () => { const g = new THREE.PlaneGeometry(len, 0.32).translate(0, 0, 0.134); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / (0.32 * 8)); return g; }), paint, side, 0, archY + 0.21);
      for (const dy of [0.035, 0.385]) put(cached(`archG${len}`, () => boxN(len, 0.018, 0.012, 0.13)), gilt, side, 0, archY + dy);
      put(cached(`plate${len}`, () => boxN(len, 0.08, 0.22)), M.woodDark, side, 0, archY + 0.46);
      put(cached(`topb${len}`, () => boxN(len, 0.12, 0.38)), M.woodDark, side, 0, y1 - 0.06, { cast: true });
      {
        const bs = cached("bset", bracketSet);
        const us = new Set();
        for (let i = 0; i < bounds.length - 1; i++) {
          const a = bounds[i], b = bounds[i + 1], n = Math.max(1, Math.round((b - a) / 1.05));
          for (let k = 0; k <= n; k++) us.add(+(a + ((b - a) * k) / n).toFixed(3));
        }
        for (const u of us) {
          if (Math.abs(u) > half - 0.3) continue;
          put(bs.arms, bracketPaint, side, u, y1 - 0.36);
          put(bs.blocks, bracketBlue, side, u, y1 - 0.36);
        }
      }
      // bays: raised panels below, silk above (plaster on the windowed east wall)
      for (let i = 0; i < bounds.length - 1; i++) {
        const a = bounds[i] + (i > 0 ? 0.22 : 0.05), b = bounds[i + 1] - (i < bounds.length - 2 ? 0.22 : 0.05);   // the silk meets the post
        const w = b - a, c = (a + b) / 2;
        if (w < 0.6) continue;
        const inGate = gate && c > gate[0] - 0.5 && c < gate[1] + 0.5;
        if (!inGate) {
          const n = Math.max(1, Math.round(w / 1.6)), pw = w / n;
          for (let k = 0; k < n; k++) put(cached(`p${pw.toFixed(2)}`, () => raisedPanel(pw - 0.22, 0.5)), M.woodDark, side, a + pw * (k + 0.5), y0 + 0.64);
        }
        if (side === "E" && !inGate) {
          // the plaster bays of the windowed east wall get the same timber frame as the silk bays
          const fy0 = y0 + 1.2, fy1 = y1 - 0.86, fh = fy1 - fy0;
          for (const [bw, bh, du, dy] of [[w - 0.04, 0.05, 0, fh / 2], [w - 0.04, 0.05, 0, -fh / 2], [0.05, fh, -(w - 0.08) / 2, 0], [0.05, fh, (w - 0.08) / 2, 0]])
            put(boxN(bw, bh, 0.03), M.woodDark, side, c + du, fy0 + fh / 2 + dy);
        }
        if (side !== "E") {
          const fy0 = y0 + 1.2, fy1 = y1 - 0.86, fh = fy1 - fy0;
          const fg = new THREE.PlaneGeometry(w - 0.1, fh).translate(0, 0, 0.012);
          { const uv = fg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w - 0.1) / 0.75, uv.getY(i) * fh / 0.75); }
          put(fg, FAB[s], side, c, fy0 + fh / 2);
          for (const [bw, bh, du, dy] of [[w - 0.04, 0.04, 0, fh / 2], [w - 0.04, 0.04, 0, -fh / 2], [0.04, fh, -(w - 0.08) / 2, 0], [0.04, fh, (w - 0.08) / 2, 0]])
            put(boxN(bw, bh, 0.028), M.woodDark, side, c + du, fy0 + fh / 2 + dy);
        }
      }
      // posts: lacquered timber, half engaged in the wall, on 柱础 stone drum bases,
      // with a painted band where they meet the architrave and 雀替 brackets beneath it
      for (const u of piers) {
        if (gate && u > gate[0] - 0.4 && u < gate[1] + 0.4) continue;
        const archY = y1 - 0.86, sy = y0 + 0.27, shaftH = archY - sy;
        put(cached("pb0", () => boxN(0.72, 0.07, 0.36)), stoneBase, side, u, y0 + 0.035, { cast: true });           // square plinth
        put(cached("pb1", () => halfLathe(DRUM)), stoneBase, side, u, y0 + 0.07, { cast: true });                      // the drum
        put(cached(`ps${shaftH.toFixed(2)}`, () => halfCyl(0.225, 0.212, shaftH)), lacquerPost, side, u, sy, { cast: true });
        // 箍头: gilt rings framing a mineral-green band under the architrave
        put(cached("pk1", () => halfCyl(0.216, 0.216, 0.13, 0.02)), bracketPaint, side, u, archY - 0.16);
        for (const dy of [-0.175, -0.03]) put(cached("pk2", () => halfCyl(0.221, 0.221, 0.022, 0.02)), gilt, side, u, archY + dy);
        // 雀替 either side, tucked under the architrave
        for (const sgn of [-1, 1]) {
          const m = put(cached("qt", () => queTi(0.78, 0.34, 0.1)), queTiPaint, side, u + sgn * 0.19, archY);
          m.scale.x = sgn;
        }
      }
      // wall sconces in the west bays (emissive; real lights only on the ground floor)
      if (side === "W") for (const u of [-6.2, 6.2]) {   // mounted on the pilaster faces
        const g = new THREE.Group();
        g.position.set(...SIDE.W.at(u, y0 + 2.55)); g.rotation.y = SIDE.W.ry; g.translateZ(0.25);
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.36, 0.04).translate(0, 0, 0.02), M.brassDark));
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), M.brass); arm.rotation.x = Math.PI / 2.6; arm.position.set(0, -0.02, 0.14); g.add(arm);
        const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.24, 6, 1, true), silkGlow); shade.position.set(0, 0.16, 0.26); g.add(shade);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.05, 6), M.brass); cap.position.set(0, 0.3, 0.26); g.add(cap);
        arch.add(g); out.sconces.push(g);
      }
    }
  }

  /* wall content per storey */
  const artFor = (i) => ARTS[i % ARTS.length];
  const paintingSize = (art, maxW, maxH) => (art.ar >= maxW / maxH ? [maxW, maxW / art.ar] : [maxH * art.ar, maxH]);
  // storey 1: the six paintings, twice, one per bay above the vitrines
  ["N", "S"].forEach((side, si) => [-12.5, -7.5, -2.5, 2.5, 7.5, 12.5].forEach((u, i) => {
    const art = artFor(i + si * 3);
    const [aw, ah] = paintingSize(art, 2.7, 1.6);
    hang(side, u, 2.75, loadArtTexture(art.d), aw, ah);
  }));
  // storey 2: 石谱 plates of catalog specimens (cabinets stand in the outer bays)
  if (plates.length) ["N", "S"].forEach((side) => [-12.5, -7.5, -2.5, 2.5, 7.5, 12.5].forEach((u) => {
    const sp = nextPlate();
    hang(side, u, UF_Y + 2.75, plateTexture(sp), 1.12, 1.6, { frame: lacquerBlack, glow: 0.12 });
  }));
  // storey 3: rock-class panels in the centre bays, plates in the outer bays
  if (specimens.length) {
    const cls = ["igneous", "sedimentary", "metamorphic", "silica"];
    [["N", -2.5], ["N", 2.5], ["S", 2.5], ["S", -2.5]].forEach(([side, u], i) => hang(side, u, UF2_Y + 2.72, classPanelTexture(cls[i], specimens), 1.25, 1.7, { frame: lacquerBlack, glow: 0.1 }));
    ["N", "S"].forEach((side) => [-12.5, -7.5, 7.5, 12.5].forEach((u) => hang(side, u, UF2_Y + 2.75, plateTexture(nextPlate()), 1.12, 1.6, { frame: lacquerBlack, glow: 0.12 })));
    // west wall: the scholar's-rock panel on storey 3, a large painting on storey 2
    hang("W", 0, UF2_Y + 2.72, classPanelTexture("scholar", specimens), 1.25, 1.7, { frame: lacquerBlack, glow: 0.1 });
  }
  { const art = artFor(0); const [aw, ah] = paintingSize(art, 3.4, 1.65); hang("W", 0, UF_Y + 2.75, loadArtTexture(art.d), aw, ah, { glow: 0.12 }); }
  ["W"].forEach((side) => [-8.05, 8.05].forEach((u, i) => { if (plates.length) { hang(side, u, UF_Y + 2.75, plateTexture(nextPlate()), 1.0, 1.42, { frame: lacquerBlack, glow: 0.12 }); hang(side, u, UF2_Y + 2.75, plateTexture(nextPlate()), 1.0, 1.42, { frame: lacquerBlack, glow: 0.12 }); } }));

  /* east wall windows: frames through the wall, lattice both faces, paper panes */
  for (const wdw of EAST_WINDOWS) {
    const { z, y0, y1, w } = wdw, hgt = y1 - y0, cy = (y0 + y1) / 2;
    const x0 = HW + 0.1, x1 = HW + 0.52, xc = (x0 + x1) / 2, dep = x1 - x0;
    add(new THREE.BoxGeometry(dep, 0.1, w + 0.2), M.woodDark, xc, y0 - 0.05, z);
    add(new THREE.BoxGeometry(dep, 0.1, w + 0.2), M.woodDark, xc, y1 + 0.05, z);
    add(new THREE.BoxGeometry(dep, hgt, 0.1), M.woodDark, xc, cy, z - w / 2 - 0.05);
    add(new THREE.BoxGeometry(dep, hgt, 0.1), M.woodDark, xc, cy, z + w / 2 + 0.05);
    add(new THREE.BoxGeometry(0.06, 0.14, w + 0.5), M.woodDark, EAST_FACE - 0.03, y1 + 0.17, z);   // interior head moulding
    add(new THREE.BoxGeometry(0.08, 0.06, w + 0.36), M.woodDark, EAST_FACE - 0.04, y0 - 0.12, z);  // sill
    const pin = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), daylight); pin.rotation.y = -Math.PI / 2; pin.position.set(HW + 0.27, cy, z); arch.add(pin);
    const pout = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), paperOut); pout.rotation.y = Math.PI / 2; pout.position.set(HW + 0.33, cy, z); arch.add(pout);
    for (const fx of [HW + 0.24, HW + 0.36]) {
      for (let k = 1; k < Math.round(w / 0.2); k++) add(cached("lv" + hgt.toFixed(2), () => new THREE.BoxGeometry(0.025, hgt, 0.022)), M.woodDark, fx, cy, z - w / 2 + (k * w) / Math.round(w / 0.2));
      for (let k = 1; k < Math.round(hgt / 0.22); k++) add(cached("lh" + w.toFixed(2), () => new THREE.BoxGeometry(0.025, 0.022, w)), M.woodDark, fx, y0 + (k * hgt) / Math.round(hgt / 0.22), z);
    }
  }

  /* ---------------- floor slabs (storeys 2 and 3) ---------------- */
  const slabShape = (s) => {
    const shape = new THREE.Shape([[-HW, -HD], [HW, -HD], [HW, HD], [-HW, HD]].map(([x, z]) => new THREE.Vector2(x, z)));
    const hole = (x0, x1, z0, z1) => { const p = new THREE.Path(); p.moveTo(x0, z0); p.lineTo(x0, z1); p.lineTo(x1, z1); p.lineTo(x1, z0); p.closePath(); shape.holes.push(p); };
    hole(ATRIUM.x0, ATRIUM.x1, ATRIUM.z0, ATRIUM.z1);
    if (s === 2) STAIRWELLS.forEach((w) => hole(w.x0, w.x1, w.z0, w.z1));
    return shape;
  };
  for (const s of [1, 2]) {
    const y = FLOOR_Y[s];
    const geo = new THREE.ShapeGeometry(slabShape(s));
    // top: the shared floor material, uv normalised like the ground floor
    const top = geo.clone(); { const uv = top.attributes.uv, p = top.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + HW) / (HW * 2), (p.getY(i) + HD) / (HD * 2)); }
    const tm = new THREE.Mesh(top, M.floor); tm.rotation.x = -Math.PI / 2; tm.position.y = y; tm.receiveShadow = true; tm.castShadow = true; arch.add(tm);   // (z mirrored; the voids are symmetric in z)
    // underside: the painted coffer ceiling of the storey below (uv = world metres)
    const um = new THREE.Mesh(geo, caisson); um.rotation.x = Math.PI / 2; um.position.y = y - SLAB_T; um.castShadow = true; arch.add(um);
  }
  // roof ceiling over storey 3 (with the skylight lantern over the atrium)
  {
    const shape = new THREE.Shape([[-HW, -HD], [HW, -HD], [HW, HD], [-HW, HD]].map(([x, z]) => new THREE.Vector2(x, z)));
    const p = new THREE.Path(); p.moveTo(ATRIUM.x0, ATRIUM.z0); p.lineTo(ATRIUM.x0, ATRIUM.z1); p.lineTo(ATRIUM.x1, ATRIUM.z1); p.lineTo(ATRIUM.x1, ATRIUM.z0); p.closePath(); shape.holes.push(p);
    // the roof ceiling blocks the overhead key: daylight enters only through the lantern
    const um = new THREE.Mesh(new THREE.ShapeGeometry(shape), caisson); um.rotation.x = Math.PI / 2; um.position.y = HH; um.castShadow = true; arch.add(um);
  }

  /* coffer beam grid under every ceiling: lands on the wall pilasters */
  const beamDepth = 0.4, beamW = 0.3;
  const ceilings = [FLOOR_Y[1] - SLAB_T, FLOOR_Y[2] - SLAB_T, HH];
  ceilings.forEach((cy, ci) => {
    const yb = cy - beamDepth / 2;
    const holes = ci === 1 ? STAIRWELLS : [];
    const segZ = (x) => {   // a beam along z at x, broken by voids
      const cuts = [];
      if (x > ATRIUM.x0 - 0.2 && x < ATRIUM.x1 + 0.2) cuts.push([ATRIUM.z0, ATRIUM.z1]);
      for (const w of holes) if (x > w.x0 - 0.2 && x < w.x1 + 0.2) cuts.push([w.z0, w.z1]);
      let segs = [[-HD, HD]];
      for (const [a, b] of cuts) segs = segs.flatMap(([p, q]) => (b <= p || a >= q ? [[p, q]] : [[p, a], [b, q]].filter(([m, n]) => n - m > 0.3)));
      return segs;
    };
    // the beams are painted like the architraves (彩画 on both faces, a gilt line under each band)
    const sides = (L, h, along, x, y, z, off) => {
      for (const sg of [-1, 1]) {
        const g = new THREE.PlaneGeometry(L, h);
        const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * L / (h * 8));
        const m = add(g, paint, along === "z" ? x + sg * off : x, y, along === "z" ? z : z + sg * off, { recv: true });
        m.rotation.y = along === "z" ? (sg > 0 ? Math.PI / 2 : -Math.PI / 2) : (sg > 0 ? 0 : Math.PI);
      }
    };
    // the underside: the same painted band, so a beam overhead reads painted, not bare
    const soffit = (w, L, x, y, z, alongZ) => {
      const g = new THREE.PlaneGeometry(alongZ ? w : L, alongZ ? L : w);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) { const u0 = uv.getX(i), v0 = uv.getY(i); if (alongZ) uv.setXY(i, v0 * L / (w * 8), u0); else uv.setX(i, u0 * L / (w * 8)); }
      const m = add(g, paint, x, y, z, { recv: true }); m.rotation.x = Math.PI / 2;
    };
    for (const x of PILASTER_XS) for (const [a, b] of segZ(x)) {
      add(new THREE.BoxGeometry(beamW, beamDepth, b - a), M.woodDark, x, yb, (a + b) / 2);
      sides(b - a - 0.02, beamDepth * 0.72, "z", x, yb, (a + b) / 2, beamW / 2 + 0.002);
      soffit(beamW * 0.8, b - a - 0.02, x, yb - beamDepth / 2 - 0.002, (a + b) / 2, true);
    }
    for (const z of [-9.9, -6.2, 6.2, 9.9]) {
      add(new THREE.BoxGeometry(HW * 2, beamDepth * 0.8, beamW * 0.9), M.woodDark, 0, cy - beamDepth * 0.4, z);
      soffit(HW * 2 - 0.02, beamW * 0.72, 0, cy - beamDepth * 0.8 - 0.002, z, false);
      sides(HW * 2 - 0.02, beamDepth * 0.58, "x", 0, cy - beamDepth * 0.4, z, beamW * 0.45 + 0.002);
    }
    // (the beams land on the wall's top beam, over the bracket set on each post)
  });

  /* ---------------- atrium structure: columns, edge beams, balustrades ---------------- */
  const COLS = [[-7, -4], [-5, -4], [5, -4], [7, -4], [-7, 4], [-5, 4], [5, 4], [7, 4]];
  const colH = HH - 0.5;
  const colGeo = new THREE.LatheGeometry([[0, 0], [0.25, 0], [0.25, 0.04], ...Array.from({ length: 9 }, (_, i) => { const t = i / 8; return [0.24 - 0.025 * t * t, 0.1 + t * (colH - 0.2)]; }), [0.245, colH - 0.08], [0.25, colH], [0, colH]].map(([r, y]) => new THREE.Vector2(r, y)), 24);
  // 柱础: a square granite plinth with a chamfered top, and a carved drum (scaled from the wall posts')
  const plinthGeo = (() => { const g = new THREE.CylinderGeometry(0.52, 0.56, 0.12, 4, 1).rotateY(Math.PI / 4); g.translate(0, 0.06, 0); return g; })();
  const drumGeo = new THREE.LatheGeometry(DRUM.map(([r, y]) => new THREE.Vector2(r * 1.2, 0.12 + y * 1.3)), 40);
  const ringGeo = (r, h) => new THREE.CylinderGeometry(r, r, h, 32, 1, true);
  for (const [x, z] of COLS) {
    add(colGeo, lacquerRed, x, 0, z, { cast: true });
    add(plinthGeo, stoneBase, x, 0, z, { cast: true });
    add(drumGeo, stoneBase, x, 0, z, { cast: true });
    // 箍头 under each edge beam: gilt rings framing a mineral-green band
    for (const ytop of [FLOOR_Y[1], FLOOR_Y[2], HH + 0.3]) {
      const yb = ytop - SLAB_T - 0.6;
      add(cached("ck1", () => ringGeo(0.258, 0.2)), bracketPaint, x, yb - 0.12, z);
      for (const dy of [-0.23, -0.01]) add(cached("ck2", () => ringGeo(0.264, 0.03)), gilt, x, yb + dy, z);
    }
    for (const s of [0, 1, 2]) out.colliders.push({ x, z, r: 0.45, floor: s });
    // 雀替 bracket pairs under each edge beam, both directions
    for (const cy of [FLOOR_Y[1] - SLAB_T - 0.6, FLOOR_Y[2] - SLAB_T - 0.6, HH - 0.6]) {
      for (const [dx, dz] of [[1, 0], [-1, 0]]) {
        if ((x === -7 && dx < 0) || (x === 7 && dx > 0)) continue;
        const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.9, 0); sh.quadraticCurveTo(0.5, -0.05, 0.35, -0.22); sh.quadraticCurveTo(0.18, -0.4, 0, -0.42); sh.lineTo(0, 0);
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false, curveSegments: 8 }); g.translate(0, 0, -0.06);
        const m = add(g, M.woodDark, x + dx * 0.22, cy, z); m.scale.x = dx;
      }
    }
  }
  // edge beams at each slab and at the roof, painted on the atrium face
  for (const ytop of [FLOOR_Y[1], FLOOR_Y[2], HH + 0.3]) {
    const ybot = ytop - SLAB_T - 0.6, cy = (ytop + ybot) / 2, bh = ytop - ybot;
    const edges = [
      [0, ATRIUM.z0, ATRIUM.x1 - ATRIUM.x0 + 0.34, 0.34, 0, 1], [0, ATRIUM.z1, ATRIUM.x1 - ATRIUM.x0 + 0.34, 0.34, Math.PI, 1],
      [ATRIUM.x0, 0, 0.34, ATRIUM.z1 - ATRIUM.z0, -Math.PI / 2, 0], [ATRIUM.x1, 0, 0.34, ATRIUM.z1 - ATRIUM.z0, Math.PI / 2, 0],
    ];
    for (const [x, z, w, d, faceRy, alongX] of edges) {
      add(new THREE.BoxGeometry(w, bh, d), M.woodDark, x, cy, z, { cast: true });
      const L = alongX ? w - 0.34 : d;
      const bg = new THREE.PlaneGeometry(L, bh * 0.62);
      { const uv = bg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * L / (bh * 0.62 * 8)); }
      // painted on both faces (the outer face is what you see from under the gallery)
      for (const face of ytop > HH ? [1] : [1, -1]) {
        const band = new THREE.Mesh(bg, paint);
        const nx = alongX ? 0 : (x < 0 ? 1 : -1) * 0.172 * face, nz = alongX ? (z < 0 ? 1 : -1) * 0.172 * face : 0;
        band.position.set(x + nx, cy - 0.04, z + nz);
        band.rotation.y = (alongX ? (z < 0 ? 0 : Math.PI) : (x < 0 ? Math.PI / 2 : -Math.PI / 2)) + (face < 0 ? Math.PI : 0);
        arch.add(band);
      }
      add(new THREE.BoxGeometry(alongX ? w + 0.1 : 0.42, 0.05, alongX ? 0.42 : d + 0.1), M.brassDark, x, ybot - 0.02, z);
      void faceRy;
    }
  }

  /* 勾栏 balustrade: lacquered posts with lotus finials, round top rail, carved panels */
  const panelGeo = (() => {   // 华板: a pierced panel — four lobed openings around a medallion
    const w = 0.84, hgt = 0.42;
    const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, hgt); sh.lineTo(-w / 2, hgt); sh.lineTo(-w / 2, 0);
    const lobe = (cx, cy, rx, ry) => { const p = new THREE.Path(); p.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, true); sh.holes.push(p); };
    lobe(-0.26, 0.21, 0.11, 0.13); lobe(0.26, 0.21, 0.11, 0.13);
    const ring = new THREE.Path(); ring.absarc(0, 0.21, 0.13, 0, Math.PI * 2, true); sh.holes.push(ring);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 14 });
    g.translate(0, 0, -0.0175); return g;
  })();
  const postGeo = new THREE.BoxGeometry(0.13, 1.0, 0.13);
  const finialGeo = new THREE.LatheGeometry([[0, 0], [0.06, 0], [0.06, 0.02], [0.038, 0.035], [0.05, 0.07], [0.045, 0.1], [0.022, 0.14], [0, 0.16]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
  const railGeo = (L) => new THREE.CylinderGeometry(0.035, 0.035, L, 10).rotateZ(Math.PI / 2);
  const balustrade = (y, x0, z0, x1, z1, skip = null) => {
    const L = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(-(z1 - z0), x1 - x0);
    const n = Math.max(1, Math.round(L / 0.95));
    for (let i = 0; i <= n; i++) {
      const t = i / n, px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
      if (skip && skip(px, pz)) continue;
      add(postGeo, lacquerRed, px, y + 0.5, pz, { cast: true });
      add(finialGeo, M.brassDark, px, y + 1.0, pz);
    }
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
      if (skip && skip(px, pz)) continue;
      const seg = L / n - 0.13;
      const sc = seg / 0.84;
      const pan = add(panelGeo, lacquerRed, px, y + 0.14, pz, { ry: ang }); pan.scale.x = sc;
      add(railGeo(seg), lacquerRed, px, y + 0.95, pz, { ry: ang, cast: true });
      add(new THREE.BoxGeometry(seg, 0.06, 0.08), lacquerRed, px, y + 0.6, pz, { ry: ang });
      add(new THREE.BoxGeometry(seg, 0.1, 0.1), lacquerRed, px, y + 0.08, pz, { ry: ang });
      // 净瓶 vase-shaped struts between the panel and the top rail
      for (const f of [-0.25, 0.25]) {
        const vx = px + Math.cos(-ang) * f * seg, vz = pz + Math.sin(-ang) * f * seg;
        add(cached("vase", () => new THREE.LatheGeometry([[0, 0], [0.04, 0], [0.055, 0.08], [0.03, 0.18], [0.04, 0.26], [0.025, 0.3], [0, 0.3]].map(([r, yy]) => new THREE.Vector2(r, yy)), 7)), lacquerRed, vx, y + 0.63, vz);
      }
    }
  };
  // runs between the columns (posts never collide with a column); the stair
  // mouth on storey 2 is left open with newel-like end posts
  const CI = 0.3;   // inset from a column centre
  for (const s of [1, 2]) {
    const y = FLOOR_Y[s];
    for (const z of [ATRIUM.z0, ATRIUM.z1]) {
      balustrade(y, -7 + CI, z, -5 - CI, z); balustrade(y, 5 + CI, z, 7 - CI, z);
      if (s === 1 && z === ATRIUM.z0) { balustrade(y, -5 + CI, z, STAIR.xc - STAIR.halfW - 0.2, z); balustrade(y, STAIR.xc + STAIR.halfW + 0.2, z, 5 - CI, z); }
      else balustrade(y, -5 + CI, z, 5 - CI, z);
    }
    for (const x of [ATRIUM.x0, ATRIUM.x1]) balustrade(y, x, ATRIUM.z0 + CI, x, ATRIUM.z1 - CI);
  }
  // around the two stairwells on storey 3 (open on the landing side)
  for (const w of STAIRWELLS) {
    const y = UF2_Y, westSide = w.x0 < 0;
    const inner = westSide ? w.x1 : w.x0;
    balustrade(y, w.x0, w.z0, w.x1, w.z0); balustrade(y, w.x0, w.z1, w.x1, w.z1);
    balustrade(y, inner, w.z0, inner, w.z1);
    // slab edge fascia around the opening
    for (const [x, z, a, b] of [[(w.x0 + w.x1) / 2, w.z0, w.x1 - w.x0, 0.06], [(w.x0 + w.x1) / 2, w.z1, w.x1 - w.x0, 0.06], [inner, 0, 0.06, w.z1 - w.z0]])
      add(new THREE.BoxGeometry(a, SLAB_T + 0.08, b), M.woodDark, x, y - SLAB_T / 2, z);
  }

  /* ---------------- staircases ---------------- */
  // tread with a bullnose nosing: profile in (run, height), extruded across the width
  const treadGeo = (run, W) => {
    const sh = new THREE.Shape(); sh.moveTo(run, -0.05); sh.lineTo(run, 0); sh.lineTo(0, 0);
    sh.quadraticCurveTo(-0.04, 0, -0.04, -0.025); sh.quadraticCurveTo(-0.04, -0.05, 0, -0.05); sh.lineTo(run, -0.05);
    const g = new THREE.ExtrudeGeometry(sh, { depth: W, bevelEnabled: false, curveSegments: 6 });
    g.rotateY(-Math.PI / 2); g.translate(W / 2, 0, 0); return g;
  };
  const balusterGeo = new THREE.LatheGeometry([[0, 0], [0.04, 0], [0.04, 0.05], [0.028, 0.08], [0.03, 0.12], [0.045, 0.24], [0.034, 0.38], [0.022, 0.46], [0.03, 0.52], [0.022, 0.58], [0.022, 0.66], [0.032, 0.7], [0.032, 0.745], [0, 0.745]].map(([r, y]) => new THREE.Vector2(r, y)), 8);
  const newelGeo = (() => {
    const g = new THREE.Group();
    const add2 = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = true; g.add(m); };
    add2(new THREE.BoxGeometry(0.26, 0.16, 0.26), lacquerBlack, 0.08);
    add2(new THREE.BoxGeometry(0.2, 0.98, 0.2), lacquerBlack, 0.65);
    add2(new THREE.BoxGeometry(0.24, 0.06, 0.24), M.brass, 1.17);
    add2(new THREE.BoxGeometry(0.28, 0.08, 0.28), lacquerBlack, 1.24);
    const fin = new THREE.Mesh(finialGeo, M.brass); fin.scale.setScalar(1.5); fin.position.y = 1.28; g.add(fin);
    for (const sd of [0, 1, 2, 3]) {   // inset panel on each face
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.62, 0.01), M.woodDark);
      p.position.set(Math.sin(sd * Math.PI / 2) * 0.103, 0.65, Math.cos(sd * Math.PI / 2) * 0.103); p.rotation.y = sd * Math.PI / 2; g.add(p);
    }
    return g;
  })();
  const handrailGeo = (L) => {
    const sh = new THREE.Shape(); sh.moveTo(-0.03, -0.035); sh.lineTo(0.03, -0.035); sh.lineTo(0.03, -0.01);
    sh.quadraticCurveTo(0.05, 0.0, 0.045, 0.02); sh.quadraticCurveTo(0.03, 0.045, 0, 0.045); sh.quadraticCurveTo(-0.03, 0.045, -0.045, 0.02);
    sh.quadraticCurveTo(-0.05, 0, -0.03, -0.01); sh.lineTo(-0.03, -0.035);
    return new THREE.ExtrudeGeometry(sh, { depth: L, bevelEnabled: false, curveSegments: 6 });
  };
  /**
   * A flight in its own frame (foot at local z = 0, climbing +z), then placed.
   * @param {object} o { x, y, z, yaw, steps, rise, run, W, endPanel }
   */
  const flight = (o) => {
    const { steps, rise, run, W } = o;
    const L = steps * run, H = steps * rise, pitch = Math.atan2(H, L);
    const g = new THREE.Group(); g.position.set(o.x, o.y, o.z); g.rotation.y = o.yaw;
    const A = (geo, mat, x, y, z, opt = {}) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (opt.rx) m.rotation.x = opt.rx; m.castShadow = !!opt.cast; m.receiveShadow = true; g.add(m); return m; };
    const tg = treadGeo(run, W), rg = new THREE.BoxGeometry(W - 0.02, rise, 0.03);
    const cw = Math.min(1.5, W * 0.62);
    for (let i = 0; i < steps; i++) {
      A(tg, stairMat, 0, (i + 1) * rise, i * run, { cast: true });
      A(rg, stairMat, 0, i * rise + rise / 2 - 0.05, i * run + 0.015);
      A(cached("crt" + cw, () => new THREE.BoxGeometry(cw, 0.012, run + 0.02)), M.carpet, 0, (i + 1) * rise + 0.006, i * run + run / 2 - 0.01);
      A(cached("crr" + cw + rise.toFixed(3), () => new THREE.BoxGeometry(cw, rise - 0.06, 0.012)), M.carpet, 0, i * rise + rise / 2 - 0.02, i * run - 0.007);
      A(cached("rod" + cw, () => new THREE.CylinderGeometry(0.011, 0.011, cw + 0.12, 8).rotateZ(Math.PI / 2)), M.brass, 0, i * rise + 0.016, i * run - 0.02);
    }
    // closed spandrels down to the floor, with panelling, on both sides
    for (const sx of [-1, 1]) {
      const tp = Math.tan(pitch), z0 = (0.6 - rise) / tp;   // where an open string's soffit meets the floor
      const sh = new THREE.Shape(); sh.moveTo(-0.08, 0);
      if (o.closed) sh.lineTo(L, 0); else { sh.lineTo(z0, 0); sh.lineTo(L, rise + L * tp - 0.6); }
      sh.lineTo(L, rise + L * tp + 0.14); sh.lineTo(-0.08, rise + 0.14 - 0.08 * tp); sh.lineTo(-0.08, 0);
      const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: false }); sg.rotateY(-Math.PI / 2);
      A(sg, lacquerRed, sx * (W / 2 + 0.05) + 0.05, 0, 0, { cast: true });   // lacquered like the balustrade it carries
      // recessed fielded panels following the slope + a brass string line
      const np = o.closed ? Math.max(2, Math.round(L / 1.4)) : 0;
      for (let k = 0; k < np; k++) {
        const z0 = 0.25 + (k * (L - 0.4)) / np, z1 = z0 + (L - 0.4) / np - 0.16, zc = (z0 + z1) / 2;
        const topY = rise + z0 * Math.tan(pitch) - 0.25;
        if (topY < 0.5) continue;
        const pan = A(cached(`sp${(z1 - z0).toFixed(2)}${topY.toFixed(1)}`, () => raisedPanel(z1 - z0, topY - 0.35).rotateY(Math.PI / 2)), lacquerBlack, sx * (W / 2 + 0.105), 0.2 + (topY - 0.35) / 2 + 0.05, zc);
        pan.scale.x = sx;
      }
      const sl = Math.hypot(L, H);
      const line = A(new THREE.BoxGeometry(0.012, 0.03, sl), M.brass, sx * (W / 2 + 0.106), rise / 2 + H / 2 - 0.05, L / 2, { rx: -pitch });
      void line;
      // handrail on top of the string
      const hr = new THREE.Mesh(handrailGeo(sl + 0.2), lacquerRed);
      hr.position.set(sx * (W / 2 + 0.05), rise + 0.9, -0.1); hr.rotation.x = -pitch; hr.castShadow = true; g.add(hr);
      // two turned balusters per tread from the string cap to the rail
      for (let i = 0; i < steps; i++) for (const f of [0.25, 0.75]) {
        const z = (i + f) * run, yb = rise + z * Math.tan(pitch) + 0.14;
        A(balusterGeo, lacquerRed, sx * (W / 2 + 0.05), yb, z);
      }
      // newels at the foot and at the top
      const nf = newelGeo.clone(); nf.position.set(sx * (W / 2 + 0.05), 0, -0.12); g.add(nf);
      const nt = newelGeo.clone(); nt.position.set(sx * (W / 2 + 0.05), H, L - 0.12); g.add(nt);
    }
    if (!o.closed) {   // plaster soffit under an open flight, between the strings
      const zs = (0.6 - rise) / Math.tan(pitch);
      const sl = Math.hypot(L - zs, (rise + L * Math.tan(pitch) - 0.6));
      const sof = A(new THREE.PlaneGeometry(W, sl), M.paper, 0, (rise + L * Math.tan(pitch) - 0.6) / 2 - 0.01, (zs + L) / 2);
      sof.rotation.x = Math.PI / 2 - pitch;   // lies along the pitch, facing down
    }
    if (o.endPanel) {   // close the space under the top of the flight
      A(new THREE.BoxGeometry(W + 0.2, H, 0.08), lacquerRed, 0, H / 2, L - 0.04);
      A(raisedPanel(W * 0.7, H * 0.55), lacquerBlack, 0, H * 0.45, L - 0.085).rotation.y = Math.PI;
    }
    arch.add(g);
    return g;
  };
  // grand stair: ground → storey 2, inside the atrium, climbing −z
  flight({ x: STAIR.xc, y: 0, z: STAIR.zBottom, yaw: Math.PI, steps: STAIR.steps, rise: STAIR.rise, run: STAIR.run, W: STAIR.halfW * 2, endPanel: false, closed: false });
  // the paired second flights: storey 2 → 3, climbing toward the end walls
  flight({ x: -STAIR2.foot, y: UF_Y, z: 0, yaw: -Math.PI / 2, steps: STAIR2.steps, rise: STAIR2.rise, run: STAIR2.run, W: STAIR2.halfW * 2, endPanel: true, closed: true });
  flight({ x: STAIR2.foot, y: UF_Y, z: 0, yaw: Math.PI / 2, steps: STAIR2.steps, rise: STAIR2.rise, run: STAIR2.run, W: STAIR2.halfW * 2, endPanel: true, closed: true });

  /* ---------------- the skylight lantern over the atrium ---------------- */
  {
    const lx = ATRIUM.x1 - ATRIUM.x0, lz = ATRIUM.z1 - ATRIUM.z0, up = 1.4;
    const glass = new THREE.MeshBasicMaterial({ color: 0xfff1d8 });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(lx, lz), glass); top.rotation.x = Math.PI / 2; top.position.y = HH + up; arch.add(top);
    for (const [x, z, w, ry] of [[0, ATRIUM.z0, lx, 0], [0, ATRIUM.z1, lx, Math.PI], [ATRIUM.x0, 0, lz, Math.PI / 2], [ATRIUM.x1, 0, lz, -Math.PI / 2]]) {
      const clere = new THREE.Mesh(new THREE.PlaneGeometry(w, up), glass); clere.position.set(x, HH + up / 2, z); clere.rotation.y = ry; arch.add(clere);
    }
    for (let x = ATRIUM.x0; x <= ATRIUM.x1 + 0.01; x += lx / 8) add(new THREE.BoxGeometry(0.08, 0.14, lz), M.brassDark, x, HH + up - 0.07, 0);
    for (let z = ATRIUM.z0; z <= ATRIUM.z1 + 0.01; z += lz / 4) add(new THREE.BoxGeometry(lx, 0.14, 0.08), M.brassDark, 0, HH + up - 0.07, z);
    for (const [x, z] of [[ATRIUM.x0, ATRIUM.z0], [ATRIUM.x1, ATRIUM.z0], [ATRIUM.x0, ATRIUM.z1], [ATRIUM.x1, ATRIUM.z1]]) add(new THREE.BoxGeometry(0.2, up, 0.2), M.woodDark, x, HH + up / 2, z);
    for (let x = ATRIUM.x0 + lx / 8; x < ATRIUM.x1; x += lx / 8) for (const z of [ATRIUM.z0, ATRIUM.z1]) add(new THREE.BoxGeometry(0.06, up, 0.06), M.woodDark, x, HH + up / 2, z);
    // light falling through the atrium
    if (preset && preset.volumetrics && ctx.softBeam) {
      const shaftH = HH + up - 0.3;
      const sm = ctx.softBeam(0xfff0d2, 0.065, { axis: "uv", power: 1.4 });
      for (const [w, ry] of [[lx * 0.7, 0], [lz * 0.7, Math.PI / 2]]) {
        const sp = new THREE.Mesh(new THREE.PlaneGeometry(w, shaftH), sm); sp.position.set(0, shaftH / 2, 0); sp.rotation.y = ry; sp.renderOrder = 4; arch.add(sp); out.shafts.push(sp);
      }
    }
  }

  /* ---------------- palace lanterns (宫灯) hung through the atrium ---------------- */
  const palaceLantern = (scale) => {
    const g = new THREE.Group();
    const r = 0.36;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.92, 0.62, 6, 1, true), silkGlow); body.position.y = -0.55; g.add(body);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.74, 0.035), lacquerRed); post.position.set(Math.cos(a) * r, -0.55, Math.sin(a) * r); g.add(post);
      const tas = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 0.34, 6), M.velvet); tas.position.set(Math.cos(a) * (r + 0.12), -1.05, Math.sin(a) * (r + 0.12)); g.add(tas);
      const hook = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.03), lacquerRed); hook.position.set(Math.cos(a) * (r + 0.06), -0.2, Math.sin(a) * (r + 0.06)); hook.rotation.y = -a; g.add(hook);
    }
    for (const [y, rr, hh] of [[-0.17, r + 0.06, 0.08], [-0.93, r + 0.06, 0.08]]) { const ring = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, hh, 6), lacquerRed); ring.position.y = y; g.add(ring); }
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, r + 0.1, 0.16, 6), M.brass); crown.position.y = -0.06; g.add(crown);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, 0.12, 0.12, 6), M.brass); foot.position.y = -1.02; g.add(foot);
    const tasC = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.06, 0.5, 8), M.velvet); tasC.position.y = -1.32; g.add(tasC);
    g.scale.setScalar(scale);
    return g;
  };
  [[-4.6, 0.2, HH + 1.3, 8.6, 1.4], [4.6, 0.2, HH + 1.3, 8.6, 1.4], [0, 2.7, HH + 1.3, 6.2, 1.8], [-3.0, -2.2, HH + 1.3, 4.3, 1.1], [3.0, -2.2, HH + 1.3, 4.3, 1.1]].forEach(([x, z, hookY, y, sc], i) => {
    const grp = new THREE.Group(); grp.position.set(x, hookY, z);
    const chainL = hookY - y;
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, chainL, 6), M.brassDark); chain.position.y = -chainL / 2; grp.add(chain);
    const lan = palaceLantern(sc); lan.position.y = -chainL; grp.add(lan);
    grp.userData.swayPhase = i * 1.3;
    arch.add(grp); out.lanterns.push(grp);
  });

  /* pendants under the slabs along the carpet axis (ground storey) */
  for (const x of [-15.5, -10.5, 10.5, 15.5]) {
    const grp = new THREE.Group(); grp.position.set(x, FLOOR_Y[1] - SLAB_T - beamDepth, 0);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 6), M.brassDark); chain.position.y = -0.25; grp.add(chain);
    const lan = palaceLantern(0.75); lan.position.y = -0.5; grp.add(lan);
    grp.userData.swayPhase = x;
    arch.add(grp); out.lanterns.push(grp);
  }

  /* colliders for the paired flights' under-structure on storey 2 are handled by
     floorplan.canStep (the flights can only be entered at their ends) */
  return out;
}
