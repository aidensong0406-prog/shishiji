import * as THREE from "three";
import { HW, HD, UF_Y, UF2_Y } from "./constants.js";
import { buildStoneGeometry } from "../stones/geometry.js";
import { createStoneMaterial } from "../stones/material.js";

/* Specimen cabinets: glazed, two-tier display cases standing along the
   mezzanine walls. Together they hold the whole register (20 per case), in ID
   order, so the walkable hall and the archive show the same collection. */

export const CAB_W = 3.5, CAB_D = 0.52, CAB_BASE = 0.74, CAB_GLASS = 0.62;
export const PER_CABINET = 20;
// cases stand in the outer wall bays (between pilasters), four per wall per
// storey: storey 2 holds the first half of the register, storey 3 the second
const XS = [-12.5, -7.5, 7.5, 12.5];
const FLOORS = [UF_Y, UF2_Y];

export function cabinetLayout(count) {
  const n = Math.ceil(count / PER_CABINET);
  const out = [];
  for (let c = 0; c < n; c++) {
    const fl = Math.min(FLOORS.length - 1, Math.floor(c / (XS.length * 2)));
    const k = c % (XS.length * 2), north = k < XS.length;
    const x = north ? XS[k] : XS[XS.length * 2 - 1 - k];
    const z = north ? -(HD - CAB_D / 2 - 0.2) : HD - CAB_D / 2 - 0.2;
    out.push({ index: c, x, z, y: FLOORS[fl], face: north ? 1 : -1, from: c * PER_CABINET, to: Math.min(count, (c + 1) * PER_CABINET) });
  }
  return out;
}

function labelTexture(text, sub) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 96;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 96); grd.addColorStop(0, "#c9a35c"); grd.addColorStop(1, "#8c7146");
  g.fillStyle = grd; g.fillRect(0, 0, 512, 96);
  g.strokeStyle = "rgba(40,28,10,0.6)"; g.lineWidth = 3; g.strokeRect(6, 6, 500, 84);
  g.fillStyle = "#24190c"; g.textAlign = "center";
  g.font = "600 34px Georgia, 'Songti SC', serif"; g.fillText(text, 256, 46);
  g.font = "500 20px Georgia, serif"; g.fillText(sub, 256, 76);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return t;
}

/**
 * @param {THREE.Scene} scene
 * @param {object[]} specimens  catalog specimens in register order
 * @param {object} opt          { quality: "low"|"medium"|"high"|..., woodMat, brassMat }
 * @returns {{ group, layout, meshes, ready: Promise }}
 */
export function buildCabinets(scene, specimens, opt = {}) {
  const group = new THREE.Group();
  group.name = "cabinets";
  scene.add(group);
  const layout = cabinetLayout(specimens.length);
  const wood = opt.woodMat || new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.5 });
  const brass = opt.brassMat || new THREE.MeshStandardMaterial({ color: 0xb8924f, metalness: 0.9, roughness: 0.35 });
  // lined in a mid sage silk (pale and dark stones both read against it), on wooden decks
  const linen = new THREE.MeshStandardMaterial({ color: 0x3a4a43, roughness: 0.88, emissive: 0x0b0f0d, envMapIntensity: 0.25 });
  const riserMat = wood;
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xeef4f6, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6, depthWrite: false });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffe6c0 });
  const geos = {
    base: new THREE.BoxGeometry(CAB_W, CAB_BASE, CAB_D),
    plinth: new THREE.BoxGeometry(CAB_W + 0.06, 0.08, CAB_D + 0.06),
    deck: new THREE.BoxGeometry(CAB_W - 0.04, 0.02, CAB_D - 0.04),
    riser: new THREE.BoxGeometry(CAB_W - 0.06, 0.1, 0.2),
    back: new THREE.PlaneGeometry(CAB_W - 0.04, CAB_GLASS - 0.02),
    glassF: new THREE.PlaneGeometry(CAB_W, CAB_GLASS),
    glassS: new THREE.PlaneGeometry(CAB_D, CAB_GLASS),
    glassT: new THREE.PlaneGeometry(CAB_W, CAB_D),
    postV: new THREE.BoxGeometry(0.03, CAB_GLASS, 0.03),
    railH: new THREE.BoxGeometry(CAB_W, 0.03, 0.03),
    lamp: new THREE.BoxGeometry(CAB_W - 0.2, 0.012, 0.03),
    plate: new THREE.PlaneGeometry(0.62, 0.116),
  };
  const add = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  for (const cab of layout) {
    const g = new THREE.Group();
    g.position.set(cab.x, cab.y, cab.z);
    if (cab.face < 0) g.rotation.y = Math.PI;      // local +z always faces the room
    group.add(g);
    const b = add(geos.base, wood, 0, CAB_BASE / 2 + 0.04, 0, g); b.castShadow = true; b.receiveShadow = true;
    add(geos.plinth, riserMat, 0, 0.04, 0, g);
    const top = CAB_BASE + 0.04;
    add(geos.deck, riserMat, 0, top + 0.01, 0, g);
    add(geos.riser, riserMat, 0, top + 0.07, -CAB_D / 2 + 0.13, g);
    const back = add(geos.back, linen, 0, top + CAB_GLASS / 2, -CAB_D / 2 + 0.02, g);
    back.receiveShadow = true;
    const gf = add(geos.glassF, glass, 0, top + CAB_GLASS / 2, CAB_D / 2, g); gf.renderOrder = 5;
    for (const sx of [-1, 1]) { const gs = add(geos.glassS, glass, sx * CAB_W / 2, top + CAB_GLASS / 2, 0, g); gs.rotation.y = Math.PI / 2; gs.renderOrder = 5; }
    const gt = add(geos.glassT, glass, 0, top + CAB_GLASS, 0, g); gt.rotation.x = -Math.PI / 2; gt.renderOrder = 5;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(geos.postV, brass, sx * CAB_W / 2, top + CAB_GLASS / 2, sz * CAB_D / 2, g);
    for (const yy of [top, top + CAB_GLASS]) for (const sz of [-1, 1]) add(geos.railH, brass, 0, yy, sz * CAB_D / 2, g);
    add(geos.lamp, glow, 0, top + CAB_GLASS - 0.03, CAB_D / 2 - 0.06, g);   // the case's own light strip
    const a = specimens[cab.from], z = specimens[cab.to - 1];
    const plate = add(geos.plate, new THREE.MeshStandardMaterial({ map: labelTexture(`柜 ${cab.index + 1}`, `${a.id} – ${z.id}`), metalness: 0.5, roughness: 0.4 }), 0, CAB_BASE * 0.62, CAB_D / 2 + 0.003, g);
    plate.userData.cabinet = cab.index;
    cab.group = g;
  }

  // stones: generated a few per frame so the hall stays responsive
  const q = opt.quality || "medium";
  const level = q === "high" ? 4 : 3;
  const meshes = [];
  const jobs = [];
  for (const cab of layout) for (let i = cab.from; i < cab.to; i++) jobs.push([cab, i]);
  const ready = new Promise((resolve) => {
    const step = () => {
      if (opt.isAlive && !opt.isAlive()) { resolve(meshes); return; }
      const t0 = performance.now();
      while (jobs.length && performance.now() - t0 < 8) {
        const [cab, i] = jobs.shift();
        const spec = specimens[i];
        const k = i - cab.from, row = k < PER_CABINET / 2 ? 1 : 0;   // back row first (ids read left→right, back→front)
        const col = k % (PER_CABINET / 2);
        const geo = buildStoneGeometry(spec.shape, { level });
        const mat = createStoneMaterial(spec.look, { quality: "lq" });
        mat.envMapIntensity = 0.7;
        const m = new THREE.Mesh(geo, mat);
        const bb = geo.boundingBox;
        const ex = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z), ey = bb.max.y - bb.min.y;
        const s = Math.min(0.24 / ex, 0.24 / ey);
        m.scale.setScalar(s);
        const top = CAB_BASE + 0.04 + 0.02 + (row ? 0.1 : 0);
        m.position.set(-CAB_W / 2 + 0.2 + col * ((CAB_W - 0.4) / (PER_CABINET / 2 - 1)), top - bb.min.y * s, row ? -CAB_D / 2 + 0.13 : 0.1);
        m.rotation.y = ((spec.look.seed % 628) / 100) * 0.4 - 0.2 + 0.6;
        m.userData.specId = spec.id;
        cab.group.add(m);
        meshes.push(m);
      }
      if (jobs.length) setTimeout(step, 0); else resolve(meshes);
    };
    setTimeout(step, 50);
  });
  return { group, layout, meshes, ready };
}
