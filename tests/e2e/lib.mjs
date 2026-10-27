// Shared headless-Chrome helpers (puppeteer-core + the system Chrome).
import puppeteer from "puppeteer-core";

export const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const BASE = process.env.BASE_URL || "http://localhost:5173/";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch() {
  return puppeteer.launch({
    executablePath: CHROME, headless: "new",
    args: ["--no-sandbox", "--use-gl=angle", "--use-angle=metal", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
  });
}

/** Open a page and collect console errors / page errors / failed requests. */
export async function openPage(browser, hash, { width = 1440, height = 900, dpr = 1, mobile = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  const log = { errors: [], warnings: [], failed: [] };
  page.on("pageerror", (e) => log.errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error") log.errors.push(t.slice(0, 300));
    else if (m.type() === "warning") log.warnings.push(t.slice(0, 200));
  });
  page.on("requestfailed", (r) => log.failed.push(r.url() + " " + (r.failure() && r.failure().errorText)));
  if (process.env.HALL_QUALITY) await page.evaluateOnNewDocument((q) => { try { localStorage.setItem("gallery:quality", q); localStorage.setItem("shishiji:gallery:helpseen", "1"); } catch {} }, process.env.HALL_QUALITY);
  await page.goto(BASE + (hash ? "#" + hash : ""), { waitUntil: "domcontentloaded", timeout: 60000 });
  return { page, log };
}

/** Frames rendered per second by the page's rAF loop over `ms`. */
export const measureFps = (page, ms = 2000) => page.evaluate((ms) => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(Math.round((n * 1000) / (performance.now() - t0))); };
  requestAnimationFrame(f);
}), ms);
