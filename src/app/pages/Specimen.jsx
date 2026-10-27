import React, { useEffect, useMemo, useRef, useState } from "react";
import { useCatalog, similarTo } from "../catalog.js";
import Viewer from "../components/Viewer.jsx";
import LightingLab from "../components/LightingLab.jsx";
import Thumb from "../components/Thumb.jsx";
import { Badge, Loading, ErrorState } from "../components/States.jsx";
import { navigate } from "../router.js";
import "./specimen.css";

const TRAIT_LABELS = {
  veining: "Veining", banding: "Banding", concentric: "Concentric rings", crystalline: "Crystal grain", speckle: "Speckle",
  clasts: "Inclusions", sparkle: "Sparkle", pitting: "Pits & hollows", faceting: "Fracture faces", waterWear: "Water wear",
  gloss: "Gloss", wrinkling: "Wrinkling", layering: "Stepped layers",
};

function Note({ item }) {
  return (
    <p className="note">
      <Badge kind={item.kind} /> <span>{item.text}</span>
    </p>
  );
}

export default function Specimen({ id }) {
  const { catalog, error } = useCatalog();
  const scene = useRef(null);
  const [sc, setSc] = useState(null);
  const spec = catalog && catalog.byId.get(id);
  const idx = spec ? catalog.specimens.indexOf(spec) : -1;
  const prev = idx > 0 ? catalog.specimens[idx - 1] : null;
  const next = catalog && idx >= 0 && idx < catalog.specimens.length - 1 ? catalog.specimens[idx + 1] : null;
  const similar = useMemo(() => (spec ? similarTo(catalog, spec, 8) : []), [spec]);

  useEffect(() => { if (spec) document.title = `${spec.id} ${spec.title.en} · 拾石记`; return () => { document.title = "拾石记 · Shishiji Stone Museum"; }; }, [spec]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest && e.target.closest("input, textarea, select, [role=slider], [role=application]")) return;
      if (e.key === "[" && prev) navigate("/specimen/" + prev.id);
      if (e.key === "]" && next) navigate("/specimen/" + next.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next]);

  if (error) return <ErrorState title="The archive could not be loaded" detail={String(error.message || error)} action={<button className="btn" onClick={() => location.reload()}>Try again</button>} />;
  if (!catalog) return <Loading label="Opening the register…" />;
  if (!spec) return <ErrorState title={`No specimen “${id}”`} detail="Specimen IDs run from SSJ-0001 to SSJ-0320." action={<a className="btn" href="#/archive">Browse the archive</a>} />;

  const n = spec.notes;
  const views = [["three-quarter", "¾"], ["front", "Front"], ["side", "Side"], ["top", "Top"], ["low", "Low"]];
  return (
    <div className="page specimen">
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href="#/archive">Archive</a> <span aria-hidden="true">/</span> <span aria-current="page">{spec.id}</span>
        <span className="crumb-nav">
          {prev ? <a className="btn ghost" href={"#/specimen/" + prev.id} aria-label={`Previous specimen ${prev.id}`}>← {prev.id}</a> : null}
          {next ? <a className="btn ghost" href={"#/specimen/" + next.id} aria-label={`Next specimen ${next.id}`}>{next.id} →</a> : null}
        </span>
      </nav>

      <div className="sp-layout">
        <div className="sp-left">
          <section className="sp-stage" aria-label={`3D view of ${spec.title.en}`}>
            <Viewer ref={scene} spec={spec} label={`Interactive view of ${spec.title.en}. Drag or use arrow keys to orbit, plus and minus to zoom, 0 to reset. Double-click a point to inspect it closely.`}
              onReady={(s) => setSc(s)}
              fallback={<div className="sp-fallback"><Thumb spec={spec} size={480} /><p>3D viewing needs WebGL. Showing a still image.</p></div>} />
            <div className="stage-views" role="group" aria-label="Camera views">
              {views.map(([v, l]) => <button key={v} className="chip" onClick={() => sc && sc.frame(v)}>{l}</button>)}
            </div>
            <p className="stage-hint">Drag to orbit · scroll or pinch to zoom · double-click to inspect a point · arrow keys when focused</p>
          </section>
          <LightingLab scene={sc} specId={spec.id} />
        </div>

        <article className="sp-info" aria-labelledby="sp-title">
          <div className="eyebrow">{spec.id} · {spec.className.en}</div>
          <h1 id="sp-title" className="h1 sp-title">{spec.title.en}</h1>
          <div className="sp-zh zh" lang="zh">{spec.title.zh}</div>

          <dl className="facts">
            <div><dt>Rock type</dt><dd>{spec.analogName.en} <span className="zh muted">{spec.analogName.zh}</span></dd></div>
            <div><dt>Form</dt><dd>{spec.familyName.en} <span className="zh muted">{spec.familyName.zh}</span></dd></div>
            <div><dt>Size</dt><dd>{spec.dims_cm.join(" × ")} cm</dd></div>
            <div><dt>Colours</dt><dd className="swatches">{["base", "second", "vein", "accent", "dark"].map((k, i, arr) => {
              const c = spec.colours[k];
              const first = arr.findIndex((kk) => spec.colours[kk].name === c.name) === i;
              return <span key={k} className="sw" title={`${c.name} ${c.hex}`}><i style={{ background: c.hex }} />{first && i < 2 ? c.name : null}<span className="sr-only">{!(first && i < 2) ? c.name : ""}</span></span>;
            })}</dd></div>
          </dl>

          <section className="sec"><h2 className="h3">Observation</h2><Note item={n.observation} /></section>
          <section className="sec">
            <h2 className="h3">Visual traits <span className="muted small">(measured from the stone)</span></h2>
            <ul className="traits">
              {Object.entries(spec.traits).filter(([, v]) => v > 0.05).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <li key={k}><span>{TRAIT_LABELS[k]}</span><span className="bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={TRAIT_LABELS[k]}><i style={{ width: `${v * 100}%` }} /></span></li>
              ))}
            </ul>
          </section>
          <section className="sec"><h2 className="h3">Geology of the rock type</h2>{n.geology.map((g, i) => <Note key={i} item={g} />)}</section>
          <section className="sec"><h2 className="h3">How it may have formed</h2>{n.hypotheses.map((g, i) => <Note key={i} item={g} />)}</section>
          <section className="sec"><h2 className="h3">A reading</h2><Note item={n.interpretation} /></section>
          <section className="sec"><h2 className="h3">Cultural context</h2>{n.culture.map((g, i) => <Note key={i} item={g} />)}</section>
          <section className="sec">
            <h2 className="h3">Tags</h2>
            <div className="tags">{spec.tags.map((t) => <a key={t} className="chip" href={`#/archive?q=${encodeURIComponent(t)}`}>{t}</a>)}</div>
          </section>
        </article>
      </div>

      <section className="sec similar" aria-labelledby="sim-h">
        <h2 id="sim-h" className="h2">Similar patterns <span className="zh muted">相似纹理</span></h2>
        <p className="muted">Nearest neighbours in a feature space of form, colour and pattern measurements. <a href={`#/patterns?focus=${spec.id}`}>See it on the pattern map →</a></p>
        <div className="grid">
          {similar.map(({ s, d }) => (
            <a key={s.id} className="card" href={"#/specimen/" + s.id}>
              <div className="card-media"><Thumb spec={s} /></div>
              <div className="card-body">
                <div className="card-id">{s.id} <span className="muted">· {Math.round(Math.max(0, 1 - d / 3) * 100)}% alike</span></div>
                <div className="card-title">{s.title.en}<span className="zh">{s.title.zh}</span></div>
              </div>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
