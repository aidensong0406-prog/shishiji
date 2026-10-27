// Generates src/data/catalog.json (committed). Re-run only when you intend to
// re-mint the collection: IDs map to fixed recipes once published.
import { writeFileSync } from "node:fs";
import { generateCatalog, CATALOG_VERSION, GENERATOR } from "../src/catalog/generate.js";

const t0 = performance.now();
const specimens = generateCatalog();
const out = { version: CATALOG_VERSION, count: specimens.length, specimens };
const file = new URL("../src/data/catalog.json", import.meta.url);
writeFileSync(file, JSON.stringify(out));
console.log(`catalog: ${specimens.length} specimens in ${(performance.now() - t0).toFixed(0)} ms → ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
