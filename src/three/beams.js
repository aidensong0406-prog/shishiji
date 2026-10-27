import * as THREE from "three";

/* Soft volumetric beam: additive, fades where the surface turns edge-on to the
   viewer (no hard silhouette lines) and towards both ends of the beam.
   axis: "y" fades along local y (cones), "uv" fades along uv.y and uv.x (planes). */
export function softBeamMaterial(color, opacity, { height = 2.3, axis = "y", power = 2.0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: `
      varying float vF; varying vec2 vUv; varying float vY;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vF = abs(dot(n, normalize(-mv.xyz)));
        vUv = uv; vY = position.y / ${height.toFixed(3)} + 0.5;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity;
      varying float vF; varying vec2 vUv; varying float vY;
      void main() {
        float t = ${axis === "uv" ? "vUv.y" : "vY"};
        float ends = smoothstep(0.0, 0.4, t) * (1.0 - smoothstep(0.8, 1.0, t));
        ${axis === "uv" ? "ends *= smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x));" : ""}
        float a = uOpacity * pow(vF, ${power.toFixed(2)}) * ends;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
}
