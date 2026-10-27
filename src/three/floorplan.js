import { HW, HD, ATRIUM, COURT, STAIRS, STAIRWELLS, FLOOR_Y } from "./constants.js";

/* walkable-region test (replaces the hard rectangular clamp). The hall on
   every storey, plus — on the ground floor only — the moon-gate doorway and the
   courtyard garden beyond it. */
export function isWalkable(x, z, floor) {
  if (x >= -HW + 0.6 && x <= HW - 0.6 && z >= -HD + 0.6 && z <= HD - 0.6) return true;
  if (floor === 0) {
    if (x >= HW - 0.7 && x <= COURT.x0 + 0.5 && z >= -COURT.gateHalfZ && z <= COURT.gateHalfZ) return true;
    if (x >= COURT.x0 + 0.3 && x <= COURT.x1 - 0.6 && z >= -COURT.z + 0.6 && z <= COURT.z - 0.6) return true;
  }
  return false;
}

/* ============================================================
   floorplan — vertical traversal for the three-storey hall.
   The walkable surface is a function of (x,z) plus the storey the
   visitor is on (hysteresis), so the same XZ can be any floor; only
   a flight of stairs interpolates between two storeys.
   ============================================================ */

const inStairRect = (s, x, z) => {
  const u = s.axis === "z" ? z : x, v = s.axis === "z" ? x : z;
  return u >= s.lo && u <= s.hi && v >= s.a0 && v <= s.a1;
};
// 0 at the foot → 1 at the top
const stairT = (s, x, z) => {
  const u = s.axis === "z" ? z : x;
  const t = (u - s.lo) / (s.hi - s.lo);
  return Math.min(1, Math.max(0, s.footAtHi ? 1 - t : t));
};

/** the flight under (x,z) that connects to `floor`, if any */
export function stairAt(x, z, floor) {
  for (const s of STAIRS) if ((floor === s.from || floor === s.to) && inStairRect(s, x, z)) return s;
  return null;
}
export const onStair = (x, z, floor) => !!stairAt(x, z, floor);

// rect test for the atrium void; margin lets you stop a bit short of the rail
export function insideAtrium(x, z, margin = 0) {
  return x > ATRIUM.x0 - margin && x < ATRIUM.x1 + margin && z > ATRIUM.z0 - margin && z < ATRIUM.z1 + margin;
}
export const insideStairwell = (x, z) => STAIRWELLS.some((w) => x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1);

const EPS = 0.07; // commit the floor flip only near the ends of a flight

// returns { y, floor } — feed it the visitor's current floor for hysteresis
export function sampleGround(x, z, floor) {
  const s = stairAt(x, z, floor);
  if (s) {
    const t = stairT(s, x, z);
    const y = FLOOR_Y[s.from] + (FLOOR_Y[s.to] - FLOOR_Y[s.from]) * t;
    let f = floor;
    if (t >= 1 - EPS) f = s.to;
    if (t <= EPS) f = s.from;
    return { y, floor: f };
  }
  return { y: FLOOR_Y[floor] || 0, floor };
}

/** May the visitor move from (px,pz) to (x,z) on `floor`? A flight can only be
    entered or left at the end that belongs to the current storey (never over
    its sides or its spandrels), and upper storeys stop at the atrium and
    stairwell voids. */
export function canStep(px, pz, x, z, floor) {
  const sOld = stairAt(px, pz, floor), sNew = stairAt(x, z, floor);
  if (sOld !== sNew) {
    const s = sNew || sOld;
    const t = sNew ? stairT(s, x, z) : stairT(s, px, pz);
    if (floor === s.from ? t > 0.12 : t < 0.88) return false;
  }
  if (!sNew) {
    if (floor >= 1 && insideAtrium(x, z, 0)) return false;
    if (floor === 2 && insideStairwell(x, z)) return false;
  }
  return true;
}
