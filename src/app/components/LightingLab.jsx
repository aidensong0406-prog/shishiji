// Lighting lab: move the key light around the stone (dial + sliders), aim it,
// shape its cone, set intensity and colour, and use discovery tools
// (light sweep, wet surface, pattern lens, turntable).
import React, { useEffect, useRef, useState } from "react";
import { LIGHT_PRESETS, KELVIN } from "../../stones/StoneScene.js";

const SLIDERS = [
  { k: "azimuth", label: "Direction around", unit: "°", min: 0, max: 359, step: 1 },
  { k: "elevation", label: "Height above horizon", unit: "°", min: 2, max: 88, step: 1 },
  { k: "distance", label: "Distance", unit: "m", min: 2, max: 7, step: 0.1 },
  { k: "angle", label: "Beam angle", unit: "°", min: 6, max: 60, step: 1 },
  { k: "penumbra", label: "Beam softness", unit: "", min: 0, max: 1, step: 0.01 },
  { k: "intensity", label: "Intensity", unit: "", min: 0, max: 6, step: 0.05 },
  { k: "aimX", label: "Aim left / right", unit: "", min: -1, max: 1, step: 0.02 },
  { k: "aimY", label: "Aim down / up", unit: "", min: -1, max: 1, step: 0.02 },
  { k: "ambient", label: "Room light", unit: "", min: 0, max: 1, step: 0.01 },
];

function fmt(v, s) { return s.step >= 1 ? Math.round(v) : v.toFixed(s.step < 0.05 ? 2 : 1); }

function LightDial({ az, el, color, onChange }) {
  const ref = useRef(null);
  const R = 70;
  const rad = (1 - el / 90) * R;
  const a = (az * Math.PI) / 180;
  const x = 80 + Math.sin(a) * rad, y = 80 + Math.cos(a) * rad;
  const fromEvent = (e) => {
    const b = ref.current.getBoundingClientRect();
    const px = ((e.clientX - b.left) / b.width) * 160 - 80, py = ((e.clientY - b.top) / b.height) * 160 - 80;
    const d = Math.min(R, Math.hypot(px, py));
    const azn = ((Math.atan2(px, py) * 180) / Math.PI + 360) % 360;
    onChange({ azimuth: Math.round(azn), elevation: Math.max(2, Math.round((1 - d / R) * 90)) });
  };
  const down = (e) => { e.currentTarget.setPointerCapture(e.pointerId); fromEvent(e); };
  const move = (e) => { if (e.buttons & 1) fromEvent(e); };
  const key = (e) => {
    const m = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, 3], ArrowDown: [0, -3] }[e.key];
    if (!m) return;
    e.preventDefault();
    onChange({ azimuth: (az + m[0] + 360) % 360, elevation: Math.max(2, Math.min(88, el + m[1])) });
  };
  return (
    <svg ref={ref} viewBox="0 0 160 160" className="dial" role="slider" tabIndex={0}
      aria-label="Light position: drag, or use arrow keys (left/right moves around, up/down changes height)"
      aria-valuetext={`${Math.round(az)}° around, ${Math.round(el)}° high`} aria-valuenow={Math.round(az)} aria-valuemin={0} aria-valuemax={359}
      onPointerDown={down} onPointerMove={move} onKeyDown={key}>
      <circle cx="80" cy="80" r={R} className="dial-ring" />
      <circle cx="80" cy="80" r={R * 0.66} className="dial-ring faint" />
      <circle cx="80" cy="80" r={R * 0.33} className="dial-ring faint" />
      <line x1="80" y1="10" x2="80" y2="150" className="dial-ring faint" />
      <line x1="10" y1="80" x2="150" y2="80" className="dial-ring faint" />
      <text x="80" y="156" className="dial-t">front</text>
      <text x="80" y="9" className="dial-t">back</text>
      <ellipse cx="80" cy="80" rx="13" ry="9" className="dial-stone" />
      <line x1="80" y1="80" x2={x} y2={y} stroke={color} strokeOpacity="0.55" strokeWidth="1.5" />
      <circle cx={x} cy={y} r="8" fill={color} className="dial-lamp" />
    </svg>
  );
}

export default function LightingLab({ scene, specId }) {
  const [L, setL] = useState({ ...LIGHT_PRESETS.gallery, aimX: 0, aimY: 0 });
  const [preset, setPreset] = useState("gallery");
  const [tools, setTools] = useState({ sweep: false, wet: false, lens: false, turntable: false, gizmo: false });
  const [open, setOpen] = useState(true);
  const throttle = useRef(0);

  // re-apply on specimen change (scene rebuilt the stone)
  useEffect(() => { if (scene) { scene.setLight(L); scene.setWet(tools.wet ? 1 : 0); scene.setLens(tools.lens ? 1 : 0); } }, [scene, specId]);

  const update = (patch, keepPreset) => {
    setL((cur) => { const n = { ...cur, ...patch }; scene && scene.setLight(n); return n; });
    if (!keepPreset) setPreset(null);
  };
  const applyPreset = (k) => { setPreset(k); update({ ...LIGHT_PRESETS[k], aimX: 0, aimY: 0 }, true); };
  const toggle = (k) => {
    const v = !tools[k];
    setTools((t) => ({ ...t, [k]: v }));
    if (!scene) return;
    if (k === "sweep") scene.setSweep(v, (az) => { const now = performance.now(); if (now - throttle.current > 120) { throttle.current = now; setL((c) => ({ ...c, azimuth: Math.round(az) })); } });
    if (k === "wet") scene.setWet(v ? 1 : 0);
    if (k === "lens") scene.setLens(v ? 1 : 0);
    if (k === "turntable") scene.setTurntable(v);
    if (k === "gizmo") scene.showGizmo(v);
  };
  useEffect(() => () => { if (scene) { scene.setSweep(false); } }, [scene]);

  return (
    <section className="lab" aria-labelledby="lab-h">
      <div className="lab-head">
        <h2 id="lab-h" className="h3" style={{ margin: 0 }}>Lighting lab <span className="zh">· 照石</span></h2>
        <button className="btn ghost lab-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide controls" : "Show controls"}</button>
      </div>
      <div className="lab-presets" role="group" aria-label="Lighting presets">
        {Object.entries(LIGHT_PRESETS).map(([k, p]) => (
          <button key={k} className="chip" aria-pressed={preset === k} onClick={() => applyPreset(k)}>
            <span className="zh" aria-hidden="true">{p.zh}</span> {p.label}
          </button>
        ))}
      </div>
      <div className="lab-tools" role="group" aria-label="Discovery tools">
        <button className="btn" aria-pressed={tools.sweep} onClick={() => toggle("sweep")} title="Circle the light around the stone: relief and veins appear and vanish as the angle changes">◐ Light sweep</button>
        <button className="btn" aria-pressed={tools.wet} onClick={() => toggle("wet")} title="Wet the surface: darker, deeper colour and a glossy film, as collectors do to read a stone">💧 Wet surface</button>
        <button className="btn" aria-pressed={tools.lens} onClick={() => toggle("lens")} title="Exaggerate pattern contrast and relief. A visual aid — not true colour.">◎ Pattern lens</button>
        <button className="btn" aria-pressed={tools.turntable} onClick={() => toggle("turntable")}>⟳ Turntable</button>
        <button className="btn" aria-pressed={tools.gizmo} onClick={() => toggle("gizmo")}>✦ Show lamp</button>
      </div>
      {tools.lens && <p className="lab-note"><span className="badge interpretation">Visual aid</span> Pattern lens exaggerates contrast and relief; colours are not true to the specimen.</p>}
      {open && (
        <div className="lab-body">
          <div className="lab-dial">
            <LightDial az={L.azimuth} el={L.elevation} color={L.color} onChange={(p) => update(p)} />
            <div className="lab-colour">
              <div className="label">Colour temperature</div>
              <div className="kelvin" role="group" aria-label="Colour temperature">
                {Object.entries(KELVIN).map(([k, hex]) => (
                  <button key={k} className="kchip" style={{ background: hex }} aria-pressed={L.color.toLowerCase() === hex} aria-label={`${k} kelvin`} title={`${k} K`} onClick={() => update({ color: hex })} />
                ))}
              </div>
              <label className="custom-colour"><input type="color" value={L.color} onChange={(e) => update({ color: e.target.value })} aria-label="Custom light colour" /> Custom</label>
            </div>
          </div>
          <div className="lab-sliders">
            {SLIDERS.map((s) => (
              <div className="field slider" key={s.k}>
                <label htmlFor={`ll-${s.k}`}>{s.label}<output htmlFor={`ll-${s.k}`}>{fmt(L[s.k], s)}{s.unit}</output></label>
                <input id={`ll-${s.k}`} type="range" min={s.min} max={s.max} step={s.step} value={L[s.k]}
                  onChange={(e) => update({ [s.k]: +e.target.value })} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
