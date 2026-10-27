import React, { useMemo, useState } from "react";
import { useCatalog, similarTo, thumbUrl } from "../catalog.js";
import { navigate, withQuery } from "../router.js";
import { pca2 } from "../../catalog/pca.js";
import { lightness } from "../tones.js";
import Thumb from "../components/Thumb.jsx";
import { Loading } from "../components/States.jsx";
import "./patterns.css";

const AXES = {
  pc1: { label: "Similarity map — axis 1", get: (s, i, P) => P[i][0] },
  pc2: { label: "Similarity map — axis 2", get: (s, i, P) => P[i][1] },
  light: { label: "Lightness (dark → light)", get: (s) => lightness(s) },
  veining: { label: "Veining", get: (s) => s.traits.veining },
  banding: { label: "Banding", get: (s) => s.traits.banding },
  crystalline: { label: "Crystal grain", get: (s) => s.traits.crystalline },
  speckle: { label: "Speckle", get: (s) => s.traits.speckle },
  pitting: { label: "Pits & hollows", get: (s) => s.traits.pitting },
  gloss: { label: "Gloss", get: (s) => s.traits.gloss },
  waterWear: { label: "Water wear", get: (s) => s.traits.waterWear },
  size: { label: "Size (cm, log)", get: (s) => Math.log(s.dims_cm[0]) },
  flat: { label: "Flatness", get: (s) => 1 - s.dims_cm[2] / s.dims_cm[0] },
};
const PCOL = { vein: "#e9e4da", band: "#c9a35c", rings: "#d2694a", crystal: "#9fb7c9", speck: "#8f8d88", clast: "#a37b5c", pits: "#7fae8a", wrinkle: "#c48bb8", facet: "#86a7c9", sparkle: "#f0d38f", plain: "#5d554b" };
const PLABEL = { vein: "Veins", band: "Bands", rings: "Rings", crystal: "Crystals", speck: "Specks", clast: "Inclusions", pits: "Hollows", wrinkle: "Wrinkles", facet: "Facets", sparkle: "Sparkle", plain: "Plain" };
const SEEK = [["veining", "Veining"], ["banding", "Banding"], ["crystalline", "Crystal grain"], ["speckle", "Speckle"], ["pitting", "Pits & hollows"], ["wrinkling", "Wrinkling"], ["gloss", "Gloss"], ["waterWear", "Water wear"], ["dark", "Darkness"]];

export default function Patterns({ route }) {
  const { catalog } = useCatalog();
  const q = route.query;
  const x = q.get("x") || "pc1", y = q.get("y") || "pc2", focus = q.get("focus") || "";
  const [tab, setTab] = useState(q.get("tab") || "map");
  const [hover, setHover] = useState(null);
  const [seek, setSeek] = useState({ veining: 0.8 });
  const P = useMemo(() => (catalog ? pca2(catalog.specimens.map((s) => s.fv)) : null), [catalog]);

  const pts = useMemo(() => {
    if (!catalog) return [];
    const xs = catalog.specimens.map((s, i) => AXES[x].get(s, i, P)), ys = catalog.specimens.map((s, i) => AXES[y].get(s, i, P));
    const nx = norm(xs), ny = norm(ys);
    return catalog.specimens.map((s, i) => ({ s, px: nx(xs[i]), py: 1 - ny(ys[i]) }));
  }, [catalog, x, y]);

  const focusSpec = catalog && focus ? catalog.byId.get(focus) : null;
  const near = useMemo(() => (focusSpec ? new Set(similarTo(catalog, focusSpec, 8).map((r) => r.s.id)) : null), [focusSpec]);

  const matches = useMemo(() => {
    if (!catalog) return [];
    const keys = Object.keys(seek);
    if (!keys.length) return [];
    return catalog.specimens.map((s) => {
      let d = 0;
      for (const k of keys) { const v = k === "dark" ? 1 - lightness(s) / 100 : s.traits[k]; d += (v - seek[k]) ** 2; }
      return { s, d: Math.sqrt(d / keys.length) };
    }).sort((a, b) => a.d - b.d).slice(0, 12);
  }, [catalog, seek]);

  if (!catalog) return <Loading label="Laying out the patterns…" />;
  const setQ = (patch) => navigate(withQuery("/patterns", { x, y, focus, tab, ...patch }), { replace: true });
  const hv = hover && pts.find((p) => p.s.id === hover);

  return (
    <div className="page patterns">
      <div className="eyebrow">Pattern explorer · 纹理</div>
      <h1 className="h1">Find stones by how they look</h1>
      <p className="lede">The map places every specimen by measured form, colour and pattern, so similar stones sit together. Or describe what you are looking for and let the register answer.</p>

      <div className="tabs" role="tablist" aria-label="Explorer mode">
        <button role="tab" aria-selected={tab === "map"} className="chip" onClick={() => { setTab("map"); setQ({ tab: "map" }); }}>Pattern map</button>
        <button role="tab" aria-selected={tab === "seek"} className="chip" onClick={() => { setTab("seek"); setQ({ tab: "seek" }); }}>Find by traits</button>
      </div>

      {tab === "map" ? (
        <section aria-label="Pattern map">
          <div className="map-controls">
            <div className="field"><label htmlFor="ax">Horizontal axis</label>
              <select id="ax" className="select" value={x} onChange={(e) => setQ({ x: e.target.value })}>{Object.entries(AXES).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}</select></div>
            <div className="field"><label htmlFor="ay">Vertical axis</label>
              <select id="ay" className="select" value={y} onChange={(e) => setQ({ y: e.target.value })}>{Object.entries(AXES).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}</select></div>
            {focusSpec && <button className="btn ghost" onClick={() => setQ({ focus: "" })}>Clear focus ({focus})</button>}
          </div>
          <ul className="map-legend" aria-label="Dominant pattern colours">
            {Object.entries(PLABEL).map(([k, l]) => <li key={k}><i style={{ background: PCOL[k] }} />{l}</li>)}
          </ul>
          <div className="map" role="group" aria-label={`Scatter map of ${pts.length} specimens; ${AXES[x].label} across, ${AXES[y].label} up. Use the trait finder or archive for a keyboard-friendly list.`}>
            <div className="map-axis-x" aria-hidden="true">{AXES[x].label} →</div>
            <div className="map-axis-y" aria-hidden="true">{AXES[y].label} →</div>
            {pts.map(({ s, px, py }) => {
              const dim = near && !near.has(s.id) && s.id !== focus;
              return (
                <a key={s.id} href={"#/specimen/" + s.id} tabIndex={-1} aria-label={`${s.id} ${s.title.en}`} className={"dot" + (s.id === focus ? " focus" : "") + (dim ? " dim" : "")}
                  style={{ left: `${px * 100}%`, top: `${py * 100}%`, "--pc": PCOL[s.pattern] }}
                  onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover(null)} onClick={(e) => { if (e.altKey) { e.preventDefault(); setQ({ focus: s.id }); } }}>
                  <img src={thumbUrl(s.id)} alt="" loading="lazy" width="44" height="44" />
                </a>
              );
            })}
            {hv && (
              <div className="map-tip" style={{ left: `${hv.px * 100}%`, top: `${hv.py * 100}%` }} aria-hidden="true">
                <strong>{hv.s.id}</strong> {hv.s.title.en}<br /><span className="muted">{hv.s.analogName.en} · {PLABEL[hv.s.pattern]}</span>
              </div>
            )}
          </div>
          <p className="muted small-note">Hover to identify a stone, click to open it, Alt-click to highlight it and its nearest neighbours. Axes 1 and 2 of the similarity map are the two strongest directions of variation across all 24 measurements (principal components); they have no single physical meaning.</p>
        </section>
      ) : (
        <section aria-label="Find by traits" className="seek">
          <div className="seek-controls">
            {SEEK.map(([k, l]) => {
              const on = k in seek;
              return (
                <div className="seek-row" key={k}>
                  <label className="seek-check"><input type="checkbox" checked={on} onChange={() => setSeek((s) => { const n = { ...s }; if (on) delete n[k]; else n[k] = 0.7; return n; })} /> {l}</label>
                  <input type="range" min="0" max="1" step="0.05" value={on ? seek[k] : 0.5} disabled={!on} aria-label={`${l} target`}
                    onChange={(e) => setSeek((s) => ({ ...s, [k]: +e.target.value }))} />
                  <output className="muted">{on ? (seek[k] < 0.25 ? "little" : seek[k] < 0.6 ? "some" : "strong") : "any"}</output>
                </div>
              );
            })}
          </div>
          <div>
            <h2 className="h3" aria-live="polite">{Object.keys(seek).length ? `Closest ${matches.length} matches` : "Tick a trait to begin"}</h2>
            <ul className="grid" role="list" style={{ listStyle: "none", padding: 0 }}>
              {matches.map(({ s }) => (
                <li key={s.id}><a className="card" href={"#/specimen/" + s.id}><div className="card-media"><Thumb spec={s} /></div>
                  <div className="card-body"><div className="card-id">{s.id}</div><div className="card-title">{s.title.en}</div><div className="card-meta">{s.analogName.en} · {Object.keys(seek).map((k) => `${k === "dark" ? "darkness" : k} ${(k === "dark" ? 1 - lightness(s) / 100 : s.traits[k]).toFixed(2)}`).slice(0, 2).join(", ")}</div></div></a></li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

function norm(arr) {
  const lo = Math.min(...arr), hi = Math.max(...arr), span = hi - lo || 1;
  return (v) => 0.03 + 0.94 * ((v - lo) / span);
}
