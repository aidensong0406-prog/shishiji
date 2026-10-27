// A self-contained stone viewer: one specimen on a plinth under a movable,
// shadow-casting key light. Used by the specimen page, the home hero and the
// thumbnail renderer. Renders on demand (only when something changed).

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { buildStoneGeometry } from "./geometry.js";
import { createStoneMaterial, setStoneWet, setStoneLens } from "./material.js";

const HDRI_URL = (import.meta.env ? import.meta.env.BASE_URL : "/") + "hdri/brown_photostudio_02_1k.hdr";
let envPromise = null;
function loadEnv(renderer) {
  if (!envPromise) {
    envPromise = new Promise((resolve) => {
      new RGBELoader().setDataType(THREE.HalfFloatType).load(HDRI_URL, (hdr) => {
        const pm = new THREE.PMREMGenerator(renderer);
        const tex = pm.fromEquirectangular(hdr).texture;
        hdr.dispose(); pm.dispose();
        resolve(tex);
      }, undefined, () => resolve(null));
    });
  }
  return envPromise;
}

export const KELVIN = { 1900: "#ff8b2b", 2700: "#ffb46b", 3500: "#ffd2a1", 4500: "#ffe7cf", 5500: "#fff4ea", 6500: "#fff9fd", 8000: "#e3e9ff" };

export const LIGHT_PRESETS = {
  gallery: { label: "Gallery", zh: "展厅", azimuth: 35, elevation: 48, distance: 4.2, angle: 26, penumbra: 0.55, intensity: 1.9, color: "#ffe2c0", ambient: 0.3, rim: 0.0 },
  raking: { label: "Raking", zh: "侧光", azimuth: 80, elevation: 9, distance: 4.4, angle: 30, penumbra: 0.35, intensity: 3.2, color: "#fff1de", ambient: 0.12, rim: 0.0 },
  top: { label: "Overhead", zh: "顶光", azimuth: 0, elevation: 86, distance: 4.0, angle: 22, penumbra: 0.6, intensity: 2.8, color: "#fff4ea", ambient: 0.25, rim: 0.0 },
  back: { label: "Backlight", zh: "逆光", azimuth: 180, elevation: 24, distance: 4.2, angle: 28, penumbra: 0.5, intensity: 3.0, color: "#ffe9d2", ambient: 0.15, rim: 1.4 },
  candle: { label: "Candle", zh: "烛光", azimuth: 300, elevation: 22, distance: 3.0, angle: 40, penumbra: 0.9, intensity: 2.2, color: "#ff9a45", ambient: 0.08, rim: 0.0 },
  daylight: { label: "North window", zh: "天光", azimuth: 220, elevation: 38, distance: 5.0, angle: 45, penumbra: 1.0, intensity: 2.0, color: "#e8eeff", ambient: 0.5, rim: 0.0 },
};

const deg = (d) => (d * Math.PI) / 180;

export class StoneScene {
  constructor(container, opt = {}) {
    this.container = container;
    this.opt = { interactive: true, quality: "hq", level: 6, plinth: true, ...opt };
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: !!opt.preserve }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, opt.maxDpr || 2));
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.95;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setClearColor(0x000000, 0);
    r.domElement.style.display = "block";
    r.domElement.style.width = "100%";
    r.domElement.style.height = "100%";
    r.domElement.style.touchAction = "none";
    container.appendChild(r.domElement);

    const scene = (this.scene = new THREE.Scene());
    const cam = (this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60));
    cam.position.set(2.6, 1.6, 3.4);

    // plinth: a dark honed-stone drum that receives the shadow
    this.stoneY = 0;
    if (this.opt.plinth) {
      const pm = new THREE.MeshStandardMaterial({ color: 0x0b0a09, roughness: 0.86, metalness: 0, envMapIntensity: 0.35 });
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.8, 0.24, 96, 1), pm);
      plinth.position.y = -0.12; plinth.receiveShadow = true;
      scene.add(plinth);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.752, 0.006, 6, 128), new THREE.MeshStandardMaterial({ color: 0x8c7146, metalness: 0.9, roughness: 0.35 }));
      rim.rotation.x = Math.PI / 2; scene.add(rim);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.ShadowMaterial({ opacity: 0.35 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -0.24; floor.receiveShadow = true;
      scene.add(floor);
    } else {
      // no plinth (thumbnails): a transparent shadow-catcher under the stone
      const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.ShadowMaterial({ opacity: 0.5 }));
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
      scene.add(floor);
    }

    // lights
    this.hemi = new THREE.HemisphereLight(0xfff3e2, 0x2a2420, 0.35);
    scene.add(this.hemi);
    const key = (this.key = new THREE.SpotLight(0xffffff, 2.6, 0, deg(26), 0.5, 1.2));
    key.castShadow = true;
    key.shadow.mapSize.set(opt.shadowSize || 2048, opt.shadowSize || 2048);
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.015;
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 14;
    scene.add(key); scene.add(key.target);
    this.rim = new THREE.DirectionalLight(0xdfe8ff, 0);
    scene.add(this.rim);
    // light gizmo: a small lamp head + beam line, shown while adjusting
    const giz = (this.gizmo = new THREE.Group());
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe6c4 }));
    giz.add(bulb);
    this.gizmoLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffd9a8, transparent: true, opacity: 0.6 }));
    scene.add(this.gizmoLine);
    giz.visible = false; this.gizmoLine.visible = false;
    scene.add(giz);

    this.light = { ...LIGHT_PRESETS.gallery, aimX: 0, aimY: 0 };
    this.stone = null; this.spec = null;
    this.wet = 0; this.lens = 0;
    this.turntable = false; this.sweep = false;
    this.frames = 0; this.dirty = 3;
    this.clock = new THREE.Clock();

    if (this.opt.interactive) {
      const c = (this.controls = new OrbitControls(cam, r.domElement));
      c.enableDamping = true; c.dampingFactor = 0.08;
      c.minDistance = 1.35; c.maxDistance = 9; c.maxPolarAngle = deg(96);
      c.rotateSpeed = 0.7; c.zoomSpeed = 0.8; c.panSpeed = 0.6;
      c.target.set(0, 0.5, 0);
      c.addEventListener("change", () => this.invalidate());
      this._dbl = (e) => this.focusAt(e);
      r.domElement.addEventListener("dblclick", this._dbl);
    }

    this.applyLight();
    this.envReady = loadEnv(r).then((env) => {
      if (this.disposed || !env) return;
      scene.environment = env;
      this.invalidate(4);
      this.opt.onEnv && this.opt.onEnv();
    });

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
    this.resize();
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  invalidate(n = 2) { this.dirty = Math.max(this.dirty, n); }

  resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  setSpecimen(spec, opt = {}) {
    if (this.stone) {
      this.scene.remove(this.stone);
      this.stone.geometry.dispose(); this.stone.material.dispose();
    }
    this.spec = spec;
    const geo = buildStoneGeometry(spec.shape, { level: opt.level ?? this.opt.level });
    const mat = createStoneMaterial(spec.look, { quality: this.opt.quality });
    const mesh = (this.stone = new THREE.Mesh(geo, mat));
    mesh.castShadow = true; mesh.receiveShadow = true;
    // size the stone for the plinth: scholar's peaks stand taller
    const bb = geo.boundingBox;
    const ext = new THREE.Vector3().subVectors(bb.max, bb.min);
    const s = 1.55 / Math.max(ext.x, ext.z * 1.05, ext.y * 0.85);
    mesh.scale.setScalar(s);
    mesh.position.y = -bb.min.y * s + 0.002;
    mesh.rotation.y = opt.rotation ?? 0.6;
    this.stoneHeight = ext.y * s;
    this.stoneRadius = geo.boundingSphere.radius * s;
    this.stoneCenter = geo.boundingSphere.center.clone().multiplyScalar(s).add(mesh.position);
    this.scene.add(mesh);
    setStoneWet(mat, this.wet); setStoneLens(mat, this.lens);
    if (this.controls) {
      this.controls.target.set(0, this.stoneHeight * 0.45, 0);
      this.controls.update();
    }
    this.applyLight();
    this.invalidate(3);
    return mesh;
  }

  /** Animated move to a named view, fitted to the stone. */
  frame(view = "three-quarter", zoom = 0.78) {
    const p0 = this.camera.position.clone(), q0 = this.camera.quaternion.clone();
    const t0 = this.controls ? this.controls.target.clone() : null;
    this.frameNow(view, zoom);
    const p1 = this.camera.position.clone(), t1 = this.controls ? this.controls.target.clone() : new THREE.Vector3();
    this.camera.position.copy(p0); this.camera.quaternion.copy(q0);
    if (t0) { this.controls.target.copy(t0); this.controls.update(); }
    this.animateCamera(p1, t1, opt_ms(view));
  }

  /** Place the camera immediately (thumbnails, first paint). */
  frameNow(view = "three-quarter", zoom = 1) {
    const h = this.stoneHeight || 0.8;
    const t = new THREE.Vector3(0, (this.stoneCenter ? this.stoneCenter.y : h * 0.45) * 0.95, 0);
    const R = this.stoneRadius || 0.9;
    const dirs = { "three-quarter": [0.62, 0.42, 0.66], front: [0, 0.18, 1], top: [0.001, 1, 0.02], side: [1, 0.2, 0], low: [0.7, 0.04, 0.7] };
    const dv = (dirs[view] || dirs["three-quarter"]).slice();
    // flat stones (slabs, discs) read better from higher up
    if (view === "three-quarter" && this.stone) {
      const bb0 = this.stone.geometry.boundingBox;
      const flat = (bb0.max.y - bb0.min.y) / Math.max(bb0.max.x - bb0.min.x, bb0.max.z - bb0.min.z);
      if (flat < 0.45) dv[1] += (0.45 - flat) * 1.6;
    }
    const dir = new THREE.Vector3(...dv).normalize();
    let d = (R / Math.sin(((this.camera.fov * Math.PI) / 180) / 2)) * 1.02;
    // refine against the projected bounding box so wide and tall stones both fill the frame
    if (this.stone) {
      this.stone.updateMatrixWorld();
      // project a sample of the real vertices (an axis-aligned box over-frames rotated slabs)
      const pa = this.stone.geometry.attributes.position, step = Math.max(1, Math.floor(pa.count / 700));
      const pts = []; const bb = new THREE.Box3();
      for (let i = 0; i < pa.count; i += step) { const v = new THREE.Vector3().fromBufferAttribute(pa, i).applyMatrix4(this.stone.matrixWorld); pts.push(v); bb.expandByPoint(v); }
      t.copy(bb.getCenter(new THREE.Vector3()));
      for (let it = 0; it < 3; it++) {
        this.camera.position.copy(dir).multiplyScalar(d).add(t); this.camera.lookAt(t); this.camera.updateMatrixWorld();
        let m = 0; for (const p of pts) { const v = p.clone().project(this.camera); m = Math.max(m, Math.abs(v.x), Math.abs(v.y)); }
        d *= m / 0.86;
      }
    }
    d /= zoom;
    this.camera.position.copy(dir).multiplyScalar(d).add(t);
    if (this.controls) { this.controls.target.copy(t); this.controls.update(); } else this.camera.lookAt(t);
    this.invalidate(2);
  }

  animateCamera(pos, target, ms = 700) {
    const p0 = this.camera.position.clone(), t0 = this.controls ? this.controls.target.clone() : new THREE.Vector3();
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    this._camAnim = { p0, t0, p1: pos.clone(), t1: target.clone(), start: performance.now(), ms: reduce ? 1 : ms };
    this.invalidate(2);
  }

  focusAt(e) {
    if (!this.stone || !this.controls) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const m = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(m, this.camera);
    const hit = ray.intersectObject(this.stone)[0];
    if (!hit) { this.frame(); return; }
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const pos = hit.point.clone().add(dir.multiplyScalar(1.45));
    this.animateCamera(pos, hit.point, 650);
  }

  setLight(patch) { Object.assign(this.light, patch); this.applyLight(); }
  applyLight() {
    const L = this.light, k = this.key;
    const h = this.stoneHeight || 0.8;
    const az = deg(L.azimuth), el = deg(L.elevation);
    const tgt = new THREE.Vector3(L.aimX * 0.8, h * 0.4 + L.aimY * 0.8, 0);
    k.position.set(Math.sin(az) * Math.cos(el) * L.distance, Math.sin(el) * L.distance + h * 0.4, Math.cos(az) * Math.cos(el) * L.distance);
    k.target.position.copy(tgt); k.target.updateMatrixWorld();
    k.angle = deg(L.angle); k.penumbra = L.penumbra; k.intensity = L.intensity;
    k.color.set(L.color);
    this.hemi.intensity = L.ambient;
    if (this.stone) this.stone.material.envMapIntensity = 0.12 + L.ambient * 1.1;
    this.rim.intensity = L.rim || 0;
    this.rim.position.set(-Math.sin(az) * 3, 2.5, -Math.cos(az) * 3);
    this.gizmo.position.copy(k.position);
    this.gizmo.children[0].material.color.set(L.color);
    const g = this.gizmoLine.geometry.attributes.position;
    g.setXYZ(0, k.position.x, k.position.y, k.position.z); g.setXYZ(1, tgt.x, tgt.y, tgt.z); g.needsUpdate = true;
    this.invalidate();
  }
  showGizmo(v) { this.gizmo.visible = v; this.gizmoLine.visible = v; this.invalidate(); }

  setWet(v) { this.wet = v; if (this.stone) setStoneWet(this.stone.material, v); this.invalidate(); }
  setLens(v) { this.lens = v; if (this.stone) setStoneLens(this.stone.material, v); this.invalidate(); }
  setTurntable(v) { this.turntable = v; this.invalidate(); }
  setSweep(v, onTick) { this.sweep = v; this._sweepTick = onTick; this.invalidate(); }

  /** Render now and return a data URL (photo capture / thumbnails). */
  capture(type = "image/jpeg", q = 0.92) {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL(type, q);
  }

  _loop() {
    if (this.disposed) return;
    this._raf = requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    let moving = false;
    if (this._camAnim && this.controls) {
      const a = this._camAnim; const t = Math.min(1, (performance.now() - a.start) / a.ms);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.camera.position.lerpVectors(a.p0, a.p1, e);
      this.controls.target.lerpVectors(a.t0, a.t1, e);
      if (t >= 1) this._camAnim = null;
      moving = true;
    }
    if (this.controls && this.controls.update()) moving = true;
    if (this.turntable && this.stone) { this.stone.rotation.y += dt * 0.35; moving = true; }
    if (this.sweep) {
      this.light.azimuth = (this.light.azimuth + dt * 40) % 360;
      this.applyLight();
      if (this._sweepTick) this._sweepTick(this.light.azimuth);
      moving = true;
    }
    if (moving) this.invalidate(1);
    if (this.dirty > 0) {
      this.dirty--;
      this.renderer.render(this.scene, this.camera);
      this.frames++;
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this._raf);
    this._ro.disconnect();
    if (this.controls) { this.controls.dispose(); this.renderer.domElement.removeEventListener("dblclick", this._dbl); }
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function opt_ms(view) { return view === "top" ? 900 : 700; }
