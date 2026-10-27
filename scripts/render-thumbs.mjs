// Renders public/thumbs/<ID>.webp for every specimen through the real shader
// in headless Chrome. Requires the dev server (npm run dev) on BASE_URL.
// Usage: node scripts/render-thumbs.mjs [size=360] [onlyMissing=0]
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { launch, openPage } from "../tests/e2e/lib.mjs";

const size = +(process.argv[2] || 360);
const onlyMissing = process.argv[3] === "1";
const dir = new URL("../public/thumbs/", import.meta.url);
mkdirSync(dir, { recursive: true });
const b = await launch();
const { page, log } = await openPage(b, `/lab?export=1&size=${size}`, { width: 800, height: 600 });
await page.waitForFunction(() => window.__thumbAPI, { timeout: 120000, polling: 250 });
const ids = await page.evaluate(() => window.__thumbAPI.ids);
let bytes = 0, n = 0;
const t0 = Date.now();
for (const id of ids) {
  const file = new URL(`${id}.webp`, dir);
  if (onlyMissing && existsSync(file)) continue;
  const url = await page.evaluate((id) => window.__thumbAPI.render(id), id);
  const buf = Buffer.from(url.split(",")[1], "base64");
  writeFileSync(file, buf); bytes += buf.length; n++;
}
await b.close();
console.log(JSON.stringify({ rendered: n, total: ids.length, avgKB: +(bytes / Math.max(1, n) / 1024).toFixed(1), totalMB: +(bytes / 1048576).toFixed(2), seconds: (Date.now() - t0) / 1000, errors: log.errors }));
