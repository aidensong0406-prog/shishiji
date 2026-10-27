import * as THREE from "three";
import { mkCanvas } from "./textures.js";

/* A blue-and-white porcelain floor vase (梅瓶, meiping) on a rosewood stand:
   a turned silhouette (small foot, broad shoulder, short neck, lipped mouth),
   painted in cobalt under a clear glaze — a 如意 cloud collar at the shoulder,
   a lotus scroll round the belly, lotus-petal panels at the foot. */

const COBALT = "#1f3b86", COBALT_DARK = "#142a66", GROUND = "#f3f1ea";

function decorTexture() {
  const W = 1024, H = 1024;
  const [c, g] = mkCanvas(W, H);
  g.fillStyle = GROUND; g.fillRect(0, 0, W, H);
  // v runs from the foot (bottom of the canvas) to the mouth (top): bands by height
  const band = (y0, y1) => { g.fillStyle = COBALT; g.fillRect(0, y0, W, 5); g.fillRect(0, y1 - 5, W, 5); };
  // foot: lotus-petal panels (莲瓣)
  band(800, 960);
  for (let i = 0; i < 12; i++) {
    const x = (i + 0.5) * (W / 12);
    g.strokeStyle = COBALT; g.lineWidth = 5;
    g.beginPath(); g.moveTo(x - 34, 945); g.quadraticCurveTo(x - 36, 845, x, 818); g.quadraticCurveTo(x + 36, 845, x + 34, 945); g.stroke();
    g.fillStyle = COBALT_DARK; g.beginPath(); g.moveTo(x - 14, 930); g.quadraticCurveTo(x, 860, x + 14, 930); g.fill();
  }
  // belly: a lotus scroll — a wave stem with blossoms and leaves
  band(330, 790);
  g.strokeStyle = COBALT; g.lineWidth = 7;
  g.beginPath();
  for (let x = 0; x <= W; x += 4) { const y = 560 + Math.sin((x / W) * Math.PI * 8) * 120; x ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  for (let i = 0; i < 4; i++) {
    for (const up of [1, -1]) {
      const x = (i + (up > 0 ? 0.25 : 0.75)) * (W / 4), y = 560 - up * 120;
      // blossom: layered petals around a dark heart
      g.fillStyle = COBALT;
      for (let k = -2; k <= 2; k++) { g.save(); g.translate(x, y); g.rotate(k * 0.42); g.beginPath(); g.ellipse(0, -38, 15, 40, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
      g.fillStyle = GROUND; for (let k = -2; k <= 2; k++) { g.save(); g.translate(x, y); g.rotate(k * 0.42); g.beginPath(); g.ellipse(0, -40, 5, 22, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
      g.fillStyle = COBALT_DARK; g.beginPath(); g.arc(x, y + 6, 18, 0, Math.PI * 2); g.fill();
      // curling leaves along the stem
      for (const s of [-1, 1]) { g.save(); g.translate(x + s * 70, y + up * 30); g.rotate(s * 0.6); g.fillStyle = COBALT; g.beginPath(); g.ellipse(0, 0, 34, 14, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
    }
  }
  // shoulder: 如意 cloud-collar lappets hanging from the neck
  band(130, 320);
  for (let i = 0; i < 8; i++) {
    const x = (i + 0.5) * (W / 8);
    g.fillStyle = COBALT; g.beginPath();
    g.moveTo(x - 58, 135); g.bezierCurveTo(x - 70, 210, x - 30, 230, x - 22, 260); g.bezierCurveTo(x - 12, 300, x + 12, 300, x + 22, 260); g.bezierCurveTo(x + 30, 230, x + 70, 210, x + 58, 135); g.closePath(); g.fill();
    g.fillStyle = GROUND; g.beginPath(); g.arc(x, 220, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = COBALT; g.beginPath(); g.arc(x, 220, 9, 0, Math.PI * 2); g.fill();
  }
  // neck: a plain cobalt ring
  g.fillStyle = COBALT; g.fillRect(0, 40, W, 26);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

let shared = null;
function parts() {
  if (shared) return shared;
  // meiping profile (radius, height) for a 1 m vase; v follows height
  const P = [[0.0, 0], [0.105, 0], [0.11, 0.015], [0.1, 0.03], [0.115, 0.12], [0.15, 0.32], [0.19, 0.52], [0.205, 0.64], [0.195, 0.72],
    [0.155, 0.8], [0.09, 0.87], [0.06, 0.9], [0.055, 0.94], [0.07, 0.965], [0.072, 0.98], [0.05, 0.99], [0.045, 0.94]];
  const geo = new THREE.LatheGeometry(P.map(([r, y]) => new THREE.Vector2(r, y)), 56);
  // v from height so the bands land where they are painted
  { const pos = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, pos.getY(i)); }
  const glaze = new THREE.MeshPhysicalMaterial({ map: decorTexture(), roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.9 });
  // rosewood stand: a round top, a waisted apron and five cabriole feet on a base ring
  const wood = new THREE.MeshStandardMaterial({ color: 0x2a120a, roughness: 0.38, metalness: 0.05, envMapIntensity: 0.6 });
  const top = new THREE.CylinderGeometry(0.17, 0.16, 0.03, 40).translate(0, 0.115, 0);
  const apron = new THREE.CylinderGeometry(0.15, 0.16, 0.04, 40).translate(0, 0.08, 0);
  const ring = new THREE.TorusGeometry(0.15, 0.012, 8, 40).rotateX(Math.PI / 2).translate(0, 0.012, 0);
  const feet = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2, f = new THREE.CylinderGeometry(0.012, 0.018, 0.075, 8);
    f.rotateZ(0.25); f.rotateY(-a); f.translate(Math.cos(a) * 0.15, 0.045, Math.sin(a) * 0.15); feet.push(f);
  }
  shared = { geo, glaze, wood, stand: [top, apron, ring, ...feet] };
  return shared;
}

/** a floor vase `h` metres tall on its stand, standing at (x, y, z) */
export function floorVase(h = 0.9, ry = 0) {
  const p = parts();
  const g = new THREE.Group();
  const s = h / 1.0;
  for (const sg of p.stand) { const m = new THREE.Mesh(sg, p.wood); m.castShadow = true; m.receiveShadow = true; m.scale.setScalar(s * 1.05); g.add(m); }
  const v = new THREE.Mesh(p.geo, p.glaze); v.castShadow = true; v.receiveShadow = true;
  v.scale.setScalar(s); v.position.y = 0.13 * s * 1.05; v.rotation.y = ry;
  g.add(v);
  return g;
}
