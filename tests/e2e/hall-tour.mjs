// Walk the hall headlessly and capture screenshots + fps at key spots.
// node tests/e2e/hall-tour.mjs [outDir] [quality]
import { mkdirSync } from "node:fs";
import { launch, openPage, sleep, measureFps } from "./lib.mjs";

const out = process.argv[2] || "artifacts/hall";
const quality = process.argv[3] || "high";
mkdirSync(out, { recursive: true });
const b = await launch();
const page = await b.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror " + e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
await page.evaluateOnNewDocument((q) => { try { localStorage.setItem("gallery:quality", q); localStorage.setItem("shishiji:gallery:helpseen", "1"); } catch {} }, quality);
await page.goto((process.env.BASE_URL || "http://localhost:5173/") + "#/hall", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__av && !document.body.innerText.includes("LIGHTING THE LAMPS"), { timeout: 90000 });
await page.waitForFunction(() => window.__hallCabinets >= 300, { timeout: 90000 }).catch(() => {});
await sleep(2500);

let yaw = -Math.PI / 2;
const pose = () => page.evaluate(() => window.__av);
const tap = async (k, ms) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(70); };
const keyFor = (vx, vz) => { const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const c = { KeyW: fx * vx + fz * vz, KeyS: -(fx * vx + fz * vz), KeyD: rx * vx + rz * vz, KeyA: -(rx * vx + rz * vz) };
  return Object.keys(c).sort((a, b) => c[b] - c[a])[0]; };
const goTo = async (tx, tz, tol = 0.5) => { for (let i = 0; i < 70; i++) { const a = await pose(); const vx = tx - a.x, vz = tz - a.z; const d = Math.hypot(vx, vz); if (d < tol) return; await tap(keyFor(vx, vz), Math.min(320, 60 + d * 120)); } };
const face = async (target, pitchPx = 0) => { let d = target - yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  const px = -d / 0.0045; await page.mouse.move(800, 600); await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(800 + (px * i) / 20, 600 + (pitchPx * i) / 20);
  await page.mouse.up(); yaw = target; await sleep(400); };
const log = [];
const shot = async (name) => { await sleep(900); const fps = await measureFps(page, 1500); const a = await pose();
  await page.screenshot({ path: `${out}/${name}.png` }); log.push({ name, fps, at: [a.x, a.y, a.z].map((v) => +v.toFixed(1)) }); };

await shot("01_spawn");
await goTo(-12.6, -3.9, 0.4); await face(0); await shot("02_vitrine");
await page.keyboard.press("KeyR"); await sleep(2400); await shot("03_inspect"); await page.keyboard.press("KeyR"); await sleep(900);
await goTo(-3.2, 3); await goTo(5, 3); await face(-Math.PI / 2); await shot("04_east_hall");
await goTo(0, 2.2, 0.3); await face(0);
for (let i = 0; i < 30; i++) { const a = await pose(); if (a.y > 4.6 && a.z < -4.6) break; await tap("KeyW", 260); }
await goTo(-7.5, -9.4, 0.4); await face(0, 60); await shot("05_cabinet");
await page.keyboard.press("KeyE"); await sleep(1200); await shot("06_cabinet_browser"); await page.keyboard.press("Escape"); await sleep(500);
await face(Math.PI * 0.6, -60); await shot("07_upper_gallery");
// storey 2 → 3 by the west flight (foot at x = -8.4, climbing west)
await page.evaluate(() => window.__hallTeleport(-7.6, 0, Math.PI / 2, 0, 1)); yaw = Math.PI / 2; await sleep(300);   // foot of the west flight (the climb itself is walked)
for (let i = 0; i < 40; i++) { const a = await pose(); if (a.y > 9.6 && a.x < -13.4) break; await tap("KeyW", 260); }
await goTo(-15.4, 4.5, 0.4); await face(Math.PI, -40); await shot("07b_storey3");
await goTo(-15.2, 0, 0.3); await face(-Math.PI / 2);   // top of the west flight, facing down it
for (let i = 0; i < 40; i++) { const a = await pose(); if (a.y < 5.1 && a.x > -8.2) break; await tap("KeyW", 260); }
await goTo(-8, -5, 0.4); await face(Math.PI); await goTo(0, -4.4, 0.3);
for (let i = 0; i < 30; i++) { const a = await pose(); if (a.y < 0.2 && a.z > 1.3) break; await tap("KeyW", 260); }
await goTo(10, 3); await goTo(16.2, 0, 0.4); await face(-Math.PI / 2); await shot("08_moon_gate");
await goTo(24, 0); await shot("09_courtyard");
await face(Math.PI / 2); await shot("10_courtyard_to_hall");
const lights = await page.evaluate(() => window.__hallLights || null);
await b.close();
console.log(JSON.stringify({ quality, log, lights, errors: errs.slice(0, 10) }, null, 1));
