// End-to-end suite (headless Chrome via puppeteer-core). Needs a running server:
//   npm run dev   (or: npm run build && npm run preview -- --port 5173)
//   npm run e2e            → all tests     |  npm run e2e -- archive  → name filter
import { writeFileSync, mkdirSync } from "node:fs";
import { launch, BASE, sleep, measureFps } from "./lib.mjs";

const filter = process.argv[2] || "";
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const catalog = JSON.parse((await import("node:fs")).readFileSync(new URL("../../src/data/catalog.json", import.meta.url)));

async function open(browser, hash, { width = 1440, height = 900, mobile = false, quality } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  if (quality) await page.evaluateOnNewDocument((q) => { localStorage.setItem("gallery:quality", q); localStorage.setItem("shishiji:gallery:helpseen", "1"); }, quality);
  else await page.evaluateOnNewDocument(() => { try { localStorage.setItem("shishiji:gallery:helpseen", "1"); } catch {} });
  await page.goto(BASE + "#" + hash, { waitUntil: "domcontentloaded" });
  return { page, errors };
}
const text = (page) => page.evaluate(() => document.body.innerText);
const waitText = (page, t, timeout = 20000) => page.waitForFunction((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), { timeout }, t);
const waitViewer = (page) => page.waitForFunction(() => window.__stoneScene && window.__stoneScene.stone && !document.querySelector(".viewer-veil"), { timeout: 30000 });

/** Mean luminance / R-B ratio of the stone region of a fresh viewer render. */
const stats = (page) => page.evaluate(async () => {
  const sc = window.__stoneScene;
  const url = sc.capture("image/png");
  const img = new Image(); img.src = url; await img.decode();
  const c = document.createElement("canvas"); c.width = 160; c.height = 120;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0, 160, 120);
  const d = g.getImageData(40, 25, 80, 70).data;
  let L = 0, R = 0, B = 0, n = d.length / 4; const lum = [];
  for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; L += l; R += d[i]; B += d[i + 2]; lum.push(l); }
  const mean = L / n; const sd = Math.sqrt(lum.reduce((s, x) => s + (x - mean) ** 2, 0) / n);
  return { mean, sd, rb: R / Math.max(1, B), sig: Array.from(d.filter((_, i) => i % 37 === 0)) };
});
const diff = (a, b) => { let s = 0; for (let i = 0; i < Math.min(a.sig.length, b.sig.length); i++) s += Math.abs(a.sig[i] - b.sig[i]); return s / a.sig.length; };
async function setRange(page, id, value) {
  await page.evaluate((id, value) => {
    const el = document.getElementById(id);
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(el, String(value)); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
  }, id, value);
  await sleep(250);
}
const clickText = (page, sel, t) => page.evaluate((sel, t) => { const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(t)); if (!el) return false; el.click(); return true; }, sel, t);

const perf = {};

/* ---------------- routes ---------------- */
for (const [hash, expect] of [["/", "拾石记"], ["/archive", "The register of 320 stones"], ["/specimen/SSJ-0001", catalog.specimens[0].title.en], ["/specimen/SSJ-0320", catalog.specimens[319].title.en], ["/patterns", "Find stones by how they look"], ["/patterns?tab=seek", "Closest 12 matches"]]) {
  test(`route ${hash} renders without errors`, async (b) => {
    const { page, errors } = await open(b, hash);
    await waitText(page, expect);
    await sleep(1500);
    assert(!errors.length, "console errors: " + errors.join(" | "));
  });
}
test("unknown route shows the 404 room", async (b) => {
  const { page } = await open(b, "/no-such-room"); await waitText(page, "This room is empty");
});
test("unknown specimen ID shows a helpful error", async (b) => {
  const { page } = await open(b, "/specimen/SSJ-9999"); await waitText(page, "No specimen");
  assert((await text(page)).includes("SSJ-0001 to SSJ-0320"), "range hint missing");
});

/* ---------------- archive ---------------- */
test("archive: search narrows results and matches", async (b) => {
  const { page } = await open(b, "/archive");
  await waitText(page, "All 320 specimens");
  await page.type("#arch-q", "jasper");
  await page.waitForFunction(() => /\d+ of 320 specimens/.test(document.body.innerText), { timeout: 5000 });
  const r = await page.evaluate(() => ({ count: document.querySelector(".res-count").textContent, metas: [...document.querySelectorAll(".res-grid .card-meta")].slice(0, 12).map((e) => e.textContent) }));
  const expected = catalog.specimens.filter((s) => JSON.stringify([s.id, s.title, s.analogName, s.tags, s.notes.observation.text]).toLowerCase().includes("jasper")).length;
  assert(r.metas.length > 0 && r.metas.every((m) => /jasper/i.test(m)), "non-jasper results: " + r.metas.join(","));
  assert(r.count.startsWith(String(r.metas.length >= 12 ? "" : r.metas.length)), "count mismatch " + r.count);
  assert(+r.count.split(" ")[0] >= catalog.specimens.filter((s) => s.analog === "jasper").length, `count ${r.count} vs jasper analog`);
  assert(expected > 0);
});
test("archive: filter chip updates URL + results; clear restores", async (b) => {
  const { page } = await open(b, "/archive");
  await waitText(page, "All 320 specimens");
  assert(await clickText(page, ".filters .chip", "Green"), "Green chip missing");
  await page.waitForFunction(() => location.hash.includes("tone=green"), { timeout: 5000 });
  const n = +(await page.$eval(".res-count", (e) => e.textContent.split(" ")[0]));
  assert(n > 0 && n < 320, "green count " + n);
  assert(await clickText(page, "button", "Clear all filters"), "clear button missing");
  await waitText(page, "All 320 specimens", 5000);
});
test("archive: deep link with pattern filter is exact", async (b) => {
  const { page } = await open(b, "/archive?pattern=rings");
  const want = catalog.specimens.filter((s) => s.pattern === "rings").length;
  await waitText(page, `${want} of 320 specimens`);
});
test("archive: empty state when nothing matches", async (b) => {
  const { page } = await open(b, "/archive?q=zzzzqqq"); await waitText(page, "No stones match");
});

/* ---------------- specimen viewer + lighting ---------------- */
test("viewer renders the stone (non-blank, textured)", async (b) => {
  const { page, errors } = await open(b, "/specimen/SSJ-0042");
  await waitViewer(page); await sleep(800);
  const s = await stats(page);
  assert(s.mean > 15 && s.sd > 6, `blank or flat render mean=${s.mean.toFixed(1)} sd=${s.sd.toFixed(1)}`);
  assert(!errors.length, errors.join("|"));
});
test("lighting: intensity, position, angle, colour and presets change the render", async (b) => {
  const { page } = await open(b, "/specimen/SSJ-0042");
  await waitViewer(page); await sleep(800);
  const base = await stats(page);
  await setRange(page, "ll-intensity", 0); await setRange(page, "ll-ambient", 0.05);
  const dark = await stats(page);
  assert(dark.mean < base.mean * 0.7, `intensity 0 not darker: ${base.mean.toFixed(1)} → ${dark.mean.toFixed(1)}`);
  await setRange(page, "ll-intensity", 3); await setRange(page, "ll-ambient", 0.3);
  const a0 = await stats(page);
  await setRange(page, "ll-azimuth", 200);
  const a1 = await stats(page);
  assert(diff(a0, a1) > 3, "moving the light did not change the image");
  await setRange(page, "ll-elevation", 6);
  const low = await stats(page);
  assert(diff(a1, low) > 3, "elevation did not change the image");
  await setRange(page, "ll-angle", 8);
  const narrow = await stats(page);
  assert(diff(low, narrow) > 1, "beam angle did not change the image");
  await clickText(page, ".lab-presets .chip", "Gallery"); await sleep(300);
  await setRange(page, "ll-angle", 12);
  const g0 = await stats(page);
  await setRange(page, "ll-aimX", 1); await setRange(page, "ll-aimY", 1);
  const aimed = await stats(page);
  assert(diff(g0, aimed) > 2, "aim did not change the image");
  await setRange(page, "ll-aimX", 0); await setRange(page, "ll-aimY", 0);
  await page.click('[aria-label="1900 kelvin"]'); await sleep(300);
  const warm = await stats(page);
  assert(warm.rb > g0.rb * 1.05, `candle colour not warmer: ${g0.rb.toFixed(2)} → ${warm.rb.toFixed(2)}`);
  await clickText(page, ".lab-presets .chip", "Raking"); await sleep(300);
  const rake = await stats(page);
  assert(diff(warm, rake) > 3, "raking preset did not change the image");
});
test("lighting: dial is keyboard-operable and reports its value", async (b) => {
  const { page } = await open(b, "/specimen/SSJ-0010");
  await waitViewer(page);
  const v0 = await page.$eval(".dial", (e) => e.getAttribute("aria-valuetext"));
  await page.evaluate(() => document.querySelector(".dial").focus());
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");
  const v1 = await page.$eval(".dial", (e) => e.getAttribute("aria-valuetext"));
  assert(v0 !== v1, `dial value unchanged (${v0})`);
});
test("discovery tools: wet surface, pattern lens, light sweep", async (b) => {
  // wetting matters most on matte, mid-tone stone (a glossy black obsidian barely changes — as in life)
  const matte = catalog.specimens.find((x) => x.traits.gloss < 0.15 && x.analog === "sandstone");
  const { page } = await open(b, "/specimen/" + matte.id);
  await waitViewer(page); await sleep(600);
  const s0 = await stats(page);
  await clickText(page, ".lab-tools .btn", "Wet surface"); await sleep(300);
  const wet = await stats(page);
  assert(diff(s0, wet) > 2, "wet toggle had no visible effect");
  await clickText(page, ".lab-tools .btn", "Wet surface");
  await clickText(page, ".lab-tools .btn", "Pattern lens"); await sleep(300);
  const lens = await stats(page);
  assert(diff(s0, lens) > 2, "lens toggle had no visible effect");
  assert((await text(page)).includes("not true to the specimen"), "lens disclaimer missing");
  await clickText(page, ".lab-tools .btn", "Pattern lens");
  const az0 = await page.$eval("#ll-azimuth", (e) => +e.value);
  await clickText(page, ".lab-tools .btn", "Light sweep"); await sleep(1500);
  const az1 = await page.$eval("#ll-azimuth", (e) => +e.value);
  assert(az0 !== az1, "light sweep did not move the light");
});
test("camera: named views, keyboard orbit and zoom", async (b) => {
  const { page } = await open(b, "/specimen/SSJ-0100");
  await waitViewer(page); await sleep(500);
  const cam = () => page.evaluate(() => window.__stoneScene.camera.position.toArray());
  const p0 = await cam();
  await page.focus(".viewer-canvas");
  await page.keyboard.press("ArrowLeft"); await page.keyboard.press("ArrowLeft"); await sleep(200);
  const p2 = await cam();
  assert(Math.hypot(p2[0] - p0[0], p2[2] - p0[2]) > 0.05, "arrow keys did not orbit");
  await clickText(page, ".stage-views .chip", "Top"); await sleep(1200);
  const p1 = await cam();
  assert(p1[1] > p2[1] + 0.5, "top view did not raise the camera");
  await clickText(page, ".stage-views .chip", "¾"); await sleep(1200);
  await page.focus(".viewer-canvas");
  const d0 = Math.hypot(...(await cam()));
  await page.keyboard.press("+"); await page.keyboard.press("+"); await sleep(200);
  const d1 = Math.hypot(...(await cam()));
  assert(d1 < d0, "+ did not zoom in");
});
test("similar patterns: 8 neighbours, navigation swaps the specimen", async (b) => {
  const { page } = await open(b, "/specimen/SSJ-0050");
  await waitViewer(page);
  const links = await page.$$eval(".similar .card", (as) => as.map((a) => a.getAttribute("href")));
  assert(links.length === 8, "similar count " + links.length);
  await page.click(".similar .card");
  await page.waitForFunction((h) => location.hash === h, { timeout: 5000 }, links[0]);
  await page.waitForFunction((id) => window.__stoneScene && window.__stoneScene.spec && window.__stoneScene.spec.id === id, { timeout: 15000 }, links[0].split("/").pop());
});
test("specimen: ] and [ step through the register", async (b) => {
  const { page } = await open(b, "/specimen/SSJ-0002");
  await waitViewer(page); await sleep(300);
  await page.click("#sp-title");
  await page.keyboard.press("]");
  await page.waitForFunction(() => location.hash === "#/specimen/SSJ-0003", { timeout: 5000, polling: 100 });
  await sleep(300);
  await page.keyboard.press("[");
  await page.waitForFunction(() => location.hash === "#/specimen/SSJ-0002", { timeout: 5000, polling: 100 });
});
test("specimen: notes carry their kind labels", async (b) => {
  const { page } = await open(b, "/specimen/SSJ-0123");
  await waitText(page, "How it may have formed");
  const kinds = await page.$$eval(".badge", (bs) => [...new Set(bs.map((x) => x.className.replace("badge ", "")))]);
  for (const k of ["observation", "fact", "hypothesis", "interpretation"]) assert(kinds.includes(k), "missing badge " + k);
});

/* ---------------- patterns ---------------- */
test("pattern map plots every specimen; axes are URL state", async (b) => {
  const { page } = await open(b, "/patterns");
  await page.waitForSelector(".map .dot");
  const n = await page.$$eval(".map .dot", (d) => d.length);
  assert(n === catalog.count, `map has ${n} dots`);
  await page.select("#ax", "light");
  await page.waitForFunction(() => location.hash.includes("x=light"), { timeout: 3000 });
});
test("find by traits returns ranked matches", async (b) => {
  const { page } = await open(b, "/patterns?tab=seek");
  await waitText(page, "Closest 12 matches");
  const ids = await page.$$eval(".seek .card-id", (e) => e.map((x) => x.textContent));
  assert(ids.length === 12, "matches " + ids.length);
  const top = catalog.specimens.find((s) => s.id === ids[0]);
  assert(top.traits.veining > 0.5, "top veining match is not veined: " + top.id);
});

/* ---------------- hall ---------------- */
test("hall: loads, 34 showpieces + 320 cabinet stones, no add-your-own-stone, no errors", async (b) => {
  const { page, errors } = await open(b, "/hall", { width: 1280, height: 800, quality: "medium" });
  await page.waitForFunction(() => window.__av && !document.body.innerText.includes("LIGHTING THE LAMPS"), { timeout: 90000 });
  await page.waitForFunction(() => window.__hallCabinets >= 320, { timeout: 90000 });
  const t = await text(page);
  assert(!/Add stone|收藏新石/.test(t), "the add-your-own-stone button is still there");
  assert(await page.evaluate(() => !document.querySelector('input[type="file"]')), "a file input is still there");
  const merged = await page.evaluate(() => window.__hallMerged);
  assert(merged.after < merged.before / 4, "static batching ineffective");
  assert(!errors.length, errors.join("|"));
});
test("hall: exit link returns to the museum", async (b) => {
  const { page } = await open(b, "/hall", { quality: "low" });
  await page.waitForFunction(() => window.__av, { timeout: 90000 });
  await page.click('a[aria-label^="Leave the hall"]');
  await page.waitForFunction(() => location.hash === "#/", { timeout: 5000 });
});

test("hall on a phone: touch joystick walks, drag looks, tap identifies, chrome fits", async (b) => {
  const page = await b.newPage();
  await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.evaluateOnNewDocument(() => { localStorage.setItem("shishiji:gallery:helpseen", "1"); localStorage.setItem("gallery:quality", "low"); });
  await page.goto(BASE + "#/hall");
  await page.waitForFunction(() => window.__av && window.__hallProbe, { timeout: 120000 });
  await sleep(1000);
  const cdp = await page.target().createCDPSession();
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
  const drag = async (x0, y0, x1, y1, hold) => { await touch("touchStart", [[x0, y0]]); for (let i = 1; i <= 10; i++) { await touch("touchMove", [[x0 + ((x1 - x0) * i) / 10, y0 + ((y1 - y0) * i) / 10]]); await sleep(20); } await sleep(hold); await touch("touchEnd", []); await sleep(250); };
  const a0 = await page.evaluate(() => window.__av);
  await drag(90, 640, 90, 590, 1000);
  const a1 = await page.evaluate(() => window.__av);
  assert(Math.hypot(a1.x - a0.x, a1.z - a0.z) > 2, "joystick did not move the visitor");
  await drag(300, 400, 220, 400, 50);
  const a2 = await page.evaluate(() => window.__av);
  assert(Math.abs(a2.yaw - a1.yaw) > 0.1, "drag did not turn the view");
  // tap a vitrine stone in view → its identification card appears
  await page.evaluate(() => window.__hallTeleport(-12.5, -3.2, 0, 0.12, 0)); await sleep(800);
  await touch("touchStart", [[200, 330]]); await sleep(60); await touch("touchEnd", []); await sleep(600);
  const ui = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth, card: !!document.querySelector('[aria-label="Selected specimen"]'), hint: document.body.innerText.includes("tap a stone"), buttons: [...document.querySelectorAll("button")].filter((x) => { const r = x.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).length }));
  assert(ui.card, "tapping a stone did not identify it");
  assert(ui.hint, "touch hint missing");
  assert(ui.sw <= ui.w + 1 && ui.buttons === 0, "chrome overflows the phone screen");
  assert(!errors.length, errors.join("|"));
});

test("hand study: lift, turn, lamp, flip, water, light types, lens, put back", async (b) => {
  const { page, errors } = await open(b, "/hall", { width: 1440, height: 900, quality: "medium" });
  await page.waitForFunction(() => window.__av && window.__hallProbe, { timeout: 120000 });
  await page.evaluate(() => window.__hallTeleport(-12.5, -3.4, 0, 0.1, 0)); await sleep(700);
  await page.keyboard.press("KeyR");
  await page.waitForFunction(() => window.__study && window.__study.debug().phase === "hold", { timeout: 5000, polling: 100 });
  await sleep(400);
  const d0 = await page.evaluate(() => window.__study.debug());
  assert(d0.lampI > 1, "lamp not lit while holding");
  assert(await page.evaluate(() => window.__study.hasHands), "hands did not attach");
  // drag turns the stone (and it keeps turning a little after release: inertia)
  await page.mouse.move(720, 600); await page.mouse.down();
  for (let i = 0; i < 10; i++) await page.mouse.move(720 + i * 14, 600 + i * 3);
  await page.mouse.up();
  const qa = await page.evaluate(() => window.__study.debug().q); await sleep(250);
  const qb = await page.evaluate(() => window.__study.debug().q);
  const dq = (x, y) => 1 - Math.abs(x[0] * y[0] + x[1] * y[1] + x[2] * y[2] + x[3] * y[3]);
  assert(dq(d0.q, qa) > 0.01, "drag did not turn the stone");
  assert(dq(qa, qb) > 1e-5, "no inertia after release");
  // right-drag moves the lamp
  await page.mouse.move(720, 450); await page.mouse.down({ button: "right" });
  for (let i = 0; i < 10; i++) await page.mouse.move(720 - i * 14, 450 + i * 2);
  await page.mouse.up({ button: "right" }); await sleep(300);
  const d1 = await page.evaluate(() => window.__study.debug());
  assert(Math.hypot(d1.lamp[0] - d0.lamp[0], d1.lamp[1] - d0.lamp[1], d1.lamp[2] - d0.lamp[2]) > 0.03, "right-drag did not move the lamp");
  // turn over
  await sleep(900); const qf0 = await page.evaluate(() => window.__study.debug().q);
  await page.keyboard.press("KeyF"); await sleep(900);
  const qf1 = await page.evaluate(() => window.__study.debug().q);
  assert(dq(qf0, qf1) > 0.5, "F did not turn the stone over");
  // water soaks in, light presets switch
  await page.keyboard.press("KeyT"); await sleep(1500);
  assert((await page.evaluate(() => window.__study.debug().wet)) > 0.6, "water did not wet the stone");
  await page.keyboard.press("Digit2"); await sleep(150);
  assert((await page.evaluate(() => window.__study.debug().light)) === "candle", "candle preset");
  await page.keyboard.press("Digit3"); await sleep(150);
  assert((await page.evaluate(() => window.__study.debug().light)) === "daylight", "daylight preset");
  if (await page.evaluate(() => window.__study.hasLoupe)) {
    await page.keyboard.press("KeyZ"); await sleep(400);
    assert((await page.evaluate(() => window.__study.debug().loupe)) === true, "lens did not raise");
  }
  const fps = await measureFps(page, 2000);
  perf.studyFps = fps;
  assert(fps >= 30, "study fps " + fps);
  // the toolbar is real and labelled
  assert(await page.$('[role="toolbar"][aria-label="Study tools"]'), "study toolbar missing");
  // put it back: the stone returns to its vitrine
  await page.keyboard.press("KeyR");
  await page.waitForFunction(() => window.__study.debug().phase === "idle", { timeout: 4000, polling: 100 });
  assert(!errors.length, errors.join(" | "));
});

test("hand study UI: keyboard acts on the focused button, shortcuts and repeats are not hijacked, hint fades", async (b) => {
  const { page, errors } = await open(b, "/hall", { width: 1440, height: 900, quality: "medium" });
  await page.waitForFunction(() => window.__av && window.__hallProbe && window.__study, { timeout: 120000 });
  const dbg = () => page.evaluate(() => window.__study.debug());
  const ang = (x, y) => 2 * Math.acos(Math.min(1, Math.abs(x[0] * y[0] + x[1] * y[1] + x[2] * y[2] + x[3] * y[3])));
  await page.evaluate(() => window.__hallTeleport(-12.5, -3.4, 0, 0.1, 0)); await sleep(700);
  await page.keyboard.press("KeyR");
  await page.waitForFunction(() => window.__study.debug().phase === "hold", { timeout: 8000, polling: 50 });
  await sleep(500);
  // semantics: light presets are a radio group, actions are plain buttons, the lens is a toggle, Put back is last
  const sem = await page.evaluate(() => {
    const bar = document.querySelector('[role="toolbar"][aria-label="Study tools"]');
    const btns = [...bar.querySelectorAll("button")];
    return {
      radios: [...bar.querySelectorAll('[role="radiogroup"] [role="radio"]')].map((e) => e.getAttribute("aria-checked")),
      actionsPressed: btns.filter((e) => ["water", "tap", "flip", "back"].includes(e.dataset.tool)).map((e) => e.getAttribute("aria-pressed")),
      lens: bar.querySelector('[data-tool="lens"]') ? bar.querySelector('[data-tool="lens"]').getAttribute("aria-pressed") : "false",
      last: btns[btns.length - 1].dataset.tool, labOutside: !bar.querySelector('[aria-label*="lighting lab"]'),
      small: btns.filter((e) => e.getBoundingClientRect().height < 44).length,
    };
  });
  assert(sem.radios.length === 3 && sem.radios.filter((x) => x === "true").length === 1, "light radiogroup " + JSON.stringify(sem.radios));
  assert(sem.actionsPressed.every((x) => x === null), "momentary actions must not be toggles");
  assert(sem.lens === "false" && sem.last === "back" && sem.labOutside && !sem.small, "toolbar layout " + JSON.stringify(sem));
  // Enter on a focused Water button waters the stone and stays in the hall
  await page.focus('[data-tool="water"]'); await page.keyboard.press("Enter"); await sleep(1300);
  assert((await page.evaluate(() => location.hash)) === "#/hall", "Enter left the hall");
  assert((await dbg()).wet > 0.5, "Enter did not activate the focused Water button");
  // E does nothing mid-study; Space activates the focused Turn over
  await page.evaluate(() => document.activeElement.blur()); await page.keyboard.press("KeyE"); await sleep(400);
  assert((await page.evaluate(() => location.hash)) === "#/hall" && (await dbg()).phase === "hold", "E left the study");
  await sleep(600); let q0 = (await dbg()).q;
  await page.focus('[data-tool="flip"]'); await page.keyboard.press("Space"); await sleep(1000);
  assert(ang(q0, (await dbg()).q) > 2.5, "Space did not activate the focused Turn over");
  // browser shortcuts pass through; auto-repeat does not machine-gun one-shot actions
  await page.evaluate(() => document.activeElement.blur());
  q0 = (await dbg()).q;
  await page.keyboard.down("Control"); await page.keyboard.press("KeyF"); await page.keyboard.up("Control"); await sleep(800);
  assert(ang(q0, (await dbg()).q) < 0.3, "Ctrl+F flipped the stone");
  const drops = () => page.evaluate(() => { let c = 0; window.__study.rig.traverse((o) => { if (o.isMesh && o.geometry.parameters && o.geometry.parameters.radius === 0.0045) c++; }); return c; });
  let most = 0;
  for (let i = 0; i < 20; i++) { await page.keyboard.down("KeyT"); await sleep(30); most = Math.max(most, await drops()); }
  await page.keyboard.up("KeyT");
  assert(most <= 12, "holding T spawned " + most + " drops");
  // the gesture hint fades once the stone is being turned, and "?" recalls it
  await page.mouse.move(700, 480); await page.mouse.down();
  for (let i = 0; i < 8; i++) await page.mouse.move(700 + i * 12, 480);
  await page.mouse.up(); await sleep(4300);
  assert(!(await page.evaluate(() => document.querySelector("[data-study-hint]").classList.contains("on"))), "hint did not fade");
  await page.keyboard.press("Slash"); await sleep(300);
  assert(await page.evaluate(() => document.querySelector("[data-study-hint]").classList.contains("on")), "? did not recall the hint");
  // __hallInfo reports the whole frame (lamp shadow counted)
  const info = await page.evaluate(() => window.__hallInfo());
  assert(info.calls > 20 && info.shadowCalls > 0, "hallInfo " + JSON.stringify(info));
  // a mouse-look drag held across a pickup does not keep turning the view afterwards
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__study.debug().phase === "idle", { timeout: 8000, polling: 50 }); await sleep(300);
  await page.mouse.move(700, 450); await page.mouse.down(); await page.mouse.move(705, 450);
  await page.keyboard.press("KeyR");
  await page.waitForFunction(() => window.__study.debug().phase === "hold", { timeout: 8000, polling: 50 });
  await page.mouse.up(); await page.keyboard.press("KeyR");
  await page.waitForFunction(() => window.__study.debug().phase === "idle", { timeout: 8000, polling: 50 }); await sleep(300);
  const y0 = await page.evaluate(() => window.__av.yaw);
  for (let i = 0; i < 12; i++) await page.mouse.move(705 + i * 12, 450);
  assert(Math.abs((await page.evaluate(() => window.__av.yaw)) - y0) < 0.01, "hover turned the view after a pickup");
  assert(!errors.length, errors.join(" | "));
});

test("hand study on a phone: Hold it from the card, the card and walk HUD step aside, the toolbar fits", async (b) => {
  const page = await b.newPage();
  await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.evaluateOnNewDocument(() => { localStorage.setItem("shishiji:gallery:helpseen", "1"); localStorage.setItem("gallery:quality", "low"); });
  await page.goto(BASE + "#/hall");
  await page.waitForFunction(() => window.__av && window.__hallProbe && window.__study, { timeout: 120000 });
  await sleep(800);
  const cdp = await page.target().createCDPSession();
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
  const tap = async (x, y) => { await touch("touchStart", [[x, y]]); await sleep(50); await touch("touchEnd", []); await sleep(120); };
  const at = (sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
  await page.evaluate(() => window.__hallTeleport(-12.5, -3.2, 0, 0.12, 0)); await sleep(900);
  await tap(200, 330); await sleep(600);
  const hold = await at('[aria-label="Selected specimen"] [data-tool="hold"]');
  assert(hold, "the identification card has no Hold it");
  await tap(...hold);
  await page.waitForFunction(() => window.__study.debug().phase === "hold", { timeout: 8000, polling: 50 }); await sleep(700);
  const ui = await page.evaluate(() => {
    const bar = document.querySelector('[role="toolbar"]').getBoundingClientRect();
    const btns = [...document.querySelectorAll('[role="toolbar"] button')].map((e) => { const r = e.getBoundingClientRect(); return { h: r.height, w: r.width, en: !!e.querySelector(".en") && e.querySelector(".en").offsetWidth > 0, fit: e.scrollWidth <= e.clientWidth + 1 }; });
    const rows = new Set([...document.querySelectorAll('[role="toolbar"] button')].map((e) => Math.round(e.getBoundingClientRect().top))).size;
    const t = document.querySelector("[data-study-title]");
    return { card: !!document.querySelector('[aria-label="Selected specimen"]'), walkHint: document.body.innerText.includes("drag lower-left"),
      barTop: bar.top, barBottom: bar.bottom, rows, btns, titleFont: Math.min(...[...t.querySelectorAll(".st-title-text .st-id, .st-title-text .en, .st-title-text .zh")].map((e) => parseFloat(getComputedStyle(e).fontSize))),
      sw: document.documentElement.scrollWidth };
  });
  assert(!ui.card && !ui.walkHint, "card / walk HUD still shown during the study");
  assert(ui.rows <= 2 && ui.barBottom <= 844 && ui.sw <= 390, "toolbar does not fit " + JSON.stringify({ rows: ui.rows, b: ui.barBottom, sw: ui.sw }));
  assert(ui.btns.every((x) => x.h >= 44 && x.en && x.fit), "toolbar buttons: targets / bilingual labels " + JSON.stringify(ui.btns));
  assert(ui.titleFont >= 13, "title text below 13 px");
  // the held stone stays clear of the toolbar
  const stoneY = await page.evaluate(() => { let c = null; window.__hallScene.traverse((o) => { if (o.name === "study-carrier") c = o; }); let cam = null; window.__hallScene.traverse((o) => { if (o.isPerspectiveCamera && !cam) cam = o; }); const v = new (window.__hallScene.position.constructor)(); c.getWorldPosition(v); v.project(cam); return (-v.y * 0.5 + 0.5) * innerHeight; });
  assert(stoneY < ui.barTop - 60, "the toolbar covers the held stone");
  await tap(...(await at('[data-tool="back"]')));
  await page.waitForFunction(() => window.__study.debug().phase === "idle", { timeout: 8000, polling: 50 });
  assert(!errors.length, errors.join(" | "));
});

/* ---------------- accessibility ---------------- */
for (const hash of ["/", "/archive", "/specimen/SSJ-0001", "/patterns"]) {
  test(`a11y basics on ${hash}`, async (b) => {
    const { page } = await open(b, hash);
    await sleep(2500);
    const r = await page.evaluate(() => {
      const issues = [];
      const name = (el) => (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || (el.querySelector("img[alt]") && el.querySelector("img").alt) || "").trim();
      document.querySelectorAll("img").forEach((i) => { if (!i.hasAttribute("alt")) issues.push("img without alt " + i.src.slice(-30)); });
      document.querySelectorAll("button, a[href]").forEach((el) => { if (!name(el)) issues.push("unnamed " + el.outerHTML.slice(0, 80)); });
      document.querySelectorAll("input:not([type=hidden]), select").forEach((el) => {
        const ok = el.getAttribute("aria-label") || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest("label");
        if (!ok) issues.push("unlabelled control " + (el.id || el.type));
      });
      const h1 = document.querySelectorAll("h1").length; if (h1 !== 1) issues.push(`h1 count ${h1}`);
      if (!document.querySelector("main")) issues.push("no <main>");
      if (!document.querySelector("nav")) issues.push("no <nav>");
      if (!document.documentElement.lang) issues.push("no lang");
      return issues;
    });
    assert(!r.length, r.slice(0, 6).join(" ; "));
  });
}
test("hand study feel: trackball turning and twist, no false flips, fingers on the stone, lamp hand lowers, put-back reverses", async (b) => {
  const { page, errors } = await open(b, "/hall", { width: 1440, height: 900, quality: "medium" });
  await page.waitForFunction(() => window.__av && window.__study && window.__study.hasHands, { timeout: 120000 });
  await page.evaluate(() => window.__hallTeleport(-12.5, -3.4, 0, 0.1, 0)); await sleep(700);
  await page.keyboard.press("KeyR");
  await page.waitForFunction(() => window.__study.debug().phase === "hold", { timeout: 5000, polling: 100 });
  await sleep(700);
  const Q = () => page.evaluate(() => window.__study.debug().q);
  const ang = (a, c) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * c[0] + a[1] * c[1] + a[2] * c[2] + a[3] * c[3])));
  // trackball: the grabbed point goes with the pointer, nothing moves under a still pointer,
  // and dragging back to where it started brings the stone back
  const [cx, cy] = await page.evaluate(() => { let piv, cam; window.__hallScene.traverse((o) => { if (o.name === "study-carrier") piv = o.parent; if (o.isPerspectiveCamera && !cam && o.parent === window.__hallScene) cam = o; });
    const v = piv.getWorldPosition(piv.position.clone()).project(cam); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; });
  const q0 = await Q();
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 80, cy, { steps: 16 }); await sleep(250);
  const q1 = await Q(); await sleep(300); const q1b = await Q();
  await page.mouse.move(cx, cy, { steps: 16 }); await sleep(200); const q1c = await Q(); await page.mouse.up(); await sleep(300);
  const q2 = await Q();
  assert(ang(q0, q1) > 0.4 && ang(q0, q1) < 0.7, `80 px drag turned ${ang(q0, q1).toFixed(3)} rad`);
  assert(ang(q1, q1b) < 0.002, `stone drifted ${ang(q1, q1b).toFixed(4)} rad under a still pointer`);
  assert(ang(q0, q1c) < 0.04, `there and back left the stone ${ang(q0, q1c).toFixed(3)} rad off`);
  // circling the rim twists it about the line of sight (a quarter circle ≈ a quarter turn); so does Q
  const R = 230;
  await page.mouse.move(cx + R, cy); await page.mouse.down();
  for (let i = 1; i <= 24; i++) { const a = (i / 24) * Math.PI / 2; await page.mouse.move(cx + R * Math.cos(a), cy - R * Math.sin(a)); }
  await sleep(200); const q3a = await Q(); await page.mouse.up(); await sleep(400);
  assert(Math.abs(ang(q2, q3a) - Math.PI / 2) < 0.2, `rim quarter-circle twisted ${ang(q2, q3a).toFixed(3)} rad`);
  const q3b = await Q(); await page.keyboard.press("KeyQ"); await sleep(900);
  assert(ang(q3b, await Q()) > 0.1, "Q did not twist the stone");
  await sleep(1200);
  // two quick lamp drags are not a double-click
  const q2r = await Q();
  for (let i = 0; i < 2; i++) { await page.mouse.move(700, 500); await page.mouse.down({ button: "right" }); await page.mouse.move(730, 500, { steps: 3 }); await page.mouse.up({ button: "right" }); await sleep(60); }
  await sleep(900); const q3 = await Q();
  assert(ang(q2r, q3) < 0.01, "two quick right-drags flipped the stone");
  // the fingers rest on the stone (joints solved to contact, not a fixed claw): the curls differ by finger
  const curls = await page.evaluate(() => { let m; window.__hallScene.traverse((o) => { if (o.isSkinnedMesh && !m && o.parent && o.parent.parent && o.parent.parent.name === "hand-left") m = o; });
    return m ? [2, 5, 8, 11].map((i) => +m.skeleton.bones[i].rotation.x.toFixed(3)) : null; });
  assert(curls && new Set(curls).size > 1, "every finger has the same curl: " + JSON.stringify(curls));
  // window daylight: the lamp hand lowers over several frames (no one-frame pop)
  const y = () => page.evaluate(() => { let r; window.__hallScene.traverse((o) => { if (o.name === "hand-right") r = o; }); return r.position.y; });
  const y0 = await y(); await page.keyboard.press("Digit3"); await sleep(120); const y1 = await y(); await sleep(900); const y2 = await y();
  assert(y1 < y0 && y1 > y2, `lamp hand did not lower smoothly: ${y0.toFixed(3)} → ${y1.toFixed(3)} → ${y2.toFixed(3)}`);
  await page.keyboard.press("Digit1"); await sleep(800);
  // R while the hands go down brings the stone straight back up
  await page.keyboard.press("KeyR"); await sleep(200);
  await page.keyboard.press("KeyR");
  await page.waitForFunction(() => window.__study.debug().phase === "hold", { timeout: 2500, polling: 50 });
  await page.keyboard.press("KeyR");
  await page.waitForFunction(() => window.__study.debug().phase === "idle", { timeout: 4000, polling: 100 });
  assert(!errors.length, "console errors: " + errors.join(" | "));
  await page.close();
});

test("keyboard: skip link moves focus to main", async (b) => {
  const { page } = await open(b, "/archive");
  await waitText(page, "All 320");
  await page.keyboard.press("Tab");
  const t = await page.evaluate(() => document.activeElement.textContent);
  assert(/Skip to content/.test(t), "first tab stop is " + t);
  await page.keyboard.press("Enter");
  assert(await page.evaluate(() => document.activeElement.id === "main"), "focus not on main");
});

/* ---------------- responsive ---------------- */
for (const hash of ["/", "/archive", "/specimen/SSJ-0001", "/patterns"]) {
  test(`mobile 390px: no horizontal overflow on ${hash}`, async (b) => {
    const { page } = await open(b, hash, { width: 390, height: 844, mobile: true });
    await sleep(2500);
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
    assert(o.sw <= o.w + 1, `scrollWidth ${o.sw} > ${o.w}`);
  });
}

/* ---------------- performance ---------------- */
test("perf: viewer holds ≥30 fps during a light sweep", async (b) => {
  const { page } = await open(b, "/specimen/SSJ-0005");
  await waitViewer(page); await sleep(500);
  await clickText(page, ".lab-tools .btn", "Light sweep");
  const fps = await measureFps(page, 3000);
  perf.viewerSweepFps = fps;
  assert(fps >= 30, "viewer fps " + fps);
});
test("perf: hall settles at ≥30 fps with adaptive quality", async (b) => {
  const page = await b.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument(() => { localStorage.removeItem("gallery:quality"); localStorage.setItem("shishiji:gallery:helpseen", "1"); });
  await page.goto(BASE + "#/hall");
  await page.waitForFunction(() => window.__av && window.__hallCabinets >= 320, { timeout: 90000 });
  await sleep(11000);
  const fps = await measureFps(page, 3000);
  perf.hallFps = fps; perf.hallTier = await page.evaluate(() => window.__hallQuality);
  assert(fps >= 30, `hall fps ${fps} at tier ${perf.hallTier}`);
});
test("perf: archive becomes interactive quickly", async (b) => {
  const page = await b.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const t0 = Date.now();
  await page.goto(BASE + "#/archive");
  await page.waitForFunction(() => document.body.innerText.includes("All 320 specimens"), { timeout: 20000 });
  perf.archiveReadyMs = Date.now() - t0;
  assert(perf.archiveReadyMs < 6000, "archive ready in " + perf.archiveReadyMs + " ms");
});

/* ---------------- runner ---------------- */
const results = [];
for (const t of tests.filter((t) => t.name.includes(filter))) {
  const t0 = Date.now();
  const b = await launch();
  try { await t.fn(b); results.push({ name: t.name, ok: true, ms: Date.now() - t0 }); process.stdout.write(`✓ ${t.name} (${Date.now() - t0} ms)\n`); }
  catch (e) { results.push({ name: t.name, ok: false, ms: Date.now() - t0, error: e.message }); process.stdout.write(`✗ ${t.name}\n    ${e.message}\n`); }
  await b.close().catch(() => {});
}
const failed = results.filter((r) => !r.ok);
mkdirSync("artifacts", { recursive: true });
writeFileSync("artifacts/e2e-report.json", JSON.stringify({ when: new Date().toISOString(), base: BASE, passed: results.length - failed.length, failed: failed.length, perf, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed` + (Object.keys(perf).length ? ` · perf ${JSON.stringify(perf)}` : ""));
process.exit(failed.length ? 1 : 0);
