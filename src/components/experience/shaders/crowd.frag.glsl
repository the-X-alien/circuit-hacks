varying float vY;
varying float vHue;
varying float vDist;

void main() {
  vec3 tint = mix(vec3(0.20, 0.85, 1.0), vec3(0.62, 0.34, 1.0), vHue);
  vec3 col = mix(vec3(0.018, 0.02, 0.04), tint * 0.85, pow(vY, 1.7));
  float fade = exp(-vDist * 0.028);
  col *= 0.2 + 0.8 * fade;
  gl_FragColor = vec4(col, 1.0);
}
