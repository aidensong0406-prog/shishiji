// Catalog access: lazy-loaded once, then indexed for search and similarity.
import { useEffect, useState } from "react";
import { featureDistance } from "../catalog/similarity.js";

let promise = null;
export function loadCatalog() {
  if (!promise) {
    promise = import("../data/catalog.json").then((m) => {
      const data = m.default || m;
      const byId = new Map(data.specimens.map((s) => [s.id, s]));
      for (const s of data.specimens) {
        s._search = [s.id, s.title.en, s.title.zh, s.analogName.en, s.analogName.zh, s.familyName.en, s.familyName.zh, s.className.en,
          ...Object.values(s.colours).map((c) => c.name), s.pattern, ...s.tags, s.notes.observation.text].join(" ").toLowerCase();
      }
      return { ...data, byId };
    });
  }
  return promise;
}

export function useCatalog() {
  const [state, setState] = useState({ catalog: null, error: null });
  useEffect(() => {
    let live = true;
    loadCatalog().then((catalog) => live && setState({ catalog, error: null }), (error) => live && setState({ catalog: null, error }));
    return () => { live = false; };
  }, []);
  return state;
}

export function similarTo(catalog, spec, k = 8) {
  return catalog.specimens
    .filter((s) => s.id !== spec.id)
    .map((s) => ({ s, d: featureDistance(s.fv, spec.fv) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k);
}

export const thumbUrl = (id) => `${import.meta.env.BASE_URL}thumbs/${id}.webp`;
