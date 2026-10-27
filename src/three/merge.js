import * as THREE from "three";
import { BufferGeometryUtils } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/* Static batching: bake every static, opaque mesh under `root` into one mesh
   per (material, shadow flags). The hall is built from thousands of small
   boxes; drawing them one by one (twice, with the shadow pass) was the main
   GPU/driver cost. Animated objects (and anything beneath them) are skipped. */
export function mergeStatic(root, skip = []) {
  const skipSet = new Set(skip.filter(Boolean));
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  const isSkipped = (o) => { for (let p = o; p && p !== root; p = p.parent) if (skipSet.has(p)) return true; return false; };
  root.traverse((m) => {
    if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || Array.isArray(m.material)) return;
    const mat = m.material;
    if (mat.transparent || mat.aoMap || mat.lightMap || m.renderOrder !== 0 || !m.visible || m.userData.noMerge) return;
    if (!m.geometry || !m.geometry.attributes.position || m.geometry.morphAttributes.position) return;
    if (isSkipped(m)) return;
    for (let p = m.parent; p && p !== root; p = p.parent) if (!p.visible) return;
    const key = mat.uuid + "|" + m.castShadow + "|" + m.receiveShadow;
    if (!groups.has(key)) groups.set(key, { mat, cast: m.castShadow, recv: m.receiveShadow, list: [] });
    groups.get(key).list.push(m);
  });
  let before = 0, after = 0;
  for (const g of groups.values()) {
    before += g.list.length;
    if (g.list.length < 2) { after += g.list.length; continue; }
    const keep = ["position", "normal", "uv"];
    if (g.list.every((m) => m.geometry.attributes.aCavity)) keep.push("aCavity");
    const geos = g.list.map((m) => {
      let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const k of Object.keys(geo.attributes)) if (!keep.includes(k)) geo.deleteAttribute(k);
      if (!geo.attributes.normal) geo.computeVertexNormals();
      if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      return geo;
    });
    const merged = BufferGeometryUtils.mergeBufferGeometries(geos, false);
    geos.forEach((x) => x.dispose());
    if (!merged) { after += g.list.length; continue; }
    const mesh = new THREE.Mesh(merged, g.mat);
    mesh.castShadow = g.cast; mesh.receiveShadow = g.recv;
    mesh.name = "merged";
    root.add(mesh);
    for (const m of g.list) { m.parent.remove(m); }
    after += 1;
  }
  return { before, after };
}
