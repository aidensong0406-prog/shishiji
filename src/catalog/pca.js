// 2-D projection of specimen feature vectors (z-scored PCA via power iteration).
export function pca2(vectors) {
  const n = vectors.length, d = vectors[0].length;
  const mean = new Array(d).fill(0), sd = new Array(d).fill(0);
  for (const v of vectors) for (let j = 0; j < d; j++) mean[j] += v[j] / n;
  for (const v of vectors) for (let j = 0; j < d; j++) sd[j] += (v[j] - mean[j]) ** 2 / n;
  for (let j = 0; j < d; j++) sd[j] = Math.sqrt(sd[j]) || 1;
  const Z = vectors.map((v) => v.map((x, j) => (x - mean[j]) / sd[j]));
  const C = Array.from({ length: d }, () => new Array(d).fill(0));
  for (const z of Z) for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) C[i][j] += (z[i] * z[j]) / n;
  const comps = [];
  for (let c = 0; c < 2; c++) {
    let v = Array.from({ length: d }, (_, i) => Math.sin(i * 1.7 + c * 3.1) + 1.1);
    for (let it = 0; it < 200; it++) {
      let w = C.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
      for (const p of comps) { const dot = w.reduce((s, x, j) => s + x * p[j], 0); w = w.map((x, j) => x - dot * p[j]); }
      const len = Math.hypot(...w) || 1; v = w.map((x) => x / len);
    }
    comps.push(v);
  }
  return Z.map((z) => comps.map((p) => z.reduce((s, x, j) => s + x * p[j], 0)));
}
