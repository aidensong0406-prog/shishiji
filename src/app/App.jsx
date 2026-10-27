import React, { Suspense, lazy, useEffect } from "react";
import { useRoute } from "./router.js";
import { Header, Footer } from "./components/Chrome.jsx";
import { Loading } from "./components/States.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./styles.css";

const Home = lazy(() => import("./pages/Home.jsx"));
const Archive = lazy(() => import("./pages/Archive.jsx"));
const Specimen = lazy(() => import("./pages/Specimen.jsx"));
const Patterns = lazy(() => import("./pages/Patterns.jsx"));
const Lab = lazy(() => import("./pages/Lab.jsx"));
const Hall = lazy(() => import("./pages/Hall.jsx"));
const NotFound = lazy(() => import("./pages/NotFound.jsx"));

function resolve(path) {
  if (path === "/" || path === "") return { page: Home, key: "home" };
  if (path === "/archive") return { page: Archive, key: "archive" };
  if (path.startsWith("/specimen/")) return { page: Specimen, key: "specimen", id: decodeURIComponent(path.slice(10)) };
  if (path === "/patterns") return { page: Patterns, key: "patterns" };
  if (path === "/lab") return { page: Lab, key: "lab" };
  if (path === "/hall") return { page: Hall, key: "hall", fullscreen: true };
  // dev/verification benches for the hand-study system
  return { page: NotFound, key: "404" };
}

export default function App() {
  const route = useRoute();
  const r = resolve(route.path);
  const Page = r.page;
  useEffect(() => {
    document.body.classList.toggle("lock", !!r.fullscreen);
    if (!r.fullscreen) window.scrollTo(0, 0);
  }, [r.key, r.id]);
  if (r.fullscreen) {
    return (
      <ErrorBoundary resetKey={r.key}>
        <Suspense fallback={<Loading label="Opening the hall…" />}>
          <Page route={route} />
        </Suspense>
      </ErrorBoundary>
    );
  }
  return (
    <>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <Header current={r.key} />
      <main id="main" tabIndex={-1} style={{ outline: "none" }}>
        <ErrorBoundary resetKey={r.key + (r.id || "")}>
          <Suspense fallback={<Loading />}>
            <Page route={route} id={r.id} />
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
    </>
  );
}
