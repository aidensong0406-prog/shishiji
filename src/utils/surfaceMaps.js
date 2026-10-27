import * as THREE from "three";

/* ============================================================
   surfaceMaps — derive tangent-space NORMAL + ROUGHNESS maps
   from a plain colour image (a stone photo, or a procedural
   canvas texture). No external assets: a Sobel filter turns the
   image's luminance into surface relief so flat photos read as
   real, wet, pitted stone under PBR lighting.
   ============================================================ */

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// draw any drawable (HTMLImageElement / canvas / ImageBitmap) into a
// working canvas at a bounded size and hand back its ImageData.
function rasterize(source, size) {
  const sw = source.width || source.videoWidth || size;
  const sh = source.height || source.videoHeight || size;
  const s = Math.min(1, size / Math.max(sw, sh));
  const w = Math.max(2, Math.round(sw * s));
  const h = Math.max(2, Math.round(sh * s));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(source, 0, 0, w, h);
  return { data: g.getImageData(0, 0, w, h), w, h };
}

// luminance height field with a light 3x3 box blur to tame JPEG noise
function heightField(img, blur) {
  const { data, w, h } = img;
  const px = data.data;
  const raw = new Float32Array(w * h);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    raw[j] = lum(px[i], px[i + 1], px[i + 2]) / 255;
  }
  if (!blur) return { hgt: raw, w, h };
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          sum += raw[yy * w + xx]; n++;
        }
      }
      out[y * w + x] = sum / n;
    }
  }
  return { hgt: out, w, h };
}

function makeTex(canvas, { repeat, srgb }) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  // normal / roughness are DATA maps → must stay linear; only colour is sRGB
  t.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
  t.needsUpdate = true;
  return t;
}

/**
 * deriveSurfaceMaps(source, opts) -> { normalMap, roughnessMap }
 *   source        : HTMLImageElement | HTMLCanvasElement | ImageBitmap
 *   size          : working resolution cap (px)            default 512
 *   normalStrength: relief amount (1 subtle … 4 strong)    default 2.2
 *   baseRoughness : mid roughness                          default 0.55
 *   roughVariation: how much detail modulates roughness    default 0.35
 *   wetInLows     : darker (recessed/wet) areas glossier   default true
 *   blur          : pre-blur the height field              default true
 *   repeat        : [u,v] RepeatWrapping for tiling maps   default null
 */
export function deriveSurfaceMaps(source, opts = {}) {
  const {
    size = 512,
    normalStrength = 2.2,
    baseRoughness = 0.55,
    roughVariation = 0.35,
    wetInLows = true,
    blur = true,
    repeat = null,
  } = opts;

  const img = rasterize(source, size);
  const { hgt, w, h } = heightField(img, blur);
  const at = (x, y) =>
    hgt[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];

  const nCanvas = document.createElement("canvas");
  nCanvas.width = w; nCanvas.height = h;
  const nImg = nCanvas.getContext("2d").createImageData(w, h);
  const nd = nImg.data;

  const rCanvas = document.createElement("canvas");
  rCanvas.width = w; rCanvas.height = h;
  const rImg = rCanvas.getContext("2d").createImageData(w, h);
  const rd = rImg.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sobel gradient of the height field
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const gx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const gy = (bl + 2 * b + br) - (tl + 2 * t + tr);

      // tangent-space normal = normalize(-gx*s, -gy*s, 1)
      let nx = -gx * normalStrength;
      let ny = -gy * normalStrength;
      let nz = 1.0;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv; ny *= inv; nz *= inv;

      const j = (y * w + x) * 4;
      nd[j] = (nx * 0.5 + 0.5) * 255;
      nd[j + 1] = (ny * 0.5 + 0.5) * 255;
      nd[j + 2] = (nz * 0.5 + 0.5) * 255;
      nd[j + 3] = 255;

      // roughness: busy/high-relief areas read matte; flat areas stay glossy
      // (wet sheen). Optionally make darker pits glossier still.
      const grad = Math.min(1, Math.hypot(gx, gy) * 3.0);
      const height = at(x, y);
      let rough = baseRoughness + (grad - 0.5) * 2 * roughVariation;
      if (wetInLows) rough += (height - 0.5) * 0.25; // bright crests slightly drier
      rough = Math.min(1, Math.max(0.04, rough));
      const rv = rough * 255;
      rd[j] = rv; rd[j + 1] = rv; rd[j + 2] = rv; rd[j + 3] = 255;
    }
  }

  nCanvas.getContext("2d").putImageData(nImg, 0, 0);
  rCanvas.getContext("2d").putImageData(rImg, 0, 0);

  return {
    normalMap: makeTex(nCanvas, { repeat, srgb: false }),
    roughnessMap: makeTex(rCanvas, { repeat, srgb: false }),
  };
}

/**
 * normalFromCanvas(srcCanvas, opts) -> THREE.CanvasTexture (normal only)
 * Lightweight helper for procedural room textures (Phase 2) that already
 * have a colour canvas and just need matching relief.
 */
export function normalFromCanvas(srcCanvas, opts = {}) {
  return deriveSurfaceMaps(srcCanvas, opts).normalMap;
}
