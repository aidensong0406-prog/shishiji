// Minimal hash router: works on any static host, deep links are shareable.
import { useEffect, useState } from "react";

export function parseHash() {
  const raw = (typeof location !== "undefined" ? location.hash : "").replace(/^#/, "") || "/";
  const [path, qs] = raw.split("?");
  return { path: path.startsWith("/") ? path : "/" + path, query: new URLSearchParams(qs || "") };
}

export function useRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function navigate(to, { replace = false } = {}) {
  const url = "#" + to;
  if (replace) {
    history.replaceState(null, "", url);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    location.hash = to;
  }
}

/** Build "/archive?q=x" from a path and a params object (empty values dropped). */
export function withQuery(path, params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== "" && v != null && !(Array.isArray(v) && !v.length)) q.set(k, Array.isArray(v) ? v.join(",") : v);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
