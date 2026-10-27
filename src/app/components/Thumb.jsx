import React, { useState } from "react";
import { thumbUrl } from "../catalog.js";

/** Pre-rendered specimen still (public/thumbs). Falls back to a colour swatch if missing. */
export default function Thumb({ spec, size, alt }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    const c = spec.colours;
    return <div className="thumb-fallback" role="img" aria-label={alt ?? spec.title.en}
      style={{ background: `radial-gradient(circle at 45% 40%, ${c.base.hex} 0 32%, ${c.second.hex} 33% 46%, transparent 47%)` }} />;
  }
  return <img src={thumbUrl(spec.id)} alt={alt ?? `${spec.title.en} — ${spec.analogName.en}, ${spec.familyName.en.toLowerCase()}`}
    loading="lazy" decoding="async" width={size || 360} height={size || 360} onError={() => setFailed(true)} />;
}
