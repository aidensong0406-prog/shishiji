import * as THREE from "three";

/* ============================================================
   Bloom composer — hand-rolled for Three.js r128 (no jsm/EffectComposer).
   Pipeline: scene → RT, bright-pass threshold, separable gaussian blur
   across 3 downsampled mip levels, additive composite + soft vignette.
   Tone mapping stays on the renderer, so this is a post-tonemap bloom:
   non-physical but robust and good-looking for a stylized hall.
   ============================================================ */

const QUAD = new THREE.PlaneGeometry(2, 2);

const VERT = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const THRESHOLD_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  uniform float uKnee;
  void main(){
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // soft-knee curve so highlights bloom smoothly, not as a hard cutoff
    float k = uKnee;
    float soft = clamp(l - uThreshold + k, 0.0, 2.0 * k);
    soft = soft * soft / (4.0 * k + 0.0001);
    float contrib = max(soft, l - uThreshold) / max(l, 0.0001);
    gl_FragColor = vec4(c * contrib, 1.0);
  }
`;

const BLUR_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform vec2 uDir;          // texel-sized step in x or y
  void main(){
    // 9-tap gaussian
    vec4 sum = texture2D(tDiffuse, vUv) * 0.227027;
    vec2 o1 = uDir * 1.3846153846;
    vec2 o2 = uDir * 3.2307692308;
    sum += texture2D(tDiffuse, vUv + o1) * 0.3162162162;
    sum += texture2D(tDiffuse, vUv - o1) * 0.3162162162;
    sum += texture2D(tDiffuse, vUv + o2) * 0.0702702703;
    sum += texture2D(tDiffuse, vUv - o2) * 0.0702702703;
    gl_FragColor = sum;
  }
`;

const COMPOSITE_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform sampler2D tBloom0;
  uniform sampler2D tBloom1;
  uniform sampler2D tBloom2;
  uniform float uIntensity;
  uniform float uVignette;
  void main(){
    vec3 scene = texture2D(tScene, vUv).rgb;
    vec3 bloom = texture2D(tBloom0, vUv).rgb * 0.55
               + texture2D(tBloom1, vUv).rgb * 0.32
               + texture2D(tBloom2, vUv).rgb * 0.20;
    vec3 col = scene + bloom * uIntensity;
    // gentle radial vignette
    vec2 d = vUv - 0.5;
    float v = smoothstep(0.85, 0.35, dot(d, d) * uVignette);
    col *= mix(1.0, v, 0.5);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeRT(w, h) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
  });
}

export class BloomComposer {
  constructor(renderer, scene, camera, width, height, opts = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.intensity = opts.intensity ?? 0.9;
    this.threshold = opts.threshold ?? 0.62;
    this.knee = opts.knee ?? 0.22;
    this.enabled = opts.enabled ?? true;

    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsScene = new THREE.Scene();
    this.quad = new THREE.Mesh(QUAD, null);
    this.quad.frustumCulled = false;
    this.fsScene.add(this.quad);

    this.matThreshold = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: THRESHOLD_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: this.threshold },
        uKnee: { value: this.knee },
      },
      depthTest: false, depthWrite: false,
    });
    this.matBlur = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: BLUR_FRAG,
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
      depthTest: false, depthWrite: false,
    });
    this.matComposite = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tScene: { value: null },
        tBloom0: { value: null },
        tBloom1: { value: null },
        tBloom2: { value: null },
        uIntensity: { value: this.intensity },
        uVignette: { value: 1.0 },
      },
      depthTest: false, depthWrite: false,
    });

    this._build(width, height);
  }

  _build(width, height) {
    this.width = width; this.height = height;
    this.sceneRT = makeRT(width, height);
    this.brightRT = makeRT(width, height);
    // three downsample levels for a wide, soft bloom
    this.mips = [];
    let w = width, h = height;
    for (let i = 0; i < 3; i++) {
      w = Math.max(1, Math.floor(w / 2));
      h = Math.max(1, Math.floor(h / 2));
      this.mips.push({ w, h, a: makeRT(w, h), b: makeRT(w, h) });
    }
  }

  setSize(width, height) {
    this.sceneRT.setSize(width, height);
    this.brightRT.setSize(width, height);
    let w = width, h = height;
    for (const m of this.mips) {
      w = Math.max(1, Math.floor(w / 2));
      h = Math.max(1, Math.floor(h / 2));
      m.w = w; m.h = h;
      m.a.setSize(w, h); m.b.setSize(w, h);
    }
    this.width = width; this.height = height;
  }

  _pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.fsScene, this.cam);
  }

  render() {
    const r = this.renderer;
    if (!this.enabled) {
      r.setRenderTarget(null);
      r.render(this.scene, this.camera);
      return;
    }
    // 1) scene → sceneRT (tone mapping applied by renderer)
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(this.scene, this.camera);

    // 2) bright pass
    this.matThreshold.uniforms.tDiffuse.value = this.sceneRT.texture;
    this.matThreshold.uniforms.uThreshold.value = this.threshold;
    this.matThreshold.uniforms.uKnee.value = this.knee;
    this._pass(this.matThreshold, this.brightRT);

    // 3) downsample + separable blur per mip
    let src = this.brightRT;
    for (const m of this.mips) {
      // horizontal (also downsamples by rendering into smaller target)
      this.matBlur.uniforms.tDiffuse.value = src.texture;
      this.matBlur.uniforms.uDir.value.set(1 / m.w, 0);
      this._pass(this.matBlur, m.a);
      // vertical
      this.matBlur.uniforms.tDiffuse.value = m.a.texture;
      this.matBlur.uniforms.uDir.value.set(0, 1 / m.h);
      this._pass(this.matBlur, m.b);
      src = m.b;
    }

    // 4) composite to screen
    this.matComposite.uniforms.tScene.value = this.sceneRT.texture;
    this.matComposite.uniforms.tBloom0.value = this.mips[0].b.texture;
    this.matComposite.uniforms.tBloom1.value = this.mips[1].b.texture;
    this.matComposite.uniforms.tBloom2.value = this.mips[2].b.texture;
    this.matComposite.uniforms.uIntensity.value = this.intensity;
    this.quad.material = this.matComposite;
    r.setRenderTarget(null);
    r.render(this.fsScene, this.cam);
  }

  dispose() {
    this.sceneRT.dispose();
    this.brightRT.dispose();
    for (const m of this.mips) { m.a.dispose(); m.b.dispose(); }
    this.matThreshold.dispose();
    this.matBlur.dispose();
    this.matComposite.dispose();
    QUAD.dispose();
  }
}
