# 拾石记 · Shishiji Stone Museum

A museum of **320 stone specimens**. You can:

- walk a three-storey lamplit hall around a central atrium, and its courtyard;
- hold a stone in your own hands (R at a vitrine): turn it, carry an oil lamp, candle or window light around it, wet it, tap it to hear it, and study it through a hand lens;
- take any stone to a lighting bench and move the light around it;
- search a public register in which every specimen has a permanent ID (`SSJ-0001` to `SSJ-0320`).

Built with React, three.js (r128), Vite and Tone.js. It deploys as a static site.

## Run it

There is no system Node on this machine. An isolated Node 20 toolchain lives in `.condaenv`, so prefix commands with it:

```bash
export PATH="$PWD/.condaenv/bin:$PATH"
npm install
npm run dev          # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm run preview` | Production build into `dist/`, then serve it |
| `npm test` | Unit tests (`node --test`): catalog invariants, reproducibility, notes, geometry, material, PCA |
| `npm run e2e` | End-to-end suite in headless Chrome. Needs a running server; set `BASE_URL=http://localhost:4173/` to test `preview` |
| `npm run catalog` | Re-mint `src/data/catalog.json` from the generator (changes specimens — see below) |
| `npm run thumbs` | Render `public/thumbs/SSJ-xxxx.webp` through the real shader. Needs the dev server |
| `node tests/e2e/hall-tour.mjs out medium` | Walk the hall headlessly and take screenshots plus fps readings |

**Deploy:** after `npm run build`, upload `dist/` to any static host. Routing is hash-based (`#/specimen/SSJ-0042`), so deep links work without server configuration.

## What's inside

| Route | |
|---|---|
| `#/` | Home: a live "stone of the day", featured collections, how to read a label |
| `#/hall` | Walkable three-storey hall. Ground floor: paintings and showpiece vitrines. Storey 2 (grand stair): 石谱 plates drawn from the specimens' own models, vitrines, and cabinets with the first 160 specimens. Storey 3 (paired stairs): rock-class panels, plates, vitrines, and cabinets with the other 160. 34 vitrines (hall and courtyard) hold showpieces; E browses a cabinet, a click identifies a stone |
| `#/archive` | Search plus filters (class, rock type, colour tone, pattern, features, form, size) and 9 sort orders. All state lives in the URL |
| `#/specimen/SSJ-xxxx` | 3D viewer and **lighting lab**: light direction, height, distance, beam angle, softness, intensity, aim, colour temperature or a custom colour, plus room light and 6 presets. Discovery tools: light sweep, wet surface, pattern lens, turntable. Labelled knowledge notes and similar specimens |
| `#/patterns` | Pattern map (PCA of 24 measurements, or any two chosen axes) and find-by-traits |

## How the stones are made

- **`src/stones/geometry.js`**: deterministic sculpting of an indexed icosphere:
  - superellipsoid silhouette with taper, bend and twist;
  - lumps, ridges and wrinkles;
  - fracture facets with conchoidal ripples;
  - bedding terraces and water-wear (Taubin smoothing);
  - pits and holes;
  - a cavity attribute for crevice grime.

  Detail levels run from 3 (hall cabinets) to 6 (close-up viewer).
- **`src/stones/material.js`**: a `MeshPhysicalMaterial` with injected GLSL that evaluates every pattern in object space, so there are no UV seams:
  - veins (networks or single quartz veins);
  - planar or concentric bands;
  - Voronoi crystal grain;
  - speckle, clasts and mica sparkle;
  - bump.

  All stones share one shader program.
- **`src/catalog/`**: 25 rock-type analogs (`knowledge.js`) and a sampler (`generate.js`). The sampler rejects any candidate too close to an existing specimen in feature space.

The output is committed. `npm test` fails if `catalog.json` no longer matches the generator, so IDs stay attached to fixed recipes. Re-minting changes specimens; do it only on purpose.

## How the notes are labelled

Every sentence is labelled as one of four kinds:

- **Observation**: measured from the stone.
- **Fact**: general knowledge about the rock *type*, never about the specimen.
- **Hypothesis**: what the pattern suggests about how the stone may have formed.
- **Interpretation**: scholar's-rock readings.

No note invents a find-site, collector or age; a unit test enforces this.

## The building (src/three/interior.js)

- Three 4.9 m storeys around a three-storey atrium, carried by eight lacquered columns on stone bases, with painted edge beams, carved brackets and a coffer-beam grid that lands on the wall pilasters.
- Every storey has the same finish: moulded skirting, raised-panel dado, chair rail, silk damask in each bay (celadon, madder, indigo), picture rail, cornice, fluted pilasters with capitals, and a painted 天花 coffer ceiling.
- Stairs: an open grand flight to storey 2 (marble treads with bullnose nosings, carpet runner and rods, turned balusters, panelled newels, plaster soffit) and a mirrored pair of closed flights to storey 3. Walking rules (`src/three/floorplan.js`) only let visitors mount a flight at its ends and stop them at the atrium and stairwell voids; unit tests walk every flight both ways.
- The courtyard wall has real window openings on all three storeys; palace lanterns hang through the atrium from the skylight lantern.

## The hand study (src/three/study.js, hands.js, loupe.js)

- **R** at a vitrine (or "Hold it" on a phone) raises both hands: the left cradles a hand-sized piece of the stone, the right carries the lamp. Drag turns the stone like a trackball: the point you grab goes where the pointer goes, and circling the rim twists it about your line of sight. Two-finger rotate (touch) or Q/E also twist it, arrows nudge it, and Home sets it back down. A flick keeps spinning about the same axis until the fingers catch it. Right- or Shift-drag (two fingers on touch) moves the lamp, and the shadows move with it. Wheel or pinch brings it nearer. Double-click or F turns it over, T wets it, X taps it, Z raises the hand lens, and 1/2/3 switch between oil lamp, candle and window daylight. R or Esc puts it back.
- The fingers are solved against the stone's actual surface every frame, joint by joint. The skin uses wrap lighting with a warm terminator, and the arms are two-bone chains.
- For daylight or the lens, the right hand lowers the lamp out of view and the light crosses over to the window.

## Performance notes (hall)

- A spotlight pool replaces one light per plinth (34 vitrines, 5 shared spots), and decorative glows are emissive rather than real lights; the scene has no point lights.
- Static batching cut meshes from 1,624 to 159.
- The shadow map updates a few times a second instead of every frame.
- Dense props are culled by distance, and cabinets render only from the mezzanine.
- Adaptive quality steps the tier down until the hall holds about 30 fps, unless the visitor chose a tier in ⚙.

## Known limitations

- Facts describe rock types; hypotheses are teaching aids, not analyses.
- Touch controls (joystick, look-drag, tap to identify) are verified with emulated touch events at phone size in the e2e suite, not yet on a physical device.
