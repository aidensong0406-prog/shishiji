// Colour-tone buckets for filtering, from the specimen's base colour (CIE Lab).
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export function hexLab(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = lin(((n >> 16) & 255) / 255), g = lin(((n >> 8) & 255) / 255), b = lin((n & 255) / 255);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
export const TONES = [
  { key: "black", label: "Black & charcoal", hex: "#232325" },
  { key: "grey", label: "Grey", hex: "#7d7c78" },
  { key: "white", label: "White & cream", hex: "#ebe5d8" },
  { key: "sand", label: "Sand & ochre", hex: "#c8a879" },
  { key: "pink", label: "Pink & rose", hex: "#d6a99c" },
  { key: "red", label: "Red & rust", hex: "#a8442f" },
  { key: "brown", label: "Brown", hex: "#6f5442" },
  { key: "green", label: "Green", hex: "#58705a" },
];
export function toneOf(spec) {
  if (spec._tone) return spec._tone;
  const [L, a, b] = hexLab(spec.colours.base.hex);
  const C = Math.hypot(a, b);
  let t;
  if (L < 28) t = "black";
  else if (a < -4 && C > 6) t = "green";
  else if (C < 8) t = L > 76 ? "white" : "grey";
  else if (a > 22) t = L > 60 ? "pink" : "red";
  else if (L > 78) t = "white";
  else if (a > 12 && L > 62) t = "pink";
  else if (b > 14 && L > 55) t = "sand";
  else t = L < 55 ? "brown" : "sand";
  spec._tone = t;
  return t;
}
export const lightness = (spec) => spec._L ?? (spec._L = hexLab(spec.colours.base.hex)[0]);
