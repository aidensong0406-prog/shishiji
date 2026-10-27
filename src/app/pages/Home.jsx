import React, { useEffect, useMemo, useRef, useState } from "react";
import { useCatalog } from "../catalog.js";
import Viewer from "../components/Viewer.jsx";
import Thumb from "../components/Thumb.jsx";
import { Badge, Loading } from "../components/States.jsx";
import "./home.css";

const COLLECTIONS = [
  { key: "veins", title: "Quartz-veined river pebbles", zh: "石英脉卵石", href: "/archive?analog=greywacke", pick: (s) => s.analog === "greywacke" },
  { key: "scholar", title: "Scholar's-rock forms", zh: "供石", href: "/archive?class=scholar", pick: (s) => s.class === "scholar" },
  { key: "rings", title: "Rings & concentric bands", zh: "环纹", href: "/archive?pattern=rings", pick: (s) => s.pattern === "rings" },
  { key: "crystal", title: "Crystal grain", zh: "晶粒", href: "/archive?feat=crystalline", pick: (s) => s.traits.crystalline > 0.5 },
];

/** Deterministic "stone of the day" so the hero changes daily but is shareable. */
function stoneOfDay(specimens) {
  const d = new Date();
  const k = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate();
  const pool = specimens.filter((s) => s.traits.veining > 0.6 || s.traits.banding > 0.6 || s.class === "scholar");
  return pool[(k * 2654435761) % pool.length >>> 0] || specimens[0];
}

export default function Home() {
  const { catalog } = useCatalog();
  const [sc, setSc] = useState(null);
  const hero = useMemo(() => (catalog ? stoneOfDay(catalog.specimens) : null), [catalog]);
  const ref = useRef(null);
  useEffect(() => {
    if (!sc) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    sc.setLight({ azimuth: 50, elevation: 30, intensity: 2.2, angle: 30, penumbra: 0.7, ambient: 0.22 });
    if (!reduce) sc.setTurntable(true);
    sc.controls && (sc.controls.enableZoom = false);
  }, [sc]);

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">A museum of 320 stones · 三百二十石</div>
          <h1 className="hero-title">
            <span className="zh" lang="zh">拾石记</span>
            <span className="hero-en">The record of picked-up stones</span>
          </h1>
          <p className="lede">Walk a lamplit hall, then take any stone to the bench: turn it, move the light around it, wet its surface, and watch veins, grain and hollows appear.</p>
          <div className="hero-ctas">
            <a className="btn primary" href="#/hall">Enter the hall</a>
            <a className="btn" href="#/archive">Browse the archive</a>
            <a className="btn ghost" href="#/patterns">Explore patterns</a>
          </div>
          <dl className="stats">
            <div><dt>Specimens</dt><dd>{catalog ? catalog.count : "320"}</dd></div>
            <div><dt>Rock types</dt><dd>25</dd></div>
            <div><dt>Light controls per stone</dt><dd>9</dd></div>
          </dl>
        </div>
        <div className="hero-stage">
          {hero ? (
            <>
              <Viewer ref={ref} spec={hero} level={6} onReady={setSc} label={`Stone of the day: ${hero.title.en}. Drag to turn it.`}
                fallback={<Thumb spec={hero} size={520} />} />
              <a className="hero-caption" href={"#/specimen/" + hero.id}>
                <span className="eyebrow">Stone of the day</span>
                <span className="hc-title">{hero.title.en} <span className="zh muted">{hero.title.zh}</span></span>
                <span className="muted">{hero.id} · {hero.analogName.en} — open in the lighting lab →</span>
              </a>
            </>
          ) : <Loading />}
        </div>
      </section>

      <section className="page collections" aria-labelledby="col-h">
        <h2 id="col-h" className="h2">From the collection</h2>
        {catalog ? COLLECTIONS.map((c) => {
          const list = catalog.specimens.filter(c.pick);
          return (
            <div className="col-row" key={c.key}>
              <div className="col-head">
                <h3 className="col-title">{c.title} <span className="zh muted">{c.zh}</span></h3>
                <a href={"#" + c.href}>All {list.length} →</a>
              </div>
              <ul className="col-strip" role="list">
                {list.slice(0, 6).map((s) => (
                  <li key={s.id}><a className="card" href={"#/specimen/" + s.id}><div className="card-media"><Thumb spec={s} /></div>
                    <div className="card-body"><div className="card-id">{s.id}</div><div className="card-title">{s.title.en}</div></div></a></li>
                ))}
              </ul>
            </div>
          );
        }) : <Loading />}
      </section>

      <section className="page legend" aria-labelledby="leg-h">
        <h2 id="leg-h" className="h2">How to read a label</h2>
        <p className="lede">Every sentence in the museum says what kind of claim it is.</p>
        <ul className="legend-grid" role="list">
          <li><Badge kind="observation" /><p>Measured from the stone itself: size, colours, how veined or banded it is.</p></li>
          <li><Badge kind="fact" /><p>Well-established, general knowledge about the rock type — never a claim about one specimen.</p></li>
          <li><Badge kind="hypothesis" /><p>What a pattern suggests about how the stone may have formed. Conditional, never certain.</p></li>
          <li><Badge kind="interpretation" /><p>Aesthetic and cultural readings in the scholar's-rock tradition — a way of looking.</p></li>
        </ul>
      </section>
    </div>
  );
}
