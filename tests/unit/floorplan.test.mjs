import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleGround, canStep, stairAt } from "../../src/three/floorplan.js";
import { STAIRS, FLOOR_Y, ceilingAt, SLOT_POS, floorOfY } from "../../src/three/constants.js";

// walk a straight line in small steps, applying canStep + sampleGround like the game loop
function walk(from, to, floor, n = 400) {
  let [x, z] = from, f = floor, y = FLOOR_Y[floor];
  for (let i = 1; i <= n; i++) {
    const nx = from[0] + ((to[0] - from[0]) * i) / n, nz = from[1] + ((to[1] - from[1]) * i) / n;
    if (!canStep(x, z, nx, nz, f)) return { x, z, y, floor: f, blocked: true };
    x = nx; z = nz;
    const g = sampleGround(x, z, f); f = g.floor; y = g.y;
  }
  return { x, z, y, floor: f, blocked: false };
}

test("grand stair: ground → storey 2 and back", () => {
  const up = walk([0, 2.5], [0, -5], 0);
  assert.equal(up.blocked, false); assert.equal(up.floor, 1); assert.ok(Math.abs(up.y - FLOOR_Y[1]) < 1e-6);
  const down = walk([0, -5], [0, 2.5], 1);
  assert.equal(down.floor, 0); assert.equal(down.y, 0);
});

test("west + east flights: storey 2 → 3 and back", () => {
  for (const sgn of [-1, 1]) {
    const up = walk([sgn * 7.6, 0], [sgn * 15.5, 0], 1);
    assert.equal(up.blocked, false, `side ${sgn}`); assert.equal(up.floor, 2); assert.ok(Math.abs(up.y - FLOOR_Y[2]) < 1e-6);
    const down = walk([sgn * 15.5, 0], [sgn * 7.6, 0], 2);
    assert.equal(down.floor, 1); assert.ok(Math.abs(down.y - FLOOR_Y[1]) < 1e-6);
  }
});

test("flights cannot be mounted over their sides", () => {
  const side = walk([-11, -4], [-11, 0], 1);       // storey 2, walking into the west flight's side
  assert.equal(side.blocked, true); assert.equal(side.floor, 1);
  const g = walk([1, 3], [3.5, -2], 0);            // ground, diagonally into the grand stair's side
  assert.equal(g.floor, 0);
});

test("upper storeys stop at the atrium and stairwell voids", () => {
  assert.equal(walk([0, -8], [0, 0], 2).blocked, true);
  assert.equal(walk([-11, -4], [-11, 0], 2).blocked, true);
  assert.equal(walk([6, -8], [6, 0], 1).blocked, true);
});

test("ceilings: slab underside on lower storeys, roof over voids and on top", () => {
  assert.ok(Math.abs(ceilingAt(10, 8, 0) - 4.6) < 1e-6);
  assert.ok(ceilingAt(0, 0, 0) > 14);
  assert.ok(ceilingAt(-11, 0, 1) > 14);
  assert.ok(Math.abs(ceilingAt(10, 8, 1) - 9.5) < 1e-6);
});

test("every exhibit slot is on a real storey and stairs are well formed", () => {
  for (const s of SLOT_POS) assert.ok([0, 1, 2].includes(floorOfY(s.y || 0)));
  assert.equal(SLOT_POS.filter((s) => floorOfY(s.y || 0) === 2).length, 8);
  for (const s of STAIRS) { assert.ok(s.hi > s.lo); assert.ok(s.a1 > s.a0); assert.ok(stairAt(s.axis === "z" ? (s.a0 + s.a1) / 2 : (s.lo + s.hi) / 2, s.axis === "z" ? (s.lo + s.hi) / 2 : (s.a0 + s.a1) / 2, s.from)); }
});
