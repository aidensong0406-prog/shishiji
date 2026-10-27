// Feature-space distance shared by the catalog sampler, tests and the UI.
export const featureDistance = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); };
