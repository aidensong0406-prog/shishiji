import React from "react";

export function Loading({ label = "Loading…" }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <div>{label}</div>
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", detail, action }) {
  return (
    <div className="state" role="alert">
      <div className="h2">{title}</div>
      {detail && <p className="muted">{detail}</p>}
      {action}
    </div>
  );
}

export function Badge({ kind }) {
  const L = { fact: "Fact · rock type", observation: "Observation", hypothesis: "Hypothesis", interpretation: "Interpretation" };
  return <span className={`badge ${kind}`} title={TIPS[kind]}>{L[kind] || kind}</span>;
}
const TIPS = {
  fact: "A general, well-established statement about the rock type — not a claim about this specimen.",
  observation: "A measurable property of the specimen: size, colour, pattern.",
  hypothesis: "What the pattern suggests about how the stone may have formed. Conditional, not established.",
  interpretation: "An aesthetic or cultural reading. A way of looking, not a fact.",
};
