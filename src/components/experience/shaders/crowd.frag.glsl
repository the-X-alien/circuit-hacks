varying float vY;
varying float vHue;
varying float vDist;

void main() {
  vec3 tint = mix(vec3(0.92, 0.72, 0.30), vec3(0.44, 0.66, 0.84), vHue);
  vec3 col = mix(vec3(0.018, 0.02, 0.04), tint * 0.85, pow(vY, 1.7));
  float fade = exp(-vDist * 0.028);
  col *= 0.2 + 0.8 * fade;
  gl_FragColor = vec4(col, 1.0);
}
