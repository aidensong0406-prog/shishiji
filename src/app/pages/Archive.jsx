import React, { useEffect, useMemo, useState } from "react";
import { useCatalog } from "../catalog.js";
import { navigate, withQuery } from "../router.js";
import Thumb from "../components/Thumb.jsx";
import { Loading, ErrorState } from "../components/States.jsx";
import { toneOf, TONES, lightness } from "../tones.js";
import "./archive.css";

const FEATURES = [
  ["veining", "Veined"], ["banding", "Banded"], ["concentric", "Ringed"], ["crystalline", "Crystalline"], ["speckle", "Speckled"],
  ["clasts", "Inclusions"], ["pitting", "Pitted"], ["wrinkling", "Wrinkled"], ["layering", "Layered"], ["faceting", "Faceted"],
  ["waterWear", "Water-worn"], ["gloss", "Glossy"], ["sparkle", "Sparkling"],
];
const SIZES = [["s", "Hand-size (< 10 cm)", 0, 10], ["m", "Tabletop (10–25 cm)", 10, 25], ["l", "Large (> 25 cm)", 25, 999]];
const SORTS = [["id", "Register order"], ["title", "Title A–Z"], ["big", "Largest first"], ["small", "Smallest first"], ["dark", "Darkest first"], ["light", "Lightest first"], ["veining", "Most veined"], ["banding", "Most banded"], ["gloss", "Glossiest"]];

const list = (q, k) => (q.get(k) ? q.get(k).split(",").filter(Boolean) : []);

export default function Archive({ route }) {
  const { catalog, error } = useCatalog();
  const q = route.query;
  const [text, setText] = useState(q.get("q") || "");
  const [drawer, setDrawer] = useState(false);
  const state = {
    q: q.get("q") || "", cls: list(q, "class"), analog: q.get("analog") || "", family: list(q, "form"), pattern: list(q, "pattern"),
    tone: list(q, "tone"), feat: list(q, "feat"), size: list(q, "size"), sort: q.get("sort") || "id",
  };
  const set = (patch) => {
    const n = { ...state, ...patch };
    navigate(withQuery("/archive", { q: n.q, class: n.cls, analog: n.analog, form: n.family, pattern: n.pattern, tone: n.tone, feat: n.feat, size: n.size, sort: n.sort === "id" ? "" : n.sort }), { replace: true });
  };
  const toggle = (key, v) => set({ [key]: state[key].includes(v) ? state[key].filter((x) => x !== v) : [...state[key], v] });

  // debounce the search box into the URL
  useEffect(() => { const t = setTimeout(() => { if (text !== state.q) set({ q: text }); }, 220); return () => clearTimeout(t); }, [text]);
  useEffect(() => { setText(q.get("q") || ""); }, [q.get("q")]);

  const facets = useMemo(() => {
    if (!catalog) return null;
    const count = (f) => catalog.specimens.reduce((m, s) => { const k = f(s); m[k] = (m[k] || 0) + 1; return m; }, {});
    const analogs = {}; catalog.specimens.forEach((s) => { analogs[s.analog] = analogs[s.analog] || { n: 0, name: s.analogName }; analogs[s.analog].n++; });
    const fams = {}; catalog.specimens.forEach((s) => { fams[s.family] = s.familyName; });
    const classes = {}; catalog.specimens.forEach((s) => { classes[s.class] = s.className; });
    return { analogs, fams, classes, famCount: count((s) => s.family), patCount: count((s) => s.pattern), clsCount: count((s) => s.class), toneCount: count(toneOf) };
  }, [catalog]);

  const results = useMemo(() => {
    if (!catalog) return [];
    const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    let r = catalog.specimens.filter((s) =>
      words.every((w) => s._search.includes(w)) &&
      (!state.cls.length || state.cls.includes(s.class)) &&
      (!state.analog || s.analog === state.analog) &&
      (!state.family.length || state.family.includes(s.family)) &&
      (!state.pattern.length || state.pattern.includes(s.pattern)) &&
      (!state.tone.length || state.tone.includes(toneOf(s))) &&
      state.feat.every((f) => s.traits[f] > 0.5) &&
      (!state.size.length || state.size.some((k) => { const z = SIZES.find((x) => x[0] === k); return s.dims_cm[0] >= z[2] && s.dims_cm[0] < z[3]; })));
    const by = {
      id: (a, b) => a.id.localeCompare(b.id), title: (a, b) => a.title.en.localeCompare(b.title.en),
      big: (a, b) => b.dims_cm[0] - a.dims_cm[0], small: (a, b) => a.dims_cm[0] - b.dims_cm[0],
      dark: (a, b) => lightness(a) - lightness(b), light: (a, b) => lightness(b) - lightness(a),
    }[state.sort] || ((a, b) => b.traits[state.sort] - a.traits[state.sort]);
    return r.slice().sort(by);
  }, [catalog, route]);

  if (error) return <ErrorState title="The archive could not be loaded" detail={String(error.message || error)} action={<button className="btn" onClick={() => location.reload()}>Try again</button>} />;
  if (!catalog) return <Loading label="Opening the register…" />;

  const active = state.q || state.cls.length || state.analog || state.family.length || state.pattern.length || state.tone.length || state.feat.length || state.size.length;
  const PATTERN_LABEL = { vein: "Veins", band: "Bands", rings: "Rings", crystal: "Crystals", speck: "Specks", clast: "Inclusions", pits: "Hollows", wrinkle: "Wrinkles", facet: "Facets", sparkle: "Sparkle", plain: "Plain" };

  return (
    <div className="page archive">
      <header className="arch-head">
        <div>
          <div className="eyebrow">Public archive · 石谱</div>
          <h1 className="h1">The register of {catalog.count} stones</h1>
          <p className="lede">Search by name, rock type, colour or pattern. Every specimen has a permanent ID and its own page with a lighting lab.</p>
        </div>
      </header>

      <div className="arch-bar">
        <div className="search">
          <label htmlFor="arch-q" className="sr-only">Search the archive</label>
          <input id="arch-q" className="input" type="search" placeholder="Search — e.g. vein, jasper, SSJ-0042, 雪脉…" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="field sort">
          <label htmlFor="arch-sort" className="sr-only">Sort</label>
          <select id="arch-sort" className="select" value={state.sort} onChange={(e) => set({ sort: e.target.value })}>
            {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <button className="btn filters-btn" aria-expanded={drawer} aria-controls="arch-filters" onClick={() => setDrawer(!drawer)}>Filters{active ? " •" : ""}</button>
      </div>

      <div className="arch-layout">
        <aside id="arch-filters" className={"filters" + (drawer ? " open" : "")} aria-label="Filters">
          <FilterGroup title="Rock class">
            {Object.entries(facets.classes).map(([k, n]) => <Chip key={k} on={state.cls.includes(k)} onClick={() => toggle("cls", k)} label={n.en} n={facets.clsCount[k]} />)}
          </FilterGroup>
          <FilterGroup title="Rock type">
            <select className="select" aria-label="Rock type" value={state.analog} onChange={(e) => set({ analog: e.target.value })}>
              <option value="">All rock types</option>
              {Object.entries(facets.analogs).sort((a, b) => a[1].name.en.localeCompare(b[1].name.en)).map(([k, v]) => <option key={k} value={k}>{v.name.en} ({v.n})</option>)}
            </select>
          </FilterGroup>
          <FilterGroup title="Colour">
            {TONES.map((t) => facets.toneCount[t.key] ? <Chip key={t.key} on={state.tone.includes(t.key)} onClick={() => toggle("tone", t.key)} label={t.label} n={facets.toneCount[t.key]} swatch={t.hex} /> : null)}
          </FilterGroup>
          <FilterGroup title="Dominant pattern">
            {Object.keys(PATTERN_LABEL).map((k) => facets.patCount[k] ? <Chip key={k} on={state.pattern.includes(k)} onClick={() => toggle("pattern", k)} label={PATTERN_LABEL[k]} n={facets.patCount[k]} /> : null)}
          </FilterGroup>
          <FilterGroup title="Has feature">
            {FEATURES.map(([k, l]) => <Chip key={k} on={state.feat.includes(k)} onClick={() => toggle("feat", k)} label={l} />)}
          </FilterGroup>
          <FilterGroup title="Form">
            {Object.entries(facets.fams).map(([k, n]) => <Chip key={k} on={state.family.includes(k)} onClick={() => toggle("family", k)} label={n.en} n={facets.famCount[k]} />)}
          </FilterGroup>
          <FilterGroup title="Size">
            {SIZES.map(([k, l]) => <Chip key={k} on={state.size.includes(k)} onClick={() => toggle("size", k)} label={l} />)}
          </FilterGroup>
          {active ? <button className="btn ghost clear" onClick={() => { setText(""); navigate("/archive", { replace: true }); }}>Clear all filters</button> : null}
        </aside>

        <section className="results" aria-labelledby="res-h">
          <h2 id="res-h" className="res-count" aria-live="polite">{results.length === catalog.count ? `All ${results.length} specimens` : `${results.length} of ${catalog.count} specimens`}</h2>
          {results.length ? (
            <ul className="grid res-grid" role="list">
              {results.map((s) => (
                <li key={s.id}>
                  <a className="card" href={"#/specimen/" + s.id}>
                    <div className="card-media"><Thumb spec={s} /></div>
                    <div className="card-body">
                      <div className="card-id">{s.id}</div>
                      <div className="card-title">{s.title.en}<span className="zh" lang="zh">{s.title.zh}</span></div>
                      <div className="card-meta">{s.analogName.en} · {s.dims_cm[0]} cm</div>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="state">
              <div className="h2">No stones match</div>
              <p className="muted">Try removing a filter or searching for a broader term.</p>
              <button className="btn" onClick={() => { setText(""); navigate("/archive", { replace: true }); }}>Clear all filters</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }) {
  return (
    <fieldset className="fgroup">
      <legend className="h3">{title}</legend>
      <div className="fchips">{children}</div>
    </fieldset>
  );
}
function Chip({ on, onClick, label, n, swatch }) {
  return (
    <button type="button" className="chip" aria-pressed={on} onClick={onClick}>
      {swatch && <span className="swatch" style={{ background: swatch }} aria-hidden="true" />}
      {label}{n != null && <span className="muted"> {n}</span>}
    </button>
  );
}
