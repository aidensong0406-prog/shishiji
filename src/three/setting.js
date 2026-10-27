import * as THREE from "three";
import { foliageGeometry, foliageMaterial } from "./foliage.js";
import { buildTiledRoof } from "./roof.js";
import { mulberry } from "../utils/math.js";

/* The world beyond the courtyard walls: tree canopies rising over the walls,
   neighbouring tiled rooftops, and layered distant hills fading into haze
   (aerial perspective) — so the court sits in a landscape, not a void. */
export function buildSetting(parent, { cx, cz = 0, x0, x1, zHalf, woodMat, ridgeMat }) {
  const g = new THREE.Group(); g.name = "setting"; parent.add(g);
  const r = mulberry(5150);

  // 1) distant hill ridges: three hazy layers on rings around the court
  const hazeTop = new THREE.Color(0xb9c6d2), hazeLow = new THREE.Color(0x8d9aa6);
  [[150, 16, 0x6f7f72, 0.55], [190, 22, 0x7c8b8a, 0.72], [235, 30, 0x95a3ad, 0.86]].forEach(([R, H, col, haze], li) => {
    const seg = 160, pos = [], colr = [], idx = [];
    const base = new THREE.Color(col).lerp(hazeLow, haze * 0.6);
    const top = new THREE.Color(col).lerp(hazeTop, haze);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      let h = 0; for (let o = 1; o <= 4; o++) h += Math.sin(a * (2 + o * 3 + li) + li * 1.7 + o) / o;
      h = H * (0.45 + 0.35 * h * 0.6 + 0.2 * Math.sin(a * 23 + li));
      const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
      pos.push(x, -2, z, x, Math.max(2, h), z);
      colr.push(base.r, base.g, base.b, top.r, top.g, top.b);
      if (i < seg) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }));
    m.renderOrder = -1; m.userData.noMerge = true; g.add(m);
  });

  // 2) tree canopies standing just outside the walls (rising over them)
  const geoA = foliageGeometry(71, 3), geoB = foliageGeometry(83, 3);
  const mats = [foliageMaterial("greenDeep", 51), foliageMaterial("green", 52), foliageMaterial("greenOlive", 53), foliageMaterial("pine", 54)];
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2c20, roughness: 0.95 });
  const tree = (x, z) => {
    const h = 5.5 + r() * 4.5, w = 2.2 + r() * 1.8, m = mats[Math.floor(r() * mats.length)];
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, h * 0.6, 7), trunkMat);
    trunk.position.set(x, h * 0.3, z); g.add(trunk);
    for (let k = 0; k < 7; k++) {          // many smaller clumps → a broken, leafy silhouette
      const c = new THREE.Mesh(k % 2 ? geoA : geoB, m);
      const s = w * (0.35 + r() * 0.35);
      c.scale.set(s, s * 0.75, s);
      c.position.set(x + (r() - 0.5) * w * 1.3, h * (0.58 + r() * 0.42), z + (r() - 0.5) * w * 1.3);
      c.rotation.y = r() * 6.28; g.add(c);
    }
  };
  for (let x = x0 + 2; x < x1 - 1; x += 3.2 + r() * 2.5) { tree(x, -zHalf - 3 - r() * 4); tree(x, zHalf + 3 + r() * 4); }
  for (let z = -zHalf; z <= zHalf; z += 3.4 + r() * 2.5) tree(x1 + 3 + r() * 4, z);

  // 3) neighbouring rooftops glimpsed over the wall
  [[x0 + 8, -zHalf - 11, 0.2], [x0 + 19, zHalf + 12, -0.3], [x1 + 12, -6, 0.5], [x1 + 14, 9, 0.1]].forEach(([x, z, ry], i) => {
    const roof = buildTiledRoof({ W: 3 + i * 0.4, H: 2.4, lift: 0.4, curve: 1.6, woodMat, ridgeMat, segU: 12, segV: 10 });
    roof.position.set(x, 4.2 + (i % 2) * 0.8, z); roof.rotation.y = ry; g.add(roof);
    const body = new THREE.Mesh(new THREE.BoxGeometry(5, 4.4, 5), new THREE.MeshStandardMaterial({ color: 0xd2ccbf, roughness: 0.95 }));
    body.position.set(x, 2.1 + (i % 2) * 0.8, z); body.rotation.y = ry; g.add(body);
  });
  g.traverse((o) => { if (o.isMesh && !o.userData.noMerge) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}
