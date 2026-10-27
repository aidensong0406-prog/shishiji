import * as THREE from "three";

/* Diffuse-only wrap lighting for skin (light scattered under the skin reddens
   and softens the terminator). It replaces the Lambert line of three r128's
   RE_Direct_Physical, so specular is left alone and can't leak past the
   terminator. Shared by the study hands and the hand lens's hand. */
export const DIFFUSE_LINE = "reflectedLight.directDiffuse += ( 1.0 - clearcoatDHR ) * irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );";
export const SKIN_WRAP = /* glsl */ `
  float sNL = dot( geometry.normal, directLight.direction );
  vec3 sIrr = directLight.color * ( saturate( sNL ) + vec3( 0.5, 0.2, 0.11 ) * ( saturate( ( sNL + 0.55 ) / 1.55 ) - saturate( sNL ) ) );
  #ifndef PHYSICALLY_CORRECT_LIGHTS
    sIrr *= PI;
  #endif
  reflectedLight.directDiffuse += ( 1.0 - clearcoatDHR ) * sIrr * BRDF_Diffuse_Lambert( material.diffuseColor );`;

/** String.replace that refuses to fail silently: a missing target is a warning, not a no-op. */
export function inject(src, from, to, tag) {
  if (!src.includes(from)) { console.warn(`[${tag}] shader injection target not found:`, from.slice(0, 80)); return src; }
  return src.replace(from, to);
}

/** lights_physical_pars_fragment with the skin wrap in place of Lambert. */
export function skinLightsChunk(tag) {
  return inject(THREE.ShaderChunk.lights_physical_pars_fragment, DIFFUSE_LINE, SKIN_WRAP, tag);
}
