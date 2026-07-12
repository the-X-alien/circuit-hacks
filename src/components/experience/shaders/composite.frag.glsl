uniform sampler2D tA;
uniform sampler2D tB;
uniform float uMix;
uniform float uDim;
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uMouseA;

varying vec2 vUv;

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

float gauss(float x, float s) {
  return exp(-(x * x) / (2.0 * s * s));
}

vec3 sampleBloom(sampler2D tex, vec2 uv, vec2 res) {
  vec3 acc = vec3(0.0);
  float w = 0.0;
  const int K = 5;
  float spread = 3.0;
  for (int i = -K; i <= K; i++) {
    for (int j = -K; j <= K; j++) {
      vec2 off = vec2(float(i), float(j)) * spread / res;
      float gw = gauss(float(i), 4.0) * gauss(float(j), 4.0);
      acc += max(texture2D(tex, uv + off).rgb - 0.7, 0.0) * gw;
      w += gw;
    }
  }
  return acc / max(w, 1e-6);
}

void main() {
  vec2 md = vUv - uMouse;
  md.x *= uResolution.x / uResolution.y;
  float mr = length(md);
  float infl = smoothstep(0.22, 0.0, mr) * uMouseA;
  vec2 dir = mr > 1e-4 ? md / mr : vec2(0.0);
  float ripple = sin(mr * 42.0 - uTime * 5.0) * 0.006 * infl;
  vec2 suv = vUv + dir * (ripple + infl * 0.012);

  // Chromatic aberration — edge-weighted
  float caDist = length(vUv - 0.5);
  float caStrength = 0.002 + 0.006 * caDist * caDist;
  vec2 caOff = vec2(caStrength, 0.0);

  vec3 a, b, col;
  a.r = texture2D(tA, suv + caOff).r;
  a.g = texture2D(tA, suv).g;
  a.b = texture2D(tA, suv - caOff).b;
  b.r = texture2D(tB, suv + caOff).r;
  b.g = texture2D(tB, suv).g;
  b.b = texture2D(tB, suv - caOff).b;
  col = mix(a, b, uMix);

  // Bloom
  vec3 bloomA = sampleBloom(tA, suv, uResolution);
  vec3 bloomB = sampleBloom(tB, suv, uResolution);
  col += mix(bloomA, bloomB, uMix) * 0.45;

  vec3 sheen = mix(vec3(0.96, 0.77, 0.38), vec3(0.74, 0.52, 0.30), infl);
  col += sheen * infl * 0.20;
  col += vec3(0.10, 0.07, 0.03) * infl;

  col *= uDim;

  float glow = pow(max(0.0, 1.0 - distance(vUv, vec2(0.5, -0.35)) * 0.85), 3.0);
  col += vec3(0.10, 0.055, 0.015) * glow;

  float d = length((vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * 1.1);
  col *= mix(1.0, 0.62, smoothstep(0.45, 1.25, d));

  col = aces(col);
  col = pow(col, vec3(0.4545));

  float g = hash(vUv * uResolution + fract(uTime) * 173.13) - 0.5;
  col += g * 0.045;

  gl_FragColor = vec4(col, 1.0);
}
