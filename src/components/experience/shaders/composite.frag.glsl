uniform sampler2D tA;
uniform sampler2D tB;
uniform float uMix;
uniform float uDim;
uniform float uTime;
uniform vec2 uResolution;

varying vec2 vUv;

// ACES filmic approximation (Narkowicz)
vec3 aces(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 a = texture2D(tA, vUv).rgb;
  vec3 b = texture2D(tB, vUv).rgb;
  vec3 col = mix(a, b, uMix);

  // Readability dim behind dense text sections
  col *= uDim;

  // Bottom-up ambient glow (cinematic base light)
  float glow = pow(max(0.0, 1.0 - distance(vUv, vec2(0.5, -0.35)) * 0.85), 3.0);
  col += vec3(0.045, 0.02, 0.10) * glow;

  // Vignette
  float d = length((vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * 1.1);
  col *= mix(1.0, 0.62, smoothstep(0.45, 1.25, d));

  // Tone map + gamma
  col = aces(col);
  col = pow(col, vec3(0.4545));

  // Film grain
  float g = hash(vUv * uResolution + fract(uTime) * 173.13) - 0.5;
  col += g * 0.045;

  gl_FragColor = vec4(col, 1.0);
}
