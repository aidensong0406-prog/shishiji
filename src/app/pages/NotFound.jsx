import React from "react";
export default function NotFound() {
  return (
    <div className="page state" style={{ minHeight: "50vh" }}>
      <div className="eyebrow">404</div>
      <h1 className="h1">This room is empty</h1>
      <p className="muted">The page you asked for is not in the museum.</p>
      <p><a className="btn primary" href="#/">Return to the entrance</a> <a className="btn" href="#/archive">Browse the archive</a></p>
    </div>
  );
}
