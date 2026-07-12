uniform float uTime;
uniform vec3 uCam;
uniform sampler2D uPcbTex;

varying vec3 vWorld;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Simplex-like noise for heat shimmer
float gnoise(vec2 p) {
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
  // Board is ~48 wide × ~600 deep — map world XZ into UV
  vec2 uv = vec2(vWorld.x / 48.0 + 0.5, -vWorld.z / 600.0);
  uv = clamp(uv, 0.0, 1.0);
  vec3 col = texture2D(uPcbTex, uv).rgb;

  // ── Heat shimmer ────────────────────────────────────────────
  float heat = gnoise(vWorld.xz * 0.08 + uTime * 0.15);
  float shimmer = heat * 0.012;
  vec2 shUv = uv + vec2(shimmer, shimmer * 0.5);
  col = mix(col, texture2D(uPcbTex, shUv).rgb, 0.2);

  // ── Animated current pulse overlay ──────────────────────────
  vec2 p = vWorld.xz;
  float flow1 = 0.5 + 0.5 * sin((p.x + p.y) * 0.25 - uTime * 2.2);
  float pulse1 = pow(flow1, 8.0);
  vec3 gold = vec3(0.90, 0.71, 0.29);
  vec3 blue = vec3(0.44, 0.66, 0.84);
  col += gold * pulse1 * 0.22;

  float flow2 = 0.5 + 0.5 * sin((p.x * 1.3 - p.y * 0.7) * 0.18 + uTime * 1.6);
  float pulse2 = pow(flow2, 6.0);
  col += blue * pulse2 * 0.16;

  float flow3 = 0.5 + 0.5 * sin((p.x * 2.1 + p.y * 1.3) * 0.1 - uTime * 1.3);
  float pulse3 = pow(flow3, 12.0);
  vec3 bronze = vec3(0.74, 0.52, 0.31);
  col += bronze * pulse3 * 0.12;

  float spark = smoothstep(0.92, 0.98, flow1) +
                smoothstep(0.94, 0.99, flow2) +
                smoothstep(0.96, 0.99, flow3);
  col += vec3(0.95, 0.85, 0.60) * spark * 0.18;

  // ── Trace edge glow ─────────────────────────────────────────
  float sampleR = texture2D(uPcbTex, uv + vec2(0.002, 0.0)).r;
  float sampleL = texture2D(uPcbTex, uv - vec2(0.002, 0.0)).r;
  float traceEdge = abs(sampleR - sampleL);
  col += vec3(0.95, 0.75, 0.35) * traceEdge * 0.35;

  // ── Copper shimmer toward camera ────────────────────────────
  vec2 camDir = normalize(uCam.xz - vWorld.xz);
  float traceShift = texture2D(uPcbTex, uv + camDir * 0.004).r;
  col += vec3(0.90, 0.65, 0.25) * abs(traceShift - texture2D(uPcbTex, uv).r) * 0.25;

  // ── FR4 subsurface ──────────────────────────────────────────
  col += vec3(0.02, 0.07, 0.02) * 0.08;

  // ── Distance fog ────────────────────────────────────────────
  float dist = distance(vWorld.xz, uCam.xz);
  float fade = exp(-dist * 0.018);
  col = mix(vec3(0.025, 0.03, 0.035), col, fade);

  // ── Board edge AO ───────────────────────────────────────────
  float edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)) * 8.0;
  col *= 1.0 - 0.35 * exp(-edgeDist * 2.5);

  gl_FragColor = vec4(col, 1.0);
}
