uniform vec3 uCam;
uniform float uTime;

varying float vH;
varying float vY;
varying vec3 vWorld;
varying float vSeed;

void main() {
  vec3 deep = vec3(0.045, 0.055, 0.11);
  vec3 tint = mix(vec3(0.08, 0.34, 0.52), vec3(0.30, 0.16, 0.62), vSeed);
  vec3 col = mix(deep, tint, pow(vY, 1.5) * (0.4 + 0.6 * vH));

  // Window bands — flickering emissive strata
  float band = step(0.86, fract(vWorld.y * 1.9 + vSeed * 43.0));
  float flick = step(0.35, fract(sin(floor(vWorld.y * 1.9) * 91.7 + vSeed * 517.0 + floor(uTime * (0.5 + vSeed))) * 43758.5));
  col += vec3(0.25, 0.85, 1.0) * band * flick * 0.28 * vY;

  // Neon cap
  col += vec3(0.2, 0.9, 1.0) * smoothstep(0.965, 1.0, vY) * (0.35 + 0.5 * vH);

  // Depth fade into atmosphere
  float dist = distance(vWorld.xz, uCam.xz);
  float fade = exp(-dist * 0.016);
  col = mix(vec3(0.035, 0.035, 0.05), col, fade);

  gl_FragColor = vec4(col, 1.0);
}
