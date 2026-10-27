import React, { useMemo } from "react";
import RiverStoneGallery from "../../RiverStoneGallery.jsx";
import { useCatalog } from "../catalog.js";
import { navigate } from "../router.js";
import { Loading, ErrorState } from "../components/States.jsx";
import { SLOT_POS } from "../../three/constants.js";

/** One showpiece per rock type (the most strongly patterned of each), then the
    next most patterned specimens overall until every vitrine (hall and courtyard) is filled. */
function pickFeatured(specimens, n = SLOT_POS.length) {
  const best = new Map();
  for (const s of specimens) {
    const t = s.traits;
    const score = t.veining + t.banding + t.crystalline + t.clasts + t.pitting + t.wrinkling + t.layering * 0.5 + t.gloss * 0.3;
    const cur = best.get(s.analog);
    if (!cur || score > cur.score) best.set(s.analog, { s, score });
  }
  const first = [...best.values()].sort((a, b) => b.score - a.score).map((x) => x.s);
  const used = new Set(first.map((s) => s.id));
  const score = (s) => { const t = s.traits; return t.veining + t.banding + t.crystalline + t.clasts + t.pitting + t.wrinkling + t.layering * 0.5 + t.gloss * 0.3; };
  const rest = specimens.filter((s) => !used.has(s.id)).sort((a, b) => score(b) - score(a));
  return [...first, ...rest].slice(0, n);
}

export default function Hall() {
  const { catalog, error } = useCatalog();
  const featured = useMemo(() => (catalog ? pickFeatured(catalog.specimens) : []), [catalog]);
  if (error) return <ErrorState title="The hall could not open" detail={String(error.message || error)} />;
  if (!catalog) return <Loading label="Opening the hall…" />;
  return (
    <RiverStoneGallery
      featured={featured}
      cabinet={catalog.specimens}
      exitHref="#/"
      onOpenSpecimen={(id) => navigate("/specimen/" + id)}
    />
  );
}
