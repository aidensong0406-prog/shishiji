import * as THREE from "three";
import { buildStoneGeometry } from "./geometry.js";

/* buildStoneGeometry in a Web Worker, resolving to a BufferGeometry.
   Falls back to the main thread where module workers are unavailable. */
let worker = null, seq = 0;
const pending = new Map();

function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL("./geometry.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id); if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error) { p.reject(new Error(e.data.error)); return; }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(e.data.pos, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(e.data.nrm, 3));
      g.setAttribute("aCavity", new THREE.BufferAttribute(e.data.cav, 1));
      g.setIndex(new THREE.BufferAttribute(e.data.idx, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      p.resolve(g);
    };
    worker.onerror = () => { worker = false; for (const [, p] of pending) p.reject(new Error("worker failed")); pending.clear(); };
  } catch { worker = false; }
  return worker;
}

export function buildStoneGeometryAsync(shape, level) {
  const w = getWorker();
  if (!w) return Promise.resolve(buildStoneGeometry(shape, { level }));
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    w.postMessage({ id, shape, level });
  }).catch(() => buildStoneGeometry(shape, { level }));
}
