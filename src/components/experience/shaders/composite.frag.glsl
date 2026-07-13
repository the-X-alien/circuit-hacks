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

  // ── Always-on organic distortion + cursor spike ────────────
  vec2 md = (uv - uMouse) * aspect;
  float mr = length(md);

  // Base displacement: always-active noise field across entire screen
  float baseDisp = 0.025 + 0.018 * sin(uTime * 0.3 + uv.x * 7.0 + uv.y * 5.0) + 0.012 * snoise(uv * 3.0 + uTime * 0.2);
  float baseRipple = snoise(uv * 6.0 + uTime * 0.5) * 0.015 + snoise(uv * 10.0 + uTime * 0.7) * 0.008;

  // Cursor-driven spike on top
  float cursorInfl = smoothstep(0.10, 0.0, mr) * uMouseA;
  float infl = 0.08 + cursorInfl; // base 0.08 always active

  vec2 dir = mr > 1e-4 ? md / mr : vec2(0.0);

  float push = cursorInfl * 0.045;
  float ripple = sin(mr * 42.0 - uTime * 4.5) * 0.015 * cursorInfl;
  float swirl = (sin(mr * 8.0 - uTime * 1.2 + atan(md.y, md.x)) * 0.010 + baseRipple * 2.0) * cursorInfl;
  float heatWarp = snoise(uv * 12.0 + uTime * 0.8) * 0.006 * cursorInfl;
  vec2 cursorDisp = dir * (push + ripple + heatWarp) + vec2(-dir.y, dir.x) * swirl;

  // Always-on weak noise field across whole screen
  vec2 baseNoise = vec2(
    snoise(uv * 5.0 + vec2(uTime * 0.15, 0.0)),
    snoise(uv * 5.0 + vec2(0.0, uTime * 0.15))
  ) * baseDisp;

  vec2 disp = cursorDisp + baseNoise;

  // Chromatic separation: always-on base + cursor spike + edge weighting
  float caDist = length(uv - 0.5);
  float caBase = 0.008 + 0.015 * caDist * caDist + 0.006 * sin(uTime * 0.5 + uv.y * 4.0) + 0.005 * snoise(uv * 4.0 + uTime * 0.3);
  float caCursor = 0.025 * cursorInfl + 0.003 * sin(uTime * 1.5 + mr * 10.0) * cursorInfl;
  float caAmount = caBase + caCursor;

  vec2 suvR = uv + disp + vec2(caAmount, 0.0);
  vec2 suvG = uv + disp;
  vec2 suvB = uv + disp - vec2(caAmount, 0.0);

  vec3 a, b, col;
  a.r = texture2D(tA, suvR).r;
  a.g = texture2D(tA, suvG).g;
  a.b = texture2D(tA, suvB).b;
  b.r = texture2D(tB, suvR).r;
  b.g = texture2D(tB, suvG).g;
  b.b = texture2D(tB, suvB).b;
  // ── Authored scene handoff: a diagonal wipe with a glowing seam ──
  // Steady states are untouched (uMix 0 -> all A, uMix 1 -> all B); only the
  // brief transition reads as a designed sweep rather than a flat crossfade.
  float diag = uv.x * 0.62 + (1.0 - uv.y) * 0.38;      // sweep direction
  float front = mix(-0.18, 1.18, uMix);                 // wipe front position
  float m = smoothstep(front - 0.18, front + 0.18, diag);
  m = uMix < 0.001 ? 0.0 : (uMix > 0.999 ? 1.0 : 1.0 - m); // B enters from the sweep
  col = mix(a, b, m);

  // Bright seam riding the wipe front, brightest mid-transition.
  float seam = smoothstep(0.16, 0.0, abs(diag - front));
  float seamPulse = uMix * (1.0 - uMix) * 4.0;
  col += vec3(0.95, 0.76, 0.4) * seam * seamPulse * 0.9;

  // ── Bloom ──────────────────────────────────────────────────
  vec3 bloomA = sampleBloom(tA, suvG, uResolution);
  vec3 bloomB = sampleBloom(tB, suvG, uResolution);
  col += mix(bloomA, bloomB, m) * 0.45;

  // ── Metallic sheen (always-on base + cursor boost) ─────────
  vec3 sheenGold = vec3(0.96, 0.77, 0.38);
  vec3 sheenBlue = vec3(0.44, 0.66, 0.84);
  vec3 sheenBronze = vec3(0.74, 0.52, 0.31);
  float sheenMix = 0.5 + 0.5 * sin(uTime * 0.3 + uv.x * 3.0 + cursorInfl * 6.0);
  float bronzeMix = 0.2 + 0.3 * cursorInfl;
  vec3 sheen = mix(mix(sheenGold, sheenBlue, sheenMix), sheenBronze, bronzeMix);
  col += sheen * (0.03 + cursorInfl * 0.10);
  col += vec3(0.12, 0.08, 0.04) * (0.03 + cursorInfl * 0.20);

  // ── Cursor-edge glow ring ──────────────────────────────────
  float ringGlow = exp(-abs(mr - 0.05) * 150.0) * cursorInfl * 0.08;
  col += sheenGold * ringGlow;

  // ── Scanline glow (subtle) ─────────────────────────────────
  float line = smoothstep(0.0, 0.04, abs(fract(uv.y * uResolution.y * 0.001 - uTime * 0.05) - 0.5) - 0.46);
  col += vec3(0.02, 0.01, 0.005) * (1.0 - line);

  col *= uDim;

  // ── Bottom vignette glow ───────────────────────────────────
  float glow = pow(max(0.0, 1.0 - distance(uv, vec2(0.5, -0.35)) * 0.85), 3.0);
  float glowPulse = 0.5 + 0.5 * sin(uTime * 0.1);
  vec3 glowCol = mix(vec3(0.10, 0.055, 0.015), vec3(0.03, 0.08, 0.12), glowPulse);
  col += glowCol * glow * (1.0 + cursorInfl * 0.5);

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
