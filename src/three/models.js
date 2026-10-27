import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Real CC0 GLTF assets (Poly Haven) live in /public/models/<slug>/.
// Cached promises so a model is only fetched/parsed once even if reused.
const loader = new GLTFLoader();
const cache = new Map();

export function loadModel(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((resolve) => {
      loader.load(
        url,
        (gltf) => resolve(gltf.scene),
        undefined,
        (err) => { console.warn("[models] failed", url, err); resolve(null); }
      );
    }));
  }
  return cache.get(url);
}

// Clone a loaded model, enable shadows, and tune its PBR materials for the
// gallery's lighting (sets envMap intensity, optional colour/roughness tweaks).
/* Very dense props (Poly Haven plants are ~100k triangles each) are registered
   here so the render loop can hide them beyond a viewing distance. */
export const heavyMeshes = [];
const HEAVY_TRIS = 20000;

export function prepModel(scene, opts = {}) {
  const root = scene.clone(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const tris = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    const heavy = tris > HEAVY_TRIS;
    // dense foliage gains nothing from casting into a throttled shadow map
    o.castShadow = !(heavy && /leaf|leaves|foliage/i.test(o.name));
    o.receiveShadow = true;
    // the 57k-triangle pebble bed sits inside the pot rim, below eye level: never seen
    if (/pebbles/i.test(o.name)) { o.visible = false; return; }
    if (heavy) { o.userData.heavy = true; heavyMeshes.push(o); }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (!m) return;
      if (m.map) m.map.encoding = THREE.sRGBEncoding;
      m.envMapIntensity = opts.envMapIntensity ?? 0.85;
      if (opts.roughness != null) m.roughness = opts.roughness;
      if (opts.color) m.color = new THREE.Color(opts.color);
      if (opts.tint) m.color.multiply(new THREE.Color(opts.tint));
      m.needsUpdate = true;
    });
  });
  // scale to a target height in metres (robust to whatever scale the asset
  // was authored at), keeping the base on the floor
  if (opts.targetHeight) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const h = size.y || 1;
    const s = opts.targetHeight / h;
    root.scale.multiplyScalar(s);
    root.position.y -= box.min.y * s;   // sit the base at y=0
  }
  return root;
}

const BASE = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) || "/";
const M = (slug) => BASE + `models/${slug}/${slug}_1k.gltf`;
export const MODEL = {
  boulder: BASE + "models/boulder_01/boulder_01_1k.gltf",
  plant: BASE + "models/potted_plant_04/potted_plant_04_1k.gltf",
  // real CC0 Chinese furniture + decor (Poly Haven) — for a literati museum
  consoleTable: M("chinese_console_table"),
  stool: M("chinese_stool"),
  teaTable: M("chinese_tea_table"),
  screen: M("chinese_screen_panels"),
  cabinet: M("chinese_cabinet"),
  vaseCeramic1: M("ceramic_vase_01"),
  vaseCeramic3: M("ceramic_vase_03"),
  vaseBrass: M("brass_vase_02"),
  lantern: M("Lantern_01"),
  books: M("book_encyclopedia_set_01"),
  // leafy greenery for the court + hall
  anthurium: M("anthurium_botany_01"),
  calathea: M("calathea_orbifolia_01"),
};
