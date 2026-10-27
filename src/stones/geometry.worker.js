// Builds high-detail stone geometry off the main thread (the close-up LOD
// takes ~150–200 ms, which would freeze the frame when a stone is picked up).
import { buildStoneGeometry } from "./geometry.js";

self.onmessage = (e) => {
  const { id, shape, level } = e.data;
  try {
    const g = buildStoneGeometry(shape, { level });
    const pos = g.attributes.position.array, nrm = g.attributes.normal.array, cav = g.attributes.aCavity.array;
    const idx = g.index.array.slice();   // the icosphere index is cached in the worker; send a copy
    self.postMessage({ id, pos, nrm, cav, idx }, [pos.buffer, nrm.buffer, cav.buffer, idx.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
