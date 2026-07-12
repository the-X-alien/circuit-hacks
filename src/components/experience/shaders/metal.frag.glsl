uniform sampler2D uMatcap;

varying vec3 vNormalV;
varying vec3 vViewDir;
varying float vDisp;

void main() {
  vec3 n = normalize(vNormalV);
  vec2 muv = clamp(n.xy * 0.485 + 0.5, 0.0, 1.0);
  vec3 col = texture2D(uMatcap, muv).rgb;

  float fres = pow(1.0 - max(dot(n, normalize(vViewDir)), 0.0), 3.0);
  col += vec3(0.95, 0.75, 0.35) * fres * 0.65;

  // Ridges catch violet light
  col += vec3(0.74, 0.52, 0.30) * smoothstep(0.04, 0.28, vDisp) * 0.30;

  gl_FragColor = vec4(col, 1.0);
}
