import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { Pass, FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";

/* Final pass: linear → sRGB plus a subtle filmic grade (warm highlights /
   cool shadows split-tone, gentle contrast + saturation). This is the single
   colour conversion of the EffectComposer path, so it MUST stay last with the
   renderer's outputEncoding = LinearEncoding (no double sRGB). The buffers
   before it are half-float, so the dark gradients arrive smooth; a ±1 LSB
   triangular dither then hides the last 8-bit steps of the screen write. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uContrast: { value: 1.11 },
    uSat: { value: 1.13 },
    uWarm: { value: 0.62 },
    uDither: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uContrast, uSat, uWarm, uDither;
    const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
    float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = pow(clamp(c, 0.0, 1.0), vec3(1.0/2.2));   // linear -> sRGB
      // a tiny black lift for filmic shadows (no highlight tonemap — already ACES'd)
      c = max(c - 0.006, vec3(0.0)) * 1.006;
      float l = dot(c, LUM);
      // cinematic split-tone: warm highlights, teal-cool shadows
      vec3 warm = vec3(1.035, 1.004, 0.945);
      vec3 cool = vec3(0.955, 0.998, 1.05);
      c *= mix(cool, warm, smoothstep(0.08, 0.92, l) * uWarm + (1.0 - uWarm) * 0.5);
      c = mix(vec3(0.5), c, uContrast);             // S-contrast about mid-grey
      c = mix(vec3(dot(c, LUM)), c, uSat);          // saturation
      // soft cinematic vignette — darkens the frame edges for depth
      vec2 q = vUv - 0.5;
      float vig = smoothstep(0.92, 0.26, dot(q, q));
      c *= mix(1.0, vig, 0.36);
      // triangular (TPDF) dither of +-1 LSB: no contour lines in the dark gradients
      float n = ign(gl_FragCoord.xy) + ign(gl_FragCoord.xy + vec2(47.0, 17.0)) - 1.0;
      c += n * uDither / 255.0;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

/* ============================================================
   Study depth of field: a cheap far-field lens blur.

   The near field (the hands, the held stone, the sleeves: everything nearer
   than `sharpFar`) is never blurred, so nothing bleeds out of it. The far
   field melts toward a lens-like blur whose radius grows with
   (1 - sharpFar / z), i.e. like a real circle of confusion (in dioptres) and
   saturating at uRadius for the far hall. Work happens at half resolution:
     prep   colour x far-mask (premultiplied), from the frame and the depth
     blurH  13-tap Gaussian, horizontal  ┐ separable, so no noise and no
     blurV  13-tap Gaussian, vertical    ┘ ring patterns
     comp   full-res mix(sharp, blurred / mask, far-weight) where the weight
            uses the NEAREST depth of the 2x2 half-res texels (silhouettes
            of hands and stone stay crisp; no skin-coloured halo).
   Depth comes from the SSAO normal pass (already rendered at half
   resolution), so the DOF costs no extra scene render.
   ============================================================ */
const DOF_COMMON = /* glsl */ `
  #include <packing>
  uniform sampler2D tDepth;
  uniform float uNear, uFar, uSharp;
  float farW(vec2 uv){
    float z = -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar);
    return clamp(1.0 - uSharp / max(z, 1e-4), 0.0, 1.0);
  }`;
const QUAD_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const DOF_PREP = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tColor;
  ${DOF_COMMON}
  void main(){
    float w = farW(vUv);
    float m = smoothstep(0.05, 0.3, w);          // far-field mask (premultiplied: the near field never bleeds)
    gl_FragColor = vec4(texture2D(tColor, vUv).rgb * m, m);
  }`;
const DOF_BLUR = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tSrc;
  uniform vec2 uDir;                              // texel step * sigma / 2.5
  void main(){
    vec4 s = texture2D(tSrc, vUv) * 0.1597;
    // a 13-tap Gaussian (sigma = 2.5 steps), weights normalised
    s += (texture2D(tSrc, vUv + uDir * 1.0) + texture2D(tSrc, vUv - uDir * 1.0)) * 0.1474;
    s += (texture2D(tSrc, vUv + uDir * 2.0) + texture2D(tSrc, vUv - uDir * 2.0)) * 0.1159;
    s += (texture2D(tSrc, vUv + uDir * 3.0) + texture2D(tSrc, vUv - uDir * 3.0)) * 0.0776;
    s += (texture2D(tSrc, vUv + uDir * 4.0) + texture2D(tSrc, vUv - uDir * 4.0)) * 0.0443;
    s += (texture2D(tSrc, vUv + uDir * 5.0) + texture2D(tSrc, vUv - uDir * 5.0)) * 0.0215;
    s += (texture2D(tSrc, vUv + uDir * 6.0) + texture2D(tSrc, vUv - uDir * 6.0)) * 0.0089;
    gl_FragColor = s / 0.9905;
  }`;
const DOF_COMP = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tColor, tBlur;
  uniform vec2 uHalf;                             // half-res texel size
  uniform float uStrength;
  ${DOF_COMMON}
  void main(){
    vec3 sharp = texture2D(tColor, vUv).rgb;
    // conservative far weight: the nearest surface among the 2x2 half-res depth texels around this pixel
    vec2 p = vUv / uHalf - 0.5, i = floor(p);
    vec2 t0 = (i + 0.5) * uHalf, t1 = (i + 1.5) * uHalf;
    float w = min(min(farW(t0), farW(vec2(t1.x, t0.y))), min(farW(vec2(t0.x, t1.y)), farW(t1)));
    vec4 b = texture2D(tBlur, vUv);
    vec3 blur = b.a > 1e-3 ? b.rgb / b.a : sharp;
    float k = uStrength * smoothstep(0.04, 0.55, w) * smoothstep(0.02, 0.25, b.a);
    gl_FragColor = vec4(mix(sharp, blur, k), 1.0);
  }`;

class LensDOFPass extends Pass {
  constructor(type) {
    super();
    this.needsSwap = true;
    const mk = () => new THREE.WebGLRenderTarget(1, 1, {
      type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false,
    });
    this.rtA = mk(); this.rtB = mk();
    const common = () => ({ tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 100 }, uSharp: { value: 0.8 } });
    const sm = (frag, u) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: QUAD_VERT, fragmentShader: frag, depthTest: false, depthWrite: false });
    this.prep = sm(DOF_PREP, { tColor: { value: null }, ...common() });
    this.blur = sm(DOF_BLUR, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.comp = sm(DOF_COMP, { tColor: { value: null }, tBlur: { value: null }, uHalf: { value: new THREE.Vector2() }, uStrength: { value: 0 }, ...common() });
    this.fsQuad = new FullScreenQuad(null);
    this.depthTexture = null;
    this.radius = 0.012;            // blur radius at infinity, as a fraction of the frame height
    this.strength = 0;
    this.camera = null;
    this.h = 1;
  }
  setSize(w, h) {
    const hw = Math.max(1, Math.round(w / 2)), hh = Math.max(1, Math.round(h / 2));
    this.rtA.setSize(hw, hh); this.rtB.setSize(hw, hh);
    this.comp.uniforms.uHalf.value.set(1 / hw, 1 / hh);
    this.h = h; this.hw = hw; this.hh = hh;
  }
  _common(u) {
    u.tDepth.value = this.depthTexture;
    u.uNear.value = this.camera.near; u.uFar.value = this.camera.far; u.uSharp.value = this.sharp || 0.8;
  }
  render(renderer, writeBuffer, readBuffer) {
    if (!this.depthTexture || !this.camera) {            // no depth this frame: pass the frame through
      this.comp.uniforms.uStrength.value = 0;
    }
    this._common(this.prep.uniforms); this._common(this.comp.uniforms);
    this.prep.uniforms.tColor.value = readBuffer.texture;
    this.fsQuad.material = this.prep;
    renderer.setRenderTarget(this.rtA); this.fsQuad.render(renderer);
    // sigma: radius / 2 (in half-res texels); the 13 taps step sigma / 2.5
    const sig = Math.max(0.5, (this.radius * this.h * 0.5) / 2), step = sig / 2.5;
    this.blur.uniforms.tSrc.value = this.rtA.texture;
    this.blur.uniforms.uDir.value.set(step / this.hw, 0);
    this.fsQuad.material = this.blur;
    renderer.setRenderTarget(this.rtB); this.fsQuad.render(renderer);
    this.blur.uniforms.tSrc.value = this.rtB.texture;
    this.blur.uniforms.uDir.value.set(0, step / this.hh);
    renderer.setRenderTarget(this.rtA); this.fsQuad.render(renderer);
    const cu = this.comp.uniforms;
    cu.tColor.value = readBuffer.texture; cu.tBlur.value = this.rtA.texture;
    if (this.depthTexture && this.camera) cu.uStrength.value = this.strength;
    this.fsQuad.material = this.comp;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
  /** compile the three programs now (no first-use hitch); `rt` = a target of the type the pass renders into */
  warm(renderer, rt) {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    for (const m of [this.prep, this.blur, this.comp]) {
      this.fsQuad.material = m;
      try { renderer.compile(this.fsQuad._mesh, FSQ_CAM); } catch (e) { /* an optimisation only */ }
    }
    renderer.setRenderTarget(prev);
  }
  dispose() {
    this.rtA.dispose(); this.rtB.dispose();
    this.prep.dispose(); this.blur.dispose(); this.comp.dispose();
  }
}
const FSQ_CAM = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/** can this renderer render into (and filter) half-float colour targets? (checked once, for real) */
function halfFloatTargets(renderer) {
  try {
    const gl = renderer.getContext(), caps = renderer.capabilities;
    if (!caps.isWebGL2 && !(renderer.extensions.has("OES_texture_half_float") && renderer.extensions.has("EXT_color_buffer_half_float"))) return false;
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false });
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    renderer.setRenderTarget(prev);
    rt.dispose();
    return ok;
  } catch (e) { return false; }
}

const warnMissing = (what) => console.warn("[postEC] shader patch target missing:", what);

/* ============================================================
   PostFX — the high-fidelity EffectComposer chain for r128.
   RenderPass → SSAO → UnrealBloom → lens DOF → [hand lens] → SMAA → Grade

   COLOUR RULE (the make-or-break for r128):
     ACES tone mapping stays on the renderer (applied in RenderPass).
     The composer's intermediate targets are LINEAR and HALF-FLOAT (8-bit
     linear posterised every dark tone); we convert to sRGB exactly once in
     the GradeShader as the final renderToScreen pass. The caller MUST set
     renderer.outputEncoding = LinearEncoding while this path is active (so
     the screen write isn't sRGB-encoded twice), and restore sRGBEncoding
     for the hand-rolled fallback. See setPostPath() in RiverStoneGallery.jsx.

   HAND LENS: setLoupe(loupe) inserts an overlay pass that draws the loupe
   after SSAO / bloom / DOF and before SMAA and the grade, so the AO and the
   blur never paint over the magnified image, and SMAA smooths its rim. The
   loupe is switched to overlay compositing only for the duration of
   PostFX.render(); on the direct (Low) path it keeps drawing itself in the
   main pass.
   ============================================================ */

export class PostFX {
  constructor(renderer, scene, camera, width, height) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    // half-float buffers wherever the GPU can render to them (8-bit only as a fallback)
    this.halfFloat = halfFloatTargets(renderer);
    const TYPE = this.halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.bufferType = TYPE;
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(Math.max(1, width * pr), Math.max(1, height * pr), {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: TYPE,
    });
    rt.texture.name = "PostFX.rt1";
    const composer = new EffectComposer(renderer, rt);   // renderTarget2 = rt.clone(): same type
    composer.setPixelRatio(pr);
    composer.setSize(width, height);
    this.composer = composer;

    this.renderPass = new RenderPass(scene, camera);
    composer.addPass(this.renderPass);

    // ambient occlusion — contact shading the shadow map misses.
    // r128's SSAOPass renders its own beauty pass, so the RenderPass in front of it
    // is switched off while SSAO runs (configure). Its normal / AO / blur buffers run
    // at half resolution with a 16-sample kernel: the AO is blurred anyway, and
    // at full size this pass alone halved the frame rate.
    const sp = (this.ssaoPass = new SSAOPass(scene, camera, width, height));
    sp.kernelSize = 16;
    sp.kernel.length = 0;          // generateSampleKernel appends; start fresh
    sp.generateSampleKernel();
    sp.ssaoMaterial.defines.KERNEL_SIZE = 16;
    {
      // AO strength (the stock shader multiplies the full occlusion in)
      const fs = sp.ssaoMaterial.fragmentShader;
      // and a minimum depth gap that grows with distance: the half-res depth is point-sampled,
      // so on far or grazing surfaces a sample's own surface reads up to half a texel's depth
      // gradient nearer than it is (the regular stipple of false self-occlusion)
      const A = "uniform float maxDistance;", B = "gl_FragColor = vec4( vec3( 1.0 - occlusion ), 1.0 );",
        C = "if ( delta > minDistance && delta < maxDistance ) {";
      for (const s of [A, B, C]) if (!fs.includes(s)) warnMissing(s);
      sp.ssaoMaterial.fragmentShader = fs.replace(A, A + "\nuniform float aoStrength, minDistanceSlope;")
        .replace(B, "gl_FragColor = vec4( vec3( 1.0 - occlusion * aoStrength ), 1.0 );")
        .replace(C, "if ( delta > minDistance - minDistanceSlope * viewPosition.z && delta < maxDistance ) {");
      sp.ssaoMaterial.uniforms.aoStrength = { value: 0.8 };
      sp.ssaoMaterial.uniforms.minDistanceSlope = { value: 0 };
    }
    sp.ssaoMaterial.needsUpdate = true;
    // before first use: half-float beauty, 24-bit depth (a 1 cm threshold must sit above the depth steps)
    sp.beautyRenderTarget.texture.type = TYPE;
    sp.normalRenderTarget.depthTexture.type = THREE.UnsignedIntType;
    {
      const full = sp.setSize.bind(sp);
      sp.setSize = (w, h) => {
        full(w, h);
        const hw = Math.max(1, Math.round(w / 2)), hh = Math.max(1, Math.round(h / 2));
        sp.normalRenderTarget.setSize(hw, hh); sp.ssaoRenderTarget.setSize(hw, hh); sp.blurRenderTarget.setSize(hw, hh);
        sp.ssaoMaterial.uniforms.resolution.value.set(hw, hh);
        sp.blurMaterial.uniforms.resolution.value.set(hw, hh);
      };
      sp.setSize(width * pr, height * pr);
    }
    // the normal/depth override pass: skinned hands in their live pose, no flame / halo / glass / veil
    sp.overrideVisibility = () => this._guardOn(sp.normalMaterial);
    sp.restoreVisibility = () => this._guardOff();
    this._applySSAO(0);
    sp.output = SSAOPass.OUTPUT.Default;
    composer.addPass(sp);

    // physically-flavoured bloom (replaces the hand-rolled one on this path)
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.62, 0.8, 0.82);
    [this.bloomPass.renderTargetBright, ...this.bloomPass.renderTargetsHorizontal, ...this.bloomPass.renderTargetsVertical]
      .forEach((t) => { t.texture.type = TYPE; });   // the faint tail of the flame glow must not band
    composer.addPass(this.bloomPass);

    // depth of field — study only, eased in with the study (updateDOF), depth from the SSAO pass
    this.dofPass = new LensDOFPass(TYPE);
    this.dofPass.camera = camera;
    this.dofPass.enabled = false;
    this.bokehPass = this.dofPass;          // old name (perf harnesses)
    composer.addPass(this.dofPass);

    // edge AA (renderer MSAA does nothing for offscreen composer targets).
    // r128's SMAAPass writes to writeBuffer but leaves needsSwap false, so its
    // output used to be thrown away: swap.
    this.smaaPass = new SMAAPass(width * pr, height * pr);
    this.smaaPass.needsSwap = true;
    composer.addPass(this.smaaPass);

    // linear → sRGB + subtle filmic grade, the single colour conversion
    this.gammaPass = new ShaderPass(GradeShader);
    this.gammaPass.renderToScreen = true;
    composer.addPass(this.gammaPass);
    composer.setSize(width, height);

    // state
    this._loupe = null; this.loupePass = null; this._loupeSearch = 0; this._loupeSet = false;
    this._dofAllowed = false; this._want = 0; this._k = 0; this._focus = 0.45;
    this._hideList = []; this._skinned = []; this._listAge = 0; this._saved = []; this._skinWarm = false;
    this.dofPass.warm(renderer, this.dofPass.rtA);
  }

  // turn passes on/off per quality tier (membership stays fixed; we just
  // flip .enabled so EffectComposer skips disabled passes for free).
  configure(preset) {
    this.ssaoPass.enabled = !!preset.ssao;
    this.renderPass.enabled = !preset.ssao;   // SSAOPass already renders the beauty
    this.bloomPass.enabled = preset.bloom !== false;
    this.smaaPass.enabled = !!preset.smaa;
    this._dofAllowed = !!preset.dof;
    this.dofPass.enabled = false;             // eased in by updateDOF() / render()
    this._listAge = 0;
  }

  /**
   * Study depth of field and hand-scale AO. `active`: true/false, or the study blend 0..1
   * (e.g. study.roomDim()); `focusDist`: eye → held stone (m). Eased internally, so a hard
   * on/off from the caller still fades.
   */
  updateDOF(active, focusDist) {
    this._want = typeof active === "number" ? THREE.MathUtils.clamp(active, 0, 1) : (active ? 1 : 0);
    if (isFinite(focusDist) && focusDist > 0.05) this._focus = focusDist;
  }

  /** the hand lens: drawn after SSAO / bloom / DOF, before SMAA and the grade (idempotent) */
  setLoupe(loupe) {
    this._loupeSet = true;
    if (this._loupe === (loupe || null) && (this.loupePass || !loupe)) return;
    if (this.loupePass) { this.composer.removePass(this.loupePass); this.loupePass = null; }
    if (this._loupe && this._loupe.setComposite) this._loupe.setComposite("scene");
    this._loupe = loupe || null;
    if (!loupe || !loupe.renderOverlay || !loupe.setComposite) return;
    const pass = new Pass();
    pass.needsSwap = false;
    pass.render = (renderer, writeBuffer, readBuffer) => loupe.renderOverlay(pass.renderToScreen ? null : readBuffer);
    this.composer.insertPass(pass, this.composer.passes.indexOf(this.smaaPass));
    this.loupePass = pass;
  }

  setSize(width, height) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height); // propagates setSize to every pass (device pixels)
  }

  render(dt) {
    dt = Math.min(Math.max(dt || 0.016, 0), 0.1);
    // ease the study blend (DOF strength, AO kernel scale)
    const want = this._want;
    this._k += (want - this._k) * (1 - Math.exp(-dt * 5));
    if (Math.abs(this._k - want) < 0.002) this._k = want;
    const k = this._k;
    if (this.ssaoPass.enabled) this._applySSAO(k);
    const dof = this.dofPass;
    dof.enabled = this._dofAllowed && this.ssaoPass.enabled && k > 0.002;
    if (dof.enabled) {
      dof.depthTexture = this.ssaoPass.normalRenderTarget.depthTexture;
      dof.sharp = this._focus + 0.32;            // the stone and both hands stay inside the sharp zone
      dof.strength = k;
    }
    // the hand lens: find it if the host never handed it over
    if (!this._loupeSet && !this._loupe && --this._loupeSearch <= 0) {
      this._loupeSearch = 60;
      const o = this.scene.getObjectByName("loupe");
      if (o && o.loupe) { this.setLoupe(o.loupe); this._loupeSet = false; }
    }
    const lp = this.loupePass ? this._loupe : null;
    if (lp) lp.setComposite("overlay");
    try { this.composer.render(dt); } finally { if (lp) lp.setComposite("scene"); }
  }

  /* SSAOShader compares orthographic depth normalised over near..far, not metres: convert.
     Hall scale (k = 0): 22 cm kernel, occluders within 25 cm count (no halos around anything
     standing in front of a far wall). Study scale (k = 1): a 3 cm kernel for the contact
     shading between the stone, the palm and the fingers. */
  _applySSAO(k) {
    const sp = this.ssaoPass, span = Math.max(1e-3, this.camera.far - this.camera.near);
    const lerpG = (a, b) => a * Math.pow(b / a, k);
    sp.kernelRadius = lerpG(0.22, 0.03);
    sp.minDistance = lerpG(0.008, 0.0006) / span;
    sp.maxDistance = lerpG(0.25, 0.04) / span;
    sp.ssaoMaterial.uniforms.aoStrength.value = 0.8 + 0.1 * k;
    sp.ssaoMaterial.uniforms.minDistanceSlope.value = 0.004 / span;   // +4 mm per metre of distance
  }

  /* --- the SSAO normal/depth override pass ---
     scene.overrideMaterial (a MeshNormalMaterial, skinning off) replaces every material, so
     (1) skinned hands would be drawn in their bind pose: switch the override to its skinned
         variant just for their draw (r128 caches both programs on the material);
     (2) additive / transparent things (flame, halo sprite, glass, veil, drops) would write
         depth and normals: give them an empty draw range for this pass (not visible=false,
         which would also hide their children).
     Replaces SSAOPass.overrideVisibility, which traversed the whole hall twice a frame. */
  _scan() {
    const hide = [], skinned = [];
    this.scene.traverse((o) => {
      if (o.userData && o.userData.loupePart) return;
      if (o.isSkinnedMesh) { skinned.push(o); return; }
      if (!(o.isMesh || o.isSprite || o.isPoints || o.isLine)) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (o.isSprite || o.isPoints || o.isLine || (m && (m.transparent || m.blending === THREE.AdditiveBlending || m.depthWrite === false))) hide.push(o);
    });
    this._hideList = hide; this._skinned = skinned; this._listAge = 45;
  }
  _guardOn(nm) {
    if (--this._listAge <= 0) this._scan();
    const S = this._saved; S.length = 0;
    const hook = (o, before, after) => {
      const ob = o.onBeforeRender, oa = o.onAfterRender;
      S.push(o, ob, oa);
      o.onBeforeRender = function (r, s, c, g, m, grp) { if (m === nm) before(g, m); else ob.call(this, r, s, c, g, m, grp); };
      o.onAfterRender = function (r, s, c, g, m, grp) { if (m === nm) after(g, m); else oa.call(this, r, s, c, g, m, grp); };
    };
    const empty = (g) => { g.userData.__pfxDr = g.drawRange.count; g.drawRange.count = 0; };
    const restore = (g) => { if (g.userData.__pfxDr !== undefined) { g.drawRange.count = g.userData.__pfxDr; delete g.userData.__pfxDr; } };
    for (const o of this._hideList) hook(o, empty, restore);
    const skinOn = (g, m) => { m.skinning = true; m.needsUpdate = true; };
    const skinOff = (g, m) => { m.skinning = false; m.needsUpdate = true; };
    for (const o of this._skinned) {
      const ob = o.onBeforeRender, oa = o.onAfterRender;
      S.push(o, ob, oa);
      o.onBeforeRender = function (r, s, c, g, m, grp) { if (m === nm) skinOn(g, m); ob.call(this, r, s, c, g, m, grp); };
      o.onAfterRender = function (r, s, c, g, m, grp) { oa.call(this, r, s, c, g, m, grp); if (m === nm) skinOff(g, m); };
    }
    // compile the skinned normal-pass variant once, with the hall's real light set, before any
    // hand is ever drawn: an empty-draw skinned dummy (setProgram runs, nothing is drawn)
    if (!this._skinWarm) {
      this._skinWarm = true;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
      g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
      g.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
      g.setDrawRange(0, 0);
      const d = new THREE.SkinnedMesh(g, new THREE.MeshBasicMaterial({ skinning: true }));
      const bone = new THREE.Bone(); d.add(bone); d.bind(new THREE.Skeleton([bone]));
      d.frustumCulled = false;
      d.onBeforeRender = (r, s, c, gg, m) => { if (m === nm) skinOn(gg, m); };
      d.onAfterRender = (r, s, c, gg, m) => { if (m === nm) skinOff(gg, m); };
      this.scene.add(d);
      this._warmDummy = d;
    }
  }
  _guardOff() {
    const S = this._saved;
    for (let i = 0; i < S.length; i += 3) { S[i].onBeforeRender = S[i + 1]; S[i].onAfterRender = S[i + 2]; }
    S.length = 0;
    const nm = this.ssaoPass.normalMaterial;
    if (nm.skinning) { nm.skinning = false; nm.needsUpdate = true; }
    if (this._warmDummy) {                       // only ever drawn (empty) in this one normal pass
      const d = this._warmDummy; this._warmDummy = null;
      this.scene.remove(d);
      d.skeleton.dispose(); d.geometry.dispose(); d.material.dispose();
    }
  }

  dispose() {
    if (this.loupePass && this._loupe && this._loupe.setComposite) this._loupe.setComposite("scene");
    this.composer.renderTarget1?.dispose();
    this.composer.renderTarget2?.dispose();
    this.ssaoPass.dispose?.();
    this.bloomPass.dispose?.();
    this.dofPass.dispose?.();
    this.smaaPass.dispose?.();
    this.gammaPass.material?.dispose?.();
  }
}
