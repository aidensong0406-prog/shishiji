// Screenshot a route: node scripts/shoot.mjs "<hash>" out.png [width] [height] [waitMs] [waitForGlobal]
import { launch, openPage, sleep } from "../tests/e2e/lib.mjs";
const [hash = "/", out = "artifacts/shot.png", w = "1440", h = "900", wait = "3000", flag = ""] = process.argv.slice(2);
const b = await launch();
const { page, log } = await openPage(b, hash, { width: +w, height: +h });
if (flag) await page.waitForFunction((f) => window[f], { timeout: 180000, polling: 500 }, flag);
await sleep(+wait);
await page.screenshot({ path: out, fullPage: process.env.FULL === "1" });
await b.close();
console.log(JSON.stringify({ out, errors: log.errors, failed: log.failed, warnings: log.warnings.slice(0, 5) }));
