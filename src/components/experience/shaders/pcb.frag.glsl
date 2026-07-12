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
  vec2 uv = vWorld.xz / vec2(900.0, 1000.0) + 0.5;
  vec3 col = texture2D(uPcbTex, uv).rgb;

  // ── Heat shimmer (subtle distortion near hot components) ────
  float heat = gnoise(vWorld.xz * 0.04 + uTime * 0.15);
  float shimmer = heat * 0.03;
  vec2 shUv = uv + vec2(shimmer, shimmer * 0.5);
  col = mix(col, texture2D(uPcbTex, shUv).rgb, 0.15);

  // ── Animated current pulse overlay ──────────────────────────
  vec2 p = vWorld.xz;
  float flow1 = 0.5 + 0.5 * sin((p.x + p.y) * 0.08 - uTime * 2.0);
  float pulse1 = pow(flow1, 8.0);
  vec3 gold = vec3(0.90, 0.71, 0.29);
  vec3 blue = vec3(0.44, 0.66, 0.84);
  col += gold * pulse1 * 0.15;

  float flow2 = 0.5 + 0.5 * sin((p.x * 1.3 - p.y * 0.7) * 0.06 + uTime * 1.5);
  float pulse2 = pow(flow2, 6.0);
  col += blue * pulse2 * 0.10;

  // Third flow — gold/bronze cross-hatch
  float flow3 = 0.5 + 0.5 * sin((p.x * 2.1 + p.y * 1.3) * 0.035 - uTime * 1.2);
  float pulse3 = pow(flow3, 12.0);
  vec3 bronze = vec3(0.74, 0.52, 0.31);
  col += bronze * pulse3 * 0.08;

  // Spark dots at pulse peaks
  float spark = smoothstep(0.92, 0.98, flow1) +
                smoothstep(0.94, 0.99, flow2) +
                smoothstep(0.96, 0.99, flow3);
  col += vec3(0.95, 0.85, 0.60) * spark * 0.12;

  // ── Trace edge glow ─────────────────────────────────────────
  float traceMask = texture2D(uPcbTex, uv + vec2(0.001, 0.0)).r * 0.5 +
                    texture2D(uPcbTex, uv - vec2(0.001, 0.0)).r * 0.5;
  float traceEdge = abs(traceMask - texture2D(uPcbTex, uv).r);
  col += vec3(0.95, 0.75, 0.35) * traceEdge * 0.08;

  // ── Copper trace shimmer along camera direction ─────────────
  vec2 camDir = normalize(uCam.xz - vWorld.xz);
  float traceShift = texture2D(uPcbTex, uv + camDir * 0.002).r;
  col += vec3(0.90, 0.65, 0.25) * abs(traceShift - texture2D(uPcbTex, uv).r) * 0.06;

  // ── Sub-surface scattering approximation ────────────────────
  vec3 subsurface = vec3(0.02, 0.06, 0.01);
  col += subsurface * 0.05;

  // ── Distance fade ───────────────────────────────────────────
  float dist = distance(vWorld.xz, uCam.xz);
  float fade = exp(-dist * 0.012);
  col = mix(vec3(0.02, 0.02, 0.03), col, fade);

  // ── Slight AO at board edges ────────────────────────────────
  float edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)) * 5.0;
  col *= 1.0 - 0.3 * exp(-edgeDist * 3.0);

  gl_FragColor = vec4(col, 1.0);
}
