import * as THREE from "three";
import { buildStoneGeometryAsync } from "../stones/geometryAsync.js";
import { createStoneMaterial, setStoneWet } from "../stones/material.js";

/* ==========================================================================
   Hand study — the close inspection of one stone, in the visitor's hands.

   The camera stays first-person. On "study", the vitrine glass lifts, the
   visitor's hands rise into view with a hand-sized piece of the stone, settling into
   the left palm. From there the visitor:
     · turns the stone (drag) — a trackball with inertia; the fingers and thumb
       push in the drag direction, and the stone always settles onto the palm;
     · moves the hand lamp around it (right-drag / two fingers) — a real
       shadow-casting spotlight at the lamp's flame, so raking light reveals
       relief and the stone throws its shadow across the palm;
     · brings it closer (wheel / pinch), turns it over (double-click / F),
       wets it (T — water deepens the colour, then evaporates), raises a hand
       lens (Z), and switches between oil lamp, candle and window daylight.
   While studying, the room's lights lower (callback) so the lamp is the key.

   Inputs are plain pointer/wheel/key calls from the host; this module owns
   the rig, the lamp, the held stone and the animation state.
   ========================================================================== */

export const LIGHTS = {
  lamp: { label: "Oil lamp", zh: "油灯", color: 0xffb86b, intensity: 3.2, angle: 0.62, penumbra: 0.75, flicker: 0.04, hand: true },
  candle: { label: "Candle", zh: "烛光", color: 0xff9a45, intensity: 2.4, angle: 0.8, penumbra: 0.95, flicker: 0.16, hand: true },
  daylight: { label: "Window", zh: "天光", color: 0xe6edff, intensity: 4.2, angle: 0.42, penumbra: 0.9, flicker: 0, hand: false },
};

/* the stone's "voice" when tapped, by rock type (an illustration of how such
   rocks typically sound — dense black Lingbi limestone is famous for ringing) */
const VOICE = {
  lingbi: "ring",
  agate: "glass", jasper: "glass", chert: "glass", obsidian: "glass", quartzite: "glass",
  granite: "click", diorite: "click", basalt: "click", gneiss: "click", porphyry: "click", rhyolite: "click",
  serpentinite: "click", marble: "click", schist: "click", slate: "click", ironstone: "click",
};
export const voiceOf = (spec) => (spec ? VOICE[spec.analog] || "thud" : "click");

const TAP_T = 0.38;      // the index finger's lift-and-flick
const HELD_R = 0.048;    // the held stone's bounding radius: a hand-sized stone, ~10 cm
const REACH_T = 0.9, RETURN_T = 0.7;   // hands rise into view / lower away
const AZ_MIN = -0.6, AZ_MAX = 1.75;    // lamp azimuth: past ~1.75 rad the lamp arm would reach across the stone
const MAX_SPIN = 10;                   // rad/s, a flick's ceiling

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = THREE.MathUtils.clamp;

/**
 * @param {object} ctx { scene, camera, quality: "low"|"eco"|"medium"|"high",
 *                       hands (createHands() result, optional), loupe (createLoupe() result, optional),
 *                       lamp: a SpotLight created by the host at startup (castShadow, intensity 0) }
 */
export function createStudy(ctx) {
  const { scene, camera, lamp } = ctx;
  let hands = ctx.hands || null;
  const rig = new THREE.Group(); rig.name = "study-rig"; rig.visible = false;
  scene.add(rig);
  const palm = new THREE.Group(); rig.add(palm);            // where the stone rests (left palm origin)
  const follow = new THREE.Group(); palm.add(follow);       // rides the animated left-hand body (breath, press, dip)
  const pivot = new THREE.Group(); follow.add(pivot);       // stone centre; rotations happen here
  const carrier = new THREE.Group(); carrier.name = "study-carrier";   // the stone in flight (scene) or at rest (pivot)
  if (hands) { rig.add(hands.left); rig.add(hands.right); }
  // the lamp's target lives at the stone centre
  lamp.target = new THREE.Object3D(); pivot.add(lamp.target);
  lamp.intensity = 0; lamp.shadow.autoUpdate = false;

  /* focus veil: a dark, soft shell ~1 m around the eye. Everything beyond it
     (the room) dims and loses contrast; the hands and stone, inside it, don't.
     Works on every quality tier (depth of field only exists on High). */
  const veil = new THREE.Mesh(
    new THREE.SphereGeometry(1.05, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: { uK: { value: 0 } },
      vertexShader: "varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform float uK; varying vec3 vD; void main(){ float a = uK * (0.6 + 0.2 * smoothstep(0.2, -0.6, vD.y)); gl_FragColor = vec4(0.02, 0.016, 0.012, a); }",
      side: THREE.BackSide, transparent: true, depthWrite: false, fog: false, toneMapped: false,
    })
  );
  veil.renderOrder = 9; veil.visible = false; veil.frustumCulled = false;
  scene.add(veil);

  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), q = new THREE.Quaternion(), qd = new THREE.Quaternion();
  const axisUp = new THREE.Vector3(), axisRight = new THREE.Vector3();
  const qw = new THREE.Quaternion(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
  const S = {
    phase: "idle",           // idle | reach | hold | return
    t: 0,                    // phase clock
    mesh: null, sample: null, radius: 0.06, spec: null, ownsGeometry: false,
    from: new THREE.Vector3(), fromQ: new THREE.Quaternion(),
    spin: new THREE.Vector3(), flip: null,   // angular velocity, camera frame (x right, y up, z toward the eye), rad/s
    zoom: 0.42, zoomTarget: 0.42,
    lampAz: 0.85, lampEl: 0.55, light: "lamp", flickerSeed: Math.random() * 10,
    wet: 0, wetTarget: 0, drops: [],
    loupe: false, pointerNdc: new THREE.Vector2(),
    camYaw: 0, camPitch: 0, pitch0: 0, onDone: null, onChange: null,
    restingQ: new THREE.Quaternion(),
    u: 0,                    // 0 = hands lowered out of view, 1 = held up for study (reach/return run along it)
    away: 0,                 // 0 = the lamp hand holds the lamp up, 1 = lowered out of view (daylight, or the lens)
    wetShown: false, hop: 0,
  };
  const notify = () => S.onChange && S.onChange(api.state());
  const sfx = (name, arg) => { const a = ctx.audio && ctx.audio(); if (a && a.on && a[name]) a[name](arg); };

  /* ---------- the held stone ---------- */
  // close-up geometries of the last few stones, so picking one up again is instant
  const geoCache = new Map();
  function remember(key, g) {
    geoCache.set(key, g);
    while (geoCache.size > 4) {
      const [k, old] = geoCache.entries().next().value;
      geoCache.delete(k);
      if (!S.mesh || S.mesh.geometry !== old) old.dispose();
    }
  }
  function makeHeld(src) {
    let mesh;
    if (src.spec) {
      // start with the vitrine's geometry (already built), upgrade to the
      // close-up detail level from a worker while the stone is in flight
      const mat = createStoneMaterial(src.spec.look, { quality: ctx.quality === "low" ? "lq" : "hq" });
      mat.envMapIntensity = 0.45;
      mesh = new THREE.Mesh(src.mesh.geometry, mat); S.ownsGeometry = false;
      const level = ctx.quality === "low" ? 5 : 6, key = `${src.spec.id}:${level}`;
      const cached = geoCache.get(key);
      if (cached) { geoCache.delete(key); geoCache.set(key, cached); mesh.geometry = cached; }   // reused: the lens keeps its BVH
      else {
        const token = (S.token = (S.token || 0) + 1);
        buildStoneGeometryAsync(src.spec.shape, level).then((g) => {
          remember(key, g);
          if (S.token !== token || S.mesh !== mesh) return;
          fitHeld(mesh, g); mesh.geometry = g;
        });
      }
    } else {
      mesh = new THREE.Mesh(src.mesh.geometry, src.mesh.material.clone()); S.ownsGeometry = false;
      mesh.userData.photo = true; mesh.userData.baseClearcoat = mesh.material.clearcoat || 0;
    }
    mesh.castShadow = true; mesh.receiveShadow = true;
    fitHeld(mesh, mesh.geometry);
    return mesh;
  }
  // palm-sized: bounding radius ≈ 6.2 cm, centred on the pivot; plus a vertex
  // sample used to keep the rotated stone resting ON the palm
  function fitHeld(mesh, g) {
    if (!g.boundingSphere) g.computeBoundingSphere();
    const bs = g.boundingSphere, k = HELD_R / bs.radius;
    mesh.scale.setScalar(k); mesh.position.copy(bs.center).multiplyScalar(-k);
    const P = g.attributes.position, step = Math.max(1, Math.floor(P.count / 900));
    S.sample = []; for (let i = 0; i < P.count; i += step) S.sample.push(new THREE.Vector3().fromBufferAttribute(P, i).sub(bs.center).multiplyScalar(k));
    S.radius = HELD_R;
  }
  // a stable resting attitude: the "down" direction that puts the centre lowest over its
  // contact (min over directions of the stone's extent along them), so tall stones lie down
  const DOWN = new THREE.Vector3(0, -1, 0), dir = new THREE.Vector3();
  function settle(out) {
    let best = Infinity;
    out.identity();
    if (!S.sample) return out;
    for (let i = 0; i < 96; i++) {                     // Fibonacci sphere of candidate "down" directions
      const y = 1 - (2 * (i + 0.5)) / 96, r = Math.sqrt(1 - y * y), a = i * 2.39996323;
      dir.set(Math.cos(a) * r, y, Math.sin(a) * r);
      let h = -Infinity;
      for (const v of S.sample) { const k = v.dot(dir); if (k > h) h = k; }
      if (h < best - 1e-4) { best = h; q.setFromUnitVectors(dir, DOWN); out.copy(q); }
    }
    return out;
  }
  const ext = { y: 0, z: 0 };
  function lowest() {   // min y and min z (palm frame) of the stone's sample under the pivot rotation
    let my = Infinity, mz = Infinity;
    for (const v of S.sample) { tmp.copy(v).applyQuaternion(pivot.quaternion); if (tmp.y < my) my = tmp.y; if (tmp.z < mz) mz = tmp.z; }
    ext.y = my; ext.z = mz;
    return ext;
  }
  // horizontal half-extent at rest, for the finger curl
  function gripRadius() {
    let m = 0;
    for (const v of S.sample) { tmp.copy(v).applyQuaternion(pivot.quaternion); m = Math.max(m, Math.hypot(tmp.x, tmp.z)); }
    return clamp(m * 0.92, 0.04, 0.1);
  }

  /* ---------- rig placement: in front of the eye, below the sightline ---------- */
  const eyeLocal = new THREE.Vector3();
  function placeRig(k) {
    // k: 0 = hands lowered out of view, 1 = held up for study
    const yaw = S.camYaw;
    const fwd = tmp.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    const dist = S.zoom;
    const dy = -0.23 - (1 - k) * 0.35 + (0.44 - dist) * 0.25;
    rig.position.copy(camera.position).addScaledVector(fwd, dist);
    rig.position.y += dy;
    rig.rotation.set(0, yaw, 0);
    eyeLocal.set(0, -dy, dist);   // where the eye is, in the rig frame (for the shoulders)
    // the palm tilts toward the eye a little; on a narrow (portrait) screen it is centred
    const px = narrow() ? -0.012 : -0.035;
    palm.position.set(px, 0, 0);
    palm.rotation.set(0.32, 0, 0);
    if (hands) hands.left.position.set(px, 0, 0), hands.left.rotation.set(0.32, 0, 0);
  }
  const narrow = () => camera.aspect < 0.8;

  /* ---------- the lamp ----------
     One person, two hands: the right hand carries the lamp. For window daylight,
     or to take up the hand lens, it lowers the lamp out of view (S.away → 1) and
     the light crosses over: the lamp's light dims as it goes down with the hand,
     then the window light comes up. Nothing pops, and no light shines from an
     empty spot. */
  const winPos = new THREE.Vector3(-1.15, 0.7, 0.3);   // a tall window to the left, a little toward the viewer: raking
  function placeLamp(dt, time) {
    const wantAway = S.light === "daylight" || (S.loupe && S.phase === "hold") ? 1 : 0;
    S.away += (wantAway - S.away) * (1 - Math.exp(-7 * dt));
    if (Math.abs(wantAway - S.away) < 0.002) S.away = wantAway;
    const handLight = S.light === "daylight" ? "lamp" : S.light;        // what the hand carries while it lowers
    const L = LIGHTS[S.away < 0.5 ? handLight : "daylight"];
    pivot.getWorldPosition(tmp2);
    // the lamp's place: orbit the stone in the rig frame (az 0 = toward the viewer's right, el = height)
    const r = narrow() ? 0.15 : 0.2;
    const x = Math.cos(S.lampAz) * Math.cos(S.lampEl) * r;
    const z = -Math.sin(S.lampAz) * Math.cos(S.lampEl) * r;
    const y = Math.sin(S.lampEl) * r;
    const hp = tmp.set(x, y, z);
    rig.localToWorld(hp.add(rig.worldToLocal(v3.copy(tmp2))));
    // never closer than ~32 cm to the eye (the arm would fill the view)
    v4.copy(hp).sub(camera.position); const de = v4.length();
    if (de < 0.32) hp.copy(camera.position).addScaledVector(v4, 0.32 / de);
    // lowered: down and back, out of the frame (rising and going, the whole rig moves)
    const down = ease(S.away) * 0.5;
    if (hands) {
      rig.worldToLocal(hands.right.position.copy(hp));
      hands.right.position.y -= down; hands.right.position.z += ease(S.away) * 0.12;
      hands.right.rotation.set(0, 0, 0);   // the hands module aims the arm at the shoulder
      hands.right.visible = S.away < 0.995;
      rig.localToWorld(hp.copy(hands.right.position));
    }
    let lp, fade;
    if (S.away < 0.5) { lp = hp; fade = 1 - S.away * 2; }                  // the lamp's own light, going down with it
    else { lp = rig.localToWorld(tmp.copy(winPos).add(rig.worldToLocal(v3.copy(tmp2)))); fade = S.away * 2 - 1; }
    lamp.position.copy(lp);
    lamp.target.updateMatrixWorld();
    const flick = L.flicker ? 1 + L.flicker * (Math.sin(time * 13 + S.flickerSeed) * 0.6 + Math.sin(time * 29.7) * 0.4) : 1;
    lamp.color.setHex(L.color);
    lamp.angle = L.angle; lamp.penumbra = L.penumbra;
    const want = L.intensity * flick * S.blend * fade * fade * (3 - 2 * fade);
    lamp.intensity += (want - lamp.intensity) * Math.min(1, 14 * dt);
    if (hands && hands.right.userData.flame) hands.right.userData.flame.visible = S.away < 0.995;
    return handLight;
  }

  /* ---------- water ---------- */
  const dropMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, transmission: 0.9, transparent: true, opacity: 0.6, ior: 1.33, clearcoat: 1 });
  const dropGeo = new THREE.SphereGeometry(0.0045, 10, 8);
  function spawnDrops() {
    for (let i = 0; i < 9; i++) {
      const d = new THREE.Mesh(dropGeo, dropMat);
      d.position.set((Math.random() - 0.5) * 0.05, 0.11 + Math.random() * 0.06, (Math.random() - 0.5) * 0.05);
      d.userData.v = 0; d.userData.delay = i * 0.05; d.scale.set(1, 1.3, 1);
      palm.add(d); S.drops.push(d);
    }
  }
  function updateWater(dt) {
    for (const d of S.drops) {
      if ((d.userData.delay -= dt) > 0) continue;
      d.userData.v -= 9.8 * dt; d.position.y += d.userData.v * dt;
      if (d.position.y < 0.03) { d.userData.dead = true; S.wetTarget = 1; sfx("drip", S.dripN = (S.dripN || 0) + 1); }
    }
    S.drops = S.drops.filter((d) => { if (d.userData.dead) { palm.remove(d); return false; } return true; });
    // soak in fast, evaporate slowly (about half a minute)
    if (S.wetTarget > S.wet) S.wet = Math.min(S.wetTarget, S.wet + dt * 2.5);
    else { S.wetTarget = Math.max(0, S.wetTarget - dt / 30); S.wet += (S.wetTarget - S.wet) * Math.min(1, dt * 2); }
    const shown = S.wet > 0.05;
    if (shown !== S.wetShown) { S.wetShown = shown; notify(); }
    if (!S.mesh) return;
    if (S.mesh.userData.photo) {
      const m = S.mesh.material; m.clearcoat = Math.max(S.mesh.userData.baseClearcoat, S.wet * 0.95); m.clearcoatRoughness = 0.3 - S.wet * 0.25;
    } else setStoneWet(S.mesh.material, S.wet);
  }

  /* ---------- per frame ---------- */
  S.blend = 0;
  function update(dt, time) {
    if (S.phase === "idle") return;
    S.t += dt;
    // reach and return run along one progress value, so either can reverse mid-way without a jump
    if (S.phase === "reach") { S.u = Math.min(1, S.u + dt / REACH_T); if (S.u >= 1) { S.phase = "hold"; S.t = 0; sfx("inHand"); notify(); } }
    else if (S.phase === "return") { S.u = Math.max(0, S.u - dt / RETURN_T); if (S.u <= 0) { finish(); return; } }
    const k = ease(S.u);
    S.blend = k;
    veil.visible = k > 0.01; veil.position.copy(camera.position); veil.material.uniforms.uK.value = k;
    S.zoom += (S.zoomTarget - S.zoom) * Math.min(1, 8 * dt);
    placeRig(k);

    // rotation: drag inertia, then a gentle settle toward a stable resting attitude
    if (S.flip) {
      S.flip.t += dt;
      const f = ease(Math.min(1, S.flip.t / 0.7));
      pivot.quaternion.copy(S.flip.q0).slerp(S.flip.q1, f);
      if (S.flip.t >= 0.7) S.flip = null;
    } else if (!S.dragging && !ptrs.size && S.spin.lengthSq() > 1e-6) {   // coasting: nothing is touching it
      S.spin.clampLength(0, MAX_SPIN);
      const w = S.spin.length();
      turnCam(v4.copy(S.spin).divideScalar(w), w * dt);
      // coasts to rest (frame-rate independent); the fingers catch a slow spin sooner
      S.spin.multiplyScalar(Math.exp(-dt * (w < 0.6 ? 6 : 3.2)));
      if (S.spin.lengthSq() < 1e-4) S.spin.set(0, 0, 0);
    } else if (S.dragging || ptrs.size) S.spin.multiplyScalar(Math.exp(-dt * 12));   // held: only feeds the hand's response and the rub
    // rest on the palm: the lowest point touches it (2 mm sink into the skin)
    // and slides toward the finger roots, so its far face sits just over the knuckle line
    // (the fingers then have something to wrap around instead of hooking behind it)
    const low = lowest(), kRest = Math.min(1, 18 * dt);
    pivot.position.y += (-low.y - 0.002 - pivot.position.y) * kRest;
    pivot.position.z += (THREE.MathUtils.clamp(-0.05 - low.z, -0.03, 0) - pivot.position.z) * kRest;

    // a tap makes the stone jump a hair in the palm (an offset in time, not a per-frame push)
    if (S.tapHop != null) { S.tapHop += dt; S.hop = Math.sin(Math.min(1, S.tapHop / 0.11) * Math.PI) * 0.002; if (S.tapHop > 0.11) { S.tapHop = null; S.hop = 0; } }
    carrier.position.set(0, S.hop, 0);

    const handLight = placeLamp(dt, time);
    if (hands) {
      rig.updateMatrixWorld(true);
      hands.setGrip(gripRadius());
      if (S.sample) hands.setStone(S.sample, q.copy(follow.quaternion).multiply(pivot.quaternion), v3.copy(pivot.position).applyQuaternion(follow.quaternion).add(follow.position));
      hands.update(dt, {
        time, rollX: S.spin.y, rollY: S.spin.x, twist: S.spin.z, dip: S.dip || 0, flameFlicker: true,
        eye: eyeLocal, light: handLight, dragging: !!S.dragging && S.phase === "hold",
        // fingers open as the hand rises and close round the stone as it settles (and open again to let go)
        open: 1 - THREE.MathUtils.smoothstep(S.u, 0.45, 0.92),
        flip: S.flip ? Math.min(1, S.flip.t / 0.7) : 0, tap: S.tapT != null ? Math.min(1, S.tapT / TAP_T) : 0,
      });
      // the stone rides the palm (position + rotation only: the left body is mirrored)
      if (hands.leftBody) { follow.position.copy(hands.leftBody.position); follow.quaternion.copy(hands.leftBody.quaternion); }
      S.dip = Math.max(0, (S.dip || 0) - dt * 1.6);
    }
    updateWater(dt);
    sfx("rub", S.phase === "hold" && !S.flip && !document.hidden ? S.spin.length() : 0);
    // a tap makes the stone jump a hair in the palm
    if (S.tapT != null) {
      const before = S.tapT; S.tapT += dt;
      if (before < TAP_T * 0.6 && S.tapT >= TAP_T * 0.6) {           // the fingertip strikes
        S.tapHop = 0;
        const a = ctx.audio && ctx.audio();
        if (a && a.on) a.tap(voiceOf(S.spec)); else if (ctx.onMuted && !S.mutedHinted) { S.mutedHinted = true; ctx.onMuted(); }
      }
      if (S.tapT > TAP_T) S.tapT = null;
    }
    if (ctx.loupe) {
      // the lens comes up once the lamp hand is down (and goes before it comes back)
      ctx.loupe.setActive(S.loupe && S.phase === "hold" && S.away > 0.85);
      if (S.loupe) ctx.loupe.setPointer(S.pointerNdc.x, S.pointerNdc.y);
    }
  }

  function finish() {
    S.phase = "idle"; S.u = 0; rig.visible = false; veil.visible = false; lamp.intensity = 0; lamp.shadow.autoUpdate = false;
    sfx("rub", 0);
    api.cancelPointers();
    if (S.mesh) {
      carrier.remove(S.mesh);
      S.mesh.material.dispose();   // geometry: the vitrine's, or kept in the cache
      S.mesh = null;
    }
    S.drops.forEach((d) => palm.remove(d)); S.drops = [];
    if (ctx.loupe) ctx.loupe.setActive(false);
    const cb = S.onDone; S.onDone = null; cb && cb();
    notify();
  }

  /* ---------- turning ----------
     Rotations are given in the camera frame (x right, y up, z toward the eye)
     and applied in the palm frame, so they read the same however the hand tilts. */
  const camQ = new THREE.Quaternion(), ax3 = new THREE.Vector3();
  function turnCam(axisCam, angle) {
    if (!angle) return;
    camera.getWorldQuaternion(camQ);
    follow.getWorldQuaternion(q).invert();
    ax3.copy(axisCam).applyQuaternion(camQ).applyQuaternion(q).normalize();
    qd.setFromAxisAngle(ax3, angle); pivot.quaternion.premultiply(qd).normalize();
  }
  /* A virtual trackball (Bell's): a ball centred on the stone. Inside it the surface
     under the pointer goes where the pointer goes; outside, the ball becomes a
     hyperbolic sheet, so circling the stone twists it about the line of sight. */
  const ball = { x: 0, y: 0, r: 150 }, b0 = new THREE.Vector3(), b1 = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
  function measureBall(rect) {
    pivot.getWorldPosition(tmp2);
    const dist = camera.position.distanceTo(tmp2);
    tmp2.project(camera);
    ball.x = rect.left + (tmp2.x * 0.5 + 0.5) * rect.width;
    ball.y = rect.top + (-tmp2.y * 0.5 + 0.5) * rect.height;
    const focal = rect.height / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const stonePx = (S.radius || HELD_R) * focal / Math.max(0.05, dist);
    // a little larger than the stone: fine control, and a rim band where drags twist
    ball.r = clamp(stonePx * 1.9, 120, 0.32 * Math.min(rect.width, rect.height));
  }
  function ballPoint(x, y, out) {
    const nx = (x - ball.x) / ball.r, ny = -(y - ball.y) / ball.r, d2 = nx * nx + ny * ny;
    return out.set(nx, ny, d2 <= 0.5 ? Math.sqrt(1 - d2) : 0.5 / Math.sqrt(d2)).normalize();
  }

  /* ---------- input ----------
     One finger / the left button turns the stone directly (it moves exactly with
     the pointer); on release it keeps the velocity of the last ~80 ms, capped.
     Right button or Shift moves the lamp. Two fingers lock into either a pinch
     (nearer / farther, or lens power) or a pan (the lamp) — never both. A
     double-tap is two short, still presses of the primary pointer. */
  const ptrs = new Map();
  const gest = { mode: null, spread0: 0, mx0: 0, my0: 0, mx: 0, my: 0, spread: 0, ang0: 0, ang: 0 };
  const recent = [];                     // turn samples { t, v: axis × angle (camera frame) } for the release fling
  const spinFrom = (now) => {            // angular velocity over the last ~80 ms
    while (recent.length && now - recent[0].t > 80) recent.shift();
    if (recent.length < 2) return S.spin.set(0, 0, 0);
    const span = Math.max(16, now - recent[0].t) / 1000;
    S.spin.set(0, 0, 0); for (const r of recent) S.spin.add(r.v);
    return S.spin.divideScalar(span).clampLength(0, MAX_SPIN);
  };
  const record = (now, axis, angle) => { recent.push({ t: now, v: axis.clone().multiplyScalar(angle) }); spinFrom(now); };
  let lastTapT = -1e9, lastTapX = 0, lastTapY = 0;
  const twoPts = () => { const [a, b] = [...ptrs.values()]; return [Math.hypot(a.x - b.x, a.y - b.y), (a.x + b.x) / 2, (a.y + b.y) / 2, Math.atan2(b.y - a.y, b.x - a.x)]; };
  function lensScreen(rect) {
    // where the lens is drawn (its follow spring and sway included) and how big, in CSS px
    const L = ctx.loupe, u = L && L._debug && L._debug.uniforms, pr = (ctx.renderer && ctx.renderer.getPixelRatio()) || window.devicePixelRatio || 1;
    if (u && u.uCenterPx && u.uRadiusPx) return { x: rect.left + u.uCenterPx.value.x / pr, y: rect.top + rect.height - u.uCenterPx.value.y / pr, r: u.uRadiusPx.value / pr };
    return { x: rect.left + (S.pointerNdc.x * 0.5 + 0.5) * rect.width, y: rect.top + (-S.pointerNdc.y * 0.5 + 0.5) * rect.height, r: Math.max(0.14 * Math.min(rect.width, rect.height), 95) };
  }
  function lampNudge(dx, dy, gain) {
    S.lampAz = clamp(S.lampAz - dx * gain, AZ_MIN, AZ_MAX);
    S.lampEl = clamp(S.lampEl - dy * gain, -0.12, 0.95);
  }
  function lensPower(f) { if (ctx.loupe && ctx.loupe.setMagnification) ctx.loupe.setMagnification(clamp((ctx.loupe.magnification || 6) * f, 2, 12)); }
  function onHidden() { if (document.hidden) { sfx("rub", 0); api.cancelPointers(); } }
  document.addEventListener("visibilitychange", onHidden);

  const api = {
    rig, get active() { return S.phase !== "idle"; }, get holding() { return S.phase === "hold"; },
    get returning() { return S.phase === "return"; },
    /** hands / loupe arrive asynchronously (their modules load after the hall) */
    attach({ hands: h, loupe: l } = {}) {
      if (h && !hands) { hands = h; rig.add(h.left); rig.add(h.right); }
      if (l && !ctx.loupe) { ctx.loupe = l; if (l.setLight) l.setLight(lamp); }
    },
    get hasHands() { return !!hands; }, get hasLoupe() { return !!ctx.loupe; },
    /** src: { spec } for catalog stones, or { mesh } for a photo stone; from: the vitrine stone Object3D */
    begin(src, from, { camYaw, onDone, onChange }) {
      // changed your mind while the hands go down: the same stone comes straight back up
      if (S.phase === "return" && S.mesh && (src.spec ? S.spec && src.spec.id === S.spec.id : !S.spec)) { S.phase = "reach"; notify(); return; }
      if (S.phase !== "idle") return;
      api.cancelPointers();
      S.onDone = onDone; S.onChange = onChange; S.camYaw = camYaw; S.spec = src.spec || null;
      S.mesh = makeHeld(src);
      carrier.add(S.mesh); pivot.add(carrier); carrier.position.set(0, 0, 0); carrier.quaternion.identity(); carrier.scale.setScalar(1);
      // the vitrine piece stays on its stand (it's a showpiece, out of reach): the hands rise
      // with a hand-sized piece of the same stone, which settles into the palm as they come up
      const srcMesh = src.mesh || from;
      srcMesh.updateMatrixWorld(true);
      const sb = new THREE.Box3().setFromObject(srcMesh), sc = sb.getCenter(new THREE.Vector3()), ss = sb.getSize(new THREE.Vector3());
      S.from.copy(sc); S.fromQ.copy(srcMesh.getWorldQuaternion(new THREE.Quaternion()));
      S.fromScale = Math.max(ss.x, ss.y, ss.z) / (2 * HELD_R);
      settle(pivot.quaternion); pivot.position.set(0, 0.035, 0);
      S.spin.set(0, 0, 0); S.flip = null; S.wet = 0; S.wetTarget = 0; S.wetShown = false; S.zoom = S.zoomTarget = narrow() ? 0.52 : 0.44;
      S.lampAz = narrow() ? 1.1 : 0.85; S.lampEl = 0.55; S.loupe = false; S.mutedHinted = false; S.tapT = null; S.tapHop = null; S.hop = 0;
      S.away = S.light === "daylight" ? 1 : 0;
      S.phase = "reach"; S.t = 0; S.u = 0; rig.visible = true; sfx("glass");
      lamp.shadow.autoUpdate = true;
      notify();
    },
    end() { if (S.phase === "hold" || S.phase === "reach") { S.phase = "return"; S.t = 0; S.loupe = false; api.cancelPointers(); notify(); } },
    update,
    /** forget every tracked pointer, drag, pinch and lens carry (blur, hidden tab, phase changes) */
    cancelPointers() { ptrs.clear(); S.dragging = false; gest.mode = null; recent.length = 0; },
    /** quality tier changes reach the next pick-up (material tier and close-up detail) */
    setQuality(q) { ctx.quality = q; },
    pointerDown(e, rect) {
      if (S.phase === "idle") return;
      // a finger that lands on the lens carries it, keeping where on the glass it took hold
      let lens = null;
      if (S.loupe && e.pointerType !== "mouse" && ctx.loupe && ctx.loupe.active) {
        const L = lensScreen(rect);
        if (Math.hypot(e.clientX - L.x, e.clientY - L.y) < L.r * 1.1) lens = { dx: L.x - e.clientX, dy: L.y - e.clientY };
      }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: e.timeStamp || performance.now(), button: e.button, shift: e.shiftKey, lens, type: e.pointerType });
      if (lens) return;
      if (ptrs.size === 2) {
        const [sp, mx, my, an] = twoPts();
        Object.assign(gest, { mode: null, spread0: sp, spread: sp, mx0: mx, my0: my, mx, my, ang0: an, ang: an });
        S.dragging = false; recent.length = 0;
      } else if (ptrs.size === 1) { S.dragging = true; recent.length = 0; S.spin.set(0, 0, 0); measureBall(rect); }
    },
    pointerHover(e, rect) {
      S.pointerNdc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    },
    pointerMove(e, rect) {
      const p = ptrs.get(e.pointerId);
      // with a mouse the lens follows the hovering pointer, but stays put while the stone is turned
      if (e.pointerType === "mouse" && !ptrs.size) api.pointerHover(e, rect);
      if (!p) return;
      if (p.lens) { api.pointerHover({ clientX: e.clientX + p.lens.dx, clientY: e.clientY + p.lens.dy }, rect); return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (S.phase !== "hold") return;
      if (ptrs.size >= 2) {
        const [sp, mx, my, an] = twoPts();
        if (!gest.mode) {   // lock to whichever the fingers clearly do first
          const turned = Math.abs(Math.atan2(Math.sin(an - gest.ang0), Math.cos(an - gest.ang0)));
          if (turned > 0.14) { gest.mode = "twist"; gest.ang = gest.ang0; }   // catch up the dead zone: the stone stays with the fingers
          else if (Math.abs(sp - gest.spread0) > 24) gest.mode = "pinch";
          else if (Math.hypot(mx - gest.mx0, my - gest.my0) > 16) gest.mode = "pan";
        }
        const dAng = Math.atan2(Math.sin(an - gest.ang), Math.cos(an - gest.ang));
        if (gest.mode === "twist") {
          // the stone turns with the fingers, about the line of sight (screen y runs down: clockwise is negative)
          turnCam(Z, -dAng); record(e.timeStamp || performance.now(), Z, -dAng);
        } else if (gest.mode === "pinch") {
          const f = gest.spread / Math.max(1, sp);
          if (S.loupe) lensPower(1 / f); else S.zoomTarget = clamp(S.zoomTarget * f, 0.3, 0.62);
        } else if (gest.mode === "pan") lampNudge(mx - gest.mx, my - gest.my, 0.006);
        gest.spread = sp; gest.mx = mx; gest.my = my; gest.ang = an;
        return;
      }
      if (p.button === 2 || p.shift) { lampNudge(dx, dy, 0.008); return; }
      // the trackball: the grabbed point follows the pointer (twisting near and beyond the rim)
      ballPoint(e.clientX - dx, e.clientY - dy, b0); ballPoint(e.clientX, e.clientY, b1);
      const angle = Math.acos(clamp(b0.dot(b1), -1, 1));
      if (angle < 1e-6) return;
      v4.crossVectors(b0, b1).normalize();
      turnCam(v4, angle);
      record(e.timeStamp || performance.now(), v4, angle);
    },
    pointerUp(e) {
      const p = ptrs.get(e.pointerId);
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) gest.mode = null;
      if (!p) { if (!ptrs.size) S.dragging = false; return; }
      const now = e.timeStamp || performance.now();
      if (!ptrs.size && (S.dragging || recent.length)) {
        S.dragging = false;
        spinFrom(now);   // fling only if it was still moving when it let go (twists fling too)
        recent.length = 0;
      }
      // a double-tap / double-click turns it over: two short, still presses of the primary pointer
      const still = e.type !== "pointercancel" && p.button === 0 && !p.shift && !p.lens && now - p.t0 < 260 && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 8;
      if (still && !ptrs.size) {
        if (now - lastTapT < 320 && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 30) { api.flip(); lastTapT = -1e9; }
        else { lastTapT = now; lastTapX = e.clientX; lastTapY = e.clientY; }
      }
    },
    wheel(e) {
      // macOS turns Shift+wheel into a horizontal scroll: read whichever axis moved
      const d = e.deltaY || e.deltaX || 0;
      if (e.shiftKey) { S.lampEl = clamp(S.lampEl - d * 0.002, -0.12, 0.95); return; }
      if (S.loupe) { lensPower(Math.exp(-d * 0.0015)); return; }
      S.zoomTarget = clamp(S.zoomTarget + d * 0.0006, 0.3, 0.62);
    },
    key(code) {
      if (S.phase !== "hold") return false;
      if (code === "KeyF") { api.flip(); return true; }
      if (code === "KeyT") { api.wet(); return true; }
      if (code === "KeyZ") { api.toggleLoupe(); return true; }
      if (code === "KeyX") { api.tap(); return true; }
      if (code === "Digit1") { api.setLight("lamp"); return true; }
      if (code === "Digit2") { api.setLight("candle"); return true; }
      if (code === "Digit3") { api.setLight("daylight"); return true; }
      if (code === "Equal" || code === "NumpadAdd") { if (S.loupe) lensPower(1.25); return S.loupe; }
      if (code === "Minus" || code === "NumpadSubtract") { if (S.loupe) lensPower(0.8); return S.loupe; }
      // arrows (and Q / E for a twist) nudge the spin; held down they reach a gentle, bounded speed
      if (code === "ArrowLeft" || code === "ArrowRight") { S.spin.y = clamp(S.spin.y + (code === "ArrowLeft" ? -1.2 : 1.2), -3, 3); return true; }
      if (code === "ArrowUp" || code === "ArrowDown") { S.spin.x = clamp(S.spin.x + (code === "ArrowUp" ? -1.2 : 1.2), -3, 3); return true; }
      if (code === "KeyQ" || code === "KeyE") { S.spin.z = clamp(S.spin.z + (code === "KeyQ" ? 1.2 : -1.2), -3, 3); return true; }
      if (code === "Home") { api.reset(); return true; }
      return false;
    },
    flip() {
      if (S.phase !== "hold" || S.flip) return;
      const q0 = pivot.quaternion.clone();
      camera.getWorldDirection(tmp2); axisRight.crossVectors(tmp2, new THREE.Vector3(0, 1, 0)).normalize();
      const inv = follow.getWorldQuaternion(new THREE.Quaternion()).invert();
      const ax = axisRight.applyQuaternion(inv);
      S.flip = { t: 0, q0, q1: new THREE.Quaternion().setFromAxisAngle(ax, Math.PI).multiply(q0) };
      S.spin.set(0, 0, 0);
    },
    wet() { if (S.phase !== "hold") return; spawnDrops(); S.dip = 1; notify(); },
    toggleLoupe() {
      S.loupe = !S.loupe;
      // the lens comes up over the stone, not wherever a pointer last was
      if (S.loupe) { pivot.getWorldPosition(tmp2).project(camera); S.pointerNdc.set(tmp2.x, tmp2.y); }
      notify();
    },
    tap() {
      if (S.phase !== "hold" || S.tapT != null) return;
      S.tapT = 0; S.taps = (S.taps || 0) + 1;   // the index finger lifts, then flicks the stone (sound at the strike)
      notify();
    },
    setLight(name) { if (LIGHTS[name]) { S.light = name; notify(); } },
    reset() { S.flip = { t: 0, q0: pivot.quaternion.clone(), q1: settle(new THREE.Quaternion()) }; S.spin.set(0, 0, 0); S.lampAz = 0.85; S.lampEl = 0.55; S.zoomTarget = narrow() ? 0.52 : 0.44; },
    /** render the hand lens's view (before the main frame) */
    renderLoupe() { if (ctx.loupe && S.loupe && S.phase === "hold") ctx.loupe.render(); },
    /** distance from the eye to the stone, for depth of field */
    focusDistance() { pivot.getWorldPosition(tmp2); return camera.position.distanceTo(tmp2); },
    /** 0..1: how far the room should dim */
    roomDim() { return S.phase === "idle" ? 0 : S.blend; },
    state() { return { phase: S.phase, light: S.light, wet: S.wet > 0.05, loupe: S.loupe, away: S.away > 0.5, spec: S.spec, voice: voiceOf(S.spec), taps: S.taps || 0 }; },
    debug() { return { fromScale: S.fromScale, fromDist: camera.position.distanceTo(S.from), taps: S.taps || 0, phase: S.phase, q: pivot.quaternion.toArray(), lamp: lamp.position.toArray(), lampI: lamp.intensity, wet: S.wet, zoom: S.zoom, light: S.light, loupe: S.loupe }; },
    dispose() {
      document.removeEventListener("visibilitychange", onHidden);
      finish(); geoCache.forEach((g) => g.dispose()); geoCache.clear();
      scene.remove(rig); scene.remove(veil); veil.geometry.dispose(); veil.material.dispose(); dropGeo.dispose(); dropMat.dispose();
    },
  };
  return api;
}
