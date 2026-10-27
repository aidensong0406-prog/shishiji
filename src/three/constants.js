export const HW = 18;     // hall half-width  (x)
export const HD = 11;     // hall half-depth  (z)
export const HH = 14.7;   // roof-ceiling height: three storeys of 4.9 m

/* ---- second floor / mezzanine ---- */
export const UF_Y = 4.9;  // second-storey walking surface
export const UF2_Y = 9.8; // third-storey walking surface
export const SLAB_T = 0.3;// floor slab thickness
export const FLOOR_Y = [0, UF_Y, UF2_Y];
export const floorOfY = (y) => (y > UF2_Y - 1 ? 2 : y > UF_Y - 1 ? 1 : 0);

// central atrium opening — look down through it from the upper floor
export const ATRIUM = { x0: -7, x1: 7, z0: -4, z1: 4 };

// grand staircase rising INSIDE the atrium void (open above, dramatic), landing
// on the solid slab at the atrium's north edge (z<z0). Runs along -z as it climbs.
const STAIR_STEPS = 18;
export const STAIR = {
  xc: 0, halfW: 1.8,                       // 3.6 m wide, centred — grand and easy to mount
  zTop: ATRIUM.z0,                         // -4  (top landing = atrium north edge)
  zBottom: ATRIUM.z0 + STAIR_STEPS * 0.28, // ≈1.04 (foot of the stairs)
  steps: STAIR_STEPS,
  rise: UF_Y / STAIR_STEPS,                // ≈0.272 per step
  run: 0.28,                               // tread depth
};

/* second flights (storey 2 → 3): a mirrored pair on the west and east bands,
   each climbing away from the atrium toward its end wall (run 0.28, 18 steps) */
const RUN2 = 0.28, STEPS2 = 18, FOOT2 = 8.4, HALF2 = 1.6;
export const STAIR2 = { foot: FOOT2, top: FOOT2 + RUN2 * STEPS2, halfW: HALF2, steps: STEPS2, run: RUN2, rise: (UF2_Y - UF_Y) / STEPS2 };

/* every flight as a walkable ramp: axis = the climb axis, [lo, hi] its extent on
   that axis, [a0, a1] its extent across; footAtHi = the foot is at `hi` */
export const STAIRS = [
  { id: "grand", axis: "z", lo: STAIR.zTop, hi: STAIR.zBottom, a0: STAIR.xc - STAIR.halfW, a1: STAIR.xc + STAIR.halfW, footAtHi: true, from: 0, to: 1 },
  { id: "west", axis: "x", lo: -STAIR2.top, hi: -FOOT2, a0: -HALF2, a1: HALF2, footAtHi: true, from: 1, to: 2 },
  { id: "east", axis: "x", lo: FOOT2, hi: STAIR2.top, a0: -HALF2, a1: HALF2, footAtHi: false, from: 1, to: 2 },
];
// openings in the third-storey slab above the two second flights
export const STAIRWELLS = [
  { x0: -STAIR2.top, x1: -FOOT2 + 0.1, z0: -HALF2 - 0.15, z1: HALF2 + 0.15 },
  { x0: FOOT2 - 0.1, x1: STAIR2.top, z0: -HALF2 - 0.15, z1: HALF2 + 0.15 },
];

/* window openings in the east (courtyard) wall: z centre, sill/head heights, width */
export const EAST_WINDOWS = [
  ...[-8.05, 8.05].map((z) => ({ z, y0: 1.5, y1: 3.2, w: 1.5 })),
  ...[UF_Y, UF2_Y].flatMap((fy) => [-8.05, -3.2, 0, 3.2, 8.05].map((z) => ({ z, y0: fy + 1.5, y1: fy + 3.3, w: 1.6 }))),
];

/* ceiling height above a point on a storey (slab underside, or the roof over voids) */
export function ceilingAt(x, z, floor) {
  if (floor >= 2) return HH;
  const inAtrium = x > ATRIUM.x0 && x < ATRIUM.x1 && z > ATRIUM.z0 && z < ATRIUM.z1;
  if (inAtrium) return HH;
  if (floor === 1 && STAIRWELLS.some((w) => x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1)) return HH;
  return FLOOR_Y[floor + 1] - SLAB_T;
}

export const SLOT_XS = [-12.5, -7.5, -2.5, 2.5, 7.5, 12.5];
const UPPER_XS = [-12.5, -7.5, 7.5, 12.5];     // skip ±2.5 (atrium rail edge)

// walkable courtyard garden east of the moon-gate doorway (floor 0) — a LARGE court
export const COURT = {
  x0: HW + 0.15,     // the gate wall
  x1: HW + 24,       // far garden wall — a deep, large court
  z: 14,             // garden half-depth — a wide court
  gateHalfZ: 1.1,    // doorway opening half-width (matches the circular sill)
};

// outdoor stone-display plinths in the court (floor 0, no ceiling fixture).
// They FLANK the central axis that runs from the moon-gate (west) to the
// pavilion (亭, far east), with two viewing plinths set to the sides.
export const PAVILION = { x: HW + 21, z: 0 };   // 亭 focal point at the far-east
export const COURT_SLOTS = [
  { x: HW + 11, z: -4.5, face: 1, y: 0, court: true },
  { x: HW + 11, z: 4.5,  face: 1, y: 0, court: true },
  { x: HW + 15, z: -4.5, face: 1, y: 0, court: true },
  { x: HW + 15, z: 4.5,  face: 1, y: 0, court: true },
  { x: HW + 9,  z: -10.5, face: 1, y: 0, court: true },
  { x: HW + 9,  z: 10.5,  face: 1, y: 0, court: true },
];

export const SLOT_POS = [
  // lower floor (y:0) — two rows along the side walls
  ...SLOT_XS.map((x) => ({ x, z: -5.5, face: 1, y: 0 })),
  ...SLOT_XS.map((x) => ({ x, z: 5.5, face: -1, y: 0 })),
  // storey 2 — on the gallery between the atrium and the wall cabinets
  // (z = ±6.2 hangs each can light from a coffer beam)
  ...UPPER_XS.map((x) => ({ x, z: -6.2, face: 1, y: UF_Y })),
  ...UPPER_XS.map((x) => ({ x, z: 6.2, face: -1, y: UF_Y })),
  // the courtyard stone court
  ...COURT_SLOTS,
  // third storey — appended last so saved slot indices (incl. the court) stay valid
  ...UPPER_XS.map((x) => ({ x, z: -6.2, face: 1, y: UF2_Y })),
  ...UPPER_XS.map((x) => ({ x, z: 6.2, face: -1, y: UF2_Y })),
];

export const PILASTER_XS = [-15, -10, -5, 0, 5, 10, 15];
