uniform float uTime;
uniform vec3 uCam;

varying vec3 vWorld;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 p = vWorld.xz;

  // ── Substrate: deep blue FR4 with a faint speckle ───────────
  float speck = hash21(floor(p * 1.3));
  vec3 base = mix(vec3(0.025, 0.06, 0.10), vec3(0.04, 0.10, 0.15), speck);
  // gentle large-scale tone variation so the board isn't flat
  base *= 0.85 + 0.3 * hash21(floor(p * 0.18));

  // ── Traces, routed per cell ─────────────────────────────────
  float C = 2.4;
  vec2 cell = floor(p / C);
  vec2 pf = p - (cell + 0.5) * C; // centered local coords, ~[-C/2, C/2]

  float h1 = hash21(cell + 11.1);
  float h2 = hash21(cell + 27.3);
  float h3 = hash21(cell + 53.7);
  float w = 0.07 * C; // trace half-width

  float d = 1e9;
  // primary axis line through the cell
  d = min(d, (h1 < 0.5 ? abs(pf.y) : abs(pf.x)) - w);
  // an L-bend reaching a different edge
  if (h2 < 0.5) {
    d = min(d, sdSeg(pf, vec2(0.0), vec2(0.0, C * 0.5)) - w);
    d = min(d, sdSeg(pf, vec2(0.0, C * 0.5), vec2(h3 < 0.5 ? C * 0.5 : -C * 0.5, C * 0.5)) - w);
  } else {
    d = min(d, sdSeg(pf, vec2(0.0), vec2(C * 0.5, 0.0)) - w);
    d = min(d, sdSeg(pf, vec2(C * 0.5, 0.0), vec2(C * 0.5, h3 < 0.5 ? C * 0.5 : -C * 0.5)) - w);
  }

  float trace = smoothstep(w * 1.9, 0.0, d);

  // ── Current pulse travelling along the copper ───────────────
  float flow = 0.5 + 0.5 * sin((p.x + p.y) * 0.5 - uTime * 2.6);
  float pulse = pow(flow, 3.0);

  vec3 gold = vec3(0.92, 0.72, 0.30);
  vec3 col = base;
  col += gold * trace * (0.35 + 0.85 * pulse);

  // ── Pads + vias at cell nodes ───────────────────────────────
  float padH = hash21(cell + 91.2);
  if (padH < 0.55) {
    float r = length(pf);
    float ring = smoothstep(0.20 * C, 0.18 * C, abs(r - 0.17 * C));
    float dot = smoothstep(0.075 * C, 0.05 * C, r);
    col += gold * (ring * 0.7 + dot * 0.9);
  }

  // ── Soft silk-screen grid for scale ─────────────────────────
  vec2 g = abs(fract(p / (C * 5.0)) - 0.5) / fwidth(p / (C * 5.0));
  float gl = 1.0 - min(min(g.x, g.y), 1.0);
  col += vec3(0.10, 0.16, 0.22) * gl * 0.25;

  // ── Distance fade into atmosphere ───────────────────────────
  float dist = distance(vWorld.xz, uCam.xz);
  float fade = exp(-dist * 0.016);
  col = mix(vec3(0.018, 0.022, 0.032), col, fade);

  gl_FragColor = vec4(col, 1.0);
}
