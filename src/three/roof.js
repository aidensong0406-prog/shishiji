import * as THREE from "three";
import { normalFromCanvas } from "../utils/surfaceMaps.js";
import { mulberry } from "../utils/math.js";

/* A Chinese pyramidal hip roof (攒尖顶) with a concave profile and upswept
   corners (翘角), clad in procedurally drawn grey clay tiles: rounded cover
   tiles (筒瓦) over pan tiles (板瓦) in overlapping courses. One texture tile
   covers 1 m × 1 m of roof. */

let tileTex = null;
function tileTextures() {
  if (tileTex) return tileTex;
  const S = 512, COLS = 5, ROWS = 6;            // ≈0.2 m columns, ≈0.17 m courses
  const col = document.createElement("canvas"); col.width = col.height = S;
  const hgt = document.createElement("canvas"); hgt.width = hgt.height = S;
  const g = col.getContext("2d"), h = hgt.getContext("2d");
  const r = mulberry(4242);
  const cw = S / COLS, rh = S / ROWS;
  g.fillStyle = "#3a3e3d"; g.fillRect(0, 0, S, S);
  h.fillStyle = "#404040"; h.fillRect(0, 0, S, S);
  for (let row = 0; row < ROWS; row++) {
    for (let c = 0; c < COLS; c++) {
      const x0 = c * cw, y0 = row * rh;
      const tone = 52 + Math.floor(r() * 16);
      // pan tile: a shallow trough, lighter at its lower (exposed) edge
      let gr = g.createLinearGradient(x0, y0, x0, y0 + rh);
      gr.addColorStop(0, `rgb(${tone - 14},${tone - 10},${tone - 11})`); gr.addColorStop(1, `rgb(${tone + 6},${tone + 9},${tone + 8})`);
      g.fillStyle = gr; g.fillRect(x0, y0, cw, rh);
      // cover tile roll centred on the column seam, cylindrical shading
      const cx = x0 + cw * 0.5, rw = cw * 0.42;
      gr = g.createLinearGradient(cx - rw / 2, 0, cx + rw / 2, 0);
      gr.addColorStop(0, `rgb(${tone - 22},${tone - 19},${tone - 20})`); gr.addColorStop(0.35, `rgb(${tone + 22},${tone + 25},${tone + 24})`);
      gr.addColorStop(1, `rgb(${tone - 26},${tone - 23},${tone - 24})`);
      g.fillStyle = gr; g.fillRect(cx - rw / 2, y0, rw, rh);
      const hg = h.createLinearGradient(cx - rw / 2, 0, cx + rw / 2, 0);
      hg.addColorStop(0, "#606060"); hg.addColorStop(0.5, "#f0f0f0"); hg.addColorStop(1, "#606060");
      h.fillStyle = hg; h.fillRect(cx - rw / 2, y0, rw, rh);
      // pan trough height
      const ph = h.createLinearGradient(x0, 0, x0 + cw, 0);
      ph.addColorStop(0, "#585858"); ph.addColorStop(0.5, "#2c2c2c"); ph.addColorStop(1, "#585858");
      h.fillStyle = ph; h.fillRect(x0, y0, cw * 0.29, rh); h.fillRect(x0 + cw * 0.71, y0, cw * 0.29, rh);
    }
    // overlap shadow where each course tucks under the one above
    const y = row * rh;
    const sh = g.createLinearGradient(0, y, 0, y + 10);
    sh.addColorStop(0, "rgba(10,12,12,0.85)"); sh.addColorStop(1, "rgba(10,12,12,0)");
    g.fillStyle = sh; g.fillRect(0, y, S, 10);
    h.fillStyle = "#101010"; h.fillRect(0, y, S, 3);
  }
  // weathering: lichen + soot speckle, slightly greenish and ochre
  for (let i = 0; i < 2600; i++) {
    const x = r() * S, y = r() * S, s = 1 + r() * 3.5, k = r();
    g.fillStyle = k < 0.5 ? `rgba(20,24,22,${0.15 + r() * 0.25})` : k < 0.8 ? `rgba(110,120,92,${0.08 + r() * 0.14})` : `rgba(150,128,90,${0.06 + r() * 0.1})`;
    g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
  }
  const map = new THREE.CanvasTexture(col);
  map.encoding = THREE.sRGBEncoding; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8;
  const normalMap = normalFromCanvas(hgt, { normalStrength: 3.2, size: 512 });
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping; normalMap.anisotropy = 8;
  tileTex = { map, normalMap };
  return tileTex;
}

/**
 * @param {object} o  { W: eave half-width (m), H: rise (m), lift: corner upsweep (m),
 *                      curve: profile exponent, woodMat, ridgeMat, segU, segV }
 * @returns THREE.Group with the roof's base at y = 0
 */
export function buildTiledRoof(o) {
  const { W = 2.2, H = 2.1, lift = 0.42, curve = 1.65, woodMat, ridgeMat, segU = 28, segV = 22 } = o;
  const { map, normalMap } = tileTextures();
  const tileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map, normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.78, metalness: 0.02, envMapIntensity: 0.45 });
  const group = new THREE.Group();
  const surf = (u, v) => {
    const k = 1 - v;
    const y = H * Math.pow(v, curve) + lift * Math.pow(Math.abs(u), 4) * k * k;
    return [u * W * k, y, W * k];
  };
  const slopeLen = Math.hypot(W, H);
  const faceGeo = () => {
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= segV; j++) for (let i = 0; i <= segU; i++) {
      const u = (i / segU) * 2 - 1, v = j / segV;
      const [x, y, z] = surf(u, v);
      pos.push(x, y, z); uv.push(x, v * slopeLen);
    }
    for (let j = 0; j < segV; j++) for (let i = 0; i < segU; i++) {
      const a = j * (segU + 1) + i, b = a + 1, c = a + segU + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  };
  const top = faceGeo();
  // fascia: the visible thickness of the eave, following its upswept edge
  const fascia = (() => {
    const pos = [], idx = [], T = 0.14;
    for (let i = 0; i <= segU; i++) {
      const u = (i / segU) * 2 - 1; const [x, y, z] = surf(u, 0);
      pos.push(x, y, z + 0.01, x, y - T, z - 0.04);
    }
    for (let i = 0; i < segU; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  })();
  const under = top.clone(); under.translate(0, -0.1, 0);
  const underMat = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.8, side: THREE.BackSide, envMapIntensity: 0.2 });
  for (let f = 0; f < 4; f++) {
    const rot = (f * Math.PI) / 2;
    const m = new THREE.Mesh(top, tileMat); m.rotation.y = rot; m.castShadow = true; m.receiveShadow = true; group.add(m);
    const u2 = new THREE.Mesh(under, underMat); u2.rotation.y = rot; group.add(u2);
    const fm = new THREE.Mesh(fascia, woodMat || underMat); fm.rotation.y = rot; fm.castShadow = true; group.add(fm);
  }
  // hip ridges along the four corners, ending in an upturned horn
  const rm = ridgeMat || new THREE.MeshStandardMaterial({ color: 0x252b29, roughness: 0.6 });
  for (let f = 0; f < 4; f++) {
    const pts = [];
    for (let j = 0; j <= 16; j++) { const v = j / 16; const [x, y, z] = surf(1, v); pts.push(new THREE.Vector3(x, y + 0.07, z)); }
    const e = surf(1, 0);
    pts.unshift(new THREE.Vector3(e[0] * 1.07, e[1] + 0.28, e[2] * 1.07));   // the 翘角 horn
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.reverse()), 40, 0.065, 8, false), rm);
    tube.rotation.y = (f * Math.PI) / 2; tube.castShadow = true; group.add(tube);
  }
  group.userData.apexY = H;
  group.userData.cornerTip = (() => { const e = surf(1, 0); return [e[0] * 1.07, e[1] + 0.28, e[2] * 1.07]; })();
  return group;
}

/**
 * A long Chinese hall roof (悬山/硬山 gable form) with concave tiled slopes,
 * a ridge with upturned ends, and plastered gable triangles with timber framing.
 * Ridge runs along local x. Base (eave line) at y = 0.
 * @param {object} o { length, span, rise, overhang, woodMat, ridgeMat, gableMat, castShadow }
 */
export function buildHallRoof(o) {
  const { length = 37, span = 23, rise = 4.6, overhang = 1.1, woodMat, ridgeMat, gableMat, castShadow = false, soffitMat } = o;
  const under = soffitMat || new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.8, envMapIntensity: 0.2 });
  const { map, normalMap } = tileTextures();
  const tileMat = new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.78, metalness: 0.02, envMapIntensity: 0.4 });
  const g = new THREE.Group();
  const half = span / 2 + overhang, L = length + overhang * 2;
  const prof = (v) => rise * Math.pow(v, 1.6) - overhang * 0.25 * (1 - v) * (1 - v); // concave + slight eave droop
  const segV = 24, segU = 12;
  for (const side of [-1, 1]) {
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= segV; j++) for (let i = 0; i <= segU; i++) {
      const v = j / segV, u = i / segU;
      const x = -L / 2 + u * L;
      const z = side * half * (1 - v);
      const y = prof(v) + 0.25 * Math.pow(Math.abs(u * 2 - 1), 6) * (1 - v); // corners lift slightly
      pos.push(x, y, z); uv.push(x, v * Math.hypot(half, rise));
    }
    for (let j = 0; j < segV; j++) for (let i = 0; i < segU; i++) {
      const a = j * (segU + 1) + i, b = a + 1, c = a + segU + 1, d = c + 1;
      if (side > 0) idx.push(a, b, d, a, d, c); else idx.push(a, d, b, a, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, tileMat); m.castShadow = castShadow; m.receiveShadow = true; g.add(m);
    // timber soffit under the eave (what you see from below), slightly inset
    const sg = geo.clone(); sg.translate(0, -0.18, 0); sg.index.array.reverse(); sg.computeVertexNormals();
    const sm = new THREE.Mesh(sg, under); g.add(sm);
    // exposed rafter ends along the eave
    for (let x = -L / 2 + 0.3; x < L / 2 - 0.2; x += 0.55) {
      const raf = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 1.6), woodMat);
      raf.position.set(x, prof(0) - 0.22 + 0.12, side * (half - 0.7)); raf.rotation.x = -side * 0.28; g.add(raf);
    }
    // eave fascia board along the drip edge
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(L, 0.22, 0.12), woodMat);
    fascia.position.set(0, prof(0) - 0.08, side * half); g.add(fascia);
  }
  // main ridge + upturned ridge-end ornaments (正脊 + 鸱吻, simplified)
  const rm = ridgeMat || new THREE.MeshStandardMaterial({ color: 0x252b29, roughness: 0.6 });
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(L - 0.4, 0.42, 0.34), rm);
  ridge.position.y = rise + 0.12; g.add(ridge);
  for (const sx of [-1, 1]) {
    const curl = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.12, 8, 16, Math.PI * 1.3), rm);
    curl.position.set(sx * (L / 2 - 0.35), rise + 0.55, 0); curl.rotation.set(0, 0, sx > 0 ? Math.PI * 0.85 : -Math.PI * 0.15);
    g.add(curl);
  }
  // gable triangles: plaster with a dark timber king-post frame
  const gm = gableMat || new THREE.MeshStandardMaterial({ color: 0xd9d3c6, roughness: 0.93 });
  for (const sx of [-1, 1]) {
    const w = span / 2;
    // the gable follows the concave roof profile on both sides
    const pts = [];
    for (let k = 0; k <= 12; k++) { const v = k / 12; pts.push(new THREE.Vector2(w * (1 - v), Math.max(0, prof(v) - 0.14))); }
    for (let k = 11; k >= 0; k--) { const v = k / 12; pts.push(new THREE.Vector2(-w * (1 - v), Math.max(0, prof(v) - 0.14))); }
    const gable = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), gm);
    gable.material.side = THREE.DoubleSide;
    gable.rotation.y = Math.PI / 2; gable.position.x = sx * (length / 2 + 0.02); g.add(gable);
    // timber frame on the gable face: tie beam, king post, struts
    const fx = sx * (length / 2 + 0.08);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, span), woodMat); beam.position.set(fx, 0.15, 0); g.add(beam);
    const kp = new THREE.Mesh(new THREE.BoxGeometry(0.14, rise - 0.3, 0.24), woodMat); kp.position.set(fx, (rise - 0.3) / 2 + 0.2, 0); g.add(kp);
    for (const sz of [-1, 1]) {
      const qp = new THREE.Mesh(new THREE.BoxGeometry(0.12, prof(0.45) - 0.2, 0.2), woodMat); qp.position.set(fx, (prof(0.45) - 0.2) / 2 + 0.2, sz * w * 0.55); g.add(qp);
      const mid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, w * 0.55 * 2 * 0.5), woodMat); mid.position.set(fx, prof(0.45) - 0.05, sz * w * 0.28); g.add(mid);
    }
  }
  g.traverse((m) => { if (m.isMesh && m.material !== tileMat) { m.castShadow = castShadow; m.receiveShadow = true; } });
  return g;
}
