// Offscreen thumbnail renderer: one hidden StoneScene reused for every specimen.
import { StoneScene } from "./StoneScene.js";

export function createThumbRenderer(size = 320, opt = {}) {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-${size * 2}px;top:0;width:${size}px;height:${size}px;pointer-events:none;`;
  document.body.appendChild(host);
  const sc = new StoneScene(host, { interactive: false, preserve: true, maxDpr: 1, shadowSize: 1024, level: opt.level ?? 5, plinth: false });
  return {
    ready: sc.envReady,
    render(spec, type = "image/webp", q = 0.86) {
      sc.setSpecimen(spec, { rotation: 0.6 });
      sc.frameNow("three-quarter", 1.0);
      return sc.capture(type, q);
    },
    scene: sc,
    dispose() { sc.dispose(); host.remove(); },
  };
}
