// Persistence: some hosts inject window.storage; elsewhere we
// fall back to localStorage behind the same async get/set/delete interface.
function localAdapter() {
  try {
    const k = "__shishiji_probe";
    window.localStorage.setItem(k, "1"); window.localStorage.removeItem(k);
  } catch { return null; }
  const P = "shishiji:";
  return {
    get: (key) => {
      const v = window.localStorage.getItem(P + key);
      return v == null ? Promise.reject(new Error("missing")) : Promise.resolve({ value: v });
    },
    set: (key, value) => {
      try { window.localStorage.setItem(P + key, value); return Promise.resolve(); }
      catch (e) { return Promise.reject(e); }   // quota exceeded: caller keeps it in-session
    },
    delete: (key) => { window.localStorage.removeItem(P + key); return Promise.resolve(); },
  };
}

export const storage =
  typeof window === "undefined" ? null : window.storage ? window.storage : localAdapter();
