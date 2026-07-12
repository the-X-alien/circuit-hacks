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

// Simplex-like 2D noise for organic displacement
float snoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);

  // ── Full-screen cursor distortion (vividmotion.co level) ──
  vec2 md = (uv - uMouse) * aspect;
  float mr = length(md);
  float infl = smoothstep(0.45, 0.0, mr) * uMouseA;

  // Radial displacement field
  vec2 dir = mr > 1e-4 ? md / mr : vec2(0.0);

  // Multi-band displacement: strong push + ripple + swirl + heat warp
  float push = infl * 0.045;
  float ripple = sin(mr * 42.0 - uTime * 4.5) * 0.015 * infl;
  float swirl = sin(mr * 8.0 - uTime * 1.2 + atan(md.y, md.x)) * 0.010 * infl;
  float heatWarp = snoise(uv * 12.0 + uTime * 0.8) * 0.006 * infl;
  vec2 disp = dir * (push + ripple + heatWarp) + vec2(-dir.y, dir.x) * swirl;

  // Chromatic separation scales with distance from cursor + time oscillation
  float caAmount = 0.008 + 0.025 * infl + 0.003 * sin(uTime * 1.5 + mr * 10.0) * infl;

  vec2 suvR = uv + disp + vec2(caAmount, 0.0);
  vec2 suvG = uv + disp;
  vec2 suvB = uv + disp - vec2(caAmount, 0.0);

  // ── Edge-weighted chromatic aberration (always on) ─────────
  float caDist = length(uv - 0.5);
  float caEdge = 0.004 + 0.012 * caDist * caDist;
  suvR += vec2(caEdge, 0.0);
  suvB -= vec2(caEdge, 0.0);

  vec3 a, b, col;
  a.r = texture2D(tA, suvR).r;
  a.g = texture2D(tA, suvG).g;
  a.b = texture2D(tA, suvB).b;
  b.r = texture2D(tB, suvR).r;
  b.g = texture2D(tB, suvG).g;
  b.b = texture2D(tB, suvB).b;
  col = mix(a, b, uMix);

  // ── Bloom ──────────────────────────────────────────────────
  vec3 bloomA = sampleBloom(tA, suvG, uResolution);
  vec3 bloomB = sampleBloom(tB, suvG, uResolution);
  col += mix(bloomA, bloomB, uMix) * 0.45;

  // ── Metallic sheen that follows cursor ─────────────────────
  vec3 sheenGold = vec3(0.96, 0.77, 0.38);
  vec3 sheenBlue = vec3(0.44, 0.66, 0.84);
  vec3 sheenBronze = vec3(0.74, 0.52, 0.31);
  // Dynamic sheen mix that shifts with cursor proximity
  float sheenMix = 0.5 + 0.5 * sin(uTime * 0.3 + uv.x * 3.0 + infl * 6.0);
  float bronzeMix = 0.2 + 0.3 * infl;
  vec3 sheen = mix(mix(sheenGold, sheenBlue, sheenMix), sheenBronze, bronzeMix);
  col += sheen * infl * 0.30;
  col += vec3(0.12, 0.08, 0.04) * infl * 0.6;

  // ── Cursor-edge glow ring ──────────────────────────────────
  float ringGlow = exp(-abs(mr - 0.15) * 80.0) * infl * 0.12;
  col += sheenGold * ringGlow;

  // ── Scanline glow (subtle) ─────────────────────────────────
  float line = smoothstep(0.0, 0.04, abs(fract(uv.y * uResolution.y * 0.001 - uTime * 0.05) - 0.5) - 0.46);
  col += vec3(0.02, 0.01, 0.005) * (1.0 - line);

  col *= uDim;

  // ── Bottom vignette glow ───────────────────────────────────
  float glow = pow(max(0.0, 1.0 - distance(uv, vec2(0.5, -0.35)) * 0.85), 3.0);
  float glowPulse = 0.5 + 0.5 * sin(uTime * 0.1);
  vec3 glowCol = mix(vec3(0.10, 0.055, 0.015), vec3(0.03, 0.08, 0.12), glowPulse);
  col += glowCol * glow * (1.0 + infl * 0.5);

  // ── Vignette ───────────────────────────────────────────────
  float d = length((uv - 0.5) * aspect * 1.1);
  col *= mix(1.0, 0.55, smoothstep(0.35, 1.2, d));

  col = aces(col);
  col = pow(col, vec3(0.4545));

  // ── Film grain ─────────────────────────────────────────────
  float g = hash(uv * uResolution + fract(uTime) * 173.13) - 0.5;
  col += g * 0.035;

  gl_FragColor = vec4(col, 1.0);
}
