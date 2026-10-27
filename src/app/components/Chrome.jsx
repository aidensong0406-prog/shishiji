import React from "react";

const LINKS = [
  { key: "hall", to: "/hall", en: "Hall", zh: "展厅" },
  { key: "archive", to: "/archive", en: "Archive", zh: "石谱" },
  { key: "patterns", to: "/patterns", en: "Patterns", zh: "纹理" },
];

export function Header({ current }) {
  return (
    <header className="site-header">
      <a className="brand" href="#/" aria-label="拾石记 Shishiji — home">
        <span className="brand-seal" aria-hidden="true">石</span>
        <span>
          <span className="brand-name">拾石记</span>
          <span className="brand-sub">Shishiji · Stone Museum</span>
        </span>
      </a>
      <nav className="nav" aria-label="Primary">
        {LINKS.map((l) => (
          <a key={l.key} href={"#" + l.to} aria-current={current === l.key || (l.key === "archive" && current === "specimen") ? "page" : undefined}>
            <span className="nav-zh" aria-hidden="true">{l.zh}</span>{l.en}
          </a>
        ))}
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <span>拾石记 · Shishiji — a museum of stones.</span>
      <span>Facts describe rock types; readings and hypotheses are labelled as such.</span>
    </footer>
  );
}
