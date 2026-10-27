// Dev / verification page: renders a contact sheet of catalog specimens.
// Used by scripts (thumbnails, visual review). #/lab?from=0&to=48&size=200
import React, { useEffect, useRef, useState } from "react";
import { useCatalog } from "../catalog.js";
import { createThumbRenderer } from "../../stones/thumbs.js";

export default function Lab({ route }) {
  const { catalog } = useCatalog();
  const from = +route.query.get("from") || 0;
  const to = +route.query.get("to") || 48;
  const size = +route.query.get("size") || 200;
  const [shots, setShots] = useState([]);
  const done = useRef(false);
  // export mode: expose a render function for scripts/render-thumbs.mjs
  useEffect(() => {
    if (!catalog || route.query.get("export") !== "1") return;
    const tr = createThumbRenderer(size);
    tr.ready.then(() => {
      window.__thumbAPI = { ids: catalog.specimens.map((s) => s.id), render: (id) => tr.render(catalog.byId.get(id), "image/webp", 0.84) };
    });
    return () => tr.dispose();
  }, [catalog]);
  useEffect(() => {
    if (!catalog || done.current || route.query.get("export") === "1") return;
    done.current = true;
    const tr = createThumbRenderer(size);
    let live = true;
    tr.ready.then(async () => {
      const list = catalog.specimens.slice(from, to);
      const out = [];
      for (const s of list) {
        if (!live) break;
        out.push({ s, url: tr.render(s, "image/jpeg", 0.9) });
        if (out.length % 8 === 0) { setShots([...out]); await new Promise((r) => setTimeout(r, 0)); }
      }
      setShots(out);
      window.__labDone = true;
      tr.dispose();
    });
    return () => { live = false; };
  }, [catalog]);
  return (
    <div className="page" style={{ maxWidth: "none" }}>
      <div className="eyebrow">Lab · contact sheet {from}–{to}</div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))`, gap: 6, marginTop: 12 }}>
        {shots.map(({ s, url }) => (
          <figure key={s.id} style={{ margin: 0, background: "#16130f" }}>
            <img src={url} alt={s.title.en} width={size} height={size} />
            <figcaption style={{ fontSize: 10, padding: "2px 4px", color: "#bbb" }}>{s.id} · {s.analog} · {s.family}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
