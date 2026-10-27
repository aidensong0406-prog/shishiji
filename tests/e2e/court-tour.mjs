// Screenshot the courtyard from fixed viewpoints. node tests/e2e/court-tour.mjs outDir [quality]
import { mkdirSync } from "node:fs";
import { launch, sleep, measureFps } from "./lib.mjs";
const out = process.argv[2] || "artifacts/court"; const q = process.argv[3] || "medium";
mkdirSync(out, { recursive: true });
const b = await launch(); const page = await b.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.evaluateOnNewDocument((q) => { localStorage.setItem("gallery:quality", q); localStorage.setItem("shishiji:gallery:helpseen", "1"); }, q);
await page.goto((process.env.BASE_URL || "http://localhost:5173/") + "#/hall");
await page.waitForFunction(() => window.__av && window.__hallTeleport && !document.body.innerText.includes("LIGHTING THE LAMPS"), { timeout: 90000 });
await sleep(3000);
const views = [
  ["01_gate_in", 19.5, 0.0, -Math.PI / 2, 0.02],
  ["02_mid_east", 26, 2.5, -Math.PI / 2 + 0.25, 0.06],
  ["03_pavilion", 34, -2.5, -Math.PI / 2 - 0.35, 0.12],
  ["04_north", 28, 6, 0.6, 0.0],
  ["05_back_to_hall", 34, 0.5, Math.PI / 2, 0.04],
  ["06_sky", 26, 0, -Math.PI / 2, 0.55],
];
const log = [];
for (const [n, x, z, yaw, pitch] of views) {
  await page.evaluate((x, z, yaw, pitch) => window.__hallTeleport(x, z, yaw, pitch), x, z, yaw, pitch);
  await sleep(1500);
  const fps = await measureFps(page, 1500);
  await page.screenshot({ path: `${out}/${n}.png` }); log.push([n, fps]);
}
console.log(JSON.stringify(log));
await b.close();
