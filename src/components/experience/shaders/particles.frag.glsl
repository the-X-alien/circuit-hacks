uniform vec3 uColorA;
uniform vec3 uColorB;

varying float vMix;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.04, d);
  vec3 col = mix(uColorA, uColorB, vMix);
  col += vec3(1.0) * smoothstep(0.12, 0.0, d) * 0.35; // hot core
  gl_FragColor = vec4(col, a * (0.25 + 0.75 * vAlpha));
}
