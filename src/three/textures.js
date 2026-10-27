import * as THREE from 'three';
import { mulberry } from '../utils/math.js';

export const mkCanvas = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")];
};
export const toTex = (c, repX = 1, repY = 1) => {
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  if (repX !== 1 || repY !== 1) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repX, repY);
  }
  t.anisotropy = 8;
  return t;
};

/* async texture from an embedded data URI */
export const loadArtTexture = (dataUri) => {
  const tex = new THREE.Texture();
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 8;
  const img = new Image();
  img.onload = () => { tex.image = img; tex.needsUpdate = true; };
  img.src = dataUri;
  return tex;
};

/* herringbone walnut floor */
export function texFloor() {
  const [c, g] = mkCanvas(1024, 1024);
  g.fillStyle = "#3a2a1d"; g.fillRect(0, 0, 1024, 1024);
  const rnd = mulberry(20260610);
  const PW = 256, PH = 64; // plank size
  const plank = (x, y, ang) => {
    g.save();
    g.translate(x, y); g.rotate(ang);
    const base = 30 + rnd() * 26;
    g.fillStyle = `rgb(${base + 38},${base + 16},${base})`;
    g.fillRect(-PW / 2, -PH / 2, PW, PH);
    // grain streaks
    for (let i = 0; i < 9; i++) {
      const yy = -PH / 2 + rnd() * PH;
      g.strokeStyle = `rgba(${base + (rnd() > 0.5 ? 64 : 6)},${base + 28},${base + 6},${0.16 + rnd() * 0.2})`;
      g.lineWidth = 0.8 + rnd() * 1.6;
      g.beginPath();
      g.moveTo(-PW / 2, yy);
      g.bezierCurveTo(-PW / 6, yy + (rnd() - 0.5) * 10, PW / 6, yy + (rnd() - 0.5) * 10, PW / 2, yy + (rnd() - 0.5) * 6);
      g.stroke();
    }
    g.strokeStyle = "rgba(12,8,5,0.85)"; g.lineWidth = 3;
    g.strokeRect(-PW / 2, -PH / 2, PW, PH);
    g.restore();
  };
  const step = PW / Math.SQRT2;
  for (let row = -2; row < 14; row++) {
    for (let col = -2; col < 14; col++) {
      const x = col * step, y = row * step;
      plank(x, y + step / 2, Math.PI / 4);
      plank(x + step / 2, y, -Math.PI / 4);
    }
  }
  // soft sheen vignette
  const v = g.createRadialGradient(512, 512, 120, 512, 512, 760);
  v.addColorStop(0, "rgba(255,236,200,0.07)");
  v.addColorStop(1, "rgba(0,0,0,0.16)");
  g.fillStyle = v; g.fillRect(0, 0, 1024, 1024);
  return toTex(c, 6, 4);
}

/* straight-grain walnut for wainscot / pedestal shafts */
export function texWoodPanel(dark = false) {
  const [c, g] = mkCanvas(512, 512);
  const rnd = mulberry(dark ? 991 : 442);
  const b = dark ? 26 : 40;
  g.fillStyle = `rgb(${b + 34},${b + 14},${b - 2})`; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 64; i++) {
    const x = rnd() * 512;
    g.strokeStyle = `rgba(${b + (rnd() > 0.45 ? 58 : 4)},${b + 24},${b + 4},${0.1 + rnd() * 0.22})`;
    g.lineWidth = 0.7 + rnd() * 2.4;
    g.beginPath();
    g.moveTo(x, -10);
    g.bezierCurveTo(x + (rnd() - 0.5) * 26, 170, x + (rnd() - 0.5) * 26, 340, x + (rnd() - 0.5) * 18, 522);
    g.stroke();
  }
  for (let i = 0; i < 5; i++) { // cathedral arcs
    const cx = rnd() * 512, cy = rnd() * 512;
    g.strokeStyle = `rgba(${b + 50},${b + 26},${b + 8},0.18)`;
    for (let r = 8; r < 90; r += 9) {
      g.lineWidth = 1 + rnd();
      g.beginPath(); g.ellipse(cx, cy, r * 0.6, r * 1.7, 0, -1.2, 1.2); g.stroke();
    }
  }
  return toTex(c, 1, 1);
}

/* nero marquina — near-black marble with pale veins */
export function texMarble() {
  const [c, g] = mkCanvas(512, 512);
  const rnd = mulberry(77);
  g.fillStyle = "#16120f"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${30 + rnd() * 26},${26 + rnd() * 20},${22 + rnd() * 16},0.25)`;
    g.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  const vein = (alpha, w) => {
    let x = rnd() * 512, y = -10;
    g.strokeStyle = `rgba(214,206,190,${alpha})`;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y);
    while (y < 522) {
      x += (rnd() - 0.5) * 56; y += 14 + rnd() * 26;
      g.lineTo(x, y);
    }
    g.stroke();
  };
  vein(0.5, 1.8); vein(0.32, 1.1); vein(0.2, 2.6); vein(0.14, 0.8); vein(0.26, 1.3);
  for (let i = 0; i < 26; i++) { // hairline branches
    const x = rnd() * 512, y = rnd() * 512;
    g.strokeStyle = `rgba(200,192,176,${0.06 + rnd() * 0.12})`;
    g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 90, y + (rnd() - 0.5) * 90);
    g.stroke();
  }
  return toTex(c, 1, 1);
}

/* lacquered ink-green plaster for upper walls */
export function texLacquer() {
  const [c, g] = mkCanvas(512, 512);
  const rnd = mulberry(515);
  g.fillStyle = "#1d2b25"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const v = rnd();
    g.fillStyle = v > 0.5
      ? `rgba(58,82,70,${0.04 + rnd() * 0.07})`
      : `rgba(8,14,12,${0.05 + rnd() * 0.08})`;
    const s = 1 + rnd() * 5;
    g.fillRect(rnd() * 512, rnd() * 512, s, s);
  }
  // faint horizontal brush sheen
  for (let y = 0; y < 512; y += 7) {
    g.fillStyle = `rgba(255,250,230,${0.012 + rnd() * 0.014})`;
    g.fillRect(0, y, 512, 1.5);
  }
  return toTex(c, 4, 2);
}

/* deep madder silk runner — muted ground, antique-gold rosette lattice + key-fret border */
export function texCarpet() {
  const W = 2048, H = 512;
  const [c, g] = mkCanvas(W, H);
  const rnd = mulberry(888);
  // 1) ground: a deep, slightly desaturated madder (not the old garish vermillion)
  g.fillStyle = "#682a21"; g.fillRect(0, 0, W, H);
  // large-scale dye-lot blooms so it reads as a hand-dyed woven field, not flat paint
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W, y = rnd() * H, r = 70 + rnd() * 220;
    const lighter = rnd() > 0.5;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const col = lighter ? "126,58,44" : "70,26,18";
    grd.addColorStop(0, `rgba(${col},0.16)`);
    grd.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // fine silk/wool weave grain (vertical-ish flecks = pile direction)
  for (let i = 0; i < 26000; i++) {
    g.fillStyle = rnd() > 0.5 ? "rgba(134,62,46,0.26)" : "rgba(66,22,15,0.3)";
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd(), 1 + rnd() * 3);
  }
  const gold = (a) => `rgba(186,150,92,${a})`;
  // 2) inner field: a half-drop diagonal lattice of small eight-petal rosettes
  const fTop = 92, fBot = H - 92, step = 168;
  const rosette = (cx, cy, rr) => {
    g.save(); g.translate(cx, cy);
    g.strokeStyle = gold(0.5); g.lineWidth = 1.7;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.beginPath();
      g.ellipse(Math.cos(a) * rr * 0.5, Math.sin(a) * rr * 0.5, rr * 0.4, rr * 0.17, a, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = gold(0.6); g.beginPath(); g.arc(0, 0, rr * 0.15, 0, Math.PI * 2); g.fill();
    g.restore();
  };
  g.strokeStyle = gold(0.16); g.lineWidth = 1;
  let row = 0;
  for (let yy = fTop + 36; yy < fBot; yy += step * 0.5, row++) {
    const off = (row % 2) * (step / 2);
    for (let xx = off - step; xx < W + step; xx += step) {
      rosette(xx, yy, 36);
      g.beginPath();                                   // connecting lattice vines
      g.moveTo(xx, yy); g.lineTo(xx + step / 2, yy + step / 2);
      g.moveTo(xx, yy); g.lineTo(xx - step / 2, yy + step / 2);
      g.stroke();
    }
  }
  // 3) borders along both long edges: guard stripes + key-fret (回纹) band
  const band = (flip) => {
    g.save(); if (flip) { g.translate(0, H); g.scale(1, -1); }
    g.fillStyle = "#4a1b12"; g.fillRect(0, 0, W, 78);          // dark border ground
    g.fillStyle = gold(0.85); g.fillRect(0, 6, W, 3); g.fillRect(0, 71, W, 3);   // guard stripes
    g.fillStyle = "rgba(110,44,30,0.9)"; g.fillRect(0, 12, W, 5);
    g.strokeStyle = "#c6a05e"; g.lineWidth = 3.2; const u = 36;  // key-fret meander
    g.beginPath();
    for (let x = 0; x <= W; x += u * 2) {
      g.moveTo(x, 62); g.lineTo(x, 24); g.lineTo(x + u, 24);
      g.lineTo(x + u, 52); g.lineTo(x + u * 0.42, 52);
    }
    g.stroke();
    g.restore();
  };
  band(false); band(true);
  return toTex(c, 5, 1);
}

/* carved stone title tablet (west wall) */
export function texTitleTablet() {
  const [c, g] = mkCanvas(1024, 640);
  const rnd = mulberry(3001);
  g.fillStyle = "#262220"; g.fillRect(0, 0, 1024, 640);
  for (let i = 0; i < 3200; i++) {
    const v = 30 + rnd() * 26;
    g.fillStyle = `rgba(${v + 8},${v + 4},${v},0.5)`;
    g.fillRect(rnd() * 1024, rnd() * 640, 2, 2);
  }
  // carved double border
  g.strokeStyle = "rgba(8,6,5,0.9)"; g.lineWidth = 12; g.strokeRect(34, 34, 956, 572);
  g.strokeStyle = "rgba(140,128,110,0.5)"; g.lineWidth = 2; g.strokeRect(28, 28, 968, 584);
  g.strokeStyle = "rgba(150,138,118,0.45)"; g.lineWidth = 2; g.strokeRect(56, 56, 912, 528);
  // engraved characters: dark groove + pale top highlight
  g.textAlign = "center"; g.textBaseline = "middle";
  g.font = '195px Georgia, "Songti SC", "Noto Serif SC", serif';
  g.fillStyle = "rgba(0,0,0,0.85)"; g.fillText("拾 石 记", 512, 232);
  g.fillStyle = "rgba(206,192,160,0.32)"; g.fillText("拾 石 记", 512, 226);
  g.font = "44px Georgia, serif";
  g.fillStyle = "rgba(0,0,0,0.8)"; g.fillText("T H E   R I V E R   S T O N E   G A L L E R Y", 512, 420);
  g.fillStyle = "rgba(198,184,152,0.3)"; g.fillText("T H E   R I V E R   S T O N E   G A L L E R Y", 512, 416);
  g.font = "italic 30px Georgia, serif";
  g.fillStyle = "rgba(162,58,37,0.85)";
  g.fillText("every stone remembers its river", 512, 510);
  return toTex(c, 1, 1);
}

/* brass nameplate (engraved, dynamic) */
export function drawPlate(ctx, name) {
  const W = 320, H = 96;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#e2c182"); grad.addColorStop(0.5, "#b88f4e"); grad.addColorStop(1, "#d8b573");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(80,52,18,0.9)"; ctx.lineWidth = 5; ctx.strokeRect(7, 7, W - 14, H - 14);
  ctx.strokeStyle = "rgba(255,240,200,0.55)"; ctx.lineWidth = 1.5; ctx.strokeRect(11, 11, W - 22, H - 22);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  let fs = 34;
  ctx.font = `${fs}px Georgia, "Songti SC", serif`;
  while (ctx.measureText(name).width > W - 46 && fs > 14) {
    fs -= 2; ctx.font = `${fs}px Georgia, "Songti SC", serif`;
  }
  ctx.fillStyle = "rgba(58,36,10,0.95)"; ctx.fillText(name, W / 2, H / 2 + 2);
  ctx.fillStyle = "rgba(255,244,210,0.4)"; ctx.fillText(name, W / 2, H / 2);
}
export function makePlate(name) {
  const [c, g] = mkCanvas(320, 96);
  drawPlate(g, name);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return { canvas: c, ctx: g, tex: t };
}

/* "awaiting a stone" easel card for empty plinths */
export function texEmptyCard() {
  const [c, g] = mkCanvas(256, 160);
  g.fillStyle = "#efe7d2"; g.fillRect(0, 0, 256, 160);
  g.strokeStyle = "#a23a25"; g.lineWidth = 5; g.strokeRect(8, 8, 240, 144);
  g.strokeStyle = "#c9a35c"; g.lineWidth = 1.6; g.strokeRect(16, 16, 224, 128);
  g.fillStyle = "#23201c"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = '38px Georgia, "Songti SC", serif';
  g.fillText("虚位待石", 128, 62);
  g.font = "17px Georgia, serif";
  g.fillText("awaiting a stone — press E", 128, 108);
  return toTex(c, 1, 1);
}

/* vertical light gradient for volumetric cones / shafts */
export function texBeamGradient() {
  const [c, g] = mkCanvas(64, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "rgba(255,238,200,0.85)");
  grad.addColorStop(0.55, "rgba(255,238,200,0.28)");
  grad.addColorStop(1, "rgba(255,238,200,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c);
  return t;
}
