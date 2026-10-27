import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { mkCanvas } from './textures.js';

/* Load a real interior HDRI for image-based lighting (true reflections on
   stone / brass / marble / glass). Async: the caller shows the procedural
   buildEnvMap() instantly, then swaps scene.environment to this when ready. */
export function loadHDRIEnv(renderer, url) {
  return new Promise((resolve, reject) => {
    new RGBELoader()
      .setDataType(THREE.HalfFloatType)
      .load(
        url,
        (hdr) => {
          const pmrem = new THREE.PMREMGenerator(renderer);
          pmrem.compileEquirectangularShader();
          const tex = pmrem.fromEquirectangular(hdr).texture;
          hdr.dispose();
          pmrem.dispose();
          resolve(tex);
        },
        undefined,
        reject
      );
  });
}

export function buildEnvMap(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const [c, g] = mkCanvas(64, 64);
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, "#4c4338");
  grad.addColorStop(0.55, "#2a241e");
  grad.addColorStop(1, "#0d0b09");
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(30, 16, 12),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), side: THREE.BackSide })
  );
  env.add(sky);
  const warm = new THREE.MeshBasicMaterial({ color: 0xfff0d2 });
  const cool = new THREE.MeshBasicMaterial({ color: 0xbcd6cc });
  const panel = (mat, w, h, x, y, z, rx, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); env.add(m);
  };
  panel(warm, 14, 5, 0, 9, 0, Math.PI / 2, 0);       // skylight above
  panel(warm, 5, 3, -9, 4, -9, 0, Math.PI / 4);
  panel(warm, 5, 3, 9, 4, -9, 0, -Math.PI / 4);
  panel(cool, 4, 4, 11, 3, 0, 0, -Math.PI / 2);      // moon gate glow
  const envTex = pmrem.fromScene(env, 0.05).texture;
  pmrem.dispose();
  sky.geometry.dispose(); sky.material.map.dispose(); sky.material.dispose();
  return envTex;
}
