import * as THREE from "three";

/* ============================================================
   Contact shadows — soft radial decals laid just above the floor.
   A single shadow map can't give every object grounded contact;
   these cheap gradient sprites fake the ambient-occlusion darkening
   where objects meet the floor. Shared geometry + a shared texture
   keep them nearly free.
   ============================================================ */

let _shadowTex = null;
function shadowTexture() {
  if (_shadowTex) return _shadowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(0.45, "rgba(0,0,0,0.32)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  _shadowTex = new THREE.CanvasTexture(c);
  return _shadowTex;
}

const _shadowGeo = new THREE.PlaneGeometry(1, 1);

// One contact-shadow plane. radius in world units, opacity 0..1.
export function makeContactShadow(radius = 0.6, opacity = 0.6, squashZ = 1) {
  const mesh = new THREE.Mesh(
    _shadowGeo,
    new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(radius * 2, radius * 2 * squashZ, 1);
  mesh.position.y = 0.014;
  mesh.renderOrder = 1;
  return mesh;
}

/* ============================================================
   Instancing helper — the draw-call backbone. Repeated identical
   props (coffer beams, panels, balusters) become one InstancedMesh
   instead of dozens of meshes, so the museum can grow without the
   draw count exploding.
   ============================================================ */

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

// transforms: array of { pos:[x,y,z], rot?:[x,y,z], scale?:[x,y,z]|number }
export function makeInstanced(geometry, material, transforms, castShadow = false) {
  const inst = new THREE.InstancedMesh(geometry, material, transforms.length);
  inst.castShadow = castShadow;
  inst.receiveShadow = false;
  transforms.forEach((t, i) => {
    _p.set(t.pos[0], t.pos[1], t.pos[2]);
    const r = t.rot || [0, 0, 0];
    _e.set(r[0], r[1], r[2]);
    _q.setFromEuler(_e);
    let sc = t.scale ?? 1;
    if (typeof sc === "number") _s.set(sc, sc, sc);
    else _s.set(sc[0], sc[1], sc[2]);
    _m4.compose(_p, _q, _s);
    inst.setMatrixAt(i, _m4);
  });
  inst.instanceMatrix.needsUpdate = true;
  return inst;
}
