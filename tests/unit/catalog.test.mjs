import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateCatalog } from "../../src/catalog/generate.js";
import { featureDistance } from "../../src/catalog/similarity.js";
import { ANALOGS } from "../../src/catalog/knowledge.js";

const data = JSON.parse(readFileSync(new URL("../../src/data/catalog.json", import.meta.url)));
const S = data.specimens;

test("register holds at least 300 specimens", () => {
  assert.ok(S.length >= 300, `only ${S.length}`);
  assert.equal(data.count, S.length);
});

test("IDs are stable, unique and sequential (SSJ-0001…)", () => {
  S.forEach((s, i) => assert.equal(s.id, "SSJ-" + String(i + 1).padStart(4, "0")));
  assert.equal(new Set(S.map((s) => s.id)).size, S.length);
});

test("catalog.json is exactly reproducible from the generator", () => {
  const regen = generateCatalog();
  assert.equal(regen.length, S.length);
  for (let i = 0; i < S.length; i++) {
    assert.deepEqual(JSON.parse(JSON.stringify(regen[i])), S[i], `drift at ${S[i].id} — run npm run catalog`);
  }
});

test("titles are present and unique in English and Chinese", () => {
  for (const s of S) { assert.ok(s.title.en.length > 3); assert.ok(/[一-鿿]/.test(s.title.zh), s.id); }
  assert.equal(new Set(S.map((s) => s.title.en)).size, S.length);
  assert.equal(new Set(S.map((s) => s.title.zh)).size, S.length);
});

test("every specimen has complete, correctly labelled notes", () => {
  for (const s of S) {
    const n = s.notes;
    assert.equal(n.observation.kind, "observation", s.id);
    assert.ok(/measuring [\d.]+ × [\d.]+ × [\d.]+ cm\./.test(n.observation.text), s.id);
    assert.ok(n.geology.length >= 1 && n.geology.every((g) => g.kind === "fact" && g.text.length > 30), s.id);
    assert.ok(n.hypotheses.length >= 1 && n.hypotheses.every((h) => h.kind === "hypothesis" && h.text.startsWith("In a")), s.id);
    assert.equal(n.interpretation.kind, "interpretation", s.id);
    assert.ok(n.culture.length >= 1 && n.culture.every((c) => ["fact", "interpretation"].includes(c.kind)), s.id);
  }
});

test("notes invent no find-site, collector or age", () => {
  const forbidden = /(found (at|in|near)|collected (by|from|in)|discovered|million years old|years old|acquired|donated|excavated)/i;
  for (const s of S) {
    assert.ok(!("provenance" in s), `${s.id}: unexpected provenance field`);
    const all = JSON.stringify(s.notes);
    assert.ok(!forbidden.test(all), `${s.id}: ${all.match(forbidden)}`);
  }
});

test("model data is well-formed (dims, colours, traits, recipe)", () => {
  for (const s of S) {
    assert.equal(s.dims_cm.length, 3); assert.ok(s.dims_cm.every((d) => d > 0.5 && d < 100), s.id);
    for (const c of Object.values(s.colours)) assert.match(c.hex, /^#[0-9a-f]{6}$/);
    for (const v of Object.values(s.traits)) assert.ok(v >= 0 && v <= 1);
    assert.ok(Number.isInteger(s.shape.seed) && s.shape.seed === s.look.seed, s.id);
    assert.ok(ANALOGS.some((a) => a.key === s.analog), s.id);
  }
});

test("specimens are differentiated: no near-duplicates in feature space", () => {
  let min = Infinity, pair = null;
  for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
    const d = featureDistance(S[i].fv, S[j].fv);
    if (d < min) { min = d; pair = [S[i].id, S[j].id]; }
  }
  assert.ok(min >= 0.3, `closest pair ${pair} at ${min.toFixed(3)}`);
  // no two specimens share both silhouette recipe seed and palette
  assert.equal(new Set(S.map((s) => s.look.seed)).size, S.length);
});

test("the collection spans every analog, family and pattern", () => {
  assert.equal(new Set(S.map((s) => s.analog)).size, ANALOGS.length);
  assert.ok(new Set(S.map((s) => s.family)).size >= 10);
  assert.ok(new Set(S.map((s) => s.pattern)).size >= 10);
});
