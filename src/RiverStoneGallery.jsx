import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import * as Tone from "tone";

import { HW, HD, HH, UF_Y, UF2_Y, SLAB_T, ATRIUM, STAIR, COURT, SLOT_XS, SLOT_POS, PILASTER_XS, PAVILION, FLOOR_Y, floorOfY, ceilingAt, EAST_WINDOWS } from "./three/constants.js";
import { buildInterior } from "./three/interior.js";
import { createStudy, LIGHTS as STUDY_LIGHTS } from "./three/study.js";
// the hands and the hand lens load on demand (and are optional: the study works without them)
const STUDY_MODULES = import.meta.glob(["./three/hands.js", "./three/loupe.js"]);
const LOUPE_RADIUS = 0.14;   // the hand lens's glass radius, as a fraction of the shorter screen side
import { softBeamMaterial } from "./three/beams.js";
import { buildStoneGeometry } from "./stones/geometry.js";
import { createStoneMaterial } from "./stones/material.js";
import { buildCabinets, cabinetLayout, CAB_W } from "./three/cabinets.js";
import { mergeStatic } from "./three/merge.js";
import { floorVase } from "./three/porcelain.js";
import { foliageGeometry, foliageMaterial } from "./three/foliage.js";
import { buildTiledRoof, buildHallRoof } from "./three/roof.js";
import { buildSetting } from "./three/setting.js";
import { courtStoneMaterial, slabGeometry, gardenRock } from "./three/courtstone.js";
import { thumbUrl } from "./app/catalog.js";
import { sampleGround, canStep, isWalkable } from "./three/floorplan.js";
import { storage } from "./utils/storage.js";
import { ARTS, MOON_ART } from "./data/arts.js";
import { hashStr, lerpAngle, mulberry, shapeNum } from "./utils/math.js";
import { deriveSurfaceMaps, normalFromCanvas } from "./utils/surfaceMaps.js";
import { loadModel, prepModel, MODEL, heavyMeshes } from "./three/models.js";
import {
  mkCanvas, toTex, loadArtTexture, drawPlate, makePlate,
  texFloor, texWoodPanel, texMarble, texLacquer, texCarpet,
  texTitleTablet, texEmptyCard, texBeamGradient,
} from "./three/textures.js";
import { makeStoneGeometry } from "./three/stone.js";
import { buildAudio } from "./three/audio.js";
import { buildEnvMap, loadHDRIEnv } from "./three/env.js";
import { BloomComposer } from "./three/post.js";
import { PostFX } from "./three/postEC.js";
import { makeContactShadow, makeInstanced } from "./three/decals.js";
import { QUALITY, autoQuality, saveQuality, hasSavedQuality, LOWER_TIER } from "./three/quality.js";

/** A catalog specimen presented in a vitrine (never persisted to storage). */
const catalogStone = (spec, slot) => ({
  id: spec.id, specId: spec.id, catalog: true, slot, name: spec.title.en, spec, addedAt: 0,
  observation: { title: spec.title.en, title_zh: spec.title.zh, placard: spec.notes.interpretation.text },
});

export default function RiverStoneGallery({ featured = [], cabinet = [], onOpenSpecimen, exitHref = "#/" }) {
  const containerRef = useRef(null);
  const joyBaseRef = useRef(null);
  const joyNubRef = useRef(null);

  const [stones, setStones] = useState({});            // slot -> stone
  const [nearSlot, setNearSlot] = useState(-1);
  const [showHelp, setShowHelp] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [toastAction, setToastAction] = useState(null);
  const soundToggleRef = useRef(null);
  const [inspecting, setInspecting] = useState(null);  // slot or null
  const [photoMode, setPhotoMode] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [quality, setQuality] = useState("medium");
  const [showSettings, setShowSettings] = useState(false);

  const stonesRef = useRef({});
  const lastNearRef = useRef(-1);
  const uiOpenRef = useRef(false);
  const pendingSlotRef = useRef(0);
  const interactRef = useRef(null);
  const escRef = useRef(null);
  const sceneApiRef = useRef(null);
  const camRef = useRef({ yaw: -Math.PI / 2, pitch: 0.04, dist: 5.6 });  // first-person: pitch≈level
  const keysRef = useRef({});
  const joyRef = useRef({ active: false, f: 0, r: 0 });
  const mountedRef = useRef(false);
  const toastTimer = useRef(null);
  const inspectRef = useRef(null);
  const photoRef = useRef(false);
  const photoCamRef = useRef({ x: -HW + 4, y: 1.6, z: 0, yaw: -Math.PI / 2, pitch: 0.12 });
  const captureRef = useRef(null);
  const inspectToggleRef = useRef(null);
  const photoToggleRef = useRef(null);
  const audioRef = useRef(null);
  const qualityRef = useRef(autoQuality());
  const composerRef = useRef(null);
  const ecRef = useRef(null);
  const applyQualityRef = useRef(null);

  const [hallReady, setHallReady] = useState(false);
  const [studyUI, setStudyUI] = useState(null);     // { phase, light, wet, loupe } while a stone is in hand
  const studyRef = useRef(null);
  const loupeRef = useRef(null);       // the hand lens (loads on demand)
  // the gesture hint over the held stone: shown when the stone lands, fades once the
  // visitor is using their hands, recalled with "?"
  const [hintOn, setHintOn] = useState(false);
  const hintTimer = useRef(null);
  const studyUseRef = useRef(null);    // the 3D input layer reports "the visitor used the stone"
  const studyHintRef = useRef(null);   // … and "?" (toggle the hint)
  const [lensMag, setLensMag] = useState(null);     // the hand lens's magnification, while it is up
  // compact chrome on phones; touch hints on coarse pointers
  const [vw, setVw] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1440));
  const narrow = vw < 640;
  const touchUI = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const hallReadyRef = useRef(false);
  useEffect(() => { hallReadyRef.current = hallReady; }, [hallReady]);
  const [nearCab, setNearCab] = useState(-1);       // index of the cabinet in reach (mezzanine)
  const [cabOpen, setCabOpen] = useState(null);     // cabinet index whose browser is open
  const [picked, setPicked] = useState(null);       // specimen id selected by clicking a stone
  const [pickedSlot, setPickedSlot] = useState(-1); // …and the vitrine it stands in (-1: a cabinet stone)
  const pickRef = useRef(null);
  const lastCabRef = useRef(-1);
  const cabLayout = React.useMemo(() => cabinetLayout(cabinet.length), [cabinet.length]);
  const byId = React.useMemo(() => new Map(cabinet.map((s) => [s.id, s])), [cabinet]);
  // a notice, optionally with one action ({ zh, en, run }) the visitor can take right there
  const toast = (msg, action) => {
    setToastMsg(msg);
    setToastAction(action || null);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => { setToastMsg(null); setToastAction(null); }, action ? 5200 : 3200);
  };

  const updateStones = (fn) => {
    const next = fn({ ...stonesRef.current });
    stonesRef.current = next;
    setStones(next);
  };

  const interact = () => {
    if (uiOpenRef.current) return;
    const i = lastNearRef.current;
    if ((i == null || i < 0) && lastCabRef.current >= 0) { setCabOpen(lastCabRef.current); return; }
    if (i == null || i < 0) return;
    if (stonesRef.current[i] && stonesRef.current[i].catalog && onOpenSpecimen) onOpenSpecimen(stonesRef.current[i].specId);
  };

  const dismissHelp = () => {
    setShowHelp(false);
    if (storage) storage.set("gallery:helpseen", "1").catch(() => {});
  };

  /* ---------------- inspect / photo / sound ---------------- */
  const enterInspect = (slot) => {
    if (slot == null || slot < 0 || !stonesRef.current[slot]) return;
    // the stone is in your hands now: the identification card and the settings step aside
    setPicked(null); setPickedSlot(-1); setShowSettings(false);
    setInspecting(slot);
  };
  const putBack = () => setInspecting(null);

  /* the gesture hint: on when the stone lands; once the visitor is turning it, it
     fades a few seconds later (sooner on later visits). "?" brings it back. */
  const HINT_KEY = "shishiji:study:hintseen";
  const hintSeen = () => { try { return localStorage.getItem(HINT_KEY) === "1"; } catch { return false; } };
  const fadeHint = (ms) => {
    if (hintTimer.current) return;
    hintTimer.current = setTimeout(() => {
      hintTimer.current = null;
      setHintOn(false);
      try { localStorage.setItem(HINT_KEY, "1"); } catch {}
    }, ms);
  };
  const showHint = (on) => {
    if (hintTimer.current) { clearTimeout(hintTimer.current); hintTimer.current = null; }
    setHintOn(on);
  };
  studyUseRef.current = () => { if (hintOn) fadeHint(3500); };
  studyHintRef.current = () => showHint(!hintOn);
  const holding = !!(studyUI && studyUI.phase === "hold");
  useEffect(() => {
    if (!holding) { showHint(false); return; }
    showHint(true);
    if (hintSeen()) fadeHint(4500);   // a returning visitor knows the gestures
  }, [holding]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current); }, []);
  // the lens's power, shown on its button while it is raised
  const lensUp = !!(studyUI && studyUI.loupe && studyUI.phase === "hold");
  useEffect(() => {
    if (!lensUp) { setLensMag(null); return; }
    const read = () => {
      const lp = loupeRef.current;
      const m = lp && typeof lp.magnification === "number" ? Math.round(lp.magnification * 2) / 2 : null;
      setLensMag((v) => (v === m ? v : m));
    };
    read();
    const id = setInterval(read, 250);
    return () => clearInterval(id);
  }, [lensUp]);
  const toggleInspect = () => {
    if (photoRef.current) return;
    if (inspectRef.current != null) setInspecting(null);
    else enterInspect(lastNearRef.current);
  };
  const togglePhoto = () => {
    if (inspectRef.current != null) return;
    setPhotoMode((v) => !v);
  };
  const snapPhoto = () => {
    if (captureRef.current) captureRef.current();
  };
  const toggleSound = async () => {
    try {
      if (!soundOn) {
        await Tone.start();
        if (!audioRef.current) audioRef.current = buildAudio();
        audioRef.current.setOn(true);
        setSoundOn(true);
        toast("琴音已开 · ambience on");
      } else {
        if (audioRef.current) audioRef.current.setOn(false);
        setSoundOn(false);
      }
    } catch (e) {
      toast("音频启动失败 · audio could not start");
    }
  };

  soundToggleRef.current = toggleSound;
  useEffect(() => { setQuality(qualityRef.current); }, []);

  const changeQuality = (q) => {
    qualityRef.current = q;
    setQuality(q);
    saveQuality(q);
    if (applyQualityRef.current) applyQualityRef.current(q);
  };

  /* keep latest closures available to the 3D loop / listeners */
  useEffect(() => { interactRef.current = interact; });
  useEffect(() => { inspectRef.current = inspecting; }, [inspecting]);
  useEffect(() => { photoRef.current = photoMode; }, [photoMode]);
  useEffect(() => { inspectToggleRef.current = toggleInspect; });
  useEffect(() => { photoToggleRef.current = togglePhoto; });
  pickRef.current = (id, slot) => { setPicked(id); setPickedSlot(id ? slot : -1); };
  useEffect(() => {
    escRef.current = () => {
      if (cabOpen != null) setCabOpen(null);
      else if (picked) setPicked(null);
      else if (showHelp) dismissHelp();
      else if (inspecting != null) setInspecting(null);
      else if (photoMode) setPhotoMode(false);
    };
  });
  useEffect(() => {
    uiOpenRef.current = showHelp || cabOpen != null;
  }, [showHelp, cabOpen]);

  /* ================= THREE.JS WORLD ================= */
  useEffect(() => {
    mountedRef.current = true;
    let worldAlive = true;   // this effect's world (StrictMode / remounts build a fresh one)
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x100e0c);
    scene.fog = new THREE.Fog(0x14110e, 16, 52);

    const camera = new THREE.PerspectiveCamera(
      56, Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight), 0.1, 420
    );

    const preset0 = QUALITY[qualityRef.current] || QUALITY.medium;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset0.pixelRatio));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = preset0.shadows;
    // the hall is static: refresh the shadow map a few times a second, not every frame
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;   // moodier; the HDRI adds ambient
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    // renderer.info counts the whole frame (lens view, shadow maps, scene and post passes):
    // the loop resets it once per frame instead of every render() call resetting it
    renderer.info.autoReset = false;
    const frameInfo = { calls: 0, triangles: 0, points: 0, lines: 0, shadowCalls: 0, shadowTriangles: 0, frame: 0 };
    {
      const sm = renderer.shadowMap, smRender = sm.render.bind(sm);
      sm.render = (lights, scn, cam) => {
        const c0 = renderer.info.render.calls, t0 = renderer.info.render.triangles;
        smRender(lights, scn, cam);
        frameInfo._sc += renderer.info.render.calls - c0; frameInfo._st += renderer.info.render.triangles - t0;
      };
      frameInfo._sc = 0; frameInfo._st = 0;
    }
    container.appendChild(renderer.domElement);

    /* environment reflections for brass / marble / glass / stone */
    const envTex = buildEnvMap(renderer);
    scene.environment = envTex;
    // upgrade to a real interior HDRI once it loads (true reflections);
    // falls back silently to the procedural env if the file is missing.
    let hdrTex = null;
    const hdrReady = loadHDRIEnv(renderer, import.meta.env.BASE_URL + "hdri/brown_photostudio_02_1k.hdr")
      .then((tex) => {
        if (!mountedRef.current) { tex.dispose(); return; }
        hdrTex = tex;
        scene.environment = tex;
      })
      .catch(() => {});

    /* REFLECTION PROBE: once the hall is dressed, capture it from the middle of
       the room into a cube map and use that as the environment. Floors, brass,
       glass and stones then reflect the hall itself (walls, lamps, carpet)
       instead of the studio HDRI — whose bright softbox used to wash half of
       the floor out to white. */
    let probeTex = null;
    const captureProbe = () => {
      if (!mountedRef.current) return;
      const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, generateMipmaps: false });
      const cc = new THREE.CubeCamera(0.1, 90, rt);
      cc.position.set(0, 2.4, 0);
      scene.add(cc);
      const hidden = [];
      scene.traverse((o) => { if (o.isPoints || (o.material && o.material.blending === THREE.AdditiveBlending)) { hidden.push([o, o.visible]); o.visible = false; } });
      const prevEnc = renderer.outputEncoding; renderer.outputEncoding = THREE.LinearEncoding;
      cc.update(renderer, scene);
      renderer.outputEncoding = prevEnc;
      hidden.forEach(([o, v]) => { o.visible = v; });
      scene.remove(cc);
      const pm = new THREE.PMREMGenerator(renderer);
      const env = pm.fromCubemap(rt.texture).texture;
      pm.dispose(); rt.dispose();
      if (probeTex) probeTex.dispose();
      probeTex = env;
      // the probe becomes the hall's environment: in r128 the environment also
      // lights diffuse surfaces, and the studio HDRI's overhead softboxes blew
      // every upward-facing surface (stands, pads, cushions) out to pastel
      scene.environment = env;
      scene.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
      if (typeof window !== "undefined") window.__hallProbe = true;
    };

    /* bloom composer — hand-rolled fallback for the Low tier */
    const composer = new BloomComposer(
      renderer, scene, camera,
      Math.max(1, container.clientWidth), Math.max(1, container.clientHeight),
      { enabled: preset0.bloom, intensity: 0.85, threshold: 0.6, knee: 0.25 }
    );
    composerRef.current = composer;

    /* high-fidelity EffectComposer (SSAO + UnrealBloom + DOF + SMAA) */
    const ec = new PostFX(
      renderer, scene, camera,
      Math.max(1, container.clientWidth), Math.max(1, container.clientHeight)
    );
    ec.configure(preset0);
    ecRef.current = ec;

    // single source of truth for colour management: the EffectComposer path
    // ends with GammaCorrectionShader so the renderer must NOT re-encode the
    // screen write; the hand-rolled bloom relies on the renderer doing sRGB.
    const setPostPath = (usingEC) => {
      renderer.outputEncoding = usingEC ? THREE.LinearEncoding : THREE.sRGBEncoding;
    };
    setPostPath(!!preset0.effectComposer);

    // one render entry point for both the loop and photo capture — picks the
    // EffectComposer path (with inspection-only DOF) or the hand-rolled bloom.
    const renderFrame = (dt) => {
      const p = QUALITY[qualityRef.current] || QUALITY.medium;
      const st = studyRef.current;
      if (st && st.active) st.renderLoupe();   // the hand lens's magnified view, before the frame
      if (p.effectComposer && ecRef.current) {
        if (st && st.holding) {
          // the stone in hand is sharp; the hall behind melts into bokeh
          ecRef.current.updateDOF(true, st.focusDistance());
        } else {
          ecRef.current.updateDOF(false, 0);
        }
        ecRef.current.render(dt || 0.016);
      } else {
        composer.render();
        // in overlay compositing the lens is drawn after the frame (a no-op otherwise)
        const lp = loupeRef.current;
        if (lp && lp.renderOverlay) lp.renderOverlay(null);
      }
    };

    /* ----- shared materials -----
       each mapped surface gets a NORMAL map derived from its own canvas
       texture (Sobel relief), so floor grout, wood grain, marble veins and
       carpet weave catch light instead of reading as flat printed colour. */
    const _tF = texFloor(), _tWp = texWoodPanel(false), _tWd = texWoodPanel(true),
          _tM = texMarble(), _tL = texLacquer(), _tC = texCarpet();
    const nrm = (tex, strength, rep) => {
      const n = normalFromCanvas(tex.image, { normalStrength: strength, repeat: rep || null });
      n.anisotropy = 8;
      return n;
    };
    const v2 = (s) => new THREE.Vector2(s, s);
    const M = {
      floor: new THREE.MeshPhysicalMaterial({ map: _tF, normalMap: nrm(_tF, 2.6, [6, 4]), normalScale: v2(0.55), roughness: 0.56, metalness: 0.0, clearcoat: 0, envMapIntensity: 0.32 }),
      carpet: new THREE.MeshStandardMaterial({ map: _tC, normalMap: nrm(_tC, 2.0, [5, 1]), normalScale: v2(0.7), roughness: 0.88, envMapIntensity: 0.25 }),
      lacquer: new THREE.MeshStandardMaterial({ map: _tL, normalMap: nrm(_tL, 1.3, [4, 2]), normalScale: v2(0.4), roughness: 0.62, metalness: 0.05, envMapIntensity: 0.4 }),
      // upper-wall plaster — real CC0 set loads over this warm-greige tint (below)
      wall: new THREE.MeshStandardMaterial({ color: 0xb4a890, roughness: 0.93, metalness: 0.0, envMapIntensity: 0.32, side: THREE.DoubleSide }),
      // ceiling coffer beams — real CC0 wood loads over this walnut tint (below)
      beam: new THREE.MeshStandardMaterial({ color: 0x5c452e, roughness: 0.72, metalness: 0.03, envMapIntensity: 0.38 }),
      wood: new THREE.MeshStandardMaterial({ map: _tWp, normalMap: nrm(_tWp, 1.5), normalScale: v2(0.45), roughness: 0.58, metalness: 0.04, envMapIntensity: 0.45 }),
      woodDark: new THREE.MeshStandardMaterial({ map: _tWd, normalMap: nrm(_tWd, 1.5), normalScale: v2(0.45), roughness: 0.55, metalness: 0.05, envMapIntensity: 0.5 }),
      marble: new THREE.MeshPhysicalMaterial({ map: _tM, normalMap: nrm(_tM, 1.1), normalScale: v2(0.3), roughness: 0.24, metalness: 0.0, clearcoat: 0, envMapIntensity: 0.7 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xc9a35c, roughness: 0.32, metalness: 0.95, envMapIntensity: 1.1 }),
      brassDark: new THREE.MeshStandardMaterial({ color: 0x8a6e3e, roughness: 0.42, metalness: 0.9, envMapIntensity: 0.9 }),
      limestone: new THREE.MeshStandardMaterial({ color: 0xd9cfba, roughness: 0.86, envMapIntensity: 0.25 }),
      stoneShade: new THREE.MeshStandardMaterial({ color: 0xc2b8a2, roughness: 0.92 }),
      paper: new THREE.MeshStandardMaterial({ color: 0xf1e9d6, roughness: 0.94 }),
      velvet: new THREE.MeshStandardMaterial({ color: 0x1e0604, roughness: 0.92, envMapIntensity: 0.2 }),   // deep madder velvet (r128 hex is linear: a mid hex reads salmon under a spot)
      ink: new THREE.MeshStandardMaterial({ color: 0x23201c, roughness: 0.8 }),
    };
    const beamTex = texBeamGradient();

    /* upgrade the floor to a real photographic CC0 PBR set once it loads
       (color + normal + roughness). Falls back silently to the procedural
       herringbone if the files are missing. Both the ground floor and the
       mezzanine slab share M.floor, so both gain the real texture. */
    {
      const tl = new THREE.TextureLoader();
      const base = import.meta.env.BASE_URL + "textures/";
      const rep = (t, srgb) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(9, 6);
        t.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy?.() || 8);
        t.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
        return t;
      };
      const onErr = () => {};
      tl.load(base + "floor_diff_1k.jpg", (t) => {
        rep(t, true); M.floor.map = t; M.floor.needsUpdate = true;
      }, undefined, onErr);
      tl.load(base + "floor_nor_gl_1k.jpg", (t) => {
        rep(t, false); M.floor.normalMap = t;
        M.floor.normalScale.set(1.0, 1.0); M.floor.needsUpdate = true;
      }, undefined, onErr);
      tl.load(base + "floor_rough_1k.jpg", (t) => {
        rep(t, false); M.floor.roughnessMap = t; M.floor.roughness = 1.0;
        M.floor.needsUpdate = true;
      }, undefined, onErr);
    }

    /* a dedicated real-marble material for the grand staircase (kept separate
       from the dark pedestal marble). Light marble fallback before load. */
    const stairMat = new THREE.MeshPhysicalMaterial({
      color: 0xe9e4da, roughness: 0.32, metalness: 0.0,
      clearcoat: 0, envMapIntensity: 1.0,
    });
    {
      const tl = new THREE.TextureLoader();
      const base = import.meta.env.BASE_URL + "textures/";
      const rep = (t, srgb) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(2, 2);
        t.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy?.() || 8);
        t.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
        return t;
      };
      tl.load(base + "marble_diff_1k.jpg", (t) => { rep(t, true); stairMat.map = t; stairMat.color.set(0xffffff); stairMat.needsUpdate = true; }, undefined, () => {});
      tl.load(base + "marble_nor_gl_1k.jpg", (t) => { rep(t, false); stairMat.normalMap = t; stairMat.normalScale = new THREE.Vector2(0.6, 0.6); stairMat.needsUpdate = true; }, undefined, () => {});
      tl.load(base + "marble_rough_1k.jpg", (t) => { rep(t, false); stairMat.roughnessMap = t; stairMat.roughness = 1.0; stairMat.needsUpdate = true; }, undefined, () => {});
    }

    /* real CC0 plaster on the upper walls (color + normal + rough), kept under a
       warm-greige tint so the room stays refined; silent fallback to the tint. */
    {
      const tl = new THREE.TextureLoader();
      const base = import.meta.env.BASE_URL + "textures/";
      const rep = (t, srgb) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(9, 3);
        t.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy?.() || 8);
        t.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
        return t;
      };
      tl.load(base + "wall_diff_1k.jpg", (t) => { rep(t, true); M.wall.map = t; M.wall.color.set(0xcabfa8); M.wall.needsUpdate = true; }, undefined, () => {});
      tl.load(base + "wall_nor_gl_1k.jpg", (t) => { rep(t, false); M.wall.normalMap = t; M.wall.normalScale = new THREE.Vector2(0.7, 0.7); M.wall.needsUpdate = true; }, undefined, () => {});
      tl.load(base + "wall_rough_1k.jpg", (t) => { rep(t, false); M.wall.roughnessMap = t; M.wall.roughness = 1.0; M.wall.needsUpdate = true; }, undefined, () => {});
    }

    /* real CC0 wood on the ceiling coffer beams (color + normal + rough), kept
       under a walnut tint; silent fallback to the tint. */
    {
      const tl = new THREE.TextureLoader();
      const base = import.meta.env.BASE_URL + "textures/";
      const rep = (t, srgb) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(10, 1);
        t.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy?.() || 8);
        t.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
        return t;
      };
      tl.load(base + "beam_diff_1k.jpg", (t) => { rep(t, true); M.beam.map = t; M.beam.color.set(0x8a6e4c); M.beam.needsUpdate = true; }, undefined, () => {});
      tl.load(base + "beam_nor_gl_1k.jpg", (t) => { rep(t, false); M.beam.normalMap = t; M.beam.normalScale = new THREE.Vector2(0.6, 0.6); M.beam.needsUpdate = true; }, undefined, () => {});
      tl.load(base + "beam_rough_1k.jpg", (t) => { rep(t, false); M.beam.roughnessMap = t; M.beam.roughness = 1.0; M.beam.needsUpdate = true; }, undefined, () => {});
    }

    /* ----- lights ----- */
    const hemi = new THREE.HemisphereLight(0xf6efe4, 0x2c241b, 0.62);   // the slabs now shade the key, so ambient carries the rooms
    scene.add(hemi);  // less flat ambient → moodier, lets the spotlights pool
    const dir = new THREE.DirectionalLight(0xffeccf, 0.82);
    dir.position.set(5, 16, 4);            // high key, clears the upper floor
    dir.castShadow = true;
    dir.shadow.mapSize.set(preset0.shadowMap, preset0.shadowMap);
    // frustum reaches east past the moon-gate so the COURT gets real sun shadows too
    dir.shadow.camera.left = -22; dir.shadow.camera.right = 46;
    dir.shadow.camera.top = 19; dir.shadow.camera.bottom = -19;
    dir.shadow.camera.near = 1; dir.shadow.camera.far = 62;
    dir.shadow.bias = -0.0004;
    dir.shadow.camera.far = 80;   // reaches the ground floor through three storeys
    dir.shadow.normalBias = 0.02;
    dir.shadow.radius = 4;
    scene.add(dir); scene.add(dir.target);
    /* the study lamp: created up front (castShadow, dark) so turning it on never
       recompiles the hall's shaders; while idle its shadow map is not updated */
    scene.add(camera);   // the hand lens hangs from the camera
    const studyLamp = new THREE.SpotLight(0xffb86b, 0, 3, 0.62, 0.75, 2);
    studyLamp.castShadow = !!preset0.shadows;
    // the lamp's shadow map follows the tier (High is sharper); resized live by applyQuality
    const lampMapFor = (q) => (q === "high" ? 2048 : q === "low" ? 512 : 1024);
    const setLampMap = (q) => {
      const m = lampMapFor(q);
      if (studyLamp.shadow.mapSize.x === m) return;
      studyLamp.shadow.mapSize.set(m, m);
      // r128 rebuilds the map at the new size when it is null
      if (studyLamp.shadow.map) { studyLamp.shadow.map.dispose(); studyLamp.shadow.map = null; }
    };
    setLampMap(qualityRef.current);
    studyLamp.shadow.bias = -0.0004; studyLamp.shadow.normalBias = 0.0025; studyLamp.shadow.radius = 3;
    studyLamp.shadow.camera.near = 0.02; studyLamp.shadow.camera.far = 2.5;
    studyLamp.shadow.autoUpdate = false;
    studyLamp.position.set(0, -40, 0);
    scene.add(studyLamp);
    const study = createStudy({ scene, camera, renderer, lamp: studyLamp, quality: qualityRef.current, audio: () => audioRef.current, loupeRadius: LOUPE_RADIUS,
      // tapped with the sound off: offer the sound right there, then tap again so it is heard
      onMuted: () => toast("声音已关，叩石无声 · the sound is off — the stone's voice is silent", {
        zh: "开启声音", en: "Turn sound on",
        run: async () => { if (soundToggleRef.current) await soundToggleRef.current(); const s = studyRef.current; if (s && s.holding && audioRef.current && audioRef.current.on) setTimeout(() => s.tap(), 250); },
      }) });
    studyRef.current = study;
    if (study.setQuality) study.setQuality(qualityRef.current);
    // the lens's render target is sized to the lens on screen ("auto"), so it follows the
    // tier's pixel ratio; the options object stays live (loupe.js reads opts.size per frame)
    const loupeOpts = { size: "auto", radius: LOUPE_RADIUS };
    let myLoupe = null;
    Promise.all(Object.entries(STUDY_MODULES).map(([k, load]) => load().then((m) => [k, m]).catch(() => [k, null]))).then((mods) => {
      // this world only (React may have torn it down and built another meanwhile)
      if (!mountedRef.current || !worldAlive) return;
      for (const [k, m] of mods) {
        if (!m) continue;
        try {
          if (k.endsWith("hands.js") && m.createHands) {
            const h = m.createHands();
            study.attach({ hands: h });
            h.warm(renderer, scene, camera);   // compile the hand materials now, not on the first pickup
          }
          if (k.endsWith("loupe.js") && m.createLoupe) {
            const lp = m.createLoupe(renderer, scene, camera, loupeOpts);
            camera.add(lp.object);
            study.attach({ loupe: lp });
            loupeRef.current = myLoupe = lp;
            if (ecRef.current && ecRef.current.setLoupe) ecRef.current.setLoupe(lp);
          }
        } catch (e) { console.warn("[study] module failed", k, e); }
      }
    });

    const rim = new THREE.DirectionalLight(0xaecadc, 0.48);
    rim.position.set(-7, 6.5, -9);
    scene.add(rim);
    // soft COOL frontal fill — warm key against a cool fill gives the scene
    // cinematic warm/cool chiaroscuro depth instead of flat even light
    // (the cool frontal fill was folded into the hemisphere: one fewer light per pixel)
    // (the gate glow is the courtyard itself; no point light — every light costs every pixel)
    const moonLight = { intensity: 0, position: new THREE.Vector3() };

    /* ============== ARCHITECTURE ============== */
    const arch = new THREE.Group();
    scene.add(arch);
    const add = (mesh, cast, recv) => {
      if (cast) mesh.castShadow = true;
      if (recv) mesh.receiveShadow = true;
      arch.add(mesh);
      return mesh;
    };
    const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

    // place a real GLTF prop (load → prep → position → add). h = target height (m).
    const placeModel = (url, o = {}) => {
      const { x = 0, y = 0, z = 0, ry = 0, h, env = 0.7, rough, tint, parent = arch, shadow = true } = o;
      loadModel(url).then((scn) => {
        if (!scn || !mountedRef.current) return;
        const m = prepModel(scn, { envMapIntensity: env, targetHeight: h, roughness: rough, tint });
        // prepModel already offsets position.y to sit the base at 0 — ADD the floor
        // height (don't overwrite it), or models whose origin isn't at their base sink
        m.position.x = x; m.position.z = z; m.position.y += y; m.rotation.y = ry;
        if (!shadow) m.traverse((q) => { if (q.isMesh) q.castShadow = false; });
        parent.add(m);
      });
    };

    /* floor + skirting + carpet */
    const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, HD * 2), M.floor), false, true);
    floor.rotation.x = -Math.PI / 2;

    const carpet = add(new THREE.Mesh(new THREE.PlaneGeometry(HW * 2 - 5, 3.6), M.carpet), false, true);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.y = 0.015;

    /* walls (lacquer field) */
    const mkWallBox = (w, h, d, x, y, z) => {
      const m = add(box(w, h, d, M.wall), false, true);
      m.position.set(x, y, z);
    };
    mkWallBox(HW * 2 + 0.6, HH, 0.3, 0, HH / 2, -HD - 0.15);
    mkWallBox(HW * 2 + 0.6, HH, 0.3, 0, HH / 2, HD + 0.15);
    mkWallBox(0.3, HH, HD * 2 + 0.6, -HW - 0.15, HH / 2, 0);
    // EAST wall with a circular moon-gate opening onto the courtyard beyond
    {
      const ew = new THREE.Shape();
      const z0 = -(HD + 0.3), z1 = HD + 0.3;
      // the doorway is a notch in the wall's bottom edge: the outline runs along the floor,
      // climbs round the arch and comes back down. (A full-circle hole dipped below the floor,
      // crossing the outline, and the triangulation filled the lower half of the doorway.)
      const GR = 2.3, GY = 1.9, gx = Math.sqrt(GR * GR - GY * GY), aL = Math.atan2(-GY, -gx) + Math.PI * 2, aR = Math.atan2(-GY, gx);
      ew.moveTo(z0, 0); ew.lineTo(-gx, 0);
      for (let i = 1; i < 96; i++) { const a = aL - (i / 96) * (aL - aR); ew.lineTo(GR * Math.cos(a), GY + GR * Math.sin(a)); }
      ew.lineTo(gx, 0); ew.lineTo(z1, 0); ew.lineTo(z1, HH); ew.lineTo(z0, HH); ew.closePath();
      // real window openings on every storey (frames, lattice + paper in three/interior.js)
      for (const w of EAST_WINDOWS) {
        const p = new THREE.Path();
        p.moveTo(w.z - w.w / 2, w.y0); p.lineTo(w.z - w.w / 2, w.y1); p.lineTo(w.z + w.w / 2, w.y1); p.lineTo(w.z + w.w / 2, w.y0); p.closePath();
        ew.holes.push(p);
      }
      const ewGeo = new THREE.ShapeGeometry(ew);
      ewGeo.computeBoundingBox();
      const eb = ewGeo.boundingBox, ep = ewGeo.attributes.position, eu = ewGeo.attributes.uv;
      for (let i = 0; i < eu.count; i++) {
        eu.setXY(i, (ep.getX(i) - eb.min.x) / (eb.max.x - eb.min.x) * 4,
                    (ep.getY(i) - eb.min.y) / (eb.max.y - eb.min.y) * 2);
      }
      eu.needsUpdate = true;
      const ewMesh = new THREE.Mesh(ewGeo, M.wall);
      ewMesh.rotation.y = -Math.PI / 2;
      ewMesh.position.set(HW + 0.15, 0, 0);
      ewMesh.receiveShadow = true;
      arch.add(ewMesh);
      // EXTERIOR face seen from the courtyard: white-plaster facade (粉墙) with a
      // dark stone plinth course and grey-tiled eave. Before this the hall was a
      // one-sided shell and you could see its beams from outside.
      const facadeMat = new THREE.MeshStandardMaterial({ color: 0xd9d3c6, roughness: 0.93, envMapIntensity: 0.25 });
      const exGeo = ewGeo.clone();
      const exMesh = new THREE.Mesh(exGeo, facadeMat);
      exMesh.rotation.y = Math.PI / 2;
      exMesh.scale.x = -1;                 // mirror so the hole stays centred after the flip
      exMesh.position.set(HW + 0.45, 0, 0);
      exMesh.receiveShadow = true; exMesh.castShadow = true;
      exMesh.material.side = THREE.DoubleSide;
      arch.add(exMesh);
      // gate reveal: the thickness of the wall, visible as you pass through
      const reveal = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.32, 72, 1, true), new THREE.MeshStandardMaterial({ color: 0xcfc8b9, roughness: 0.9, side: THREE.BackSide, envMapIntensity: 0.25 }));
      reveal.rotation.z = Math.PI / 2; reveal.position.set(HW + 0.3, 1.9, 0);
      reveal.receiveShadow = true; arch.add(reveal);
      // exterior moon-gate surround (stone ring) + plinth course + tiled eave
      const exRing = new THREE.Mesh(new THREE.TorusGeometry(2.42, 0.13, 14, 72), new THREE.MeshStandardMaterial({ color: 0x5a554e, roughness: 0.85, envMapIntensity: 0.3 }));
      exRing.rotation.y = Math.PI / 2; exRing.position.set(HW + 0.47, 1.9, 0); exRing.castShadow = true; arch.add(exRing);
      [[-HD - 0.3, -2.42], [2.42, HD + 0.3]].forEach(([z0, z1]) => {
        const course = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, z1 - z0), new THREE.MeshStandardMaterial({ color: 0x4f4a44, roughness: 0.95, envMapIntensity: 0.2 }));
        course.position.set(HW + 0.5, 0.31, (z0 + z1) / 2); course.receiveShadow = true; arch.add(course);
      });
      const eaveMat = new THREE.MeshStandardMaterial({ color: 0x323a37, roughness: 0.6, metalness: 0.05, envMapIntensity: 0.4 });
      // the HALL ROOF seen from the courtyard: concave tiled gable roof over the
      // whole hall (above the ceiling, so it never casts into the interior)
      // the long eave side faces the courtyard (ridge runs north–south), as a
      // Chinese hall presents itself to its court
      const hallRoof = buildHallRoof({ length: HD * 2 + 0.9, span: HW * 2 + 0.9, rise: 6.8, overhang: 1.6, woodMat: M.woodDark, ridgeMat: eaveMat, gableMat: facadeMat });
      hallRoof.rotation.y = Math.PI / 2; hallRoof.position.set(0, HH + 0.02, 0); arch.add(hallRoof);
      // exterior elevation: lacquered columns, a dark frieze under the eave,
      // a stone plinth course, and lattice windows (漏窗) flanking the gate
      const lacquer = new THREE.MeshStandardMaterial({ color: 0x5a1a12, roughness: 0.38, metalness: 0.04, envMapIntensity: 0.45 });
      const exX = HW + 0.5;
      // columns stand on the interior pilaster grid, between the window bays
      [-HD - 0.15, -9.9, -6.2, 6.2, 9.9, HD + 0.15].forEach((cz) => {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, HH - 0.9, 18), lacquer);
        col.position.set(exX + 0.12, (HH - 0.9) / 2 + 0.6, cz); col.castShadow = true; arch.add(col);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.6, 18), courtStoneMaterial("step", 41));
        base.position.set(exX + 0.12, 0.3, cz); arch.add(base);
      });
      const frieze = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, HD * 2 + 0.6), M.woodDark);
      frieze.position.set(exX + 0.2, HH - 0.5, 0); arch.add(frieze);
      const friezeTrim = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, HD * 2 + 0.6), new THREE.MeshStandardMaterial({ color: 0x2f5a4f, roughness: 0.6 }));
      friezeTrim.position.set(exX + 0.22, HH - 1.0, 0); arch.add(friezeTrim);
      // a timber floor band at each upper storey (with a short tiled pent eave)
      for (const fy of [UF_Y, UF2_Y]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.42, HD * 2 + 0.6), M.woodDark);
        band.position.set(exX + 0.14, fy + 0.05, 0); arch.add(band);
        const pent = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, HD * 2 + 0.8), eaveMat);
        pent.position.set(exX + 0.45, fy + 0.42, 0); pent.rotation.z = -0.3; pent.castShadow = true; arch.add(pent);
      }
    }

    /* ============== SECOND FLOOR — mezzanine slab, atrium, grand staircase ============== */
    {
      /* --- mezzanine scholar's vignette: 太湖石 on a stand + low table, guqin, censer --- */
      {
        const vg = new THREE.Group();
        vg.position.set(0, UF_Y, -7.2);
        // carved stand
        const standBase = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.18, 14), M.woodDark);
        standBase.position.y = 0.09; standBase.castShadow = true; vg.add(standBase);
        const standTop = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.08, 14), M.marble);
        standTop.position.y = 0.22; vg.add(standTop);
        // the 太湖石 — a REAL boulder model (was a cheap white low-poly blob),
        // scaled tall + narrow and dark-tinted to read as a craggy scholar rock
        loadModel(MODEL.boulder).then((scn) => {
          if (!scn || !mountedRef.current) return;
          const r = prepModel(scn, { envMapIntensity: 0.55, roughness: 0.93, tint: 0x837a6c, targetHeight: 1.7 });
          r.scale.x *= 0.6; r.scale.z *= 0.6;   // narrow it → a standing scholar rock
          r.position.y = 0.26;                      // sit on the stand top
          r.rotation.y = 2.1;
          vg.add(r);
        });
        // low scholar's table beside it
        const tx = 1.55;
        const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.07, 0.72), M.woodDark);
        tableTop.position.set(tx, 0.62, 0); tableTop.castShadow = true; tableTop.receiveShadow = true; vg.add(tableTop);
        [[-0.72, -0.3], [0.72, -0.3], [-0.72, 0.3], [0.72, 0.3]].forEach(([lx, lz]) => {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.07), M.wood);
          leg.position.set(tx + lx, 0.31, lz); vg.add(leg);
        });
        // guqin (lacquered board) + brass incense burner on the table
        const qin = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.05, 0.2), M.ink);
        qin.position.set(tx, 0.69, -0.12); vg.add(qin);
        const censer = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.1, 14), M.brass);
        censer.position.set(tx + 0.5, 0.71, 0.16); vg.add(censer);
        const censerFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.05, 12), M.brassDark);
        censerFoot.position.set(tx + 0.5, 0.64, 0.16); vg.add(censerFoot);
        // a warm accent spot lifting the dark scholar rock + table (museum-style)
        const vgSpot = new THREE.Object3D(); vgSpot.target = new THREE.Object3D();   // lit by the room; no extra spotlight
        vgSpot.position.set(0.4, 3.2, 0.8);
        vgSpot.target.position.set(0, 1.0, 0);
        vg.add(vgSpot); vg.add(vgSpot.target);
        if (preset0.contactShadows) vg.add(makeContactShadow(1.7, 0.45));
        arch.add(vg);
      }
    }


    /* WEST — carved title tablet + flanking scrolls */
    // sized to the ground storey: between the chair rail and the picture rail
    const tabletFrame = add(box(0.2, 2.44, 4.1, M.marble), true, false);
    tabletFrame.position.set(-HW + 0.12, 2.44, 0);   // its top clears the architrave (3.74 m)
    const tablet = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 2.25),
      new THREE.MeshStandardMaterial({ map: texTitleTablet(), roughness: 0.78 })
    );
    tablet.rotation.y = Math.PI / 2;
    tablet.position.set(-HW + 0.225, 2.44, 0);
    arch.add(tablet);
    [-1, 1].forEach((s, i) => {
      const art = ARTS[i === 0 ? 4 : 2];
      const sh = Math.min(2.2, 0.95 / art.ar);
      const sw = sh * art.ar;
      const rod = add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, sw + 0.3, 10), M.brass), false, false);
      rod.rotation.x = Math.PI / 2;
      rod.position.set(-HW + 0.12, 3.62, s * 4.3);
      const scroll = new THREE.Mesh(
        new THREE.PlaneGeometry(sw, sh),
        new THREE.MeshStandardMaterial({ map: loadArtTexture(art.d), roughness: 0.9, side: THREE.DoubleSide })
      );
      scroll.rotation.y = Math.PI / 2;
      scroll.position.set(-HW + 0.1, 3.52 - sh / 2, s * 4.3);
      arch.add(scroll);
    });

    /* EAST — the moon gate, now a floor-level 月洞门 doorway into the courtyard */
    // a flat grey-brick surround (门套) set into the wall around the opening, with a raised
    // bead on each edge, ending at the threshold — not a hoop sunk into the floor
    {
      const cy = 1.9;
      const band = (rIn, rOut, depth) => {
        const a0 = Math.asin(Math.max(-1, -cy / rOut)), a1 = Math.asin(Math.max(-1, -cy / rIn));
        const sh = new THREE.Shape();
        sh.moveTo(rOut * Math.cos(a0), cy + rOut * Math.sin(a0));
        sh.absarc(0, cy, rOut, a0, Math.PI - a0, false);
        sh.lineTo(-rIn * Math.cos(a1), cy + rIn * Math.sin(a1));
        sh.absarc(0, cy, rIn, Math.PI - a1, a1, true);
        sh.closePath();
        return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 96 });
      };
      const brick = new THREE.MeshStandardMaterial({ color: 0x77746d, roughness: 0.82, envMapIntensity: 0.3 });
      const bead = new THREE.MeshStandardMaterial({ color: 0x5c5a55, roughness: 0.7, envMapIntensity: 0.35 });
      for (const [rIn, rOut, d, mat] of [[2.3, 2.66, 0.06, brick], [2.3, 2.37, 0.1, bead], [2.59, 2.66, 0.1, bead]]) {
        const m = add(new THREE.Mesh(band(rIn, rOut, d), mat), true, true);
        m.rotation.y = -Math.PI / 2;            // shape x → along the wall (z), extrusion → into the hall (−x)
        m.position.set(HW + 0.15, 0, 0);
      }
    }
    // a low pale-stone threshold sill underfoot (was dark marble — read as a black slab)
    const sill = add(box(0.46, 0.05, 1.9, stairMat), false, true);
    sill.position.set(HW - 0.2, 0.025, 0);

    /* ============== COURTYARD GARDEN beyond the moon gate (a deeper world) ============== */
    const cyBambooCanes = [];   // for gentle sway in the render loop
    const cyKoi = [];           // koi gliding in the pool
    const cyPetals = [];        // drifting blossom petals
    const cyButterflies = [];   // butterflies fluttering over the garden
    let cyWaterNormal = null;
    let courtWaterMat = null;   // receives a sky reflection map once the photo loads   // scrolling ripple normal for the pond surface
    let cyLanternLight = null;  // garden stone-lantern glow, flickers like a candle
    {
      const CX0 = COURT.x0, CX1 = COURT.x1, CZ = COURT.z;   // shared garden extent
      // real CC0 stone paving + plaster on the court surfaces — proper textured
      // albedo (not flat light fills) is what stops the courtyard blowing out white
      const gardenMat = new THREE.MeshStandardMaterial({ color: 0x6a665e, roughness: 0.96, envMapIntensity: 0.18 });
      const wallMat = new THREE.MeshStandardMaterial({ color: 0xc9c5bc, roughness: 0.95, envMapIntensity: 0.22 });
      {
        const tl = new THREE.TextureLoader();
        const base = import.meta.env.BASE_URL + "textures/";
        const aniso = Math.min(16, renderer.capabilities.getMaxAnisotropy?.() || 8);
        const rep = (t, rx, ry, srgb) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = aniso; t.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding; return t; };
        tl.load(base + "court_paving_diff_1k.jpg", (t) => { rep(t, 11, 13, true); gardenMat.map = t; gardenMat.color.set(0xb0a99d); gardenMat.needsUpdate = true; }, undefined, () => {});
        tl.load(base + "court_paving_nor_gl_1k.jpg", (t) => { rep(t, 11, 13, false); gardenMat.normalMap = t; gardenMat.normalScale = new THREE.Vector2(1.1, 1.1); gardenMat.needsUpdate = true; }, undefined, () => {});
        tl.load(base + "court_paving_rough_1k.jpg", (t) => { rep(t, 11, 13, false); gardenMat.roughnessMap = t; gardenMat.roughness = 1.0; gardenMat.needsUpdate = true; }, undefined, () => {});
        /* albedo stays clean lime-white (粉墙); only the photo's relief is used */
        tl.load(base + "wall_nor_gl_1k.jpg", (t) => { rep(t, 9, 1.6, false); wallMat.normalMap = t; wallMat.normalScale = new THREE.Vector2(0.6, 0.6); wallMat.needsUpdate = true; }, undefined, () => {});
        tl.load(base + "wall_rough_1k.jpg", (t) => { rep(t, 9, 1.6, false); wallMat.roughnessMap = t; wallMat.roughness = 1.0; wallMat.needsUpdate = true; }, undefined, () => {});
      }
      // paving
      const paving = new THREE.Mesh(new THREE.PlaneGeometry(CX1 - CX0 + 0.5, CZ * 2), gardenMat);
      paving.rotation.x = -Math.PI / 2;
      paving.position.set((CX0 + CX1) / 2, 0.0, 0);
      paving.receiveShadow = true;
      arch.add(paving);
      // ===== detailed garden walls (粉墙黛瓦): stone base course, pilasters, an
      //       overhanging grey-tiled coping, and lattice windows — not flat boxes =====
      const gwH = 3.2;
      const wallBaseMat = new THREE.MeshStandardMaterial({ color: 0x565049, roughness: 0.95, envMapIntensity: 0.14 });
      const tileCapMat = new THREE.MeshStandardMaterial({ color: 0x2f3a35, roughness: 0.55, metalness: 0.08, envMapIntensity: 0.4 });
      const gw = (w, d, x, z) => {
        const horizontal = w > d, L = horizontal ? w : d, T = horizontal ? d : w;
        const base = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? w : T + 0.14, 0.55, horizontal ? T + 0.14 : d), wallBaseMat);
        base.position.set(x, 0.275, z); base.castShadow = true; base.receiveShadow = true; arch.add(base);
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, gwH, d), wallMat);
        m.position.set(x, gwH / 2 + 0.12, z); m.castShadow = true; m.receiveShadow = true; arch.add(m);
        const nP = Math.max(2, Math.round(L / 3.6));
        for (let i = 0; i <= nP; i++) {
          const f = i / nP - 0.5;
          const pil = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? 0.24 : T + 0.18, gwH, horizontal ? T + 0.18 : 0.24), wallBaseMat);
          pil.position.set(horizontal ? x + f * L : x, gwH / 2 + 0.12, horizontal ? z : z + f * L);
          pil.castShadow = true; arch.add(pil);
        }
        const cL = L + 0.4, ov = T + 0.6;
        const eave = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? cL : ov, 0.08, horizontal ? ov : cL), M.woodDark);
        eave.position.set(x, gwH + 0.17, z); eave.castShadow = true; arch.add(eave);
        [-1, 1].forEach((s) => {
          const slope = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? cL : ov / 2 + 0.07, 0.06, horizontal ? ov / 2 + 0.07 : cL), tileCapMat);
          if (horizontal) { slope.position.set(x, gwH + 0.32, z + s * ov / 4); slope.rotation.x = -s * 0.5; }
          else { slope.position.set(x + s * ov / 4, gwH + 0.32, z); slope.rotation.z = s * 0.5; }
          slope.castShadow = true; arch.add(slope);
        });
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? cL : 0.12, 0.1, horizontal ? 0.12 : cL), tileCapMat);
        ridge.position.set(x, gwH + 0.46, z); ridge.castShadow = true; arch.add(ridge);
      };
      gw(0.32, CZ * 2, CX1, 0);                 // far (east) wall
      gw(CX1 - CX0, 0.32, (CX0 + CX1) / 2, -CZ); // north wall (behind the walkway)
      gw(CX1 - CX0, 0.32, (CX0 + CX1) / 2, CZ);  // south wall
      // lattice windows (漏窗) set into the far wall — decorative round grilles
      const latMat = new THREE.MeshStandardMaterial({ color: 0x262019, roughness: 0.7, envMapIntensity: 0.2 });
      [-6, 0, 6].forEach((wz) => {
        const wx = CX1 - 0.2;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.085, 12, 30), wallBaseMat);
        ring.position.set(CX1 - 0.19, 1.75, wz); ring.rotation.y = Math.PI / 2; ring.castShadow = true; arch.add(ring);
        // two concentric inner rings (团花 motif)
        [0.48, 0.24].forEach((rr) => {
          const ir = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.03, 8, 24), latMat);
          ir.position.set(wx, 1.75, wz); ir.rotation.y = Math.PI / 2; arch.add(ir);
        });
        for (let bz = -1; bz <= 1; bz++) {     // a finer grid
          const bv = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.34, 0.035), latMat);
          bv.position.set(wx, 1.75, wz + bz * 0.4); arch.add(bv);
          const bh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 1.34), latMat);
          bh.position.set(wx, 1.75 + bz * 0.4, wz); arch.add(bh);
        }
        [-1, 1].forEach((d) => {               // diagonal ice-rays (冰裂纹)
          const dg = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.3, 0.03), latMat);
          dg.position.set(wx, 1.75, wz); dg.rotation.x = d * Math.PI / 4; arch.add(dg);
        });
      });
      // (east-wall planters removed — the layered east border replaces them)
      // ===== photographic SKY DOME: a real partly-cloudy sky (CC0 photo strip,
      //       public/textures/sky_courtyard.jpg) wrapped around the court with a
      //       mirrored repeat (no seam), its horizon at eye level, blending into
      //       a zenith blue sampled from the photo. Replaces the painted gradient. =====
      const skyMat = new THREE.ShaderMaterial({
        uniforms: { tSky: { value: null }, uZenith: { value: new THREE.Color(0x3f62a8) }, uHaze: { value: new THREE.Color(0xc9d3dc) }, uReady: { value: 0 } },
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          uniform sampler2D tSky; uniform vec3 uZenith; uniform vec3 uHaze; uniform float uReady; varying vec3 vDir;
          void main(){
            vec3 d = normalize(vDir);
            float el = asin(clamp(d.y, -1.0, 1.0));           // elevation (rad)
            float az = atan(d.z, d.x) / 6.2831853 + 0.5;       // 0..1 around
            float u = az * 2.6;                                // ~2.6 photo widths around the dome
            u = abs(fract(u * 0.5) * 2.0 - 1.0);               // mirrored repeat → no seam
            float top = 1.05;                                  // photo top ≈ 60° up
            float v = 0.215 + clamp(el / top, 0.0, 1.0) * 0.785;
            vec3 photo = pow(texture2D(tSky, vec2(u, v)).rgb, vec3(2.2));   // sRGB photo → linear
            vec3 base = mix(pow(uHaze, vec3(2.2)), pow(uZenith, vec3(2.2)), smoothstep(0.0, 1.2, el));
            vec3 c = mix(base, photo, uReady * (1.0 - smoothstep(top - 0.25, top + 0.15, el)));
            c = mix(c, pow(uHaze, vec3(2.2)), (1.0 - smoothstep(-0.02, 0.06, el)) * 0.9);   // haze below the horizon line
            gl_FragColor = linearToOutputTexel(vec4(c * 0.92, 1.0));
          }`,
        side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
      });
      new THREE.TextureLoader().load(import.meta.env.BASE_URL + "textures/sky_courtyard.jpg", (t) => {
        t.encoding = THREE.LinearEncoding; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;   // decoded manually in the shader
        skyMat.uniforms.tSky.value = t; skyMat.uniforms.uReady.value = 1;
        // reflection env for the pond: sky photo (mirrored twice around) over dark ground
        try {
          const ec = document.createElement("canvas"); ec.width = 1024; ec.height = 512;
          const eg = ec.getContext("2d");
          eg.fillStyle = "#3a5a96"; eg.fillRect(0, 0, 1024, 256);
          for (let k = 0; k < 2; k++) { eg.save(); if (k) { eg.translate(1024, 0); eg.scale(-1, 1); } eg.drawImage(t.image, 0, 0, t.image.width, t.image.height * 0.78, 0, 40, 512, 216); eg.restore(); }
          eg.fillStyle = "#1c1b17"; eg.fillRect(0, 256, 1024, 256);
          // the walls around the pond reflect too (a plaster band at the horizon)
          eg.fillStyle = "#8f8a80"; eg.fillRect(0, 226, 1024, 34);
          const et = new THREE.CanvasTexture(ec); et.encoding = THREE.sRGBEncoding; et.mapping = THREE.EquirectangularReflectionMapping;
          const pm = new THREE.PMREMGenerator(renderer);
          const env = pm.fromEquirectangular(et).texture; pm.dispose(); et.dispose();
          if (courtWaterMat) { courtWaterMat.envMap = env; courtWaterMat.needsUpdate = true; }
        } catch (e) { /* reflections fall back to the hall HDRI */ }
      });
      // the landscape beyond the walls: trees, neighbours' roofs, distant hills
      buildSetting(arch, { cx: (CX0 + CX1) / 2, x0: CX0, x1: CX1, zHalf: CZ, woodMat: M.woodDark, ridgeMat: new THREE.MeshStandardMaterial({ color: 0x2a302e, roughness: 0.6 }) });
      const skyDome = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), skyMat);
      skyDome.position.set(CX0 + 12, 0.5, 0); skyDome.renderOrder = -2; arch.add(skyDome);
      // a warm, low "sun" over the court — a SHADOW-CASTING spotlight so the
      // pavilion, rocks and plants throw long shadows across the paving. This is
      // what turns the flat grey court into a vivid, sunlit garden with depth.
      // (Localized spot, not a global directional, so the tuned hall is untouched.)
      // the main sun (global directional) now reaches the court and casts its
      // shadows here; these add warm golden fill + a cool sky bounce so the
      // garden reads sunlit and vivid rather than flat overcast grey.
      // the cone is kept INSIDE the court: lights pass through walls, and the old
      // wide cone (78°) reached through the gate wall and burned out the hall floor
      const sun = new THREE.SpotLight(0xffe2bc, 0.95, 46, Math.PI / 5.4, 0.7, 1.0);
      sun.position.set(CX0 + 12.5, 20, -9);
      sun.target.position.set(CX0 + 12.5, 0, 1.5);
      arch.add(sun); arch.add(sun.target);
      const gWarm = new THREE.Object3D();   // (warm fill now comes from the hemisphere light)
      gWarm.position.set(CX0 + 8, 4.5, 3);
      arch.add(gWarm);
      // (cool sky bounce now comes from the hemisphere light)
      // brighten the moon-gate doorway (the "outer door") so the hall→court transition isn't dim
      // (the gate glow light was removed: the court sun now lights the new facade)
      // reflection pool (still dark water, glossy via IBL — no extra render pass)
      const courtStone = courtStoneMaterial("flag", 17);
      // a LARGE, natural pond — an irregular SPLINE outline (not a rectangle):
      // dark reflective water set in a wet-stone bank with edge rocks, lily pads,
      // lotus and koi. Centre/extent kept clear of the path + pedestals.
      const PCX = CX0 + 6.8, PCZ = 5;
      // a scrolling ripple normal map so the water is rippling, not a flat painted mirror
      const [wrc, wrg] = mkCanvas(256, 256);
      const wid = wrg.createImageData(256, 256);
      for (let yy = 0; yy < 256; yy++) for (let xx = 0; xx < 256; xx++) {
        const h = Math.sin(xx * 0.11) + Math.sin(yy * 0.13 + 1.2) + Math.sin((xx + yy) * 0.075 + 2.1) + Math.sin((xx - yy) * 0.095 + 0.6);
        const v = 128 + h * 24; const ii = (yy * 256 + xx) * 4;
        wid.data[ii] = wid.data[ii + 1] = wid.data[ii + 2] = v; wid.data[ii + 3] = 255;
      }
      wrg.putImageData(wid, 0, 0);
      cyWaterNormal = normalFromCanvas(wrc, { normalStrength: 1.8, size: 256 });
      cyWaterNormal.wrapS = cyWaterNormal.wrapT = THREE.RepeatWrapping; cyWaterNormal.repeat.set(2.1, 1.6);
      // dark, clear water whose reflections come from the courtyard sky photo (set below)
      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x060d0b, roughness: 0.06, metalness: 0.0, envMapIntensity: 0.55,
        transparent: true, opacity: 0.95, normalMap: cyWaterNormal, normalScale: new THREE.Vector2(0.22, 0.22),
      });
      courtWaterMat = waterMat;
      const bankMat = courtStoneMaterial("step", 33);
      const pondShape = (rx, rz, seed) => {
        const rr = mulberry(seed), n = 13, pts = [];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2, k = 0.74 + rr() * 0.46;
          pts.push(new THREE.Vector2(Math.cos(a) * rx * k, Math.sin(a) * rz * k));
        }
        const s = new THREE.Shape();
        s.moveTo(pts[0].x, pts[0].y);
        s.splineThru(pts.slice(1).concat([pts[0]]));
        s.closePath();
        return s;
      };
      const bank = new THREE.Mesh(new THREE.ShapeGeometry(pondShape(2.9, 3.35, 41)), bankMat);
      bank.rotation.x = -Math.PI / 2; bank.position.set(PCX, 0.07, PCZ); bank.receiveShadow = true; arch.add(bank);
      // a few fallen petals floating on the pond surface
      const pondPetalMat = new THREE.MeshStandardMaterial({ color: 0xe7b4cb, roughness: 0.8, side: THREE.DoubleSide });
      { const pr = mulberry(77);
        for (let p = 0; p < 18; p++) {
          const fl = new THREE.Mesh(new THREE.CircleGeometry(0.035, 5), pondPetalMat);
          fl.rotation.set(-Math.PI / 2, 0, pr() * 6.28);
          fl.position.set(PCX + (pr() - 0.5) * 4, 0.151, PCZ + (pr() - 0.5) * 4.6); arch.add(fl);
        } }
      // a low stone-slab bridge (石板桥) crossing the pond
      const bridgeMat = courtStoneMaterial("flag", 31);
      [-1.5, 0, 1.5].forEach((bx, i) => {
        const slab = new THREE.Mesh(slabGeometry(500 + i, 1.75, 0.1, 0.55, { wear: 0.2, square: 0.9 }), bridgeMat);
        slab.position.set(PCX + bx, 0.15, PCZ); slab.rotation.y = (i - 1) * 0.05; slab.castShadow = true; slab.receiveShadow = true; arch.add(slab);
        if (i < 2) {
          const pier = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.32), bridgeMat);
          pier.position.set(PCX + bx + 0.75, 0.1, PCZ); pier.castShadow = true; arch.add(pier);
        }
      });
      // reeds + cattails clustered at the pond margin for a natural waterline
      const reedMat = new THREE.MeshStandardMaterial({ color: 0x4e6b2c, roughness: 0.8, side: THREE.DoubleSide });
      const reedMat2 = new THREE.MeshStandardMaterial({ color: 0x3f5a22, roughness: 0.82, side: THREE.DoubleSide });
      const catHead = new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.85 });
      [0.4, 1.8, 3.0, 4.4, 5.6].forEach((a, c) => {
        const rr = mulberry(c * 17 + 7);
        const px = PCX + Math.cos(a) * (2.75 + rr() * 0.2), pz = PCZ + Math.sin(a) * (3.1 + rr() * 0.2);
        const nbl = 5 + (c % 3);
        for (let b = 0; b < nbl; b++) {
          const h = 0.7 + rr() * 0.5;
          const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.04, h), b % 2 ? reedMat : reedMat2);
          blade.position.set(px + (rr() - 0.5) * 0.3, h / 2, pz + (rr() - 0.5) * 0.3);
          blade.rotation.set((rr() - 0.5) * 0.3, rr() * 6.28, (rr() - 0.5) * 0.3);
          arch.add(blade);
        }
        if (c % 2 === 0) {                       // a cattail stem + brown seed-head
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 1.1, 5), reedMat2);
          stem.position.set(px, 0.55, pz); arch.add(stem);
          const head = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8), catHead);
          head.position.set(px, 1.02, pz); head.castShadow = true; arch.add(head);
        }
      });
      const pool = new THREE.Mesh(new THREE.ShapeGeometry(pondShape(2.5, 2.95, 41)), waterMat);
      pool.rotation.x = -Math.PI / 2; pool.position.set(PCX, 0.13, PCZ); arch.add(pool); // dark water mirroring the sky
      // natural stones set along the pond bank
      const edgeRockSpots = [[2.3, 0.4], [-2.2, -1.1], [0.5, 3.1], [-1.4, 2.7], [2.0, -2.1]];
      const edgeRockGroups = edgeRockSpots.map(([dx, dz], i) => { const g = new THREE.Group(); g.position.set(PCX + dx, 0.06, PCZ + dz); g.rotation.y = dx * 3; g.add(gardenRock("accent", 300 + i, 0.3 + (i % 3) * 0.12)); arch.add(g); return g; });
      loadModel(MODEL.boulder).then((scn) => {
        if (!scn || !mountedRef.current) return;
        void scn;
      });
      // lily pads + lotus blooms floating on the pond (varied green, slight tilt — not flat discs)
      const lotusMat = new THREE.MeshStandardMaterial({ color: 0xeaa9c6, roughness: 0.62, envMapIntensity: 0.3 });
      const padLeafMat = foliageMaterial("greenDeep", 41); padLeafMat.side = THREE.DoubleSide;
      [[-1.4, -1.8, 0.55], [0.9, -0.7, 0.62], [-0.6, 1.4, 0.5], [1.3, 2.0, 0.56], [0.2, -2.2, 0.44], [-1.5, 0.6, 0.52], [0.7, 1.1, 0.46], [1.7, -1.4, 0.42], [-0.2, -0.4, 0.58], [1.5, 0.3, 0.48], [-1.0, 2.3, 0.5]]
        .forEach(([dx, dz, r], i) => {
          const padMat = padLeafMat;
          const pg = new THREE.CircleGeometry(r * 0.62, 28, 0.3, Math.PI * 2 - 0.4);
          { const pa = pg.attributes.position; for (let q = 0; q < pa.count; q++) { const d = Math.hypot(pa.getX(q), pa.getY(q)) / (r * 0.62); pa.setZ(q, d ** 6 * 0.02); } pg.computeVertexNormals(); }
          const pad = new THREE.Mesh(pg, padMat);
          pad.rotation.x = -Math.PI / 2 + (i % 2 ? 0.07 : -0.05); pad.rotation.z = i * 1.3; pad.position.set(PCX + dx, 0.146 + (i % 3) * 0.004, PCZ + dz);
          pad.receiveShadow = true; arch.add(pad);
          if (i % 3 === 0) {
            const bloom = new THREE.Group(); bloom.position.set(PCX + dx, 0.165, PCZ + dz);
            for (let p = 0; p < 6; p++) {
              const pa = (p / 6) * Math.PI * 2;
              const petal = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.17, 4), lotusMat);
              petal.position.set(Math.cos(pa) * 0.055, 0.07, Math.sin(pa) * 0.055);
              petal.rotation.set(Math.cos(pa) * 0.6, -pa, Math.sin(pa) * 0.6); petal.castShadow = true; bloom.add(petal);
            }
            const center = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: 0xe8d44a, roughness: 0.6 }));
            center.position.y = 0.09; bloom.add(center); arch.add(bloom);
          }
        });
      const koiBody = (col) => {
        const g = new THREE.Group();
        const bm = new THREE.MeshStandardMaterial({ color: col, roughness: 0.32, metalness: 0.0, envMapIntensity: 0.45 });
        g.scale.setScalar(0.85);
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), bm);
        body.scale.set(0.55, 0.36, 1.9); body.position.z = 0.04; g.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), bm);
        head.scale.set(0.85, 0.62, 1.15); head.position.z = 0.23; g.add(head);
        const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 6), bm);
        tail.rotation.x = -Math.PI / 2; tail.position.z = -0.34; tail.scale.set(1, 0.32, 1); g.add(tail);
        const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 4), bm);
        dorsal.position.set(0, 0.05, 0.0); dorsal.scale.set(0.6, 1, 2.2); g.add(dorsal);
        [-1, 1].forEach((s) => {
          const fin = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.11, 4), bm);
          fin.rotation.z = s * 1.3; fin.position.set(s * 0.075, -0.01, 0.16); fin.scale.set(0.55, 1, 1.5); g.add(fin);
        });
        return g;
      };
      [[0xe86a26, 0, 1.2, 1.7], [0xf2ece2, 2.1, 1.5, 2.1], [0xe8a52a, 4.0, 0.8, 1.3], [0x2b2b2b, 1.2, 1.4, 1.9]]
        .forEach(([col, ph, rx, rz], i) => {
          const k = koiBody(col); k.position.set(PCX, 0.142, PCZ); arch.add(k);
          cyKoi.push({ m: k, cx: PCX, cz: PCZ, ph, rx, rz, sp: 0.28 + i * 0.05 });
        });
      // 太湖石 scholar rock — generated by the stone engine (see gardenRock), set on
      // a low stone drum. The garden centrepiece.
      const rockGroup = new THREE.Group();
      rockGroup.position.set(CX0 + 4.6, 0, -4.6);
      arch.add(rockGroup);
      const rockBase = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.95, 0.34, 24), courtStoneMaterial("step", 19));
      rockBase.position.set(CX0 + 4.6, 0.17, -4.6); rockBase.castShadow = true; rockBase.receiveShadow = true;
      arch.add(rockBase);
      // a generated Taihu-style rock: pale grey limestone, pierced and hollowed
      rockGroup.add(gardenRock("taihu", 20261027, 3.3));
      // a literati pine (松) — a leaning gnarled trunk with flat horizontal
      // foliage pads (云片) instead of a lollipop ball
      const pineX = CX1 - 3.4, pineZ = -5.6;
      const barkMat = new THREE.MeshStandardMaterial({ color: 0x3c2a1c, roughness: 0.93, envMapIntensity: 0.18 });
      const pineFol = foliageMaterial("pine", 3);
      const pineGeo = foliageGeometry(57, 3);
      const tr1 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 1.9, 8), barkMat);
      tr1.position.set(pineX, 0.95, pineZ); tr1.rotation.z = 0.13; tr1.castShadow = true; arch.add(tr1);
      const tr2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 1.7, 8), barkMat);
      tr2.position.set(pineX + 0.34, 2.4, pineZ - 0.12); tr2.rotation.z = -0.34; tr2.castShadow = true; arch.add(tr2);
      const brc = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 1.5, 6), barkMat);
      brc.position.set(pineX - 0.55, 2.05, pineZ + 0.25); brc.rotation.z = 1.15; brc.castShadow = true; arch.add(brc);
      // flat foliage pads: clusters of squashed irregular forms at layered heights
      [[pineX - 1.0, 2.6, pineZ + 0.35, 1.05], [pineX + 0.55, 3.35, pineZ - 0.12, 1.15],
       [pineX + 0.25, 2.5, pineZ + 0.6, 0.85], [pineX + 0.8, 2.05, pineZ - 0.55, 0.7]
      ].forEach(([px, py, pz, r]) => {
        const pad = new THREE.Group(); pad.position.set(px, py, pz);
        for (let k = 0; k < 6; k++) {
          const br2 = r * (0.45 + (k % 3) * 0.2);
          const blob = new THREE.Mesh(pineGeo, pineFol);
          blob.scale.set(1.15 * br2, 0.34 * br2, 1.15 * br2);
          blob.position.set((k - 2.5) * r * 0.32, (k % 2) * 0.09, (k % 3 - 1) * r * 0.34);
          blob.castShadow = true; pad.add(blob);
        }
        arch.add(pad);
      });
      // a proper hexagonal 石灯籠: base 竿 post, 中台, glowing 火袋 light chamber,
      // flared 笠 roof + 宝珠 finial — six-sided stonework, not a plain cylinder stack
      const lantern = new THREE.Group();
      lantern.position.set(CX0 + 9, 0, -1.5);
      const hexSeg = (rT, rB, h, y) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, h, 6), courtStone);
        m.position.y = y; m.castShadow = true; m.receiveShadow = true; m.rotation.y = Math.PI / 6; lantern.add(m); return m;
      };
      hexSeg(0.36, 0.44, 0.18, 0.09);        // 基礎 base stone
      hexSeg(0.12, 0.14, 0.5, 0.43);         // 竿 post
      hexSeg(0.28, 0.18, 0.1, 0.73);         // 中台 platform
      hexSeg(0.25, 0.25, 0.36, 0.95);        // 火袋 light chamber body
      // glowing window openings on alternating faces of the chamber
      const winMat = new THREE.MeshBasicMaterial({ color: 0xffe2ad, toneMapped: false });
      for (let f = 0; f < 6; f++) {
        const a = (f / 6) * Math.PI * 2;
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.22), winMat);
        win.position.set(Math.cos(a) * 0.236, 0.95, Math.sin(a) * 0.236);
        win.rotation.y = -a + Math.PI / 2;
        lantern.add(win);
      }
      hexSeg(0.5, 0.34, 0.1, 1.19);          // 笠 roof eave (flared)
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.3, 6), courtStone);
      roof.rotation.y = Math.PI / 6; roof.position.y = 1.39; roof.castShadow = true; lantern.add(roof);
      const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), courtStone);
      jewel.position.y = 1.6; jewel.castShadow = true; lantern.add(jewel);
      const lanternLight = new THREE.Object3D(); lanternLight.intensity = 0;   // the chamber glows (emissive); no real light
      lanternLight.position.y = 0.95; lantern.add(lanternLight);
      cyLanternLight = lanternLight;
      arch.add(lantern);

      // stepping-stone path winding in from the gate — irregular natural flagstones
      const stoneMat = courtStoneMaterial("step", 3);
      [[1.2, 0.1], [2.6, 0.5], [3.9, 1.2], [5.1, 2.2], [6.2, 3.4]].forEach(([dx, dz], i) => {
        const sr = mulberry(i * 13 + 3);
        const rad = 0.4 + sr() * 0.12;
        const s = new THREE.Mesh(slabGeometry(70 + i, rad * 2 * (1 + (sr() - 0.5) * 0.3), 0.1 + sr() * 0.04, rad * 2 * (0.72 + sr() * 0.22), { wear: 0.8, lump: 0.05, square: 0.25 }), stoneMat);
        s.position.set(CX0 + dx, 0.0, dz); s.rotation.y = sr() * 6.28;
        s.receiveShadow = true; s.castShadow = true; arch.add(s);
      });

      // a proper carved stone contemplation bench facing the 太湖石 (was plain boxes):
      // a pale beveled seat slab on two paneled stone supports with feet
      {
        const bg = new THREE.Group(); bg.position.set(CX0 + 7.6, 0, -1.2);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.13, 0.56), courtStone);
        seat.position.y = 0.47; seat.castShadow = true; seat.receiveShadow = true; bg.add(seat);
        const lip = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.04, 0.62), stoneMat);
        lip.position.y = 0.405; bg.add(lip);                         // shadow line under the seat
        [-0.72, 0.72].forEach((dx) => {
          const sup = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.36, 0.46), courtStone);
          sup.position.set(dx, 0.22, 0); sup.castShadow = true; bg.add(sup);
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.54), courtStone);
          foot.position.set(dx, 0.03, 0); bg.add(foot);
          const panel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.26), stoneMat);
          panel.position.set(dx + (dx > 0 ? 0.14 : -0.14), 0.22, 0); bg.add(panel);   // recessed side panel
        });
        arch.add(bg);
      }

      // a LUSH bamboo grove — deep-green culms with node rings + dense leaf fans
      const bambooMat = new THREE.MeshStandardMaterial({ color: 0x3c5418, roughness: 0.72, envMapIntensity: 0.22 });
      const bambooMat2 = new THREE.MeshStandardMaterial({ color: 0x4d6a22, roughness: 0.72, envMapIntensity: 0.22 });
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x324f1c, roughness: 0.62, envMapIntensity: 0.3, side: THREE.DoubleSide });
      const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x46672a, roughness: 0.62, envMapIntensity: 0.3, side: THREE.DoubleSide });
      const leafGeo = (() => {   // a lance-shaped leaf: pointed tip, narrow base, a gentle fold
        const shp = new THREE.Shape();
        shp.moveTo(0, -0.16); shp.quadraticCurveTo(0.05, -0.06, 0.034, 0.06); shp.quadraticCurveTo(0.02, 0.13, 0, 0.17);
        shp.quadraticCurveTo(-0.02, 0.13, -0.034, 0.06); shp.quadraticCurveTo(-0.05, -0.06, 0, -0.16);
        const g = new THREE.ShapeGeometry(shp, 6); const pa = g.attributes.position;
        for (let i = 0; i < pa.count; i++) pa.setZ(i, Math.abs(pa.getX(i)) * 0.35 + (pa.getY(i) + 0.16) ** 2 * 0.25);
        g.computeVertexNormals(); return g;
      })();
      const bambooGroup = new THREE.Group();
      bambooGroup.position.set(CX1 - 1.6, 0, 5.4);
      const nCane = 14;
      for (let i = 0; i < nCane; i++) {
        const h = 3.7 + (i % 5) * 0.62;
        const cx = ((i % 5) - 2) * 0.36 + (Math.floor(i / 5) - 1) * 0.22;
        const cz = Math.floor(i / 5) * -0.55 + ((i % 3) - 1) * 0.12;
        const cane = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.056, h, 10), i % 3 ? bambooMat : bambooMat2);
        cane.position.set(cx, h / 2, cz); cane.rotation.z = (i % 2 ? 1 : -1) * 0.025; cane.castShadow = true;
        bambooGroup.add(cane);
        for (let n = 1; n <= 6; n++) {
          const node = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.012, 5, 9), leafMat);
          node.rotation.x = Math.PI / 2; node.position.set(cx, (h / 6) * n, cz); bambooGroup.add(node);
        }
        cyBambooCanes.push({ m: cane, base: cane.rotation.z, ph: i * 0.7 });
        // dense leaf fans at two heights up the culm
        for (let cluster = 0; cluster < 2; cluster++) {
          const cy = h - 0.15 - cluster * 0.85;
          for (let l = 0; l < 6; l++) {
            const leaf = new THREE.Mesh(leafGeo, (l + cluster) % 2 ? leafMat : leafMat2);
            const a = (l / 6) * Math.PI * 2 + i * 1.3 + cluster * 0.8;
            leaf.position.set(cx + Math.cos(a) * 0.11, cy - l * 0.045, cz + Math.sin(a) * 0.11);
            leaf.rotation.set(Math.cos(a) * 1.1 - 0.55, -a, Math.sin(a) * 1.1 + 0.5);
            bambooGroup.add(leaf);
          }
        }
      }
      arch.add(bambooGroup);

      /* ===== a Chinese pavilion (亭) — the court's focal destination ===== */
      {
        const pav = new THREE.Group();
        pav.position.set(PAVILION.x, 0, PAVILION.z);
        const ridgeMat = new THREE.MeshStandardMaterial({ color: 0x222b27, roughness: 0.6, envMapIntensity: 0.35 });
        const colMat = new THREE.MeshStandardMaterial({ color: 0x57180f, roughness: 0.34, metalness: 0.05, envMapIntensity: 0.5 });  // deep lacquered vermilion (was washing to salmon)
        const woodMat2 = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.78, envMapIntensity: 0.28 });
        const goldMat = new THREE.MeshStandardMaterial({ color: 0xb89758, roughness: 0.4, metalness: 0.35, envMapIntensity: 0.6 });
        const p1 = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.18, 3.8), courtStone); p1.position.y = 0.09; p1.receiveShadow = true; pav.add(p1);
        const p2 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 3.2), courtStone); p2.position.y = 0.27; p2.receiveShadow = true; pav.add(p2);
        const colY = 0.36, colH = 2.7, cs = 1.28;
        [[-cs, -cs], [cs, -cs], [-cs, cs], [cs, cs]].forEach(([x, z]) => {
          const base = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.28, 0.12, 16), courtStone);
          base.position.set(x, colY + 0.03, z); base.castShadow = true; pav.add(base);   // 柱础 carved stone base
          const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.12, 14), courtStone);
          plinth.position.set(x, colY + 0.12, z); pav.add(plinth);
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.13, colH, 16), colMat);
          col.position.set(x, colY + 0.18 + colH / 2, z); col.castShadow = true; pav.add(col);
          // 斗拱 bracket capital where the column meets the beams (the iconic detail)
          const colTop = colY + 0.18 + colH;
          const dou = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.3), woodMat2);
          dou.position.set(x, colTop - 0.14, z); dou.castShadow = true; pav.add(dou);
          [0, Math.PI / 2].forEach((rr) => {
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.085, 0.12), colMat);
            arm.position.set(x, colTop - 0.06, z); arm.rotation.y = rr; pav.add(arm);
            [-0.27, 0.27].forEach((d) => {
              const blk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.12), woodMat2);
              blk.position.set(x + Math.cos(rr) * d, colTop - 0.02, z + Math.sin(rr) * d); pav.add(blk);
            });
          });
        });
        const beamY = colY + 0.18 + colH;
        [[0, -cs, 0], [0, cs, 0], [-cs, 0, Math.PI / 2], [cs, 0, Math.PI / 2]].forEach(([bx, bz, ry]) => {
          const beam = new THREE.Mesh(new THREE.BoxGeometry(cs * 2 + 0.3, 0.18, 0.11), woodMat2);
          beam.position.set(bx, beamY - 0.09, bz); beam.rotation.y = ry; pav.add(beam);
          const trim = new THREE.Mesh(new THREE.BoxGeometry(cs * 2 + 0.3, 0.05, 0.13), goldMat);
          trim.position.set(bx, beamY - 0.2, bz); trim.rotation.y = ry; pav.add(trim);
        });
        // bench rail on the back + two sides (front toward the approach left open)
        [[0, cs, 0], [-cs, 0, Math.PI / 2], [cs, 0, Math.PI / 2]].forEach(([bx, bz, ry]) => {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(cs * 2 - 0.1, 0.07, 0.09), woodMat2);
          rail.position.set(bx, colY + 0.52, bz); rail.rotation.y = ry; pav.add(rail);
        });
        // a real tiled 攒尖 roof: concave hip planes with upswept corners, clay
        // cover/pan tiles (procedural map + normal), hip ridges and timber eaves
        const roofBase = beamY + 0.06;
        const roofObj = buildTiledRoof({ W: 2.3, H: 2.05, lift: 0.42, curve: 1.7, woodMat: woodMat2, ridgeMat });
        roofObj.position.y = roofBase; pav.add(roofObj);
        const apexY = roofBase + roofObj.userData.apexY;
        const [tx, ty] = roofObj.userData.cornerTip;
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz]) => {   // bronze bells at the horn tips
          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 10), goldMat);
          tip.position.set(sx * tx, roofBase + ty - 0.1, sz * tx); tip.rotation.x = Math.PI; pav.add(tip);
        });
        const fb = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.24, 12), ridgeMat);
        fb.position.y = apexY + 0.04; pav.add(fb);
        const fball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), goldMat);
        fball.position.y = apexY + 0.27; pav.add(fball);
        const fspire = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.3, 10), goldMat);
        fspire.position.y = apexY + 0.5; pav.add(fspire);
        pav.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        arch.add(pav);
        // a real tea setting on the pavilion floor (y=0.36) — a tea table flanked by
        // two stools, with a ceramic teapot-vase, making 亭 a proper tea pavilion
        placeModel(MODEL.teaTable, { x: PAVILION.x, y: 0.36, z: PAVILION.z, ry: 0, h: 0.42, env: 0.55, rough: 0.7 });
        placeModel(MODEL.stool, { x: PAVILION.x, y: 0.36, z: PAVILION.z - 0.92, ry: 0, h: 0.46, env: 0.5 });
        placeModel(MODEL.stool, { x: PAVILION.x, y: 0.36, z: PAVILION.z + 0.92, ry: Math.PI, h: 0.46, env: 0.5 });
        placeModel(MODEL.vaseCeramic1, { x: PAVILION.x, y: 0.78, z: PAVILION.z, ry: 0.4, h: 0.18, env: 0.85 });
        // a real antique lantern hung from the pavilion beam over the tea table
        placeModel(MODEL.lantern, { x: PAVILION.x, y: 2.32, z: PAVILION.z, ry: 0, h: 0.5, env: 0.65 });
        const pavChain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), goldMat);
        pavChain.position.set(PAVILION.x, 3.05, PAVILION.z); pav.add(pavChain);
        const pavLantLight = new THREE.Object3D();   // emissive lantern only
        pavLantLight.position.set(PAVILION.x, 2.55, PAVILION.z); arch.add(pavLantLight);
      }

      // wisteria draping over the walkway beam (purple racemes + leaves)
      { const wz = CZ - 1.7, wx0 = CX0 + 3, wx1 = CX1 - 5, by = 0.18 + 2.55;
        const wisMat = new THREE.MeshStandardMaterial({ color: 0x9b7fd4, roughness: 0.75, emissive: 0x271c40, emissiveIntensity: 0.1 });
        const wisLeaf = new THREE.MeshStandardMaterial({ color: 0x4e6b2c, roughness: 0.82, side: THREE.DoubleSide });
        for (let i = 0; i < 6; i++) {
          const wx = wx0 + (wx1 - wx0) * ((i + 0.5) / 6), wr = mulberry(i * 19 + 4), len = 0.5 + wr() * 0.45;
          for (let f = 0; f < 11; f++) {
            const fl = new THREE.Mesh(new THREE.SphereGeometry(0.038 + wr() * 0.02, 6, 5), wisMat);
            fl.position.set(wx + (wr() - 0.5) * 0.14, by - 0.12 - (f / 11) * len, wz - 0.05); fl.scale.y = 1.3; arch.add(fl);
          }
          for (let l = 0; l < 3; l++) {
            const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.05), wisLeaf);
            lf.position.set(wx + (wr() - 0.5) * 0.3, by - 0.05 - l * 0.12, wz - 0.04); lf.rotation.z = (wr() - 0.5); arch.add(lf);
          }
        }
      }
      /* raked-gravel rock garden (枯山水) — a defined bed around the 太湖石 (hero scene) */
      const gravelMat = courtStoneMaterial("gravel", 13);
      const rakeMat = courtStoneMaterial("rake", 14);
      const gcx = CX0 + 4.6, gcz = -4.6;
      const gravel = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.04, 44), gravelMat);
      gravel.position.set(gcx, 0.03, gcz); gravel.receiveShadow = true; arch.add(gravel);
      const curb = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.08, 8, 52), courtStoneMaterial("step", 21));
      curb.rotation.x = Math.PI / 2; curb.position.set(gcx, 0.07, gcz); arch.add(curb);   // stone curb defines the bed
      for (let r = 0; r < 6; r++) {            // raked concentric rings (shared material)
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7 + r * 0.44, 0.018, 6, 48), rakeMat);
        ring.rotation.x = Math.PI / 2; ring.position.set(gcx, 0.05, gcz); arch.add(ring);
      }
      // a defined pale-stone path down the central axis (gate → pavilion) — gives the
      // court a clear circulation spine so the space reads organized, not a blank expanse
      {
        // natural flagstones laid in courses: a full-width slab, then a split pair
        const flagMat = courtStoneMaterial("flag", 9);
        const px0 = CX0 + 1.2, px1 = PAVILION.x - 1.8;
        const fr = mulberry(808);
        for (let x = px0, n = 0; x < px1 - 0.3; n++) {
          const len = Math.min(px1 - x, 0.75 + fr() * 0.35);
          const parts = n % 2 ? [[-0.5, 0.97], [0.5, 0.97]] : [[0, 1.98]];
          for (const [zc, w] of parts) {
            const slab = new THREE.Mesh(slabGeometry(900 + n * 7 + Math.round(zc * 3), len - 0.04, 0.07, w - 0.04, { wear: 0.12, square: 0.97, lump: 0.006 }), flagMat);
            slab.position.set(x + len / 2, 0.0, zc); slab.rotation.y = (fr() - 0.5) * 0.025; slab.receiveShadow = true; arch.add(slab);
          }
          x += len;
        }
      }
      /* ===== LAYERED planting borders (深 → 浅 / tall → low) that frame the court
         with green depth, instead of objects dotted on flat paving ===== */
      const bedGreens = [0x2c4422, 0x37562a, 0x3f6330, 0x294020];
      const soilMat = new THREE.MeshStandardMaterial({ color: 0x352a1f, roughness: 1.0, envMapIntensity: 0.06 });
      const edgeMat = courtStoneMaterial("step", 23);
      // PERF: share ONE geometry + a few materials across every bush/flower (was a new
      // geo+material per bush → hundreds of un-batched draws). Shadows off on small greenery.
      const bushGeo = foliageGeometry(31, 3);
      const flowerGeo = new THREE.SphereGeometry(0.05, 6, 5);
      const bedGreenMats = ["greenDeep", "green", "greenWarm", "greenOlive"].map((n, i) => foliageMaterial(n, 11 + i));
      const flowerMats = [0xe69ac0, 0xf0d860].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, emissive: 0x331a26, emissiveIntensity: 0.1 }));
      const greenDensity = preset0.courtFx ? 1.5 : 2.4;   // fewer bushes on the light tiers
      // a continuous border along a wall: 3 depth layers from the wall outward.
      const makeBorder = (start, end, wallPos, axisX, faceDir, seed) => {
        const rb = mulberry(seed), len = Math.abs(end - start), cMid = (start + end) / 2;
        const bedDepth = 1.6, edgePos = wallPos + faceDir * (bedDepth - 0.25);
        const soil = new THREE.Mesh(new THREE.BoxGeometry(axisX ? len + 0.4 : bedDepth, 0.1, axisX ? bedDepth : len + 0.4), soilMat);
        soil.position.set(axisX ? cMid : wallPos + faceDir * bedDepth / 2, 0.06, axisX ? wallPos + faceDir * bedDepth / 2 : cMid);
        soil.receiveShadow = true; arch.add(soil);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(axisX ? len + 0.4 : 0.14, 0.18, axisX ? 0.14 : len + 0.4), edgeMat);
        edge.position.set(axisX ? cMid : edgePos, 0.09, axisX ? edgePos : cMid); arch.add(edge);
        const n = Math.max(2, Math.round(len / greenDensity));
        for (let i = 0; i < n; i++) {
          const u = start + (end - start) * (n > 1 ? i / (n - 1) : 0.5);
          [[0.15, 1.05, 0.5], [0.7, 0.7, 0.42], [1.2, 0.36, 0.3]].forEach(([off, hgt, rad], li) => {
            const wp = wallPos + faceDir * off + (rb() - 0.5) * 0.12;
            const px = axisX ? u + (rb() - 0.5) * 0.25 : wp, pz = axisX ? wp : u + (rb() - 0.5) * 0.25;
            const baseRad = rad * (0.85 + rb() * 0.3);
            const bush = new THREE.Mesh(bushGeo, bedGreenMats[(i + li) % 4]);
            bush.scale.set(baseRad * 1.15, hgt / 2, baseRad * 1.15); bush.position.set(px, 0.1 + hgt / 2, pz); arch.add(bush);
            if (li === 2 && i % 2 === 0 && preset0.courtFx) {
              for (let f = 0; f < 3; f++) { const fl = new THREE.Mesh(flowerGeo, flowerMats[f % 2]); fl.position.set(px + (rb() - 0.5) * 0.45, 0.34 + rb() * 0.12, pz + (rb() - 0.5) * 0.35); arch.add(fl); }
            }
          });
        }
      };
      // frame the court: layered borders down BOTH long sides (S wall + in front of
      // the N walkway), so the central gate→pavilion axis reads with green depth
      makeBorder(CX0 + 3, CX1 - 2.5, -(CZ - 1.0), true, 1, 5);     // south wall
      makeBorder(CX0 + 4, CX1 - 5.5, CZ - 2.6, true, -1, 8);       // in front of the north walkway
      makeBorder(2.8, CZ - 5.5, CX1 - 1.0, false, -1, 14);         // east wall, N of the pavilion
      makeBorder(-(CZ - 5.5), -2.8, CX1 - 1.0, false, -1, 12);     // east wall, S of the pavilion
      // FOREGROUND framing masses flanking the gate entry — a near layer for depth
      makeBorder(CX0 + 1.8, CX0 + 4.4, -5.6, true, 1, 21);
      makeBorder(CX0 + 1.8, CX0 + 4.4, 5.6, true, -1, 22);
      // tall layered conifers (松柏) rising from those masses — vertical framing for the vista
      [-5.4, 5.4].forEach((fz) => {
        const tg = new THREE.Group(); tg.position.set(CX0 + 3.1, 0, fz);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.3, 8), new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.9, envMapIntensity: 0.15 }));
        trunk.position.y = 0.65; trunk.castShadow = true; tg.add(trunk);
        // a columnar juniper: overlapping foliage masses tapering upward
        const junGeo = foliageGeometry(61, 3), junMat = foliageMaterial("pine", 7);
        for (let l = 0; l < 7; l++) {
          const rr2 = 0.82 - l * 0.1;
          const tier = new THREE.Mesh(junGeo, junMat);
          tier.scale.set(rr2, 0.62, rr2 * 0.95); tier.position.set(Math.sin(l * 2.1) * 0.06, 1.3 + l * 0.46, Math.cos(l * 1.7) * 0.06);
          tier.rotation.y = l * 1.3; tier.castShadow = true; tg.add(tier);
        }
        arch.add(tg);
      });

      /* ===== a covered walkway (游廊) along the north wall — roofed colonnade ===== */
      {
        const wkZ = CZ - 1.7, wkZw = CZ - 0.25;
        const wkX0 = CX0 + 3, wkX1 = CX1 - 5, wkLen = wkX1 - wkX0, wkMid = (wkX0 + wkX1) / 2;
        const colR = new THREE.MeshStandardMaterial({ color: 0x57180f, roughness: 0.34, metalness: 0.05, envMapIntensity: 0.5 });  // deep lacquered vermilion (matched to the pavilion)
        const wkWood = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.78, envMapIntensity: 0.28 });
        const wkTile = new THREE.MeshStandardMaterial({ color: 0x313f3a, roughness: 0.5, metalness: 0.1, envMapIntensity: 0.5 });
        const nCol = 7, colH = 2.55;
        for (let i = 0; i < nCol; i++) {
          const cx = wkX0 + wkLen * (i / (nCol - 1));
          const base = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.1, 14), courtStone);
          base.position.set(cx, 0.05, wkZ); base.castShadow = true; arch.add(base);   // 柱础 stone base
          const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.1, 12), courtStone);
          plinth.position.set(cx, 0.13, wkZ); plinth.castShadow = true; arch.add(plinth);
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.115, colH, 14), colR);
          col.position.set(cx, 0.18 + colH / 2, wkZ); col.castShadow = true; arch.add(col);
          // 斗拱 bracket at the column top (consistency with the pavilion)
          const colTop = 0.18 + colH;
          const dou = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.24), wkWood);
          dou.position.set(cx, colTop - 0.11, wkZ); dou.castShadow = true; arch.add(dou);
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.1), colR);
          arm.position.set(cx, colTop - 0.04, wkZ); arch.add(arm);
        }
        const beamY = 0.18 + colH;
        const beam = new THREE.Mesh(new THREE.BoxGeometry(wkLen + 0.5, 0.16, 0.12), wkWood);
        beam.position.set(wkMid, beamY - 0.08, wkZ); beam.castShadow = true; arch.add(beam);
        const wallBeam = new THREE.Mesh(new THREE.BoxGeometry(wkLen + 0.5, 0.16, 0.12), wkWood);
        wallBeam.position.set(wkMid, beamY + 0.62, wkZw); arch.add(wallBeam);
        const depth = wkZw - wkZ, rise = 0.62, slope = Math.atan2(rise, depth);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(wkLen + 0.7, 0.1, Math.hypot(depth, rise) + 0.55), wkTile);
        roof.position.set(wkMid, beamY + rise / 2 + 0.05, (wkZ + wkZw) / 2); roof.rotation.x = slope;
        roof.castShadow = true; roof.receiveShadow = true; arch.add(roof);
        const eaveB = new THREE.Mesh(new THREE.BoxGeometry(wkLen + 0.7, 0.1, 0.08), new THREE.MeshStandardMaterial({ color: 0x222b27, roughness: 0.6 }));
        eaveB.position.set(wkMid, beamY + 0.03, wkZ - 0.34); arch.add(eaveB);
        // bench-rail on the court side
        const rail = new THREE.Mesh(new THREE.BoxGeometry(wkLen, 0.06, 0.08), wkWood);
        rail.position.set(wkMid, 0.52, wkZ - 0.06); arch.add(rail);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(wkLen, 0.05, 0.32), wkWood);
        seat.position.set(wkMid, 0.42, wkZ - 0.24); seat.castShadow = true; seat.receiveShadow = true; arch.add(seat);
      }

      /* ===== fullness + colour: flowering trees, scattered plants, rocks, moss ===== */
      const makeBlossom = (bx, bz, seed, sc) => {
        const g = new THREE.Group(); g.position.set(bx, 0, bz); g.scale.setScalar(sc || 1);
        const rnd = mulberry(seed);
        const bark = new THREE.MeshStandardMaterial({ color: 0x47331f, roughness: 0.92, envMapIntensity: 0.18 });
        const petalMat = foliageMaterial("blossom", 21 + (seed % 2));
        const petalMat2 = foliageMaterial("blossomPale", 23);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 2.3, 8), bark);
        trunk.position.y = 1.15; trunk.rotation.z = (rnd() - 0.5) * 0.18; trunk.castShadow = true; g.add(trunk);
        const tips = [];
        // curved, tapering limbs that grow out of the trunk top and arc upward
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + rnd() * 0.6, len = 1.0 + rnd() * 0.7;
          const y0 = 2.0 + (i % 3) * 0.15;
          const end = [Math.cos(a) * (0.5 + len * 0.75), 2.5 + (i % 3) * 0.2 + len * 0.45, Math.sin(a) * (0.5 + len * 0.75)];
          const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, y0, 0),
            new THREE.Vector3(end[0] * 0.45 + (rnd() - 0.5) * 0.2, y0 + (end[1] - y0) * 0.25, end[2] * 0.45 + (rnd() - 0.5) * 0.2),
            new THREE.Vector3(end[0], end[1], end[2]),
          ]);
          const tg = new THREE.TubeGeometry(curve, 12, 0.07, 7, false);
          { const pa = tg.attributes.position, ip = new THREE.Vector3(); for (let q = 0; q < pa.count; q++) {   // taper toward the tip
            const t = Math.floor(q / 8) / 12, c = curve.getPoint(t); ip.fromBufferAttribute(pa, q).sub(c).multiplyScalar(1 - t * 0.6).add(c); pa.setXYZ(q, ip.x, ip.y, ip.z); }
            tg.computeVertexNormals(); }
          const br = new THREE.Mesh(tg, bark); br.castShadow = true; g.add(br);
          tips.push(end);
        }
        [[0, 3.2, 0, 1.3]].concat(tips.map(([tx, ty, tz]) => [tx, ty, tz, 0.85])).forEach(([px, py, pz, r]) => {
          for (let k = 0; k < 8; k++) {                 // PERF: shared geo (bushGeo) + fewer puffs
            const pr = r * (0.34 + rnd() * 0.4);
            const puff = new THREE.Mesh(bushGeo, k % 3 ? petalMat : petalMat2);
            puff.position.set(px + (rnd() - 0.5) * r * 1.3, py + (rnd() - 0.5) * r * 0.8, pz + (rnd() - 0.5) * r * 1.3);
            puff.scale.set(pr * 1.08, pr * 0.76, pr * 1.08); g.add(puff);
          }
        });
        arch.add(g);
      };
      makeBlossom(CX0 + 5, 8.5, 521, 1.0);
      makeBlossom(CX0 + 13, -10, 318, 0.85);
      // drifting blossom petals (动) — soft falling petals near the flowering trees
      if (preset0.courtFx) {
        const [pc, pg] = mkCanvas(32, 32);
        const grd = pg.createRadialGradient(16, 14, 0, 16, 16, 15);
        grd.addColorStop(0, "rgba(250,214,226,0.96)"); grd.addColorStop(1, "rgba(238,190,210,0)");
        pg.fillStyle = grd; pg.beginPath(); pg.ellipse(16, 16, 13, 8, 0.6, 0, Math.PI * 2); pg.fill();
        const petalTex = new THREE.CanvasTexture(pc); petalTex.encoding = THREE.sRGBEncoding;
        const N = 64, pos = new Float32Array(N * 3), vel = [];
        for (let i = 0; i < N; i++) {
          const tc = i % 2 ? [CX0 + 5, 8.5] : [CX0 + 13, -10];
          const bx = tc[0] + (Math.random() - 0.5) * 4.6, bz = tc[1] + (Math.random() - 0.5) * 4.6;
          pos[i * 3] = bx; pos[i * 3 + 1] = 0.3 + Math.random() * 3.2; pos[i * 3 + 2] = bz;
          vel.push({ bx, bz, vy: 0.12 + Math.random() * 0.18, ph: Math.random() * 6.28, amp: 0.3 + Math.random() * 0.5 });
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.22, map: petalTex, transparent: true, opacity: 0.9, depthWrite: false }));
        arch.add(pts); cyPetals.push({ pts, pos, vel });
      }
      // butterflies fluttering over the garden — two flapping wings on a slow drift
      if (preset0.courtFx) {
        const wingCols = [0xf2b8cf, 0xf6e6a8, 0xe8c0e0];
        [[CX0 + 6, 8], [CX0 + 11, -2], [CX0 + 4, 4]].forEach(([bx, bz], i) => {
          const bf = new THREE.Group();
          const wm = new THREE.MeshStandardMaterial({ color: wingCols[i % 3], roughness: 0.7, side: THREE.DoubleSide, emissive: 0x2a1820, emissiveIntensity: 0.06 });
          const wingGeo = new THREE.CircleGeometry(0.09, 5, 0, Math.PI);
          const wL = new THREE.Mesh(wingGeo, wm); wL.position.x = -0.02;
          const wR = new THREE.Mesh(wingGeo, wm); wR.position.x = 0.02; wR.rotation.y = Math.PI;
          bf.add(wL); bf.add(wR);
          bf.position.set(bx, 1.4, bz); bf.scale.setScalar(0.9 + (i % 2) * 0.3);
          arch.add(bf);
          cyButterflies.push({ m: bf, wL, wR, cx: bx, cz: bz, ph: i * 2.1, r: 1.6 + i * 0.5, sp: 0.5 + i * 0.12 });
        });
        // swallows gliding high over the court (dark V-wing silhouettes, wide arcs)
        // a barn swallow (家燕): glossy blue-black back, cream belly, rust throat,
        // swept crescent wings and a long forked tail — body points along +z
        const swBack = new THREE.MeshStandardMaterial({ color: 0x141a26, roughness: 0.55, metalness: 0.0, envMapIntensity: 0.3, side: THREE.DoubleSide });
        const swBelly = new THREE.MeshStandardMaterial({ color: 0xe9e0cf, roughness: 0.8 });
        const swThroat = new THREE.MeshStandardMaterial({ color: 0x8a3a22, roughness: 0.7 });
        const wingShape = new THREE.Shape();   // root at x=0, tip at x=0.16 (span ≈ 2× body), swept back
        wingShape.moveTo(0, 0.03); wingShape.quadraticCurveTo(0.08, 0.05, 0.16, -0.06);
        wingShape.quadraticCurveTo(0.08, -0.015, 0, -0.03); wingShape.lineTo(0, 0.03);
        const wingGeo = new THREE.ShapeGeometry(wingShape, 8); wingGeo.rotateX(-Math.PI / 2);
        { const pa = wingGeo.attributes.position; for (let q = 0; q < pa.count; q++) pa.setY(q, pa.getX(q) ** 2 * 1.4); wingGeo.computeVertexNormals(); }  // gentle dihedral curve
        const tailShape = new THREE.Shape();   // deep fork
        tailShape.moveTo(-0.025, 0); tailShape.lineTo(0.025, 0); tailShape.lineTo(0.05, -0.2); tailShape.lineTo(0.012, -0.07);
        tailShape.lineTo(-0.012, -0.07); tailShape.lineTo(-0.05, -0.2); tailShape.lineTo(-0.025, 0);
        const tailGeo = new THREE.ShapeGeometry(tailShape); tailGeo.rotateX(-Math.PI / 2);
        [[CX0 + 10, 0, 6.8], [CX0 + 6, 4, 7.4], [CX0 + 14, -3, 8.2]].forEach(([sx, sz, sy], i) => {
          const sw = new THREE.Group();
          const body = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), swBack); body.scale.set(0.8, 0.75, 2.0); sw.add(body);
          const belly = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 8), swBelly); belly.scale.set(0.75, 0.6, 1.7); belly.position.set(0, -0.01, -0.005); sw.add(belly);
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), swBack); head.position.set(0, 0.008, 0.085); sw.add(head);
          const throat = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), swThroat); throat.position.set(0, -0.008, 0.095); sw.add(throat);
          const tail = new THREE.Mesh(tailGeo, swBack); tail.position.set(0, 0, -0.07); tail.scale.set(0.9, 1, 0.8); sw.add(tail);
          const wl = new THREE.Group(), wr = new THREE.Group();
          const wlm = new THREE.Mesh(wingGeo, swBack); wlm.scale.x = -1; wl.add(wlm);
          wr.add(new THREE.Mesh(wingGeo, swBack));
          wl.position.set(-0.025, 0.01, 0.02); wr.position.set(0.025, 0.01, 0.02);
          sw.add(wl); sw.add(wr); sw.scale.setScalar(1.6); sw.position.set(sx, sy, sz); arch.add(sw);
          cyButterflies.push({ m: sw, wL: wl, wR: wr, cx: sx, cz: sz, ph: i * 3.0, r: 6 + i, sp: 0.32 + i * 0.05, sy });
        });
      }
      // moss patches — green ground colour between the stones, at feature bases
      const mossMat = new THREE.MeshStandardMaterial({ color: 0x4f5c30, roughness: 1.0, envMapIntensity: 0.1 });
      [[CX0 + 4.6, -4.6, 2.75], [PAVILION.x, PAVILION.z, 2.3], [CX0 + 7.5, 4.4, 2.6], [CX0 + 5, 8.5, 1.4], [CX0 + 13, -10, 1.3]].forEach(([mx, mz, mr]) => {
        const moss = new THREE.Mesh(new THREE.CircleGeometry(mr, 28), mossMat);
        moss.rotation.x = -Math.PI / 2; moss.position.set(mx, 0.03, mz); moss.receiveShadow = true; arch.add(moss);
      });
      // a drift of fallen petals settled on the paving under the blossom trees
      const fallenMat = new THREE.MeshStandardMaterial({ color: 0xe7b4cb, roughness: 0.85, side: THREE.DoubleSide });
      [[CX0 + 5, 8.5], [CX0 + 13, -10]].forEach(([bx, bz], t) => {
        const fr = mulberry(t * 31 + 9);
        for (let p = 0; p < 26; p++) {
          const pl = new THREE.Mesh(new THREE.CircleGeometry(0.045, 5), fallenMat);
          pl.rotation.set(-Math.PI / 2, 0, fr() * 6.28);
          pl.position.set(bx + (fr() - 0.5) * 3.6, 0.034, bz + (fr() - 0.5) * 3.6);
          arch.add(pl);
        }
      });
      // real potted plants flanking the pavilion + scattered along the court
      // potted plants in SYMMETRIC PAIRS flanking the two foci (pavilion + gate entry)
      const courtPlantSpots = [
        [PAVILION.x - 2.4, -1.5, 0.95], [PAVILION.x - 2.4, 1.5, 0.95],   // flank the pavilion
        [CX0 + 2.7, -1.9, 0.9], [CX0 + 2.7, 1.9, 0.9],                   // flank the gate entry
      ];
      // (potted_plant_01 is 176k triangles a pot; these two read as well at a fraction of it)
      const courtPlantModels = [MODEL.calathea, MODEL.plant, MODEL.plant, MODEL.calathea];
      courtPlantSpots.forEach(([x, z, h], i) => {
        placeModel(courtPlantModels[i], { x, z, ry: i % 2 ? 1.7 : -1.7, h, env: 0.5 });
      });
      // botany ground-plants CLUSTERED at the two features (pond edge + boulder base),
      // not dotted across the paving
      [[CX0 + 3.6, 7.6, MODEL.anthurium, 0.5], [CX0 + 8.4, 7.7, MODEL.calathea, 0.55], [CX0 + 9.8, 2.6, MODEL.anthurium, 0.45],
       [CX0 + 6.6, -5.4, MODEL.calathea, 0.5], [CX0 + 3.0, -5.9, MODEL.anthurium, 0.5]]
        .forEach(([x, z, m, h], i) => placeModel(m, { x, z, ry: i * 2.1, h, env: 0.45 }));
      // accent rocks GROUPED with the two stone features (boulder + pond), not dotted
      const rockSpots = [[CX0 + 7.4, -3.4, 0.5], [CX0 + 2.3, -6.0, 0.42], [CX0 + 10.8, 3.9, 0.55], [CX0 + 4.2, 6.7, 0.46]];
      const rockGroups2 = rockSpots.map(([x, z, h], i) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = x; g.add(gardenRock("accent", 400 + i, h)); arch.add(g); return g; });
      loadModel(MODEL.boulder).then((scn) => {
        if (!scn || !mountedRef.current) return;
        void scn;
      });
    }

    /* ============== THE INTERIOR: three storeys — slabs, structure, walls,
       ceilings, staircases, lanterns (see three/interior.js) ============== */
    const interior = buildInterior({ arch, M, stairMat, ARTS, loadArtTexture, specimens: cabinet, preset: preset0, softBeam: softBeamMaterial });
    const { lanterns, sconces, shafts } = interior;
    const shaftMat = shafts.length ? shafts[0].material : { uniforms: { uOpacity: { value: 0 } } };

    /* benches on the carpet */
    [-6.5, 6.5].forEach((x) => {
      const g = new THREE.Group();
      g.position.set(x, 0, 0);
      if (preset0.contactShadows) {
        const cs = makeContactShadow(1.25, 0.42, 0.4);
        g.add(cs);
      }
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.66), M.woodDark);
      seat.position.y = 0.42; seat.castShadow = true; seat.receiveShadow = true;
      g.add(seat);
      const welt = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.03, 0.6), M.brassDark);
      welt.position.y = 0.485;
      g.add(welt);
      const cushion = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.12, 0.56), M.velvet);
      cushion.position.y = 0.55; cushion.castShadow = true;
      g.add(cushion);
      [[-0.95, -0.24], [0.95, -0.24], [-0.95, 0.24], [0.95, 0.24]].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.4, 10), M.woodDark);
        leg.position.set(lx, 0.2, lz); leg.castShadow = true;
        g.add(leg);
      });
      const stretcher = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.05), M.woodDark);
      stretcher.position.y = 0.14;
      g.add(stretcher);
      arch.add(g);
    });

    /* potted plants — REAL CC0 model (Poly Haven), in the hall corners + flanking
       the stair. Replaces the old procedural blob-plants. pinePots/orchidPots are
       kept (colliders + a gentle sway); the model clone is added once it loads. */
    const pinePots = [];
    const orchidPots = [];
    {
      const PLANT_SPOTS = [
        [-HW + 2.1, HD - 2.1, 1.6, pinePots],
        [HW - 2.1, -HD + 2.1, 1.6, pinePots],
        [HW - 2.1, HD - 2.1, 1.2, orchidPots],
        [-HW + 2.1, -HD + 2.1, 1.2, orchidPots],
        [2.5, 1.3, 1.0, orchidPots],
        [-2.5, 1.3, 1.0, orchidPots],
      ];
      const groups = PLANT_SPOTS.map(([x, z, s, arr], i) => {
        const g = new THREE.Group();
        g.position.set(x, 0, z);
        g.rotation.y = i * 1.7;
        if (preset0.contactShadows) g.add(makeContactShadow(0.42 * s, 0.46));
        g.userData.phase = i * 1.6;
        arch.add(g); arr.push(g);
        return g;
      });
      loadModel(MODEL.plant).then((scn) => {
        if (!scn || !mountedRef.current) return;
        groups.forEach((g, i) => {
          const m = prepModel(scn, { envMapIntensity: 0.55, targetHeight: PLANT_SPOTS[i][2] });
          g.add(m);
          g.userData.foliage = m;
          g.userData.blades = m;
        });
      });
    }

    /* ============== PEDESTALS (vitrine plinths) ============== */
    const emptyCardTex = texEmptyCard();
    const coneGeo = new THREE.ConeGeometry(0.95, 2.3, 24, 1, true);
    const bronzeDark = new THREE.MeshStandardMaterial({ color: 0x1c1610, metalness: 0.7, roughness: 0.42, envMapIntensity: 0.7 });
    const lensGlow = new THREE.MeshBasicMaterial({ color: 0xffe2ae });
    const domeGeo = new THREE.SphereGeometry(0.5, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2);
    const slotObjs = [];
    SLOT_POS.forEach((s, i) => {
      const g = new THREE.Group();
      g.position.set(s.x, s.y || 0, s.z);   // floor-relative (lower or mezzanine)
      if (preset0.contactShadows) g.add(makeContactShadow(0.74, 0.5));

      const base = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.12, 1.06), M.marble);
      base.position.y = 0.06; base.castShadow = true; base.receiveShadow = true;
      g.add(base);
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.9), M.woodDark);
      step.position.y = 0.17; step.castShadow = true;
      g.add(step);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.92, 0.66), M.wood);
      shaft.position.y = 0.68; shaft.castShadow = true;
      g.add(shaft);
      // inset panel on the two long faces + brass corner trim
      [1, -1].forEach((f) => {
        const inset = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.66, 0.03), M.woodDark);
        inset.position.set(0, 0.68, f * 0.335);
        g.add(inset);
      });
      [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]].forEach(([cx, cz]) => {
        const trim = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.92, 0.035), M.brassDark);
        trim.position.set(cx, 0.68, cz);
        g.add(trim);
      });
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.09, 0.96), M.marble);
      cap.position.y = 1.185; cap.castShadow = true;
      g.add(cap);
      const capEdge = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.025, 1.0), M.brass);
      capEdge.position.y = 1.145;
      g.add(capEdge);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.045, 24), M.velvet);
      pad.position.y = 1.252;
      g.add(pad);

      /* nameplate */
      const plate = makePlate(" ");
      const plateMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.52, 0.156),
        new THREE.MeshStandardMaterial({ map: plate.tex, roughness: 0.35, metalness: 0.6, envMapIntensity: 0.9 })
      );
      plateMesh.position.set(0, 0.94, s.face * 0.358);
      plateMesh.rotation.x = -0.14 * s.face;
      if (s.face < 0) plateMesh.rotation.y = Math.PI;
      plateMesh.visible = false;
      g.add(plateMesh);

      /* empty-slot easel card */
      const card = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 0.26),
        new THREE.MeshStandardMaterial({ map: emptyCardTex, roughness: 0.9 })
      );
      card.position.set(0, 1.36, s.face * 0.12);
      card.rotation.x = -0.32 * s.face;
      if (s.face < 0) card.rotation.y = Math.PI;
      g.add(card);

      /* glass vitrine dome + finial (hidden until occupied) */
      // real refractive glass on High; lighter faked glass otherwise (cheaper)
      const glassHQ = (QUALITY[qualityRef.current] || QUALITY.medium).bloom && qualityRef.current === "high";
      const dome = new THREE.Mesh(
        domeGeo,
        glassHQ
          ? new THREE.MeshPhysicalMaterial({
              // faint cool tint + slightly less transmission so the vitrine
              // glass actually reads instead of vanishing.
              color: 0xeef4f6, metalness: 0, roughness: 0.06,
              transmission: 0.85, ior: 1.5,
              clearcoat: 0.6, clearcoatRoughness: 0.05,
              envMapIntensity: 0.7, transparent: true, depthWrite: false,
            })
          : new THREE.MeshPhysicalMaterial({
              color: 0xeaf4ff, metalness: 0, roughness: 0.04,
              transparent: true, opacity: 0.08, clearcoat: 0.6, clearcoatRoughness: 0.05,
              reflectivity: 0.5, envMapIntensity: 0.6, depthWrite: false,   // strong reflections veiled the exhibit in white
              side: THREE.DoubleSide,
            })
      );
      dome.scale.set(1, 1.3, 1);
      dome.position.y = 1.23;
      dome.renderOrder = 6;
      dome.visible = false;
      g.add(dome);
      const domeRim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.022, 8, 40), M.brass);
      domeRim.rotation.x = Math.PI / 2;
      domeRim.position.y = 1.235;
      domeRim.visible = false;
      g.add(domeRim);
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), M.brass);
      finial.position.y = 1.23 + 0.5 * 1.3 + 0.03;
      finial.visible = false;
      g.add(finial);

      /* pulse ring for empty slots */
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.2, 0.27, 36),
        new THREE.MeshBasicMaterial({ color: 0xd8b97e, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 1.28;
      g.add(ring);

      /* ceiling spot + volumetric cone — indoor (hall) plinths only; the
         open courtyard has no ceiling to hang a fixture from */
      let cone = null;
      if (!s.court) {
        const stemTop = ceilingAt(s.x, s.z, floorOfY(s.y || 0)) - (s.y || 0) - 0.4;   // underside of the coffer beams
        // a discreet dark-bronze museum spot on a slim stem from a ceiling canopy: it recedes
        // against the painted coffers instead of reading as a gold bell
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, stemTop - 3.9, 6), bronzeDark);
        stem.position.y = 3.9 + (stemTop - 3.9) / 2;
        g.add(stem);
        const canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.03, 16), bronzeDark);
        canopy.position.y = stemTop - 0.015; g.add(canopy);
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.17, 16), bronzeDark);
        can.position.y = 3.84; can.rotation.z = 0.05;
        g.add(can);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), lensGlow);
        lens.rotation.x = Math.PI / 2; lens.position.y = 3.755; g.add(lens);
        cone = new THREE.Mesh(coneGeo, softBeamMaterial(0xffe2ae, 0, { height: 2.3, power: 2.2 }));
        cone.position.y = 2.55;
        g.add(cone);
      }

      // (the focused museum spotlight now comes from the shared pool below)
      const light = null;

      scene.add(g);
      slotObjs.push({
        group: g, ring, cone, light, dome, domeRim, finial, card,
        plateMesh, plateCtx: plate.ctx, plateTex: plate.tex,
        stone: null, stoneMesh: null, tex: null,
        domeLift: 0, finialY: finial.position.y, beam: 0,
      });
    });

    /* vitrine spotlight POOL: a fixed handful of focused spots re-aimed at the
       nearest occupied hall vitrines. One light per plinth (26) made every pixel
       in the hall evaluate ~35 lights and toggling them recompiled shaders; a
       constant pool keeps the light count fixed and the cost bounded. */
    const POOL = qualityRef.current === "low" ? 3 : 5;
    const spotPool = [];
    for (let k = 0; k < POOL; k++) {
      const L = new THREE.SpotLight(0xffe2b4, 0, 8.5, Math.PI / 7.5, 0.6, 1.5);
      const T = new THREE.Object3D(); scene.add(T); L.target = T;
      L.userData.slot = -1; L.position.set(0, -50, 0);
      scene.add(L); spotPool.push(L);
    }
    let poolT = -1;

    /* ============== THE COLLECTOR (stylized, friendly) ==============
       Deliberately stylized — minimal face, smooth silhouettes,
       balanced proportions. No realism, no uncanny valley. */
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xe7c19e, roughness: 0.62, envMapIntensity: 0.2 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x221a14, roughness: 0.5, envMapIntensity: 0.35 });
    // deep indigo-teal silk: the lower roughness + envMap gives a soft satin sheen
    const coatMat = new THREE.MeshStandardMaterial({ color: 0x243640, roughness: 0.56, metalness: 0.0, envMapIntensity: 0.42 });
    const trouserMat = new THREE.MeshStandardMaterial({ color: 0x1d1a16, roughness: 0.85 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x271e16, roughness: 0.5, envMapIntensity: 0.3 });
    // pale jade-cream trim for the collar / cuffs / hem band, and a muted sash
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xcdbb94, roughness: 0.58, envMapIntensity: 0.32 });
    const sashMat = new THREE.MeshStandardMaterial({ color: 0x344049, roughness: 0.66, envMapIntensity: 0.3 });
    const scarfMat = new THREE.MeshStandardMaterial({ color: 0x8c3a26, roughness: 0.76 });
    const leatherMat = new THREE.MeshStandardMaterial({ color: 0x5a3e28, roughness: 0.8 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2b231e, roughness: 0.35 });

    /* smooth limb segment: cylinder capped with hemispheres */
    const capsule = (rTop, rBot, len, mat, radial = 14) => {
      const g = new THREE.Group();
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, radial), mat);
      cyl.castShadow = true; g.add(cyl);
      const a = new THREE.Mesh(new THREE.SphereGeometry(rTop, radial, 10), mat);
      a.position.y = len / 2; a.castShadow = true; g.add(a);
      const b = new THREE.Mesh(new THREE.SphereGeometry(rBot, radial, 10), mat);
      b.position.y = -len / 2; b.castShadow = true; g.add(b);
      return g;
    };

    const avatar = new THREE.Group();
    const body = new THREE.Group();           // bobs / leans while walking
    avatar.add(body);

    const HIP_Y = 0.72;

    /* ---- legs ---- */
    const mkLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.085, HIP_Y, 0);
      const thigh = capsule(0.062, 0.054, 0.3, trouserMat);
      thigh.position.y = -0.17;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.34;
      hip.add(knee);
      const calf = capsule(0.05, 0.042, 0.3, trouserMat);
      calf.position.y = -0.15;
      knee.add(calf);
      const foot = new THREE.Group();
      foot.position.y = -0.345;
      knee.add(foot);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.05, 0.13), shoeMat);
      shoe.position.set(0, 0.012, 0.02); shoe.castShadow = true;
      foot.add(shoe);
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), shoeMat);
      toe.scale.set(0.92, 0.6, 1.1);
      toe.position.set(0, 0.004, 0.085); toe.castShadow = true;
      foot.add(toe);
      const sole = new THREE.Mesh(
        new THREE.BoxGeometry(0.088, 0.016, 0.175),
        new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.9 })
      );
      sole.position.set(0, -0.018, 0.04);
      foot.add(sole);
      body.add(hip);
      return { hip, knee, foot };
    };
    const legL = mkLeg(-1);
    const legR = mkLeg(1);

    /* ---- torso: soft lathe silhouette, closed top and bottom ---- */
    const torso = new THREE.Group();
    torso.position.y = HIP_Y;
    body.add(torso);
    const prof = [
      [0.14, 0.0], [0.152, 0.05], [0.14, 0.11], [0.128, 0.17],
      [0.14, 0.24], [0.158, 0.31], [0.162, 0.36], [0.146, 0.41],
      [0.095, 0.445], [0.012, 0.465],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const torsoMesh = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), coatMat);
    torsoMesh.scale.set(1, 1, 0.8);
    torsoMesh.castShadow = true;
    torso.add(torsoMesh);
    const seat = new THREE.Mesh(new THREE.CircleGeometry(0.141, 22), coatMat);
    seat.rotation.x = Math.PI / 2;
    seat.scale.set(1, 0.8, 1);
    seat.position.y = 0.002;
    torso.add(seat);

    /* coat details: buttons + belt */
    [[0.27, 0.126], [0.19, 0.116]].forEach(([by, bz]) => {
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), M.brass);
      btn.position.set(0, by, bz);
      torso.add(btn);
    });
    /* ---- silk waist sash (wrapped band + a short hanging tie) ---- */
    const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.168, 0.085, 24), sashMat);
    sash.scale.z = 0.82;
    sash.position.y = 0.115;
    sash.castShadow = true;
    torso.add(sash);
    const sashKnot = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), sashMat);
    sashKnot.scale.set(1.4, 0.85, 0.7);
    sashKnot.position.set(0.015, 0.108, 0.142);
    torso.add(sashKnot);
    const sashTie = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.016), sashMat);
    sashTie.position.set(0.025, -0.005, 0.15);
    sashTie.rotation.z = 0.1;
    sashTie.castShadow = true;
    torso.add(sashTie);

    /* ---- full-length literati robe (直裰): a graceful A-line from waist to ankle,
            covering the legs the way a scholar's gown does (shoes just peek out) ---- */
    const robeProf = [
      [0.206, -0.62], [0.200, -0.51], [0.191, -0.39], [0.181, -0.28],
      [0.168, -0.17], [0.158, -0.07], [0.150, -0.01],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const robe = new THREE.Mesh(new THREE.LatheGeometry(robeProf, 36), coatMat);
    robe.scale.set(1, 1, 0.88);            // gentle front-to-back squash
    robe.castShadow = true; robe.receiveShadow = true;
    torso.add(robe);
    // cream hem band at the ankle + a centre placket seam down the robe front
    const hemBand = new THREE.Mesh(new THREE.TorusGeometry(0.201, 0.014, 8, 36), trimMat);
    hemBand.rotation.x = Math.PI / 2;
    hemBand.scale.set(1, 0.88, 1);
    hemBand.position.y = -0.605;
    hemBand.castShadow = true;
    torso.add(hemBand);
    const placket = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.6, 0.012),
      new THREE.MeshStandardMaterial({ color: 0x1c2932, roughness: 0.66 }));
    placket.position.set(0, -0.31, 0.152);
    torso.add(placket);

    /* ---- arms: shoulder is the capsule's own top sphere (no pads) ---- */
    const mkArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.12, 0.4, 0);     // arms closer to the body — no "wings"
      shoulder.rotation.z = side * 0.06;               // hang slightly inward
      torso.add(shoulder);
      const upper = capsule(0.046, 0.04, 0.2, coatMat);
      upper.position.y = -0.105;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.21;
      shoulder.add(elbow);
      const fore = capsule(0.04, 0.034, 0.18, coatMat);
      fore.position.y = -0.09;
      elbow.add(fore);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 10), skinMat);
      hand.scale.set(0.85, 1, 0.7);
      hand.position.y = -0.21; hand.castShadow = true;
      elbow.add(hand);
      // a hanging silk sleeve that DRAPES DOWN the arm (narrow at the shoulder,
      // a soft bell at the wrist) — reads as draped fabric, not a stiff wing
      const sleeve = new THREE.Mesh(new THREE.LatheGeometry([
        [0.05, 0.05], [0.057, -0.1], [0.068, -0.26], [0.078, -0.4],
        [0.078, -0.5], [0.06, -0.55], [0.03, -0.575],
      ].map(([r, y]) => new THREE.Vector2(r, y)), 18), coatMat);
      sleeve.castShadow = true;
      sleeve.scale.z = 0.92;
      shoulder.add(sleeve);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.01, 8, 22), trimMat);
      cuff.rotation.x = Math.PI / 2; cuff.scale.set(1, 0.92, 1);
      cuff.position.y = -0.56;
      shoulder.add(cuff);
      return { shoulder, elbow };
    };
    const armL = mkArm(-1);
    const armR = mkArm(1);

    /* ---- neck + head: minimal, friendly face ---- */
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.046, 0.06, 12), skinMat);
    neck.position.y = 0.49;
    torso.add(neck);

    const head = new THREE.Group();
    head.position.y = 0.515;
    torso.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 26, 20), skinMat);
    skull.scale.set(0.98, 1.06, 0.98);
    skull.position.y = 0.095;
    skull.castShadow = true;
    head.add(skull);
    /* eyes: two soft dark ovals — that's the whole face, plus a hint of nose */
    [-1, 1].forEach((s) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0145, 12, 10), eyeMat);
      eye.scale.set(1, 1.45, 0.55);
      eye.position.set(s * 0.04, 0.092, 0.094);
      head.add(eye);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.008, 0.012), hairMat);
      brow.position.set(s * 0.041, 0.134, 0.09);
      brow.rotation.set(0.15, 0, s * -0.1);
      head.add(brow);
    });
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), skinMat);
    nose.scale.set(0.8, 1.3, 1.2); nose.position.set(0, 0.078, 0.1);
    head.add(nose);
    // a scholar's beard + moustache — gives the face real character (very literati)
    const beardMat = new THREE.MeshStandardMaterial({ color: 0x2a231c, roughness: 0.86, envMapIntensity: 0.18 });
    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.17, 12), beardMat);
    beard.scale.set(1, 1, 0.66); beard.rotation.x = Math.PI; beard.position.set(0, 0.0, 0.064); beard.castShadow = true; head.add(beard);
    const beard2 = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.13, 8), beardMat);
    beard2.scale.set(1, 1, 0.6); beard2.rotation.x = Math.PI; beard2.position.set(0, -0.085, 0.066); head.add(beard2);
    [-1, 1].forEach((s) => {
      const mous = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.013, 0.05, 6), beardMat);
      mous.position.set(s * 0.02, 0.055, 0.091); mous.rotation.z = s * 0.85 + Math.PI / 2; head.add(mous);
      const sideB = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.018, 0.09, 6), beardMat);
      sideB.position.set(s * 0.064, 0.03, 0.055); sideB.rotation.z = s * 0.2; head.add(sideB);  // jaw whiskers
    });
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.005, 0.006), new THREE.MeshStandardMaterial({ color: 0x6e433a, roughness: 0.6 }));
    mouth.position.set(0, 0.064, 0.095); head.add(mouth);
    /* hair: one smooth tilted cap + temple tufts + back volume — no boxes */
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.107, 26, 18, 0, Math.PI * 2, 0, Math.PI * 0.66), hairMat);
    hairCap.scale.set(1.04, 1.0, 1.1);
    hairCap.position.set(0, 0.105, -0.004);
    hairCap.rotation.x = 0.16;
    hairCap.castShadow = true;
    head.add(hairCap);
    [-1, 1].forEach((s) => {
      const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.021, 10, 8), hairMat);
      tuft.scale.set(0.5, 0.95, 0.9);
      tuft.position.set(s * 0.089, 0.058, -0.012);
      head.add(tuft);
    });
    const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), hairMat);
    hairBack.scale.set(0.95, 0.85, 0.8);
    hairBack.position.set(0, 0.07, -0.045);
    head.add(hairBack);
    /* ---- 方巾: a Ming literati square cap, completing the scholar look ---- */
    const capMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.82, envMapIntensity: 0.12 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.088, 4), capMat);
    cap.rotation.y = Math.PI / 4;          // square it
    cap.position.set(0, 0.182, -0.006);
    cap.castShadow = true;
    head.add(cap);
    const capTop = new THREE.Mesh(new THREE.BoxGeometry(0.122, 0.014, 0.122), capMat);
    capTop.position.set(0, 0.226, -0.006);
    capTop.castShadow = true;
    head.add(capTop);

    /* ---- crossed collar (交领右衽): two cream lapels meeting in a V at the chest,
            with a sliver of warm under-robe showing — the scholar's gown front ---- */
    const mkLapel = (side) => {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.30, 0.022), trimMat);
      lapel.position.set(side * 0.052, 0.33, 0.128);
      lapel.rotation.set(0.16, side * -0.2, side * -0.44);
      lapel.castShadow = true;
      torso.add(lapel);
    };
    mkLapel(-1); mkLapel(1);
    const vLining = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.17, 0.016), scarfMat);
    vLining.position.set(0, 0.355, 0.134);
    vLining.rotation.x = 0.16;
    torso.add(vLining);

    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.28, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.012;
    avatar.add(blob);

    avatar.position.set(-HW + 3.2, 0, 0);
    avatar.rotation.y = Math.PI / 2;
    avatar.scale.set(1.0, 1.08, 1.0);
    avatar.visible = false;   // first-person mode — the body is hidden
    scene.add(avatar);
    let avatarFloor = 0; // 0 = lower hall, 1 = mezzanine (hysteresis on the stairs)

    /* first-person view — no hand viewmodel (clean FP per the chosen design) */

    /* ----- dust motes ----- */
    const N = preset0.dust;
    const dustPos = new Float32Array(N * 3);
    const dustVel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      dustPos[i * 3] = -HW + 1 + Math.random() * (HW * 2 - 2);
      dustPos[i * 3 + 1] = 0.6 + Math.random() * 5.8;
      dustPos[i * 3 + 2] = -HD + 1 + Math.random() * (HD * 2 - 2);
      dustVel[i] = 0.05 + Math.random() * 0.12;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        color: 0xffe9c0, size: 0.035, transparent: true, opacity: 0.4,
        depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    scene.add(dust);

    /* ----- colliders (tagged by floor so each storey only blocks its own) ----- */
    const colliders = SLOT_POS.map((s) => ({ x: s.x, z: s.z, r: 0.92, floor: floorOfY(s.y || 0) }));
    colliders.push(...interior.colliders);
    colliders.push({ x: -6.5, z: 0, r: 1.25, floor: 0 }, { x: 6.5, z: 0, r: 1.25, floor: 0 }); // benches
    colliders.push({ x: -HW + 2.1, z: HD - 2.1, r: 0.72, floor: 0 }, { x: HW - 2.1, z: -HD + 2.1, r: 0.72, floor: 0 }); // pines
    orchidPots.forEach((o) => colliders.push({ x: o.position.x, z: o.position.z, r: 0.48, floor: 0 })); // orchids
    colliders.push({ x: 0, z: -7.2, r: 0.6, floor: 1 }, { x: 1.55, z: -7.2, r: 1.0, floor: 1 }); // mezzanine scholar vignette
    cabLayout.forEach((c) => { for (let k = -1.5; k <= 1.5; k += 1) colliders.push({ x: c.x + k * (CAB_W / 4), z: c.z, r: 0.62, floor: floorOfY(c.y) }); });

    /* specimen cabinets: the whole register, along the mezzanine walls */
    let cabMeshes = [];
    let cabGroup = null;
    if (cabinet.length) {
      const cabs = buildCabinets(scene, cabinet, { quality: qualityRef.current, woodMat: M.woodDark, brassMat: M.brass, isAlive: () => mountedRef.current });
      cabGroup = cabs.group;
      cabs.ready.then((m) => { cabMeshes = m; if (typeof window !== "undefined") window.__hallCabinets = m.length; });
    }
    const raycaster = new THREE.Raycaster();
    // courtyard garden props (floor 0) — the doorway itself is left clear
    colliders.push(
      { x: COURT.x0 + 4.6, z: -4.6, r: 3.2, floor: 0 },   // 太湖石 rock + raked-gravel bed (south side)
      { x: COURT.x0 + 6.8, z: 5, r: 3.0, floor: 0 },      // natural pond (north side)
      { x: COURT.x0 + 9, z: -1.5, r: 0.55, floor: 0 },    // stone lantern
      { x: COURT.x1 - 3.4, z: -5.6, r: 0.7, floor: 0 },   // pine
      { x: COURT.x0 + 7.6, z: -1.2, r: 0.95, floor: 0 },  // contemplation bench
      { x: PAVILION.x, z: PAVILION.z, r: 2.05, floor: 0 },// the pavilion (亭)
      { x: COURT.x1 - 1.6, z: 5.4, r: 0.7, floor: 0 },    // bamboo grove
      { x: COURT.x0 + 5, z: 8.5, r: 0.6, floor: 0 },      // blossom tree (NE)
      { x: COURT.x0 + 13, z: -10, r: 0.55, floor: 0 },    // blossom tree (S)
    );
    /* ===== real CC0 furniture & decor — composed SYMMETRICALLY (was scattered);
       potted plants indoors (not pot-less botany), curated to avoid clutter ===== */
    {
      // NORTH wall: a matched console + cabinet pair, each dressed
      placeModel(MODEL.consoleTable, { x: -6, z: -10.3, ry: 0, h: 0.86, env: 0.6, rough: 0.72 });
      placeModel(MODEL.vaseCeramic1, { x: -6.55, y: 0.87, z: -10.3, ry: 0.5, h: 0.3, env: 0.85 });
      placeModel(MODEL.books, { x: -5.35, y: 0.87, z: -10.3, ry: -0.3, h: 0.15, env: 0.5 });
      placeModel(MODEL.cabinet, { x: 6, z: -10.4, ry: 0, h: 1.62, env: 0.55, rough: 0.74 });
      placeModel(MODEL.vaseCeramic3, { x: 6, y: 1.5, z: -10.4, ry: 0.5, h: 0.3, env: 0.85 });
      // SOUTH wall: a composed seating vignette — folding screen backdrop, a tea
      // table + two facing stools in front, flanked by a symmetric potted-plant pair
      placeModel(MODEL.screen, { x: 0, z: 10.4, ry: Math.PI, h: 1.7, env: 0.5, rough: 0.72 });
      placeModel(MODEL.teaTable, { x: 0, z: 9.2, ry: Math.PI / 2, h: 0.42, env: 0.55, rough: 0.7 });
      placeModel(MODEL.stool, { x: -0.95, z: 9.2, ry: Math.PI / 2, h: 0.46, env: 0.55 });
      placeModel(MODEL.stool, { x: 0.95, z: 9.2, ry: -Math.PI / 2, h: 0.46, env: 0.55 });
      placeModel(MODEL.plant, { x: -4.5, z: 10.2, ry: 0.5, h: 0.95, env: 0.5 });
      placeModel(MODEL.plant, { x: 4.5, z: 10.2, ry: 2.6, h: 0.95, env: 0.5 });
      // WEST entrance: a symmetric potted-plant pair
      placeModel(MODEL.calathea, { x: -16.5, z: -3.5, ry: 0.3, h: 1.05, env: 0.5 });
      placeModel(MODEL.calathea, { x: -16.5, z: 3.5, ry: 1.9, h: 1.05, env: 0.5 });
      // MOON GATE — symmetric ceramic vases (hall side) + larger urns (court side)
      // a pair of blue-and-white floor vases on rosewood stands flanking the moon gate
      for (const [z, ry] of [[-3.25, 0.4], [3.25, 2.1]]) { const v = floorVase(0.92, ry); v.position.set(16.75, 0, z); arch.add(v); }
      // and a larger pair on the courtyard side
      for (const [z, ry] of [[-2.4, 1.1], [2.4, 3.3]]) { const v = floorVase(1.08, ry); v.position.set(COURT.x0 + 1.6, 0, z); arch.add(v); }
      // MEZZANINE: scholar vignette props + a symmetric POTTED-plant pair (indoors)
      placeModel(MODEL.stool, { x: 3.0, y: UF_Y, z: -7.2, ry: -0.5, h: 0.46, env: 0.55 });
      placeModel(MODEL.vaseCeramic1, { x: 2.05, y: UF_Y + 0.66, z: -7.35, ry: 0.6, h: 0.2, env: 0.85 });
      placeModel(MODEL.plant, { x: -15, y: UF_Y, z: 8, ry: 0.5, h: 0.95, env: 0.5 });
      placeModel(MODEL.plant, { x: 15, y: UF_Y, z: 8, ry: 2.6, h: 0.95, env: 0.5 });
      colliders.push(
        { x: -6, z: -10.3, r: 0.85, floor: 0 }, { x: 6, z: -10.4, r: 0.72, floor: 0 },
        { x: 0, z: 9.7, r: 1.2, floor: 0 }, { x: -4.5, z: 10.2, r: 0.42, floor: 0 }, { x: 4.5, z: 10.2, r: 0.42, floor: 0 },
        { x: -16.5, z: -3.5, r: 0.45, floor: 0 }, { x: -16.5, z: 3.5, r: 0.45, floor: 0 },
        { x: 16.75, z: -3.25, r: 0.32, floor: 0 }, { x: 16.75, z: 3.25, r: 0.32, floor: 0 },
        { x: COURT.x0 + 1.6, z: -2.4, r: 0.4, floor: 0 }, { x: COURT.x0 + 1.6, z: 2.4, r: 0.4, floor: 0 },
        { x: 3.0, z: -7.2, r: 0.4, floor: 1 },
        { x: -15, z: 8, r: 0.45, floor: 1 }, { x: 15, z: 8, r: 0.45, floor: 1 },
      );
    }

    // covered-walkway (游廊) columns along the north wall
    for (let i = 0; i < 7; i++) {
      colliders.push({ x: COURT.x0 + 3 + (COURT.x1 - 5 - (COURT.x0 + 3)) * (i / 6), z: COURT.z - 1.7, r: 0.32, floor: 0 });
    }

    /* ----- scene API for React handlers ----- */
    sceneApiRef.current = {
      addStone: (st) =>
        new Promise((resolve) => {
          // stand + vitrine mounting shared by photo stones and catalog specimens
          const mount = (mesh, seed, tex) => {
          const grp = new THREE.Group();
          // carved hardwood 供石 stand (底座): a waisted rosewood base the stone
          // nestles into — the way a real scholar's rock is always presented
          const standMat = new THREE.MeshStandardMaterial({ color: 0x0d0603, roughness: 0.42, metalness: 0.06, envMapIntensity: 0.6 });   // dark rosewood (linear hex)
          const stand = new THREE.Mesh(new THREE.LatheGeometry([
            [0.085, -0.235], [0.205, -0.23], [0.232, -0.205], [0.188, -0.165],
            [0.16, -0.13], [0.205, -0.1], [0.233, -0.082], [0.223, -0.058], [0.12, -0.046],
          ].map(([r, y]) => new THREE.Vector2(r, y)), 30), standMat);
          stand.castShadow = true; stand.receiveShadow = true;
          grp.add(stand);
          const standBead = new THREE.Mesh(new THREE.TorusGeometry(0.231, 0.008, 8, 34), M.brass);
          standBead.rotation.x = Math.PI / 2; standBead.position.y = -0.07;
          grp.add(standBead);
          for (let f = 0; f < 5; f++) {                 // small ruyi feet
            const a = (f / 5) * Math.PI * 2 + 0.4;
            const foot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), standMat);
            foot.scale.set(0.85, 0.55, 1.25);
            foot.position.set(Math.cos(a) * 0.188, -0.242, Math.sin(a) * 0.188);
            foot.castShadow = true;
            grp.add(foot);
          }
          grp.add(mesh);
          grp.userData.seed = seed;
          const sp = SLOT_POS[st.slot];
          grp.position.set(sp.x, (sp.y || 0) + 1.39, sp.z);
          grp.rotation.y = (seed % 628) / 100;
          scene.add(grp);
          const o = slotObjs[st.slot];
          if (o.stone) {
            scene.remove(o.stone);
            o.stone.traverse((q) => { if (q.isMesh && q !== mesh) { q.geometry.dispose(); if (q.material.map) q.material.map.dispose(); } });
          }
          o.stone = grp; o.stoneMesh = mesh; o.tex = tex;
          o.ring.visible = false;
          o.card.visible = false;
          o.dome.visible = true;
          o.domeRim.visible = true;
          o.finial.visible = true;
          sceneApiRef.current.setPlate(st.slot, st.name);
          o.plateMesh.visible = true;
            resolve();
          };
          if (st.catalog) {
            // a catalog specimen: procedural geometry + object-space stone shader
            const spec = st.spec;
            const q = qualityRef.current;
            const lvl = q === "high" ? 5 : q === "low" ? 3 : 4;
            const geo = buildStoneGeometry(spec.shape, { level: lvl });
            const mat = createStoneMaterial(spec.look, { quality: q === "low" ? "lq" : "hq" });
            mat.envMapIntensity = 0.55;
            const mesh = new THREE.Mesh(geo, mat);
            mesh.castShadow = true;
            // fit inside the dome (r 0.5, ~0.5 m clear above the stand)
            const bb = geo.boundingBox;
            const ex = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z), ey = bb.max.y - bb.min.y;
            const k = Math.min(0.62 / ex, 0.46 / ey);
            mesh.scale.setScalar(k);
            mesh.position.y = -0.046 - bb.min.y * k;
            mesh.userData.catalog = true;
            mount(mesh, spec.look.seed, null);
            return;
          }
          const img = new Image();
          img.onload = () => {
            if (!mountedRef.current) { resolve(); return; }
            const maxAniso = renderer.capabilities.getMaxAnisotropy
              ? renderer.capabilities.getMaxAnisotropy() : 4;
            const aniso = Math.min(preset0.anisotropy, maxAniso);
            const tex = new THREE.Texture(img);
            tex.needsUpdate = true;
            tex.encoding = THREE.sRGBEncoding;
            tex.anisotropy = aniso;
            const seed = hashStr(st.id);
            const shape = st.observation && st.observation.shape ? st.observation.shape : null;
            const rd = shapeNum(shape && shape.roundness, 0.7);
            // derive real surface relief + roughness from the photo so the
            // stone reads as a wet, pitted river stone under PBR lighting.
            // angular stones (low roundness) get stronger relief + more matte.
            const maps = deriveSurfaceMaps(img, {
              size: 512,
              normalStrength: 1.6 + (1 - rd) * 1.6,
              baseRoughness: 0.42 - rd * 0.12,
              roughVariation: 0.3 + (1 - rd) * 0.15,
            });
            maps.normalMap.anisotropy = aniso;
            maps.roughnessMap.anisotropy = aniso;
            // subtle per-stone surface character (deterministic from the seed) so a
            // collection feels individually real — varies the wet sheen + relief,
            // NOT the colour (the photo's true colour is preserved).
            const wet = ((seed >> 7) % 1000) / 1000;
            const ns = 0.72 + wet * 0.3;
            const mesh = new THREE.Mesh(
              makeStoneGeometry(seed, shape, preset0.stoneDetail),
              new THREE.MeshPhysicalMaterial({
                map: tex,
                normalMap: maps.normalMap,
                normalScale: new THREE.Vector2(ns, ns),
                roughnessMap: maps.roughnessMap,
                roughness: 1.0, metalness: 0.0,
                // a wet/varnished clearcoat is what reads as a river stone —
                // rounder, water-worn stones are glossier with a tighter coat.
                clearcoat: (0.45 + rd * 0.5) * (0.85 + wet * 0.3),
                clearcoatRoughness: 0.3 - rd * 0.16,
                ior: 1.5, reflectivity: 0.5,
                envMapIntensity: 1.0 + wet * 0.4,
              })
            );
            mesh.userData.maps = maps;
            mesh.castShadow = true;
            mesh.scale.set(0.85, 0.8, 0.9);
            mount(mesh, seed, tex);
          };
          img.onerror = () => resolve();
          img.src = st.image;
        }),
      removeStone: (slot) => {
        const o = slotObjs[slot];
        if (!o || !o.stone) return;
        scene.remove(o.stone);
        if (o.stoneMesh) {
          o.stoneMesh.geometry.dispose();
          const m = o.stoneMesh.material;
          if (m.map) m.map.dispose();
          if (m.normalMap) m.normalMap.dispose();
          if (m.roughnessMap) m.roughnessMap.dispose();
          m.dispose();
        }
        o.stone = null; o.stoneMesh = null; o.tex = null;
        o.ring.visible = true;
        o.card.visible = true;
        o.dome.visible = false;
        o.domeRim.visible = false;
        o.finial.visible = false;
        o.plateMesh.visible = false;
      },
      setPlate: (slot, name) => {
        const o = slotObjs[slot];
        if (!o) return;
        drawPlate(o.plateCtx, name);
        o.plateTex.needsUpdate = true;
      },
      reshapeStone: (slot, shape) => {
        const o = slotObjs[slot];
        if (!o || !o.stoneMesh || !o.stone) return;
        const old = o.stoneMesh.geometry;
        o.stoneMesh.geometry = makeStoneGeometry(o.stone.userData.seed || 1, shape, preset0.stoneDetail);
        old.dispose();
        const rd = shapeNum(shape && shape.roundness, 0.7);
        // roughness is driven by the derived map (material.roughness stays 1.0);
        // shape only re-tunes the wet clearcoat (preserving per-stone wetness).
        const wet = (((o.stone.userData.seed || 1) >> 7) % 1000) / 1000;
        o.stoneMesh.material.clearcoat = (0.45 + rd * 0.5) * (0.85 + wet * 0.3);
        o.stoneMesh.material.clearcoatRoughness = 0.3 - rd * 0.16;
      },
    };

    /* ----- input: keyboard ----- */
    const KM = {
      KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d",
      ArrowUp: "w", ArrowDown: "s", ArrowLeft: "a", ArrowRight: "d",
      ShiftLeft: "shift", ShiftRight: "shift",
    };
    // keys that are held (walking, turning the stone, the lens's power): auto-repeat feeds them;
    // every other key is a one-shot action and fires once per press
    const HELD_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "ShiftLeft", "ShiftRight", "Space", "KeyC", "Equal", "Minus", "NumpadAdd", "NumpadSubtract"]);
    const onKeyDown = (e) => {
      const tgt = e.target && e.target.closest ? e.target : null;
      // typing into a field never steers the hall (Esc still closes what is open)
      if (tgt && tgt.closest("input, textarea, select, [contenteditable]")) {
        if (e.code === "Escape" && !e.repeat && escRef.current) escRef.current();
        return;
      }
      // Enter / Space on a focused control activate that control, and nothing else
      if ((e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space") && tgt && tgt.closest("button, a[href], [role=button], [role=radio], summary")) return;
      // browser and system shortcuts (Cmd/Ctrl/Alt + key) are never taken over
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.repeat && !HELD_KEYS.has(e.code)) { if (study.active) e.preventDefault(); return; }
      if (e.code === "Escape") { if (escRef.current) escRef.current(); return; }
      if (uiOpenRef.current) return;
      if (study.active) {
        // the stone is in hand: study keys first; nothing here leaves the hall
        if (e.key === "?" || e.code === "Slash") { if (studyHintRef.current) studyHintRef.current(); e.preventDefault(); return; }
        if (study.key(e.code, e)) { e.preventDefault(); if (studyUseRef.current) studyUseRef.current(); return; }
        if (e.code === "KeyR") { if (inspectToggleRef.current) inspectToggleRef.current(); e.preventDefault(); return; }
        if (e.code === "KeyE" || e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space" || e.code === "KeyP") { e.preventDefault(); return; }
        const k = KM[e.code];   // a walk key held through the put-back walks on afterwards
        if (k) { keysRef.current[k] = true; e.preventDefault(); }
        return;
      }
      if (e.key === "?") { setShowHelp(true); return; }
      if (e.code === "KeyE" || e.code === "Enter" || e.code === "NumpadEnter") {
        if (!photoRef.current && interactRef.current) interactRef.current();
        return;
      }
      if (e.code === "KeyR") {
        if (inspectToggleRef.current) inspectToggleRef.current();
        return;
      }
      if (e.code === "KeyP") {
        if (photoToggleRef.current) photoToggleRef.current();
        return;
      }
      if (e.code === "Space") { if (photoRef.current) keysRef.current.up = true; e.preventDefault(); return; }
      if (e.code === "KeyC") { keysRef.current.dn = true; return; }
      const k = KM[e.code];
      if (k) { keysRef.current[k] = true; e.preventDefault(); }
    };
    const onKeyUp = (e) => {
      if (e.code === "Space") keysRef.current.up = false;
      if (e.code === "KeyC") keysRef.current.dn = false;
      const k = KM[e.code];
      if (k) keysRef.current[k] = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    /* ----- input: pointer (mouse look + touch joystick) ----- */
    const pointers = {};
    const el = renderer.domElement;
    const hideJoy = () => {
      if (joyBaseRef.current) joyBaseRef.current.style.display = "none";
      if (joyNubRef.current) joyNubRef.current.style.display = "none";
    };
    const studyRect = () => container.getBoundingClientRect();
    // pointers handed to the study: every one of them is released, whatever mode the hall
    // is in by then (pointerup / pointercancel / lostpointercapture / blur / tab hidden)
    const studyPtrs = new Set();
    const releaseStudyPointers = () => {
      if (study.cancelPointers) study.cancelPointers();
      else for (const id of studyPtrs) study.pointerUp({ pointerId: id, type: "pointercancel", pointerType: "mouse", clientX: 0, clientY: 0, buttons: 0 });
      studyPtrs.clear();
    };
    // walk-mode pointers (mouse look, touch joystick): forgotten when a study begins
    const releaseWalkPointers = () => {
      for (const id in pointers) delete pointers[id];
      joyRef.current = { active: false, f: 0, r: 0 };
      hideJoy();
    };
    const setCursor = (c) => { if (el.style.cursor !== c) el.style.cursor = c; };
    const onPointerDown = (e) => {
      if (uiOpenRef.current) return;
      if (study.active) {                       // the stone is in hand: every gesture handles it
        study.pointerDown(e, studyRect());
        studyPtrs.add(e.pointerId);
        try { el.setPointerCapture(e.pointerId); } catch {}
        e.preventDefault();
        if (study.holding && studyUseRef.current) studyUseRef.current();
        return;
      }
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      let mode = "cam";
      if (e.pointerType === "touch" && x < rect.width * 0.45 && y > rect.height * 0.3 && !joyRef.current.active) {
        mode = "joy";
      }
      pointers[e.pointerId] = { mode, lx: e.clientX, ly: e.clientY, ox: x, oy: y, sx: e.clientX, sy: e.clientY, t0: performance.now() };
      if (mode === "joy") {
        joyRef.current = { active: true, id: e.pointerId, f: 0, r: 0 };
        if (joyBaseRef.current) {
          joyBaseRef.current.style.display = "block";
          joyBaseRef.current.style.left = x - 52 + "px";
          joyBaseRef.current.style.top = y - 52 + "px";
        }
        if (joyNubRef.current) {
          joyNubRef.current.style.display = "block";
          joyNubRef.current.style.left = x - 22 + "px";
          joyNubRef.current.style.top = y - 22 + "px";
        }
      }
      try { el.setPointerCapture(e.pointerId); } catch {}
    };
    const onPointerMove = (e) => {
      // a mouse whose button came up outside the window (no pointerup): it is released now
      const lostUp = e.pointerType === "mouse" && e.buttons === 0;
      if (study.active) {
        if (lostUp && studyPtrs.has(e.pointerId)) { studyPtrs.delete(e.pointerId); study.pointerUp(e); }
        study.pointerMove(e, studyRect());
        return;
      }
      const p = pointers[e.pointerId];
      if (!p) return;
      if (lostUp) { delete pointers[e.pointerId]; return; }
      if (p.mode === "cam") {
        const dx = e.clientX - p.lx, dy = e.clientY - p.ly;
        p.lx = e.clientX; p.ly = e.clientY;
        if (photoRef.current) {
          const c = photoCamRef.current;
          c.yaw -= dx * 0.0038;
          c.pitch = THREE.MathUtils.clamp(c.pitch + dy * 0.0038, -1.2, 1.2);
        } else {
          const c = camRef.current;
          c.yaw -= dx * 0.0045;
          c.pitch = THREE.MathUtils.clamp(c.pitch + dy * 0.0045, -1.05, 1.1);  // first-person: look up & down
        }
      } else {
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        let dx = x - p.ox, dy = y - p.oy;
        const m = Math.hypot(dx, dy), R = 46;
        if (m > R) { dx *= R / m; dy *= R / m; }
        joyRef.current.r = dx / R;
        joyRef.current.f = -dy / R;
        if (joyNubRef.current) {
          joyNubRef.current.style.left = p.ox + dx - 22 + "px";
          joyNubRef.current.style.top = p.oy + dy - 22 + "px";
        }
      }
    };
    // pointerup, pointercancel and lostpointercapture all end here
    const onPointerUp = (e) => {
      // the study always hears the release (harmless when idle), so it never keeps a dead finger
      studyPtrs.delete(e.pointerId);
      study.pointerUp(e);
      const p = pointers[e.pointerId];
      if (!p) return;
      if (p.mode === "joy") { joyRef.current = { active: false, f: 0, r: 0 }; hideJoy(); }
      delete pointers[e.pointerId];
      if (e.type !== "pointerup" || study.active) return;
      // a click (not a drag) on a stone selects it
      if (p.mode === "cam" && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 6 && performance.now() - p.t0 < 450 && !uiOpenRef.current && !photoRef.current) {
        const rect = container.getBoundingClientRect();
        const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const targets = cabMeshes.slice();
        slotObjs.forEach((o, i) => { if (o.stoneMesh && stonesRef.current[i] && stonesRef.current[i].catalog) { o.stoneMesh.userData.specId = stonesRef.current[i].specId; o.stoneMesh.userData.slot = i; targets.push(o.stoneMesh); } });
        const hit = raycaster.intersectObjects(targets, false)[0];
        const ok = hit && hit.distance < 9;
        if (pickRef.current) pickRef.current(ok ? hit.object.userData.specId : null, ok && hit.object.userData.slot != null ? hit.object.userData.slot : -1);
      }
    };
    // the window lost focus / the tab was hidden: nothing stays pressed
    const releaseAll = () => {
      releaseWalkPointers();
      releaseStudyPointers();
      keysRef.current = {};
    };
    const onBlur = () => releaseAll();
    const onVisibility = () => {
      if (!document.hidden) return;
      releaseAll();
      const a = audioRef.current; if (a && a.rub) a.rub(0);
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    const onWheel = (e) => {
      e.preventDefault();
      if (study.active) {
        study.wheel(e);
        if (study.holding && studyUseRef.current) studyUseRef.current();
      } else if (photoRef.current) {
        const c = photoCamRef.current;
        const amt = -e.deltaY * 0.01;
        const cph = Math.cos(c.pitch);
        c.x += -Math.sin(c.yaw) * cph * amt;
        c.y += -Math.sin(c.pitch) * amt;
        c.z += -Math.cos(c.yaw) * cph * amt;
        c.x = THREE.MathUtils.clamp(c.x, -HW + 0.4, HW - 0.4);
        c.y = THREE.MathUtils.clamp(c.y, 0.3, HH - 0.3);
        c.z = THREE.MathUtils.clamp(c.z, -HD + 0.4, HD - 0.4);
      } else {
        const c = camRef.current;
        c.dist = THREE.MathUtils.clamp(c.dist + e.deltaY * 0.004, 2.8, 9);
      }
    };
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("lostpointercapture", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    const onCtx = (e) => e.preventDefault();
    el.addEventListener("contextmenu", onCtx);

    /* ----- resize ----- */
    const ro = new ResizeObserver(() => {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (composerRef.current) composerRef.current.setSize(w, h);
      if (ecRef.current) ecRef.current.setSize(w, h);
    });
    ro.observe(container);

    /* ----- fill the vitrines ----- */
    (async () => {
      const map = {};
      if (!storage) setShowHelp(true);
      else {
        try { await storage.get("gallery:helpseen"); }
        catch { if (mountedRef.current) setShowHelp(true); }
      }
      // catalog showpieces fill every vitrine: hall, mezzanine and courtyard
      let fi = 0;
      for (let slot = 0; slot < SLOT_POS.length && fi < featured.length; slot++) map[slot] = catalogStone(featured[fi++], slot);
      if (!mountedRef.current) return;
      stonesRef.current = map;
      setStones(map);
      for (const k of Object.keys(map)) await sceneApiRef.current.addStone(map[k]);
      if (mountedRef.current) setHallReady(true);
      // capture the reflection probe once the HDRI-lit hall and its stones exist
      await hdrReady;
      setTimeout(captureProbe, 400);
    })();

    /* ----- static batching of the architecture (draw calls ÷ ~10) ----- */
    const merged = mergeStatic(arch, [
      ...lanterns, ...pinePots, ...orchidPots, ...shafts,
      ...cyBambooCanes.map((c) => c.m), ...cyKoi.map((k) => k.m), ...cyButterflies.map((b) => b.m),
    ]);
    renderer.shadowMap.needsUpdate = true;

    /* ----- diagnostics hook for the e2e/perf harness ----- */
    if (typeof window !== "undefined") {
      const lc = { spot: 0, point: 0, directional: 0, hemisphere: 0, shadowCasting: 0 };
      scene.traverse((o) => { if (o.isLight) { if (o.isSpotLight) lc.spot++; else if (o.isPointLight) lc.point++; else if (o.isDirectionalLight) lc.directional++; else if (o.isHemisphereLight) lc.hemisphere++; if (o.castShadow) lc.shadowCasting++; } });
      window.__hallLights = lc;
      window.__hallMerged = merged;
      window.__hallScene = scene;
      // debug: what surface is under a screen point (perf/visual harness)
      window.__hallPick = (sx, sy) => {
        const rc = new THREE.Raycaster(); const rect = renderer.domElement.getBoundingClientRect();
        rc.setFromCamera(new THREE.Vector2((sx / rect.width) * 2 - 1, -(sy / rect.height) * 2 + 1), camera);
        return rc.intersectObjects(scene.children, true).slice(0, 4).map((h) => ({ name: h.object.name, type: h.object.material && h.object.material.type, color: h.object.material && h.object.material.color && h.object.material.color.getHexString(), env: h.object.material && h.object.material.envMapIntensity, map: !!(h.object.material && h.object.material.map), transparent: h.object.material && h.object.material.transparent, blending: h.object.material && h.object.material.blending, d: +h.distance.toFixed(2), p: h.point.toArray().map((v) => +v.toFixed(1)) }));
      };
      window.__hallPost = () => ecRef.current;  // perf harness: toggle passes
      // verification hook: place the visitor (ground floor) for screenshot harnesses
      window.__hallTeleport = (x, z, yaw, pitch = 0.04, floor = 0) => { avatar.position.set(x, FLOOR_Y[floor], z); avatarFloor = floor; camRef.current.yaw = yaw; camRef.current.pitch = pitch; };
      // whole-frame totals of the last completed frame (all passes, shadow maps included)
      window.__hallInfo = () => ({
        calls: frameInfo.calls, triangles: frameInfo.triangles, points: frameInfo.points, lines: frameInfo.lines,
        shadowCalls: frameInfo.shadowCalls, shadowTriangles: frameInfo.shadowTriangles, frame: frameInfo.frame,
        programs: renderer.info.programs ? renderer.info.programs.length : null,
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
        pixelRatio: renderer.getPixelRatio(), quality: qualityRef.current,
        studyLampMap: studyLamp.shadow.mapSize.x, studyLampRT: studyLamp.shadow.map ? studyLamp.shadow.map.width : null,
        loupeTarget: loupeRef.current && loupeRef.current._debug && loupeRef.current._debug.rt ? loupeRef.current._debug.rt.width : null,
      });
    }

    /* ----- main loop ----- */
    const clock = new THREE.Clock();
    let walkPhase = 0;
    let swingAmp = 0;
    let lastStepUp = true;
    let photoWasOn = false;
    const camTarget = new THREE.Vector3();
    let raf;
    let frameNo = 0;
    let studySlot = null;   // the slot whose stone is in the visitor's hands (incl. while it returns)
    let lastWant = null;    // the slot asked for last frame (a fresh ask during the return resumes it)
    let chromeBusy = false; // the study chrome is dimmed while a drag is in progress
    const uiRoot = container.parentElement;
    let roomDim = 0;
    const fogIn = new THREE.Color(0x14110e), fogOut = new THREE.Color(0xaebbc6);
    const adaptive = { on: !hasSavedQuality(), frames: 0, time: 0, last: 0, checks: 0 };
    const _hv = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const f0 = performance.now();
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;

      /* movement */
      let moveLen = 0, sp = 0;
      if (!uiOpenRef.current && inspectRef.current == null && studySlot == null && !photoRef.current) {
        const k = keysRef.current, j = joyRef.current;
        let f = (k.w ? 1 : 0) - (k.s ? 1 : 0) + j.f;
        let r = (k.d ? 1 : 0) - (k.a ? 1 : 0) + j.r;
        const len = Math.hypot(f, r);
        if (len > 1) { f /= len; r /= len; }
        moveLen = Math.min(1, len);
        if (len > 0.02) {
          const yaw = camRef.current.yaw;
          const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
          const rx = Math.cos(yaw), rz = -Math.sin(yaw);
          const dx = fx * f + rx * r, dz = fz * f + rz * r;
          sp = 4.2 * (k.shift ? 1.75 : 1);
          const prevX = avatar.position.x, prevZ = avatar.position.z;
          avatar.position.x += dx * sp * dt;
          avatar.position.z += dz * sp * dt;
          // stay within walkable regions (hall ∪ moon-gate doorway ∪ courtyard)
          if (!isWalkable(avatar.position.x, avatar.position.z, avatarFloor)) {
            avatar.position.x = prevX; avatar.position.z = prevZ;
          }
          for (const c of colliders) {
            if (c.floor != null && c.floor !== avatarFloor) continue; // only this storey
            const ddx = avatar.position.x - c.x, ddz = avatar.position.z - c.z;
            const d = Math.hypot(ddx, ddz);
            if (d < c.r && d > 0.0001) {
              const push = c.r - d;
              avatar.position.x += (ddx / d) * push;
              avatar.position.z += (ddz / d) * push;
            }
          }
          // never step into a void, and only mount/leave a flight at its ends
          if (!canStep(prevX, prevZ, avatar.position.x, avatar.position.z, avatarFloor)) {
            avatar.position.x = prevX; avatar.position.z = prevZ;
          }
          avatar.rotation.y = lerpAngle(avatar.rotation.y, Math.atan2(dx, dz), 10 * dt);
        }
      }

      /* vertical traversal — settle onto the lower floor / staircase ramp /
         mezzanine every frame (even when idle) so the floor flag stays current */
      {
        const g = sampleGround(avatar.position.x, avatar.position.z, avatarFloor);
        avatarFloor = g.floor;
        avatar.position.y += (g.y - avatar.position.y) * Math.min(1, 12 * dt);
      }

      /* walk cycle / idle (jointed gait: hips, knees, elbows, lean) */
      const sprinting = sp > 5;
      const targetAmp = moveLen > 0.02 ? (0.5 + (sprinting ? 0.16 : 0)) * moveLen : 0;
      swingAmp += (targetAmp - swingAmp) * Math.min(1, 12 * dt);
      if (moveLen > 0.02) walkPhase += dt * (sp > 0 ? sp : 4.2) * 1.85;  // calmer museum gait
      const swing = Math.sin(walkPhase) * swingAmp;
      const lift = (ph) => Math.max(0, Math.sin(ph));
      legL.hip.rotation.x = swing;
      legR.hip.rotation.x = -swing;
      legL.knee.rotation.x = lift(walkPhase + 2.1) * 1.05 * swingAmp + 0.06;
      legR.knee.rotation.x = lift(walkPhase + 2.1 + Math.PI) * 1.05 * swingAmp + 0.06;
      legL.foot.rotation.x = -swing * 0.4 - legL.knee.rotation.x * 0.45;
      legR.foot.rotation.x = swing * 0.4 - legR.knee.rotation.x * 0.45;
      armL.shoulder.rotation.x = -swing * 0.78;
      armR.shoulder.rotation.x = swing * 0.78;
      armL.shoulder.rotation.z = 0.08;
      armR.shoulder.rotation.z = -0.08;
      armL.elbow.rotation.x = -0.13 - lift(-walkPhase) * 0.4 * swingAmp;
      armR.elbow.rotation.x = -0.13 - lift(walkPhase) * 0.4 * swingAmp;
      body.position.y = Math.abs(Math.sin(walkPhase)) * 0.04 * swingAmp;
      body.rotation.x = -0.05 * swingAmp - (sprinting ? 0.07 : 0) * swingAmp;
      torso.rotation.y = Math.sin(walkPhase) * 0.07 * swingAmp;
      torso.rotation.z = Math.cos(walkPhase) * 0.03 * swingAmp;
      const breathe = 1 + Math.sin(t * 1.6) * 0.012 * (1 - swingAmp);
      torsoMesh.scale.set(1, breathe, 0.8);
      head.rotation.x = Math.sin(walkPhase * 2) * 0.02 * swingAmp + Math.sin(t * 0.8) * 0.015 * (1 - swingAmp);
      head.rotation.z = Math.sin(t * 0.5) * 0.012 * (1 - swingAmp);

      /* footsteps */
      if (audioRef.current && audioRef.current.on) {
        const stepUp = Math.sin(walkPhase) >= 0;
        if (stepUp !== lastStepUp && swingAmp > 0.25) {
          audioRef.current.step(Math.min(1, sp / 7));
        }
        lastStepUp = stepUp;
      }

      if (typeof window !== "undefined") window.__av = { x: avatar.position.x, y: avatar.position.y, z: avatar.position.z, f: avatar.rotation.y, yaw: camRef.current.yaw };  // verify/debug hook (nav harnesses)

      /* hand study: begin when a stone is chosen for inspection, return it when released */
      {
        const want = inspectRef.current;
        const beginStudy = (slot) => {
          const o = slotObjs[slot], st = stonesRef.current[slot];
          studySlot = slot;
          study.begin(st.catalog ? { spec: st.spec, mesh: o.stoneMesh } : { mesh: o.stoneMesh }, o.stone, {
            camYaw: camRef.current.yaw,
            onChange: (u) => mountedRef.current && setStudyUI(u.phase === "idle" ? null : u),
            onDone: () => { studySlot = null; },
          });
          // the showpiece stays on its stand: the hands hold a hand-sized piece of it
        };
        if (want != null && studySlot == null && stonesRef.current[want] && slotObjs[want].stoneMesh) {
          // the hands take over: nothing from the walk (a held joystick, a look drag) carries on
          releaseWalkPointers();
          beginStudy(want);
        } else if (want != null && want === studySlot && want !== lastWant && study.state().phase === "return") {
          // changed your mind while it flies back: the same stone comes back to the hand
          // (study.begin reverses the return; an older study ignores it and re-reaches after)
          beginStudy(want);
        } else if (want == null && studySlot != null && study.active && study.state().phase !== "return") {
          study.end();
        }
        lastWant = want;
        study.update(dt, t);
        if (typeof window !== "undefined") window.__study = study;
        // the cursor says what a drag does; while the hands are busy the chrome steps back
        setCursor(!study.active || photoRef.current ? "" : study.holding ? (studyPtrs.size ? "grabbing" : "grab") : "");
        const busy = study.holding && studyPtrs.size > 0;
        if (busy !== chromeBusy) { chromeBusy = busy; if (uiRoot) uiRoot.classList.toggle("st-busy", busy); }
      }

      /* camera — photo free-fly / hand study / follow */
      const inspSlot = studySlot;
      if (photoRef.current) {
        const pc = photoCamRef.current;
        if (!photoWasOn) {
          pc.x = camera.position.x; pc.y = camera.position.y; pc.z = camera.position.z;
          pc.yaw = camRef.current.yaw; pc.pitch = 0.12;
        }
        const k = keysRef.current, j = joyRef.current;
        let f = (k.w ? 1 : 0) - (k.s ? 1 : 0) + j.f;
        let r2 = (k.d ? 1 : 0) - (k.a ? 1 : 0) + j.r;
        const u = (k.up ? 1 : 0) - (k.dn ? 1 : 0);
        const spd = 3.2 * (k.shift ? 2.2 : 1);
        const cph = Math.cos(pc.pitch);
        const Lx = -Math.sin(pc.yaw) * cph, Ly = -Math.sin(pc.pitch), Lz = -Math.cos(pc.yaw) * cph;
        const Rx = Math.cos(pc.yaw), Rz = -Math.sin(pc.yaw);
        pc.x += (Lx * f + Rx * r2) * spd * dt;
        pc.y += (Ly * f + u) * spd * dt;
        pc.z += (Lz * f + Rz * r2) * spd * dt;
        pc.x = THREE.MathUtils.clamp(pc.x, -HW + 0.4, HW - 0.4);
        pc.y = THREE.MathUtils.clamp(pc.y, 0.3, HH - 0.3);
        pc.z = THREE.MathUtils.clamp(pc.z, -HD + 0.4, HD - 0.4);
        camTarget.set(pc.x, pc.y, pc.z);
        camera.position.lerp(camTarget, Math.min(1, 14 * dt));
        camera.lookAt(camera.position.x + Lx, camera.position.y + Ly, camera.position.z + Lz);
      } else if (studySlot != null) {
        // HAND STUDY: still first-person; the gaze lowers onto the hands and a
        // slow breath moves the view by a few millimetres
        const cs = camRef.current, k = study.roomDim();
        const pitch = THREE.MathUtils.lerp(cs.pitch, 0.43, k);
        const co = Math.cos(pitch);
        camTarget.set(avatar.position.x, avatar.position.y + 1.58 + Math.sin(t * 1.1) * 0.0025 * k, avatar.position.z);
        camera.position.lerp(camTarget, Math.min(1, 22 * dt));
        const Lx = -Math.sin(cs.yaw) * co, Ly = -Math.sin(pitch), Lz = -Math.cos(cs.yaw) * co;
        camera.lookAt(camera.position.x + Lx, camera.position.y + Ly, camera.position.z + Lz);
      } else {
        // FIRST-PERSON: camera sits at the walker's eye level and free-looks by
        // yaw/pitch (the body is hidden, so no avatar to see). Movement is already
        // camera-relative, so WASD walks where you look.
        const cs = camRef.current;
        const co = Math.cos(cs.pitch);
        camTarget.set(avatar.position.x, avatar.position.y + 1.58, avatar.position.z);
        camera.position.lerp(camTarget, Math.min(1, 22 * dt));
        const Lx = -Math.sin(cs.yaw) * co, Ly = -Math.sin(cs.pitch), Lz = -Math.cos(cs.yaw) * co;
        camera.lookAt(camera.position.x + Lx, camera.position.y + Ly, camera.position.z + Lz);
      }
      photoWasOn = photoRef.current;

      /* proximity */
      let best = -1, bd = 2.4;
      for (let i = 0; i < SLOT_POS.length; i++) {
        const s = SLOT_POS[i];
        if (floorOfY(s.y || 0) !== avatarFloor) continue; // only same-floor exhibits
        const d = Math.hypot(avatar.position.x - s.x, avatar.position.z - s.z);
        if (d < bd) { bd = d; best = i; }
      }
      if (best !== lastNearRef.current) {
        lastNearRef.current = best;
        setNearSlot(best);
      }
      let bestCab = -1;
      if (avatarFloor >= 1) {
        let cd = 2.0;
        for (const c of cabLayout) {
          if (floorOfY(c.y) !== avatarFloor) continue;
          const d = Math.hypot(avatar.position.x - c.x, avatar.position.z - (c.z + c.face * 0.6));
          if (d < cd && Math.abs(avatar.position.x - c.x) < CAB_W / 2 + 0.3) { cd = d; bestCab = c.index; }
        }
      }
      // the nearer of (vitrine, cabinet) wins the prompt and the E key
      if (bestCab >= 0 && best >= 0) {
        const c = cabLayout[bestCab], sp = SLOT_POS[best];
        const dc = Math.hypot(avatar.position.x - c.x, avatar.position.z - (c.z + c.face * 0.6));
        if (dc < Math.hypot(avatar.position.x - sp.x, avatar.position.z - sp.z)) { best = -1; if (lastNearRef.current !== -1) { lastNearRef.current = -1; setNearSlot(-1); } }
        else bestCab = -1;
      }
      if (bestCab !== lastCabRef.current) { lastCabRef.current = bestCab; setNearCab(bestCab); }

      /* spotlight pool: re-aim at the nearest occupied hall vitrines (5 Hz) */
      if (t - poolT > 0.2) {
        poolT = t;
        const cand = [];
        for (let i = 0; i < slotObjs.length; i++) {
          const sp = SLOT_POS[i];
          if (sp.court || !slotObjs[i].stone) continue;
          const same = floorOfY(sp.y || 0) === avatarFloor;
          cand.push([Math.hypot(camera.position.x - sp.x, camera.position.z - sp.z) + (same ? 0 : 14), i]);
        }
        cand.sort((a, b) => a[0] - b[0]);
        const want = new Set(cand.slice(0, POOL).map((c) => c[1]));
        const free = [];
        for (const L of spotPool) { if (want.has(L.userData.slot)) want.delete(L.userData.slot); else free.push(L); }
        for (const i of want) {
          const L = free.pop(); if (!L) break;
          const sp = SLOT_POS[i], y0 = sp.y || 0;
          L.position.set(sp.x, y0 + 3.7, sp.z + 0.05);
          L.target.position.set(sp.x, y0 + 1.42, sp.z); L.target.updateMatrixWorld();
          L.intensity = 0; L.userData.slot = i;
        }
        for (const L of free) L.userData.slot = -1;
        for (let i = 0; i < slotObjs.length; i++) slotObjs[i].lit = false;
        for (const L of spotPool) if (L.userData.slot >= 0) slotObjs[L.userData.slot].lit = true;
      }
      for (const L of spotPool) L.intensity += ((L.userData.slot >= 0 ? 1.7 * (1 - 0.85 * roomDim) : 0) - L.intensity) * Math.min(1, 4 * dt);

      /* slot animation */
      for (let i = 0; i < slotObjs.length; i++) {
        const o = slotObjs[i];
        const occ = !!stonesRef.current[i];
        if (o.stone && inspSlot !== i) o.stone.rotation.y += dt * 0.22;
        o.beam += ((o.lit ? 1 : 0) - o.beam) * Math.min(1, 3 * dt);
        if (o.cone) o.cone.material.uniforms.uOpacity.value = occ ? o.beam * (0.075 + 0.015 * Math.sin(t * 1.4 + i)) : 0;
        /* the vitrine glass lifts away for inspection */
        const targetLift = inspSlot === i ? 1.05 : 0;
        o.domeLift += (targetLift - o.domeLift) * Math.min(1, 5 * dt);
        o.dome.position.y = 1.23 + o.domeLift;
        o.domeRim.position.y = 1.235 + o.domeLift;
        o.finial.position.y = o.finialY + o.domeLift;
        if (!occ) {
          o.ring.material.opacity = 0.3 + 0.18 * Math.sin(t * 2 + i);
          o.card.position.y = 1.36 + Math.sin(t * 1.3 + i) * 0.01;
        }
      }

      /* ambient motion: lanterns, pines, light shafts */
      for (const ln of lanterns) {
        ln.rotation.z = Math.sin(t * 0.7 + ln.userData.swayPhase) * 0.016;
        ln.rotation.x = Math.cos(t * 0.55 + ln.userData.swayPhase) * 0.012;
      }
      for (const p of pinePots) {
        if (p.userData.foliage) p.userData.foliage.rotation.z = Math.sin(t * 0.8 + p.userData.phase) * 0.014;
      }
      for (const o of orchidPots) {
        if (o.userData.blades) o.userData.blades.rotation.z = Math.sin(t * 0.9 + o.userData.phase) * 0.02;
      }
      for (const c of cyBambooCanes) {
        c.m.rotation.z = c.base + Math.sin(t * 0.6 + c.ph) * 0.025;  // gentle bamboo sway
      }
      if (cyLanternLight) {
        cyLanternLight.intensity = 0.55 + Math.sin(t * 7.3) * 0.06 + Math.sin(t * 11.7) * 0.035; // candle flicker
      }
      if (cyWaterNormal && preset0.courtFx) { cyWaterNormal.offset.x += dt * 0.016; cyWaterNormal.offset.y += dt * 0.011; }  // rippling water
      for (const k of cyKoi) {                 // koi glide in slow ellipses, bodies wiggling
        const ang = t * k.sp + k.ph;
        const x = k.cx + Math.cos(ang) * k.rx, z = k.cz + Math.sin(ang) * k.rz;
        k.m.position.set(x, 0.142 + Math.sin(t * 1.3 + k.ph) * 0.008, z);
        k.m.rotation.y = Math.atan2(-Math.sin(ang) * k.rx, Math.cos(ang) * k.rz);
        k.m.rotation.z = Math.sin(t * 5 + k.ph) * 0.12;
      }
      for (const bf of cyButterflies) {        // butterflies + swallows drift in loops, wings beating
        const ang = t * bf.sp + bf.ph;
        const x = bf.cx + Math.cos(ang) * bf.r, z = bf.cz + Math.sin(ang * 0.8) * bf.r * 0.7;
        const baseY = bf.sy != null ? bf.sy : 1.35;
        bf.m.position.set(x, baseY + Math.sin(t * 1.6 + bf.ph) * (bf.sy != null ? 0.6 : 0.35), z);
        bf.m.rotation.y = -ang + Math.PI / 2;
        if (bf.sy != null) {                   // swallow: faces its flight path, beats, glides and banks
          const dx = -Math.sin(ang) * bf.r, dz = Math.cos(ang * 0.8) * 0.8 * bf.r * 0.7;
          bf.m.rotation.set(0, Math.atan2(dx, dz), 0);
          bf.m.rotateZ(-Math.sin(ang) * 0.35);
          const glide = Math.sin(t * 0.7 + bf.ph) > 0.3;             // bursts of beats, then glides
          const beat = glide ? 0.12 : Math.sin(t * 11 + bf.ph) * 0.55;
          bf.wL.rotation.z = beat; bf.wR.rotation.z = -beat;
        } else {                               // butterfly: quick flutter
          const flap = Math.sin(t * 9 + bf.ph) * 0.9 + 0.5;
          bf.wL.rotation.y = flap; bf.wR.rotation.y = Math.PI - flap;
        }
      }
      for (const pp of cyPetals) {             // petals fall + drift, then respawn up top
        const arr = pp.pos;
        for (let i = 0; i < pp.vel.length; i++) {
          const v = pp.vel[i];
          arr[i * 3 + 1] -= v.vy * dt;
          arr[i * 3] = v.bx + Math.sin(t * 0.7 + v.ph) * v.amp;
          arr[i * 3 + 2] = v.bz + Math.cos(t * 0.5 + v.ph) * v.amp * 0.7;
          if (arr[i * 3 + 1] < 0.06) arr[i * 3 + 1] = 2.8 + Math.random() * 0.8;
        }
        pp.pts.geometry.attributes.position.needsUpdate = true;
      }
      shaftMat.uniforms.uOpacity.value = 0.11 + Math.sin(t * 0.5) * 0.025;
      moonLight.intensity = 0.85 + Math.sin(t * 0.9) * 0.08;

      /* dust drift */
      const pa = dustGeo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        pa[i * 3 + 1] += dustVel[i] * dt;
        if (pa[i * 3 + 1] > 6.6) pa[i * 3 + 1] = 0.55;
      }
      dustGeo.attributes.position.needsUpdate = true;

      // adaptive quality: if the visitor hasn't chosen a tier, step down until
      // the hall holds ~30 fps (measured over 3 s windows after it has loaded)
      if (adaptive.on && hallReadyRef.current && !uiOpenRef.current) {
        adaptive.frames++; adaptive.time += clock.getElapsedTime() - adaptive.last; adaptive.last = clock.getElapsedTime();
        if (adaptive.time > 3) {
          const fps = adaptive.frames / adaptive.time;
          adaptive.frames = 0; adaptive.time = 0;
          const next = LOWER_TIER[qualityRef.current];
          if (fps < 28 && next) {
            qualityRef.current = next; setQuality(next);
            if (applyQualityRef.current) applyQualityRef.current(next);
            toast(`画质已自动调整 · quality set to ${next} for smooth movement (${Math.round(fps)} fps)`);
          } else if (++adaptive.checks >= 2 || !next) adaptive.on = false;
        }
      } else adaptive.last = clock.getElapsedTime();
      if (typeof window !== "undefined") window.__hallQuality = qualityRef.current;

      // while a stone is in hand the room lowers and the lamp becomes the key light;
      // only the lamp's shadow map updates (the room's stays frozen)
      {
        const k = study.roomDim();
        hemi.intensity = 0.62 * (1 - 0.62 * k);
        dir.intensity = 0.82 * (1 - 0.8 * k);
        dir.shadow.autoUpdate = k === 0;
        if (k > 0) renderer.shadowMap.needsUpdate = true;
        roomDim = k;
      }
      // fog follows the visitor: warm and close in the hall, pale sky haze outdoors
      {
        const ox = THREE.MathUtils.smoothstep(camera.position.x, HW - 1.5, HW + 5);
        scene.fog.color.copy(fogIn).lerp(fogOut, ox);
        scene.fog.near = 16 + ox * 34; scene.fog.far = 52 + ox * 230;
      }
      // cabinets only matter on the mezzanine (or in photo mode)
      if (cabGroup) cabGroup.visible = avatarFloor >= 1 || photoRef.current || camera.position.y > 3.2;
      frameNo++;
      if (frameNo % 15 === 0) renderer.shadowMap.needsUpdate = true;
      // distance-cull dense props (plants, boulders) — invisible at range anyway
      if (frameNo % 10 === 0) {
        for (let i = 0; i < heavyMeshes.length; i++) {
          const hm = heavyMeshes[i];
          if (!hm.parent) continue;
          hm.getWorldPosition(_hv);
          // within reach AND on the viewer's storey (slabs hide the others)
          const dy = Math.abs(_hv.y - camera.position.y);
          hm.visible = photoRef.current || (_hv.distanceToSquared(camera.position) < 16 * 16 && (dy < 3.6 || camera.position.x > HW));
        }
      }
      const r0 = performance.now();
      renderer.info.reset(); frameInfo._sc = 0; frameInfo._st = 0;
      renderFrame(dt);
      {
        const ri = renderer.info.render;
        frameInfo.calls = ri.calls; frameInfo.triangles = ri.triangles; frameInfo.points = ri.points; frameInfo.lines = ri.lines;
        frameInfo.shadowCalls = frameInfo._sc; frameInfo.shadowTriangles = frameInfo._st; frameInfo.frame = ri.frame;
      }
      if (typeof window !== "undefined") {
        const hf = window.__hallFrame || (window.__hallFrame = { update: 0, render: 0 });
        hf.update += (r0 - f0 - hf.update) * 0.1; hf.render += (performance.now() - r0 - hf.render) * 0.1;
      }
    };
    loop();

    /* ----- photo capture ----- */
    captureRef.current = () => {
      try {
        renderFrame(0.016);
        const url = renderer.domElement.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download =
          "shishiji-" + new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + ".png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast("已留影 · photo saved");
      } catch (e) {
        toast("拍摄失败 · capture failed");
      }
    };

    /* ----- runtime quality switch ----- */
    applyQualityRef.current = (q) => {
      const p = QUALITY[q] || QUALITY.medium;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.pixelRatio));
      renderer.shadowMap.enabled = p.shadows;
      dir.shadow.map && dir.shadow.map.dispose && (dir.shadow.map = null);
      dir.shadow.mapSize.set(p.shadowMap, p.shadowMap);
      composer.enabled = p.bloom;
      const w2 = Math.max(1, container.clientWidth), h2 = Math.max(1, container.clientHeight);
      renderer.setSize(w2, h2);
      composer.setSize(w2, h2);
      if (ecRef.current) {
        ecRef.current.configure(p); ecRef.current.setSize(w2, h2);
        if (loupeRef.current && ecRef.current.setLoupe) ecRef.current.setLoupe(loupeRef.current);
      }
      setPostPath(!!p.effectComposer);
      shafts.forEach((s) => (s.visible = p.volumetrics));
      // the hand study follows the tier too: lamp shadow map, the held stone's material
      // and close-up detail (the lens target follows the pixel ratio: size "auto")
      setLampMap(q);
      if (study.setQuality) study.setQuality(q);
    };

    /* ----- cleanup ----- */
    return () => {
      mountedRef.current = false;
      worldAlive = false;
      cancelAnimationFrame(raf);
      if (composerRef.current) { composerRef.current.dispose(); composerRef.current = null; }
      if (ecRef.current) { ecRef.current.dispose(); ecRef.current = null; }
      if (hdrTex) { hdrTex.dispose(); hdrTex = null; }
      if (probeTex) { probeTex.dispose(); probeTex = null; }
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("lostpointercapture", onPointerUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onCtx);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      // the study (and its rub noise) stops with the hall; leaving the hall silences it
      try { study.dispose(); } catch (e) { /* already torn down */ }
      if (myLoupe) {
        try { myLoupe.dispose(); } catch (e) { /* already torn down */ }
        if (loupeRef.current === myLoupe) loupeRef.current = null;
        myLoupe = null;
      }
      if (audioRef.current) { try { if (audioRef.current.rub) audioRef.current.rub(0); audioRef.current.setOn(false); } catch (e) {} }
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  /* ================= UI ================= */
  const serif = 'Georgia, "Songti SC", "Noto Serif SC", serif';
  const sans = '-apple-system, "PingFang SC", "Segoe UI", sans-serif';
  const PAPER = "#f4eede", INK = "#23201c", SEAL = "#a23a25", GOLD = "#c9a35c", DIM = "#8a7a5c";

  const chip = {
    background: "rgba(20,17,13,0.74)", color: PAPER, border: "1px solid rgba(201,163,92,0.38)",
    borderRadius: 6, padding: "8px 14px", backdropFilter: "blur(6px)",
    fontFamily: serif, fontSize: 14, pointerEvents: "auto",
  };
  const paperBtn = {
    background: PAPER, color: INK, border: "1px solid " + GOLD, borderRadius: 5,
    padding: "9px 16px", fontFamily: serif, fontSize: 14, cursor: "pointer",
  };
  const ghostBtn = {
    background: "transparent", color: INK, border: "1px solid #c8b88f", borderRadius: 5,
    padding: "8px 14px", fontFamily: serif, fontSize: 13, cursor: "pointer",
  };
  const sectionLabel = {
    fontFamily: sans, fontSize: 11, letterSpacing: "0.14em", color: DIM,
    textTransform: "uppercase", marginBottom: 3,
  };
  const sectionBody = { fontFamily: serif, fontSize: 15, lineHeight: 1.6, color: INK, margin: "0 0 14px" };

  const near = nearSlot >= 0 ? stones[nearSlot] : null;

  /* ---------- hand study chrome: it recedes; the stone and the hands are the experience ---------- */
  const studying = inspecting != null || studyUI != null;   // a stone is in, or on its way to / from, the hands
  const studyStone = inspecting != null && studyUI ? stones[inspecting] : null;
  const S = studyRef.current;
  const titleTop = vw >= 900;                       // the title chip sits centred at the top (else in the logo's place)
  // the toolbar: one row when it fits (tighter padding just above the limit), else two even rows;
  // on the narrowest phones each button stacks its icon over its label
  const barCompact = vw < (touchUI ? 800 : 1010);
  const barTight = !barCompact && vw < (touchUI ? 900 : 1120);
  const barXs = vw < 380;
  const showKeys = !touchUI;                        // keycaps on the buttons for keyboard + mouse visitors
  const ICONS = {
    lamp: <><path d="M3.5 14.5h17c-.9 3.2-4.3 5.5-8.5 5.5s-7.6-2.3-8.5-5.5z" /><path d="M12 3.5c1.6 2.1 2.6 3.5 2.6 5.1a2.6 2.6 0 0 1-5.2 0c0-1.6 1-3 2.6-5.1z" /><path d="M12 11.2v3.3" /></>,
    candle: <><path d="M8.6 11h6.8v9.6H8.6z" /><path d="M12 2.8c1.4 1.9 2.2 3.1 2.2 4.4a2.2 2.2 0 0 1-4.4 0c0-1.3.8-2.5 2.2-4.4z" /><path d="M12 9.4V11" /></>,
    daylight: <><path d="M5 21V9a7 7 0 0 1 14 0v12z" /><path d="M12 2v19M5 13.5h14" /></>,
    lens: <><circle cx="10" cy="10" r="6.2" /><path d="M14.6 14.6l5.9 5.9" /><path d="M7.3 8.4a3.2 3.2 0 0 1 2.2-2" /></>,
    water: <path d="M12 3.2c3.2 4.2 6 7.2 6 10.6a6 6 0 0 1-12 0c0-3.4 2.8-6.4 6-10.6z" />,
    tap: <><circle cx="12" cy="12" r="2.1" /><path d="M8 7.6a6.2 6.2 0 0 0 0 8.8M16 7.6a6.2 6.2 0 0 1 0 8.8" /><path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" opacity=".5" /></>,
    flip: <><path d="M4.6 10.6A7.6 7.6 0 0 1 18 6.3" /><path d="M18.4 2.6v4.1h-4.1" /><path d="M19.4 13.4A7.6 7.6 0 0 1 6 17.7" /><path d="M5.6 21.4v-4.1h4.1" /></>,
    back: <><path d="M12 3.5V14" /><path d="M7.8 9.9l4.2 4.2 4.2-4.2" /><path d="M4 15.5v4h16v-4" /></>,
    take: <><path d="M12 14V3.6" /><path d="M7.8 7.8L12 3.6l4.2 4.2" /><path d="M4 15.5v4h16v-4" /></>,
    lab: <><path d="M7 17L17 7" /><path d="M9 7h8v8" /></>,
    close: <path d="M6 6l12 12M18 6L6 18" />,
  };
  const Ico = ({ n, fill }) => (
    <svg className="st-ico" viewBox="0 0 24 24" fill={fill || "none"} stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{ICONS[n]}</svg>
  );
  const noteUse = () => { if (studyUseRef.current) studyUseRef.current(); };
  // one toolbar button: icon, Chinese over English, and (keyboard visitors) its key
  const toolBtn = ({ id, icon, zh, en, kc, onClick, role, checked, pressed, primary, iconFill, aria }) => (
    <button key={id} type="button" data-tool={id} className={"st-btn" + (primary ? " primary" : "")}
      onClick={() => { onClick(); noteUse(); }}
      role={role} aria-checked={role === "radio" ? !!checked : undefined}
      aria-pressed={pressed == null ? undefined : !!pressed}
      tabIndex={role === "radio" ? (checked ? 0 : -1) : undefined}
      aria-label={aria || `${en} · ${zh}`} aria-keyshortcuts={kc ? kc.split(" / ").join(" ") : undefined}
      title={kc ? `${en} · ${zh}  (${kc})` : `${en} · ${zh}`}>
      <Ico n={icon} fill={iconFill} />
      <span className="st-lbl"><span className="zh">{zh}</span><span className="en">{en}</span></span>
      {showKeys && kc && <kbd className="st-kc" aria-hidden="true">{kc.split(" / ")[0]}</kbd>}
    </button>
  );
  const lightKeys = Object.keys(STUDY_LIGHTS);
  const curLight = studyUI && lightKeys.includes(studyUI.light) ? studyUI.light : lightKeys[0];
  // the light presets are one radio group: arrow keys move the choice (and do not turn the stone)
  const onLightKey = (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const to = d ? lightKeys[(lightKeys.indexOf(curLight) + d + lightKeys.length) % lightKeys.length]
      : e.key === "Home" ? lightKeys[0] : e.key === "End" ? lightKeys[lightKeys.length - 1] : null;
    if (!to || !S) return;
    e.preventDefault(); e.stopPropagation();
    S.setLight(to); noteUse();
    const g = e.currentTarget;
    requestAnimationFrame(() => { const b = g.querySelector(`[data-tool="${to}"]`); if (b) b.focus(); });
  };
  const LIGHT_ICON = { lamp: "lamp", candle: "candle", daylight: "daylight" };
  const studyToolbar = holding && S && studyStone ? (
    <div role="toolbar" aria-label="Study tools" aria-orientation="horizontal"
      className={"st-bar rsg-fade" + (barCompact ? " compact" : "") + (barTight ? " tight" : "") + (barXs ? " xs" : "")}>
      <div className="st-row">
        <div role="radiogroup" aria-label="Light · 光源" className="st-group" onKeyDown={onLightKey}>
          {lightKeys.map((k, i) => toolBtn({
            id: k, icon: LIGHT_ICON[k] || "lamp", zh: STUDY_LIGHTS[k].zh, en: STUDY_LIGHTS[k].label, kc: String(i + 1),
            role: "radio", checked: curLight === k, onClick: () => S.setLight(k),
          }))}
        </div>
        <span className="st-sep" aria-hidden="true" />
        {S.hasLoupe ? toolBtn({
          id: "lens", icon: "lens", zh: "放大镜", en: lensMag ? `Lens ${lensMag}×` : "Hand lens", kc: "Z",
          pressed: !!studyUI.loupe, onClick: () => S.toggleLoupe(), aria: "Hand lens · 放大镜",
        }) : <span className="st-btn st-ghost" aria-hidden="true" />}
      </div>
      <span className="st-sep st-sep-mid" aria-hidden="true" />
      <div className="st-row">
        <div role="group" aria-label="Actions · 动作" className="st-group">
          {toolBtn({ id: "water", icon: "water", zh: "洒水", en: "Water", kc: "T", onClick: () => S.wet(),
            iconFill: studyUI.wet ? "rgba(150,196,236,0.55)" : undefined, aria: studyUI.wet ? "Sprinkle water · 洒水 (the stone is wet)" : "Sprinkle water · 洒水" })}
          {toolBtn({ id: "tap", icon: "tap", zh: "叩石", en: "Tap", kc: "X", onClick: () => S.tap(), aria: "Tap the stone and listen · 叩石" })}
          {toolBtn({ id: "flip", icon: "flip", zh: "翻面", en: "Turn over", kc: "F", onClick: () => S.flip() })}
        </div>
        <span className="st-sep" aria-hidden="true" />
        {toolBtn({ id: "back", icon: "back", zh: "放回", en: "Put back", kc: "R / Esc", primary: true, onClick: putBack, aria: "Put the stone back · 放回" })}
      </div>
    </div>
  ) : null;
  // what the stone is: specimen id + bilingual name; the lighting lab (which leaves the hall) lives here
  const studyNameEn = studyStone ? studyStone.name : "";
  const studyNameZh = studyStone && studyStone.observation && studyStone.observation.title_zh && studyStone.observation.title_zh !== studyNameEn ? studyStone.observation.title_zh : "";
  const studyAnalog = studyStone && studyStone.catalog && studyStone.spec && studyStone.spec.analogName ? studyStone.spec.analogName.en : "";
  const studyTitle = studyStone ? (
    <div className="st-title rsg-fade" data-study-title="" style={titleTop ? null : { flex: "0 1 auto", minWidth: 0 }}>
      {titleTop ? (
        <div className="st-title-text">
          {studyStone.catalog && (
            <div className="st-id">{studyStone.specId}{studyAnalog ? <span className="st-analog"> · {studyAnalog}</span> : null}</div>
          )}
          <div className="st-name">
            <span className="en">{studyNameEn}</span>
            {studyNameZh && <span className="zh" lang="zh">{studyNameZh}</span>}
          </div>
        </div>
      ) : (
        // compact: the id and the Chinese name share the first line; the English name has the width below
        <div className="st-title-text">
          {(studyStone.catalog || studyNameZh) && (
            <div className="st-name st-idrow">
              {studyStone.catalog && <span className="st-id">{studyStone.specId}</span>}
              {studyNameZh && <span className="zh" lang="zh">{studyNameZh}</span>}
            </div>
          )}
          <div className="st-name"><span className="en">{studyNameEn}</span></div>
        </div>
      )}
      {studyStone.catalog && onOpenSpecimen && (
        <button type="button" className="st-lab" onClick={() => onOpenSpecimen(studyStone.specId)}
          aria-label="Open in the lighting lab · 照石台 (leaves the hall)" title="在照石台打开 · open in the lighting lab (leaves the hall)">
          <span className="st-lbl"><span className="zh">照石台</span><span className="en">Lighting lab</span></span>
          <Ico n="lab" />
        </button>
      )}
    </div>
  ) : null;
  const HINTS = touchUI
    ? (lensUp
      ? [["Drag the lens", "move it", "移镜"], ["Pinch", "magnify", "倍率"], ["One finger", "turn the stone", "转石"]]
      : [["One finger", "turn", "转石"], ["Two fingers", "move the lamp", "移灯"], ["Pinch", "nearer", "远近"], ["Double-tap", "turn over", "翻面"]])
    : (lensUp
      ? [["Move", "the lens follows", "移镜"], ["Wheel  + −", "magnify", "倍率"], ["Drag", "turn the stone", "转石"]]
      : [["Drag", "turn", "转石"], ["Right-drag", "move the lamp", "移灯"], ["Wheel", "nearer", "远近"], ["Double-click", "turn over", "翻面"]]);
  const studyHint = holding ? (
    <div className={"st-hint" + (hintOn ? " on" : "")} aria-hidden={!hintOn} data-study-hint="">
      {HINTS.map(([k, v, vz]) => (
        <span key={k} className="st-hint-item"><kbd>{k}</kbd>{v}<span className="zh" lang="zh">{vz}</span></span>
      ))}
    </div>
  ) : null;
  // the lens is a new mode: its gestures are shown when it comes up (briefly), and go with it
  const lensWasUp = useRef(false);
  useEffect(() => {
    if (lensUp) { showHint(true); fadeHint(hintSeen() ? 3500 : 6000); }
    else if (lensWasUp.current) showHint(false);
    lensWasUp.current = lensUp;
  }, [lensUp]);   // eslint-disable-line react-hooks/exhaustive-deps
  // the identification card (a stone tapped / clicked): can it be held from here?
  const pickedSpec = picked ? byId.get(picked) : null;
  const pickedInVitrine = pickedSpec && pickedSlot >= 0 && stones[pickedSlot] && stones[pickedSlot].specId === picked;
  const pickedInReach = pickedInVitrine && pickedSlot === nearSlot;
  const cardOpen = !!(pickedSpec && cabOpen == null && !photoMode && !studying);

  return (
    <div className="rsg-root" style={{ position: "fixed", inset: 0, background: "#100e0c", overflow: "hidden", fontFamily: sans }}>
      <style>{`
        @keyframes rsgFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes rsgDots { 0%,20% { opacity: .2 } 50% { opacity: 1 } 100% { opacity: .2 } }
        .rsg-dot { animation: rsgDots 1.4s infinite; display:inline-block }
        .rsg-dot:nth-child(2){ animation-delay:.2s } .rsg-dot:nth-child(3){ animation-delay:.4s }
        .rsg-card { display:flex; gap:0; }
        .rsg-img { width: 340px; flex: 0 0 340px; }
        @media (max-width: 760px){
          .rsg-card { flex-direction: column; }
          .rsg-img { width: 100%; flex: 0 0 auto; max-height: 32vh; }
        }
        .rsg-fade { animation: rsgFade .35s ease backwards; }
        .rsg-root button:focus-visible, .rsg-root a:focus-visible { outline: 2px solid #e9c97f; outline-offset: 2px; }

        /* ---- hand study ---- */
        .st-ico { width: 20px; height: 20px; flex: 0 0 auto; display: block; }
        .st-lbl { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
        .st-lbl .zh { font-family: ${serif}; font-size: 15px; line-height: 1.15; letter-spacing: .06em; white-space: nowrap; }
        .st-lbl .en { font-family: ${sans}; font-size: 11px; line-height: 1.25; letter-spacing: .02em; opacity: .74; white-space: nowrap; }
        .st-bar { display: flex; align-items: stretch; gap: 4px; padding: 5px; pointer-events: auto; max-width: 100%; box-sizing: border-box;
          background: rgba(17,14,11,.7); border: 1px solid rgba(201,163,92,.26); border-radius: 15px;
          backdrop-filter: blur(12px) saturate(1.15); -webkit-backdrop-filter: blur(12px) saturate(1.15);
          box-shadow: 0 12px 34px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,240,210,.05); }
        .st-row, .st-group { display: flex; align-items: stretch; gap: 3px; min-width: 0; }
        /* while the hands are busy (turning the stone, moving the lamp) the chrome steps back */
        .st-bar, .st-title, .st-utils { transition: opacity .35s ease; }
        .rsg-root.st-busy .st-bar, .rsg-root.st-busy .st-title, .rsg-root.st-busy .st-utils { opacity: .28; transition: opacity .45s ease .18s; }
        .st-sep { flex: 0 0 1px; align-self: stretch; margin: 9px 3px; background: rgba(201,163,92,.24); }
        .st-btn { display: flex; align-items: center; gap: 9px; min-height: 50px; padding: 0 12px; margin: 0; box-sizing: border-box;
          border: 1px solid transparent; border-radius: 11px; background: transparent; color: ${PAPER};
          font: inherit; text-align: left; cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation;
          transition: background-color .16s ease, border-color .16s ease, color .16s ease, transform .08s ease; }
        @media (hover: hover) { .st-btn:hover { background: rgba(244,238,222,.08); } }
        .st-btn:active { transform: translateY(1px); background: rgba(244,238,222,.12); }
        .st-btn[data-tool="lens"] .en { min-width: 4.9em; }
        .st-btn[aria-checked="true"], .st-btn[aria-pressed="true"] { background: rgba(201,163,92,.2); border-color: rgba(214,178,104,.66); color: #fff6e2; }
        .st-btn[aria-checked="true"] .st-ico, .st-btn[aria-pressed="true"] .st-ico { color: #f0cf86; }
        .st-btn.primary { background: ${PAPER}; color: ${INK}; border-color: ${PAPER}; }
        .st-btn.primary .en { opacity: .7; }
        @media (hover: hover) { .st-btn.primary:hover { background: #fffaf0; } }
        .st-btn.primary:active { background: #e9e1cd; }
        .st-btn.primary .st-kc { color: rgba(35,32,28,.6); border-color: rgba(35,32,28,.28); }
        .st-ghost { visibility: hidden; pointer-events: none; }
        .st-kc { font-family: ${sans}; font-size: 10.5px; line-height: 1; min-width: 9px; padding: 3px 4px 2px; margin-left: 1px; text-align: center;
          border: 1px solid rgba(244,238,222,.24); border-bottom-width: 2px; border-radius: 4px; color: rgba(244,238,222,.62); align-self: center; }
        .st-bar.compact { flex-direction: column; gap: 3px; width: 100%; max-width: 520px; }
        .st-bar.compact .st-sep-mid { display: none; }
        .st-bar.compact .st-row { width: 100%; }
        .st-bar.compact .st-row > .st-group { flex: 3 1 0; }
        .st-bar.compact .st-row > .st-btn { flex: 1 1 0; }
        .st-bar.compact .st-group > .st-btn { flex: 1 1 0; }
        .st-bar.compact .st-btn { justify-content: center; padding: 0 4px; gap: 6px; min-height: 48px; min-width: 0; }
        .st-bar.compact .st-ico { width: 18px; height: 18px; }
        .st-bar.compact .st-sep { margin: 9px 2px; }
        .st-bar.tight .st-btn { padding: 0 8px; gap: 7px; }
        .st-bar.tight .st-ico { width: 18px; height: 18px; }
        .st-bar.tight .st-sep { margin: 9px 2px; }
        .st-bar.xs .st-btn { flex-direction: column; gap: 2px; padding: 4px 2px; min-height: 54px; }
        .st-bar.xs .st-lbl { align-items: center; }
        .st-bar.xs .st-ico { width: 17px; height: 17px; }
        .st-bottom { position: absolute; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; gap: 10px;
          padding: 0 10px; pointer-events: none; z-index: 6; }
        .st-toast { display: flex; align-items: center; gap: 12px; background: rgba(20,17,13,.84); color: ${PAPER}; border: 1px solid rgba(162,58,37,.8); border-radius: 12px;
          padding: 6px 6px 6px 14px; min-height: 34px; font-family: ${serif}; font-size: 14px; line-height: 1.4; text-align: left; max-width: min(600px, 100%); box-sizing: border-box;
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); box-shadow: 0 8px 24px rgba(0,0,0,.35); pointer-events: auto; }
        .st-toast > span { padding: 4px 8px 4px 0; }
        .st-toast-act { min-height: 44px; flex: 0 0 auto; padding: 0 14px; border-color: rgba(214,178,104,.7); background: rgba(201,163,92,.14); color: #fff6e2; }
        .st-title { display: flex; align-items: stretch; pointer-events: auto; box-sizing: border-box; max-width: 100%;
          background: rgba(17,14,11,.66); border: 1px solid rgba(201,163,92,.32); border-radius: 12px; color: ${PAPER};
          backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 10px 30px rgba(0,0,0,.3); }
        .st-title-text { padding: 9px 16px 10px; min-width: 0; flex: 1 1 auto; }
        .st-id { font-family: ${sans}; font-size: 11.5px; letter-spacing: .14em; color: ${GOLD}; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .st-analog { letter-spacing: .06em; color: rgba(201,163,92,.82); }
        .st-name { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 12px; row-gap: 0; margin-top: 2px; }
        .st-name .en { font-family: ${serif}; font-size: 18px; line-height: 1.3; overflow-wrap: normal; word-break: normal; }
        .st-name .zh { font-family: ${serif}; font-size: 16px; line-height: 1.3; letter-spacing: .08em; color: rgba(244,238,222,.78); white-space: nowrap; }
        .st-lab { display: flex; align-items: center; gap: 8px; padding: 0 14px; min-height: 44px; border: 0; border-left: 1px solid rgba(201,163,92,.24);
          border-radius: 0 12px 12px 0; background: transparent; color: rgba(244,238,222,.84); cursor: pointer; font: inherit; flex: 0 0 auto;
          transition: background-color .16s ease, color .16s ease; }
        @media (hover: hover) { .st-lab:hover { background: rgba(244,238,222,.07); color: #fff; } }
        .st-lab .st-ico { width: 16px; height: 16px; opacity: .8; }
        .st-lab .zh { font-size: 13.5px; } .st-lab .en { font-size: 11px; }
        .st-hint { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 18px; max-width: 100%;
          font-family: ${sans}; font-size: 12.5px; line-height: 1.5; color: rgba(244,238,222,.9); text-shadow: 0 1px 3px rgba(0,0,0,.85), 0 0 12px rgba(0,0,0,.5);
          opacity: 0; visibility: hidden; transform: translateY(-4px); pointer-events: none;
          transition: opacity .7s ease, transform .7s ease, visibility 0s linear .7s; }
        .st-hint.on { opacity: 1; visibility: visible; transform: none; transition: opacity .35s ease, transform .35s ease, visibility 0s; }
        .st-hint-item { white-space: nowrap; display: inline-flex; align-items: baseline; }
        .st-hint-item kbd { font-family: ${sans}; font-size: 11.5px; padding: 1px 6px; margin-right: 6px; border-radius: 5px; text-shadow: none;
          border: 1px solid rgba(214,178,104,.5); background: rgba(17,14,11,.55); color: #ecd29a; }
        .st-hint-item .zh { margin-left: 5px; font-family: ${serif}; color: rgba(244,238,222,.72); }
        .st-idrow { margin-top: 0; column-gap: 10px; }
        .st-idrow .st-id { overflow: visible; }
        .st-idrow .zh { font-size: 15px; }
        @media (max-width: 899px) {
          .st-lab { flex-direction: column-reverse; justify-content: center; gap: 3px; padding: 0 10px; min-width: 66px; }
          .st-lab .st-lbl { align-items: center; }
        }
        @media (max-width: 639px) {
          .st-title-text { padding: 8px 12px 9px; }
          .st-id { font-size: 13px; letter-spacing: .1em; }
          .st-name .en { font-size: 16.5px; } .st-name .zh { font-size: 15px; }
          .st-name { column-gap: 9px; }
          .st-hint { font-size: 13px; gap: 5px 14px; }
          .st-lbl .zh { font-size: 14px; } .st-lbl .en { font-size: 11px; letter-spacing: 0; }
        }
        @media (prefers-reduced-motion: reduce) { .st-hint, .st-hint.on, .rsg-fade { transition: none; animation: none; } }

        /* ---- vitrine in reach / identification card ---- */
        .near-card { display: flex; flex-direction: column; align-items: stretch; gap: 4px; padding: 5px; pointer-events: auto; max-width: 100%; box-sizing: border-box;
          background: rgba(17,14,11,.7); border: 1px solid rgba(201,163,92,.26); border-radius: 15px;
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 12px 34px rgba(0,0,0,.35); }
        .near-name { font-family: ${serif}; font-size: 15px; line-height: 1.35; color: ${PAPER}; text-align: center; padding: 5px 12px 2px; }
        .near-name .st-id { display: inline; margin-right: 8px; font-size: 11.5px; }
        .near-actions { display: flex; gap: 4px; justify-content: center; }
        .near-actions .st-btn { flex: 1 1 auto; justify-content: center; }
        .id-card { position: absolute; z-index: 8; color: ${PAPER}; overflow: hidden; box-sizing: border-box;
          background: rgba(20,17,13,.86); border: 1px solid rgba(201,163,92,.55); border-radius: 12px;
          backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 16px 40px rgba(0,0,0,.45); }
        .id-card .id-acts { display: flex; gap: 6px; align-items: stretch; flex-wrap: wrap; }
        .id-card .id-acts .st-btn { min-height: 46px; }
        .id-card .id-far { display: flex; align-items: center; gap: 8px; font-family: ${sans}; font-size: 12.5px; color: rgba(244,238,222,.72); min-height: 46px; }
      `}</style>

      {/* 3D canvas */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {/* soft vignette */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 58%, rgba(0,0,0,0.32) 100%)",
      }} />

      {/* virtual joystick */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div ref={joyBaseRef} style={{
          display: "none", position: "absolute", width: 104, height: 104, borderRadius: "50%",
          border: "2px solid rgba(244,238,222,0.4)", background: "rgba(244,238,222,0.07)",
        }} />
        <div ref={joyNubRef} style={{
          display: "none", position: "absolute", width: 44, height: 44, borderRadius: "50%",
          background: "rgba(244,238,222,0.55)",
        }} />
      </div>

      {/* top bar (while a stone is in hand only the title, sound and "?" remain) */}
      {!photoMode && (
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, padding: narrow ? "10px 10px" : "14px 16px",
        paddingTop: `calc(${narrow ? 10 : 14}px + env(safe-area-inset-top, 0px))`,
        display: "flex", flexDirection: "column", gap: 10, pointerEvents: "none", zIndex: 5,
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        {!studying ? (
          <a href={exitHref} aria-label="Leave the hall — back to the museum" style={{ ...chip, lineHeight: 1.25, textDecoration: "none", display: "block", cursor: "pointer", whiteSpace: "nowrap", ...(narrow ? { padding: "8px 10px" } : {}) }}>
            <div style={{ fontSize: narrow ? 15 : 17, letterSpacing: "0.18em" }}>← 拾石记</div>
            {!narrow && (
              <div style={{ fontSize: 10, letterSpacing: "0.22em", color: GOLD, fontFamily: sans }}>
                MUSEUM · ARCHIVE
              </div>
            )}
          </a>
        ) : (!titleTop && studyTitle) || <span />}
        <div className={studying ? "st-utils" : undefined} style={{ display: "flex", gap: narrow ? 6 : 8, pointerEvents: "none", flexWrap: "nowrap", flex: "0 0 auto",
          // beside the title on a narrow screen the two remaining buttons stack, leaving the name its width
          flexDirection: studying && !titleTop && studyStone ? "column" : "row" }}>
          <button onClick={toggleSound} title={soundOn ? "环境琴音 · sound on" : "声音已关 · sound off — turn on to hear the stones"} aria-label={soundOn ? "Mute sound" : "Turn sound on"} aria-pressed={soundOn}
            style={{ ...chip, cursor: "pointer", width: 44, height: 44, padding: 0, display: "grid", placeItems: "center", color: soundOn ? PAPER : "rgba(244,238,222,0.62)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
              {soundOn ? <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
            </svg>
          </button>
          {!studying && <button onClick={togglePhoto} title="拍照模式 · photo mode" aria-label="Photo mode"
            style={{ ...chip, cursor: "pointer", width: 44, height: 44, padding: 0, textAlign: "center" }}>
            📷
          </button>}
          {!studying && <button onClick={() => setShowSettings((v) => !v)} title="画质设置 · settings" aria-label="Quality settings"
            style={{ ...chip, cursor: "pointer", width: 44, height: 44, padding: 0, textAlign: "center" }}>
            ⚙
          </button>}
          <button onClick={() => (holding ? showHint(!hintOn) : setShowHelp(true))}
            aria-label={holding ? "Show the gestures · 提示 (?)" : "Help"} aria-pressed={holding ? hintOn : undefined}
            title={holding ? "手势提示 · gestures (?)" : "帮助 · help (?)"}
            style={{ ...chip, cursor: "pointer", width: 44, height: 44, padding: 0, textAlign: "center", ...(holding && hintOn ? { border: "1px solid " + GOLD, background: "rgba(201,163,92,0.2)" } : {}) }}>
            ?
          </button>
        </div>
      </div>
      {studying && !titleTop && studyHint}
      </div>
      )}

      {/* hand study: the title (and the gesture hint) centred at the top on wider screens */}
      {studying && titleTop && !photoMode && studyStone && (
        <div style={{
          position: "absolute", left: "50%", transform: "translateX(-50%)", top: "calc(14px + env(safe-area-inset-top, 0px))",
          width: "min(720px, calc(100vw - 280px))", display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          pointerEvents: "none", zIndex: 5,
        }}>
          {studyTitle}
          {studyHint}
        </div>
      )}

      {/* settings popover — quality / rendering */}
      {showSettings && !photoMode && !studying && (
        <div className="rsg-fade" style={{
          position: "absolute", top: 64, right: 16, zIndex: 25,
          background: "rgba(20,17,13,0.92)", border: "1px solid " + GOLD, borderRadius: 8,
          padding: 14, width: 220, backdropFilter: "blur(8px)", pointerEvents: "auto",
        }}>
          <div style={{ fontFamily: serif, color: PAPER, fontSize: 14, marginBottom: 4 }}>画质 · Quality</div>
          <div style={{ fontFamily: sans, fontSize: 10, color: "rgba(244,238,222,0.5)", marginBottom: 10 }}>
            轻 Eco keeps the look on the lightest GPU load · higher = richer light & glow, more GPU
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {Object.keys(QUALITY).map((q) => (
              <button key={q} onClick={() => changeQuality(q)}
                style={{
                  ...chip, cursor: "pointer", textAlign: "left",
                  borderColor: quality === q ? GOLD : "rgba(201,163,92,0.3)",
                  background: quality === q ? "rgba(201,163,92,0.18)" : "rgba(20,17,13,0.5)",
                }}>
                {quality === q ? "● " : "○ "}{QUALITY[q].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* proximity prompt */}
      {nearSlot >= 0 && !showHelp && !studying && !photoMode && !cardOpen && (
        <div className="rsg-fade" style={{
          position: "absolute", bottom: `calc(${narrow ? 78 : 84}px + env(safe-area-inset-bottom, 0px))`, left: 0, right: 0,
          display: "flex", justifyContent: "center", pointerEvents: "none", padding: "0 10px",
        }}>
          <div className="near-card" role="group" aria-label="Vitrine in reach">
            <div className="near-name">
              {near && near.catalog ? (
                <><span className="st-id">{near.specId}</span>{near.name}{near.observation && near.observation.title_zh ? <span style={{ whiteSpace: "nowrap", opacity: 0.78, marginLeft: 8 }}>{near.observation.title_zh}</span> : null}</>
              ) : near ? near.name : "空座 · empty pedestal"}
            </div>
            <div className="near-actions">
              {near && (
                <button type="button" className="st-btn primary" data-tool="hold" onClick={() => enterInspect(nearSlot)} aria-label="Hold it · 拿起" aria-keyshortcuts={touchUI ? undefined : "R"}>
                  <Ico n="take" />
                  <span className="st-lbl"><span className="zh">拿起</span><span className="en">Hold it</span></span>
                  {showKeys && <kbd className="st-kc" aria-hidden="true">R</kbd>}
                </button>
              )}
              <button type="button" className="st-btn" onClick={interact} aria-keyshortcuts={touchUI ? undefined : "E"}
                aria-label={near && near.catalog ? "Open in the lighting lab · 照石台" : near ? "Observe · 观赏" : "Place a stone · 安放石头"}>
                <Ico n={near && near.catalog ? "lab" : "take"} />
                <span className="st-lbl">
                  <span className="zh">{near && near.catalog ? "照石台" : near ? "观赏" : "安放石头"}</span>
                  <span className="en">{near && near.catalog ? "Lighting lab" : near ? "Observe" : "Place a stone"}</span>
                </span>
                {showKeys && <kbd className="st-kc" aria-hidden="true">E</kbd>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* cabinet in reach */}
      {nearSlot < 0 && nearCab >= 0 && cabOpen == null && !showHelp && !studying && !photoMode && !cardOpen && cabLayout[nearCab] && (
        <div className="rsg-fade" style={{ position: "absolute", bottom: 84, left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <button onClick={() => setCabOpen(nearCab)} style={{ ...chip, cursor: "pointer", borderColor: GOLD }}>
            柜 {nearCab + 1} · {cabinet[cabLayout[nearCab].from].id} – {cabinet[cabLayout[nearCab].to - 1].id} — <b style={{ color: GOLD }}>E</b> 浏览 · browse this cabinet
          </button>
        </div>
      )}

      {/* a stone picked by clicking it */}
      {/* (on a phone it is a sheet at the bottom, clear of the stone; it is gone for the whole study) */}
      {cardOpen && (
        <div className="rsg-fade id-card" role="dialog" aria-label="Selected specimen"
          style={narrow
            ? { left: 10, right: 10, bottom: `calc(78px + env(safe-area-inset-bottom, 0px))`, padding: 10 }
            : { top: 76, right: 16, width: "min(320px, 86vw)" }}>
          <div style={narrow ? { display: "flex", gap: 12, alignItems: "center" } : null}>
            <img src={thumbUrl(picked)} alt=""
              style={narrow
                ? { width: 76, height: 76, flex: "0 0 auto", borderRadius: 8, objectFit: "cover", background: "#1a1612", display: "block" }
                : { width: "100%", aspectRatio: "1", objectFit: "cover", background: "#1a1612", display: "block" }} />
            <div style={narrow ? { minWidth: 0, flex: "1 1 auto" } : { padding: "10px 14px 0" }}>
              <div className="st-id" style={narrow ? { fontSize: 12.5 } : null}>{picked}{pickedSpec.analogName ? " · " + pickedSpec.analogName.en : ""}</div>
              <div style={{ fontFamily: serif, fontSize: narrow ? 17 : 18, lineHeight: 1.3, margin: "3px 0 1px" }}>{pickedSpec.title.en}</div>
              <div lang="zh" style={{ fontFamily: serif, fontSize: 15, color: "rgba(244,238,222,0.74)", whiteSpace: "nowrap", letterSpacing: "0.06em" }}>{pickedSpec.title.zh}</div>
            </div>
          </div>
          <div className="id-acts" style={{ marginTop: narrow ? 10 : 12, padding: narrow ? 0 : "0 14px 14px" }}>
            {pickedInReach ? (
              <button type="button" className="st-btn primary" data-tool="hold" style={{ flex: "1 1 auto", justifyContent: "center" }}
                onClick={() => enterInspect(pickedSlot)} aria-label="Hold it · 拿起">
                <Ico n="take" />
                <span className="st-lbl"><span className="zh">拿起</span><span className="en">Hold it</span></span>
              </button>
            ) : pickedInVitrine ? (
              <div className="id-far" style={{ flex: "1 1 100%" }}>走近展柜即可拿起 · walk up to the vitrine to hold it</div>
            ) : null}
            {onOpenSpecimen && (
              <button type="button" className="st-btn" style={{ flex: pickedInReach ? "0 0 auto" : "1 1 auto", justifyContent: "center", border: "1px solid rgba(201,163,92,0.38)" }}
                onClick={() => onOpenSpecimen(picked)} aria-label="Open in the lighting lab · 照石台">
                <Ico n="lab" />
                <span className="st-lbl"><span className="zh">照石台</span><span className="en">Lighting lab</span></span>
              </button>
            )}
            <button type="button" className="st-btn" style={{ width: 46, padding: 0, justifyContent: "center", border: "1px solid rgba(201,163,92,0.38)" }}
              onClick={() => setPicked(null)} aria-label="Close">
              <Ico n="close" />
            </button>
          </div>
        </div>
      )}

      {/* cabinet browser */}
      {cabOpen != null && cabLayout[cabOpen] && (
        <div role="dialog" aria-modal="true" aria-label={`Cabinet ${cabOpen + 1}`} onClick={() => setCabOpen(null)}
          style={{ position: "absolute", inset: 0, background: "rgba(10,8,6,0.72)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", padding: 16, zIndex: 20 }}>
          <div onClick={(e) => e.stopPropagation()} className="rsg-fade" style={{ background: "#16130f", border: "1px solid " + GOLD, borderRadius: 10, width: "min(980px, 96vw)", maxHeight: "88vh", overflow: "auto", padding: "18px 20px", color: PAPER }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <div>
                <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.18em", color: GOLD }}>SPECIMEN CABINET {cabOpen + 1} · 柜 {cabOpen + 1}</div>
                <div style={{ fontSize: 22, marginTop: 4 }}>{cabinet[cabLayout[cabOpen].from].id} – {cabinet[cabLayout[cabOpen].to - 1].id}</div>
              </div>
              <button autoFocus onClick={() => setCabOpen(null)} style={{ ...chip, cursor: "pointer" }} aria-label="Close cabinet">✕ Esc</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginTop: 14 }}>
              {cabinet.slice(cabLayout[cabOpen].from, cabLayout[cabOpen].to).map((sp) => (
                <button key={sp.id} onClick={() => onOpenSpecimen && onOpenSpecimen(sp.id)}
                  style={{ background: "#1f1a15", border: "1px solid rgba(201,163,92,0.3)", borderRadius: 8, padding: 0, color: PAPER, cursor: "pointer", textAlign: "left", overflow: "hidden" }}>
                  <img src={thumbUrl(sp.id)} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block", background: "#14110d" }} />
                  <div style={{ padding: "6px 8px 8px" }}>
                    <div style={{ fontFamily: sans, fontSize: 10, letterSpacing: "0.12em", color: GOLD }}>{sp.id}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.25 }}>{sp.title.en}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* loading veil until the hall and its vitrines are dressed */}
      {!hallReady && (
        <div role="status" aria-live="polite" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#100e0c", color: PAPER, zIndex: 30, fontFamily: serif }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 30, letterSpacing: "0.2em" }}>拾石记</div>
            <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.2em", color: GOLD, marginTop: 8 }}>LIGHTING THE LAMPS…</div>
          </div>
        </div>
      )}

      {/* controls hint */}
      {!studying && !photoMode && (
        <div style={{
          position: "absolute", bottom: `calc(14px + env(safe-area-inset-bottom, 0px))`, right: 14, ...(narrow ? { left: 14, textAlign: "center" } : {}), ...chip,
          fontFamily: sans, fontSize: 11, color: "rgba(244,238,222,0.75)", pointerEvents: "none",
        }}>
          {touchUI ? "左下拖动 移动 · 拖动 视角 · 点按石头 识别 · drag lower-left to walk, drag to look, tap a stone" : "WASD 移动 · 拖动 视角 · E 互动 · R 拿起 · P 拍照 · ? 帮助"}
        </div>
      )}

      {/* ---------- hand study: the toolbar (and any notice) at the bottom, clear of the stone ---------- */}
      {studying && !photoMode && (
        <div className="st-bottom" style={{ bottom: `calc(${narrow ? 10 : 18}px + env(safe-area-inset-bottom, 0px))` }}>
          {toastMsg && (
            <div className="rsg-fade st-toast" role="status">
              <span>{toastMsg}</span>
              {toastAction && (
                <button type="button" className="st-btn st-toast-act"
                  onClick={() => { const a = toastAction; setToastMsg(null); setToastAction(null); a.run(); }}>
                  <span className="st-lbl"><span className="zh">{toastAction.zh}</span><span className="en">{toastAction.en}</span></span>
                </button>
              )}
            </div>
          )}
          {studyToolbar}
        </div>
      )}

      {/* ---------- photo mode overlay ---------- */}
      {photoMode && (
        <div style={{
          position: "absolute", top: 14, left: 0, right: 0,
          display: "flex", justifyContent: "center", pointerEvents: "none",
        }}>
          <div style={{ ...chip, fontFamily: sans, fontSize: 11 }}>
            拍照模式 · photo mode — WASD 平移 · Space/C 升降 · 拖动 视角 · 滚轮 推进 · Esc 退出
          </div>
        </div>
      )}
      {photoMode && (
        <div style={{ position: "absolute", bottom: 16, right: 16, display: "flex", gap: 8 }}>
          <button onClick={snapPhoto} style={{ ...chip, cursor: "pointer", borderColor: GOLD, fontSize: 15 }}>
            📷 拍摄 · capture
          </button>
          <button onClick={() => setPhotoMode(false)} style={{ ...chip, cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* toast */}
      {toastMsg && !studying && (
        <div className="rsg-fade" role="status" style={{
          position: "absolute", top: `calc(${narrow ? 66 : 72}px + env(safe-area-inset-top, 0px))`, left: 0, right: 0,
          display: "flex", justifyContent: "center", pointerEvents: "none", padding: "0 12px", zIndex: 6,
        }}>
          <div style={{ ...chip, borderColor: SEAL, textAlign: "center" }}>{toastMsg}</div>
        </div>
      )}

      {/* ---------- help / welcome ---------- */}
      {showHelp && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(8,8,6,0.75)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 40,
        }}>
          <div className="rsg-fade" style={{
            background: PAPER, border: "1px solid " + GOLD, borderRadius: 8,
            width: "min(92vw, 430px)", padding: 24, boxShadow: "0 18px 50px rgba(0,0,0,0.6)",
          }}>
            <div style={{ fontFamily: serif, fontSize: 26, color: INK, letterSpacing: "0.14em" }}>拾石记</div>
            <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.2em", color: SEAL, marginBottom: 14 }}>
              THE RIVER STONE GALLERY
            </div>
            <div style={{ fontFamily: serif, fontSize: 14.5, lineHeight: 1.75, color: INK }}>
              <p style={{ margin: "0 0 10px" }}>
                展厅里的玻璃罩中陈列着石谱中的精品；二层回廊的石柜收藏着全部三百二十方石。
                走近一方石按 <b>E</b>，便可到照石台上细细打光端详。穿过月洞门，庭院里也陈列着石头。
              </p>
              <p style={{ margin: "0 0 10px", color: "#5c5142" }}>
                Move with <b>WASD</b> or the left-side touch joystick · drag to look around ·
                <b>E</b> to interact · click any stone to identify it. At a vitrine, press <b>R</b> (or
                tap <b>Hold it</b>) to take the stone in your hands: turn it, move the lamp, wet it,
                tap it and listen, raise a hand lens. The vitrines hold thirty-four showpieces, in the hall
                and through the moon gate in the courtyard; the cabinets on the upper galleries hold all
                320 specimens.
              </p>
              <p style={{ margin: "0 0 14px", color: "#5c5142", fontSize: 13.5 }}>
                按 <b>R</b> 拿起 — 玻璃罩升起，石头落入手中：转动、移灯、洒水、叩听、举放大镜。
                按 <b>P</b> 进入拍照模式（自由视角，可存图）。右上角可开启声音。
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={dismissHelp} style={{ ...paperBtn, background: INK, color: PAPER, borderColor: INK }}>
                进入展厅 · Enter the hall
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
