// React wrapper around StoneScene: mounts the viewer, exposes the scene via ref,
// handles keyboard orbit/zoom, loading and WebGL-unavailable states.
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { StoneScene } from "../../stones/StoneScene.js";

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

const Viewer = forwardRef(function Viewer({ spec, label, onReady, fallback, level, className = "", plinth = true, interactive = true }, ref) {
  const host = useRef(null);
  const sceneRef = useRef(null);
  const [state, setState] = useState("loading"); // loading | ready | nogl | error
  useImperativeHandle(ref, () => sceneRef.current, [state]);

  useEffect(() => {
    if (!webglAvailable()) { setState("nogl"); return; }
    let sc;
    try {
      const mobile = window.matchMedia("(max-width: 720px)").matches;
      sc = new StoneScene(host.current, { level: level ?? (mobile ? 5 : 6), plinth, interactive, maxDpr: mobile ? 1.5 : 2 });
    } catch (e) { console.error(e); setState("error"); return; }
    sceneRef.current = sc;
    window.__stoneScene = sc; // verification hook (e2e)
    return () => { sc.dispose(); sceneRef.current = null; if (window.__stoneScene === sc) window.__stoneScene = null; };
  }, []);

  useEffect(() => {
    const sc = sceneRef.current;
    if (!sc || !spec) return;
    setState("loading");
    // build after the loading veil paints (geometry generation is synchronous)
    const t = setTimeout(() => {
      try {
        sc.setSpecimen(spec);
        sc.frameNow("three-quarter", 0.78);
        sc.envReady.then(() => { setState("ready"); onReady && onReady(sc); });
      } catch (e) { console.error(e); setState("error"); }
    }, 30);
    return () => clearTimeout(t);
  }, [spec && spec.id, state === "nogl"]);

  // keyboard: arrows orbit, +/- zoom, 0 resets
  const onKey = (e) => {
    const sc = sceneRef.current; if (!sc || !sc.controls) return;
    const c = sc.controls, cam = sc.camera;
    const off = cam.position.clone().sub(c.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    let used = true;
    if (e.key === "ArrowLeft") sph.theta -= 0.12;
    else if (e.key === "ArrowRight") sph.theta += 0.12;
    else if (e.key === "ArrowUp") sph.phi = Math.max(0.15, sph.phi - 0.1);
    else if (e.key === "ArrowDown") sph.phi = Math.min(1.65, sph.phi + 0.1);
    else if (e.key === "+" || e.key === "=") sph.radius = Math.max(c.minDistance, sph.radius * 0.88);
    else if (e.key === "-" || e.key === "_") sph.radius = Math.min(c.maxDistance, sph.radius * 1.12);
    else if (e.key === "0") { sc.frame("three-quarter"); }
    else used = false;
    if (used) { e.preventDefault(); if (e.key !== "0") { cam.position.copy(new THREE.Vector3().setFromSpherical(sph).add(c.target)); c.update(); sc.invalidate(); } }
  };

  if (state === "nogl") return fallback || <div className="viewer-msg">3D viewing needs WebGL, which this browser has disabled.</div>;
  return (
    <div className={"viewer " + className}>
      <div ref={host} className="viewer-canvas" tabIndex={interactive ? 0 : -1} role={interactive ? "application" : "img"}
        aria-label={label} onKeyDown={interactive ? onKey : undefined} />
      {state === "loading" && <div className="viewer-veil" role="status"><div className="spinner" aria-hidden="true" />Shaping the stone…</div>}
      {state === "error" && <div className="viewer-veil" role="alert">This specimen could not be rendered.</div>}
    </div>
  );
});

export default Viewer;
