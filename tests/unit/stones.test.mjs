import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStoneGeometry } from "../../src/stones/geometry.js";
import { lookUniforms } from "../../src/stones/material.js";
import { pca2 } from "../../src/catalog/pca.js";
import { toneOf, TONES } from "../../src/app/tones.js";
import { readFileSync } from "node:fs";

const S = JSON.parse(readFileSync(new URL("../../src/data/catalog.json", import.meta.url))).specimens;

test("geometry is deterministic for a recipe", () => {
  const a = buildStoneGeometry(S[0].shape, { level: 4 }).attributes.position.array;
  const b = buildStoneGeometry(S[0].shape, { level: 4 }).attributes.position.array;
  assert.deepEqual(Array.from(a.slice(0, 300)), Array.from(b.slice(0, 300)));
});

test("geometry is finite, unit-bounded and has cavity data at every LOD", () => {
  for (const level of [3, 4, 5]) {
    for (const s of [S[0], S[17], S[123], S[299]]) {
      const g = buildStoneGeometry(s.shape, { level });
      const p = g.attributes.position.array;
      assert.ok(p.every(Number.isFinite), `${s.id} L${level} NaN`);
      assert.ok(Math.abs(g.boundingSphere.radius - 1) < 0.05, `${s.id} radius ${g.boundingSphere.radius}`);
      assert.equal(g.attributes.aCavity.count, g.attributes.position.count);
      assert.equal(g.userData.tris, 20 * 4 ** level);
    }
  }
});

test("hall-LOD geometry for the whole register builds quickly", () => {
  const t0 = performance.now();
  for (const s of S) buildStoneGeometry(s.shape, { level: 3 });
  const ms = performance.now() - t0;
  assert.ok(ms < 15000, `${ms.toFixed(0)} ms`);
});

test("material uniforms exist for every look", () => {
  for (const s of S.slice(0, 40)) {
    const u = lookUniforms(s.look);
    for (const k of ["uC0", "uC1", "uC2", "uVein", "uBand", "uCrystal", "uClast", "uWet", "uLens"]) assert.ok(k in u, k);
  }
});

test("every specimen falls in a known colour tone", () => {
  const keys = new Set(TONES.map((t) => t.key));
  for (const s of S) assert.ok(keys.has(toneOf({ ...s })), s.id);
});

test("pattern map projection is finite and 2-D", () => {
  const P = pca2(S.map((s) => s.fv));
  assert.equal(P.length, S.length);
  assert.ok(P.every((p) => p.length === 2 && p.every(Number.isFinite)));
});
